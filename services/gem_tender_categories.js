import {
    createGemTenderCategory,
    deleteGemTenderCategoryById,
    getAllGemTenderCategories,
    getGemTenderCategoryById,
    getGemTenderCategoryByName,
    updateGemTenderCategoryById,
} from "../db/gem_tender_categories.js";
import { canUseGemCategories } from "./gem_categories.js";
import { getCurrentUser } from "./authentication.js";

async function requireScannerAuthority({ cookie, set }) {
    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return null;
    }
    if (
        !canUseGemCategories(currentUser.authorities, {
            super_admin: currentUser.super_admin,
        })
    ) {
        set.status = 403;
        return null;
    }
    return currentUser;
}

function asName(value) {
    return String(value || "")
        .trim()
        .replace(/\s+/g, " ");
}

export async function listGemTenderCategories({ cookie, set }) {
    if (!(await requireScannerAuthority({ cookie, set }))) {
        return { error: set.status === 401 ? "Unauthorized" : "Missing authority" };
    }
    set.status = 200;
    return { categories: await getAllGemTenderCategories() };
}

export async function addGemTenderCategory({ body, cookie, set }) {
    if (!(await requireScannerAuthority({ cookie, set }))) {
        return { error: set.status === 401 ? "Unauthorized" : "Missing authority" };
    }

    const name = asName(body?.name);
    if (!name) {
        set.status = 400;
        return { error: "Category name is required" };
    }

    const existing = await getGemTenderCategoryByName({ name });
    if (existing) {
        set.status = 409;
        return { error: "Category already exists" };
    }

    const id = await createGemTenderCategory({ name });
    if (!id) {
        set.status = 400;
        return { error: "Failed to create category" };
    }

    set.status = 201;
    return {
        message: "Category created",
        category: await getGemTenderCategoryById({ id }),
    };
}

export async function updateGemTenderCategory({ params, body, cookie, set }) {
    if (!(await requireScannerAuthority({ cookie, set }))) {
        return { error: set.status === 401 ? "Unauthorized" : "Missing authority" };
    }

    const existing = await getGemTenderCategoryById({ id: params.id });
    if (!existing) {
        set.status = 404;
        return { error: "Category not found" };
    }

    const name = asName(body?.name);
    if (!name) {
        set.status = 400;
        return { error: "Category name is required" };
    }

    const duplicate = await getGemTenderCategoryByName({ name });
    if (duplicate && Number(duplicate.id) !== Number(existing.id)) {
        set.status = 409;
        return { error: "Category already exists" };
    }

    await updateGemTenderCategoryById({ id: existing.id, name });
    set.status = 200;
    return {
        message: "Category updated",
        category: await getGemTenderCategoryById({ id: existing.id }),
    };
}

export async function deleteGemTenderCategory({ params, cookie, set }) {
    if (!(await requireScannerAuthority({ cookie, set }))) {
        return { error: set.status === 401 ? "Unauthorized" : "Missing authority" };
    }

    const existing = await getGemTenderCategoryById({ id: params.id });
    if (!existing) {
        set.status = 404;
        return { error: "Category not found" };
    }

    await deleteGemTenderCategoryById({ id: existing.id });
    set.status = 204;
}
