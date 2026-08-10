import { logout } from "../../services/authentication.js";

export default function (app) {
    return app.post("/logout", logout, {
        detail: {
            tags: ["Authentication"],
            summary: "Clear authentication token cookie and logout",
        },
    });
}
