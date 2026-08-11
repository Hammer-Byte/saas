const form = document.getElementById("inquiry-form");
const nameInput = document.getElementById("inquiry-name");
const phoneInput = document.getElementById("inquiry-phone");
const emailInput = document.getElementById("inquiry-email");
const submitBtn = document.getElementById("inquiry-submit");
const statusEl = document.getElementById("inquiry-status");

if (form && nameInput && phoneInput && emailInput && submitBtn) {
    function syncSubmitState() {
        const nameOk = nameInput.value.trim().length > 0;
        const phoneOk = phoneInput.value.trim().length > 0;
        submitBtn.disabled = !(nameOk && phoneOk);
    }

    function showStatus(message, type) {
        if (!statusEl) return;
        statusEl.hidden = false;
        statusEl.textContent = message;
        statusEl.classList.remove("inquiry-status-success", "inquiry-status-error");
        statusEl.classList.add(type === "success" ? "inquiry-status-success" : "inquiry-status-error");
    }

    function clearStatus() {
        if (!statusEl) return;
        statusEl.hidden = true;
        statusEl.textContent = "";
        statusEl.classList.remove("inquiry-status-success", "inquiry-status-error");
    }

    nameInput.addEventListener("input", () => {
        clearStatus();
        syncSubmitState();
    });
    phoneInput.addEventListener("input", () => {
        clearStatus();
        syncSubmitState();
    });
    emailInput.addEventListener("input", clearStatus);
    syncSubmitState();

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        clearStatus();

        const full_name = nameInput.value.trim();
        const phone = phoneInput.value.trim();
        const email = emailInput.value.trim();

        if (!full_name || !phone) {
            syncSubmitState();
            return;
        }

        submitBtn.disabled = true;
        submitBtn.classList.add("is-submitting");

        try {
            const response = await fetch("/api/inquiries", {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                body: JSON.stringify({
                    full_name,
                    phone,
                    email: email || null,
                }),
            });

            if (response.status !== 201) {
                throw new Error(`Inquiry request failed (${response.status})`);
            }

            form.reset();
            syncSubmitState();
            showStatus("Inquiry submitted successfully. Our team will get back to you soon.", "success");
        } catch (error) {
            console.error(error);
            syncSubmitState();
            showStatus("Unable to submit inquiry. Please try again.", "error");
        } finally {
            submitBtn.classList.remove("is-submitting");
        }
    });
}
