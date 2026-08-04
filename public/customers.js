(() => {
    const form = document.getElementById("customer-form");
    const formAlert = document.getElementById("customer-form-alert");
    const pageAlert = document.getElementById("customers-alert");

    if (!form) {
        return;
    }

    function showAlert(target, message, type) {
        if (!target) return;
        target.textContent = message;
        target.className = `alert alert-${type}`;
        target.classList.remove("d-none");
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        formAlert?.classList.add("d-none");

        const payload = {
            full_name: form.elements.namedItem("full_name")?.value?.trim() || "",
            company: form.elements.namedItem("company")?.value?.trim() || "",
            pan_gst: form.elements.namedItem("pan_gst")?.value?.trim() || "",
            hsn: form.elements.namedItem("hsn")?.value?.trim() || "",
            address: form.elements.namedItem("address")?.value?.trim() || "",
        };

        if (!payload.full_name || !payload.company || !payload.address) {
            showAlert(formAlert, "Please fill in full name, company, and address.", "danger");
            return;
        }

        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;

        try {
            const response = await fetch("/api/customers", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                showAlert(formAlert, data.error || "Failed to add customer.", "danger");
                return;
            }

            if (data.customer?.id) {
                window.location.href = `/app/customers/${data.customer.id}`;
                return;
            }

            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert(formAlert, "Failed to add customer.", "danger");
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    });
})();
