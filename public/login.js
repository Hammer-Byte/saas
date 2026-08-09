(() => {
    const form = document.getElementById("login-form");
    const emailStep = document.getElementById("email-step");
    const otpStep = document.getElementById("otp-step");
    const emailInput = document.getElementById("login-email");
    const otpInput = document.getElementById("login-otp");
    const getOtpBtn = document.getElementById("get-otp-btn");
    const cancelOtpBtn = document.getElementById("cancel-otp-btn");
    const verifyOtpBtn = document.getElementById("verify-otp-btn");
    const statusEl = document.getElementById("login-status");
    let authenticationToken = "";

    if (!form || !emailInput || !otpInput || !getOtpBtn) {
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

    function showOtpStep() {
        emailStep?.classList.add("d-none");
        otpStep?.classList.remove("d-none");
        otpInput.focus();
    }

    emailInput.addEventListener("input", clearError);
    otpInput.addEventListener("input", clearError);

    cancelOtpBtn?.addEventListener("click", () => {
        clearError();
        showEmailStep();
    });

    getOtpBtn.addEventListener("click", async () => {
        clearError();

        const email = emailInput.value.trim();
        if (!email) {
            showError("Email is required.");
            return;
        }

        getOtpBtn.disabled = true;

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

            showOtpStep();
        } catch (error) {
            console.error(error);
            showError("Unable to send OTP. Please try again.");
        } finally {
            getOtpBtn.disabled = false;
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

        if (verifyOtpBtn) verifyOtpBtn.disabled = true;

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
            if (verifyOtpBtn) verifyOtpBtn.disabled = false;
        }
    });
})();
