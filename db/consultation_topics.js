import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createConsultationTopic({ title, description }) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO CONSULTATION_TOPICS ${sql({ title, description }, "title", "description")}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createConsultationTopic: ${error}`);
        });
}

export async function updateConsultationTopicById({ id, title, description, active }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE CONSULTATION_TOPICS
            SET
                title = ${title},
                description = ${description},
                active = ${!!active}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateConsultationTopicById: ${error}`);
    });
}

export async function getConsultationTopicById({ id }) {
    return await executeSQLQuery(
        (sql) => sql`SELECT * FROM CONSULTATION_TOPICS WHERE id = ${id}`,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getConsultationTopicById: ${error}`);
            return null;
        });
}

export async function getAllConsultationTopics({ active_only = false } = {}) {
    if (active_only) {
        return await executeSQLQuery(
            (sql) => sql`
                SELECT *
                FROM CONSULTATION_TOPICS
                WHERE active = TRUE
                ORDER BY title ASC, id ASC
            `,
        )
            .then((result) => Array.from(result ?? []))
            .catch((error) => {
                logger.error(`getAllConsultationTopics: ${error}`);
                return [];
            });
    }

    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM CONSULTATION_TOPICS
            ORDER BY active DESC, title ASC, id ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllConsultationTopics: ${error}`);
            return [];
        });
}
