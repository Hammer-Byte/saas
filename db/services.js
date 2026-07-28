import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db";

export async function getAllServices() {
    logger.info("Getting All Services");
    return await executeSQLQuery((sql) => sql`SELECT * FROM SERVICES ORDER BY id ASC`)
        .then((result) => result ?? [])
        .catch((error) => {
            logger.error(`getAllServices: ${error}`);
            return [];
        });
}
