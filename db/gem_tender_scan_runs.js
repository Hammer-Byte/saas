import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createGemTenderScanRun({
    keyword_count = 0,
    created_by = null,
}) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO GEM_TENDER_SCAN_RUNS ${sql(
                {
                    keyword_count,
                    created_by,
                },
                "keyword_count",
                "created_by",
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
    status,
    tender_count,
    error_message = null,
    finished_on = null,
}) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE GEM_TENDER_SCAN_RUNS
            SET
                status = ${status},
                tender_count = ${tender_count},
                error_message = ${error_message},
                finished_on = ${finished_on}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateGemTenderScanRunById: ${error}`);
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

export async function getAllGemTenderScanRuns() {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                GEM_TENDER_SCAN_RUNS.*,
                USERS.full_name AS created_by_name,
                USERS.email AS created_by_email
            FROM GEM_TENDER_SCAN_RUNS
            LEFT JOIN USERS ON USERS.id = GEM_TENDER_SCAN_RUNS.created_by
            ORDER BY GEM_TENDER_SCAN_RUNS.id DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllGemTenderScanRuns: ${error}`);
            return [];
        });
}
