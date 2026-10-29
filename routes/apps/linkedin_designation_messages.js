import { t } from "elysia";
import {
    addLinkedinDesignationMessage,
    deleteLinkedinDesignationMessage,
    getLinkedinDesignationMessages,
} from "../../services/linkedin_designation_messages.js";

export default function (app) {
    return app
        .get("/", getLinkedinDesignationMessages, {
            detail: {
                tags: ["LinkedIn Designation Messages"],
                summary: "List LinkedIn designation messages",
            },
        })
        .post("/", addLinkedinDesignationMessage, {
            body: t.Object({
                designation_id: t.Numeric({ minimum: 1 }),
                message: t.String({
                    minLength: 1,
                    maxLength: 8000,
                    error: "Message is required",
                }),
            }),
            detail: {
                tags: ["LinkedIn Designation Messages"],
                summary: "Create LinkedIn designation message",
            },
        })
        .delete("/:id", deleteLinkedinDesignationMessage, {
            params: t.Object({
                id: t.Numeric(),
            }),
            detail: {
                tags: ["LinkedIn Designation Messages"],
                summary: "Delete LinkedIn designation message",
            },
        });
}