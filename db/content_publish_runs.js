import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createContentPublishRun({
    media_id,
    media_kind = "image",
    automation_user_id = null,
    user_name,
    instagram_caption = null,
    youtube_title = null,
    youtube_description = null,
    linkedin_caption = null,
    source = "user",
    created_by = null,
    application_id = null,
    application_service_id = null,
    scheduled_by_name = null,
    run_options = null,
    status = "queued",
}) {
    const optionsText =
        run_options == null
            ? null
            : typeof run_options === "string"
                ? run_options
                : JSON.stringify(run_options);

    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO CONTENT_PUBLISH_RUNS ${sql(
                {
                    status,
                    media_id,
                    media_kind,
                    automation_user_id,
                    user_name,
                    instagram_caption,
                    youtube_title,
                    youtube_description,
                    linkedin_caption,
                    source,
                    created_by,
                    application_id,
                    application_service_id,
                    scheduled_by_name,
                    run_options: optionsText,
                },
                "status",
                "media_id",
                "media_kind",
                "automation_user_id",
                "user_name",
                "instagram_caption",
                "youtube_title",
                "youtube_description",
                "linkedin_caption",
                "source",
                "created_by",
                "application_id",
                "application_service_id",
                "scheduled_by_name",
                "run_options",
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
    screenshot_files = null,
}) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE CONTENT_PUBLISH_RUN_TARGETS
            SET
                status = ${status},
                error_message = ${error_message},
                screenshot_files = ${screenshot_files}
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

export async function claimNextQueuedContentPublishRun() {
    const next = await executeSQLQuery(
        (sql) => sql`
            SELECT id
            FROM CONTENT_PUBLISH_RUNS
            WHERE status = 'queued'
            ORDER BY id ASC
            LIMIT 1
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`claimNextQueuedContentPublishRun select: ${error}`);
            return null;
        });

    if (!next?.id) {
        return null;
    }

    await executeSQLQuery(
        (sql) => sql`
            UPDATE CONTENT_PUBLISH_RUNS
            SET status = 'running'
            WHERE id = ${next.id} AND status = 'queued'
        `,
    ).catch((error) => {
        logger.error(`claimNextQueuedContentPublishRun update: ${error}`);
    });

    const run = await getContentPublishRunById({ id: next.id });
    if (!run || String(run.status) !== "running") {
        return null;
    }
    return run;
}

export async function getContentPublishRunStatusCounts() {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT status, COUNT(*) AS count
            FROM CONTENT_PUBLISH_RUNS
            GROUP BY status
        `,
    )
        .then((result) => {
            const counts = {
                queued: 0,
                running: 0,
                completed: 0,
                failed: 0,
            };
            for (const row of result ?? []) {
                const key = String(row.status || "").toLowerCase();
                if (key in counts) {
                    counts[key] = Number(row.count) || 0;
                }
            }
            return counts;
        })
        .catch((error) => {
            logger.error(`getContentPublishRunStatusCounts: ${error}`);
            return { queued: 0, running: 0, completed: 0, failed: 0 };
        });
}

export async function getContentPublishRunByIdForApplication({ id, application_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM CONTENT_PUBLISH_RUNS
            WHERE id = ${id}
              AND application_id = ${application_id}
              AND source = 'application'
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getContentPublishRunByIdForApplication: ${error}`);
            return null;
        });
}

/** After process restart: interrupted `running` rows and application `queued` rows (ephemeral creds lost). */
export async function recoverStaleContentPublishRuns({ finished_on }) {
    const runningMessage = "Interrupted by server restart";
    const applicationQueuedMessage =
        "External run credentials were lost (server restart). Re-submit the publish request.";

    await executeSQLQuery(
        (sql) => sql`
            UPDATE CONTENT_PUBLISH_RUNS
            SET
                status = 'failed',
                error_message = ${runningMessage},
                finished_on = ${finished_on}
            WHERE status = 'running'
        `,
    ).catch((error) => {
        logger.error(`recoverStaleContentPublishRuns running: ${error}`);
    });

    await executeSQLQuery(
        (sql) => sql`
            UPDATE CONTENT_PUBLISH_RUNS
            SET
                status = 'failed',
                error_message = ${applicationQueuedMessage},
                finished_on = ${finished_on}
            WHERE status = 'queued' AND source = 'application'
        `,
    ).catch((error) => {
        logger.error(`recoverStaleContentPublishRuns application queued: ${error}`);
    });
}
