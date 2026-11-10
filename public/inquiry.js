(() => {
    const detail = document.getElementById("inquiry-detail");
    if (!detail) return;

    const inquiryId = Number(detail.dataset.id || 0);
    const canManage = detail.dataset.canManage === "1";
    const isAdmin = detail.dataset.isAdmin === "1";
    const alertElement = document.getElementById("inquiry-alert");

    function showAlert(message, type = "danger") {
        if (!alertElement) return;
        alertElement.textContent = message;
        alertElement.className = `alert alert-${type}`;
        alertElement.classList.remove("d-none");
    }

    function hideAlert() {
        if (!alertElement) return;
        alertElement.classList.add("d-none");
        alertElement.textContent = "";
    }

    async function patchInquiry(payload) {
        hideAlert();
        const response = await fetch(`/api/inquiries/${inquiryId}`, {
            method: "PATCH",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            showAlert(data.error || "Failed to update inquiry");
            return null;
        }
        return data;
    }

    const stateSelect = document.getElementById("inquiry-state");
    stateSelect?.addEventListener("change", async () => {
        if (!canManage) return;
        const result = await patchInquiry({ state: stateSelect.value });
        if (result) window.location.reload();
    });

    const assigneeSelect = document.getElementById("inquiry-assignee");
    assigneeSelect?.addEventListener("change", async () => {
        const value = String(assigneeSelect.value || "").trim();
        const result = await patchInquiry({
            assignee_user_id: value ? Number(value) : null,
        });
        if (result) window.location.reload();
    });

    document.getElementById("inquiry-assign-me-btn")?.addEventListener("click", async () => {
        const result = await patchInquiry({ assign_to_me: true });
        if (result) window.location.reload();
    });

    document.getElementById("inquiry-quote-save-btn")?.addEventListener("click", async () => {
        if (!canManage) return;
        const quote = String(document.getElementById("inquiry-quote")?.value || "");
        const result = await patchInquiry({ quote });
        if (result) {
            showAlert("Quote saved", "success");
        }
    });

    document.getElementById("inquiry-contact-save-btn")?.addEventListener("click", async () => {
        if (!isAdmin) return;
        const result = await patchInquiry({
            full_name: String(document.getElementById("inquiry-full-name")?.value || "").trim() || null,
            phone: String(document.getElementById("inquiry-phone")?.value || "").trim(),
            email: String(document.getElementById("inquiry-email")?.value || "").trim() || null,
            institute_name:
                String(document.getElementById("inquiry-institute")?.value || "").trim() || null,
            city: String(document.getElementById("inquiry-city")?.value || "").trim() || null,
        });
        if (result) {
            showAlert("Contact saved", "success");
        }
    });

    document.getElementById("inquiry-note-form")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const note = String(document.getElementById("inquiry-note-text")?.value || "").trim();
        if (!note) {
            showAlert("Note is required");
            return;
        }
        const response = await fetch("/api/inquiry-notes", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ inquiry_id: inquiryId, note }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            showAlert(data.error || "Failed to add note");
            return;
        }
        window.location.reload();
    });

    const editModalElement = document.getElementById("inquiry-note-edit-modal");
    const editIdInput = document.getElementById("inquiry-note-edit-id");
    const editTextInput = document.getElementById("inquiry-note-edit-text");

    document.querySelectorAll(".inquiry-note-edit-btn").forEach((button) => {
        button.addEventListener("click", () => {
            const noteId = Number(button.dataset.noteId || 0);
            const noteItem = document.querySelector(`[data-note-id="${noteId}"]`);
            const body = noteItem?.querySelector(".inquiry-note-body");
            if (!noteId || !body || !editIdInput || !editTextInput) return;
            editIdInput.value = String(noteId);
            editTextInput.value = body.textContent || "";
            if (window.bootstrap?.Modal && editModalElement) {
                window.bootstrap.Modal.getOrCreateInstance(editModalElement).show();
            }
        });
    });

    document.getElementById("inquiry-note-edit-form")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const noteId = Number(editIdInput?.value || 0);
        const note = String(editTextInput?.value || "").trim();
        if (!noteId || !note) return;
        const response = await fetch(`/api/inquiry-notes/${noteId}`, {
            method: "PATCH",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ note }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            showAlert(data.error || "Failed to update note");
            return;
        }
        window.location.reload();
    });

    document.querySelectorAll(".inquiry-note-delete-btn").forEach((button) => {
        button.addEventListener("click", async () => {
            const noteId = Number(button.dataset.noteId || 0);
            if (!noteId) return;
            const confirmed = await window.showConfirm?.({
                title: "Delete note",
                description: "Delete this note? This cannot be undone.",
                choices: [
                    { label: "Cancel", value: false },
                    { label: "Delete", value: true, variant: "danger" },
                ],
            });
            if (!confirmed) return;
            const response = await fetch(`/api/inquiry-notes/${noteId}`, {
                method: "DELETE",
                credentials: "same-origin",
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showAlert(data.error || "Failed to delete note");
                return;
            }
            window.location.reload();
        });
    });

    document.getElementById("inquiry-followup-form")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const slot = Number(document.getElementById("inquiry-followup-slot")?.value || 0);
        const note = String(document.getElementById("inquiry-followup-note")?.value || "").trim();
        const followedUpOnRaw = String(
            document.getElementById("inquiry-followup-on")?.value || "",
        ).trim();
        if (!slot || !note) {
            showAlert("Follow-up note is required");
            return;
        }

        let followed_up_on = null;
        if (followedUpOnRaw) {
            followed_up_on =
                window.getWritableDate?.("YYYY-MM-DD HH:mm:ss", followedUpOnRaw) ||
                followedUpOnRaw.replace("T", " ") + ":00";
        }

        const response = await fetch("/api/inquiry-followups", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                inquiry_id: inquiryId,
                slot,
                note,
                followed_up_on,
            }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            showAlert(data.error || "Failed to add follow-up");
            return;
        }
        window.location.reload();
    });
})();
