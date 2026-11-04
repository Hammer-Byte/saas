(() => {
    const fromInput = document.getElementById("gem-tenders-from");
    const toInput = document.getElementById("gem-tenders-to");
    const keywordFilter = document.getElementById("gem-filter-keyword");
    const assigneeFilter = document.getElementById("gem-filter-assignee");
    const showAllFilter = document.getElementById("gem-filter-show-all");
    const searchInput = document.getElementById("gem-tenders-search");
    const tableBody = document.getElementById("gem-tenders-tbody");
    const tableWrap = document.getElementById("gem-tenders-table-wrap");
    const emptyState = document.getElementById("gem-tenders-empty");
    const filterStatus = document.getElementById("gem-tenders-filter-status");
    const columnFilters = Array.from(document.querySelectorAll(".gem-tender-column-filter"));

    function reloadDateRange() {
        if (!fromInput?.value || !toInput?.value) return;

        const from = window.getWritableDate("YYYY-MM-DD", fromInput.value);
        const to = window.getWritableDate("YYYY-MM-DD", toInput.value);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return;

        const url = new URL(window.location.href);
        url.searchParams.set("from", from);
        url.searchParams.set("to", to);
        window.location.href = url.toString();
    }

    fromInput?.addEventListener("change", reloadDateRange);
    toInput?.addEventListener("change", reloadDateRange);

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

    function applyFilters() {
        const query = (searchInput?.value || "").trim().toLowerCase();
        const keywordId = (keywordFilter?.value || "").trim();
        const assigneeValue = (assigneeFilter?.value || "").trim();
        const showAll = !!showAllFilter?.checked;
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

            const visible =
                matchesHidden &&
                matchesKeyword &&
                matchesAssignee &&
                matchesSearch &&
                matchesColumns;
            row.classList.toggle("d-none", !visible);
            if (visible) visibleCount += 1;
        }

        if (filterStatus) {
            filterStatus.textContent = `Showing ${visibleCount} of ${rows.length} tenders`;
        }

        const hasRows = rows.length > 0;
        tableWrap?.classList.toggle("d-none", !hasRows);
        emptyState?.classList.toggle("d-none", hasRows);
    }

    for (const select of columnFilters) {
        fillColumnFilter(select);
        select.addEventListener("change", applyFilters);
    }

    keywordFilter?.addEventListener("change", applyFilters);
    assigneeFilter?.addEventListener("change", applyFilters);
    showAllFilter?.addEventListener("change", applyFilters);
    searchInput?.addEventListener("input", applyFilters);

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

