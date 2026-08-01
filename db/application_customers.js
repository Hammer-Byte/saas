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

export async function upsertCustomerByApplicationId({
    application_id,
    full_name,
    company,
    pan_gst,
    hsn,
    address,
}) {
    logger.info(`Upserting Customer For Application Id : ${application_id}`);
    const existing = await getCustomerByApplicationId({ application_id });

    if (existing) {
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
            logger.error(`upsertCustomerByApplicationId update: ${error}`);
            throw error;
        });

        return getCustomerByApplicationId({ application_id });
    }

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
        logger.error(`upsertCustomerByApplicationId insert: ${error}`);
        throw error;
    });

    return getCustomerByApplicationId({ application_id });
}
