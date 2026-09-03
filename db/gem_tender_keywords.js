import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createGemTenderKeyword({ keyword }) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO GEM_TENDER_KEYWORDS ${sql({ keyword }, "keyword")}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createGemTenderKeyword: ${error}`);
        });
}

export async function deleteGemTenderKeywordById({ id }) {
    await executeSQLQuery((sql) => sql`DELETE FROM GEM_TENDER_KEYWORDS WHERE id = ${id}`).catch(
        (error) => {
            logger.error(`deleteGemTenderKeywordById: ${error}`);
        },
    );
}

export async function getGemTenderKeywordById({ id }) {
    return await executeSQLQuery((sql) => sql`SELECT * FROM GEM_TENDER_KEYWORDS WHERE id = ${id}`)
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getGemTenderKeywordById: ${error}`);
            return null;
        });
}

export async function getGemTenderKeywordByKeyword({ keyword }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM GEM_TENDER_KEYWORDS
            WHERE keyword = ${keyword}
            LIMIT 1
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getGemTenderKeywordByKeyword: ${error}`);
            return null;
        });
}

export async function getAllGemTenderKeywords() {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM GEM_TENDER_KEYWORDS
            ORDER BY id DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllGemTenderKeywords: ${error}`);
            return [];
        });
}
