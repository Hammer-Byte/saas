(() => {
    const signingPanel = document.querySelector(".signing-panel");
    const signAlert = document.getElementById("sign-alert");
    const readContractCheckbox = document.getElementById("read-contract-checkbox");
    const signButton = document.getElementById("sign-contract-btn");

    const mediaIds = {
        signature: null,
        selfie: null,
        identity: null,
    };

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

    function setUploadStatus(field, message, state) {
        const statusElement = document.getElementById(`${field}-status`);
        if (!statusElement) return;
        statusElement.textContent = message;
        statusElement.classList.toggle("is-ready", state === "ready");
        statusElement.classList.toggle("is-error", state === "error");
    }

    function updateSignButton() {
        if (!signButton) return;
        signButton.disabled = !(
            mediaIds.signature &&
            mediaIds.selfie &&
            mediaIds.identity &&
            readContractCheckbox?.checked
        );
    }

    async function uploadMedia({ field, fileInput }) {
        const uploadedFile = fileInput.files?.[0];
        mediaIds[field] = null;
        updateSignButton();

        if (!uploadedFile) {
            setUploadStatus(field, "Not uploaded", "idle");
            return;
        }

        setUploadStatus(field, "Uploading…", "idle");
        fileInput.disabled = true;

        try {
            const formData = new FormData();
            formData.append("file", uploadedFile);

            const response = await fetch("/api/external-contracts/media", {
                method: "POST",
                body: formData,
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok || !data.id) {
                setUploadStatus(field, data.error || "Upload failed", "error");
                return;
            }

            mediaIds[field] = data.id;
            setUploadStatus(field, `Uploaded (#${data.id})`, "ready");
            updateSignButton();
        } catch (error) {
            console.error(error);
            setUploadStatus(field, "Upload failed", "error");
        } finally {
            fileInput.disabled = false;
        }
    }

    ["signature", "selfie", "identity"].forEach((field) => {
        const fileInput = document.getElementById(`${field}-file`);
        fileInput?.addEventListener("change", () => {
            hideAlert();
            uploadMedia({ field, fileInput });
        });
    });

    readContractCheckbox?.addEventListener("change", () => {
        hideAlert();
        updateSignButton();
    });

    signButton?.addEventListener("click", async () => {
        const signing_code = signingPanel?.dataset.signingCode;
        if (
            !signing_code ||
            !mediaIds.signature ||
            !mediaIds.selfie ||
            !mediaIds.identity ||
            !readContractCheckbox?.checked
        ) {
            showAlert("Upload all files and confirm you have read the contract.", "danger");
            return;
        }

        signButton.disabled = true;
        hideAlert();

        try {
            const response = await fetch("/api/external-contracts/sign", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    signing_code,
                    signature: mediaIds.signature,
                    selfie: mediaIds.selfie,
                    identity: mediaIds.identity,
                }),
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
                downloadLink.href = `/api/external-contracts/${signing_code}/signed`;
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
