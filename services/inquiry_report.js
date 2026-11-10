import {
    INQUIRY_FOLLOWUP_DAY_OFFSETS,
    INQUIRY_SOURCE_LABELS,
    INQUIRY_STATE_LABELS,
    INQUIRY_STATES,
} from "../constants.js";
import { getInquiryActivityCountsByActor } from "../db/inquiry_activities.js";
import { getAllInquiries } from "../db/inquiries.js";

function emptyAssigneeBucket(key, label) {
    return {
        key,
        label,
        count: 0,
        state_new: 0,
        state_assigned: 0,
        state_in_progress: 0,
        state_potential: 0,
        state_ignored: 0,
        state_closed: 0,
        state_canceled: 0,
        activity_count: 0,
    };
}

function normalizeState(value) {
    if (Object.values(INQUIRY_STATES).includes(value)) {
        return value;
    }
    return INQUIRY_STATES.NEW;
}

function displaySource(source) {
    if (!source) return "website";
    return source;
}

function sourceLabel(source) {
    const key = displaySource(source);
    return INQUIRY_SOURCE_LABELS[key] || key;
}

function daysSince(dateValue, now) {
    const entered = new Date(dateValue);
    if (Number.isNaN(entered.getTime())) return 0;
    return Math.floor((now.getTime() - entered.getTime()) / (24 * 60 * 60 * 1000));
}

export async function buildInquiryReport({ from, to }) {
    const inquiries = await getAllInquiries({ from, to });
    const activityRows = await getInquiryActivityCountsByActor({ from, to });
    const now = new Date();

    const assigneeBuckets = new Map();
    const stateTotals = {};
    for (const state of Object.values(INQUIRY_STATES)) {
        stateTotals[state] = 0;
    }

    const sourceTotals = {};
    let unassignedCount = 0;
    let potentialCount = 0;
    let pendingFollowupCount = 0;
    let followup1Done = 0;
    let followup2Done = 0;
    let followup3Done = 0;

    for (const inquiry of inquiries) {
        const state = normalizeState(inquiry.state);
        const assigneeKey = inquiry.assignee_user_id
            ? String(inquiry.assignee_user_id)
            : "unassigned";
        const assigneeLabel = inquiry.assignee_user_id
            ? inquiry.assignee_full_name ||
              inquiry.assignee_email ||
              `User #${inquiry.assignee_user_id}`
            : "Unassigned";

        if (!assigneeBuckets.has(assigneeKey)) {
            assigneeBuckets.set(assigneeKey, emptyAssigneeBucket(assigneeKey, assigneeLabel));
        }
        const bucket = assigneeBuckets.get(assigneeKey);
        bucket.count += 1;

        stateTotals[state] = (stateTotals[state] || 0) + 1;

        if (state === INQUIRY_STATES.NEW) bucket.state_new += 1;
        if (state === INQUIRY_STATES.ASSIGNED) bucket.state_assigned += 1;
        if (state === INQUIRY_STATES.IN_PROGRESS) bucket.state_in_progress += 1;
        if (state === INQUIRY_STATES.POTENTIAL) {
            bucket.state_potential += 1;
            potentialCount += 1;
        }
        if (state === INQUIRY_STATES.IGNORED) bucket.state_ignored += 1;
        if (state === INQUIRY_STATES.CLOSED) bucket.state_closed += 1;
        if (state === INQUIRY_STATES.CANCELED) bucket.state_canceled += 1;

        if (!inquiry.assignee_user_id) {
            unassignedCount += 1;
        }

        const sourceKey = displaySource(inquiry.source);
        sourceTotals[sourceKey] = (sourceTotals[sourceKey] || 0) + 1;

        const followupCount = Number(inquiry.followup_count || 0);
        if (followupCount >= 1) followup1Done += 1;
        if (followupCount >= 2) followup2Done += 1;
        if (followupCount >= 3) followup3Done += 1;

        if (state === INQUIRY_STATES.POTENTIAL && inquiry.potential_entered_on) {
            const nextSlot = followupCount + 1;
            if (nextSlot <= 3) {
                const dayOffset = INQUIRY_FOLLOWUP_DAY_OFFSETS[nextSlot];
                const elapsed = daysSince(inquiry.potential_entered_on, now);
                if (elapsed >= dayOffset) {
                    pendingFollowupCount += 1;
                }
            }
        }
    }

    for (const row of activityRows) {
        const key = String(row.user_id);
        if (!assigneeBuckets.has(key)) {
            assigneeBuckets.set(
                key,
                emptyAssigneeBucket(
                    key,
                    row.user_full_name || row.user_email || `User #${row.user_id}`,
                ),
            );
        }
        assigneeBuckets.get(key).activity_count = Number(row.activity_count || 0);
    }

    const sourceRows = Object.entries(sourceTotals)
        .map(([key, count]) => ({
            key,
            label: sourceLabel(key),
            count,
        }))
        .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));

    const stateRows = Object.values(INQUIRY_STATES).map((state) => ({
        key: state,
        label: INQUIRY_STATE_LABELS[state] || state,
        count: stateTotals[state] || 0,
    }));

    return {
        totals: {
            inquiries: inquiries.length,
            assigned: inquiries.length - unassignedCount,
            unassigned: unassignedCount,
            potential: potentialCount,
            pending_followups: pendingFollowupCount,
            followup_1_done: followup1Done,
            followup_2_done: followup2Done,
            followup_3_done: followup3Done,
        },
        stateRows,
        sourceRows,
        assignees: [...assigneeBuckets.values()].sort(
            (left, right) =>
                right.count - left.count || left.label.localeCompare(right.label),
        ),
        chart: {
            states: stateRows.map((row) => ({ label: row.label, count: row.count })),
            sources: sourceRows.map((row) => ({ label: row.label, count: row.count })),
        },
    };
}
