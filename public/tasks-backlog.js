(() => {
    const page = document.getElementById("tasks-backlog-page");
    if (!page) return;

    const currentUserId = Number(page.dataset.currentUserId || 0);
    const pageAlert = document.getElementById("backlog-alert");
    const searchInput = document.getElementById("backlog-search");
    const assigneeFilter = document.getElementById("backlog-filter-assignee");
    const projectFilter = document.getElementById("backlog-filter-project");
    const priorityFilter = document.getElementById("backlog-filter-priority");
    const clearFiltersButton = document.getElementById("backlog-clear-filters-btn");
    const filterStatus = document.getElementById("backlog-filter-status");
    const tableBody = document.getElementById("backlog-tbody");

    let pendingAssign = null;

    function showAlert(message, type) {
        if (!pageAlert) return;
        pageAlert.textContent = message;
        pageAlert.className = `alert alert-${type}`;
        pageAlert.classList.remove("d-none");
    }

    function rows() {
        return tableBody
            ? Array.from(tableBody.querySelectorAll("tr.backlog-item"))
            : [];
    }

    function matchesFilters(row) {
        const query = (searchInput?.value || "").trim().toLowerCase();
        let description = "";
        try {
            description = decodeURIComponent(row.dataset.description || "");
        } catch (error) {
            description = row.dataset.description || "";
        }
        const haystack = [row.dataset.title || "", description].join(" ").toLowerCase();
        if (query && !haystack.includes(query)) return false;

        const assigneeValue = (assigneeFilter?.value || "").trim();
        const assigneeId = String(row.dataset.assigneeId || "");
        if (assigneeValue === "__me__") {
            if (!(currentUserId >= 1) || assigneeId !== String(currentUserId)) return false;
        } else if (assigneeValue === "unassigned") {
            if (assigneeId) return false;
        } else if (assigneeValue && assigneeId !== assigneeValue) {
            return false;
        }

        const projectValue = (projectFilter?.value || "").trim();
        const projectId = String(row.dataset.projectId || "");
        if (projectValue === "none") {
            if (projectId) return false;
        } else if (projectValue && projectId !== projectValue) {
            return false;
        }

        const priorityValue = (priorityFilter?.value || "").trim();
        if (priorityValue && (row.dataset.priority || "") !== priorityValue) return false;

        return true;
    }

    function applyFilters() {
        let visible = 0;
        for (const row of rows()) {
            const show = matchesFilters(row);
            row.classList.toggle("d-none", !show);
            if (show) visible += 1;
        }
        if (filterStatus) {
            const total = rows().length;
            filterStatus.textContent = total ? `Showing ${visible} of ${total} backlog items` : "";
        }
    }

    function promptAssignee() {
        return new Promise((resolve) => {
            const modalElement = document.getElementById("backlog-assignee-modal");
            const formElement = document.getElementById("backlog-assignee-form");
            const selectElement = document.getElementById("backlog-assignee");
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
                const value = selectElement?.value || "";
                if (!value) return;
                modal.hide();
                finish(Number(value));
            }

            function onHidden() {
                finish(null);
            }

            formElement.addEventListener("submit", onSubmit);
            modalElement.addEventListener("hidden.bs.modal", onHidden, { once: true });
            if (selectElement) selectElement.value = "";
            modal.show();
        });
    }

    async function assignToSprint(button) {
        const row = button.closest("tr.backlog-item");
        const taskId = Number(button.dataset.taskId || row?.dataset.id || 0);
        const sprintSelect = row?.querySelector(".backlog-sprint-select");
        const week = sprintSelect?.value || "";
        if (!(taskId >= 1) || !week) {
            showAlert("Select a sprint week first.", "warning");
            return;
        }

        let assigneeId = Number(button.dataset.assigneeId || row?.dataset.assigneeId || 0);
        if (!(assigneeId >= 1)) {
            assigneeId = await promptAssignee();
            if (!(assigneeId >= 1)) {
                showAlert("Assignee is required to leave backlog.", "warning");
                return;
            }
        }

        button.disabled = true;
        try {
            const response = await fetch(`/api/tasks/${taskId}/state`, {
                method: "PATCH",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    state: "in_progress",
                    assignee_user_id: assigneeId,
                    sprint_week_start: week,
                }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showAlert(data.error || "Failed to assign sprint.", "danger");
                return;
            }
            window.location.href = "/app/tasks";
        } catch (error) {
            console.error(error);
            showAlert("Failed to assign sprint.", "danger");
        } finally {
            button.disabled = false;
        }
    }

    searchInput?.addEventListener("input", applyFilters);
    assigneeFilter?.addEventListener("change", applyFilters);
    projectFilter?.addEventListener("change", applyFilters);
    priorityFilter?.addEventListener("change", applyFilters);
    clearFiltersButton?.addEventListener("click", () => {
        if (searchInput) searchInput.value = "";
        if (assigneeFilter) assigneeFilter.value = "";
        if (projectFilter) projectFilter.value = "";
        if (priorityFilter) priorityFilter.value = "";
        applyFilters();
    });

    tableBody?.addEventListener("click", (event) => {
        const button = event.target.closest(".backlog-assign-btn");
        if (button) {
            event.preventDefault();
            assignToSprint(button);
        }
    });

    window.bindSortableHeaders?.({
        table: document.getElementById("backlog-table"),
        getSortValue: (row, sortKey) => {
            if (sortKey === "expectedHours") return Number(row.dataset.expectedHours || 0);
            if (sortKey === "created") return Date.parse(row.dataset.createdOn || "") || 0;
            if (sortKey === "id") return Number(row.dataset.id || 0);
            return row.dataset[sortKey] ?? row.textContent;
        },
    });

    applyFilters();
})();
