(() => {
    const form = document.getElementById("document-form");
    const formAlert = document.getElementById("document-form-alert");
    const pageAlert = document.getElementById("internal-documents-alert");
    const modalElement = document.getElementById("document-modal");
    const modalLabel = document.getElementById("document-modal-label");
    const submitButton = document.getElementById("document-submit-btn");
    const openAddButton = document.getElementById("open-add-document-btn");
    const searchInput = document.getElementById("documents-search");
    const tableBody = document.getElementById("documents-tbody");
    const emptyState = document.getElementById("documents-empty");
    const tableWrap = document.getElementById("documents-table-wrap");

    const idInput = form?.elements.namedItem("id");
    const fileInput = form?.elements.namedItem("file");
    const descriptionInput = form?.elements.namedItem("description");

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

    function resetForm() {
        form?.reset();
        if (idInput) idInput.value = "";
        hideAlert(formAlert);
    }

    function openAddModal() {
        resetForm();
        if (modalLabel) modalLabel.textContent = "Add document";
        if (submitButton) submitButton.textContent = "Upload";
        if (fileInput) fileInput.required = true;
    }

    function openEditModal(row) {
        hideAlert(formAlert);
        if (modalLabel) modalLabel.textContent = "Edit document";
        if (submitButton) submitButton.textContent = "Save";
        if (idInput) idInput.value = row.dataset.id || "";
        if (descriptionInput) descriptionInput.value = row.dataset.description || "";
        if (fileInput) {
            fileInput.value = "";
            fileInput.required = true;
        }
    }

    function applySearch() {
        if (!tableBody) return;

        const query = (searchInput?.value || "").trim().toLowerCase();
        const rows = [...tableBody.querySelectorAll("tr[data-id]")];

        rows.forEach((row) => {
            const haystack = [row.dataset.name || "", row.dataset.description || ""]
                .join(" ")
                .toLowerCase();
            row.classList.toggle("d-none", Boolean(query) && !haystack.includes(query));
        });

        const hasVisible = rows.some((row) => !row.classList.contains("d-none"));
        emptyState?.classList.toggle("d-none", hasVisible);
        tableWrap?.classList.toggle("d-none", !hasVisible);
    }

    openAddButton?.addEventListener("click", openAddModal);
    searchInput?.addEventListener("input", applySearch);

    tableBody?.addEventListener("click", async (event) => {
        const row = event.target.closest("tr[data-id]");
        if (!row) return;

        if (event.target.closest(".document-edit-btn")) {
            openEditModal(row);
            const modal = window.bootstrap?.Modal?.getOrCreateInstance(modalElement);
            modal?.show();
            return;
        }

        if (event.target.closest(".document-delete-btn")) {
            const confirmed = await showConfirm({
                title: "Delete document?",
                description: "This will remove the document permanently.",
                choices: [
                    { label: "Cancel", variant: "secondary", value: false },
                    { label: "Delete", variant: "danger", value: true },
                ],
            });
            if (!confirmed) {
                return;
            }

            try {
                const response = await fetch(`/api/internal-documents/${row.dataset.id}`, {
                    method: "DELETE",
                    credentials: "same-origin",
                });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    showAlert(pageAlert, data.error || "Failed to delete document.", "danger");
                    return;
                }
                window.location.reload();
            } catch (error) {
                console.error(error);
                showAlert(pageAlert, "Failed to delete document.", "danger");
            }
        }
    });

    form?.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideAlert(formAlert);

        const documentId = Number(idInput?.value || 0);
        const description = descriptionInput?.value?.trim() || "";
        const uploadedFile = fileInput?.files?.[0];
        const isEdit = Number.isInteger(documentId) && documentId > 0;

        if (!uploadedFile) {
            showAlert(formAlert, "Please select a file.", "danger");
            return;
        }

        if (submitButton) {
            submitButton.disabled = true;
        }

        try {
            const body = new FormData();
            body.append("file", uploadedFile);
            body.append("description", description);

            const response = await fetch(
                isEdit ? `/api/internal-documents/${documentId}` : "/api/internal-documents",
                {
                    method: isEdit ? "PATCH" : "POST",
                    credentials: "same-origin",
                    body,
                },
            );
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showAlert(
                    formAlert,
                    data.error || (isEdit ? "Failed to update document." : "Failed to upload document."),
                    "danger",
                );
                return;
            }

            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert(formAlert, "Failed to save document.", "danger");
            showAlert(pageAlert, "Failed to save document.", "danger");
        } finally {
            if (submitButton) {
                submitButton.disabled = false;
            }
        }
    });
})();
