(() => {
    const pageAlert = document.getElementById("linkedin-search-alert");
    const startButton = document.getElementById("linkedin-search-start-btn");
    const startForm = document.getElementById("linkedin-search-start-form");
    const pagesInput = document.getElementById("linkedin-search-pages-input");
    const startFormAlert = document.getElementById("linkedin-search-start-form-alert");
    const startSubmitButton = document.getElementById("linkedin-search-start-submit-btn");
    const startModalElement = document.getElementById("linkedin-search-start-modal");
    const startModal =
        startModalElement && window.bootstrap
            ? window.bootstrap.Modal.getOrCreateInstance(startModalElement)
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
        hideAlert(startFormAlert);

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

        if (pagesInput) pagesInput.value = "4";
        startModal?.show();
    });

    startForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideAlert(startFormAlert);
        hideAlert(pageAlert);

        const designationIds = selectedIds(".linkedin-designation-check");
        const linkedinUserIds = selectedIds(".linkedin-user-check");
        const pageCount = Number(pagesInput?.value || 0);

        if (!Number.isInteger(pageCount) || pageCount < 1) {
            showAlert(startFormAlert, "Enter a whole number of 1 or more for pages.", "danger");
            return;
        }

        if (startSubmitButton) startSubmitButton.disabled = true;
        if (startButton) startButton.disabled = true;

        try {
            const response = await fetch("/api/linkedin-search-network/start", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    designation_ids: designationIds,
                    linkedin_user_ids: linkedinUserIds,
                    page_count: pageCount,
                }),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                showAlert(
                    startFormAlert,
                    data.error || "Failed to start SearchNetwork.",
                    "danger",
                );
                if (!data.processing) {
                    if (startButton) startButton.disabled = false;
                } else {
                    setRunning();
                    startModal?.hide();
                    showAlert(
                        pageAlert,
                        data.error || "LinkedIn automation already in progress.",
                        "warning",
                    );
                }
                return;
            }

            startModal?.hide();
            setRunning();
            showAlert(pageAlert, data.message || "SearchNetwork started.", "success");
        } catch (error) {
            console.error(error);
            showAlert(startFormAlert, "Failed to start SearchNetwork.", "danger");
            if (startButton) startButton.disabled = false;
        } finally {
            if (startSubmitButton) startSubmitButton.disabled = false;
        }
    });
})();
