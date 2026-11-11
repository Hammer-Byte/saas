(() => {
    const detail = document.getElementById("gem-tender-detail");
    const alertElement = document.getElementById("gem-tender-alert");
    const stageSelect = document.getElementById("gem-tender-stage");
    const assigneeSelect = document.getElementById("gem-tender-assignee");
    const assignMeButton = document.getElementById("gem-tender-assign-me-btn");
    const assignMeWrap = document.getElementById("gem-tender-assign-me-wrap");
    const quoteInput = document.getElementById("gem-tender-quote");
    const quoteSaveButton = document.getElementById("gem-tender-quote-save-btn");
    const commentForm = document.getElementById("gem-tender-comment-form");
    const commentText = document.getElementById("gem-tender-comment-text");
    const commentFile = document.getElementById("gem-tender-comment-file");
    const commentSubmitButton = document.getElementById("gem-tender-comment-submit-btn");
    const commentsList = document.getElementById("gem-tender-comments-list");
    const commentsEmpty = document.getElementById("gem-tender-comments-empty");
    const editModalElement = document.getElementById("gem-tender-comment-edit-modal");
    const editForm = document.getElementById("gem-tender-comment-edit-form");
    const editAlert = document.getElementById("gem-tender-comment-edit-alert");
    const editIdInput = document.getElementById("gem-tender-comment-edit-id");
    const editTextInput = document.getElementById("gem-tender-comment-edit-text");
    const editSaveButton = document.getElementById("gem-tender-comment-edit-save-btn");

    if (!detail) return;

    const tenderId = Number(detail.dataset.id || 0);
    const currentUserId = Number(detail.dataset.currentUserId || 0);
    const isSuperAdmin = detail.dataset.superAdmin === "1";
    const QUOTE_DISABLED_STAGES = new Set([
        "new",
        "assigned",
        "out_of_scope",
        "missed",
        "unattended",
        "filed",
        "not_eligible",
    ]);
    const SYSTEM_MANAGED_STAGES = new Set(["unattended", "missed"]);
    const TERMINAL_STAGES = new Set([
        "filed",
        "out_of_scope",
        "not_eligible",
        "unattended",
        "missed",
    ]);
    const ASSIGNEE_REQUIRED_STAGES = [
        "assigned",
        "waiting_for_docs",
        "waiting_for_gem",
        "waiting_for_quote",
        "preparing_docs",
    ];
    const ONE_WAY_CONFIRM_STAGES = new Set([
        "filed",
        "out_of_scope",
        "not_eligible",
    ]);

    function showAlert(message, type) {
        if (!alertElement) return;
        alertElement.textContent = message;
        alertElement.className = `alert alert-${type}`;
        alertElement.classList.remove("d-none");
    }

    function showEditAlert(message, type) {
        if (!editAlert) return;
        editAlert.textContent = message;
        editAlert.className = `alert alert-${type}`;
        editAlert.classList.remove("d-none");
    }

    function hideEditAlert() {
        if (!editAlert) return;
        editAlert.classList.add("d-none");
        editAlert.textContent = "";
    }

    function currentAssigneeId() {
        return String(detail.dataset.assigneeUserId || "").trim();
    }

    function currentStage() {
        return detail.dataset.stage || "new";
    }

    function isTerminalStage() {
        return (
            detail.dataset.terminalStage === "1" ||
            TERMINAL_STAGES.has(currentStage())
        );
    }

    function canOperateAssigned() {
        if (isSuperAdmin) return true;
        if (isTerminalStage()) return false;
        const assigneeUserId = Number(currentAssigneeId() || 0);
        return assigneeUserId >= 1 && assigneeUserId === currentUserId;
    }

    function canChangeStage() {
        if (isTerminalStage()) return isSuperAdmin;
        const assigneeUserId = Number(currentAssigneeId() || 0);
        if (!(assigneeUserId >= 1)) return false;
        return canOperateAssigned();
    }

    function canEditQuote() {
        const stage = currentStage();
        if (QUOTE_DISABLED_STAGES.has(stage)) return false;
        return canOperateAssigned();
    }

    function syncAssignedOption() {
        if (!stageSelect) return;
        const hasAssignee = !!currentAssigneeId();
        const stage = currentStage();
        for (const value of ASSIGNEE_REQUIRED_STAGES) {
            const option = stageSelect.querySelector(`option[value="${value}"]`);
            if (option) option.disabled = !hasAssignee;
        }
        const newOption = stageSelect.querySelector('option[value="new"]');
        if (newOption) {
            newOption.disabled = stage !== "new";
        }
        for (const value of SYSTEM_MANAGED_STAGES) {
            const option = stageSelect.querySelector(`option[value="${value}"]`);
            if (option) option.disabled = true;
        }
    }

    function syncControls() {
        const assigneeUserId = currentAssigneeId();
        const quoteEnabled = canEditQuote();
        const stageEnabled = canChangeStage();
        const locked = isTerminalStage() && !isSuperAdmin;

        if (stageSelect) stageSelect.disabled = !stageEnabled;
        if (assigneeSelect) assigneeSelect.disabled = locked;
        if (quoteInput) quoteInput.disabled = !quoteEnabled;
        if (quoteSaveButton) quoteSaveButton.disabled = !quoteEnabled;
        if (assignMeWrap) {
            assignMeWrap.classList.toggle("d-none", !!assigneeUserId || isTerminalStage());
        }
        if (assignMeButton) {
            assignMeButton.disabled = !!assigneeUserId || isTerminalStage();
        }
        syncAssignedOption();
    }

    async function patchTender(payload) {
        const response = await fetch(`/api/gem-keyword-tenders/${tenderId}`, {
            method: "PATCH",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const data = await response.json().catch(() => ({}));
        return { response, data };
    }

    function applyTenderDetailsFromApi(tender) {
        if (!tender || typeof tender !== "object") return;
        if (tender.assignee_user_id != null) {
            detail.dataset.assigneeUserId = String(tender.assignee_user_id);
        } else if ("assignee_user_id" in tender) {
            detail.dataset.assigneeUserId = "";
        }
        if (tender.stage) {
            detail.dataset.stage = tender.stage;
            detail.dataset.terminalStage = TERMINAL_STAGES.has(tender.stage)
                ? "1"
                : "0";
            detail.dataset.systemManagedStage = SYSTEM_MANAGED_STAGES.has(
                tender.stage,
            )
                ? "1"
                : "0";
            if (stageSelect) stageSelect.value = tender.stage;
        }
        if (assigneeSelect && "assignee_user_id" in tender) {
            assigneeSelect.value =
                tender.assignee_user_id != null ? String(tender.assignee_user_id) : "";
        }
        syncControls();
    }

    async function applyPatch(payload, onSuccess) {
        try {
            const { response, data } = await patchTender(payload);
            if (!response.ok) {
                showAlert(data.error || "Failed to update tender.", "danger");
                if (data.gemKeywordTender) {
                    applyTenderDetailsFromApi(data.gemKeywordTender);
                    // Reload so SSR fields (assignee name, locks, tabs) match server state.
                    window.setTimeout(() => window.location.reload(), 900);
                }
                return false;
            }
            onSuccess?.(data.gemKeywordTender || {});
            syncControls();
            return true;
        } catch (error) {
            console.error(error);
            showAlert("Failed to update tender.", "danger");
            return false;
        }
    }

    stageSelect?.addEventListener("change", async () => {
        const previous = detail.dataset.stage || "new";
        const stage = stageSelect.value;
        if (!canChangeStage()) {
            showAlert(
                isTerminalStage() && !isSuperAdmin
                    ? "Only a super admin can change a one-way stage tender."
                    : currentAssigneeId()
                      ? "Only the assignee or a super admin can change stage."
                      : "Assign someone before changing stage.",
                "danger",
            );
            stageSelect.value = previous;
            return;
        }
        if (stage === "new" && previous !== "new") {
            showAlert("Stage cannot go back to New once the tender has left New.", "danger");
            stageSelect.value = previous;
            return;
        }
        if (SYSTEM_MANAGED_STAGES.has(stage)) {
            showAlert(
                "Unattended and Missed are set automatically and cannot be selected manually.",
                "danger",
            );
            stageSelect.value = previous;
            return;
        }
        if (ASSIGNEE_REQUIRED_STAGES.includes(stage) && !currentAssigneeId()) {
            showAlert("Assign someone before selecting this stage.", "danger");
            stageSelect.value = previous;
            return;
        }
        if (ONE_WAY_CONFIRM_STAGES.has(stage) && stage !== previous) {
            const confirmed = await window.showConfirm({
                title: "Confirm one-way stage",
                description:
                    "This stage is one-way. After you save it, only a super admin can change the stage again. Continue?",
                choices: [
                    { label: "Cancel", value: false, variant: "outline-secondary" },
                    { label: "Confirm", value: true, variant: "primary" },
                ],
            });
            if (!confirmed) {
                stageSelect.value = previous;
                return;
            }
        }
        const ok = await applyPatch({ stage }, (tender) => {
            detail.dataset.stage = tender.stage || stage;
            window.location.reload();
        });
        if (!ok) stageSelect.value = previous;
    });

    assigneeSelect?.addEventListener("change", async () => {
        const previous = detail.dataset.assigneeUserId || "";
        const rawValue = assigneeSelect.value;
        const assignee_user_id = rawValue ? Number(rawValue) : null;
        const ok = await applyPatch({ assignee_user_id }, (tender) => {
            detail.dataset.assigneeUserId = tender.assignee_user_id
                ? String(tender.assignee_user_id)
                : "";
            detail.dataset.stage = tender.stage || detail.dataset.stage;
            if (stageSelect && tender.stage) {
                stageSelect.value = tender.stage;
            }
            window.location.reload();
        });
        if (!ok) assigneeSelect.value = previous;
    });

    assignMeButton?.addEventListener("click", async () => {
        assignMeButton.disabled = true;
        const ok = await applyPatch({ assign_to_me: true }, (tender) => {
            detail.dataset.assigneeUserId = tender.assignee_user_id
                ? String(tender.assignee_user_id)
                : String(currentUserId || "");
            detail.dataset.stage = tender.stage || detail.dataset.stage;
            if (stageSelect && tender.stage) {
                stageSelect.value = tender.stage;
            }
            window.location.reload();
        });
        if (!ok) syncControls();
    });

    quoteSaveButton?.addEventListener("click", async () => {
        if (!canEditQuote()) return;
        quoteSaveButton.disabled = true;
        const quote = quoteInput?.value || "";
        const ok = await applyPatch({ quote }, (tender) => {
            detail.dataset.quote = encodeURIComponent(tender.quote || "");
            showAlert("Quote saved.", "success");
            window.location.reload();
        });
        if (!ok) syncControls();
        else quoteSaveButton.disabled = false;
    });

    function decodeComment(value) {
        try {
            return decodeURIComponent(value || "");
        } catch (error) {
            return value || "";
        }
    }

    function refreshCommentsEmpty() {
        const hasComments = !!commentsList?.querySelector("li");
        commentsEmpty?.classList.toggle("d-none", hasComments);
    }

    commentForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const comment = (commentText?.value || "").trim();
        if (!comment) return;

        const uploadedFile = commentFile?.files?.[0];
        if (uploadedFile) {
            const sizeCheck = window.validateUploadFiles?.(uploadedFile);
            if (sizeCheck && !sizeCheck.ok) {
                showAlert(sizeCheck.error, "danger");
                return;
            }
        }

        if (commentSubmitButton) commentSubmitButton.disabled = true;
        if (commentFile) commentFile.disabled = true;
        try {
            const body = new FormData();
            body.append("gem_keyword_tender_id", String(tenderId));
            body.append("comment", comment);
            if (uploadedFile) {
                body.append("file", uploadedFile);
            }

            const response = await fetch("/api/gem-keyword-tender-comments", {
                method: "POST",
                credentials: "same-origin",
                body,
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showAlert(data.error || "Failed to add comment.", "danger");
                return;
            }
            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert("Failed to add comment.", "danger");
        } finally {
            if (commentSubmitButton) commentSubmitButton.disabled = false;
            if (commentFile) commentFile.disabled = false;
        }
    });

    commentsList?.addEventListener("click", async (event) => {
        const editButton = event.target.closest(".gem-tender-comment-edit-btn");
        if (editButton) {
            const row = editButton.closest("li[data-id]");
            if (!row || Number(row.dataset.userId) !== currentUserId) return;
            hideEditAlert();
            if (editIdInput) editIdInput.value = row.dataset.id || "";
            if (editTextInput) editTextInput.value = decodeComment(row.dataset.comment);
            window.bootstrap.Modal.getOrCreateInstance(editModalElement).show();
            return;
        }

        const deleteButton = event.target.closest(".gem-tender-comment-delete-btn");
        if (!deleteButton) return;

        const row = deleteButton.closest("li[data-id]");
        const commentId = Number(row?.dataset.id || 0);
        if (!commentId || Number(row.dataset.userId) !== currentUserId) return;

        const confirmed = await window.showConfirm({
            title: "Delete comment?",
            description: "This comment will be removed.",
            choices: [
                { label: "Cancel", variant: "secondary", value: false },
                { label: "Delete", variant: "danger", value: true },
            ],
        });
        if (!confirmed) return;

        deleteButton.disabled = true;
        try {
            const response = await fetch(`/api/gem-keyword-tender-comments/${commentId}`, {
                method: "DELETE",
                credentials: "same-origin",
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showAlert(data.error || "Failed to delete comment.", "danger");
                deleteButton.disabled = false;
                return;
            }
            row.remove();
            refreshCommentsEmpty();
        } catch (error) {
            console.error(error);
            showAlert("Failed to delete comment.", "danger");
            deleteButton.disabled = false;
        }
    });

    editForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const commentId = Number(editIdInput?.value || 0);
        const comment = (editTextInput?.value || "").trim();
        if (!commentId || !comment) return;

        if (editSaveButton) editSaveButton.disabled = true;
        hideEditAlert();
        try {
            const response = await fetch(`/api/gem-keyword-tender-comments/${commentId}`, {
                method: "PATCH",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ comment }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showEditAlert(data.error || "Failed to update comment.", "danger");
                return;
            }
            window.location.reload();
        } catch (error) {
            console.error(error);
            showEditAlert("Failed to update comment.", "danger");
        } finally {
            if (editSaveButton) editSaveButton.disabled = false;
        }
    });

    const canManageDocuments = detail.dataset.canManageDocuments === "1";
    const documentsForm = document.getElementById("gem-tender-documents-form");
    const documentsFormAlert = document.getElementById("gem-tender-documents-form-alert");
    const documentsFilesInput = document.getElementById("gem-tender-documents-files");
    const documentsNameList = document.getElementById("gem-tender-documents-name-list");
    const documentsNameFields = document.getElementById("gem-tender-documents-name-fields");
    const documentsSubmitBtn = document.getElementById("gem-tender-documents-submit-btn");
    const documentsTableBody = document.getElementById("gem-tender-documents-tbody");
    const documentsEmpty = document.getElementById("gem-tender-documents-empty");
    const documentsTableWrap = document.getElementById("gem-tender-documents-table-wrap");
    const documentsModalEl = document.getElementById("gem-tender-documents-modal");
    const documentsProgressWrap = document.getElementById("gem-tender-documents-upload-progress");
    const documentsProgressBar = document.getElementById("gem-tender-documents-upload-bar");
    const documentsProgressHost = document.getElementById("gem-tender-documents-upload-progressbar");
    const documentsProgressStatus = document.getElementById("gem-tender-documents-upload-status");
    const documentsProgressPercent = document.getElementById("gem-tender-documents-upload-percent");

    function showDocumentsFormAlert(message, type) {
        if (!documentsFormAlert) return;
        documentsFormAlert.textContent = message;
        documentsFormAlert.className = `alert alert-${type}`;
        documentsFormAlert.classList.remove("d-none");
    }

    function hideDocumentsFormAlert() {
        if (!documentsFormAlert) return;
        documentsFormAlert.classList.add("d-none");
        documentsFormAlert.textContent = "";
    }

    function setDocumentsUploadProgress(percent, statusText) {
        const value = Math.max(0, Math.min(100, Math.round(percent)));
        documentsProgressWrap?.classList.remove("d-none");
        if (documentsProgressBar) documentsProgressBar.style.width = `${value}%`;
        if (documentsProgressHost) {
            documentsProgressHost.setAttribute("aria-valuenow", String(value));
        }
        if (documentsProgressPercent) documentsProgressPercent.textContent = `${value}%`;
        if (documentsProgressStatus && statusText) {
            documentsProgressStatus.textContent = statusText;
        }
    }

    function hideDocumentsUploadProgress() {
        documentsProgressWrap?.classList.add("d-none");
        if (documentsProgressBar) documentsProgressBar.style.width = "0%";
        if (documentsProgressHost) documentsProgressHost.setAttribute("aria-valuenow", "0");
        if (documentsProgressPercent) documentsProgressPercent.textContent = "0%";
        if (documentsProgressStatus) documentsProgressStatus.textContent = "Uploading…";
    }

    function selectedDocumentFiles() {
        return Array.from(documentsFilesInput?.files || []);
    }

    function renderDocumentNameFields() {
        if (!documentsNameFields || !documentsNameList) return;
        const files = selectedDocumentFiles();
        documentsNameFields.replaceChildren();

        if (!files.length) {
            documentsNameList.classList.add("d-none");
            if (documentsSubmitBtn) documentsSubmitBtn.disabled = true;
            return;
        }

        documentsNameList.classList.remove("d-none");
        files.forEach((file, index) => {
            const wrap = document.createElement("div");
            const label = document.createElement("label");
            label.className = "form-label small mb-1";
            label.setAttribute("for", `gem-tender-document-name-${index}`);
            label.textContent = file.name || `File ${index + 1}`;

            const input = document.createElement("input");
            input.type = "text";
            input.className = "form-control form-control-sm gem-tender-document-name-input";
            input.id = `gem-tender-document-name-${index}`;
            input.maxLength = 128;
            input.required = true;
            input.value = String(file.name || "").slice(0, 128);
            input.dataset.index = String(index);

            wrap.appendChild(label);
            wrap.appendChild(input);
            documentsNameFields.appendChild(wrap);
        });

        if (documentsSubmitBtn) documentsSubmitBtn.disabled = false;
    }

    function collectDocumentNames() {
        return Array.from(
            documentsNameFields?.querySelectorAll(".gem-tender-document-name-input") || [],
        ).map((input) => String(input.value || "").trim());
    }

    async function uploadTenderDocument({ file, name }) {
        const body = new FormData();
        body.append("gem_keyword_tender_id", String(tenderId));
        body.append("name", name);
        body.append("file", file);

        const response = await fetch("/api/gem-keyword-tender-documents", {
            method: "POST",
            credentials: "same-origin",
            body,
        });
        const data = await response.json().catch(() => ({}));
        return { ok: response.ok, data };
    }

    documentsFilesInput?.addEventListener("change", () => {
        hideDocumentsFormAlert();
        hideDocumentsUploadProgress();
        renderDocumentNameFields();
    });

    documentsModalEl?.addEventListener("hidden.bs.modal", () => {
        documentsForm?.reset();
        hideDocumentsFormAlert();
        hideDocumentsUploadProgress();
        renderDocumentNameFields();
    });

    documentsForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!canManageDocuments) return;

        const files = selectedDocumentFiles();
        const names = collectDocumentNames();
        hideDocumentsFormAlert();

        if (!files.length) {
            showDocumentsFormAlert("Select at least one file.", "danger");
            return;
        }

        if (names.length !== files.length || names.some((name) => !name)) {
            showDocumentsFormAlert("Enter a visible name for every file.", "danger");
            return;
        }

        const sizeCheck = window.validateUploadFiles?.(files);
        if (sizeCheck && !sizeCheck.ok) {
            showDocumentsFormAlert(sizeCheck.error, "danger");
            return;
        }

        if (documentsSubmitBtn) documentsSubmitBtn.disabled = true;
        if (documentsFilesInput) documentsFilesInput.disabled = true;
        for (const input of documentsNameFields?.querySelectorAll("input") || []) {
            input.disabled = true;
        }

        let successCount = 0;
        let failCount = 0;
        const failures = [];

        for (let index = 0; index < files.length; index += 1) {
            const file = files[index];
            const name = names[index];
            const overall = ((index) / files.length) * 100;
            setDocumentsUploadProgress(
                overall,
                `Uploading ${index + 1} of ${files.length}: ${file.name}`,
            );
            try {
                const { ok, data } = await uploadTenderDocument({ file, name });
                if (ok) {
                    successCount += 1;
                } else {
                    failCount += 1;
                    failures.push(data.error || file.name || `File ${index + 1}`);
                }
            } catch (error) {
                console.error(error);
                failCount += 1;
                failures.push(file.name || `File ${index + 1}`);
            }
        }

        setDocumentsUploadProgress(100, "Done");

        if (failCount === 0) {
            window.location.reload();
            return;
        }

        showDocumentsFormAlert(
            `Uploaded ${successCount}, failed ${failCount}. ${failures.slice(0, 3).join("; ")}`,
            successCount ? "warning" : "danger",
        );

        if (successCount > 0) {
            setTimeout(() => window.location.reload(), 1500);
            return;
        }

        if (documentsSubmitBtn) documentsSubmitBtn.disabled = false;
        if (documentsFilesInput) documentsFilesInput.disabled = false;
        for (const input of documentsNameFields?.querySelectorAll("input") || []) {
            input.disabled = false;
        }
    });

    documentsTableBody?.addEventListener("click", async (event) => {
        if (!canManageDocuments) return;
        const deleteBtn = event.target.closest(".gem-tender-document-delete-btn");
        if (!deleteBtn) return;

        const row = deleteBtn.closest("tr[data-id]");
        const documentId = Number(row?.dataset.id || 0);
        if (!(documentId >= 1)) return;

        const confirmed = await window.showConfirm({
            title: "Delete document?",
            description: "This will remove the document from this tender permanently.",
            choices: [
                { label: "Cancel", variant: "secondary", value: false },
                { label: "Delete", variant: "danger", value: true },
            ],
        });
        if (!confirmed) return;

        deleteBtn.disabled = true;
        try {
            const response = await fetch(`/api/gem-keyword-tender-documents/${documentId}`, {
                method: "DELETE",
                credentials: "same-origin",
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showAlert(data.error || "Failed to delete document.", "danger");
                deleteBtn.disabled = false;
                return;
            }
            row.remove();
            const remaining = documentsTableBody.querySelectorAll("tr[data-id]").length;
            documentsEmpty?.classList.toggle("d-none", remaining > 0);
            documentsTableWrap?.classList.toggle("d-none", remaining === 0);
        } catch (error) {
            console.error(error);
            showAlert("Failed to delete document.", "danger");
            deleteBtn.disabled = false;
        }
    });

    syncControls();
})();
