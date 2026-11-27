import {
    createConsultationTopic,
    getAllConsultationTopics,
    getConsultationTopicById,
    updateConsultationTopicById,
} from "../db/consultation_topics.js";
import { requireCrmUser } from "./crm.js";

function parseTopicPayload(body) {
    const title = String(body.title || "").trim();
    if (!title) {
        return { error: "Title is required" };
    }
    if (title.length > 128) {
        return { error: "Title is too long" };
    }

    const description = String(body.description || "").trim();
    if (!description) {
        return { error: "Description is required" };
    }
    if (description.length > 255) {
        return { error: "Description is too long" };
    }

    const active = body.active == null ? true : !!body.active;
    return { title, description, active };
}

export async function getConsultationTopics({ cookie, set, query }) {
    const { error, currentUser } = await requireCrmUser({ cookie, set });
    if (error) {
        return { error };
    }

    const activeOnly = String(query?.active_only || "") === "1";
    const topics = await getAllConsultationTopics({ active_only: activeOnly });
    set.status = 200;
    return { topics, currentUser };
}

export async function addConsultationTopic({ body, cookie, set }) {
    const { error, currentUser } = await requireCrmUser({ cookie, set });
    if (error) {
        return { error };
    }

    const parsed = parseTopicPayload(body);
    if (parsed.error) {
        set.status = 400;
        return { error: parsed.error };
    }

    const id = await createConsultationTopic({
        title: parsed.title,
        description: parsed.description,
    });
    if (!id) {
        set.status = 400;
        return { error: "Failed to create topic" };
    }

    if (!parsed.active) {
        await updateConsultationTopicById({
            id,
            title: parsed.title,
            description: parsed.description,
            active: false,
        });
    }

    set.status = 201;
    return { id, message: "Topic created", currentUser };
}

export async function updateConsultationTopic({ params, body, cookie, set }) {
    const { error, currentUser } = await requireCrmUser({ cookie, set });
    if (error) {
        return { error };
    }

    const existing = await getConsultationTopicById({ id: params.id });
    if (!existing) {
        set.status = 404;
        return { error: "Topic not found" };
    }

    const parsed = parseTopicPayload({
        title: body.title ?? existing.title,
        description: body.description ?? existing.description,
        active: body.active ?? existing.active,
    });
    if (parsed.error) {
        set.status = 400;
        return { error: parsed.error };
    }

    await updateConsultationTopicById({
        id: params.id,
        title: parsed.title,
        description: parsed.description,
        active: parsed.active,
    });

    set.status = 200;
    return { message: "Topic updated", currentUser };
}
