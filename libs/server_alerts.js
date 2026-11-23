/** Defaults and normalization for per-server alert_config / alert_state. */

export const DEFAULT_ALERT_CONFIG = {
    pinger: {
        enabled: false,
        missed_ping_seconds: 180,
        cooldown_seconds: 900,
        recipients: [],
    },
    metricer: {
        enabled: false,
        cooldown_seconds: 900,
        ram_enabled: true,
        ram_percent: 90,
        cpu_enabled: true,
        cpu_percent: 90,
        storage_enabled: true,
        storage_percent: 90,
        storage_drives: [],
        temp_enabled: false,
        temp_celsius: 80,
        recipients: [],
    },
    dataer: {
        enabled: false,
        recipients: [],
    },
    dber: {
        enabled: false,
        recipients: [],
    },
};

function clampInt(value, { min, max, fallback }) {
    const n = Number(value);
    if (!Number.isFinite(n)) {
        return fallback;
    }
    const rounded = Math.round(n);
    return Math.min(max, Math.max(min, rounded));
}

function normalizeRecipient(raw) {
    if (!raw || typeof raw !== "object") {
        return null;
    }
    const name = String(raw.name || "").trim().slice(0, 128);
    const email = String(raw.email || "").trim().slice(0, 255).toLowerCase();
    const phone = String(raw.phone || "").trim().slice(0, 20);
    const email_on = Boolean(raw.email_on);
    const sms_on = Boolean(raw.sms_on);
    if (!email && !phone) {
        return null;
    }
    if (email_on && !email) {
        return null;
    }
    if (sms_on && !phone) {
        return null;
    }
    return {
        name: name || (email ? email.split("@")[0] : phone),
        email: email || null,
        phone: phone || null,
        email_on: Boolean(email) && email_on,
        sms_on: Boolean(phone) && sms_on,
    };
}

function normalizeRecipients(raw) {
    if (!Array.isArray(raw)) {
        return [];
    }
    const out = [];
    const seen = new Set();
    for (const entry of raw.slice(0, 50)) {
        const recipient = normalizeRecipient(entry);
        if (!recipient) {
            continue;
        }
        const key = `${recipient.email || ""}|${recipient.phone || ""}`;
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        out.push(recipient);
    }
    return out;
}

function normalizeStorageDrives(raw) {
    if (!Array.isArray(raw)) {
        return [];
    }
    const out = [];
    const seen = new Set();
    for (const entry of raw.slice(0, 64)) {
        const name = String(entry || "").trim().slice(0, 128);
        if (!name) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(name);
    }
    return out;
}

export function parseAlertConfig(raw) {
    if (!raw) {
        return structuredClone(DEFAULT_ALERT_CONFIG);
    }
    let parsed = raw;
    if (typeof raw === "string") {
        try {
            parsed = JSON.parse(raw);
        } catch {
            return structuredClone(DEFAULT_ALERT_CONFIG);
        }
    }
    if (!parsed || typeof parsed !== "object") {
        return structuredClone(DEFAULT_ALERT_CONFIG);
    }

    const pingerIn = parsed.pinger && typeof parsed.pinger === "object" ? parsed.pinger : {};
    const metricerIn = parsed.metricer && typeof parsed.metricer === "object" ? parsed.metricer : {};
    const dataerIn = parsed.dataer && typeof parsed.dataer === "object" ? parsed.dataer : {};
    const dberIn = parsed.dber && typeof parsed.dber === "object" ? parsed.dber : {};

    return {
        pinger: {
            enabled: Boolean(pingerIn.enabled),
            missed_ping_seconds: clampInt(pingerIn.missed_ping_seconds, {
                min: 30,
                max: 86400,
                fallback: DEFAULT_ALERT_CONFIG.pinger.missed_ping_seconds,
            }),
            cooldown_seconds: clampInt(pingerIn.cooldown_seconds, {
                min: 60,
                max: 86400,
                fallback: DEFAULT_ALERT_CONFIG.pinger.cooldown_seconds,
            }),
            recipients: normalizeRecipients(pingerIn.recipients),
        },
        metricer: {
            enabled: Boolean(metricerIn.enabled),
            cooldown_seconds: clampInt(metricerIn.cooldown_seconds, {
                min: 60,
                max: 86400,
                fallback: DEFAULT_ALERT_CONFIG.metricer.cooldown_seconds,
            }),
            ram_enabled: metricerIn.ram_enabled !== false,
            ram_percent: clampInt(metricerIn.ram_percent, {
                min: 1,
                max: 100,
                fallback: DEFAULT_ALERT_CONFIG.metricer.ram_percent,
            }),
            cpu_enabled: metricerIn.cpu_enabled !== false,
            cpu_percent: clampInt(metricerIn.cpu_percent, {
                min: 1,
                max: 100,
                fallback: DEFAULT_ALERT_CONFIG.metricer.cpu_percent,
            }),
            storage_enabled: metricerIn.storage_enabled !== false,
            storage_percent: clampInt(metricerIn.storage_percent, {
                min: 1,
                max: 100,
                fallback: DEFAULT_ALERT_CONFIG.metricer.storage_percent,
            }),
            storage_drives: normalizeStorageDrives(metricerIn.storage_drives),
            temp_enabled: Boolean(metricerIn.temp_enabled),
            temp_celsius: clampInt(metricerIn.temp_celsius, {
                min: 1,
                max: 150,
                fallback: DEFAULT_ALERT_CONFIG.metricer.temp_celsius,
            }),
            recipients: normalizeRecipients(metricerIn.recipients),
        },
        dataer: {
            enabled: false,
            recipients: normalizeRecipients(dataerIn.recipients),
        },
        dber: {
            enabled: false,
            recipients: normalizeRecipients(dberIn.recipients),
        },
    };
}

export function parseAlertState(raw) {
    if (!raw) {
        return {};
    }
    if (typeof raw === "object") {
        return { ...raw };
    }
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}

export function cooldownElapsed(lastSentIso, cooldownSeconds) {
    if (!lastSentIso) {
        return true;
    }
    const last = Date.parse(lastSentIso);
    if (!Number.isFinite(last)) {
        return true;
    }
    return Date.now() - last >= cooldownSeconds * 1000;
}

export function memoryUsagePercent(payload) {
    const total = Number(payload?.memory?.totalMb);
    const used = Number(payload?.memory?.usedMb);
    if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(used)) {
        return null;
    }
    return Math.min(100, (used / total) * 100);
}

/** CPU utilization % from Metricer payload (`cpu.usagePercent`). */
export function cpuUsagePercent(payload) {
    const cpu = payload?.cpu;
    if (!cpu || typeof cpu !== "object") {
        return null;
    }
    const raw = cpu.usagePercent ?? cpu.percent ?? cpu.usage;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
        return null;
    }
    return Math.min(100, n);
}

export function storageOverThreshold(payload, percentThreshold, driveNames = null) {
    const storage = Array.isArray(payload?.storage) ? payload.storage : [];
    const selected =
        Array.isArray(driveNames) && driveNames.length
            ? new Set(driveNames.map((name) => String(name || "").trim().toLowerCase()).filter(Boolean))
            : null;
    // Empty selection = alert on no drives (explicit opt-in per drive).
    if (Array.isArray(driveNames) && driveNames.length === 0) {
        return [];
    }
    const offenders = [];
    for (const disk of storage) {
        if (!isFixedStorageDrive(disk)) {
            continue;
        }
        const name = String(disk.name || "").trim();
        if (selected && !selected.has(name.toLowerCase())) {
            continue;
        }
        const total = Number(disk.totalGb);
        const free = Number(disk.freeGb);
        if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(free)) {
            continue;
        }
        const usedPct = Math.min(100, ((total - free) / total) * 100);
        if (usedPct >= percentThreshold) {
            offenders.push({
                name: name || "—",
                label: disk.label || "",
                used_percent: Math.round(usedPct * 10) / 10,
                free_gb: Math.round(free * 10) / 10,
                total_gb: Math.round(total * 10) / 10,
            });
        }
    }
    return offenders;
}

function isFixedStorageDrive(disk) {
    const kind = String(disk?.type || disk?.driveType || "").trim();
    return kind.toLowerCase() === "fixed";
}

/** Fixed volumes from a metrics payload for alert UI checklists. */
export function listFixedStorageDrives(payload) {
    const storage = Array.isArray(payload?.storage) ? payload.storage : [];
    const out = [];
    const seen = new Set();
    for (const disk of storage) {
        if (!isFixedStorageDrive(disk)) continue;
        const name = String(disk.name || "").trim();
        if (!name) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
            name,
            label: String(disk.label || "").trim(),
        });
    }
    return out;
}

export function maxTemperatureCelsius(payload) {
    const block = payload?.temperatureCelsius;
    if (!block || typeof block !== "object") {
        return null;
    }
    if (block.unavailable === true) {
        return null;
    }
    const readings = Array.isArray(block.readings) ? block.readings : [];
    let max = null;
    for (const reading of readings) {
        let value = null;
        if (typeof reading === "number") {
            value = reading;
        } else if (reading && typeof reading === "object") {
            value = Number(reading.celsius ?? reading.value ?? reading.temp);
        }
        if (!Number.isFinite(value)) {
            continue;
        }
        if (max == null || value > max) {
            max = value;
        }
    }
    return max;
}

/** Build suggestion rows from customer emails + phones (same customer name). */
export function buildAlertCandidates({ customerName, emails, phones }) {
    const name = String(customerName || "Contact").trim() || "Contact";
    const emailList = Array.isArray(emails) ? emails : [];
    const phoneList = Array.isArray(phones) ? phones : [];
    const candidates = [];
    const max = Math.max(emailList.length, phoneList.length, emailList.length ? emailList.length : 0);

    // Prefer pairing: each email as its own row; each phone as its own row.
    for (const email of emailList) {
        const trimmed = String(email || "").trim();
        if (!trimmed) continue;
        candidates.push({
            name,
            email: trimmed,
            phone: null,
            email_on: false,
            sms_on: false,
        });
    }
    for (const phone of phoneList) {
        const trimmed = String(phone || "").trim();
        if (!trimmed) continue;
        candidates.push({
            name,
            email: null,
            phone: trimmed,
            email_on: false,
            sms_on: false,
        });
    }

    // If both empty, still return [].
    void max;
    return candidates;
}
