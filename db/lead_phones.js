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
