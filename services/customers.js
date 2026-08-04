import {
    createCustomer,
    deleteCustomerById,
    getAllCustomers,
    getCustomerById,
    updateCustomerById,
} from "../db/customers.js";

export async function addCustomer({ body, set }) {
    const id = await createCustomer({
        full_name: body.full_name.trim(),
        company: body.company.trim(),
        pan_gst: body.pan_gst?.trim() || null,
        hsn: body.hsn?.trim() || null,
        address: body.address.trim(),
    });

    const customer = await getCustomerById({ id });

    set.status = 201;
    return { message: "Customer created", customer };
}

export async function updateCustomer({ body, set }) {
    const existing = await getCustomerById({ id: body.id });
    if (!existing) {
        set.status = 404;
        return { error: "Customer not found" };
    }

    await updateCustomerById({
        id: body.id,
        full_name: body.full_name.trim(),
        company: body.company.trim(),
        pan_gst: body.pan_gst?.trim() || null,
        hsn: body.hsn?.trim() || null,
        address: body.address.trim(),
    });

    const customer = await getCustomerById({ id: body.id });

    set.status = 200;
    return { message: "Customer updated", customer };
}

export async function deleteCustomer({ params, set }) {
    const existing = await getCustomerById({ id: Number(params.id) });
    if (!existing) {
        set.status = 404;
        return { error: "Customer not found" };
    }

    await deleteCustomerById({ id: Number(params.id) });
    set.status = 204;
}

export async function getCustomers() {
    return await getAllCustomers();
}
