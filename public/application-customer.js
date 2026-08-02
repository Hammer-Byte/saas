(() => {
    const form = document.getElementById("customer-form");
    const editBtn = document.getElementById("edit-customer-btn");
    const clearBtn = document.getElementById("clear-customer-btn");
    const actions = document.getElementById("customer-actions");
    const alertBox = document.getElementById("customer-alert");
    const emailsChips = document.getElementById("emails-chips");
    const phonesChips = document.getElementById("phones-chips");
    const emailInput = document.getElementById("email-input");
    const phoneInput = document.getElementById("phone-input");
    const addEmailBtn = document.getElementById("add-email-btn");
    const addPhoneBtn = document.getElementById("add-phone-btn");
    const fields = ["full_name", "company", "pan_gst", "hsn", "address"];

    if (!form || !editBtn || !clearBtn || !actions || !alertBox) {
        return;
    }

    const applicationId = form.dataset.applicationId;
    let editing = false;

    function chipValues(container) {
        return [...container.querySelectorAll("[data-value]")].map((el) => el.dataset.value);
    }

    function addChip(container, value) {
        const trimmed = value.trim();
        if (!trimmed) return;
        if (chipValues(container).includes(trimmed)) return;

        const chip = document.createElement("span");
        chip.className =
            "badge rounded-pill text-bg-secondary d-inline-flex align-items-center gap-1 py-2 px-3";
        chip.dataset.value = trimmed;
        chip.innerHTML = `
            <span></span>
            <button type="button" class="btn-close btn-close-white chip-remove ${editing ? "" : "d-none"}" aria-label="Remove" style="font-size: 0.55rem;"></button>
        `;
        chip.querySelector("span").textContent = trimmed;
        container.appendChild(chip);
    }

    function setEditable(editable) {
        editing = editable;

        fields.forEach((name) => {
            const field = form.elements.namedItem(name);
            if (field) {
                field.disabled = !editable;
            }
        });

        emailInput.disabled = !editable;
        phoneInput.disabled = !editable;
        addEmailBtn.disabled = !editable;
        addPhoneBtn.disabled = !editable;

        form.querySelectorAll(".chip-remove").forEach((btn) => {
            btn.classList.toggle("d-none", !editable);
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
        emailsChips.innerHTML = "";
        phonesChips.innerHTML = "";
        emailInput.value = "";
        phoneInput.value = "";
    });

    addEmailBtn.addEventListener("click", () => {
        addChip(emailsChips, emailInput.value);
        emailInput.value = "";
        emailInput.focus();
    });

    addPhoneBtn.addEventListener("click", () => {
        addChip(phonesChips, phoneInput.value);
        phoneInput.value = "";
        phoneInput.focus();
    });

    emailInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            addEmailBtn.click();
        }
    });

    phoneInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            addPhoneBtn.click();
        }
    });

    form.addEventListener("click", (event) => {
        const removeBtn = event.target.closest(".chip-remove");
        if (!removeBtn || !editing) return;
        removeBtn.closest("[data-value]")?.remove();
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
            emails: chipValues(emailsChips),
            phones: chipValues(phonesChips),
        };

        if (!payload.full_name || !payload.company || !payload.pan_gst || !payload.hsn || !payload.address) {
            showAlert("Please fill in all fields before saving.", "danger");
            return;
        }

        const saveBtn = document.getElementById("save-customer-btn");
        if (saveBtn) {
            saveBtn.disabled = true;
        }

        try {
            const response = await fetch(`/api/applications/${applicationId}/customer`, {
                method: "POST",
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

            emailsChips.innerHTML = "";
            (data.emails || []).forEach((email) => addChip(emailsChips, email));

            phonesChips.innerHTML = "";
            (data.phones || []).forEach((phone) => addChip(phonesChips, phone));

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
