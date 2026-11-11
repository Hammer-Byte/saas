import { AUTHORITIES } from "../constants.js";
import {
    createGemCategory,
    deleteGemCategoryById,
    getAllGemCategories,
    getGemCategoriesByGroupId,
    getGemCategoriesByIds,
    getGemCategoryByGroupIdAndName,
    getGemCategoryById,
    updateGemCategoryById,
} from "../db/gem_categories.js";
import {
    createGemCategoryGroup,
    deleteGemCategoryGroupById,
    getAllGemCategoryGroups,
    getGemCategoryGroupById,
    getGemCategoryGroupByName,
    updateGemCategoryGroupById,
} from "../db/gem_category_groups.js";
import {
    createGemTenderScanRun,
    getGemTenderScanRunById,
} from "../db/gem_tender_scan_runs.js";
import { hasAuthority } from "../libs/app_page.js";
import { crawlGemForTenders, processing } from "../libs/tenderer.js";
import { getCurrentUser } from "./authentication.js";

export function canUseGemCategories(authorities) {
    return (
        hasAuthority(authorities, AUTHORITIES.USE_PAGE_GEM_CATEGORIES) ||
        hasAuthority(authorities, AUTHORITIES.USE_PAGE_GEM_TENDER_KEYWORDS)
    );
}

async function requireGemCategoriesAuthority({ cookie, set }) {
    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return null;
    }
    if (!canUseGemCategories(currentUser.authorities)) {
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

export async function listGemCategoryGroups({ cookie, set }) {
    if (!(await requireGemCategoriesAuthority({ cookie, set }))) {
        return { error: set.status === 401 ? "Unauthorized" : "Missing authority" };
    }
    set.status = 200;
    return { groups: await getAllGemCategoryGroups() };
}

export async function addGemCategoryGroup({ body, cookie, set }) {
    if (!(await requireGemCategoriesAuthority({ cookie, set }))) {
        return { error: set.status === 401 ? "Unauthorized" : "Missing authority" };
    }

    const name = asName(body?.name);
    if (!name) {
        set.status = 400;
        return { error: "Group name is required" };
    }

    const existing = await getGemCategoryGroupByName({ name });
    if (existing) {
        set.status = 409;
        return { error: "Group already exists" };
    }

    const id = await createGemCategoryGroup({ name });
    if (!id) {
        set.status = 400;
        return { error: "Failed to create group" };
    }

    const group = await getGemCategoryGroupById({ id });
    set.status = 201;
    return { message: "Group created", group };
}

export async function updateGemCategoryGroup({ params, body, cookie, set }) {
    if (!(await requireGemCategoriesAuthority({ cookie, set }))) {
        return { error: set.status === 401 ? "Unauthorized" : "Missing authority" };
    }

    const existing = await getGemCategoryGroupById({ id: params.id });
    if (!existing) {
        set.status = 404;
        return { error: "Group not found" };
    }

    const name = asName(body?.name);
    if (!name) {
        set.status = 400;
        return { error: "Group name is required" };
    }

    const duplicate = await getGemCategoryGroupByName({ name });
    if (duplicate && Number(duplicate.id) !== Number(existing.id)) {
        set.status = 409;
        return { error: "Group already exists" };
    }

    await updateGemCategoryGroupById({ id: existing.id, name });
    const group = await getGemCategoryGroupById({ id: existing.id });
    set.status = 200;
    return { message: "Group updated", group };
}

export async function deleteGemCategoryGroup({ params, cookie, set }) {
    if (!(await requireGemCategoriesAuthority({ cookie, set }))) {
        return { error: set.status === 401 ? "Unauthorized" : "Missing authority" };
    }

    const existing = await getGemCategoryGroupById({ id: params.id });
    if (!existing) {
        set.status = 404;
        return { error: "Group not found" };
    }

    await deleteGemCategoryGroupById({ id: existing.id });
    set.status = 204;
}

export async function listGemCategories({ query, cookie, set }) {
    if (!(await requireGemCategoriesAuthority({ cookie, set }))) {
        return { error: set.status === 401 ? "Unauthorized" : "Missing authority" };
    }

    const groupId = Number(query?.group_id || 0);
    const categories =
        groupId >= 1
            ? await getGemCategoriesByGroupId({ group_id: groupId })
            : await getAllGemCategories();

    set.status = 200;
    return { categories };
}

export async function addGemCategory({ body, cookie, set }) {
    if (!(await requireGemCategoriesAuthority({ cookie, set }))) {
        return { error: set.status === 401 ? "Unauthorized" : "Missing authority" };
    }

    const group_id = Number(body?.group_id || 0);
    const name = asName(body?.name);
    if (!(group_id >= 1)) {
        set.status = 400;
        return { error: "Group is required" };
    }
    if (!name) {
        set.status = 400;
        return { error: "Category name is required" };
    }

    const group = await getGemCategoryGroupById({ id: group_id });
    if (!group) {
        set.status = 400;
        return { error: "Group not found" };
    }

    const existing = await getGemCategoryByGroupIdAndName({ group_id, name });
    if (existing) {
        set.status = 409;
        return { error: "Category already exists in this group" };
    }

    const id = await createGemCategory({ group_id, name });
    if (!id) {
        set.status = 400;
        return { error: "Failed to create category" };
    }

    const category = await getGemCategoryById({ id });
    set.status = 201;
    return { message: "Category created", category };
}

export async function updateGemCategory({ params, body, cookie, set }) {
    if (!(await requireGemCategoriesAuthority({ cookie, set }))) {
        return { error: set.status === 401 ? "Unauthorized" : "Missing authority" };
    }

    const existing = await getGemCategoryById({ id: params.id });
    if (!existing) {
        set.status = 404;
        return { error: "Category not found" };
    }

    const group_id = Number(body?.group_id || existing.group_id || 0);
    const name = asName(body?.name);
    if (!(group_id >= 1)) {
        set.status = 400;
        return { error: "Group is required" };
    }
    if (!name) {
        set.status = 400;
        return { error: "Category name is required" };
    }

    const group = await getGemCategoryGroupById({ id: group_id });
    if (!group) {
        set.status = 400;
        return { error: "Group not found" };
    }

    const duplicate = await getGemCategoryByGroupIdAndName({ group_id, name });
    if (duplicate && Number(duplicate.id) !== Number(existing.id)) {
        set.status = 409;
        return { error: "Category already exists in this group" };
    }

    await updateGemCategoryById({ id: existing.id, group_id, name });
    const category = await getGemCategoryById({ id: existing.id });
    set.status = 200;
    return { message: "Category updated", category };
}

export async function deleteGemCategory({ params, cookie, set }) {
    if (!(await requireGemCategoriesAuthority({ cookie, set }))) {
        return { error: set.status === 401 ? "Unauthorized" : "Missing authority" };
    }

    const existing = await getGemCategoryById({ id: params.id });
    if (!existing) {
        set.status = 404;
        return { error: "Category not found" };
    }

    await deleteGemCategoryById({ id: existing.id });
    set.status = 204;
}

export async function startGemCategoryScan({ body, cookie, set }) {
    if (processing) {
        set.status = 409;
        return { error: "Scan already in progress", processing: true };
    }

    const currentUser = await requireGemCategoriesAuthority({ cookie, set });
    if (!currentUser) {
        return {
            error: set.status === 401 ? "Unauthorized" : "Missing authority",
            processing: false,
        };
    }

    const selectedIds = Array.isArray(body?.category_ids)
        ? [...new Set(body.category_ids.map((id) => Number(id)).filter((id) => id >= 1))]
        : [];
    if (!selectedIds.length) {
        set.status = 400;
        return { error: "Select at least one category to scan", processing: false };
    }

    const categories = await getGemCategoriesByIds({ ids: selectedIds });
    if (!categories.length) {
        set.status = 400;
        return { error: "No valid categories selected", processing: false };
    }

    const keywords = categories.map((category) => ({
        id: null,
        keyword: category.name,
        exact_search: false,
        category_group_id: Number(category.group_id),
    }));

    const runId = await createGemTenderScanRun({
        keyword_count: keywords.length,
        created_by: currentUser.id,
    });
    if (!runId) {
        set.status = 400;
        return { error: "Failed to create scan run", processing: false };
    }

    const started = crawlGemForTenders({
        keywords,
        runId,
    });
    if (!started) {
        set.status = 409;
        return { error: "Scan already in progress", processing: true };
    }

    set.status = 202;
    return {
        message: `Scan started for ${keywords.length} categor${keywords.length === 1 ? "y" : "ies"}`,
        processing: true,
        category_count: keywords.length,
        run: await getGemTenderScanRunById({ id: runId }),
    };
}
