import {
    getConsultationSettings,
    updateConsultationSettings,
} from "../db/consultation_settings.js";
import { requireCrmUser } from "./crm.js";

function normalizeWhatsappNumber(value) {
    const digits = String(value || "").replace(/\D/g, "");
    if (!digits) {
        return { error: "WhatsApp number is required" };
    }
    if (digits.length < 10 || digits.length > 15) {
        return { error: "Enter a valid WhatsApp number (E.164 digits)" };
    }
    return { value: digits };
}

export async function getConsultationSettingsAdmin({ cookie, set }) {
    const { error, currentUser } = await requireCrmUser({ cookie, set });
    if (error) {
        return { error };
    }

    const settings = (await getConsultationSettings()) || {
        id: 1,
        meeting_link: null,
        whatsapp_number: null,
        whatsapp_message: null,
    };
    set.status = 200;
    return { settings, currentUser };
}

export async function saveConsultationSettings({ body, cookie, set }) {
    const { error, currentUser } = await requireCrmUser({ cookie, set });
    if (error) {
        return { error };
    }

    const meeting_link = String(body.meeting_link || "").trim() || null;
    if (meeting_link && meeting_link.length > 512) {
        set.status = 400;
        return { error: "Meeting link is too long" };
    }

    const whatsapp = normalizeWhatsappNumber(body.whatsapp_number);
    if (whatsapp.error) {
        set.status = 400;
        return { error: whatsapp.error };
    }

    const whatsapp_message = String(body.whatsapp_message || "").trim();
    if (!whatsapp_message) {
        set.status = 400;
        return { error: "WhatsApp message is required" };
    }

    await updateConsultationSettings({
        meeting_link,
        whatsapp_number: whatsapp.value,
        whatsapp_message,
        updated_by: currentUser.id,
    });

    set.status = 200;
    return { message: "Settings saved", currentUser };
}

export async function getPublicConsultationSettings({ set }) {
    const settings = await getConsultationSettings();
    const whatsapp_number = String(settings?.whatsapp_number || "").trim();
    const whatsapp_message = String(settings?.whatsapp_message || "").trim();
    set.status = 200;
    return {
        whatsapp_number: whatsapp_number || null,
        whatsapp_message: whatsapp_message || null,
        meeting_link_configured: !!String(settings?.meeting_link || "").trim(),
        booking_open: true,
    };
}
