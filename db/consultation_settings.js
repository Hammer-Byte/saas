import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function getConsultationSettings() {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM CONSULTATION_SETTINGS
            WHERE id = 1
            LIMIT 1
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getConsultationSettings: ${error}`);
            return null;
        });
}

export async function updateConsultationSettings({
    meeting_link = null,
    whatsapp_number = null,
    whatsapp_message = null,
    updated_by = null,
}) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE CONSULTATION_SETTINGS
            SET
                meeting_link = ${meeting_link},
                whatsapp_number = ${whatsapp_number},
                whatsapp_message = ${whatsapp_message},
                updated_by = ${updated_by}
            WHERE id = 1
        `,
    ).catch((error) => {
        logger.error(`updateConsultationSettings: ${error}`);
    });
}
