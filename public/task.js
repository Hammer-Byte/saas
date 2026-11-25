(() => {
    const detail = document.getElementById("task-detail");
    if (!detail) return;

    const taskId = Number(detail.dataset.id || 0);
    const currentUserId = Number(detail.dataset.currentUserId || 0);
    const isTaskAdmin = detail.dataset.isTaskAdmin === "1";
    const canMoveTask = detail.dataset.canMove === "1";

    const pageAlert = document.getElementById("task-alert");
    const editForm = document.getElementById("task-edit-form");
    const editStateSelect = document.getElementById("task-edit-state");
    const duplicateButton = document.getElementById("task-duplicate-btn");
    const deleteButton = document.getElementById("task-delete-btn");
    const saveButton = document.getElementById("task-save-btn");

    const attachmentForm = document.getElementById("task-attachment-form");
    const attachmentFormAlert = document.getElementById("task-attachment-form-alert");
    const attachmentFileInput = document.getElementById("task-attachment-file");
    const attachmentDescriptionInput = document.getElementById("task-attachment-description");
    const attachmentsList = document.getElementById("task-attachments-list");

    const commentForm = document.getElementById("task-comment-form");
    const commentFormAlert = document.getElementById("task-comment-form-alert");
    const commentTextInput = document.getElementById("task-comment-text");
    const commentFileInput = document.getElementById("task-comment-file");
    const commentsList = document.getElementById("task-comments-list");
    const commentEditModalElement = document.getElementById("task-comment-edit-modal");
    const commentEditForm = document.getElementById("task-comment-edit-form");
    const commentEditAlert = document.getElementById("task-comment-edit-alert");
    const commentEditIdInput = document.getElementById("task-comment-edit-id");
    const commentEditTextInput = document.getElementById("task-comment-edit-text");

    function buildTaskPayload() {
        const title = document.getElementById("task-edit-title")?.value?.trim() || "";
        const description = document.getElementById("task-edit-description")?.value?.trim() || "";
        const expectedHoursRaw = document.getElementById("task-edit-expected-hours")?.value || "";
        const actualHoursRaw = document.getElementById("task-edit-actual-hours")?.value || "";
        const startAtRaw = document.getElementById("task-edit-start-at")?.value || "";
        const endAtRaw = document.getElementById("task-edit-end-at")?.value || "";
        const assigneeRaw = document.getElementById("task-edit-assignee")?.value || "";
        const reviewerRaw = document.getElementById("task-edit-reviewer")?.value || "";
        const projectRaw = document.getElementById("task-edit-project")?.value || "";
        const sprintWeekRaw = document.getElementById("task-edit-sprint-week")?.value || "";
        const state = editStateSelect?.value || "backlog";
        const priority = document.getElementById("task-edit-priority")?.value || "p3";

        const payload = {
            id: taskId,
            title,
            state,
            priority,
            description: description || null,
            assignee_user_id: assigneeRaw ? Number(assigneeRaw) : null,
            reviewer_user_id: reviewerRaw ? Number(reviewerRaw) : null,
            project_id: projectRaw ? Number(projectRaw) : null,
        };

        if (sprintWeekRaw.trim()) {
            payload.sprint_week_start =
                window.getMondayDate?.(sprintWeekRaw) || sprintWeekRaw.trim();
        } else {
            payload.sprint_week_start = null;
        }

        if (expectedHoursRaw !== "") {
            const expectedHours = Number(expectedHoursRaw);
            if (!Number.isFinite(expectedHours) || expectedHours < 0) {
                return { error: "Enter valid expected hours." };
            }
            if (expectedHours > 9) {
                return { error: "Expected hours cannot be more than 9." };
            }
            payload.expected_hours = expectedHours;
        } else {
            payload.expected_hours = null;
        }

        if (actualHoursRaw !== "") {
            const actualHours = Number(actualHoursRaw);
            if (!Number.isFinite(actualHours) || actualHours < 0) {
                return { error: "Enter valid burnt efforts." };
            }
            if (actualHours > 9) {
                return { error: "Burnt efforts cannot be more than 9." };
            }
            payload.actual_hours = actualHours;
        } else {
            payload.actual_hours = null;
        }

        const startAt = startAtRaw.trim()
            ? window.getWritableDate?.("YYYY-MM-DD HH:mm:ss", startAtRaw)
            : null;
        const endAt = endAtRaw.trim()
            ? window.getWritableDate?.("YYYY-MM-DD HH:mm:ss", endAtRaw)
            : null;
        if (startAtRaw.trim() && !startAt) {
            return { error: "Enter a valid start date/time." };
        }
        if (endAtRaw.trim() && !endAt) {
            return { error: "Enter a valid end date/time." };
        }
        payload.start_at = startAt;
        payload.end_at = endAt;

        if (payload.sprint_week_start) {
            const monday =
                window.getMondayDate?.(payload.sprint_week_start) || payload.sprint_week_start;
            const sunday = window.getSundayDate?.(monday);
            if (monday && sunday) {
                const startKey = startAt ? String(startAt).slice(0, 10) : null;
                const endKey = endAt ? String(endAt).slice(0, 10) : null;
                if (startKey && (startKey < monday || startKey > sunday)) {
                    return {
                        error: `Start must fall within the sprint week (${monday} to ${sunday}).`,
                    };
                }
                if (endKey && (endKey < monday || endKey > sunday)) {
                    return {
                        error: `End must fall within the sprint week (${monday} to ${sunday}).`,
                    };
                }
            }
        }

        if (startAt && endAt && String(startAt) > String(endAt)) {
            return { error: "Start must be before end." };
        }

        if (!title) {
            return { error: "Title is required." };
        }

        return { payload };
    }

    function buildStateChangeBody(nextState) {
        const body = { state: nextState };
        const assigneeRaw = document.getElementById("task-edit-assignee")?.value || "";
        const reviewerRaw = document.getElementById("task-edit-reviewer")?.value || "";
        if (assigneeRaw) body.assignee_user_id = Number(assigneeRaw);
        if (reviewerRaw) body.reviewer_user_id = Number(reviewerRaw);

        const previous = detail.dataset.state || "";
        const reviewerId = Number(detail.dataset.reviewerId || reviewerRaw || 0);
        const isReviewer =
            currentUserId >= 1 && reviewerId >= 1 && currentUserId === reviewerId;

        if (
            previous === "under_review" &&
            nextState === "in_progress" &&
            (isTaskAdmin || isReviewer)
        ) {
            const comment = window.prompt(
                "Admin or reviewer comment is required when sending back to In progress:",
            );
            if (!comment || !String(comment).trim()) {
                return { error: "Comment is required." };
            }
            body.comment = String(comment).trim();
        }

        if (nextState === "backlog") {
            body.sprint_week_start = null;
        } else if (
            previous === "backlog" &&
            (nextState === "analyzing" || nextState === "in_progress")
        ) {
            const sprintWeekRaw =
                document.getElementById("task-edit-sprint-week")?.value || "";
            const sprintWeek = sprintWeekRaw.trim()
                ? window.getMondayDate?.(sprintWeekRaw) ||
                  window.getWritableDate?.("YYYY-MM-DD", sprintWeekRaw)
                : window.getMondayDate?.(new Date());
            if (!sprintWeek) {
                return { error: "Sprint week is required when leaving backlog." };
            }
            body.sprint_week_start = sprintWeek;
        }

        return { body };
    }

    if (!canMoveTask) {
        editForm?.querySelectorAll("input, select, textarea, button").forEach((element) => {
            element.disabled = true;
        });
    }

    editStateSelect?.addEventListener("change", async () => {
        if (!canMoveTask) return;
        const previous = detail.dataset.state || "";
        const state = editStateSelect.value;
        if (state === previous) return;
        const built = buildStateChangeBody(state);
        if (built.error) {
            showAlert(pageAlert, built.error, "danger");
            editStateSelect.value = previous;
            return;
        }
        try {
            const response = await fetch(`/api/tasks/${taskId}/state`, {
                method: "PATCH",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(built.body),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showAlert(pageAlert, data.error || "Failed to update state.", "danger");
                editStateSelect.value = previous;
                return;
            }
            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert(pageAlert, "Failed to update state.", "danger");
            editStateSelect.value = previous;
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

    editForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideAlert(pageAlert);
        if (!canMoveTask) {
            showAlert(pageAlert, "View only — you cannot edit this task.", "warning");
            return;
        }

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

        const sizeCheck = window.validateUploadFiles?.(uploadedFile);
        if (sizeCheck && !sizeCheck.ok) {
            showAlert(attachmentFormAlert, sizeCheck.error, "danger");
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
        const deleteAttachmentButton = event.target.closest(".task-attachment-delete-btn");
        if (!deleteAttachmentButton) return;

        const listItem = deleteAttachmentButton.closest("tr[data-id]");
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
        hideAlert(commentFormAlert);

        const comment = commentTextInput?.value?.trim() || "";
        if (!comment) return;

        const file = commentFileInput?.files?.[0];
        if (file) {
            const sizeCheck = window.validateUploadFiles?.(file);
            if (sizeCheck && !sizeCheck.ok) {
                showAlert(commentFormAlert || pageAlert, sizeCheck.error, "danger");
                return;
            }
        }

        const submitButton = document.getElementById("task-comment-submit-btn");
        if (submitButton) submitButton.disabled = true;

        try {
            const body = new FormData();
            body.append("task_id", String(taskId));
            body.append("comment", comment);
            if (file) body.append("file", file);

            const response = await fetch("/api/task-comments", {
                method: "POST",
                credentials: "same-origin",
                body,
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showAlert(
                    commentFormAlert || pageAlert,
                    data.error || "Failed to add comment.",
                    "danger",
                );
                return;
            }
            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert(commentFormAlert || pageAlert, "Failed to add comment.", "danger");
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    });

    commentsList?.addEventListener("click", async (event) => {
        const listItem = event.target.closest("li[data-id]");
        if (!listItem) return;

        if (event.target.closest(".task-comment-edit-btn")) {
            if (commentEditIdInput) commentEditIdInput.value = listItem.dataset.id || "";
            if (commentEditTextInput) {
                const commentBody = listItem.querySelector("div[style*='pre-wrap']");
                commentEditTextInput.value = commentBody?.textContent || "";
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

    const moveToInvoiceForm = document.getElementById("task-move-to-invoice-form");
    const moveToInvoiceAlert = document.getElementById("task-move-to-invoice-alert");
    const moveToInvoiceSubmit = document.getElementById("task-move-to-invoice-submit");
    const invoicePriceInput = document.getElementById("task-invoice-cost");

    function roundMoney(value) {
        return Math.round(Number(value) * 100) / 100;
    }

    document.querySelectorAll(".task-invoice-markup-btn").forEach((button) => {
        button.addEventListener("click", () => {
            const assigneeCost = Number(
                invoicePriceInput?.dataset.assigneeCost || detail.dataset.assigneeCharge || ""
            );
            const markup = Number(button.dataset.markup || "");
            if (!invoicePriceInput || !(assigneeCost > 0) || !(markup > 0)) {
                showAlert(
                    moveToInvoiceAlert,
                    "Assignee charge is unavailable; enter a price manually.",
                    "warning"
                );
                return;
            }
            invoicePriceInput.value = String(roundMoney(assigneeCost * markup));
            hideAlert(moveToInvoiceAlert);
        });
    });

    moveToInvoiceForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideAlert(moveToInvoiceAlert);
        if (detail.dataset.canAddToInvoice !== "1" || !isTaskAdmin || detail.dataset.invoiced === "1") {
            showAlert(moveToInvoiceAlert, "This task cannot be added to an invoice.", "warning");
            return;
        }

        const invoiceId = Number(document.getElementById("task-invoice-select")?.value || 0);
        const item = document.getElementById("task-invoice-item")?.value?.trim() || "";
        const cost = Number(invoicePriceInput?.value || "");
        const quantity = Number(document.getElementById("task-invoice-quantity")?.value || "");

        if (!(invoiceId >= 1)) {
            showAlert(moveToInvoiceAlert, "Select an invoice.", "danger");
            return;
        }
        if (!item) {
            showAlert(moveToInvoiceAlert, "Title is required.", "danger");
            return;
        }
        if (!Number.isFinite(cost) || cost < 0) {
            showAlert(moveToInvoiceAlert, "Enter a valid price.", "danger");
            return;
        }
        if (!Number.isFinite(quantity) || quantity <= 0) {
            showAlert(moveToInvoiceAlert, "Quantity must be greater than 0.", "danger");
            return;
        }

        if (moveToInvoiceSubmit) moveToInvoiceSubmit.disabled = true;
        try {
            const response = await fetch(`/api/tasks/${taskId}/move-to-invoice`, {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    customer_invoice_id: invoiceId,
                    item,
                    cost,
                    quantity,
                }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showAlert(moveToInvoiceAlert, data.error || "Failed to add to invoice.", "danger");
                return;
            }
            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert(moveToInvoiceAlert, "Failed to add to invoice.", "danger");
        } finally {
            if (moveToInvoiceSubmit) moveToInvoiceSubmit.disabled = false;
        }
    });
})();
