(() => {
    const pageAlert = document.getElementById("linkedin-grow-alert");
    const startButton = document.getElementById("linkedin-grow-start-btn");
    const limitForm = document.getElementById("linkedin-grow-limit-form");
    const limitInput = document.getElementById("linkedin-grow-limit-input");
    const limitFormAlert = document.getElementById("linkedin-grow-limit-form-alert");
    const limitSubmitButton = document.getElementById("linkedin-grow-limit-submit-btn");
    const limitModalElement = document.getElementById("linkedin-grow-limit-modal");
    const limitModal =
        limitModalElement && window.bootstrap
            ? window.bootstrap.Modal.getOrCreateInstance(limitModalElement)
            : null;

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

    function setRunning() {
        if (!startButton) return;
        startButton.disabled = true;
        startButton.textContent = "Running…";
    }

    function selectedIds(selector) {
        return [...document.querySelectorAll(selector)]
            .filter((input) => input.checked)
            .map((input) => Number(input.value))
            .filter((id) => Number.isInteger(id) && id > 0);
    }

    startButton?.addEventListener("click", () => {
        if (startButton.disabled) return;
        hideAlert(pageAlert);
        hideAlert(limitFormAlert);

        const designationIds = selectedIds(".linkedin-designation-check");
        const linkedinUserIds = selectedIds(".linkedin-user-check");

        if (!designationIds.length) {
            showAlert(pageAlert, "Select at least one designation.", "danger");
            return;
        }
        if (!linkedinUserIds.length) {
            showAlert(pageAlert, "Select at least one account.", "danger");
            return;
        }

        if (limitInput) limitInput.value = "25";
        limitModal?.show();
    });

    limitForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideAlert(limitFormAlert);
        hideAlert(pageAlert);

        const designationIds = selectedIds(".linkedin-designation-check");
        const linkedinUserIds = selectedIds(".linkedin-user-check");
        const perAccountLimit = Number(limitInput?.value || 0);

        if (!Number.isInteger(perAccountLimit) || perAccountLimit < 1) {
            showAlert(limitFormAlert, "Enter a whole number of 1 or more.", "danger");
            return;
        }

        if (limitSubmitButton) limitSubmitButton.disabled = true;
        if (startButton) startButton.disabled = true;

        try {
            const response = await fetch("/api/linkedin-grow-network/start", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    designation_ids: designationIds,
                    linkedin_user_ids: linkedinUserIds,
                    per_account_limit: perAccountLimit,
                }),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                showAlert(
                    limitFormAlert,
                    data.error || "Failed to start GrowNetwork.",
                    "danger",
                );
                if (!data.processing) {
                    if (startButton) startButton.disabled = false;
                } else {
                    setRunning();
                    limitModal?.hide();
                    showAlert(pageAlert, data.error || "GrowNetwork already in progress.", "warning");
                }
                return;
            }

            limitModal?.hide();
            setRunning();
            showAlert(pageAlert, data.message || "GrowNetwork started.", "success");
        } catch (error) {
            console.error(error);
            showAlert(limitFormAlert, "Failed to start GrowNetwork.", "danger");
            if (startButton) startButton.disabled = false;
        } finally {
            if (limitSubmitButton) limitSubmitButton.disabled = false;
        }
    });
})();
