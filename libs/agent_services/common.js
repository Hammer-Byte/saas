export function isPlainObject(value) {
    return value != null && typeof value === "object" && !Array.isArray(value);
}

export function readInt(input, key, { min, max, fallback, errors, label }) {
    const raw = input?.[key];
    if (raw === undefined || raw === null || raw === "") {
        return fallback;
    }
    const number = Number(raw);
    if (!Number.isInteger(number) || number < min || number > max) {
        errors.push(`${label} must be a whole number between ${min} and ${max}`);
        return fallback;
    }
    return number;
}

export function readBool(input, key, fallback) {
    const raw = input?.[key];
    if (raw === undefined || raw === null || raw === "") {
        return fallback;
    }
    if (typeof raw === "boolean") {
        return raw;
    }
    return ["true", "1", "on", "yes"].includes(String(raw).toLowerCase());
}

export function readText(input, key, { maxLength = 256, fallback = "" } = {}) {
    const raw = input?.[key];
    if (raw === undefined || raw === null) {
        return fallback;
    }
    return String(raw).trim().slice(0, maxLength);
}

export function readChecklist(input, key, options, fallback) {
    const raw = input?.[key];
    if (!isPlainObject(raw)) {
        return { ...fallback };
    }
    const result = {};
    for (const option of options) {
        result[option.key] =
            raw[option.key] === undefined ? Boolean(fallback[option.key]) : readBool(raw, option.key, false);
    }
    return result;
}

/** Field metadata the browser needs to render a form (no functions). */
export function describeFields(fields) {
    return fields.map((field) => ({ ...field }));
}
