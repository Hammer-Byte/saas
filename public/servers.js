(() => {
    const pageAlert = document.getElementById("servers-alert");
    const selectAll = document.getElementById("select-all-servers");
    const deleteLogsButton = document.getElementById("delete-logs-btn");
    const renameForm = document.getElementById("rename-form");
    const renameFormAlert = document.getElementById("rename-form-alert");
    const renameModalElement = document.getElementById("rename-modal");
    const renameIdInput = document.getElementById("rename-id");
    const renameNameInput = document.getElementById("rename-name");
    const renameTagLabel = document.getElementById("rename-tag-label");
    const editServerForm = document.getElementById("edit-server-form");
    const editServerFormAlert = document.getElementById("edit-server-form-alert");
    const editServerModalElement = document.getElementById("edit-server-modal");
    const editServerIdInput = document.getElementById("edit-server-id");
    const editServerProjectIdSelect = document.getElementById("edit-server-project-id");
    const editServerTagLabel = document.getElementById("edit-server-tag-label");
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

    document.querySelectorAll(".server-edit-btn").forEach((button) => {
        button.addEventListener("click", () => {
            hideAlert(editServerFormAlert);
            if (editServerIdInput) editServerIdInput.value = button.dataset.id || "";
            if (editServerTagLabel) editServerTagLabel.textContent = `Tag: ${button.dataset.tag || ""}`;
            if (editServerProjectIdSelect) {
                editServerProjectIdSelect.value = button.dataset.projectId || "";
            }
            const modal = bootstrap.Modal.getOrCreateInstance(editServerModalElement);
            modal.show();
        });
    });

    editServerForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideAlert(editServerFormAlert);

        const id = Number(editServerIdInput?.value || 0);
        if (!id) {
            showAlert(editServerFormAlert, "Invalid server.", "danger");
            return;
        }

        const projectValue = editServerProjectIdSelect?.value || "";
        const project_id = projectValue ? Number(projectValue) : null;

        try {
            const response = await fetch("/api/monitored-servers", {
                method: "PATCH",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, project_id }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showAlert(editServerFormAlert, data.error || "Failed to update server.", "danger");
                return;
            }
            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert(editServerFormAlert, "Failed to update server.", "danger");
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
            const from = getWritableDate(
                "YYYY-MM-DD",
                document.getElementById("delete-from")?.value || "",
            );
            const to = getWritableDate(
                "YYYY-MM-DD",
                document.getElementById("delete-to")?.value || "",
            );
            if (!from || !to) {
                showAlert(
                    deleteLogsFormAlert,
                    "From and to dates are required (dd/mm/yyyy).",
                    "danger",
                );
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
