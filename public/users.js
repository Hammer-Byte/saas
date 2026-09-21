(() => {
    const form = document.getElementById("user-form");
    const formAlert = document.getElementById("user-form-alert");
    const pageAlert = document.getElementById("users-alert");
    const modalElement = document.getElementById("user-modal");
    const modalLabel = document.getElementById("user-modal-label");
    const openAddButton = document.getElementById("open-add-user-btn");
    const tableBody = document.getElementById("users-tbody");
    const rolesSection = document.getElementById("user-roles-section");
    const roleCheckboxes = Array.from(document.querySelectorAll(".user-role-checkbox"));

    if (!form || !tableBody) {
        return;
    }

    const idInput = form.elements.namedItem("id");
    const fullNameInput = form.elements.namedItem("full_name");
    const emailInput = form.elements.namedItem("email");
    const userRoleIds = new Map();
    const canManageRoles =
        typeof window.hasRequiredAuthority === "function"
            ? window.hasRequiredAuthority(window.AUTHORITIES?.MANAGE_USER_ROLES)
            : Boolean(rolesSection);

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

    function clearRoleCheckboxes() {
        userRoleIds.clear();
        for (const checkbox of roleCheckboxes) {
            checkbox.checked = false;
            checkbox.disabled = false;
        }
    }

    function setRolesSectionVisible(visible) {
        rolesSection?.classList.toggle("d-none", !visible);
    }

    async function loadUserRoles(userId) {
        clearRoleCheckboxes();
        if (!canManageRoles || !rolesSection) {
            setRolesSectionVisible(false);
            return;
        }

        const response = await fetch(`/api/users/${userId}/roles`, {
            credentials: "same-origin",
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || "Failed to load user roles.");
        }

        for (const mapping of data.userRoles || []) {
            userRoleIds.set(Number(mapping.role_id), Number(mapping.id));
        }

        for (const checkbox of roleCheckboxes) {
            const roleId = Number(checkbox.dataset.roleId);
            checkbox.checked = userRoleIds.has(roleId);
        }

        setRolesSectionVisible(true);
    }

    function resetForm() {
        form.reset();
        idInput.value = "";
        clearRoleCheckboxes();
        setRolesSectionVisible(false);
        hideAlert(formAlert);
    }

    function openAddModal() {
        resetForm();
        modalLabel.textContent = "Add user";
    }

    async function openEditModal(row) {
        hideAlert(formAlert);
        modalLabel.textContent = "Edit user";
        idInput.value = row.dataset.id || "";
        fullNameInput.value = row.dataset.fullName || "";
        emailInput.value = row.dataset.email || "";

        const userId = Number(row.dataset.id || 0);
        if (!userId) {
            setRolesSectionVisible(false);
            return;
        }

        try {
            await loadUserRoles(userId);
        } catch (error) {
            console.error(error);
            setRolesSectionVisible(false);
            showAlert(formAlert, error.message || "Failed to load user roles.", "danger");
        }
    }

    openAddButton?.addEventListener("click", openAddModal);

    tableBody.addEventListener("click", async (event) => {
        const row = event.target.closest("tr[data-id]");
        if (!row) return;

        if (event.target.closest(".user-edit-btn")) {
            const modal = window.bootstrap?.Modal?.getOrCreateInstance(modalElement);
            modal?.show();
            await openEditModal(row);
            return;
        }

        if (event.target.closest(".user-delete-btn")) {
            const confirmed = await showConfirm({
                title: "Delete user?",
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

    for (const checkbox of roleCheckboxes) {
        checkbox.addEventListener("change", async () => {
            const userId = Number(idInput.value || 0);
            const roleId = Number(checkbox.dataset.roleId || 0);
            if (!userId || !roleId) return;

            checkbox.disabled = true;
            hideAlert(formAlert);

            try {
                if (checkbox.checked) {
                    const response = await fetch("/api/user-roles", {
                        method: "POST",
                        credentials: "same-origin",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ user_id: userId, role_id: roleId }),
                    });
                    const data = await response.json().catch(() => ({}));
                    if (!response.ok) {
                        checkbox.checked = false;
                        showAlert(formAlert, data.error || "Failed to assign role.", "danger");
                        return;
                    }
                    userRoleIds.set(roleId, Number(data.userRole?.id));
                } else {
                    const mappingId = userRoleIds.get(roleId);
                    if (!mappingId) return;
                    const response = await fetch(`/api/user-roles/${mappingId}`, {
                        method: "DELETE",
                        credentials: "same-origin",
                    });
                    if (!response.ok && response.status !== 204) {
                        checkbox.checked = true;
                        const data = await response.json().catch(() => ({}));
                        showAlert(formAlert, data.error || "Failed to remove role.", "danger");
                        return;
                    }
                    userRoleIds.delete(roleId);
                }
            } catch (error) {
                console.error(error);
                checkbox.checked = !checkbox.checked;
                showAlert(formAlert, "Failed to update user role.", "danger");
            } finally {
                checkbox.disabled = false;
            }
        });
    }

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
