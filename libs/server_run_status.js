/**
 * Derive success | partial | failed | unknown from Dataer/DBer run fields.
 *
 * Prefer contract count/array fields when present; fall back to result text
 * (legacy shapes) and finally the success boolean.
 */

function statusFromCounts(okCount, failedCount) {
    if (failedCount === 0) {
        return "success";
    }
    if (okCount === 0) {
        return "failed";
    }
    return "partial";
}

function asFiniteCount(value) {
    if (value == null || value === "") {
        return null;
    }
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function asNameList(value) {
    if (!Array.isArray(value)) {
        return null;
    }
    return value.map((item) => String(item || "").trim()).filter(Boolean);
}

export function resolveServiceRunStatus({
    success,
    result,
    successCount,
    failedCount,
    succeededDatabases,
    failedDatabases,
} = {}) {
    let okCount = asFiniteCount(successCount);
    let failed = asFiniteCount(failedCount);

    const succeededNames = asNameList(succeededDatabases);
    const failedNames = asNameList(failedDatabases);
    if (okCount == null && succeededNames) {
        okCount = succeededNames.length;
    }
    if (failed == null && failedNames) {
        failed = failedNames.length;
    }

    if (okCount != null && failed != null) {
        return statusFromCounts(okCount, failed);
    }

    const text = String(result || "").trim();
    if (text) {
        if (/^\s*Partial\b/i.test(text)) {
            return "partial";
        }
        if (/^\s*Failed\b/i.test(text)) {
            return "failed";
        }

        const dataerOk = text.match(/success\s*-\s*(\d+)/i);
        const dataerFailed = text.match(/failed\s*-\s*(\d+)/i);
        if (dataerOk || dataerFailed) {
            return statusFromCounts(
                dataerOk ? Number(dataerOk[1]) : 0,
                dataerFailed ? Number(dataerFailed[1]) : 0,
            );
        }

        // Backuprer DBer rollup: "1 success · 0 failed · 2 skipped" (also tolerates "synced").
        const synced = text.match(/(\d+)\s*synced\b/i);
        const successWord = text.match(/(\d+)\s*success\b/i);
        const skipped = text.match(/(\d+)\s*skipped\b/i);
        const failedMatch = text.match(/(\d+)\s*failed\b/i);
        if (synced || successWord || skipped || failedMatch) {
            const okFromRollup =
                (synced ? Number(synced[1]) : 0)
                + (successWord ? Number(successWord[1]) : 0)
                + (skipped ? Number(skipped[1]) : 0);
            const failedFromRollup = failedMatch ? Number(failedMatch[1]) : 0;
            return statusFromCounts(okFromRollup, failedFromRollup);
        }

        const dberOk = text.match(/\bOK\s+(\d+)\s*\/\s*(\d+)/i);
        const dberFailed = text.match(/\bFailed\s+(\d+)\s*\/\s*(\d+)/i);
        if (dberOk || dberFailed) {
            return statusFromCounts(
                dberOk ? Number(dberOk[1]) : 0,
                dberFailed ? Number(dberFailed[1]) : 0,
            );
        }
    }

    if (success === true || success === 1) {
        return "success";
    }
    if (success === false || success === 0) {
        return "failed";
    }
    return "unknown";
}

export function serviceRunStatusBadgeClass(status) {
    if (status === "success") return "text-bg-success";
    if (status === "partial") return "text-bg-warning";
    if (status === "failed") return "text-bg-danger";
    return "text-bg-secondary";
}

export function serviceRunStatusLabel(status) {
    if (status === "success") return "success";
    if (status === "partial") return "partial";
    if (status === "failed") return "failed";
    return "—";
}

/** Count summary under the badge (strip leading Partial/Failed keyword). */
export function serviceRunResultSummary(result) {
    const text = String(result || "").trim();
    if (!text) {
        return null;
    }
    // Keyword + any following spaces / bullets / punctuation (Unicode-safe).
    return text.replace(/^\s*(Partial|Failed)\b[\s\W_]*/i, "").trim() || text;
}
