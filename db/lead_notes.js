import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createLeadNote({ lead_id, user_id, note, media_id = null }) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO LEAD_NOTES ${sql(
                {
                    lead_id,
                    user_id,
                    note,
                    media_id,
                },
                "lead_id",
                "user_id",
                "note",
                "media_id",
            )}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createLeadNote: ${error}`);
        });
}

export async function getLeadNoteById({ id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                LEAD_NOTES.*,
                MEDIA.name AS attachment_name,
                MEDIA.file AS attachment_file
            FROM LEAD_NOTES
            LEFT JOIN MEDIA ON MEDIA.id = LEAD_NOTES.media_id
            WHERE LEAD_NOTES.id = ${id}
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getLeadNoteById: ${error}`);
            return null;
        });
}

export async function getAllLeadNotesByLeadId({ lead_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                LEAD_NOTES.*,
                USERS.full_name AS author_name,
                USERS.email AS author_email,
                MEDIA.name AS attachment_name,
                MEDIA.file AS attachment_file
            FROM LEAD_NOTES
            INNER JOIN USERS ON USERS.id = LEAD_NOTES.user_id
            LEFT JOIN MEDIA ON MEDIA.id = LEAD_NOTES.media_id
            WHERE LEAD_NOTES.lead_id = ${lead_id}
            ORDER BY LEAD_NOTES.id DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllLeadNotesByLeadId: ${error}`);
            return [];
        });
}

export async function updateLeadNoteById({ id, note }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE LEAD_NOTES
            SET note = ${note}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateLeadNoteById: ${error}`);
    });
}

export async function deleteLeadNoteById({ id }) {
    await executeSQLQuery((sql) => sql`DELETE FROM LEAD_NOTES WHERE id = ${id}`).catch((error) => {
        logger.error(`deleteLeadNoteById: ${error}`);
    });
}

export async function reassignLeadNotesLeadId({ from_lead_id, to_lead_id }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE LEAD_NOTES
            SET lead_id = ${to_lead_id}
            WHERE lead_id = ${from_lead_id}
        `,
    ).catch((error) => {
        logger.error(`reassignLeadNotesLeadId: ${error}`);
    });
}
