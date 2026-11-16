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

const ALERT_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ALERT_EMAILS = 50;

/** Unique lowercase emails for service config (always an array; empty = no mail). */
export function normalizeServiceAlertEmails(value) {
    const list = Array.isArray(value) ? value : [];
    const seen = new Set();
    const emails = [];
    for (const entry of list) {
        const email = String(entry || "")
            .trim()
            .toLowerCase();
        if (!email || !ALERT_EMAIL_PATTERN.test(email) || seen.has(email)) {
            continue;
        }
        seen.add(email);
        emails.push(email);
        if (emails.length >= MAX_ALERT_EMAILS) {
            break;
        }
    }
    return emails;
}

/**
 * Read alert_emails from form input, preserving previous when the key is omitted
 * (e.g. main service form does not include the recipients picker).
 * Returns null when neither input nor previous defines the key so callers can omit
 * it and keep the legacy SERVERS.alert_emails fallback.
 */
export function readAlertEmails(input, previous, fallback = []) {
    if (input != null && Object.prototype.hasOwnProperty.call(input, "alert_emails")) {
        return normalizeServiceAlertEmails(input.alert_emails);
    }
    if (previous != null && Object.prototype.hasOwnProperty.call(previous, "alert_emails")) {
        return normalizeServiceAlertEmails(previous.alert_emails);
    }
    if (fallback === undefined) {
        return null;
    }
    return null;
}

/**
 * Prefer service config.alert_emails when the key exists; otherwise fall back to
 * server-level SERVERS.alert_emails (legacy).
 */
export function resolveServiceAlertEmails(serviceConfig, serverAlertEmails) {
    if (serviceConfig != null && Object.prototype.hasOwnProperty.call(serviceConfig, "alert_emails")) {
        return normalizeServiceAlertEmails(serviceConfig.alert_emails);
    }
    return normalizeServiceAlertEmails(
        Array.isArray(serverAlertEmails)
            ? serverAlertEmails
            : typeof serverAlertEmails === "string" && serverAlertEmails
              ? (() => {
                    try {
                        return JSON.parse(serverAlertEmails);
                    } catch {
                        return [];
                    }
                })()
              : [],
    );
}

/** Field metadata the browser needs to render a form (no functions). */
export function describeFields(fields) {
    return fields.map((field) => ({ ...field }));
}
