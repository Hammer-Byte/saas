import {
    GEM_KEYWORD_TENDER_ELIGIBILITY,
    GEM_KEYWORD_TENDER_STAGE_LABELS,
    GEM_KEYWORD_TENDER_STAGES,
} from "../constants.js";
import { getGemKeywordTenderActivityCountsByActor } from "../db/gem_keyword_tender_activities.js";
import { getAllGemKeywordTenders } from "../db/gem_keyword_tenders.js";

function normalizeEligibility(value) {
    if (
        value === GEM_KEYWORD_TENDER_ELIGIBILITY.ELIGIBLE ||
        value === true ||
        value === 1 ||
        value === "1"
    ) {
        return GEM_KEYWORD_TENDER_ELIGIBILITY.ELIGIBLE;
    }
    if (value === GEM_KEYWORD_TENDER_ELIGIBILITY.NOT_ELIGIBLE) {
        return GEM_KEYWORD_TENDER_ELIGIBILITY.NOT_ELIGIBLE;
    }
    return GEM_KEYWORD_TENDER_ELIGIBILITY.NEED_TO_CHECK;
}

function emptyAssigneeBucket(key, label) {
    return {
        key,
        label,
        assigned_count: 0,
        need_to_check: 0,
        eligible: 0,
        not_eligible: 0,
        filed: 0,
        hidden: 0,
        stage_new: 0,
        stage_work_in_progress: 0,
        stage_requested_for_quote: 0,
        stage_filed: 0,
        stage_waiting_for_technical: 0,
        stage_waiting_for_financial: 0,
        untouched: 0,
        activity_count: 0,
    };
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
    let hiddenCount = 0;
    let filedCount = 0;
    let eligibleCount = 0;
    let needToCheckCount = 0;
    let notEligibleCount = 0;
    let untouchedAssignedCount = 0;

    for (const tender of tenders) {
        const eligibility = normalizeEligibility(tender.eligible);
        const stage = tender.stage || GEM_KEYWORD_TENDER_STAGES.NEW;
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

        if (eligibility === GEM_KEYWORD_TENDER_ELIGIBILITY.ELIGIBLE) {
            bucket.eligible += 1;
            eligibleCount += 1;
        } else if (eligibility === GEM_KEYWORD_TENDER_ELIGIBILITY.NOT_ELIGIBLE) {
            bucket.not_eligible += 1;
            notEligibleCount += 1;
        } else {
            bucket.need_to_check += 1;
            needToCheckCount += 1;
        }

        if (tender.filed) {
            bucket.filed += 1;
            filedCount += 1;
        }
        if (tender.hidden) {
            bucket.hidden += 1;
            hiddenCount += 1;
        }

        if (stageTotals[stage] == null) {
            stageTotals[stage] = 0;
        }
        stageTotals[stage] += 1;

        if (stage === GEM_KEYWORD_TENDER_STAGES.NEW) bucket.stage_new += 1;
        if (stage === GEM_KEYWORD_TENDER_STAGES.WORK_IN_PROGRESS) {
            bucket.stage_work_in_progress += 1;
        }
        if (stage === GEM_KEYWORD_TENDER_STAGES.REQUESTED_FOR_QUOTE) {
            bucket.stage_requested_for_quote += 1;
        }
        if (stage === GEM_KEYWORD_TENDER_STAGES.FILED) bucket.stage_filed += 1;
        if (stage === GEM_KEYWORD_TENDER_STAGES.WAITING_FOR_TECHNICAL) {
            bucket.stage_waiting_for_technical += 1;
        }
        if (stage === GEM_KEYWORD_TENDER_STAGES.WAITING_FOR_FINANCIAL) {
            bucket.stage_waiting_for_financial += 1;
        }

        const untouched =
            !!tender.assignee_user_id &&
            stage === GEM_KEYWORD_TENDER_STAGES.NEW &&
            eligibility === GEM_KEYWORD_TENDER_ELIGIBILITY.NEED_TO_CHECK &&
            !tender.filed;
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

    return {
        totals: {
            tenders: tenders.length,
            assigned: tenders.length - unassignedCount,
            unassigned: unassignedCount,
            hidden: hiddenCount,
            filed: filedCount,
            eligible: eligibleCount,
            need_to_check: needToCheckCount,
            not_eligible: notEligibleCount,
            untouched_assigned: untouchedAssignedCount,
            actors_with_activity: activityRows.length,
        },
        stageTotals: Object.entries(stageTotals).map(([stage, count]) => ({
            stage,
            label: GEM_KEYWORD_TENDER_STAGE_LABELS[stage] || stage,
            count: Number(count || 0),
        })),
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
                labels: ["Need to check", "Eligible", "Not eligible"],
                values: [needToCheckCount, eligibleCount, notEligibleCount],
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
