import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

const PIPELINE_STATE_ID = 1;

export async function ensureSeleniumPipelineState({
    paused = false,
    max_parallel = 1,
} = {}) {
    const existing = await getSeleniumPipelineState();
    if (existing) {
        return existing;
    }

    await executeSQLQuery(
        (sql) => sql`
            INSERT IGNORE INTO SELENIUM_PIPELINE_STATE ${sql(
                {
                    id: PIPELINE_STATE_ID,
                    paused: paused ? 1 : 0,
                    max_parallel,
                },
                "id",
                "paused",
                "max_parallel",
            )}
        `,
    ).catch((error) => {
        logger.error(`ensureSeleniumPipelineState: ${error}`);
    });

    return await getSeleniumPipelineState();
}

export async function getSeleniumPipelineState() {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM SELENIUM_PIPELINE_STATE
            WHERE id = ${PIPELINE_STATE_ID}
            LIMIT 1
        `,
    )
        .then((result) => {
            if (!result.length) {
                return null;
            }
            const row = result[0];
            return {
                ...row,
                paused: !!Number(row.paused),
                max_parallel: Math.max(1, Number(row.max_parallel) || 1),
            };
        })
        .catch((error) => {
            logger.error(`getSeleniumPipelineState: ${error}`);
            return null;
        });
}

export async function updateSeleniumPipelineState({
    paused = undefined,
    max_parallel = undefined,
}) {
    const current = await ensureSeleniumPipelineState();
    const nextPaused =
        paused !== undefined ? (paused ? 1 : 0) : current?.paused ? 1 : 0;
    const nextMax =
        max_parallel !== undefined
            ? Math.max(1, Number(max_parallel) || 1)
            : current?.max_parallel || 1;

    await executeSQLQuery(
        (sql) => sql`
            UPDATE SELENIUM_PIPELINE_STATE
            SET
                paused = ${nextPaused},
                max_parallel = ${nextMax}
            WHERE id = ${PIPELINE_STATE_ID}
        `,
    ).catch((error) => {
        logger.error(`updateSeleniumPipelineState: ${error}`);
    });

    return await getSeleniumPipelineState();
}
