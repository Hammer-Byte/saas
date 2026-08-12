import {
    createCustomer,
    deleteCustomerById,
    getCustomerById,
    updateCustomerById,
} from "../db/customers.js";
import {
    createCustomerEmail,
    deleteCustomerEmailsByCustomerId,
} from "../db/customer_emails.js";
import {
    createCustomerPhone,
    deleteCustomerPhonesByCustomerId,
} from "../db/customer_phones.js";

export async function addCustomer({ body, set }) {
    const id = await createCustomer({
        ...body,
        full_name: body.full_name.trim(),
        company: body.company.trim(),
        pan_gst: body.pan_gst?.trim() || null,
        hsn: body.hsn?.trim() || null,
        address: body.address.trim(),
    });

    await deleteCustomerPhonesByCustomerId({ customer_id: id });
    for (const phone of body.phones ?? []) {
        await createCustomerPhone({ customer_id: id, phone });
    }

    await deleteCustomerEmailsByCustomerId({ customer_id: id });
    for (const email of body.emails ?? []) {
        await createCustomerEmail({ customer_id: id, email });
    }

    const customer = await getCustomerById({ id });

    set.status = 201;
    return { message: "Customer created", customer };
}

export async function updateCustomer({ body, set }) {
    const existingCustomer = await getCustomerById({ id: body.id });
    if (!existingCustomer) {
        set.status = 404;
        return { error: "Customer not found" };
    }

    await updateCustomerById({
        ...body,
        full_name: body.full_name.trim(),
        company: body.company.trim(),
        pan_gst: body.pan_gst?.trim() || null,
        hsn: body.hsn?.trim() || null,
        address: body.address.trim(),
    });

    await deleteCustomerPhonesByCustomerId({ customer_id: body.id });
    for (const phone of body.phones ?? []) {
        await createCustomerPhone({ customer_id: body.id, phone });
    }

    await deleteCustomerEmailsByCustomerId({ customer_id: body.id });
    for (const email of body.emails ?? []) {
        await createCustomerEmail({ customer_id: body.id, email });
    }

    const customer = await getCustomerById({ id: body.id });

    set.status = 200;
    return { message: "Customer updated", customer };
}

export async function deleteCustomer({ params, set }) {
    const existingCustomer = await getCustomerById({ id: params.id });
    if (!existingCustomer) {
        set.status = 404;
        return { error: "Customer not found" };
    }

    await deleteCustomerById({ id: params.id });
    set.status = 204;
}
