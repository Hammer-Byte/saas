import {
    AUTHORITIES,
    GEM_KEYWORD_TENDER_ELIGIBILITY,
    GEM_KEYWORD_TENDER_ELIGIBILITY_LABELS,
    GEM_KEYWORD_TENDER_STAGE_LABELS,
    GEM_KEYWORD_TENDER_STAGES,
} from "../constants.js";
import { createGemKeywordTenderActivity } from "../db/gem_keyword_tender_activities.js";
import {
    getGemKeywordTenderById,
    updateGemKeywordTenderById,
} from "../db/gem_keyword_tenders.js";
import { getUserById } from "../db/users.js";
import { notifyGemKeywordTenderAssigned } from "../libs/gem_tender_notify.js";
import { getCurrentUser } from "./authentication.js";

const STAGE_VALUES = new Set(Object.values(GEM_KEYWORD_TENDER_STAGES));
const ELIGIBILITY_VALUES = new Set(Object.values(GEM_KEYWORD_TENDER_ELIGIBILITY));

function stageLabel(stage) {
    return GEM_KEYWORD_TENDER_STAGE_LABELS[stage] || stage || "-";
}

function eligibilityLabel(value) {
    return GEM_KEYWORD_TENDER_ELIGIBILITY_LABELS[value] || value || "-";
}

function booleanLabel(value) {
    return value ? "Yes" : "No";
}

function assigneeLabel(user) {
    if (!user) return "Unassigned";
    return user.full_name || user.email || `User #${user.id}`;
}

function normalizeEligibility(value) {
    if (ELIGIBILITY_VALUES.has(value)) {
        return value;
    }
    if (value === true || value === 1 || value === "1") {
        return GEM_KEYWORD_TENDER_ELIGIBILITY.ELIGIBLE;
    }
    if (value === false || value === 0 || value === "0") {
        return GEM_KEYWORD_TENDER_ELIGIBILITY.NEED_TO_CHECK;
    }
    return GEM_KEYWORD_TENDER_ELIGIBILITY.NEED_TO_CHECK;
}

async function logActivity({ gem_keyword_tender_id, user_id, activity }) {
    await createGemKeywordTenderActivity({
        gem_keyword_tender_id,
        user_id,
        activity,
    });
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

    const previousEligible = normalizeEligibility(gemKeywordTender.eligible);
    const nextHidden = body.hidden ?? !!gemKeywordTender.hidden;
    let nextEligible =
        body.eligible !== undefined
            ? normalizeEligibility(body.eligible)
            : previousEligible;
    let nextFiled = body.filed ?? !!gemKeywordTender.filed;
    const nextQuote = body.quote !== undefined ? body.quote : gemKeywordTender.quote;
    const nextStage =
        body.stage !== undefined
            ? body.stage
            : gemKeywordTender.stage || GEM_KEYWORD_TENDER_STAGES.NEW;

    if (!ELIGIBILITY_VALUES.has(nextEligible)) {
        set.status = 400;
        return { error: "Invalid eligibility" };
    }

    if (!STAGE_VALUES.has(nextStage)) {
        set.status = 400;
        return { error: "Invalid stage" };
    }

    if (nextEligible !== GEM_KEYWORD_TENDER_ELIGIBILITY.ELIGIBLE) {
        nextFiled = false;
    }

    if (nextFiled && nextEligible !== GEM_KEYWORD_TENDER_ELIGIBILITY.ELIGIBLE) {
        set.status = 400;
        return { error: "Mark eligible before filing" };
    }

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

    const previousAssigneeUserId = gemKeywordTender.assignee_user_id
        ? Number(gemKeywordTender.assignee_user_id)
        : null;
    const assigneeChanging = nextAssigneeUserId !== previousAssigneeUserId;

    if (assigneeChanging) {
        const assigningSelf = nextAssigneeUserId === currentUser.id;
        const canAssignOthers = (currentUser.authorities || []).includes(
            AUTHORITIES.ASSIGN_GEM_TENDER_ASSIGNEE,
        );
        if (!assigningSelf && !canAssignOthers) {
            set.status = 403;
            return { error: "Missing authority to assign other users" };
        }

        if (nextAssigneeUserId != null) {
            const assigneeUser = await getUserById({ id: nextAssigneeUserId });
            if (!assigneeUser) {
                set.status = 400;
                return { error: "Assignee not found" };
            }
        }
    }

    const activities = [];

    if (!!gemKeywordTender.hidden !== nextHidden) {
        activities.push(
            nextHidden ? "Marked as out of service scope" : "Restored to service scope",
        );
    }
    if (previousEligible !== nextEligible) {
        activities.push(
            `Changed eligibility from ${eligibilityLabel(previousEligible)} to ${eligibilityLabel(nextEligible)}`,
        );
    }
    if (!!gemKeywordTender.filed !== nextFiled) {
        activities.push(`Set filed to ${booleanLabel(nextFiled)}`);
    }
    if ((gemKeywordTender.quote || "") !== (nextQuote || "")) {
        activities.push(nextQuote?.trim() ? "Updated quote" : "Cleared quote");
    }
    if ((gemKeywordTender.stage || GEM_KEYWORD_TENDER_STAGES.NEW) !== nextStage) {
        activities.push(
            `Changed stage from ${stageLabel(gemKeywordTender.stage)} to ${stageLabel(nextStage)}`,
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
        activities.push(
            `Changed assignee from ${assigneeLabel(previousAssignee)} to ${assigneeLabel(nextAssignee)}`,
        );
    }

    await updateGemKeywordTenderById({
        id: gemKeywordTender.id,
        hidden: nextHidden,
        eligible: nextEligible,
        filed: nextFiled,
        quote: nextQuote,
        stage: nextStage,
        assignee_user_id: nextAssigneeUserId,
    });

    for (const activity of activities) {
        await logActivity({
            gem_keyword_tender_id: gemKeywordTender.id,
            user_id: currentUser.id,
            activity,
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

    set.status = 200;
    return { message: "Tender updated", gemKeywordTender: updatedGemKeywordTender };
}
