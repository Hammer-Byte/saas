(() => {
    const modalElement = document.getElementById("run-detail-modal");
    const modalLabel = document.getElementById("run-detail-modal-label");
    const detailBody = document.getElementById("run-detail-body");

    if (modalElement && detailBody) {
        document.addEventListener("click", (event) => {
            const button = event.target.closest(".run-detail-btn");
            if (!button) {
                return;
            }

            if (modalLabel) {
                modalLabel.textContent = button.dataset.title || "Run detail";
            }
            let detailText = "";
            try {
                detailText = decodeURIComponent(button.dataset.detail || "");
            } catch (error) {
                detailText = button.dataset.detail || "";
            }
            detailBody.textContent = detailText || "No detail available.";

            const modal = window.bootstrap?.Modal?.getOrCreateInstance(modalElement);
            modal?.show();
        });
    }

    const projectCard = document.getElementById("server-project-card");
    const projectSelect = document.getElementById("server-project-select");
    const projectSaveBtn = document.getElementById("server-project-save-btn");
    const projectFeedback = document.getElementById("server-project-feedback");

    if (!projectCard || !projectSelect || !projectSaveBtn) {
        return;
    }

    function showProjectFeedback(message, isError) {
        if (!projectFeedback) return;
        projectFeedback.textContent = message;
        projectFeedback.className = `small ${isError ? "text-danger" : "text-success"}`;
        projectFeedback.classList.remove("d-none");
    }

    projectSaveBtn.addEventListener("click", async () => {
        const id = Number(projectCard.dataset.id);
        const name = (projectCard.dataset.name || "").trim();
        const location = (projectCard.dataset.location || "").trim();
        const notes = (projectCard.dataset.notes || "").trim() || null;
        const active = projectCard.dataset.active === "1";
        const projectValue = projectSelect.value.trim();
        const project_id = projectValue ? Number(projectValue) : null;

        if (!id || !name || !location) {
            showProjectFeedback("Missing server details to save.", true);
            return;
        }

        projectSaveBtn.disabled = true;
        showProjectFeedback("Saving…", false);

        try {
            const response = await fetch("/api/monitored-servers", {
                method: "PATCH",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id,
                    name,
                    location,
                    notes,
                    active,
                    project_id,
                }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showProjectFeedback(data.error || "Failed to save project.", true);
                return;
            }
            showProjectFeedback("Saved", false);
        } catch (error) {
            console.error(error);
            showProjectFeedback("Failed to save project.", true);
        } finally {
            projectSaveBtn.disabled = false;
        }
    });
})();
