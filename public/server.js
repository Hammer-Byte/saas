(() => {
    const card = document.getElementById("server-alerts-card");
    const feedback = document.getElementById("server-alert-feedback");
    const editBtn = document.getElementById("server-alerts-edit-btn");
    const cancelBtn = document.getElementById("server-alerts-cancel-btn");
    const saveBtn = document.getElementById("server-alerts-save-btn");

    const nameInput = document.getElementById("server-alert-name");
    const cpuPercent = document.getElementById("alert-cpu-percent");
    const cpuEnabled = document.getElementById("alert-cpu-enabled");
    const memoryPercent = document.getElementById("alert-memory-percent");
    const memoryEnabled = document.getElementById("alert-memory-enabled");
    const pingSeconds = document.getElementById("alert-ping-seconds");
    const pingEnabled = document.getElementById("alert-ping-enabled");

    if (!card || !editBtn || !saveBtn || !cancelBtn) {
        return;
    }

    const fields = [
        nameInput,
        cpuPercent,
        cpuEnabled,
        memoryPercent,
        memoryEnabled,
        pingSeconds,
        pingEnabled,
    ].filter(Boolean);

    let snapshot = null;

    function showFeedback(message, isError) {
        if (!feedback) return;
        feedback.textContent = message;
        feedback.className = `small mt-2 ${isError ? "text-danger" : "text-secondary"}`;
        feedback.classList.remove("d-none");
    }

    function takeSnapshot() {
        snapshot = {
            name: nameInput?.value || "",
            alert_cpu_percent: cpuPercent?.value || "80",
            alert_cpu_enabled: Boolean(cpuEnabled?.checked),
            alert_memory_percent: memoryPercent?.value || "80",
            alert_memory_enabled: Boolean(memoryEnabled?.checked),
            alert_ping_seconds: pingSeconds?.value || "180",
            alert_ping_enabled: Boolean(pingEnabled?.checked),
        };
    }

    function restoreSnapshot() {
        if (!snapshot) return;
        if (nameInput) nameInput.value = snapshot.name;
        if (cpuPercent) cpuPercent.value = snapshot.alert_cpu_percent;
        if (cpuEnabled) cpuEnabled.checked = snapshot.alert_cpu_enabled;
        if (memoryPercent) memoryPercent.value = snapshot.alert_memory_percent;
        if (memoryEnabled) memoryEnabled.checked = snapshot.alert_memory_enabled;
        if (pingSeconds) pingSeconds.value = snapshot.alert_ping_seconds;
        if (pingEnabled) pingEnabled.checked = snapshot.alert_ping_enabled;
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
        takeSnapshot();
        setEditing(true);
        showFeedback("Editing alert settings…", false);
    });

    cancelBtn.addEventListener("click", () => {
        restoreSnapshot();
        setEditing(false);
        showFeedback("Changes discarded.", false);
    });

    saveBtn.addEventListener("click", async () => {
        const id = Number(card.dataset.serverId || 0);
        if (!id) {
            showFeedback("Invalid server.", true);
            return;
        }

        const payload = {
            id,
            name: (nameInput?.value || "").trim(),
            alert_cpu_enabled: Boolean(cpuEnabled?.checked),
            alert_cpu_percent: Number(cpuPercent?.value || 80),
            alert_memory_enabled: Boolean(memoryEnabled?.checked),
            alert_memory_percent: Number(memoryPercent?.value || 80),
            alert_ping_enabled: Boolean(pingEnabled?.checked),
            alert_ping_seconds: Number(pingSeconds?.value || 180),
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
                showFeedback(data.error || "Failed to save alert settings.", true);
                return;
            }

            const server = data.server || {};
            if (nameInput) nameInput.value = server.name || "";
            if (cpuPercent) cpuPercent.value = server.alert_cpu_percent ?? payload.alert_cpu_percent;
            if (cpuEnabled) cpuEnabled.checked = Boolean(server.alert_cpu_enabled);
            if (memoryPercent) {
                memoryPercent.value = server.alert_memory_percent ?? payload.alert_memory_percent;
            }
            if (memoryEnabled) memoryEnabled.checked = Boolean(server.alert_memory_enabled);
            if (pingSeconds) {
                pingSeconds.value = server.alert_ping_seconds ?? payload.alert_ping_seconds;
            }
            if (pingEnabled) pingEnabled.checked = Boolean(server.alert_ping_enabled);

            takeSnapshot();
            setEditing(false);
            showFeedback("Alert settings saved.", false);

            const title = document.querySelector("main h1.h3");
            if (title) {
                title.textContent = server.name || "Unnamed server";
            }
        } catch (error) {
            console.error(error);
            showFeedback("Failed to save alert settings.", true);
        } finally {
            saveBtn.disabled = false;
            cancelBtn.disabled = false;
        }
    });
})();
