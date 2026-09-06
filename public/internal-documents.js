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
    const progressWrap = document.getElementById("document-upload-progress");
    const progressBar = document.getElementById("document-upload-bar");
    const progressBarHost = document.getElementById("document-upload-progressbar");
    const progressStatus = document.getElementById("document-upload-status");
    const progressPercent = document.getElementById("document-upload-percent");

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
        hideAlert(formAlert);
        hideUploadProgress();
    }

    function openAddModal() {
        resetForm();
        if (modalLabel) modalLabel.textContent = "Add document";
        if (submitButton) submitButton.textContent = "Upload";
        if (fileInput) fileInput.required = true;
    }

    function openEditModal(row) {
        hideAlert(formAlert);
        hideUploadProgress();
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
                    data = {};
                }
                resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, data });
            });

            xhr.addEventListener("error", () => reject(new Error("Network error")));
            xhr.addEventListener("abort", () => reject(new Error("Upload aborted")));
            xhr.send(body);
        });
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
        if (fileInput) fileInput.disabled = true;
        if (descriptionInput) descriptionInput.disabled = true;

        setUploadProgress(0, "Uploading…");

        try {
            const body = new FormData();
            body.append("file", uploadedFile);
            body.append("description", description);

            const { ok, data } = await uploadWithProgress({
                url: isEdit ? `/api/internal-documents/${documentId}` : "/api/internal-documents",
                method: isEdit ? "PATCH" : "POST",
                body,
            });

            if (!ok) {
                hideUploadProgress();
                showAlert(
                    formAlert,
                    data.error || (isEdit ? "Failed to update document." : "Failed to upload document."),
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
        }
    });
})();
