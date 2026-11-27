import { logger } from "@hammerbyte/utils";
import { CONSULTATION_STATUSES } from "../constants.js";
import { executeSQLQuery } from "../libs/db.js";

export async function createConsultationBooking({
    topic_id,
    slot_id,
    full_name,
    phone,
    email,
    status = CONSULTATION_STATUSES.OPEN,
}) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO CONSULTATION_BOOKINGS ${sql(
                {
                    topic_id,
                    slot_id,
                    full_name,
                    phone,
                    email,
                    status,
                },
                "topic_id",
                "slot_id",
                "full_name",
                "phone",
                "email",
                "status",
            )}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createConsultationBooking: ${error}`);
        });
}

export async function updateConsultationBookingStatusById({ id, status }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE CONSULTATION_BOOKINGS
            SET status = ${status}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateConsultationBookingStatusById: ${error}`);
    });
}

export async function updateConsultationBookingSlotById({ id, slot_id }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE CONSULTATION_BOOKINGS
            SET
                slot_id = ${slot_id},
                reminder_sent_on = NULL,
                status = ${CONSULTATION_STATUSES.OPEN}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateConsultationBookingSlotById: ${error}`);
    });
}

export async function stampConsultationBookingReminderSentOn({ id, sent_on }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE CONSULTATION_BOOKINGS
            SET reminder_sent_on = ${sent_on}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`stampConsultationBookingReminderSentOn: ${error}`);
    });
}

export async function getConsultationBookingById({ id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                CONSULTATION_BOOKINGS.*,
                CONSULTATION_TOPICS.title AS topic_title,
                CONSULTATION_TOPICS.description AS topic_description,
                CONSULTATION_SLOTS.starts_at,
                CONSULTATION_SLOTS.created_by_user_id AS slot_owner_user_id,
                CONSULTATION_SLOTS.active AS slot_active,
                USERS.full_name AS owner_name,
                USERS.email AS owner_email,
                USERS.personal_email AS owner_personal_email
            FROM CONSULTATION_BOOKINGS
            INNER JOIN CONSULTATION_TOPICS ON CONSULTATION_TOPICS.id = CONSULTATION_BOOKINGS.topic_id
            INNER JOIN CONSULTATION_SLOTS ON CONSULTATION_SLOTS.id = CONSULTATION_BOOKINGS.slot_id
            INNER JOIN USERS ON USERS.id = CONSULTATION_SLOTS.created_by_user_id
            WHERE CONSULTATION_BOOKINGS.id = ${id}
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getConsultationBookingById: ${error}`);
            return null;
        });
}

export async function getAllConsultationBookings({ from = null, to = null } = {}) {
    if (from && to) {
        return await executeSQLQuery(
            (sql) => sql`
                SELECT
                    CONSULTATION_BOOKINGS.*,
                    CONSULTATION_TOPICS.title AS topic_title,
                    CONSULTATION_SLOTS.starts_at,
                    CONSULTATION_SLOTS.created_by_user_id AS slot_owner_user_id,
                    USERS.full_name AS owner_name,
                    USERS.email AS owner_email
                FROM CONSULTATION_BOOKINGS
                INNER JOIN CONSULTATION_TOPICS ON CONSULTATION_TOPICS.id = CONSULTATION_BOOKINGS.topic_id
                INNER JOIN CONSULTATION_SLOTS ON CONSULTATION_SLOTS.id = CONSULTATION_BOOKINGS.slot_id
                INNER JOIN USERS ON USERS.id = CONSULTATION_SLOTS.created_by_user_id
                WHERE CONSULTATION_SLOTS.starts_at >= ${`${from} 00:00:00`}
                  AND CONSULTATION_SLOTS.starts_at <= ${`${to} 23:59:59`}
                ORDER BY CONSULTATION_SLOTS.starts_at DESC, CONSULTATION_BOOKINGS.id DESC
            `,
        )
            .then((result) => Array.from(result ?? []))
            .catch((error) => {
                logger.error(`getAllConsultationBookings: ${error}`);
                return [];
            });
    }

    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                CONSULTATION_BOOKINGS.*,
                CONSULTATION_TOPICS.title AS topic_title,
                CONSULTATION_SLOTS.starts_at,
                CONSULTATION_SLOTS.created_by_user_id AS slot_owner_user_id,
                USERS.full_name AS owner_name,
                USERS.email AS owner_email
            FROM CONSULTATION_BOOKINGS
            INNER JOIN CONSULTATION_TOPICS ON CONSULTATION_TOPICS.id = CONSULTATION_BOOKINGS.topic_id
            INNER JOIN CONSULTATION_SLOTS ON CONSULTATION_SLOTS.id = CONSULTATION_BOOKINGS.slot_id
            INNER JOIN USERS ON USERS.id = CONSULTATION_SLOTS.created_by_user_id
            ORDER BY CONSULTATION_SLOTS.starts_at DESC, CONSULTATION_BOOKINGS.id DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllConsultationBookings: ${error}`);
            return [];
        });
}

export async function getOpenConsultationBookingBySlotId({ slot_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM CONSULTATION_BOOKINGS
            WHERE slot_id = ${slot_id}
              AND status = ${CONSULTATION_STATUSES.OPEN}
            LIMIT 1
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getOpenConsultationBookingBySlotId: ${error}`);
            return null;
        });
}

export async function getBlockingOpenConsultationBooking({ email, phone, now }) {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedPhone = String(phone || "").trim();
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                CONSULTATION_BOOKINGS.*,
                CONSULTATION_SLOTS.starts_at
            FROM CONSULTATION_BOOKINGS
            INNER JOIN CONSULTATION_SLOTS ON CONSULTATION_SLOTS.id = CONSULTATION_BOOKINGS.slot_id
            WHERE CONSULTATION_BOOKINGS.status = ${CONSULTATION_STATUSES.OPEN}
              AND DATE_ADD(CONSULTATION_SLOTS.starts_at, INTERVAL 30 MINUTE) > ${now}
              AND (
                  LOWER(CONSULTATION_BOOKINGS.email) = ${normalizedEmail}
                  OR CONSULTATION_BOOKINGS.phone = ${normalizedPhone}
              )
            ORDER BY CONSULTATION_SLOTS.starts_at ASC
            LIMIT 1
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getBlockingOpenConsultationBooking: ${error}`);
            return null;
        });
}

export async function getPendingConsultationReminders({ now }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                CONSULTATION_BOOKINGS.*,
                CONSULTATION_TOPICS.title AS topic_title,
                CONSULTATION_SLOTS.starts_at,
                USERS.full_name AS owner_name,
                USERS.email AS owner_email,
                USERS.personal_email AS owner_personal_email
            FROM CONSULTATION_BOOKINGS
            INNER JOIN CONSULTATION_TOPICS ON CONSULTATION_TOPICS.id = CONSULTATION_BOOKINGS.topic_id
            INNER JOIN CONSULTATION_SLOTS ON CONSULTATION_SLOTS.id = CONSULTATION_BOOKINGS.slot_id
            INNER JOIN USERS ON USERS.id = CONSULTATION_SLOTS.created_by_user_id
            WHERE CONSULTATION_BOOKINGS.status = ${CONSULTATION_STATUSES.OPEN}
              AND CONSULTATION_BOOKINGS.reminder_sent_on IS NULL
              AND CONSULTATION_SLOTS.starts_at > ${now}
              AND CONSULTATION_SLOTS.starts_at <= DATE_ADD(${now}, INTERVAL 10 MINUTE)
            ORDER BY CONSULTATION_SLOTS.starts_at ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getPendingConsultationReminders: ${error}`);
            return [];
        });
}
