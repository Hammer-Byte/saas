import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createLinkedinGrowRun({ per_account_limit, created_by = null }) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO LINKEDIN_GROW_RUNS ${sql(
                {
                    per_account_limit,
                    created_by,
                },
                "per_account_limit",
                "created_by",
            )}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createLinkedinGrowRun: ${error}`);
        });
}

export async function updateLinkedinGrowRunById({
    id,
    status,
    error_message = null,
    finished_on = null,
}) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE LINKEDIN_GROW_RUNS
            SET
                status = ${status},
                error_message = ${error_message},
                finished_on = ${finished_on}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateLinkedinGrowRunById: ${error}`);
    });
}

export async function createLinkedinGrowRunAccount({
    run_id,
    linkedin_user_id = null,
    user_name,
}) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO LINKEDIN_GROW_RUN_ACCOUNTS ${sql(
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
            logger.error(`createLinkedinGrowRunAccount: ${error}`);
        });
}

export async function updateLinkedinGrowRunAccountById({ id, status, sent_count = null }) {
    if (sent_count == null) {
        await executeSQLQuery(
            (sql) => sql`
                UPDATE LINKEDIN_GROW_RUN_ACCOUNTS
                SET status = ${status}
                WHERE id = ${id}
            `,
        ).catch((error) => {
            logger.error(`updateLinkedinGrowRunAccountById: ${error}`);
        });
        return;
    }

    await executeSQLQuery(
        (sql) => sql`
            UPDATE LINKEDIN_GROW_RUN_ACCOUNTS
            SET
                sent_count = ${sent_count},
                status = ${status}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateLinkedinGrowRunAccountById: ${error}`);
    });
}

export async function createLinkedinGrowRunDesignation({ run_id, designation_name }) {
    await executeSQLQuery(
        (sql) => sql`
            INSERT INTO LINKEDIN_GROW_RUN_DESIGNATIONS ${sql(
                {
                    run_id,
                    designation_name,
                },
                "run_id",
                "designation_name",
            )}
        `,
    ).catch((error) => {
        logger.error(`createLinkedinGrowRunDesignation: ${error}`);
    });
}

export async function getLinkedinGrowRunById({ id }) {
    return await executeSQLQuery((sql) => sql`SELECT * FROM LINKEDIN_GROW_RUNS WHERE id = ${id}`)
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getLinkedinGrowRunById: ${error}`);
            return null;
        });
}

export async function getAllLinkedinGrowRuns() {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM LINKEDIN_GROW_RUNS
            ORDER BY id DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllLinkedinGrowRuns: ${error}`);
            return [];
        });
}

export async function getLinkedinGrowRunAccountsByRunId({ run_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM LINKEDIN_GROW_RUN_ACCOUNTS
            WHERE run_id = ${run_id}
            ORDER BY id ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getLinkedinGrowRunAccountsByRunId: ${error}`);
            return [];
        });
}

export async function getLinkedinGrowRunDesignationsByRunId({ run_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM LINKEDIN_GROW_RUN_DESIGNATIONS
            WHERE run_id = ${run_id}
            ORDER BY id ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getLinkedinGrowRunDesignationsByRunId: ${error}`);
            return [];
        });
}

export async function getAllLinkedinGrowRunAccounts() {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM LINKEDIN_GROW_RUN_ACCOUNTS
            ORDER BY id ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllLinkedinGrowRunAccounts: ${error}`);
            return [];
        });
}

export async function getAllLinkedinGrowRunDesignations() {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM LINKEDIN_GROW_RUN_DESIGNATIONS
            ORDER BY id ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllLinkedinGrowRunDesignations: ${error}`);
            return [];
        });
}
