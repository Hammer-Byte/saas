import { logout } from "../../services/auth.js";

export default function (app) {
    return app.post("/logout", logout, {
        detail: {
            tags: ["Auth"],
            summary: "Clear authentication token cookie and logout",
        },
    });
}
