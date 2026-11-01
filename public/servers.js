(() => {
    const pageAlert = document.getElementById("servers-alert");
    const selectAll = document.getElementById("select-all-servers");
    const deleteLogsButton = document.getElementById("delete-logs-btn");
    const releaseForm = document.getElementById("release-form");
    const releaseFormAlert = document.getElementById("release-form-alert");
    const releaseModalElement = document.getElementById("release-modal");
    const releaseKindInput = document.getElementById("release-kind");
    const releaseModalLabel = document.getElementById("release-modal-label");
    const renameForm = document.getElementById("rename-form");
    const renameFormAlert = document.getElementById("rename-form-alert");
    const renameModalElement = document.getElementById("rename-modal");
    const renameIdInput = document.getElementById("rename-id");
    const renameNameInput = document.getElementById("rename-name");
    const renameTagLabel = document.getElementById("rename-tag-label");
    const deleteLogsForm = document.getElementById("delete-logs-form");
    const deleteLogsFormAlert = document.getElementById("delete-logs-form-alert");
    const deleteLogsModalElement = document.getElementById("delete-logs-modal");
    const deleteLogsSelectionLabel = document.getElementById("delete-logs-selection-label");
    const deleteRangeFields = document.getElementById("delete-range-fields");
    const deleteModeAll = document.getElementById("delete-mode-all");
    const deleteModeRange = document.getElementById("delete-mode-range");

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

    function selectedServerIds() {
        return Array.from(document.querySelectorAll(".server-select:checked")).map((input) =>
            Number(input.value),
        );
    }

    function syncDeleteButton() {
        if (!deleteLogsButton) return;
        deleteLogsButton.disabled = selectedServerIds().length === 0;
    }

    selectAll?.addEventListener("change", () => {
        document.querySelectorAll(".server-select").forEach((input) => {
            input.checked = selectAll.checked;
        });
        syncDeleteButton();
    });

    document.querySelectorAll(".server-select").forEach((input) => {
        input.addEventListener("change", () => {
            if (selectAll && !input.checked) {
                selectAll.checked = false;
            }
            syncDeleteButton();
        });
    });

    releaseModalElement?.addEventListener("show.bs.modal", (event) => {
        hideAlert(releaseFormAlert);
        releaseForm?.reset();
        const trigger = event.relatedTarget;
        const kind = trigger?.getAttribute("data-kind") || "agent";
        if (releaseKindInput) releaseKindInput.value = kind;
        if (releaseModalLabel) {
            releaseModalLabel.textContent =
                kind === "supervisor" ? "Upload supervisor.exe" : "Upload agent.exe";
        }
    });

    releaseForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideAlert(releaseFormAlert);

        const kind = releaseKindInput?.value || "agent";
        const version = document.getElementById("release-version")?.value?.trim() || "";
        const fileInput = document.getElementById("release-file");
        const file = fileInput?.files?.[0];

        if (!version || !file) {
            showAlert(releaseFormAlert, "Version and EXE file are required.", "danger");
            return;
        }

        const formData = new FormData();
        formData.append("kind", kind);
        formData.append("version", version);
        formData.append("file", file);

        const submitButton = document.getElementById("release-submit-btn");
        if (submitButton) submitButton.disabled = true;

        try {
            const response = await fetch("/api/server-monitor-releases", {
                method: "POST",
                credentials: "same-origin",
                body: formData,
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showAlert(releaseFormAlert, data.error || "Failed to publish release.", "danger");
                return;
            }
            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert(releaseFormAlert, "Failed to publish release.", "danger");
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    });

    document.querySelectorAll(".server-rename-btn").forEach((button) => {
        button.addEventListener("click", () => {
            hideAlert(renameFormAlert);
            if (renameIdInput) renameIdInput.value = button.dataset.id || "";
            if (renameNameInput) renameNameInput.value = button.dataset.name || "";
            if (renameTagLabel) renameTagLabel.textContent = `Tag: ${button.dataset.tag || ""}`;
            const modal = bootstrap.Modal.getOrCreateInstance(renameModalElement);
            modal.show();
        });
    });

    renameForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideAlert(renameFormAlert);

        const id = Number(renameIdInput?.value || 0);
        const name = renameNameInput?.value?.trim() || "";
        if (!id) {
            showAlert(renameFormAlert, "Invalid server.", "danger");
            return;
        }

        try {
            const response = await fetch("/api/monitored-servers", {
                method: "PATCH",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, name }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showAlert(renameFormAlert, data.error || "Failed to update name.", "danger");
                return;
            }
            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert(renameFormAlert, "Failed to update name.", "danger");
        }
    });

    function syncDeleteModeFields() {
        const isRange = deleteModeRange?.checked;
        deleteRangeFields?.classList.toggle("d-none", !isRange);
    }

    deleteModeAll?.addEventListener("change", syncDeleteModeFields);
    deleteModeRange?.addEventListener("change", syncDeleteModeFields);

    deleteLogsButton?.addEventListener("click", () => {
        const ids = selectedServerIds();
        if (!ids.length) return;
        hideAlert(deleteLogsFormAlert);
        deleteLogsForm?.reset();
        if (deleteModeAll) deleteModeAll.checked = true;
        syncDeleteModeFields();
        if (deleteLogsSelectionLabel) {
            deleteLogsSelectionLabel.textContent = `${ids.length} server(s) selected.`;
        }
        const modal = bootstrap.Modal.getOrCreateInstance(deleteLogsModalElement);
        modal.show();
    });

    deleteLogsForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideAlert(deleteLogsFormAlert);

        const serverIds = selectedServerIds();
        if (!serverIds.length) {
            showAlert(deleteLogsFormAlert, "Select at least one server.", "danger");
            return;
        }

        const mode = deleteModeRange?.checked ? "range" : "all";
        const payload = { server_ids: serverIds, mode };

        if (mode === "range") {
            const from = document.getElementById("delete-from")?.value || "";
            const to = document.getElementById("delete-to")?.value || "";
            if (!from || !to) {
                showAlert(deleteLogsFormAlert, "From and to dates are required.", "danger");
                return;
            }
            payload.from = from;
            payload.to = to;
        }

        const confirmed = await showConfirm({
            title: "Delete logs?",
            description:
                mode === "all"
                    ? `Delete all metrics logs for ${serverIds.length} selected server(s)?`
                    : `Delete metrics logs in the selected date range for ${serverIds.length} server(s)?`,
            choices: [
                { label: "Cancel", variant: "secondary", value: false },
                { label: "Delete", variant: "danger", value: true },
            ],
        });

        if (!confirmed) return;

        try {
            const response = await fetch("/api/server-metrics", {
                method: "DELETE",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showAlert(deleteLogsFormAlert, data.error || "Failed to delete logs.", "danger");
                return;
            }
            showAlert(pageAlert, data.message || "Logs deleted.", "success");
            bootstrap.Modal.getOrCreateInstance(deleteLogsModalElement).hide();
        } catch (error) {
            console.error(error);
            showAlert(deleteLogsFormAlert, "Failed to delete logs.", "danger");
        }
    });

    syncDeleteButton();
})();
