document.addEventListener("DOMContentLoaded", () => {
    const pageAlert = document.getElementById("sources-alert");
    const searchInput = document.getElementById("sources-search");
    const tableBody = document.getElementById("sources-tbody");
    const emptyState = document.getElementById("sources-empty");
    const tableWrap = document.getElementById("sources-table-wrap");
    const openAddButton = document.getElementById("open-add-source-btn");
    const modalElement = document.getElementById("source-modal");
    const modalLabel = document.getElementById("source-modal-label");
    const form = document.getElementById("source-form");
    const formAlert = document.getElementById("source-form-alert");
    const idInput = document.getElementById("source-id");
    const titleInput = document.getElementById("source-title");
    const submitButton = document.getElementById("source-submit-btn");

    function showAlert(element, message, type) {
        window.showAlert?.(element, message, type);
    }

    function hideAlert(element) {
        window.hideAlert?.(element);
    }

    function applySearch() {
        const query = (searchInput?.value || "").trim().toLowerCase();
        let visibleCount = 0;
        tableBody?.querySelectorAll("tr").forEach((row) => {
            const haystack = `${row.dataset.title || ""} ${row.dataset.id || ""}`.toLowerCase();
            const visible = !query || haystack.includes(query);
            row.classList.toggle("d-none", !visible);
            if (visible) visibleCount += 1;
        });
        emptyState?.classList.toggle("d-none", visibleCount > 0);
        tableWrap?.classList.toggle("d-none", visibleCount === 0);
    }

    searchInput?.addEventListener("input", applySearch);
    window.bindSortableHeaders?.(document.getElementById("sources-table"));

    function resetForm() {
        form?.reset();
        if (idInput) idInput.value = "";
        hideAlert(formAlert);
        if (modalLabel) modalLabel.textContent = "Add source";
    }

    openAddButton?.addEventListener("click", () => {
        resetForm();
    });

    modalElement?.addEventListener("hidden.bs.modal", () => {
        resetForm();
    });

    tableBody?.addEventListener("click", async (event) => {
        const row = event.target.closest("tr[data-id]");
        if (!row) return;

        if (event.target.closest(".source-edit-btn")) {
            hideAlert(formAlert);
            if (idInput) idInput.value = row.dataset.id || "";
            if (titleInput) titleInput.value = row.dataset.title || "";
            if (modalLabel) modalLabel.textContent = "Edit source";
            const modal = window.bootstrap?.Modal?.getOrCreateInstance(modalElement);
            modal?.show();
            return;
        }

        if (event.target.closest(".source-delete-btn")) {
            const sourceId = Number(row.dataset.id || 0);
            const confirmed = await window.showConfirm?.({
                title: "Delete source?",
                description: `Delete “${row.dataset.title || "this source"}”? Leads using it will keep the lead but lose the source link.`,
                choices: [
                    { label: "Cancel", variant: "secondary", value: false },
                    { label: "Delete", variant: "danger", value: true },
                ],
            });
            if (!confirmed) return;

            try {
                const response = await fetch(`/api/lead-sources/${sourceId}`, {
                    method: "DELETE",
                    credentials: "same-origin",
                });
                if (!response.ok && response.status !== 204) {
                    const data = await response.json().catch(() => ({}));
                    showAlert(pageAlert, data.error || "Failed to delete source.", "danger");
                    return;
                }
                window.location.reload();
            } catch (error) {
                console.error(error);
                showAlert(pageAlert, "Failed to delete source.", "danger");
            }
        }
    });

    form?.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideAlert(formAlert);

        const title = titleInput?.value?.trim() || "";
        if (!title) {
            showAlert(formAlert, "Title is required.", "danger");
            return;
        }

        const sourceId = Number(idInput?.value || 0);
        const isEdit = sourceId >= 1;
        if (submitButton) submitButton.disabled = true;

        try {
            const response = await fetch(
                isEdit ? `/api/lead-sources/${sourceId}` : "/api/lead-sources",
                {
                    method: isEdit ? "PATCH" : "POST",
                    credentials: "same-origin",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ title }),
                },
            );
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showAlert(formAlert, data.error || "Failed to save source.", "danger");
                return;
            }
            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert(formAlert, "Failed to save source.", "danger");
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    });
});
