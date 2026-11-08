(() => {
    const FILTERS_STORAGE_KEY = "tasks-filters";
    const TERMINAL_STATES = new Set(["done", "cancelled"]);
    const PRIORITY_ORDER = { high: 1, medium: 2, low: 3 };

    const pageElement = document.getElementById("tasks-page");
    const currentUserId = Number(pageElement?.dataset.currentUserId || 0);

    const searchInput = document.getElementById("tasks-search");
    const stateFilter = document.getElementById("tasks-filter-state");
    const assigneeFilter = document.getElementById("tasks-filter-assignee");
    const projectFilter = document.getElementById("tasks-filter-project");
    const priorityFilter = document.getElementById("tasks-filter-priority");
    const sortFilter = document.getElementById("tasks-filter-sort");
    const overdueFilter = document.getElementById("tasks-filter-overdue");
    const dueSoonFilter = document.getElementById("tasks-filter-due-soon");
    const viewTableInput = document.getElementById("tasks-view-table");
    const viewBoardInput = document.getElementById("tasks-view-board");
    const filterStatus = document.getElementById("tasks-filter-status");
    const clearFiltersButton = document.getElementById("tasks-clear-filters-btn");
    const exportCsvButton = document.getElementById("tasks-export-csv-btn");

    const tableView = document.getElementById("tasks-table-view");
    const boardView = document.getElementById("tasks-board-view");
    const tableBody = document.getElementById("tasks-tbody");
    const tableWrap = document.getElementById("tasks-table-wrap");
    const emptyState = document.getElementById("tasks-empty");

    const selectAllCheckbox = document.getElementById("tasks-select-all");
    const bulkBar = document.getElementById("tasks-bulk-state-bar");
    const bulkStateSelect = document.getElementById("tasks-bulk-state");
    const bulkApplyButton = document.getElementById("tasks-bulk-apply-btn");
    const bulkClearButton = document.getElementById("tasks-bulk-clear-btn");
    const selectedCountLabel = document.getElementById("tasks-selected-count");

    const pageAlert = document.getElementById("tasks-alert");
    const taskForm = document.getElementById("task-form");
    const taskFormAlert = document.getElementById("task-form-alert");
    const taskSubmitButton = document.getElementById("task-submit-btn");

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
        const view = viewBoardInput?.checked ? "board" : "table";
        return {
            search: searchInput?.value || "",
            state: stateFilter?.value || "",
            assignee: assigneeFilter?.value || "",
            project: projectFilter?.value || "",
            priority: priorityFilter?.value || "",
            sort: sortFilter?.value || "end_asc",
            overdue: !!overdueFilter?.checked,
            dueSoon: !!dueSoonFilter?.checked,
            view,
        };
    }

    function saveFilters() {
        writeStoredFilters(collectFilters());
    }

    function restoreClientFilters(filters) {
        if (!filters) return;
        if (searchInput && filters.search != null) searchInput.value = filters.search;
        if (stateFilter && filters.state != null) stateFilter.value = filters.state;
        if (assigneeFilter && filters.assignee != null) assigneeFilter.value = filters.assignee;
        if (projectFilter && filters.project != null) projectFilter.value = filters.project;
        if (priorityFilter && filters.priority != null) priorityFilter.value = filters.priority;
        if (sortFilter && filters.sort) sortFilter.value = filters.sort;
        if (overdueFilter && typeof filters.overdue === "boolean") {
            overdueFilter.checked = filters.overdue;
        }
        if (dueSoonFilter && typeof filters.dueSoon === "boolean") {
            dueSoonFilter.checked = filters.dueSoon;
        }
        if (filters.view === "board" && viewBoardInput) {
            viewBoardInput.checked = true;
        } else if (viewTableInput) {
            viewTableInput.checked = true;
        }
    }

    function clearStoredFilters() {
        try {
            window.localStorage.removeItem(FILTERS_STORAGE_KEY);
        } catch (error) {
            console.error(error);
        }
    }

    function allTaskItems() {
        return Array.from(document.querySelectorAll(".task-item"));
    }

    function tableRows() {
        return tableBody ? Array.from(tableBody.querySelectorAll("tr.task-item")) : [];
    }

    function parseDateTimeMs(value) {
        if (!value) return null;
        const normalized =
            window.getWritableDate?.("YYYY-MM-DD HH:mm:ss", value) ||
            String(value).trim().replace(" ", "T");
        const parsed = Date.parse(normalized);
        return Number.isFinite(parsed) ? parsed : null;
    }

    function startOfTodayMs() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return today.getTime();
    }

    function isItemOverdue(item) {
        const state = (item.dataset.state || "").trim();
        if (TERMINAL_STATES.has(state)) return false;
        const endMs = parseDateTimeMs(item.dataset.endAt);
        if (endMs == null) return false;
        return endMs < startOfTodayMs();
    }

    function isItemDueSoon(item) {
        const state = (item.dataset.state || "").trim();
        if (TERMINAL_STATES.has(state)) return false;
        const endMs = parseDateTimeMs(item.dataset.endAt);
        if (endMs == null) return false;
        const nowMs = Date.now();
        const windowMs = 24 * 60 * 60 * 1000;
        return endMs >= nowMs && endMs - nowMs <= windowMs;
    }

    function matchesFilters(item) {
        const query = (searchInput?.value || "").trim().toLowerCase();
        const stateValue = (stateFilter?.value || "").trim();
        const assigneeValue = (assigneeFilter?.value || "").trim();
        const projectValue = (projectFilter?.value || "").trim();
        const priorityValue = (priorityFilter?.value || "").trim();
        const overdueOnly = !!overdueFilter?.checked;
        const dueSoonOnly = !!dueSoonFilter?.checked;

        let description = "";
        try {
            description = decodeURIComponent(item.dataset.description || "");
        } catch (error) {
            description = item.dataset.description || "";
        }
        const haystack = [item.dataset.title || "", description].join(" ").toLowerCase();
        const matchesSearch = !query || haystack.includes(query);

        const itemState = (item.dataset.state || "").trim();
        const matchesState = !stateValue || itemState === stateValue;

        const assigneeId = String(item.dataset.assigneeId || "");
        let matchesAssignee = true;
        if (assigneeValue === "__me__") {
            matchesAssignee = currentUserId >= 1 && assigneeId === String(currentUserId);
        } else if (assigneeValue === "unassigned") {
            matchesAssignee = !assigneeId;
        } else if (assigneeValue) {
            matchesAssignee = assigneeId === assigneeValue;
        }

        const projectId = String(item.dataset.projectId || "");
        let matchesProject = true;
        if (projectValue === "none") {
            matchesProject = !projectId;
        } else if (projectValue) {
            matchesProject = projectId === projectValue;
        }

        const itemPriority = (item.dataset.priority || "").trim();
        const matchesPriority = !priorityValue || itemPriority === priorityValue;

        const matchesOverdue = !overdueOnly || isItemOverdue(item);
        const matchesDueSoon = !dueSoonOnly || isItemDueSoon(item);

        return (
            matchesSearch &&
            matchesState &&
            matchesAssignee &&
            matchesProject &&
            matchesPriority &&
            matchesOverdue &&
            matchesDueSoon
        );
    }

    function compareItems(left, right) {
        const sortKey = sortFilter?.value || "end_asc";

        if (sortKey === "title_asc") {
            return (left.dataset.title || "").localeCompare(right.dataset.title || "");
        }

        if (sortKey === "priority") {
            const leftOrder = PRIORITY_ORDER[left.dataset.priority] || 9;
            const rightOrder = PRIORITY_ORDER[right.dataset.priority] || 9;
            if (leftOrder !== rightOrder) return leftOrder - rightOrder;
            return Number(left.dataset.id) - Number(right.dataset.id);
        }

        if (sortKey === "created_desc" || sortKey === "created_asc") {
            const leftMs = parseDateTimeMs(left.dataset.createdOn) || 0;
            const rightMs = parseDateTimeMs(right.dataset.createdOn) || 0;
            const delta = rightMs - leftMs;
            return sortKey === "created_asc" ? -delta : delta;
        }

        const leftEnd = parseDateTimeMs(left.dataset.endAt);
        const rightEnd = parseDateTimeMs(right.dataset.endAt);
        if (leftEnd == null && rightEnd == null) {
            return Number(right.dataset.id) - Number(left.dataset.id);
        }
        if (leftEnd == null) return 1;
        if (rightEnd == null) return -1;
        const endDelta = leftEnd - rightEnd;
        if (endDelta !== 0) {
            return sortKey === "end_desc" ? -endDelta : endDelta;
        }
        return Number(right.dataset.id) - Number(left.dataset.id);
    }

    function sortTableRows() {
        if (!tableBody) return;
        const rows = tableRows();
        const sorted = [...rows].sort(compareItems);
        for (const row of sorted) {
            tableBody.appendChild(row);
        }
    }

    function syncViewMode() {
        const boardMode = !!viewBoardInput?.checked;
        tableView?.classList.toggle("d-none", boardMode);
        boardView?.classList.toggle("d-none", !boardMode);
        saveFilters();
    }

    function syncOverdueHighlight(item) {
        const overdue = isItemOverdue(item);
        item.classList.toggle("table-warning", overdue && item.tagName === "TR");
        item.classList.toggle("border", overdue);
        item.classList.toggle("border-warning", overdue);
    }

    function applyFilters() {
        const items = allTaskItems();
        let visibleCount = 0;
        const visibleIds = new Set();

        for (const item of items) {
            const visible = matchesFilters(item);
            item.classList.toggle("d-none", !visible);
            if (visible) {
                const taskId = item.dataset.id || "";
                if (taskId && !visibleIds.has(taskId)) {
                    visibleIds.add(taskId);
                    visibleCount += 1;
                }
                syncOverdueHighlight(item);
            }
            if (!visible && item.tagName === "TR") {
                const checkbox = item.querySelector(".task-select");
                if (checkbox) checkbox.checked = false;
            }
        }

        sortTableRows();

        const totalRows = tableRows().length;
        if (filterStatus) {
            filterStatus.textContent =
                totalRows > 0 ? `Showing ${visibleCount} of ${totalRows} tasks` : "";
        }

        const hasAnyTasks = totalRows > 0;
        emptyState?.classList.toggle("d-none", hasAnyTasks);
        tableWrap?.classList.toggle("d-none", !hasAnyTasks);

        syncBulkBar();
        saveFilters();
    }

    function visibleRows() {
        return tableRows().filter((row) => !row.classList.contains("d-none"));
    }

    function selectedCheckboxes() {
        return Array.from(document.querySelectorAll(".task-select:checked")).filter((input) => {
            const row = input.closest("tr");
            return row && !row.classList.contains("d-none");
        });
    }

    function syncBulkBar() {
        const selected = selectedCheckboxes();
        const count = selected.length;
        if (selectedCountLabel) {
            selectedCountLabel.textContent = `${count} selected`;
        }
        bulkBar?.classList.toggle("d-none", count === 0);
        if (bulkApplyButton) {
            bulkApplyButton.disabled = count === 0 || !bulkStateSelect?.value;
        }
        if (selectAllCheckbox) {
            const visible = visibleRows();
            const visibleChecks = visible
                .map((row) => row.querySelector(".task-select"))
                .filter(Boolean);
            const checkedVisible = visibleChecks.filter((input) => input.checked).length;
            selectAllCheckbox.checked =
                visibleChecks.length > 0 && checkedVisible === visibleChecks.length;
            selectAllCheckbox.indeterminate =
                checkedVisible > 0 && checkedVisible < visibleChecks.length;
        }
    }

    function clearSelection() {
        for (const input of document.querySelectorAll(".task-select")) {
            input.checked = false;
        }
        if (selectAllCheckbox) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        }
        syncBulkBar();
    }

    function exportVisibleCsv() {
        const rows = visibleRows();
        if (!rows.length) {
            showAlert(pageAlert, "No visible tasks to export.", "warning");
            return;
        }

        const headers = ["ID", "Title", "State", "Priority", "Assignee ID", "Project ID", "End", "Expected hours"];
        const lines = [headers.join(",")];

        for (const row of rows) {
            const title = (row.dataset.title || "").replace(/"/g, '""');
            const state = row.dataset.state || "";
            const priority = row.dataset.priority || "";
            const assigneeId = row.dataset.assigneeId || "";
            const projectId = row.dataset.projectId || "";
            const endAt = row.dataset.endAt || "";
            const expectedHours = row.dataset.expectedHours || "";
            lines.push(
                [
                    row.dataset.id,
                    `"${title}"`,
                    state,
                    priority,
                    assigneeId,
                    projectId,
                    `"${endAt.replace(/"/g, '""')}"`,
                    expectedHours,
                ].join(","),
            );
        }

        const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "tasks-export.csv";
        anchor.click();
        URL.revokeObjectURL(url);
    }

    restoreClientFilters(readStoredFilters());
    syncViewMode();
    applyFilters();

    searchInput?.addEventListener("input", applyFilters);
    stateFilter?.addEventListener("change", applyFilters);
    assigneeFilter?.addEventListener("change", applyFilters);
    projectFilter?.addEventListener("change", applyFilters);
    priorityFilter?.addEventListener("change", applyFilters);
    sortFilter?.addEventListener("change", applyFilters);
    overdueFilter?.addEventListener("change", applyFilters);
    dueSoonFilter?.addEventListener("change", applyFilters);
    viewTableInput?.addEventListener("change", () => {
        syncViewMode();
        applyFilters();
    });
    viewBoardInput?.addEventListener("change", () => {
        syncViewMode();
        applyFilters();
    });

    clearFiltersButton?.addEventListener("click", () => {
        if (searchInput) searchInput.value = "";
        if (stateFilter) stateFilter.value = "";
        if (assigneeFilter) assigneeFilter.value = "";
        if (projectFilter) projectFilter.value = "";
        if (priorityFilter) priorityFilter.value = "";
        if (sortFilter) sortFilter.value = "end_asc";
        if (overdueFilter) overdueFilter.checked = false;
        if (dueSoonFilter) dueSoonFilter.checked = false;
        if (viewTableInput) viewTableInput.checked = true;
        clearStoredFilters();
        syncViewMode();
        applyFilters();
    });

    exportCsvButton?.addEventListener("click", exportVisibleCsv);

    tableBody?.addEventListener("change", (event) => {
        if (event.target?.classList?.contains("task-select")) {
            syncBulkBar();
        }
    });

    selectAllCheckbox?.addEventListener("change", () => {
        const checked = !!selectAllCheckbox.checked;
        for (const row of visibleRows()) {
            const checkbox = row.querySelector(".task-select");
            if (checkbox) checkbox.checked = checked;
        }
        syncBulkBar();
    });

    bulkStateSelect?.addEventListener("change", syncBulkBar);
    bulkClearButton?.addEventListener("click", clearSelection);

    bulkApplyButton?.addEventListener("click", async () => {
        const selected = selectedCheckboxes();
        const state = bulkStateSelect?.value || "";
        if (!selected.length || !state) return;

        bulkApplyButton.disabled = true;
        try {
            const ids = selected
                .map((input) => Number(input.value || 0))
                .filter((id) => id >= 1);
            const response = await fetch("/api/tasks/bulk-state", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids, state }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showAlert(pageAlert, data.error || "Failed to update tasks.", "danger");
                bulkApplyButton.disabled = false;
                return;
            }
            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert(pageAlert, "Failed to update tasks.", "danger");
            bulkApplyButton.disabled = false;
        }
    });

    document.querySelectorAll(".task-row[data-href]").forEach((row) => {
        row.addEventListener("click", (event) => {
            if (event.target.closest(".task-select, select, button, a, input, textarea, label")) {
                return;
            }
            window.location.href = row.dataset.href;
        });
        row.addEventListener("keydown", (event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            if (event.target.closest(".task-select")) return;
            event.preventDefault();
            window.location.href = row.dataset.href;
        });
    });

    taskForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideAlert(taskFormAlert);
        hideAlert(pageAlert);

        const title = document.getElementById("task-title")?.value?.trim() || "";
        const description = document.getElementById("task-description")?.value?.trim() || "";
        const expectedHoursRaw = document.getElementById("task-expected-hours")?.value || "";
        const startAtRaw = document.getElementById("task-start-at")?.value || "";
        const endAtRaw = document.getElementById("task-end-at")?.value || "";
        const assigneeRaw = document.getElementById("task-assignee")?.value || "";
        const projectRaw = document.getElementById("task-project")?.value || "";
        const priority = document.getElementById("task-priority")?.value || "medium";
        const state = document.getElementById("task-state")?.value || "todo";

        if (!title) {
            showAlert(taskFormAlert, "Title is required.", "danger");
            return;
        }

        const payload = { title, priority, state };
        if (description) payload.description = description;
        if (expectedHoursRaw !== "") {
            payload.expected_hours = Number(expectedHoursRaw);
        }
        const startAt = window.getWritableDate?.("YYYY-MM-DD HH:mm:ss", startAtRaw);
        const endAt = window.getWritableDate?.("YYYY-MM-DD HH:mm:ss", endAtRaw);
        if (startAtRaw.trim()) {
            if (!startAt) {
                showAlert(taskFormAlert, "Enter a valid start date/time.", "danger");
                return;
            }
            payload.start_at = startAt;
        }
        if (endAtRaw.trim()) {
            if (!endAt) {
                showAlert(taskFormAlert, "Enter a valid end date/time.", "danger");
                return;
            }
            payload.end_at = endAt;
        }
        if (assigneeRaw) {
            payload.assignee_user_id = Number(assigneeRaw);
        }
        if (projectRaw) {
            payload.project_id = Number(projectRaw);
        }

        if (taskSubmitButton) taskSubmitButton.disabled = true;

        try {
            const response = await fetch("/api/tasks", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showAlert(taskFormAlert, data.error || "Failed to create task.", "danger");
                return;
            }
            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert(taskFormAlert, "Failed to create task.", "danger");
        } finally {
            if (taskSubmitButton) taskSubmitButton.disabled = false;
        }
    });
})();
