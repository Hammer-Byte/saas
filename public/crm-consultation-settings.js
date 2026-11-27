document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("consultation-settings-form");
    const pageAlert = document.getElementById("settings-alert");
    const submitButton = document.getElementById("settings-submit-btn");
    const meetingLinkInput = document.getElementById("meeting-link");
    const whatsappNumberInput = document.getElementById("whatsapp-number");
    const whatsappMessageInput = document.getElementById("whatsapp-message");

    function showAlert(element, message, type) {
        window.showAlert?.(element, message, type);
    }

    form?.addEventListener("submit", async (event) => {
        event.preventDefault();
        submitButton.disabled = true;
        try {
            const response = await fetch("/api/consultation-settings", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    meeting_link: meetingLinkInput.value.trim() || null,
                    whatsapp_number: whatsappNumberInput.value.trim(),
                    whatsapp_message: whatsappMessageInput.value.trim(),
                }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showAlert(pageAlert, data.error || "Could not save settings", "danger");
                return;
            }
            showAlert(pageAlert, data.message || "Settings saved", "success");
        } catch {
            showAlert(pageAlert, "Could not save settings", "danger");
        } finally {
            submitButton.disabled = false;
        }
    });
});
