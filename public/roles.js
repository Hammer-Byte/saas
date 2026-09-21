(() => {
    const form = document.getElementById("role-form");
    const formAlert = document.getElementById("role-form-alert");
    const pageAlert = document.getElementById("roles-alert");
    const modalElement = document.getElementById("role-modal");
    const modalLabel = document.getElementById("role-modal-label");
    const openAddButton = document.getElementById("open-add-role-btn");
    const tableBody = document.getElementById("roles-tbody");
    const authoritiesModalElement = document.getElementById("role-authorities-modal");
    const authoritiesModalLabel = document.getElementById("role-authorities-modal-label");
    const authoritiesAlert = document.getElementById("role-authorities-alert");
    const authoritiesRoleIdInput = document.getElementById("role-authorities-role-id");
    const authorityCheckboxes = Array.from(document.querySelectorAll(".role-authority-checkbox"));

    const roleAuthorityIds = new Map();

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
        form?.reset();
        const idInput = form?.elements.namedItem("id");
        if (idInput) idInput.value = "";
        const activeInput = form?.elements.namedItem("active");
        if (activeInput) activeInput.checked = true;
        hideAlert(formAlert);
    }

    openAddButton?.addEventListener("click", () => {
        resetForm();
        if (modalLabel) modalLabel.textContent = "Add role";
    });

    tableBody?.addEventListener("click", async (event) => {
        const row = event.target.closest("tr[data-id]");
        if (!row) return;

        if (event.target.closest(".role-edit-btn")) {
            hideAlert(formAlert);
            if (modalLabel) modalLabel.textContent = "Edit role";
            form.elements.namedItem("id").value = row.dataset.id || "";
            form.elements.namedItem("title").value = row.dataset.title || "";
            form.elements.namedItem("active").checked = row.dataset.active === "1";
            window.bootstrap?.Modal?.getOrCreateInstance(modalElement)?.show();
            return;
        }

        if (event.target.closest(".role-authorities-btn")) {
            const roleId = Number(row.dataset.id);
            if (!roleId) return;
            hideAlert(authoritiesAlert);
            authoritiesRoleIdInput.value = String(roleId);
            if (authoritiesModalLabel) {
                authoritiesModalLabel.textContent = `Authorities — ${row.dataset.title || roleId}`;
            }

            try {
                const response = await fetch(`/api/roles/${roleId}/authorities`, {
                    credentials: "same-origin",
                });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    showAlert(pageAlert, data.error || "Failed to load role authorities.", "danger");
                    return;
                }

                roleAuthorityIds.clear();
                for (const mapping of data.roleAuthorities || []) {
                    roleAuthorityIds.set(Number(mapping.authority_id), Number(mapping.id));
                }

                for (const checkbox of authorityCheckboxes) {
                    const authorityId = Number(checkbox.dataset.authorityId);
                    checkbox.checked = roleAuthorityIds.has(authorityId);
                }

                window.bootstrap?.Modal?.getOrCreateInstance(authoritiesModalElement)?.show();
            } catch (error) {
                console.error(error);
                showAlert(pageAlert, "Failed to load role authorities.", "danger");
            }
            return;
        }

        if (event.target.closest(".role-delete-btn")) {
            const confirmed = await showConfirm({
                title: "Delete role?",
                description: "This also removes user-role and role-authority mappings.",
                choices: [
                    { label: "Cancel", variant: "secondary", value: false },
                    { label: "Delete", variant: "danger", value: true },
                ],
            });
            if (!confirmed) return;

            hideAlert(pageAlert);
            try {
                const response = await fetch(`/api/roles/${row.dataset.id}`, {
                    method: "DELETE",
                    credentials: "same-origin",
                });
                if (!response.ok && response.status !== 204) {
                    const data = await response.json().catch(() => ({}));
                    showAlert(pageAlert, data.error || "Failed to delete role.", "danger");
                    return;
                }
                window.location.reload();
            } catch (error) {
                console.error(error);
                showAlert(pageAlert, "Failed to delete role.", "danger");
            }
        }
    });

    for (const checkbox of authorityCheckboxes) {
        checkbox.addEventListener("change", async () => {
            const roleId = Number(authoritiesRoleIdInput?.value || 0);
            const authorityId = Number(checkbox.dataset.authorityId || 0);
            if (!roleId || !authorityId) return;

            checkbox.disabled = true;
            hideAlert(authoritiesAlert);

            try {
                if (checkbox.checked) {
                    const response = await fetch("/api/role-authorities", {
                        method: "POST",
                        credentials: "same-origin",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ role_id: roleId, authority_id: authorityId }),
                    });
                    const data = await response.json().catch(() => ({}));
                    if (!response.ok) {
                        checkbox.checked = false;
                        showAlert(authoritiesAlert, data.error || "Failed to assign authority.", "danger");
                        return;
                    }
                    roleAuthorityIds.set(authorityId, Number(data.roleAuthority?.id));
                } else {
                    const mappingId = roleAuthorityIds.get(authorityId);
                    if (!mappingId) return;
                    const response = await fetch(`/api/role-authorities/${mappingId}`, {
                        method: "DELETE",
                        credentials: "same-origin",
                    });
                    if (!response.ok && response.status !== 204) {
                        checkbox.checked = true;
                        const data = await response.json().catch(() => ({}));
                        showAlert(authoritiesAlert, data.error || "Failed to remove authority.", "danger");
                        return;
                    }
                    roleAuthorityIds.delete(authorityId);
                }
            } catch (error) {
                console.error(error);
                checkbox.checked = !checkbox.checked;
                showAlert(authoritiesAlert, "Failed to update role authority.", "danger");
            } finally {
                checkbox.disabled = false;
            }
        });
    }

    form?.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideAlert(formAlert);

        const id = form.elements.namedItem("id").value
            ? Number(form.elements.namedItem("id").value)
            : null;
        const title = form.elements.namedItem("title").value.trim().toUpperCase();
        const active = Boolean(form.elements.namedItem("active").checked);

        if (!title) {
            showAlert(formAlert, "Role title is required.", "danger");
            return;
        }

        const submitButton = document.getElementById("role-submit-btn");
        if (submitButton) submitButton.disabled = true;

        try {
            const response = await fetch(id ? `/api/roles/${id}` : "/api/roles", {
                method: id ? "PATCH" : "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title, active }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showAlert(formAlert, data.error || "Failed to save role.", "danger");
                return;
            }
            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert(formAlert, "Failed to save role.", "danger");
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    });
})();
