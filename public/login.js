(() => {
    const form = document.getElementById("login-form");
    const emailStep = document.getElementById("email-step");
    const otpStep = document.getElementById("otp-step");
    const emailInput = document.getElementById("login-email");
    const otpInput = document.getElementById("login-otp");
    const getOtpButton = document.getElementById("get-otp-btn");
    const cancelOtpButton = document.getElementById("cancel-otp-btn");
    const verifyOtpButton = document.getElementById("verify-otp-btn");
    const statusEl = document.getElementById("login-status");
    let authenticationToken = "";

    if (!form || !emailInput || !otpInput || !getOtpButton) {
        return;
    }

    function showError(message) {
        if (!statusEl) return;
        statusEl.hidden = false;
        statusEl.className = "small text-danger mb-0 mt-3";
        statusEl.textContent = message;
    }

    function clearError() {
        if (!statusEl) return;
        statusEl.hidden = true;
        statusEl.textContent = "";
    }

    function showEmailStep() {
        authenticationToken = "";
        otpInput.value = "";
        emailStep?.classList.remove("d-none");
        otpStep?.classList.add("d-none");
        emailInput.focus();
    }

    emailInput.addEventListener("input", clearError);
    otpInput.addEventListener("input", clearError);

    cancelOtpButton?.addEventListener("click", () => {
        clearError();
        showEmailStep();
    });

    getOtpButton.addEventListener("click", async () => {
        clearError();

        const email = emailInput.value.trim();
        if (!email) {
            showError("Email is required.");
            return;
        }

        getOtpButton.disabled = true;

        try {
            const response = await fetch("/api/authentication-tokens", {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                body: JSON.stringify({ email }),
            });
            const data = await response.json().catch(() => ({}));

            if (response.status !== 201) {
                showError(data.error || "Unable to send OTP.");
                return;
            }

            authenticationToken = data.authentication_token || "";
            if (!authenticationToken) {
                showError("Authentication token missing from response.");
                return;
            }

            emailStep?.classList.add("d-none");
            otpStep?.classList.remove("d-none");
            otpInput.focus();
        } catch (error) {
            console.error(error);
            showError("Unable to send OTP. Please try again.");
        } finally {
            getOtpButton.disabled = false;
        }
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        clearError();

        const otp = otpInput.value.trim();
        if (!authenticationToken) {
            showError("Request an OTP first.");
            showEmailStep();
            return;
        }

        if (!/^\d{4}$/.test(otp)) {
            showError("Enter the 4-digit OTP.");
            return;
        }

        if (verifyOtpButton) verifyOtpButton.disabled = true;

        try {
            const response = await fetch("/api/authentication-tokens", {
                method: "PATCH",
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                body: JSON.stringify({
                    authentication_token: authenticationToken,
                    otp,
                }),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                showError(data.error || "Invalid OTP.");
                return;
            }

            window.location.href = data.redirect || "/app";
        } catch (error) {
            console.error(error);
            showError("Unable to verify OTP. Please try again.");
        } finally {
            if (verifyOtpButton) verifyOtpButton.disabled = false;
        }
    });
})();
