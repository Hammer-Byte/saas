import {
    AUTHORITIES,
    GEM_KEYWORD_TENDER_ELIGIBILITY,
    GEM_KEYWORD_TENDER_STAGE_LABELS,
    GEM_KEYWORD_TENDER_STAGES,
    GEM_KEYWORD_TENDER_TERMINAL_STAGES,
    GEM_TENDER_LOCK_MESSAGES,
    GEM_TENDER_SCAN_TYPES,
} from "../constants.js";
import { createGemKeywordTenderActivity } from "../db/gem_keyword_tender_activities.js";
import { createGemKeywordTenderComment } from "../db/gem_keyword_tender_comments.js";
import { getGemCategoryGroupById } from "../db/gem_category_groups.js";
import {
    claimUnassignedGemKeywordTenderById,
    getAllGemKeywordTenders,
    getGemKeywordTenderById,
    updateGemKeywordTenderById,
} from "../db/gem_keyword_tenders.js";
import { getGemTenderCategoryById } from "../db/gem_tender_categories.js";
import {
    createGemTenderScanRun,
    getGemTenderScanRunById,
} from "../db/gem_tender_scan_runs.js";
import { getUserById } from "../db/users.js";
import { hasAuthority } from "../libs/app_page.js";
import {
    notifyGemKeywordTenderAssigned,
    notifyGemKeywordTenderQuoteRequested,
} from "../libs/gem_tender_notify.js";
import { crawlGemForTenders, processing } from "../libs/tenderer.js";
import { getCurrentUser } from "./authentication.js";

const STAGE_VALUES = new Set(Object.values(GEM_KEYWORD_TENDER_STAGES));

/** Quote stays disabled in these stages (assignee / super_admin can edit otherwise). */
const QUOTE_DISABLED_STAGES = new Set([
    GEM_KEYWORD_TENDER_STAGES.NEW,
    GEM_KEYWORD_TENDER_STAGES.ASSIGNED,
    GEM_KEYWORD_TENDER_STAGES.FILED,
]);

/** @deprecated locks replaced system-managed stages */
export const SYSTEM_MANAGED_STAGES = new Set();

/** One-way stages: once set, only super admin may change stage (or other fields). */
export const TERMINAL_STAGES = new Set(GEM_KEYWORD_TENDER_TERMINAL_STAGES);

const LOCK_ACTION_MESSAGES = {
    out_of_scope: GEM_TENDER_LOCK_MESSAGES.OUT_OF_SCOPE,
    not_eligible: GEM_TENDER_LOCK_MESSAGES.NOT_ELIGIBLE,
};

const ASSIGNEE_REQUIRED_STAGES = new Set([
    GEM_KEYWORD_TENDER_STAGES.ASSIGNED,
    GEM_KEYWORD_TENDER_STAGES.WAITING_FOR_DOCS,
    GEM_KEYWORD_TENDER_STAGES.WAITING_FOR_GEM,
    GEM_KEYWORD_TENDER_STAGES.WAITING_FOR_QUOTE,
    GEM_KEYWORD_TENDER_STAGES.PREPARING_DOCS,
]);

const UNASSIGN_RESET_STAGES = new Set([
    GEM_KEYWORD_TENDER_STAGES.ASSIGNED,
    GEM_KEYWORD_TENDER_STAGES.WAITING_FOR_DOCS,
    GEM_KEYWORD_TENDER_STAGES.WAITING_FOR_GEM,
    GEM_KEYWORD_TENDER_STAGES.WAITING_FOR_QUOTE,
    GEM_KEYWORD_TENDER_STAGES.PREPARING_DOCS,
]);

function stageLabel(stage) {
    return GEM_KEYWORD_TENDER_STAGE_LABELS[stage] || stage || "-";
}

export function isSystemManagedStage(_stage) {
    return false;
}

export function isTerminalStage(stage) {
    return TERMINAL_STAGES.has(normalizeStage(stage));
}

export function isTenderLocked(tenderOrLocked) {
    if (tenderOrLocked && typeof tenderOrLocked === "object") {
        return !!Number(tenderOrLocked.locked);
    }
    return !!Number(tenderOrLocked);
}

export function isQuoteStageEnabled(stage) {
    return !QUOTE_DISABLED_STAGES.has(normalizeStage(stage));
}

/**
 * Stage / quote / docs:
 * - Locked or filed: super_admin only
 * - Otherwise with assignee: assignee or super_admin
 */
export function canOperateAssignedTender({
    currentUser,
    assigneeUserId,
    stage = null,
    locked = false,
}) {
    if (!currentUser?.id) {
        return false;
    }
    if (currentUser.super_admin) {
        return true;
    }
    if (locked || (stage != null && isTerminalStage(stage))) {
        return false;
    }
    const assigneeId = assigneeUserId ? Number(assigneeUserId) : null;
    return assigneeId >= 1 && assigneeId === Number(currentUser.id);
}

function assigneeLabel(user) {
    if (!user) return "Unassigned";
    return user.full_name || user.email || `User #${user.id}`;
}

function tenderAssigneeDisplayName(tender) {
    if (!tender?.assignee_user_id) return "another user";
    return (
        tender.assignee_full_name ||
        tender.assignee_email ||
        `User #${tender.assignee_user_id}`
    );
}

async function alreadyAssignedConflict({ tenderId, set }) {
    const fresh = (await getGemKeywordTenderById({ id: tenderId })) || null;
    const name = tenderAssigneeDisplayName(fresh);
    set.status = 409;
    return {
        error: `Failed to assign. Already assigned to ${name}.`,
        code: "already_assigned",
        gemKeywordTender: fresh,
    };
}

function asText(value) {
    return value == null ? "" : String(value);
}

function quotePreview(value) {
    const text = asText(value).trim().replace(/\s+/g, " ");
    if (!text) return "";
    return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

function normalizeStage(value) {
    if (STAGE_VALUES.has(value)) {
        return value;
    }
    if (value === "work_in_progress") {
        return GEM_KEYWORD_TENDER_STAGES.ASSIGNED;
    }
    if (
        value === "requested_for_quote" ||
        value === "waiting_for_technical" ||
        value === "waiting_for_financial"
    ) {
        return GEM_KEYWORD_TENDER_STAGES.ELIGIBLE;
    }
    return GEM_KEYWORD_TENDER_STAGES.NEW;
}

function flagsForStage(stage) {
    switch (stage) {
        case GEM_KEYWORD_TENDER_STAGES.FILED:
            return {
                hidden: false,
                filed: true,
                eligible: GEM_KEYWORD_TENDER_ELIGIBILITY.ELIGIBLE,
            };
        case GEM_KEYWORD_TENDER_STAGES.ELIGIBLE:
        case GEM_KEYWORD_TENDER_STAGES.WAITING_FOR_DOCS:
        case GEM_KEYWORD_TENDER_STAGES.WAITING_FOR_GEM:
        case GEM_KEYWORD_TENDER_STAGES.WAITING_FOR_QUOTE:
        case GEM_KEYWORD_TENDER_STAGES.PREPARING_DOCS:
            return {
                hidden: false,
                filed: false,
                eligible: GEM_KEYWORD_TENDER_ELIGIBILITY.ELIGIBLE,
            };
        case GEM_KEYWORD_TENDER_STAGES.ASSIGNED:
        case GEM_KEYWORD_TENDER_STAGES.NEW:
        default:
            return {
                hidden: false,
                filed: false,
                eligible: GEM_KEYWORD_TENDER_ELIGIBILITY.NEED_TO_CHECK,
            };
    }
}

function lockStateForUpdate({
    previousLocked,
    previousLockMessage,
    nextStage,
    body,
}) {
    // Admin unlock: clear lock only.
    if (body?.locked === false) {
        return { locked: false, lock_message: null, hiddenOverride: null };
    }

    // Explicit lock actions (out of scope / not eligible) without stage change.
    const lockAction = String(body?.lock_action || "").trim();
    if (lockAction && LOCK_ACTION_MESSAGES[lockAction]) {
        return {
            locked: true,
            lock_message: LOCK_ACTION_MESSAGES[lockAction],
            hiddenOverride: true,
            eligibleOverride:
                lockAction === "not_eligible"
                    ? GEM_KEYWORD_TENDER_ELIGIBILITY.NOT_ELIGIBLE
                    : null,
        };
    }

    if (nextStage === GEM_KEYWORD_TENDER_STAGES.FILED) {
        return {
            locked: true,
            lock_message: GEM_TENDER_LOCK_MESSAGES.ALREADY_FILED,
            hiddenOverride: null,
        };
    }

    return {
        locked: !!previousLocked,
        lock_message: previousLocked ? previousLockMessage || null : null,
        hiddenOverride: null,
    };
}

export function canEditQuote({ currentUser, assigneeUserId, stage }) {
    if (!isQuoteStageEnabled(stage)) {
        return false;
    }
    return canOperateAssignedTender({ currentUser, assigneeUserId, stage });
}

export async function logGemKeywordTenderActivity({
    gem_keyword_tender_id,
    user_id,
    activity,
}) {
    return await createGemKeywordTenderActivity({
        gem_keyword_tender_id,
        user_id,
        activity,
    });
}

async function logActivities({ gem_keyword_tender_id, user_id, activities }) {
    let logged = 0;
    for (const activity of activities) {
        const ok = await logGemKeywordTenderActivity({
            gem_keyword_tender_id,
            user_id,
            activity,
        });
        if (ok) logged += 1;
    }
    return logged;
}

export async function listGemKeywordTenders({ query, cookie, set }) {
    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return { error: "Unauthorized" };
    }

    const from = String(query?.from || "");
    const to = String(query?.to || "");
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!datePattern.test(from) || !datePattern.test(to)) {
        set.status = 400;
        return { error: "Valid from and to dates are required (YYYY-MM-DD)" };
    }

    const tenders = await getAllGemKeywordTenders({ from, to });
    set.status = 200;
    return { tenders };
}

export async function updateGemKeywordTender({ params, body, cookie, set }) {
    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return { error: "Unauthorized" };
    }

    const gemKeywordTender = await getGemKeywordTenderById({ id: params.id });
    if (!gemKeywordTender) {
        set.status = 404;
        return { error: "Tender not found" };
    }

    const previousQuote = asText(gemKeywordTender.quote);
    const previousStage = normalizeStage(gemKeywordTender.stage);
    const previousAssigneeUserId = gemKeywordTender.assignee_user_id
        ? Number(gemKeywordTender.assignee_user_id)
        : null;

    let nextAssigneeUserId =
        body.assignee_user_id !== undefined
            ? body.assignee_user_id
            : gemKeywordTender.assignee_user_id;

    if (body.assign_to_me === true) {
        // Fast path: someone else already claimed it before this request.
        if (
            previousAssigneeUserId != null &&
            previousAssigneeUserId !== Number(currentUser.id)
        ) {
            return alreadyAssignedConflict({
                tenderId: gemKeywordTender.id,
                set,
            });
        }
        nextAssigneeUserId = currentUser.id;
    }

    if (nextAssigneeUserId != null) {
        nextAssigneeUserId = Number(nextAssigneeUserId);
        if (!(nextAssigneeUserId >= 1)) {
            set.status = 400;
            return { error: "Invalid assignee" };
        }
    } else {
        nextAssigneeUserId = null;
    }

    const assigneeChanging = nextAssigneeUserId !== previousAssigneeUserId;
    const assignToMeClaim =
        body.assign_to_me === true &&
        previousAssigneeUserId == null &&
        nextAssigneeUserId === Number(currentUser.id);

    const previousLocked = isTenderLocked(gemKeywordTender);
    const previousLockMessage = gemKeywordTender.lock_message || null;

    const previousCategoryGroupId = gemKeywordTender.category_group_id
        ? Number(gemKeywordTender.category_group_id)
        : null;
    let nextCategoryGroupId = previousCategoryGroupId;
    let categoryGroupChanging = false;
    if (body.category_group_id !== undefined) {
        if (body.category_group_id == null) {
            nextCategoryGroupId = null;
        } else {
            nextCategoryGroupId = Number(body.category_group_id);
            if (!(nextCategoryGroupId >= 1)) {
                set.status = 400;
                return { error: "Invalid category group" };
            }
        }
        categoryGroupChanging = nextCategoryGroupId !== previousCategoryGroupId;
    }

    const previousTenderCategoryId = gemKeywordTender.tender_category_id
        ? Number(gemKeywordTender.tender_category_id)
        : null;
    let nextTenderCategoryId = previousTenderCategoryId;
    let tenderCategoryChanging = false;
    if (body.tender_category_id !== undefined) {
        if (body.tender_category_id == null) {
            nextTenderCategoryId = null;
        } else {
            nextTenderCategoryId = Number(body.tender_category_id);
            if (!(nextTenderCategoryId >= 1)) {
                set.status = 400;
                return { error: "Invalid category" };
            }
        }
        tenderCategoryChanging = nextTenderCategoryId !== previousTenderCategoryId;
    }

    const unlocking = body.locked === false && previousLocked;
    if (unlocking && !currentUser.super_admin) {
        set.status = 403;
        return { error: "Only a super admin can unlock a tender" };
    }

    // Locked / filed: only a super admin may change anything (except unlock).
    if ((previousLocked || isTerminalStage(previousStage)) && !currentUser.super_admin) {
        const touching =
            assigneeChanging ||
            body.assign_to_me === true ||
            body.stage !== undefined ||
            body.quote !== undefined ||
            categoryGroupChanging ||
            tenderCategoryChanging ||
            body.lock_action != null;
        if (touching) {
            set.status = 403;
            return {
                error: previousLocked
                    ? "Only a super admin can change a locked tender"
                    : "Only a super admin can change tenders in a one-way stage",
            };
        }
    }

    if (categoryGroupChanging || tenderCategoryChanging) {
        if (
            !canOperateAssignedTender({
                currentUser,
                assigneeUserId: nextAssigneeUserId ?? previousAssigneeUserId,
                stage: previousStage,
                locked: previousLocked && !unlocking,
            })
        ) {
            set.status = 403;
            return {
                error: "Only the assignee or a super admin can change the category",
            };
        }
        if (nextCategoryGroupId != null) {
            const group = await getGemCategoryGroupById({ id: nextCategoryGroupId });
            if (!group) {
                set.status = 400;
                return { error: "Category group not found" };
            }
        }
        if (nextTenderCategoryId != null) {
            const category = await getGemTenderCategoryById({ id: nextTenderCategoryId });
            if (!category) {
                set.status = 400;
                return { error: "Category not found" };
            }
        }
    }

    if (assigneeChanging) {
        const assigningSelf = nextAssigneeUserId === currentUser.id;
        const currentlyUnassigned = previousAssigneeUserId == null;
        const canAssignOthers =
            !!currentUser.super_admin ||
            (currentUser.authorities || []).includes(
                AUTHORITIES.ASSIGN_GEM_TENDER_ASSIGNEE,
            );
        if (!canAssignOthers && !(assigningSelf && currentlyUnassigned)) {
            set.status = 403;
            return {
                error: currentlyUnassigned
                    ? "Missing authority to assign other users"
                    : "Only a super admin or users with assign authority can change an existing assignee",
            };
        }

        if (nextAssigneeUserId != null) {
            const assigneeUser = await getUserById({ id: nextAssigneeUserId });
            if (!assigneeUser) {
                set.status = 400;
                return { error: "Assignee not found" };
            }
        }
    }

    let nextStage =
        body.stage !== undefined ? normalizeStage(body.stage) : previousStage;

    if (!STAGE_VALUES.has(nextStage)) {
        set.status = 400;
        return { error: "Invalid stage" };
    }

    // Assign to me / admin assign: if stage would stay New, move to Assigned.
    if (assigneeChanging && nextAssigneeUserId != null) {
        if (nextStage === GEM_KEYWORD_TENDER_STAGES.NEW) {
            nextStage = GEM_KEYWORD_TENDER_STAGES.ASSIGNED;
        }
    }

    // Unassign while on Assigned / pipeline work stages → back to New.
    if (
        assigneeChanging &&
        nextAssigneeUserId == null &&
        body.stage === undefined &&
        UNASSIGN_RESET_STAGES.has(previousStage)
    ) {
        nextStage = GEM_KEYWORD_TENDER_STAGES.NEW;
    }

    if (ASSIGNEE_REQUIRED_STAGES.has(nextStage) && !(nextAssigneeUserId >= 1)) {
        set.status = 400;
        return { error: "Assignee is required for this stage" };
    }

    const stageChanging = nextStage !== previousStage;
    const unassigning = assigneeChanging && nextAssigneeUserId == null;

    // Once the tender has left New, it cannot return to New (except admin unassign auto-path).
    if (
        nextStage === GEM_KEYWORD_TENDER_STAGES.NEW &&
        previousStage !== GEM_KEYWORD_TENDER_STAGES.NEW &&
        !unassigning
    ) {
        set.status = 400;
        return {
            error: "Stage cannot go back to New once the tender has left New",
        };
    }

    // Explicit stage change from UI/API: require an assignee first, then only
    // that assignee or a super admin. Auto stage bumps on assign/unassign are OK.
    // Terminal stages remain super-admin-only (even if unassigned).
    if (stageChanging && body.stage !== undefined) {
        if (isTerminalStage(previousStage)) {
            if (!currentUser.super_admin) {
                set.status = 403;
                return {
                    error: "Only a super admin can change stage on a one-way tender",
                };
            }
        } else {
            const stageAssigneeId = nextAssigneeUserId ?? previousAssigneeUserId;
            if (!(stageAssigneeId >= 1)) {
                set.status = 400;
                return { error: "Assign someone before changing stage" };
            }
            if (
                !canOperateAssignedTender({
                    currentUser,
                    assigneeUserId: stageAssigneeId,
                    stage: previousStage,
                    locked: previousLocked && !unlocking,
                })
            ) {
                set.status = 403;
                return {
                    error: "Only the assignee or a super admin can change stage",
                };
            }
        }
    }

    const nextQuoteRaw = body.quote !== undefined ? asText(body.quote) : previousQuote;
    let nextQuote = nextQuoteRaw;

    if (body.quote !== undefined && nextQuote !== previousQuote) {
        if (
            !canEditQuote({
                currentUser,
                assigneeUserId: nextAssigneeUserId ?? previousAssigneeUserId,
                stage: nextStage,
            }) ||
            (previousLocked && !unlocking && !currentUser.super_admin)
        ) {
            set.status = 403;
            return {
                error:
                    "Only the assignee or a super admin can edit the quote in this stage",
            };
        }
    }

    const flags = flagsForStage(nextStage);
    const lockState = lockStateForUpdate({
        previousLocked,
        previousLockMessage,
        nextStage,
        body,
    });
    if (lockState.hiddenOverride != null) {
        flags.hidden = lockState.hiddenOverride;
    }
    if (lockState.eligibleOverride != null) {
        flags.eligible = lockState.eligibleOverride;
    }
    // Keep locked tenders hidden in the default list unless unlocked.
    if (lockState.locked && nextStage !== GEM_KEYWORD_TENDER_STAGES.FILED) {
        flags.hidden = true;
    }
    if (!lockState.locked) {
        // Unlock restores visibility for non-filed pipeline rows.
        if (nextStage !== GEM_KEYWORD_TENDER_STAGES.FILED) {
            flags.hidden = flags.hidden && false;
            flags.hidden = false;
        }
    }

    const activities = [];

    if (previousStage !== nextStage) {
        activities.push(
            `Changed stage from ${stageLabel(previousStage)} to ${stageLabel(nextStage)}`,
        );
    }

    if (previousLocked !== lockState.locked) {
        activities.push(
            lockState.locked
                ? `Locked tender${lockState.lock_message ? `: ${lockState.lock_message}` : ""}`
                : "Unlocked tender",
        );
    } else if (
        lockState.locked &&
        previousLockMessage !== lockState.lock_message &&
        lockState.lock_message
    ) {
        activities.push(`Lock message set to: ${lockState.lock_message}`);
    }

    if (previousQuote !== nextQuote) {
        const previousPreview = quotePreview(previousQuote);
        const nextPreview = quotePreview(nextQuote);
        if (!previousPreview && nextPreview) {
            activities.push(`Added quote: "${nextPreview}"`);
        } else if (previousPreview && !nextPreview) {
            activities.push(`Cleared quote (was: "${previousPreview}")`);
        } else {
            activities.push(`Updated quote to: "${nextPreview}"`);
        }
    }

    if (categoryGroupChanging) {
        const previousGroup = previousCategoryGroupId
            ? await getGemCategoryGroupById({ id: previousCategoryGroupId })
            : null;
        const nextGroup = nextCategoryGroupId
            ? await getGemCategoryGroupById({ id: nextCategoryGroupId })
            : null;
        activities.push(
            `Changed category group from ${previousGroup?.name || "None"} to ${nextGroup?.name || "None"}`,
        );
    }

    if (tenderCategoryChanging) {
        const previousCategory = previousTenderCategoryId
            ? await getGemTenderCategoryById({ id: previousTenderCategoryId })
            : null;
        const nextCategory = nextTenderCategoryId
            ? await getGemTenderCategoryById({ id: nextTenderCategoryId })
            : null;
        activities.push(
            `Changed category from ${previousCategory?.name || "None"} to ${nextCategory?.name || "None"}`,
        );
    }

    let previousAssignee = null;
    let nextAssignee = null;
    if (assigneeChanging) {
        previousAssignee = previousAssigneeUserId
            ? await getUserById({ id: previousAssigneeUserId })
            : null;
        nextAssignee = nextAssigneeUserId
            ? await getUserById({ id: nextAssigneeUserId })
            : null;

        if (body.assign_to_me === true && nextAssigneeUserId === currentUser.id) {
            activities.push(
                previousAssigneeUserId
                    ? `Assigned tender to self (was ${assigneeLabel(previousAssignee)})`
                    : "Assigned tender to self",
            );
        } else {
            activities.push(
                `Changed assignee from ${assigneeLabel(previousAssignee)} to ${assigneeLabel(nextAssignee)}`,
            );
        }
    }

    if (assignToMeClaim) {
        // Race-safe claim: only succeeds if still unassigned.
        const claimed = await claimUnassignedGemKeywordTenderById({
            id: gemKeywordTender.id,
            hidden: flags.hidden,
            eligible: flags.eligible,
            filed: flags.filed,
            quote: nextQuote,
            stage: nextStage,
            assignee_user_id: nextAssigneeUserId,
        });
        if (!claimed) {
            return alreadyAssignedConflict({
                tenderId: gemKeywordTender.id,
                set,
            });
        }
        if (categoryGroupChanging || tenderCategoryChanging || unlocking || body.lock_action) {
            await updateGemKeywordTenderById({
                id: gemKeywordTender.id,
                hidden: flags.hidden,
                eligible: flags.eligible,
                filed: flags.filed,
                quote: nextQuote,
                stage: nextStage,
                assignee_user_id: nextAssigneeUserId,
                category_group_id: nextCategoryGroupId,
                tender_category_id: nextTenderCategoryId,
                locked: lockState.locked,
                lock_message: lockState.lock_message,
            });
        }
    } else {
        await updateGemKeywordTenderById({
            id: gemKeywordTender.id,
            hidden: flags.hidden,
            eligible: flags.eligible,
            filed: flags.filed,
            quote: nextQuote,
            stage: nextStage,
            assignee_user_id: nextAssigneeUserId,
            category_group_id: nextCategoryGroupId,
            tender_category_id: nextTenderCategoryId,
            locked: lockState.locked,
            lock_message: lockState.lock_message,
        });
    }

    if (activities.length) {
        await logActivities({
            gem_keyword_tender_id: gemKeywordTender.id,
            user_id: currentUser.id,
            activities,
        });
    }

    const updatedGemKeywordTender = await getGemKeywordTenderById({ id: gemKeywordTender.id });

    if (assigneeChanging && nextAssigneeUserId != null && nextAssignee) {
        notifyGemKeywordTenderAssigned({
            tender: updatedGemKeywordTender,
            assigneeUser: nextAssignee,
            assignedByUser: currentUser,
        });
    }

    if (
        previousStage !== GEM_KEYWORD_TENDER_STAGES.ELIGIBLE &&
        nextStage === GEM_KEYWORD_TENDER_STAGES.ELIGIBLE
    ) {
        const quoteAssignee =
            nextAssignee ||
            (nextAssigneeUserId ? await getUserById({ id: nextAssigneeUserId }) : null);
        await notifyGemKeywordTenderQuoteRequested({
            tender: updatedGemKeywordTender,
            requestedByUser: currentUser,
            assigneeUser: quoteAssignee,
        });
    }

    set.status = 200;
    return { message: "Tender updated", gemKeywordTender: updatedGemKeywordTender };
}

export async function bulkChangeGemKeywordTenderStages({ body, cookie, set }) {
    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return { error: "Unauthorized" };
    }

    if (
        !hasAuthority(
            currentUser.authorities,
            AUTHORITIES.MARK_GEM_TENDER_MASS_STAGE_CHANGE,
        )
    ) {
        set.status = 403;
        return { error: "Missing authority to bulk change tender stage" };
    }

    if (body?.stage === undefined || !STAGE_VALUES.has(body.stage)) {
        set.status = 400;
        return { error: "Invalid stage" };
    }
    const nextStage = body.stage;

    const comment = asText(body?.comment).trim();
    if (!comment) {
        set.status = 400;
        return { error: "Comment is required" };
    }

    const ids = Array.isArray(body?.ids)
        ? [...new Set(body.ids.map((id) => Number(id)).filter((id) => id >= 1))]
        : [];
    if (!ids.length) {
        set.status = 400;
        return { error: "Select at least one tender" };
    }

    const flags = flagsForStage(nextStage);
    let successCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const failures = [];

    for (const id of ids) {
        const gemKeywordTender = await getGemKeywordTenderById({ id });
        if (!gemKeywordTender) {
            failedCount += 1;
            failures.push({ id, error: "Tender not found" });
            continue;
        }

        const previousStage = normalizeStage(gemKeywordTender.stage);
        if (previousStage === nextStage) {
            skippedCount += 1;
            continue;
        }

        if (isTerminalStage(previousStage) && !currentUser.super_admin) {
            failedCount += 1;
            failures.push({
                id,
                error: "Only a super admin can change tenders in a one-way stage",
            });
            continue;
        }

        const assigneeUserId = gemKeywordTender.assignee_user_id
            ? Number(gemKeywordTender.assignee_user_id)
            : null;
        if (ASSIGNEE_REQUIRED_STAGES.has(nextStage) && !(assigneeUserId >= 1)) {
            failedCount += 1;
            failures.push({ id, error: "Assignee is required for this stage" });
            continue;
        }

        try {
            const bulkLock =
                nextStage === GEM_KEYWORD_TENDER_STAGES.FILED
                    ? {
                          locked: true,
                          lock_message: GEM_TENDER_LOCK_MESSAGES.ALREADY_FILED,
                      }
                    : {
                          locked: isTenderLocked(gemKeywordTender),
                          lock_message: gemKeywordTender.lock_message || null,
                      };

            await updateGemKeywordTenderById({
                id: gemKeywordTender.id,
                hidden: flags.hidden,
                eligible: flags.eligible,
                filed: flags.filed,
                quote: gemKeywordTender.quote,
                stage: nextStage,
                assignee_user_id: assigneeUserId,
                category_group_id: gemKeywordTender.category_group_id
                    ? Number(gemKeywordTender.category_group_id)
                    : null,
                tender_category_id: gemKeywordTender.tender_category_id
                    ? Number(gemKeywordTender.tender_category_id)
                    : null,
                locked: bulkLock.locked,
                lock_message: bulkLock.lock_message,
            });

            const commentId = await createGemKeywordTenderComment({
                gem_keyword_tender_id: gemKeywordTender.id,
                user_id: currentUser.id,
                comment,
            });
            if (!commentId) {
                failedCount += 1;
                failures.push({ id, error: "Failed to add comment" });
                continue;
            }

            const activities = [
                `Changed stage from ${stageLabel(previousStage)} to ${stageLabel(nextStage)}`,
                `Added comment: "${quotePreview(comment)}"`,
            ];
            if (
                nextStage === GEM_KEYWORD_TENDER_STAGES.FILED &&
                !isTenderLocked(gemKeywordTender)
            ) {
                activities.push(
                    `Locked tender: ${GEM_TENDER_LOCK_MESSAGES.ALREADY_FILED}`,
                );
            }

            await logActivities({
                gem_keyword_tender_id: gemKeywordTender.id,
                user_id: currentUser.id,
                activities,
            });

            if (
                previousStage !== GEM_KEYWORD_TENDER_STAGES.ELIGIBLE &&
                nextStage === GEM_KEYWORD_TENDER_STAGES.ELIGIBLE
            ) {
                const updated = await getGemKeywordTenderById({ id: gemKeywordTender.id });
                const quoteAssignee = assigneeUserId
                    ? await getUserById({ id: assigneeUserId })
                    : null;
                await notifyGemKeywordTenderQuoteRequested({
                    tender: updated || gemKeywordTender,
                    requestedByUser: currentUser,
                    assigneeUser: quoteAssignee,
                });
            }

            successCount += 1;
        } catch (error) {
            failedCount += 1;
            failures.push({ id, error: "Failed to change stage" });
        }
    }

    set.status = failedCount && !successCount ? 400 : 200;
    return {
        message:
            `Changed stage on ${successCount}` +
            (skippedCount ? `, skipped ${skippedCount}` : "") +
            (failedCount ? `, failed ${failedCount}` : ""),
        successCount,
        skippedCount,
        failedCount,
        failures,
    };
}

/**
 * One-off GeM search from the tenders list (Add tender).
 * Does not assign a category group; set group later on the tender detail page.
 */
export async function startGemAdhocTenderScan({ body, cookie, set }) {
    if (processing) {
        set.status = 409;
        return { error: "Scan already in progress", processing: true };
    }

    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return { error: "Unauthorized", processing: false };
    }

    if (!hasAuthority(currentUser.authorities, AUTHORITIES.USE_PAGE_GEM_TENDERS)) {
        set.status = 403;
        return { error: "Missing authority", processing: false };
    }

    const rawQueries = Array.isArray(body?.queries)
        ? body.queries
        : String(body?.query || "")
              .split(/\r?\n/)
              .map((line) => line.trim())
              .filter(Boolean);

    const queries = [];
    const seen = new Set();
    for (const raw of rawQueries) {
        const query = asText(raw).trim();
        if (!query || seen.has(query.toLowerCase())) continue;
        seen.add(query.toLowerCase());
        queries.push(query.slice(0, 255));
        if (queries.length >= 50) break;
    }

    if (!queries.length) {
        set.status = 400;
        return { error: "At least one search text is required", processing: false };
    }

    const exact_search = !!currentUser.super_admin && !!body?.exact_search;

    const keywords = queries.map((keyword) => ({
        keyword,
        exact_search,
        search_mode: "advance_search",
    }));

    const runId = await createGemTenderScanRun({
        keyword_count: keywords.length,
        created_by: currentUser.id,
        scan_type: GEM_TENDER_SCAN_TYPES.ADHOC,
    });
    if (!runId) {
        set.status = 400;
        return { error: "Failed to create scan run", processing: false };
    }

    const started = crawlGemForTenders({
        keywords,
        runId,
    });
    if (!started) {
        set.status = 409;
        return { error: "Scan already in progress", processing: true };
    }

    set.status = 202;
    const label =
        queries.length === 1
            ? `“${queries[0]}”`
            : `${queries.length} search texts`;
    return {
        message: `Scan started for ${label}. Matching tenders will be added shortly.`,
        processing: true,
        count: queries.length,
        run: await getGemTenderScanRunById({ id: runId }),
    };
}
