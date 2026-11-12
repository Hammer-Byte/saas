(() => {
    const FILTERS_STORAGE_KEY = "gem-tenders-filters";
    const fromInput = document.getElementById("gem-tenders-from");
    const toInput = document.getElementById("gem-tenders-to");
    const categoryFilter = document.getElementById("gem-filter-category");
    const stageFilter = document.getElementById("gem-filter-stage");
    const assigneeFilter = document.getElementById("gem-filter-assignee");
    const multiFilters = [categoryFilter, stageFilter, assigneeFilter].filter(Boolean);
    const showAllFilter = document.getElementById("gem-filter-show-all");
    const quantityUptoFilter = document.getElementById("gem-filter-quantity-upto");
    const resetFiltersBtn = document.getElementById("gem-filters-reset-btn");
    const applyFiltersBtn = document.getElementById("gem-filters-apply-btn");
    const refreshBtn = document.getElementById("gem-tenders-refresh-btn");
    const reportLink = document.getElementById("gem-tenders-report-link");
    const filtersPanel = document.getElementById("gem-tenders-filters-panel");
    const searchInput = document.getElementById("gem-tenders-search");
    const tableEl = document.getElementById("gem-tenders-table");
    const tableBody = document.getElementById("gem-tenders-tbody");
    const tableWrap = document.getElementById("gem-tenders-table-wrap");
    const emptyState = document.getElementById("gem-tenders-empty");
    const loadingState = document.getElementById("gem-tenders-loading");
    const filterStatus = document.getElementById("gem-tenders-filter-status");
    const rangeHighlight = document.querySelector(".gem-tenders-range-highlight");
    let listReady = false;
    let listFetchSeq = 0;
    let listFetchAbort = null;
    let listLoading = false;
    const columnFilters = Array.from(document.querySelectorAll(".gem-tender-column-filter"));
    let pageFrom =
        fromInput?.dataset.pageFrom ||
        new URL(window.location.href).searchParams.get("from") ||
        "";
    let pageTo =
        toInput?.dataset.pageTo ||
        new URL(window.location.href).searchParams.get("to") ||
        "";
    let stageLabels = {};
    try {
        stageLabels = JSON.parse(tableEl?.dataset?.stageLabels || "{}") || {};
    } catch {
        stageLabels = {};
    }
    /** Replaced after table rows are available. */
    let reloadTendersFromServer = async () => {};

    function emptyFilters(from = pageFrom, to = pageTo) {
        return {
            from: from || "",
            to: to || "",
            categories: [],
            stages: [],
            assignees: [],
            search: "",
            showAll: false,
            quantityUpto: "",
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
        return {
            from: normalizeDateInput(fromInput?.value || "", pageFrom),
            to: normalizeDateInput(toInput?.value || "", pageTo),
            categories: selectedMultiValues(categoryFilter),
            stages: selectedMultiValues(stageFilter),
            assignees: selectedMultiValues(assigneeFilter),
            search: String(searchInput?.value || "").trim(),
            showAll: !!showAllFilter?.checked,
            quantityUpto: String(quantityUptoFilter?.value || "").trim(),
            columns,
        };
    }

    function writeFiltersToDom(filters) {
        if (!filters) return;
        if (fromInput && filters.from) fromInput.value = filters.from;
        if (toInput && filters.to) toInput.value = filters.to;
        setSelectedMultiValues(categoryFilter, filters.categories || []);
        setSelectedMultiValues(stageFilter, filters.stages || []);
        setSelectedMultiValues(assigneeFilter, filters.assignees || []);
        if (searchInput) searchInput.value = filters.search || "";
        if (showAllFilter) showAllFilter.checked = !!filters.showAll;
        if (quantityUptoFilter) {
            const qty = Number(filters.quantityUpto);
            quantityUptoFilter.value =
                Number.isFinite(qty) && qty > 0 ? String(qty) : "";
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

    function syncRangeInUrlAndHeader(from, to) {
        pageFrom = from;
        pageTo = to;
        if (fromInput) {
            fromInput.dataset.pageFrom = from;
        }
        if (toInput) {
            toInput.dataset.pageTo = to;
        }

        const url = new URL(window.location.href);
        url.searchParams.set("from", from);
        url.searchParams.set("to", to);
        window.history.replaceState({}, "", url.toString());

        if (reportLink) {
            reportLink.href = `/app/gem-keyword-tender-report?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
        }

        const rangeSpans = rangeHighlight?.querySelectorAll("[data-readable-date]");
        if (rangeSpans?.[0]) {
            rangeSpans[0].dataset.readableDate = from;
            rangeSpans[0].textContent =
                window.getReadableDate?.("DD/MM/YYYY", from) || from;
        }
        if (rangeSpans?.[1]) {
            rangeSpans[1].dataset.readableDate = to;
            rangeSpans[1].textContent =
                window.getReadableDate?.("DD/MM/YYYY", to) || to;
        }
    }

    function setListLoading(isLoading) {
        listLoading = !!isLoading;
        if (refreshBtn) {
            refreshBtn.disabled = listLoading;
            refreshBtn.classList.toggle("is-loading", listLoading);
        }
        if (applyFiltersBtn) applyFiltersBtn.disabled = listLoading;
        if (resetFiltersBtn) resetFiltersBtn.disabled = listLoading;
        if (listLoading) {
            loadingState?.classList.remove("d-none");
            tableWrap?.classList.add("d-none");
            emptyState?.classList.add("d-none");
        } else if (listReady) {
            loadingState?.classList.add("d-none");
            // applyFilters restores table/empty visibility
        }
        tableWrap?.setAttribute("aria-busy", listLoading ? "true" : "false");
    }

    async function commitFilters() {
        const filters = readFiltersFromDom();
        const from = filters.from;
        const to = filters.to;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
            window.alert("Select valid Ends from and Ends to dates.");
            return false;
        }

        appliedFilters = filters;
        writeStoredFilters(appliedFilters);
        syncRangeInUrlAndHeader(from, to);
        closeFiltersPanel();
        await reloadTendersFromServer();
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

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function hydrateReadableDates(root = tableBody) {
        root?.querySelectorAll?.("[data-readable-date]").forEach((element) => {
            const format = element.dataset.dateFormat || "DD/MM/YYYY HH:mm:ss";
            element.textContent =
                window.getReadableDate?.(format, element.dataset.readableDate) || "-";
        });
    }

    function rebindRows() {
        rows = Array.from(tableBody.querySelectorAll("tr"));
        for (const select of columnFilters) {
            fillColumnFilter(select);
        }
        if (selectAllCheckbox) selectAllCheckbox.checked = false;
        hydrateReadableDates(tableBody);
        applySort();
        markEndsSoonRows();
        applyFilters();
    }

    function mseLabel(value) {
        if (value === true || value === 1 || value === "1") return "Yes";
        if (value === false || value === 0 || value === "0") return "No";
        return "-";
    }

    function renderTenderRows(tenders) {
        const list = Array.isArray(tenders) ? tenders : [];
        const html = list
            .map((tender) => {
                const stage = String(tender.stage || "new");
                const emdAmount = Number(tender.emd_amount || 0);
                const buyerParts = [
                    tender.ministry,
                    tender.department,
                    tender.organization,
                    tender.office,
                ].filter(Boolean);
                const buyerText = buyerParts.length ? buyerParts.join(" / ") : "-";
                const assigneeName = tender.assignee_full_name || "-";
                const stageLabel = stageLabels[stage] || stage || "New";
                const quantity = Number(tender.quantity || 0);
                const quantityDisplay = quantity > 0 ? String(quantity) : "NA";
                const emdDisplay =
                    emdAmount > 0
                        ? emdAmount.toLocaleString("en-IN", { maximumFractionDigits: 2 })
                        : "NA";
                const tenderCategoryId =
                    tender.tender_category_id != null
                        ? String(tender.tender_category_id)
                        : "";
                const tenderCategoryName = tender.tender_category_name || "";
                const isLocked = !!Number(tender.locked);
                const lockMessage = tender.lock_message || "";
                const assigneeUserId =
                    tender.assignee_user_id != null
                        ? String(tender.assignee_user_id)
                        : "";
                const pastExperience = tender.required_past_experice_years || "";
                const mseExp = mseLabel(tender.mse_experience_relaxation);
                const mseTurnover = mseLabel(tender.mse_turnover_relaxation);
                const endAt = tender.end_date_time || "";
                const tenderId = tender.tender_id || "";
                const rowId = Number(tender.id || 0);

                return `<tr
                    data-id="${escapeHtml(rowId)}"
                    data-tender-category-id="${escapeHtml(tenderCategoryId)}"
                    data-tender-category-name="${escapeHtml(tenderCategoryName)}"
                    data-locked="${isLocked ? "1" : "0"}"
                    data-assignee-user-id="${escapeHtml(assigneeUserId)}"
                    data-stage="${escapeHtml(stage)}"
                    data-past-experience="${escapeHtml(pastExperience)}"
                    data-mse-exp="${escapeHtml(mseExp === "-" ? "" : mseExp)}"
                    data-mse-turnover="${escapeHtml(mseTurnover === "-" ? "" : mseTurnover)}"
                    data-quantity="${escapeHtml(quantity)}"
                    data-end-at="${escapeHtml(endAt)}"
                >
                    <td>
                        <input
                            type="checkbox"
                            class="form-check-input gem-tender-select"
                            value="${escapeHtml(rowId)}"
                            aria-label="Select tender ${escapeHtml(tenderId)}"
                        />
                    </td>
                    <td>
                        <a
                            href="/app/gem-keyword-tenders/${escapeHtml(rowId)}"
                            target="_blank"
                            rel="noopener noreferrer"
                        >${escapeHtml(tenderId)}</a>
                    </td>
                    <td
                        class="gem-tenders-ends-at"
                        data-readable-date="${escapeHtml(endAt)}"
                        data-date-format="DD/MM/YYYY HH:mm:ss"
                    ></td>
                    <td>${escapeHtml(tenderCategoryName || "-")}</td>
                    <td class="gem-tenders-buyer-col">
                        <span class="gem-tenders-buyer-text" title="${escapeHtml(buyerText)}">
                            ${escapeHtml(buyerText)}
                        </span>
                    </td>
                    <td>${escapeHtml(quantityDisplay)}</td>
                    <td>${escapeHtml(emdDisplay)}</td>
                    <td>${escapeHtml(pastExperience || "-")}</td>
                    <td>${escapeHtml(mseExp)}</td>
                    <td>${escapeHtml(mseTurnover)}</td>
                    <td>
                        <span class="gem-tender-tag gem-tender-stage-tag gem-tender-stage-${escapeHtml(stage)}">
                            ${escapeHtml(stageLabel)}
                        </span>
                    </td>
                    <td class="text-center">
                        <input
                            type="checkbox"
                            class="form-check-input gem-tender-locked-check"
                            ${isLocked ? "checked" : ""}
                            disabled
                            aria-label="${escapeHtml(isLocked ? lockMessage || "Locked" : "Not locked")}"
                            title="${escapeHtml(isLocked ? lockMessage || "Locked" : "Not locked")}"
                        />
                    </td>
                    <td>
                        <span class="gem-tender-tag gem-tender-assignee-tag${assigneeUserId ? "" : " gem-tender-assignee-empty"}">
                            ${escapeHtml(assigneeName)}
                        </span>
                    </td>
                </tr>`;
            })
            .join("");
        tableBody.innerHTML = html;
    }

    reloadTendersFromServer = async function reloadTendersFromServerImpl() {
        const from = appliedFilters.from || pageFrom;
        const to = appliedFilters.to || pageTo;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
            window.alert("Select valid Ends from and Ends to dates.");
            return false;
        }

        if (listFetchAbort) {
            try {
                listFetchAbort.abort();
            } catch {
                // ignore
            }
        }
        const controller = new AbortController();
        listFetchAbort = controller;
        const seq = ++listFetchSeq;
        setListLoading(true);

        try {
            const url = new URL("/api/gem-keyword-tenders", window.location.origin);
            url.searchParams.set("from", from);
            url.searchParams.set("to", to);
            const response = await fetch(url.toString(), {
                method: "GET",
                credentials: "same-origin",
                signal: controller.signal,
            });
            const data = await response.json().catch(() => ({}));
            if (seq !== listFetchSeq) return false;
            if (!response.ok) {
                window.alert(data.error || "Failed to load tenders.");
                applyFilters();
                return false;
            }
            renderTenderRows(data.tenders || []);
            rebindRows();
            return true;
        } catch (error) {
            if (error?.name === "AbortError" || seq !== listFetchSeq) {
                return false;
            }
            console.error(error);
            window.alert("Failed to load tenders.");
            applyFilters();
            return false;
        } finally {
            if (seq === listFetchSeq) {
                setListLoading(false);
                listFetchAbort = null;
                if (!listReady) {
                    finishListLoading();
                } else {
                    applyFilters();
                }
            }
        }
    };

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
        const selectedCategories = (appliedFilters.categories || []).map(String);
        const selectedStages = (appliedFilters.stages || []).map(String);
        const selectedAssignees = (appliedFilters.assignees || []).map(String);
        const showLocked = !!appliedFilters.showAll;
        const quantityUptoRaw = String(appliedFilters.quantityUpto ?? "").trim();
        const quantityUpto = quantityUptoRaw === "" ? null : Number(quantityUptoRaw);
        const hasQuantityUpto =
            quantityUpto != null && Number.isFinite(quantityUpto) && quantityUpto > 0;
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
            const isLockedRow = row.dataset.locked === "1";
            // Filed tenders are locked by the backend but stay in the default list.
            const matchesLocked = showLocked || !isLockedRow || rowStage === "filed";

            const rowCategoryId = String(row.dataset.tenderCategoryId || "");
            const rowCategoryName = String(row.dataset.tenderCategoryName || "")
                .trim()
                .toLowerCase();
            const matchesCategory =
                !selectedCategories.length ||
                selectedCategories.some((value) =>
                    value === "none" ? !rowCategoryId : rowCategoryId === value,
                );

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
                rowCategoryName.includes(query) ||
                String(row.dataset.id || "") === query;

            const matchesColumns = activeColumnFilters.every((filter) => {
                const cellValue = (row.dataset[filter.column] || "").trim().toLowerCase();
                return cellValue === filter.value;
            });

            const rowQuantity = rowQuantityValue(row);
            // Known qty only: NA (0 / missing) is excluded when a max is set.
            const matchesQuantity =
                !hasQuantityUpto || (rowQuantity > 0 && rowQuantity <= quantityUpto);

            const visible =
                matchesLocked &&
                matchesCategory &&
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
        const categories = Array.isArray(filters.categories)
            ? filters.categories
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
            categories: categories.map(String).filter(Boolean),
            stages: stages.map(String).filter(Boolean),
            assignees: assignees.map(String).filter(Boolean),
            search: String(filters.search || "").trim(),
            showAll: !!filters.showAll,
            quantityUpto:
                Number.isFinite(quantity) && quantity > 0 ? String(quantity) : "",
            columns,
        };
    }

    function resetClientFilters() {
        writeFiltersToDom(emptyFilters(pageFrom, pageTo));
        void commitFilters();
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

    function startOfIndianQuarterKey(dateKey) {
        const year = Number(dateKey.slice(0, 4));
        const month = Number(dateKey.slice(5, 7)); // 1-12
        if (month <= 3) return `${year}-01-01`;
        if (month <= 6) return `${year}-04-01`;
        if (month <= 9) return `${year}-07-01`;
        return `${year}-10-01`;
    }

    function endOfIndianQuarterKey(dateKey) {
        const year = Number(dateKey.slice(0, 4));
        const month = Number(dateKey.slice(5, 7));
        if (month <= 3) return `${year}-03-31`;
        if (month <= 6) return `${year}-06-30`;
        if (month <= 9) return `${year}-09-30`;
        return `${year}-12-31`;
    }

    function setQuickDateRange(range) {
        const today = window.getIstDate?.() || "";
        if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) {
            return;
        }
        const addDays = window.addIstCalendarDays;
        const year = Number(today.slice(0, 4));
        const month = Number(today.slice(5, 7));
        let fromKey = today;
        let toKey = today;

        if (range === "today") {
            fromKey = today;
            toKey = today;
        } else if (range === "this-week") {
            fromKey = window.getMondayDate?.(today) || today;
            toKey = addDays?.(fromKey, 6) || today;
        } else if (range === "next-15-days") {
            fromKey = today;
            toKey = addDays?.(today, 15) || today;
        } else if (range === "this-month") {
            fromKey = `${year}-${`${month}`.padStart(2, "0")}-01`;
            toKey = addDays?.(`${year}-${`${month + 1}`.padStart(2, "0")}-01`, -1) || today;
            if (month === 12) {
                toKey = `${year}-12-31`;
            }
        } else if (range === "last-month") {
            if (month === 1) {
                fromKey = `${year - 1}-12-01`;
                toKey = `${year - 1}-12-31`;
            } else {
                fromKey = `${year}-${`${month - 1}`.padStart(2, "0")}-01`;
                toKey = addDays?.(
                    `${year}-${`${month}`.padStart(2, "0")}-01`,
                    -1,
                ) || today;
            }
        } else if (range === "this-quarter") {
            fromKey = startOfIndianQuarterKey(today);
            toKey = endOfIndianQuarterKey(today);
        } else if (range === "last-quarter") {
            const previousDay = addDays?.(startOfIndianQuarterKey(today), -1);
            if (!previousDay) return;
            fromKey = startOfIndianQuarterKey(previousDay);
            toKey = endOfIndianQuarterKey(previousDay);
        } else {
            return;
        }

        if (fromInput) fromInput.value = fromKey;
        if (toInput) toInput.value = toKey;
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
        void commitFilters();
    });
    resetFiltersBtn?.addEventListener("click", () => {
        resetClientFilters();
    });
    refreshBtn?.addEventListener("click", () => {
        void reloadTendersFromServer();
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

        if (stage === "filed") {
            const confirmed = await window.showConfirm({
                title: "Confirm filed stage",
                description: `Set ${ids.length} tender(s) to Filed? They will be locked and only a super admin can change them afterward.`,
                choices: [
                    { label: "Cancel", value: false, variant: "outline-secondary" },
                    { label: "Confirm", value: true, variant: "primary" },
                ],
            });
            if (!confirmed) return;
        }

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
                clearSelection();
                await reloadTendersFromServer();
                if (bulkStageStatus) {
                    bulkStageStatus.textContent = "";
                    bulkStageStatus.classList.add("d-none");
                }
                bulkStageBtn.disabled = false;
                syncBulkBar();
                return;
            }

            if (bulkStageStatus) {
                bulkStageStatus.textContent =
                    payload.message ||
                    `Updated ${payload.successCount || 0}, failed ${payload.failedCount || 0}.`;
                bulkStageStatus.classList.remove("text-secondary");
                bulkStageStatus.classList.add("text-danger");
            }
            await reloadTendersFromServer();
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

        clearSelection();
        await reloadTendersFromServer();

        if (failCount === 0) {
            if (bulkStatus) {
                bulkStatus.textContent = "";
                bulkStatus.classList.add("d-none");
            }
            bulkAssignBtn.disabled = false;
            syncBulkBar();
            return;
        }

        if (bulkStatus) {
            bulkStatus.textContent = `Assigned ${successCount}, failed ${failCount}.`;
            bulkStatus.classList.remove("text-secondary", "d-none");
            bulkStatus.classList.add("text-danger");
        }
        bulkAssignBtn.disabled = false;
        syncBulkBar();
    });

    // Wait until layout/filters settle so users don't see a half-filtered flash.
    window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
            finishListLoading();
        });
    });
})();
