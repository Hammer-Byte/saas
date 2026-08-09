import { getCustomerById } from "../db/customers.js";
import {
    createCustomerProject,
    deleteCustomerProjectById,
    getCustomerProjectById,
    updateCustomerProjectById,
} from "../db/customer_projects.js";

export async function addCustomerProject({ body, set }) {
    const customer = await getCustomerById({ id: Number(body.customer_id) });
    if (!customer) {
        set.status = 404;
        return { error: "Customer not found" };
    }

    const id = await createCustomerProject({
        customer_id: customer.id,
        title: body.title.trim(),
        description: body.description?.trim() || null,
    });

    const customerProject = await getCustomerProjectById({ id });

    set.status = 201;
    return { message: "Customer project created", customerProject };
}

export async function updateCustomerProject({ body, set }) {
    const existing = await getCustomerProjectById({ id: body.id });
    if (!existing) {
        set.status = 404;
        return { error: "Customer project not found" };
    }

    await updateCustomerProjectById({
        id: body.id,
        title: body.title.trim(),
        description: body.description?.trim() || null,
    });

    const customerProject = await getCustomerProjectById({ id: body.id });

    set.status = 200;
    return { message: "Customer project updated", customerProject };
}

export async function deleteCustomerProject({ params, set }) {
    const existing = await getCustomerProjectById({ id: Number(params.id) });
    if (!existing) {
        set.status = 404;
        return { error: "Customer project not found" };
    }

    await deleteCustomerProjectById({ id: existing.id });
    set.status = 204;
}
