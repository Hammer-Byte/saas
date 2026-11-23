import {
    INQUIRY_SOURCES,
    INQUIRY_STATE_LABELS,
    INQUIRY_STATES,
} from "../constants.js";
import { createInquiryActivity } from "../db/inquiry_activities.js";
import { createInquiryNote } from "../db/inquiry_notes.js";
import {
    createInquiry,
    getInquiryById,
    updateInquiryById,
} from "../db/inquiries.js";
import { getUserById } from "../db/users.js";
import { getIstDateTime } from "../libs/date.js";
import {
    notifyAdminsNewInquiry,
    notifyInquireeReceived,
    notifyInquiryAssigned,
} from "../libs/inquiry_notify.js";
import {
    canUserAssignInquiryOthers,
    canUserManageInquiry,
    isInquiryAdminUser,
    normalizeInquiryState,
} from "../libs/inquiry_workflow.js";
import { getCurrentUser } from "./authentication.js";

const STATE_VALUES = new Set(Object.values(INQUIRY_STATES));

function asText(value) {
    if (value == null) return null;
    const text = String(value).trim();
    return text || null;
}

function stateLabel(state) {
    return INQUIRY_STATE_LABELS[state] || state || INQUIRY_STATE_LABELS[INQUIRY_STATES.NEW];
}

function assigneeLabel(user) {
    if (!user) return "Unassigned";
    return user.full_name || user.email || `User #${user.id}`;
}

function quotePreview(value) {
    const text = String(value || "")
        .trim()
        .replace(/\s+/g, " ");
    if (!text) return "";
    return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

function notePreview(value) {
    return quotePreview(value);
}

export async function logInquiryActivity({ inquiry_id, user_id, activity }) {
    return await createInquiryActivity({
        inquiry_id,
        user_id,
        activity,
    });
}

async function logActivities({ inquiry_id, user_id, activities }) {
    let logged = 0;
    for (const activity of activities) {
        const ok = await logInquiryActivity({
            inquiry_id,
            user_id,
            activity,
        });
        if (ok) logged += 1;
    }
    return logged;
}

async function sendCreateEmails({ inquiry }) {
    await notifyAdminsNewInquiry({ inquiry });
    notifyInquireeReceived({ inquiry });
}

function potentialFieldsForStateChange({ inquiry, previousState, nextState }) {
    let nextPotentialEnteredOn = inquiry.potential_entered_on || null;
    let nextFollowup1Reminder = inquiry.followup_1_reminder_sent_on || null;
    let nextFollowup2Reminder = inquiry.followup_2_reminder_sent_on || null;
    let nextFollowup3Reminder = inquiry.followup_3_reminder_sent_on || null;

    if (previousState !== INQUIRY_STATES.POTENTIAL && nextState === INQUIRY_STATES.POTENTIAL) {
        nextPotentialEnteredOn = getIstDateTime();
        nextFollowup1Reminder = null;
        nextFollowup2Reminder = null;
        nextFollowup3Reminder = null;
    } else if (
        previousState === INQUIRY_STATES.POTENTIAL &&
        nextState !== INQUIRY_STATES.POTENTIAL
    ) {
        nextPotentialEnteredOn = null;
        nextFollowup1Reminder = null;
        nextFollowup2Reminder = null;
        nextFollowup3Reminder = null;
    }

    return {
        nextPotentialEnteredOn,
        nextFollowup1Reminder,
        nextFollowup2Reminder,
        nextFollowup3Reminder,
    };
}

export async function addInquiry({ body, set }) {
    const inquiryId = await createInquiry({
        full_name: asText(body.full_name),
        phone: body.phone,
        email: asText(body.email),
        source: asText(body.source),
        organization: asText(body.organization),
        city: asText(body.city),
        state: INQUIRY_STATES.NEW,
    });

    if (!inquiryId) {
        set.status = 500;
        return { error: "Failed to submit inquiry" };
    }

    const inquiry = await getInquiryById({ id: inquiryId });
    if (inquiry) {
        await sendCreateEmails({ inquiry });
    }

    set.status = 201;
    return { message: "Inquiry submitted", inquiry };
}

export async function addManualInquiry({ body, cookie, set }) {
    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return { error: "Unauthorized" };
    }

    if (!isInquiryAdminUser(currentUser)) {
        set.status = 403;
        return { error: "Only admins can add inquiries manually" };
    }

    const inquiryId = await createInquiry({
        full_name: asText(body.full_name),
        phone: body.phone,
        email: asText(body.email),
        source: INQUIRY_SOURCES.MANUAL,
        organization: asText(body.organization),
        state: INQUIRY_STATES.NEW,
    });

    if (!inquiryId) {
        set.status = 500;
        return { error: "Failed to create inquiry" };
    }

    await logInquiryActivity({
        inquiry_id: inquiryId,
        user_id: currentUser.id,
        activity: "Created inquiry manually",
    });

    const note = asText(body.note);
    if (note) {
        const noteId = await createInquiryNote({
            inquiry_id: inquiryId,
            user_id: currentUser.id,
            note,
        });
        if (noteId) {
            await logInquiryActivity({
                inquiry_id: inquiryId,
                user_id: currentUser.id,
                activity: `Added note: "${notePreview(note)}"`,
            });
        }
    }

    const inquiry = await getInquiryById({ id: inquiryId });
    if (inquiry) {
        await sendCreateEmails({ inquiry });
    }

    set.status = 201;
    return { message: "Inquiry created", inquiry };
}

export async function updateInquiry({ params, body, cookie, set }) {
    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return { error: "Unauthorized" };
    }

    const inquiry = await getInquiryById({ id: params.id });
    if (!inquiry) {
        set.status = 404;
        return { error: "Inquiry not found" };
    }

    if (!canUserManageInquiry({ inquiry, currentUser })) {
        set.status = 403;
        return { error: "Not allowed to update this inquiry" };
    }

    const previousState = normalizeInquiryState(inquiry.state);
    const previousAssigneeUserId = inquiry.assignee_user_id
        ? Number(inquiry.assignee_user_id)
        : null;
    const previousQuote = asText(inquiry.quote);

    let nextAssigneeUserId =
        body.assignee_user_id !== undefined
            ? body.assignee_user_id
            : inquiry.assignee_user_id;

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
        const canAssignOthers = canUserAssignInquiryOthers(currentUser);
        if (!canAssignOthers && !(assigningSelf && currentlyUnassigned)) {
            set.status = 403;
            return {
                error: currentlyUnassigned
                    ? "Missing authority to assign other users"
                    : "Only admins or users with assign authority can change an existing assignee",
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

    let nextState =
        body.state !== undefined ? normalizeInquiryState(body.state) : previousState;

    if (!STATE_VALUES.has(nextState)) {
        set.status = 400;
        return { error: "Invalid state" };
    }

    if (
        assigneeChanging &&
        nextAssigneeUserId != null &&
        body.state === undefined &&
        previousState === INQUIRY_STATES.NEW
    ) {
        nextState = INQUIRY_STATES.ASSIGNED;
    }

    if (
        assigneeChanging &&
        nextAssigneeUserId == null &&
        body.state === undefined &&
        previousState === INQUIRY_STATES.ASSIGNED
    ) {
        nextState = INQUIRY_STATES.NEW;
    }

    const isAdmin = isInquiryAdminUser(currentUser);
    let nextFullName = inquiry.full_name;
    let nextPhone = inquiry.phone;
    let nextEmail = inquiry.email;
    let nextSource = inquiry.source;
    let nextOrganization = inquiry.organization;
    let nextCity = inquiry.city;

    if (isAdmin) {
        if (body.full_name !== undefined) nextFullName = asText(body.full_name);
        if (body.phone !== undefined) nextPhone = String(body.phone || "").trim();
        if (body.email !== undefined) nextEmail = asText(body.email);
        if (body.organization !== undefined) {
            nextOrganization = asText(body.organization);
        }
        if (body.city !== undefined) nextCity = asText(body.city);
        if (body.source !== undefined) nextSource = asText(body.source);
    }

    if (!nextPhone) {
        set.status = 400;
        return { error: "Phone is required" };
    }

    const nextQuote = body.quote !== undefined ? asText(body.quote) : previousQuote;

    const {
        nextPotentialEnteredOn,
        nextFollowup1Reminder,
        nextFollowup2Reminder,
        nextFollowup3Reminder,
    } = potentialFieldsForStateChange({
        inquiry,
        previousState,
        nextState,
    });

    const activities = [];

    if (previousState !== nextState) {
        activities.push(
            `Changed state from ${stateLabel(previousState)} to ${stateLabel(nextState)}`,
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
                    ? `Assigned inquiry to self (was ${assigneeLabel(previousAssignee)})`
                    : "Assigned inquiry to self",
            );
        } else {
            activities.push(
                `Changed assignee from ${assigneeLabel(previousAssignee)} to ${assigneeLabel(nextAssignee)}`,
            );
        }
    }

    if (nextFullName !== inquiry.full_name) {
        activities.push("Updated full name");
    }
    if (nextPhone !== inquiry.phone) {
        activities.push("Updated phone");
    }
    if (nextEmail !== inquiry.email) {
        activities.push("Updated email");
    }
    if (nextOrganization !== inquiry.organization) {
        activities.push("Updated organization");
    }

    await updateInquiryById({
        id: inquiry.id,
        full_name: nextFullName,
        phone: nextPhone,
        email: nextEmail,
        source: nextSource,
        organization: nextOrganization,
        city: nextCity,
        state: nextState,
        assignee_user_id: nextAssigneeUserId,
        quote: nextQuote,
        potential_entered_on: nextPotentialEnteredOn,
        followup_1_reminder_sent_on: nextFollowup1Reminder,
        followup_2_reminder_sent_on: nextFollowup2Reminder,
        followup_3_reminder_sent_on: nextFollowup3Reminder,
    });

    if (activities.length) {
        await logActivities({
            inquiry_id: inquiry.id,
            user_id: currentUser.id,
            activities,
        });
    }

    const updatedInquiry = await getInquiryById({ id: inquiry.id });

    if (assigneeChanging && nextAssigneeUserId != null && nextAssignee) {
        notifyInquiryAssigned({
            inquiry: updatedInquiry,
            assigneeUser: nextAssignee,
            assignedByUser: currentUser,
        });
    }

    set.status = 200;
    return { message: "Inquiry updated", inquiry: updatedInquiry };
}

export async function bulkChangeInquiryStates({ body, cookie, set }) {
    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return { error: "Unauthorized" };
    }

    if (!isInquiryAdminUser(currentUser)) {
        set.status = 403;
        return { error: "Only admins can bulk change inquiry state" };
    }

    const nextState = normalizeInquiryState(body.state);
    if (!STATE_VALUES.has(nextState) || body.state === undefined) {
        set.status = 400;
        return { error: "Invalid state" };
    }

    const ids = Array.isArray(body.ids)
        ? [...new Set(body.ids.map((id) => Number(id)).filter((id) => id >= 1))]
        : [];
    if (!ids.length) {
        set.status = 400;
        return { error: "No inquiries selected" };
    }

    let updatedCount = 0;
    let skippedCount = 0;
    const errors = [];

    for (const id of ids) {
        const inquiry = await getInquiryById({ id });
        if (!inquiry) {
            errors.push({ id, error: "Inquiry not found" });
            continue;
        }

        const previousState = normalizeInquiryState(inquiry.state);
        if (previousState === nextState) {
            skippedCount += 1;
            continue;
        }

        const {
            nextPotentialEnteredOn,
            nextFollowup1Reminder,
            nextFollowup2Reminder,
            nextFollowup3Reminder,
        } = potentialFieldsForStateChange({
            inquiry,
            previousState,
            nextState,
        });

        await updateInquiryById({
            id: inquiry.id,
            full_name: inquiry.full_name,
            phone: inquiry.phone,
            email: inquiry.email,
            source: inquiry.source,
            organization: inquiry.organization,
            city: inquiry.city,
            state: nextState,
            assignee_user_id: inquiry.assignee_user_id,
            quote: inquiry.quote,
            potential_entered_on: nextPotentialEnteredOn,
            followup_1_reminder_sent_on: nextFollowup1Reminder,
            followup_2_reminder_sent_on: nextFollowup2Reminder,
            followup_3_reminder_sent_on: nextFollowup3Reminder,
        });

        await logInquiryActivity({
            inquiry_id: inquiry.id,
            user_id: currentUser.id,
            activity: `Changed state from ${stateLabel(previousState)} to ${stateLabel(nextState)}`,
        });
        updatedCount += 1;
    }

    set.status = 200;
    return {
        message: "Bulk state change complete",
        updated: updatedCount,
        skipped: skippedCount,
        errors,
    };
}
