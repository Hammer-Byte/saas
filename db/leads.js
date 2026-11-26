import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createLead({
    full_name,
    website = null,
    organization = null,
    designation = null,
    location = null,
    refer_by = null,
    targeted_for = null,
    source_id = null,
}) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO LEADS ${sql(
                {
                    full_name,
                    website,
                    organization,
                    designation,
                    location,
                    refer_by,
                    targeted_for,
                    source_id,
                },
                "full_name",
                "website",
                "organization",
                "designation",
                "location",
                "refer_by",
                "targeted_for",
                "source_id",
            )}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createLead: ${error}`);
        });
}

export async function updateLeadById({
    id,
    full_name,
    website = null,
    organization = null,
    designation = null,
    location = null,
    refer_by = null,
    targeted_for = null,
    source_id = null,
}) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE LEADS
            SET
                full_name = ${full_name},
                website = ${website},
                organization = ${organization},
                designation = ${designation},
                location = ${location},
                refer_by = ${refer_by},
                targeted_for = ${targeted_for},
                source_id = ${source_id}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateLeadById: ${error}`);
    });
}

export async function deleteLeadById({ id }) {
    await executeSQLQuery((sql) => sql`DELETE FROM LEADS WHERE id = ${id}`).catch((error) => {
        logger.error(`deleteLeadById: ${error}`);
    });
}

export async function getLeadById({ id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                LEADS.*,
                LEAD_SOURCES.title AS source_title
            FROM LEADS
            LEFT JOIN LEAD_SOURCES ON LEAD_SOURCES.id = LEADS.source_id
            WHERE LEADS.id = ${id}
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getLeadById: ${error}`);
            return null;
        });
}

export async function getAllLeads({ from, to }) {
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!datePattern.test(String(from || "")) || !datePattern.test(String(to || ""))) {
        return [];
    }

    const rangeStart = from <= to ? from : to;
    const rangeEnd = from <= to ? to : from;
    const startDateTime = `${rangeStart} 00:00:00`;
    const endDateTime = `${rangeEnd} 23:59:59`;

    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                LEADS.*,
                LEAD_SOURCES.title AS source_title,
                (
                    SELECT LEAD_PHONES.phone
                    FROM LEAD_PHONES
                    WHERE LEAD_PHONES.lead_id = LEADS.id
                    ORDER BY LEAD_PHONES.id ASC
                    LIMIT 1
                ) AS primary_phone,
                (
                    SELECT LEAD_EMAILS.email
                    FROM LEAD_EMAILS
                    WHERE LEAD_EMAILS.lead_id = LEADS.id
                    ORDER BY LEAD_EMAILS.id ASC
                    LIMIT 1
                ) AS primary_email,
                (
                    SELECT GROUP_CONCAT(LEAD_PHONES.phone ORDER BY LEAD_PHONES.id SEPARATOR ' ')
                    FROM LEAD_PHONES
                    WHERE LEAD_PHONES.lead_id = LEADS.id
                ) AS phones_search,
                (
                    SELECT GROUP_CONCAT(LEAD_EMAILS.email ORDER BY LEAD_EMAILS.id SEPARATOR ' ')
                    FROM LEAD_EMAILS
                    WHERE LEAD_EMAILS.lead_id = LEADS.id
                ) AS emails_search
            FROM LEADS
            LEFT JOIN LEAD_SOURCES ON LEAD_SOURCES.id = LEADS.source_id
            WHERE LEADS.created_on >= ${startDateTime}
              AND LEADS.created_on <= ${endDateTime}
            ORDER BY LEADS.created_on DESC, LEADS.id DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllLeads: ${error}`);
            return [];
        });
}
