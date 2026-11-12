/** Optional cancel hooks keyed by job type (domain run cleanup on skip). */
const skipHooks = new Map();

export function registerSeleniumSkipHook(type, hook) {
    skipHooks.set(String(type || "").trim(), hook);
}

export function getSeleniumSkipHook(type) {
    return skipHooks.get(String(type || "").trim()) || null;
}
