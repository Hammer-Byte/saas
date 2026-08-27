import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function getActiveProjectApplicationByIdAndToken({ id, token }) {
    logger.info(`Getting Project Application : ${id} By Token : ${token}`);
    return await executeSQLQuery(
        (sql) =>
            sql`SELECT * FROM PROJECT_APPLICATIONS WHERE id=${id} AND token=${token} AND active=TRUE`,
    )
        .then((result) => (result.length ? result[0] : false))
        .catch((error) => logger.error(`getActiveProjectApplicationByIdAndToken: ${error}`));
}

export async function getAllProjectApplications() {
    logger.info("Getting All Project Applications");
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                PROJECT_APPLICATIONS.id,
                PROJECT_APPLICATIONS.title,
                PROJECT_APPLICATIONS.token,
                PROJECT_APPLICATIONS.active,
                PROJECT_APPLICATIONS.project_id,
                PROJECT_APPLICATIONS.created_on,
                PROJECT_APPLICATIONS.updated_at,
                CUSTOMER_PROJECTS.title AS project_title,
                CUSTOMERS.full_name AS customer_name
            FROM PROJECT_APPLICATIONS
            LEFT JOIN CUSTOMER_PROJECTS ON CUSTOMER_PROJECTS.id = PROJECT_APPLICATIONS.project_id
            LEFT JOIN CUSTOMERS ON CUSTOMERS.id = CUSTOMER_PROJECTS.customer_id
            ORDER BY PROJECT_APPLICATIONS.created_on DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllProjectApplications: ${error}`);
            return [];
        });
}

export async function getProjectApplicationById({ id }) {
    logger.info(`Getting Project Application By Id : ${id}`);
    return await executeSQLQuery(
        (sql) => sql`SELECT * FROM PROJECT_APPLICATIONS WHERE id=${id}`,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getProjectApplicationById: ${error}`);
            return null;
        });
}

export async function getProjectApplicationsByProjectId({ project_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM PROJECT_APPLICATIONS
            WHERE project_id = ${project_id}
            ORDER BY created_on DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getProjectApplicationsByProjectId: ${error}`);
            return [];
        });
}

export async function createProjectApplication({ title, project_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO PROJECT_APPLICATIONS ${sql(
                { title, project_id },
                "title",
                "project_id",
            )}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createProjectApplication: ${error}`);
        });
}

export async function updateProjectApplicationById({ id, title, token, active, project_id }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE PROJECT_APPLICATIONS
            SET
                title = ${title},
                token = ${token},
                active = ${active},
                project_id = ${project_id}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateProjectApplicationById: ${error}`);
    });
}
