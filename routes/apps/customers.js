import { t } from "elysia";
import { addCustomer } from "../../services/customers.js";
import { ERRORS } from "../../constants.js";

export default function (app) {
    return app.post("/:id/customer", addCustomer, {
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
            emails: t.Array(t.String({ maxLength: 255 })),
            phones: t.Array(t.String({ maxLength: 13 })),
        }),
        detail: {
            tags: ["Customers"],
            summary: "Create or update application customer",
        },
    });
}
