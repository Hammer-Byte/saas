const INQUIRY_API_URL = "/api/inquiry";

const form = document.getElementById("inquiry-form");
const nameInput = document.getElementById("inquiry-name");
const phoneInput = document.getElementById("inquiry-phone");
const emailInput = document.getElementById("inquiry-email");
const submitBtn = document.getElementById("inquiry-submit");

if (form && nameInput && phoneInput && emailInput && submitBtn) {
    function syncSubmitState() {
        const nameOk = nameInput.value.trim().length > 0;
        const phoneOk = phoneInput.value.trim().length > 0;
        submitBtn.disabled = !(nameOk && phoneOk);
    }

    nameInput.addEventListener("input", syncSubmitState);
    phoneInput.addEventListener("input", syncSubmitState);
    syncSubmitState();

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

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
            const response = await fetch(INQUIRY_API_URL, {
                method: "POST",
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

            if (!response.ok) {
                throw new Error(`Inquiry request failed (${response.status})`);
            }

            form.reset();
            syncSubmitState();
        } catch (error) {
            console.error(error);
            syncSubmitState();
        } finally {
            submitBtn.classList.remove("is-submitting");
        }
    });
}
