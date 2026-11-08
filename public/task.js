(() => {
    const detail = document.getElementById("task-detail");
    if (!detail) return;

    const taskId = Number(detail.dataset.id || 0);
    const currentUserId = Number(detail.dataset.currentUserId || 0);

    const pageAlert = document.getElementById("task-alert");
    const editForm = document.getElementById("task-edit-form");
    const quickStateSelect = document.getElementById("task-quick-state");
    const editStateSelect = document.getElementById("task-edit-state");
    const blockedReasonWrap = document.getElementById("task-blocked-reason-wrap");
    const blockedReasonInput = document.getElementById("task-blocked-reason");
    const markDoneButton = document.getElementById("task-mark-done-btn");
    const duplicateButton = document.getElementById("task-duplicate-btn");
    const deleteButton = document.getElementById("task-delete-btn");
    const followButton = document.getElementById("task-follow-btn");
    const saveButton = document.getElementById("task-save-btn");

    const attachmentForm = document.getElementById("task-attachment-form");
    const attachmentFormAlert = document.getElementById("task-attachment-form-alert");
    const attachmentFileInput = document.getElementById("task-attachment-file");
    const attachmentDescriptionInput = document.getElementById("task-attachment-description");
    const attachmentsList = document.getElementById("task-attachments-list");

    const commentForm = document.getElementById("task-comment-form");
    const commentTextInput = document.getElementById("task-comment-text");
    const commentFileInput = document.getElementById("task-comment-file");
    const commentsList = document.getElementById("task-comments-list");
    const commentEditModalElement = document.getElementById("task-comment-edit-modal");
    const commentEditForm = document.getElementById("task-comment-edit-form");
    const commentEditAlert = document.getElementById("task-comment-edit-alert");
    const commentEditIdInput = document.getElementById("task-comment-edit-id");
    const commentEditTextInput = document.getElementById("task-comment-edit-text");

    const reminderForm = document.getElementById("task-reminder-form");
    const reminderAtInput = document.getElementById("task-reminder-at");
    const reminderRecipientSelect = document.getElementById("task-reminder-recipient");
    const remindersList = document.getElementById("task-reminders-list");

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

    function syncBlockedReasonVisibility() {
        const state = editStateSelect?.value || quickStateSelect?.value || "";
        const blocked = state === "blocked";
        blockedReasonWrap?.classList.toggle("d-none", !blocked);
    }

    function syncStateSelects(fromQuick) {
        if (fromQuick && editStateSelect && quickStateSelect) {
            editStateSelect.value = quickStateSelect.value;
        } else if (!fromQuick && editStateSelect && quickStateSelect) {
            quickStateSelect.value = editStateSelect.value;
        }
        syncBlockedReasonVisibility();
    }

    function buildTaskPayload() {
        const title = document.getElementById("task-edit-title")?.value?.trim() || "";
        const description = document.getElementById("task-edit-description")?.value?.trim() || "";
        const expectedHoursRaw = document.getElementById("task-edit-expected-hours")?.value || "";
        const actualHoursRaw = document.getElementById("task-edit-actual-hours")?.value || "";
        const startAtRaw = document.getElementById("task-edit-start-at")?.value || "";
        const endAtRaw = document.getElementById("task-edit-end-at")?.value || "";
        const assigneeRaw = document.getElementById("task-edit-assignee")?.value || "";
        const projectRaw = document.getElementById("task-edit-project")?.value || "";
        const state = editStateSelect?.value || "todo";
        const priority = document.getElementById("task-edit-priority")?.value || "medium";
        const blockedReason = blockedReasonInput?.value?.trim() || "";

        const payload = {
            id: taskId,
            title,
            state,
            priority,
            description: description || null,
            blocked_reason: state === "blocked" ? blockedReason || null : null,
            assignee_user_id: assigneeRaw ? Number(assigneeRaw) : null,
            project_id: projectRaw ? Number(projectRaw) : null,
        };

        if (expectedHoursRaw !== "") {
            payload.expected_hours = Number(expectedHoursRaw);
        } else {
            payload.expected_hours = null;
        }
        if (actualHoursRaw !== "") {
            payload.actual_hours = Number(actualHoursRaw);
        } else {
            payload.actual_hours = null;
        }

        const startAt = startAtRaw.trim()
            ? window.getWritableDate?.("YYYY-MM-DD HH:mm:ss", startAtRaw)
            : null;
        const endAt = endAtRaw.trim() ? window.getWritableDate?.("YYYY-MM-DD HH:mm:ss", endAtRaw) : null;
        if (startAtRaw.trim() && !startAt) {
            return { error: "Enter a valid start date/time." };
        }
        if (endAtRaw.trim() && !endAt) {
            return { error: "Enter a valid end date/time." };
        }
        payload.start_at = startAt;
        payload.end_at = endAt;

        if (!title) {
            return { error: "Title is required." };
        }

        return { payload };
    }

    quickStateSelect?.addEventListener("change", async () => {
        syncStateSelects(true);
        const previous = detail.dataset.state || "";
        const state = quickStateSelect.value;
        const body = { state };
        if (state === "blocked") {
            body.blocked_reason = blockedReasonInput?.value?.trim() || null;
        }
        try {
            const response = await fetch(`/api/tasks/${taskId}/state`, {
                method: "PATCH",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showAlert(pageAlert, data.error || "Failed to update state.", "danger");
                quickStateSelect.value = previous;
                syncStateSelects(true);
                return;
            }
            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert(pageAlert, "Failed to update state.", "danger");
            quickStateSelect.value = previous;
            syncStateSelects(true);
        }
    });

    editStateSelect?.addEventListener("change", () => syncStateSelects(false));

    markDoneButton?.addEventListener("click", async () => {
        markDoneButton.disabled = true;
        try {
            const response = await fetch(`/api/tasks/${taskId}/state`, {
                method: "PATCH",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ state: "done" }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showAlert(pageAlert, data.error || "Failed to mark done.", "danger");
                markDoneButton.disabled = false;
                return;
            }
            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert(pageAlert, "Failed to mark done.", "danger");
            markDoneButton.disabled = false;
        }
    });

    duplicateButton?.addEventListener("click", async () => {
        duplicateButton.disabled = true;
        try {
            const response = await fetch(`/api/tasks/${taskId}/duplicate`, {
                method: "POST",
                credentials: "same-origin",
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.task?.id) {
                showAlert(pageAlert, data.error || "Failed to duplicate task.", "danger");
                duplicateButton.disabled = false;
                return;
            }
            window.location.href = `/app/tasks/${data.task.id}`;
        } catch (error) {
            console.error(error);
            showAlert(pageAlert, "Failed to duplicate task.", "danger");
            duplicateButton.disabled = false;
        }
    });

    deleteButton?.addEventListener("click", async () => {
        const confirmed = await showConfirm({
            title: "Delete task?",
            description: "This will permanently remove the task.",
            choices: [
                { label: "Cancel", variant: "secondary", value: false },
                { label: "Delete", variant: "danger", value: true },
            ],
        });
        if (!confirmed) return;

        deleteButton.disabled = true;
        try {
            const response = await fetch(`/api/tasks/${taskId}`, {
                method: "DELETE",
                credentials: "same-origin",
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showAlert(pageAlert, data.error || "Failed to delete task.", "danger");
                deleteButton.disabled = false;
                return;
            }
            window.location.href = "/app/tasks";
        } catch (error) {
            console.error(error);
            showAlert(pageAlert, "Failed to delete task.", "danger");
            deleteButton.disabled = false;
        }
    });

    followButton?.addEventListener("click", async () => {
        const following = followButton.dataset.following === "1";
        followButton.disabled = true;
        try {
            const response = await fetch(`/api/tasks/${taskId}/follow`, {
                method: following ? "DELETE" : "POST",
                credentials: "same-origin",
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showAlert(pageAlert, data.error || "Failed to update follow.", "danger");
                followButton.disabled = false;
                return;
            }
            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert(pageAlert, "Failed to update follow.", "danger");
            followButton.disabled = false;
        }
    });

    editForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideAlert(pageAlert);

        const built = buildTaskPayload();
        if (built.error) {
            showAlert(pageAlert, built.error, "danger");
            return;
        }

        if (saveButton) saveButton.disabled = true;
        try {
            const response = await fetch("/api/tasks", {
                method: "PATCH",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(built.payload),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showAlert(pageAlert, data.error || "Failed to save task.", "danger");
                return;
            }
            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert(pageAlert, "Failed to save task.", "danger");
        } finally {
            if (saveButton) saveButton.disabled = false;
        }
    });

    attachmentForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideAlert(attachmentFormAlert);

        const uploadedFile = attachmentFileInput?.files?.[0];
        const description = attachmentDescriptionInput?.value?.trim() || "";

        if (!uploadedFile) {
            showAlert(attachmentFormAlert, "Please select a file.", "danger");
            return;
        }

        const submitButton = document.getElementById("task-attachment-submit-btn");
        if (submitButton) submitButton.disabled = true;

        try {
            const mediaBody = new FormData();
            mediaBody.append("file", uploadedFile);

            const mediaResponse = await fetch("/api/media", {
                method: "POST",
                credentials: "same-origin",
                body: mediaBody,
            });
            const mediaData = await mediaResponse.json().catch(() => ({}));

            if (!mediaResponse.ok || !mediaData.id) {
                showAlert(attachmentFormAlert, mediaData.error || "Failed to upload file.", "danger");
                return;
            }

            const linkResponse = await fetch("/api/task-attachments", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    task_id: taskId,
                    media_id: mediaData.id,
                    description: description || undefined,
                }),
            });
            const linkData = await linkResponse.json().catch(() => ({}));

            if (!linkResponse.ok) {
                showAlert(
                    attachmentFormAlert,
                    linkData.error || "Failed to link attachment.",
                    "danger",
                );
                return;
            }

            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert(attachmentFormAlert, "Failed to add attachment.", "danger");
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    });

    attachmentsList?.addEventListener("click", async (event) => {
        const deleteButtonEl = event.target.closest(".task-attachment-delete-btn");
        if (!deleteButtonEl) return;

        const listItem = deleteButtonEl.closest("li[data-id]");
        const attachmentId = Number(listItem?.dataset.id || 0);
        if (!(attachmentId >= 1)) return;

        const confirmed = await showConfirm({
            title: "Delete attachment?",
            description: "This will remove the attachment link.",
            choices: [
                { label: "Cancel", variant: "secondary", value: false },
                { label: "Delete", variant: "danger", value: true },
            ],
        });
        if (!confirmed) return;

        try {
            const response = await fetch(`/api/task-attachments/${attachmentId}`, {
                method: "DELETE",
                credentials: "same-origin",
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showAlert(pageAlert, data.error || "Failed to delete attachment.", "danger");
                return;
            }
            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert(pageAlert, "Failed to delete attachment.", "danger");
        }
    });

    commentForm?.addEventListener("submit", async (event) => {
        event.preventDefault();

        const comment = commentTextInput?.value?.trim() || "";
        if (!comment) return;

        const submitButton = document.getElementById("task-comment-submit-btn");
        if (submitButton) submitButton.disabled = true;

        try {
            const body = new FormData();
            body.append("task_id", String(taskId));
            body.append("comment", comment);
            const file = commentFileInput?.files?.[0];
            if (file) body.append("file", file);

            const response = await fetch("/api/task-comments", {
                method: "POST",
                credentials: "same-origin",
                body,
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showAlert(pageAlert, data.error || "Failed to add comment.", "danger");
                return;
            }
            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert(pageAlert, "Failed to add comment.", "danger");
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    });

    function decodeComment(value) {
        try {
            return decodeURIComponent(value || "");
        } catch (error) {
            return value || "";
        }
    }

    commentsList?.addEventListener("click", async (event) => {
        const listItem = event.target.closest("li[data-id]");
        if (!listItem) return;

        const commentUserId = Number(listItem.dataset.userId || 0);
        if (commentUserId !== currentUserId) return;

        if (event.target.closest(".task-comment-edit-btn")) {
            if (commentEditIdInput) commentEditIdInput.value = listItem.dataset.id || "";
            if (commentEditTextInput) {
                commentEditTextInput.value = decodeComment(listItem.dataset.comment);
            }
            hideAlert(commentEditAlert);
            const modal = window.bootstrap?.Modal?.getOrCreateInstance(commentEditModalElement);
            modal?.show();
            return;
        }

        if (event.target.closest(".task-comment-delete-btn")) {
            const commentId = Number(listItem.dataset.id || 0);
            const confirmed = await showConfirm({
                title: "Delete comment?",
                description: "This cannot be undone.",
                choices: [
                    { label: "Cancel", variant: "secondary", value: false },
                    { label: "Delete", variant: "danger", value: true },
                ],
            });
            if (!confirmed) return;

            try {
                const response = await fetch(`/api/task-comments/${commentId}`, {
                    method: "DELETE",
                    credentials: "same-origin",
                });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    showAlert(pageAlert, data.error || "Failed to delete comment.", "danger");
                    return;
                }
                window.location.reload();
            } catch (error) {
                console.error(error);
                showAlert(pageAlert, "Failed to delete comment.", "danger");
            }
        }
    });

    commentEditForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideAlert(commentEditAlert);

        const commentId = Number(commentEditIdInput?.value || 0);
        const comment = commentEditTextInput?.value?.trim() || "";
        if (!(commentId >= 1) || !comment) {
            showAlert(commentEditAlert, "Comment is required.", "danger");
            return;
        }

        const saveCommentButton = document.getElementById("task-comment-edit-save-btn");
        if (saveCommentButton) saveCommentButton.disabled = true;

        try {
            const response = await fetch(`/api/task-comments/${commentId}`, {
                method: "PATCH",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ comment }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showAlert(commentEditAlert, data.error || "Failed to update comment.", "danger");
                return;
            }
            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert(commentEditAlert, "Failed to update comment.", "danger");
        } finally {
            if (saveCommentButton) saveCommentButton.disabled = false;
        }
    });

    reminderForm?.addEventListener("submit", async (event) => {
        event.preventDefault();

        const remindAtRaw = reminderAtInput?.value || "";
        const recipientUserId = Number(reminderRecipientSelect?.value || 0);
        const remindAt = window.getWritableDate?.("YYYY-MM-DD HH:mm:ss", remindAtRaw);

        if (!remindAt) {
            showAlert(pageAlert, "Enter a valid remind date/time.", "danger");
            return;
        }
        if (!(recipientUserId >= 1)) {
            showAlert(pageAlert, "Choose a recipient.", "danger");
            return;
        }

        const submitButton = document.getElementById("task-reminder-submit-btn");
        if (submitButton) submitButton.disabled = true;

        try {
            const response = await fetch("/api/task-reminders", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    task_id: taskId,
                    remind_at: remindAt,
                    recipient_user_id: recipientUserId,
                }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showAlert(pageAlert, data.error || "Failed to schedule reminder.", "danger");
                return;
            }
            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert(pageAlert, "Failed to schedule reminder.", "danger");
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    });

    remindersList?.addEventListener("click", async (event) => {
        const cancelButton = event.target.closest(".task-reminder-cancel-btn");
        if (!cancelButton) return;

        const listItem = cancelButton.closest("li[data-id]");
        const reminderId = Number(listItem?.dataset.id || 0);
        if (!(reminderId >= 1)) return;

        const confirmed = await showConfirm({
            title: "Cancel reminder?",
            description: "This pending reminder will be removed.",
            choices: [
                { label: "Keep", variant: "secondary", value: false },
                { label: "Cancel reminder", variant: "danger", value: true },
            ],
        });
        if (!confirmed) return;

        try {
            const response = await fetch(`/api/task-reminders/${reminderId}`, {
                method: "DELETE",
                credentials: "same-origin",
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showAlert(pageAlert, data.error || "Failed to cancel reminder.", "danger");
                return;
            }
            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert(pageAlert, "Failed to cancel reminder.", "danger");
        }
    });

    syncBlockedReasonVisibility();
})();
