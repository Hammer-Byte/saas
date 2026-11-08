import {
    AUTHORITIES,
    GEM_KEYWORD_TENDER_ELIGIBILITY,
    GEM_KEYWORD_TENDER_STAGE_LABELS,
    GEM_KEYWORD_TENDER_STAGES,
} from "../constants.js";
import { createGemKeywordTenderActivity } from "../db/gem_keyword_tender_activities.js";
import {
    getGemKeywordTenderById,
    updateGemKeywordTenderById,
} from "../db/gem_keyword_tenders.js";
import { getUserById } from "../db/users.js";
import {
    notifyGemKeywordTenderAssigned,
    notifyGemKeywordTenderQuoteRequested,
} from "../libs/gem_tender_notify.js";
import { getCurrentUser } from "./authentication.js";

const STAGE_VALUES = new Set(Object.values(GEM_KEYWORD_TENDER_STAGES));

function stageLabel(stage) {
    return GEM_KEYWORD_TENDER_STAGE_LABELS[stage] || stage || "-";
}

function assigneeLabel(user) {
    if (!user) return "Unassigned";
    return user.full_name || user.email || `User #${user.id}`;
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
                hidden: false,
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

function canEditQuote({ currentUser, assigneeUserId, stage }) {
    if (stage !== GEM_KEYWORD_TENDER_STAGES.ELIGIBLE) {
        return false;
    }
    if (currentUser?.super_admin) {
        return true;
    }
    return (
        Number(assigneeUserId) >= 1 && Number(assigneeUserId) === Number(currentUser?.id)
    );
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

    if (assigneeChanging) {
        const assigningSelf = nextAssigneeUserId === currentUser.id;
        const currentlyUnassigned = previousAssigneeUserId == null;
        const canAssignOthers = (currentUser.authorities || []).includes(
            AUTHORITIES.ASSIGN_GEM_TENDER_ASSIGNEE,
        );
        if (!canAssignOthers && !(assigningSelf && currentlyUnassigned)) {
            set.status = 403;
            return {
                error: currentlyUnassigned
                    ? "Missing authority to assign other users"
                    : "Only users with assign authority can change an existing assignee",
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

    // Assign to me / new assignee auto-selects Assigned when still in New / Out of scope.
    if (
        assigneeChanging &&
        nextAssigneeUserId != null &&
        body.stage === undefined &&
        (previousStage === GEM_KEYWORD_TENDER_STAGES.NEW ||
            previousStage === GEM_KEYWORD_TENDER_STAGES.OUT_OF_SCOPE)
    ) {
        nextStage = GEM_KEYWORD_TENDER_STAGES.ASSIGNED;
    }

    // Unassign while on Assigned → back to New.
    if (
        assigneeChanging &&
        nextAssigneeUserId == null &&
        body.stage === undefined &&
        previousStage === GEM_KEYWORD_TENDER_STAGES.ASSIGNED
    ) {
        nextStage = GEM_KEYWORD_TENDER_STAGES.NEW;
    }

    if (
        nextStage === GEM_KEYWORD_TENDER_STAGES.ASSIGNED &&
        !(nextAssigneeUserId >= 1)
    ) {
        set.status = 400;
        return { error: "Assignee is required for Assigned stage" };
    }

    const nextQuoteRaw = body.quote !== undefined ? asText(body.quote) : previousQuote;
    let nextQuote = nextQuoteRaw;

    if (body.quote !== undefined && nextQuote !== previousQuote) {
        if (
            !canEditQuote({
                currentUser,
                assigneeUserId: nextAssigneeUserId,
                stage: nextStage,
            })
        ) {
            set.status = 403;
            return {
                error: "Only the assignee or a super admin can edit the quote when Eligible",
            };
        }
    }

    if (nextStage !== GEM_KEYWORD_TENDER_STAGES.ELIGIBLE) {
        // Keep existing quote text, but editing is only allowed in Eligible.
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

    await updateGemKeywordTenderById({
        id: gemKeywordTender.id,
        hidden: flags.hidden,
        eligible: flags.eligible,
        filed: flags.filed,
        quote: nextQuote,
        stage: nextStage,
        assignee_user_id: nextAssigneeUserId,
    });

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
