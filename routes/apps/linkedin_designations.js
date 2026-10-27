import { t } from "elysia";
import {
    addLinkedinDesignation,
    deleteLinkedinDesignation,
    getLinkedinDesignations,
} from "../../services/linkedin_designations.js";

export default function (app) {
    return app
        .get("/", getLinkedinDesignations, {
            detail: {
                tags: ["LinkedIn Designations"],
                summary: "List LinkedIn designations",
            },
        })
        .post("/", addLinkedinDesignation, {
            body: t.Object({
                name: t.String({
                    minLength: 1,
                    maxLength: 255,
                    error: "Designation is required",
                }),
            }),
            detail: {
                tags: ["LinkedIn Designations"],
                summary: "Create LinkedIn designation",
            },
        })
        .delete("/:id", deleteLinkedinDesignation, {
            params: t.Object({
                id: t.Numeric(),
            }),
            detail: {
                tags: ["LinkedIn Designations"],
                summary: "Delete LinkedIn designation",
            },
        });
}
