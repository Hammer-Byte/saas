(() => {
    const invoiceForm = document.getElementById("invoice-detail-form");
    const invoiceAlert = document.getElementById("invoice-alert");
    const editInvoiceButton = document.getElementById("edit-invoice-btn");
    const saveInvoiceButton = document.getElementById("save-invoice-btn");
    const cancelEditInvoiceButton = document.getElementById("cancel-edit-invoice-btn");
    const deleteInvoiceButton = document.getElementById("delete-invoice-btn");
    const addServiceUsageButton = document.getElementById("add-service-usage-btn");
    const sendInvoiceReminderButton = document.getElementById("send-invoice-reminder-btn");
    const itemForm = document.getElementById("invoice-item-form");
    const itemFormAlert = document.getElementById("invoice-item-form-alert");
    const itemModalLabel = document.getElementById("invoice-item-modal-label");
    const itemIdField = document.getElementById("invoice-item-id");
    const itemNameField = document.getElementById("invoice-item-name");
    const itemCostField = document.getElementById("invoice-item-cost");
    const itemQuantityField = document.getElementById("invoice-item-quantity");
    const openAddItemButton = document.getElementById("open-add-invoice-item-btn");
    const paymentForm = document.getElementById("invoice-payment-form");
    const paymentFormAlert = document.getElementById("invoice-payment-form-alert");
    const paymentModalLabel = document.getElementById("invoice-payment-modal-label");
    const paymentIdField = document.getElementById("invoice-payment-id");
    const paymentPaidField = document.getElementById("invoice-payment-paid");
    const paymentAmountField = document.getElementById("invoice-payment-amount");
    const paymentGstField = document.getElementById("invoice-payment-gst");
    const paymentNoteField = document.getElementById("invoice-payment-note");
    const openAddPaymentButton = document.getElementById("open-add-invoice-payment-btn");
    let dueDateSnapshot = "";

    const dueDateField = invoiceForm?.elements.namedItem("due_date");
    if (dueDateField?.dataset.date) {
        dueDateField.value = getReadableDate("YYYY-MM-DD", dueDateField.dataset.date);
    }

    const createdOnField = document.getElementById("invoice-created-on");
    if (createdOnField?.dataset.date) {
        createdOnField.value =
            getReadableDate("YYYY-MM-DD HH:mm:ss", createdOnField.dataset.date) || "-";
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

    function setDueDateEditing(enabled) {
        const dueDateField = invoiceForm?.elements.namedItem("due_date");
        if (dueDateField) dueDateField.disabled = !enabled;
        editInvoiceButton?.classList.toggle("d-none", enabled);
        saveInvoiceButton?.classList.toggle("d-none", !enabled);
        cancelEditInvoiceButton?.classList.toggle("d-none", !enabled);
        if (enabled) dueDateField?.focus();
    }

    editInvoiceButton?.addEventListener("click", () => {
        hideAlert(invoiceAlert);
        dueDateSnapshot = invoiceForm?.elements.namedItem("due_date")?.value || "";
        setDueDateEditing(true);
    });

    cancelEditInvoiceButton?.addEventListener("click", () => {
        hideAlert(invoiceAlert);
        const dueDateField = invoiceForm?.elements.namedItem("due_date");
        if (dueDateField) dueDateField.value = dueDateSnapshot;
        setDueDateEditing(false);
    });

    invoiceForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideAlert(invoiceAlert);

        const invoiceId = Number(invoiceForm.dataset.invoiceId);
        const due_date = getWritableDate(
            "YYYY-MM-DD",
            invoiceForm.elements.namedItem("due_date")?.value,
        );
        if (!due_date) {
            showAlert(invoiceAlert, "Due date is required.", "danger");
            return;
        }

        if (saveInvoiceButton) saveInvoiceButton.disabled = true;

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
            if (saveInvoiceButton) saveInvoiceButton.disabled = false;
        }
    });

    deleteInvoiceButton?.addEventListener("click", async () => {
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

    sendInvoiceReminderButton?.addEventListener("click", async () => {
        const invoiceId = invoiceForm?.dataset.invoiceId;
        if (!invoiceId || sendInvoiceReminderButton.disabled) return;

        hideAlert(invoiceAlert);
        sendInvoiceReminderButton.disabled = true;

        try {
            const response = await fetch(`/api/customer-invoices/${invoiceId}/reminder`, {
                method: "POST",
                credentials: "same-origin",
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                showAlert(invoiceAlert, data.error || "Failed to send reminder.", "danger");
                return;
            }

            showAlert(invoiceAlert, data.message || "Reminder sent.", "success");
        } catch (error) {
            console.error(error);
            showAlert(invoiceAlert, "Failed to send reminder.", "danger");
        } finally {
            sendInvoiceReminderButton.disabled = false;
        }
    });

    addServiceUsageButton?.addEventListener("click", async () => {
        const invoiceId = invoiceForm?.dataset.invoiceId;
        if (!invoiceId) return;

        hideAlert(invoiceAlert);
        addServiceUsageButton.disabled = true;

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
            addServiceUsageButton.disabled = false;
        }
    });

    openAddItemButton?.addEventListener("click", () => {
        hideAlert(itemFormAlert);
        if (itemModalLabel) itemModalLabel.textContent = "Add item";
        if (itemIdField) itemIdField.value = "";
        if (itemNameField) itemNameField.value = "";
        if (itemCostField) itemCostField.value = "0";
        if (itemQuantityField) itemQuantityField.value = "1";
    });

    document.querySelectorAll(".invoice-item-edit-btn").forEach((button) => {
        button.addEventListener("click", () => {
            hideAlert(itemFormAlert);
            if (itemModalLabel) itemModalLabel.textContent = "Edit item";
            if (itemIdField) itemIdField.value = button.dataset.id || "";
            if (itemNameField) itemNameField.value = button.dataset.item || "";
            if (itemCostField) itemCostField.value = button.dataset.cost || "0";
            if (itemQuantityField) itemQuantityField.value = button.dataset.quantity || "1";

            const modalElement = document.getElementById("invoice-item-modal");
            if (modalElement && window.bootstrap?.Modal) {
                window.bootstrap.Modal.getOrCreateInstance(modalElement).show();
            }
        });
    });

    document.querySelectorAll(".invoice-item-delete-btn").forEach((button) => {
        button.addEventListener("click", async () => {
            if (!window.confirm("Delete this item?")) {
                return;
            }

            const invoiceId = itemForm?.dataset.invoiceId;
            try {
                const response = await fetch(`/api/invoice-items/${button.dataset.id}`, {
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

        const submitButton = itemForm.querySelector('button[type="submit"]');
        if (submitButton) submitButton.disabled = true;

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
            if (submitButton) submitButton.disabled = false;
        }
    });

    function roundMoney(value) {
        return Math.round(Number(value || 0) * 100) / 100;
    }

    function splitPaid(paid) {
        const amount = roundMoney(paid / 1.18);
        const gst = roundMoney(amount * 0.18);
        return { amount, gst };
    }

    function updatePaymentSplit() {
        const { amount, gst } = splitPaid(paymentPaidField?.value);
        if (paymentAmountField) paymentAmountField.value = amount.toFixed(2);
        if (paymentGstField) paymentGstField.value = gst.toFixed(2);
    }

    paymentPaidField?.addEventListener("input", updatePaymentSplit);

    openAddPaymentButton?.addEventListener("click", () => {
        hideAlert(paymentFormAlert);
        if (paymentModalLabel) paymentModalLabel.textContent = "Add payment";
        if (paymentIdField) paymentIdField.value = "";
        if (paymentPaidField) paymentPaidField.value = "0";
        if (paymentNoteField) paymentNoteField.value = "";
        updatePaymentSplit();
    });

    document.querySelectorAll(".invoice-payment-edit-btn").forEach((button) => {
        button.addEventListener("click", () => {
            hideAlert(paymentFormAlert);
            if (paymentModalLabel) paymentModalLabel.textContent = "Edit payment";
            if (paymentIdField) paymentIdField.value = button.dataset.id || "";
            if (paymentPaidField) {
                paymentPaidField.value = roundMoney(
                    Number(button.dataset.amount || 0) + Number(button.dataset.gst || 0),
                );
            }
            if (paymentNoteField) paymentNoteField.value = button.dataset.note || "";
            updatePaymentSplit();

            const modalElement = document.getElementById("invoice-payment-modal");
            if (modalElement && window.bootstrap?.Modal) {
                window.bootstrap.Modal.getOrCreateInstance(modalElement).show();
            }
        });
    });

    document.querySelectorAll(".invoice-payment-delete-btn").forEach((button) => {
        button.addEventListener("click", async () => {
            if (!window.confirm("Delete this payment?")) {
                return;
            }

            try {
                const response = await fetch(`/api/invoice-payments/${button.dataset.id}`, {
                    method: "DELETE",
                    credentials: "same-origin",
                });

                if (!response.ok && response.status !== 204) {
                    const data = await response.json().catch(() => ({}));
                    showAlert(invoiceAlert, data.error || "Failed to delete payment.", "danger");
                    return;
                }

                window.location.reload();
            } catch (error) {
                console.error(error);
                showAlert(invoiceAlert, "Failed to delete payment.", "danger");
            }
        });
    });

    paymentForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideAlert(paymentFormAlert);

        const invoiceId = Number(paymentForm.dataset.invoiceId);
        const paymentId = paymentIdField?.value || "";
        const paid = Number(paymentPaidField?.value || 0);
        const { amount } = splitPaid(paid);
        const note = paymentNoteField?.value?.trim() || "";

        if (paid < 0) {
            showAlert(paymentFormAlert, "Paid must be 0 or more.", "danger");
            return;
        }

        const payload = { amount };
        if (note) payload.note = note;

        const submitButton = paymentForm.querySelector('button[type="submit"]');
        if (submitButton) submitButton.disabled = true;

        try {
            const response = await fetch(
                paymentId ? `/api/invoice-payments/${paymentId}` : "/api/invoice-payments",
                {
                    method: paymentId ? "PATCH" : "POST",
                    credentials: "same-origin",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(
                        paymentId ? payload : { customer_invoice_id: invoiceId, ...payload },
                    ),
                },
            );
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                showAlert(paymentFormAlert, data.error || "Failed to save payment.", "danger");
                return;
            }

            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert(paymentFormAlert, "Failed to save payment.", "danger");
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    });
})();
