(() => {
    const form = document.getElementById("expense-form");
    const formAlert = document.getElementById("expense-form-alert");
    const pageAlert = document.getElementById("expenses-alert");
    const modalEl = document.getElementById("expense-modal");
    const modalLabel = document.getElementById("expense-modal-label");
    const openAddBtn = document.getElementById("open-add-expense-btn");
    const searchInput = document.getElementById("expenses-search");
    const tbody = document.getElementById("expenses-tbody");
    const empty = document.getElementById("expenses-empty");
    const tableWrap = document.getElementById("expenses-table-wrap");
    const totalEl = document.getElementById("expenses-total");
    const countEl = document.getElementById("expenses-count");

    if (!form || !tbody) {
        return;
    }

    const idInput = form.elements.namedItem("id");
    const titleInput = form.elements.namedItem("title");
    const descriptionInput = form.elements.namedItem("description");
    const amountInput = form.elements.namedItem("amount");
    const dateInput = form.elements.namedItem("expense_date");

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
        form.reset();
        idInput.value = "";
        hideAlert(formAlert);
    }

    function openAddModal() {
        resetForm();
        modalLabel.textContent = "Add expense";
        dateInput.value = new Date().toISOString().slice(0, 10);
    }

    function openEditModal(row) {
        hideAlert(formAlert);
        modalLabel.textContent = "Edit expense";
        idInput.value = row.dataset.id || "";
        titleInput.value = row.dataset.title || "";
        descriptionInput.value = row.dataset.description || "";
        amountInput.value = row.dataset.amount || "";
        dateInput.value = row.dataset.expenseDate || "";
    }

    function updateSummary() {
        const visibleRows = [...tbody.querySelectorAll("tr")].filter((row) => !row.classList.contains("d-none"));
        const total = visibleRows.reduce((sum, row) => sum + Number(row.dataset.amount || 0), 0);

        if (totalEl) totalEl.textContent = Number(total || 0).toFixed(2);
        if (countEl) countEl.textContent = visibleRows.length;

        const hasVisible = visibleRows.length > 0;
        empty?.classList.toggle("d-none", hasVisible);
        tableWrap?.classList.toggle("d-none", !hasVisible);
    }

    function applySearch() {
        const query = (searchInput?.value || "").trim().toLowerCase();

        [...tbody.querySelectorAll("tr")].forEach((row) => {
            const haystack = [
                row.dataset.title || "",
                row.dataset.description || "",
                row.dataset.amount || "",
                row.dataset.expenseDate || "",
            ]
                .join(" ")
                .toLowerCase();

            row.classList.toggle("d-none", query && !haystack.includes(query));
        });

        updateSummary();
    }

    openAddBtn?.addEventListener("click", openAddModal);

    searchInput?.addEventListener("input", applySearch);

    tbody.addEventListener("click", async (event) => {
        const row = event.target.closest("tr[data-id]");
        if (!row) return;

        if (event.target.closest(".expense-edit-btn")) {
            openEditModal(row);
            const modal = window.bootstrap?.Modal?.getOrCreateInstance(modalEl);
            modal?.show();
            return;
        }

        if (event.target.closest(".expense-delete-btn")) {
            if (!window.confirm("Delete this expense?")) {
                return;
            }

            hideAlert(pageAlert);
            try {
                const response = await fetch(`/api/expenses/${row.dataset.id}`, {
                    method: "DELETE",
                    credentials: "same-origin",
                });

                if (!response.ok && response.status !== 204) {
                    const data = await response.json().catch(() => ({}));
                    showAlert(pageAlert, data.error || "Failed to delete expense.", "danger");
                    return;
                }

                row.remove();
                applySearch();
                showAlert(pageAlert, "Expense deleted.", "success");
            } catch (error) {
                console.error(error);
                showAlert(pageAlert, "Failed to delete expense.", "danger");
            }
        }
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideAlert(formAlert);

        const id = idInput.value ? Number(idInput.value) : null;
        const payload = {
            title: titleInput.value.trim(),
            description: descriptionInput.value.trim(),
            amount: Number(amountInput.value),
            expense_date: dateInput.value,
        };

        if (!payload.title || !payload.expense_date || Number.isNaN(payload.amount)) {
            showAlert(formAlert, "Please fill in title, amount, and date.", "danger");
            return;
        }

        const submitBtn = document.getElementById("expense-submit-btn");
        if (submitBtn) submitBtn.disabled = true;

        try {
            const response = await fetch("/api/expenses", {
                method: id ? "PATCH" : "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(id ? { id, ...payload } : payload),
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                showAlert(formAlert, data.error || "Failed to save expense.", "danger");
                return;
            }

            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert(formAlert, "Failed to save expense.", "danger");
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    });
})();
