import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";
import { toDbDateTime } from "../libs/date.js";

export async function createInquiryFollowup({
    inquiry_id,
    user_id,
    note,
    followed_up_on,
    slot,
}) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO INQUIRY_FOLLOWUPS ${sql(
                {
                    inquiry_id,
                    user_id,
                    note,
                    followed_up_on: toDbDateTime(followed_up_on) || followed_up_on,
                    slot,
                },
                "inquiry_id",
                "user_id",
                "note",
                "followed_up_on",
                "slot",
            )}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createInquiryFollowup: ${error}`);
        });
}

export async function getAllInquiryFollowupsByInquiryId({ inquiry_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                INQUIRY_FOLLOWUPS.*,
                USERS.full_name AS user_full_name,
                USERS.email AS user_email
            FROM INQUIRY_FOLLOWUPS
            INNER JOIN USERS ON USERS.id = INQUIRY_FOLLOWUPS.user_id
            WHERE INQUIRY_FOLLOWUPS.inquiry_id = ${inquiry_id}
            ORDER BY INQUIRY_FOLLOWUPS.slot ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllInquiryFollowupsByInquiryId: ${error}`);
            return [];
        });
}

export async function getInquiryFollowupByInquiryIdAndSlot({ inquiry_id, slot }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT INQUIRY_FOLLOWUPS.*
            FROM INQUIRY_FOLLOWUPS
            WHERE INQUIRY_FOLLOWUPS.inquiry_id = ${inquiry_id}
              AND INQUIRY_FOLLOWUPS.slot = ${slot}
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getInquiryFollowupByInquiryIdAndSlot: ${error}`);
            return null;
        });
}
