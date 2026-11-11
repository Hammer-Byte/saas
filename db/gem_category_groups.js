import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createGemCategoryGroup({ name }) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO GEM_CATEGORY_GROUPS ${sql({ name }, "name")}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createGemCategoryGroup: ${error}`);
        });
}

export async function updateGemCategoryGroupById({ id, name }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE GEM_CATEGORY_GROUPS
            SET name = ${name}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateGemCategoryGroupById: ${error}`);
    });
}

export async function deleteGemCategoryGroupById({ id }) {
    await executeSQLQuery((sql) => sql`DELETE FROM GEM_CATEGORY_GROUPS WHERE id = ${id}`).catch(
        (error) => {
            logger.error(`deleteGemCategoryGroupById: ${error}`);
        },
    );
}

export async function getGemCategoryGroupById({ id }) {
    return await executeSQLQuery((sql) => sql`SELECT * FROM GEM_CATEGORY_GROUPS WHERE id = ${id}`)
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getGemCategoryGroupById: ${error}`);
            return null;
        });
}

export async function getGemCategoryGroupByName({ name }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM GEM_CATEGORY_GROUPS
            WHERE name = ${name}
            LIMIT 1
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getGemCategoryGroupByName: ${error}`);
            return null;
        });
}

export async function getAllGemCategoryGroups() {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                GEM_CATEGORY_GROUPS.*,
                (
                    SELECT COUNT(*)
                    FROM GEM_CATEGORIES
                    WHERE GEM_CATEGORIES.group_id = GEM_CATEGORY_GROUPS.id
                ) AS category_count
            FROM GEM_CATEGORY_GROUPS
            ORDER BY GEM_CATEGORY_GROUPS.name ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllGemCategoryGroups: ${error}`);
            return [];
        });
}
