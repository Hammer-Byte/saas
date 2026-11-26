import { LEAD_EMAIL_KINDS } from "../constants.js";
import {
    createLead,
    deleteLeadById,
    getAllLeads,
    getLeadById,
    updateLeadById,
} from "../db/leads.js";
import { getLeadSourceById } from "../db/lead_sources.js";
import {
    createLeadPhone,
    deleteLeadPhonesByLeadId,
    getLeadPhonesByLeadId,
} from "../db/lead_phones.js";
import {
    createLeadEmail,
    deleteLeadEmailsByLeadId,
    getLeadEmailsByLeadId,
} from "../db/lead_emails.js";
import { requireCrmUser } from "./crm.js";

function normalizeOptionalText(value) {
    const text = String(value ?? "").trim();
    return text || null;
}

function parsePhones(phones) {
    if (!Array.isArray(phones)) {
        return { error: "At least one phone number is required" };
    }

    const normalizedPhones = [];
    const seen = new Set();
    for (const row of phones) {
        const phone = String(row?.phone || "").trim();
        if (!phone) {
            continue;
        }
        if (phone.length > 32) {
            return { error: "Phone number is too long" };
        }
        const key = phone.toLowerCase();
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        normalizedPhones.push({
            phone,
            is_whatsapp: !!row?.is_whatsapp,
        });
    }

    if (!normalizedPhones.length) {
        return { error: "At least one phone number is required" };
    }

    return { phones: normalizedPhones };
}

function parseEmails(emails) {
    if (!Array.isArray(emails)) {
        return { error: "At least one email is required" };
    }

    const allowedKinds = Object.values(LEAD_EMAIL_KINDS);
    const normalizedEmails = [];
    const seen = new Set();
    for (const row of emails) {
        const email = String(row?.email || "").trim().toLowerCase();
        if (!email) {
            continue;
        }
        if (email.length > 255 || !email.includes("@")) {
            return { error: "Enter a valid email address" };
        }
        const kind = String(row?.kind || LEAD_EMAIL_KINDS.PROFESSIONAL).trim();
        if (!allowedKinds.includes(kind)) {
            return { error: "Email kind must be personal or professional" };
        }
        if (seen.has(email)) {
            continue;
        }
        seen.add(email);
        normalizedEmails.push({ email, kind });
    }

    if (!normalizedEmails.length) {
        return { error: "At least one email is required" };
    }

    return { emails: normalizedEmails };
}

async function parseLeadPayload(body) {
    const full_name = String(body.full_name || "").trim();
    if (!full_name) {
        return { error: "Full name is required" };
    }

    let source_id = null;
    if (body.source_id !== undefined && body.source_id !== null && body.source_id !== "") {
        const parsedSourceId = Number(body.source_id);
        if (!(parsedSourceId >= 1)) {
            return { error: "Invalid source" };
        }
        const source = await getLeadSourceById({ id: parsedSourceId });
        if (!source) {
            return { error: "Source not found" };
        }
        source_id = source.id;
    }

    const phonesResult = parsePhones(body.phones);
    if (phonesResult.error) {
        return { error: phonesResult.error };
    }

    const emailsResult = parseEmails(body.emails);
    if (emailsResult.error) {
        return { error: emailsResult.error };
    }

    return {
        full_name,
        website: normalizeOptionalText(body.website),
        organization: normalizeOptionalText(body.organization),
        designation: normalizeOptionalText(body.designation),
        location: normalizeOptionalText(body.location),
        refer_by: normalizeOptionalText(body.refer_by),
        targeted_for: normalizeOptionalText(body.targeted_for),
        source_id,
        phones: phonesResult.phones,
        emails: emailsResult.emails,
    };
}

async function replaceLeadContacts({ lead_id, phones, emails }) {
    await deleteLeadPhonesByLeadId({ lead_id });
    await deleteLeadEmailsByLeadId({ lead_id });
    for (const phoneRow of phones) {
        await createLeadPhone({
            lead_id,
            phone: phoneRow.phone,
            is_whatsapp: phoneRow.is_whatsapp,
        });
    }
    for (const emailRow of emails) {
        await createLeadEmail({
            lead_id,
            email: emailRow.email,
            kind: emailRow.kind,
        });
    }
}

export async function getLeadDetail({ lead_id }) {
    const lead = await getLeadById({ id: lead_id });
    if (!lead) {
        return null;
    }
    const phones = await getLeadPhonesByLeadId({ lead_id: lead.id });
    const emails = await getLeadEmailsByLeadId({ lead_id: lead.id });
    return { ...lead, phones, emails };
}

export async function getLeads({ cookie, set, query }) {
    const access = await requireCrmUser({ cookie, set });
    if (access.error) {
        return { error: access.error };
    }

    const leads = await getAllLeads({ from: query?.from, to: query?.to });
    set.status = 200;
    return { leads };
}

export async function addLead({ body, cookie, set }) {
    const access = await requireCrmUser({ cookie, set });
    if (access.error) {
        return { error: access.error };
    }

    const payload = await parseLeadPayload(body);
    if (payload.error) {
        set.status = 400;
        return { error: payload.error };
    }

    const id = await createLead({
        full_name: payload.full_name,
        website: payload.website,
        organization: payload.organization,
        designation: payload.designation,
        location: payload.location,
        refer_by: payload.refer_by,
        targeted_for: payload.targeted_for,
        source_id: payload.source_id,
    });

    if (!id) {
        set.status = 400;
        return { error: "Failed to create lead" };
    }

    await replaceLeadContacts({
        lead_id: id,
        phones: payload.phones,
        emails: payload.emails,
    });

    const lead = await getLeadDetail({ lead_id: id });
    set.status = 201;
    return { message: "Lead created", lead };
}

export async function updateLead({ params, body, cookie, set }) {
    const access = await requireCrmUser({ cookie, set });
    if (access.error) {
        return { error: access.error };
    }

    const existingLead = await getLeadById({ id: params.id });
    if (!existingLead) {
        set.status = 404;
        return { error: "Lead not found" };
    }

    const payload = await parseLeadPayload(body);
    if (payload.error) {
        set.status = 400;
        return { error: payload.error };
    }

    await updateLeadById({
        id: existingLead.id,
        full_name: payload.full_name,
        website: payload.website,
        organization: payload.organization,
        designation: payload.designation,
        location: payload.location,
        refer_by: payload.refer_by,
        targeted_for: payload.targeted_for,
        source_id: payload.source_id,
    });

    await replaceLeadContacts({
        lead_id: existingLead.id,
        phones: payload.phones,
        emails: payload.emails,
    });

    const lead = await getLeadDetail({ lead_id: existingLead.id });
    set.status = 200;
    return { message: "Lead updated", lead };
}

export async function deleteLead({ params, cookie, set }) {
    const access = await requireCrmUser({ cookie, set });
    if (access.error) {
        return { error: access.error };
    }

    const existingLead = await getLeadById({ id: params.id });
    if (!existingLead) {
        set.status = 404;
        return { error: "Lead not found" };
    }

    await deleteLeadById({ id: existingLead.id });
    set.status = 204;
}
