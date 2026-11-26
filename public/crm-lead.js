document.addEventListener("DOMContentLoaded", () => {
    const leadId = Number(window.__LEAD_ID__ || 0);
    const pageAlert = document.getElementById("lead-alert");
    const emailKinds = window.__LEAD_EMAIL_KINDS__ || {
        PERSONAL: "personal",
        PROFESSIONAL: "professional",
    };
    const emailKindLabels = window.__LEAD_EMAIL_KIND_LABELS__ || {
        personal: "Personal",
        professional: "Professional",
    };

    function showAlert(element, message, type) {
        window.showAlert?.(element, message, type);
    }

    function hideAlert(element) {
        window.hideAlert?.(element);
    }

    function syncRemoveButtons(listElement, rowSelector, removeSelector) {
        const rows = listElement?.querySelectorAll(rowSelector) || [];
        rows.forEach((row) => {
            const removeButton = row.querySelector(removeSelector);
            if (removeButton) removeButton.classList.toggle("d-none", rows.length <= 1);
        });
    }

    function addPhoneRow(listElement, { phone = "", is_whatsapp = false } = {}) {
        if (!listElement) return;
        const rowIndex = listElement.querySelectorAll(".lead-phone-row").length;
        const wrapper = document.createElement("div");
        wrapper.className = "lead-phone-row border rounded p-2";
        const safePhone = window.escapeHtml?.(phone) || phone;
        wrapper.innerHTML = `
            <div class="row g-2 align-items-center">
                <div class="col-md-7">
                    <label class="form-label small mb-1">Phone</label>
                    <input type="text" class="form-control form-control-sm lead-phone-input" maxlength="32" value="${safePhone}" />
                </div>
                <div class="col-md-3">
                    <div class="form-check mt-md-4">
                        <input type="checkbox" class="form-check-input lead-phone-whatsapp" id="lead-edit-phone-whatsapp-${rowIndex}" ${is_whatsapp ? "checked" : ""} />
                        <label class="form-check-label" for="lead-edit-phone-whatsapp-${rowIndex}">WhatsApp</label>
                    </div>
                </div>
                <div class="col-md-2 text-md-end">
                    <button type="button" class="btn btn-sm btn-outline-danger lead-phone-remove-btn mt-md-3">Remove</button>
                </div>
            </div>
        `;
        listElement.appendChild(wrapper);
        syncRemoveButtons(listElement, ".lead-phone-row", ".lead-phone-remove-btn");
    }

    function addEmailRow(listElement, { email = "", kind = emailKinds.PROFESSIONAL } = {}) {
        if (!listElement) return;
        const rowIndex = listElement.querySelectorAll(".lead-email-row").length;
        const personalChecked = kind === emailKinds.PERSONAL ? "checked" : "";
        const professionalChecked = kind !== emailKinds.PERSONAL ? "checked" : "";
        const safeEmail = window.escapeHtml?.(email) || email;
        const wrapper = document.createElement("div");
        wrapper.className = "lead-email-row border rounded p-2";
        wrapper.innerHTML = `
            <div class="row g-2 align-items-center">
                <div class="col-md-6">
                    <label class="form-label small mb-1">Email</label>
                    <input type="email" class="form-control form-control-sm lead-email-input" maxlength="255" value="${safeEmail}" />
                </div>
                <div class="col-md-4">
                    <div class="mt-md-4 d-flex flex-wrap gap-3">
                        <div class="form-check">
                            <input class="form-check-input lead-email-kind" type="radio" name="lead-edit-email-kind-${rowIndex}" value="${emailKinds.PERSONAL}" ${personalChecked} />
                            <label class="form-check-label">${emailKindLabels[emailKinds.PERSONAL] || "Personal"}</label>
                        </div>
                        <div class="form-check">
                            <input class="form-check-input lead-email-kind" type="radio" name="lead-edit-email-kind-${rowIndex}" value="${emailKinds.PROFESSIONAL}" ${professionalChecked} />
                            <label class="form-check-label">${emailKindLabels[emailKinds.PROFESSIONAL] || "Professional"}</label>
                        </div>
                    </div>
                </div>
                <div class="col-md-2 text-md-end">
                    <button type="button" class="btn btn-sm btn-outline-danger lead-email-remove-btn mt-md-3">Remove</button>
                </div>
            </div>
        `;
        listElement.appendChild(wrapper);
        syncRemoveButtons(listElement, ".lead-email-row", ".lead-email-remove-btn");
    }

    const editPhonesList = document.getElementById("lead-edit-phones-list");
    const editEmailsList = document.getElementById("lead-edit-emails-list");

    function populateEditContacts() {
        if (editPhonesList) editPhonesList.innerHTML = "";
        if (editEmailsList) editEmailsList.innerHTML = "";
        const phones = Array.isArray(window.__LEAD_PHONES__) ? window.__LEAD_PHONES__ : [];
        const emails = Array.isArray(window.__LEAD_EMAILS__) ? window.__LEAD_EMAILS__ : [];
        if (phones.length) {
            phones.forEach((row) =>
                addPhoneRow(editPhonesList, {
                    phone: row.phone,
                    is_whatsapp: !!row.is_whatsapp,
                }),
            );
        } else {
            addPhoneRow(editPhonesList);
        }
        if (emails.length) {
            emails.forEach((row) =>
                addEmailRow(editEmailsList, {
                    email: row.email,
                    kind: row.kind,
                }),
            );
        } else {
            addEmailRow(editEmailsList);
        }
    }

    document.getElementById("open-edit-lead-btn")?.addEventListener("click", populateEditContacts);
    document.getElementById("lead-edit-modal")?.addEventListener("show.bs.modal", populateEditContacts);
    document.getElementById("lead-edit-add-phone-btn")?.addEventListener("click", () =>
        addPhoneRow(editPhonesList),
    );
    document.getElementById("lead-edit-add-email-btn")?.addEventListener("click", () =>
        addEmailRow(editEmailsList),
    );

    editPhonesList?.addEventListener("click", (event) => {
        if (!event.target.closest(".lead-phone-remove-btn")) return;
        event.target.closest(".lead-phone-row")?.remove();
        syncRemoveButtons(editPhonesList, ".lead-phone-row", ".lead-phone-remove-btn");
    });

    editEmailsList?.addEventListener("click", (event) => {
        if (!event.target.closest(".lead-email-remove-btn")) return;
        event.target.closest(".lead-email-row")?.remove();
        syncRemoveButtons(editEmailsList, ".lead-email-row", ".lead-email-remove-btn");
    });

    document.getElementById("lead-edit-form")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const formAlert = document.getElementById("lead-edit-form-alert");
        hideAlert(formAlert);

        const fullName = document.getElementById("lead-edit-full-name")?.value?.trim() || "";
        if (!fullName) {
            showAlert(formAlert, "Full name is required.", "danger");
            return;
        }

        const phones = [];
        editPhonesList?.querySelectorAll(".lead-phone-row").forEach((row) => {
            const phone = row.querySelector(".lead-phone-input")?.value?.trim() || "";
            if (!phone) return;
            phones.push({
                phone,
                is_whatsapp: !!row.querySelector(".lead-phone-whatsapp")?.checked,
            });
        });
        const emails = [];
        editEmailsList?.querySelectorAll(".lead-email-row").forEach((row) => {
            const email = row.querySelector(".lead-email-input")?.value?.trim() || "";
            if (!email) return;
            emails.push({
                email,
                kind:
                    row.querySelector(".lead-email-kind:checked")?.value ||
                    emailKinds.PROFESSIONAL,
            });
        });
        if (!phones.length && !emails.length) {
            showAlert(formAlert, "Add at least one phone number or email.", "danger");
            return;
        }

        const payload = {
            full_name: fullName,
            website: document.getElementById("lead-edit-website")?.value?.trim() || null,
            organization: document.getElementById("lead-edit-organization")?.value?.trim() || null,
            designation: document.getElementById("lead-edit-designation")?.value?.trim() || null,
            location: document.getElementById("lead-edit-location")?.value?.trim() || null,
            refer_by: document.getElementById("lead-edit-refer-by")?.value?.trim() || null,
            targeted_for: document.getElementById("lead-edit-targeted-for")?.value?.trim() || null,
            source: document.getElementById("lead-edit-source")?.value?.trim() || null,
            note: document.getElementById("lead-edit-note")?.value?.trim() || null,
            phones,
            emails,
        };

        const submitButton = document.getElementById("lead-edit-submit-btn");
        if (submitButton) submitButton.disabled = true;
        try {
            const response = await fetch(`/api/leads/${leadId}`, {
                method: "PATCH",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showAlert(formAlert, data.error || "Failed to update lead.", "danger");
                return;
            }
            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert(formAlert, "Failed to update lead.", "danger");
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    });

    document.getElementById("delete-lead-btn")?.addEventListener("click", async () => {
        const confirmed = await window.showConfirm?.({
            title: "Delete lead?",
            description: "This will remove the lead, notes, and communications.",
            choices: [
                { label: "Cancel", variant: "secondary", value: false },
                { label: "Delete", variant: "danger", value: true },
            ],
        });
        if (!confirmed) return;

        try {
            const response = await fetch(`/api/leads/${leadId}`, {
                method: "DELETE",
                credentials: "same-origin",
            });
            if (!response.ok && response.status !== 204) {
                const data = await response.json().catch(() => ({}));
                showAlert(pageAlert, data.error || "Failed to delete lead.", "danger");
                return;
            }
            window.location.href = "/app/crm/leads";
        } catch (error) {
            console.error(error);
            showAlert(pageAlert, "Failed to delete lead.", "danger");
        }
    });

    const noteForm = document.getElementById("lead-note-form");
    const noteFormAlert = document.getElementById("lead-note-form-alert");
    const notesList = document.getElementById("lead-notes-list");
    const noteEditModalElement = document.getElementById("lead-note-edit-modal");
    const noteEditForm = document.getElementById("lead-note-edit-form");
    const noteEditAlert = document.getElementById("lead-note-edit-alert");
    const noteEditIdInput = document.getElementById("lead-note-edit-id");
    const noteEditTextInput = document.getElementById("lead-note-edit-text");

    noteForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideAlert(noteFormAlert);

        const note = document.getElementById("lead-note-text")?.value?.trim() || "";
        if (!note) {
            showAlert(noteFormAlert, "Note is required.", "danger");
            return;
        }

        const fileInput = document.getElementById("lead-note-file");
        const file = fileInput?.files?.[0];
        if (file) {
            const sizeCheck = window.validateUploadFiles?.(file);
            if (sizeCheck && !sizeCheck.ok) {
                showAlert(noteFormAlert, sizeCheck.error, "danger");
                return;
            }
        }

        const submitButton = document.getElementById("lead-note-submit-btn");
        if (submitButton) submitButton.disabled = true;
        try {
            const body = new FormData();
            body.append("lead_id", String(leadId));
            body.append("note", note);
            if (file) body.append("file", file);

            const response = await fetch("/api/lead-notes", {
                method: "POST",
                credentials: "same-origin",
                body,
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showAlert(noteFormAlert, data.error || "Failed to add note.", "danger");
                return;
            }
            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert(noteFormAlert, "Failed to add note.", "danger");
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    });

    notesList?.addEventListener("click", async (event) => {
        const listItem = event.target.closest("li[data-id]");
        if (!listItem) return;

        if (event.target.closest(".lead-note-edit-btn")) {
            if (noteEditIdInput) noteEditIdInput.value = listItem.dataset.id || "";
            if (noteEditTextInput) {
                noteEditTextInput.value =
                    listItem.querySelector(".hb-comment-body")?.textContent || "";
            }
            hideAlert(noteEditAlert);
            window.bootstrap?.Modal?.getOrCreateInstance(noteEditModalElement)?.show();
            return;
        }

        if (event.target.closest(".lead-note-delete-btn")) {
            const noteId = Number(listItem.dataset.id || 0);
            const confirmed = await window.showConfirm?.({
                title: "Delete note?",
                description: "This cannot be undone.",
                choices: [
                    { label: "Cancel", variant: "secondary", value: false },
                    { label: "Delete", variant: "danger", value: true },
                ],
            });
            if (!confirmed) return;

            try {
                const response = await fetch(`/api/lead-notes/${noteId}`, {
                    method: "DELETE",
                    credentials: "same-origin",
                });
                if (!response.ok && response.status !== 204) {
                    const data = await response.json().catch(() => ({}));
                    showAlert(pageAlert, data.error || "Failed to delete note.", "danger");
                    return;
                }
                window.location.reload();
            } catch (error) {
                console.error(error);
                showAlert(pageAlert, "Failed to delete note.", "danger");
            }
        }
    });

    noteEditForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideAlert(noteEditAlert);

        const noteId = Number(noteEditIdInput?.value || 0);
        const note = noteEditTextInput?.value?.trim() || "";
        if (!(noteId >= 1) || !note) {
            showAlert(noteEditAlert, "Note is required.", "danger");
            return;
        }

        const saveButton = document.getElementById("lead-note-edit-save-btn");
        if (saveButton) saveButton.disabled = true;
        try {
            const response = await fetch(`/api/lead-notes/${noteId}`, {
                method: "PATCH",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ note }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showAlert(noteEditAlert, data.error || "Failed to update note.", "danger");
                return;
            }
            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert(noteEditAlert, "Failed to update note.", "danger");
        } finally {
            if (saveButton) saveButton.disabled = false;
        }
    });
});
