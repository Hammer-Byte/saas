(() => {
    const FILTERS_STORAGE_KEY = "gem-tenders-filters";
    const dateForm = document.getElementById("gem-tenders-date-form");
    const fromInput = document.getElementById("gem-tenders-from");
    const toInput = document.getElementById("gem-tenders-to");
    const keywordFilter = document.getElementById("gem-filter-keyword");
    const assigneeFilter = document.getElementById("gem-filter-assignee");
    const showAllFilter = document.getElementById("gem-filter-show-all");
    const quantityUptoFilter = document.getElementById("gem-filter-quantity-upto");
    const searchInput = document.getElementById("gem-tenders-search");
    const tableBody = document.getElementById("gem-tenders-tbody");
    const tableWrap = document.getElementById("gem-tenders-table-wrap");
    const emptyState = document.getElementById("gem-tenders-empty");
    const filterStatus = document.getElementById("gem-tenders-filter-status");
    const columnFilters = Array.from(document.querySelectorAll(".gem-tender-column-filter"));
    const selectAllCheckbox = document.getElementById("gem-tenders-select-all");
    const bulkBar = document.getElementById("gem-tenders-bulk-assign-bar");
    const bulkAssignee = document.getElementById("gem-bulk-assignee");
    const bulkAssignBtn = document.getElementById("gem-bulk-assign-btn");
    const bulkClearBtn = document.getElementById("gem-bulk-clear-btn");
    const bulkStatus = document.getElementById("gem-bulk-assign-status");
    const selectedCountLabel = document.getElementById("gem-tenders-selected-count");
    const currentUserId = Number(bulkBar?.dataset.currentUserId || 0);
    const canAssignOthers = bulkBar?.dataset.canAssignOthers === "1";

    function readStoredFilters() {
        try {
            const raw = window.localStorage.getItem(FILTERS_STORAGE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === "object" ? parsed : null;
        } catch (error) {
            return null;
        }
    }

    function writeStoredFilters(filters) {
        try {
            window.localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filters));
        } catch (error) {
            console.error(error);
        }
    }

    function collectFilters() {
        const columnValues = {};
        for (const select of columnFilters) {
            const column = select.dataset.column;
            if (!column) continue;
            columnValues[column] = select.value || "";
        }
        return {
            from: window.getWritableDate?.("YYYY-MM-DD", fromInput?.value || "") || "",
            to: window.getWritableDate?.("YYYY-MM-DD", toInput?.value || "") || "",
            keywordId: keywordFilter?.value || "",
            assignee: assigneeFilter?.value || "",
            search: searchInput?.value || "",
            showAll: !!showAllFilter?.checked,
            quantityUpto: quantityUptoFilter?.value || "",
            columns: columnValues,
        };
    }

    function saveFilters() {
        writeStoredFilters(collectFilters());
    }

    dateForm?.addEventListener("submit", (event) => {
        const from = window.getWritableDate("YYYY-MM-DD", fromInput?.value || "");
        const to = window.getWritableDate("YYYY-MM-DD", toInput?.value || "");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(from || "") || !/^\d{4}-\d{2}-\d{2}$/.test(to || "")) {
            event.preventDefault();
            window.alert("Enter valid end dates as dd/mm/yyyy.");
            return;
        }
        if (fromInput) fromInput.value = from;
        if (toInput) toInput.value = to;
        writeStoredFilters({
            ...collectFilters(),
            from,
            to,
        });
    });

    const storedFilters = readStoredFilters();
    if (storedFilters?.from && storedFilters?.to) {
        const url = new URL(window.location.href);
        const urlFrom = url.searchParams.get("from") || "";
        const urlTo = url.searchParams.get("to") || "";
        if (urlFrom !== storedFilters.from || urlTo !== storedFilters.to) {
            url.searchParams.set("from", storedFilters.from);
            url.searchParams.set("to", storedFilters.to);
            window.location.replace(url.toString());
            return;
        }
    }

    if (!tableBody) return;

    let rows = Array.from(tableBody.querySelectorAll("tr"));

    function uniqueColumnValues(column) {
        const values = new Set();
        for (const row of rows) {
            const value = (row.dataset[column] || "").trim();
            if (value) values.add(value);
        }
        return Array.from(values).sort((left, right) =>
            left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" }),
        );
    }

    function fillColumnFilter(select) {
        const column = select.dataset.column;
        if (!column) return;

        if (column === "eligible" || column === "filed") {
            return;
        }

        const current = select.value;
        select.replaceChildren();

        const allOption = document.createElement("option");
        allOption.value = "";
        allOption.textContent = "All";
        select.appendChild(allOption);

        for (const value of uniqueColumnValues(column)) {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = value;
            select.appendChild(option);
        }

        if ([...select.options].some((option) => option.value === current)) {
            select.value = current;
        }
    }

    function visibleRows() {
        return rows.filter((row) => !row.classList.contains("d-none"));
    }

    function selectedCheckboxes() {
        return Array.from(tableBody.querySelectorAll(".gem-tender-select:checked")).filter(
            (input) => !input.closest("tr")?.classList.contains("d-none"),
        );
    }

    function syncBulkBar() {
        const selected = selectedCheckboxes();
        const count = selected.length;
        if (selectedCountLabel) {
            selectedCountLabel.textContent = `${count} selected`;
        }
        bulkBar?.classList.toggle("d-none", count === 0);
        if (bulkAssignBtn) {
            bulkAssignBtn.disabled = count === 0 || !bulkAssignee?.value;
        }
        if (selectAllCheckbox) {
            const visibles = visibleRows();
            const visibleChecks = visibles
                .map((row) => row.querySelector(".gem-tender-select"))
                .filter(Boolean);
            const checkedVisible = visibleChecks.filter((input) => input.checked).length;
            selectAllCheckbox.checked =
                visibleChecks.length > 0 && checkedVisible === visibleChecks.length;
            selectAllCheckbox.indeterminate =
                checkedVisible > 0 && checkedVisible < visibleChecks.length;
        }
    }

    function clearSelection() {
        for (const input of tableBody.querySelectorAll(".gem-tender-select")) {
            input.checked = false;
        }
        if (selectAllCheckbox) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        }
        if (bulkStatus) {
            bulkStatus.classList.add("d-none");
            bulkStatus.textContent = "";
        }
        syncBulkBar();
    }

    function applyFilters() {
        const query = (searchInput?.value || "").trim().toLowerCase();
        const keywordId = (keywordFilter?.value || "").trim();
        const assigneeValue = (assigneeFilter?.value || "").trim();
        const showAll = !!showAllFilter?.checked;
        const quantityUptoRaw = (quantityUptoFilter?.value || "").trim();
        const quantityUpto = quantityUptoRaw === "" ? null : Number(quantityUptoRaw);
        const hasQuantityUpto =
            quantityUpto != null && Number.isFinite(quantityUpto) && quantityUpto >= 0;
        const activeFilters = columnFilters
            .map((select) => ({
                column: select.dataset.column,
                value: (select.value || "").trim().toLowerCase(),
            }))
            .filter((filter) => filter.column && filter.value);

        let visibleCount = 0;

        for (const row of rows) {
            const matchesHidden = showAll || row.dataset.hidden !== "1";

            const matchesKeyword =
                !keywordId || String(row.dataset.keywordId || "") === keywordId;

            const rowAssigneeId = String(row.dataset.assigneeUserId || "");
            const matchesAssignee =
                !assigneeValue ||
                (assigneeValue === "unassigned"
                    ? !rowAssigneeId
                    : rowAssigneeId === assigneeValue);

            const matchesSearch = !query || row.textContent.toLowerCase().includes(query);

            const matchesColumns = activeFilters.every((filter) => {
                const cellValue = (row.dataset[filter.column] || "").trim().toLowerCase();
                return cellValue === filter.value;
            });

            const rowQuantity = Number(row.dataset.quantity || 0);
            const matchesQuantity =
                !hasQuantityUpto ||
                (Number.isFinite(rowQuantity) && rowQuantity <= quantityUpto);

            const visible =
                matchesHidden &&
                matchesKeyword &&
                matchesAssignee &&
                matchesSearch &&
                matchesColumns &&
                matchesQuantity;
            row.classList.toggle("d-none", !visible);
            if (!visible) {
                const checkbox = row.querySelector(".gem-tender-select");
                if (checkbox) checkbox.checked = false;
            }
            if (visible) visibleCount += 1;
        }

        if (filterStatus) {
            filterStatus.textContent = `Showing ${visibleCount} of ${rows.length} tenders`;
        }

        const hasRows = rows.length > 0;
        tableWrap?.classList.toggle("d-none", !hasRows);
        emptyState?.classList.toggle("d-none", hasRows);
        syncBulkBar();
        saveFilters();
    }

    function restoreClientFilters(filters) {
        if (!filters) return;
        if (keywordFilter && filters.keywordId != null) {
            keywordFilter.value = filters.keywordId;
        }
        if (assigneeFilter && filters.assignee != null) {
            assigneeFilter.value = filters.assignee;
        }
        if (searchInput && filters.search != null) {
            searchInput.value = filters.search;
        }
        if (showAllFilter && typeof filters.showAll === "boolean") {
            showAllFilter.checked = filters.showAll;
        }
        if (quantityUptoFilter && filters.quantityUpto != null) {
            quantityUptoFilter.value = filters.quantityUpto;
        }
        if (filters.columns && typeof filters.columns === "object") {
            for (const select of columnFilters) {
                const column = select.dataset.column;
                if (!column) continue;
                const value = filters.columns[column];
                if (value == null) continue;
                if ([...select.options].some((option) => option.value === value)) {
                    select.value = value;
                }
            }
        }
    }

    for (const select of columnFilters) {
        fillColumnFilter(select);
        select.addEventListener("change", applyFilters);
    }

    restoreClientFilters(storedFilters);

    keywordFilter?.addEventListener("change", applyFilters);
    assigneeFilter?.addEventListener("change", applyFilters);
    showAllFilter?.addEventListener("change", applyFilters);
    quantityUptoFilter?.addEventListener("input", applyFilters);
    searchInput?.addEventListener("input", applyFilters);

    tableBody.addEventListener("change", (event) => {
        if (event.target?.classList?.contains("gem-tender-select")) {
            syncBulkBar();
        }
    });

    selectAllCheckbox?.addEventListener("change", () => {
        const checked = !!selectAllCheckbox.checked;
        for (const row of visibleRows()) {
            const checkbox = row.querySelector(".gem-tender-select");
            if (checkbox) checkbox.checked = checked;
        }
        syncBulkBar();
    });

    bulkAssignee?.addEventListener("change", () => {
        syncBulkBar();
    });

    bulkClearBtn?.addEventListener("click", () => {
        clearSelection();
    });

    bulkAssignBtn?.addEventListener("click", async () => {
        const selected = selectedCheckboxes();
        const assigneeUserId = Number(bulkAssignee?.value || 0);
        if (!selected.length || !(assigneeUserId >= 1)) return;

        if (!canAssignOthers && assigneeUserId !== currentUserId) {
            if (bulkStatus) {
                bulkStatus.textContent = "Missing authority to assign other users.";
                bulkStatus.classList.remove("d-none");
            }
            return;
        }

        bulkAssignBtn.disabled = true;
        if (bulkStatus) {
            bulkStatus.textContent = `Assigning ${selected.length} tender(s)…`;
            bulkStatus.classList.remove("d-none", "text-danger");
            bulkStatus.classList.add("text-secondary");
        }

        let successCount = 0;
        let failCount = 0;

        for (const checkbox of selected) {
            const tenderId = Number(checkbox.value || 0);
            if (!(tenderId >= 1)) {
                failCount += 1;
                continue;
            }
            try {
                const payload =
                    assigneeUserId === currentUserId
                        ? { assign_to_me: true }
                        : { assignee_user_id: assigneeUserId };
                const response = await fetch(`/api/gem-keyword-tenders/${tenderId}`, {
                    method: "PATCH",
                    credentials: "same-origin",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                if (!response.ok) {
                    failCount += 1;
                    continue;
                }
                successCount += 1;
            } catch (error) {
                console.error(error);
                failCount += 1;
            }
        }

        if (failCount === 0) {
            window.location.reload();
            return;
        }

        if (bulkStatus) {
            bulkStatus.textContent = `Assigned ${successCount}, failed ${failCount}. Refresh to see updates.`;
            bulkStatus.classList.remove("text-secondary");
            bulkStatus.classList.add("text-danger");
        }
        bulkAssignBtn.disabled = false;
    });

    const filtersCollapse = document.getElementById("gem-tenders-filters");
    const filtersToggle = document.getElementById("gem-tenders-filters-toggle");
    function syncFiltersToggleLabel() {
        if (!filtersToggle || !filtersCollapse) return;
        const expanded = filtersCollapse.classList.contains("show");
        filtersToggle.textContent = expanded ? "Hide filters" : "Filters";
        filtersToggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    }
    filtersCollapse?.addEventListener("shown.bs.collapse", syncFiltersToggleLabel);
    filtersCollapse?.addEventListener("hidden.bs.collapse", syncFiltersToggleLabel);
    syncFiltersToggleLabel();

    applyFilters();
})();
