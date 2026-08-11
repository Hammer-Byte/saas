(() => {
    const form = document.getElementById("customer-project-detail-form");
    const alertBox = document.getElementById("customer-project-alert");
    const editBtn = document.getElementById("edit-project-btn");
    const saveBtn = document.getElementById("save-project-btn");
    const cancelBtn = document.getElementById("cancel-edit-project-btn");
    const deleteBtn = document.getElementById("delete-project-btn");
    const addAppForm = document.getElementById("add-application-form");
    const addAppAlert = document.getElementById("add-application-alert");
    const invoiceForm = document.getElementById("invoice-form");
    const invoiceFormAlert = document.getElementById("invoice-form-alert");
    const itemsContainer = document.getElementById("invoice-items");
    const addItemBtn = document.getElementById("add-invoice-item-btn");
    const invoiceDateInput = document.getElementById("invoice-date");

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

    if (form) {
        const customerId = form.dataset.customerId;
        const projectId = form.dataset.projectId;
        const editableFields = ["title", "description"];
        let snapshot = null;

        function getField(name) {
            return form.elements.namedItem(name);
        }

        function readSnapshot() {
            const values = {};
            for (const name of editableFields) {
                values[name] = getField(name)?.value ?? "";
            }
            return values;
        }

        function applySnapshot(values) {
            for (const name of editableFields) {
                const field = getField(name);
                if (field) field.value = values[name] ?? "";
            }
        }

        function setEditing(enabled) {
            for (const name of editableFields) {
                const field = getField(name);
                if (field) field.disabled = !enabled;
            }
            editBtn?.classList.toggle("d-none", enabled);
            saveBtn?.classList.toggle("d-none", !enabled);
            cancelBtn?.classList.toggle("d-none", !enabled);
            if (enabled) getField("title")?.focus();
        }

        editBtn?.addEventListener("click", () => {
            hideAlert(alertBox);
            snapshot = readSnapshot();
            setEditing(true);
        });

        cancelBtn?.addEventListener("click", () => {
            hideAlert(alertBox);
            if (snapshot) applySnapshot(snapshot);
            setEditing(false);
        });

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            hideAlert(alertBox);

            const title = getField("title")?.value?.trim() || "";
            const description = getField("description")?.value?.trim() || "";

            if (!title) {
                showAlert(alertBox, "Title is required.", "danger");
                return;
            }

            const payload = { id: Number(projectId), title };
            if (description) payload.description = description;

            if (saveBtn) saveBtn.disabled = true;

            try {
                const response = await fetch("/api/customer-projects", {
                    method: "PATCH",
                    credentials: "same-origin",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                const data = await response.json().catch(() => ({}));

                if (!response.ok) {
                    showAlert(alertBox, data.error || "Failed to update project.", "danger");
                    return;
                }

                snapshot = readSnapshot();
                setEditing(false);
                showAlert(alertBox, "Project updated.", "success");
            } catch (error) {
                console.error(error);
                showAlert(alertBox, "Failed to update project.", "danger");
            } finally {
                if (saveBtn) saveBtn.disabled = false;
            }
        });

        deleteBtn?.addEventListener("click", async () => {
            if (!window.confirm("Delete this project?")) {
                return;
            }

            try {
                const response = await fetch(`/api/customer-projects/${projectId}`, {
                    method: "DELETE",
                    credentials: "same-origin",
                });

                if (!response.ok && response.status !== 204) {
                    const data = await response.json().catch(() => ({}));
                    showAlert(alertBox, data.error || "Failed to delete project.", "danger");
                    return;
                }

                window.location.href = `/app/customers/${customerId}`;
            } catch (error) {
                console.error(error);
                showAlert(alertBox, "Failed to delete project.", "danger");
            }
        });
    }

    addAppForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideAlert(addAppAlert);

        const title = addAppForm.elements.namedItem("title")?.value?.trim() || "";
        const active = addAppForm.elements.namedItem("active")?.value === "true";

        if (!title) {
            showAlert(addAppAlert, "Title is required.", "danger");
            return;
        }

        const submitBtn = addAppForm.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;

        try {
            const response = await fetch("/api/project-applications", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title,
                    active,
                    project_id: Number(addAppForm.dataset.projectId),
                }),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                showAlert(addAppAlert, data.error || "Failed to add application.", "danger");
                return;
            }

            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert(addAppAlert, "Failed to add application.", "danger");
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    });

    function createItemRow() {
        const row = document.createElement("div");
        row.className = "invoice-item-row border rounded p-3";
        row.innerHTML = `
            <div class="row g-2 align-items-end">
                <div class="col-md-5">
                    <label class="form-label">Item</label>
                    <input type="text" class="form-control item-name" maxlength="128" required />
                </div>
                <div class="col-md-3">
                    <label class="form-label">Cost</label>
                    <input type="number" class="form-control item-cost" min="0" step="0.01" value="0" required />
                </div>
                <div class="col-md-2">
                    <label class="form-label">Qty</label>
                    <input type="number" class="form-control item-quantity" min="0.01" step="0.01" value="1" required />
                </div>
                <div class="col-md-2">
                    <button type="button" class="btn btn-outline-danger w-100 remove-invoice-item-btn">Remove</button>
                </div>
            </div>
        `;
        row.querySelector(".remove-invoice-item-btn")?.addEventListener("click", () => {
            if (itemsContainer.children.length <= 1) {
                showAlert(invoiceFormAlert, "At least one item is required.", "danger");
                return;
            }
            row.remove();
        });
        return row;
    }

    function resetItems() {
        if (!itemsContainer) return;
        itemsContainer.innerHTML = "";
        itemsContainer.appendChild(createItemRow());
    }

    document.querySelectorAll(".application-row[data-href], .invoice-row[data-href]").forEach((row) => {
        row.addEventListener("click", () => {
            window.location.href = row.dataset.href;
        });
        row.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                window.location.href = row.dataset.href;
            }
        });
    });

    addItemBtn?.addEventListener("click", () => {
        invoiceFormAlert?.classList.add("d-none");
        itemsContainer?.appendChild(createItemRow());
    });

    document.getElementById("invoice-modal")?.addEventListener("show.bs.modal", () => {
        invoiceFormAlert?.classList.add("d-none");
        resetItems();
        if (invoiceDateInput) {
            const now = new Date();
            invoiceDateInput.value = `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, "0")}`;
        }
    });

    if (invoiceForm) {
        resetItems();

        invoiceForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            invoiceFormAlert?.classList.add("d-none");

            const customer_id = Number(invoiceForm.dataset.customerId);
            const project_id = Number(invoiceForm.dataset.projectId);
            const date = invoiceDateInput?.value || "";
            const items = Array.from(itemsContainer?.querySelectorAll(".invoice-item-row") || [])
                .map((row) => ({
                    item: row.querySelector(".item-name")?.value?.trim() || "",
                    cost: Number(row.querySelector(".item-cost")?.value || 0),
                    quantity: Number(row.querySelector(".item-quantity")?.value || 0),
                }))
                .filter((row) => row.item);

            if (!date) {
                showAlert(invoiceFormAlert, "Invoice month is required.", "danger");
                return;
            }

            if (items.length === 0) {
                showAlert(invoiceFormAlert, "Add at least one item with a name.", "danger");
                return;
            }

            if (items.some((row) => row.quantity <= 0)) {
                showAlert(invoiceFormAlert, "Each item quantity must be greater than 0.", "danger");
                return;
            }

            const submitBtn = invoiceForm.querySelector('button[type="submit"]');
            if (submitBtn) submitBtn.disabled = true;

            try {
                const response = await fetch("/api/customer-invoices", {
                    method: "POST",
                    credentials: "same-origin",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ customer_id, project_id, date, items }),
                });
                const data = await response.json().catch(() => ({}));

                if (!response.ok) {
                    showAlert(invoiceFormAlert, data.error || "Failed to add invoice.", "danger");
                    return;
                }

                window.location.href = `/app/invoices/${data.invoice.id}`;
            } catch (error) {
                console.error(error);
                showAlert(invoiceFormAlert, "Failed to add invoice.", "danger");
            } finally {
                if (submitBtn) submitBtn.disabled = false;
            }
        });
    }
})();
