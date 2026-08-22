(() => {
    const form = document.getElementById("user-form");
    const formAlert = document.getElementById("user-form-alert");
    const pageAlert = document.getElementById("users-alert");
    const modalElement = document.getElementById("user-modal");
    const modalLabel = document.getElementById("user-modal-label");
    const openAddButton = document.getElementById("open-add-user-btn");
    const tbody = document.getElementById("users-tbody");

    if (!form || !tbody) {
        return;
    }

    const idInput = form.elements.namedItem("id");
    const fullNameInput = form.elements.namedItem("full_name");
    const emailInput = form.elements.namedItem("email");

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
        modalLabel.textContent = "Add user";
    }

    function openEditModal(row) {
        hideAlert(formAlert);
        modalLabel.textContent = "Edit user";
        idInput.value = row.dataset.id || "";
        fullNameInput.value = row.dataset.fullName || "";
        emailInput.value = row.dataset.email || "";
    }

    openAddButton?.addEventListener("click", openAddModal);

    tbody.addEventListener("click", async (event) => {
        const row = event.target.closest("tr[data-id]");
        if (!row) return;

        if (event.target.closest(".user-edit-btn")) {
            openEditModal(row);
            const modal = window.bootstrap?.Modal?.getOrCreateInstance(modalElement);
            modal?.show();
            return;
        }

        if (event.target.closest(".user-delete-btn")) {
            if (!window.confirm("Delete this user?")) {
                return;
            }

            hideAlert(pageAlert);
            try {
                const response = await fetch(`/api/users/${row.dataset.id}`, {
                    method: "DELETE",
                    credentials: "same-origin",
                });

                if (!response.ok && response.status !== 204) {
                    const data = await response.json().catch(() => ({}));
                    showAlert(pageAlert, data.error || "Failed to delete user.", "danger");
                    return;
                }

                window.location.reload();
            } catch (error) {
                console.error(error);
                showAlert(pageAlert, "Failed to delete user.", "danger");
            }
        }
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideAlert(formAlert);

        const id = idInput.value ? Number(idInput.value) : null;
        const payload = {
            full_name: fullNameInput.value.trim(),
            email: emailInput.value.trim(),
        };

        if (!payload.full_name || !payload.email) {
            showAlert(formAlert, "Please fill in full name and email.", "danger");
            return;
        }

        const submitButton = document.getElementById("user-submit-btn");
        if (submitButton) submitButton.disabled = true;

        try {
            const response = await fetch("/api/users", {
                method: id ? "PATCH" : "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(id ? { id, ...payload } : payload),
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                showAlert(formAlert, data.error || "Failed to save user.", "danger");
                return;
            }

            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert(formAlert, "Failed to save user.", "danger");
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    });
})();
