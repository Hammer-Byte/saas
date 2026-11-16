import { isPlainObject, readBool, readInt, readText } from "./common.js";

const MAX_PAIRS = 26;
const MAX_EXCLUDES = 100;
const MAX_EXCLUDE_LEN = 180;
const HOST_PATTERN = /^[A-Za-z0-9][A-Za-z0-9.-]{0,252}$/;
const SHARE_PATTERN = /^[A-Za-z0-9 _.$-]{1,80}$/;
const LOCAL_PATH_PATTERN = /^[A-Za-z]:\\(?:[^<>:"/\\|?*\r\n]+\\?)*$/;
/** Folder name or relative segments (no drive/UNC, no wildcards). */
const DIR_EXCLUDE_PATTERN = /^[^<>:"/|?*\r\n\\]([^<>:"/|?*\r\n]*[^<>:"/|?*\r\n\\])?$/;
/** File name or wildcard pattern (*.mdf); no path separators. */
const FILE_EXCLUDE_PATTERN = /^[^<>:"/|\\\r\n]+$/;

const defaults = {
    interval_seconds: 900,
    source_host: "",
    username: "",
    password: "",
    pairs: [],
    skip_log_max: 500,
    exclude_dirs: [],
    exclude_files: [],
    alert_on_start: true,
    alert_on_complete: true,
};

const fields = [
    {
        key: "interval_seconds",
        label: "Sync interval (seconds)",
        type: "int",
        min: 60,
        max: 86400,
        required: true,
        help: "Wait time between the end of one sync cycle and the start of the next.",
    },
    {
        key: "source_host",
        label: "Source host",
        type: "text",
        required: true,
        placeholder: "192.168.0.6",
        help: "Host name or IP of the production machine sharing the folders.",
    },
    {
        key: "username",
        label: "Share username",
        type: "text",
        required: true,
        placeholder: "DOMAIN\\user or user",
    },
    {
        key: "password",
        label: "Share password",
        type: "password",
        required: true,
        help: "Leave blank to keep the saved password.",
    },
    {
        key: "pairs",
        label: "Drive pairs",
        type: "pairs",
        required: true,
        max: MAX_PAIRS,
        help: "Each pair copies \\\\source_host\\share onto a local folder on this machine (mirror: files removed at source are removed locally).",
    },
    {
        key: "exclude_dirs",
        label: "Exclude directories",
        type: "lines",
        rows: 4,
        placeholder: "database\nhmdm\\tomcat9\\logs",
        help: "One folder name or relative path per line (e.g. database or hmdm\\tomcat9\\logs). Matched under every pair; not copied and not purged. Built-in: System Volume Information, $RECYCLE.BIN, RECYCLER.",
    },
    {
        key: "exclude_files",
        label: "Exclude files",
        type: "lines",
        rows: 4,
        placeholder: "*.mdf\n*.ldf\npostmaster.pid",
        help: "One file name or wildcard per line (e.g. *.mdf or postmaster.pid). Matched under every pair. Built-in: pagefile.sys, hiberfil.sys, swapfile.sys, DumpStack.log.tmp.",
    },
    {
        key: "skip_log_max",
        label: "Max skipped files listed in local log per pair",
        type: "int",
        min: 0,
        max: 5000,
        required: true,
    },
    {
        key: "alert_on_start",
        label: "Email when a sync cycle starts",
        type: "bool",
        help: "Uses the recipients selected under Monitoring → Alert email recipients.",
    },
    {
        key: "alert_on_complete",
        label: "Email when a sync cycle finishes (with stats)",
        type: "bool",
        help: "Includes copied / skipped / purged / failed counts and the next scheduled run time.",
    },
];

function readExcludeList(input, key, { kind, errors, label }) {
    const raw = input?.[key];
    let items = [];
    if (Array.isArray(raw)) {
        items = raw.map((entry) => String(entry || "").trim()).filter(Boolean);
    } else if (typeof raw === "string") {
        items = raw
            .split(/\r?\n/)
            .map((entry) => entry.trim())
            .filter(Boolean);
    }

    if (items.length > MAX_EXCLUDES) {
        errors.push(`${label}: at most ${MAX_EXCLUDES} entries`);
        items = items.slice(0, MAX_EXCLUDES);
    }

    const pattern = kind === "dir" ? DIR_EXCLUDE_PATTERN : FILE_EXCLUDE_PATTERN;
    const out = [];
    const seen = new Set();
    for (const item of items) {
        if (item.length > MAX_EXCLUDE_LEN) {
            errors.push(`${label}: each entry must be at most ${MAX_EXCLUDE_LEN} characters`);
            continue;
        }
        if (item.startsWith("\\\\") || /^[A-Za-z]:\\/i.test(item)) {
            errors.push(
                `${label}: use a name or relative path, not a full UNC or drive path (${item.slice(0, 40)})`,
            );
            continue;
        }
        if (!pattern.test(item)) {
            if (kind === "dir") {
                errors.push(
                    `${label}: invalid directory "${item.slice(0, 40)}" (folder name or relative path; no wildcards)`,
                );
            } else {
                errors.push(
                    `${label}: invalid file pattern "${item.slice(0, 40)}" (file name or wildcard like *.mdf; no path separators)`,
                );
            }
            continue;
        }
        const dedupe = item.toLowerCase();
        if (seen.has(dedupe)) {
            continue;
        }
        seen.add(dedupe);
        out.push(item);
    }
    return out;
}

function validate(input, previous = {}) {
    const errors = [];
    const sourceHost = readText(input, "source_host", { maxLength: 253 });
    const username = readText(input, "username", { maxLength: 128 });
    const typedPassword = input?.password == null ? "" : String(input.password);
    const password = typedPassword !== "" ? typedPassword.slice(0, 256) : String(previous?.password || "");

    if (!sourceHost) {
        errors.push("Source host is required");
    } else if (!HOST_PATTERN.test(sourceHost)) {
        errors.push("Source host must be a host name or IP (no slashes)");
    }
    if (!username) {
        errors.push("Share username is required");
    }
    if (!password) {
        errors.push("Share password is required");
    }

    const pairs = [];
    const rawPairs = Array.isArray(input?.pairs) ? input.pairs : [];
    if (rawPairs.length === 0) {
        errors.push("Add at least one drive pair");
    }
    if (rawPairs.length > MAX_PAIRS) {
        errors.push(`At most ${MAX_PAIRS} drive pairs are allowed`);
    }
    const seenLocal = new Set();
    rawPairs.slice(0, MAX_PAIRS).forEach((rawPair, index) => {
        const label = `Pair ${index + 1}`;
        if (!isPlainObject(rawPair)) {
            errors.push(`${label} is invalid`);
            return;
        }
        const share = readText(rawPair, "share", { maxLength: 80 }).replace(/^\\+|\\+$/g, "");
        let localPath = readText(rawPair, "local_path", { maxLength: 240 });
        if (/^[A-Za-z]:$/.test(localPath)) {
            localPath = `${localPath}\\`;
        }
        if (!SHARE_PATTERN.test(share)) {
            errors.push(`${label}: share name must be a single folder name like g or Data$`);
        }
        if (!LOCAL_PATH_PATTERN.test(localPath)) {
            errors.push(`${label}: local path must look like G:\\ or D:\\Backup\\Data`);
        }
        const localKey = localPath.toLowerCase().replace(/\\+$/, "");
        if (seenLocal.has(localKey)) {
            errors.push(`${label}: local path is used by another pair`);
        }
        seenLocal.add(localKey);
        pairs.push({ share, local_path: localPath });
    });

    const excludeDirs = readExcludeList(input, "exclude_dirs", {
        kind: "dir",
        errors,
        label: "Exclude directories",
    });
    const excludeFiles = readExcludeList(input, "exclude_files", {
        kind: "file",
        errors,
        label: "Exclude files",
    });

    const config = {
        interval_seconds: readInt(input, "interval_seconds", {
            min: 60,
            max: 86400,
            fallback: defaults.interval_seconds,
            errors,
            label: "Sync interval",
        }),
        source_host: sourceHost,
        username,
        password,
        pairs,
        skip_log_max: readInt(input, "skip_log_max", {
            min: 0,
            max: 5000,
            fallback: defaults.skip_log_max,
            errors,
            label: "Max skipped files",
        }),
        exclude_dirs: excludeDirs,
        exclude_files: excludeFiles,
        alert_on_start: readBool(input, "alert_on_start", defaults.alert_on_start),
        alert_on_complete: readBool(input, "alert_on_complete", defaults.alert_on_complete),
    };
    return { ok: errors.length === 0, config, errors };
}

export default {
    id: "drivesync",
    label: "Drive Sync",
    description: "Pull-only mirror of source shares onto local drives using robocopy.",
    defaults,
    fields,
    validate,
    maskForBrowser: (config) => ({
        ...config,
        password: "",
        password_set: Boolean(config?.password),
    }),
};
