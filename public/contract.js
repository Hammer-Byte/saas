(() => {
    const detailForm = document.getElementById("contract-detail-form");
    const pageAlert = document.getElementById("contract-alert");
    const sendInviteButton = document.getElementById("send-contract-invite-btn");
    const unsignContractButton = document.getElementById("unsign-contract-btn");
    const breakContractForm = document.getElementById("break-contract-form");
    const breakContractFormAlert = document.getElementById("break-contract-form-alert");
    const transferUserButton = document.getElementById("transfer-contract-user-btn");
    const transferUserForm = document.getElementById("transfer-user-form");
    const transferUserFormAlert = document.getElementById("transfer-user-form-alert");
    const transferUserModalElement = document.getElementById("transfer-user-modal");
    const transferLoginMethodSelect = document.getElementById("transfer-user-login-method");
    const transferPasswordWrap = document.getElementById("transfer-user-password-wrap");
    const transferPasswordInput = document.getElementById("transfer-user-password");
    const clauseForm = document.getElementById("clause-form");
    const clauseFormAlert = document.getElementById("clause-form-alert");
    const clauseModalLabel = document.getElementById("clause-modal-label");
    const clauseIdField = document.getElementById("clause-id");
    const clauseTitleField = document.getElementById("clause-title");
    const clauseModalElement = document.getElementById("clause-modal");
    const subclauseForm = document.getElementById("subclause-form");
    const subclauseFormAlert = document.getElementById("subclause-form-alert");
    const subclauseModalLabel = document.getElementById("subclause-modal-label");
    const subclauseIdField = document.getElementById("subclause-id");
    const subclauseClauseIdField = document.getElementById("subclause-clause-id");
    const subclauseBodyField = document.getElementById("subclause-body");
    const subclauseModalElement = document.getElementById("subclause-modal");

    const signableTillField = detailForm?.elements.namedItem("signable_till");
    if (signableTillField?.dataset.date) {
        signableTillField.value = getReadableDate("DD/MM/YYYY HH:mm", signableTillField.dataset.date);
    }

    function syncTransferPasswordField() {
        const method = transferLoginMethodSelect?.value || "otp";
        const needsPassword = method === "password" || method === "both";
        transferPasswordWrap?.classList.toggle("d-none", method === "otp");
        if (transferPasswordInput) {
            transferPasswordInput.required = needsPassword;
            if (method === "otp") {
                transferPasswordInput.value = "";
            }
        }
    }

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

    async function moveViewIndex({ endpoint, button }) {
        if (button.disabled) {
            return;
        }

        button.disabled = true;

        try {
            const response = await fetch(endpoint, {
                method: "PATCH",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ direction: button.dataset.direction }),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                showAlert(pageAlert, data.error || "Failed to reorder.", "danger");
                button.disabled = false;
                return;
            }

            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert(pageAlert, "Failed to reorder.", "danger");
            button.disabled = false;
        }
    }

    document.querySelectorAll(".clause-move-btn").forEach((button) => {
        button.addEventListener("click", () => {
            moveViewIndex({
                endpoint: `/api/contract-clauses/${button.dataset.id}/view-index`,
                button,
            });
        });
    });

    document.querySelectorAll(".subclause-move-btn").forEach((button) => {
        button.addEventListener("click", () => {
            moveViewIndex({
                endpoint: `/api/clause-subclauses/${button.dataset.id}/view-index`,
                button,
            });
        });
    });

    detailForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideAlert(pageAlert);

        const contractId = Number(detailForm.dataset.contractId);
        const company = detailForm.elements.namedItem("company")?.value?.trim() || "";
        const full_name = detailForm.elements.namedItem("full_name")?.value?.trim() || "";
        const email = detailForm.elements.namedItem("email")?.value?.trim() || "";
        const phone = detailForm.elements.namedItem("phone")?.value?.trim() || "";
        const address = detailForm.elements.namedItem("address")?.value?.trim() || "";
        const active = detailForm.elements.namedItem("active")?.checked === true;
        const required_attachments = Array.from(
            document.querySelectorAll(".required-attachment-checkbox:checked"),
        ).map((checkbox) => Number(checkbox.value));
        const signable_till = getWritableDate(
            "YYYY-MM-DD HH:mm:ss",
            detailForm.elements.namedItem("signable_till")?.value,
        );

        if (!full_name || !email || !phone || !address || !signable_till) {
            showAlert(pageAlert, "Full name, email, phone, address, and signable till are required.", "danger");
            return;
        }

        if (!required_attachments.length) {
            showAlert(pageAlert, "Select at least one required attachment.", "danger");
            return;
        }

        const submitButton = detailForm.querySelector('button[type="submit"]');
        if (submitButton) submitButton.disabled = true;

        try {
            const response = await fetch(`/api/contracts/${contractId}`, {
                method: "PATCH",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    company: company || null,
                    full_name,
                    email,
                    phone,
                    address,
                    active,
                    signable_till,
                    required_attachments,
                }),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                showAlert(pageAlert, data.error || "Failed to update contract.", "danger");
                return;
            }

            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert(pageAlert, "Failed to update contract.", "danger");
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    });

    sendInviteButton?.addEventListener("click", async () => {
        const contractId = detailForm?.dataset.contractId;
        if (!contractId || sendInviteButton.disabled) return;

        sendInviteButton.disabled = true;
        hideAlert(pageAlert);

        try {
            const response = await fetch(`/api/contracts/${contractId}/invite`, {
                method: "POST",
                credentials: "same-origin",
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                showAlert(pageAlert, data.error || "Failed to send invite.", "danger");
                return;
            }

            showAlert(pageAlert, data.message || "Invite sent.", "success");
        } catch (error) {
            console.error(error);
            showAlert(pageAlert, "Failed to send invite.", "danger");
        } finally {
            sendInviteButton.disabled = false;
        }
    });

    unsignContractButton?.addEventListener("click", async () => {
        const contractId = detailForm?.dataset.contractId;
        if (!contractId) return;

        const confirmed = await showConfirm({
            title: "Unsign contract?",
            description: "This will remove all attached required attachments.",
            choices: [
                { label: "Cancel", variant: "secondary", value: false },
                { label: "Unsign", variant: "danger", value: true },
            ],
        });
        if (!confirmed) {
            return;
        }

        unsignContractButton.disabled = true;
        hideAlert(pageAlert);

        try {
            const response = await fetch(`/api/contracts/${contractId}/signed`, {
                method: "DELETE",
                credentials: "same-origin",
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                showAlert(pageAlert, data.error || "Failed to unsign contract.", "danger");
                return;
            }

            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert(pageAlert, "Failed to unsign contract.", "danger");
        } finally {
            unsignContractButton.disabled = false;
        }
    });

    breakContractForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideAlert(breakContractFormAlert);

        const contractId = Number(breakContractForm.dataset.contractId);
        const break_date = getWritableDate(
            "YYYY-MM-DD HH:mm:ss",
            breakContractForm.elements.namedItem("break_date")?.value,
        );
        const broken_by = breakContractForm.elements.namedItem("broken_by")?.value || "";

        if (!break_date || !broken_by) {
            showAlert(breakContractFormAlert, "Break date and broken by are required.", "danger");
            return;
        }

        const confirmed = await showConfirm({
            title: "Break this contract?",
            description: "The party will be notified immediately and any matching user login will be blocked.",
            choices: [
                { label: "Cancel", variant: "secondary", value: false },
                { label: "Break contract", variant: "danger", value: true },
            ],
        });
        if (!confirmed) {
            return;
        }

        const submitButton = document.getElementById("break-contract-submit-btn");
        if (submitButton) submitButton.disabled = true;

        try {
            const response = await fetch(`/api/contracts/${contractId}/break`, {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ break_date, broken_by }),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                showAlert(breakContractFormAlert, data.error || "Failed to break contract.", "danger");
                return;
            }

            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert(breakContractFormAlert, "Failed to break contract.", "danger");
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    });

    transferUserButton?.addEventListener("click", () => {
        if (transferUserButton.disabled) {
            return;
        }
        hideAlert(transferUserFormAlert);
        if (transferUserForm) {
            transferUserForm.reset();
            const fullNameInput = transferUserForm.elements.namedItem("full_name");
            const emailInput = transferUserForm.elements.namedItem("email");
            if (fullNameInput) {
                fullNameInput.value = fullNameInput.defaultValue || fullNameInput.value;
            }
            if (emailInput) {
                emailInput.value = emailInput.defaultValue || emailInput.value;
            }
            if (transferLoginMethodSelect) {
                transferLoginMethodSelect.value = "otp";
            }
            document.querySelectorAll(".transfer-user-role-checkbox").forEach((checkbox) => {
                checkbox.checked = false;
            });
            syncTransferPasswordField();
        }
        const modal = window.bootstrap?.Modal?.getOrCreateInstance(transferUserModalElement);
        modal?.show();
    });

    transferLoginMethodSelect?.addEventListener("change", syncTransferPasswordField);

    transferUserForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideAlert(transferUserFormAlert);

        const contractId = Number(transferUserForm.dataset.contractId);
        const loginMethod = transferLoginMethodSelect?.value || "otp";
        const password = transferPasswordInput?.value || "";
        const hourlyRateRaw = (transferUserForm.elements.namedItem("hourly_rate")?.value || "").trim();
        const payload = {
            login_method: loginMethod,
            personal_email: (transferUserForm.elements.namedItem("personal_email")?.value || "").trim() || null,
            hourly_rate: null,
            role_ids: Array.from(document.querySelectorAll(".transfer-user-role-checkbox:checked")).map(
                (checkbox) => Number(checkbox.value),
            ),
        };

        if (hourlyRateRaw !== "") {
            const hourlyRate = Number(hourlyRateRaw);
            if (!Number.isFinite(hourlyRate) || hourlyRate < 0) {
                showAlert(transferUserFormAlert, "Enter a valid hourly rate.", "danger");
                return;
            }
            payload.hourly_rate = hourlyRate;
        }

        if ((loginMethod === "password" || loginMethod === "both") && password.length < 8) {
            showAlert(transferUserFormAlert, "Password must be at least 8 characters.", "danger");
            return;
        }

        if (password) {
            payload.password = password;
        }

        const submitButton = document.getElementById("transfer-user-submit-btn");
        if (submitButton) submitButton.disabled = true;

        try {
            const response = await fetch(`/api/contracts/${contractId}/transfer-to-user`, {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                showAlert(transferUserFormAlert, data.error || "Failed to create user.", "danger");
                return;
            }

            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert(transferUserFormAlert, "Failed to create user.", "danger");
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    });

    syncTransferPasswordField();

    document.querySelectorAll(".required-attachment-file").forEach((fileInput) => {
        fileInput.addEventListener("change", async () => {
            const requiredAttachmentId = Number(fileInput.dataset.requiredAttachmentId);
            const uploadedFile = fileInput.files?.[0];
            if (!requiredAttachmentId || !uploadedFile) {
                return;
            }

            hideAlert(pageAlert);
            const sizeCheck = window.validateUploadFiles?.(uploadedFile);
            if (sizeCheck && !sizeCheck.ok) {
                showAlert(pageAlert, sizeCheck.error, "danger");
                fileInput.value = "";
                return;
            }

            fileInput.disabled = true;

            try {
                const formData = new FormData();
                formData.append("file", uploadedFile);

                const uploadResponse = await fetch("/api/contracts/media", {
                    method: "POST",
                    body: formData,
                });
                const uploadData = await uploadResponse.json().catch(() => ({}));
                if (!uploadResponse.ok || !uploadData.id) {
                    showAlert(pageAlert, uploadData.error || "Failed to upload attachment.", "danger");
                    return;
                }

                const attachResponse = await fetch(
                    `/api/contracts/required-attachments/${requiredAttachmentId}`,
                    {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ media_id: uploadData.id }),
                    },
                );
                const attachData = await attachResponse.json().catch(() => ({}));
                if (!attachResponse.ok) {
                    showAlert(pageAlert, attachData.error || "Failed to save attachment media.", "danger");
                    return;
                }

                window.location.reload();
            } catch (error) {
                console.error(error);
                showAlert(pageAlert, "Failed to save attachment media.", "danger");
            } finally {
                fileInput.disabled = false;
            }
        });
    });

    document.getElementById("open-add-clause-btn")?.addEventListener("click", () => {
        hideAlert(clauseFormAlert);
        if (clauseModalLabel) clauseModalLabel.textContent = "Add clause";
        if (clauseIdField) clauseIdField.value = "";
        if (clauseTitleField) clauseTitleField.value = "";
    });

    document.querySelectorAll(".clause-edit-btn").forEach((button) => {
        button.addEventListener("click", () => {
            hideAlert(clauseFormAlert);
            if (clauseModalLabel) clauseModalLabel.textContent = "Edit clause";
            if (clauseIdField) clauseIdField.value = button.dataset.id || "";
            if (clauseTitleField) clauseTitleField.value = button.dataset.title || "";
            bootstrap.Modal.getOrCreateInstance(clauseModalElement).show();
        });
    });

    document.querySelectorAll(".clause-delete-btn").forEach((button) => {
        button.addEventListener("click", async () => {
            const confirmed = await showConfirm({
                title: "Delete clause?",
                description: "This will also delete all subclauses under it. This cannot be undone.",
                choices: [
                    { label: "Cancel", variant: "secondary", value: false },
                    { label: "Delete", variant: "danger", value: true },
                ],
            });
            if (!confirmed) {
                return;
            }

            try {
                const response = await fetch(`/api/contract-clauses/${button.dataset.id}`, {
                    method: "DELETE",
                    credentials: "same-origin",
                });

                if (!response.ok && response.status !== 204) {
                    const data = await response.json().catch(() => ({}));
                    showAlert(pageAlert, data.error || "Failed to delete clause.", "danger");
                    return;
                }

                window.location.reload();
            } catch (error) {
                console.error(error);
                showAlert(pageAlert, "Failed to delete clause.", "danger");
            }
        });
    });

    clauseForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideAlert(clauseFormAlert);

        const title = clauseTitleField?.value?.trim() || "";
        const clauseId = clauseIdField?.value?.trim() || "";
        const contractId = Number(clauseForm.dataset.contractId);

        if (!title) {
            showAlert(clauseFormAlert, "Title is required.", "danger");
            return;
        }

        const submitButton = clauseForm.querySelector('button[type="submit"]');
        if (submitButton) submitButton.disabled = true;

        try {
            const response = await fetch(
                clauseId ? `/api/contract-clauses/${clauseId}` : "/api/contract-clauses",
                {
                    method: clauseId ? "PATCH" : "POST",
                    credentials: "same-origin",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(
                        clauseId
                            ? { title }
                            : { contract_id: contractId, title },
                    ),
                },
            );
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                showAlert(clauseFormAlert, data.error || "Failed to save clause.", "danger");
                return;
            }

            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert(clauseFormAlert, "Failed to save clause.", "danger");
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    });

    document.querySelectorAll(".add-subclause-btn").forEach((button) => {
        button.addEventListener("click", () => {
            hideAlert(subclauseFormAlert);
            if (subclauseModalLabel) subclauseModalLabel.textContent = "Add subclause";
            if (subclauseIdField) subclauseIdField.value = "";
            if (subclauseClauseIdField) subclauseClauseIdField.value = button.dataset.clauseId || "";
            if (subclauseBodyField) subclauseBodyField.value = "";
            bootstrap.Modal.getOrCreateInstance(subclauseModalElement).show();
        });
    });

    document.querySelectorAll(".subclause-edit-btn").forEach((button) => {
        button.addEventListener("click", () => {
            hideAlert(subclauseFormAlert);
            if (subclauseModalLabel) subclauseModalLabel.textContent = "Edit subclause";
            if (subclauseIdField) subclauseIdField.value = button.dataset.id || "";
            if (subclauseClauseIdField) subclauseClauseIdField.value = "";
            if (subclauseBodyField) {
                try {
                    subclauseBodyField.value = decodeURIComponent(button.dataset.body || "");
                } catch (error) {
                    subclauseBodyField.value = button.dataset.body || "";
                }
            }
            bootstrap.Modal.getOrCreateInstance(subclauseModalElement).show();
        });
    });

    document.querySelectorAll(".subclause-delete-btn").forEach((button) => {
        button.addEventListener("click", async () => {
            const confirmed = await showConfirm({
                title: "Delete subclause?",
                description: "This cannot be undone.",
                choices: [
                    { label: "Cancel", variant: "secondary", value: false },
                    { label: "Delete", variant: "danger", value: true },
                ],
            });
            if (!confirmed) {
                return;
            }

            try {
                const response = await fetch(`/api/clause-subclauses/${button.dataset.id}`, {
                    method: "DELETE",
                    credentials: "same-origin",
                });

                if (!response.ok && response.status !== 204) {
                    const data = await response.json().catch(() => ({}));
                    showAlert(pageAlert, data.error || "Failed to delete subclause.", "danger");
                    return;
                }

                window.location.reload();
            } catch (error) {
                console.error(error);
                showAlert(pageAlert, "Failed to delete subclause.", "danger");
            }
        });
    });

    subclauseForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideAlert(subclauseFormAlert);

        const body = subclauseBodyField?.value?.trim() || "";
        const subclauseId = subclauseIdField?.value?.trim() || "";
        const clauseId = Number(subclauseClauseIdField?.value || 0);

        if (!body) {
            showAlert(subclauseFormAlert, "Body is required.", "danger");
            return;
        }

        if (!subclauseId && !clauseId) {
            showAlert(subclauseFormAlert, "Clause is required.", "danger");
            return;
        }

        const submitButton = subclauseForm.querySelector('button[type="submit"]');
        if (submitButton) submitButton.disabled = true;

        try {
            const response = await fetch(
                subclauseId ? `/api/clause-subclauses/${subclauseId}` : "/api/clause-subclauses",
                {
                    method: subclauseId ? "PATCH" : "POST",
                    credentials: "same-origin",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(
                        subclauseId ? { body } : { clause_id: clauseId, body },
                    ),
                },
            );
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                showAlert(subclauseFormAlert, data.error || "Failed to save subclause.", "danger");
                return;
            }

            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert(subclauseFormAlert, "Failed to save subclause.", "danger");
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    });
})();
