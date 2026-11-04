import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createUser({
    full_name,
    email,
    login_method = "otp",
    password_hash = null,
}) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO USERS ${sql(
                {
                    full_name,
                    email,
                    login_method,
                    password_hash,
                },
                "full_name",
                "email",
                "login_method",
                "password_hash",
            )}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createUser: ${error}`);
        });
}

export async function updateUserById({
    id,
    full_name,
    email,
    login_method,
    password_hash = null,
    update_password = false,
}) {
    if (update_password) {
        await executeSQLQuery(
            (sql) => sql`
                UPDATE USERS
                SET
                    full_name = ${full_name},
                    email = ${email},
                    login_method = ${login_method},
                    password_hash = ${password_hash}
                WHERE id = ${id}
            `,
        ).catch((error) => {
            logger.error(`updateUserById: ${error}`);
        });
        return;
    }

    await executeSQLQuery(
        (sql) => sql`
            UPDATE USERS
            SET
                full_name = ${full_name},
                email = ${email},
                login_method = ${login_method}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateUserById: ${error}`);
    });
}

export async function deleteUserById({ id }) {
    await executeSQLQuery((sql) => sql`DELETE FROM USERS WHERE id = ${id}`).catch((error) => {
        logger.error(`deleteUserById: ${error}`);
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
            SELECT
                id,
                full_name,
                email,
                login_method,
                super_admin,
                created_on,
                updated_at
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

export async function getAllSuperAdminUsers() {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                id,
                full_name,
                email,
                login_method,
                super_admin,
                created_on,
                updated_at
            FROM USERS
            WHERE super_admin = TRUE
            ORDER BY id ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllSuperAdminUsers: ${error}`);
            return [];
        });
}
