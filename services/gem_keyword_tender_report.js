import {
    GEM_KEYWORD_TENDER_STAGE_LABELS,
    GEM_KEYWORD_TENDER_STAGES,
    GEM_TENDER_LOCK_MESSAGES,
} from "../constants.js";
import {
    getGemKeywordTenderActivityCountsByActor,
    getGemKeywordTenderLockActivities,
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

const LOCK_SERIES = [
    {
        key: "lock_missed",
        label: "Missed",
        messages: [GEM_TENDER_LOCK_MESSAGES.DEADLINE_MISSED],
    },
    {
        key: "lock_out_of_scope",
        label: "Out of scope",
        messages: [GEM_TENDER_LOCK_MESSAGES.OUT_OF_SCOPE],
    },
    {
        key: "lock_not_eligible",
        label: "Not eligible",
        messages: [GEM_TENDER_LOCK_MESSAGES.NOT_ELIGIBLE],
    },
    {
        key: "lock_due_date",
        label: "Due date passed",
        messages: [GEM_TENDER_LOCK_MESSAGES.DUE_DATE_PASSED],
    },
    {
        key: "lock_other",
        label: "Other lock",
        messages: [],
    },
];

const LOCK_MESSAGE_TO_KEY = new Map();
for (const series of LOCK_SERIES) {
    for (const message of series.messages) {
        LOCK_MESSAGE_TO_KEY.set(String(message).trim().toLowerCase(), series.key);
    }
}

const DAILY_SERIES = [
    ...STAGE_ORDER.map((stage) => ({
        key: stage,
        label: GEM_KEYWORD_TENDER_STAGE_LABELS[stage] || stage,
        kind: "stage",
    })),
    ...LOCK_SERIES.map((series) => ({
        key: series.key,
        label: series.label,
        kind: "lock",
    })),
];

const DAILY_SERIES_KEYS = DAILY_SERIES.map((series) => series.key);

const EVENT_SERIES_COLORS = {
    new: "#0d6efd",
    assigned: "#6c757d",
    eligible: "#198754",
    waiting_for_docs: "#0dcaf0",
    waiting_for_gem: "#6610f2",
    waiting_for_quote: "#fd7e14",
    preparing_docs: "#20c997",
    filed: "#212529",
    lock_missed: "#dc3545",
    lock_out_of_scope: "#b02a37",
    lock_not_eligible: "#d63384",
    lock_due_date: "#ffc107",
    lock_other: "#adb5bd",
};

const STAGE_CHANGE_TO_PATTERN = /^Changed stage from .+ to (.+)$/;
const LOCK_ACTIVITY_PATTERN = /^Locked tender(?::\s*(.+))?$/i;

function emptySeriesCounts() {
    return Object.fromEntries(DAILY_SERIES_KEYS.map((key) => [key, 0]));
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

function parseLockSeriesKey(activityText) {
    const match = String(activityText || "").trim().match(LOCK_ACTIVITY_PATTERN);
    if (!match) {
        return null;
    }
    const message = String(match[1] || "").trim().toLowerCase();
    if (!message) {
        return "lock_other";
    }
    // Filing already counted via stage "Filed"; skip the paired lock activity.
    if (message === String(GEM_TENDER_LOCK_MESSAGES.ALREADY_FILED).trim().toLowerCase()) {
        return null;
    }
    return LOCK_MESSAGE_TO_KEY.get(message) || "lock_other";
}

function actorKeyFromRow(row) {
    const userId = Number(row?.user_id);
    if (userId >= 1) {
        return String(userId);
    }
    return "unknown";
}

function actorLabelFromRow(row) {
    const userId = Number(row?.user_id);
    if (userId >= 1) {
        return row.user_full_name || row.user_email || `User #${userId}`;
    }
    return "Unknown";
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

function ensureDayBucket(map, date) {
    if (!map.has(date)) {
        map.set(date, emptySeriesCounts());
    }
    return map.get(date);
}

function ensurePersonDayBucket(peopleMap, personKey, personLabel, date) {
    if (!peopleMap.has(personKey)) {
        peopleMap.set(personKey, {
            key: personKey,
            label: personLabel,
            byDate: new Map(),
        });
    }
    const person = peopleMap.get(personKey);
    if (!person.byDate.has(date)) {
        person.byDate.set(date, emptySeriesCounts());
    }
    return person.byDate.get(date);
}

function countsToSeriesArrays(dates, byDate) {
    const values = {};
    for (const key of DAILY_SERIES_KEYS) {
        values[key] = dates.map((date) => Number((byDate.get(date) || emptySeriesCounts())[key] || 0));
    }
    return values;
}

function buildDailyEventCharts({
    from,
    to,
    stageChangeActivities,
    lockActivities,
    newCountsByDay,
}) {
    const dates = eachDateKey(from, to);
    const overallByDate = new Map(dates.map((date) => [date, emptySeriesCounts()]));
    const peopleMap = new Map();

    for (const row of newCountsByDay) {
        const dateKey = activityDateKey(row.entry_date);
        if (!overallByDate.has(dateKey)) continue;
        ensureDayBucket(overallByDate, dateKey)[GEM_KEYWORD_TENDER_STAGES.NEW] += Number(
            row.entry_count || 0,
        );
    }

    for (const activity of stageChangeActivities) {
        const stage = parseStageEntered(activity.activity);
        if (!stage || !STAGE_ORDER.includes(stage)) continue;
        if (stage === GEM_KEYWORD_TENDER_STAGES.NEW) continue;

        const dateKey = activityDateKey(activity.created_on);
        if (!overallByDate.has(dateKey)) continue;

        ensureDayBucket(overallByDate, dateKey)[stage] += 1;
        ensurePersonDayBucket(
            peopleMap,
            actorKeyFromRow(activity),
            actorLabelFromRow(activity),
            dateKey,
        )[stage] += 1;
    }

    for (const activity of lockActivities) {
        const lockKey = parseLockSeriesKey(activity.activity);
        if (!lockKey) continue;

        const dateKey = activityDateKey(activity.created_on);
        if (!overallByDate.has(dateKey)) continue;

        ensureDayBucket(overallByDate, dateKey)[lockKey] += 1;
        ensurePersonDayBucket(
            peopleMap,
            actorKeyFromRow(activity),
            actorLabelFromRow(activity),
            dateKey,
        )[lockKey] += 1;
    }

    const series = DAILY_SERIES.map((item) => ({
        key: item.key,
        label: item.label,
        kind: item.kind,
        color: EVENT_SERIES_COLORS[item.key] || "#6c757d",
    }));

    const people = Array.from(peopleMap.values())
        .map((person) => {
            const values = countsToSeriesArrays(dates, person.byDate);
            const total = DAILY_SERIES_KEYS.reduce(
                (sum, key) =>
                    sum + values[key].reduce((inner, count) => inner + Number(count || 0), 0),
                0,
            );
            return {
                key: person.key,
                label: person.label,
                total,
                values,
            };
        })
        .filter((person) => person.total > 0)
        .sort((left, right) => right.total - left.total || left.label.localeCompare(right.label));

    const overallValues = countsToSeriesArrays(dates, overallByDate);
    const overallTotal = DAILY_SERIES_KEYS.reduce(
        (sum, key) =>
            sum + overallValues[key].reduce((inner, count) => inner + Number(count || 0), 0),
        0,
    );

    // Keep legacy table shape for any leftover consumers.
    const stageEntriesByDay = {
        columns: STAGE_ORDER.map((stage) => ({
            stage,
            label: GEM_KEYWORD_TENDER_STAGE_LABELS[stage] || stage,
        })),
        rows: dates.map((date) => {
            const counts = emptyStageCountsFromOverall(overallByDate.get(date));
            const total = STAGE_ORDER.reduce((sum, stage) => sum + Number(counts[stage] || 0), 0);
            return { date, counts, total };
        }),
        columnTotals: emptyStageCounts(),
        grandTotal: 0,
    };
    for (const row of stageEntriesByDay.rows) {
        for (const stage of STAGE_ORDER) {
            stageEntriesByDay.columnTotals[stage] += Number(row.counts[stage] || 0);
        }
    }
    stageEntriesByDay.grandTotal = STAGE_ORDER.reduce(
        (sum, stage) => sum + Number(stageEntriesByDay.columnTotals[stage] || 0),
        0,
    );

    return {
        stageEntriesByDay,
        dailyEvents: {
            series,
            dates,
            overall: {
                total: overallTotal,
                values: overallValues,
            },
            people,
        },
    };
}

function emptyStageCounts() {
    return Object.fromEntries(STAGE_ORDER.map((stage) => [stage, 0]));
}

function emptyStageCountsFromOverall(counts) {
    const next = emptyStageCounts();
    if (!counts) return next;
    for (const stage of STAGE_ORDER) {
        next[stage] = Number(counts[stage] || 0);
    }
    return next;
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
    const [stageChangeActivities, lockActivities, newCountsByDay] = await Promise.all([
        getGemKeywordTenderStageChangeActivities(stageEntryRange),
        getGemKeywordTenderLockActivities(stageEntryRange),
        getGemKeywordTenderNewCountsByCreatedDay(stageEntryRange),
    ]);
    const { stageEntriesByDay, dailyEvents } = buildDailyEventCharts({
        from: stageEntryRange.from,
        to: stageEntryRange.to,
        stageChangeActivities,
        lockActivities,
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
        dailyEvents,
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
            dailyEvents,
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
