(() => {
    const form = document.getElementById("invoice-form");
    const formAlert = document.getElementById("invoice-form-alert");
    const pageAlert = document.getElementById("invoices-alert");
    const itemsContainer = document.getElementById("invoice-items");
    const addItemBtn = document.getElementById("add-invoice-item-btn");

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

    addItemBtn?.addEventListener("click", () => {
        formAlert?.classList.add("d-none");
        itemsContainer?.appendChild(createItemRow());
    });

    document.getElementById("invoice-modal")?.addEventListener("show.bs.modal", () => {
        formAlert?.classList.add("d-none");
        if (form?.elements.namedItem("due_date")) {
            form.elements.namedItem("due_date").value = "";
        }
        resetItems();
    });

    document.querySelectorAll(".invoice-delete-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
            if (!window.confirm("Delete this invoice?")) {
                return;
            }

            try {
                const response = await fetch(`/api/customer-invoices/${btn.dataset.id}`, {
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

        const customer_id = Number(form.dataset.customerId);
        const project_id = Number(form.dataset.projectId);
        const due_date = form.elements.namedItem("due_date")?.value || "";
        const items = Array.from(itemsContainer?.querySelectorAll(".invoice-item-row") || [])
            .map((row) => ({
                item: row.querySelector(".item-name")?.value?.trim() || "",
                cost: Number(row.querySelector(".item-cost")?.value || 0),
                quantity: Number(row.querySelector(".item-quantity")?.value || 0),
            }))
            .filter((row) => row.item);

        if (!due_date) {
            showAlert(formAlert, "Due date is required.", "danger");
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

        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;

        try {
            const response = await fetch("/api/customer-invoices", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ customer_id, project_id, due_date, items }),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                showAlert(formAlert, data.error || "Failed to add invoice.", "danger");
                return;
            }

            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert(formAlert, "Failed to add invoice.", "danger");
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    });
})();
