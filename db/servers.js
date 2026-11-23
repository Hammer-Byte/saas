import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createServer({
    name,
    location,
    project_id = null,
    notes = null,
    tag,
    otp,
    active,
}) {
    const row = { name, location, project_id, notes, tag, otp };
    const columns = ["name", "location", "project_id", "notes", "tag", "otp"];
    if (active === false) {
        row.active = false;
        columns.push("active");
    }

    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO SERVERS ${sql(row, ...columns)}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createServer: ${error}`);
        });
}

export async function updateServerById({
    id,
    name,
    location,
    project_id = null,
    notes = null,
    active,
}) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE SERVERS
            SET
                name = ${name},
                location = ${location},
                project_id = ${project_id},
                notes = ${notes},
                active = ${active}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateServerById: ${error}`);
    });
}

export async function markServerTagMappedById({ id }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE SERVERS
            SET tag_mapped = TRUE
            WHERE id = ${id} AND tag_mapped = FALSE
        `,
    ).catch((error) => {
        logger.error(`markServerTagMappedById: ${error}`);
    });
}

/** Store Configurer username/password captured from Basic header (display only; not used for auth). */
export async function updateServerUtilityCredentialsById({ id, utility_username, utility_password }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE SERVERS
            SET
                utility_username = ${utility_username},
                utility_password = ${utility_password}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateServerUtilityCredentialsById: ${error}`);
    });
}

export async function unmapServerTagById({ id }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE SERVERS
            SET tag_mapped = FALSE
            WHERE id = ${id} AND tag_mapped = TRUE
        `,
    ).catch((error) => {
        logger.error(`unmapServerTagById: ${error}`);
    });
}

export async function deleteServerById({ id }) {
    await executeSQLQuery((sql) => sql`DELETE FROM SERVERS WHERE id = ${id}`).catch((error) => {
        logger.error(`deleteServerById: ${error}`);
    });
}

export async function getServerById({ id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                SERVERS.*,
                CUSTOMER_PROJECTS.title AS project_title,
                CUSTOMERS.full_name AS customer_name
            FROM SERVERS
            LEFT JOIN CUSTOMER_PROJECTS ON CUSTOMER_PROJECTS.id = SERVERS.project_id
            LEFT JOIN CUSTOMERS ON CUSTOMERS.id = CUSTOMER_PROJECTS.customer_id
            WHERE SERVERS.id = ${id}
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getServerById: ${error}`);
            return null;
        });
}

export async function getServerByUnmappedOtp({ otp }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM SERVERS
            WHERE otp = ${otp} AND tag_mapped = FALSE
            LIMIT 1
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getServerByUnmappedOtp: ${error}`);
            return null;
        });
}

export async function getServerByMappedTag({ tag }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM SERVERS
            WHERE tag = ${tag} AND tag_mapped = TRUE
            LIMIT 1
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getServerByMappedTag: ${error}`);
            return null;
        });
}

export async function getAllServers() {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                SERVERS.*,
                CUSTOMER_PROJECTS.title AS project_title,
                CUSTOMERS.full_name AS customer_name
            FROM SERVERS
            LEFT JOIN CUSTOMER_PROJECTS ON CUSTOMER_PROJECTS.id = SERVERS.project_id
            LEFT JOIN CUSTOMERS ON CUSTOMERS.id = CUSTOMER_PROJECTS.customer_id
            ORDER BY SERVERS.id DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllServers: ${error}`);
            return [];
        });
}

export async function updateServerAlertConfigById({ id, alert_config }) {
    const payload = typeof alert_config === "string" ? alert_config : JSON.stringify(alert_config ?? {});
    await executeSQLQuery(
        (sql) => sql`
            UPDATE SERVERS
            SET alert_config = ${payload}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateServerAlertConfigById: ${error}`);
    });
}

export async function updateServerAlertStateById({ id, alert_state }) {
    const payload = typeof alert_state === "string" ? alert_state : JSON.stringify(alert_state ?? {});
    await executeSQLQuery(
        (sql) => sql`
            UPDATE SERVERS
            SET alert_state = ${payload}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateServerAlertStateById: ${error}`);
    });
}

/** Active servers that may need missed-ping evaluation (includes alert_config/state). */
export async function getActiveServersForPingAlerts() {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                SERVERS.id,
                SERVERS.name,
                SERVERS.location,
                SERVERS.active,
                SERVERS.alert_config,
                SERVERS.alert_state,
                CUSTOMER_PROJECTS.title AS project_title,
                CUSTOMERS.full_name AS customer_name
            FROM SERVERS
            LEFT JOIN CUSTOMER_PROJECTS ON CUSTOMER_PROJECTS.id = SERVERS.project_id
            LEFT JOIN CUSTOMERS ON CUSTOMERS.id = CUSTOMER_PROJECTS.customer_id
            WHERE SERVERS.active = TRUE
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getActiveServersForPingAlerts: ${error}`);
            return [];
        });
}
