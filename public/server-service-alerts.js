(() => {
    const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    function showFeedback(card, message, isError) {
        const feedback = card.querySelector(".service-alerts-feedback");
        if (!feedback) return;
        feedback.textContent = message;
        feedback.className = `service-alerts-feedback small mt-2 ${isError ? "text-danger" : "text-secondary"}`;
        feedback.classList.remove("d-none");
    }

    function selectedEmails(card) {
        return Array.from(card.querySelectorAll(".alert-email-check:checked"))
            .map((input) => String(input.value || "").trim().toLowerCase())
            .filter((email, index, list) => email && list.indexOf(email) === index);
    }

    function serializeExtraList(card) {
        return Array.from(card.querySelectorAll(".alert-email-extra-list .alert-email-extra-row"))
            .map((row) => {
                const input = row.querySelector(".alert-email-check");
                return {
                    email: String(input?.value || "").trim().toLowerCase(),
                    checked: Boolean(input?.checked),
                };
            })
            .filter((entry) => entry.email);
    }

    function renderExtraList(card, entries, editing) {
        const list = card.querySelector(".alert-email-extra-list");
        if (!list) return;
        const sid = card.dataset.service || "service";
        list.innerHTML = "";
        entries.forEach((entry, index) => {
            const row = document.createElement("div");
            row.className = "form-check alert-email-extra-row";
            const inputId = `${sid}-alert-email-extra-dyn-${index}`;
            row.innerHTML = `
                <input class="form-check-input alert-email-check" type="checkbox" id="${inputId}" value="${entry.email}" data-source="extra" ${entry.checked ? "checked" : ""} ${editing ? "" : "disabled"} />
                <label class="form-check-label small" for="${inputId}">${entry.email}</label>
                <button type="button" class="btn btn-link btn-sm text-danger p-0 ms-2 alert-email-extra-remove ${editing ? "" : "d-none"}" aria-label="Remove">Remove</button>
            `;
            list.appendChild(row);
        });
    }

    function collectEditable(card) {
        return [
            ...card.querySelectorAll(".alert-field"),
            ...card.querySelectorAll(".alert-email-check"),
            ...card.querySelectorAll(".alert-email-extra-input"),
            ...card.querySelectorAll(".alert-email-extra-add"),
            ...card.querySelectorAll(".alert-email-extra-remove"),
        ];
    }

    function setEditing(card, editing) {
        collectEditable(card).forEach((element) => {
            element.disabled = !editing;
        });
        card.querySelectorAll(".alert-email-extra-remove").forEach((button) => {
            button.classList.toggle("d-none", !editing);
        });
        card.querySelector(".service-alerts-edit-btn")?.classList.toggle("d-none", editing);
        card.querySelector(".service-alerts-cancel-btn")?.classList.toggle("d-none", !editing);
        card.querySelector(".service-alerts-save-btn")?.classList.toggle("d-none", !editing);
    }

    function readAlertFields(card) {
        const data = {};
        card.querySelectorAll(".alert-field[data-alert-key]").forEach((element) => {
            const key = element.dataset.alertKey;
            if (!key) return;
            if (element.type === "checkbox") {
                data[key] = element.checked;
            } else {
                data[key] = element.value;
            }
        });
        return data;
    }

    function applyAlertFields(card, values) {
        if (!values || typeof values !== "object") return;
        card.querySelectorAll(".alert-field[data-alert-key]").forEach((element) => {
            const key = element.dataset.alertKey;
            if (!key || values[key] === undefined) return;
            if (element.type === "checkbox") {
                element.checked = Boolean(values[key]);
            } else {
                element.value = values[key];
            }
        });
    }

    function takeSnapshot(card) {
        return {
            fields: readAlertFields(card),
            checks: Array.from(card.querySelectorAll(".alert-email-check")).map((input) => ({
                value: input.value,
                checked: input.checked,
                source: input.dataset.source || "",
            })),
            extras: serializeExtraList(card),
            extraInput: card.querySelector(".alert-email-extra-input")?.value || "",
        };
    }

    function restoreSnapshot(card, state) {
        if (!state) return;
        applyAlertFields(card, state.fields);
        const extraInput = card.querySelector(".alert-email-extra-input");
        if (extraInput) extraInput.value = state.extraInput || "";
        renderExtraList(card, state.extras || [], false);
        state.checks?.forEach((entry) => {
            const input = Array.from(card.querySelectorAll(".alert-email-check")).find(
                (element) =>
                    element.value === entry.value &&
                    (element.dataset.source || "") === entry.source,
            );
            if (input) input.checked = entry.checked;
        });
    }

    function applySavedEmails(card, savedEmails) {
        const emails = Array.isArray(savedEmails) ? savedEmails : [];
        const savedSet = new Set(emails);
        card.querySelectorAll(".alert-email-check").forEach((input) => {
            if (input.dataset.source === "extra") return;
            input.checked = savedSet.has(String(input.value || "").toLowerCase());
        });
        const candidateSet = new Set(
            Array.from(card.querySelectorAll(".alert-email-check"))
                .filter((input) => input.dataset.source !== "extra")
                .map((input) => String(input.value || "").toLowerCase()),
        );
        const extras = emails
            .filter((email) => !candidateSet.has(email))
            .map((email) => ({ email, checked: true }));
        renderExtraList(card, extras, false);
        const extraInput = card.querySelector(".alert-email-extra-input");
        if (extraInput) extraInput.value = "";
    }

    async function saveMonitor(card, fields) {
        const id = Number(card.dataset.serverId || 0);
        const payload = {
            id,
            alert_cpu_enabled: Boolean(fields.alert_cpu_enabled),
            alert_cpu_percent: Number(fields.alert_cpu_percent || 80),
            alert_memory_enabled: Boolean(fields.alert_memory_enabled),
            alert_memory_percent: Number(fields.alert_memory_percent || 80),
            alert_ping_enabled: Boolean(fields.alert_ping_enabled),
            alert_ping_seconds: Number(fields.alert_ping_seconds || 180),
            alert_emails: selectedEmails(card),
        };
        const response = await fetch("/api/monitored-servers", {
            method: "PATCH",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || "Failed to save.");
        }
        const server = data.server || {};
        applyAlertFields(card, {
            alert_cpu_enabled: Boolean(server.alert_cpu_enabled),
            alert_cpu_percent: server.alert_cpu_percent ?? payload.alert_cpu_percent,
            alert_memory_enabled: Boolean(server.alert_memory_enabled),
            alert_memory_percent: server.alert_memory_percent ?? payload.alert_memory_percent,
            alert_ping_enabled: Boolean(server.alert_ping_enabled),
            alert_ping_seconds: server.alert_ping_seconds ?? payload.alert_ping_seconds,
        });
        applySavedEmails(
            card,
            Array.isArray(server.alert_emails) ? server.alert_emails : payload.alert_emails,
        );
    }

    async function saveService(card, fields) {
        const id = Number(card.dataset.serverId || 0);
        const service = card.dataset.service;
        const payload = {
            ...fields,
            alert_emails: selectedEmails(card),
        };
        // Normalize checkbox string/bool already handled; numbers not needed for drivesync.
        if ("alert_on_start" in payload) payload.alert_on_start = Boolean(payload.alert_on_start);
        if ("alert_on_complete" in payload) {
            payload.alert_on_complete = Boolean(payload.alert_on_complete);
        }
        const response = await fetch(
            `/api/monitored-servers/${id}/services/${encodeURIComponent(service)}/alerts`,
            {
                method: "PATCH",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            },
        );
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || "Failed to save.");
        }
        const config = data.config || {};
        applyAlertFields(card, {
            alert_on_start: config.alert_on_start !== false,
            alert_on_complete: config.alert_on_complete !== false,
        });
        applySavedEmails(
            card,
            Array.isArray(data.alert_emails)
                ? data.alert_emails
                : Array.isArray(config.alert_emails)
                  ? config.alert_emails
                  : payload.alert_emails,
        );
    }

    function initCard(card) {
        const editBtn = card.querySelector(".service-alerts-edit-btn");
        const cancelBtn = card.querySelector(".service-alerts-cancel-btn");
        const saveBtn = card.querySelector(".service-alerts-save-btn");
        const extraList = card.querySelector(".alert-email-extra-list");
        const extraInput = card.querySelector(".alert-email-extra-input");
        const extraAddButton = card.querySelector(".alert-email-extra-add");
        let snapshot = null;

        editBtn?.addEventListener("click", () => {
            snapshot = takeSnapshot(card);
            setEditing(card, true);
            showFeedback(card, "Editing alert settings…", false);
        });

        cancelBtn?.addEventListener("click", () => {
            restoreSnapshot(card, snapshot);
            setEditing(card, false);
            showFeedback(card, "Changes discarded.", false);
        });

        extraList?.addEventListener("click", (event) => {
            const removeButton = event.target.closest(".alert-email-extra-remove");
            if (!removeButton || removeButton.disabled) return;
            removeButton.closest(".alert-email-extra-row")?.remove();
        });

        extraAddButton?.addEventListener("click", () => {
            const email = String(extraInput?.value || "")
                .trim()
                .toLowerCase();
            if (!EMAIL_PATTERN.test(email)) {
                showFeedback(card, "Enter a valid email address.", true);
                return;
            }
            const existing = Array.from(card.querySelectorAll(".alert-email-check")).find(
                (input) => String(input.value || "").toLowerCase() === email,
            );
            if (existing) {
                existing.checked = true;
                if (extraInput) extraInput.value = "";
                showFeedback(card, "Email already listed; selected.", false);
                return;
            }
            const extras = serializeExtraList(card);
            extras.push({ email, checked: true });
            renderExtraList(card, extras, true);
            if (extraInput) extraInput.value = "";
            showFeedback(card, "Email added.", false);
        });

        saveBtn?.addEventListener("click", async () => {
            const fields = readAlertFields(card);
            saveBtn.disabled = true;
            cancelBtn.disabled = true;
            showFeedback(card, "Saving…", false);
            try {
                if (card.dataset.saveMode === "monitor") {
                    await saveMonitor(card, fields);
                } else {
                    await saveService(card, fields);
                }
                snapshot = takeSnapshot(card);
                setEditing(card, false);
                showFeedback(card, "Alert settings saved.", false);
            } catch (error) {
                console.error(error);
                showFeedback(card, error.message || "Failed to save.", true);
            } finally {
                saveBtn.disabled = false;
                cancelBtn.disabled = false;
            }
        });
    }

    document.querySelectorAll(".service-alerts-card").forEach(initCard);
})();
