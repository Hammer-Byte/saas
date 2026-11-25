(() => {
    const panels = document.querySelectorAll("[data-entity-comments]");
    if (!panels.length) {
        return;
    }

    panels.forEach((panel) => {
        const entityType = panel.dataset.entityType;
        const entityId = Number(panel.dataset.entityId || 0);
        const form = panel.querySelector("form");
        const textInput = panel.querySelector("textarea");
        const list = panel.querySelector("ul");
        const emptyElement = panel.querySelector("[id$='-empty']");
        const alertElement =
            document.getElementById(panel.dataset.alertId || "") ||
            document.querySelector("[id$='-alert']");

        if (!entityType || !(entityId >= 1) || !form || !textInput) {
            return;
        }

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const comment = String(textInput.value || "").trim();
            if (!comment) {
                showAlert(alertElement, "Comment is required.", "danger");
                return;
            }

            const submitButton = form.querySelector('[type="submit"]');
            if (submitButton) {
                submitButton.disabled = true;
            }

            try {
                const response = await fetch("/api/entity-comments", {
                    method: "POST",
                    credentials: "same-origin",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        entity_type: entityType,
                        entity_id: entityId,
                        comment,
                    }),
                });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    showAlert(alertElement, data.error || "Failed to add comment.", "danger");
                    return;
                }
                window.location.reload();
            } catch (error) {
                console.error(error);
                showAlert(alertElement, "Failed to add comment.", "danger");
            } finally {
                if (submitButton) {
                    submitButton.disabled = false;
                }
            }
        });

        list?.addEventListener("click", async (event) => {
            const item = event.target.closest("li[data-id]");
            if (!item) {
                return;
            }
            const commentId = Number(item.dataset.id || 0);
            if (!(commentId >= 1)) {
                return;
            }

            if (event.target.closest(".hb-comment-delete-btn")) {
                const confirmed = await showConfirm({
                    title: "Delete comment",
                    description: "Delete this comment? This cannot be undone.",
                    choices: [
                        { label: "Cancel", value: false, variant: "outline-secondary" },
                        { label: "Delete", value: true, variant: "danger" },
                    ],
                });
                if (!confirmed) {
                    return;
                }
                const response = await fetch(`/api/entity-comments/${commentId}`, {
                    method: "DELETE",
                    credentials: "same-origin",
                });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    showAlert(alertElement, data.error || "Failed to delete comment.", "danger");
                    return;
                }
                window.location.reload();
                return;
            }

            if (event.target.closest(".hb-comment-edit-btn")) {
                const bodyElement = item.querySelector(".hb-comment-body");
                const currentText = bodyElement?.textContent || "";
                const nextText = window.prompt("Edit comment", currentText);
                if (nextText == null) {
                    return;
                }
                const comment = String(nextText || "").trim();
                if (!comment) {
                    showAlert(alertElement, "Comment is required.", "danger");
                    return;
                }
                const response = await fetch(`/api/entity-comments/${commentId}`, {
                    method: "PATCH",
                    credentials: "same-origin",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ comment }),
                });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    showAlert(alertElement, data.error || "Failed to update comment.", "danger");
                    return;
                }
                window.location.reload();
            }
        });

        if (emptyElement && list && list.children.length) {
            emptyElement.classList.add("d-none");
        }
    });
})();
