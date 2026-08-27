(() => {
    const form = document.getElementById("service-form");
    const formAlert = document.getElementById("service-form-alert");
    const pageAlert = document.getElementById("services-alert");
    const modalElement = document.getElementById("service-modal");
    const modalLabel = document.getElementById("service-modal-label");
    const openAddButton = document.getElementById("open-add-service-btn");
    const tableBody = document.getElementById("services-tbody");

    if (!form || !tableBody) {
        return;
    }

    const idInput = form.elements.namedItem("id");
    const titleInput = form.elements.namedItem("title");
    const descriptionInput = form.elements.namedItem("description");
    const costInput = form.elements.namedItem("cost");

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

    function resetForm() {
        form.reset();
        idInput.value = "";
        hideAlert(formAlert);
    }

    function openAddModal() {
        resetForm();
        modalLabel.textContent = "Add service";
        costInput.value = "0.0000";
    }

    function openEditModal(row) {
        hideAlert(formAlert);
        modalLabel.textContent = "Edit service";
        idInput.value = row.dataset.id || "";
        titleInput.value = row.dataset.title || "";
        descriptionInput.value = row.dataset.description || "";
        costInput.value = row.dataset.cost || "0";
    }

    openAddButton?.addEventListener("click", openAddModal);

    tableBody.addEventListener("click", async (event) => {
        const row = event.target.closest("tr[data-id]");
        if (!row) return;

        if (event.target.closest(".service-edit-btn")) {
            openEditModal(row);
            const modal = window.bootstrap?.Modal?.getOrCreateInstance(modalElement);
            modal?.show();
            return;
        }

        if (event.target.closest(".service-delete-btn")) {
            const confirmed = await showConfirm({
                title: "Delete service?",
                description: "This cannot be undone.",
                choices: [
                    { label: "Cancel", variant: "secondary", value: false },
                    { label: "Delete", variant: "danger", value: true },
                ],
            });
            if (!confirmed) {
                return;
            }

            hideAlert(pageAlert);
            try {
                const response = await fetch(`/api/services/${row.dataset.id}`, {
                    method: "DELETE",
                    credentials: "same-origin",
                });

                if (!response.ok && response.status !== 204) {
                    const data = await response.json().catch(() => ({}));
                    showAlert(pageAlert, data.error || "Failed to delete service.", "danger");
                    return;
                }

                window.location.reload();
            } catch (error) {
                console.error(error);
                showAlert(pageAlert, "Failed to delete service.", "danger");
            }
        }
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideAlert(formAlert);

        const id = idInput.value ? Number(idInput.value) : null;
        const payload = {
            title: titleInput.value.trim(),
            description: descriptionInput.value.trim(),
            cost: Number(costInput.value),
        };

        if (!payload.title || !payload.description || Number.isNaN(payload.cost)) {
            showAlert(formAlert, "Please fill in title, description, and cost.", "danger");
            return;
        }

        const submitButton = document.getElementById("service-submit-btn");
        if (submitButton) submitButton.disabled = true;

        try {
            const response = await fetch("/api/services", {
                method: id ? "PATCH" : "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(id ? { id, ...payload } : payload),
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                showAlert(formAlert, data.error || "Failed to save service.", "danger");
                return;
            }

            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert(formAlert, "Failed to save service.", "danger");
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    });
})();
