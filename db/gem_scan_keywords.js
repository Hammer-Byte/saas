import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createGemScanKeyword({
    keyword,
    exact_search = false,
    tender_category_id,
}) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO GEM_SCAN_KEYWORDS ${sql(
                {
                    keyword,
                    exact_search: exact_search ? 1 : 0,
                    tender_category_id: Number(tender_category_id),
                },
                "keyword",
                "exact_search",
                "tender_category_id",
            )}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createGemScanKeyword: ${error}`);
        });
}

export async function updateGemScanKeywordById({
    id,
    keyword,
    exact_search,
    tender_category_id,
}) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE GEM_SCAN_KEYWORDS
            SET
                keyword = ${keyword},
                exact_search = ${exact_search ? 1 : 0},
                tender_category_id = ${Number(tender_category_id)}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateGemScanKeywordById: ${error}`);
    });
}

export async function deleteGemScanKeywordById({ id }) {
    await executeSQLQuery((sql) => sql`DELETE FROM GEM_SCAN_KEYWORDS WHERE id = ${id}`).catch(
        (error) => {
            logger.error(`deleteGemScanKeywordById: ${error}`);
        },
    );
}

export async function getGemScanKeywordById({ id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                GEM_SCAN_KEYWORDS.*,
                GEM_TENDER_CATEGORIES.name AS tender_category_name
            FROM GEM_SCAN_KEYWORDS
            LEFT JOIN GEM_TENDER_CATEGORIES
                ON GEM_TENDER_CATEGORIES.id = GEM_SCAN_KEYWORDS.tender_category_id
            WHERE GEM_SCAN_KEYWORDS.id = ${id}
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getGemScanKeywordById: ${error}`);
            return null;
        });
}

export async function getGemScanKeywordsByIds({ ids = [] }) {
    const idList = (ids || [])
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id >= 1);
    if (!idList.length) {
        return [];
    }

    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                GEM_SCAN_KEYWORDS.*,
                GEM_TENDER_CATEGORIES.name AS tender_category_name
            FROM GEM_SCAN_KEYWORDS
            LEFT JOIN GEM_TENDER_CATEGORIES
                ON GEM_TENDER_CATEGORIES.id = GEM_SCAN_KEYWORDS.tender_category_id
            WHERE GEM_SCAN_KEYWORDS.id IN ${sql(idList)}
            ORDER BY GEM_SCAN_KEYWORDS.keyword ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getGemScanKeywordsByIds: ${error}`);
            return [];
        });
}

export async function getAllGemScanKeywords() {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                GEM_SCAN_KEYWORDS.*,
                GEM_TENDER_CATEGORIES.name AS tender_category_name
            FROM GEM_SCAN_KEYWORDS
            LEFT JOIN GEM_TENDER_CATEGORIES
                ON GEM_TENDER_CATEGORIES.id = GEM_SCAN_KEYWORDS.tender_category_id
            ORDER BY GEM_SCAN_KEYWORDS.keyword ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllGemScanKeywords: ${error}`);
            return [];
        });
}
