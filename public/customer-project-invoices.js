(() => {
    const form = document.getElementById("invoice-form");
    const formAlert = document.getElementById("invoice-form-alert");
    const pageAlert = document.getElementById("invoices-alert");

    function showAlert(target, message, type) {
        if (!target) return;
        target.textContent = message;
        target.className = `alert alert-${type}`;
        target.classList.remove("d-none");
    }

    document.querySelectorAll(".invoice-delete-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
            if (!window.confirm("Delete this invoice?")) {
                return;
            }

            try {
                const response = await fetch(`/api/customer-invoices/${btn.dataset.id}`, {
                    method: "DELETE",
                    credentials: "same-origin",
                });

                if (!response.ok && response.status !== 204) {
                    const data = await response.json().catch(() => ({}));
                    showAlert(pageAlert, data.error || "Failed to delete invoice.", "danger");
                    return;
                }

                window.location.reload();
            } catch (error) {
                console.error(error);
                showAlert(pageAlert, "Failed to delete invoice.", "danger");
            }
        });
    });

    if (!form) {
        return;
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        formAlert?.classList.add("d-none");

        const customer_id = Number(form.dataset.customerId);
        const project_id = Number(form.dataset.projectId);
        const due_date = form.elements.namedItem("due_date")?.value || "";
        const total = Number(form.elements.namedItem("total")?.value || 0);
        const gst = Number(form.elements.namedItem("gst")?.value || 0);

        if (!due_date) {
            showAlert(formAlert, "Due date is required.", "danger");
            return;
        }

        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;

        try {
            const response = await fetch("/api/customer-invoices", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ customer_id, project_id, due_date, total, gst }),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                showAlert(formAlert, data.error || "Failed to add invoice.", "danger");
                return;
            }

            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert(formAlert, "Failed to add invoice.", "danger");
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    });
})();
