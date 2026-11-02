import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createContentPublishRun({
    media_id,
    automation_user_id,
    user_name,
    facebook_caption = null,
    instagram_caption = null,
    instagram_hashtags = null,
    youtube_title = null,
    youtube_description = null,
    linkedin_caption = null,
    created_by = null,
}) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO CONTENT_PUBLISH_RUNS ${sql(
                {
                    media_id,
                    automation_user_id,
                    user_name,
                    facebook_caption,
                    instagram_caption,
                    instagram_hashtags,
                    youtube_title,
                    youtube_description,
                    linkedin_caption,
                    created_by,
                },
                "media_id",
                "automation_user_id",
                "user_name",
                "facebook_caption",
                "instagram_caption",
                "instagram_hashtags",
                "youtube_title",
                "youtube_description",
                "linkedin_caption",
                "created_by",
            )}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createContentPublishRun: ${error}`);
        });
}

export async function updateContentPublishRunById({
    id,
    status,
    error_message = null,
    finished_on = null,
}) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE CONTENT_PUBLISH_RUNS
            SET
                status = ${status},
                error_message = ${error_message},
                finished_on = ${finished_on}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateContentPublishRunById: ${error}`);
    });
}

export async function createContentPublishRunTarget({ run_id, platform }) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO CONTENT_PUBLISH_RUN_TARGETS ${sql(
                {
                    run_id,
                    platform,
                },
                "run_id",
                "platform",
            )}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createContentPublishRunTarget: ${error}`);
        });
}

export async function updateContentPublishRunTargetById({
    id,
    status,
    error_message = null,
}) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE CONTENT_PUBLISH_RUN_TARGETS
            SET
                status = ${status},
                error_message = ${error_message}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateContentPublishRunTargetById: ${error}`);
    });
}

export async function getContentPublishRunById({ id }) {
    return await executeSQLQuery(
        (sql) => sql`SELECT * FROM CONTENT_PUBLISH_RUNS WHERE id = ${id}`,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getContentPublishRunById: ${error}`);
            return null;
        });
}

export async function getContentPublishRunTargetsByRunId({ run_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM CONTENT_PUBLISH_RUN_TARGETS
            WHERE run_id = ${run_id}
            ORDER BY id ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getContentPublishRunTargetsByRunId: ${error}`);
            return [];
        });
}

export async function getAllContentPublishRuns() {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM CONTENT_PUBLISH_RUNS
            ORDER BY id DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllContentPublishRuns: ${error}`);
            return [];
        });
}

export async function getAllContentPublishRunTargets() {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM CONTENT_PUBLISH_RUN_TARGETS
            ORDER BY id ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllContentPublishRunTargets: ${error}`);
            return [];
        });
}
