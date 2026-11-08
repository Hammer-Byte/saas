(() => {
    const FILTERS_STORAGE_KEY = "gem-tenders-filters";
    const dateForm = document.getElementById("gem-tenders-date-form");
    const fromInput = document.getElementById("gem-tenders-from");
    const toInput = document.getElementById("gem-tenders-to");
    const keywordFilter = document.getElementById("gem-filter-keyword");
    const stageFilter = document.getElementById("gem-filter-stage");
    const assigneeFilter = document.getElementById("gem-filter-assignee");
    const multiFilters = [keywordFilter, stageFilter, assigneeFilter].filter(Boolean);
    const showAllFilter = document.getElementById("gem-filter-show-all");
    const quantityUptoFilter = document.getElementById("gem-filter-quantity-upto");
    const quantityClearBtn = document.getElementById("gem-filter-quantity-clear");
    const resetFiltersBtn = document.getElementById("gem-filters-reset-btn");
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

    function multiFilterOptions(root) {
        return Array.from(root?.querySelectorAll(".gem-multi-filter-option") || []);
    }

    function selectedMultiValues(root) {
        return multiFilterOptions(root)
            .filter((input) => input.checked)
            .map((input) => String(input.value || "").trim())
            .filter(Boolean);
    }

    function selectedMultiLabels(root) {
        return multiFilterOptions(root)
            .filter((input) => input.checked)
            .map((input) => String(input.dataset.label || input.value || "").trim())
            .filter(Boolean);
    }

    function setSelectedMultiValues(root, values) {
        if (!root) return;
        const wanted = new Set(
            (Array.isArray(values) ? values : values != null && values !== "" ? [values] : []).map(
                (value) => String(value),
            ),
        );
        for (const input of multiFilterOptions(root)) {
            input.checked = wanted.has(String(input.value));
        }
        updateMultiFilterLabel(root);
    }

    function updateMultiFilterLabel(root) {
        if (!root) return;
        const labelEl = root.querySelector(".gem-multi-filter-label");
        if (!labelEl) return;
        const emptyLabel = root.dataset.emptyLabel || "All";
        const labels = selectedMultiLabels(root);
        if (!labels.length) {
            labelEl.textContent = emptyLabel;
            return;
        }
        if (labels.length <= 2) {
            labelEl.textContent = labels.join(", ");
            return;
        }
        labelEl.textContent = `${labels.slice(0, 2).join(", ")} +${labels.length - 2}`;
    }

    function collectFilters() {
        const columns = {};
        for (const select of columnFilters) {
            const column = select.dataset.column;
            if (!column) continue;
            columns[column] = select.value || "";
        }
        return {
            from: window.getWritableDate?.("YYYY-MM-DD", fromInput?.value || "") || "",
            to: window.getWritableDate?.("YYYY-MM-DD", toInput?.value || "") || "",
            keywords: selectedMultiValues(keywordFilter),
            stages: selectedMultiValues(stageFilter),
            assignees: selectedMultiValues(assigneeFilter),
            search: searchInput?.value || "",
            showAll: !!showAllFilter?.checked,
            quantityUpto: quantityUptoFilter?.value || "",
            columns,
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
    const sortableHeaders = Array.from(
        document.querySelectorAll("#gem-tenders-table thead th.gem-tenders-sortable"),
    );
    let sortState = { key: null, direction: "asc" };

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

    function sortValue(row, key) {
        if (key === "quantity") {
            const quantity = Number(row.dataset.quantity || 0);
            return Number.isFinite(quantity) ? quantity : 0;
        }
        if (key === "endAt") {
            return String(row.dataset.endAt || "").trim();
        }
        return "";
    }

    function compareRows(left, right, key, direction) {
        const leftValue = sortValue(left, key);
        const rightValue = sortValue(right, key);
        let result = 0;
        if (typeof leftValue === "number" && typeof rightValue === "number") {
            result = leftValue - rightValue;
        } else {
            result = String(leftValue).localeCompare(String(rightValue), undefined, {
                numeric: true,
                sensitivity: "base",
            });
        }
        return direction === "desc" ? -result : result;
    }

    function applySort() {
        if (!sortState.key) {
            for (const header of sortableHeaders) {
                header.setAttribute("aria-sort", "none");
            }
            return;
        }

        rows.sort((left, right) =>
            compareRows(left, right, sortState.key, sortState.direction),
        );
        for (const row of rows) {
            tableBody.appendChild(row);
        }

        for (const header of sortableHeaders) {
            if (header.dataset.sortKey === sortState.key) {
                header.setAttribute(
                    "aria-sort",
                    sortState.direction === "asc" ? "ascending" : "descending",
                );
            } else {
                header.setAttribute("aria-sort", "none");
            }
        }
    }

    function toggleSort(key) {
        if (!key) return;
        if (sortState.key === key) {
            sortState.direction = sortState.direction === "asc" ? "desc" : "asc";
        } else {
            sortState = { key, direction: "asc" };
        }
        applySort();
        syncBulkBar();
    }

    for (const header of sortableHeaders) {
        header.addEventListener("click", () => {
            toggleSort(header.dataset.sortKey);
        });
        header.addEventListener("keydown", (event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            toggleSort(header.dataset.sortKey);
        });
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

    function rowQuantityValue(row) {
        const raw = row.getAttribute("data-quantity");
        const quantity = Number(raw);
        return Number.isFinite(quantity) ? quantity : 0;
    }

    function applyFilters() {
        const query = (searchInput?.value || "").trim().toLowerCase();
        const selectedKeywords = selectedMultiValues(keywordFilter);
        const selectedStages = selectedMultiValues(stageFilter);
        const selectedAssignees = selectedMultiValues(assigneeFilter);
        const showHiddenStages = !!showAllFilter?.checked;
        const quantityUptoRaw = String(quantityUptoFilter?.value ?? "").trim();
        const quantityUpto = quantityUptoRaw === "" ? null : Number(quantityUptoRaw);
        const hasQuantityUpto =
            quantityUpto != null && Number.isFinite(quantityUpto) && quantityUpto > 0;
        const activeColumnFilters = columnFilters
            .map((select) => ({
                column: select.dataset.column,
                value: (select.value || "").trim().toLowerCase(),
            }))
            .filter((filter) => filter.column && filter.value);

        let visibleCount = 0;

        for (const row of rows) {
            const rowStage = String(row.dataset.stage || "new");
            const isHiddenStage =
                rowStage === "out_of_scope" || rowStage === "unattended";
            const matchesHiddenStages =
                showHiddenStages ||
                selectedStages.includes("out_of_scope") ||
                selectedStages.includes("unattended") ||
                !isHiddenStage;

            const rowKeywordId = String(row.dataset.keywordId || "");
            const matchesKeyword =
                !selectedKeywords.length || selectedKeywords.includes(rowKeywordId);

            const matchesStage =
                !selectedStages.length || selectedStages.includes(rowStage);

            const rowAssigneeId = String(row.dataset.assigneeUserId || "");
            const matchesAssignee =
                !selectedAssignees.length ||
                selectedAssignees.some((value) =>
                    value === "unassigned" ? !rowAssigneeId : rowAssigneeId === value,
                );

            const matchesSearch = !query || row.textContent.toLowerCase().includes(query);

            const matchesColumns = activeColumnFilters.every((filter) => {
                const cellValue = (row.dataset[filter.column] || "").trim().toLowerCase();
                return cellValue === filter.value;
            });

            const rowQuantity = rowQuantityValue(row);
            // Known qty only: NA (0 / missing) is excluded when a max is set.
            const matchesQuantity =
                !hasQuantityUpto || (rowQuantity > 0 && rowQuantity <= quantityUpto);

            const visible =
                matchesHiddenStages &&
                matchesKeyword &&
                matchesStage &&
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

        const hasLoadedRows = rows.length > 0;
        const showEmpty = !hasLoadedRows || visibleCount === 0;
        tableWrap?.classList.toggle("d-none", showEmpty);
        emptyState?.classList.toggle("d-none", !showEmpty);
        if (emptyState) {
            emptyState.textContent = !hasLoadedRows
                ? "No tenders ending in this date range."
                : "No tenders match the current filters.";
        }
        syncBulkBar();
        saveFilters();
    }

    function restoreClientFilters(filters) {
        if (!filters) return;
        if (keywordFilter) {
            const keywords =
                Array.isArray(filters.keywords)
                    ? filters.keywords
                    : filters.keywordId != null && filters.keywordId !== ""
                      ? [filters.keywordId]
                      : [];
            setSelectedMultiValues(keywordFilter, keywords);
        }
        if (stageFilter) {
            const stages =
                Array.isArray(filters.stages)
                    ? filters.stages
                    : filters.stage != null && filters.stage !== ""
                      ? [filters.stage]
                      : [];
            setSelectedMultiValues(stageFilter, stages);
        }
        if (assigneeFilter) {
            const assignees =
                Array.isArray(filters.assignees)
                    ? filters.assignees
                    : filters.assignee != null && filters.assignee !== ""
                      ? [filters.assignee]
                      : [];
            setSelectedMultiValues(assigneeFilter, assignees);
        }
        if (searchInput && filters.search != null) {
            searchInput.value = filters.search;
        }
        if (showAllFilter && typeof filters.showAll === "boolean") {
            showAllFilter.checked = filters.showAll;
        }
        if (quantityUptoFilter && filters.quantityUpto != null && filters.quantityUpto !== "") {
            const restoredQty = Number(filters.quantityUpto);
            quantityUptoFilter.value =
                Number.isFinite(restoredQty) && restoredQty > 0 ? String(restoredQty) : "";
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

    function resetClientFilters() {
        setSelectedMultiValues(keywordFilter, []);
        setSelectedMultiValues(stageFilter, []);
        setSelectedMultiValues(assigneeFilter, []);
        if (searchInput) searchInput.value = "";
        if (showAllFilter) showAllFilter.checked = false;
        if (quantityUptoFilter) quantityUptoFilter.value = "";
        for (const select of columnFilters) {
            select.value = "";
        }
        applyFilters();
    }

    for (const select of columnFilters) {
        fillColumnFilter(select);
        select.addEventListener("change", applyFilters);
    }

    for (const root of multiFilters) {
        updateMultiFilterLabel(root);
        root.addEventListener("change", (event) => {
            if (!event.target?.classList?.contains("gem-multi-filter-option")) return;
            updateMultiFilterLabel(root);
            applyFilters();
        });
    }

    restoreClientFilters(storedFilters);

    showAllFilter?.addEventListener("change", applyFilters);
    quantityUptoFilter?.addEventListener("input", applyFilters);
    quantityUptoFilter?.addEventListener("change", applyFilters);
    quantityUptoFilter?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            applyFilters();
        }
    });
    quantityClearBtn?.addEventListener("click", () => {
        if (quantityUptoFilter) quantityUptoFilter.value = "";
        applyFilters();
    });
    resetFiltersBtn?.addEventListener("click", () => {
        resetClientFilters();
    });
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

        const targets = canAssignOthers
            ? selected
            : selected.filter((checkbox) => {
                  const row = checkbox.closest("tr");
                  return !String(row?.dataset.assigneeUserId || "").trim();
              });

        if (!targets.length) {
            if (bulkStatus) {
                bulkStatus.textContent = canAssignOthers
                    ? "No tenders selected."
                    : "Selected tenders already have an assignee.";
                bulkStatus.classList.remove("d-none", "text-secondary");
                bulkStatus.classList.add("text-danger");
            }
            return;
        }

        bulkAssignBtn.disabled = true;
        if (bulkStatus) {
            bulkStatus.textContent = `Assigning ${targets.length} tender(s)…`;
            bulkStatus.classList.remove("d-none", "text-danger");
            bulkStatus.classList.add("text-secondary");
        }

        let successCount = 0;
        let failCount = 0;

        for (const checkbox of targets) {
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
