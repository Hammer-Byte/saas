(() => {
    const page = document.getElementById("internal-documents-page");
    const canManage = page?.dataset.canManage === "1";
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
    const progressWrap = document.getElementById("document-upload-progress");
    const progressBar = document.getElementById("document-upload-bar");
    const progressBarHost = document.getElementById("document-upload-progressbar");
    const progressStatus = document.getElementById("document-upload-status");
    const progressPercent = document.getElementById("document-upload-percent");
    const selectAllCheckbox = document.getElementById("documents-select-all");
    const bulkBar = document.getElementById("internal-documents-bulk-bar");
    const selectedCountLabel = document.getElementById("internal-documents-selected-count");
    const bulkDeleteBtn = document.getElementById("internal-documents-bulk-delete-btn");
    const bulkClearBtn = document.getElementById("internal-documents-bulk-clear-btn");

    const idInput = form?.elements.namedItem("id");
    const fileInput = form?.elements.namedItem("file");
    const descriptionInput = form?.elements.namedItem("description");
    const visibilityInput = form?.elements.namedItem("visibility");

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

    function setUploadProgress(percent, statusText) {
        const value = Math.max(0, Math.min(100, Math.round(percent)));
        progressWrap?.classList.remove("d-none");
        if (progressBar) progressBar.style.width = `${value}%`;
        if (progressBarHost) progressBarHost.setAttribute("aria-valuenow", String(value));
        if (progressPercent) progressPercent.textContent = `${value}%`;
        if (progressStatus && statusText) progressStatus.textContent = statusText;
    }

    function hideUploadProgress() {
        progressWrap?.classList.add("d-none");
        if (progressBar) progressBar.style.width = "0%";
        if (progressBarHost) progressBarHost.setAttribute("aria-valuenow", "0");
        if (progressPercent) progressPercent.textContent = "0%";
        if (progressStatus) progressStatus.textContent = "Uploading…";
    }

    function resetForm() {
        form?.reset();
        if (idInput) idInput.value = "";
        if (visibilityInput) visibilityInput.value = "restricted";
        hideAlert(formAlert);
        hideUploadProgress();
    }

    function openAddModal() {
        if (!canManage) return;
        resetForm();
        if (modalLabel) modalLabel.textContent = "Add document";
        if (submitButton) submitButton.textContent = "Upload";
        if (fileInput) fileInput.required = true;
    }

    function openEditModal(row) {
        if (!canManage) return;
        hideAlert(formAlert);
        hideUploadProgress();
        if (modalLabel) modalLabel.textContent = "Edit document";
        if (submitButton) submitButton.textContent = "Save";
        if (idInput) idInput.value = row.dataset.id || "";
        if (descriptionInput) descriptionInput.value = row.dataset.description || "";
        if (visibilityInput) {
            visibilityInput.value =
                row.dataset.visibility === "everyone" ? "everyone" : "restricted";
        }
        if (fileInput) {
            fileInput.value = "";
            fileInput.required = true;
        }
    }

    function visibleRows() {
        if (!tableBody) return [];
        return [...tableBody.querySelectorAll("tr[data-id]")].filter(
            (row) => !row.classList.contains("d-none"),
        );
    }

    function selectedCheckboxes() {
        if (!tableBody) return [];
        return [...tableBody.querySelectorAll(".document-select:checked")].filter(
            (input) => !input.closest("tr")?.classList.contains("d-none"),
        );
    }

    function syncBulkBar() {
        if (!canManage) return;
        const selected = selectedCheckboxes();
        const count = selected.length;
        if (selectedCountLabel) {
            selectedCountLabel.textContent = `${count} selected`;
        }
        bulkBar?.classList.toggle("d-none", count === 0);
        if (bulkDeleteBtn) bulkDeleteBtn.disabled = count === 0;

        if (selectAllCheckbox) {
            const visibles = visibleRows();
            const visibleChecks = visibles
                .map((row) => row.querySelector(".document-select"))
                .filter(Boolean);
            const checkedVisible = visibleChecks.filter((input) => input.checked).length;
            selectAllCheckbox.checked =
                visibleChecks.length > 0 && checkedVisible === visibleChecks.length;
            selectAllCheckbox.indeterminate =
                checkedVisible > 0 && checkedVisible < visibleChecks.length;
        }
    }

    function clearSelection() {
        if (!tableBody) return;
        for (const input of tableBody.querySelectorAll(".document-select")) {
            input.checked = false;
        }
        if (selectAllCheckbox) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        }
        syncBulkBar();
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
            if (row.classList.contains("d-none")) {
                const checkbox = row.querySelector(".document-select");
                if (checkbox) checkbox.checked = false;
            }
        });

        const hasVisible = rows.some((row) => !row.classList.contains("d-none"));
        emptyState?.classList.toggle("d-none", hasVisible);
        tableWrap?.classList.toggle("d-none", !hasVisible);
        syncBulkBar();
    }

    function uploadWithProgress({ url, method, body }) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open(method, url);
            xhr.withCredentials = true;

            xhr.upload.addEventListener("progress", (event) => {
                if (!event.lengthComputable) {
                    setUploadProgress(0, "Uploading…");
                    return;
                }
                const percent = (event.loaded / event.total) * 100;
                setUploadProgress(percent, "Uploading…");
            });

            xhr.upload.addEventListener("load", () => {
                setUploadProgress(100, "Processing…");
            });

            xhr.addEventListener("load", () => {
                let data = {};
                try {
                    data = xhr.responseText ? JSON.parse(xhr.responseText) : {};
                } catch {
                    data = { error: xhr.responseText?.slice(0, 300) || "Invalid server response" };
                }
                if (!data.error && !(xhr.status >= 200 && xhr.status < 300)) {
                    data.error = `Upload failed (HTTP ${xhr.status})`;
                }
                resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, data });
            });

            xhr.addEventListener("error", () => reject(new Error("Network error")));
            xhr.addEventListener("abort", () => reject(new Error("Upload aborted")));
            xhr.send(body);
        });
    }

    async function deleteDocumentById(id) {
        const response = await fetch(`/api/internal-documents/${id}`, {
            method: "DELETE",
            credentials: "same-origin",
        });
        const data = await response.json().catch(() => ({}));
        return { ok: response.ok, data };
    }

    openAddButton?.addEventListener("click", openAddModal);
    searchInput?.addEventListener("input", applySearch);

    tableBody?.addEventListener("change", (event) => {
        if (event.target?.classList?.contains("document-select")) {
            syncBulkBar();
        }
    });

    selectAllCheckbox?.addEventListener("change", () => {
        const checked = !!selectAllCheckbox.checked;
        for (const row of visibleRows()) {
            const checkbox = row.querySelector(".document-select");
            if (checkbox) checkbox.checked = checked;
        }
        syncBulkBar();
    });

    bulkClearBtn?.addEventListener("click", () => {
        clearSelection();
    });

    bulkDeleteBtn?.addEventListener("click", async () => {
        if (!canManage) return;
        const selected = selectedCheckboxes();
        if (!selected.length) return;

        const confirmed = await window.showConfirm({
            title: "Delete documents?",
            description: `This will permanently delete ${selected.length} document(s).`,
            choices: [
                { label: "Cancel", variant: "secondary", value: false },
                { label: "Delete", variant: "danger", value: true },
            ],
        });
        if (!confirmed) return;

        bulkDeleteBtn.disabled = true;
        let successCount = 0;
        let failCount = 0;

        for (const checkbox of selected) {
            const id = Number(checkbox.value || 0);
            if (!(id >= 1)) {
                failCount += 1;
                continue;
            }
            try {
                const { ok } = await deleteDocumentById(id);
                if (ok) successCount += 1;
                else failCount += 1;
            } catch (error) {
                console.error(error);
                failCount += 1;
            }
        }

        if (failCount === 0) {
            window.location.reload();
            return;
        }

        showAlert(
            pageAlert,
            `Deleted ${successCount}, failed ${failCount}. Refresh to see updates.`,
            "danger",
        );
        bulkDeleteBtn.disabled = false;
    });

    tableBody?.addEventListener("click", async (event) => {
        if (!canManage) return;
        const row = event.target.closest("tr[data-id]");
        if (!row) return;

        if (event.target.closest(".document-edit-btn")) {
            openEditModal(row);
            const modal = window.bootstrap?.Modal?.getOrCreateInstance(modalElement);
            modal?.show();
            return;
        }

        if (event.target.closest(".document-delete-btn")) {
            const confirmed = await window.showConfirm({
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
                const { ok, data } = await deleteDocumentById(row.dataset.id);
                if (!ok) {
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
        if (!canManage) return;
        hideAlert(formAlert);

        const documentId = Number(idInput?.value || 0);
        const description = descriptionInput?.value?.trim() || "";
        const visibility =
            visibilityInput?.value === "everyone" ? "everyone" : "restricted";
        const uploadedFile = fileInput?.files?.[0];
        const isEdit = Number.isInteger(documentId) && documentId > 0;

        if (!uploadedFile) {
            showAlert(formAlert, "Please select a file.", "danger");
            return;
        }

        const sizeCheck = window.validateUploadFiles?.(uploadedFile);
        if (sizeCheck && !sizeCheck.ok) {
            showAlert(formAlert, sizeCheck.error, "danger");
            return;
        }

        if (submitButton) {
            submitButton.disabled = true;
        }
        if (fileInput) fileInput.disabled = true;
        if (descriptionInput) descriptionInput.disabled = true;
        if (visibilityInput) visibilityInput.disabled = true;

        setUploadProgress(0, "Uploading…");

        try {
            const body = new FormData();
            body.append("file", uploadedFile);
            body.append("description", description);
            body.append("visibility", visibility);

            const { ok, status, data } = await uploadWithProgress({
                url: isEdit ? `/api/internal-documents/${documentId}` : "/api/internal-documents",
                method: isEdit ? "PATCH" : "POST",
                body,
            });

            if (!ok) {
                hideUploadProgress();
                showAlert(
                    formAlert,
                    data.error ||
                        (isEdit
                            ? `Failed to update document (HTTP ${status}).`
                            : `Failed to upload document (HTTP ${status}).`),
                    "danger",
                );
                return;
            }

            setUploadProgress(100, "Done");
            window.location.reload();
        } catch (error) {
            console.error(error);
            hideUploadProgress();
            showAlert(formAlert, "Failed to save document.", "danger");
            showAlert(pageAlert, "Failed to save document.", "danger");
        } finally {
            if (submitButton) {
                submitButton.disabled = false;
            }
            if (fileInput) fileInput.disabled = false;
            if (descriptionInput) descriptionInput.disabled = false;
            if (visibilityInput) visibilityInput.disabled = false;
        }
    });

    syncBulkBar();
})();
