import { LEAD_EMAIL_KINDS } from "../constants.js";
import { csvRowsToObjects, parseCsv } from "../libs/csv.js";
import {
    createLead,
    deleteLeadById,
    getAllLeads,
    getLeadById,
    updateLeadById,
} from "../db/leads.js";
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

const LEAD_CSV_MAX_ROWS = 2000;

function normalizeOptionalText(value) {
    const text = String(value ?? "").trim();
    return text || null;
}

function parsePhones(phones) {
    if (phones == null) {
        return { phones: [] };
    }
    if (!Array.isArray(phones)) {
        return { error: "Phones must be a list" };
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

    return { phones: normalizedPhones };
}

function parseEmails(emails) {
    if (emails == null) {
        return { emails: [] };
    }
    if (!Array.isArray(emails)) {
        return { error: "Emails must be a list" };
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

    return { emails: normalizedEmails };
}

async function parseLeadPayload(body) {
    const full_name = String(body.full_name || "").trim();
    if (!full_name) {
        return { error: "Full name is required" };
    }

    const phonesResult = parsePhones(body.phones);
    if (phonesResult.error) {
        return { error: phonesResult.error };
    }

    const emailsResult = parseEmails(body.emails);
    if (emailsResult.error) {
        return { error: emailsResult.error };
    }

    if (!phonesResult.phones.length && !emailsResult.emails.length) {
        return { error: "Add at least one phone number or email" };
    }

    return {
        full_name,
        website: normalizeOptionalText(body.website),
        organization: normalizeOptionalText(body.organization),
        designation: normalizeOptionalText(body.designation),
        location: normalizeOptionalText(body.location),
        refer_by: normalizeOptionalText(body.refer_by),
        targeted_for: normalizeOptionalText(body.targeted_for),
        source: normalizeOptionalText(body.source),
        note: normalizeOptionalText(body.note),
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

async function insertLeadFromPayload(payload) {
    const id = await createLead({
        full_name: payload.full_name,
        website: payload.website,
        organization: payload.organization,
        designation: payload.designation,
        location: payload.location,
        refer_by: payload.refer_by,
        targeted_for: payload.targeted_for,
        source: payload.source,
        note: payload.note,
    });
    if (!id) {
        return { error: "Failed to create lead" };
    }
    await replaceLeadContacts({
        lead_id: id,
        phones: payload.phones,
        emails: payload.emails,
    });
    return { id };
}

function parsePhonesCell(value) {
    const parts = String(value || "")
        .split(";")
        .map((part) => part.trim())
        .filter(Boolean);
    const phones = [];
    for (const part of parts) {
        const [phonePart, flagPart] = part.split("|").map((piece) => piece.trim());
        if (!phonePart) continue;
        const flag = String(flagPart || "").toLowerCase();
        phones.push({
            phone: phonePart,
            is_whatsapp: flag === "whatsapp" || flag === "wa" || flag === "1" || flag === "true",
        });
    }
    return phones;
}

function parseEmailsCell(value) {
    const parts = String(value || "")
        .split(";")
        .map((part) => part.trim())
        .filter(Boolean);
    const emails = [];
    for (const part of parts) {
        const [emailPart, kindPart] = part.split("|").map((piece) => piece.trim());
        if (!emailPart) continue;
        const kind = String(kindPart || LEAD_EMAIL_KINDS.PROFESSIONAL).toLowerCase();
        emails.push({
            email: emailPart,
            kind:
                kind === LEAD_EMAIL_KINDS.PERSONAL
                    ? LEAD_EMAIL_KINDS.PERSONAL
                    : LEAD_EMAIL_KINDS.PROFESSIONAL,
        });
    }
    return emails;
}

function csvRecordToLeadBody(record) {
    return {
        full_name: record.full_name,
        website: record.website,
        organization: record.organization,
        designation: record.designation,
        location: record.location,
        refer_by: record.refer_by,
        targeted_for: record.targeted_for ?? record.can_target_for,
        source: record.source,
        note: record.note,
        phones: parsePhonesCell(record.phones),
        emails: parseEmailsCell(record.emails),
    };
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

    const created = await insertLeadFromPayload(payload);
    if (created.error) {
        set.status = 400;
        return { error: created.error };
    }

    const lead = await getLeadDetail({ lead_id: created.id });
    set.status = 201;
    return { message: "Lead created", lead };
}

export async function importLeads({ body, cookie, set }) {
    const access = await requireCrmUser({ cookie, set });
    if (access.error) {
        return { error: access.error };
    }

    const uploadedFile = body?.file;
    if (!uploadedFile || typeof uploadedFile !== "object" || !(uploadedFile.size > 0)) {
        set.status = 400;
        return { error: "CSV file is required" };
    }

    const fileName = String(uploadedFile.name || "").toLowerCase();
    if (fileName && !fileName.endsWith(".csv")) {
        set.status = 400;
        return { error: "Upload a .csv file" };
    }

    const csvText = await uploadedFile.text();
    const parsed = parseCsv(csvText);
    if (!parsed.headers.length) {
        set.status = 400;
        return { error: "CSV has no header row" };
    }

    const normalizedHeaders = parsed.headers.map((header) =>
        String(header || "")
            .trim()
            .toLowerCase()
            .replace(/\s+/g, "_"),
    );
    if (!normalizedHeaders.includes("full_name")) {
        set.status = 400;
        return { error: 'CSV must include a "full_name" column' };
    }

    if (parsed.rows.length > LEAD_CSV_MAX_ROWS) {
        set.status = 400;
        return {
            error: `CSV has too many rows (max ${LEAD_CSV_MAX_ROWS})`,
        };
    }

    const records = csvRowsToObjects(parsed);
    let createdCount = 0;
    const failures = [];

    for (let index = 0; index < records.length; index += 1) {
        const rowNumber = index + 2;
        const payload = await parseLeadPayload(csvRecordToLeadBody(records[index]));
        if (payload.error) {
            failures.push({ row: rowNumber, error: payload.error });
            continue;
        }

        const created = await insertLeadFromPayload(payload);
        if (created.error) {
            failures.push({ row: rowNumber, error: created.error });
            continue;
        }
        createdCount += 1;
    }

    set.status = 200;
    return {
        message: `Imported ${createdCount} lead${createdCount === 1 ? "" : "s"}`,
        created: createdCount,
        failed: failures.length,
        failures: failures.slice(0, 50),
        total: records.length,
    };
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
        source: payload.source,
        note: payload.note,
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
