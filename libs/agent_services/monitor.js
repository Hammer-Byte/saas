import { readAlertEmails, readChecklist, readInt } from "./common.js";

const METRIC_OPTIONS = [
    { key: "cpu", label: "CPU" },
    { key: "memory", label: "Memory" },
    { key: "disks", label: "Disks" },
    { key: "processes", label: "Top processes" },
    { key: "services", label: "Windows services summary" },
    { key: "os", label: "Operating system" },
    { key: "hardware", label: "Hardware" },
    { key: "network", label: "Network adapters" },
    { key: "temperatures", label: "Temperatures" },
];

const defaults = {
    heartbeat_interval_seconds: 60,
    metrics_interval_seconds: 900,
    metrics: Object.fromEntries(METRIC_OPTIONS.map((option) => [option.key, true])),
    top_process_count: 5,
    alert_emails: [],
};

const fields = [
    {
        key: "heartbeat_interval_seconds",
        label: "Heartbeat interval (seconds)",
        type: "int",
        min: 30,
        max: 3600,
        required: true,
        help: "How often the monitor reports it is alive.",
    },
    {
        key: "metrics_interval_seconds",
        label: "Metrics interval (seconds)",
        type: "int",
        min: 60,
        max: 86400,
        required: true,
        help: "How often a full metrics snapshot is collected and sent.",
    },
    {
        key: "metrics",
        label: "Metrics to collect",
        type: "checklist",
        options: METRIC_OPTIONS,
        required: true,
    },
    {
        key: "top_process_count",
        label: "Top processes to report",
        type: "int",
        min: 1,
        max: 20,
        required: true,
    },
];

function validate(input, previous = {}) {
    const errors = [];
    const config = {
        heartbeat_interval_seconds: readInt(input, "heartbeat_interval_seconds", {
            min: 30,
            max: 3600,
            fallback: defaults.heartbeat_interval_seconds,
            errors,
            label: "Heartbeat interval",
        }),
        metrics_interval_seconds: readInt(input, "metrics_interval_seconds", {
            min: 60,
            max: 86400,
            fallback: defaults.metrics_interval_seconds,
            errors,
            label: "Metrics interval",
        }),
        metrics: readChecklist(input, "metrics", METRIC_OPTIONS, defaults.metrics),
        top_process_count: readInt(input, "top_process_count", {
            min: 1,
            max: 20,
            fallback: defaults.top_process_count,
            errors,
            label: "Top processes",
        }),
        alert_emails: readAlertEmails(input, previous, defaults.alert_emails),
    };
    if (!Object.values(config.metrics).some(Boolean)) {
        errors.push("Select at least one metric");
    }
    return { ok: errors.length === 0, config, errors };
}

export default {
    id: "monitor",
    label: "Monitoring",
    description: "Heartbeat plus CPU, memory, disks, processes and system details.",
    defaults,
    fields,
    validate,
    maskForBrowser: (config) => ({ ...config }),
};
