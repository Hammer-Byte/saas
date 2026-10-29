import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createLinkedinMessageRun({ per_account_limit, created_by = null }) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO LINKEDIN_MESSAGE_RUNS ${sql(
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
            logger.error(`createLinkedinMessageRun: ${error}`);
        });
}

export async function updateLinkedinMessageRunById({
    id,
    status,
    error_message = null,
    finished_on = null,
}) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE LINKEDIN_MESSAGE_RUNS
            SET
                status = ${status},
                error_message = ${error_message},
                finished_on = ${finished_on}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateLinkedinMessageRunById: ${error}`);
    });
}

export async function createLinkedinMessageRunAccount({
    run_id,
    linkedin_user_id = null,
    user_name,
}) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO LINKEDIN_MESSAGE_RUN_ACCOUNTS ${sql(
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
            logger.error(`createLinkedinMessageRunAccount: ${error}`);
        });
}

export async function updateLinkedinMessageRunAccountById({ id, status, sent_count = null }) {
    if (sent_count == null) {
        await executeSQLQuery(
            (sql) => sql`
                UPDATE LINKEDIN_MESSAGE_RUN_ACCOUNTS
                SET status = ${status}
                WHERE id = ${id}
            `,
        ).catch((error) => {
            logger.error(`updateLinkedinMessageRunAccountById: ${error}`);
        });
        return;
    }

    await executeSQLQuery(
        (sql) => sql`
            UPDATE LINKEDIN_MESSAGE_RUN_ACCOUNTS
            SET
                sent_count = ${sent_count},
                status = ${status}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateLinkedinMessageRunAccountById: ${error}`);
    });
}

export async function createLinkedinMessageRunDesignation({ run_id, designation_name }) {
    await executeSQLQuery(
        (sql) => sql`
            INSERT INTO LINKEDIN_MESSAGE_RUN_DESIGNATIONS ${sql(
                {
                    run_id,
                    designation_name,
                },
                "run_id",
                "designation_name",
            )}
        `,
    ).catch((error) => {
        logger.error(`createLinkedinMessageRunDesignation: ${error}`);
    });
}

export async function getLinkedinMessageRunById({ id }) {
    return await executeSQLQuery((sql) => sql`SELECT * FROM LINKEDIN_MESSAGE_RUNS WHERE id = ${id}`)
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getLinkedinMessageRunById: ${error}`);
            return null;
        });
}

export async function getAllLinkedinMessageRuns() {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM LINKEDIN_MESSAGE_RUNS
            ORDER BY id DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllLinkedinMessageRuns: ${error}`);
            return [];
        });
}

export async function getLinkedinMessageRunAccountsByRunId({ run_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM LINKEDIN_MESSAGE_RUN_ACCOUNTS
            WHERE run_id = ${run_id}
            ORDER BY id ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getLinkedinMessageRunAccountsByRunId: ${error}`);
            return [];
        });
}

export async function getLinkedinMessageRunDesignationsByRunId({ run_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM LINKEDIN_MESSAGE_RUN_DESIGNATIONS
            WHERE run_id = ${run_id}
            ORDER BY id ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getLinkedinMessageRunDesignationsByRunId: ${error}`);
            return [];
        });
}

export async function getAllLinkedinMessageRunAccounts() {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM LINKEDIN_MESSAGE_RUN_ACCOUNTS
            ORDER BY id ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllLinkedinMessageRunAccounts: ${error}`);
            return [];
        });
}

export async function getAllLinkedinMessageRunDesignations() {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM LINKEDIN_MESSAGE_RUN_DESIGNATIONS
            ORDER BY id ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllLinkedinMessageRunDesignations: ${error}`);
            return [];
        });
}
