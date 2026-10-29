(() => {
    const form = document.getElementById("linkedin-message-form");
    const pageAlert = document.getElementById("linkedin-messages-alert");
    const tableWrap = document.getElementById("linkedin-messages-table-wrap");
    const emptyState = document.getElementById("linkedin-messages-empty");
    const tableBody = document.getElementById("linkedin-messages-tbody");
    const designationSelect = form?.elements.namedItem("designation_id");
    const messageInput = form?.elements.namedItem("message");
    const submitButton = document.getElementById("linkedin-message-submit-btn");

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

        const designationId = Number(designationSelect?.value || 0);
        const message = messageInput?.value?.trim() || "";

        if (!designationId) {
            showAlert("Select a designation.", "danger");
            return;
        }
        if (!message) {
            showAlert("Message is required.", "danger");
            return;
        }

        if (submitButton) submitButton.disabled = true;

        try {
            const response = await fetch("/api/linkedin-designation-messages", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    designation_id: designationId,
                    message,
                }),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                showAlert(data.error || "Failed to add message.", "danger");
                return;
            }

            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert("Failed to add message.", "danger");
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    });

    tableBody?.addEventListener("click", async (event) => {
        const deleteButton = event.target.closest(".linkedin-message-delete-btn");
        if (!deleteButton) return;

        const messageId = Number(deleteButton.dataset.id);
        if (!messageId) return;

        const confirmed = await showConfirm({
            title: "Delete message?",
            description: "This removes the template from MessageNetwork pools.",
            choices: [
                { label: "Cancel", variant: "secondary", value: false },
                { label: "Delete", variant: "danger", value: true },
            ],
        });
        if (!confirmed) return;

        deleteButton.disabled = true;
        hideAlert();

        try {
            const response = await fetch(`/api/linkedin-designation-messages/${messageId}`, {
                method: "DELETE",
                credentials: "same-origin",
            });

            if (!response.ok && response.status !== 204) {
                const data = await response.json().catch(() => ({}));
                showAlert(data.error || "Failed to delete message.", "danger");
                deleteButton.disabled = false;
                return;
            }

            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert("Failed to delete message.", "danger");
            deleteButton.disabled = false;
        }
    });

    if (tableBody && tableWrap && emptyState) {
        const hasRows = tableBody.querySelectorAll("tr").length > 0;
        tableWrap.classList.toggle("d-none", !hasRows);
        emptyState.classList.toggle("d-none", hasRows);
    }
})();
