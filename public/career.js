(() => {
    const form = document.getElementById("career-apply-form");
    const alertElement = document.getElementById("career-alert");
    const submitButton = document.getElementById("career-submit-btn");
    const resumeInput = document.getElementById("career-resume");
    const RESUME_MAX_BYTES = 15 * 1024 * 1024;

    if (!form) {
        return;
    }

    function showAlert(message, type) {
        if (!alertElement) return;
        alertElement.textContent = message;
        alertElement.className = `alert alert-${type}`;
        alertElement.classList.remove("d-none");
    }

    function hideAlert() {
        if (!alertElement) return;
        alertElement.classList.add("d-none");
        alertElement.textContent = "";
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideAlert();

        const fullName = String(form.elements.namedItem("full_name")?.value || "").trim();
        const email = String(form.elements.namedItem("email")?.value || "").trim();
        const phone = String(form.elements.namedItem("phone")?.value || "").trim();
        const state = String(form.elements.namedItem("state")?.value || "").trim();
        const city = String(form.elements.namedItem("city")?.value || "").trim();
        const resume = resumeInput?.files?.[0];

        if (!fullName || !email || !phone || !state || !city || !resume) {
            showAlert("Please fill in all fields and attach a PDF resume.", "danger");
            return;
        }

        const lowerName = resume.name.toLowerCase();
        if (!lowerName.endsWith(".pdf") && resume.type !== "application/pdf") {
            showAlert("Resume must be a PDF file.", "danger");
            return;
        }

        if (Number(resume.size || 0) > RESUME_MAX_BYTES) {
            showAlert("Resume must be 15 MB or smaller.", "danger");
            return;
        }

        const payload = new FormData();
        payload.append("job_position_id", form.dataset.jobId || "");
        payload.append("full_name", fullName);
        payload.append("email", email);
        payload.append("phone", phone);
        payload.append("state", state);
        payload.append("city", city);
        payload.append("country", "India");
        payload.append("resume", resume);

        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = "Submitting…";
        }

        try {
            const response = await fetch("/api/job-applications", {
                method: "POST",
                body: payload,
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showAlert(data.error || "Failed to submit application.", "danger");
                return;
            }

            form.reset();
            const countryInput = form.elements.namedItem("country");
            if (countryInput) {
                countryInput.value = "India";
            }
            showAlert("Application submitted. We will contact you if you are shortlisted.", "success");
        } catch (error) {
            showAlert(error?.message || "Failed to submit application.", "danger");
        } finally {
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = "Submit application";
            }
        }
    });
})();
