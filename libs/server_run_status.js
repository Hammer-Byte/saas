/**
 * Derive success | partial | failed | unknown from Dataer/DBer result text.
 * result is plain text (not JSON), e.g.:
 *   "Partial · success - 4 , failed - 2 , skipped - 194549"
 *   "success - 0 , failed - 0 , skipped - 1362991"
 *   "Partial · OK 4/35 · Failed 2/35"
 *   "Failed · OK 0/35 · Failed 2/35"
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

export function resolveServiceRunStatus({ success, result } = {}) {
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
            const okCount = dataerOk ? Number(dataerOk[1]) : 0;
            const failedCount = dataerFailed ? Number(dataerFailed[1]) : 0;
            return statusFromCounts(okCount, failedCount);
        }

        const dberOk = text.match(/\bOK\s+(\d+)\s*\/\s*(\d+)/i);
        const dberFailed = text.match(/\bFailed\s+(\d+)\s*\/\s*(\d+)/i);
        if (dberOk || dberFailed) {
            const okCount = dberOk ? Number(dberOk[1]) : 0;
            const failedCount = dberFailed ? Number(dberFailed[1]) : 0;
            return statusFromCounts(okCount, failedCount);
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
