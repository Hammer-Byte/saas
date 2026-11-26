import { logger } from "@hammerbyte/utils";
import { LEAD_EMAIL_KINDS } from "../constants.js";
import { executeSQLQuery } from "../libs/db.js";

export async function createLeadEmail({
    lead_id,
    email,
    kind = LEAD_EMAIL_KINDS.PROFESSIONAL,
}) {
    await executeSQLQuery(
        (sql) => sql`
            INSERT INTO LEAD_EMAILS ${sql(
                {
                    lead_id,
                    email,
                    kind,
                },
                "lead_id",
                "email",
                "kind",
            )}
        `,
    ).catch((error) => {
        logger.error(`createLeadEmail: ${error}`);
    });
}

export async function getLeadEmailsByLeadId({ lead_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT id, lead_id, email, kind, created_on
            FROM LEAD_EMAILS
            WHERE lead_id = ${lead_id}
            ORDER BY id ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getLeadEmailsByLeadId: ${error}`);
            return [];
        });
}

export async function deleteLeadEmailsByLeadId({ lead_id }) {
    await executeSQLQuery(
        (sql) => sql`
            DELETE FROM LEAD_EMAILS
            WHERE lead_id = ${lead_id}
        `,
    ).catch((error) => {
        logger.error(`deleteLeadEmailsByLeadId: ${error}`);
    });
}

export async function getOldestCheckedLeadIdByEmails({ emails, exclude_lead_id = null }) {
    const emailList = (emails || [])
        .map((email) => String(email || "").trim().toLowerCase())
        .filter(Boolean);
    if (!emailList.length) {
        return null;
    }

    if (exclude_lead_id != null) {
        return await executeSQLQuery(
            (sql) => sql`
                SELECT LEADS.id
                FROM LEAD_EMAILS
                INNER JOIN LEADS ON LEADS.id = LEAD_EMAILS.lead_id
                WHERE LEADS.duplicacy_checked = TRUE
                  AND LEADS.id <> ${exclude_lead_id}
                  AND LOWER(LEAD_EMAILS.email) IN ${sql(emailList)}
                ORDER BY LEADS.id ASC
                LIMIT 1
            `,
        )
            .then((result) => (result.length ? result[0].id : null))
            .catch((error) => {
                logger.error(`getOldestCheckedLeadIdByEmails: ${error}`);
                return null;
            });
    }

    return await executeSQLQuery(
        (sql) => sql`
            SELECT LEADS.id
            FROM LEAD_EMAILS
            INNER JOIN LEADS ON LEADS.id = LEAD_EMAILS.lead_id
            WHERE LEADS.duplicacy_checked = TRUE
              AND LOWER(LEAD_EMAILS.email) IN ${sql(emailList)}
            ORDER BY LEADS.id ASC
            LIMIT 1
        `,
    )
        .then((result) => (result.length ? result[0].id : null))
        .catch((error) => {
            logger.error(`getOldestCheckedLeadIdByEmails: ${error}`);
            return null;
        });
}

export async function moveLeadEmailsToLead({ from_lead_id, to_lead_id }) {
    const emails = await getLeadEmailsByLeadId({ lead_id: from_lead_id });
    for (const emailRow of emails) {
        const existingOnTarget = await executeSQLQuery(
            (sql) => sql`
                SELECT id
                FROM LEAD_EMAILS
                WHERE lead_id = ${to_lead_id}
                  AND email = ${emailRow.email}
                LIMIT 1
            `,
        )
            .then((result) => (result.length ? result[0] : null))
            .catch((error) => {
                logger.error(`moveLeadEmailsToLead lookup: ${error}`);
                return null;
            });
        if (existingOnTarget) {
            continue;
        }
        await createLeadEmail({
            lead_id: to_lead_id,
            email: emailRow.email,
            kind: emailRow.kind,
        });
    }
    await deleteLeadEmailsByLeadId({ lead_id: from_lead_id });
}
