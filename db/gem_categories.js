import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createGemCategory({ group_id, name }) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO GEM_CATEGORIES ${sql(
                {
                    group_id,
                    name,
                },
                "group_id",
                "name",
            )}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createGemCategory: ${error}`);
        });
}

export async function updateGemCategoryById({ id, group_id, name }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE GEM_CATEGORIES
            SET
                group_id = ${group_id},
                name = ${name}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateGemCategoryById: ${error}`);
    });
}

export async function deleteGemCategoryById({ id }) {
    await executeSQLQuery((sql) => sql`DELETE FROM GEM_CATEGORIES WHERE id = ${id}`).catch(
        (error) => {
            logger.error(`deleteGemCategoryById: ${error}`);
        },
    );
}

export async function getGemCategoryById({ id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                GEM_CATEGORIES.*,
                GEM_CATEGORY_GROUPS.name AS group_name
            FROM GEM_CATEGORIES
            INNER JOIN GEM_CATEGORY_GROUPS
                ON GEM_CATEGORY_GROUPS.id = GEM_CATEGORIES.group_id
            WHERE GEM_CATEGORIES.id = ${id}
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getGemCategoryById: ${error}`);
            return null;
        });
}

export async function getGemCategoryByGroupIdAndName({ group_id, name }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM GEM_CATEGORIES
            WHERE group_id = ${group_id}
              AND name = ${name}
            LIMIT 1
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getGemCategoryByGroupIdAndName: ${error}`);
            return null;
        });
}

export async function getGemCategoriesByGroupId({ group_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                GEM_CATEGORIES.*,
                GEM_CATEGORY_GROUPS.name AS group_name
            FROM GEM_CATEGORIES
            INNER JOIN GEM_CATEGORY_GROUPS
                ON GEM_CATEGORY_GROUPS.id = GEM_CATEGORIES.group_id
            WHERE GEM_CATEGORIES.group_id = ${group_id}
            ORDER BY GEM_CATEGORIES.name ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getGemCategoriesByGroupId: ${error}`);
            return [];
        });
}

export async function getAllGemCategories() {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                GEM_CATEGORIES.*,
                GEM_CATEGORY_GROUPS.name AS group_name
            FROM GEM_CATEGORIES
            INNER JOIN GEM_CATEGORY_GROUPS
                ON GEM_CATEGORY_GROUPS.id = GEM_CATEGORIES.group_id
            ORDER BY GEM_CATEGORY_GROUPS.name ASC, GEM_CATEGORIES.name ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllGemCategories: ${error}`);
            return [];
        });
}

export async function getGemCategoriesByIds({ ids }) {
    const categoryIds = [
        ...new Set(
            (Array.isArray(ids) ? ids : [])
                .map((id) => Number(id))
                .filter((id) => id >= 1),
        ),
    ];
    if (!categoryIds.length) {
        return [];
    }

    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                GEM_CATEGORIES.*,
                GEM_CATEGORY_GROUPS.name AS group_name,
                GEM_CATEGORY_GROUPS.tender_category_id AS tender_category_id
            FROM GEM_CATEGORIES
            INNER JOIN GEM_CATEGORY_GROUPS
                ON GEM_CATEGORY_GROUPS.id = GEM_CATEGORIES.group_id
            WHERE GEM_CATEGORIES.id IN ${sql(categoryIds)}
            ORDER BY GEM_CATEGORY_GROUPS.name ASC, GEM_CATEGORIES.name ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getGemCategoriesByIds: ${error}`);
            return [];
        });
}
