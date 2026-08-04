(() => {
    const form = document.getElementById("application-edit-form");
    const alertBox = document.getElementById("application-alert");

    if (!form || !alertBox) {
        return;
    }

    const applicationId = form.dataset.applicationId;

    function showAlert(message, type) {
        alertBox.textContent = message;
        alertBox.className = `alert alert-${type}`;
        alertBox.classList.remove("d-none");
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const title = form.elements.namedItem("title")?.value?.trim() || "";
        const token = form.elements.namedItem("token")?.value?.trim() || "";
        const active = form.elements.namedItem("active")?.value === "true";

        if (!title || !token) {
            showAlert("Title and token are required.", "danger");
            return;
        }

        const saveBtn = form.querySelector('button[type="submit"]');
        if (saveBtn) {
            saveBtn.disabled = true;
        }

        try {
            const response = await fetch(`/api/applications/${applicationId}`, {
                method: "PATCH",
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    title,
                    token,
                    active,
                }),
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                showAlert(data.error || "Failed to update application.", "danger");
                return;
            }

            showAlert("Application updated successfully.", "success");
            if (data.application) {
                form.elements.namedItem("title").value = data.application.title;
                form.elements.namedItem("token").value = data.application.token;
                form.elements.namedItem("active").value = data.application.active ? "true" : "false";
            }
        } catch (error) {
            console.error(error);
            showAlert("Failed to update application.", "danger");
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
            }
        }
    });
})();
