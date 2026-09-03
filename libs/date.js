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

    // GEM / Indian wall-clock: DD-MM-YYYY[ HH:mm:ss]
    const dayFirstMatch = trimmed.match(
        /^(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/,
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
