(() => {
    const monthInput = document.getElementById("gem-tenders-month");
    const searchInput = document.getElementById("gem-tenders-search");
    const tableBody = document.getElementById("gem-tenders-tbody");
    const filterStatus = document.getElementById("gem-tenders-filter-status");
    const columnFilters = Array.from(document.querySelectorAll(".gem-tender-column-filter"));
    const pastExperienceFilter = document.getElementById("gem-filter-past-experience");

    monthInput?.addEventListener("change", () => {
        if (!monthInput.value) return;
        const month = monthInput.value.slice(0, 7);
        if (!/^\d{4}-\d{2}$/.test(month)) return;
        const url = new URL(window.location.href);
        url.searchParams.set("month", month);
        window.location.href = url.toString();
    });

    if (!tableBody) return;

    const rows = Array.from(tableBody.querySelectorAll("tr"));

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

    function fillPastExperienceFilter() {
        if (!pastExperienceFilter) return;

        pastExperienceFilter.replaceChildren();
        for (const value of uniqueColumnValues("pastExperience")) {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = value;
            pastExperienceFilter.appendChild(option);
        }
    }

    function selectedPastExperienceValues() {
        if (!pastExperienceFilter) return [];
        return Array.from(pastExperienceFilter.selectedOptions)
            .map((option) => option.value.trim().toLowerCase())
            .filter(Boolean);
    }

    function applyFilters() {
        const query = (searchInput?.value || "").trim().toLowerCase();
        const pastExperienceValues = selectedPastExperienceValues();
        const activeFilters = columnFilters
            .map((select) => ({
                column: select.dataset.column,
                value: (select.value || "").trim().toLowerCase(),
            }))
            .filter((filter) => filter.column && filter.value);

        let visibleCount = 0;

        for (const row of rows) {
            const matchesSearch = !query || row.textContent.toLowerCase().includes(query);

            const matchesPastExperience =
                !pastExperienceValues.length ||
                pastExperienceValues.includes(
                    (row.dataset.pastExperience || "").trim().toLowerCase(),
                );

            const matchesColumns = activeFilters.every((filter) => {
                const cellValue = (row.dataset[filter.column] || "").trim().toLowerCase();
                return cellValue === filter.value;
            });

            const visible = matchesSearch && matchesPastExperience && matchesColumns;
            row.classList.toggle("d-none", !visible);
            if (visible) visibleCount += 1;
        }

        if (filterStatus) {
            filterStatus.textContent = `Showing ${visibleCount} of ${rows.length} tenders`;
        }
    }

    for (const select of columnFilters) {
        fillColumnFilter(select);
        select.addEventListener("change", applyFilters);
    }

    fillPastExperienceFilter();
    pastExperienceFilter?.addEventListener("change", applyFilters);
    searchInput?.addEventListener("input", applyFilters);
    applyFilters();
})();
