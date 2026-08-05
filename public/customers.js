(() => {
    const form = document.getElementById("customer-form");
    const formAlert = document.getElementById("customer-form-alert");

    document.querySelectorAll(".customer-row[data-href]").forEach((row) => {
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

        const full_name = document.getElementById("customer-full-name")?.value?.trim() || "";
        const company = document.getElementById("customer-company")?.value?.trim() || "";
        const pan_gst = document.getElementById("customer-pan-gst")?.value?.trim() || "";
        const hsn = document.getElementById("customer-hsn")?.value?.trim() || "";
        const address = document.getElementById("customer-address")?.value?.trim() || "";

        if (!full_name || !company || !address) {
            showAlert(formAlert, "Please fill in full name, company, and address.", "danger");
            return;
        }

        const payload = {
            full_name,
            company,
            address,
        };
        if (pan_gst) payload.pan_gst = pan_gst;
        if (hsn) payload.hsn = hsn;

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
