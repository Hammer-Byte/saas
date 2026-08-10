import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createUserAuthenticationToken({ user_id, token, otp }) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO USER_AUTHENTICATION_TOKENS ${sql(
                { user_id, token, otp, active: false },
                "user_id",
                "token",
                "otp",
                "active",
            )}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createUserAuthenticationToken: ${error}`);
            throw error;
        });
}

export async function getUserAuthenticationTokenByTokenAndOtp({ token, otp }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM USER_AUTHENTICATION_TOKENS
            WHERE token = ${token} AND otp = ${otp}
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getUserAuthenticationTokenByTokenAndOtp: ${error}`);
            return null;
        });
}

export async function updateUserAuthenticationTokenActiveById({ id, active }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE USER_AUTHENTICATION_TOKENS
            SET active = ${active}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateUserAuthenticationTokenActiveById: ${error}`);
        throw error;
    });
}

export async function getActiveUserAuthenticationTokenByToken({ token }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                USER_AUTHENTICATION_TOKENS.*,
                USERS.email AS email,
                USERS.full_name AS full_name
            FROM USER_AUTHENTICATION_TOKENS
            INNER JOIN USERS ON USERS.id = USER_AUTHENTICATION_TOKENS.user_id
            WHERE USER_AUTHENTICATION_TOKENS.token = ${token}
                AND USER_AUTHENTICATION_TOKENS.active = TRUE
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getActiveUserAuthenticationTokenByToken: ${error}`);
            return null;
        });
}
