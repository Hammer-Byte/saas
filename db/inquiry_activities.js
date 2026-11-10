import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

const ACTIVITY_MAX_LENGTH = 512;

function truncateActivity(activity) {
    const text = String(activity || "").trim();
    if (!text) {
        return null;
    }
    if (text.length <= ACTIVITY_MAX_LENGTH) {
        return text;
    }
    return `${text.slice(0, ACTIVITY_MAX_LENGTH - 3)}...`;
}

export async function createInquiryActivity({ inquiry_id, user_id, activity }) {
    const activityText = truncateActivity(activity);
    if (!activityText) {
        return false;
    }

    const inquiryId = Number(inquiry_id);
    const actorId = Number(user_id);
    if (!(inquiryId >= 1) || !(actorId >= 1)) {
        logger.error(
            `createInquiryActivity: invalid ids inquiry=${inquiry_id} user=${user_id}`,
        );
        return false;
    }

    try {
        await executeSQLQuery(
            (sql) => sql`
                INSERT INTO INQUIRY_ACTIVITIES (
                    inquiry_id,
                    user_id,
                    activity
                ) VALUES (
                    ${inquiryId},
                    ${actorId},
                    ${activityText}
                )
            `,
        );
        return true;
    } catch (error) {
        logger.error(`createInquiryActivity: ${error}`);
        return false;
    }
}

export async function getAllInquiryActivitiesByInquiryId({ inquiry_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                INQUIRY_ACTIVITIES.*,
                USERS.full_name AS user_full_name,
                USERS.email AS user_email
            FROM INQUIRY_ACTIVITIES
            INNER JOIN USERS ON USERS.id = INQUIRY_ACTIVITIES.user_id
            WHERE INQUIRY_ACTIVITIES.inquiry_id = ${inquiry_id}
            ORDER BY INQUIRY_ACTIVITIES.id DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllInquiryActivitiesByInquiryId: ${error}`);
            return [];
        });
}

export async function getInquiryActivityCountsByActor({ from, to }) {
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!datePattern.test(String(from || "")) || !datePattern.test(String(to || ""))) {
        return [];
    }

    const rangeStart = from <= to ? from : to;
    const rangeEnd = from <= to ? to : from;
    const startDateTime = `${rangeStart} 00:00:00`;
    const endDateTime = `${rangeEnd} 23:59:59`;

    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                USERS.id AS user_id,
                USERS.full_name AS user_full_name,
                USERS.email AS user_email,
                COUNT(INQUIRY_ACTIVITIES.id) AS activity_count
            FROM INQUIRY_ACTIVITIES
            INNER JOIN USERS ON USERS.id = INQUIRY_ACTIVITIES.user_id
            INNER JOIN INQUIRIES ON INQUIRIES.id = INQUIRY_ACTIVITIES.inquiry_id
            WHERE INQUIRIES.created_on >= ${startDateTime}
              AND INQUIRIES.created_on <= ${endDateTime}
            GROUP BY USERS.id, USERS.full_name, USERS.email
            ORDER BY activity_count DESC, USERS.full_name ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getInquiryActivityCountsByActor: ${error}`);
            return [];
        });
}
