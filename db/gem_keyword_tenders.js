import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";
import { toDbDateTime } from "../libs/date.js";

export async function createGemKeywordTender({
    keyword_id,
    tender_id,
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
}) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO GEM_KEYWORD_TENDERS ${sql(
                {
                    keyword_id,
                    tender_id,
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
                },
                "keyword_id",
                "tender_id",
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
            )}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createGemKeywordTender: ${error}`);
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

export async function getGemKeywordTenderById({ id }) {
    return await executeSQLQuery((sql) => sql`SELECT * FROM GEM_KEYWORD_TENDERS WHERE id = ${id}`)
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getGemKeywordTenderById: ${error}`);
            return null;
        });
}
