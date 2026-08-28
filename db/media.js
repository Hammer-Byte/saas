import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createMedia({ name, file }) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO MEDIA ${sql({ name, file }, "name", "file")}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createMedia: ${error}`);
        });
}

export async function getMediaById({ id }) {
    return await executeSQLQuery((sql) => sql`SELECT * FROM MEDIA WHERE id = ${id}`)
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getMediaById: ${error}`);
            return null;
        });
}

export async function deleteMediaById({ id }) {
    await executeSQLQuery((sql) => sql`DELETE FROM MEDIA WHERE id = ${id}`).catch((error) => {
        logger.error(`deleteMediaById: ${error}`);
    });
}
