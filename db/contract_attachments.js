import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function getAllContractAttachments() {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM CONTRACT_ATTACHMENTS
            ORDER BY id ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllContractAttachments: ${error}`);
            return [];
        });
}

export async function getContractAttachmentsByIds({ ids }) {
    const attachmentIds = Array.from(new Set((ids || []).map(Number).filter((id) => id > 0)));
    if (!attachmentIds.length) {
        return [];
    }

    const attachments = await getAllContractAttachments();
    const allowed = new Set(attachmentIds);
    return attachments.filter((attachment) => allowed.has(Number(attachment.id)));
}
