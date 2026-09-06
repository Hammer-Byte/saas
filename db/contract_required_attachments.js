import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createContractRequiredAttachment({
    contract_id,
    attachment_id,
    media_id = null,
}) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO CONTRACT_REQUIRED_ATTACHMENTS ${sql(
                {
                    contract_id,
                    attachment_id,
                    media_id,
                },
                "contract_id",
                "attachment_id",
                "media_id",
            )}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createContractRequiredAttachment: ${error}`);
        });
}

export async function deleteContractRequiredAttachmentsByContractId({ contract_id }) {
    await executeSQLQuery(
        (sql) => sql`
            DELETE FROM CONTRACT_REQUIRED_ATTACHMENTS
            WHERE contract_id = ${contract_id}
        `,
    ).catch((error) => {
        logger.error(`deleteContractRequiredAttachmentsByContractId: ${error}`);
    });
}

export async function clearContractRequiredAttachmentMediaByContractId({ contract_id }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE CONTRACT_REQUIRED_ATTACHMENTS
            SET media_id = NULL
            WHERE contract_id = ${contract_id}
        `,
    ).catch((error) => {
        logger.error(`clearContractRequiredAttachmentMediaByContractId: ${error}`);
    });
}

export async function updateContractRequiredAttachmentMediaById({ id, media_id }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE CONTRACT_REQUIRED_ATTACHMENTS
            SET media_id = ${media_id}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateContractRequiredAttachmentMediaById: ${error}`);
    });
}

export async function getContractRequiredAttachmentById({ id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                required.id,
                required.contract_id,
                required.attachment_id,
                required.media_id,
                attachment.title
            FROM CONTRACT_REQUIRED_ATTACHMENTS required
            INNER JOIN CONTRACT_ATTACHMENTS attachment
                ON attachment.id = required.attachment_id
            WHERE required.id = ${id}
            LIMIT 1
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getContractRequiredAttachmentById: ${error}`);
            return null;
        });
}

export async function getContractRequiredAttachmentsByContractId({ contract_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                required.id,
                required.contract_id,
                required.attachment_id,
                required.media_id,
                attachment.title
            FROM CONTRACT_REQUIRED_ATTACHMENTS required
            INNER JOIN CONTRACT_ATTACHMENTS attachment
                ON attachment.id = required.attachment_id
            WHERE required.contract_id = ${contract_id}
            ORDER BY attachment.id ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getContractRequiredAttachmentsByContractId: ${error}`);
            return [];
        });
}
