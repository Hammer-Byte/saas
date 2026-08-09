import { t } from "elysia";
import { addCustomer, deleteCustomer, updateCustomer } from "../../services/customers.js";
import { ERRORS } from "../../constants.js";

export default function (app) {
    return app
        .post("/", addCustomer, {
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
                pan_gst: t.Optional(t.String({ maxLength: 32 })),
                hsn: t.Optional(t.String({ maxLength: 16 })),
                address: t.String({
                    minLength: 1,
                    maxLength: 512,
                    error: "Address is required",
                }),
            }),
            detail: {
                tags: ["Customers"],
                summary: "Create customer",
            },
        })
        .patch("/", updateCustomer, {
            body: t.Object({
                id: t.Numeric({ minimum: 1 }),
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
                pan_gst: t.Optional(t.String({ maxLength: 32 })),
                hsn: t.Optional(t.String({ maxLength: 16 })),
                address: t.String({
                    minLength: 1,
                    maxLength: 512,
                    error: "Address is required",
                }),
            }),
            detail: {
                tags: ["Customers"],
                summary: "Update customer",
            },
        })
        .delete("/:id", deleteCustomer, {
            params: t.Object({
                id: t.Numeric(),
            }),
            detail: {
                tags: ["Customers"],
                summary: "Delete customer",
            },
        });
}
