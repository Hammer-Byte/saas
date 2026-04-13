import { CONSTANTS, logger } from "@hammerbyte/utils";
import { getActiveApplicationByIdAndToken } from "../db/applications.js";


export default async function parseApplication({ headers }) {
    const id = headers[CONSTANTS.SAAS.HEADERS.APPLICATION_ID];
    const token = headers[CONSTANTS.SAAS.HEADERS.APPLICATION_TOKEN];

    if (!id || !token) {
        logger.error("Unable To Parse Application , Missing ID or Token");
        return;
    }

    return {
        application: await getActiveApplicationByIdAndToken({ id,token }),
    };
}
