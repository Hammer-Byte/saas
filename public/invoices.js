(() => {
    const form = document.getElementById("invoice-form");
    const formAlert = document.getElementById("invoice-form-alert");
    const pageAlert = document.getElementById("invoices-alert");
    const customerSelect = document.getElementById("customer_id");
    const projectSelect = document.getElementById("project_id");
    const dateInput = document.getElementById("invoice-date");
    const itemsContainer = document.getElementById("invoice-items");
    const addItemButton = document.getElementById("add-invoice-item-btn");

    function showAlert(target, message, type) {
        if (!target) return;
        target.textContent = message;
        target.className = `alert alert-${type}`;
        target.classList.remove("d-none");
    }

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
                showAlert(formAlert, "At least one item is required.", "danger");
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

    function filterProjectsByCustomer() {
        if (!customerSelect || !projectSelect) return;
        const customerId = customerSelect.value;

        Array.from(projectSelect.options).forEach((option, index) => {
            if (index === 0) {
                option.hidden = false;
                return;
            }
            option.hidden = !customerId || option.dataset.customerId !== customerId;
        });

        const selected = projectSelect.selectedOptions[0];
        if (selected?.hidden) {
            projectSelect.value = "";
        }
    }

    document.querySelectorAll(".invoice-row[data-href]").forEach((row) => {
        row.addEventListener("click", (event) => {
            if (event.target.closest(".invoice-delete-btn")) return;
            window.location.href = row.dataset.href;
        });
        row.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                window.location.href = row.dataset.href;
            }
        });
    });

    customerSelect?.addEventListener("change", filterProjectsByCustomer);
    filterProjectsByCustomer();

    addItemButton?.addEventListener("click", () => {
        formAlert?.classList.add("d-none");
        itemsContainer?.appendChild(createItemRow());
    });

    document.getElementById("invoice-modal")?.addEventListener("show.bs.modal", () => {
        formAlert?.classList.add("d-none");
        if (form) {
            form.reset();
            filterProjectsByCustomer();
        }
        if (dateInput) {
            dateInput.value = getReadableDate("YYYY-MM", new Date());
        }
        resetItems();
    });

    document.querySelectorAll(".invoice-delete-btn").forEach((button) => {
        button.addEventListener("click", async (event) => {
            event.stopPropagation();
            if (!window.confirm("Delete this invoice?")) {
                return;
            }

            try {
                const response = await fetch(`/api/customer-invoices/${button.dataset.id}`, {
                    method: "DELETE",
                    credentials: "same-origin",
                });

                if (!response.ok && response.status !== 204) {
                    const data = await response.json().catch(() => ({}));
                    showAlert(pageAlert, data.error || "Failed to delete invoice.", "danger");
                    return;
                }

                window.location.reload();
            } catch (error) {
                console.error(error);
                showAlert(pageAlert, "Failed to delete invoice.", "danger");
            }
        });
    });

    if (!form) {
        return;
    }

    resetItems();

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        formAlert?.classList.add("d-none");

        const customer_id = Number(form.elements.namedItem("customer_id")?.value || 0);
        const project_id = Number(form.elements.namedItem("project_id")?.value || 0);
        const date = getWritableDate("YYYY-MM", dateInput?.value);
        const items = Array.from(itemsContainer?.querySelectorAll(".invoice-item-row") || [])
            .map((row) => ({
                item: row.querySelector(".item-name")?.value?.trim() || "",
                cost: Number(row.querySelector(".item-cost")?.value || 0),
                quantity: Number(row.querySelector(".item-quantity")?.value || 0),
            }))
            .filter((row) => row.item);

        if (!customer_id || !project_id) {
            showAlert(formAlert, "Customer and project are required.", "danger");
            return;
        }

        if (!date) {
            showAlert(formAlert, "Invoice month is required.", "danger");
            return;
        }

        if (items.length === 0) {
            showAlert(formAlert, "Add at least one item with a name.", "danger");
            return;
        }

        if (items.some((row) => row.quantity <= 0)) {
            showAlert(formAlert, "Each item quantity must be greater than 0.", "danger");
            return;
        }

        const submitButton = form.querySelector('button[type="submit"]');
        if (submitButton) submitButton.disabled = true;

        try {
            const response = await fetch("/api/customer-invoices", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ customer_id, project_id, date, items }),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                showAlert(formAlert, data.error || "Failed to add invoice.", "danger");
                return;
            }

            window.location.href = `/app/invoices/${data.invoice.id}`;
        } catch (error) {
            console.error(error);
            showAlert(formAlert, "Failed to add invoice.", "danger");
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    });
})();
