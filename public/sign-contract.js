(() => {
    const signingPanel = document.querySelector(".signing-panel");
    const signAlert = document.getElementById("sign-alert");
    const readContractCheckbox = document.getElementById("read-contract-checkbox");
    const signButton = document.getElementById("sign-contract-btn");
    const fileInputs = Array.from(document.querySelectorAll(".required-attachment-file"));

    function showAlert(message, type) {
        if (!signAlert) return;
        signAlert.textContent = message;
        signAlert.className = `alert alert-${type}`;
        signAlert.classList.remove("d-none");
    }

    function hideAlert() {
        if (!signAlert) return;
        signAlert.classList.add("d-none");
        signAlert.textContent = "";
    }

    function setUploadStatus(requiredAttachmentId, message, state) {
        const statusElement = document.getElementById(
            `required-attachment-status-${requiredAttachmentId}`,
        );
        if (!statusElement) return;
        statusElement.textContent = message;
        statusElement.classList.toggle("is-ready", state === "ready");
        statusElement.classList.toggle("is-error", state === "error");
    }

    function allDocumentsAttached() {
        return (
            fileInputs.length > 0 &&
            fileInputs.every((fileInput) => fileInput.dataset.hasAttachment === "1")
        );
    }

    function updateSignButton() {
        if (!signButton) return;
        signButton.disabled = !(allDocumentsAttached() && readContractCheckbox?.checked);
    }

    async function uploadRequiredDocument(fileInput) {
        const requiredAttachmentId = Number(fileInput.dataset.requiredAttachmentId);
        const uploadedFile = fileInput.files?.[0];
        fileInput.dataset.hasAttachment = "0";
        updateSignButton();

        if (!requiredAttachmentId || !uploadedFile) {
            setUploadStatus(requiredAttachmentId, "Not uploaded", "idle");
            return;
        }

        setUploadStatus(requiredAttachmentId, "Uploading…", "idle");
        fileInput.disabled = true;

        try {
            const formData = new FormData();
            formData.append("file", uploadedFile);

            const uploadResponse = await fetch("/api/contracts/media", {
                method: "POST",
                body: formData,
            });
            const uploadData = await uploadResponse.json().catch(() => ({}));
            if (!uploadResponse.ok || !uploadData.id) {
                setUploadStatus(
                    requiredAttachmentId,
                    uploadData.error || "Upload failed",
                    "error",
                );
                return;
            }

            const attachResponse = await fetch(
                `/api/contracts/required-attachments/${requiredAttachmentId}`,
                {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ media_id: uploadData.id }),
                },
            );
            const attachData = await attachResponse.json().catch(() => ({}));
            if (!attachResponse.ok) {
                setUploadStatus(
                    requiredAttachmentId,
                    attachData.error || "Attach failed",
                    "error",
                );
                return;
            }

            fileInput.dataset.hasAttachment = "1";
            setUploadStatus(requiredAttachmentId, `Uploaded (#${uploadData.id})`, "ready");
            updateSignButton();
        } catch (error) {
            console.error(error);
            setUploadStatus(requiredAttachmentId, "Upload failed", "error");
        } finally {
            fileInput.disabled = false;
        }
    }

    fileInputs.forEach((fileInput) => {
        fileInput.addEventListener("change", () => {
            hideAlert();
            uploadRequiredDocument(fileInput);
        });
    });

    readContractCheckbox?.addEventListener("change", () => {
        hideAlert();
        updateSignButton();
    });

    signButton?.addEventListener("click", async () => {
        const signing_code = signingPanel?.dataset.signingCode;
        if (!signing_code || !allDocumentsAttached() || !readContractCheckbox?.checked) {
            showAlert("Upload all required attachments and confirm the agreement acknowledgment.", "danger");
            return;
        }

        signButton.disabled = true;
        hideAlert();

        try {
            const response = await fetch("/api/contracts/sign", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ signing_code }),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                showAlert(data.error || "Failed to sign contract.", "danger");
                updateSignButton();
                return;
            }

            const action = await showConfirm({
                title: "Signed successfully",
                description: "Your contract has been signed successfully.",
                choices: [
                    { label: "Close", variant: "secondary", value: "close" },
                    { label: "Download", variant: "primary", value: "download" },
                ],
            });

            if (action === "download") {
                const downloadLink = document.createElement("a");
                downloadLink.href = `/api/contracts/${signing_code}/signed`;
                downloadLink.rel = "noopener";
                document.body.appendChild(downloadLink);
                downloadLink.click();
                downloadLink.remove();
            }

            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert("Failed to sign contract.", "danger");
            updateSignButton();
        }
    });

    updateSignButton();
})();
