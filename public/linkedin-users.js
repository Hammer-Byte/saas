(() => {
    const form = document.getElementById("linkedin-user-form");
    const pageAlert = document.getElementById("linkedin-users-alert");
    const tableWrap = document.getElementById("linkedin-users-table-wrap");
    const emptyState = document.getElementById("linkedin-users-empty");
    const tableBody = document.getElementById("linkedin-users-tbody");
    const idInput = form?.elements.namedItem("id");
    const nameInput = form?.elements.namedItem("name");
    const cookieInput = form?.elements.namedItem("cookie");
    const submitButton = document.getElementById("linkedin-user-submit-btn");

    function showAlert(message, type) {
        if (!pageAlert) return;
        pageAlert.textContent = message;
        pageAlert.className = `alert alert-${type}`;
        pageAlert.classList.remove("d-none");
    }

    function hideAlert() {
        if (!pageAlert) return;
        pageAlert.classList.add("d-none");
        pageAlert.textContent = "";
    }

    function resetForm() {
        form?.reset();
        if (idInput) idInput.value = "";
        if (submitButton) submitButton.textContent = "Add user";
    }

    function openEditForm(row) {
        hideAlert();
        if (idInput) idInput.value = row.dataset.id || "";
        if (nameInput) nameInput.value = row.dataset.name || "";
        if (cookieInput) cookieInput.value = row.dataset.cookie || "";
        if (submitButton) submitButton.textContent = "Save user";
        nameInput?.focus();
    }

    form?.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideAlert();

        const name = nameInput?.value?.trim() || "";
        const cookie = cookieInput?.value?.trim() || "";
        const userId = Number(idInput?.value || 0);
        const isEdit = Number.isInteger(userId) && userId > 0;

        if (!name) {
            showAlert("Name is required.", "danger");
            return;
        }
        if (!cookie) {
            showAlert("Cookie is required.", "danger");
            return;
        }

        if (submitButton) submitButton.disabled = true;

        try {
            const response = await fetch(
                isEdit ? `/api/linkedin-users/${userId}` : "/api/linkedin-users",
                {
                    method: isEdit ? "PATCH" : "POST",
                    credentials: "same-origin",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name, cookie }),
                },
            );
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                showAlert(
                    data.error || (isEdit ? "Failed to update user." : "Failed to add user."),
                    "danger",
                );
                return;
            }

            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert(isEdit ? "Failed to update user." : "Failed to add user.", "danger");
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    });

    tableBody?.addEventListener("click", async (event) => {
        const row = event.target.closest("tr[data-id]");
        if (!row) return;

        if (event.target.closest(".linkedin-user-edit-btn")) {
            openEditForm(row);
            return;
        }

        const deleteButton = event.target.closest(".linkedin-user-delete-btn");
        if (!deleteButton) return;

        const userId = Number(deleteButton.dataset.id);
        if (!userId) return;

        const confirmed = await showConfirm({
            title: "Delete LinkedIn user?",
            description: "This removes the account cookie used for GrowNetwork and SearchNetwork runs.",
            choices: [
                { label: "Cancel", variant: "secondary", value: false },
                { label: "Delete", variant: "danger", value: true },
            ],
        });
        if (!confirmed) return;

        deleteButton.disabled = true;
        hideAlert();

        try {
            const response = await fetch(`/api/linkedin-users/${userId}`, {
                method: "DELETE",
                credentials: "same-origin",
            });

            if (!response.ok && response.status !== 204) {
                const data = await response.json().catch(() => ({}));
                showAlert(data.error || "Failed to delete user.", "danger");
                deleteButton.disabled = false;
                return;
            }

            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert("Failed to delete user.", "danger");
            deleteButton.disabled = false;
        }
    });

    if (tableBody && tableWrap && emptyState) {
        const hasRows = tableBody.querySelectorAll("tr").length > 0;
        tableWrap.classList.toggle("d-none", !hasRows);
        emptyState.classList.toggle("d-none", hasRows);
    }

    resetForm();
})();
