import {
    createLead,
    deleteLeadById,
    getLeadById,
    updateLeadDuplicacyCheckedById,
    updateLeadScalarsById,
} from "../db/leads.js";
import {
    createLeadPhone,
    getLeadPhonesByLeadId,
    getOldestCheckedLeadIdByPhones,
    moveLeadPhonesToLead,
} from "../db/lead_phones.js";
import {
    createLeadEmail,
    getLeadEmailsByLeadId,
    getOldestCheckedLeadIdByEmails,
    moveLeadEmailsToLead,
} from "../db/lead_emails.js";
import { reassignLeadNotesLeadId } from "../db/lead_notes.js";
import { reassignLeadCommunicationsLeadId } from "../db/lead_communications.js";

const SCALAR_FIELDS = [
    "full_name",
    "website",
    "organization",
    "designation",
    "location",
    "refer_by",
    "targeted_for",
    "source",
    "note",
];

function pickScalar(existingValue, incomingValue) {
    const incomingText = String(incomingValue ?? "").trim();
    if (incomingText) {
        return incomingText;
    }
    const existingText = String(existingValue ?? "").trim();
    return existingText || null;
}

function buildMergedScalars({ existingLead, incoming }) {
    const merged = {};
    for (const field of SCALAR_FIELDS) {
        merged[field] = pickScalar(existingLead?.[field], incoming?.[field]);
    }
    if (!merged.full_name) {
        merged.full_name = String(existingLead?.full_name || incoming?.full_name || "").trim();
    }
    return merged;
}

async function ensurePhoneOnLead({ lead_id, phone, is_whatsapp }) {
    const existingPhones = await getLeadPhonesByLeadId({ lead_id });
    const alreadyPresent = existingPhones.some(
        (row) => String(row.phone || "").trim() === phone,
    );
    if (alreadyPresent) {
        return;
    }
    await createLeadPhone({ lead_id, phone, is_whatsapp: !!is_whatsapp });
}

async function ensureEmailOnLead({ lead_id, email, kind }) {
    const existingEmails = await getLeadEmailsByLeadId({ lead_id });
    const alreadyPresent = existingEmails.some(
        (row) => String(row.email || "").trim().toLowerCase() === email.toLowerCase(),
    );
    if (alreadyPresent) {
        return;
    }
    await createLeadEmail({ lead_id, email, kind });
}

async function applyIncomingContacts({ lead_id, phones, emails }) {
    for (const phoneRow of phones || []) {
        await ensurePhoneOnLead({
            lead_id,
            phone: phoneRow.phone,
            is_whatsapp: phoneRow.is_whatsapp,
        });
    }
    for (const emailRow of emails || []) {
        await ensureEmailOnLead({
            lead_id,
            email: emailRow.email,
            kind: emailRow.kind,
        });
    }
}

async function mergeDonorIntoSurvivor({ survivor_lead_id, donor_lead_id }) {
    if (Number(survivor_lead_id) === Number(donor_lead_id)) {
        return;
    }
    await moveLeadPhonesToLead({
        from_lead_id: donor_lead_id,
        to_lead_id: survivor_lead_id,
    });
    await moveLeadEmailsToLead({
        from_lead_id: donor_lead_id,
        to_lead_id: survivor_lead_id,
    });
    await reassignLeadNotesLeadId({
        from_lead_id: donor_lead_id,
        to_lead_id: survivor_lead_id,
    });
    await reassignLeadCommunicationsLeadId({
        from_lead_id: donor_lead_id,
        to_lead_id: survivor_lead_id,
    });
    await deleteLeadById({ id: donor_lead_id });
}

async function applyIncomingOntoLead({ lead_id, incoming }) {
    const existingLead = await getLeadById({ id: lead_id });
    if (!existingLead) {
        return { error: "Lead not found" };
    }

    const scalars = buildMergedScalars({ existingLead, incoming });
    await updateLeadScalarsById({
        id: lead_id,
        ...scalars,
        duplicacy_checked: true,
    });
    await applyIncomingContacts({
        lead_id,
        phones: incoming.phones,
        emails: incoming.emails,
    });
    return { id: lead_id };
}

/**
 * Resolve duplicacy for an incoming lead payload against checked leads.
 * @param {object} options
 * @param {object} options.incoming - parsed lead payload (scalars + phones + emails)
 * @param {number|null} [options.exclude_lead_id] - exclude this lead from matches (bulk self)
 * @param {number|null} [options.source_lead_id] - existing unchecked lead being resolved (bulk)
 */
export async function resolveLeadDuplicacy({
    incoming,
    exclude_lead_id = null,
    source_lead_id = null,
}) {
    const phoneValues = (incoming.phones || []).map((row) => row.phone);
    const emailValues = (incoming.emails || []).map((row) => row.email);

    const phoneMatchedLeadId = await getOldestCheckedLeadIdByPhones({
        phones: phoneValues,
        exclude_lead_id,
    });
    const emailMatchedLeadId = await getOldestCheckedLeadIdByEmails({
        emails: emailValues,
        exclude_lead_id,
    });

    const hasPhoneMatch = Number(phoneMatchedLeadId) >= 1;
    const hasEmailMatch = Number(emailMatchedLeadId) >= 1;

    if (!hasPhoneMatch && !hasEmailMatch) {
        if (source_lead_id) {
            await updateLeadDuplicacyCheckedById({
                id: source_lead_id,
                duplicacy_checked: true,
            });
            return { action: "created", id: source_lead_id };
        }

        const id = await createLead({
            full_name: incoming.full_name,
            website: incoming.website,
            organization: incoming.organization,
            designation: incoming.designation,
            location: incoming.location,
            refer_by: incoming.refer_by,
            targeted_for: incoming.targeted_for,
            source: incoming.source,
            note: incoming.note,
        });
        if (!id) {
            return { error: "Failed to create lead" };
        }
        await applyIncomingContacts({
            lead_id: id,
            phones: incoming.phones,
            emails: incoming.emails,
        });
        await updateLeadDuplicacyCheckedById({ id, duplicacy_checked: true });
        return { action: "created", id };
    }

    if (
        hasPhoneMatch &&
        hasEmailMatch &&
        Number(phoneMatchedLeadId) !== Number(emailMatchedLeadId)
    ) {
        const survivorLeadId = phoneMatchedLeadId;
        const donorLeadId = emailMatchedLeadId;
        await mergeDonorIntoSurvivor({
            survivor_lead_id: survivorLeadId,
            donor_lead_id: donorLeadId,
        });
        await applyIncomingOntoLead({ lead_id: survivorLeadId, incoming });

        if (source_lead_id && Number(source_lead_id) !== Number(survivorLeadId)) {
            const sourceLead = await getLeadById({ id: source_lead_id });
            if (sourceLead) {
                await mergeDonorIntoSurvivor({
                    survivor_lead_id: survivorLeadId,
                    donor_lead_id: source_lead_id,
                });
            }
        }

        return { action: "merged", id: survivorLeadId };
    }

    const targetLeadId = hasPhoneMatch ? phoneMatchedLeadId : emailMatchedLeadId;
    await applyIncomingOntoLead({ lead_id: targetLeadId, incoming });

    if (source_lead_id && Number(source_lead_id) !== Number(targetLeadId)) {
        const sourceLead = await getLeadById({ id: source_lead_id });
        if (sourceLead) {
            await mergeDonorIntoSurvivor({
                survivor_lead_id: targetLeadId,
                donor_lead_id: source_lead_id,
            });
        }
    }

    return { action: "updated", id: targetLeadId };
}
