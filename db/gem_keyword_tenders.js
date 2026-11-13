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

function asMseFlag(value) {
    if (value === true || value === 1 || value === "1") return 1;
    if (value === false || value === 0 || value === "0") return 0;
    return null;
}

export async function createGemKeywordTender({
    category_group_id = null,
    tender_category_id = null,
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
    buyer_name = null,
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
                    category_group_id:
                        category_group_id != null && Number(category_group_id) >= 1
                            ? Number(category_group_id)
                            : null,
                    tender_category_id:
                        tender_category_id != null && Number(tender_category_id) >= 1
                            ? Number(tender_category_id)
                            : null,
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
                    buyer_name,
                    required_minimum_average_turnover,
                    required_past_experice_years,
                    mse_experience_relaxation: asMseFlag(mse_experience_relaxation),
                    mse_turnover_relaxation: asMseFlag(mse_turnover_relaxation),
                    asked_documents,
                    specification_links: serializeSpecificationLinks(specification_links),
                    quantity: safeQuantity,
                    emd_amount: safeEmdAmount,
                },
                "category_group_id",
                "tender_category_id",
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
                "buyer_name",
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
    buyer_name = null,
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
                buyer_name = ${buyer_name},
                required_minimum_average_turnover = ${required_minimum_average_turnover},
                required_past_experice_years = ${required_past_experice_years},
                mse_experience_relaxation = ${asMseFlag(mse_experience_relaxation)},
                mse_turnover_relaxation = ${asMseFlag(mse_turnover_relaxation)},
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
                GEM_CATEGORY_GROUPS.name AS category_group_name,
                GEM_TENDER_CATEGORIES.name AS tender_category_name,
                USERS.full_name AS assignee_full_name,
                USERS.email AS assignee_email
            FROM GEM_KEYWORD_TENDERS
            LEFT JOIN GEM_CATEGORY_GROUPS
                ON GEM_CATEGORY_GROUPS.id = GEM_KEYWORD_TENDERS.category_group_id
            LEFT JOIN GEM_TENDER_CATEGORIES
                ON GEM_TENDER_CATEGORIES.id = GEM_KEYWORD_TENDERS.tender_category_id
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

/** New tenders created per calendar day (by created_on wall-clock date). */
export async function getGemKeywordTenderNewCountsByCreatedDay({ from, to }) {
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
                DATE(GEM_KEYWORD_TENDERS.created_on) AS entry_date,
                COUNT(GEM_KEYWORD_TENDERS.id) AS entry_count
            FROM GEM_KEYWORD_TENDERS
            WHERE GEM_KEYWORD_TENDERS.created_on >= ${startDateTime}
              AND GEM_KEYWORD_TENDERS.created_on <= ${endDateTime}
            GROUP BY DATE(GEM_KEYWORD_TENDERS.created_on)
            ORDER BY entry_date ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getGemKeywordTenderNewCountsByCreatedDay: ${error}`);
            return [];
        });
}

export async function getGemKeywordTenderById({ id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                GEM_KEYWORD_TENDERS.*,
                GEM_CATEGORY_GROUPS.name AS category_group_name,
                GEM_TENDER_CATEGORIES.name AS tender_category_name,
                USERS.full_name AS assignee_full_name,
                USERS.email AS assignee_email
            FROM GEM_KEYWORD_TENDERS
            LEFT JOIN GEM_CATEGORY_GROUPS
                ON GEM_CATEGORY_GROUPS.id = GEM_KEYWORD_TENDERS.category_group_id
            LEFT JOIN GEM_TENDER_CATEGORIES
                ON GEM_TENDER_CATEGORIES.id = GEM_KEYWORD_TENDERS.tender_category_id
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

/**
 * Partial update: only columns present on `patch` are written.
 * Pass explicit `null` to clear nullable fields. Omit a key to leave it unchanged.
 */
export async function updateGemKeywordTenderById(patch = {}) {
    const id = Number(patch.id);
    if (!(id >= 1)) {
        throw new Error("updateGemKeywordTenderById: invalid id");
    }

    const has = (key) => Object.prototype.hasOwnProperty.call(patch, key);
    const assignments = [];

    const queueAssignment = (column, value) => {
        assignments.push({ column, value });
    };

    if (has("hidden")) {
        queueAssignment("hidden", !!patch.hidden);
    }
    if (has("eligible")) {
        queueAssignment("eligible", patch.eligible);
    }
    if (has("filed")) {
        queueAssignment("filed", !!patch.filed);
    }
    if (has("quote")) {
        queueAssignment("quote", patch.quote == null ? null : String(patch.quote));
    }
    if (has("stage")) {
        queueAssignment("stage", patch.stage == null ? null : String(patch.stage));
    }
    if (has("assignee_user_id")) {
        const assigneeId =
            patch.assignee_user_id != null && Number(patch.assignee_user_id) >= 1
                ? Number(patch.assignee_user_id)
                : null;
        queueAssignment("assignee_user_id", assigneeId);
    }
    if (has("category_group_id")) {
        const groupId =
            patch.category_group_id != null && Number(patch.category_group_id) >= 1
                ? Number(patch.category_group_id)
                : null;
        pushAssignment("category_group_id", groupId);
    }
    if (has("tender_category_id")) {
        const categoryId =
            patch.tender_category_id != null && Number(patch.tender_category_id) >= 1
                ? Number(patch.tender_category_id)
                : null;
        pushAssignment("tender_category_id", categoryId);
    }
    if (has("locked")) {
        const locked = !!patch.locked;
        pushAssignment("locked", locked ? 1 : 0);
        if (!locked) {
            // Unlock always clears the message.
            pushAssignment("lock_message", null);
        } else if (has("lock_message")) {
            pushAssignment(
                "lock_message",
                patch.lock_message != null && String(patch.lock_message).trim()
                    ? String(patch.lock_message).trim()
                    : null,
            );
        }
    } else if (has("lock_message")) {
        pushAssignment(
            "lock_message",
            patch.lock_message != null && String(patch.lock_message).trim()
                ? String(patch.lock_message).trim()
                : null,
        );
    }

    if (!assignments.length) {
        return true;
    }

    try {
        // Bun SQL tagged templates don't support dynamic column lists safely;
        // apply each trusted column with a bound value.
        for (const { column, value } of assignments) {
            await executeSQLQuery((sql) => {
                switch (column) {
                    case "hidden":
                        return sql`UPDATE GEM_KEYWORD_TENDERS SET hidden = ${value} WHERE id = ${id}`;
                    case "eligible":
                        return sql`UPDATE GEM_KEYWORD_TENDERS SET eligible = ${value} WHERE id = ${id}`;
                    case "filed":
                        return sql`UPDATE GEM_KEYWORD_TENDERS SET filed = ${value} WHERE id = ${id}`;
                    case "quote":
                        return sql`UPDATE GEM_KEYWORD_TENDERS SET quote = ${value} WHERE id = ${id}`;
                    case "stage":
                        return sql`UPDATE GEM_KEYWORD_TENDERS SET stage = ${value} WHERE id = ${id}`;
                    case "assignee_user_id":
                        return sql`UPDATE GEM_KEYWORD_TENDERS SET assignee_user_id = ${value} WHERE id = ${id}`;
                    case "category_group_id":
                        return sql`UPDATE GEM_KEYWORD_TENDERS SET category_group_id = ${value} WHERE id = ${id}`;
                    case "tender_category_id":
                        return sql`UPDATE GEM_KEYWORD_TENDERS SET tender_category_id = ${value} WHERE id = ${id}`;
                    case "locked":
                        return sql`UPDATE GEM_KEYWORD_TENDERS SET locked = ${value} WHERE id = ${id}`;
                    case "lock_message":
                        return sql`UPDATE GEM_KEYWORD_TENDERS SET lock_message = ${value} WHERE id = ${id}`;
                    default:
                        throw new Error(`updateGemKeywordTenderById: unknown column ${column}`);
                }
            });
        }
        return true;
    } catch (error) {
        logger.error(`updateGemKeywordTenderById: ${error}`);
        throw error;
    }
}

/** Unlock only — never touches stage, assignee, category, or quote. */
export async function unlockGemKeywordTenderById({ id }) {
    const tenderId = Number(id);
    if (!(tenderId >= 1)) {
        throw new Error("unlockGemKeywordTenderById: invalid id");
    }
    try {
        await executeSQLQuery(
            (sql) => sql`
                UPDATE GEM_KEYWORD_TENDERS
                SET
                    locked = 0,
                    lock_message = NULL,
                    hidden = FALSE
                WHERE id = ${tenderId}
            `,
        );
        return true;
    } catch (error) {
        logger.error(`unlockGemKeywordTenderById: ${error}`);
        throw error;
    }
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
                GEM_CATEGORY_GROUPS.name AS category_group_name,
                USERS.full_name AS assignee_full_name,
                USERS.email AS assignee_email,
                USERS.personal_email AS assignee_personal_email
            FROM GEM_KEYWORD_TENDERS
            LEFT JOIN GEM_CATEGORY_GROUPS
                ON GEM_CATEGORY_GROUPS.id = GEM_KEYWORD_TENDERS.category_group_id
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

/**
 * Past due + new + unassigned → lock (do not change stage).
 */
export async function markPastNewUnassignedGemKeywordTendersLocked({
    as_of_datetime = null,
    lock_message,
}) {
    const cutoff = toDbDateTime(as_of_datetime) || getIstDateTime();
    const dueIds = await executeSQLQuery(
        (sql) => sql`
            SELECT id
            FROM GEM_KEYWORD_TENDERS
            WHERE stage = ${GEM_KEYWORD_TENDER_STAGES.NEW}
              AND assignee_user_id IS NULL
              AND (locked IS NULL OR locked = 0)
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
            logger.error(`markPastNewUnassignedGemKeywordTendersLocked select: ${error}`);
            return [];
        });

    if (!dueIds.length) {
        return 0;
    }

    await executeSQLQuery(
        (sql) => sql`
            UPDATE GEM_KEYWORD_TENDERS
            SET
                locked = 1,
                lock_message = ${String(lock_message || "")},
                hidden = TRUE
            WHERE id IN ${sql(dueIds)}
        `,
    ).catch((error) => {
        logger.error(`markPastNewUnassignedGemKeywordTendersLocked update: ${error}`);
        return 0;
    });

    return dueIds.length;
}

/**
 * Past deadline + assignee + active pipeline → lock (do not change stage).
 */
export async function markPastAssignedGemKeywordTendersLocked({
    as_of_datetime = null,
    lock_message,
}) {
    const cutoff = toDbDateTime(as_of_datetime) || getIstDateTime();
    const dueIds = await executeSQLQuery(
        (sql) => sql`
            SELECT id
            FROM GEM_KEYWORD_TENDERS
            WHERE assignee_user_id IS NOT NULL
              AND (locked IS NULL OR locked = 0)
              AND (
                    stage = ${GEM_KEYWORD_TENDER_STAGES.ASSIGNED}
                    OR stage = ${GEM_KEYWORD_TENDER_STAGES.ELIGIBLE}
                    OR stage = ${GEM_KEYWORD_TENDER_STAGES.WAITING_FOR_DOCS}
                    OR stage = ${GEM_KEYWORD_TENDER_STAGES.WAITING_FOR_GEM}
                    OR stage = ${GEM_KEYWORD_TENDER_STAGES.WAITING_FOR_QUOTE}
                    OR stage = ${GEM_KEYWORD_TENDER_STAGES.PREPARING_DOCS}
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
            logger.error(`markPastAssignedGemKeywordTendersLocked select: ${error}`);
            return [];
        });

    if (!dueIds.length) {
        return 0;
    }

    await executeSQLQuery(
        (sql) => sql`
            UPDATE GEM_KEYWORD_TENDERS
            SET
                locked = 1,
                lock_message = ${String(lock_message || "")},
                hidden = TRUE
            WHERE id IN ${sql(dueIds)}
        `,
    ).catch((error) => {
        logger.error(`markPastAssignedGemKeywordTendersLocked update: ${error}`);
        return 0;
    });

    return dueIds.length;
}

