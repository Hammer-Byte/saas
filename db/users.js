import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createUser({
    full_name,
    email,
    personal_email = null,
    login_method = "otp",
    password_hash = null,
    hourly_rate = null,
}) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO USERS ${sql(
                {
                    full_name,
                    email,
                    personal_email,
                    login_method,
                    password_hash,
                    hourly_rate,
                },
                "full_name",
                "email",
                "personal_email",
                "login_method",
                "password_hash",
                "hourly_rate",
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
    personal_email = null,
    login_method,
    password_hash = null,
    hourly_rate = null,
    update_password = false,
}) {
    if (update_password) {
        await executeSQLQuery(
            (sql) => sql`
                UPDATE USERS
                SET
                    full_name = ${full_name},
                    email = ${email},
                    personal_email = ${personal_email},
                    login_method = ${login_method},
                    password_hash = ${password_hash},
                    hourly_rate = ${hourly_rate}
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
                personal_email = ${personal_email},
                login_method = ${login_method},
                hourly_rate = ${hourly_rate}
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

export async function updateUserLoginActiveById({ id, login_active }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE USERS
            SET login_active = ${login_active}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateUserLoginActiveById: ${error}`);
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
                personal_email,
                login_method,
                hourly_rate,
                login_active,
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
                personal_email,
                login_method,
                hourly_rate,
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

export async function getAllAdminUsers() {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT DISTINCT
                USERS.id,
                USERS.full_name,
                USERS.email,
                USERS.personal_email,
                USERS.login_method,
                USERS.hourly_rate,
                USERS.super_admin,
                USERS.created_on,
                USERS.updated_at
            FROM USERS
            LEFT JOIN USER_ROLES ON USER_ROLES.user_id = USERS.id
            LEFT JOIN ROLES ON ROLES.id = USER_ROLES.role_id
            WHERE USERS.super_admin = TRUE
               OR ROLES.title = 'ADMIN'
            ORDER BY USERS.id ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllAdminUsers: ${error}`);
            return [];
        });
}
