(() => {
    const form = document.getElementById("server-form");
    const formAlert = document.getElementById("server-form-alert");
    const pageAlert = document.getElementById("servers-alert");
    const modalElement = document.getElementById("server-modal");
    const modalLabel = document.getElementById("server-modal-label");
    const openAddButton = document.getElementById("open-add-server-btn");
    const tableBody = document.getElementById("servers-tbody");
    const readonlyHint = document.getElementById("server-readonly-hint");

    if (!form || !tableBody) {
        return;
    }

    const idInput = form.elements.namedItem("id");
    const nameInput = form.elements.namedItem("name");
    const locationInput = form.elements.namedItem("location");
    const projectIdInput = form.elements.namedItem("project_id");
    const notesInput = form.elements.namedItem("notes");
    const activeInput = form.elements.namedItem("active");

    function resetForm() {
        form.reset();
        idInput.value = "";
        activeInput.checked = true;
        hideAlert(formAlert);
        if (readonlyHint) {
            readonlyHint.textContent = "Tag and OTP are generated automatically on create.";
        }
    }

    function openAddModal() {
        resetForm();
        modalLabel.textContent = "Add server";
    }

    function openEditModal(row) {
        hideAlert(formAlert);
        modalLabel.textContent = "Edit server";
        idInput.value = row.dataset.id || "";
        nameInput.value = row.dataset.name || "";
        locationInput.value = row.dataset.location || "";
        projectIdInput.value = row.dataset.projectId || "";
        notesInput.value = row.dataset.notes || "";
        activeInput.checked = row.dataset.active === "1";
        if (readonlyHint) {
            readonlyHint.textContent = `Tag ${row.dataset.tag || ""} is read-only. OTP ${row.dataset.otp || ""}.`;
        }
    }

    openAddButton?.addEventListener("click", openAddModal);

    tableBody.addEventListener("click", async (event) => {
        const row = event.target.closest("tr[data-id]");
        if (!row) return;

        if (event.target.closest(".server-edit-btn")) {
            openEditModal(row);
            const modal = window.bootstrap?.Modal?.getOrCreateInstance(modalElement);
            modal?.show();
            return;
        }

        if (event.target.closest(".server-delete-btn")) {
            const confirmed = await showConfirm({
                title: "Delete server?",
                description: "This cannot be undone.",
                choices: [
                    { label: "Cancel", variant: "secondary", value: false },
                    { label: "Delete", variant: "danger", value: true },
                ],
            });
            if (!confirmed) {
                return;
            }

            hideAlert(pageAlert);
            try {
                const response = await fetch(`/api/monitored-servers/${row.dataset.id}`, {
                    method: "DELETE",
                    credentials: "same-origin",
                });

                if (!response.ok && response.status !== 204) {
                    const data = await response.json().catch(() => ({}));
                    showAlert(pageAlert, data.error || "Failed to delete server.", "danger");
                    return;
                }

                window.location.reload();
            } catch (error) {
                console.error(error);
                showAlert(pageAlert, "Failed to delete server.", "danger");
            }
        }
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideAlert(formAlert);

        const id = idInput.value ? Number(idInput.value) : null;
        const projectValue = projectIdInput.value.trim();
        const payload = {
            name: nameInput.value.trim(),
            location: locationInput.value.trim(),
            project_id: projectValue ? Number(projectValue) : null,
            notes: notesInput.value.trim() || null,
            active: activeInput.checked,
        };

        if (!payload.name || !payload.location) {
            showAlert(formAlert, "Please fill in name and location.", "danger");
            return;
        }

        const submitButton = document.getElementById("server-submit-btn");
        if (submitButton) submitButton.disabled = true;

        try {
            const response = await fetch("/api/monitored-servers", {
                method: id ? "PATCH" : "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(id ? { id, ...payload } : payload),
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                showAlert(formAlert, data.error || "Failed to save server.", "danger");
                return;
            }

            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert(formAlert, "Failed to save server.", "danger");
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    });

    const __hbTable = document.getElementById("servers-table");
    if (__hbTable?.tBodies?.[0]) {
        bindClientSearch({
            input: "#servers-search",
            rows: "#servers-table tbody tr",
            emptyElement: "#servers-empty",
            tableWrap: "#servers-table-wrap",
        });
        bindSortableHeaders({
            table: __hbTable,
            getValue(row, sortKey) {
                if (sortKey === "active" || sortKey === "tagMapped") return Number(row.dataset[sortKey] || row.dataset.active || 0); return row.dataset[sortKey] ?? row.textContent;
            },
        });
    }

})();
