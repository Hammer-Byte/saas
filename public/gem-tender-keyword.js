(() => {
    const monthInput = document.getElementById("gem-tenders-month");
    const searchInput = document.getElementById("gem-tenders-search");
    const tableBody = document.getElementById("gem-tenders-tbody");
    const tableWrap = document.getElementById("gem-tenders-table-wrap");
    const emptyState = document.getElementById("gem-tenders-empty");
    const filterStatus = document.getElementById("gem-tenders-filter-status");
    const columnFilters = Array.from(document.querySelectorAll(".gem-tender-column-filter"));
    const pastExperienceFilter = document.getElementById("gem-filter-past-experience");
    const quoteModalElement = document.getElementById("gem-tender-quote-modal");
    const quoteForm = document.getElementById("gem-tender-quote-form");
    const quoteFormAlert = document.getElementById("gem-tender-quote-form-alert");
    const quoteIdInput = document.getElementById("gem-tender-quote-id");
    const quoteTextInput = document.getElementById("gem-tender-quote-text");
    const quoteSaveButton = document.getElementById("gem-tender-quote-save-btn");

    monthInput?.addEventListener("change", () => {
        if (!monthInput.value) return;
        const month = monthInput.value.slice(0, 7);
        if (!/^\d{4}-\d{2}$/.test(month)) return;
        const url = new URL(window.location.href);
        url.searchParams.set("month", month);
        window.location.href = url.toString();
    });

    if (!tableBody) return;

    let rows = Array.from(tableBody.querySelectorAll("tr"));

    function showFormAlert(message, type) {
        if (!quoteFormAlert) return;
        quoteFormAlert.textContent = message;
        quoteFormAlert.className = `alert alert-${type}`;
        quoteFormAlert.classList.remove("d-none");
    }

    function hideFormAlert() {
        if (!quoteFormAlert) return;
        quoteFormAlert.classList.add("d-none");
        quoteFormAlert.textContent = "";
    }

    function quotePreview(quote) {
        const value = (quote || "").trim();
        if (!value) return "Add quote";
        return value.length > 48 ? `${value.slice(0, 48)}…` : value;
    }

    function readQuote(row) {
        try {
            return decodeURIComponent(row.dataset.quote || "");
        } catch (error) {
            return row.dataset.quote || "";
        }
    }

    function writeQuote(row, quote) {
        row.dataset.quote = encodeURIComponent(quote || "");
    }

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

        const hasRows = rows.length > 0;
        tableWrap?.classList.toggle("d-none", !hasRows);
        emptyState?.classList.toggle("d-none", hasRows);
    }

    function refreshRows() {
        rows = Array.from(tableBody.querySelectorAll("tr"));
        for (const select of columnFilters) {
            fillColumnFilter(select);
        }
        fillPastExperienceFilter();
        applyFilters();
    }

    async function patchTender(tenderId, payload) {
        const response = await fetch(`/api/gem-keyword-tenders/${tenderId}`, {
            method: "PATCH",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const data = await response.json().catch(() => ({}));
        return { response, data };
    }

    tableBody.addEventListener("change", async (event) => {
        const checkbox = event.target.closest(
            ".gem-tender-eligible-checkbox, .gem-tender-filed-checkbox",
        );
        if (!checkbox) return;

        const row = checkbox.closest("tr[data-id]");
        const tenderId = Number(row?.dataset.id || 0);
        if (!tenderId) return;

        const field = checkbox.classList.contains("gem-tender-eligible-checkbox")
            ? "eligible"
            : "filed";
        const value = checkbox.checked;
        const previous = !value;

        checkbox.disabled = true;

        try {
            const { response, data } = await patchTender(tenderId, { [field]: value });

            if (!response.ok) {
                checkbox.checked = previous;
                window.alert(data.error || `Failed to update ${field}.`);
                return;
            }

            row.dataset[field] = value ? "1" : "0";
            applyFilters();
        } catch (error) {
            console.error(error);
            checkbox.checked = previous;
            window.alert(`Failed to update ${field}.`);
        } finally {
            checkbox.disabled = false;
        }
    });

    tableBody.addEventListener("click", async (event) => {
        const quoteButton = event.target.closest(".gem-tender-quote-btn");
        if (quoteButton) {
            const row = quoteButton.closest("tr[data-id]");
            const tenderId = Number(row?.dataset.id || 0);
            if (!tenderId || !quoteModalElement) return;

            hideFormAlert();
            if (quoteIdInput) quoteIdInput.value = tenderId;
            if (quoteTextInput) quoteTextInput.value = readQuote(row);
            window.bootstrap.Modal.getOrCreateInstance(quoteModalElement).show();
            return;
        }

        const hideButton = event.target.closest(".gem-tender-hidden-btn");
        if (!hideButton) return;

        const row = hideButton.closest("tr[data-id]");
        const tenderId = Number(row?.dataset.id || 0);
        if (!tenderId) return;

        hideButton.disabled = true;

        try {
            const { response, data } = await patchTender(tenderId, { hidden: true });

            if (!response.ok) {
                hideButton.disabled = false;
                window.alert(data.error || "Failed to hide tender.");
                return;
            }

            row.remove();
            refreshRows();
        } catch (error) {
            console.error(error);
            hideButton.disabled = false;
            window.alert("Failed to hide tender.");
        }
    });

    quoteForm?.addEventListener("submit", async (event) => {
        event.preventDefault();

        const tenderId = Number(quoteIdInput?.value || 0);
        if (!tenderId) return;

        const quote = quoteTextInput?.value || "";
        const row = tableBody.querySelector(`tr[data-id="${tenderId}"]`);
        if (!row) return;

        if (quoteSaveButton) quoteSaveButton.disabled = true;
        hideFormAlert();

        try {
            const { response, data } = await patchTender(tenderId, { quote });

            if (!response.ok) {
                showFormAlert(data.error || "Failed to save quote.", "danger");
                return;
            }

            writeQuote(row, quote);
            const quoteButton = row.querySelector(".gem-tender-quote-btn");
            if (quoteButton) quoteButton.textContent = quotePreview(quote);

            window.bootstrap.Modal.getOrCreateInstance(quoteModalElement).hide();
        } catch (error) {
            console.error(error);
            showFormAlert("Failed to save quote.", "danger");
        } finally {
            if (quoteSaveButton) quoteSaveButton.disabled = false;
        }
    });

    for (const select of columnFilters) {
        fillColumnFilter(select);
        select.addEventListener("change", applyFilters);
    }

    fillPastExperienceFilter();
    pastExperienceFilter?.addEventListener("change", applyFilters);
    searchInput?.addEventListener("input", applyFilters);
    applyFilters();
})();
