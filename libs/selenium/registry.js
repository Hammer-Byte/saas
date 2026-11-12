const handlers = new Map();

export function registerSeleniumJobHandler(type, handler) {
    const key = String(type || "").trim();
    if (!key) {
        throw new Error("Selenium job type is required");
    }
    if (
        !handler ||
        typeof handler.start !== "function" ||
        typeof handler.perform !== "function" ||
        typeof handler.finish !== "function"
    ) {
        throw new Error(
            `Selenium handler for ${key} must expose start, perform, and finish`,
        );
    }
    handlers.set(key, handler);
}

export function getSeleniumJobHandler(type) {
    return handlers.get(String(type || "").trim()) || null;
}

export function listSeleniumJobTypes() {
    return [...handlers.keys()];
}
