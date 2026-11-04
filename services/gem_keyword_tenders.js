import {
    AUTHORITIES,
    GEM_KEYWORD_TENDER_STAGE_LABELS,
    GEM_KEYWORD_TENDER_STAGES,
} from "../constants.js";
import { createGemKeywordTenderActivity } from "../db/gem_keyword_tender_activities.js";
import {
    getGemKeywordTenderById,
    updateGemKeywordTenderById,
} from "../db/gem_keyword_tenders.js";
import { getUserById } from "../db/users.js";
import { getCurrentUser } from "./authentication.js";

const STAGE_VALUES = new Set(Object.values(GEM_KEYWORD_TENDER_STAGES));

function stageLabel(stage) {
    return GEM_KEYWORD_TENDER_STAGE_LABELS[stage] || stage || "-";
}

function booleanLabel(value) {
    return value ? "Yes" : "No";
}

function assigneeLabel(user) {
    if (!user) return "Unassigned";
    return user.full_name || user.email || `User #${user.id}`;
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

    const nextHidden = body.hidden ?? !!gemKeywordTender.hidden;
    const nextEligible = body.eligible ?? !!gemKeywordTender.eligible;
    const nextFiled = body.filed ?? !!gemKeywordTender.filed;
    const nextQuote = body.quote !== undefined ? body.quote : gemKeywordTender.quote;
    const nextStage =
        body.stage !== undefined ? body.stage : gemKeywordTender.stage || GEM_KEYWORD_TENDER_STAGES.NEW;

    if (!STAGE_VALUES.has(nextStage)) {
        set.status = 400;
        return { error: "Invalid stage" };
    }

    if (nextFiled && !nextEligible) {
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
        activities.push(nextHidden ? "Marked as hidden" : "Unhid tender");
    }
    if (!!gemKeywordTender.eligible !== nextEligible) {
        activities.push(`Set eligible to ${booleanLabel(nextEligible)}`);
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
    if (assigneeChanging) {
        const previousAssignee = previousAssigneeUserId
            ? await getUserById({ id: previousAssigneeUserId })
            : null;
        const nextAssignee = nextAssigneeUserId
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
    set.status = 200;
    return { message: "Tender updated", gemKeywordTender: updatedGemKeywordTender };
}
