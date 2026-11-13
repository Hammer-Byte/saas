import { logger } from "@hammerbyte/utils";
import { GEM_TENDER_STAGES } from "../constants.js";
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

export async function createGemTender({
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
            INSERT INTO GEM_TENDERS ${sql(
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
            logger.error(`createGemTender: ${error}`);
        });
}

export async function updateGemTenderScanDetailsById({
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
            UPDATE GEM_TENDERS
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
        logger.error(`updateGemTenderScanDetailsById: ${error}`);
    });
}

export async function getGemTenderByTenderId({ tender_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM GEM_TENDERS
            WHERE tender_id = ${tender_id}
            LIMIT 1
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getGemTenderByTenderId: ${error}`);
            return null;
        });
}

export async function getAllGemTenders({ from, to }) {
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
                GEM_TENDERS.*,
                GEM_CATEGORY_GROUPS.name AS category_group_name,
                GEM_TENDER_CATEGORIES.name AS tender_category_name,
                USERS.full_name AS assignee_full_name,
                USERS.email AS assignee_email
            FROM GEM_TENDERS
            LEFT JOIN GEM_CATEGORY_GROUPS
                ON GEM_CATEGORY_GROUPS.id = GEM_TENDERS.category_group_id
            LEFT JOIN GEM_TENDER_CATEGORIES
                ON GEM_TENDER_CATEGORIES.id = GEM_TENDERS.tender_category_id
            LEFT JOIN USERS
                ON USERS.id = GEM_TENDERS.assignee_user_id
            WHERE GEM_TENDERS.end_date_time IS NOT NULL
              AND GEM_TENDERS.end_date_time >= ${startDateTime}
              AND GEM_TENDERS.end_date_time <= ${endDateTime}
            ORDER BY GEM_TENDERS.end_date_time ASC, GEM_TENDERS.id DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllGemTenders: ${error}`);
            return [];
        });
}

/** Find tenders by tender ID, buyer, category or assignee name, regardless of end date. */
export async function searchGemTenders({ search }) {
    const term = String(search || "").trim().slice(0, 128);
    if (term.length < 2) return [];
    const like = `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                GEM_TENDERS.*,
                GEM_CATEGORY_GROUPS.name AS category_group_name,
                GEM_TENDER_CATEGORIES.name AS tender_category_name,
                USERS.full_name AS assignee_full_name,
                USERS.email AS assignee_email
            FROM GEM_TENDERS
            LEFT JOIN GEM_CATEGORY_GROUPS
                ON GEM_CATEGORY_GROUPS.id = GEM_TENDERS.category_group_id
            LEFT JOIN GEM_TENDER_CATEGORIES
                ON GEM_TENDER_CATEGORIES.id = GEM_TENDERS.tender_category_id
            LEFT JOIN USERS
                ON USERS.id = GEM_TENDERS.assignee_user_id
            WHERE GEM_TENDERS.tender_id LIKE ${like}
               OR GEM_TENDERS.ministry LIKE ${like}
               OR GEM_TENDERS.department LIKE ${like}
               OR GEM_TENDERS.organization LIKE ${like}
               OR GEM_TENDERS.office LIKE ${like}
               OR GEM_TENDERS.buyer_name LIKE ${like}
               OR GEM_TENDER_CATEGORIES.name LIKE ${like}
               OR USERS.full_name LIKE ${like}
            ORDER BY GEM_TENDERS.end_date_time DESC, GEM_TENDERS.id DESC
            LIMIT 300
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`searchGemTenders: ${error}`);
            return [];
        });
}

/**
 * Per assignee: current open workload (no date filter) and tenders missed with a due date in the range.
 * Unassigned tenders that went unattended in the range come back as one row with assignee_user_id NULL.
 */
export async function getGemTenderAssigneeWorkload({ from, to }) {
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
                GEM_TENDERS.assignee_user_id,
                USERS.full_name AS assignee_full_name,
                USERS.email AS assignee_email,
                SUM(
                    GEM_TENDERS.assignee_user_id IS NOT NULL
                    AND GEM_TENDERS.locked = 0
                    AND GEM_TENDERS.eligible = FALSE
                    AND GEM_TENDERS.ineligible = FALSE
                    AND GEM_TENDERS.out_of_scope = FALSE
                ) AS open_undecided,
                SUM(
                    GEM_TENDERS.assignee_user_id IS NOT NULL
                    AND GEM_TENDERS.locked = 0
                    AND GEM_TENDERS.eligible = TRUE
                    AND (GEM_TENDERS.stage IS NULL OR GEM_TENDERS.stage <> ${GEM_TENDER_STAGES.FILED})
                ) AS open_in_progress,
                SUM(
                    GEM_TENDERS.missed = TRUE
                    AND GEM_TENDERS.end_date_time >= ${startDateTime}
                    AND GEM_TENDERS.end_date_time <= ${endDateTime}
                ) AS missed_in_range,
                SUM(
                    GEM_TENDERS.unattended = TRUE
                    AND GEM_TENDERS.end_date_time >= ${startDateTime}
                    AND GEM_TENDERS.end_date_time <= ${endDateTime}
                ) AS unattended_in_range
            FROM GEM_TENDERS
            LEFT JOIN USERS
                ON USERS.id = GEM_TENDERS.assignee_user_id
            WHERE GEM_TENDERS.assignee_user_id IS NOT NULL
               OR (
                    GEM_TENDERS.unattended = TRUE
                    AND GEM_TENDERS.end_date_time >= ${startDateTime}
                    AND GEM_TENDERS.end_date_time <= ${endDateTime}
               )
            GROUP BY GEM_TENDERS.assignee_user_id, USERS.full_name, USERS.email
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getGemTenderAssigneeWorkload: ${error}`);
            return [];
        });
}

export async function getGemTenderById({ id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                GEM_TENDERS.*,
                GEM_CATEGORY_GROUPS.name AS category_group_name,
                GEM_TENDER_CATEGORIES.name AS tender_category_name,
                USERS.full_name AS assignee_full_name,
                USERS.email AS assignee_email
            FROM GEM_TENDERS
            LEFT JOIN GEM_CATEGORY_GROUPS
                ON GEM_CATEGORY_GROUPS.id = GEM_TENDERS.category_group_id
            LEFT JOIN GEM_TENDER_CATEGORIES
                ON GEM_TENDER_CATEGORIES.id = GEM_TENDERS.tender_category_id
            LEFT JOIN USERS
                ON USERS.id = GEM_TENDERS.assignee_user_id
            WHERE GEM_TENDERS.id = ${id}
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getGemTenderById: ${error}`);
            return null;
        });
}

/**
 * Partial update: only columns present on `patch` are written.
 * Pass explicit `null` to clear nullable fields. Omit a key to leave it unchanged.
 */
export async function updateGemTenderById(patch = {}) {
    const id = Number(patch.id);
    if (!(id >= 1)) {
        throw new Error("updateGemTenderById: invalid id");
    }

    const has = (key) => Object.prototype.hasOwnProperty.call(patch, key);
    const assignments = [];

    const pushAssignment = (column, value) => {
        assignments.push({ column, value });
    };

    if (has("hidden")) {
        pushAssignment("hidden", !!patch.hidden);
    }
    for (const flag of ["eligible", "ineligible", "out_of_scope", "missed", "unattended"]) {
        if (has(flag)) {
            pushAssignment(flag, !!patch[flag]);
        }
    }
    if (has("filed")) {
        pushAssignment("filed", !!patch.filed);
    }
    if (has("quote")) {
        pushAssignment("quote", patch.quote == null ? null : String(patch.quote));
    }
    if (has("stage")) {
        pushAssignment("stage", patch.stage == null ? null : String(patch.stage));
    }
    if (has("assignee_user_id")) {
        const assigneeId =
            patch.assignee_user_id != null && Number(patch.assignee_user_id) >= 1
                ? Number(patch.assignee_user_id)
                : null;
        pushAssignment("assignee_user_id", assigneeId);
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
                        return sql`UPDATE GEM_TENDERS SET hidden = ${value} WHERE id = ${id}`;
                    case "eligible":
                        return sql`UPDATE GEM_TENDERS SET eligible = ${value} WHERE id = ${id}`;
                    case "ineligible":
                        return sql`UPDATE GEM_TENDERS SET ineligible = ${value} WHERE id = ${id}`;
                    case "out_of_scope":
                        return sql`UPDATE GEM_TENDERS SET out_of_scope = ${value} WHERE id = ${id}`;
                    case "missed":
                        return sql`UPDATE GEM_TENDERS SET missed = ${value} WHERE id = ${id}`;
                    case "unattended":
                        return sql`UPDATE GEM_TENDERS SET unattended = ${value} WHERE id = ${id}`;
                    case "filed":
                        return sql`UPDATE GEM_TENDERS SET filed = ${value} WHERE id = ${id}`;
                    case "quote":
                        return sql`UPDATE GEM_TENDERS SET quote = ${value} WHERE id = ${id}`;
                    case "stage":
                        return sql`UPDATE GEM_TENDERS SET stage = ${value} WHERE id = ${id}`;
                    case "assignee_user_id":
                        return sql`UPDATE GEM_TENDERS SET assignee_user_id = ${value} WHERE id = ${id}`;
                    case "category_group_id":
                        return sql`UPDATE GEM_TENDERS SET category_group_id = ${value} WHERE id = ${id}`;
                    case "tender_category_id":
                        return sql`UPDATE GEM_TENDERS SET tender_category_id = ${value} WHERE id = ${id}`;
                    case "locked":
                        return sql`UPDATE GEM_TENDERS SET locked = ${value} WHERE id = ${id}`;
                    case "lock_message":
                        return sql`UPDATE GEM_TENDERS SET lock_message = ${value} WHERE id = ${id}`;
                    default:
                        throw new Error(`updateGemTenderById: unknown column ${column}`);
                }
            });
        }
        return true;
    } catch (error) {
        logger.error(`updateGemTenderById: ${error}`);
        throw error;
    }
}

/** Unlock only — never touches stage, assignee, category, or quote. */
export async function unlockGemTenderById({ id }) {
    const tenderId = Number(id);
    if (!(tenderId >= 1)) {
        throw new Error("unlockGemTenderById: invalid id");
    }
    try {
        await executeSQLQuery(
            (sql) => sql`
                UPDATE GEM_TENDERS
                SET
                    locked = 0,
                    lock_message = NULL,
                    hidden = FALSE
                WHERE id = ${tenderId}
            `,
        );
        return true;
    } catch (error) {
        logger.error(`unlockGemTenderById: ${error}`);
        throw error;
    }
}

/**
 * Atomic claim for "Assign to me": only updates when still unassigned.
 * @returns {Promise<boolean>} true if this request claimed the tender
 */
export async function claimUnassignedGemTenderById({ id, assignee_user_id }) {
    try {
        const result = await executeSQLQuery(
            (sql) => sql`
                UPDATE GEM_TENDERS
                SET assignee_user_id = ${assignee_user_id}
                WHERE id = ${id}
                  AND assignee_user_id IS NULL
                  AND (locked IS NULL OR locked = 0)
            `,
        );
        const affected = Number(result?.affectedRows ?? result?.changes ?? 0);
        return Number.isFinite(affected) && affected > 0;
    } catch (error) {
        logger.error(`claimUnassignedGemTenderById: ${error}`);
        return false;
    }
}

export async function getGemTendersPendingEligibilityReminder({
    older_than_datetime,
}) {
    const cutoff = toDbDateTime(older_than_datetime) || older_than_datetime;
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                GEM_TENDERS.id,
                GEM_TENDERS.tender_id,
                GEM_TENDERS.end_date_time,
                GEM_TENDERS.assignee_user_id,
                GEM_TENDERS.eligibility_reminder_sent_on,
                GEM_CATEGORY_GROUPS.name AS category_group_name,
                USERS.full_name AS assignee_full_name,
                USERS.email AS assignee_email,
                USERS.personal_email AS assignee_personal_email
            FROM GEM_TENDERS
            LEFT JOIN GEM_CATEGORY_GROUPS
                ON GEM_CATEGORY_GROUPS.id = GEM_TENDERS.category_group_id
            INNER JOIN USERS
                ON USERS.id = GEM_TENDERS.assignee_user_id
            WHERE GEM_TENDERS.assignee_user_id IS NOT NULL
              AND GEM_TENDERS.eligible = FALSE
              AND GEM_TENDERS.ineligible = FALSE
              AND GEM_TENDERS.out_of_scope = FALSE
              AND (GEM_TENDERS.locked IS NULL OR GEM_TENDERS.locked = 0)
              AND (
                    GEM_TENDERS.eligibility_reminder_sent_on IS NULL
                 OR GEM_TENDERS.eligibility_reminder_sent_on <= ${cutoff}
              )
            ORDER BY USERS.id ASC, GEM_TENDERS.end_date_time ASC, GEM_TENDERS.id ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getGemTendersPendingEligibilityReminder: ${error}`);
            return [];
        });
}

export async function stampGemTenderEligibilityReminders({ ids, sent_on = null }) {
    const tenderIds = (ids || [])
        .map((id) => Number(id))
        .filter((id) => id >= 1);
    if (!tenderIds.length) {
        return;
    }

    const stampedOn = toDbDateTime(sent_on) || getIstDateTime();
    await executeSQLQuery(
        (sql) => sql`
            UPDATE GEM_TENDERS
            SET eligibility_reminder_sent_on = ${stampedOn}
            WHERE id IN ${sql(tenderIds)}
        `,
    ).catch((error) => {
        logger.error(`stampGemTenderEligibilityReminders: ${error}`);
    });
}

async function lockDueTendersWithFlag({ label, flag, lock_message, selectDueIds }) {
    const dueIds = await executeSQLQuery(selectDueIds)
        .then((result) =>
            Array.from(result ?? [])
                .map((row) => Number(row.id))
                .filter((id) => id >= 1),
        )
        .catch((error) => {
            logger.error(`${label} select: ${error}`);
            return [];
        });

    if (!dueIds.length) {
        return 0;
    }

    const message = String(lock_message || "");
    const updated = await executeSQLQuery((sql) =>
        flag === "missed"
            ? sql`
                UPDATE GEM_TENDERS
                SET missed = TRUE, locked = 1, lock_message = ${message}, hidden = TRUE
                WHERE id IN ${sql(dueIds)}
                  AND (locked IS NULL OR locked = 0)
            `
            : sql`
                UPDATE GEM_TENDERS
                SET unattended = TRUE, locked = 1, lock_message = ${message}, hidden = TRUE
                WHERE id IN ${sql(dueIds)}
                  AND (locked IS NULL OR locked = 0)
            `,
    )
        .then(() => true)
        .catch((error) => {
            logger.error(`${label} update: ${error}`);
            return false;
        });

    return updated ? dueIds.length : 0;
}

/**
 * Past due + assignee + not marked ineligible / out of scope → missed + locked.
 * Covers both eligible and still-undecided tenders. Never touches stage or assignee.
 * Tenders already flagged missed/unattended are skipped, so an admin unlock sticks.
 */
export async function markMissedGemTenders({ as_of_datetime = null, lock_message }) {
    const cutoff = toDbDateTime(as_of_datetime) || getIstDateTime();
    return await lockDueTendersWithFlag({
        label: "markMissedGemTenders",
        flag: "missed",
        lock_message,
        selectDueIds: (sql) => sql`
            SELECT id
            FROM GEM_TENDERS
            WHERE assignee_user_id IS NOT NULL
              AND (locked IS NULL OR locked = 0)
              AND missed = FALSE
              AND unattended = FALSE
              AND ineligible = FALSE
              AND out_of_scope = FALSE
              AND (stage IS NULL OR stage <> ${GEM_TENDER_STAGES.FILED})
              AND end_date_time IS NOT NULL
              AND end_date_time < ${cutoff}
        `,
    });
}

/**
 * Past due + no assignee + no eligibility decision → unattended + locked.
 * Never touches stage or assignee.
 */
export async function markUnattendedGemTenders({ as_of_datetime = null, lock_message }) {
    const cutoff = toDbDateTime(as_of_datetime) || getIstDateTime();
    return await lockDueTendersWithFlag({
        label: "markUnattendedGemTenders",
        flag: "unattended",
        lock_message,
        selectDueIds: (sql) => sql`
            SELECT id
            FROM GEM_TENDERS
            WHERE assignee_user_id IS NULL
              AND (locked IS NULL OR locked = 0)
              AND missed = FALSE
              AND unattended = FALSE
              AND eligible = FALSE
              AND ineligible = FALSE
              AND out_of_scope = FALSE
              AND end_date_time IS NOT NULL
              AND end_date_time < ${cutoff}
        `,
    });
}
