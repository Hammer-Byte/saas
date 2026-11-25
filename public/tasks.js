(() => {
    const FILTERS_STORAGE_KEY = "tasks-filters-v2";
    const TERMINAL_STATES = new Set(["done"]);
    const PRIORITY_ORDER = { p1: 1, p2: 2, p3: 3, p4: 4, p5: 5 };
    const STATE_LABELS = {
        backlog: "Backlog",
        analyzing: "Analyzing",
        in_progress: "In progress",
        under_review: "Under review",
        done: "Done",
    };

    function stateChipHtml(state) {
        const value = String(state || "backlog");
        const label = STATE_LABELS[value] || value.replaceAll("_", " ");
        return `<span class="hb-task-state hb-task-state--${value}">${label}</span>`;
    }

    const pageElement = document.getElementById("tasks-page");
    if (!pageElement) return;

    const currentUserId = Number(pageElement.dataset.currentUserId || 0);
    const isTaskAdmin = pageElement.dataset.isTaskAdmin === "1";

    const searchInput = document.getElementById("tasks-search");
    const stateFilter = document.getElementById("tasks-filter-state");
    const assigneeFilter = document.getElementById("tasks-filter-assignee");
    const projectFilter = document.getElementById("tasks-filter-project");
    const priorityFilter = document.getElementById("tasks-filter-priority");
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
    const expectedHoursTotal = document.getElementById("tasks-expected-hours-total");

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

    function syncSprintLabel() {
        if (sprintLabel) sprintLabel.textContent = formatSprintLabel(selectedSprintWeek);
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

    function collectFilters() {
        return {
            view: viewBoardInput?.checked ? "board" : "table",
            search: searchInput?.value || "",
            state: stateFilter?.value || "",
            assignee: assigneeFilter?.value || "",
            project: projectFilter?.value || "",
            priority: priorityFilter?.value || "",
            overdue: !!overdueFilter?.checked,
            dueSoon: !!dueSoonFilter?.checked,
            sprintWeek: selectedSprintWeek,
        };
    }

    function saveFilters() {
        writeStoredFilters(collectFilters());
    }

    function restoreFilters() {
        const filters = readStoredFilters();
        if (!filters) return;
        if (filters.view === "board" && viewBoardInput) {
            viewBoardInput.checked = true;
        } else if (viewTableInput) {
            viewTableInput.checked = true;
        }
        if (searchInput && typeof filters.search === "string") searchInput.value = filters.search;
        if (stateFilter && typeof filters.state === "string") stateFilter.value = filters.state;
        if (assigneeFilter && typeof filters.assignee === "string") {
            assigneeFilter.value = filters.assignee;
        }
        if (projectFilter && typeof filters.project === "string") {
            projectFilter.value = filters.project;
        }
        if (priorityFilter && typeof filters.priority === "string") {
            priorityFilter.value = filters.priority;
        }
        if (overdueFilter && typeof filters.overdue === "boolean") {
            overdueFilter.checked = filters.overdue;
        }
        if (dueSoonFilter && typeof filters.dueSoon === "boolean") {
            dueSoonFilter.checked = filters.dueSoon;
        }
        if (filters.sprintWeek) {
            selectedSprintWeek =
                window.getMondayDate?.(filters.sprintWeek) || filters.sprintWeek;
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

        const itemSprint = (item.dataset.sprintWeekStart || "").slice(0, 10);
        const matchesSprint = itemSprint === selectedSprintWeek;

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
        return Number(item.dataset.assigneeId || 0) === currentUserId;
    }

    function compareItems(left, right) {
        const leftMine = isCurrentUserTask(left) ? 0 : 1;
        const rightMine = isCurrentUserTask(right) ? 0 : 1;
        if (leftMine !== rightMine) return leftMine - rightMine;

        const leftOrder = PRIORITY_ORDER[left.dataset.priority] || 9;
        const rightOrder = PRIORITY_ORDER[right.dataset.priority] || 9;
        if (leftOrder !== rightOrder) return leftOrder - rightOrder;

        const leftEnd = parseDateTimeMs(left.dataset.endAt);
        const rightEnd = parseDateTimeMs(right.dataset.endAt);
        if (leftEnd == null && rightEnd == null) {
            return Number(right.dataset.id) - Number(left.dataset.id);
        }
        if (leftEnd == null) return 1;
        if (rightEnd == null) return -1;
        return leftEnd - rightEnd;
    }

    function sortTableRows() {
        if (!tableBody) return;
        const sorted = [...tableRows()].sort(compareItems);
        for (const row of sorted) tableBody.appendChild(row);
    }

    function sortBoardColumns() {
        for (const column of document.querySelectorAll(".task-board-column")) {
            const cards = Array.from(column.querySelectorAll(".task-board-card"));
            const sorted = [...cards].sort(compareItems);
            for (const card of sorted) column.appendChild(card);
        }
    }

    function updateExpectedHoursTotal() {
        if (!expectedHoursTotal) return;
        let total = 0;
        for (const row of tableRows()) {
            if (row.classList.contains("d-none")) continue;
            const hours = Number(row.dataset.expectedHours || "");
            if (Number.isFinite(hours)) total += hours;
        }
        expectedHoursTotal.textContent = String(Math.round(total * 100) / 100);
    }

    function syncViewMode() {
        const boardMode = !!viewBoardInput?.checked;
        tableView?.classList.toggle("d-none", boardMode);
        boardView?.classList.toggle("d-none", !boardMode);
    }

    function syncOverdueHighlight(item) {
        const overdue = isItemOverdue(item);
        item.classList.toggle("task-overdue", overdue);
        item.classList.toggle("table-danger", overdue && item.tagName === "TR");
    }

    function syncBulkBar() {
        const selected = Array.from(document.querySelectorAll(".task-select:checked")).filter(
            (input) => {
                const row = input.closest("tr");
                return row && !row.classList.contains("d-none");
            },
        );
        const count = selected.length;
        if (selectedCountLabel) selectedCountLabel.textContent = `${count} selected`;
        bulkBar?.classList.toggle("d-none", count === 0);
        if (bulkApplyButton) {
            bulkApplyButton.disabled = count === 0 || !bulkStateSelect?.value;
        }
        if (selectAllCheckbox) {
            const visible = tableRows().filter((row) => !row.classList.contains("d-none"));
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
        updateExpectedHoursTotal();

        const totalRows = tableRows().length;
        if (filterStatus) {
            filterStatus.textContent =
                totalRows > 0 ? `Showing ${visibleCount} of ${totalRows} sprint tasks` : "";
        }

        emptyState?.classList.toggle("d-none", totalRows === 0 ? false : visibleCount > 0);
        if (totalRows === 0) emptyState?.classList.remove("d-none");
        tableWrap?.classList.toggle("d-none", totalRows === 0);

        syncBulkBar();
        saveFilters();
    }

    function syncTaskStateInDom(taskId, state) {
        for (const item of allTaskItems()) {
            if (String(item.dataset.id) !== String(taskId)) continue;
            item.dataset.state = state;
            if (item.tagName === "TR") {
                const stateCell = item.children[2];
                if (stateCell) stateCell.innerHTML = stateChipHtml(state);
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
        if (!(taskId >= 1) || !nextState || previousState === nextState) return;
        if (card.dataset.canMove !== "1") {
            showAlert(
                pageAlert,
                "View only — only the assignee, reviewer, or an admin can move this task.",
                "warning",
            );
            return;
        }

        const extras = await collectStateTransitionExtras(card, previousState, nextState);
        if (extras == null) return;

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

            if (nextState === "backlog") {
                card.remove();
                const tableRow = document.querySelector(`tr.task-item[data-id="${taskId}"]`);
                tableRow?.remove();
                applyFilters();
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
                if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
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
                if (card.dataset.href) window.location.href = card.dataset.href;
            });
        }

        for (const column of document.querySelectorAll(".task-board-column")) {
            column.addEventListener("dragover", (event) => {
                event.preventDefault();
                column.classList.add("drag-over");
                if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
            });
            column.addEventListener("dragleave", () => column.classList.remove("drag-over"));
            column.addEventListener("drop", async (event) => {
                event.preventDefault();
                column.classList.remove("drag-over");
                const taskId =
                    event.dataTransfer?.getData("text/plain") || dragTaskId || "";
                const card = document.querySelector(`.task-board-card[data-id="${taskId}"]`);
                const nextState = column.dataset.state || "";
                if (!card || !nextState) return;
                dragMoved = true;
                await moveBoardCardToState(card, nextState);
            });
        }
    }

    async function uploadCreateAttachments(taskId, files) {
        for (const file of files) {
            const sizeCheck = window.validateUploadFiles?.(file);
            if (sizeCheck && !sizeCheck.ok) {
                throw new Error(sizeCheck.error || "Invalid attachment");
            }
            const mediaBody = new FormData();
            mediaBody.append("file", file);
            const mediaResponse = await fetch("/api/media", {
                method: "POST",
                credentials: "same-origin",
                body: mediaBody,
            });
            const mediaData = await mediaResponse.json().catch(() => ({}));
            if (!mediaResponse.ok || !mediaData.id) {
                throw new Error(mediaData.error || "Failed to upload attachment");
            }
            const linkResponse = await fetch("/api/task-attachments", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ task_id: taskId, media_id: mediaData.id }),
            });
            const linkData = await linkResponse.json().catch(() => ({}));
            if (!linkResponse.ok) {
                throw new Error(linkData.error || "Failed to link attachment");
            }
        }
    }

    restoreFilters();
    syncSprintLabel();
    syncViewMode();
    setupBoardDragAndDrop();
    applyFilters();

    window.bindSortableHeaders?.({
        table: document.getElementById("tasks-table"),
        getSortValue: (row, sortKey) => {
            if (sortKey === "expectedHours") return Number(row.dataset.expectedHours || 0);
            if (sortKey === "end") return parseDateTimeMs(row.dataset.endAt) || 0;
            if (sortKey === "priority") return PRIORITY_ORDER[row.dataset.priority] || 9;
            if (sortKey === "id") return Number(row.dataset.id || 0);
            return row.dataset[sortKey] ?? row.textContent;
        },
    });

    searchInput?.addEventListener("input", applyFilters);
    stateFilter?.addEventListener("change", applyFilters);
    assigneeFilter?.addEventListener("change", applyFilters);
    projectFilter?.addEventListener("change", applyFilters);
    priorityFilter?.addEventListener("change", applyFilters);
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
        if (overdueFilter) overdueFilter.checked = false;
        if (dueSoonFilter) dueSoonFilter.checked = false;
        applyFilters();
    });
    sprintPrevButton?.addEventListener("click", () => shiftSprintWeek(-7));
    sprintNextButton?.addEventListener("click", () => shiftSprintWeek(7));
    sprintCurrentButton?.addEventListener("click", () => {
        selectedSprintWeek = window.getMondayDate?.(new Date()) || selectedSprintWeek;
        syncSprintLabel();
        applyFilters();
    });

    selectAllCheckbox?.addEventListener("change", () => {
        for (const row of tableRows()) {
            if (row.classList.contains("d-none")) continue;
            const checkbox = row.querySelector(".task-select");
            if (checkbox) checkbox.checked = !!selectAllCheckbox.checked;
        }
        syncBulkBar();
    });
    tableBody?.addEventListener("change", (event) => {
        if (event.target?.classList?.contains("task-select")) syncBulkBar();
    });
    bulkStateSelect?.addEventListener("change", syncBulkBar);
    bulkClearButton?.addEventListener("click", () => {
        for (const input of document.querySelectorAll(".task-select:checked")) {
            input.checked = false;
        }
        syncBulkBar();
    });
    bulkApplyButton?.addEventListener("click", async () => {
        const ids = Array.from(document.querySelectorAll(".task-select:checked"))
            .map((input) => Number(input.value))
            .filter((id) => id >= 1);
        const state = bulkStateSelect?.value || "";
        if (!ids.length || !state) return;
        try {
            const response = await fetch("/api/tasks/bulk-state", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids, state }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showAlert(pageAlert, data.error || "Failed to update tasks.", "danger");
                return;
            }
            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert(pageAlert, "Failed to update tasks.", "danger");
        }
    });

    exportCsvButton?.addEventListener("click", () => {
        const rows = tableRows().filter((row) => !row.classList.contains("d-none"));
        const lines = [
            ["id", "title", "state", "priority", "assignee", "project", "end_at", "expected_hours"].join(
                ",",
            ),
        ];
        for (const row of rows) {
            lines.push(
                [
                    row.dataset.id || "",
                    JSON.stringify(row.dataset.title || ""),
                    row.dataset.state || "",
                    row.dataset.priority || "",
                    JSON.stringify(row.dataset.assignee || ""),
                    JSON.stringify(row.dataset.project || ""),
                    row.dataset.endAt || "",
                    row.dataset.expectedHours || "",
                ].join(","),
            );
        }
        const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `tasks-${selectedSprintWeek}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    });

    for (const row of tableRows()) {
        row.addEventListener("click", (event) => {
            if (event.target.closest(".task-select, select, button, a, input, textarea, label")) {
                return;
            }
            if (row.dataset.href) window.location.href = row.dataset.href;
        });
        row.addEventListener("keydown", (event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            if (event.target.closest(".task-select")) return;
            event.preventDefault();
            if (row.dataset.href) window.location.href = row.dataset.href;
        });
    }

    const taskModal = document.getElementById("task-modal");
    const createSprintWeekSelect = document.getElementById("task-create-sprint-week");
    taskModal?.addEventListener("show.bs.modal", () => {
        if (!createSprintWeekSelect) return;
        const week = selectedSprintWeek || window.getMondayDate?.(new Date()) || "";
        if (!week) return;
        const hasOption = Array.from(createSprintWeekSelect.options).some(
            (option) => option.value === week,
        );
        if (hasOption) {
            createSprintWeekSelect.value = week;
        }
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
        const priority = document.getElementById("task-priority")?.value || "p3";
        const files = Array.from(
            document.getElementById("task-create-attachments")?.files || [],
        );

        if (!title) {
            showAlert(taskFormAlert, "Title is required.", "danger");
            return;
        }

        const sprintWeekRaw = createSprintWeekSelect?.value || "";
        const sprintWeek = sprintWeekRaw.trim()
            ? window.getMondayDate?.(sprintWeekRaw) || sprintWeekRaw.trim()
            : null;
        const payload = {
            title,
            priority,
            state: sprintWeek ? "analyzing" : "backlog",
            sprint_week_start: sprintWeek,
        };
        if (description) payload.description = description;
        if (expectedHoursRaw !== "") {
            const expectedHours = Number(expectedHoursRaw);
            if (!Number.isFinite(expectedHours) || expectedHours < 0 || expectedHours > 9) {
                showAlert(taskFormAlert, "Expected hours must be between 0 and 9.", "danger");
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
        if (sprintWeek && (payload.start_at || payload.end_at)) {
            const sunday = window.getSundayDate?.(sprintWeek);
            const startKey = payload.start_at ? String(payload.start_at).slice(0, 10) : null;
            const endKey = payload.end_at ? String(payload.end_at).slice(0, 10) : null;
            if (startKey && (startKey < sprintWeek || startKey > sunday)) {
                showAlert(
                    taskFormAlert,
                    `Start must fall within the sprint week (${sprintWeek} to ${sunday}).`,
                    "danger",
                );
                return;
            }
            if (endKey && (endKey < sprintWeek || endKey > sunday)) {
                showAlert(
                    taskFormAlert,
                    `End must fall within the sprint week (${sprintWeek} to ${sunday}).`,
                    "danger",
                );
                return;
            }
        }
        if (payload.start_at && payload.end_at && String(payload.start_at) > String(payload.end_at)) {
            showAlert(taskFormAlert, "Start must be before end.", "danger");
            return;
        }
        if (assigneeRaw) payload.assignee_user_id = Number(assigneeRaw);
        if (isTaskAdmin && projectRaw) payload.project_id = Number(projectRaw);

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
            const taskId = Number(data.task?.id || data.id || 0);
            if (taskId >= 1 && files.length) {
                await uploadCreateAttachments(taskId, files);
            }
            window.location.href = taskId >= 1 ? `/app/tasks/${taskId}` : "/app/tasks/backlog";
        } catch (error) {
            console.error(error);
            showAlert(taskFormAlert, error.message || "Failed to create task.", "danger");
        } finally {
            if (taskSubmitButton) taskSubmitButton.disabled = false;
        }
    });
})();
