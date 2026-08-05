(() => {
    const customerForm = document.getElementById("customer-detail-form");
    const customerAlert = document.getElementById("customer-alert");
    const deleteCustomerBtn = document.getElementById("delete-customer-btn");
    const editCustomerBtn = document.getElementById("edit-customer-btn");
    const saveCustomerBtn = document.getElementById("save-customer-btn");
    const cancelEditCustomerBtn = document.getElementById("cancel-edit-customer-btn");
    const projectForm = document.getElementById("customer-project-form");
    const projectFormAlert = document.getElementById("customer-project-form-alert");
    const projectModalEl = document.getElementById("customer-project-modal");
    const projectModalLabel = document.getElementById("customer-project-modal-label");
    const openAddProjectBtn = document.getElementById("open-add-customer-project-btn");
    const projectsTbody = document.getElementById("customer-projects-tbody");

    if (!customerForm) {
        return;
    }

    const customerId = customerForm.dataset.customerId;
    const editableFields = ["full_name", "company", "pan_gst", "hsn", "address"];
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
        return customerForm.elements.namedItem(name);
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
            if (field) field.readOnly = !enabled;
        }

        editCustomerBtn?.classList.toggle("d-none", enabled);
        saveCustomerBtn?.classList.toggle("d-none", !enabled);
        cancelEditCustomerBtn?.classList.toggle("d-none", !enabled);

        if (enabled) {
            getField("full_name")?.focus();
        }
    }

    editCustomerBtn?.addEventListener("click", () => {
        hideAlert(customerAlert);
        snapshot = readSnapshot();
        setEditing(true);
    });

    cancelEditCustomerBtn?.addEventListener("click", () => {
        hideAlert(customerAlert);
        if (snapshot) applySnapshot(snapshot);
        setEditing(false);
    });

    customerForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideAlert(customerAlert);

        const payload = {
            id: Number(customerId),
            full_name: getField("full_name")?.value?.trim() || "",
            company: getField("company")?.value?.trim() || "",
            address: getField("address")?.value?.trim() || "",
        };
        const pan_gst = getField("pan_gst")?.value?.trim() || "";
        const hsn = getField("hsn")?.value?.trim() || "";
        if (pan_gst) payload.pan_gst = pan_gst;
        if (hsn) payload.hsn = hsn;

        if (!payload.full_name || !payload.company || !payload.address) {
            showAlert(customerAlert, "Please fill in full name, company, and address.", "danger");
            return;
        }

        if (saveCustomerBtn) saveCustomerBtn.disabled = true;

        try {
            const response = await fetch("/api/customers", {
                method: "PATCH",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                showAlert(customerAlert, data.error || "Failed to update customer.", "danger");
                return;
            }

            snapshot = readSnapshot();
            setEditing(false);
            showAlert(customerAlert, "Customer updated.", "success");
        } catch (error) {
            console.error(error);
            showAlert(customerAlert, "Failed to update customer.", "danger");
        } finally {
            if (saveCustomerBtn) saveCustomerBtn.disabled = false;
        }
    });

    deleteCustomerBtn?.addEventListener("click", async () => {
        if (!window.confirm("Delete this customer?")) {
            return;
        }

        try {
            const response = await fetch(`/api/customers/${customerId}`, {
                method: "DELETE",
                credentials: "same-origin",
            });

            if (!response.ok && response.status !== 204) {
                const data = await response.json().catch(() => ({}));
                showAlert(customerAlert, data.error || "Failed to delete customer.", "danger");
                return;
            }

            window.location.href = "/app/customers";
        } catch (error) {
            console.error(error);
            showAlert(customerAlert, "Failed to delete customer.", "danger");
        }
    });

    if (!projectForm || !projectsTbody) {
        return;
    }

    const projectIdInput = projectForm.elements.namedItem("id");
    const projectTitleInput = projectForm.elements.namedItem("title");
    const projectDescriptionInput = projectForm.elements.namedItem("description");

    function openAddProjectModal() {
        hideAlert(projectFormAlert);
        projectModalLabel.textContent = "Add project";
        projectIdInput.value = "";
        projectForm.reset();
    }

    function openEditProjectModal(row) {
        hideAlert(projectFormAlert);
        projectModalLabel.textContent = "Edit project";
        projectIdInput.value = row.dataset.id || "";
        projectTitleInput.value = row.dataset.title || "";
        projectDescriptionInput.value = row.dataset.description || "";
    }

    openAddProjectBtn?.addEventListener("click", openAddProjectModal);

    projectsTbody.addEventListener("click", async (event) => {
        const row = event.target.closest("tr[data-id]");
        if (!row) return;

        if (event.target.closest(".customer-project-edit-btn")) {
            openEditProjectModal(row);
            const modal = window.bootstrap?.Modal?.getOrCreateInstance(projectModalEl);
            modal?.show();
            return;
        }

        if (event.target.closest(".customer-project-delete-btn")) {
            if (!window.confirm("Delete this project?")) {
                return;
            }

            try {
                const response = await fetch(
                    `/api/customers/${customerId}/projects/${row.dataset.id}`,
                    {
                        method: "DELETE",
                        credentials: "same-origin",
                    },
                );

                if (!response.ok && response.status !== 204) {
                    const data = await response.json().catch(() => ({}));
                    showAlert(customerAlert, data.error || "Failed to delete project.", "danger");
                    return;
                }

                window.location.reload();
            } catch (error) {
                console.error(error);
                showAlert(customerAlert, "Failed to delete project.", "danger");
            }
        }
    });

    projectForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideAlert(projectFormAlert);

        const id = projectIdInput.value ? Number(projectIdInput.value) : null;
        const title = projectTitleInput.value.trim();
        const description = projectDescriptionInput.value.trim();

        if (!title) {
            showAlert(projectFormAlert, "Title is required.", "danger");
            return;
        }

        const payload = { title };
        if (description) payload.description = description;

        const submitBtn = projectForm.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;

        try {
            const response = await fetch(`/api/customers/${customerId}/projects`, {
                method: id ? "PATCH" : "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(id ? { id, ...payload } : payload),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                showAlert(projectFormAlert, data.error || "Failed to save project.", "danger");
                return;
            }

            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert(projectFormAlert, "Failed to save project.", "danger");
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    });
})();
