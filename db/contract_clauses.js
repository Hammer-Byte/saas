import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createContractClause({ contract_id, title, view_index }) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO CONTRACT_CLAUSES ${sql(
                { contract_id, title, view_index },
                "contract_id",
                "title",
                "view_index",
            )}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createContractClause: ${error}`);
        });
}

export async function updateContractClauseById({ id, title }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE CONTRACT_CLAUSES
            SET title = ${title}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateContractClauseById: ${error}`);
    });
}

export async function updateContractClauseViewIndexById({ id, view_index }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE CONTRACT_CLAUSES
            SET view_index = ${view_index}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateContractClauseViewIndexById: ${error}`);
    });
}

export async function deleteContractClauseById({ id }) {
    await executeSQLQuery((sql) => sql`DELETE FROM CONTRACT_CLAUSES WHERE id = ${id}`).catch(
        (error) => {
            logger.error(`deleteContractClauseById: ${error}`);
        },
    );
}

export async function getContractClauseById({ id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM CONTRACT_CLAUSES
            WHERE id = ${id}
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getContractClauseById: ${error}`);
            return null;
        });
}

export async function getContractClauseByContractIdAndViewIndex({ contract_id, view_index }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM CONTRACT_CLAUSES
            WHERE contract_id = ${contract_id}
                AND view_index = ${view_index}
            LIMIT 1
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getContractClauseByContractIdAndViewIndex: ${error}`);
            return null;
        });
}

export async function getMaxContractClauseViewIndexByContractId({ contract_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT COALESCE(MAX(view_index), 0) AS max_view_index
            FROM CONTRACT_CLAUSES
            WHERE contract_id = ${contract_id}
        `,
    )
        .then((result) => Number(result?.[0]?.max_view_index ?? 0))
        .catch((error) => {
            logger.error(`getMaxContractClauseViewIndexByContractId: ${error}`);
            return 0;
        });
}

export async function getContractClausesByContractId({ contract_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM CONTRACT_CLAUSES
            WHERE contract_id = ${contract_id}
            ORDER BY view_index ASC, id ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getContractClausesByContractId: ${error}`);
            return [];
        });
}
