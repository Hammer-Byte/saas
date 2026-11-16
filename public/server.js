(() => {
    function bindEditor({
        card,
        feedback,
        editBtn,
        cancelBtn,
        saveBtn,
        fields,
        takeSnapshot,
        restoreSnapshot,
        buildPayload,
        applyServer,
        editingLabel,
        savedLabel,
    }) {
        if (!card || !editBtn || !saveBtn || !cancelBtn) {
            return;
        }

        let snapshot = null;

        function showFeedback(message, isError) {
            if (!feedback) return;
            feedback.textContent = message;
            feedback.className = `small mt-2 ${isError ? "text-danger" : "text-secondary"}`;
            feedback.classList.remove("d-none");
        }

        function setEditing(editing) {
            fields.forEach((el) => {
                el.disabled = !editing;
            });
            editBtn.classList.toggle("d-none", editing);
            cancelBtn.classList.toggle("d-none", !editing);
            saveBtn.classList.toggle("d-none", !editing);
        }

        editBtn.addEventListener("click", () => {
            snapshot = takeSnapshot();
            setEditing(true);
            showFeedback(editingLabel, false);
        });

        cancelBtn.addEventListener("click", () => {
            restoreSnapshot(snapshot);
            setEditing(false);
            showFeedback("Changes discarded.", false);
        });

        saveBtn.addEventListener("click", async () => {
            const id = Number(card.dataset.serverId || 0);
            if (!id) {
                showFeedback("Invalid server.", true);
                return;
            }

            const payload = buildPayload(id);
            saveBtn.disabled = true;
            cancelBtn.disabled = true;
            showFeedback("Saving…", false);

            try {
                const response = await fetch("/api/monitored-servers", {
                    method: "PATCH",
                    credentials: "same-origin",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    showFeedback(data.error || "Failed to save.", true);
                    return;
                }

                applyServer(data.server || {}, payload);
                snapshot = takeSnapshot();
                setEditing(false);
                showFeedback(savedLabel, false);

                const title = document.querySelector("main h1.h3");
                const nameInput = document.getElementById("server-alert-name");
                if (title && nameInput) {
                    title.textContent = nameInput.value.trim() || "Unnamed server";
                }
            } catch (error) {
                console.error(error);
                showFeedback("Failed to save.", true);
            } finally {
                saveBtn.disabled = false;
                cancelBtn.disabled = false;
            }
        });
    }

    const nameInput = document.getElementById("server-alert-name");

    const nameCard = document.getElementById("server-name-card");
    const deleteButton = document.getElementById("server-delete-btn");

    bindEditor({
        card: nameCard,
        feedback: document.getElementById("server-name-feedback"),
        editBtn: document.getElementById("server-name-edit-btn"),
        cancelBtn: document.getElementById("server-name-cancel-btn"),
        saveBtn: document.getElementById("server-name-save-btn"),
        fields: [nameInput].filter(Boolean),
        takeSnapshot: () => ({ name: nameInput?.value || "" }),
        restoreSnapshot: (snapshot) => {
            if (!snapshot || !nameInput) return;
            nameInput.value = snapshot.name;
        },
        buildPayload: (id) => ({
            id,
            name: (nameInput?.value || "").trim(),
        }),
        applyServer: (server) => {
            if (nameInput) nameInput.value = server.name || "";
        },
        editingLabel: "Editing name…",
        savedLabel: "Name saved.",
    });

    deleteButton?.addEventListener("click", async () => {
        const id = Number(nameCard?.dataset.serverId || 0);
        if (!id) return;

        const label = nameCard?.dataset.serverLabel || `server #${id}`;
        const confirmed = await showConfirm({
            title: "Delete this server?",
            description: `Permanently delete "${label}" and all of its monitoring history, drive-sync reports, and service settings. The agent on the machine is not uninstalled.`,
            choices: [
                { label: "Cancel", variant: "secondary", value: false },
                { label: "Delete everything", variant: "danger", value: true },
            ],
        });
        if (!confirmed) return;

        deleteButton.disabled = true;
        try {
            const response = await fetch(`/api/monitored-servers/${id}`, {
                method: "DELETE",
                credentials: "same-origin",
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                const feedback = document.getElementById("server-name-feedback");
                if (feedback) {
                    feedback.textContent = data.error || "Failed to delete server.";
                    feedback.className = "small mt-2 text-danger";
                    feedback.classList.remove("d-none");
                }
                return;
            }
            window.location.href = "/app/servers";
        } catch (error) {
            console.error(error);
            const feedback = document.getElementById("server-name-feedback");
            if (feedback) {
                feedback.textContent = "Failed to delete server.";
                feedback.className = "small mt-2 text-danger";
                feedback.classList.remove("d-none");
            }
        } finally {
            deleteButton.disabled = false;
        }
    });

    const cpuPercent = document.getElementById("alert-cpu-percent");
    const cpuEnabled = document.getElementById("alert-cpu-enabled");
    const memoryPercent = document.getElementById("alert-memory-percent");
    const memoryEnabled = document.getElementById("alert-memory-enabled");
    const pingSeconds = document.getElementById("alert-ping-seconds");
    const pingEnabled = document.getElementById("alert-ping-enabled");
    const alertsCard = document.getElementById("server-alerts-card");
    const extraList = document.getElementById("alert-email-extra-list");
    const extraInput = document.getElementById("alert-email-extra-input");
    const extraAddButton = document.getElementById("alert-email-extra-add");
    const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    function alertRoot() {
        return alertsCard || document;
    }

    function collectAlertFields() {
        return [
            cpuPercent,
            cpuEnabled,
            memoryPercent,
            memoryEnabled,
            pingSeconds,
            pingEnabled,
            extraInput,
            extraAddButton,
            ...alertRoot().querySelectorAll(".alert-email-check"),
            ...alertRoot().querySelectorAll(".alert-email-extra-remove"),
        ].filter(Boolean);
    }

    function selectedAlertEmails() {
        return Array.from(alertRoot().querySelectorAll(".alert-email-check:checked"))
            .map((input) => String(input.value || "").trim().toLowerCase())
            .filter((email, index, list) => email && list.indexOf(email) === index);
    }

    function serializeExtraList() {
        return Array.from(alertRoot().querySelectorAll("#alert-email-extra-list .alert-email-extra-row"))
            .map((row) => {
                const input = row.querySelector(".alert-email-check");
                return {
                    email: String(input?.value || "").trim().toLowerCase(),
                    checked: Boolean(input?.checked),
                };
            })
            .filter((entry) => entry.email);
    }

    function renderExtraList(entries, editing) {
        if (!extraList) return;
        extraList.innerHTML = "";
        entries.forEach((entry, index) => {
            const row = document.createElement("div");
            row.className = "form-check alert-email-extra-row";
            const inputId = `alert-email-extra-dyn-${index}`;
            row.innerHTML = `
                <input class="form-check-input alert-email-check" type="checkbox" id="${inputId}" value="${entry.email}" data-source="extra" ${entry.checked ? "checked" : ""} ${editing ? "" : "disabled"} />
                <label class="form-check-label small" for="${inputId}">${entry.email}</label>
                <button type="button" class="btn btn-link btn-sm text-danger p-0 ms-2 alert-email-extra-remove ${editing ? "" : "d-none"}" aria-label="Remove">Remove</button>
            `;
            extraList.appendChild(row);
        });
    }

    function setAlertEditing(editing) {
        collectAlertFields().forEach((element) => {
            element.disabled = !editing;
        });
        alertRoot().querySelectorAll(".alert-email-extra-remove").forEach((button) => {
            button.classList.toggle("d-none", !editing);
        });
        const editBtn = document.getElementById("server-alerts-edit-btn");
        const cancelBtn = document.getElementById("server-alerts-cancel-btn");
        const saveBtn = document.getElementById("server-alerts-save-btn");
        editBtn?.classList.toggle("d-none", editing);
        cancelBtn?.classList.toggle("d-none", !editing);
        saveBtn?.classList.toggle("d-none", !editing);
    }

    if (alertsCard) {
        const feedback = document.getElementById("server-alert-feedback");
        const editBtn = document.getElementById("server-alerts-edit-btn");
        const cancelBtn = document.getElementById("server-alerts-cancel-btn");
        const saveBtn = document.getElementById("server-alerts-save-btn");
        let snapshot = null;

        function showFeedback(message, isError) {
            if (!feedback) return;
            feedback.textContent = message;
            feedback.className = `small mt-2 ${isError ? "text-danger" : "text-secondary"}`;
            feedback.classList.remove("d-none");
        }

        function takeSnapshot() {
            return {
                alert_cpu_percent: cpuPercent?.value || "80",
                alert_cpu_enabled: Boolean(cpuEnabled?.checked),
                alert_memory_percent: memoryPercent?.value || "80",
                alert_memory_enabled: Boolean(memoryEnabled?.checked),
                alert_ping_seconds: pingSeconds?.value || "180",
                alert_ping_enabled: Boolean(pingEnabled?.checked),
                checks: Array.from(alertRoot().querySelectorAll(".alert-email-check")).map((input) => ({
                    value: input.value,
                    checked: input.checked,
                    source: input.dataset.source || "",
                })),
                extras: serializeExtraList(),
                extraInput: extraInput?.value || "",
            };
        }

        function restoreSnapshot(state) {
            if (!state) return;
            if (cpuPercent) cpuPercent.value = state.alert_cpu_percent;
            if (cpuEnabled) cpuEnabled.checked = state.alert_cpu_enabled;
            if (memoryPercent) memoryPercent.value = state.alert_memory_percent;
            if (memoryEnabled) memoryEnabled.checked = state.alert_memory_enabled;
            if (pingSeconds) pingSeconds.value = state.alert_ping_seconds;
            if (pingEnabled) pingEnabled.checked = state.alert_ping_enabled;
            if (extraInput) extraInput.value = state.extraInput || "";
            renderExtraList(state.extras || [], false);
            state.checks?.forEach((entry) => {
                const input = Array.from(alertRoot().querySelectorAll(".alert-email-check")).find(
                    (element) =>
                        element.value === entry.value &&
                        (element.dataset.source || "") === entry.source,
                );
                if (input) input.checked = entry.checked;
            });
        }

        editBtn?.addEventListener("click", () => {
            snapshot = takeSnapshot();
            setAlertEditing(true);
            showFeedback("Editing alert settings…", false);
        });

        cancelBtn?.addEventListener("click", () => {
            restoreSnapshot(snapshot);
            setAlertEditing(false);
            showFeedback("Changes discarded.", false);
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
                showFeedback("Enter a valid email address.", true);
                return;
            }
            const existing = Array.from(alertRoot().querySelectorAll(".alert-email-check")).some(
                (input) => String(input.value || "").toLowerCase() === email,
            );
            if (existing) {
                const match = Array.from(alertRoot().querySelectorAll(".alert-email-check")).find(
                    (input) => String(input.value || "").toLowerCase() === email,
                );
                if (match) match.checked = true;
                if (extraInput) extraInput.value = "";
                showFeedback("Email already listed; selected.", false);
                return;
            }
            const extras = serializeExtraList();
            extras.push({ email, checked: true });
            renderExtraList(extras, true);
            if (extraInput) extraInput.value = "";
            showFeedback("Email added.", false);
        });

        saveBtn?.addEventListener("click", async () => {
            const id = Number(alertsCard.dataset.serverId || 0);
            if (!id) {
                showFeedback("Invalid server.", true);
                return;
            }
            const payload = {
                id,
                alert_cpu_enabled: Boolean(cpuEnabled?.checked),
                alert_cpu_percent: Number(cpuPercent?.value || 80),
                alert_memory_enabled: Boolean(memoryEnabled?.checked),
                alert_memory_percent: Number(memoryPercent?.value || 80),
                alert_ping_enabled: Boolean(pingEnabled?.checked),
                alert_ping_seconds: Number(pingSeconds?.value || 180),
                alert_emails: selectedAlertEmails(),
            };
            saveBtn.disabled = true;
            cancelBtn.disabled = true;
            showFeedback("Saving…", false);
            try {
                const response = await fetch("/api/monitored-servers", {
                    method: "PATCH",
                    credentials: "same-origin",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    showFeedback(data.error || "Failed to save.", true);
                    return;
                }
                const server = data.server || {};
                if (cpuPercent) {
                    cpuPercent.value = server.alert_cpu_percent ?? payload.alert_cpu_percent;
                }
                if (cpuEnabled) cpuEnabled.checked = Boolean(server.alert_cpu_enabled);
                if (memoryPercent) {
                    memoryPercent.value =
                        server.alert_memory_percent ?? payload.alert_memory_percent;
                }
                if (memoryEnabled) {
                    memoryEnabled.checked = Boolean(server.alert_memory_enabled);
                }
                if (pingSeconds) {
                    const savedPing = Number(
                        server.alert_ping_seconds ?? payload.alert_ping_seconds,
                    );
                    pingSeconds.value = Number.isFinite(savedPing) ? savedPing : payload.alert_ping_seconds;
                }
                if (pingEnabled) pingEnabled.checked = Boolean(server.alert_ping_enabled);

                const savedEmails = Array.isArray(server.alert_emails)
                    ? server.alert_emails
                    : payload.alert_emails;
                const savedSet = new Set(savedEmails);
                alertRoot().querySelectorAll(".alert-email-check").forEach((input) => {
                    if (input.dataset.source === "extra") return;
                    input.checked = savedSet.has(String(input.value || "").toLowerCase());
                });
                const candidateSet = new Set(
                    Array.from(alertRoot().querySelectorAll(".alert-email-check"))
                        .filter((input) => input.dataset.source !== "extra")
                        .map((input) => String(input.value || "").toLowerCase()),
                );
                const extras = savedEmails
                    .filter((email) => !candidateSet.has(email))
                    .map((email) => ({ email, checked: true }));
                renderExtraList(extras, false);
                if (extraInput) extraInput.value = "";

                snapshot = takeSnapshot();
                setAlertEditing(false);
                showFeedback("Alert settings saved.", false);
            } catch (error) {
                console.error(error);
                showFeedback("Failed to save.", true);
            } finally {
                saveBtn.disabled = false;
                cancelBtn.disabled = false;
            }
        });
    }
})();
