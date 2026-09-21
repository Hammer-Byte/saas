import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createRoleAuthority({ role_id, authority_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO ROLE_AUTHORITIES ${sql({ role_id, authority_id }, "role_id", "authority_id")}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createRoleAuthority: ${error}`);
        });
}

export async function deleteRoleAuthorityById({ id }) {
    await executeSQLQuery((sql) => sql`DELETE FROM ROLE_AUTHORITIES WHERE id = ${id}`).catch(
        (error) => {
            logger.error(`deleteRoleAuthorityById: ${error}`);
        },
    );
}

export async function getRoleAuthorityByRoleAndAuthority({ role_id, authority_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM ROLE_AUTHORITIES
            WHERE role_id = ${role_id}
              AND authority_id = ${authority_id}
            LIMIT 1
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getRoleAuthorityByRoleAndAuthority: ${error}`);
            return null;
        });
}

export async function getRoleAuthoritiesByRoleId({ role_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                ROLE_AUTHORITIES.id,
                ROLE_AUTHORITIES.role_id,
                ROLE_AUTHORITIES.authority_id,
                AUTHORITIES.title AS authority_title,
                AUTHORITIES.description AS authority_description
            FROM ROLE_AUTHORITIES
            INNER JOIN AUTHORITIES ON AUTHORITIES.id = ROLE_AUTHORITIES.authority_id
            WHERE ROLE_AUTHORITIES.role_id = ${role_id}
            ORDER BY AUTHORITIES.title ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getRoleAuthoritiesByRoleId: ${error}`);
            return [];
        });
}

export async function getAuthorityTitlesByRoleIds({ roleIds }) {
    const ids = (roleIds || []).map(Number).filter((id) => Number.isInteger(id) && id > 0);
    if (!ids.length) {
        return [];
    }

    return await executeSQLQuery(
        (sql) => sql`
            SELECT DISTINCT AUTHORITIES.title AS title
            FROM ROLE_AUTHORITIES
            INNER JOIN AUTHORITIES ON AUTHORITIES.id = ROLE_AUTHORITIES.authority_id
            WHERE ROLE_AUTHORITIES.role_id IN ${sql(ids)}
            ORDER BY AUTHORITIES.title ASC
        `,
    )
        .then((result) => Array.from(result ?? []).map((row) => row.title))
        .catch((error) => {
            logger.error(`getAuthorityTitlesByRoleIds: ${error}`);
            return [];
        });
}
