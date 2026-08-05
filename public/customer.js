(() => {
    const customerForm = document.getElementById("customer-detail-form");
    const customerAlert = document.getElementById("customer-alert");
    const deleteCustomerBtn = document.getElementById("delete-customer-btn");
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

    customerForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideAlert(customerAlert);

        const payload = {
            id: Number(customerId),
            full_name: customerForm.elements.namedItem("full_name")?.value?.trim() || "",
            company: customerForm.elements.namedItem("company")?.value?.trim() || "",
            address: customerForm.elements.namedItem("address")?.value?.trim() || "",
        };
        const pan_gst = customerForm.elements.namedItem("pan_gst")?.value?.trim() || "";
        const hsn = customerForm.elements.namedItem("hsn")?.value?.trim() || "";
        if (pan_gst) payload.pan_gst = pan_gst;
        if (hsn) payload.hsn = hsn;

        if (!payload.full_name || !payload.company || !payload.address) {
            showAlert(customerAlert, "Please fill in full name, company, and address.", "danger");
            return;
        }

        const submitBtn = customerForm.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;

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

            showAlert(customerAlert, "Customer updated.", "success");
        } catch (error) {
            console.error(error);
            showAlert(customerAlert, "Failed to update customer.", "danger");
        } finally {
            if (submitBtn) submitBtn.disabled = false;
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
    const projectSelect = projectForm.elements.namedItem("project_id");
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
        projectSelect.value = row.dataset.projectId || "";
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
            if (!window.confirm("Remove this project from the customer?")) {
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
                    showAlert(customerAlert, data.error || "Failed to remove project.", "danger");
                    return;
                }

                window.location.reload();
            } catch (error) {
                console.error(error);
                showAlert(customerAlert, "Failed to remove project.", "danger");
            }
        }
    });

    projectForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideAlert(projectFormAlert);

        const id = projectIdInput.value ? Number(projectIdInput.value) : null;
        const payload = {
            project_id: Number(projectSelect.value),
            description: projectDescriptionInput.value.trim(),
        };

        if (!payload.project_id) {
            showAlert(projectFormAlert, "Please select a project.", "danger");
            return;
        }

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
                showAlert(projectFormAlert, data.error || "Failed to save project link.", "danger");
                return;
            }

            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert(projectFormAlert, "Failed to save project link.", "danger");
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    });
})();
