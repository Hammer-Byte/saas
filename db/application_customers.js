import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function getCustomerByApplicationId({ application_id }) {
    logger.info(`Getting Customer By Application Id : ${application_id}`);
    return await executeSQLQuery(
        (sql) => sql`SELECT * FROM APPLICATION_CUSTOMER WHERE application_id = ${application_id}`,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getCustomerByApplicationId: ${error}`);
            return null;
        });
}

export async function getCustomerEmailsByApplicationCustomerId({ application_customer_id }) {
    return await executeSQLQuery(
        (sql) => sql`SELECT email FROM CUSTOMER_EMAILS WHERE application_customer_id = ${application_customer_id}`,
    )
        .then((result) => (result ?? []).map((row) => row.email))
        .catch((error) => {
            logger.error(`getCustomerEmailsByApplicationCustomerId: ${error}`);
            return [];
        });
}

export async function getCustomerPhonesByApplicationCustomerId({ application_customer_id }) {
    return await executeSQLQuery(
        (sql) => sql`SELECT phone FROM CUSTOMER_PHONES WHERE application_customer_id = ${application_customer_id}`,
    )
        .then((result) => (result ?? []).map((row) => row.phone))
        .catch((error) => {
            logger.error(`getCustomerPhonesByApplicationCustomerId: ${error}`);
            return [];
        });
}

export async function createCustomer({ application_id, full_name, company, pan_gst, hsn, address }) {
    await executeSQLQuery(
        (sql) => sql`
            INSERT INTO APPLICATION_CUSTOMER ${sql(
                { application_id, full_name, company, pan_gst, hsn, address },
                "application_id",
                "full_name",
                "company",
                "pan_gst",
                "hsn",
                "address",
            )}
        `,
    ).catch((error) => {
        logger.error(`createCustomer: ${error}`);
        throw error;
    });
}

export async function updateCustomerByApplicationId({
    application_id,
    full_name,
    company,
    pan_gst,
    hsn,
    address,
}) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE APPLICATION_CUSTOMER
            SET
                full_name = ${full_name},
                company = ${company},
                pan_gst = ${pan_gst},
                hsn = ${hsn},
                address = ${address}
            WHERE application_id = ${application_id}
        `,
    ).catch((error) => {
        logger.error(`updateCustomerByApplicationId: ${error}`);
        throw error;
    });
}

export async function deleteCustomerEmailsByApplicationCustomerId({ application_customer_id }) {
    await executeSQLQuery(
        (sql) => sql`DELETE FROM CUSTOMER_EMAILS WHERE application_customer_id = ${application_customer_id}`,
    ).catch((error) => {
        logger.error(`deleteCustomerEmailsByApplicationCustomerId: ${error}`);
        throw error;
    });
}

export async function createCustomerEmail({ application_customer_id, email }) {
    await executeSQLQuery(
        (sql) => sql`
            INSERT INTO CUSTOMER_EMAILS ${sql(
                { application_customer_id, email },
                "application_customer_id",
                "email",
            )}
        `,
    ).catch((error) => {
        logger.error(`createCustomerEmail: ${error}`);
        throw error;
    });
}

export async function deleteCustomerPhonesByApplicationCustomerId({ application_customer_id }) {
    await executeSQLQuery(
        (sql) => sql`DELETE FROM CUSTOMER_PHONES WHERE application_customer_id = ${application_customer_id}`,
    ).catch((error) => {
        logger.error(`deleteCustomerPhonesByApplicationCustomerId: ${error}`);
        throw error;
    });
}

export async function createCustomerPhone({ application_customer_id, phone }) {
    await executeSQLQuery(
        (sql) => sql`
            INSERT INTO CUSTOMER_PHONES ${sql(
                { application_customer_id, phone },
                "application_customer_id",
                "phone",
            )}
        `,
    ).catch((error) => {
        logger.error(`createCustomerPhone: ${error}`);
        throw error;
    });
}
