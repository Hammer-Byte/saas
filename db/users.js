import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function getUserByEmail({ email }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM USERS
            WHERE email = ${email}
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getUserByEmail: ${error}`);
            return null;
        });
}

export async function getUserById({ id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM USERS
            WHERE id = ${id}
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getUserById: ${error}`);
            return null;
        });
}
