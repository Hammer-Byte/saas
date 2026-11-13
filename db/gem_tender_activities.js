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

export async function createGemTenderActivity({
    gem_tender_id,
    user_id,
    activity,
}) {
    const activityText = truncateActivity(activity);
    if (!activityText) {
        return false;
    }

    const tenderId = Number(gem_tender_id);
    const actorId = Number(user_id);
    if (!(tenderId >= 1) || !(actorId >= 1)) {
        logger.error(
            `createGemTenderActivity: invalid ids tender=${gem_tender_id} user=${user_id}`,
        );
        return false;
    }

    try {
        await executeSQLQuery(
            (sql) => sql`
                INSERT INTO GEM_TENDER_ACTIVITIES (
                    gem_tender_id,
                    user_id,
                    activity
                ) VALUES (
                    ${tenderId},
                    ${actorId},
                    ${activityText}
                )
            `,
        );
        return true;
    } catch (error) {
        logger.error(`createGemTenderActivity: ${error}`);
        return false;
    }
}

export async function getAllGemTenderActivitiesByTenderId({ gem_tender_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                GEM_TENDER_ACTIVITIES.*,
                USERS.full_name AS user_full_name,
                USERS.email AS user_email
            FROM GEM_TENDER_ACTIVITIES
            INNER JOIN USERS ON USERS.id = GEM_TENDER_ACTIVITIES.user_id
            WHERE GEM_TENDER_ACTIVITIES.gem_tender_id = ${gem_tender_id}
            ORDER BY GEM_TENDER_ACTIVITIES.id DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllGemTenderActivitiesByTenderId: ${error}`);
            return [];
        });
}

/** Every activity in a calendar date range (by created_on), with actor and GEM tender number. */
export async function getGemTenderActivitiesInRange({ from, to }) {
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
                GEM_TENDER_ACTIVITIES.id,
                GEM_TENDER_ACTIVITIES.gem_tender_id,
                GEM_TENDER_ACTIVITIES.user_id,
                GEM_TENDER_ACTIVITIES.activity,
                GEM_TENDER_ACTIVITIES.created_on,
                USERS.full_name AS user_full_name,
                USERS.email AS user_email,
                GEM_TENDERS.tender_id,
                GEM_TENDERS.stage AS tender_stage,
                GEM_TENDERS.assignee_user_id AS tender_assignee_user_id,
                ASSIGNEES.full_name AS tender_assignee_full_name,
                ASSIGNEES.email AS tender_assignee_email
            FROM GEM_TENDER_ACTIVITIES
            INNER JOIN USERS
                ON USERS.id = GEM_TENDER_ACTIVITIES.user_id
            INNER JOIN GEM_TENDERS
                ON GEM_TENDERS.id = GEM_TENDER_ACTIVITIES.gem_tender_id
            LEFT JOIN USERS AS ASSIGNEES
                ON ASSIGNEES.id = GEM_TENDERS.assignee_user_id
            WHERE GEM_TENDER_ACTIVITIES.created_on >= ${startDateTime}
              AND GEM_TENDER_ACTIVITIES.created_on <= ${endDateTime}
            ORDER BY GEM_TENDER_ACTIVITIES.created_on DESC, GEM_TENDER_ACTIVITIES.id DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getGemTenderActivitiesInRange: ${error}`);
            return [];
        });
}
