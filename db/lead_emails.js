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
