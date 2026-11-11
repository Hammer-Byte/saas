(() => {
    const FILTERS_STORAGE_KEY = "gem-tenders-filters";
    const fromInput = document.getElementById("gem-tenders-from");
    const toInput = document.getElementById("gem-tenders-to");
    const keywordFilter = document.getElementById("gem-filter-keyword");
    const stageFilter = document.getElementById("gem-filter-stage");
    const assigneeFilter = document.getElementById("gem-filter-assignee");
    const multiFilters = [keywordFilter, stageFilter, assigneeFilter].filter(Boolean);
    const showAllFilter = document.getElementById("gem-filter-show-all");
    const quantityUptoFilter = document.getElementById("gem-filter-quantity-upto");
    const quoteFilter = document.getElementById("gem-filter-quote");
    const resetFiltersBtn = document.getElementById("gem-filters-reset-btn");
    const applyFiltersBtn = document.getElementById("gem-filters-apply-btn");
    const filtersPanel = document.getElementById("gem-tenders-filters-panel");
    const searchInput = document.getElementById("gem-tenders-search");
    const tableBody = document.getElementById("gem-tenders-tbody");
    const tableWrap = document.getElementById("gem-tenders-table-wrap");
    const emptyState = document.getElementById("gem-tenders-empty");
    const loadingState = document.getElementById("gem-tenders-loading");
    const filterStatus = document.getElementById("gem-tenders-filter-status");
    let listReady = false;
    const columnFilters = Array.from(document.querySelectorAll(".gem-tender-column-filter"));
    const pageFrom =
        fromInput?.dataset.pageFrom ||
        new URL(window.location.href).searchParams.get("from") ||
        "";
    const pageTo =
        toInput?.dataset.pageTo ||
        new URL(window.location.href).searchParams.get("to") ||
        "";

    function emptyFilters(from = pageFrom, to = pageTo) {
        return {
            from: from || "",
            to: to || "",
            keywords: [],
            stages: [],
            assignees: [],
            search: "",
            showAll: false,
            quantityUpto: "",
            quote: "",
            columns: {},
        };
    }

    let appliedFilters = emptyFilters();
    const selectAllCheckbox = document.getElementById("gem-tenders-select-all");
    const bulkBar = document.getElementById("gem-tenders-bulk-assign-bar");
    const bulkAssignee = document.getElementById("gem-bulk-assignee");
    const bulkAssignBtn = document.getElementById("gem-bulk-assign-btn");
    const bulkClearBtn = document.getElementById("gem-bulk-clear-btn");
    const bulkStatus = document.getElementById("gem-bulk-assign-status");
    const selectedCountLabel = document.getElementById("gem-tenders-selected-count");
    const bulkStageBar = document.getElementById("gem-tenders-bulk-stage-bar");
    const bulkStageSelect = document.getElementById("gem-bulk-stage");
    const bulkStageComment = document.getElementById("gem-bulk-stage-comment");
    const bulkStageBtn = document.getElementById("gem-bulk-stage-btn");
    const bulkStageClearBtn = document.getElementById("gem-bulk-stage-clear-btn");
    const bulkStageStatus = document.getElementById("gem-bulk-stage-status");
    const stageSelectedCountLabel = document.getElementById("gem-tenders-stage-selected-count");
    const currentUserId = Number(bulkBar?.dataset.currentUserId || 0);
    const canAssignOthers = bulkBar?.dataset.canAssignOthers === "1";
    const canBulkChangeStage =
        bulkBar?.dataset.canBulkChangeStage === "1" || !!bulkStageBar;

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

    function normalizeDateInput(value, fallback = "") {
        const raw = String(value || "").trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
        const parsed = window.getWritableDate?.("YYYY-MM-DD", raw) || "";
        if (/^\d{4}-\d{2}-\d{2}$/.test(parsed)) return parsed;
        const fallbackRaw = String(fallback || "").trim();
        return /^\d{4}-\d{2}-\d{2}$/.test(fallbackRaw) ? fallbackRaw : "";
    }

    function readFiltersFromDom() {
        const columns = {};
        for (const select of columnFilters) {
            const column = select.dataset.column;
            if (!column) continue;
            columns[column] = String(select.value || "").trim();
        }
        const quote = String(quoteFilter?.value || "").trim();
        return {
            from: normalizeDateInput(fromInput?.value || "", pageFrom),
            to: normalizeDateInput(toInput?.value || "", pageTo),
            keywords: selectedMultiValues(keywordFilter),
            stages: selectedMultiValues(stageFilter),
            assignees: selectedMultiValues(assigneeFilter),
            search: String(searchInput?.value || "").trim(),
            showAll: !!showAllFilter?.checked,
            quantityUpto: String(quantityUptoFilter?.value || "").trim(),
            quote: quote === "given" || quote === "missing" ? quote : "",
            columns,
        };
    }

    function writeFiltersToDom(filters) {
        if (!filters) return;
        if (fromInput && filters.from) fromInput.value = filters.from;
        if (toInput && filters.to) toInput.value = filters.to;
        setSelectedMultiValues(keywordFilter, filters.keywords || []);
        setSelectedMultiValues(stageFilter, filters.stages || []);
        setSelectedMultiValues(assigneeFilter, filters.assignees || []);
        if (searchInput) searchInput.value = filters.search || "";
        if (showAllFilter) showAllFilter.checked = !!filters.showAll;
        if (quantityUptoFilter) {
            const qty = Number(filters.quantityUpto);
            quantityUptoFilter.value =
                Number.isFinite(qty) && qty > 0 ? String(qty) : "";
        }
        if (quoteFilter) {
            quoteFilter.value =
                filters.quote === "given" || filters.quote === "missing"
                    ? filters.quote
                    : "";
        }
        const columns =
            filters.columns && typeof filters.columns === "object" ? filters.columns : {};
        for (const select of columnFilters) {
            const column = select.dataset.column;
            if (!column) continue;
            const value = columns[column] == null ? "" : String(columns[column]);
            select.value = [...select.options].some((option) => option.value === value)
                ? value
                : "";
        }
    }

    function closeFiltersPanel() {
        const instance = window.bootstrap?.Offcanvas?.getInstance?.(filtersPanel);
        instance?.hide();
    }

    function commitFilters({ reloadIfDatesChanged = true } = {}) {
        const filters = readFiltersFromDom();
        const from = filters.from;
        const to = filters.to;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
            window.alert("Select valid Ends from and Ends to dates.");
            return false;
        }

        appliedFilters = filters;
        writeStoredFilters(appliedFilters);

        if (reloadIfDatesChanged && (from !== pageFrom || to !== pageTo)) {
            const url = new URL(window.location.href);
            url.searchParams.set("from", from);
            url.searchParams.set("to", to);
            window.location.assign(url.toString());
            return true;
        }

        applyFilters();
        closeFiltersPanel();
        return true;
    }

    function parseEndAtMs(value) {
        if (!value) return null;
        const normalized =
            window.getWritableDate?.("YYYY-MM-DD HH:mm:ss", value) ||
            String(value).trim().replace(" ", "T");
        const parsed = Date.parse(normalized);
        return Number.isFinite(parsed) ? parsed : null;
    }

    function markEndsSoonRows() {
        const nowMs = Date.now();
        const windowMs = 24 * 60 * 60 * 1000;
        for (const row of rows) {
            const endMs = parseEndAtMs(row.dataset.endAt);
            const endsSoon =
                endMs != null && endMs >= nowMs && endMs - nowMs <= windowMs;
            const isFiled = String(row.dataset.stage || "") === "filed";
            row.classList.toggle("gem-tender-ends-soon", endsSoon && !isFiled);
            row.classList.toggle("gem-tender-ends-soon-filed", endsSoon && isFiled);
        }
    }

    function finishListLoading() {
        if (listReady) return;
        listReady = true;
        loadingState?.classList.add("d-none");
        tableWrap?.setAttribute("aria-busy", "false");
        applyFilters();
    }

    const addTenderForm = document.getElementById("gem-add-tender-form");
    const addTenderQuery = document.getElementById("gem-add-tender-query");
    const addTenderExact = document.getElementById("gem-add-tender-exact-search");
    const addTenderSubmit = document.getElementById("gem-add-tender-submit-btn");
    const addTenderAlert = document.getElementById("gem-add-tender-alert");
    const addTenderModalEl = document.getElementById("gem-add-tender-modal");

    function showAddTenderAlert(message, type) {
        if (!addTenderAlert) return;
        addTenderAlert.textContent = message;
        addTenderAlert.className = `alert alert-${type}`;
        addTenderAlert.classList.remove("d-none");
    }

    function parseAddTenderQueries(raw) {
        const queries = [];
        const seen = new Set();
        for (const line of String(raw || "").split(/\r?\n/)) {
            const query = line.trim();
            if (!query) continue;
            const key = query.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            queries.push(query.slice(0, 255));
            if (queries.length >= 50) break;
        }
        return queries;
    }

    addTenderForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const queries = parseAddTenderQueries(addTenderQuery?.value || "");
        if (!queries.length) {
            addTenderQuery?.focus();
            return;
        }

        if (addTenderSubmit) addTenderSubmit.disabled = true;
        try {
            const response = await fetch("/api/gem-keyword-tenders/adhoc-scan", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    queries,
                    exact_search: !!addTenderExact?.checked,
                }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showAddTenderAlert(data.error || "Failed to start scan.", "danger");
                if (addTenderSubmit) addTenderSubmit.disabled = false;
                return;
            }

            const modal = window.bootstrap?.Modal?.getInstance?.(addTenderModalEl);
            modal?.hide();
            addTenderForm.reset();
            showAddTenderAlert(
                data.message || "Scan started. Matching tenders will appear after the scan finishes.",
                "success",
            );
        } catch (error) {
            console.error(error);
            showAddTenderAlert("Failed to start scan.", "danger");
        } finally {
            if (addTenderSubmit) addTenderSubmit.disabled = false;
        }
    });

    addTenderModalEl?.addEventListener("shown.bs.modal", () => {
        addTenderQuery?.focus();
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
        if (stageSelectedCountLabel) {
            stageSelectedCountLabel.textContent = `${count} selected`;
        }
        bulkBar?.classList.toggle("d-none", count === 0);
        if (canBulkChangeStage) {
            bulkStageBar?.classList.toggle("d-none", count === 0);
        }
        if (bulkAssignBtn) {
            bulkAssignBtn.disabled = count === 0 || !bulkAssignee?.value;
        }
        if (bulkStageBtn) {
            const hasStage = !!(bulkStageSelect?.value || "").trim();
            const hasComment = !!(bulkStageComment?.value || "").trim();
            bulkStageBtn.disabled = count === 0 || !hasStage || !hasComment;
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
        if (bulkStageStatus) {
            bulkStageStatus.classList.add("d-none");
            bulkStageStatus.textContent = "";
        }
        syncBulkBar();
    }

    function rowQuantityValue(row) {
        const raw = row.getAttribute("data-quantity");
        const quantity = Number(raw);
        return Number.isFinite(quantity) ? quantity : 0;
    }

    function applyFilters() {
        const query = String(appliedFilters.search || "").trim().toLowerCase();
        const selectedKeywords = (appliedFilters.keywords || []).map(String);
        const selectedStages = (appliedFilters.stages || []).map(String);
        const selectedAssignees = (appliedFilters.assignees || []).map(String);
        const showHiddenStages = !!appliedFilters.showAll;
        const quantityUptoRaw = String(appliedFilters.quantityUpto ?? "").trim();
        const quantityUpto = quantityUptoRaw === "" ? null : Number(quantityUptoRaw);
        const hasQuantityUpto =
            quantityUpto != null && Number.isFinite(quantityUpto) && quantityUpto > 0;
        const quoteFilterValue = String(appliedFilters.quote || "").trim();
        const columns =
            appliedFilters.columns && typeof appliedFilters.columns === "object"
                ? appliedFilters.columns
                : {};
        const activeColumnFilters = Object.entries(columns)
            .map(([column, value]) => ({
                column,
                value: String(value || "").trim().toLowerCase(),
            }))
            .filter((filter) => filter.column && filter.value);

        let visibleCount = 0;

        for (const row of rows) {
            const rowStage = String(row.dataset.stage || "new");
            const isHiddenStage =
                rowStage === "out_of_scope" ||
                rowStage === "not_eligible" ||
                rowStage === "unattended" ||
                rowStage === "missed";
            const matchesHiddenStages =
                showHiddenStages ||
                selectedStages.includes("out_of_scope") ||
                selectedStages.includes("not_eligible") ||
                selectedStages.includes("unattended") ||
                selectedStages.includes("missed") ||
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

            const tenderIdText = String(
                row.querySelector("a")?.textContent || "",
            )
                .trim()
                .toLowerCase();
            const matchesSearch =
                !query ||
                tenderIdText.includes(query) ||
                rowKeywordId === query ||
                String(row.dataset.id || "") === query;

            const matchesColumns = activeColumnFilters.every((filter) => {
                const cellValue = (row.dataset[filter.column] || "").trim().toLowerCase();
                return cellValue === filter.value;
            });

            const rowQuantity = rowQuantityValue(row);
            // Known qty only: NA (0 / missing) is excluded when a max is set.
            const matchesQuantity =
                !hasQuantityUpto || (rowQuantity > 0 && rowQuantity <= quantityUpto);

            const hasQuote = row.dataset.hasQuote === "1";
            const matchesQuote =
                !quoteFilterValue ||
                (quoteFilterValue === "given" ? hasQuote : !hasQuote);

            const visible =
                matchesHiddenStages &&
                matchesKeyword &&
                matchesStage &&
                matchesAssignee &&
                matchesSearch &&
                matchesColumns &&
                matchesQuantity &&
                matchesQuote;
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
        if (listReady) {
            loadingState?.classList.add("d-none");
            tableWrap?.classList.toggle("d-none", showEmpty);
            emptyState?.classList.toggle("d-none", !showEmpty);
        }
        if (emptyState) {
            emptyState.textContent = !hasLoadedRows
                ? "No tenders ending in this date range."
                : "No tenders match the current filters.";
        }
        markEndsSoonRows();
        syncBulkBar();
        writeStoredFilters(appliedFilters);
    }

    function normalizeStoredFilters(filters) {
        if (!filters || typeof filters !== "object") return emptyFilters();
        const keywords = Array.isArray(filters.keywords)
            ? filters.keywords
            : filters.keywordId != null && filters.keywordId !== ""
              ? [filters.keywordId]
              : [];
        const stages = Array.isArray(filters.stages)
            ? filters.stages
            : filters.stage != null && filters.stage !== ""
              ? [filters.stage]
              : [];
        const assignees = Array.isArray(filters.assignees)
            ? filters.assignees
            : filters.assignee != null && filters.assignee !== ""
              ? [filters.assignee]
              : [];
        const columns =
            filters.columns && typeof filters.columns === "object" ? filters.columns : {};
        const quantityRaw = String(filters.quantityUpto ?? "").trim();
        const quantity = Number(quantityRaw);
        return {
            from: normalizeDateInput(filters.from, pageFrom),
            to: normalizeDateInput(filters.to, pageTo),
            keywords: keywords.map(String).filter(Boolean),
            stages: stages.map(String).filter(Boolean),
            assignees: assignees.map(String).filter(Boolean),
            search: String(filters.search || "").trim(),
            showAll: !!filters.showAll,
            quantityUpto:
                Number.isFinite(quantity) && quantity > 0 ? String(quantity) : "",
            quote:
                filters.quote === "given" || filters.quote === "missing"
                    ? filters.quote
                    : "",
            columns,
        };
    }

    function resetClientFilters() {
        if (fromInput) fromInput.value = pageFrom;
        if (toInput) toInput.value = pageTo;
        writeFiltersToDom(emptyFilters());
        commitFilters({ reloadIfDatesChanged: false });
    }

    for (const select of columnFilters) {
        fillColumnFilter(select);
    }

    for (const root of multiFilters) {
        updateMultiFilterLabel(root);
        root.addEventListener("change", (event) => {
            if (!event.target?.classList?.contains("gem-multi-filter-option")) return;
            updateMultiFilterLabel(root);
        });
    }

    appliedFilters = normalizeStoredFilters({
        ...emptyFilters(),
        ...(storedFilters || {}),
        from: pageFrom,
        to: pageTo,
    });
    writeFiltersToDom(appliedFilters);

    filtersPanel?.addEventListener("show.bs.offcanvas", () => {
        writeFiltersToDom(appliedFilters);
    });

    function formatIsoDate(date) {
        const year = date.getFullYear();
        const month = `${date.getMonth() + 1}`.padStart(2, "0");
        const day = `${date.getDate()}`.padStart(2, "0");
        return `${year}-${month}-${day}`;
    }

    function startOfIndianQuarter(date) {
        const year = date.getFullYear();
        const month = date.getMonth(); // 0-11
        // Indian FY quarters: Apr-Jun, Jul-Sep, Oct-Dec, Jan-Mar
        if (month <= 2) return new Date(year, 0, 1); // Jan-Mar
        if (month <= 5) return new Date(year, 3, 1); // Apr-Jun
        if (month <= 8) return new Date(year, 6, 1); // Jul-Sep
        return new Date(year, 9, 1); // Oct-Dec
    }

    function endOfIndianQuarter(date) {
        const year = date.getFullYear();
        const month = date.getMonth();
        if (month <= 2) return new Date(year, 2, 31); // Jan-Mar
        if (month <= 5) return new Date(year, 5, 30); // Apr-Jun
        if (month <= 8) return new Date(year, 8, 30); // Jul-Sep
        return new Date(year, 11, 31); // Oct-Dec
    }

    function startOfWeekMonday(date) {
        const value = new Date(date);
        const weekday = value.getDay(); // 0 Sun .. 6 Sat
        const offset = weekday === 0 ? -6 : 1 - weekday;
        value.setDate(value.getDate() + offset);
        return value;
    }

    function setQuickDateRange(range) {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        let fromDate = new Date(now);
        let toDate = new Date(now);

        if (range === "today") {
            fromDate = now;
            toDate = now;
        } else if (range === "this-week") {
            fromDate = startOfWeekMonday(now);
            toDate = new Date(fromDate);
            toDate.setDate(toDate.getDate() + 6);
        } else if (range === "next-15-days") {
            fromDate = now;
            toDate = new Date(now);
            toDate.setDate(toDate.getDate() + 15);
        } else if (range === "this-month") {
            fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
            toDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        } else if (range === "last-month") {
            fromDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            toDate = new Date(now.getFullYear(), now.getMonth(), 0);
        } else if (range === "this-quarter") {
            fromDate = startOfIndianQuarter(now);
            toDate = endOfIndianQuarter(now);
        } else if (range === "last-quarter") {
            const previous = new Date(startOfIndianQuarter(now));
            previous.setDate(previous.getDate() - 1);
            fromDate = startOfIndianQuarter(previous);
            toDate = endOfIndianQuarter(previous);
        } else {
            return;
        }

        if (fromInput) fromInput.value = formatIsoDate(fromDate);
        if (toInput) toInput.value = formatIsoDate(toDate);
    }

    filtersPanel?.addEventListener("click", (event) => {
        const quickBtn = event.target?.closest?.(".gem-date-quick-btn");
        if (quickBtn) {
            setQuickDateRange(quickBtn.dataset.range || "");
            return;
        }

        const clearBtn = event.target?.closest?.(".gem-filter-clear-btn");
        if (!clearBtn) return;

        const multiId = clearBtn.dataset.clearMulti;
        if (multiId) {
            setSelectedMultiValues(document.getElementById(multiId), []);
            return;
        }

        const selectId = clearBtn.dataset.clearSelect;
        if (selectId) {
            const select = document.getElementById(selectId);
            if (select) select.value = "";
            return;
        }

        const inputId = clearBtn.dataset.clearInput;
        if (inputId) {
            const input = document.getElementById(inputId);
            if (input) input.value = "";
        }
    });

    applyFiltersBtn?.addEventListener("click", () => {
        commitFilters();
    });
    resetFiltersBtn?.addEventListener("click", () => {
        resetClientFilters();
    });

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

    bulkStageClearBtn?.addEventListener("click", () => {
        clearSelection();
    });

    bulkStageSelect?.addEventListener("change", () => {
        syncBulkBar();
    });

    bulkStageComment?.addEventListener("input", () => {
        syncBulkBar();
    });

    bulkStageBtn?.addEventListener("click", async () => {
        if (!canBulkChangeStage) return;

        const selected = selectedCheckboxes();
        const stage = String(bulkStageSelect?.value || "").trim();
        const comment = String(bulkStageComment?.value || "").trim();
        if (!selected.length) return;
        if (!stage) {
            if (bulkStageStatus) {
                bulkStageStatus.textContent = "Stage is required.";
                bulkStageStatus.classList.remove("d-none", "text-secondary");
                bulkStageStatus.classList.add("text-danger");
            }
            return;
        }
        if (!comment) {
            if (bulkStageStatus) {
                bulkStageStatus.textContent = "Comment is required.";
                bulkStageStatus.classList.remove("d-none", "text-secondary");
                bulkStageStatus.classList.add("text-danger");
            }
            return;
        }

        const ids = selected
            .map((checkbox) => Number(checkbox.value || 0))
            .filter((id) => id >= 1);
        if (!ids.length) return;

        bulkStageBtn.disabled = true;
        if (bulkStageStatus) {
            bulkStageStatus.textContent = `Changing stage on ${ids.length} tender(s)…`;
            bulkStageStatus.classList.remove("d-none", "text-danger");
            bulkStageStatus.classList.add("text-secondary");
        }

        try {
            const response = await fetch("/api/gem-keyword-tenders/bulk-change-stage", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids, stage, comment }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                if (bulkStageStatus) {
                    bulkStageStatus.textContent =
                        payload?.error || "Failed to change stage.";
                    bulkStageStatus.classList.remove("text-secondary");
                    bulkStageStatus.classList.add("text-danger");
                }
                bulkStageBtn.disabled = false;
                syncBulkBar();
                return;
            }

            if (!payload.failedCount) {
                window.location.reload();
                return;
            }

            if (bulkStageStatus) {
                bulkStageStatus.textContent =
                    payload.message ||
                    `Updated ${payload.successCount || 0}, failed ${payload.failedCount || 0}.`;
                bulkStageStatus.classList.remove("text-secondary");
                bulkStageStatus.classList.add("text-danger");
            }
            bulkStageBtn.disabled = false;
            syncBulkBar();
        } catch (error) {
            console.error(error);
            if (bulkStageStatus) {
                bulkStageStatus.textContent = "Failed to change stage.";
                bulkStageStatus.classList.remove("text-secondary");
                bulkStageStatus.classList.add("text-danger");
            }
            bulkStageBtn.disabled = false;
            syncBulkBar();
        }
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

    // Wait until layout/filters settle so users don't see a half-filtered flash.
    window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
            finishListLoading();
        });
    });
})();
