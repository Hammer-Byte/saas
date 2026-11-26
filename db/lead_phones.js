import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createLeadPhone({ lead_id, phone, is_whatsapp = false }) {
    await executeSQLQuery(
        (sql) => sql`
            INSERT INTO LEAD_PHONES ${sql(
                {
                    lead_id,
                    phone,
                    is_whatsapp: !!is_whatsapp,
                },
                "lead_id",
                "phone",
                "is_whatsapp",
            )}
        `,
    ).catch((error) => {
        logger.error(`createLeadPhone: ${error}`);
    });
}

export async function getLeadPhonesByLeadId({ lead_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT id, lead_id, phone, is_whatsapp, created_on
            FROM LEAD_PHONES
            WHERE lead_id = ${lead_id}
            ORDER BY id ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getLeadPhonesByLeadId: ${error}`);
            return [];
        });
}

export async function deleteLeadPhonesByLeadId({ lead_id }) {
    await executeSQLQuery(
        (sql) => sql`
            DELETE FROM LEAD_PHONES
            WHERE lead_id = ${lead_id}
        `,
    ).catch((error) => {
        logger.error(`deleteLeadPhonesByLeadId: ${error}`);
    });
}

export async function getOldestCheckedLeadIdByPhones({ phones, exclude_lead_id = null }) {
    const phoneList = (phones || [])
        .map((phone) => String(phone || "").trim())
        .filter(Boolean);
    if (!phoneList.length) {
        return null;
    }

    if (exclude_lead_id != null) {
        return await executeSQLQuery(
            (sql) => sql`
                SELECT LEADS.id
                FROM LEAD_PHONES
                INNER JOIN LEADS ON LEADS.id = LEAD_PHONES.lead_id
                WHERE LEADS.duplicacy_checked = TRUE
                  AND LEADS.id <> ${exclude_lead_id}
                  AND LEAD_PHONES.phone IN ${sql(phoneList)}
                ORDER BY LEADS.id ASC
                LIMIT 1
            `,
        )
            .then((result) => (result.length ? result[0].id : null))
            .catch((error) => {
                logger.error(`getOldestCheckedLeadIdByPhones: ${error}`);
                return null;
            });
    }

    return await executeSQLQuery(
        (sql) => sql`
            SELECT LEADS.id
            FROM LEAD_PHONES
            INNER JOIN LEADS ON LEADS.id = LEAD_PHONES.lead_id
            WHERE LEADS.duplicacy_checked = TRUE
              AND LEAD_PHONES.phone IN ${sql(phoneList)}
            ORDER BY LEADS.id ASC
            LIMIT 1
        `,
    )
        .then((result) => (result.length ? result[0].id : null))
        .catch((error) => {
            logger.error(`getOldestCheckedLeadIdByPhones: ${error}`);
            return null;
        });
}

export async function moveLeadPhonesToLead({ from_lead_id, to_lead_id }) {
    const phones = await getLeadPhonesByLeadId({ lead_id: from_lead_id });
    for (const phoneRow of phones) {
        const existingOnTarget = await executeSQLQuery(
            (sql) => sql`
                SELECT id
                FROM LEAD_PHONES
                WHERE lead_id = ${to_lead_id}
                  AND phone = ${phoneRow.phone}
                LIMIT 1
            `,
        )
            .then((result) => (result.length ? result[0] : null))
            .catch((error) => {
                logger.error(`moveLeadPhonesToLead lookup: ${error}`);
                return null;
            });
        if (existingOnTarget) {
            continue;
        }
        await createLeadPhone({
            lead_id: to_lead_id,
            phone: phoneRow.phone,
            is_whatsapp: !!phoneRow.is_whatsapp,
        });
    }
    await deleteLeadPhonesByLeadId({ lead_id: from_lead_id });
}
