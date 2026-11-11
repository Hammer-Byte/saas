import {
    AUTHORITIES,
    GEM_KEYWORD_TENDER_ELIGIBILITY,
    GEM_KEYWORD_TENDER_STAGE_LABELS,
    GEM_KEYWORD_TENDER_STAGES,
} from "../constants.js";
import { createGemKeywordTenderActivity } from "../db/gem_keyword_tender_activities.js";
import { createGemKeywordTenderComment } from "../db/gem_keyword_tender_comments.js";
import {
    claimUnassignedGemKeywordTenderById,
    getGemKeywordTenderById,
    updateGemKeywordTenderById,
} from "../db/gem_keyword_tenders.js";
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
    GEM_KEYWORD_TENDER_STAGES.OUT_OF_SCOPE,
    GEM_KEYWORD_TENDER_STAGES.UNATTENDED,
    GEM_KEYWORD_TENDER_STAGES.MISSED,
    GEM_KEYWORD_TENDER_STAGES.NOT_ELIGIBLE,
]);

/** Set only by deadline watchers — not selectable in UI / manual PATCH. */
export const SYSTEM_MANAGED_STAGES = new Set([
    GEM_KEYWORD_TENDER_STAGES.UNATTENDED,
    GEM_KEYWORD_TENDER_STAGES.MISSED,
]);

function stageLabel(stage) {
    return GEM_KEYWORD_TENDER_STAGE_LABELS[stage] || stage || "-";
}

export function isSystemManagedStage(stage) {
    return SYSTEM_MANAGED_STAGES.has(normalizeStage(stage));
}

export function isQuoteStageEnabled(stage) {
    return !QUOTE_DISABLED_STAGES.has(normalizeStage(stage));
}

/**
 * Stage / quote / docs:
 * - Unattended / Missed: super_admin only
 * - Otherwise with assignee: assignee or super_admin
 */
export function canOperateAssignedTender({ currentUser, assigneeUserId, stage = null }) {
    if (!currentUser?.id) {
        return false;
    }
    if (currentUser.super_admin) {
        return true;
    }
    if (stage != null && isSystemManagedStage(stage)) {
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
        case GEM_KEYWORD_TENDER_STAGES.OUT_OF_SCOPE:
        case GEM_KEYWORD_TENDER_STAGES.UNATTENDED:
        case GEM_KEYWORD_TENDER_STAGES.MISSED:
            return {
                hidden: true,
                filed: false,
                eligible: GEM_KEYWORD_TENDER_ELIGIBILITY.NEED_TO_CHECK,
            };
        case GEM_KEYWORD_TENDER_STAGES.ELIGIBLE:
            return {
                hidden: false,
                filed: false,
                eligible: GEM_KEYWORD_TENDER_ELIGIBILITY.ELIGIBLE,
            };
        case GEM_KEYWORD_TENDER_STAGES.NOT_ELIGIBLE:
            return {
                hidden: true,
                filed: false,
                eligible: GEM_KEYWORD_TENDER_ELIGIBILITY.NOT_ELIGIBLE,
            };
        case GEM_KEYWORD_TENDER_STAGES.FILED:
            return {
                hidden: false,
                filed: true,
                eligible: GEM_KEYWORD_TENDER_ELIGIBILITY.ELIGIBLE,
            };
        case GEM_KEYWORD_TENDER_STAGES.ASSIGNED:
        case GEM_KEYWORD_TENDER_STAGES.WAITING_FOR_DOCS:
        case GEM_KEYWORD_TENDER_STAGES.PREPARING_DOCS:
            return {
                hidden: false,
                filed: false,
                eligible: GEM_KEYWORD_TENDER_ELIGIBILITY.NEED_TO_CHECK,
            };
        case GEM_KEYWORD_TENDER_STAGES.NEW:
        default:
            return {
                hidden: false,
                filed: false,
                eligible: GEM_KEYWORD_TENDER_ELIGIBILITY.NEED_TO_CHECK,
            };
    }
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

    // Unattended / Missed: only a super admin may change anything.
    if (isSystemManagedStage(previousStage) && !currentUser.super_admin) {
        const touching =
            assigneeChanging ||
            body.assign_to_me === true ||
            body.stage !== undefined ||
            body.quote !== undefined;
        if (touching) {
            set.status = 403;
            return {
                error: "Only a super admin can change Unattended or Missed tenders",
            };
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

    // Unattended / Missed are set by deadline watchers only (super admin may still set them).
    if (
        body.stage !== undefined &&
        isSystemManagedStage(nextStage) &&
        !currentUser.super_admin
    ) {
        set.status = 400;
        return {
            error: "Unattended and Missed are set automatically and cannot be selected manually",
        };
    }

    // Assign to me / admin assign: if stage would stay New, move to Assigned.
    // Also promote common inbox stages when the client did not pick a stage explicitly.
    if (assigneeChanging && nextAssigneeUserId != null) {
        const inboxStages = new Set([
            GEM_KEYWORD_TENDER_STAGES.NEW,
            GEM_KEYWORD_TENDER_STAGES.OUT_OF_SCOPE,
            GEM_KEYWORD_TENDER_STAGES.UNATTENDED,
            GEM_KEYWORD_TENDER_STAGES.MISSED,
        ]);
        if (nextStage === GEM_KEYWORD_TENDER_STAGES.NEW) {
            nextStage = GEM_KEYWORD_TENDER_STAGES.ASSIGNED;
        } else if (body.stage === undefined && inboxStages.has(previousStage)) {
            nextStage = GEM_KEYWORD_TENDER_STAGES.ASSIGNED;
        }
    }

    // Unassign while on Assigned / docs stages → back to New.
    if (
        assigneeChanging &&
        nextAssigneeUserId == null &&
        body.stage === undefined &&
        (previousStage === GEM_KEYWORD_TENDER_STAGES.ASSIGNED ||
            previousStage === GEM_KEYWORD_TENDER_STAGES.WAITING_FOR_DOCS ||
            previousStage === GEM_KEYWORD_TENDER_STAGES.PREPARING_DOCS)
    ) {
        nextStage = GEM_KEYWORD_TENDER_STAGES.NEW;
    }

    const assigneeRequiredStages = new Set([
        GEM_KEYWORD_TENDER_STAGES.ASSIGNED,
        GEM_KEYWORD_TENDER_STAGES.WAITING_FOR_DOCS,
        GEM_KEYWORD_TENDER_STAGES.PREPARING_DOCS,
    ]);
    if (assigneeRequiredStages.has(nextStage) && !(nextAssigneeUserId >= 1)) {
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
    // Unattended/Missed remain super-admin-only (even if unassigned).
    if (stageChanging && body.stage !== undefined) {
        if (isSystemManagedStage(previousStage)) {
            if (!currentUser.super_admin) {
                set.status = 403;
                return {
                    error: "Only a super admin can change stage on Unattended or Missed tenders",
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
            })
        ) {
            set.status = 403;
            return {
                error:
                    "Only the assignee or a super admin can edit the quote in this stage",
            };
        }
    }

    const flags = flagsForStage(nextStage);
    const activities = [];

    if (previousStage !== nextStage) {
        activities.push(
            `Changed stage from ${stageLabel(previousStage)} to ${stageLabel(nextStage)}`,
        );
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
    } else {
        await updateGemKeywordTenderById({
            id: gemKeywordTender.id,
            hidden: flags.hidden,
            eligible: flags.eligible,
            filed: flags.filed,
            quote: nextQuote,
            stage: nextStage,
            assignee_user_id: nextAssigneeUserId,
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

    if (isSystemManagedStage(nextStage) && !currentUser.super_admin) {
        set.status = 400;
        return {
            error: "Unattended and Missed are set automatically and cannot be selected manually",
        };
    }

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

    const assigneeRequiredStages = new Set([
        GEM_KEYWORD_TENDER_STAGES.ASSIGNED,
        GEM_KEYWORD_TENDER_STAGES.WAITING_FOR_DOCS,
        GEM_KEYWORD_TENDER_STAGES.PREPARING_DOCS,
    ]);
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

        if (isSystemManagedStage(previousStage) && !currentUser.super_admin) {
            failedCount += 1;
            failures.push({
                id,
                error: "Only a super admin can change Unattended or Missed tenders",
            });
            continue;
        }

        const assigneeUserId = gemKeywordTender.assignee_user_id
            ? Number(gemKeywordTender.assignee_user_id)
            : null;
        if (assigneeRequiredStages.has(nextStage) && !(assigneeUserId >= 1)) {
            failedCount += 1;
            failures.push({ id, error: "Assignee is required for this stage" });
            continue;
        }

        try {
            await updateGemKeywordTenderById({
                id: gemKeywordTender.id,
                hidden: flags.hidden,
                eligible: flags.eligible,
                filed: flags.filed,
                quote: gemKeywordTender.quote,
                stage: nextStage,
                assignee_user_id: assigneeUserId,
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

            await logActivities({
                gem_keyword_tender_id: gemKeywordTender.id,
                user_id: currentUser.id,
                activities: [
                    `Changed stage from ${stageLabel(previousStage)} to ${stageLabel(nextStage)}`,
                    `Added comment: "${quotePreview(comment)}"`,
                ],
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
 * One-off GeM search from the tenders list.
 * Does not create/store a keyword row; saved tenders get keyword_id = null.
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

    const started = crawlGemForTenders({
        keywords: queries.map((keyword) => ({
            id: null,
            keyword,
            exact_search,
        })),
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
    };
}
