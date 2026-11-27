import {
    CONSULTATION_DURATION_MINUTES,
    CONSULTATION_STATUSES,
} from "../constants.js";
import {
    createConsultationBooking,
    getAllConsultationBookings,
    getBlockingOpenConsultationBooking,
    getConsultationBookingById,
    getOpenConsultationBookingBySlotId,
    updateConsultationBookingSlotById,
    updateConsultationBookingStatusById,
} from "../db/consultation_bookings.js";
import {
    createConsultationEmailOtp,
    getConsultationEmailOtpByTokenAndOtp,
    markConsultationEmailOtpVerified,
} from "../db/consultation_email_otps.js";
import {
    createConsultationSlot,
    getAvailableConsultationSlots,
    getConsultationSlotById,
    updateConsultationSlotActiveById,
} from "../db/consultation_slots.js";
import { getConsultationSettings } from "../db/consultation_settings.js";
import {
    getAllConsultationTopics,
    getConsultationTopicById,
} from "../db/consultation_topics.js";
import {
    sendConsultationBookedEmails,
    sendConsultationCancelledGuestEmail,
    sendConsultationOtpEmail,
    sendConsultationRescheduledGuestEmail,
} from "../libs/consultation_notify.js";
import { getIstDateTime, toDbDateTime } from "../libs/date.js";
import { generateAuthenticationToken, generateOTP } from "../libs/utils.js";
import { requireCrmUser } from "./crm.js";

function canManageBooking(currentUser, booking) {
    if (currentUser.super_admin) {
        return true;
    }
    return Number(booking.slot_owner_user_id) === Number(currentUser.id);
}

export async function getConsultationBookings({ cookie, set, query }) {
    const { error, currentUser } = await requireCrmUser({ cookie, set });
    if (error) {
        return { error };
    }

    const from = String(query?.from || "").trim() || null;
    const to = String(query?.to || "").trim() || null;
    const bookings = await getAllConsultationBookings({ from, to });
    set.status = 200;
    return {
        bookings,
        statuses: CONSULTATION_STATUSES,
        duration_minutes: CONSULTATION_DURATION_MINUTES,
        currentUser,
    };
}

export async function updateConsultationBookingStatus({
    params,
    body,
    cookie,
    set,
}) {
    const { error, currentUser } = await requireCrmUser({ cookie, set });
    if (error) {
        return { error };
    }

    const booking = await getConsultationBookingById({ id: params.id });
    if (!booking) {
        set.status = 404;
        return { error: "Booking not found" };
    }

    const status = String(body.status || "").trim();
    const allowed = Object.values(CONSULTATION_STATUSES);
    if (!allowed.includes(status)) {
        set.status = 400;
        return { error: "Invalid status" };
    }

    if (
        status === CONSULTATION_STATUSES.CANCELLED &&
        !canManageBooking(currentUser, booking)
    ) {
        set.status = 403;
        return { error: "Only the slot owner can cancel this booking" };
    }

    const previousStatus = booking.status;
    await updateConsultationBookingStatusById({ id: booking.id, status });

    if (
        status === CONSULTATION_STATUSES.CANCELLED &&
        previousStatus !== CONSULTATION_STATUSES.CANCELLED
    ) {
        const now = getIstDateTime();
        if (now && String(booking.starts_at) > now) {
            await updateConsultationSlotActiveById({
                id: booking.slot_id,
                active: true,
            });
        }
        sendConsultationCancelledGuestEmail({ booking });
    }

    set.status = 200;
    return { message: "Booking status updated", currentUser };
}

export async function rescheduleConsultationBooking({
    params,
    body,
    cookie,
    set,
}) {
    const { error, currentUser } = await requireCrmUser({ cookie, set });
    if (error) {
        return { error };
    }

    const booking = await getConsultationBookingById({ id: params.id });
    if (!booking) {
        set.status = 404;
        return { error: "Booking not found" };
    }

    if (!canManageBooking(currentUser, booking)) {
        set.status = 403;
        return { error: "Only the slot owner can reschedule this booking" };
    }

    let newSlotId = body.slot_id != null ? Number(body.slot_id) : null;
    if (!newSlotId && body.starts_at) {
        const starts_at = toDbDateTime(body.starts_at);
        if (!starts_at) {
            set.status = 400;
            return { error: "Invalid new start time" };
        }
        const now = getIstDateTime();
        if (now && starts_at <= now) {
            set.status = 400;
            return { error: "New slot must be in the future" };
        }
        newSlotId = await createConsultationSlot({
            starts_at,
            created_by_user_id: currentUser.id,
        });
        if (!newSlotId) {
            set.status = 400;
            return { error: "Failed to create replacement slot" };
        }
    }

    if (!newSlotId) {
        set.status = 400;
        return { error: "Pick an available slot or provide a new start time" };
    }

    if (Number(newSlotId) === Number(booking.slot_id)) {
        set.status = 400;
        return { error: "Choose a different slot" };
    }

    const newSlot = await getConsultationSlotById({ id: newSlotId });
    if (!newSlot || !newSlot.active) {
        set.status = 400;
        return { error: "Selected slot is not available" };
    }

    const openOnNew = await getOpenConsultationBookingBySlotId({
        slot_id: newSlotId,
    });
    if (openOnNew) {
        set.status = 400;
        return { error: "Selected slot is already booked" };
    }

    await updateConsultationBookingSlotById({
        id: booking.id,
        slot_id: newSlotId,
    });

    const updated = await getConsultationBookingById({ id: booking.id });
    const settings = await getConsultationSettings();
    sendConsultationRescheduledGuestEmail({
        booking: updated,
        meeting_link: settings?.meeting_link || "",
    });

    set.status = 200;
    return { message: "Booking rescheduled", booking: updated, currentUser };
}

export async function getPublicConsultationTopics({ set }) {
    const topics = await getAllConsultationTopics({ active_only: true });
    set.status = 200;
    return { topics };
}

export async function requestConsultationOtp({ body, set }) {
    const full_name = String(body.full_name || "").trim();
    const phone = String(body.phone || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const topic_id = Number(body.topic_id);
    const slot_id = Number(body.slot_id);

    if (!full_name || full_name.length > 128) {
        set.status = 400;
        return { error: "Full name is required" };
    }
    if (!phone || phone.length < 8 || phone.length > 32) {
        set.status = 400;
        return { error: "Enter a valid phone number" };
    }
    if (!email || !email.includes("@") || email.length > 255) {
        set.status = 400;
        return { error: "Enter a valid email address" };
    }
    if (!topic_id || !slot_id) {
        set.status = 400;
        return { error: "Topic and slot are required" };
    }

    const topic = await getConsultationTopicById({ id: topic_id });
    if (!topic || !topic.active) {
        set.status = 400;
        return { error: "Selected topic is not available" };
    }

    const now = getIstDateTime();
    const blocking = await getBlockingOpenConsultationBooking({
        email,
        phone,
        now,
    });
    if (blocking) {
        set.status = 409;
        return {
            error: "You already have an upcoming consultation booking. Please wait until it ends or is cancelled.",
        };
    }

    const available = await getAvailableConsultationSlots({ now });
    const slot = available.find((row) => Number(row.id) === slot_id);
    if (!slot) {
        set.status = 400;
        return { error: "Selected slot is no longer available" };
    }

    if (isRateLimited(`otp:${email}`)) {
        set.status = 429;
        return { error: "Please wait a moment before requesting another code" };
    }

    const token = generateAuthenticationToken();
    const otp = generateOTP();
    const id = await createConsultationEmailOtp({
        email,
        token,
        otp,
        full_name,
        phone,
        topic_id,
        slot_id,
    });
    if (!id) {
        set.status = 400;
        return { error: "Failed to send verification code" };
    }

    sendConsultationOtpEmail({ email, otp });
    set.status = 201;
    return { verification_token: token, message: "Verification code sent" };
}

export async function verifyConsultationOtpAndBook({ body, set }) {
    const token = String(body.verification_token || "").trim();
    const otp = String(body.otp || "").trim();
    if (!token || !/^\d{4}$/.test(otp)) {
        set.status = 400;
        return { error: "Enter the 4-digit verification code" };
    }

    const now = getIstDateTime();
    if (!now) {
        set.status = 500;
        return { error: "Unable to verify right now" };
    }

    // 10-minute OTP window
    const earliest = shiftIstDateTimeMinutes(now, -10);
    const record = await getConsultationEmailOtpByTokenAndOtp({
        token,
        otp,
        earliest_created_on: earliest,
    });
    if (!record) {
        set.status = 401;
        return { error: "Invalid or expired verification code" };
    }

    const blocking = await getBlockingOpenConsultationBooking({
        email: record.email,
        phone: record.phone,
        now,
    });
    if (blocking) {
        set.status = 409;
        return {
            error: "You already have an upcoming consultation booking.",
        };
    }

    const available = await getAvailableConsultationSlots({ now });
    const slot = available.find((row) => Number(row.id) === Number(record.slot_id));
    if (!slot) {
        set.status = 400;
        return { error: "Selected slot is no longer available" };
    }

    const topic = await getConsultationTopicById({ id: record.topic_id });
    if (!topic || !topic.active) {
        set.status = 400;
        return { error: "Selected topic is not available" };
    }

    const bookingId = await createConsultationBooking({
        topic_id: record.topic_id,
        slot_id: record.slot_id,
        full_name: record.full_name,
        phone: record.phone,
        email: record.email,
        status: CONSULTATION_STATUSES.OPEN,
    });
    if (!bookingId) {
        set.status = 400;
        return { error: "Failed to create booking" };
    }

    await markConsultationEmailOtpVerified({
        id: record.id,
        verified_on: now,
    });

    const booking = await getConsultationBookingById({ id: bookingId });
    const settings = await getConsultationSettings();
    sendConsultationBookedEmails({
        booking,
        meeting_link: settings?.meeting_link || "",
    });

    set.status = 201;
    return {
        message: "Consultation booked",
        booking: {
            id: booking.id,
            full_name: booking.full_name,
            email: booking.email,
            phone: booking.phone,
            topic_title: booking.topic_title,
            starts_at: booking.starts_at,
            duration_minutes: CONSULTATION_DURATION_MINUTES,
            meeting_link: settings?.meeting_link || null,
        },
    };
}

const otpRateMap = new Map();

function isRateLimited(key, windowMs = 60_000) {
    const now = Date.now();
    const last = otpRateMap.get(key) || 0;
    if (now - last < windowMs) {
        return true;
    }
    otpRateMap.set(key, now);
    return false;
}

function shiftIstDateTimeMinutes(istDateTime, minutes) {
    // istDateTime is "YYYY-MM-DD HH:mm:ss" wall clock; shift via Date parse as local-ish UTC component.
    const match = String(istDateTime).match(
        /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/,
    );
    if (!match) {
        return istDateTime;
    }
    const date = new Date(
        Date.UTC(
            Number(match[1]),
            Number(match[2]) - 1,
            Number(match[3]),
            Number(match[4]),
            Number(match[5]),
            Number(match[6]),
        ),
    );
    date.setUTCMinutes(date.getUTCMinutes() + minutes);
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}
