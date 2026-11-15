(() => {
    const pageAlert = document.getElementById("job-alert");
    const searchInput = document.getElementById("applicants-search");
    const tableBody = document.getElementById("applicants-tbody");
    const emptyState = document.getElementById("applicants-empty");
    const tableWrap = document.getElementById("applicants-table-wrap");
    const selectAllCheckbox = document.getElementById("applicants-select-all");
    const bulkBar = document.getElementById("applicants-bulk-bar");
    const selectedCountLabel = document.getElementById("applicants-selected-count");
    const bulkShortlistBtn = document.getElementById("applicants-bulk-shortlist-btn");
    const bulkClearBtn = document.getElementById("applicants-bulk-clear-btn");

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

    function visibleRows() {
        if (!tableBody) return [];
        return [...tableBody.querySelectorAll("tr[data-id]")].filter(
            (row) => !row.classList.contains("d-none"),
        );
    }

    function selectedCheckboxes() {
        if (!tableBody) return [];
        return [...tableBody.querySelectorAll(".applicant-select:checked")].filter(
            (input) => !input.closest("tr")?.classList.contains("d-none"),
        );
    }

    function syncBulkBar() {
        const selected = selectedCheckboxes();
        const count = selected.length;
        if (selectedCountLabel) {
            selectedCountLabel.textContent = `${count} selected`;
        }
        bulkBar?.classList.toggle("d-none", count === 0);
        if (bulkShortlistBtn) bulkShortlistBtn.disabled = count === 0;

        const visible = visibleRows();
        const visibleChecked = visible.filter((row) =>
            row.querySelector(".applicant-select")?.checked,
        );
        if (selectAllCheckbox) {
            selectAllCheckbox.checked =
                visible.length > 0 && visibleChecked.length === visible.length;
            selectAllCheckbox.indeterminate =
                visibleChecked.length > 0 && visibleChecked.length < visible.length;
        }
    }

    function applySearch() {
        if (!tableBody) return;
        const query = String(searchInput?.value || "")
            .trim()
            .toLowerCase();
        let visibleCount = 0;
        for (const row of tableBody.querySelectorAll("tr[data-id]")) {
            const haystack = [
                row.dataset.name || "",
                row.dataset.email || "",
                row.dataset.phone || "",
            ]
                .join(" ")
                .toLowerCase();
            const match = !query || haystack.includes(query);
            row.classList.toggle("d-none", !match);
            if (!match) {
                const checkbox = row.querySelector(".applicant-select");
                if (checkbox) checkbox.checked = false;
            }
            if (match) visibleCount += 1;
        }
        emptyState?.classList.toggle("d-none", visibleCount > 0);
        tableWrap?.classList.toggle("d-none", visibleCount === 0 && !!query);
        syncBulkBar();
    }

    searchInput?.addEventListener("input", applySearch);

    selectAllCheckbox?.addEventListener("change", () => {
        const checked = !!selectAllCheckbox.checked;
        for (const row of visibleRows()) {
            const checkbox = row.querySelector(".applicant-select");
            if (checkbox) checkbox.checked = checked;
        }
        syncBulkBar();
    });

    tableBody?.addEventListener("change", (event) => {
        if (event.target.classList.contains("applicant-select")) {
            syncBulkBar();
        }
    });

    bulkClearBtn?.addEventListener("click", () => {
        for (const checkbox of tableBody?.querySelectorAll(".applicant-select:checked") || []) {
            checkbox.checked = false;
        }
        if (selectAllCheckbox) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        }
        syncBulkBar();
    });

    bulkShortlistBtn?.addEventListener("click", async () => {
        const ids = selectedCheckboxes().map((input) => Number(input.value));
        if (!ids.length) return;

        const confirmed = await window.showConfirm({
            title: "Mark shortlisted?",
            description: "Selected applicants who are not already shortlisted will be emailed.",
            choices: [
                { label: "Cancel", value: false, className: "btn-outline-secondary" },
                { label: "Mark shortlisted", value: true, className: "btn-primary" },
            ],
        });
        if (!confirmed) return;

        hideAlert(pageAlert);
        try {
            const response = await fetch("/api/job-applications/shortlist", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showAlert(pageAlert, data.error || "Failed to shortlist applicants.", "danger");
                return;
            }
            window.location.reload();
        } catch (error) {
            showAlert(pageAlert, error?.message || "Failed to shortlist applicants.", "danger");
        }
    });

    tableBody?.addEventListener("click", (event) => {
        if (event.target.closest("button, a, input, label")) {
            return;
        }
        const row = event.target.closest("tr[data-id]");
        if (!row?.dataset.href) return;
        window.location.href = row.dataset.href;
    });

    syncBulkBar();
})();
