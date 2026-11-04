import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createGemKeywordTenderActivity({
    gem_keyword_tender_id,
    user_id,
    activity,
}) {
    await executeSQLQuery(
        (sql) => sql`
            INSERT INTO GEM_KEYWORD_TENDER_ACTIVITIES ${sql(
                {
                    gem_keyword_tender_id,
                    user_id,
                    activity,
                },
                "gem_keyword_tender_id",
                "user_id",
                "activity",
            )}
        `,
    ).catch((error) => {
        logger.error(`createGemKeywordTenderActivity: ${error}`);
    });
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
