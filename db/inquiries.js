import { logger } from "@hammerbyte/utils";
import { INQUIRY_STATES } from "../constants.js";
import { executeSQLQuery } from "../libs/db.js";
import { getIstDateTime, toDbDateTime } from "../libs/date.js";

export async function createInquiry({
    full_name,
    phone,
    email = null,
    source = null,
    institute_name = null,
    city = null,
    state = INQUIRY_STATES.NEW,
    assignee_user_id = null,
    quote = null,
    potential_entered_on = null,
}) {
    const insertRow = {
        full_name,
        phone,
        email,
        source,
        institute_name,
        city,
        state,
        assignee_user_id,
        quote,
    };
    const insertColumns = [
        "full_name",
        "phone",
        "email",
        "source",
        "institute_name",
        "city",
        "state",
        "assignee_user_id",
        "quote",
    ];

    if (potential_entered_on != null) {
        insertRow.potential_entered_on = potential_entered_on;
        insertColumns.push("potential_entered_on");
    }

    return await executeSQLQuery((sql) =>
        sql`INSERT INTO INQUIRIES ${sql(insertRow, ...insertColumns)}`,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createInquiry: ${error}`);
        });
}

export async function getAllInquiries({ from, to }) {
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!datePattern.test(String(from || "")) || !datePattern.test(String(to || ""))) {
        return [];
    }

    const rangeStart = from <= to ? from : to;
    const rangeEnd = from <= to ? to : from;
    const startDateTime = `${rangeStart} 00:00:00`;
    const endDateTime = `${rangeEnd} 23:59:59`;

    logger.info("Getting All Inquiries");
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                INQUIRIES.*,
                USERS.full_name AS assignee_full_name,
                USERS.email AS assignee_email,
                (
                    SELECT COUNT(*)
                    FROM INQUIRY_FOLLOWUPS
                    WHERE INQUIRY_FOLLOWUPS.inquiry_id = INQUIRIES.id
                ) AS followup_count
            FROM INQUIRIES
            LEFT JOIN USERS ON USERS.id = INQUIRIES.assignee_user_id
            WHERE INQUIRIES.created_on >= ${startDateTime}
              AND INQUIRIES.created_on <= ${endDateTime}
            ORDER BY INQUIRIES.created_on DESC, INQUIRIES.id DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllInquiries: ${error}`);
            return [];
        });
}

export async function getInquiryById({ id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                INQUIRIES.*,
                USERS.full_name AS assignee_full_name,
                USERS.email AS assignee_email
            FROM INQUIRIES
            LEFT JOIN USERS ON USERS.id = INQUIRIES.assignee_user_id
            WHERE INQUIRIES.id = ${id}
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getInquiryById: ${error}`);
            return null;
        });
}

export async function updateInquiryById({
    id,
    full_name,
    phone,
    email,
    source,
    institute_name,
    city,
    state,
    assignee_user_id = null,
    quote,
    potential_entered_on = null,
    followup_1_reminder_sent_on = null,
    followup_2_reminder_sent_on = null,
    followup_3_reminder_sent_on = null,
}) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE INQUIRIES
            SET
                full_name = ${full_name},
                phone = ${phone},
                email = ${email},
                source = ${source},
                institute_name = ${institute_name},
                city = ${city},
                state = ${state},
                assignee_user_id = ${assignee_user_id},
                quote = ${quote},
                potential_entered_on = ${potential_entered_on},
                followup_1_reminder_sent_on = ${followup_1_reminder_sent_on},
                followup_2_reminder_sent_on = ${followup_2_reminder_sent_on},
                followup_3_reminder_sent_on = ${followup_3_reminder_sent_on}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateInquiryById: ${error}`);
    });
}

export async function getInquiriesPendingFollowupReminders() {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                INQUIRIES.id,
                INQUIRIES.full_name,
                INQUIRIES.phone,
                INQUIRIES.email,
                INQUIRIES.state,
                INQUIRIES.assignee_user_id,
                INQUIRIES.potential_entered_on,
                INQUIRIES.followup_1_reminder_sent_on,
                INQUIRIES.followup_2_reminder_sent_on,
                INQUIRIES.followup_3_reminder_sent_on,
                USERS.full_name AS assignee_full_name,
                USERS.email AS assignee_email,
                (
                    SELECT COUNT(*)
                    FROM INQUIRY_FOLLOWUPS
                    WHERE INQUIRY_FOLLOWUPS.inquiry_id = INQUIRIES.id
                ) AS followup_count,
                (
                    SELECT GROUP_CONCAT(INQUIRY_FOLLOWUPS.slot ORDER BY INQUIRY_FOLLOWUPS.slot)
                    FROM INQUIRY_FOLLOWUPS
                    WHERE INQUIRY_FOLLOWUPS.inquiry_id = INQUIRIES.id
                ) AS followup_slots
            FROM INQUIRIES
            LEFT JOIN USERS ON USERS.id = INQUIRIES.assignee_user_id
            WHERE INQUIRIES.state = ${INQUIRY_STATES.POTENTIAL}
              AND INQUIRIES.potential_entered_on IS NOT NULL
            ORDER BY INQUIRIES.id ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getInquiriesPendingFollowupReminders: ${error}`);
            return [];
        });
}

export async function stampInquiryFollowupReminder({ id, slot, sent_on = null }) {
    const stampedOn = toDbDateTime(sent_on) || getIstDateTime();
    const slotNumber = Number(slot);
    if (!(slotNumber >= 1 && slotNumber <= 3)) {
        return;
    }

    if (slotNumber === 1) {
        await executeSQLQuery(
            (sql) => sql`
                UPDATE INQUIRIES
                SET followup_1_reminder_sent_on = ${stampedOn}
                WHERE id = ${id}
            `,
        ).catch((error) => {
            logger.error(`stampInquiryFollowupReminder: ${error}`);
        });
        return;
    }

    if (slotNumber === 2) {
        await executeSQLQuery(
            (sql) => sql`
                UPDATE INQUIRIES
                SET followup_2_reminder_sent_on = ${stampedOn}
                WHERE id = ${id}
            `,
        ).catch((error) => {
            logger.error(`stampInquiryFollowupReminder: ${error}`);
        });
        return;
    }

    await executeSQLQuery(
        (sql) => sql`
            UPDATE INQUIRIES
            SET followup_3_reminder_sent_on = ${stampedOn}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`stampInquiryFollowupReminder: ${error}`);
    });
}
