(() => {
    const form = document.getElementById("authority-form");
    const formAlert = document.getElementById("authority-form-alert");
    const pageAlert = document.getElementById("authorities-alert");
    const tableBody = document.getElementById("authorities-tbody");
    const openAddButton = document.getElementById("open-add-authority-btn");
    const modalLabel = document.getElementById("authority-modal-label");

    function showAlert(target, message, type) {
        if (!target) return;
        target.textContent = message;
        target.className = `alert alert-${type}`;
        target.classList.remove("d-none");
    }

    function hideAlert(target) {
        if (!target) return;
        target.classList.add("d-none");
        target.textContent = "";
    }

    openAddButton?.addEventListener("click", () => {
        form?.reset();
        hideAlert(formAlert);
        if (modalLabel) modalLabel.textContent = "Add authority";
    });

    tableBody?.addEventListener("click", async (event) => {
        const button = event.target.closest(".authority-delete-btn");
        if (!button) return;
        const row = button.closest("tr[data-id]");
        if (!row) return;

        const confirmed = await showConfirm({
            title: "Delete authority?",
            description: "This also removes it from all roles.",
            choices: [
                { label: "Cancel", variant: "secondary", value: false },
                { label: "Delete", variant: "danger", value: true },
            ],
        });
        if (!confirmed) return;

        hideAlert(pageAlert);
        try {
            const response = await fetch(`/api/authorities/${row.dataset.id}`, {
                method: "DELETE",
                credentials: "same-origin",
            });
            if (!response.ok && response.status !== 204) {
                const data = await response.json().catch(() => ({}));
                showAlert(pageAlert, data.error || "Failed to delete authority.", "danger");
                return;
            }
            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert(pageAlert, "Failed to delete authority.", "danger");
        }
    });

    form?.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideAlert(formAlert);

        const title = form.elements.namedItem("title").value.trim().toUpperCase();
        const description = form.elements.namedItem("description").value.trim();
        if (!title || !description) {
            showAlert(formAlert, "Title and description are required.", "danger");
            return;
        }

        const submitButton = document.getElementById("authority-submit-btn");
        if (submitButton) submitButton.disabled = true;

        try {
            const response = await fetch("/api/authorities", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title, description }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showAlert(formAlert, data.error || "Failed to create authority.", "danger");
                return;
            }
            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert(formAlert, "Failed to create authority.", "danger");
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    });
})();
