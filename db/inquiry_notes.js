import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createInquiryNote({ inquiry_id, user_id, note }) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO INQUIRY_NOTES ${sql(
                {
                    inquiry_id,
                    user_id,
                    note,
                },
                "inquiry_id",
                "user_id",
                "note",
            )}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createInquiryNote: ${error}`);
        });
}

export async function getInquiryNoteById({ id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT INQUIRY_NOTES.*
            FROM INQUIRY_NOTES
            WHERE INQUIRY_NOTES.id = ${id}
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getInquiryNoteById: ${error}`);
            return null;
        });
}

export async function getAllInquiryNotesByInquiryId({ inquiry_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                INQUIRY_NOTES.*,
                USERS.full_name AS user_full_name,
                USERS.email AS user_email
            FROM INQUIRY_NOTES
            INNER JOIN USERS ON USERS.id = INQUIRY_NOTES.user_id
            WHERE INQUIRY_NOTES.inquiry_id = ${inquiry_id}
            ORDER BY INQUIRY_NOTES.id DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllInquiryNotesByInquiryId: ${error}`);
            return [];
        });
}

export async function updateInquiryNoteById({ id, note }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE INQUIRY_NOTES
            SET note = ${note}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateInquiryNoteById: ${error}`);
    });
}

export async function deleteInquiryNoteById({ id }) {
    await executeSQLQuery(
        (sql) => sql`
            DELETE FROM INQUIRY_NOTES
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`deleteInquiryNoteById: ${error}`);
    });
}
