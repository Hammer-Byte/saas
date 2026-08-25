(() => {
    const form = document.getElementById("expense-form");
    const formAlert = document.getElementById("expense-form-alert");
    const pageAlert = document.getElementById("expenses-alert");
    const modalElement = document.getElementById("expense-modal");
    const modalLabel = document.getElementById("expense-modal-label");
    const openAddButton = document.getElementById("open-add-expense-btn");
    const searchInput = document.getElementById("expenses-search");
    const tableBody = document.getElementById("expenses-tbody");
    const emptyState = document.getElementById("expenses-empty");
    const tableWrap = document.getElementById("expenses-table-wrap");
    const nonLoanedTotalElement = document.getElementById("expenses-non-loaned-total");
    const loanedTotalElement = document.getElementById("expenses-loaned-total");
    const countElement = document.getElementById("expenses-count");

    if (!form || !tableBody) {
        return;
    }

    const idInput = form.elements.namedItem("id");
    const titleInput = form.elements.namedItem("title");
    const descriptionInput = form.elements.namedItem("description");
    const amountInput = form.elements.namedItem("amount");
    const dateInput = form.elements.namedItem("expense_date");
    const loanedInput = form.elements.namedItem("loaned");

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
        dateInput.value = getReadableDate("YYYY-MM-DD", new Date());
    }

    function openEditModal(row) {
        hideAlert(formAlert);
        modalLabel.textContent = "Edit expense";
        idInput.value = row.dataset.id || "";
        titleInput.value = row.dataset.title || "";
        descriptionInput.value = row.dataset.description || "";
        amountInput.value = row.dataset.amount || "";
        dateInput.value = getReadableDate("YYYY-MM-DD", row.dataset.expenseDate);
        loanedInput.checked = row.dataset.loaned === "true";
    }

    function updateSummary() {
        const visibleRows = [...tableBody.querySelectorAll("tr")].filter((row) => !row.classList.contains("d-none"));
        let nonLoanedTotal = 0;
        let loanedTotal = 0;

        for (const row of visibleRows) {
            const amount = Number(row.dataset.amount || 0);
            if (row.dataset.loaned === "true") {
                loanedTotal += amount;
            } else {
                nonLoanedTotal += amount;
            }
        }

        if (nonLoanedTotalElement) nonLoanedTotalElement.textContent = Number(nonLoanedTotal || 0).toFixed(2);
        if (loanedTotalElement) loanedTotalElement.textContent = Number(loanedTotal || 0).toFixed(2);
        if (countElement) countElement.textContent = visibleRows.length;

        const hasVisible = visibleRows.length > 0;
        emptyState?.classList.toggle("d-none", hasVisible);
        tableWrap?.classList.toggle("d-none", !hasVisible);
    }

    function applySearch() {
        const query = (searchInput?.value || "").trim().toLowerCase();

        [...tableBody.querySelectorAll("tr")].forEach((row) => {
            const haystack = [
                row.dataset.title || "",
                row.dataset.description || "",
                row.dataset.amount || "",
                row.dataset.expenseDate || "",
                row.dataset.loaned === "true" ? "loaned" : "",
            ]
                .join(" ")
                .toLowerCase();

            row.classList.toggle("d-none", query && !haystack.includes(query));
        });

        updateSummary();
    }

    openAddButton?.addEventListener("click", openAddModal);

    searchInput?.addEventListener("input", applySearch);

    tableBody.addEventListener("click", async (event) => {
        const row = event.target.closest("tr[data-id]");
        if (!row) return;

        if (event.target.closest(".expense-edit-btn")) {
            openEditModal(row);
            const modal = window.bootstrap?.Modal?.getOrCreateInstance(modalElement);
            modal?.show();
            return;
        }

        if (event.target.closest(".expense-delete-btn")) {
            const confirmed = await showConfirm({
                title: "Delete expense?",
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
            expense_date: getWritableDate("YYYY-MM-DD", dateInput.value),
            loaned: loanedInput.checked,
        };

        if (!payload.title || !payload.expense_date || Number.isNaN(payload.amount)) {
            showAlert(formAlert, "Please fill in title, amount, and date.", "danger");
            return;
        }

        const submitButton = document.getElementById("expense-submit-btn");
        if (submitButton) submitButton.disabled = true;

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
            if (submitButton) submitButton.disabled = false;
        }
    });
})();
