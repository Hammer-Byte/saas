import {
    createLeadSource,
    deleteLeadSourceById,
    getAllLeadSources,
    getLeadSourceById,
    getLeadSourceByTitle,
    updateLeadSourceById,
} from "../db/lead_sources.js";
import { requireCrmUser } from "./crm.js";

export async function getLeadSources({ cookie, set }) {
    const access = await requireCrmUser({ cookie, set });
    if (access.error) {
        return { error: access.error };
    }

    const sources = await getAllLeadSources();
    set.status = 200;
    return { sources };
}

export async function addLeadSource({ body, cookie, set }) {
    const access = await requireCrmUser({ cookie, set });
    if (access.error) {
        return { error: access.error };
    }

    const title = String(body.title || "").trim();
    if (!title) {
        set.status = 400;
        return { error: "Source title is required" };
    }

    const existingSource = await getLeadSourceByTitle({ title });
    if (existingSource) {
        set.status = 409;
        return { error: "Source already exists" };
    }

    const id = await createLeadSource({ title });
    if (!id) {
        set.status = 400;
        return { error: "Failed to create source" };
    }

    const source = await getLeadSourceById({ id });
    set.status = 201;
    return { message: "Source created", source };
}

export async function updateLeadSource({ params, body, cookie, set }) {
    const access = await requireCrmUser({ cookie, set });
    if (access.error) {
        return { error: access.error };
    }

    const existingSource = await getLeadSourceById({ id: params.id });
    if (!existingSource) {
        set.status = 404;
        return { error: "Source not found" };
    }

    const title = String(body.title || "").trim();
    if (!title) {
        set.status = 400;
        return { error: "Source title is required" };
    }

    const duplicateSource = await getLeadSourceByTitle({ title });
    if (duplicateSource && Number(duplicateSource.id) !== Number(existingSource.id)) {
        set.status = 409;
        return { error: "Source already exists" };
    }

    await updateLeadSourceById({ id: existingSource.id, title });
    const source = await getLeadSourceById({ id: existingSource.id });
    set.status = 200;
    return { message: "Source updated", source };
}

export async function deleteLeadSource({ params, cookie, set }) {
    const access = await requireCrmUser({ cookie, set });
    if (access.error) {
        return { error: access.error };
    }

    const existingSource = await getLeadSourceById({ id: params.id });
    if (!existingSource) {
        set.status = 404;
        return { error: "Source not found" };
    }

    await deleteLeadSourceById({ id: existingSource.id });
    set.status = 204;
}
