(() => {
    const form = document.getElementById("add-service-form");
    const alertBox = document.getElementById("add-service-alert");
    const pageAlert = document.getElementById("application-services-alert");

    function showAlert(target, message, type) {
        if (!target) return;
        target.textContent = message;
        target.className = `alert alert-${type}`;
        target.classList.remove("d-none");
    }

    if (form && alertBox) {
        const applicationId = form.dataset.applicationId;

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            alertBox.classList.add("d-none");

            const service_id = Number(form.elements.namedItem("service_id")?.value);
            const service_configs = form.elements.namedItem("service_configs")?.value || "";

            if (!service_id) {
                showAlert(alertBox, "Please select a service.", "danger");
                return;
            }

            const submitBtn = form.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.disabled = true;
            }

            try {
                const response = await fetch(`/api/applications/${applicationId}/services`, {
                    method: "POST",
                    credentials: "same-origin",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        service_id,
                        service_configs,
                    }),
                });

                const data = await response.json().catch(() => ({}));

                if (!response.ok) {
                    showAlert(alertBox, data.error || "Failed to add service.", "danger");
                    return;
                }

                showAlert(pageAlert, "Service added successfully.", "success");
                window.location.reload();
            } catch (error) {
                console.error(error);
                showAlert(alertBox, "Failed to add service.", "danger");
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                }
            }
        });
    }

    document.querySelectorAll(".application-service-active").forEach((checkbox) => {
        checkbox.addEventListener("change", async () => {
            const applicationId = checkbox.dataset.applicationId;
            const applicationServiceId = checkbox.dataset.applicationServiceId;
            const active = checkbox.checked;
            const previous = !active;

            checkbox.disabled = true;

            try {
                const response = await fetch(
                    `/api/applications/${applicationId}/application-services/${applicationServiceId}`,
                    {
                        method: "PATCH",
                        credentials: "same-origin",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({ active }),
                    },
                );

                const data = await response.json().catch(() => ({}));

                if (!response.ok) {
                    checkbox.checked = previous;
                    showAlert(pageAlert, data.error || "Failed to update status.", "danger");
                    return;
                }

                showAlert(
                    pageAlert,
                    active ? "Service activated." : "Service deactivated.",
                    "success",
                );
            } catch (error) {
                console.error(error);
                checkbox.checked = previous;
                showAlert(pageAlert, "Failed to update status.", "danger");
            } finally {
                checkbox.disabled = false;
            }
        });
    });
})();
