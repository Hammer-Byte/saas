import { getApplicationById } from "../db/applications.js";
import {
    createCustomer,
    createCustomerEmail,
    createCustomerPhone,
    deleteCustomerEmailsByApplicationCustomerId,
    deleteCustomerPhonesByApplicationCustomerId,
    getCustomerByApplicationId,
    updateCustomerByApplicationId,
} from "../db/application_customers.js";

export async function addCustomer({ params, body, set }) {
    const application = await getApplicationById({ id: Number(params.id) });
    if (!application) {
        set.status = 404;
        return { error: "Application not found" };
    }

    const full_name = body.full_name.trim();
    const company = body.company.trim();
    const pan_gst = body.pan_gst.trim();
    const hsn = body.hsn.trim();
    const address = body.address.trim();
    const emails = body.emails.map((email) => email.trim()).filter(Boolean);
    const phones = body.phones.map((phone) => phone.trim()).filter(Boolean);

    let customer = await getCustomerByApplicationId({ application_id: application.id });

    if (customer) {
        await updateCustomerByApplicationId({
            application_id: application.id,
            full_name,
            company,
            pan_gst,
            hsn,
            address,
        });
    } else {
        await createCustomer({
            application_id: application.id,
            full_name,
            company,
            pan_gst,
            hsn,
            address,
        });
        customer = await getCustomerByApplicationId({ application_id: application.id });
    }

    await deleteCustomerEmailsByApplicationCustomerId({ application_customer_id: customer.id });
    for (const email of emails) {
        await createCustomerEmail({ application_customer_id: customer.id, email });
    }

    await deleteCustomerPhonesByApplicationCustomerId({ application_customer_id: customer.id });
    for (const phone of phones) {
        await createCustomerPhone({ application_customer_id: customer.id, phone });
    }

    customer = await getCustomerByApplicationId({ application_id: application.id });

    set.status = 200;
    return {
        message: "Customer saved",
        customer,
        emails,
        phones,
    };
}
