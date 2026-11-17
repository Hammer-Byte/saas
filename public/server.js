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

    document.addEventListener("click", async (event) => {
        const button = event.target.closest(".sync-run-copy-btn");
        if (!button) {
            return;
        }
        const details = button.closest("details");
        const textEl = details?.querySelector(".sync-run-copy-text");
        const statusEl = details?.querySelector(".sync-run-copy-status");
        const text = textEl?.textContent || "";
        if (!text) {
            return;
        }
        try {
            await navigator.clipboard.writeText(text);
            if (statusEl) {
                statusEl.textContent = "Copied";
                statusEl.classList.remove("d-none");
                window.setTimeout(() => statusEl.classList.add("d-none"), 2000);
            }
        } catch (error) {
            console.error(error);
            if (statusEl) {
                statusEl.textContent = "Copy failed";
                statusEl.classList.remove("d-none");
            }
        }
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

})();
