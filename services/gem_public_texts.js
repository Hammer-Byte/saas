import { AUTHORITIES } from "../constants.js";
import {
    getGemPublicTexts,
    upsertGemPublicTexts,
} from "../db/gem_public_texts.js";
import { hasAuthority } from "../libs/app_page.js";
import { getCurrentUser } from "./authentication.js";

const MAX_TEXT_CHARS = 100000;

function asStoredTexts(row) {
    return {
        scope_text: row?.scope_text != null ? String(row.scope_text) : "",
        rules_text: row?.rules_text != null ? String(row.rules_text) : "",
        updated_on: row?.updated_on || null,
        updated_by: row?.updated_by || null,
    };
}

async function ensureTextsRow() {
    let row = await getGemPublicTexts();
    if (!row) {
        row = await upsertGemPublicTexts({
            scope_text: "",
            rules_text: "",
            updated_by: null,
        });
    }
    return asStoredTexts(row);
}

/** Public: plain-text scope body. */
export async function getPublicScopeText({ set }) {
    const texts = await ensureTextsRow();
    set.headers["content-type"] = "text/plain; charset=utf-8";
    set.status = 200;
    return texts.scope_text;
}

/** Public: plain-text rules body. */
export async function getPublicRulesText({ set }) {
    const texts = await ensureTextsRow();
    set.headers["content-type"] = "text/plain; charset=utf-8";
    set.status = 200;
    return texts.rules_text;
}

async function requireGemTendersPageUser({ cookie, set }) {
    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return null;
    }
    if (!hasAuthority(currentUser.authorities, AUTHORITIES.USE_PAGE_GEM_TENDERS)) {
        set.status = 403;
        return null;
    }
    return currentUser;
}

export async function getGemPublicTextsApi({ cookie, set }) {
    if (!(await requireGemTendersPageUser({ cookie, set }))) {
        return { error: set.status === 401 ? "Unauthorized" : "Missing authority" };
    }
    set.status = 200;
    return { texts: await ensureTextsRow() };
}

export async function updateGemPublicTextsApi({ body, cookie, set }) {
    const currentUser = await requireGemTendersPageUser({ cookie, set });
    if (!currentUser) {
        return { error: set.status === 401 ? "Unauthorized" : "Missing authority" };
    }

    const patch = {};
    if (body?.scope_text !== undefined) {
        const scope = String(body.scope_text ?? "");
        if (scope.length > MAX_TEXT_CHARS) {
            set.status = 400;
            return { error: "Scope text is too long" };
        }
        patch.scope_text = scope;
    }
    if (body?.rules_text !== undefined) {
        const rules = String(body.rules_text ?? "");
        if (rules.length > MAX_TEXT_CHARS) {
            set.status = 400;
            return { error: "Rules text is too long" };
        }
        patch.rules_text = rules;
    }

    if (!Object.keys(patch).length) {
        set.status = 400;
        return { error: "Provide scope_text and/or rules_text" };
    }

    try {
        const row = await upsertGemPublicTexts({
            ...patch,
            updated_by: currentUser.id,
        });
        set.status = 200;
        return {
            message: "Texts saved",
            texts: asStoredTexts(row),
        };
    } catch (error) {
        set.status = 500;
        return { error: "Failed to save texts" };
    }
}
