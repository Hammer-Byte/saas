import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createCustomerProject({ customer_id, project_id, description }) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO CUSTOMER_PROJECTS ${sql(
                { customer_id, project_id, description },
                "customer_id",
                "project_id",
                "description",
            )}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createCustomerProject: ${error}`);
            throw error;
        });
}

export async function updateCustomerProjectById({ id, project_id, description }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE CUSTOMER_PROJECTS
            SET
                project_id = ${project_id},
                description = ${description}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateCustomerProjectById: ${error}`);
        throw error;
    });
}

export async function deleteCustomerProjectById({ id }) {
    await executeSQLQuery((sql) => sql`DELETE FROM CUSTOMER_PROJECTS WHERE id = ${id}`).catch(
        (error) => {
            logger.error(`deleteCustomerProjectById: ${error}`);
            throw error;
        },
    );
}

export async function getCustomerProjectById({ id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                CUSTOMER_PROJECTS.*,
                PROJECTS.title AS project_title
            FROM CUSTOMER_PROJECTS
            INNER JOIN PROJECTS ON PROJECTS.id = CUSTOMER_PROJECTS.project_id
            WHERE CUSTOMER_PROJECTS.id = ${id}
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getCustomerProjectById: ${error}`);
            return null;
        });
}

export async function getCustomerProjectsByCustomerId({ customer_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                CUSTOMER_PROJECTS.id,
                CUSTOMER_PROJECTS.customer_id,
                CUSTOMER_PROJECTS.project_id,
                CUSTOMER_PROJECTS.description,
                CUSTOMER_PROJECTS.created_on,
                CUSTOMER_PROJECTS.updated_at,
                PROJECTS.title AS project_title
            FROM CUSTOMER_PROJECTS
            INNER JOIN PROJECTS ON PROJECTS.id = CUSTOMER_PROJECTS.project_id
            WHERE CUSTOMER_PROJECTS.customer_id = ${customer_id}
            ORDER BY PROJECTS.title ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getCustomerProjectsByCustomerId: ${error}`);
            return [];
        });
}
