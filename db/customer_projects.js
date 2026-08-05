import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createCustomerProject({ customer_id, title, description }) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO CUSTOMER_PROJECTS ${sql(
                { customer_id, title, description },
                "customer_id",
                "title",
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

export async function updateCustomerProjectById({ id, title, description }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE CUSTOMER_PROJECTS
            SET
                title = ${title},
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
        (sql) => sql`SELECT * FROM CUSTOMER_PROJECTS WHERE id = ${id}`,
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
            SELECT *
            FROM CUSTOMER_PROJECTS
            WHERE customer_id = ${customer_id}
            ORDER BY title ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getCustomerProjectsByCustomerId: ${error}`);
            return [];
        });
}

export async function getAllCustomerProjects() {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                CUSTOMER_PROJECTS.*,
                CUSTOMERS.full_name AS customer_name
            FROM CUSTOMER_PROJECTS
            INNER JOIN CUSTOMERS ON CUSTOMERS.id = CUSTOMER_PROJECTS.customer_id
            ORDER BY CUSTOMERS.full_name ASC, CUSTOMER_PROJECTS.title ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllCustomerProjects: ${error}`);
            return [];
        });
}
