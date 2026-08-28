(() => {
    const form = document.getElementById("add-document-form");
    const formAlert = document.getElementById("add-document-alert");
    const pageAlert = document.getElementById("project-documents-alert");

    function showAlert(target, message, type) {
        if (!target) return;
        target.textContent = message;
        target.className = `alert alert-${type}`;
        target.classList.remove("d-none");
    }

    form?.addEventListener("submit", async (event) => {
        event.preventDefault();
        formAlert?.classList.add("d-none");

        const projectId = Number(form.dataset.projectId);
        const fileInput = form.elements.namedItem("file");
        const description = form.elements.namedItem("description")?.value?.trim() || "";
        const uploadedFile = fileInput?.files?.[0];

        if (!projectId || !uploadedFile) {
            showAlert(formAlert, "Please select a file.", "danger");
            return;
        }

        const submitButton = form.querySelector('button[type="submit"]');
        if (submitButton) {
            submitButton.disabled = true;
        }

        try {
            const mediaBody = new FormData();
            mediaBody.append("file", uploadedFile);

            const mediaResponse = await fetch("/api/media", {
                method: "POST",
                credentials: "same-origin",
                body: mediaBody,
            });
            const mediaData = await mediaResponse.json().catch(() => ({}));

            if (!mediaResponse.ok || !mediaData.id) {
                showAlert(formAlert, mediaData.error || "Failed to upload file.", "danger");
                return;
            }

            const documentResponse = await fetch("/api/project-documents", {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    project_id: projectId,
                    media_id: mediaData.id,
                    description: description || undefined,
                }),
            });
            const documentData = await documentResponse.json().catch(() => ({}));

            if (!documentResponse.ok) {
                showAlert(
                    formAlert,
                    documentData.error || "Failed to link document to project.",
                    "danger",
                );
                return;
            }

            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert(formAlert, "Failed to upload document.", "danger");
            showAlert(pageAlert, "Failed to upload document.", "danger");
        } finally {
            if (submitButton) {
                submitButton.disabled = false;
            }
        }
    });
})();
