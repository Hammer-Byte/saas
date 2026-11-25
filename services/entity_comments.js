import {
    createEntityComment,
    deleteEntityCommentById,
    getAllEntityCommentsByEntity,
    getEntityCommentById,
    updateEntityCommentById,
} from "../db/entity_comments.js";
import { getCustomerProjectById } from "../db/customer_projects.js";
import { getCustomerById } from "../db/customers.js";
import { getContractById } from "../db/contracts.js";
import { getCustomerInvoiceById } from "../db/customer_invoices.js";
import { getJobApplicantById } from "../db/job_applicants.js";
import { getServerById } from "../db/servers.js";
import { getCurrentUser } from "./authentication.js";

export const ENTITY_COMMENT_TYPES = {
    project: "project",
    customer: "customer",
    contract: "contract",
    invoice: "invoice",
    job_application: "job_application",
    server: "server",
};

async function entityExists({ entity_type, entity_id }) {
    if (entity_type === ENTITY_COMMENT_TYPES.project) {
        return !!(await getCustomerProjectById({ id: entity_id }));
    }
    if (entity_type === ENTITY_COMMENT_TYPES.customer) {
        return !!(await getCustomerById({ id: entity_id }));
    }
    if (entity_type === ENTITY_COMMENT_TYPES.contract) {
        return !!(await getContractById({ id: entity_id }));
    }
    if (entity_type === ENTITY_COMMENT_TYPES.invoice) {
        return !!(await getCustomerInvoiceById({ id: entity_id }));
    }
    if (entity_type === ENTITY_COMMENT_TYPES.job_application) {
        return !!(await getJobApplicantById({ id: entity_id }));
    }
    if (entity_type === ENTITY_COMMENT_TYPES.server) {
        return !!(await getServerById({ id: entity_id }));
    }
    return false;
}

export async function addEntityComment({ body, cookie, set }) {
    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return { error: "Unauthorized" };
    }

    const entity_type = String(body.entity_type || "").trim();
    const entity_id = Number(body.entity_id);
    const comment = String(body.comment || "").trim();

    if (!Object.values(ENTITY_COMMENT_TYPES).includes(entity_type)) {
        set.status = 400;
        return { error: "Invalid entity type" };
    }
    if (!(entity_id >= 1)) {
        set.status = 400;
        return { error: "Invalid entity id" };
    }
    if (!comment) {
        set.status = 400;
        return { error: "Comment is required" };
    }
    if (!(await entityExists({ entity_type, entity_id }))) {
        set.status = 404;
        return { error: "Record not found" };
    }

    const commentId = await createEntityComment({
        entity_type,
        entity_id,
        user_id: currentUser.id,
        comment,
    });
    if (!commentId) {
        set.status = 400;
        return { error: "Failed to add comment" };
    }

    return { id: commentId };
}

export async function updateEntityComment({ params, body, cookie, set }) {
    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return { error: "Unauthorized" };
    }

    const existingComment = await getEntityCommentById({ id: Number(params.id) });
    if (!existingComment) {
        set.status = 404;
        return { error: "Comment not found" };
    }
    if (existingComment.user_id !== currentUser.id && !currentUser.super_admin) {
        set.status = 403;
        return { error: "Forbidden" };
    }

    const comment = String(body.comment || "").trim();
    if (!comment) {
        set.status = 400;
        return { error: "Comment is required" };
    }

    await updateEntityCommentById({ id: existingComment.id, comment });
    return { ok: true };
}

export async function deleteEntityComment({ params, cookie, set }) {
    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return { error: "Unauthorized" };
    }

    const existingComment = await getEntityCommentById({ id: Number(params.id) });
    if (!existingComment) {
        set.status = 404;
        return { error: "Comment not found" };
    }
    if (existingComment.user_id !== currentUser.id && !currentUser.super_admin) {
        set.status = 403;
        return { error: "Forbidden" };
    }

    await deleteEntityCommentById({ id: existingComment.id });
    return { ok: true };
}

export async function listEntityComments({ entity_type, entity_id }) {
    if (!Object.values(ENTITY_COMMENT_TYPES).includes(entity_type)) {
        return [];
    }
    return getAllEntityCommentsByEntity({ entity_type, entity_id });
}
