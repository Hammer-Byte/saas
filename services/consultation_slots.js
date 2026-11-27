import {
    CONSULTATION_DURATION_MINUTES,
    CONSULTATION_STATUSES,
} from "../constants.js";
import {
    createConsultationSlot,
    getAllConsultationSlots,
    getAvailableConsultationSlots,
    getConsultationSlotById,
    updateConsultationSlotActiveById,
    updateConsultationSlotStartsAtById,
} from "../db/consultation_slots.js";
import { getOpenConsultationBookingBySlotId } from "../db/consultation_bookings.js";
import { getIstDateTime, toDbDateTime } from "../libs/date.js";
import { requireCrmUser } from "./crm.js";

function canManageSlot(currentUser, slot) {
    if (currentUser.super_admin) {
        return true;
    }
    return Number(slot.created_by_user_id) === Number(currentUser.id);
}

export async function getConsultationSlots({ cookie, set, query }) {
    const { error, currentUser } = await requireCrmUser({ cookie, set });
    if (error) {
        return { error };
    }

    const from = String(query?.from || "").trim() || null;
    const to = String(query?.to || "").trim() || null;
    const slots = await getAllConsultationSlots({ from, to });
    set.status = 200;
    return {
        slots,
        duration_minutes: CONSULTATION_DURATION_MINUTES,
        currentUser,
    };
}

export async function addConsultationSlot({ body, cookie, set }) {
    const { error, currentUser } = await requireCrmUser({ cookie, set });
    if (error) {
        return { error };
    }

    const starts_at = toDbDateTime(body.starts_at);
    if (!starts_at) {
        set.status = 400;
        return { error: "Start time is required (YYYY-MM-DD HH:mm)" };
    }

    const now = getIstDateTime();
    if (now && starts_at <= now) {
        set.status = 400;
        return { error: "Slot must be in the future" };
    }

    const id = await createConsultationSlot({
        starts_at,
        created_by_user_id: currentUser.id,
    });
    if (!id) {
        set.status = 400;
        return { error: "Failed to create slot" };
    }

    set.status = 201;
    return {
        id,
        message: "Slot created",
        duration_minutes: CONSULTATION_DURATION_MINUTES,
        currentUser,
    };
}

export async function updateConsultationSlot({ params, body, cookie, set }) {
    const { error, currentUser } = await requireCrmUser({ cookie, set });
    if (error) {
        return { error };
    }

    const slot = await getConsultationSlotById({ id: params.id });
    if (!slot) {
        set.status = 404;
        return { error: "Slot not found" };
    }

    if (!canManageSlot(currentUser, slot)) {
        set.status = 403;
        return { error: "Only the slot owner can update this slot" };
    }

    if (body.starts_at != null) {
        const starts_at = toDbDateTime(body.starts_at);
        if (!starts_at) {
            set.status = 400;
            return { error: "Invalid start time" };
        }
        const openBooking = await getOpenConsultationBookingBySlotId({
            slot_id: slot.id,
        });
        if (openBooking) {
            set.status = 400;
            return { error: "Cannot change time while an open booking exists" };
        }
        await updateConsultationSlotStartsAtById({ id: slot.id, starts_at });
    }

    if (body.active != null) {
        const active = !!body.active;
        if (!active) {
            const openBooking = await getOpenConsultationBookingBySlotId({
                slot_id: slot.id,
            });
            if (openBooking) {
                set.status = 400;
                return {
                    error: "Cannot deactivate a slot with an open booking",
                };
            }
        }
        await updateConsultationSlotActiveById({ id: slot.id, active });
    }

    set.status = 200;
    return { message: "Slot updated", currentUser };
}

export async function getPublicAvailableConsultationSlots({ set }) {
    const now = getIstDateTime();
    const slots = await getAvailableConsultationSlots({ now });
    set.status = 200;
    return {
        slots: slots.map((slot) => ({
            id: slot.id,
            starts_at: slot.starts_at,
            owner_name: slot.owner_name,
        })),
        duration_minutes: CONSULTATION_DURATION_MINUTES,
        status_open: CONSULTATION_STATUSES.OPEN,
    };
}
