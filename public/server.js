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

    bindEditor({
        card: document.getElementById("server-alerts-card"),
        feedback: document.getElementById("server-alert-feedback"),
        editBtn: document.getElementById("server-alerts-edit-btn"),
        cancelBtn: document.getElementById("server-alerts-cancel-btn"),
        saveBtn: document.getElementById("server-alerts-save-btn"),
        fields: [
            cpuPercent,
            cpuEnabled,
            memoryPercent,
            memoryEnabled,
            pingSeconds,
            pingEnabled,
        ].filter(Boolean),
        takeSnapshot: () => ({
            alert_cpu_percent: cpuPercent?.value || "80",
            alert_cpu_enabled: Boolean(cpuEnabled?.checked),
            alert_memory_percent: memoryPercent?.value || "80",
            alert_memory_enabled: Boolean(memoryEnabled?.checked),
            alert_ping_seconds: pingSeconds?.value || "180",
            alert_ping_enabled: Boolean(pingEnabled?.checked),
        }),
        restoreSnapshot: (snapshot) => {
            if (!snapshot) return;
            if (cpuPercent) cpuPercent.value = snapshot.alert_cpu_percent;
            if (cpuEnabled) cpuEnabled.checked = snapshot.alert_cpu_enabled;
            if (memoryPercent) memoryPercent.value = snapshot.alert_memory_percent;
            if (memoryEnabled) memoryEnabled.checked = snapshot.alert_memory_enabled;
            if (pingSeconds) pingSeconds.value = snapshot.alert_ping_seconds;
            if (pingEnabled) pingEnabled.checked = snapshot.alert_ping_enabled;
        },
        buildPayload: (id) => ({
            id,
            alert_cpu_enabled: Boolean(cpuEnabled?.checked),
            alert_cpu_percent: Number(cpuPercent?.value || 80),
            alert_memory_enabled: Boolean(memoryEnabled?.checked),
            alert_memory_percent: Number(memoryPercent?.value || 80),
            alert_ping_enabled: Boolean(pingEnabled?.checked),
            alert_ping_seconds: Number(pingSeconds?.value || 180),
        }),
        applyServer: (server, payload) => {
            if (cpuPercent) {
                cpuPercent.value = server.alert_cpu_percent ?? payload.alert_cpu_percent;
            }
            if (cpuEnabled) cpuEnabled.checked = Boolean(server.alert_cpu_enabled);
            if (memoryPercent) {
                memoryPercent.value = server.alert_memory_percent ?? payload.alert_memory_percent;
            }
            if (memoryEnabled) {
                memoryEnabled.checked = Boolean(server.alert_memory_enabled);
            }
            if (pingSeconds) {
                pingSeconds.value = server.alert_ping_seconds ?? payload.alert_ping_seconds;
            }
            if (pingEnabled) pingEnabled.checked = Boolean(server.alert_ping_enabled);
        },
        editingLabel: "Editing alert settings…",
        savedLabel: "Alert settings saved.",
    });
})();
