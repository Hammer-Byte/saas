import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";
import { toDbDateTime } from "../libs/date.js";

export async function createExternalContract({
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
            INSERT INTO EXTERNAL_CONTRACTS ${sql(
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
            logger.error(`createExternalContract: ${error}`);
        });
}

export async function updateExternalContractById({
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
            UPDATE EXTERNAL_CONTRACTS
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
        logger.error(`updateExternalContractById: ${error}`);
    });
}

export async function updateExternalContractSignedMediaById({
    id,
    signature,
    selfie,
    identity,
}) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE EXTERNAL_CONTRACTS
            SET
                signature = ${signature},
                selfie = ${selfie},
                identity = ${identity}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateExternalContractSignedMediaById: ${error}`);
    });
}

export async function clearExternalContractSignedMediaById({ id }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE EXTERNAL_CONTRACTS
            SET
                signature = NULL,
                selfie = NULL,
                identity = NULL
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`clearExternalContractSignedMediaById: ${error}`);
    });
}

export async function deleteExternalContractById({ id }) {
    await executeSQLQuery((sql) => sql`DELETE FROM EXTERNAL_CONTRACTS WHERE id = ${id}`).catch(
        (error) => {
            logger.error(`deleteExternalContractById: ${error}`);
        },
    );
}

export async function getExternalContractById({ id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM EXTERNAL_CONTRACTS
            WHERE id = ${id}
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getExternalContractById: ${error}`);
            return null;
        });
}

export async function getExternalContractBySigningCode({ signing_code }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM EXTERNAL_CONTRACTS
            WHERE signing_code = ${signing_code}
                AND active = TRUE
            LIMIT 1
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getExternalContractBySigningCode: ${error}`);
            return null;
        });
}

export async function getAllExternalContracts() {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM EXTERNAL_CONTRACTS
            ORDER BY id DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllExternalContracts: ${error}`);
            return [];
        });
}
