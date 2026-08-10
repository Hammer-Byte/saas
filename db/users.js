import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createUser({ full_name, email }) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO USERS ${sql({ full_name, email }, "full_name", "email")}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createUser: ${error}`);
            throw error;
        });
}

export async function updateUserById({ id, full_name, email }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE USERS
            SET
                full_name = ${full_name},
                email = ${email}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateUserById: ${error}`);
        throw error;
    });
}

export async function deleteUserById({ id }) {
    await executeSQLQuery((sql) => sql`DELETE FROM USERS WHERE id = ${id}`).catch((error) => {
        logger.error(`deleteUserById: ${error}`);
        throw error;
    });
}

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

export async function getAllUsers() {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM USERS
            ORDER BY id ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllUsers: ${error}`);
            return [];
        });
}
