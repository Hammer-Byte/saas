(() => {
    const FILTERS_STORAGE_KEY = "gem-tenders-filters";
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
            includeHidden: false,
            quantityUpto: "",
            columns: {},
        };
    }

    let appliedFilters = emptyFilters();
    const selectAllCheckbox = document.getElementById("gem-tenders-select-all");
    const bulkBar = document.getElementById("gem-tenders-bulk-bar");
    const bulkAssignee = document.getElementById("gem-bulk-assignee");
    const bulkAssignBtn = document.getElementById("gem-bulk-assign-btn");
    const bulkClearBtn = document.getElementById("gem-bulk-clear-btn");
    const bulkStatus = document.getElementById("gem-bulk-status");
    const selectedCountLabel = document.getElementById("gem-tenders-selected-count");
    const bulkStageSelect = document.getElementById("gem-bulk-stage");
    const bulkComment = document.getElementById("gem-bulk-comment");
    const bulkStageBtn = document.getElementById("gem-bulk-stage-btn");
    const bulkOutOfScopeBtn = document.getElementById("gem-bulk-out-of-scope-btn");
    const bulkNotEligibleBtn = document.getElementById("gem-bulk-not-eligible-btn");
    const BULK_ELIGIBILITY_LABELS = {
        out_of_scope: "Out of scope",
        ineligible: "Not eligible",
    };

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
    const canBulkChangeStage = bulkBar?.dataset.canBulkChangeStage === "1";

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
            const url = new URL("/api/gem-tenders", window.location.origin);
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

    function bulkCommentValue() {
        return String(bulkComment?.value || "").trim();
    }

    function setBulkStatus(message, tone = "danger") {
        if (!bulkStatus) return;
        if (!message) {
            bulkStatus.textContent = "";
            bulkStatus.classList.add("d-none");
            return;
        }
        bulkStatus.textContent = message;
        bulkStatus.classList.remove("d-none", "text-danger", "text-secondary");
        bulkStatus.classList.add(tone === "secondary" ? "text-secondary" : "text-danger");
    }

    function syncBulkBar() {
        const selected = selectedCheckboxes();
        const count = selected.length;
        const hasComment = !!bulkCommentValue();
        if (selectedCountLabel) {
            selectedCountLabel.textContent = `${count} selected`;
        }
        bulkBar?.classList.toggle("d-none", count === 0);
        if (bulkAssignBtn) {
            bulkAssignBtn.disabled = count === 0 || !bulkAssignee?.value || !hasComment;
        }
        if (bulkStageBtn) {
            const hasStage = !!(bulkStageSelect?.value || "").trim();
            bulkStageBtn.disabled = count === 0 || !hasStage || !hasComment;
        }
        if (bulkOutOfScopeBtn) bulkOutOfScopeBtn.disabled = count === 0 || !hasComment;
        if (bulkNotEligibleBtn) bulkNotEligibleBtn.disabled = count === 0 || !hasComment;
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

    function applyFilters() {
        const query = String(appliedFilters.search || "").trim().toLowerCase();
        const selectedCategories = (appliedFilters.categories || []).map(String);
        const selectedStages = (appliedFilters.stages || []).map(String);
        const selectedAssignees = (appliedFilters.assignees || []).map(String);
        const includeHidden = !!appliedFilters.includeHidden;
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
            const rowStage = String(row.dataset.stage || "unassigned");
            const isHiddenRow = row.dataset.hidden === "1";
            const matchesHidden = includeHidden || !isHiddenRow;

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
                matchesHidden &&
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
            stages: stages.map(String).filter((stage) => !!stage && !!stageLabels[stage]),
            assignees: assignees.map(String).filter(Boolean),
            search: String(filters.search || "").trim(),
            includeHidden: !!filters.includeHidden,
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

    bulkStageSelect?.addEventListener("change", () => {
        syncBulkBar();
    });

    bulkComment?.addEventListener("input", () => {
        syncBulkBar();
    });

    async function runBulkEligibilityAction(eligibility) {
        if (!canBulkChangeStage) return;

        const label = BULK_ELIGIBILITY_LABELS[eligibility];
        if (!label) return;

        const selected = selectedCheckboxes();
        const ids = selected
            .map((checkbox) => Number(checkbox.value || 0))
            .filter((id) => id >= 1);
        if (!ids.length) return;

        const comment = bulkCommentValue();
        if (!comment) {
            setBulkStatus("Comment is required.");
            return;
        }

        const unassignedCount = selected.filter((checkbox) => {
            const row = checkbox.closest("tr");
            const assigneeUserId = Number(row?.dataset?.assigneeUserId || 0);
            return !(assigneeUserId >= 1);
        }).length;
        if (unassignedCount > 0) {
            setBulkStatus(
                `Assign someone first: ${unassignedCount} selected tender(s) have no assignee.`,
            );
            return;
        }

        const confirmed = await window.showConfirm({
            title: `Mark as ${label}?`,
            description: `This will mark ${ids.length} tender(s) as "${label}", clear their stage, lock and hide them. Only a super admin can unlock afterward.`,
            choices: [
                { label: "Cancel", value: false, variant: "outline-secondary" },
                { label: `Mark ${label}`, value: true, variant: "danger" },
            ],
        });
        if (!confirmed) return;

        if (bulkOutOfScopeBtn) bulkOutOfScopeBtn.disabled = true;
        if (bulkNotEligibleBtn) bulkNotEligibleBtn.disabled = true;
        if (bulkStageBtn) bulkStageBtn.disabled = true;
        if (bulkAssignBtn) bulkAssignBtn.disabled = true;
        setBulkStatus(`Marking ${ids.length} tender(s) as ${label}…`, "secondary");

        try {
            const response = await fetch("/api/gem-tenders/bulk-eligibility", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids, eligibility, comment }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                setBulkStatus(payload?.error || `Failed to mark as ${label}.`);
                syncBulkBar();
                return;
            }

            if (!payload.failedCount) {
                clearSelection();
                await reloadTendersFromServer();
                syncBulkBar();
                return;
            }

            setBulkStatus(
                payload.message ||
                    `Locked ${payload.successCount || 0}, failed ${payload.failedCount || 0}.`,
            );
            await reloadTendersFromServer();
            syncBulkBar();
        } catch (error) {
            console.error(error);
            setBulkStatus(`Failed to mark as ${label}.`);
            syncBulkBar();
        }
    }

    bulkOutOfScopeBtn?.addEventListener("click", () => {
        runBulkEligibilityAction("out_of_scope");
    });

    bulkNotEligibleBtn?.addEventListener("click", () => {
        runBulkEligibilityAction("ineligible");
    });

    bulkStageBtn?.addEventListener("click", async () => {
        if (!canBulkChangeStage) return;

        const selected = selectedCheckboxes();
        const stage = String(bulkStageSelect?.value || "").trim();
        const comment = bulkCommentValue();
        if (!selected.length) return;
        if (!stage) {
            setBulkStatus("Stage is required.");
            return;
        }
        if (!comment) {
            setBulkStatus("Comment is required.");
            return;
        }

        const ids = selected
            .map((checkbox) => Number(checkbox.value || 0))
            .filter((id) => id >= 1);
        if (!ids.length) return;

        bulkStageBtn.disabled = true;
        if (bulkOutOfScopeBtn) bulkOutOfScopeBtn.disabled = true;
        if (bulkNotEligibleBtn) bulkNotEligibleBtn.disabled = true;
        if (bulkAssignBtn) bulkAssignBtn.disabled = true;
        setBulkStatus(`Changing stage on ${ids.length} tender(s)…`, "secondary");

        try {
            const response = await fetch("/api/gem-tenders/bulk-change-stage", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids, stage, comment }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                setBulkStatus(payload?.error || "Failed to change stage.");
                syncBulkBar();
                return;
            }

            if (!payload.failedCount) {
                clearSelection();
                await reloadTendersFromServer();
                syncBulkBar();
                return;
            }

            setBulkStatus(
                payload.message ||
                    `Updated ${payload.successCount || 0}, failed ${payload.failedCount || 0}.`,
            );
            await reloadTendersFromServer();
            syncBulkBar();
        } catch (error) {
            console.error(error);
            setBulkStatus("Failed to change stage.");
            syncBulkBar();
        }
    });

    bulkAssignBtn?.addEventListener("click", async () => {
        const selected = selectedCheckboxes();
        const assigneeUserId = Number(bulkAssignee?.value || 0);
        const comment = bulkCommentValue();
        if (!selected.length || !(assigneeUserId >= 1)) return;
        if (!comment) {
            setBulkStatus("Comment is required.");
            return;
        }

        if (!canAssignOthers && assigneeUserId !== currentUserId) {
            setBulkStatus("Missing authority to assign other users.");
            return;
        }

        const targets = canAssignOthers
            ? selected
            : selected.filter((checkbox) => {
                  const row = checkbox.closest("tr");
                  return !String(row?.dataset.assigneeUserId || "").trim();
              });

        if (!targets.length) {
            setBulkStatus(
                canAssignOthers
                    ? "No tenders selected."
                    : "Selected tenders already have an assignee.",
            );
            return;
        }

        const ids = targets
            .map((checkbox) => Number(checkbox.value || 0))
            .filter((id) => id >= 1);
        if (!ids.length) return;

        bulkAssignBtn.disabled = true;
        if (bulkStageBtn) bulkStageBtn.disabled = true;
        if (bulkOutOfScopeBtn) bulkOutOfScopeBtn.disabled = true;
        if (bulkNotEligibleBtn) bulkNotEligibleBtn.disabled = true;
        setBulkStatus(`Assigning ${ids.length} tender(s)…`, "secondary");

        try {
            const payload =
                assigneeUserId === currentUserId
                    ? { ids, assign_to_me: true, comment }
                    : { ids, assignee_user_id: assigneeUserId, comment };
            const response = await fetch("/api/gem-tenders/bulk-assign", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) {
                setBulkStatus(result?.error || "Failed to assign selected tenders.");
                syncBulkBar();
                return;
            }

            clearSelection();
            await reloadTendersFromServer();

            if (!result.failedCount) {
                syncBulkBar();
                return;
            }

            setBulkStatus(
                result.message ||
                    `Assigned ${result.successCount || 0}, failed ${result.failedCount || 0}.`,
            );
            syncBulkBar();
        } catch (error) {
            console.error(error);
            setBulkStatus("Failed to assign selected tenders.");
            syncBulkBar();
        }
    });

    // Wait until layout/filters settle so users don't see a half-filtered flash.
    window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
            finishListLoading();
        });
    });
})();
