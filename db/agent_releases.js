import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function getAllAgentReleases() {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT * FROM AGENT_RELEASES
            ORDER BY component, created_on DESC, id DESC
        `,
    )
        .then((result) => Array.from(result ?? []).map((row) => ({ ...row, is_latest: Boolean(row.is_latest) })))
        .catch((error) => {
            logger.error(`getAllAgentReleases: ${error}`);
            return [];
        });
}

export async function getLatestAgentReleases() {
    return await executeSQLQuery(
        (sql) => sql`SELECT * FROM AGENT_RELEASES WHERE is_latest = TRUE`,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getLatestAgentReleases: ${error}`);
            return [];
        });
}

export async function getAgentReleaseById({ id }) {
    return await executeSQLQuery((sql) => sql`SELECT * FROM AGENT_RELEASES WHERE id = ${id}`)
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getAgentReleaseById: ${error}`);
            return null;
        });
}

/** Insert or refresh a build artifact row. Returns true if a new row was inserted. */
export async function upsertAgentRelease({ component, version, file_path, sha256, size_bytes }) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO AGENT_RELEASES (component, version, file_path, sha256, size_bytes)
            VALUES (${component}, ${version}, ${file_path}, ${sha256}, ${size_bytes})
            ON DUPLICATE KEY UPDATE
                file_path = VALUES(file_path),
                sha256 = VALUES(sha256),
                size_bytes = VALUES(size_bytes)
        `,
    )
        .then((result) => Number(result?.affectedRows ?? 0) === 1)
        .catch((error) => {
            logger.error(`upsertAgentRelease: ${error}`);
            return false;
        });
}

export async function setLatestAgentRelease({ component, id }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE AGENT_RELEASES
            SET is_latest = (id = ${id})
            WHERE component = ${component}
        `,
    ).catch((error) => {
        logger.error(`setLatestAgentRelease: ${error}`);
    });
}
