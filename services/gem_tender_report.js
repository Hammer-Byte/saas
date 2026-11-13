import {
    GEM_TENDER_ELIGIBILITY_CHOICE_LABELS,
    GEM_TENDER_LOCK_MESSAGES,
    GEM_TENDER_STAGE_LABELS,
    GEM_TENDER_STAGES,
} from "../constants.js";
import {
    getGemTenderActivityCountsByActor,
    getGemTenderLockActivities,
    getGemTenderStageChangeActivities,
} from "../db/gem_tender_activities.js";
import {
    getAllGemTenders,
    getGemTenderNewCountsByCreatedDay,
} from "../db/gem_tenders.js";
import { getIstDateTime, getReadableDate } from "../libs/date.js";

const STAGE_ORDER = Object.values(GEM_TENDER_STAGES);

/** Snapshot status: lock reason, then pipeline stage, then assignment (same as the list page). */
const STATUS_LABELS = {
    unassigned: "Unassigned",
    assigned: "Assigned (undecided)",
    eligible: "Eligible (no stage)",
    ...GEM_TENDER_STAGE_LABELS,
    ineligible: GEM_TENDER_ELIGIBILITY_CHOICE_LABELS.ineligible,
    out_of_scope: GEM_TENDER_ELIGIBILITY_CHOICE_LABELS.out_of_scope,
    missed: "Missed",
    unattended: "Unattended",
};

function tenderStatus(tender) {
    if (Number(tender.missed)) return "missed";
    if (Number(tender.unattended)) return "unattended";
    if (Number(tender.ineligible)) return "ineligible";
    if (Number(tender.out_of_scope)) return "out_of_scope";
    if (GEM_TENDER_STAGE_LABELS[tender.stage]) return tender.stage;
    if (Number(tender.eligible)) return "eligible";
    return tender.assignee_user_id ? "assigned" : "unassigned";
}

const STAGE_LABEL_TO_KEY = Object.fromEntries(
    Object.entries(GEM_TENDER_STAGE_LABELS).map(([stage, label]) => [label, stage]),
);

const LOCK_SERIES = [
    {
        key: "lock_missed",
        label: "Missed",
        messages: [GEM_TENDER_LOCK_MESSAGES.DEADLINE_MISSED],
    },
    {
        key: "lock_due_date",
        label: "Unattended",
        messages: [GEM_TENDER_LOCK_MESSAGES.DUE_DATE_PASSED],
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
    { key: "new", label: "New", kind: "stage" },
    { key: "eligible", label: "Marked eligible", kind: "stage" },
    ...STAGE_ORDER.map((stage) => ({
        key: stage,
        label: GEM_TENDER_STAGE_LABELS[stage] || stage,
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
const MARKED_ELIGIBLE_PATTERN = new RegExp(
    `^Changed eligibility from .+ to ${GEM_TENDER_ELIGIBILITY_CHOICE_LABELS.eligible}$`,
);
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

/** Series key for a stage / eligibility activity, or null. */
function parseStageEntered(activityText) {
    const text = String(activityText || "").trim();
    if (MARKED_ELIGIBLE_PATTERN.test(text)) {
        return "eligible";
    }
    const match = text.match(STAGE_CHANGE_TO_PATTERN);
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
        ensureDayBucket(overallByDate, dateKey).new += Number(
            row.entry_count || 0,
        );
    }

    for (const activity of stageChangeActivities) {
        const stage = parseStageEntered(activity.activity);
        if (!stage) continue;

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

    return {
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

function emptyAssigneeBucket(key, label) {
    return {
        key,
        label,
        assigned_count: 0,
        locked_count: 0,
        ...Object.fromEntries(Object.keys(STATUS_LABELS).map((status) => [`status_${status}`, 0])),
        untouched: 0,
        activity_count: 0,
    };
}

export async function buildGemTenderReport({ from, to }) {
    const tenders = await getAllGemTenders({ from, to });
    const activityRows = await getGemTenderActivityCountsByActor({ from, to });
    const stageEntryRange = clampStageEntryRange(from, to);
    const [stageChangeActivities, lockActivities, newCountsByDay] = await Promise.all([
        getGemTenderStageChangeActivities(stageEntryRange),
        getGemTenderLockActivities(stageEntryRange),
        getGemTenderNewCountsByCreatedDay(stageEntryRange),
    ]);
    const { dailyEvents } = buildDailyEventCharts({
        from: stageEntryRange.from,
        to: stageEntryRange.to,
        stageChangeActivities,
        lockActivities,
        newCountsByDay,
    });

    const assigneeBuckets = new Map();
    const statusTotals = Object.fromEntries(Object.keys(STATUS_LABELS).map((status) => [status, 0]));

    let unassignedCount = 0;
    let lockedCount = 0;
    const lockMessageCounts = new Map();
    const tenderCategoryCounts = new Map();
    let untouchedAssignedCount = 0;

    for (const tender of tenders) {
        const status = tenderStatus(tender);
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
        bucket[`status_${status}`] += 1;
        statusTotals[status] += 1;

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

        if (status === "assigned") {
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
    const stageTotalsList = Object.entries(statusTotals).map(([stage, count]) => ({
        stage,
        label: STATUS_LABELS[stage] || stage,
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
            ...statusTotals,
            untouched_assigned: untouchedAssignedCount,
            actors_with_activity: activityRows.length,
        },
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
                labels: stageTotalsList.map((row) => row.label),
                values: stageTotalsList.map((row) => row.count),
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
