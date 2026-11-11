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

export async function createGemKeywordTenderActivity({
    gem_keyword_tender_id,
    user_id,
    activity,
}) {
    const activityText = truncateActivity(activity);
    if (!activityText) {
        return false;
    }

    const tenderId = Number(gem_keyword_tender_id);
    const actorId = Number(user_id);
    if (!(tenderId >= 1) || !(actorId >= 1)) {
        logger.error(
            `createGemKeywordTenderActivity: invalid ids tender=${gem_keyword_tender_id} user=${user_id}`,
        );
        return false;
    }

    try {
        await executeSQLQuery(
            (sql) => sql`
                INSERT INTO GEM_KEYWORD_TENDER_ACTIVITIES (
                    gem_keyword_tender_id,
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
        logger.error(`createGemKeywordTenderActivity: ${error}`);
        return false;
    }
}

export async function getAllGemKeywordTenderActivitiesByTenderId({ gem_keyword_tender_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                GEM_KEYWORD_TENDER_ACTIVITIES.*,
                USERS.full_name AS user_full_name,
                USERS.email AS user_email
            FROM GEM_KEYWORD_TENDER_ACTIVITIES
            INNER JOIN USERS ON USERS.id = GEM_KEYWORD_TENDER_ACTIVITIES.user_id
            WHERE GEM_KEYWORD_TENDER_ACTIVITIES.gem_keyword_tender_id = ${gem_keyword_tender_id}
            ORDER BY GEM_KEYWORD_TENDER_ACTIVITIES.id DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllGemKeywordTenderActivitiesByTenderId: ${error}`);
            return [];
        });
}

export async function getGemKeywordTenderActivityCountsByActor({ from, to }) {
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
                COUNT(GEM_KEYWORD_TENDER_ACTIVITIES.id) AS activity_count
            FROM GEM_KEYWORD_TENDER_ACTIVITIES
            INNER JOIN USERS
                ON USERS.id = GEM_KEYWORD_TENDER_ACTIVITIES.user_id
            INNER JOIN GEM_KEYWORD_TENDERS
                ON GEM_KEYWORD_TENDERS.id = GEM_KEYWORD_TENDER_ACTIVITIES.gem_keyword_tender_id
            WHERE GEM_KEYWORD_TENDERS.end_date_time IS NOT NULL
              AND GEM_KEYWORD_TENDERS.end_date_time >= ${startDateTime}
              AND GEM_KEYWORD_TENDERS.end_date_time <= ${endDateTime}
            GROUP BY USERS.id, USERS.full_name, USERS.email
            ORDER BY activity_count DESC, USERS.full_name ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getGemKeywordTenderActivityCountsByActor: ${error}`);
            return [];
        });
}

/** Stage-change activity rows in a calendar date range (by activity created_on). */
export async function getGemKeywordTenderStageChangeActivities({ from, to }) {
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
                GEM_KEYWORD_TENDER_ACTIVITIES.id,
                GEM_KEYWORD_TENDER_ACTIVITIES.gem_keyword_tender_id,
                GEM_KEYWORD_TENDER_ACTIVITIES.activity,
                GEM_KEYWORD_TENDER_ACTIVITIES.created_on
            FROM GEM_KEYWORD_TENDER_ACTIVITIES
            WHERE GEM_KEYWORD_TENDER_ACTIVITIES.activity LIKE ${"Changed stage from %"}
              AND GEM_KEYWORD_TENDER_ACTIVITIES.created_on >= ${startDateTime}
              AND GEM_KEYWORD_TENDER_ACTIVITIES.created_on <= ${endDateTime}
            ORDER BY GEM_KEYWORD_TENDER_ACTIVITIES.created_on ASC, GEM_KEYWORD_TENDER_ACTIVITIES.id ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getGemKeywordTenderStageChangeActivities: ${error}`);
            return [];
        });
}
