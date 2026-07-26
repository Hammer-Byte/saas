document.getElementById("logout-btn")?.addEventListener("click", async () => {
    try {
        const response = await fetch("/api/auth/logout", {
            method: "POST",
            credentials: "same-origin",
        });
        const data = await response.json().catch(() => ({}));
        window.location.href = data.redirect || "/login";
    } catch (error) {
        console.error(error);
        window.location.href = "/login";
    }
});
