(() => {
    const form = document.getElementById("customer-form");
    const editBtn = document.getElementById("edit-customer-btn");
    const clearBtn = document.getElementById("clear-customer-btn");
    const actions = document.getElementById("customer-actions");
    const alertBox = document.getElementById("customer-alert");
    const fields = ["full_name", "company", "pan_gst", "hsn", "address"];

    if (!form || !editBtn || !clearBtn || !actions || !alertBox) {
        return;
    }

    const applicationId = form.dataset.applicationId;

    function setEditable(editable) {
        fields.forEach((name) => {
            const field = form.elements.namedItem(name);
            if (field) {
                field.disabled = !editable;
            }
        });

        actions.classList.toggle("d-none", !editable);
        editBtn.classList.toggle("d-none", editable);
    }

    function showAlert(message, type) {
        alertBox.textContent = message;
        alertBox.className = `alert alert-${type}`;
        alertBox.classList.remove("d-none");
    }

    function hideAlert() {
        alertBox.classList.add("d-none");
        alertBox.textContent = "";
    }

    editBtn.addEventListener("click", () => {
        hideAlert();
        setEditable(true);
        form.elements.namedItem("full_name")?.focus();
    });

    clearBtn.addEventListener("click", () => {
        hideAlert();
        fields.forEach((name) => {
            const field = form.elements.namedItem(name);
            if (field) {
                field.value = "";
            }
        });
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideAlert();

        const payload = {
            full_name: form.elements.namedItem("full_name")?.value?.trim() || "",
            company: form.elements.namedItem("company")?.value?.trim() || "",
            pan_gst: form.elements.namedItem("pan_gst")?.value?.trim() || "",
            hsn: form.elements.namedItem("hsn")?.value?.trim() || "",
            address: form.elements.namedItem("address")?.value?.trim() || "",
        };

        if (Object.values(payload).some((value) => !value)) {
            showAlert("Please fill in all fields before saving.", "danger");
            return;
        }

        const saveBtn = document.getElementById("save-customer-btn");
        if (saveBtn) {
            saveBtn.disabled = true;
        }

        try {
            const response = await fetch(`/api/applications/${applicationId}/customer`, {
                method: "PUT",
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                showAlert(data.error || "Failed to save customer.", "danger");
                return;
            }

            fields.forEach((name) => {
                const field = form.elements.namedItem(name);
                if (field && data.customer?.[name] != null) {
                    field.value = data.customer[name];
                }
            });

            setEditable(false);
            showAlert("Customer saved successfully.", "success");
        } catch (error) {
            console.error(error);
            showAlert("Failed to save customer.", "danger");
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
            }
        }
    });
})();
