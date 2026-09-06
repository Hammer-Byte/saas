import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";
import { toDbDateTime } from "../libs/date.js";

export async function createContract({
    company = null,
    full_name,
    email,
    phone,
    address,
    signing_code,
    active,
    signable_till,
}) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO CONTRACTS ${sql(
                {
                    company,
                    full_name,
                    email,
                    phone,
                    address,
                    signing_code,
                    active,
                    signable_till: toDbDateTime(signable_till),
                },
                "company",
                "full_name",
                "email",
                "phone",
                "address",
                "signing_code",
                "active",
                "signable_till",
            )}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createContract: ${error}`);
        });
}

export async function updateContractById({
    id,
    company = null,
    full_name,
    email,
    phone,
    address,
    active,
    signable_till,
}) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE CONTRACTS
            SET
                company = ${company},
                full_name = ${full_name},
                email = ${email},
                phone = ${phone},
                address = ${address},
                active = ${active},
                signable_till = ${toDbDateTime(signable_till)}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateContractById: ${error}`);
    });
}

export async function deleteContractById({ id }) {
    await executeSQLQuery((sql) => sql`DELETE FROM CONTRACTS WHERE id = ${id}`).catch((error) => {
        logger.error(`deleteContractById: ${error}`);
    });
}

export async function getContractById({ id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM CONTRACTS
            WHERE id = ${id}
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getContractById: ${error}`);
            return null;
        });
}

export async function getContractBySigningCode({ signing_code }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM CONTRACTS
            WHERE signing_code = ${signing_code}
                AND active = TRUE
            LIMIT 1
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getContractBySigningCode: ${error}`);
            return null;
        });
}

export async function getAllContracts() {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                contract.*,
                (
                    SELECT COUNT(*)
                    FROM CONTRACT_REQUIRED_ATTACHMENTS required
                    WHERE required.contract_id = contract.id
                ) AS required_attachments_count,
                (
                    SELECT COUNT(*)
                    FROM CONTRACT_REQUIRED_ATTACHMENTS required
                    WHERE required.contract_id = contract.id
                        AND required.media_id IS NOT NULL
                ) AS attached_media_count
            FROM CONTRACTS contract
            ORDER BY contract.id DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllContracts: ${error}`);
            return [];
        });
}
