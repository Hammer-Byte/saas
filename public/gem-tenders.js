(() => {
    const form = document.getElementById("gem-keyword-form");
    const pageAlert = document.getElementById("gem-keywords-alert");
    const tableWrap = document.getElementById("gem-keywords-table-wrap");
    const emptyState = document.getElementById("gem-keywords-empty");
    const tableBody = document.getElementById("gem-keywords-tbody");
    const startScanButton = document.getElementById("gem-start-scan-btn");

    function showAlert(message, type) {
        if (!pageAlert) return;
        pageAlert.textContent = message;
        pageAlert.className = `alert alert-${type}`;
        pageAlert.classList.remove("d-none");
    }

    function hideAlert() {
        if (!pageAlert) return;
        pageAlert.classList.add("d-none");
        pageAlert.textContent = "";
    }

    function setScanRunning() {
        if (!startScanButton) return;
        startScanButton.disabled = true;
        startScanButton.textContent = "Scan in progress…";
    }

    form?.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideAlert();

        const keyword = form.elements.namedItem("keyword")?.value?.trim() || "";
        if (!keyword) {
            showAlert("Keyword is required.", "danger");
            return;
        }

        const submitButton = form.querySelector('button[type="submit"]');
        if (submitButton) submitButton.disabled = true;

        try {
            const response = await fetch("/api/gem-tender-keywords", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ keyword }),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                showAlert(data.error || "Failed to add keyword.", "danger");
                return;
            }

            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert("Failed to add keyword.", "danger");
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    });

    startScanButton?.addEventListener("click", async () => {
        if (startScanButton.disabled) return;

        hideAlert();
        startScanButton.disabled = true;

        try {
            const response = await fetch("/api/gem-tender-keywords/scan", {
                method: "POST",
                credentials: "same-origin",
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                showAlert(data.error || "Failed to start scan.", "danger");
                if (!data.processing) {
                    startScanButton.disabled = false;
                } else {
                    setScanRunning();
                }
                return;
            }

            setScanRunning();
            showAlert(data.message || "Scan started.", "success");
        } catch (error) {
            console.error(error);
            showAlert("Failed to start scan.", "danger");
            startScanButton.disabled = false;
        }
    });

    tableBody?.addEventListener("click", async (event) => {
        const deleteButton = event.target.closest(".gem-keyword-delete-btn");
        if (!deleteButton) return;

        const keywordId = Number(deleteButton.dataset.id);
        if (!keywordId) return;

        const confirmed = await showConfirm({
            title: "Delete keyword?",
            description: "This will also remove all tenders stored for this keyword.",
            choices: [
                { label: "Cancel", variant: "secondary", value: false },
                { label: "Delete", variant: "danger", value: true },
            ],
        });
        if (!confirmed) return;

        deleteButton.disabled = true;
        hideAlert();

        try {
            const response = await fetch(`/api/gem-tender-keywords/${keywordId}`, {
                method: "DELETE",
                credentials: "same-origin",
            });

            if (!response.ok && response.status !== 204) {
                const data = await response.json().catch(() => ({}));
                showAlert(data.error || "Failed to delete keyword.", "danger");
                deleteButton.disabled = false;
                return;
            }

            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert("Failed to delete keyword.", "danger");
            deleteButton.disabled = false;
        }
    });

    if (tableBody && tableWrap && emptyState) {
        const hasRows = tableBody.querySelectorAll("tr").length > 0;
        tableWrap.classList.toggle("d-none", !hasRows);
        emptyState.classList.toggle("d-none", hasRows);
    }
})();
