(() => {
    const pageAlert = document.getElementById("releases-alert");

    function showAlert(message, type) {
        if (!pageAlert) return;
        pageAlert.textContent = message;
        pageAlert.className = `alert alert-${type}`;
        pageAlert.classList.remove("d-none");
    }

    document.querySelectorAll(".release-latest-btn").forEach((button) => {
        button.addEventListener("click", async () => {
            const label = button.dataset.label || "this release";
            if (!window.confirm(`Make ${label} the latest? Every approved agent switches to it within about 10 seconds.`)) {
                return;
            }
            button.disabled = true;
            try {
                const response = await fetch(`/api/agent-releases/${button.dataset.id}/latest`, {
                    method: "PATCH",
                    credentials: "same-origin",
                });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    showAlert(data.error || "Failed to update release.", "danger");
                    button.disabled = false;
                    return;
                }
                window.location.reload();
            } catch (error) {
                console.error(error);
                showAlert("Failed to update release.", "danger");
                button.disabled = false;
            }
        });
    });
})();
