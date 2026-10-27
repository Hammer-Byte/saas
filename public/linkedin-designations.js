(() => {
    const form = document.getElementById("linkedin-designation-form");
    const pageAlert = document.getElementById("linkedin-designations-alert");
    const tableWrap = document.getElementById("linkedin-designations-table-wrap");
    const emptyState = document.getElementById("linkedin-designations-empty");
    const tableBody = document.getElementById("linkedin-designations-tbody");
    const nameInput = form?.elements.namedItem("name");
    const submitButton = document.getElementById("linkedin-designation-submit-btn");

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

    form?.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideAlert();

        const name = nameInput?.value?.trim() || "";
        if (!name) {
            showAlert("Designation is required.", "danger");
            return;
        }

        if (submitButton) submitButton.disabled = true;

        try {
            const response = await fetch("/api/linkedin-designations", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name }),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                showAlert(data.error || "Failed to add designation.", "danger");
                return;
            }

            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert("Failed to add designation.", "danger");
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    });

    tableBody?.addEventListener("click", async (event) => {
        const deleteButton = event.target.closest(".linkedin-designation-delete-btn");
        if (!deleteButton) return;

        const designationId = Number(deleteButton.dataset.id);
        if (!designationId) return;

        const confirmed = await showConfirm({
            title: "Delete designation?",
            description: "This removes the designation from GrowNetwork and SearchNetwork selection lists.",
            choices: [
                { label: "Cancel", variant: "secondary", value: false },
                { label: "Delete", variant: "danger", value: true },
            ],
        });
        if (!confirmed) return;

        deleteButton.disabled = true;
        hideAlert();

        try {
            const response = await fetch(`/api/linkedin-designations/${designationId}`, {
                method: "DELETE",
                credentials: "same-origin",
            });

            if (!response.ok && response.status !== 204) {
                const data = await response.json().catch(() => ({}));
                showAlert(data.error || "Failed to delete designation.", "danger");
                deleteButton.disabled = false;
                return;
            }

            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert("Failed to delete designation.", "danger");
            deleteButton.disabled = false;
        }
    });

    if (tableBody && tableWrap && emptyState) {
        const hasRows = tableBody.querySelectorAll("tr").length > 0;
        tableWrap.classList.toggle("d-none", !hasRows);
        emptyState.classList.toggle("d-none", hasRows);
    }
})();
