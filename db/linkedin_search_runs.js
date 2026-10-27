import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createLinkedinSearchRun({ page_count, created_by = null }) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO LINKEDIN_SEARCH_RUNS ${sql(
                {
                    page_count,
                    created_by,
                },
                "page_count",
                "created_by",
            )}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createLinkedinSearchRun: ${error}`);
        });
}

export async function updateLinkedinSearchRunById({
    id,
    status,
    error_message = null,
    finished_on = null,
}) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE LINKEDIN_SEARCH_RUNS
            SET
                status = ${status},
                error_message = ${error_message},
                finished_on = ${finished_on}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateLinkedinSearchRunById: ${error}`);
    });
}

export async function createLinkedinSearchRunAccount({
    run_id,
    linkedin_user_id = null,
    user_name,
}) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO LINKEDIN_SEARCH_RUN_ACCOUNTS ${sql(
                {
                    run_id,
                    linkedin_user_id,
                    user_name,
                },
                "run_id",
                "linkedin_user_id",
                "user_name",
            )}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createLinkedinSearchRunAccount: ${error}`);
        });
}

export async function updateLinkedinSearchRunAccountById({ id, status, sent_count = null }) {
    if (sent_count == null) {
        await executeSQLQuery(
            (sql) => sql`
                UPDATE LINKEDIN_SEARCH_RUN_ACCOUNTS
                SET status = ${status}
                WHERE id = ${id}
            `,
        ).catch((error) => {
            logger.error(`updateLinkedinSearchRunAccountById: ${error}`);
        });
        return;
    }

    await executeSQLQuery(
        (sql) => sql`
            UPDATE LINKEDIN_SEARCH_RUN_ACCOUNTS
            SET
                sent_count = ${sent_count},
                status = ${status}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateLinkedinSearchRunAccountById: ${error}`);
    });
}

export async function createLinkedinSearchRunDesignation({ run_id, designation_name }) {
    await executeSQLQuery(
        (sql) => sql`
            INSERT INTO LINKEDIN_SEARCH_RUN_DESIGNATIONS ${sql(
                {
                    run_id,
                    designation_name,
                },
                "run_id",
                "designation_name",
            )}
        `,
    ).catch((error) => {
        logger.error(`createLinkedinSearchRunDesignation: ${error}`);
    });
}

export async function getLinkedinSearchRunById({ id }) {
    return await executeSQLQuery((sql) => sql`SELECT * FROM LINKEDIN_SEARCH_RUNS WHERE id = ${id}`)
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getLinkedinSearchRunById: ${error}`);
            return null;
        });
}

export async function getAllLinkedinSearchRuns() {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM LINKEDIN_SEARCH_RUNS
            ORDER BY id DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllLinkedinSearchRuns: ${error}`);
            return [];
        });
}

export async function getLinkedinSearchRunAccountsByRunId({ run_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM LINKEDIN_SEARCH_RUN_ACCOUNTS
            WHERE run_id = ${run_id}
            ORDER BY id ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getLinkedinSearchRunAccountsByRunId: ${error}`);
            return [];
        });
}

export async function getLinkedinSearchRunDesignationsByRunId({ run_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM LINKEDIN_SEARCH_RUN_DESIGNATIONS
            WHERE run_id = ${run_id}
            ORDER BY id ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getLinkedinSearchRunDesignationsByRunId: ${error}`);
            return [];
        });
}

export async function getAllLinkedinSearchRunAccounts() {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM LINKEDIN_SEARCH_RUN_ACCOUNTS
            ORDER BY id ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllLinkedinSearchRunAccounts: ${error}`);
            return [];
        });
}

export async function getAllLinkedinSearchRunDesignations() {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM LINKEDIN_SEARCH_RUN_DESIGNATIONS
            ORDER BY id ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllLinkedinSearchRunDesignations: ${error}`);
            return [];
        });
}
