document.getElementById("logout-btn")?.addEventListener("click", async () => {
    try {
        try {
            window.localStorage.removeItem("gem-tenders-filters");
        } catch (storageError) {
            console.error(storageError);
        }
        const response = await fetch("/api/authentication/logout", {
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
