(() => {
    // Bumped when a filter default changes so old saved filters don't override it.
    const FILTERS_STORAGE_KEY = "gem-tenders-filters-v2";
    const COLUMNS_STORAGE_KEY = "gem-tenders-columns";
    const ALWAYS_VISIBLE_COLUMNS = new Set(["select", "tenderId"]);
    const DEFAULT_VISIBLE_COLUMNS = [
        "select",
        "tenderId",
        "endAt",
        "category",
        "buyer",
        "quantity",
        "emd",
        "pastExp",
        "mseExp",
        "mseTurnover",
        "stage",
        "locked",
        "assignee",
    ];
    const fromInput = document.getElementById("gem-tenders-from");
    const toInput = document.getElementById("gem-tenders-to");
    const categoryFilter = document.getElementById("gem-filter-category");
    const stageFilter = document.getElementById("gem-filter-stage");
    const assigneeFilter = document.getElementById("gem-filter-assignee");
    const multiFilters = [categoryFilter, stageFilter, assigneeFilter].filter(Boolean);
    const includeHiddenFilter = document.getElementById("gem-filter-include-hidden");
    const quantityUptoFilter = document.getElementById("gem-filter-quantity-upto");
    const lockedFilter = document.getElementById("gem-filter-locked");
    const resetFiltersBtn = document.getElementById("gem-filters-reset-btn");
    const refreshBtn = document.getElementById("gem-tenders-refresh-btn");
    const reportLink = document.getElementById("gem-tenders-report-link");
    const filtersPage = document.querySelector(".gem-tenders-page");
    const panelResetBtn = document.getElementById("gem-filters-panel-reset-btn");
    const searchInput = document.getElementById("gem-tenders-search");
    const quickViewButtons = Array.from(document.querySelectorAll(".gem-quick-view"));
    const filterChips = document.getElementById("gem-tenders-filter-chips");
    const filtersCount = document.getElementById("gem-filters-count");
    const searchAllBtn = document.getElementById("gem-tenders-search-all-btn");
    const searchModeBanner = document.getElementById("gem-tenders-search-mode");
    const searchModeText = document.getElementById("gem-tenders-search-mode-text");
    const searchModeBackBtn = document.getElementById("gem-tenders-search-back-btn");
    const QUICK_VIEWS = new Set(quickViewButtons.map((button) => button.dataset.view));
    const HIDDEN_VIEWS = new Set(["missed", "rejected"]);
    const HIDDEN_STATUSES = new Set(["missed", "unattended", "ineligible", "out_of_scope"]);
    /** When set, the table shows an all-dates search for this text instead of the date range. */
    let searchMode = "";
    const tableEl = document.getElementById("gem-tenders-table");
    const tableBody = document.getElementById("gem-tenders-tbody");
    const tableWrap = document.getElementById("gem-tenders-table-wrap");
    const emptyState = document.getElementById("gem-tenders-empty");
    const loadingState = document.getElementById("gem-tenders-loading");
    const filterStatus = document.getElementById("gem-tenders-filter-status");
    const rangeHighlight = document.querySelector(".gem-tenders-range-highlight");
    const columnToggleInputs = Array.from(
        document.querySelectorAll(".gem-column-toggle"),
    );
    const showAllColumnsBtn = document.getElementById("gem-columns-show-all-btn");
    const resetColumnsBtn = document.getElementById("gem-columns-reset-btn");
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
    const PIPELINE_STAGES = new Set([
        "waiting_for_docs",
        "waiting_for_gem",
        "waiting_for_quote",
        "preparing_docs",
        "filed",
    ]);
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
            includeHidden: true,
            quantityUpto: "",
            locked: "",
            view: "all",
            columns: {},
        };
    }

    let appliedFilters = emptyFilters();
    const selectAllCheckbox = document.getElementById("gem-tenders-select-all");
    const bulkBar = document.getElementById("gem-tenders-bulk-bar");
    const bulkAssignee = document.getElementById("gem-bulk-assignee");
    const bulkClearBtn = document.getElementById("gem-bulk-clear-btn");
    const bulkStatus = document.getElementById("gem-bulk-status");
    const bulkPreview = document.getElementById("gem-bulk-preview");
    const selectedCountLabel = document.getElementById("gem-tenders-selected-count");
    const bulkStageSelect = document.getElementById("gem-bulk-stage");
    const bulkCategorySelect = document.getElementById("gem-bulk-category");
    const bulkComment = document.getElementById("gem-bulk-comment");
    const bulkRunButtons = Array.from(document.querySelectorAll(".gem-bulk-run"));

    /** List status: lock reason, then pipeline stage, then assignment (mirrors the server view). */
    function tenderStatus(tender) {
        if (Number(tender.missed)) return "missed";
        if (Number(tender.unattended)) return "unattended";
        if (Number(tender.ineligible)) return "ineligible";
        if (Number(tender.out_of_scope)) return "out_of_scope";
        if (PIPELINE_STAGES.has(String(tender.stage || ""))) return String(tender.stage);
        if (Number(tender.eligible)) return "eligible";
        return tender.assignee_user_id ? "assigned" : "unassigned";
    }
    const currentUserId = Number(bulkBar?.dataset.currentUserId || 0);
    const canAssignOthers = bulkBar?.dataset.canAssignOthers === "1";
    const canManageAny = bulkBar?.dataset.canManageAny === "1";

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
            includeHidden: !!includeHiddenFilter?.checked,
            quantityUpto: String(quantityUptoFilter?.value || "").trim(),
            locked: String(lockedFilter?.value || ""),
            view: appliedFilters.view || "all",
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
        if (includeHiddenFilter) includeHiddenFilter.checked = !!filters.includeHidden;
        if (quantityUptoFilter) {
            const qty = Number(filters.quantityUpto);
            quantityUptoFilter.value =
                Number.isFinite(qty) && qty > 0 ? String(qty) : "";
        }
        if (lockedFilter) lockedFilter.value = filters.locked || "";
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
            reportLink.href = `/app/gem-tender-report?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
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

    /** Applies the filter bar as it is now; only a date change needs a server reload. */
    async function commitFilters({ forceReload = false } = {}) {
        const filters = readFiltersFromDom();
        const from = filters.from;
        const to = filters.to;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
            return false;
        }

        const rangeChanged = from !== appliedFilters.from || to !== appliedFilters.to;
        const leftSearchMode = !!searchMode && !filters.search;
        appliedFilters = filters;
        writeStoredFilters(appliedFilters);
        if (rangeChanged || forceReload || leftSearchMode) {
            searchMode = "";
            syncRangeInUrlAndHeader(from, to);
            await reloadTendersFromServer();
        } else {
            applyFilters();
        }
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
            const response = await fetch("/api/gem-tenders/adhoc-scan", {
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

    function readStoredColumns() {
        try {
            const raw = window.localStorage.getItem(COLUMNS_STORAGE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return null;
            return parsed.map(String);
        } catch {
            return null;
        }
    }

    function writeStoredColumns(columns) {
        try {
            window.localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(columns));
        } catch {
            // ignore
        }
    }

    function normalizeVisibleColumns(columns) {
        const selected = new Set(
            (Array.isArray(columns) ? columns : DEFAULT_VISIBLE_COLUMNS).map(String),
        );
        for (const key of ALWAYS_VISIBLE_COLUMNS) {
            selected.add(key);
        }
        return DEFAULT_VISIBLE_COLUMNS.filter(
            (key) => ALWAYS_VISIBLE_COLUMNS.has(key) || selected.has(key),
        );
    }

    function readColumnsFromDom() {
        const selected = columnToggleInputs
            .filter((input) => input.checked || input.disabled)
            .map((input) => input.value);
        return normalizeVisibleColumns(selected);
    }

    function writeColumnsToDom(columns) {
        const visible = new Set(normalizeVisibleColumns(columns));
        for (const input of columnToggleInputs) {
            const always = ALWAYS_VISIBLE_COLUMNS.has(input.value);
            input.checked = always || visible.has(input.value);
            if (always) input.disabled = true;
        }
    }

    function applyColumnVisibility(columns = readColumnsFromDom()) {
        const visible = new Set(normalizeVisibleColumns(columns));
        writeColumnsToDom([...visible]);
        writeStoredColumns([...visible]);
        tableEl?.querySelectorAll?.("[data-col]")?.forEach((cell) => {
            const key = cell.getAttribute("data-col");
            if (!key) return;
            cell.classList.toggle("d-none", !visible.has(key));
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
        applyColumnVisibility();
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
                const stage = tenderStatus(tender);
                const emdAmount = Number(tender.emd_amount || 0);
                const buyerParts = [
                    tender.ministry,
                    tender.department,
                    tender.organization,
                    tender.office,
                ].filter(Boolean);
                const buyerText = buyerParts.length ? buyerParts.join(" / ") : "-";
                const assigneeName = tender.assignee_full_name || "-";
                const stageLabel = stageLabels[stage] || stage;
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
                const isHidden =
                    !!Number(tender.hidden) || tender.hidden === true;
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
                    data-hidden="${isHidden ? "1" : "0"}"
                    data-assignee-user-id="${escapeHtml(assigneeUserId)}"
                    data-stage="${escapeHtml(stage)}"
                    data-past-experience="${escapeHtml(pastExperience)}"
                    data-mse-exp="${escapeHtml(mseExp === "-" ? "" : mseExp)}"
                    data-mse-turnover="${escapeHtml(mseTurnover === "-" ? "" : mseTurnover)}"
                    data-quantity="${escapeHtml(quantity)}"
                    data-end-at="${escapeHtml(endAt)}"
                    data-buyer="${escapeHtml(buyerParts.concat(tender.buyer_name || []).join(" "))}"
                    data-assignee-name="${escapeHtml(tender.assignee_full_name || "")}"
                >
                    <td data-col="select">
                        <input
                            type="checkbox"
                            class="form-check-input gem-tender-select"
                            value="${escapeHtml(rowId)}"
                            aria-label="Select tender ${escapeHtml(tenderId)}"
                        />
                    </td>
                    <td data-col="tenderId">
                        <a
                            href="/app/gem-tenders/${escapeHtml(rowId)}"
                            target="_blank"
                            rel="noopener noreferrer"
                        >${escapeHtml(tenderId)}</a>
                    </td>
                    <td
                        data-col="endAt"
                        class="gem-tenders-ends-at"
                        data-readable-date="${escapeHtml(endAt)}"
                        data-date-format="DD/MM/YYYY HH:mm:ss"
                    ></td>
                    <td data-col="category">${escapeHtml(tenderCategoryName || "-")}</td>
                    <td data-col="buyer" class="gem-tenders-buyer-col">
                        <span class="gem-tenders-buyer-text" title="${escapeHtml(buyerText)}">
                            ${escapeHtml(buyerText)}
                        </span>
                    </td>
                    <td data-col="quantity">${escapeHtml(quantityDisplay)}</td>
                    <td data-col="emd">${escapeHtml(emdDisplay)}</td>
                    <td data-col="pastExp">${escapeHtml(pastExperience || "-")}</td>
                    <td data-col="mseExp">${escapeHtml(mseExp)}</td>
                    <td data-col="mseTurnover">${escapeHtml(mseTurnover)}</td>
                    <td data-col="stage">
                        <span class="gem-tender-tag gem-tender-stage-tag gem-tender-stage-${escapeHtml(stage)}">
                            ${escapeHtml(stageLabel)}
                        </span>
                    </td>
                    <td data-col="locked" class="text-center">
                        <input
                            type="checkbox"
                            class="form-check-input gem-tender-locked-check"
                            ${isLocked ? "checked" : ""}
                            disabled
                            aria-label="${escapeHtml(isLocked ? lockMessage || "Locked" : "Not locked")}"
                            title="${escapeHtml(isLocked ? lockMessage || "Locked" : "Not locked")}"
                        />
                    </td>
                    <td data-col="assignee">
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
            const url = new URL(
                searchMode ? "/api/gem-tenders/search" : "/api/gem-tenders",
                window.location.origin,
            );
            if (searchMode) {
                url.searchParams.set("q", searchMode);
            } else {
                url.searchParams.set("from", from);
                url.searchParams.set("to", to);
            }
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

    function bulkCommentValue() {
        return String(bulkComment?.value || "").trim();
    }

    function setBulkStatus(message, tone = "danger", failures = []) {
        if (!bulkStatus) return;
        if (!message) {
            bulkStatus.replaceChildren();
            bulkStatus.classList.add("d-none");
            return;
        }
        const text = document.createElement("div");
        text.textContent = message;
        const items = failures.slice(0, 8).map((failure) => {
            const item = document.createElement("li");
            item.textContent = `${failure.tender_id || `#${failure.id}`}: ${failure.error}`;
            return item;
        });
        if (failures.length > items.length) {
            const more = document.createElement("li");
            more.textContent = `+${failures.length - items.length} more`;
            items.push(more);
        }
        const list = document.createElement("ul");
        list.className = "mb-0 ps-3";
        list.replaceChildren(...items);
        bulkStatus.replaceChildren(text, ...(items.length ? [list] : []));
        bulkStatus.classList.remove("d-none", "text-danger", "text-secondary");
        bulkStatus.classList.add(tone === "secondary" ? "text-secondary" : "text-danger");
    }

    /** Client copy of the server's bulk rules, used only to preview what will change. */
    function rowInfo(row) {
        const status = String(row.dataset.stage || "unassigned");
        return {
            status,
            assigneeId: Number(row.dataset.assigneeUserId || 0),
            categoryId: String(row.dataset.tenderCategoryId || ""),
            locked: row.dataset.locked === "1",
            filed: status === "filed",
            eligible: status === "eligible" || PIPELINE_STAGES.has(status),
        };
    }

    function workBlocker(info) {
        if (info.locked) return "locked";
        if (!info.assigneeId) return "no assignee";
        if (!canManageAny && info.assigneeId !== currentUserId) return "assigned to someone else";
        return null;
    }

    const LOCK_REASON_STATUSES = new Set(["filed", "ineligible", "out_of_scope", "missed", "unattended"]);

    const BULK_ACTIONS = {
        assign: {
            label: () => {
                const value = bulkAssignee?.value || "";
                if (value === "none") return "Unassign";
                return Number(value) === currentUserId
                    ? "Assign to me"
                    : `Assign to ${bulkAssignee?.selectedOptions?.[0]?.textContent?.trim() || "user"}`;
            },
            ready: () => !!bulkAssignee?.value,
            check: (info) => {
                const value = bulkAssignee?.value || "";
                const target = value === "none" ? 0 : Number(value);
                if (info.assigneeId === target) return "skip";
                if (info.locked) return "locked";
                if (info.assigneeId && (target === currentUserId || !canAssignOthers)) {
                    return "assigned to someone else";
                }
                return null;
            },
            request: () => {
                const value = bulkAssignee?.value || "";
                if (value === "none") return { url: "bulk-assign", body: { assignee_user_id: null } };
                return Number(value) === currentUserId
                    ? { url: "bulk-assign", body: { assign_to_me: true } }
                    : { url: "bulk-assign", body: { assignee_user_id: Number(value) } };
            },
            warning: () =>
                bulkAssignee?.value === "none"
                    ? "Unassigning clears eligibility and stage on tenders that are not filed."
                    : "",
        },
        stage: {
            label: () => `Move to ${bulkStageSelect?.selectedOptions?.[0]?.textContent?.trim() || "stage"}`,
            ready: () => !!bulkStageSelect?.value,
            check: (info) => {
                if (info.status === bulkStageSelect?.value) return "skip";
                if (info.filed) return "already filed";
                return workBlocker(info) || (info.eligible ? null : "not marked eligible");
            },
            request: () => ({ url: "bulk-change-stage", body: { stage: bulkStageSelect.value } }),
        },
        category: {
            label: () =>
                `Set category to ${bulkCategorySelect?.selectedOptions?.[0]?.textContent?.trim() || "category"}`,
            ready: () => !!bulkCategorySelect?.value,
            check: (info) => {
                const value = bulkCategorySelect?.value === "none" ? "" : bulkCategorySelect?.value;
                if (info.categoryId === value) return "skip";
                return workBlocker(info);
            },
            request: () => ({
                url: "bulk-category",
                body: {
                    tender_category_id:
                        bulkCategorySelect.value === "none" ? null : Number(bulkCategorySelect.value),
                },
            }),
        },
        ...Object.fromEntries(
            [
                ["eligible", "Mark eligible", ""],
                ["ineligible", "Mark not eligible", "Not eligible tenders are locked and hidden."],
                ["out_of_scope", "Mark out of scope", "Out of scope tenders are locked and hidden."],
            ].map(([choice, label, warning]) => [
                choice,
                {
                    label: () => label,
                    ready: () => true,
                    check: (info) => {
                        const current = info.eligible
                            ? "eligible"
                            : ["ineligible", "out_of_scope"].includes(info.status)
                              ? info.status
                              : "";
                        if (current === choice) return "skip";
                        if (info.filed) return "already filed";
                        return workBlocker(info);
                    },
                    request: () => ({ url: "bulk-eligibility", body: { eligibility: choice } }),
                    warning: () => warning,
                },
            ]),
        ),
        unlock: {
            label: () => "Unlock",
            ready: () => true,
            check: (info) => (info.locked ? null : "skip"),
            request: () => ({ url: "bulk-lock", body: { locked: false } }),
        },
        lock: {
            label: () => "Lock again",
            ready: () => true,
            check: (info) => {
                if (info.locked) return "skip";
                return LOCK_REASON_STATUSES.has(info.status) ? null : "no lock reason";
            },
            request: () => ({ url: "bulk-lock", body: { locked: true } }),
        },
    };

    /** How the selected rows split for one action: ids to change, already set, and blocked reasons. */
    function bulkPlan(action) {
        const definition = BULK_ACTIONS[action];
        const plan = { ids: [], skipped: 0, blocked: {} };
        if (!definition) return plan;
        for (const checkbox of selectedCheckboxes()) {
            const row = checkbox.closest("tr");
            if (!row) continue;
            const verdict = definition.check(rowInfo(row));
            if (verdict === "skip") plan.skipped += 1;
            else if (verdict) plan.blocked[verdict] = (plan.blocked[verdict] || 0) + 1;
            else plan.ids.push(Number(checkbox.value));
        }
        return plan;
    }

    function describePlan(plan) {
        const parts = [`${plan.ids.length} will change`];
        if (plan.skipped) parts.push(`${plan.skipped} already set`);
        for (const [reason, count] of Object.entries(plan.blocked)) {
            parts.push(`${count} ${reason}`);
        }
        return parts.join(" · ");
    }

    let previewAction = "assign";

    function activeBulkTabActions() {
        const pane = bulkBar?.querySelector(".tab-pane.active");
        return Array.from(pane?.querySelectorAll(".gem-bulk-run") || []).map(
            (button) => button.dataset.action,
        );
    }

    function syncBulkBar() {
        const selected = selectedCheckboxes();
        const count = selected.length;
        const hasComment = !!bulkCommentValue();
        if (selectedCountLabel) {
            selectedCountLabel.textContent = `${count} selected`;
        }
        bulkBar?.classList.toggle("d-none", count === 0);

        for (const button of bulkRunButtons) {
            const definition = BULK_ACTIONS[button.dataset.action];
            const ready = !!definition?.ready();
            const changeable = ready ? bulkPlan(button.dataset.action).ids.length : 0;
            button.disabled = !count || !ready || !changeable || !hasComment;
            if (!button.dataset.baseLabel) button.dataset.baseLabel = button.textContent.trim();
            button.textContent = ready && count
                ? `${button.dataset.baseLabel} (${changeable})`
                : button.dataset.baseLabel;
        }

        if (bulkPreview) {
            const actions = activeBulkTabActions();
            if (!actions.includes(previewAction)) previewAction = actions[0] || "";
            const definition = BULK_ACTIONS[previewAction];
            if (!count || !definition?.ready()) {
                bulkPreview.textContent = count ? "Choose a value to see what will change." : "";
            } else {
                const plan = bulkPlan(previewAction);
                const warning = definition.warning?.() || "";
                bulkPreview.textContent =
                    `${definition.label()}: ${describePlan(plan)}.` +
                    (hasComment ? "" : " Add a comment to continue.") +
                    (warning ? ` ${warning}` : "");
            }
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
        if (bulkComment) bulkComment.value = "";
        setBulkStatus("");
        syncBulkBar();
    }

    function rowQuantityValue(row) {
        const raw = row.getAttribute("data-quantity");
        const quantity = Number(raw);
        return Number.isFinite(quantity) ? quantity : 0;
    }

    function rowMatchesQuickView(row, view, nowMs) {
        const status = String(row.dataset.stage || "unassigned");
        switch (view) {
            case "mine":
                return currentUserId > 0 && Number(row.dataset.assigneeUserId || 0) === currentUserId;
            case "needs_decision":
                return status === "assigned" && row.dataset.locked !== "1";
            case "in_progress":
                return status === "eligible" || (PIPELINE_STAGES.has(status) && status !== "filed");
            case "ending_soon": {
                const endMs = parseEndAtMs(row.dataset.endAt);
                return (
                    endMs != null &&
                    endMs >= nowMs &&
                    endMs - nowMs <= 24 * 60 * 60 * 1000 &&
                    row.dataset.locked !== "1" &&
                    status !== "filed"
                );
            }
            case "unassigned":
                return status === "unassigned";
            case "filed":
                return status === "filed";
            case "missed":
                return status === "missed" || status === "unattended";
            case "rejected":
                return status === "ineligible" || status === "out_of_scope";
            default:
                return true;
        }
    }

    function quickViewLabel(view) {
        const button = quickViewButtons.find((item) => item.dataset.view === view);
        return String(button?.firstChild?.textContent || view).trim();
    }

    function setQuickView(view) {
        appliedFilters.view = QUICK_VIEWS.has(view) ? view : "all";
        const url = new URL(window.location.href);
        if (appliedFilters.view === "all") url.searchParams.delete("view");
        else url.searchParams.set("view", appliedFilters.view);
        window.history.replaceState({}, "", url.toString());
        applyFilters();
    }

    function activeFilterChips() {
        const chips = [];
        const search = String(appliedFilters.search || "").trim();
        if (search) {
            chips.push({
                label: `Find: "${search}"`,
                clear: () => {
                    if (searchInput) searchInput.value = "";
                },
            });
        }
        for (const root of multiFilters) {
            const labels = selectedMultiLabels(root);
            if (!labels.length) continue;
            chips.push({
                label: `${root.dataset.chipLabel || "Filter"}: ${labels.join(", ")}`,
                clear: () => setSelectedMultiValues(root, []),
            });
        }
        for (const select of columnFilters) {
            if (!select.value) continue;
            chips.push({
                label: `${select.dataset.chipLabel || select.dataset.column}: ${select.value}`,
                clear: () => {
                    select.value = "";
                },
            });
        }
        if (appliedFilters.quantityUpto) {
            chips.push({
                label: `Quantity ≤ ${appliedFilters.quantityUpto}`,
                clear: () => {
                    if (quantityUptoFilter) quantityUptoFilter.value = "";
                },
            });
        }
        if (appliedFilters.locked) {
            chips.push({
                label: appliedFilters.locked === "locked" ? "Locked only" : "Not locked only",
                clear: () => {
                    if (lockedFilter) lockedFilter.value = "";
                },
            });
        }
        if (!appliedFilters.includeHidden) {
            chips.push({
                label: "Hiding hidden tenders",
                clear: () => {
                    if (includeHiddenFilter) includeHiddenFilter.checked = true;
                },
            });
        }
        if (appliedFilters.view && appliedFilters.view !== "all") {
            chips.push({
                label: `View: ${quickViewLabel(appliedFilters.view)}`,
                clear: () => {
                    appliedFilters.view = "all";
                },
                quickView: true,
            });
        }
        return chips;
    }

    function renderFilterChips(visibleCount) {
        const chips = activeFilterChips();
        if (filterChips) {
            filterChips.replaceChildren(
                ...chips.map((chip, index) => {
                    const element = document.createElement("span");
                    element.className = "gem-filter-chip";
                    element.textContent = chip.label;
                    const button = document.createElement("button");
                    button.type = "button";
                    button.dataset.chipIndex = String(index);
                    button.title = "Remove filter";
                    button.setAttribute("aria-label", `Remove filter ${chip.label}`);
                    button.textContent = "×";
                    element.appendChild(button);
                    return element;
                }),
            );
            filterChips.chipClearers = chips.map((chip) => chip.clear);
        }
        resetFiltersBtn?.classList.toggle("d-none", !chips.length);

        const panelFilterCount = chips.filter((chip) => !chip.quickView).length;
        if (filtersCount) {
            filtersCount.textContent = String(panelFilterCount);
            filtersCount.classList.toggle("d-none", !panelFilterCount);
        }

        const search = String(appliedFilters.search || "").trim();
        if (searchAllBtn) {
            const offer = search.length >= 2 && search !== searchMode;
            searchAllBtn.classList.toggle("d-none", !offer);
            searchAllBtn.textContent = visibleCount
                ? `Search all dates for "${search}"`
                : `Not in these dates — search all dates for "${search}"`;
        }
        if (searchModeBanner) {
            searchModeBanner.classList.toggle("d-none", !searchMode);
            if (searchModeText) {
                searchModeText.textContent = `Showing tenders matching "${searchMode}" across all end dates (newest first, up to 300).`;
            }
        }
    }

    let lastVisibleCount = 0;

    function applyFilters() {
        const tokens = String(appliedFilters.search || "")
            .trim()
            .toLowerCase()
            .split(/\s+/)
            .filter(Boolean);
        const selectedCategories = (appliedFilters.categories || []).map(String);
        const selectedStages = (appliedFilters.stages || []).map(String);
        const selectedAssignees = (appliedFilters.assignees || []).map(String);
        const includeHidden = !!appliedFilters.includeHidden || !!searchMode;
        const lockedMode = String(appliedFilters.locked || "");
        const view = QUICK_VIEWS.has(appliedFilters.view) ? appliedFilters.view : "all";
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
        const nowMs = Date.now();
        const viewCounts = Object.fromEntries([...QUICK_VIEWS].map((key) => [key, 0]));

        let visibleCount = 0;

        for (const row of rows) {
            const rowStage = String(row.dataset.stage || "unassigned");

            const rowCategoryId = String(row.dataset.tenderCategoryId || "");
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

            const haystack = [
                row.querySelector("a")?.textContent,
                row.dataset.tenderCategoryName,
                row.dataset.buyer,
                row.dataset.assigneeName,
            ]
                .map((value) => String(value || "").trim().toLowerCase())
                .join(" ");
            const matchesSearch = tokens.every((token) => haystack.includes(token));

            const matchesColumns = activeColumnFilters.every((filter) => {
                const cellValue = (row.dataset[filter.column] || "").trim().toLowerCase();
                return cellValue === filter.value;
            });

            const rowQuantity = rowQuantityValue(row);
            // Known qty only: NA (0 / missing) is excluded when a max is set.
            const matchesQuantity =
                !hasQuantityUpto || (rowQuantity > 0 && rowQuantity <= quantityUpto);

            const matchesLocked =
                !lockedMode || (lockedMode === "locked") === (row.dataset.locked === "1");

            const matchesBase =
                matchesCategory &&
                matchesStage &&
                matchesAssignee &&
                matchesSearch &&
                matchesColumns &&
                matchesQuantity &&
                matchesLocked;

            // Hidden (closed) tenders show when asked for explicitly: the checkbox, their status, or their quick view.
            const isHiddenRow = row.dataset.hidden === "1";
            const hiddenAllowed =
                includeHidden ||
                !isHiddenRow ||
                (HIDDEN_STATUSES.has(rowStage) && selectedStages.includes(rowStage));
            const showableIn = (key) =>
                matchesBase &&
                (hiddenAllowed || HIDDEN_VIEWS.has(key)) &&
                rowMatchesQuickView(row, key, nowMs);

            for (const key of QUICK_VIEWS) {
                if (showableIn(key)) viewCounts[key] += 1;
            }

            const visible = showableIn(view);
            row.classList.toggle("d-none", !visible);
            if (!visible) {
                const checkbox = row.querySelector(".gem-tender-select");
                if (checkbox) checkbox.checked = false;
            }
            if (visible) visibleCount += 1;
        }
        lastVisibleCount = visibleCount;

        for (const button of quickViewButtons) {
            const key = button.dataset.view;
            const count = viewCounts[key] || 0;
            button.classList.toggle("active", key === view);
            button.classList.toggle("is-empty", count === 0);
            button.setAttribute("aria-pressed", key === view ? "true" : "false");
            const badge = button.querySelector(".gem-quick-view-count");
            if (badge) badge.textContent = String(count);
        }

        if (filterStatus) {
            filterStatus.textContent = `Showing ${visibleCount} of ${rows.length} tenders`;
        }
        renderFilterChips(visibleCount);

        const hasLoadedRows = rows.length > 0;
        const showEmpty = !hasLoadedRows || visibleCount === 0;
        if (listReady) {
            loadingState?.classList.add("d-none");
            tableWrap?.classList.toggle("d-none", showEmpty);
            emptyState?.classList.toggle("d-none", !showEmpty);
        }
        if (emptyState) {
            if (searchMode && !hasLoadedRows) {
                emptyState.textContent = `No tenders found for "${searchMode}" in any date range.`;
            } else if (!hasLoadedRows) {
                emptyState.textContent = "No tenders ending in this date range.";
            } else {
                emptyState.textContent = "No tenders match the current filters.";
            }
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
            stages: stages.map(String).filter((stage) => !!stage && !!stageLabels[stage]),
            assignees: assignees.map(String).filter(Boolean),
            search: String(filters.search || "").trim(),
            includeHidden: filters.includeHidden !== false,
            quantityUpto:
                Number.isFinite(quantity) && quantity > 0 ? String(quantity) : "",
            locked: ["locked", "unlocked"].includes(filters.locked) ? filters.locked : "",
            view: QUICK_VIEWS.has(filters.view) ? filters.view : "all",
            columns,
        };
    }

    /** Clears every filter but keeps the date range. */
    function resetClientFilters() {
        writeFiltersToDom(emptyFilters(pageFrom, pageTo));
        appliedFilters.view = "all";
        setQuickView("all");
        void commitFilters({ forceReload: !!searchMode });
    }

    for (const select of columnFilters) {
        fillColumnFilter(select);
    }

    for (const root of multiFilters) {
        updateMultiFilterLabel(root);
        root.addEventListener("change", (event) => {
            if (!event.target?.classList?.contains("gem-multi-filter-option")) return;
            updateMultiFilterLabel(root);
            void commitFilters();
        });
    }

    appliedFilters = normalizeStoredFilters({
        ...emptyFilters(),
        ...(storedFilters || {}),
        from: pageFrom,
        to: pageTo,
    });
    const urlView = new URL(window.location.href).searchParams.get("view");
    if (QUICK_VIEWS.has(urlView)) appliedFilters.view = urlView;
    writeFiltersToDom(appliedFilters);

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

    writeColumnsToDom(readStoredColumns() || DEFAULT_VISIBLE_COLUMNS);
    applyColumnVisibility();

    for (const input of columnToggleInputs) {
        input.addEventListener("change", () => {
            applyColumnVisibility(readColumnsFromDom());
        });
    }

    showAllColumnsBtn?.addEventListener("click", () => {
        applyColumnVisibility(DEFAULT_VISIBLE_COLUMNS);
    });

    resetColumnsBtn?.addEventListener("click", () => {
        applyColumnVisibility(DEFAULT_VISIBLE_COLUMNS);
    });

    function enterSearchMode() {
        const search = String(appliedFilters.search || "").trim();
        if (search.length < 2) return;
        searchMode = search;
        void reloadTendersFromServer();
    }

    filtersPage?.addEventListener("click", (event) => {
        const quickBtn = event.target?.closest?.(".gem-date-quick-btn");
        if (quickBtn) {
            setQuickDateRange(quickBtn.dataset.range || "");
            void commitFilters();
            return;
        }

        const viewBtn = event.target?.closest?.(".gem-quick-view");
        if (viewBtn) {
            setQuickView(viewBtn.dataset.view || "all");
            return;
        }

        const chipBtn = event.target?.closest?.("[data-chip-index]");
        if (chipBtn) {
            const clear = filterChips?.chipClearers?.[Number(chipBtn.dataset.chipIndex)];
            if (clear) {
                clear();
                if (appliedFilters.view === "all") setQuickView("all");
                void commitFilters();
            }
            return;
        }

        const clearBtn = event.target?.closest?.(".gem-filter-clear-btn");
        if (!clearBtn) return;

        const inputId = clearBtn.dataset.clearInput;
        if (inputId) {
            const input = document.getElementById(inputId);
            if (input) input.value = "";
            void commitFilters();
        }
    });

    let searchDebounce = null;
    searchInput?.addEventListener("input", () => {
        window.clearTimeout(searchDebounce);
        searchDebounce = window.setTimeout(() => void commitFilters(), 200);
    });
    searchInput?.addEventListener("keydown", async (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        window.clearTimeout(searchDebounce);
        await commitFilters();
        const search = String(appliedFilters.search || "").trim();
        if (searchMode ? search && search !== searchMode : !lastVisibleCount) enterSearchMode();
    });

    for (const input of [fromInput, toInput, includeHiddenFilter, lockedFilter, ...columnFilters]) {
        input?.addEventListener("change", () => void commitFilters());
    }
    quantityUptoFilter?.addEventListener("input", () => void commitFilters());

    searchAllBtn?.addEventListener("click", () => {
        enterSearchMode();
    });
    searchModeBackBtn?.addEventListener("click", () => {
        void commitFilters({ forceReload: true });
    });

    for (const button of [resetFiltersBtn, panelResetBtn]) {
        button?.addEventListener("click", () => {
            resetClientFilters();
        });
    }
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

    for (const select of [bulkAssignee, bulkStageSelect, bulkCategorySelect]) {
        select?.addEventListener("change", () => syncBulkBar());
    }

    bulkClearBtn?.addEventListener("click", () => {
        clearSelection();
    });

    bulkComment?.addEventListener("input", () => {
        syncBulkBar();
    });

    bulkBar?.addEventListener("shown.bs.tab", () => {
        previewAction = activeBulkTabActions()[0] || "";
        syncBulkBar();
    });

    for (const button of bulkRunButtons) {
        const preview = () => {
            if (previewAction === button.dataset.action) return;
            previewAction = button.dataset.action;
            syncBulkBar();
        };
        button.parentElement?.addEventListener("mouseover", (event) => {
            if (event.target?.closest?.(".gem-bulk-run") === button) preview();
        });
        button.addEventListener("focus", preview);
        button.addEventListener("click", () => {
            void runBulkAction(button.dataset.action);
        });
    }

    function setBulkBusy(busy) {
        for (const button of bulkRunButtons) button.disabled = busy || button.disabled;
        if (!busy) syncBulkBar();
    }

    async function runBulkAction(action) {
        const definition = BULK_ACTIONS[action];
        if (!definition?.ready()) return;
        const comment = bulkCommentValue();
        if (!comment) {
            setBulkStatus("Comment is required.");
            return;
        }

        const plan = bulkPlan(action);
        if (!plan.ids.length) {
            setBulkStatus(`Nothing to change: ${describePlan(plan)}.`);
            return;
        }

        const warning = definition.warning?.() || "";
        const unchanged = selectedCheckboxes().length - plan.ids.length;
        const confirmed = await window.showConfirm({
            title: `${definition.label()} on ${plan.ids.length} tender(s)?`,
            description:
                (unchanged ? `${describePlan(plan)}. Only the ${plan.ids.length} that can change are sent. ` : "") +
                (warning ? `${warning} ` : "") +
                "Your comment is added to each changed tender.",
            choices: [
                { label: "Cancel", value: false, variant: "outline-secondary" },
                { label: definition.label(), value: true, variant: warning ? "danger" : "primary" },
            ],
        });
        if (!confirmed) return;

        setBulkBusy(true);
        setBulkStatus(`${definition.label()}: working on ${plan.ids.length} tender(s)…`, "secondary");

        let payload = {};
        let ok = false;
        try {
            const { url, body } = definition.request();
            const response = await fetch(`/api/gem-tenders/${url}`, {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...body, ids: plan.ids, comment }),
            });
            payload = await response.json().catch(() => ({}));
            ok = response.ok;
        } catch (error) {
            console.error(error);
            payload = { error: "Request failed. Check your connection and try again." };
        }

        const failures = Array.isArray(payload.failures) ? payload.failures : [];
        if (!ok && !failures.length) {
            setBulkBusy(false);
            setBulkStatus(payload.error || "Bulk action failed.");
            return;
        }

        await reloadTendersFromServer();
        if (!failures.length) {
            clearSelection();
            showAddTenderAlert(`${payload.message || "Done"}.`, "success");
            return;
        }

        // Keep the tenders that could not change selected so the reasons stay visible next to them.
        const failedIds = new Set(failures.map((failure) => String(failure.id)));
        for (const checkbox of tableBody.querySelectorAll(".gem-tender-select")) {
            checkbox.checked =
                failedIds.has(String(checkbox.value)) && !checkbox.closest("tr")?.classList.contains("d-none");
        }
        setBulkBusy(false);
        setBulkStatus(`${payload.message || "Some tenders could not be changed"}. Still selected:`, "danger", failures);
    }

    // Wait until layout/filters settle so users don't see a half-filtered flash.
    window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
            finishListLoading();
        });
    });
})();
