import { t } from "elysia";
import { getApplicationById } from "../../db/applications.js";
import { upsertCustomerByApplicationId } from "../../db/application_customers.js";
import { ERRORS } from "../../constants.js";

export default function (app) {
    return app.put(
        "/:id/customer",
        async ({ params, body, set }) => {
            const application = await getApplicationById({ id: Number(params.id) });
            if (!application) {
                set.status = 404;
                return { error: "Application not found" };
            }

            const customer = await upsertCustomerByApplicationId({
                application_id: application.id,
                full_name: body.full_name.trim(),
                company: body.company.trim(),
                pan_gst: body.pan_gst.trim(),
                hsn: body.hsn.trim(),
                address: body.address.trim(),
            });

            set.status = 200;
            return { message: "Customer saved", customer };
        },
        {
            params: t.Object({
                id: t.Numeric(),
            }),
            body: t.Object({
                full_name: t.String({
                    minLength: 1,
                    maxLength: 128,
                    error: ERRORS.FULL_NAME_REQUIRED,
                }),
                company: t.String({
                    minLength: 1,
                    maxLength: 128,
                    error: "Company is required",
                }),
                pan_gst: t.String({
                    minLength: 1,
                    maxLength: 32,
                    error: "PAN/GST is required",
                }),
                hsn: t.String({
                    minLength: 1,
                    maxLength: 16,
                    error: "HSN is required",
                }),
                address: t.String({
                    minLength: 1,
                    maxLength: 512,
                    error: "Address is required",
                }),
            }),
            detail: {
                tags: ["Customers"],
                summary: "Create or update application customer",
            },
        },
    );
}
