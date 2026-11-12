import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createGemTenderScanRun({
    keyword_count = 0,
    created_by = null,
    scan_type = "advance_search",
}) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO GEM_TENDER_SCAN_RUNS ${sql(
                {
                    keyword_count,
                    created_by,
                    scan_type: String(scan_type || "advance_search"),
                },
                "keyword_count",
                "created_by",
                "scan_type",
            )}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createGemTenderScanRun: ${error}`);
        });
}

export async function updateGemTenderScanRunById({
    id,
    status = undefined,
    tender_count = undefined,
    error_message = undefined,
    finished_on = undefined,
}) {
    const existingRun = await getGemTenderScanRunById({ id });
    if (!existingRun) {
        return;
    }

    const next = {
        status: status !== undefined ? status : existingRun.status,
        tender_count:
            tender_count !== undefined ? tender_count : existingRun.tender_count,
        error_message:
            error_message !== undefined ? error_message : existingRun.error_message,
        finished_on:
            finished_on !== undefined ? finished_on : existingRun.finished_on,
    };

    await executeSQLQuery(
        (sql) => sql`
            UPDATE GEM_TENDER_SCAN_RUNS
            SET
                status = ${next.status},
                tender_count = ${next.tender_count},
                error_message = ${next.error_message},
                finished_on = ${next.finished_on}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateGemTenderScanRunById: ${error}`);
    });
}

export async function recoverStaleGemTenderScanRuns({ finished_on }) {
    const message = "Interrupted by server restart";
    await executeSQLQuery(
        (sql) => sql`
            UPDATE GEM_TENDER_SCAN_RUNS
            SET
                status = 'failed',
                error_message = ${message},
                finished_on = ${finished_on}
            WHERE status = 'running'
        `,
    ).catch((error) => {
        logger.error(`recoverStaleGemTenderScanRuns: ${error}`);
    });
}

export async function getGemTenderScanRunById({ id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                GEM_TENDER_SCAN_RUNS.*,
                USERS.full_name AS created_by_name,
                USERS.email AS created_by_email
            FROM GEM_TENDER_SCAN_RUNS
            LEFT JOIN USERS ON USERS.id = GEM_TENDER_SCAN_RUNS.created_by
            WHERE GEM_TENDER_SCAN_RUNS.id = ${id}
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getGemTenderScanRunById: ${error}`);
            return null;
        });
}
