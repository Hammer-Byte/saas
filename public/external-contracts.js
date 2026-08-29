(() => {
    const form = document.getElementById("external-contract-form");
    const formAlert = document.getElementById("external-contract-form-alert");
    const pageAlert = document.getElementById("external-contracts-alert");
    const activeField = document.getElementById("active");

    function showAlert(target, message, type) {
        if (!target) return;
        target.textContent = message;
        target.className = `alert alert-${type}`;
        target.classList.remove("d-none");
    }

    document.getElementById("external-contract-modal")?.addEventListener("show.bs.modal", () => {
        formAlert?.classList.add("d-none");
        form?.reset();
        if (activeField) activeField.checked = true;
    });

    document.querySelectorAll(".external-contract-delete-btn").forEach((button) => {
        button.addEventListener("click", async () => {
            const confirmed = await showConfirm({
                title: "Delete contract?",
                description: "This will also delete all clauses and subclauses. This cannot be undone.",
                choices: [
                    { label: "Cancel", variant: "secondary", value: false },
                    { label: "Delete", variant: "danger", value: true },
                ],
            });
            if (!confirmed) {
                return;
            }

            try {
                const response = await fetch(`/api/external-contracts/${button.dataset.id}`, {
                    method: "DELETE",
                    credentials: "same-origin",
                });

                if (!response.ok && response.status !== 204) {
                    const data = await response.json().catch(() => ({}));
                    showAlert(pageAlert, data.error || "Failed to delete contract.", "danger");
                    return;
                }

                window.location.reload();
            } catch (error) {
                console.error(error);
                showAlert(pageAlert, "Failed to delete contract.", "danger");
            }
        });
    });

    form?.addEventListener("submit", async (event) => {
        event.preventDefault();
        formAlert?.classList.add("d-none");

        const company = form.elements.namedItem("company")?.value?.trim() || "";
        const full_name = form.elements.namedItem("full_name")?.value?.trim() || "";
        const email = form.elements.namedItem("email")?.value?.trim() || "";
        const phone = form.elements.namedItem("phone")?.value?.trim() || "";
        const address = form.elements.namedItem("address")?.value?.trim() || "";
        const active = form.elements.namedItem("active")?.checked === true;
        const signable_till = getWritableDate(
            "YYYY-MM-DD HH:mm:ss",
            form.elements.namedItem("signable_till")?.value,
        );

        if (!company || !full_name || !email || !phone || !address || !signable_till) {
            showAlert(formAlert, "All fields are required.", "danger");
            return;
        }

        const submitButton = form.querySelector('button[type="submit"]');
        if (submitButton) submitButton.disabled = true;

        try {
            const response = await fetch("/api/external-contracts", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    company,
                    full_name,
                    email,
                    phone,
                    address,
                    active,
                    signable_till,
                }),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                showAlert(formAlert, data.error || "Failed to add contract.", "danger");
                return;
            }

            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert(formAlert, "Failed to add contract.", "danger");
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    });
})();
