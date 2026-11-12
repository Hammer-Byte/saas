import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createGemCategoryGroup({ name, tender_category_id = null }) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO GEM_CATEGORY_GROUPS ${sql(
                {
                    name,
                    tender_category_id:
                        tender_category_id != null && Number(tender_category_id) >= 1
                            ? Number(tender_category_id)
                            : null,
                },
                "name",
                "tender_category_id",
            )}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createGemCategoryGroup: ${error}`);
        });
}

export async function updateGemCategoryGroupById({
    id,
    name,
    tender_category_id = undefined,
}) {
    if (tender_category_id === undefined) {
        await executeSQLQuery(
            (sql) => sql`
                UPDATE GEM_CATEGORY_GROUPS
                SET name = ${name}
                WHERE id = ${id}
            `,
        ).catch((error) => {
            logger.error(`updateGemCategoryGroupById: ${error}`);
        });
        return;
    }

    await executeSQLQuery(
        (sql) => sql`
            UPDATE GEM_CATEGORY_GROUPS
            SET
                name = ${name},
                tender_category_id = ${
                    tender_category_id != null && Number(tender_category_id) >= 1
                        ? Number(tender_category_id)
                        : null
                }
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
                GEM_TENDER_CATEGORIES.name AS tender_category_name,
                (
                    SELECT COUNT(*)
                    FROM GEM_CATEGORIES
                    WHERE GEM_CATEGORIES.group_id = GEM_CATEGORY_GROUPS.id
                ) AS category_count
            FROM GEM_CATEGORY_GROUPS
            LEFT JOIN GEM_TENDER_CATEGORIES
                ON GEM_TENDER_CATEGORIES.id = GEM_CATEGORY_GROUPS.tender_category_id
            ORDER BY GEM_CATEGORY_GROUPS.name ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllGemCategoryGroups: ${error}`);
            return [];
        });
}
