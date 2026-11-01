import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createServerMonitorRelease({
    kind,
    version,
    file_name,
    sha256 = null,
    active = true,
}) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO SERVER_MONITOR_RELEASES ${sql(
                { kind, version, file_name, sha256, active },
                "kind",
                "version",
                "file_name",
                "sha256",
                "active",
            )}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createServerMonitorRelease: ${error}`);
        });
}

export async function deactivateServerMonitorReleasesByKind({ kind }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE SERVER_MONITOR_RELEASES
            SET active = FALSE
            WHERE kind = ${kind}
        `,
    ).catch((error) => {
        logger.error(`deactivateServerMonitorReleasesByKind: ${error}`);
    });
}

export async function getLatestActiveServerMonitorReleaseByKind({ kind }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT * FROM SERVER_MONITOR_RELEASES
            WHERE kind = ${kind} AND active = TRUE
            ORDER BY id DESC
            LIMIT 1
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getLatestActiveServerMonitorReleaseByKind: ${error}`);
            return null;
        });
}

export async function getAllServerMonitorReleases() {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT * FROM SERVER_MONITOR_RELEASES
            ORDER BY kind ASC, id DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllServerMonitorReleases: ${error}`);
            return [];
        });
}
