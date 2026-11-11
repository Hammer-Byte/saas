const DATE_TOKENS = /YYYY|MM|DD|HH|mm|ss/g;

function matchWallClock(value) {
    const trimmed = String(value ?? "").trim();

    const dateTimeMatch = trimmed.match(
        /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/,
    );
    if (dateTimeMatch) {
        return {
            YYYY: dateTimeMatch[1],
            MM: dateTimeMatch[2],
            DD: dateTimeMatch[3],
            HH: (dateTimeMatch[4] || "00").padStart(2, "0"),
            mm: (dateTimeMatch[5] || "00").padStart(2, "0"),
            ss: (dateTimeMatch[6] || "00").padStart(2, "0"),
        };
    }

    const monthMatch = trimmed.match(/^(\d{4})-(\d{2})$/);
    if (monthMatch) {
        return {
            YYYY: monthMatch[1],
            MM: monthMatch[2],
            DD: "01",
            HH: "00",
            mm: "00",
            ss: "00",
        };
    }

    // Indian wall-clock: DD/MM/YYYY or DD-MM-YYYY[ HH:mm[:ss]]
    const dayFirstMatch = trimmed.match(
        /^(\d{2})[/-](\d{2})[/-](\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/,
    );
    if (dayFirstMatch) {
        return {
            YYYY: dayFirstMatch[3],
            MM: dayFirstMatch[2],
            DD: dayFirstMatch[1],
            HH: (dayFirstMatch[4] || "00").padStart(2, "0"),
            mm: (dayFirstMatch[5] || "00").padStart(2, "0"),
            ss: (dayFirstMatch[6] || "00").padStart(2, "0"),
        };
    }

    return null;
}

function formatParts(format, parts) {
    return format.replace(DATE_TOKENS, (token) => parts[token]);
}

function parseToDate(date) {
    if (date == null || date === "") {
        return null;
    }

    if (date instanceof Date) {
        return Number.isNaN(date.getTime()) ? null : date;
    }

    const wallClock = matchWallClock(date);
    if (wallClock) {
        return new Date(
            Number(wallClock.YYYY),
            Number(wallClock.MM) - 1,
            Number(wallClock.DD),
            Number(wallClock.HH),
            Number(wallClock.mm),
            Number(wallClock.ss),
        );
    }

    const parsed = new Date(String(date).trim());
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(format, date) {
    if (date == null || date === "") {
        return "";
    }

    // Keep YYYY-MM-DD[ HH:mm:ss] wall-clock strings timezone-safe (no Date shift).
    if (typeof date === "string" || typeof date === "number") {
        const wallClock = matchWallClock(date);
        if (wallClock) {
            return formatParts(format, wallClock);
        }
    }

    if (date instanceof Date && !Number.isNaN(date.getTime())) {
        // MySQL DATETIME/DATE values from Bun/SQL are Date objects whose
        // UTC components match the stored wall-clock (no timezone in DB).
        return formatParts(format, {
            YYYY: String(date.getUTCFullYear()),
            MM: `${date.getUTCMonth() + 1}`.padStart(2, "0"),
            DD: `${date.getUTCDate()}`.padStart(2, "0"),
            HH: `${date.getUTCHours()}`.padStart(2, "0"),
            mm: `${date.getUTCMinutes()}`.padStart(2, "0"),
            ss: `${date.getUTCSeconds()}`.padStart(2, "0"),
        });
    }

    const parsed = parseToDate(date);
    if (!parsed) {
        return "";
    }

    return formatParts(format, {
        YYYY: String(parsed.getFullYear()),
        MM: `${parsed.getMonth() + 1}`.padStart(2, "0"),
        DD: `${parsed.getDate()}`.padStart(2, "0"),
        HH: `${parsed.getHours()}`.padStart(2, "0"),
        mm: `${parsed.getMinutes()}`.padStart(2, "0"),
        ss: `${parsed.getSeconds()}`.padStart(2, "0"),
    });
}

export function getWritableDate(format, date) {
    return formatDate(format, date);
}

export function getReadableDate(format, date) {
    return formatDate(format, date);
}

const IST_TIME_ZONE = "Asia/Kolkata";

/** Current instant as MySQL DATETIME wall-clock in Asia/Kolkata (IST). */
export function getIstDateTime(date = new Date()) {
    const instant = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(instant.getTime())) {
        return null;
    }

    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: IST_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
    }).formatToParts(instant);

    const valueByType = Object.fromEntries(
        parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
    );

    return `${valueByType.year}-${valueByType.month}-${valueByType.day} ${valueByType.hour}:${valueByType.minute}:${valueByType.second}`;
}

/** Current (or given) instant as YYYY-MM-DD in Asia/Kolkata (IST). */
export function getIstDate(date = new Date()) {
    return getIstDateTime(date)?.slice(0, 10) || null;
}

/** Add calendar days to a YYYY-MM-DD key (IST wall-clock; no timezone shift). */
export function addIstCalendarDays(dateKey, days) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ""))) {
        return null;
    }
    const year = Number(dateKey.slice(0, 4));
    const month = Number(dateKey.slice(5, 7));
    const day = Number(dateKey.slice(8, 10));
    const next = new Date(Date.UTC(year, month - 1, day + Number(days || 0)));
    return [
        next.getUTCFullYear(),
        `${next.getUTCMonth() + 1}`.padStart(2, "0"),
        `${next.getUTCDate()}`.padStart(2, "0"),
    ].join("-");
}

/** First and last day of the IST month containing date (default: now). */
export function getIstMonthBounds(date = new Date()) {
    const today = getIstDate(date);
    if (!today) {
        return { from: null, to: null };
    }
    const year = Number(today.slice(0, 4));
    const month = Number(today.slice(5, 7));
    const from = `${year}-${`${month}`.padStart(2, "0")}-01`;
    const last = new Date(Date.UTC(year, month, 0));
    const to = [
        last.getUTCFullYear(),
        `${last.getUTCMonth() + 1}`.padStart(2, "0"),
        `${last.getUTCDate()}`.padStart(2, "0"),
    ].join("-");
    return { from, to };
}

/** Normalize any supported input to MySQL DATETIME wall-clock string. */
export function toDbDateTime(value) {
    if (value == null || value === "") {
        return null;
    }
    return getWritableDate("YYYY-MM-DD HH:mm:ss", value) || null;
}

/** Normalize any supported input to MySQL DATE wall-clock string. */
export function toDbDate(value) {
    if (value == null || value === "") {
        return null;
    }
    return getWritableDate("YYYY-MM-DD", value) || null;
}

function formatLocalDateKey(date) {
    return [
        date.getFullYear(),
        `${date.getMonth() + 1}`.padStart(2, "0"),
        `${date.getDate()}`.padStart(2, "0"),
    ].join("-");
}

/** Monday (YYYY-MM-DD) of the week containing the given date. Weeks are Mon–Sun. */
export function getMondayDate(value = new Date()) {
    // Real Date instants → IST calendar day. Strings → wall-clock parse.
    const dateKey =
        value instanceof Date
            ? getIstDate(value)
            : toDbDate(value) || getIstDate();
    if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
        return null;
    }

    const year = Number(dateKey.slice(0, 4));
    const month = Number(dateKey.slice(5, 7));
    const day = Number(dateKey.slice(8, 10));
    const date = new Date(year, month - 1, day);
    const weekday = date.getDay();
    const offset = weekday === 0 ? -6 : 1 - weekday;
    date.setDate(date.getDate() + offset);
    return formatLocalDateKey(date);
}

/** Sunday (YYYY-MM-DD) for a Monday sprint week start. */
export function getSundayDate(mondayValue) {
    const mondayKey = getMondayDate(mondayValue);
    if (!mondayKey) {
        return null;
    }
    const year = Number(mondayKey.slice(0, 4));
    const month = Number(mondayKey.slice(5, 7));
    const day = Number(mondayKey.slice(8, 10));
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() + 6);
    return formatLocalDateKey(date);
}

/** Normalize any date to its Monday sprint key, or null if empty/invalid. */
export function normalizeSprintWeekStart(value) {
    if (value == null || value === "") {
        return null;
    }
    return getMondayDate(value);
}

/**
 * Sprint week options for selects: past/future Mondays around today,
 * plus any extra week keys (e.g. the task's current sprint).
 */
export function buildSprintWeekOptions({
    around = new Date(),
    pastWeeks = 12,
    futureWeeks = 8,
    include = [],
} = {}) {
    const currentMonday = getMondayDate(around);
    if (!currentMonday) {
        return [];
    }

    const year = Number(currentMonday.slice(0, 4));
    const month = Number(currentMonday.slice(5, 7));
    const day = Number(currentMonday.slice(8, 10));
    const base = new Date(year, month - 1, day);

    const weekKeys = new Set();
    for (let offset = -pastWeeks; offset <= futureWeeks; offset += 1) {
        const date = new Date(base);
        date.setDate(base.getDate() + offset * 7);
        const monday = getMondayDate(date);
        if (monday) weekKeys.add(monday);
    }

    for (const value of include) {
        const monday = normalizeSprintWeekStart(value);
        if (monday) weekKeys.add(monday);
    }

    return Array.from(weekKeys)
        .sort((left, right) => (left < right ? 1 : left > right ? -1 : 0))
        .map((start) => {
            const end = getSundayDate(start);
            const startLabel = getReadableDate("DD/MM/YYYY", start) || start;
            const endLabel = getReadableDate("DD/MM/YYYY", end) || end || "";
            return {
                value: start,
                label: `${startLabel} – ${endLabel}`,
                isCurrent: start === currentMonday,
            };
        });
}

/** Parse query/user date input into YYYY-MM-DD, or null if invalid. */
export function parseQueryDate(value) {
    const normalized = toDbDate(value);
    return /^\d{4}-\d{2}-\d{2}$/.test(normalized || "") ? normalized : null;
}

/** Convert a MySQL/Bun Date (or any value) coming out of a query row. */
export function fromDbDateTime(value) {
    if (value == null || value === "") {
        return null;
    }
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        const hasTime =
            value.getUTCHours() !== 0 ||
            value.getUTCMinutes() !== 0 ||
            value.getUTCSeconds() !== 0;
        return (
            getWritableDate(hasTime ? "YYYY-MM-DD HH:mm:ss" : "YYYY-MM-DD", value) || null
        );
    }
    return toDbDateTime(value) || toDbDate(value);
}
