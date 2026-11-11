import { logger } from "@hammerbyte/utils";
import {
    GEM_KEYWORD_TENDER_ELIGIBILITY,
    GEM_KEYWORD_TENDER_STAGES,
} from "../constants.js";
import { executeSQLQuery } from "../libs/db.js";
import { getIstDateTime, toDbDateTime } from "../libs/date.js";

function serializeSpecificationLinks(specification_links) {
    if (specification_links == null) {
        return null;
    }
    if (typeof specification_links === "string") {
        return specification_links || null;
    }
    if (!Array.isArray(specification_links) || !specification_links.length) {
        return null;
    }
    return JSON.stringify(specification_links);
}

export async function createGemKeywordTender({
    keyword_id,
    tender_id,
    document = null,
    start_date_time = null,
    end_date_time = null,
    ministry = null,
    department = null,
    organization = null,
    office = null,
    hod_email = null,
    buyer_email = null,
    buyer_phone = null,
    required_minimum_average_turnover = null,
    required_past_experice_years = null,
    mse_experience_relaxation = null,
    mse_turnover_relaxation = null,
    asked_documents = null,
    specification_links = null,
    quantity = 0,
    emd_amount = 0,
}) {
    const quantityValue = Number(quantity);
    const safeQuantity =
        Number.isFinite(quantityValue) && quantityValue > 0 ? Math.round(quantityValue) : 0;
    const emdValue = Number(emd_amount);
    const safeEmdAmount =
        Number.isFinite(emdValue) && emdValue > 0 ? Math.round(emdValue * 100) / 100 : 0;

    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO GEM_KEYWORD_TENDERS ${sql(
                {
                    keyword_id,
                    tender_id,
                    document,
                    start_date_time: toDbDateTime(start_date_time),
                    end_date_time: toDbDateTime(end_date_time),
                    ministry,
                    department,
                    organization,
                    office,
                    hod_email,
                    buyer_email,
                    buyer_phone,
                    required_minimum_average_turnover,
                    required_past_experice_years,
                    mse_experience_relaxation,
                    mse_turnover_relaxation,
                    asked_documents,
                    specification_links: serializeSpecificationLinks(specification_links),
                    quantity: safeQuantity,
                    emd_amount: safeEmdAmount,
                },
                "keyword_id",
                "tender_id",
                "document",
                "start_date_time",
                "end_date_time",
                "ministry",
                "department",
                "organization",
                "office",
                "hod_email",
                "buyer_email",
                "buyer_phone",
                "required_minimum_average_turnover",
                "required_past_experice_years",
                "mse_experience_relaxation",
                "mse_turnover_relaxation",
                "asked_documents",
                "specification_links",
                "quantity",
                "emd_amount",
            )}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createGemKeywordTender: ${error}`);
        });
}

export async function updateGemKeywordTenderScanDetailsById({
    id,
    document = null,
    start_date_time = null,
    end_date_time = null,
    ministry = null,
    department = null,
    organization = null,
    office = null,
    hod_email = null,
    buyer_email = null,
    buyer_phone = null,
    required_minimum_average_turnover = null,
    required_past_experice_years = null,
    mse_experience_relaxation = null,
    mse_turnover_relaxation = null,
    asked_documents = null,
    specification_links = null,
    quantity = 0,
    emd_amount = 0,
}) {
    const quantityValue = Number(quantity);
    const safeQuantity =
        Number.isFinite(quantityValue) && quantityValue > 0 ? Math.round(quantityValue) : 0;
    const emdValue = Number(emd_amount);
    const safeEmdAmount =
        Number.isFinite(emdValue) && emdValue > 0 ? Math.round(emdValue * 100) / 100 : 0;

    await executeSQLQuery(
        (sql) => sql`
            UPDATE GEM_KEYWORD_TENDERS
            SET
                document = ${document},
                start_date_time = ${toDbDateTime(start_date_time)},
                end_date_time = ${toDbDateTime(end_date_time)},
                ministry = ${ministry},
                department = ${department},
                organization = ${organization},
                office = ${office},
                hod_email = ${hod_email},
                buyer_email = ${buyer_email},
                buyer_phone = ${buyer_phone},
                required_minimum_average_turnover = ${required_minimum_average_turnover},
                required_past_experice_years = ${required_past_experice_years},
                mse_experience_relaxation = ${mse_experience_relaxation},
                mse_turnover_relaxation = ${mse_turnover_relaxation},
                asked_documents = ${asked_documents},
                specification_links = ${serializeSpecificationLinks(specification_links)},
                quantity = ${safeQuantity},
                emd_amount = ${safeEmdAmount}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateGemKeywordTenderScanDetailsById: ${error}`);
    });
}

export async function getGemKeywordTenderByTenderId({ tender_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM GEM_KEYWORD_TENDERS
            WHERE tender_id = ${tender_id}
            LIMIT 1
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getGemKeywordTenderByTenderId: ${error}`);
            return null;
        });
}

function getMonthRange(month) {
    const match = String(month || "").match(/^(\d{4})-(\d{2})$/);
    if (!match) {
        return null;
    }

    const year = Number(match[1]);
    const monthNumber = Number(match[2]);
    if (monthNumber < 1 || monthNumber > 12) {
        return null;
    }

    const lastDay = new Date(year, monthNumber, 0).getDate();
    return {
        start: `${match[1]}-${match[2]}-01 00:00:00`,
        end: `${match[1]}-${match[2]}-${String(lastDay).padStart(2, "0")} 23:59:59`,
    };
}

/** Detach tenders from keywords before keyword delete (keeps rows even if FK is CASCADE). */
export async function clearKeywordIdOnGemKeywordTendersByKeywordIds({ keyword_ids }) {
    const ids = [
        ...new Set(
            (Array.isArray(keyword_ids) ? keyword_ids : [])
                .map((id) => Number(id))
                .filter((id) => id >= 1),
        ),
    ];
    if (!ids.length) {
        return;
    }

    await executeSQLQuery(
        (sql) => sql`
            UPDATE GEM_KEYWORD_TENDERS
            SET keyword_id = NULL
            WHERE keyword_id IN ${sql(ids)}
        `,
    ).catch((error) => {
        logger.error(`clearKeywordIdOnGemKeywordTendersByKeywordIds: ${error}`);
    });
}

export async function getGemKeywordTendersByKeywordId({ keyword_id, month }) {
    const range = getMonthRange(month);
    if (!range) {
        return [];
    }

    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM GEM_KEYWORD_TENDERS
            WHERE keyword_id = ${keyword_id}
              AND hidden = FALSE
              AND end_date_time IS NOT NULL
              AND end_date_time >= ${range.start}
              AND end_date_time <= ${range.end}
            ORDER BY end_date_time ASC, id DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getGemKeywordTendersByKeywordId: ${error}`);
            return [];
        });
}

export async function getAllGemKeywordTenders({ from, to }) {
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
                GEM_KEYWORD_TENDERS.*,
                GEM_TENDER_KEYWORDS.keyword AS keyword,
                USERS.full_name AS assignee_full_name,
                USERS.email AS assignee_email
            FROM GEM_KEYWORD_TENDERS
            LEFT JOIN GEM_TENDER_KEYWORDS
                ON GEM_TENDER_KEYWORDS.id = GEM_KEYWORD_TENDERS.keyword_id
            LEFT JOIN USERS
                ON USERS.id = GEM_KEYWORD_TENDERS.assignee_user_id
            WHERE GEM_KEYWORD_TENDERS.end_date_time IS NOT NULL
              AND GEM_KEYWORD_TENDERS.end_date_time >= ${startDateTime}
              AND GEM_KEYWORD_TENDERS.end_date_time <= ${endDateTime}
            ORDER BY GEM_KEYWORD_TENDERS.end_date_time ASC, GEM_KEYWORD_TENDERS.id DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllGemKeywordTenders: ${error}`);
            return [];
        });
}

export async function getGemKeywordTenderById({ id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                GEM_KEYWORD_TENDERS.*,
                GEM_TENDER_KEYWORDS.keyword AS keyword,
                USERS.full_name AS assignee_full_name,
                USERS.email AS assignee_email
            FROM GEM_KEYWORD_TENDERS
            LEFT JOIN GEM_TENDER_KEYWORDS
                ON GEM_TENDER_KEYWORDS.id = GEM_KEYWORD_TENDERS.keyword_id
            LEFT JOIN USERS
                ON USERS.id = GEM_KEYWORD_TENDERS.assignee_user_id
            WHERE GEM_KEYWORD_TENDERS.id = ${id}
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getGemKeywordTenderById: ${error}`);
            return null;
        });
}

export async function updateGemKeywordTenderById({
    id,
    hidden,
    eligible,
    filed,
    quote,
    stage,
    assignee_user_id = null,
}) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE GEM_KEYWORD_TENDERS
            SET
                hidden = ${!!hidden},
                eligible = ${eligible},
                filed = ${!!filed},
                quote = ${quote},
                stage = ${stage},
                assignee_user_id = ${assignee_user_id}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateGemKeywordTenderById: ${error}`);
    });
}

/**
 * Atomic claim for "Assign to me": only updates when still unassigned.
 * @returns {Promise<boolean>} true if this request claimed the tender
 */
export async function claimUnassignedGemKeywordTenderById({
    id,
    hidden,
    eligible,
    filed,
    quote,
    stage,
    assignee_user_id,
}) {
    try {
        const result = await executeSQLQuery(
            (sql) => sql`
                UPDATE GEM_KEYWORD_TENDERS
                SET
                    hidden = ${!!hidden},
                    eligible = ${eligible},
                    filed = ${!!filed},
                    quote = ${quote},
                    stage = ${stage},
                    assignee_user_id = ${assignee_user_id}
                WHERE id = ${id}
                  AND assignee_user_id IS NULL
            `,
        );
        const affected = Number(result?.affectedRows ?? result?.changes ?? 0);
        return Number.isFinite(affected) && affected > 0;
    } catch (error) {
        logger.error(`claimUnassignedGemKeywordTenderById: ${error}`);
        return false;
    }
}

export async function getGemKeywordTendersPendingEligibilityReminder({
    older_than_datetime,
}) {
    const cutoff = toDbDateTime(older_than_datetime) || older_than_datetime;
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                GEM_KEYWORD_TENDERS.id,
                GEM_KEYWORD_TENDERS.tender_id,
                GEM_KEYWORD_TENDERS.end_date_time,
                GEM_KEYWORD_TENDERS.assignee_user_id,
                GEM_KEYWORD_TENDERS.eligibility_reminder_sent_on,
                GEM_TENDER_KEYWORDS.keyword AS keyword,
                USERS.full_name AS assignee_full_name,
                USERS.email AS assignee_email,
                USERS.personal_email AS assignee_personal_email
            FROM GEM_KEYWORD_TENDERS
            LEFT JOIN GEM_TENDER_KEYWORDS
                ON GEM_TENDER_KEYWORDS.id = GEM_KEYWORD_TENDERS.keyword_id
            INNER JOIN USERS
                ON USERS.id = GEM_KEYWORD_TENDERS.assignee_user_id
            WHERE GEM_KEYWORD_TENDERS.assignee_user_id IS NOT NULL
              AND GEM_KEYWORD_TENDERS.stage = ${GEM_KEYWORD_TENDER_STAGES.ASSIGNED}
              AND (
                    GEM_KEYWORD_TENDERS.eligibility_reminder_sent_on IS NULL
                 OR GEM_KEYWORD_TENDERS.eligibility_reminder_sent_on <= ${cutoff}
              )
            ORDER BY USERS.id ASC, GEM_KEYWORD_TENDERS.end_date_time ASC, GEM_KEYWORD_TENDERS.id ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getGemKeywordTendersPendingEligibilityReminder: ${error}`);
            return [];
        });
}

export async function stampGemKeywordTenderEligibilityReminders({ ids, sent_on = null }) {
    const tenderIds = (ids || [])
        .map((id) => Number(id))
        .filter((id) => id >= 1);
    if (!tenderIds.length) {
        return;
    }

    const stampedOn = toDbDateTime(sent_on) || getIstDateTime();
    await executeSQLQuery(
        (sql) => sql`
            UPDATE GEM_KEYWORD_TENDERS
            SET eligibility_reminder_sent_on = ${stampedOn}
            WHERE id IN ${sql(tenderIds)}
        `,
    ).catch((error) => {
        logger.error(`stampGemKeywordTenderEligibilityReminders: ${error}`);
    });
}

export async function markPastNewUnassignedGemKeywordTendersUnattended({
    as_of_datetime = null,
}) {
    const cutoff = toDbDateTime(as_of_datetime) || getIstDateTime();
    const dueIds = await executeSQLQuery(
        (sql) => sql`
            SELECT id
            FROM GEM_KEYWORD_TENDERS
            WHERE stage = ${GEM_KEYWORD_TENDER_STAGES.NEW}
              AND assignee_user_id IS NULL
              AND end_date_time IS NOT NULL
              AND end_date_time < ${cutoff}
        `,
    )
        .then((result) =>
            Array.from(result ?? [])
                .map((row) => Number(row.id))
                .filter((id) => id >= 1),
        )
        .catch((error) => {
            logger.error(`markPastNewUnassignedGemKeywordTendersUnattended select: ${error}`);
            return [];
        });

    if (!dueIds.length) {
        return 0;
    }

    await executeSQLQuery(
        (sql) => sql`
            UPDATE GEM_KEYWORD_TENDERS
            SET
                stage = ${GEM_KEYWORD_TENDER_STAGES.UNATTENDED},
                hidden = TRUE,
                filed = FALSE,
                eligible = ${GEM_KEYWORD_TENDER_ELIGIBILITY.NEED_TO_CHECK}
            WHERE id IN ${sql(dueIds)}
        `,
    ).catch((error) => {
        logger.error(`markPastNewUnassignedGemKeywordTendersUnattended update: ${error}`);
        return 0;
    });

    return dueIds.length;
}

/**
 * Past deadline + assignee + stage in Assigned / Waiting for docs /
 * Preparing docs / Eligible → Missed + hidden.
 */
export async function markPastAssignedGemKeywordTendersMissed({
    as_of_datetime = null,
}) {
    const cutoff = toDbDateTime(as_of_datetime) || getIstDateTime();
    const dueIds = await executeSQLQuery(
        (sql) => sql`
            SELECT id
            FROM GEM_KEYWORD_TENDERS
            WHERE assignee_user_id IS NOT NULL
              AND (
                    stage = ${GEM_KEYWORD_TENDER_STAGES.ASSIGNED}
                    OR stage = ${GEM_KEYWORD_TENDER_STAGES.WAITING_FOR_DOCS}
                    OR stage = ${GEM_KEYWORD_TENDER_STAGES.PREPARING_DOCS}
                    OR stage = ${GEM_KEYWORD_TENDER_STAGES.ELIGIBLE}
              )
              AND end_date_time IS NOT NULL
              AND end_date_time < ${cutoff}
        `,
    )
        .then((result) =>
            Array.from(result ?? [])
                .map((row) => Number(row.id))
                .filter((id) => id >= 1),
        )
        .catch((error) => {
            logger.error(`markPastAssignedGemKeywordTendersMissed select: ${error}`);
            return [];
        });

    if (!dueIds.length) {
        return 0;
    }

    await executeSQLQuery(
        (sql) => sql`
            UPDATE GEM_KEYWORD_TENDERS
            SET
                stage = ${GEM_KEYWORD_TENDER_STAGES.MISSED},
                hidden = TRUE,
                filed = FALSE,
                eligible = ${GEM_KEYWORD_TENDER_ELIGIBILITY.NEED_TO_CHECK}
            WHERE id IN ${sql(dueIds)}
        `,
    ).catch((error) => {
        logger.error(`markPastAssignedGemKeywordTendersMissed update: ${error}`);
        return 0;
    });

    return dueIds.length;
}
