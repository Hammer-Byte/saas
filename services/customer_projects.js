import { getCustomerById } from "../db/customers.js";
import { getProjectById } from "../db/projects.js";
import {
    createCustomerProject,
    deleteCustomerProjectById,
    getCustomerProjectById,
    getCustomerProjectsByCustomerId,
    updateCustomerProjectById,
} from "../db/customer_projects.js";

export async function addCustomerProject({ params, body, set }) {
    const customer = await getCustomerById({ id: Number(params.id) });
    if (!customer) {
        set.status = 404;
        return { error: "Customer not found" };
    }

    const project = await getProjectById({ id: Number(body.project_id) });
    if (!project) {
        set.status = 400;
        return { error: "Project not found" };
    }

    const existing = await getCustomerProjectsByCustomerId({ customer_id: customer.id });
    if (existing.some((row) => Number(row.project_id) === Number(body.project_id))) {
        set.status = 400;
        return { error: "Project is already linked to this customer" };
    }

    const id = await createCustomerProject({
        customer_id: customer.id,
        project_id: Number(body.project_id),
        description: body.description?.trim() || null,
    });

    const customerProject = await getCustomerProjectById({ id });

    set.status = 201;
    return { message: "Customer project created", customerProject };
}

export async function updateCustomerProject({ params, body, set }) {
    const customer = await getCustomerById({ id: Number(params.id) });
    if (!customer) {
        set.status = 404;
        return { error: "Customer not found" };
    }

    const existing = await getCustomerProjectById({ id: body.id });
    if (!existing || Number(existing.customer_id) !== Number(customer.id)) {
        set.status = 404;
        return { error: "Customer project not found" };
    }

    const project = await getProjectById({ id: Number(body.project_id) });
    if (!project) {
        set.status = 400;
        return { error: "Project not found" };
    }

    const siblings = await getCustomerProjectsByCustomerId({ customer_id: customer.id });
    if (
        siblings.some(
            (row) =>
                Number(row.project_id) === Number(body.project_id) &&
                Number(row.id) !== Number(body.id),
        )
    ) {
        set.status = 400;
        return { error: "Project is already linked to this customer" };
    }

    await updateCustomerProjectById({
        id: body.id,
        project_id: Number(body.project_id),
        description: body.description?.trim() || null,
    });

    const customerProject = await getCustomerProjectById({ id: body.id });

    set.status = 200;
    return { message: "Customer project updated", customerProject };
}

export async function deleteCustomerProject({ params, set }) {
    const customer = await getCustomerById({ id: Number(params.id) });
    if (!customer) {
        set.status = 404;
        return { error: "Customer not found" };
    }

    const existing = await getCustomerProjectById({
        id: Number(params.customer_project_id),
    });
    if (!existing || Number(existing.customer_id) !== Number(customer.id)) {
        set.status = 404;
        return { error: "Customer project not found" };
    }

    await deleteCustomerProjectById({ id: existing.id });
    set.status = 204;
}
