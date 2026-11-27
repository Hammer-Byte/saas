import { filer, logger } from "@hammerbyte/utils";
import { getWritableDate } from "./date.js";
import transporter from "./transporter.js";

function formatSlotParts(startsAt) {
    return {
        date: getWritableDate("DD/MM/YYYY", startsAt) || String(startsAt),
        time: getWritableDate("HH:mm", startsAt) || String(startsAt),
    };
}

function ownerRecipient(booking) {
    return String(booking.owner_email || booking.owner_personal_email || "").trim();
}

export function sendConsultationOtpEmail({ email, otp }) {
    const html = filer.prepareTemplated("templates/consultation_otp.html", {
        otp,
        valid_for_minutes: 10,
        app_name: "HammerByte",
    });
    transporter.transport({
        recipient: email,
        subject: "Verify your free consultation booking",
        body: html,
        html_enabled: true,
    });
}

export function sendConsultationBookedEmails({ booking, meeting_link }) {
    const { date, time } = formatSlotParts(booking.starts_at);
    const meetingLink = String(meeting_link || "").trim() || "—";

    const guestHtml = filer.prepareTemplated("templates/consultation_booked_guest.html", {
        full_name: booking.full_name || "there",
        topic_title: booking.topic_title || "Free consultation",
        slot_date: date,
        slot_time: time,
        meeting_link: meetingLink,
        app_name: "HammerByte",
    });
    transporter.transport({
        recipient: booking.email,
        subject: `Consultation confirmed — ${date} at ${time}`,
        body: guestHtml,
        html_enabled: true,
    });

    const ownerEmail = ownerRecipient(booking);
    if (!ownerEmail) {
        logger.info(`consultation booked owner email skipped (booking #${booking.id})`);
        return;
    }

    const ownerHtml = filer.prepareTemplated("templates/consultation_booked_owner.html", {
        owner_name: booking.owner_name || "there",
        full_name: booking.full_name || "—",
        phone: booking.phone || "—",
        email: booking.email || "—",
        topic_title: booking.topic_title || "Free consultation",
        slot_date: date,
        slot_time: time,
        meeting_link: meetingLink,
        app_name: "HammerByte",
    });
    transporter.transport({
        recipient: ownerEmail,
        subject: `New consultation booking — ${booking.full_name || "guest"}`,
        body: ownerHtml,
        html_enabled: true,
    });
}

export function sendConsultationReminderEmails({ booking, meeting_link }) {
    const { date, time } = formatSlotParts(booking.starts_at);
    const meetingLink = String(meeting_link || "").trim() || "—";
    let sent = false;

    if (booking.email) {
        const guestHtml = filer.prepareTemplated(
            "templates/consultation_reminder_guest.html",
            {
                full_name: booking.full_name || "there",
                topic_title: booking.topic_title || "Free consultation",
                slot_date: date,
                slot_time: time,
                meeting_link: meetingLink,
                app_name: "HammerByte",
            },
        );
        transporter.transport({
            recipient: booking.email,
            subject: `Consultation reminder — ${time} today`,
            body: guestHtml,
            html_enabled: true,
        });
        sent = true;
    }

    const ownerEmail = ownerRecipient(booking);
    if (ownerEmail) {
        const ownerHtml = filer.prepareTemplated(
            "templates/consultation_reminder_owner.html",
            {
                owner_name: booking.owner_name || "there",
                full_name: booking.full_name || "—",
                phone: booking.phone || "—",
                email: booking.email || "—",
                topic_title: booking.topic_title || "Free consultation",
                slot_date: date,
                slot_time: time,
                meeting_link: meetingLink,
                app_name: "HammerByte",
            },
        );
        transporter.transport({
            recipient: ownerEmail,
            subject: `Consultation starting soon — ${booking.full_name || "guest"}`,
            body: ownerHtml,
            html_enabled: true,
        });
        sent = true;
    }

    return sent;
}

export function sendConsultationRescheduledGuestEmail({ booking, meeting_link }) {
    const { date, time } = formatSlotParts(booking.starts_at);
    const meetingLink = String(meeting_link || "").trim() || "—";
    const html = filer.prepareTemplated("templates/consultation_rescheduled_guest.html", {
        full_name: booking.full_name || "there",
        topic_title: booking.topic_title || "Free consultation",
        slot_date: date,
        slot_time: time,
        meeting_link: meetingLink,
        app_name: "HammerByte",
    });
    transporter.transport({
        recipient: booking.email,
        subject: `Consultation rescheduled — ${date} at ${time}`,
        body: html,
        html_enabled: true,
    });
}

export function sendConsultationCancelledGuestEmail({ booking }) {
    const { date, time } = formatSlotParts(booking.starts_at);
    const html = filer.prepareTemplated("templates/consultation_cancelled_guest.html", {
        full_name: booking.full_name || "there",
        topic_title: booking.topic_title || "Free consultation",
        slot_date: date,
        slot_time: time,
        app_name: "HammerByte",
    });
    transporter.transport({
        recipient: booking.email,
        subject: `Consultation cancelled — ${date}`,
        body: html,
        html_enabled: true,
    });
}
