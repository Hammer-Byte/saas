import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

function serializePayload(payload) {
    if (payload == null) {
        return null;
    }
    if (typeof payload === "string") {
        return payload;
    }
    return JSON.stringify(payload);
}

function parsePayload(row) {
    if (!row) {
        return null;
    }
    let payload = row.payload;
    if (typeof payload === "string") {
        try {
            payload = JSON.parse(payload);
        } catch {
            payload = {};
        }
    } else if (payload == null) {
        payload = {};
    }
    return { ...row, payload };
}

export async function createSeleniumJob({
    type,
    source,
    title,
    payload = null,
    created_by = null,
    domain_run_id = null,
    status = "queued",
}) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO SELENIUM_JOBS ${sql(
                {
                    type,
                    source,
                    title,
                    status,
                    payload: serializePayload(payload),
                    created_by,
                    domain_run_id,
                },
                "type",
                "source",
                "title",
                "status",
                "payload",
                "created_by",
                "domain_run_id",
            )}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createSeleniumJob: ${error}`);
        });
}

export async function getSeleniumJobById({ id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM SELENIUM_JOBS
            WHERE id = ${id}
            LIMIT 1
        `,
    )
        .then((result) => (result.length ? parsePayload(result[0]) : null))
        .catch((error) => {
            logger.error(`getSeleniumJobById: ${error}`);
            return null;
        });
}

export async function updateSeleniumJobById({
    id,
    status,
    result_summary = undefined,
    error_message = undefined,
    started_on = undefined,
    finished_on = undefined,
}) {
    const job = await getSeleniumJobById({ id });
    if (!job) {
        return;
    }

    const next = {
        status: status ?? job.status,
        result_summary:
            result_summary !== undefined ? result_summary : job.result_summary,
        error_message:
            error_message !== undefined ? error_message : job.error_message,
        started_on: started_on !== undefined ? started_on : job.started_on,
        finished_on: finished_on !== undefined ? finished_on : job.finished_on,
    };

    await executeSQLQuery(
        (sql) => sql`
            UPDATE SELENIUM_JOBS
            SET
                status = ${next.status},
                result_summary = ${next.result_summary},
                error_message = ${next.error_message},
                started_on = ${next.started_on},
                finished_on = ${next.finished_on}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateSeleniumJobById: ${error}`);
    });
}

export async function claimNextQueuedSeleniumJob({ started_on = null } = {}) {
    const next = await executeSQLQuery(
        (sql) => sql`
            SELECT id
            FROM SELENIUM_JOBS
            WHERE status = 'queued'
            ORDER BY id ASC
            LIMIT 1
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`claimNextQueuedSeleniumJob select: ${error}`);
            return null;
        });

    if (!next?.id) {
        return null;
    }

    // Compare-and-swap: only one claimant wins if multiple workers race.
    await executeSQLQuery(
        (sql) => sql`
            UPDATE SELENIUM_JOBS
            SET
                status = 'running',
                started_on = COALESCE(${started_on}, started_on)
            WHERE id = ${next.id} AND status = 'queued'
        `,
    ).catch((error) => {
        logger.error(`claimNextQueuedSeleniumJob update: ${error}`);
    });

    const job = await getSeleniumJobById({ id: next.id });
    if (!job || String(job.status) !== "running") {
        return null;
    }
    return job;
}

export async function getSeleniumJobsByCreatedOnRange({
    start,
    end,
    status = null,
    source = null,
}) {
    const statusFilter = status ? String(status).trim().toLowerCase() : null;
    const sourceFilter = source ? String(source).trim().toLowerCase() : null;

    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM SELENIUM_JOBS
            WHERE DATE(created_on) >= ${start}
              AND DATE(created_on) <= ${end}
              AND (${statusFilter} IS NULL OR status = ${statusFilter})
              AND (${sourceFilter} IS NULL OR source = ${sourceFilter})
            ORDER BY id DESC
        `,
    )
        .then((result) => (result || []).map(parsePayload))
        .catch((error) => {
            logger.error(`getSeleniumJobsByCreatedOnRange: ${error}`);
            return [];
        });
}

export async function getSeleniumJobStatusCountsByCreatedOnRange({
    start,
    end,
    source = null,
}) {
    const sourceFilter = source ? String(source).trim().toLowerCase() : null;

    return await executeSQLQuery(
        (sql) => sql`
            SELECT status, COUNT(*) AS count
            FROM SELENIUM_JOBS
            WHERE DATE(created_on) >= ${start}
              AND DATE(created_on) <= ${end}
              AND (${sourceFilter} IS NULL OR source = ${sourceFilter})
            GROUP BY status
        `,
    )
        .then((result) => {
            const counts = {
                queued: 0,
                running: 0,
                completed: 0,
                failed: 0,
                stopped: 0,
                skipped: 0,
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
            logger.error(`getSeleniumJobStatusCountsByCreatedOnRange: ${error}`);
            return {
                queued: 0,
                running: 0,
                completed: 0,
                failed: 0,
                stopped: 0,
                skipped: 0,
            };
        });
}

export async function countRunningSeleniumJobs() {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT COUNT(*) AS count
            FROM SELENIUM_JOBS
            WHERE status = 'running'
        `,
    )
        .then((result) => Number(result?.[0]?.count ?? 0))
        .catch((error) => {
            logger.error(`countRunningSeleniumJobs: ${error}`);
            return 0;
        });
}

export async function recoverStaleSeleniumJobs({ finished_on }) {
    const message = "Interrupted by server restart";
    await executeSQLQuery(
        (sql) => sql`
            UPDATE SELENIUM_JOBS
            SET
                status = 'failed',
                error_message = ${message},
                finished_on = ${finished_on}
            WHERE status = 'running'
        `,
    ).catch((error) => {
        logger.error(`recoverStaleSeleniumJobs: ${error}`);
    });
}
