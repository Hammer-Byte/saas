const sessions = new Map();

export const SESSION_COOKIE = "hb_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

export function createSession(payload = {}) {
    const id = crypto.randomUUID();
    sessions.set(id, {
        ...payload,
        created_at: Date.now(),
    });
    return id;
}

export function getSession(id) {
    if (!id) return null;
    return sessions.get(id) ?? null;
}

export function destroySession(id) {
    if (!id) return;
    sessions.delete(id);
}
