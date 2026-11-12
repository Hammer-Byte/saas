import {
    GEM_KEYWORD_TENDER_STAGE_LABELS,
    GEM_KEYWORD_TENDER_STAGES,
} from "../constants.js";
import {
    getGemKeywordTenderActivityCountsByActor,
    getGemKeywordTenderStageChangeActivities,
} from "../db/gem_keyword_tender_activities.js";
import {
    getAllGemKeywordTenders,
    getGemKeywordTenderNewCountsByCreatedDay,
} from "../db/gem_keyword_tenders.js";
import { getIstDateTime, getReadableDate } from "../libs/date.js";

const STAGE_ORDER = Object.values(GEM_KEYWORD_TENDER_STAGES);

const STAGE_LABEL_TO_KEY = Object.fromEntries(
    Object.entries(GEM_KEYWORD_TENDER_STAGE_LABELS).map(([stage, label]) => [label, stage]),
);

const STAGE_CHANGE_TO_PATTERN = /^Changed stage from .+ to (.+)$/;

function emptyStageCounts() {
    return Object.fromEntries(STAGE_ORDER.map((stage) => [stage, 0]));
}

function eachDateKey(from, to) {
    const rangeStart = from <= to ? from : to;
    const rangeEnd = from <= to ? to : from;
    const dates = [];
    const cursor = new Date(
        Number(rangeStart.slice(0, 4)),
        Number(rangeStart.slice(5, 7)) - 1,
        Number(rangeStart.slice(8, 10)),
    );
    const end = new Date(
        Number(rangeEnd.slice(0, 4)),
        Number(rangeEnd.slice(5, 7)) - 1,
        Number(rangeEnd.slice(8, 10)),
    );
    while (cursor <= end) {
        const yyyy = cursor.getFullYear();
        const mm = `${cursor.getMonth() + 1}`.padStart(2, "0");
        const dd = `${cursor.getDate()}`.padStart(2, "0");
        dates.push(`${yyyy}-${mm}-${dd}`);
        cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
}

function activityDateKey(createdOn) {
    return getReadableDate("YYYY-MM-DD", createdOn) || "";
}

function parseStageEntered(activityText) {
    const match = String(activityText || "").trim().match(STAGE_CHANGE_TO_PATTERN);
    if (!match) {
        return null;
    }
    const label = match[1].trim();
    return STAGE_LABEL_TO_KEY[label] || null;
}

function clampStageEntryRange(from, to) {
    const today = getIstDateTime()?.slice(0, 10);
    const rangeStart = from <= to ? from : to;
    const rangeEnd = from <= to ? to : from;
    if (!today || !/^\d{4}-\d{2}-\d{2}$/.test(today)) {
        return { from: rangeStart, to: rangeEnd };
    }
    const end = rangeEnd > today ? today : rangeEnd;
    const start = rangeStart > end ? end : rangeStart;
    return { from: start, to: end };
}

function buildStageEntriesByDay({ from, to, stageChangeActivities, newCountsByDay }) {
    const dates = eachDateKey(from, to);
    const byDate = new Map(dates.map((date) => [date, emptyStageCounts()]));

    for (const row of newCountsByDay) {
        const dateKey = activityDateKey(row.entry_date);
        if (!byDate.has(dateKey)) {
            continue;
        }
        byDate.get(dateKey)[GEM_KEYWORD_TENDER_STAGES.NEW] += Number(row.entry_count || 0);
    }

    for (const activity of stageChangeActivities) {
        const stage = parseStageEntered(activity.activity);
        if (!stage || !STAGE_ORDER.includes(stage)) {
            continue;
        }
        // New is counted from tender created_on, not stage-change text.
        if (stage === GEM_KEYWORD_TENDER_STAGES.NEW) {
            continue;
        }
        const dateKey = activityDateKey(activity.created_on);
        if (!byDate.has(dateKey)) {
            continue;
        }
        byDate.get(dateKey)[stage] += 1;
    }

    const columns = STAGE_ORDER.map((stage) => ({
        stage,
        label: GEM_KEYWORD_TENDER_STAGE_LABELS[stage] || stage,
    }));

    const rows = dates.map((date) => {
        const counts = byDate.get(date) || emptyStageCounts();
        const total = STAGE_ORDER.reduce((sum, stage) => sum + Number(counts[stage] || 0), 0);
        return {
            date,
            counts,
            total,
        };
    });

    const columnTotals = emptyStageCounts();
    for (const row of rows) {
        for (const stage of STAGE_ORDER) {
            columnTotals[stage] += Number(row.counts[stage] || 0);
        }
    }
    const grandTotal = STAGE_ORDER.reduce(
        (sum, stage) => sum + Number(columnTotals[stage] || 0),
        0,
    );

    return {
        columns,
        rows,
        columnTotals,
        grandTotal,
    };
}

function emptyAssigneeBucket(key, label) {
    return {
        key,
        label,
        assigned_count: 0,
        locked_count: 0,
        stage_new: 0,
        stage_assigned: 0,
        stage_waiting_for_docs: 0,
        stage_waiting_for_gem: 0,
        stage_waiting_for_quote: 0,
        stage_preparing_docs: 0,
        stage_eligible: 0,
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
    const stageEntryRange = clampStageEntryRange(from, to);
    const [stageChangeActivities, newCountsByDay] = await Promise.all([
        getGemKeywordTenderStageChangeActivities(stageEntryRange),
        getGemKeywordTenderNewCountsByCreatedDay(stageEntryRange),
    ]);
    const stageEntriesByDay = buildStageEntriesByDay({
        from: stageEntryRange.from,
        to: stageEntryRange.to,
        stageChangeActivities,
        newCountsByDay,
    });

    const assigneeBuckets = new Map();
    const stageTotals = {};
    for (const stage of Object.values(GEM_KEYWORD_TENDER_STAGES)) {
        stageTotals[stage] = 0;
    }

    let unassignedCount = 0;
    let lockedCount = 0;
    const lockMessageCounts = new Map();
    const tenderCategoryCounts = new Map();
    let filedCount = 0;
    let eligibleCount = 0;
    let assignedStageCount = 0;
    let waitingForDocsCount = 0;
    let waitingForGemCount = 0;
    let waitingForQuoteCount = 0;
    let preparingDocsCount = 0;
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

        if (Number(tender.locked)) {
            bucket.locked_count += 1;
            lockedCount += 1;
            const lockMessage = String(tender.lock_message || "").trim() || "Locked (no message)";
            lockMessageCounts.set(lockMessage, (lockMessageCounts.get(lockMessage) || 0) + 1);
        }

        const tenderCategoryLabel = tender.tender_category_id
            ? tender.tender_category_name || `Category #${tender.tender_category_id}`
            : "Uncategorized";
        tenderCategoryCounts.set(
            tenderCategoryLabel,
            (tenderCategoryCounts.get(tenderCategoryLabel) || 0) + 1,
        );

        if (stage === GEM_KEYWORD_TENDER_STAGES.NEW) bucket.stage_new += 1;
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
    const lockMessageList = Array.from(lockMessageCounts.entries())
        .map(([message, count]) => ({ message, count }))
        .sort((left, right) => right.count - left.count);
    const tenderCategoryList = Array.from(tenderCategoryCounts.entries())
        .map(([label, count]) => ({ label, count }))
        .sort((left, right) => {
            if (left.label === "Uncategorized") return 1;
            if (right.label === "Uncategorized") return -1;
            return right.count - left.count;
        });
    const personWiseAssigned = chartAssignees.map((row) => ({
        label: row.label,
        assigned_count: row.assigned_count,
    }));

    return {
        totals: {
            tenders: tenders.length,
            assigned: tenders.length - unassignedCount,
            unassigned: unassignedCount,
            locked: lockedCount,
            filed: filedCount,
            eligible: eligibleCount,
            need_to_check: assignedStageCount,
            waiting_for_docs: waitingForDocsCount,
            waiting_for_gem: waitingForGemCount,
            waiting_for_quote: waitingForQuoteCount,
            preparing_docs: preparingDocsCount,
            untouched_assigned: untouchedAssignedCount,
            actors_with_activity: activityRows.length,
        },
        stageEntriesByDay,
        stageTotals: stageTotalsList,
        lockMessages: lockMessageList,
        tenderCategories: tenderCategoryList,
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
            lockReasons: {
                labels: lockMessageList.map((row) => row.message),
                values: lockMessageList.map((row) => row.count),
            },
            tenderCategoryMix: {
                labels: tenderCategoryList.map((row) => row.label),
                values: tenderCategoryList.map((row) => row.count),
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
