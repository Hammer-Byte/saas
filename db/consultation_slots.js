import { logger } from "@hammerbyte/utils";
import { CONSULTATION_STATUSES } from "../constants.js";
import { executeSQLQuery } from "../libs/db.js";

export async function createConsultationSlot({ starts_at, created_by_user_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO CONSULTATION_SLOTS ${sql(
                { starts_at, created_by_user_id },
                "starts_at",
                "created_by_user_id",
            )}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createConsultationSlot: ${error}`);
        });
}

export async function updateConsultationSlotActiveById({ id, active }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE CONSULTATION_SLOTS
            SET active = ${!!active}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateConsultationSlotActiveById: ${error}`);
    });
}

export async function updateConsultationSlotStartsAtById({ id, starts_at }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE CONSULTATION_SLOTS
            SET starts_at = ${starts_at}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateConsultationSlotStartsAtById: ${error}`);
    });
}

export async function getConsultationSlotById({ id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                CONSULTATION_SLOTS.*,
                USERS.full_name AS owner_name,
                USERS.email AS owner_email,
                USERS.personal_email AS owner_personal_email
            FROM CONSULTATION_SLOTS
            INNER JOIN USERS ON USERS.id = CONSULTATION_SLOTS.created_by_user_id
            WHERE CONSULTATION_SLOTS.id = ${id}
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getConsultationSlotById: ${error}`);
            return null;
        });
}

export async function getAllConsultationSlots({ from = null, to = null } = {}) {
    if (from && to) {
        return await executeSQLQuery(
            (sql) => sql`
                SELECT
                    CONSULTATION_SLOTS.*,
                    USERS.full_name AS owner_name,
                    USERS.email AS owner_email,
                    (
                        SELECT CONSULTATION_BOOKINGS.id
                        FROM CONSULTATION_BOOKINGS
                        WHERE CONSULTATION_BOOKINGS.slot_id = CONSULTATION_SLOTS.id
                          AND CONSULTATION_BOOKINGS.status = ${CONSULTATION_STATUSES.OPEN}
                        LIMIT 1
                    ) AS open_booking_id
                FROM CONSULTATION_SLOTS
                INNER JOIN USERS ON USERS.id = CONSULTATION_SLOTS.created_by_user_id
                WHERE CONSULTATION_SLOTS.starts_at >= ${`${from} 00:00:00`}
                  AND CONSULTATION_SLOTS.starts_at <= ${`${to} 23:59:59`}
                ORDER BY CONSULTATION_SLOTS.starts_at ASC, CONSULTATION_SLOTS.id ASC
            `,
        )
            .then((result) => Array.from(result ?? []))
            .catch((error) => {
                logger.error(`getAllConsultationSlots: ${error}`);
                return [];
            });
    }

    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                CONSULTATION_SLOTS.*,
                USERS.full_name AS owner_name,
                USERS.email AS owner_email,
                (
                    SELECT CONSULTATION_BOOKINGS.id
                    FROM CONSULTATION_BOOKINGS
                    WHERE CONSULTATION_BOOKINGS.slot_id = CONSULTATION_SLOTS.id
                      AND CONSULTATION_BOOKINGS.status = ${CONSULTATION_STATUSES.OPEN}
                    LIMIT 1
                ) AS open_booking_id
            FROM CONSULTATION_SLOTS
            INNER JOIN USERS ON USERS.id = CONSULTATION_SLOTS.created_by_user_id
            ORDER BY CONSULTATION_SLOTS.starts_at DESC, CONSULTATION_SLOTS.id DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllConsultationSlots: ${error}`);
            return [];
        });
}

export async function getAvailableConsultationSlots({ now }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                CONSULTATION_SLOTS.*,
                USERS.full_name AS owner_name
            FROM CONSULTATION_SLOTS
            INNER JOIN USERS ON USERS.id = CONSULTATION_SLOTS.created_by_user_id
            WHERE CONSULTATION_SLOTS.active = TRUE
              AND CONSULTATION_SLOTS.starts_at > ${now}
              AND NOT EXISTS (
                  SELECT 1
                  FROM CONSULTATION_BOOKINGS
                  WHERE CONSULTATION_BOOKINGS.slot_id = CONSULTATION_SLOTS.id
                    AND CONSULTATION_BOOKINGS.status = ${CONSULTATION_STATUSES.OPEN}
              )
            ORDER BY CONSULTATION_SLOTS.starts_at ASC, CONSULTATION_SLOTS.id ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAvailableConsultationSlots: ${error}`);
            return [];
        });
}
