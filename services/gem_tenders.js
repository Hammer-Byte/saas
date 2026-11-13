import {
    AUTHORITIES,
    GEM_TENDER_ELIGIBILITY_CHOICES,
    GEM_TENDER_ELIGIBILITY_CHOICE_LABELS,
    GEM_TENDER_LOCK_MESSAGES,
    GEM_TENDER_SCAN_TYPES,
    GEM_TENDER_STAGE_LABELS,
    GEM_TENDER_STAGES,
} from "../constants.js";
import { createGemTenderActivity } from "../db/gem_tender_activities.js";
import { createGemTenderComment } from "../db/gem_tender_comments.js";
import { getGemCategoryGroupById } from "../db/gem_category_groups.js";
import {
    claimUnassignedGemTenderById,
    getAllGemTenders,
    getGemTenderById,
    searchGemTenders,
    unlockGemTenderById,
    updateGemTenderById,
} from "../db/gem_tenders.js";
import { getGemTenderCategoryById } from "../db/gem_tender_categories.js";
import {
    createGemTenderScanRun,
    getGemTenderScanRunById,
} from "../db/gem_tender_scan_runs.js";
import { getUserById } from "../db/users.js";
import { hasAuthority } from "../libs/app_page.js";
import {
    notifyGemTenderAssigned,
    notifyGemTenderQuoteRequested,
    notifyGemTendersBulkAssigned,
} from "../libs/gem_tender_notify.js";
import { enqueueGemScanJob } from "../libs/selenium/enqueue_gem.js";
import { getCurrentUser } from "./authentication.js";

const STAGE_VALUES = new Set(Object.values(GEM_TENDER_STAGES));

/** Filed is only reachable through the filing endpoint (documents required). */
const MANUAL_STAGE_VALUES = new Set(
    Object.values(GEM_TENDER_STAGES).filter((stage) => stage !== GEM_TENDER_STAGES.FILED),
);

const ELIGIBILITY_CHOICE_VALUES = new Set(Object.values(GEM_TENDER_ELIGIBILITY_CHOICES));

/** Negative choices lock the tender with these messages. */
const ELIGIBILITY_LOCK_MESSAGES = {
    [GEM_TENDER_ELIGIBILITY_CHOICES.INELIGIBLE]: GEM_TENDER_LOCK_MESSAGES.NOT_ELIGIBLE,
    [GEM_TENDER_ELIGIBILITY_CHOICES.OUT_OF_SCOPE]: GEM_TENDER_LOCK_MESSAGES.OUT_OF_SCOPE,
};

function stageLabel(stage) {
    return GEM_TENDER_STAGE_LABELS[stage] || "No stage";
}

function eligibilityLabel(choice) {
    return GEM_TENDER_ELIGIBILITY_CHOICE_LABELS[choice] || "Not decided";
}

function isTenderLocked(tenderOrLocked) {
    if (tenderOrLocked && typeof tenderOrLocked === "object") {
        return !!Number(tenderOrLocked.locked);
    }
    return !!Number(tenderOrLocked);
}

function isTenderEligible(tender) {
    return !!Number(tender?.eligible);
}

/** Current radio choice from the boolean columns, or null when undecided. */
function eligibilityChoiceOf(tender) {
    if (!tender) return null;
    if (Number(tender.eligible)) return GEM_TENDER_ELIGIBILITY_CHOICES.ELIGIBLE;
    if (Number(tender.ineligible)) return GEM_TENDER_ELIGIBILITY_CHOICES.INELIGIBLE;
    if (Number(tender.out_of_scope)) return GEM_TENDER_ELIGIBILITY_CHOICES.OUT_OF_SCOPE;
    return null;
}

function eligibilityFlags(choice) {
    return {
        eligible: choice === GEM_TENDER_ELIGIBILITY_CHOICES.ELIGIBLE,
        ineligible: choice === GEM_TENDER_ELIGIBILITY_CHOICES.INELIGIBLE,
        out_of_scope: choice === GEM_TENDER_ELIGIBILITY_CHOICES.OUT_OF_SCOPE,
    };
}

/** Lock message + list visibility to restore when a super admin locks an unlocked tender again; null if no reason. */
export function relockStateOf(tender) {
    if (!tender) return null;
    if (tender.stage === GEM_TENDER_STAGES.FILED || Number(tender.filed)) {
        return { lock_message: GEM_TENDER_LOCK_MESSAGES.ALREADY_FILED, hidden: false };
    }
    if (Number(tender.ineligible)) {
        return { lock_message: GEM_TENDER_LOCK_MESSAGES.NOT_ELIGIBLE, hidden: true };
    }
    if (Number(tender.out_of_scope)) {
        return { lock_message: GEM_TENDER_LOCK_MESSAGES.OUT_OF_SCOPE, hidden: true };
    }
    if (Number(tender.missed)) {
        return { lock_message: GEM_TENDER_LOCK_MESSAGES.DEADLINE_MISSED, hidden: true };
    }
    if (Number(tender.unattended)) {
        return { lock_message: GEM_TENDER_LOCK_MESSAGES.DUE_DATE_PASSED, hidden: true };
    }
    return null;
}

/** Stage value from the DB / request, or null when empty or a legacy value. */
export function knownStageOrNull(value) {
    if (value == null || value === "") {
        return null;
    }
    const raw = String(value).trim().toLowerCase();
    return STAGE_VALUES.has(raw) ? raw : null;
}

/**
 * Category / eligibility / stage / quote / docs / comments:
 * - Locked: nobody (must unlock first — even super admin)
 * - No assignee: nobody
 * - With assignee: that assignee or a super admin
 */
export function canOperateAssignedTender({ currentUser, assigneeUserId, locked = false }) {
    if (!currentUser?.id) {
        return false;
    }
    if (locked) {
        return false;
    }
    const assigneeId = assigneeUserId ? Number(assigneeUserId) : null;
    if (!(assigneeId >= 1)) {
        return false;
    }
    if (currentUser.super_admin) {
        return true;
    }
    return assigneeId === Number(currentUser.id);
}

/** Documents and quote additionally require the tender to be eligible. */
export function canWorkOnEligibleTender({ currentUser, tender }) {
    return (
        isTenderEligible(tender) &&
        canOperateAssignedTender({
            currentUser,
            assigneeUserId: tender?.assignee_user_id,
            locked: isTenderLocked(tender),
        })
    );
}

function canAssignOtherUsers(currentUser) {
    return (
        !!currentUser?.super_admin ||
        (currentUser?.authorities || []).includes(AUTHORITIES.ASSIGN_GEM_TENDER_ASSIGNEE)
    );
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
    const fresh = (await getGemTenderById({ id: tenderId })) || null;
    const name = tenderAssigneeDisplayName(fresh);
    set.status = 409;
    return {
        error: `Failed to assign. Already assigned to ${name}.`,
        code: "already_assigned",
        gemTender: fresh,
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

function bodyHasField(body, key) {
    return !!body && Object.prototype.hasOwnProperty.call(body, key);
}

function asAssigneeId(value) {
    if (value == null || value === "") {
        return null;
    }
    const id = Number(value);
    return id >= 1 ? id : null;
}

function asCategoryId(value) {
    if (value == null || value === "") {
        return null;
    }
    const id = Number(value);
    return id >= 1 ? id : null;
}

function parseIds(rawIds) {
    return Array.isArray(rawIds)
        ? [...new Set(rawIds.map((id) => Number(id)).filter((id) => id >= 1))]
        : [];
}

/** Patch fields for an eligibility choice (lock + clear stage on negative choices). */
function eligibilityPatch({ choice, previousStage }) {
    const patch = { ...eligibilityFlags(choice) };
    if (choice === GEM_TENDER_ELIGIBILITY_CHOICES.ELIGIBLE) {
        if (!previousStage) {
            patch.stage = GEM_TENDER_STAGES.WAITING_FOR_DOCS;
        }
        return patch;
    }
    patch.stage = null;
    patch.locked = true;
    patch.lock_message = ELIGIBILITY_LOCK_MESSAGES[choice];
    patch.hidden = true;
    return patch;
}

function eligibilityActivities({ previousChoice, choice, previousStage, patch }) {
    const activities = [
        `Changed eligibility from ${eligibilityLabel(previousChoice)} to ${eligibilityLabel(choice)}`,
    ];
    if (bodyHasField(patch, "stage") && (patch.stage || null) !== (previousStage || null)) {
        activities.push(
            `Changed stage from ${stageLabel(previousStage)} to ${stageLabel(patch.stage)}`,
        );
    }
    if (patch.locked) {
        activities.push(`Locked tender: ${patch.lock_message}`);
    }
    return activities;
}

export async function logGemTenderActivity({ gem_tender_id, user_id, activity }) {
    return await createGemTenderActivity({
        gem_tender_id,
        user_id,
        activity,
    });
}

export async function logActivities({ gem_tender_id, user_id, activities }) {
    let logged = 0;
    for (const activity of activities) {
        const ok = await logGemTenderActivity({
            gem_tender_id,
            user_id,
            activity,
        });
        if (ok) logged += 1;
    }
    return logged;
}

export async function listGemTenders({ query, cookie, set }) {
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

    const tenders = await getAllGemTenders({ from, to });
    set.status = 200;
    return { tenders };
}

export async function searchGemTenderList({ query, cookie, set }) {
    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return { error: "Unauthorized" };
    }

    const tenders = await searchGemTenders({ search: query?.q });
    set.status = 200;
    return { tenders };
}

export async function updateGemTender({ params, body, cookie, set }) {
    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return { error: "Unauthorized" };
    }

    const gemTender = await getGemTenderById({ id: params.id });
    if (!gemTender) {
        set.status = 404;
        return { error: "Tender not found" };
    }

    const previousQuote = asText(gemTender.quote);
    const previousStage = knownStageOrNull(gemTender.stage);
    const previousAssigneeUserId = asAssigneeId(gemTender.assignee_user_id);
    const previousCategoryGroupId = asCategoryId(gemTender.category_group_id);
    const previousTenderCategoryId = asCategoryId(gemTender.tender_category_id);
    const previousLocked = isTenderLocked(gemTender);
    const previousChoice = eligibilityChoiceOf(gemTender);

    // Unlock is lock-only: never rewrites stage / assignee / category / flags.
    if (body?.locked === false && previousLocked) {
        if (!currentUser.super_admin) {
            set.status = 403;
            return { error: "Only a super admin can unlock a tender" };
        }
        try {
            await unlockGemTenderById({ id: gemTender.id });
        } catch (error) {
            set.status = 500;
            return { error: "Failed to unlock tender" };
        }
        await logActivities({
            gem_tender_id: gemTender.id,
            user_id: currentUser.id,
            activities: ["Unlocked tender"],
        });
        set.status = 200;
        return {
            message: "Tender unlocked",
            gemTender: await getGemTenderById({ id: gemTender.id }),
        };
    }

    if (body?.locked === true) {
        if (!currentUser.super_admin) {
            set.status = 403;
            return { error: "Only a super admin can lock a tender" };
        }
        if (previousLocked) {
            set.status = 400;
            return { error: "Tender is already locked" };
        }
        const relock = relockStateOf(gemTender);
        if (!relock) {
            set.status = 400;
            return {
                error: "This tender has no lock reason (not filed, not eligible, out of scope, missed or unattended)",
            };
        }
        try {
            await updateGemTenderById({ id: gemTender.id, locked: true, ...relock });
        } catch (error) {
            set.status = 500;
            return { error: "Failed to lock tender" };
        }
        await logActivities({
            gem_tender_id: gemTender.id,
            user_id: currentUser.id,
            activities: [`Locked tender again: ${relock.lock_message}`],
        });
        set.status = 200;
        return {
            message: "Tender locked",
            gemTender: await getGemTenderById({ id: gemTender.id }),
        };
    }

    const assigneeProvided =
        body?.assign_to_me === true || bodyHasField(body, "assignee_user_id");
    const touchingWork =
        bodyHasField(body, "category_group_id") ||
        bodyHasField(body, "tender_category_id") ||
        bodyHasField(body, "eligibility") ||
        bodyHasField(body, "stage") ||
        bodyHasField(body, "quote");

    if (previousLocked && (assigneeProvided || touchingWork)) {
        set.status = 403;
        return { error: "Unlock this tender before making changes" };
    }

    // Category / eligibility / stage / quote: existing assignee or super admin only.
    if (touchingWork) {
        if (!(previousAssigneeUserId >= 1)) {
            set.status = 400;
            return { error: "Assign someone before working on this tender" };
        }
        if (
            !canOperateAssignedTender({
                currentUser,
                assigneeUserId: previousAssigneeUserId,
                locked: previousLocked,
            })
        ) {
            set.status = 403;
            return { error: "Only the assignee or a super admin can change this tender" };
        }
    }

    // ---- Assignee ----
    let nextAssigneeUserId = previousAssigneeUserId;
    if (body?.assign_to_me === true) {
        if (
            previousAssigneeUserId != null &&
            previousAssigneeUserId !== Number(currentUser.id)
        ) {
            return alreadyAssignedConflict({ tenderId: gemTender.id, set });
        }
        nextAssigneeUserId = Number(currentUser.id);
    } else if (bodyHasField(body, "assignee_user_id")) {
        if (body.assignee_user_id == null || body.assignee_user_id === "") {
            nextAssigneeUserId = null;
        } else {
            nextAssigneeUserId = asAssigneeId(body.assignee_user_id);
            if (nextAssigneeUserId == null) {
                set.status = 400;
                return { error: "Invalid assignee" };
            }
        }
    }
    const assigneeChanging = nextAssigneeUserId !== previousAssigneeUserId;
    const assignToMeClaim =
        body?.assign_to_me === true &&
        previousAssigneeUserId == null &&
        nextAssigneeUserId === Number(currentUser.id);

    let nextAssignee = null;
    if (assigneeChanging) {
        const assigningSelf = nextAssigneeUserId === Number(currentUser.id);
        const currentlyUnassigned = previousAssigneeUserId == null;
        if (!canAssignOtherUsers(currentUser) && !(assigningSelf && currentlyUnassigned)) {
            set.status = 403;
            return {
                error: currentlyUnassigned
                    ? "Missing authority to assign other users"
                    : "Only a super admin or users with assign authority can change an existing assignee",
            };
        }
        if (nextAssigneeUserId != null) {
            nextAssignee = await getUserById({ id: nextAssigneeUserId });
            if (!nextAssignee) {
                set.status = 400;
                return { error: "Assignee not found" };
            }
        }
    }

    // ---- Category ----
    let nextCategoryGroupId = previousCategoryGroupId;
    if (bodyHasField(body, "category_group_id")) {
        nextCategoryGroupId = asCategoryId(body.category_group_id);
        if (body.category_group_id != null && body.category_group_id !== "" && nextCategoryGroupId == null) {
            set.status = 400;
            return { error: "Invalid category group" };
        }
        if (nextCategoryGroupId != null && !(await getGemCategoryGroupById({ id: nextCategoryGroupId }))) {
            set.status = 400;
            return { error: "Category group not found" };
        }
    }
    const categoryGroupChanging = nextCategoryGroupId !== previousCategoryGroupId;

    let nextTenderCategoryId = previousTenderCategoryId;
    if (bodyHasField(body, "tender_category_id")) {
        nextTenderCategoryId = asCategoryId(body.tender_category_id);
        if (body.tender_category_id != null && body.tender_category_id !== "" && nextTenderCategoryId == null) {
            set.status = 400;
            return { error: "Invalid category" };
        }
        if (nextTenderCategoryId != null && !(await getGemTenderCategoryById({ id: nextTenderCategoryId }))) {
            set.status = 400;
            return { error: "Category not found" };
        }
    }
    const tenderCategoryChanging = nextTenderCategoryId !== previousTenderCategoryId;

    // ---- Eligibility ----
    let nextChoice = previousChoice;
    if (bodyHasField(body, "eligibility")) {
        const requested = String(body.eligibility || "").trim();
        if (!ELIGIBILITY_CHOICE_VALUES.has(requested)) {
            set.status = 400;
            return { error: "Invalid eligibility" };
        }
        if (previousStage === GEM_TENDER_STAGES.FILED) {
            set.status = 400;
            return { error: "Eligibility cannot change after the tender is filed" };
        }
        nextChoice = requested;
    }
    const eligibilityChanging = nextChoice !== previousChoice;
    const nextEligible = nextChoice === GEM_TENDER_ELIGIBILITY_CHOICES.ELIGIBLE;

    // ---- Stage ----
    const patch = { id: gemTender.id };
    const activities = [];

    if (eligibilityChanging) {
        const choicePatch = eligibilityPatch({ choice: nextChoice, previousStage });
        Object.assign(patch, choicePatch);
        activities.push(
            ...eligibilityActivities({
                previousChoice,
                choice: nextChoice,
                previousStage,
                patch: choicePatch,
            }),
        );
    }

    let nextStage = bodyHasField(patch, "stage") ? patch.stage : previousStage;
    if (bodyHasField(body, "stage")) {
        const requestedStage = knownStageOrNull(body.stage);
        if (!requestedStage) {
            set.status = 400;
            return { error: "Invalid stage" };
        }
        if (requestedStage === GEM_TENDER_STAGES.FILED) {
            set.status = 400;
            return { error: "Filing requires documents. Use the Filed option to upload them." };
        }
        if (!nextEligible) {
            set.status = 400;
            return { error: "Mark the tender eligible before changing stage" };
        }
        if (previousStage === GEM_TENDER_STAGES.FILED) {
            set.status = 400;
            return { error: "Stage cannot change after the tender is filed" };
        }
        if (requestedStage !== nextStage) {
            activities.push(
                `Changed stage from ${stageLabel(nextStage)} to ${stageLabel(requestedStage)}`,
            );
            nextStage = requestedStage;
            patch.stage = requestedStage;
        }
    }

    // ---- Quote ----
    const quoteProvided = bodyHasField(body, "quote");
    const nextQuote = quoteProvided ? asText(body.quote) : previousQuote;
    const quoteChanging = nextQuote !== previousQuote;
    if (quoteChanging) {
        if (!nextEligible) {
            set.status = 400;
            return { error: "Mark the tender eligible before adding a quote" };
        }
        patch.quote = nextQuote;
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
        patch.category_group_id = nextCategoryGroupId;
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
        patch.tender_category_id = nextTenderCategoryId;
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

    if (assigneeChanging) {
        const previousAssignee = previousAssigneeUserId
            ? await getUserById({ id: previousAssigneeUserId })
            : null;
        if (body.assign_to_me === true && nextAssigneeUserId === Number(currentUser.id)) {
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

        // Unassigning resets the work done so far (a filed tender keeps its record).
        if (nextAssigneeUserId == null && previousStage !== GEM_TENDER_STAGES.FILED) {
            if (previousStage) {
                patch.stage = null;
                activities.push(`Changed stage from ${stageLabel(previousStage)} to No stage`);
            }
            if (previousChoice) {
                Object.assign(patch, eligibilityFlags(null));
                activities.push(
                    `Changed eligibility from ${eligibilityLabel(previousChoice)} to Not decided`,
                );
            }
        }
    }

    if (assignToMeClaim) {
        const claimed = await claimUnassignedGemTenderById({
            id: gemTender.id,
            assignee_user_id: nextAssigneeUserId,
        });
        if (!claimed) {
            return alreadyAssignedConflict({ tenderId: gemTender.id, set });
        }
    } else if (assigneeChanging) {
        patch.assignee_user_id = nextAssigneeUserId;
    }

    if (Object.keys(patch).length > 1) {
        try {
            await updateGemTenderById(patch);
        } catch (error) {
            set.status = 500;
            return { error: "Failed to update tender" };
        }
    }

    if (activities.length) {
        await logActivities({
            gem_tender_id: gemTender.id,
            user_id: currentUser.id,
            activities,
        });
    }

    const updatedGemTender = await getGemTenderById({ id: gemTender.id });

    if (assigneeChanging && nextAssignee) {
        notifyGemTenderAssigned({
            tender: updatedGemTender,
            assigneeUser: nextAssignee,
            assignedByUser: currentUser,
        });
    }

    if (
        previousStage !== GEM_TENDER_STAGES.WAITING_FOR_QUOTE &&
        nextStage === GEM_TENDER_STAGES.WAITING_FOR_QUOTE
    ) {
        await notifyGemTenderQuoteRequested({
            tender: updatedGemTender,
            requestedByUser: currentUser,
            assigneeUser: previousAssigneeUserId
                ? await getUserById({ id: previousAssigneeUserId })
                : null,
        });
    }

    set.status = 200;
    return { message: "Tender updated", gemTender: updatedGemTender };
}

function bulkResult({ verb, successCount, skippedCount, failedCount, failures, set }) {
    set.status = failedCount && !successCount ? 400 : 200;
    return {
        message:
            `${verb} ${successCount}` +
            (skippedCount ? `, skipped ${skippedCount}` : "") +
            (failedCount ? `, failed ${failedCount}` : ""),
        successCount,
        skippedCount,
        failedCount,
        failures,
    };
}

export async function bulkChangeGemTenderStages({ body, cookie, set }) {
    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return { error: "Unauthorized" };
    }

    if (!hasAuthority(currentUser.authorities, AUTHORITIES.MARK_GEM_TENDER_MASS_STAGE_CHANGE)) {
        set.status = 403;
        return { error: "Missing authority to bulk change tender stage" };
    }

    const nextStage = knownStageOrNull(body?.stage);
    if (!nextStage || !MANUAL_STAGE_VALUES.has(nextStage)) {
        set.status = 400;
        return { error: "Invalid stage (Filed needs documents and must be done per tender)" };
    }

    const comment = asText(body?.comment).trim();
    if (!comment) {
        set.status = 400;
        return { error: "Comment is required" };
    }

    const ids = parseIds(body?.ids);
    if (!ids.length) {
        set.status = 400;
        return { error: "Select at least one tender" };
    }

    let successCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const failures = [];

    for (const id of ids) {
        const gemTender = await getGemTenderById({ id });
        if (!gemTender) {
            failedCount += 1;
            failures.push({ id, error: "Tender not found" });
            continue;
        }

        const previousStage = knownStageOrNull(gemTender.stage);
        if (previousStage === nextStage) {
            skippedCount += 1;
            continue;
        }

        let error = null;
        if (isTenderLocked(gemTender)) {
            error = "Unlock this tender before making changes";
        } else if (!(asAssigneeId(gemTender.assignee_user_id) >= 1)) {
            error = "Assign someone before changing stage";
        } else if (!isTenderEligible(gemTender)) {
            error = "Mark the tender eligible before changing stage";
        } else if (previousStage === GEM_TENDER_STAGES.FILED) {
            error = "Stage cannot change after the tender is filed";
        }
        if (error) {
            failedCount += 1;
            failures.push({ id, error });
            continue;
        }

        try {
            await updateGemTenderById({ id: gemTender.id, stage: nextStage });

            const commentId = await createGemTenderComment({
                gem_tender_id: gemTender.id,
                user_id: currentUser.id,
                comment,
            });
            if (!commentId) {
                failedCount += 1;
                failures.push({ id, error: "Failed to add comment" });
                continue;
            }

            await logActivities({
                gem_tender_id: gemTender.id,
                user_id: currentUser.id,
                activities: [
                    `Changed stage from ${stageLabel(previousStage)} to ${stageLabel(nextStage)}`,
                    `Added comment: "${quotePreview(comment)}"`,
                ],
            });

            if (nextStage === GEM_TENDER_STAGES.WAITING_FOR_QUOTE) {
                const updated = await getGemTenderById({ id: gemTender.id });
                await notifyGemTenderQuoteRequested({
                    tender: updated || gemTender,
                    requestedByUser: currentUser,
                    assigneeUser: await getUserById({ id: Number(gemTender.assignee_user_id) }),
                });
            }

            successCount += 1;
        } catch (error) {
            failedCount += 1;
            failures.push({ id, error: "Failed to change stage" });
        }
    }

    return bulkResult({ verb: "Changed stage on", successCount, skippedCount, failedCount, failures, set });
}

/** Bulk Not eligible / Out of scope: sets the flag and locks. */
export async function bulkSetGemTenderEligibility({ body, cookie, set }) {
    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return { error: "Unauthorized" };
    }

    if (!hasAuthority(currentUser.authorities, AUTHORITIES.MARK_GEM_TENDER_MASS_STAGE_CHANGE)) {
        set.status = 403;
        return { error: "Missing authority to bulk change tender eligibility" };
    }

    const choice = String(body?.eligibility || "").trim();
    if (!ELIGIBILITY_LOCK_MESSAGES[choice]) {
        set.status = 400;
        return { error: "Invalid eligibility" };
    }

    const comment = asText(body?.comment).trim();
    if (!comment) {
        set.status = 400;
        return { error: "Comment is required" };
    }

    const ids = parseIds(body?.ids);
    if (!ids.length) {
        set.status = 400;
        return { error: "Select at least one tender" };
    }

    let successCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const failures = [];

    for (const id of ids) {
        const gemTender = await getGemTenderById({ id });
        if (!gemTender) {
            failedCount += 1;
            failures.push({ id, error: "Tender not found" });
            continue;
        }

        const previousChoice = eligibilityChoiceOf(gemTender);
        if (previousChoice === choice) {
            skippedCount += 1;
            continue;
        }

        let error = null;
        if (isTenderLocked(gemTender)) {
            error = "Unlock this tender before making changes";
        } else if (!(asAssigneeId(gemTender.assignee_user_id) >= 1)) {
            error = "Assign someone before changing eligibility";
        } else if (knownStageOrNull(gemTender.stage) === GEM_TENDER_STAGES.FILED) {
            error = "Eligibility cannot change after the tender is filed";
        }
        if (error) {
            failedCount += 1;
            failures.push({ id, error });
            continue;
        }

        try {
            const previousStage = knownStageOrNull(gemTender.stage);
            const choicePatch = eligibilityPatch({ choice, previousStage });
            await updateGemTenderById({ id: gemTender.id, ...choicePatch });

            const commentId = await createGemTenderComment({
                gem_tender_id: gemTender.id,
                user_id: currentUser.id,
                comment,
            });
            if (!commentId) {
                failedCount += 1;
                failures.push({ id, error: "Failed to add comment" });
                continue;
            }

            await logActivities({
                gem_tender_id: gemTender.id,
                user_id: currentUser.id,
                activities: [
                    ...eligibilityActivities({
                        previousChoice,
                        choice,
                        previousStage,
                        patch: choicePatch,
                    }),
                    `Added comment: "${quotePreview(comment)}"`,
                ],
            });

            successCount += 1;
        } catch (error) {
            failedCount += 1;
            failures.push({ id, error: "Failed to change eligibility" });
        }
    }

    return bulkResult({ verb: "Updated", successCount, skippedCount, failedCount, failures, set });
}

export async function bulkAssignGemTenders({ body, cookie, set }) {
    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return { error: "Unauthorized" };
    }

    const assignToMe = body?.assign_to_me === true;
    const nextAssigneeUserId = assignToMe
        ? Number(currentUser.id)
        : asAssigneeId(body?.assignee_user_id);

    if (!(nextAssigneeUserId >= 1)) {
        set.status = 400;
        return { error: "Assignee is required" };
    }

    const comment = asText(body?.comment).trim();
    if (!comment) {
        set.status = 400;
        return { error: "Comment is required" };
    }

    const canAssignOthers = canAssignOtherUsers(currentUser);
    const assigningSelf = nextAssigneeUserId === Number(currentUser.id);
    if (!canAssignOthers && !assigningSelf) {
        set.status = 403;
        return { error: "Missing authority to assign other users" };
    }

    const assigneeUser = await getUserById({ id: nextAssigneeUserId });
    if (!assigneeUser) {
        set.status = 400;
        return { error: "Assignee not found" };
    }

    const ids = parseIds(body?.ids);
    if (!ids.length) {
        set.status = 400;
        return { error: "Select at least one tender" };
    }

    let successCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const failures = [];
    const assignedTenders = [];

    for (const id of ids) {
        const gemTender = await getGemTenderById({ id });
        if (!gemTender) {
            failedCount += 1;
            failures.push({ id, error: "Tender not found" });
            continue;
        }

        if (isTenderLocked(gemTender)) {
            failedCount += 1;
            failures.push({ id, error: "Unlock this tender before making changes" });
            continue;
        }

        const previousAssigneeUserId = asAssigneeId(gemTender.assignee_user_id);
        if (previousAssigneeUserId === nextAssigneeUserId) {
            skippedCount += 1;
            continue;
        }

        if (!canAssignOthers && previousAssigneeUserId != null) {
            failedCount += 1;
            failures.push({ id, error: "Selected tenders already have an assignee" });
            continue;
        }

        if (assignToMe && previousAssigneeUserId != null) {
            failedCount += 1;
            failures.push({ id, error: "Already assigned to someone else" });
            continue;
        }

        const previousAssignee = previousAssigneeUserId
            ? await getUserById({ id: previousAssigneeUserId })
            : null;

        try {
            if (previousAssigneeUserId == null) {
                const claimed = await claimUnassignedGemTenderById({
                    id: gemTender.id,
                    assignee_user_id: nextAssigneeUserId,
                });
                if (!claimed) {
                    failedCount += 1;
                    failures.push({ id, error: "Already assigned to someone else" });
                    continue;
                }
            } else {
                await updateGemTenderById({
                    id: gemTender.id,
                    assignee_user_id: nextAssigneeUserId,
                });
            }

            const commentId = await createGemTenderComment({
                gem_tender_id: gemTender.id,
                user_id: currentUser.id,
                comment,
            });
            if (!commentId) {
                failedCount += 1;
                failures.push({ id, error: "Failed to add comment" });
                continue;
            }

            await logActivities({
                gem_tender_id: gemTender.id,
                user_id: currentUser.id,
                activities: [
                    assignToMe
                        ? "Assigned tender to self"
                        : `Changed assignee from ${assigneeLabel(previousAssignee)} to ${assigneeLabel(assigneeUser)}`,
                    `Added comment: "${quotePreview(comment)}"`,
                ],
            });

            const updated = await getGemTenderById({ id: gemTender.id });
            assignedTenders.push(updated || gemTender);
            successCount += 1;
        } catch (error) {
            failedCount += 1;
            failures.push({ id, error: "Failed to assign tender" });
        }
    }

    if (assignedTenders.length) {
        notifyGemTendersBulkAssigned({
            tenders: assignedTenders,
            assigneeUser,
            assignedByUser: currentUser,
        });
    }

    return bulkResult({ verb: "Assigned", successCount, skippedCount, failedCount, failures, set });
}

/**
 * One-off GeM search from the tenders list (Add tender).
 * Does not assign a category group; set group later on the tender detail page.
 */
export async function startGemAdhocTenderScan({ body, cookie, set }) {
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

    const job = await enqueueGemScanJob({
        runId,
        keywords,
        createdBy: currentUser.id,
        title: `GeM adhoc scan (${keywords.length})`,
    });
    if (!job) {
        set.status = 400;
        return { error: "Failed to enqueue selenium job", processing: false };
    }

    set.status = 202;
    const label =
        queries.length === 1
            ? `“${queries[0]}”`
            : `${queries.length} search texts`;
    return {
        message: `Scan queued for ${label}. Matching tenders will be added shortly.`,
        processing: true,
        job_id: job.id,
        count: queries.length,
        run: await getGemTenderScanRunById({ id: runId }),
    };
}
