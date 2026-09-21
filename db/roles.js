import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createRole({ title, active = true }) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO ROLES ${sql({ title, active: !!active }, "title", "active")}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createRole: ${error}`);
        });
}

export async function updateRoleById({ id, title, active }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE ROLES
            SET
                title = ${title},
                active = ${!!active}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateRoleById: ${error}`);
    });
}

export async function deleteRoleById({ id }) {
    await executeSQLQuery((sql) => sql`DELETE FROM ROLE_AUTHORITIES WHERE role_id = ${id}`).catch(
        (error) => {
            logger.error(`deleteRoleById ROLE_AUTHORITIES: ${error}`);
        },
    );
    await executeSQLQuery((sql) => sql`DELETE FROM USER_ROLES WHERE role_id = ${id}`).catch(
        (error) => {
            logger.error(`deleteRoleById USER_ROLES: ${error}`);
        },
    );
    await executeSQLQuery((sql) => sql`DELETE FROM ROLES WHERE id = ${id}`).catch((error) => {
        logger.error(`deleteRoleById: ${error}`);
    });
}

export async function getRoleById({ id }) {
    return await executeSQLQuery((sql) => sql`SELECT * FROM ROLES WHERE id = ${id}`)
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getRoleById: ${error}`);
            return null;
        });
}

export async function getRoleByTitle({ title }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM ROLES
            WHERE title = ${title}
            LIMIT 1
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getRoleByTitle: ${error}`);
            return null;
        });
}

export async function getAllRoles() {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM ROLES
            ORDER BY id ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllRoles: ${error}`);
            return [];
        });
}
