import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";
import { toDbDateTime } from "../libs/date.js";

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
}) {
    const quantityValue = Number(quantity);
    const safeQuantity =
        Number.isFinite(quantityValue) && quantityValue > 0 ? Math.round(quantityValue) : 0;

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
}) {
    const quantityValue = Number(quantity);
    const safeQuantity =
        Number.isFinite(quantityValue) && quantityValue > 0 ? Math.round(quantityValue) : 0;

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
                quantity = ${safeQuantity}
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
            INNER JOIN GEM_TENDER_KEYWORDS
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
            INNER JOIN GEM_TENDER_KEYWORDS
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
