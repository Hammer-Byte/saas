import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createConsultationEmailOtp({
    email,
    token,
    otp,
    full_name,
    phone,
    topic_id,
    slot_id,
}) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO CONSULTATION_EMAIL_OTPS ${sql(
                {
                    email,
                    token,
                    otp,
                    full_name,
                    phone,
                    topic_id,
                    slot_id,
                },
                "email",
                "token",
                "otp",
                "full_name",
                "phone",
                "topic_id",
                "slot_id",
            )}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createConsultationEmailOtp: ${error}`);
        });
}

export async function getConsultationEmailOtpByTokenAndOtp({ token, otp, earliest_created_on }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM CONSULTATION_EMAIL_OTPS
            WHERE token = ${token}
              AND otp = ${otp}
              AND verified_on IS NULL
              AND created_on >= ${earliest_created_on}
            ORDER BY id DESC
            LIMIT 1
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getConsultationEmailOtpByTokenAndOtp: ${error}`);
            return null;
        });
}

export async function markConsultationEmailOtpVerified({ id, verified_on }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE CONSULTATION_EMAIL_OTPS
            SET verified_on = ${verified_on}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`markConsultationEmailOtpVerified: ${error}`);
    });
}
