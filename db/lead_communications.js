import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function reassignLeadCommunicationsLeadId({ from_lead_id, to_lead_id }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE LEAD_COMMUNICATIONS
            SET lead_id = ${to_lead_id}
            WHERE lead_id = ${from_lead_id}
        `,
    ).catch((error) => {
        logger.error(`reassignLeadCommunicationsLeadId: ${error}`);
    });
}

export async function getLeadCommunicationsByLeadId({ lead_id, channel = null }) {
    if (channel) {
        return await executeSQLQuery(
            (sql) => sql`
                SELECT *
                FROM LEAD_COMMUNICATIONS
                WHERE lead_id = ${lead_id}
                  AND channel = ${channel}
                ORDER BY created_on DESC, id DESC
            `,
        )
            .then((result) => Array.from(result ?? []))
            .catch((error) => {
                logger.error(`getLeadCommunicationsByLeadId: ${error}`);
                return [];
            });
    }

    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM LEAD_COMMUNICATIONS
            WHERE lead_id = ${lead_id}
            ORDER BY created_on DESC, id DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getLeadCommunicationsByLeadId: ${error}`);
            return [];
        });
}
