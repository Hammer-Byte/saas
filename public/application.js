(() => {
    const form = document.getElementById("application-edit-form");
    const alertBox = document.getElementById("application-alert");
    const addServiceForm = document.getElementById("add-service-form");
    const addServiceAlert = document.getElementById("add-service-alert");
    const servicesAlert = document.getElementById("application-services-alert");

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

            const title = form.elements.namedItem("title")?.value?.trim() || "";
            const token = form.elements.namedItem("token")?.value?.trim() || "";
            const project_id = Number(form.elements.namedItem("project_id")?.value || 0);
            const active = form.elements.namedItem("active")?.value === "true";

            if (!title || !token || !project_id) {
                showAlert(alertBox, "Title, token, and customer project are required.", "danger");
                return;
            }

            const saveBtn = form.querySelector('button[type="submit"]');
            if (saveBtn) {
                saveBtn.disabled = true;
            }

            try {
                const response = await fetch(`/api/project-applications/${applicationId}`, {
                    method: "PATCH",
                    credentials: "same-origin",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        title,
                        token,
                        active,
                        project_id,
                    }),
                });

                const data = await response.json().catch(() => ({}));

                if (!response.ok) {
                    showAlert(alertBox, data.error || "Failed to update application.", "danger");
                    return;
                }

                showAlert(alertBox, "Application updated successfully.", "success");
                if (data.application) {
                    form.elements.namedItem("title").value = data.application.title;
                    form.elements.namedItem("token").value = data.application.token;
                    form.elements.namedItem("active").value = data.application.active
                        ? "true"
                        : "false";
                    form.elements.namedItem("project_id").value = data.application.project_id || "";
                }
            } catch (error) {
                console.error(error);
                showAlert(alertBox, "Failed to update application.", "danger");
            } finally {
                if (saveBtn) {
                    saveBtn.disabled = false;
                }
            }
        });
    }

    if (addServiceForm && addServiceAlert) {
        const applicationId = addServiceForm.dataset.applicationId;

        addServiceForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            addServiceAlert.classList.add("d-none");

            const service_id = Number(addServiceForm.elements.namedItem("service_id")?.value);
            const service_configs =
                addServiceForm.elements.namedItem("service_configs")?.value || "";

            if (!service_id) {
                showAlert(addServiceAlert, "Please select a service.", "danger");
                return;
            }

            const submitBtn = addServiceForm.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.disabled = true;
            }

            try {
                const response = await fetch("/api/application-services", {
                    method: "POST",
                    credentials: "same-origin",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        application_id: Number(applicationId),
                        service_id,
                        service_configs,
                    }),
                });

                const data = await response.json().catch(() => ({}));

                if (!response.ok) {
                    showAlert(addServiceAlert, data.error || "Failed to add service.", "danger");
                    return;
                }

                window.location.reload();
            } catch (error) {
                console.error(error);
                showAlert(addServiceAlert, "Failed to add service.", "danger");
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                }
            }
        });
    }

    document.querySelectorAll(".application-service-active").forEach((checkbox) => {
        checkbox.addEventListener("change", async () => {
            const applicationServiceId = checkbox.dataset.applicationServiceId;
            const active = checkbox.checked;
            const previous = !active;

            checkbox.disabled = true;

            try {
                const response = await fetch(`/api/application-services/${applicationServiceId}`, {
                    method: "PATCH",
                    credentials: "same-origin",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ active }),
                });

                const data = await response.json().catch(() => ({}));

                if (!response.ok) {
                    checkbox.checked = previous;
                    showAlert(servicesAlert, data.error || "Failed to update status.", "danger");
                    return;
                }

                showAlert(
                    servicesAlert,
                    active ? "Service activated." : "Service deactivated.",
                    "success",
                );
            } catch (error) {
                console.error(error);
                checkbox.checked = previous;
                showAlert(servicesAlert, "Failed to update status.", "danger");
            } finally {
                checkbox.disabled = false;
            }
        });
    });
})();
