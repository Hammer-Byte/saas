import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";
import { getIstDateTime } from "../libs/date.js";

export async function createServer({ tag }) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO SERVERS ${sql({ tag }, "tag")}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createServer: ${error}`);
        });
}

export async function getServerById({ id }) {
    return await executeSQLQuery((sql) => sql`SELECT * FROM SERVERS WHERE id = ${id}`)
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getServerById: ${error}`);
            return null;
        });
}

export async function getServerByTag({ tag }) {
    return await executeSQLQuery((sql) => sql`SELECT * FROM SERVERS WHERE tag = ${tag}`)
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getServerByTag: ${error}`);
            return null;
        });
}

export async function getAllServers() {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                SERVERS.*,
                CUSTOMER_PROJECTS.title AS project_title
            FROM SERVERS
            LEFT JOIN CUSTOMER_PROJECTS ON CUSTOMER_PROJECTS.id = SERVERS.project_id
            ORDER BY SERVERS.last_seen_at DESC, SERVERS.created_on DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllServers: ${error}`);
            return [];
        });
}

export async function updateServerLastSeenById({ id, agent_version = null }) {
    const last_seen_at = getIstDateTime();

    if (agent_version == null) {
        await executeSQLQuery(
            (sql) => sql`
                UPDATE SERVERS
                SET last_seen_at = ${last_seen_at}
                WHERE id = ${id}
            `,
        ).catch((error) => {
            logger.error(`updateServerLastSeenById: ${error}`);
        });
        return;
    }

    await executeSQLQuery(
        (sql) => sql`
            UPDATE SERVERS
            SET
                last_seen_at = ${last_seen_at},
                agent_version = ${agent_version}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateServerLastSeenById: ${error}`);
    });
}

export async function updateServerNameById({ id, name = null }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE SERVERS
            SET name = ${name}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateServerNameById: ${error}`);
    });
}

export async function updateServerProjectById({ id, project_id = null }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE SERVERS
            SET project_id = ${project_id}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateServerProjectById: ${error}`);
    });
}
