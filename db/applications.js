import { executeSQLQuery } from "../libs/db";

const { logger } = require("@hammerbyte/utils");


export async function getActiveApplicationByIdAndToken({ id,token}) {
    return await executeSQLQuery(
        (sql) => sql` SELECT * FROM APPLICATIONS WHERE id=${id} AND token=${token} AND active=TRUE`,
    )
    .then((result) => (result.length ? result[0] : false))
        .catch((error) => logger.error(`getActiveApplicationByIdAndToken: ${error}`));
}
