import {
    GEM_KEYWORD_TENDER_STAGE_LABELS,
    GEM_KEYWORD_TENDER_STAGES,
} from "../constants.js";
import { getGemKeywordTenderActivityCountsByActor } from "../db/gem_keyword_tender_activities.js";
import { getAllGemKeywordTenders } from "../db/gem_keyword_tenders.js";

function emptyAssigneeBucket(key, label) {
    return {
        key,
        label,
        assigned_count: 0,
        stage_new: 0,
        stage_out_of_scope: 0,
        stage_unattended: 0,
        stage_missed: 0,
        stage_assigned: 0,
        stage_waiting_for_docs: 0,
        stage_waiting_for_gem: 0,
        stage_waiting_for_quote: 0,
        stage_preparing_docs: 0,
        stage_eligible: 0,
        stage_not_eligible: 0,
        stage_filed: 0,
        untouched: 0,
        activity_count: 0,
    };
}

function normalizeStage(value) {
    if (Object.values(GEM_KEYWORD_TENDER_STAGES).includes(value)) {
        return value;
    }
    if (value === "work_in_progress") return GEM_KEYWORD_TENDER_STAGES.ASSIGNED;
    if (
        value === "requested_for_quote" ||
        value === "waiting_for_technical" ||
        value === "waiting_for_financial"
    ) {
        return GEM_KEYWORD_TENDER_STAGES.ELIGIBLE;
    }
    return GEM_KEYWORD_TENDER_STAGES.NEW;
}

export async function buildGemKeywordTenderReport({ from, to }) {
    const tenders = await getAllGemKeywordTenders({ from, to });
    const activityRows = await getGemKeywordTenderActivityCountsByActor({ from, to });

    const assigneeBuckets = new Map();
    const stageTotals = {};
    for (const stage of Object.values(GEM_KEYWORD_TENDER_STAGES)) {
        stageTotals[stage] = 0;
    }

    let unassignedCount = 0;
    let outOfScopeCount = 0;
    let unattendedCount = 0;
    let missedCount = 0;
    let filedCount = 0;
    let eligibleCount = 0;
    let assignedStageCount = 0;
    let waitingForDocsCount = 0;
    let waitingForGemCount = 0;
    let waitingForQuoteCount = 0;
    let preparingDocsCount = 0;
    let notEligibleCount = 0;
    let untouchedAssignedCount = 0;

    for (const tender of tenders) {
        const stage = normalizeStage(tender.stage);
        const assigneeKey = tender.assignee_user_id
            ? String(tender.assignee_user_id)
            : "unassigned";
        const assigneeLabel = tender.assignee_user_id
            ? tender.assignee_full_name || tender.assignee_email || `User #${tender.assignee_user_id}`
            : "Unassigned";

        if (!assigneeBuckets.has(assigneeKey)) {
            assigneeBuckets.set(assigneeKey, emptyAssigneeBucket(assigneeKey, assigneeLabel));
        }
        const bucket = assigneeBuckets.get(assigneeKey);
        bucket.assigned_count += 1;

        if (stageTotals[stage] == null) {
            stageTotals[stage] = 0;
        }
        stageTotals[stage] += 1;

        if (stage === GEM_KEYWORD_TENDER_STAGES.NEW) bucket.stage_new += 1;
        if (stage === GEM_KEYWORD_TENDER_STAGES.OUT_OF_SCOPE) {
            bucket.stage_out_of_scope += 1;
            outOfScopeCount += 1;
        }
        if (stage === GEM_KEYWORD_TENDER_STAGES.UNATTENDED) {
            bucket.stage_unattended += 1;
            unattendedCount += 1;
        }
        if (stage === GEM_KEYWORD_TENDER_STAGES.MISSED) {
            bucket.stage_missed += 1;
            missedCount += 1;
        }
        if (stage === GEM_KEYWORD_TENDER_STAGES.ASSIGNED) {
            bucket.stage_assigned += 1;
            assignedStageCount += 1;
        }
        if (stage === GEM_KEYWORD_TENDER_STAGES.WAITING_FOR_DOCS) {
            bucket.stage_waiting_for_docs += 1;
            waitingForDocsCount += 1;
        }
        if (stage === GEM_KEYWORD_TENDER_STAGES.WAITING_FOR_GEM) {
            bucket.stage_waiting_for_gem += 1;
            waitingForGemCount += 1;
        }
        if (stage === GEM_KEYWORD_TENDER_STAGES.WAITING_FOR_QUOTE) {
            bucket.stage_waiting_for_quote += 1;
            waitingForQuoteCount += 1;
        }
        if (stage === GEM_KEYWORD_TENDER_STAGES.PREPARING_DOCS) {
            bucket.stage_preparing_docs += 1;
            preparingDocsCount += 1;
        }
        if (stage === GEM_KEYWORD_TENDER_STAGES.ELIGIBLE) {
            bucket.stage_eligible += 1;
            eligibleCount += 1;
        }
        if (stage === GEM_KEYWORD_TENDER_STAGES.NOT_ELIGIBLE) {
            bucket.stage_not_eligible += 1;
            notEligibleCount += 1;
        }
        if (stage === GEM_KEYWORD_TENDER_STAGES.FILED) {
            bucket.stage_filed += 1;
            filedCount += 1;
        }

        const untouched =
            !!tender.assignee_user_id && stage === GEM_KEYWORD_TENDER_STAGES.ASSIGNED;
        if (untouched) {
            bucket.untouched += 1;
            untouchedAssignedCount += 1;
        }

        if (!tender.assignee_user_id) {
            unassignedCount += 1;
        }
    }

    const activityByUserId = new Map();
    for (const row of activityRows) {
        activityByUserId.set(String(row.user_id), Number(row.activity_count || 0));
    }

    for (const [key, bucket] of assigneeBuckets.entries()) {
        if (key === "unassigned") continue;
        bucket.activity_count = activityByUserId.get(key) || 0;
    }

    const assigneeSummary = Array.from(assigneeBuckets.values()).sort((left, right) => {
        if (left.key === "unassigned") return 1;
        if (right.key === "unassigned") return -1;
        return right.assigned_count - left.assigned_count;
    });

    const workingSummary = assigneeSummary
        .filter((row) => row.key !== "unassigned")
        .map((row) => {
            const progressed = row.assigned_count - row.untouched;
            const progressRate =
                row.assigned_count > 0
                    ? Math.round((progressed / row.assigned_count) * 100)
                    : 0;
            let status = "On track";
            if (row.assigned_count === 0) {
                status = "No assignments";
            } else if (row.untouched === row.assigned_count) {
                status = "Not started";
            } else if (row.untouched > 0 && progressRate < 50) {
                status = "Needs attention";
            } else if (row.activity_count === 0 && row.untouched > 0) {
                status = "Low activity";
            }

            return {
                ...row,
                progressed,
                progress_rate: progressRate,
                status,
            };
        });

    const chartAssignees = assigneeSummary.filter((row) => row.key !== "unassigned");
    const stageTotalsList = Object.entries(stageTotals).map(([stage, count]) => ({
        stage,
        label: GEM_KEYWORD_TENDER_STAGE_LABELS[stage] || stage,
        count: Number(count || 0),
    }));
    const personWiseAssigned = chartAssignees.map((row) => ({
        label: row.label,
        assigned_count: row.assigned_count,
    }));

    return {
        totals: {
            tenders: tenders.length,
            assigned: tenders.length - unassignedCount,
            unassigned: unassignedCount,
            hidden: outOfScopeCount,
            unattended: unattendedCount,
            missed: missedCount,
            filed: filedCount,
            eligible: eligibleCount,
            need_to_check: assignedStageCount,
            waiting_for_docs: waitingForDocsCount,
            waiting_for_gem: waitingForGemCount,
            waiting_for_quote: waitingForQuoteCount,
            preparing_docs: preparingDocsCount,
            not_eligible: notEligibleCount,
            untouched_assigned: untouchedAssignedCount,
            actors_with_activity: activityRows.length,
        },
        stageTotals: stageTotalsList,
        personWiseAssigned,
        assigneeSummary,
        workingSummary,
        activityRows: activityRows.map((row) => ({
            user_id: row.user_id,
            label: row.user_full_name || row.user_email || `User #${row.user_id}`,
            activity_count: Number(row.activity_count || 0),
        })),
        charts: {
            tendersByAssignee: {
                labels: chartAssignees.map((row) => row.label),
                values: chartAssignees.map((row) => row.assigned_count),
            },
            eligibilityOverall: {
                labels: ["Assigned (pending)", "Eligible", "Not eligible"],
                values: [assignedStageCount, eligibleCount, notEligibleCount],
            },
            stagesOverall: {
                labels: Object.entries(stageTotals).map(
                    ([stage]) => GEM_KEYWORD_TENDER_STAGE_LABELS[stage] || stage,
                ),
                values: Object.values(stageTotals).map((count) => Number(count || 0)),
            },
            activityByUser: {
                labels: activityRows.map(
                    (row) => row.user_full_name || row.user_email || `User #${row.user_id}`,
                ),
                values: activityRows.map((row) => Number(row.activity_count || 0)),
            },
        },
    };
}
