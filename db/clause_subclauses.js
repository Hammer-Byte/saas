import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createClauseSubclause({ clause_id, body, view_index }) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO CLAUSE_SUBCLAUSES ${sql(
                { clause_id, body, view_index },
                "clause_id",
                "body",
                "view_index",
            )}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createClauseSubclause: ${error}`);
        });
}

export async function updateClauseSubclauseById({ id, body }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE CLAUSE_SUBCLAUSES
            SET body = ${body}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateClauseSubclauseById: ${error}`);
    });
}

export async function updateClauseSubclauseViewIndexById({ id, view_index }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE CLAUSE_SUBCLAUSES
            SET view_index = ${view_index}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateClauseSubclauseViewIndexById: ${error}`);
    });
}

export async function deleteClauseSubclauseById({ id }) {
    await executeSQLQuery((sql) => sql`DELETE FROM CLAUSE_SUBCLAUSES WHERE id = ${id}`).catch(
        (error) => {
            logger.error(`deleteClauseSubclauseById: ${error}`);
        },
    );
}

export async function getClauseSubclauseById({ id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM CLAUSE_SUBCLAUSES
            WHERE id = ${id}
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getClauseSubclauseById: ${error}`);
            return null;
        });
}

export async function getClauseSubclauseByClauseIdAndViewIndex({ clause_id, view_index }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM CLAUSE_SUBCLAUSES
            WHERE clause_id = ${clause_id}
                AND view_index = ${view_index}
            LIMIT 1
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getClauseSubclauseByClauseIdAndViewIndex: ${error}`);
            return null;
        });
}

export async function getMaxClauseSubclauseViewIndexByClauseId({ clause_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT COALESCE(MAX(view_index), 0) AS max_view_index
            FROM CLAUSE_SUBCLAUSES
            WHERE clause_id = ${clause_id}
        `,
    )
        .then((result) => Number(result?.[0]?.max_view_index ?? 0))
        .catch((error) => {
            logger.error(`getMaxClauseSubclauseViewIndexByClauseId: ${error}`);
            return 0;
        });
}

export async function getClauseSubclausesByClauseId({ clause_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM CLAUSE_SUBCLAUSES
            WHERE clause_id = ${clause_id}
            ORDER BY view_index ASC, id ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getClauseSubclausesByClauseId: ${error}`);
            return [];
        });
}

export async function getClauseSubclausesByContractId({ contract_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT CLAUSE_SUBCLAUSES.*
            FROM CLAUSE_SUBCLAUSES
            INNER JOIN CONTRACT_CLAUSES ON CONTRACT_CLAUSES.id = CLAUSE_SUBCLAUSES.clause_id
            WHERE CONTRACT_CLAUSES.contract_id = ${contract_id}
            ORDER BY CLAUSE_SUBCLAUSES.clause_id ASC, CLAUSE_SUBCLAUSES.view_index ASC, CLAUSE_SUBCLAUSES.id ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getClauseSubclausesByContractId: ${error}`);
            return [];
        });
}
