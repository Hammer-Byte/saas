import {
    createLinkedinDesignation,
    deleteLinkedinDesignationById,
    getAllLinkedinDesignations,
    getLinkedinDesignationById,
    getLinkedinDesignationByName,
} from "../db/linkedin_designations.js";

export async function addLinkedinDesignation({ body, set }) {
    const name = body.name.trim();
    if (!name) {
        set.status = 400;
        return { error: "Designation is required" };
    }

    const existingDesignation = await getLinkedinDesignationByName({ name });
    if (existingDesignation) {
        set.status = 409;
        return { error: "Designation already exists" };
    }

    const id = await createLinkedinDesignation({ name });
    if (!id) {
        set.status = 400;
        return { error: "Failed to create designation" };
    }

    const linkedinDesignation = await getLinkedinDesignationById({ id });
    set.status = 201;
    return { message: "Designation created", linkedinDesignation };
}

export async function deleteLinkedinDesignation({ params, set }) {
    const existingDesignation = await getLinkedinDesignationById({ id: params.id });
    if (!existingDesignation) {
        set.status = 404;
        return { error: "Designation not found" };
    }

    await deleteLinkedinDesignationById({ id: existingDesignation.id });
    set.status = 204;
}

export async function getLinkedinDesignations({ set }) {
    const linkedinDesignations = await getAllLinkedinDesignations();
    set.status = 200;
    return { linkedinDesignations };
}
