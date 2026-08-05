(() => {
    const form = document.getElementById("customer-project-detail-form");
    const alertBox = document.getElementById("customer-project-alert");
    const editBtn = document.getElementById("edit-project-btn");
    const saveBtn = document.getElementById("save-project-btn");
    const cancelBtn = document.getElementById("cancel-edit-project-btn");
    const deleteBtn = document.getElementById("delete-project-btn");
    const addAppForm = document.getElementById("add-application-form");
    const addAppAlert = document.getElementById("add-application-alert");

    if (!form) {
        return;
    }

    const customerId = form.dataset.customerId;
    const projectId = form.dataset.projectId;
    const editableFields = ["title", "description"];
    let snapshot = null;

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

    function getField(name) {
        return form.elements.namedItem(name);
    }

    function readSnapshot() {
        const values = {};
        for (const name of editableFields) {
            values[name] = getField(name)?.value ?? "";
        }
        return values;
    }

    function applySnapshot(values) {
        for (const name of editableFields) {
            const field = getField(name);
            if (field) field.value = values[name] ?? "";
        }
    }

    function setEditing(enabled) {
        for (const name of editableFields) {
            const field = getField(name);
            if (field) field.disabled = !enabled;
        }
        editBtn?.classList.toggle("d-none", enabled);
        saveBtn?.classList.toggle("d-none", !enabled);
        cancelBtn?.classList.toggle("d-none", !enabled);
        if (enabled) getField("title")?.focus();
    }

    editBtn?.addEventListener("click", () => {
        hideAlert(alertBox);
        snapshot = readSnapshot();
        setEditing(true);
    });

    cancelBtn?.addEventListener("click", () => {
        hideAlert(alertBox);
        if (snapshot) applySnapshot(snapshot);
        setEditing(false);
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideAlert(alertBox);

        const title = getField("title")?.value?.trim() || "";
        const description = getField("description")?.value?.trim() || "";

        if (!title) {
            showAlert(alertBox, "Title is required.", "danger");
            return;
        }

        const payload = { id: Number(projectId), title };
        if (description) payload.description = description;

        if (saveBtn) saveBtn.disabled = true;

        try {
            const response = await fetch(`/api/customers/${customerId}/projects`, {
                method: "PATCH",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                showAlert(alertBox, data.error || "Failed to update project.", "danger");
                return;
            }

            snapshot = readSnapshot();
            setEditing(false);
            showAlert(alertBox, "Project updated.", "success");
        } catch (error) {
            console.error(error);
            showAlert(alertBox, "Failed to update project.", "danger");
        } finally {
            if (saveBtn) saveBtn.disabled = false;
        }
    });

    deleteBtn?.addEventListener("click", async () => {
        if (!window.confirm("Delete this project?")) {
            return;
        }

        try {
            const response = await fetch(`/api/customers/${customerId}/projects/${projectId}`, {
                method: "DELETE",
                credentials: "same-origin",
            });

            if (!response.ok && response.status !== 204) {
                const data = await response.json().catch(() => ({}));
                showAlert(alertBox, data.error || "Failed to delete project.", "danger");
                return;
            }

            window.location.href = `/app/customers/${customerId}`;
        } catch (error) {
            console.error(error);
            showAlert(alertBox, "Failed to delete project.", "danger");
        }
    });

    addAppForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideAlert(addAppAlert);

        const title = addAppForm.elements.namedItem("title")?.value?.trim() || "";
        const active = addAppForm.elements.namedItem("active")?.value === "true";

        if (!title) {
            showAlert(addAppAlert, "Title is required.", "danger");
            return;
        }

        const submitBtn = addAppForm.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;

        try {
            const response = await fetch("/api/project-applications", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title,
                    active,
                    project_id: Number(addAppForm.dataset.projectId),
                }),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                showAlert(addAppAlert, data.error || "Failed to add application.", "danger");
                return;
            }

            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert(addAppAlert, "Failed to add application.", "danger");
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    });
})();
