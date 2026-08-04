(() => {
    const form = document.getElementById("project-form");
    const alertBox = document.getElementById("project-alert");
    const deleteBtn = document.getElementById("delete-project-btn");

    if (!form || !alertBox) {
        return;
    }

    const projectId = Number(form.dataset.projectId);

    function showAlert(message, type) {
        alertBox.textContent = message;
        alertBox.className = `alert alert-${type}`;
        alertBox.classList.remove("d-none");
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const title = form.elements.namedItem("title")?.value?.trim() || "";
        const description = form.elements.namedItem("description")?.value?.trim() || "";

        if (!title) {
            showAlert("Title is required.", "danger");
            return;
        }

        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;

        try {
            const response = await fetch("/api/projects", {
                method: "PATCH",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: projectId, title, description }),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                showAlert(data.error || "Failed to update project.", "danger");
                return;
            }

            showAlert("Project updated.", "success");
            if (data.project) {
                form.elements.namedItem("title").value = data.project.title;
                form.elements.namedItem("description").value = data.project.description || "";
            }
        } catch (error) {
            console.error(error);
            showAlert("Failed to update project.", "danger");
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    });

    deleteBtn?.addEventListener("click", async () => {
        if (!window.confirm("Delete this project?")) {
            return;
        }

        try {
            const response = await fetch(`/api/projects/${projectId}`, {
                method: "DELETE",
                credentials: "same-origin",
            });

            if (!response.ok && response.status !== 204) {
                const data = await response.json().catch(() => ({}));
                showAlert(data.error || "Failed to delete project.", "danger");
                return;
            }

            window.location.href = "/app/projects";
        } catch (error) {
            console.error(error);
            showAlert("Failed to delete project.", "danger");
        }
    });
})();
