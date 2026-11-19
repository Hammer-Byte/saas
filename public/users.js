(() => {
    const form = document.getElementById("user-form");
    const formAlert = document.getElementById("user-form-alert");
    const pageAlert = document.getElementById("users-alert");
    const modalElement = document.getElementById("user-modal");
    const modalLabel = document.getElementById("user-modal-label");
    const openAddButton = document.getElementById("open-add-user-btn");
    const tableBody = document.getElementById("users-tbody");
    const rolesSection = document.getElementById("user-roles-section");
    const loginMethodSelect = document.getElementById("user-login-method");
    const passwordWrap = document.getElementById("user-password-wrap");
    const passwordInput = document.getElementById("user-password");
    const passwordHelp = document.getElementById("user-password-help");
    const passwordToggleButton = document.getElementById("user-password-toggle-btn");
    const passwordEyeOpen = document.getElementById("user-password-eye-open");
    const passwordEyeClosed = document.getElementById("user-password-eye-closed");
    const loginActiveWrap = document.getElementById("user-login-active-wrap");
    const loginActiveInput = document.getElementById("user-login-active");
    const roleCheckboxes = Array.from(document.querySelectorAll(".user-role-checkbox"));

    if (!form || !tableBody) {
        return;
    }

    const idInput = form.elements.namedItem("id");
    const fullNameInput = form.elements.namedItem("full_name");
    const emailInput = form.elements.namedItem("email");
    const phoneInput = form.elements.namedItem("phone");
    const personalEmailInput = form.elements.namedItem("personal_email");
    const hourlyRateInput = form.elements.namedItem("hourly_rate");
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

    function setLoginActiveSectionVisible(visible) {
        loginActiveWrap?.classList.toggle("d-none", !visible);
    }

    function resetPasswordVisibility() {
        if (!passwordInput) return;
        passwordInput.type = "password";
        passwordEyeOpen?.classList.remove("d-none");
        passwordEyeClosed?.classList.add("d-none");
        if (passwordToggleButton) {
            passwordToggleButton.title = "Show password";
            passwordToggleButton.setAttribute("aria-label", "Show password");
            passwordToggleButton.setAttribute("aria-pressed", "false");
        }
    }

    function syncPasswordField() {
        const method = loginMethodSelect?.value || "otp";
        const needsPassword = method === "password" || method === "both";
        const isEdit = Boolean(idInput.value);
        passwordWrap?.classList.toggle("d-none", method === "otp");
        if (passwordInput) {
            passwordInput.required = needsPassword && !isEdit;
            if (method === "otp") {
                passwordInput.value = "";
                resetPasswordVisibility();
            }
        }
        if (passwordHelp) {
            passwordHelp.textContent = isEdit
                ? "Required for password login methods. Leave blank to keep the current password."
                : "Required for password or OTP-or-password login.";
        }
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
        if (loginMethodSelect) loginMethodSelect.value = "otp";
        if (loginActiveInput) loginActiveInput.checked = true;
        clearRoleCheckboxes();
        setRolesSectionVisible(false);
        setLoginActiveSectionVisible(false);
        hideAlert(formAlert);
        resetPasswordVisibility();
        syncPasswordField();
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
        if (phoneInput) phoneInput.value = row.dataset.phone || "";
        if (personalEmailInput) personalEmailInput.value = row.dataset.personalEmail || "";
        if (hourlyRateInput) hourlyRateInput.value = row.dataset.hourlyRate || "";
        if (loginMethodSelect) loginMethodSelect.value = row.dataset.loginMethod || "otp";
        if (loginActiveInput) loginActiveInput.checked = row.dataset.loginActive === "1";
        if (passwordInput) passwordInput.value = "";
        setLoginActiveSectionVisible(true);
        resetPasswordVisibility();
        syncPasswordField();

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
    loginMethodSelect?.addEventListener("change", syncPasswordField);

    passwordToggleButton?.addEventListener("click", () => {
        if (!passwordInput) return;
        const showing = passwordInput.type === "text";
        passwordInput.type = showing ? "password" : "text";
        passwordEyeOpen?.classList.toggle("d-none", !showing);
        passwordEyeClosed?.classList.toggle("d-none", showing);
        passwordToggleButton.title = showing ? "Show password" : "Hide password";
        passwordToggleButton.setAttribute("aria-label", showing ? "Show password" : "Hide password");
        passwordToggleButton.setAttribute("aria-pressed", showing ? "false" : "true");
    });

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
        const loginMethod = loginMethodSelect?.value || "otp";
        const password = passwordInput?.value || "";
        const phone = (phoneInput?.value || "").trim();
        const personalEmail = (personalEmailInput?.value || "").trim();
        const hourlyRateRaw = (hourlyRateInput?.value || "").trim();
        const payload = {
            full_name: fullNameInput.value.trim(),
            email: emailInput.value.trim().toLowerCase(),
            phone,
            personal_email: personalEmail.toLowerCase(),
            login_method: loginMethod,
            hourly_rate: null,
        };

        if (!payload.full_name || !payload.email) {
            showAlert(formAlert, "Please fill in full name and professional email.", "danger");
            return;
        }

        if (!payload.email.endsWith("@hammerbyte.co.in")) {
            showAlert(formAlert, "Professional email must be @hammerbyte.co.in.", "danger");
            return;
        }

        if (!personalEmail) {
            showAlert(formAlert, "Personal email is required.", "danger");
            return;
        }

        if (!phone) {
            showAlert(formAlert, "Phone is required.", "danger");
            return;
        }

        if (!/^\+?[0-9]{10,13}$/.test(phone)) {
            showAlert(formAlert, "Enter a valid phone number.", "danger");
            return;
        }

        if (hourlyRateRaw !== "") {
            const hourlyRate = Number(hourlyRateRaw);
            if (!Number.isFinite(hourlyRate) || hourlyRate < 0) {
                showAlert(formAlert, "Enter a valid hourly rate.", "danger");
                return;
            }
            payload.hourly_rate = hourlyRate;
        }

        if ((loginMethod === "password" || loginMethod === "both") && !id && password.length < 8) {
            showAlert(formAlert, "Password must be at least 8 characters.", "danger");
            return;
        }

        if (password) {
            payload.password = password;
        }

        if (id) {
            payload.login_active = loginActiveInput?.checked === true;
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

    syncPasswordField();

    const sortableHeaders = Array.from(
        document.querySelectorAll("#users-table thead th.users-sortable"),
    );
    let sortState = { key: "loginActive", direction: "desc" };

    function sortValue(row, key) {
        if (key === "loginActive") {
            return Number(row.dataset.loginActive || 0);
        }
        if (key === "hourlyRate") {
            const rate = row.dataset.hourlyRate;
            return rate === "" || rate == null ? Number.NEGATIVE_INFINITY : Number(rate);
        }
        if (key === "lastLogin") {
            return String(row.dataset.lastLogin || "");
        }
        return String(row.dataset[key] || "").toLowerCase();
    }

    function compareRows(left, right, key, direction) {
        const leftValue = sortValue(left, key);
        const rightValue = sortValue(right, key);
        let result = 0;
        if (typeof leftValue === "number" && typeof rightValue === "number") {
            result = leftValue - rightValue;
        } else {
            result = String(leftValue).localeCompare(String(rightValue), undefined, {
                numeric: true,
                sensitivity: "base",
            });
        }
        return direction === "asc" ? result : -result;
    }

    function applySort() {
        if (!tableBody || !sortState.key) return;
        const rows = Array.from(tableBody.querySelectorAll("tr[data-id]"));
        rows.sort((left, right) => compareRows(left, right, sortState.key, sortState.direction));
        for (const row of rows) {
            tableBody.appendChild(row);
        }
        for (const header of sortableHeaders) {
            if (header.dataset.sortKey === sortState.key) {
                header.setAttribute(
                    "aria-sort",
                    sortState.direction === "asc" ? "ascending" : "descending",
                );
            } else {
                header.setAttribute("aria-sort", "none");
            }
        }
    }

    for (const header of sortableHeaders) {
        header.addEventListener("click", () => {
            const key = header.dataset.sortKey;
            if (!key) return;
            if (sortState.key === key) {
                sortState.direction = sortState.direction === "asc" ? "desc" : "asc";
            } else {
                sortState = { key, direction: key === "hourlyRate" || key === "loginActive" || key === "lastLogin" ? "desc" : "asc" };
            }
            applySort();
        });
    }
})();
