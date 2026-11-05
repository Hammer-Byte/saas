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

function asBoolean(value) {
    return value === true || value === 1 || value === "1";
}

function asText(value) {
    return value == null ? "" : String(value);
}

function quotePreview(value) {
    const text = asText(value).trim().replace(/\s+/g, " ");
    if (!text) return "";
    return text.length > 120 ? `${text.slice(0, 117)}...` : text;
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

    const previousEligible = normalizeEligibility(gemKeywordTender.eligible);
    const previousHidden = asBoolean(gemKeywordTender.hidden);
    const previousFiled = asBoolean(gemKeywordTender.filed);
    const previousQuote = asText(gemKeywordTender.quote);
    const previousStage = gemKeywordTender.stage || GEM_KEYWORD_TENDER_STAGES.NEW;

    const nextHidden = body.hidden !== undefined ? asBoolean(body.hidden) : previousHidden;
    let nextEligible =
        body.eligible !== undefined
            ? normalizeEligibility(body.eligible)
            : previousEligible;
    let nextFiled = body.filed !== undefined ? asBoolean(body.filed) : previousFiled;
    const nextQuote = body.quote !== undefined ? asText(body.quote) : previousQuote;
    const nextStage =
        body.stage !== undefined ? body.stage : previousStage;

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

    if (previousHidden !== nextHidden) {
        activities.push(
            nextHidden
                ? "Marked tender as out of service scope"
                : "Restored tender to service scope",
        );
    }

    if (previousEligible !== nextEligible) {
        activities.push(
            `Changed eligibility from ${eligibilityLabel(previousEligible)} to ${eligibilityLabel(nextEligible)}`,
        );
    }

    if (previousFiled !== nextFiled) {
        activities.push(
            nextFiled ? "Marked tender as filed" : "Cleared filed status",
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

    if (previousStage !== nextStage) {
        activities.push(
            `Changed stage from ${stageLabel(previousStage)} to ${stageLabel(nextStage)}`,
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

    await updateGemKeywordTenderById({
        id: gemKeywordTender.id,
        hidden: nextHidden,
        eligible: nextEligible,
        filed: nextFiled,
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

    set.status = 200;
    return { message: "Tender updated", gemKeywordTender: updatedGemKeywordTender };
}
