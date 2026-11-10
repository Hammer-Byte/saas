(() => {
    const FILTERS_STORAGE_KEY = "tasks-filters";
    const TERMINAL_STATES = new Set(["done"]);
    const PRIORITY_ORDER = { high: 1, medium: 2, low: 3 };

    const pageElement = document.getElementById("tasks-page");
    const currentUserId = Number(pageElement?.dataset.currentUserId || 0);
    const isTaskAdmin = pageElement?.dataset.isTaskAdmin === "1";

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
    const sprintPrevButton = document.getElementById("tasks-sprint-prev");
    const sprintNextButton = document.getElementById("tasks-sprint-next");
    const sprintCurrentButton = document.getElementById("tasks-sprint-current");
    const sprintLabel = document.getElementById("tasks-sprint-label");
    const allWeeksFilter = document.getElementById("tasks-filter-all-weeks");
    const backlogFilter = document.getElementById("tasks-filter-backlog");

    let selectedSprintWeek =
        window.getMondayDate?.(new Date()) ||
        (() => {
            const now = new Date();
            const weekday = now.getDay();
            const offset = weekday === 0 ? -6 : 1 - weekday;
            now.setDate(now.getDate() + offset);
            return [
                now.getFullYear(),
                String(now.getMonth() + 1).padStart(2, "0"),
                String(now.getDate()).padStart(2, "0"),
            ].join("-");
        })();
    let dragTaskId = null;
    let dragMoved = false;

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

    function formatSprintLabel(mondayKey) {
        const sundayKey = window.getSundayDate?.(mondayKey);
        const mondayDisplay =
            window.getReadableDate?.("DD/MM/YYYY", mondayKey) || mondayKey || "—";
        const sundayDisplay =
            window.getReadableDate?.("DD/MM/YYYY", sundayKey) || sundayKey || "—";
        return `${mondayDisplay} – ${sundayDisplay}`;
    }

    function shiftSprintWeek(days) {
        const year = Number(selectedSprintWeek.slice(0, 4));
        const month = Number(selectedSprintWeek.slice(5, 7));
        const day = Number(selectedSprintWeek.slice(8, 10));
        const date = new Date(year, month - 1, day);
        date.setDate(date.getDate() + days);
        selectedSprintWeek =
            window.getMondayDate?.(date) ||
            [
                date.getFullYear(),
                String(date.getMonth() + 1).padStart(2, "0"),
                String(date.getDate()).padStart(2, "0"),
            ].join("-");
        syncSprintLabel();
        applyFilters();
    }

    function syncSprintLabel() {
        if (sprintLabel) {
            sprintLabel.textContent = formatSprintLabel(selectedSprintWeek);
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
            sprintWeek: selectedSprintWeek,
            allWeeks: !!allWeeksFilter?.checked,
            backlogOnly: !!backlogFilter?.checked,
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
        if (filters.sprintWeek) {
            const monday = window.getMondayDate?.(filters.sprintWeek) || filters.sprintWeek;
            if (/^\d{4}-\d{2}-\d{2}$/.test(monday)) {
                selectedSprintWeek = monday;
            }
        }
        if (allWeeksFilter && typeof filters.allWeeks === "boolean") {
            allWeeksFilter.checked = filters.allWeeks;
        }
        if (backlogFilter && typeof filters.backlogOnly === "boolean") {
            backlogFilter.checked = filters.backlogOnly;
        }
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

    function isItemOverdue(item) {
        const state = (item.dataset.state || "").trim();
        if (TERMINAL_STATES.has(state)) return false;
        const endMs = parseDateTimeMs(item.dataset.endAt);
        if (endMs == null) return false;
        return endMs < Date.now();
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

        const boardMode = !!viewBoardInput?.checked;
        const backlogOnly = !!backlogFilter?.checked;
        const allWeeks = !!allWeeksFilter?.checked && !boardMode;
        const itemSprint = (item.dataset.sprintWeekStart || "").slice(0, 10);
        let matchesSprint = true;
        if (backlogOnly) {
            matchesSprint = itemState === "backlog";
        } else if (boardMode) {
            // Shared backlog stack always stays visible alongside the selected sprint week.
            matchesSprint = itemState === "backlog" || itemSprint === selectedSprintWeek;
        } else if (!allWeeks) {
            matchesSprint =
                itemState === "backlog" || !itemSprint || itemSprint === selectedSprintWeek;
        }

        return (
            matchesSearch &&
            matchesState &&
            matchesAssignee &&
            matchesProject &&
            matchesPriority &&
            matchesOverdue &&
            matchesDueSoon &&
            matchesSprint
        );
    }

    function isCurrentUserTask(item) {
        if (!(currentUserId >= 1)) return false;
        const assigneeId = Number(item.dataset.assigneeId || 0);
        return assigneeId >= 1 && assigneeId === currentUserId;
    }

    function compareOwnFirst(left, right) {
        const leftMine = isCurrentUserTask(left) ? 0 : 1;
        const rightMine = isCurrentUserTask(right) ? 0 : 1;
        return leftMine - rightMine;
    }

    function compareItems(left, right) {
        const ownDelta = compareOwnFirst(left, right);
        if (ownDelta !== 0) return ownDelta;

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

    function sortBoardColumns() {
        for (const column of document.querySelectorAll(".task-board-column")) {
            const cards = Array.from(column.querySelectorAll(".task-board-card"));
            const sorted = [...cards].sort(compareItems);
            for (const card of sorted) {
                column.appendChild(card);
            }
        }
    }

    function syncViewMode() {
        const boardMode = !!viewBoardInput?.checked;
        tableView?.classList.toggle("d-none", boardMode);
        boardView?.classList.toggle("d-none", !boardMode);
        if (boardMode) {
            if (allWeeksFilter) allWeeksFilter.checked = false;
            if (backlogFilter) backlogFilter.checked = false;
        }
        saveFilters();
    }

    function syncTaskStateInDom(taskId, state) {
        for (const item of allTaskItems()) {
            if (String(item.dataset.id) !== String(taskId)) continue;
            item.dataset.state = state;
            if (item.tagName === "TR") {
                const stateCell = item.children[2];
                if (stateCell) {
                    stateCell.textContent = state.replaceAll("_", " ");
                }
            }
        }
    }

    function promptSelect(modalElement, formElement, valueElement) {
        return new Promise((resolve) => {
            if (!modalElement || !formElement || !window.bootstrap?.Modal) {
                resolve(null);
                return;
            }
            const modal = window.bootstrap.Modal.getOrCreateInstance(modalElement);
            let settled = false;

            function finish(value) {
                if (settled) return;
                settled = true;
                formElement.removeEventListener("submit", onSubmit);
                modalElement.removeEventListener("hidden.bs.modal", onHidden);
                resolve(value);
            }

            function onSubmit(event) {
                event.preventDefault();
                const value = valueElement?.value?.trim() || "";
                if (!value) return;
                modal.hide();
                finish(value);
            }

            function onHidden() {
                finish(null);
            }

            formElement.addEventListener("submit", onSubmit);
            modalElement.addEventListener("hidden.bs.modal", onHidden, { once: true });
            if (valueElement) valueElement.value = "";
            modal.show();
        });
    }

    async function collectStateTransitionExtras(card, previousState, nextState) {
        const extras = {};
        const assigneeId = Number(card.dataset.assigneeId || 0);
        const reviewerId = Number(card.dataset.reviewerId || 0);

        const needsAssignee =
            (previousState === "backlog" &&
                (nextState === "analyzing" || nextState === "in_progress")) ||
            ((nextState === "analyzing" || nextState === "in_progress") && !(assigneeId >= 1));

        if (needsAssignee && !(assigneeId >= 1)) {
            const selected = await promptSelect(
                document.getElementById("task-workflow-assignee-modal"),
                document.getElementById("task-workflow-assignee-form"),
                document.getElementById("task-workflow-assignee"),
            );
            if (!selected) return null;
            extras.assignee_user_id = Number(selected);
        }

        if (nextState === "under_review") {
            const selected = await promptSelect(
                document.getElementById("task-workflow-reviewer-modal"),
                document.getElementById("task-workflow-reviewer-form"),
                document.getElementById("task-workflow-reviewer"),
            );
            if (!selected) return null;
            extras.reviewer_user_id = Number(selected);
        }

        if (previousState === "under_review" && nextState === "in_progress") {
            const isReviewer =
                currentUserId >= 1 && reviewerId >= 1 && currentUserId === reviewerId;
            if (isTaskAdmin || isReviewer) {
                const comment = await promptSelect(
                    document.getElementById("task-workflow-comment-modal"),
                    document.getElementById("task-workflow-comment-form"),
                    document.getElementById("task-workflow-comment"),
                );
                if (!comment) return null;
                extras.comment = comment;
            }
        }

        return extras;
    }

    async function moveBoardCardToState(card, nextState) {
        const taskId = Number(card.dataset.id || 0);
        const previousState = card.dataset.state || "";
        if (!(taskId >= 1) || !nextState || previousState === nextState) {
            return;
        }
        if (card.dataset.canMove !== "1") {
            showAlert(
                pageAlert,
                "View only — only the assignee, reviewer, or an admin can move this task.",
                "warning",
            );
            return;
        }

        const extras = await collectStateTransitionExtras(card, previousState, nextState);
        if (extras == null) {
            return;
        }

        const body = { state: nextState, ...extras };
        if (
            previousState === "backlog" &&
            (nextState === "analyzing" || nextState === "in_progress")
        ) {
            body.sprint_week_start = selectedSprintWeek;
        }
        if (nextState === "backlog") {
            body.sprint_week_start = null;
        }

        try {
            const response = await fetch(`/api/tasks/${taskId}/state`, {
                method: "PATCH",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showAlert(pageAlert, data.error || "Failed to update task state.", "danger");
                return;
            }

            const targetColumn = document.querySelector(
                `.task-board-column[data-state="${nextState}"]`,
            );
            targetColumn?.appendChild(card);
            card.dataset.state = nextState;
            if (extras.assignee_user_id) {
                card.dataset.assigneeId = String(extras.assignee_user_id);
            }
            if (extras.reviewer_user_id) {
                card.dataset.reviewerId = String(extras.reviewer_user_id);
            }
            if (body.sprint_week_start) {
                card.dataset.sprintWeekStart = String(body.sprint_week_start).slice(0, 10);
            } else if (nextState === "backlog") {
                card.dataset.sprintWeekStart = "";
            }
            syncTaskStateInDom(taskId, nextState);
            applyFilters();
        } catch (error) {
            console.error(error);
            showAlert(pageAlert, "Failed to update task state.", "danger");
        }
    }

    function setupBoardDragAndDrop() {
        for (const card of document.querySelectorAll(".task-board-card")) {
            card.addEventListener("dragstart", (event) => {
                if (card.dataset.canMove !== "1") {
                    event.preventDefault();
                    return;
                }
                dragTaskId = card.dataset.id || null;
                dragMoved = false;
                card.classList.add("dragging");
                event.dataTransfer?.setData("text/plain", String(dragTaskId || ""));
                if (event.dataTransfer) {
                    event.dataTransfer.effectAllowed = "move";
                }
            });
            card.addEventListener("dragend", () => {
                card.classList.remove("dragging");
                for (const column of document.querySelectorAll(".task-board-column")) {
                    column.classList.remove("drag-over");
                }
                dragTaskId = null;
            });
            card.addEventListener("click", (event) => {
                if (dragMoved) {
                    event.preventDefault();
                    dragMoved = false;
                    return;
                }
                const href = card.dataset.href;
                if (href) {
                    window.location.href = href;
                }
            });
        }

        for (const column of document.querySelectorAll(".task-board-column")) {
            column.addEventListener("dragover", (event) => {
                event.preventDefault();
                column.classList.add("drag-over");
                if (event.dataTransfer) {
                    event.dataTransfer.dropEffect = "move";
                }
            });
            column.addEventListener("dragleave", () => {
                column.classList.remove("drag-over");
            });
            column.addEventListener("drop", async (event) => {
                event.preventDefault();
                column.classList.remove("drag-over");
                const taskId =
                    event.dataTransfer?.getData("text/plain") || dragTaskId || "";
                const card = document.querySelector(
                    `.task-board-card[data-id="${taskId}"]`,
                );
                const nextState = column.dataset.state || "";
                if (!card || !nextState) return;
                dragMoved = true;
                await moveBoardCardToState(card, nextState);
            });
        }
    }

    function syncOverdueHighlight(item) {
        const overdue = isItemOverdue(item);
        item.classList.toggle("task-overdue", overdue);
        item.classList.toggle("table-danger", overdue && item.tagName === "TR");
        item.classList.toggle("table-warning", false);
        item.classList.toggle("border-warning", false);
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
        sortBoardColumns();

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
    syncSprintLabel();
    syncViewMode();
    applyFilters();
    setupBoardDragAndDrop();

    searchInput?.addEventListener("input", applyFilters);
    stateFilter?.addEventListener("change", applyFilters);
    assigneeFilter?.addEventListener("change", applyFilters);
    projectFilter?.addEventListener("change", applyFilters);
    priorityFilter?.addEventListener("change", applyFilters);
    sortFilter?.addEventListener("change", applyFilters);
    overdueFilter?.addEventListener("change", applyFilters);
    dueSoonFilter?.addEventListener("change", applyFilters);
    allWeeksFilter?.addEventListener("change", () => {
        if (allWeeksFilter.checked && backlogFilter) {
            backlogFilter.checked = false;
        }
        applyFilters();
    });
    backlogFilter?.addEventListener("change", () => {
        if (backlogFilter.checked && allWeeksFilter) {
            allWeeksFilter.checked = false;
        }
        applyFilters();
    });
    sprintPrevButton?.addEventListener("click", () => shiftSprintWeek(-7));
    sprintNextButton?.addEventListener("click", () => shiftSprintWeek(7));
    sprintCurrentButton?.addEventListener("click", () => {
        selectedSprintWeek = window.getMondayDate?.(new Date()) || selectedSprintWeek;
        if (backlogFilter) backlogFilter.checked = false;
        if (allWeeksFilter) allWeeksFilter.checked = false;
        syncSprintLabel();
        applyFilters();
    });
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
        if (allWeeksFilter) allWeeksFilter.checked = false;
        if (backlogFilter) backlogFilter.checked = false;
        if (viewTableInput) viewTableInput.checked = true;
        selectedSprintWeek = window.getMondayDate?.(new Date()) || selectedSprintWeek;
        clearStoredFilters();
        syncSprintLabel();
        syncViewMode();
        applyFilters();
    });

    const createSprintInput = document.getElementById("task-sprint-week");
    if (createSprintInput && !createSprintInput.value) {
        const monday = window.getMondayDate?.(new Date());
        if (monday) {
            createSprintInput.dataset.dateValue = monday;
            createSprintInput.value =
                window.getReadableDate?.("DD/MM/YYYY", monday) || monday;
        }
    }

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
        const state = document.getElementById("task-state")?.value || "backlog";

        if (!title) {
            showAlert(taskFormAlert, "Title is required.", "danger");
            return;
        }

        const payload = { title, priority, state: "backlog", sprint_week_start: null };
        if (description) payload.description = description;
        if (expectedHoursRaw !== "") {
            const expectedHours = Number(expectedHoursRaw);
            if (!Number.isFinite(expectedHours) || expectedHours < 0) {
                showAlert(taskFormAlert, "Enter valid expected hours.", "danger");
                return;
            }
            if (expectedHours > 8) {
                showAlert(taskFormAlert, "Expected hours cannot be more than 8.", "danger");
                return;
            }
            payload.expected_hours = expectedHours;
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
