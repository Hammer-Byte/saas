(() => {
    const form = document.getElementById("gem-keyword-form");
    const pageAlert = document.getElementById("gem-keywords-alert");
    const tableWrap = document.getElementById("gem-keywords-table-wrap");
    const emptyState = document.getElementById("gem-keywords-empty");
    const tableBody = document.getElementById("gem-keywords-tbody");
    const startScanButton = document.getElementById("gem-start-scan-btn");
    const deleteKeywordsButton = document.getElementById("gem-delete-keywords-btn");
    const selectAllCheckbox = document.getElementById("gem-keywords-select-all");
    const idInput = form?.elements.namedItem("id");
    const keywordInput = form?.elements.namedItem("keyword");
    const exactSearchInput = form?.elements.namedItem("exact_search");
    const submitButton = document.getElementById("gem-keyword-submit-btn");
    const scanWasProcessing = !!startScanButton?.disabled;

    function showAlert(message, type) {
        if (!pageAlert) return;
        pageAlert.textContent = message;
        pageAlert.className = `alert alert-${type}`;
        pageAlert.classList.remove("d-none");
    }

    function hideAlert() {
        if (!pageAlert) return;
        pageAlert.classList.add("d-none");
        pageAlert.textContent = "";
    }

    function keywordCheckboxes() {
        return Array.from(tableBody?.querySelectorAll(".gem-keyword-select") || []);
    }

    function selectedKeywordIds() {
        return keywordCheckboxes()
            .filter((input) => input.checked)
            .map((input) => Number(input.value || 0))
            .filter((id) => id >= 1);
    }

    function syncSelectAllState() {
        if (!selectAllCheckbox) return;
        const checkboxes = keywordCheckboxes();
        const checkedCount = checkboxes.filter((input) => input.checked).length;
        selectAllCheckbox.checked = checkboxes.length > 0 && checkedCount === checkboxes.length;
        selectAllCheckbox.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
    }

    function syncSelectionActions() {
        const selectedCount = selectedKeywordIds().length;

        if (deleteKeywordsButton) {
            deleteKeywordsButton.classList.toggle("d-none", selectedCount === 0);
            deleteKeywordsButton.disabled = scanWasProcessing || selectedCount === 0;
            deleteKeywordsButton.textContent =
                selectedCount > 0 ? `Delete selected (${selectedCount})` : "Delete selected";
        }

        if (!startScanButton || scanWasProcessing) return;
        startScanButton.disabled = selectedCount === 0;
        startScanButton.textContent =
            selectedCount > 0 ? `Start scan (${selectedCount})` : "Start scan";
    }

    function setScanRunning() {
        if (!startScanButton) return;
        startScanButton.disabled = true;
        startScanButton.textContent = "Scan in progress…";
        if (deleteKeywordsButton) {
            deleteKeywordsButton.disabled = true;
        }
        for (const input of keywordCheckboxes()) {
            input.disabled = true;
        }
        if (selectAllCheckbox) selectAllCheckbox.disabled = true;
    }

    function resetForm() {
        form?.reset();
        if (idInput) idInput.value = "";
        if (exactSearchInput) exactSearchInput.checked = false;
        if (submitButton) submitButton.textContent = "Add keyword";
    }

    function openEditForm(row) {
        hideAlert();
        if (idInput) idInput.value = row.dataset.id || "";
        if (keywordInput) keywordInput.value = row.dataset.keyword || "";
        if (exactSearchInput) exactSearchInput.checked = row.dataset.exactSearch === "1";
        if (submitButton) submitButton.textContent = "Save keyword";
        keywordInput?.focus();
    }

    form?.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideAlert();

        const keyword = keywordInput?.value?.trim() || "";
        const keywordId = Number(idInput?.value || 0);
        const isEdit = Number.isInteger(keywordId) && keywordId > 0;
        const exact_search = Boolean(exactSearchInput?.checked);

        if (!keyword) {
            showAlert("Keyword is required.", "danger");
            return;
        }

        if (submitButton) submitButton.disabled = true;

        try {
            const response = await fetch(
                isEdit ? `/api/gem-tender-keywords/${keywordId}` : "/api/gem-tender-keywords",
                {
                    method: isEdit ? "PATCH" : "POST",
                    credentials: "same-origin",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ keyword, exact_search }),
                },
            );
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                showAlert(
                    data.error || (isEdit ? "Failed to update keyword." : "Failed to add keyword."),
                    "danger",
                );
                return;
            }

            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert(isEdit ? "Failed to update keyword." : "Failed to add keyword.", "danger");
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    });

    selectAllCheckbox?.addEventListener("change", () => {
        const checked = !!selectAllCheckbox.checked;
        for (const input of keywordCheckboxes()) {
            if (!input.disabled) input.checked = checked;
        }
        syncSelectAllState();
        syncSelectionActions();
    });

    tableBody?.addEventListener("change", (event) => {
        if (!event.target?.classList?.contains("gem-keyword-select")) return;
        syncSelectAllState();
        syncSelectionActions();
    });

    startScanButton?.addEventListener("click", async () => {
        if (startScanButton.disabled) return;

        const keyword_ids = selectedKeywordIds();
        if (!keyword_ids.length) {
            showAlert("Select at least one keyword to scan.", "danger");
            return;
        }

        hideAlert();
        startScanButton.disabled = true;

        try {
            const response = await fetch("/api/gem-tender-keywords/scan", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ keyword_ids }),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                showAlert(data.error || "Failed to start scan.", "danger");
                if (!data.processing) {
                    syncSelectionActions();
                } else {
                    setScanRunning();
                }
                return;
            }

            setScanRunning();
            showAlert(data.message || "Scan started.", "success");
        } catch (error) {
            console.error(error);
            showAlert("Failed to start scan.", "danger");
            syncSelectionActions();
        }
    });

    deleteKeywordsButton?.addEventListener("click", async () => {
        if (deleteKeywordsButton.disabled) return;

        const keyword_ids = selectedKeywordIds();
        if (!keyword_ids.length) {
            showAlert("Select at least one keyword to delete.", "danger");
            return;
        }

        const confirmed = await showConfirm({
            title: "Delete selected keywords?",
            description: `Delete ${keyword_ids.length} keyword(s)? Associated tenders will be kept.`,
            choices: [
                { label: "Cancel", variant: "secondary", value: false },
                { label: "Delete", variant: "danger", value: true },
            ],
        });
        if (!confirmed) return;

        hideAlert();
        deleteKeywordsButton.disabled = true;

        try {
            const response = await fetch("/api/gem-tender-keywords/bulk-delete", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ keyword_ids }),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                showAlert(data.error || "Failed to delete keywords.", "danger");
                syncSelectionActions();
                return;
            }

            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert("Failed to delete keywords.", "danger");
            syncSelectionActions();
        }
    });

    tableBody?.addEventListener("click", (event) => {
        const row = event.target.closest("tr[data-id]");
        if (!row) return;

        if (event.target.closest(".gem-keyword-edit-btn")) {
            openEditForm(row);
        }
    });

    if (tableBody && tableWrap && emptyState) {
        const hasRows = tableBody.querySelectorAll("tr").length > 0;
        tableWrap.classList.toggle("d-none", !hasRows);
        emptyState.classList.toggle("d-none", hasRows);
    }

    syncSelectAllState();
    syncSelectionActions();
    resetForm();
})();
