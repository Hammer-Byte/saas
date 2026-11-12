import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createGemTenderCategory({ name }) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO GEM_TENDER_CATEGORIES ${sql({ name }, "name")}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createGemTenderCategory: ${error}`);
        });
}

export async function updateGemTenderCategoryById({ id, name }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE GEM_TENDER_CATEGORIES
            SET name = ${name}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateGemTenderCategoryById: ${error}`);
    });
}

export async function deleteGemTenderCategoryById({ id }) {
    await executeSQLQuery((sql) => sql`DELETE FROM GEM_TENDER_CATEGORIES WHERE id = ${id}`).catch(
        (error) => {
            logger.error(`deleteGemTenderCategoryById: ${error}`);
        },
    );
}

export async function getGemTenderCategoryById({ id }) {
    return await executeSQLQuery(
        (sql) => sql`SELECT * FROM GEM_TENDER_CATEGORIES WHERE id = ${id}`,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getGemTenderCategoryById: ${error}`);
            return null;
        });
}

export async function getGemTenderCategoryByName({ name }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM GEM_TENDER_CATEGORIES
            WHERE name = ${name}
            LIMIT 1
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getGemTenderCategoryByName: ${error}`);
            return null;
        });
}

export async function getAllGemTenderCategories() {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM GEM_TENDER_CATEGORIES
            ORDER BY name ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllGemTenderCategories: ${error}`);
            return [];
        });
}
