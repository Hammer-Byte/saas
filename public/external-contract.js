(() => {
    const detailForm = document.getElementById("external-contract-detail-form");
    const pageAlert = document.getElementById("external-contract-alert");
    const sendInviteButton = document.getElementById("send-contract-invite-btn");
    const unsignContractButton = document.getElementById("unsign-contract-btn");
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
        signableTillField.value = getReadableDate("YYYY-MM-DDTHH:mm", signableTillField.dataset.date);
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
        const signable_till = getWritableDate(
            "YYYY-MM-DD HH:mm:ss",
            detailForm.elements.namedItem("signable_till")?.value,
        );

        if (!company || !full_name || !email || !phone || !address || !signable_till) {
            showAlert(pageAlert, "All fields are required.", "danger");
            return;
        }

        const submitButton = detailForm.querySelector('button[type="submit"]');
        if (submitButton) submitButton.disabled = true;

        try {
            const response = await fetch(`/api/external-contracts/${contractId}`, {
                method: "PATCH",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    company,
                    full_name,
                    email,
                    phone,
                    address,
                    active,
                    signable_till,
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
            const response = await fetch(`/api/external-contracts/${contractId}/invite`, {
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
            description: "This will remove the signature, selfie, and identity files.",
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
            const response = await fetch(`/api/external-contracts/${contractId}/signed`, {
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
                            : { external_contract_id: contractId, title },
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
