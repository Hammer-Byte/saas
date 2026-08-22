(() => {
    const customerForm = document.getElementById("customer-detail-form");
    const customerAlert = document.getElementById("customer-alert");
    const deleteCustomerButton = document.getElementById("delete-customer-btn");
    const editCustomerButton = document.getElementById("edit-customer-btn");
    const saveCustomerButton = document.getElementById("save-customer-btn");
    const cancelEditCustomerButton = document.getElementById("cancel-edit-customer-btn");
    const projectForm = document.getElementById("customer-project-form");
    const projectFormAlert = document.getElementById("customer-project-form-alert");
    const openAddProjectButton = document.getElementById("open-add-customer-project-btn");

    document.querySelectorAll(".customer-project-row[data-href]").forEach((row) => {
        row.addEventListener("click", () => {
            window.location.href = row.dataset.href;
        });
        row.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                window.location.href = row.dataset.href;
            }
        });
    });

    if (!customerForm) {
        return;
    }

    const customerId = customerForm.dataset.customerId;
    const editableFields = ["full_name", "company", "pan_gst", "hsn", "address", "phones", "emails"];
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

    function parseContactLines(value) {
        return String(value || "")
            .split(/\n|,/)
            .map((entry) => entry.trim())
            .filter(Boolean);
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

        editCustomerButton?.classList.toggle("d-none", enabled);
        saveCustomerButton?.classList.toggle("d-none", !enabled);
        cancelEditCustomerButton?.classList.toggle("d-none", !enabled);

        if (enabled) {
            getField("full_name")?.focus();
        }
    }

    editCustomerButton?.addEventListener("click", () => {
        hideAlert(customerAlert);
        snapshot = readSnapshot();
        setEditing(true);
    });

    cancelEditCustomerButton?.addEventListener("click", () => {
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
            phones: parseContactLines(getField("phones")?.value),
            emails: parseContactLines(getField("emails")?.value),
        };
        const pan_gst = getField("pan_gst")?.value?.trim() || "";
        const hsn = getField("hsn")?.value?.trim() || "";
        if (pan_gst) payload.pan_gst = pan_gst;
        if (hsn) payload.hsn = hsn;

        if (!payload.full_name || !payload.company || !payload.address) {
            showAlert(customerAlert, "Please fill in full name, company, and address.", "danger");
            return;
        }

        if (saveCustomerButton) saveCustomerButton.disabled = true;

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
            if (saveCustomerButton) saveCustomerButton.disabled = false;
        }
    });

    deleteCustomerButton?.addEventListener("click", async () => {
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

    if (!projectForm) {
        return;
    }

    const projectTitleInput = projectForm.elements.namedItem("title");
    const projectDescriptionInput = projectForm.elements.namedItem("description");

    openAddProjectButton?.addEventListener("click", () => {
        hideAlert(projectFormAlert);
        projectForm.reset();
    });

    projectForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideAlert(projectFormAlert);

        const title = projectTitleInput.value.trim();
        const description = projectDescriptionInput.value.trim();

        if (!title) {
            showAlert(projectFormAlert, "Title is required.", "danger");
            return;
        }

        const payload = { title };
        if (description) payload.description = description;

        const submitButton = projectForm.querySelector('button[type="submit"]');
        if (submitButton) submitButton.disabled = true;

        try {
            const response = await fetch("/api/customer-projects", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    customer_id: Number(customerId),
                    ...payload,
                }),
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
            if (submitButton) submitButton.disabled = false;
        }
    });
})();
