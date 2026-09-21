import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createUserRole({ user_id, role_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO USER_ROLES ${sql({ user_id, role_id }, "user_id", "role_id")}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createUserRole: ${error}`);
        });
}

export async function deleteUserRoleById({ id }) {
    await executeSQLQuery((sql) => sql`DELETE FROM USER_ROLES WHERE id = ${id}`).catch((error) => {
        logger.error(`deleteUserRoleById: ${error}`);
    });
}

export async function getUserRoleByUserAndRole({ user_id, role_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM USER_ROLES
            WHERE user_id = ${user_id}
              AND role_id = ${role_id}
            LIMIT 1
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getUserRoleByUserAndRole: ${error}`);
            return null;
        });
}

export async function getUserRolesByUserId({ user_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                USER_ROLES.id,
                USER_ROLES.user_id,
                USER_ROLES.role_id,
                ROLES.title AS title,
                ROLES.active AS active
            FROM USER_ROLES
            INNER JOIN ROLES ON ROLES.id = USER_ROLES.role_id
            WHERE USER_ROLES.user_id = ${user_id}
            ORDER BY ROLES.title ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getUserRolesByUserId: ${error}`);
            return [];
        });
}

export async function assignAllRolesToSuperAdmins() {
    await executeSQLQuery(
        (sql) => sql`
            INSERT IGNORE INTO USER_ROLES (user_id, role_id)
            SELECT USERS.id, ROLES.id
            FROM USERS
            CROSS JOIN ROLES
            WHERE USERS.super_admin = TRUE
        `,
    ).catch((error) => {
        logger.error(`assignAllRolesToSuperAdmins: ${error}`);
    });
}
