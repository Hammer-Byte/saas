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

    function canEditQuote() {
        const stage = detail.dataset.stage || "new";
        if (stage !== "eligible") return false;
        if (isSuperAdmin) return true;
        const assigneeUserId = Number(currentAssigneeId() || 0);
        return assigneeUserId >= 1 && assigneeUserId === currentUserId;
    }

    function syncAssignedOption() {
        if (!stageSelect) return;
        const hasAssignee = !!currentAssigneeId();
        for (const value of ["assigned", "waiting_for_docs", "preparing_docs"]) {
            const option = stageSelect.querySelector(`option[value="${value}"]`);
            if (option) option.disabled = !hasAssignee;
        }
    }

    function syncControls() {
        const assigneeUserId = currentAssigneeId();
        const quoteEnabled = canEditQuote();

        if (quoteInput) quoteInput.disabled = !quoteEnabled;
        if (quoteSaveButton) quoteSaveButton.disabled = !quoteEnabled;
        if (assignMeWrap) {
            assignMeWrap.classList.toggle("d-none", !!assigneeUserId);
        }
        if (assignMeButton) {
            assignMeButton.disabled = !!assigneeUserId;
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

    async function applyPatch(payload, onSuccess) {
        try {
            const { response, data } = await patchTender(payload);
            if (!response.ok) {
                showAlert(data.error || "Failed to update tender.", "danger");
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
        if (
            ["assigned", "waiting_for_docs", "preparing_docs"].includes(stage) &&
            !currentAssigneeId()
        ) {
            showAlert("Assign someone before selecting this stage.", "danger");
            stageSelect.value = previous;
            return;
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
            window.location.reload();
        });
        if (!ok) assigneeSelect.value = previous;
    });

    assignMeButton?.addEventListener("click", async () => {
        assignMeButton.disabled = true;
        const ok = await applyPatch({ assign_to_me: true }, () => {
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

        if (commentSubmitButton) commentSubmitButton.disabled = true;
        if (commentFile) commentFile.disabled = true;
        try {
            const body = new FormData();
            body.append("gem_keyword_tender_id", String(tenderId));
            body.append("comment", comment);
            const uploadedFile = commentFile?.files?.[0];
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

    syncControls();
})();
