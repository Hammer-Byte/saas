import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createFile({ application_service_id, file }) {
    await executeSQLQuery(
        (sql) => sql`
            INSERT INTO FILES ${sql({ application_service_id, file }, "application_service_id", "file")}
        `,
    ).catch((error) => {
        logger.error(`createFile: ${error}`);
    });
}

export async function getFilesWithSizeZeroByApplicationServiceId({ application_service_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT id, application_service_id, file, size, created_on, deleted_on
            FROM FILES
            WHERE application_service_id = ${application_service_id}
                AND size = 0
            ORDER BY created_on ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getFilesWithSizeZeroByApplicationServiceId: ${error}`);
            return [];
        });
}

export async function updateFileSizeById({ id, size }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE FILES
            SET size = ${size}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateFileSizeById: ${error}`);
    });
}

export async function getFilesByApplicationServiceId({ application_service_id, month, year }) {
    logger.info(
        `Getting Files By Application Service Id : ${application_service_id} For ${year}-${month}`,
    );

    return await executeSQLQuery(
        (sql) => sql`
            SELECT id, application_service_id, file, size, created_on, deleted_on
            FROM FILES
            WHERE application_service_id = ${application_service_id}
                AND created_on < DATE_ADD(
                    STR_TO_DATE(CONCAT(${year}, '-', ${month}, '-01'), '%Y-%m-%d'),
                    INTERVAL 1 MONTH
                )
                AND (
                    deleted_on IS NULL
                    OR deleted_on > STR_TO_DATE(CONCAT(${year}, '-', ${month}, '-01'), '%Y-%m-%d')
                )
            ORDER BY created_on DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getFilesByApplicationServiceId: ${error}`);
            return [];
        });
}

export async function getTotalFileSizeByApplicationServiceId({ application_service_id, month, year }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT COALESCE(SUM(size), 0) AS total_size
            FROM FILES
            WHERE application_service_id = ${application_service_id}
                AND created_on < DATE_ADD(
                    STR_TO_DATE(CONCAT(${year}, '-', ${month}, '-01'), '%Y-%m-%d'),
                    INTERVAL 1 MONTH
                )
                AND (
                    deleted_on IS NULL
                    OR deleted_on > STR_TO_DATE(CONCAT(${year}, '-', ${month}, '-01'), '%Y-%m-%d')
                )
        `,
    )
        .then((result) => Math.ceil(Number(result?.[0]?.total_size ?? 0)))
        .catch((error) => {
            logger.error(`getTotalFileSizeByApplicationServiceId: ${error}`);
            return 0;
        });
}
