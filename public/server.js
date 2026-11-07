(() => {
    const alertCheckbox = document.getElementById("server-alert");
    const alertFeedback = document.getElementById("server-alert-feedback");

    function showFeedback(message, isError) {
        if (!alertFeedback) return;
        alertFeedback.textContent = message;
        alertFeedback.className = `small ${isError ? "text-danger" : "text-secondary"}`;
        alertFeedback.classList.remove("d-none");
    }

    alertCheckbox?.addEventListener("change", async () => {
        const id = Number(alertCheckbox.dataset.id || 0);
        if (!id) {
            showFeedback("Invalid server.", true);
            return;
        }

        alertCheckbox.disabled = true;
        showFeedback("Saving…", false);

        try {
            const response = await fetch("/api/monitored-servers", {
                method: "PATCH",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, alert: alertCheckbox.checked }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                alertCheckbox.checked = !alertCheckbox.checked;
                showFeedback(data.error || "Failed to update alert.", true);
                return;
            }
            showFeedback(alertCheckbox.checked ? "Alert required." : "Alert not required.", false);
        } catch (error) {
            console.error(error);
            alertCheckbox.checked = !alertCheckbox.checked;
            showFeedback("Failed to update alert.", true);
        } finally {
            alertCheckbox.disabled = false;
        }
    });
})();
