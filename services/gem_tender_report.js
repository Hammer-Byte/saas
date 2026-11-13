import { GEM_TENDER_STAGE_LABELS, GEM_TENDER_STAGES } from "../constants.js";
import { getGemTenderActivitiesInRange } from "../db/gem_tender_activities.js";
import { getGemTenderAssigneeWorkload } from "../db/gem_tenders.js";
import { getIstDateTime, getReadableDate } from "../libs/date.js";

/** What an employee did, classified from activity log text. */
const ACTION_TYPES = [
    { key: "assignment", label: "Assignments", color: "#6c757d" },
    { key: "category", label: "Category changes", color: "#0dcaf0" },
    { key: "eligible", label: "Marked eligible", color: "#198754" },
    { key: "ineligible", label: "Not eligible", color: "#d63384" },
    { key: "out_of_scope", label: "Out of scope", color: "#b02a37" },
    { key: "stage", label: "Stage moves", color: "#6610f2" },
    { key: "filed", label: "Filed", color: "#212529" },
    { key: "quote", label: "Quotes", color: "#fd7e14" },
    { key: "comment", label: "Comments", color: "#0d6efd" },
    { key: "lock", label: "Unlock / lock again", color: "#ffc107" },
];
const ACTION_KEYS = ACTION_TYPES.map((type) => type.key);
const ACTION_LABELS = Object.fromEntries(ACTION_TYPES.map((type) => [type.key, type.label]));

const ELIGIBILITY_ACTIONS = {
    Eligible: "eligible",
    "Not eligible": "ineligible",
    "Out of scope": "out_of_scope",
};
const FILED_LABEL = GEM_TENDER_STAGE_LABELS[GEM_TENDER_STAGES.FILED];
const WORK_STAGE_LABELS = new Set(
    Object.entries(GEM_TENDER_STAGE_LABELS)
        .filter(([stage]) => stage !== GEM_TENDER_STAGES.FILED)
        .map(([, label]) => label),
);
// Pre-redesign logs marked eligibility as a stage change to "Eligible".
const LEGACY_ELIGIBLE_STAGE_LABEL = "Eligible";
// Choosing Eligible logs "No stage -> Waiting For Docs" automatically; that is not a separate stage move.
const NO_STAGE_LABEL = "No stage";

const PERSON_COLORS = [
    "#0d6efd",
    "#198754",
    "#fd7e14",
    "#6f42c1",
    "#dc3545",
    "#20c997",
    "#d63384",
    "#0dcaf0",
    "#795548",
    "#6c757d",
    "#8bc34a",
    "#ffc107",
];

const LOG_ROW_LIMIT = 3000;

function classifyActivity(text) {
    const activity = String(text || "").trim();
    if (/^Assigned tender to self\b/.test(activity) || /^Changed assignee from /.test(activity)) {
        return "assignment";
    }
    if (/^Changed category from /.test(activity)) {
        return "category";
    }
    const eligibility = activity.match(/^Changed eligibility from .+ to (.+)$/);
    if (eligibility) {
        return ELIGIBILITY_ACTIONS[eligibility[1].trim()] || null;
    }
    const stage = activity.match(/^Changed stage from (.+?) to (.+)$/);
    if (stage) {
        const fromLabel = stage[1].trim();
        const toLabel = stage[2].trim();
        if (toLabel === FILED_LABEL) return "filed";
        if (toLabel === LEGACY_ELIGIBLE_STAGE_LABEL) return "eligible";
        if (fromLabel === NO_STAGE_LABEL) return null;
        return WORK_STAGE_LABELS.has(toLabel) ? "stage" : null;
    }
    if (/^(Added|Updated|Cleared) quote\b/.test(activity)) {
        return "quote";
    }
    if (/^(Added|Updated) comment\b/.test(activity)) {
        return "comment";
    }
    if (activity === "Unlocked tender" || /^Locked tender again:/.test(activity)) {
        return "lock";
    }
    return null;
}

function eachDateKey(from, to) {
    const dates = [];
    const cursor = new Date(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, Number(from.slice(8, 10)));
    const end = new Date(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1, Number(to.slice(8, 10)));
    while (cursor <= end) {
        const mm = `${cursor.getMonth() + 1}`.padStart(2, "0");
        const dd = `${cursor.getDate()}`.padStart(2, "0");
        dates.push(`${cursor.getFullYear()}-${mm}-${dd}`);
        cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
}

/** Charts stop at today; a range reaching into the future would only add empty days. */
function clampToToday(from, to) {
    const today = getIstDateTime()?.slice(0, 10);
    if (!today || !/^\d{4}-\d{2}-\d{2}$/.test(today)) {
        return { from, to };
    }
    const end = to > today ? today : to;
    return { from: from > end ? end : from, to: end };
}

function personLabel(fullName, email, userId) {
    return fullName || email || `User #${userId}`;
}

function emptyActionCounts() {
    return Object.fromEntries(ACTION_KEYS.map((key) => [key, 0]));
}

export async function buildGemTenderReport({ from, to }) {
    const [activities, workloadRows] = await Promise.all([
        getGemTenderActivitiesInRange({ from, to }),
        getGemTenderAssigneeWorkload({ from, to }),
    ]);

    const chartRange = clampToToday(from, to);
    const dates = eachDateKey(chartRange.from, chartRange.to);
    const dateIndex = new Map(dates.map((date, index) => [date, index]));

    const employees = new Map();
    function employee(userId, label) {
        const key = String(userId);
        if (!employees.has(key)) {
            employees.set(key, {
                user_id: Number(userId),
                label,
                counts: emptyActionCounts(),
                total: 0,
                tenders: new Set(),
                last_active: null,
                last_active_label: "",
                open_undecided: 0,
                open_in_progress: 0,
                missed: 0,
                daily: Object.fromEntries(ACTION_KEYS.map((actionKey) => [actionKey, dates.map(() => 0)])),
            });
        }
        return employees.get(key);
    }

    const totals = {
        actions: 0,
        tenders_touched: 0,
        eligible: 0,
        filed: 0,
        missed: 0,
        unattended: 0,
    };
    const tendersTouched = new Set();
    const log = [];

    for (const row of activities) {
        const person = employee(row.user_id, personLabel(row.user_full_name, row.user_email, row.user_id));
        const createdOn = getReadableDate("YYYY-MM-DD HH:mm:ss", row.created_on) || "";
        const createdOnLabel = getReadableDate("DD/MM/YYYY HH:mm", row.created_on) || "";
        const actionKey = classifyActivity(row.activity);

        if (log.length < LOG_ROW_LIMIT) {
            log.push({
                user_id: person.user_id,
                at: createdOnLabel,
                gem_tender_id: row.gem_tender_id,
                tender_id: row.tender_id,
                action: actionKey ? ACTION_LABELS[actionKey] : "",
                activity: row.activity,
            });
        }
        if (!person.last_active || createdOn > person.last_active) {
            person.last_active = createdOn;
            person.last_active_label = createdOnLabel;
        }
        if (!actionKey) continue;

        person.counts[actionKey] += 1;
        person.total += 1;
        person.tenders.add(row.gem_tender_id);
        tendersTouched.add(row.gem_tender_id);
        totals.actions += 1;
        if (actionKey === "eligible") totals.eligible += 1;
        if (actionKey === "filed") totals.filed += 1;

        const index = dateIndex.get(createdOn.slice(0, 10));
        if (index != null) {
            person.daily[actionKey][index] += 1;
        }
    }
    totals.tenders_touched = tendersTouched.size;

    for (const row of workloadRows) {
        totals.unattended += Number(row.unattended_in_range || 0);
        if (!row.assignee_user_id) continue;
        const person = employee(
            row.assignee_user_id,
            personLabel(row.assignee_full_name, row.assignee_email, row.assignee_user_id),
        );
        person.open_undecided = Number(row.open_undecided || 0);
        person.open_in_progress = Number(row.open_in_progress || 0);
        person.missed = Number(row.missed_in_range || 0);
        totals.missed += person.missed;
    }

    const employeeRows = Array.from(employees.values())
        .filter(
            (person) =>
                person.total > 0 ||
                person.last_active ||
                person.open_undecided ||
                person.open_in_progress ||
                person.missed,
        )
        .sort(
            (left, right) =>
                right.total - left.total ||
                right.open_undecided + right.open_in_progress -
                    (left.open_undecided + left.open_in_progress) ||
                left.label.localeCompare(right.label),
        );

    return {
        totals: {
            ...totals,
            active_people: employeeRows.filter((person) => person.total > 0).length,
        },
        actionTypes: ACTION_TYPES,
        employees: employeeRows.map((person) => ({
            user_id: person.user_id,
            label: person.label,
            counts: person.counts,
            total: person.total,
            tenders_touched: person.tenders.size,
            last_active: person.last_active_label,
            open_undecided: person.open_undecided,
            open_in_progress: person.open_in_progress,
            missed: person.missed,
        })),
        logTruncated: activities.length > LOG_ROW_LIMIT,
        charts: {
            dates,
            actionTypes: ACTION_TYPES,
            people: employeeRows
                .filter((person) => person.total > 0)
                .map((person, index) => ({
                    user_id: person.user_id,
                    label: person.label,
                    color: PERSON_COLORS[index % PERSON_COLORS.length],
                    daily: person.daily,
                })),
            log,
        },
    };
}
