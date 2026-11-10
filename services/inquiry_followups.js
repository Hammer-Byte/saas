import {
    INQUIRY_FOLLOWUP_DAY_OFFSETS,
    INQUIRY_STATES,
} from "../constants.js";
import {
    createInquiryFollowup,
    getAllInquiryFollowupsByInquiryId,
    getInquiryFollowupByInquiryIdAndSlot,
} from "../db/inquiry_followups.js";
import { getInquiryById } from "../db/inquiries.js";
import { getIstDateTime, toDbDateTime } from "../libs/date.js";
import { canUserManageInquiry } from "../libs/inquiry_workflow.js";
import { getCurrentUser } from "./authentication.js";
import { logInquiryActivity } from "./inquiries.js";

function notePreview(value) {
    const text = String(value || "")
        .trim()
        .replace(/\s+/g, " ");
    if (!text) return "";
    return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

export async function addInquiryFollowup({ body, cookie, set }) {
    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return { error: "Unauthorized" };
    }

    const inquiry = await getInquiryById({ id: body.inquiry_id });
    if (!inquiry) {
        set.status = 404;
        return { error: "Inquiry not found" };
    }

    if (!canUserManageInquiry({ inquiry, currentUser })) {
        set.status = 403;
        return { error: "Not allowed to add follow-ups on this inquiry" };
    }

    if (inquiry.state !== INQUIRY_STATES.POTENTIAL) {
        set.status = 400;
        return { error: "Follow-ups are only allowed when state is Potential" };
    }

    const slot = Number(body.slot);
    if (!(slot >= 1 && slot <= 3) || !INQUIRY_FOLLOWUP_DAY_OFFSETS[slot]) {
        set.status = 400;
        return { error: "Invalid follow-up slot" };
    }

    const existingFollowup = await getInquiryFollowupByInquiryIdAndSlot({
        inquiry_id: inquiry.id,
        slot,
    });
    if (existingFollowup) {
        set.status = 400;
        return { error: `Follow-up #${slot} already recorded` };
    }

    const followups = await getAllInquiryFollowupsByInquiryId({
        inquiry_id: inquiry.id,
    });
    const expectedSlot = followups.length + 1;
    if (slot !== expectedSlot) {
        set.status = 400;
        return {
            error:
                expectedSlot > 3
                    ? "Maximum of 3 follow-ups already recorded"
                    : `Next follow-up must be slot ${expectedSlot}`,
        };
    }

    const note = String(body.note || "").trim();
    if (!note) {
        set.status = 400;
        return { error: "Note is required" };
    }

    const followedUpOn =
        toDbDateTime(body.followed_up_on) || body.followed_up_on || getIstDateTime();

    const followupId = await createInquiryFollowup({
        inquiry_id: inquiry.id,
        user_id: currentUser.id,
        note,
        followed_up_on: followedUpOn,
        slot,
    });

    if (!followupId) {
        set.status = 400;
        return { error: "Failed to add follow-up" };
    }

    await logInquiryActivity({
        inquiry_id: inquiry.id,
        user_id: currentUser.id,
        activity: `Recorded follow-up #${slot}: "${notePreview(note)}"`,
    });

    const updatedFollowups = await getAllInquiryFollowupsByInquiryId({
        inquiry_id: inquiry.id,
    });
    const inquiryFollowup = updatedFollowups.find(
        (row) => Number(row.id) === Number(followupId),
    );

    set.status = 201;
    return { message: "Follow-up added", inquiryFollowup };
}
