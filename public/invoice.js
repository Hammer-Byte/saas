(() => {
    const invoiceForm = document.getElementById("invoice-detail-form");
    const invoiceAlert = document.getElementById("invoice-alert");
    const editInvoiceBtn = document.getElementById("edit-invoice-btn");
    const saveInvoiceBtn = document.getElementById("save-invoice-btn");
    const cancelEditInvoiceBtn = document.getElementById("cancel-edit-invoice-btn");
    const deleteInvoiceBtn = document.getElementById("delete-invoice-btn");
    const addServiceUsageBtn = document.getElementById("add-service-usage-btn");
    const itemForm = document.getElementById("invoice-item-form");
    const itemFormAlert = document.getElementById("invoice-item-form-alert");
    const itemModalLabel = document.getElementById("invoice-item-modal-label");
    const itemIdField = document.getElementById("invoice-item-id");
    const itemNameField = document.getElementById("invoice-item-name");
    const itemCostField = document.getElementById("invoice-item-cost");
    const itemQuantityField = document.getElementById("invoice-item-quantity");
    const openAddItemBtn = document.getElementById("open-add-invoice-item-btn");
    let dueDateSnapshot = "";

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

    function setDueDateEditing(enabled) {
        const dueDateField = invoiceForm?.elements.namedItem("due_date");
        if (dueDateField) dueDateField.disabled = !enabled;
        editInvoiceBtn?.classList.toggle("d-none", enabled);
        saveInvoiceBtn?.classList.toggle("d-none", !enabled);
        cancelEditInvoiceBtn?.classList.toggle("d-none", !enabled);
        if (enabled) dueDateField?.focus();
    }

    editInvoiceBtn?.addEventListener("click", () => {
        hideAlert(invoiceAlert);
        dueDateSnapshot = invoiceForm?.elements.namedItem("due_date")?.value || "";
        setDueDateEditing(true);
    });

    cancelEditInvoiceBtn?.addEventListener("click", () => {
        hideAlert(invoiceAlert);
        const dueDateField = invoiceForm?.elements.namedItem("due_date");
        if (dueDateField) dueDateField.value = dueDateSnapshot;
        setDueDateEditing(false);
    });

    invoiceForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideAlert(invoiceAlert);

        const invoiceId = Number(invoiceForm.dataset.invoiceId);
        const due_date = invoiceForm.elements.namedItem("due_date")?.value || "";
        if (!due_date) {
            showAlert(invoiceAlert, "Due date is required.", "danger");
            return;
        }

        if (saveInvoiceBtn) saveInvoiceBtn.disabled = true;

        try {
            const response = await fetch("/api/customer-invoices", {
                method: "PATCH",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: invoiceId, due_date }),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                showAlert(invoiceAlert, data.error || "Failed to update invoice.", "danger");
                return;
            }

            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert(invoiceAlert, "Failed to update invoice.", "danger");
        } finally {
            if (saveInvoiceBtn) saveInvoiceBtn.disabled = false;
        }
    });

    deleteInvoiceBtn?.addEventListener("click", async () => {
        if (!window.confirm("Delete this invoice?")) {
            return;
        }

        const invoiceId = invoiceForm?.dataset.invoiceId;
        try {
            const response = await fetch(`/api/customer-invoices/${invoiceId}`, {
                method: "DELETE",
                credentials: "same-origin",
            });

            if (!response.ok && response.status !== 204) {
                const data = await response.json().catch(() => ({}));
                showAlert(invoiceAlert, data.error || "Failed to delete invoice.", "danger");
                return;
            }

            window.location.href = "/app/invoices";
        } catch (error) {
            console.error(error);
            showAlert(invoiceAlert, "Failed to delete invoice.", "danger");
        }
    });

    addServiceUsageBtn?.addEventListener("click", async () => {
        const invoiceId = invoiceForm?.dataset.invoiceId;
        if (!invoiceId) return;

        hideAlert(invoiceAlert);
        addServiceUsageBtn.disabled = true;

        try {
            const response = await fetch(`/api/customer-invoices/${invoiceId}/service-usage`, {
                method: "POST",
                credentials: "same-origin",
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                showAlert(invoiceAlert, data.error || "Failed to add service usage.", "danger");
                return;
            }

            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert(invoiceAlert, "Failed to add service usage.", "danger");
        } finally {
            addServiceUsageBtn.disabled = false;
        }
    });

    openAddItemBtn?.addEventListener("click", () => {
        hideAlert(itemFormAlert);
        if (itemModalLabel) itemModalLabel.textContent = "Add item";
        if (itemIdField) itemIdField.value = "";
        if (itemNameField) itemNameField.value = "";
        if (itemCostField) itemCostField.value = "0";
        if (itemQuantityField) itemQuantityField.value = "1";
    });

    document.querySelectorAll(".invoice-item-edit-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            hideAlert(itemFormAlert);
            if (itemModalLabel) itemModalLabel.textContent = "Edit item";
            if (itemIdField) itemIdField.value = btn.dataset.id || "";
            if (itemNameField) itemNameField.value = btn.dataset.item || "";
            if (itemCostField) itemCostField.value = btn.dataset.cost || "0";
            if (itemQuantityField) itemQuantityField.value = btn.dataset.quantity || "1";

            const modalEl = document.getElementById("invoice-item-modal");
            if (modalEl && window.bootstrap?.Modal) {
                window.bootstrap.Modal.getOrCreateInstance(modalEl).show();
            }
        });
    });

    document.querySelectorAll(".invoice-item-delete-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
            if (!window.confirm("Delete this item?")) {
                return;
            }

            const invoiceId = itemForm?.dataset.invoiceId;
            try {
                const response = await fetch(`/api/invoice-items/${btn.dataset.id}`, {
                    method: "DELETE",
                    credentials: "same-origin",
                });
                const data = await response.json().catch(() => ({}));

                if (!response.ok) {
                    showAlert(invoiceAlert, data.error || "Failed to delete item.", "danger");
                    return;
                }

                window.location.reload();
            } catch (error) {
                console.error(error);
                showAlert(invoiceAlert, "Failed to delete item.", "danger");
            }
        });
    });

    itemForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideAlert(itemFormAlert);

        const invoiceId = Number(itemForm.dataset.invoiceId);
        const itemId = itemIdField?.value || "";
        const payload = {
            item: itemNameField?.value?.trim() || "",
            cost: Number(itemCostField?.value || 0),
            quantity: Number(itemQuantityField?.value || 0),
        };

        if (!payload.item) {
            showAlert(itemFormAlert, "Item is required.", "danger");
            return;
        }

        if (payload.quantity <= 0) {
            showAlert(itemFormAlert, "Quantity must be greater than 0.", "danger");
            return;
        }

        const submitBtn = itemForm.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;

        try {
            const response = await fetch(
                itemId ? `/api/invoice-items/${itemId}` : "/api/invoice-items",
                {
                    method: itemId ? "PATCH" : "POST",
                    credentials: "same-origin",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(
                        itemId
                            ? payload
                            : { customer_invoice_id: invoiceId, ...payload },
                    ),
                },
            );
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                showAlert(itemFormAlert, data.error || "Failed to save item.", "danger");
                return;
            }

            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert(itemFormAlert, "Failed to save item.", "danger");
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    });
})();
