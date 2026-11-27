const form = document.getElementById("inquiry-form");
const nameInput = document.getElementById("inquiry-name");
const phoneInput = document.getElementById("inquiry-phone");
const emailInput = document.getElementById("inquiry-email");
const submitButton = document.getElementById("inquiry-submit");
const statusEl = document.getElementById("inquiry-status");

if (form && nameInput && phoneInput && emailInput && submitButton) {
    function syncSubmitState() {
        const nameOk = nameInput.value.trim().length > 0;
        const phoneOk = phoneInput.value.trim().length > 0;
        submitButton.disabled = !(nameOk && phoneOk);
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

        submitButton.disabled = true;
        submitButton.classList.add("is-submitting");

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
            submitButton.classList.remove("is-submitting");
        }
    });
}

(async function initConsultationLandingExtras() {
    const waFab = document.getElementById("hb-whatsapp-fab");
    const modal = document.getElementById("hb-consult-modal");

    try {
        const response = await fetch("/api/consultation/settings");
        const data = await response.json().catch(() => ({}));
        if (response.ok && waFab) {
            const number = String(data.whatsapp_number || "").replace(/\D/g, "");
            const message = String(data.whatsapp_message || "");
            if (number) {
                waFab.href = `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
                waFab.hidden = false;
            }
        }
    } catch {
        // ignore
    }

    if (!modal) {
        return;
    }

    const storageKey = "hb_consult_modal_seen";
    if (sessionStorage.getItem(storageKey) === "1") {
        return;
    }

    const dismiss = () => {
        modal.hidden = true;
        sessionStorage.setItem(storageKey, "1");
    };

    modal.querySelectorAll("[data-consult-dismiss]").forEach((el) => {
        el.addEventListener("click", dismiss);
    });

    window.setTimeout(() => {
        if (sessionStorage.getItem(storageKey) === "1") {
            return;
        }
        modal.hidden = false;
    }, 1200);
})();
