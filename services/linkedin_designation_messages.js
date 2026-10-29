import { getLinkedinDesignationById } from "../db/linkedin_designations.js";
import {
    createLinkedinDesignationMessage,
    deleteLinkedinDesignationMessageById,
    getAllLinkedinDesignationMessages,
    getLinkedinDesignationMessageById,
} from "../db/linkedin_designation_messages.js";

export async function addLinkedinDesignationMessage({ body, set }) {
    const message = String(body.message || "").trim();
    if (!message) {
        set.status = 400;
        return { error: "Message is required" };
    }

    const designation = await getLinkedinDesignationById({ id: body.designation_id });
    if (!designation) {
        set.status = 400;
        return { error: "Designation not found" };
    }

    const id = await createLinkedinDesignationMessage({
        designation_id: designation.id,
        message,
    });
    if (!id) {
        set.status = 400;
        return { error: "Failed to create message" };
    }

    const linkedinDesignationMessage = await getLinkedinDesignationMessageById({ id });
    set.status = 201;
    return {
        message: "Message created",
        linkedinDesignationMessage: {
            ...linkedinDesignationMessage,
            designation_name: designation.name,
        },
    };
}

export async function deleteLinkedinDesignationMessage({ params, set }) {
    const existing = await getLinkedinDesignationMessageById({ id: params.id });
    if (!existing) {
        set.status = 404;
        return { error: "Message not found" };
    }

    await deleteLinkedinDesignationMessageById({ id: existing.id });
    set.status = 204;
}

export async function getLinkedinDesignationMessages({ set }) {
    const linkedinDesignationMessages = await getAllLinkedinDesignationMessages();
    set.status = 200;
    return { linkedinDesignationMessages };
}
