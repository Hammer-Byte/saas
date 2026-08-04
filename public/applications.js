(() => {
    const form = document.getElementById("add-application-form");
    const alertBox = document.getElementById("add-application-alert");
    const pageAlert = document.getElementById("applications-alert");

    if (!form || !alertBox) {
        return;
    }

    function showAlert(target, message, type) {
        if (!target) return;
        target.textContent = message;
        target.className = `alert alert-${type}`;
        target.classList.remove("d-none");
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        alertBox.classList.add("d-none");

        const title = form.elements.namedItem("title")?.value?.trim() || "";
        const active = form.elements.namedItem("active")?.value === "true";

        if (!title) {
            showAlert(alertBox, "Title is required.", "danger");
            return;
        }

        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
        }

        try {
            const response = await fetch("/api/applications", {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    title,
                    active,
                }),
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                showAlert(alertBox, data.error || "Failed to add application.", "danger");
                return;
            }

            showAlert(pageAlert, "Application added successfully.", "success");
            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert(alertBox, "Failed to add application.", "danger");
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
            }
        }
    });
})();
