(() => {
    const form = document.getElementById("login-form");
    const emailStep = document.getElementById("email-step");
    const otpStep = document.getElementById("otp-step");
    const passwordStep = document.getElementById("password-step");
    const emailInput = document.getElementById("login-email");
    const otpInput = document.getElementById("login-otp");
    const passwordInput = document.getElementById("login-password");
    const continueButton = document.getElementById("continue-login-btn");
    const getOtpButton = document.getElementById("get-otp-btn");
    const verifyOtpButton = document.getElementById("verify-otp-btn");
    const passwordLoginButton = document.getElementById("password-login-btn");
    const switchToOtpButton = document.getElementById("switch-to-otp-btn");
    const otpEmailLabel = document.getElementById("otp-email-label");
    const passwordEmailLabel = document.getElementById("password-email-label");
    const statusEl = document.getElementById("login-status");
    const backButtons = Array.from(document.querySelectorAll(".login-back-btn"));

    let authenticationToken = "";
    let resolvedLoginMethod = "";

    if (!form || !emailInput || !continueButton) {
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

    function hideAllSteps() {
        emailStep?.classList.add("d-none");
        otpStep?.classList.add("d-none");
        passwordStep?.classList.add("d-none");
    }

    function showEmailStep() {
        authenticationToken = "";
        resolvedLoginMethod = "";
        if (otpInput) otpInput.value = "";
        if (passwordInput) passwordInput.value = "";
        hideAllSteps();
        emailStep?.classList.remove("d-none");
        emailInput.focus();
    }

    function showOtpStep() {
        hideAllSteps();
        otpStep?.classList.remove("d-none");
        if (otpEmailLabel) otpEmailLabel.textContent = emailInput.value.trim();
        otpInput?.focus();
    }

    function showPasswordStep({ allowOtpSwitch }) {
        hideAllSteps();
        passwordStep?.classList.remove("d-none");
        if (passwordEmailLabel) passwordEmailLabel.textContent = emailInput.value.trim();
        switchToOtpButton?.classList.toggle("d-none", !allowOtpSwitch);
        passwordInput?.focus();
    }

    emailInput.addEventListener("input", clearError);
    otpInput?.addEventListener("input", clearError);
    passwordInput?.addEventListener("input", clearError);

    for (const backButton of backButtons) {
        backButton.addEventListener("click", () => {
            clearError();
            showEmailStep();
        });
    }

    switchToOtpButton?.addEventListener("click", () => {
        clearError();
        showOtpStep();
    });

    continueButton.addEventListener("click", async () => {
        clearError();

        const email = emailInput.value.trim();
        if (!email) {
            showError("Email is required.");
            return;
        }

        continueButton.disabled = true;

        try {
            const response = await fetch("/api/authentication/login-method", {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                body: JSON.stringify({ email }),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                showError(data.error || "Unable to continue.");
                return;
            }

            resolvedLoginMethod = data.login_method || "otp";

            if (resolvedLoginMethod === "password") {
                showPasswordStep({ allowOtpSwitch: false });
                return;
            }

            if (resolvedLoginMethod === "both") {
                showPasswordStep({ allowOtpSwitch: true });
                return;
            }

            showOtpStep();
            getOtpButton?.click();
        } catch (error) {
            console.error(error);
            showError("Unable to continue. Please try again.");
        } finally {
            continueButton.disabled = false;
        }
    });

    getOtpButton?.addEventListener("click", async () => {
        clearError();

        const email = emailInput.value.trim();
        if (!email) {
            showError("Email is required.");
            showEmailStep();
            return;
        }

        getOtpButton.disabled = true;

        try {
            const response = await fetch("/api/user-authentication-tokens", {
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

            otpInput?.focus();
        } catch (error) {
            console.error(error);
            showError("Unable to send OTP. Please try again.");
        } finally {
            getOtpButton.disabled = false;
        }
    });

    passwordLoginButton?.addEventListener("click", async () => {
        clearError();

        const email = emailInput.value.trim();
        const password = passwordInput?.value || "";
        if (!email) {
            showError("Email is required.");
            showEmailStep();
            return;
        }
        if (!password) {
            showError("Password is required.");
            return;
        }

        passwordLoginButton.disabled = true;

        try {
            const response = await fetch("/api/authentication/login", {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                body: JSON.stringify({ email, password }),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                showError(data.error || "Unable to login.");
                return;
            }

            window.location.href = data.redirect || "/app";
        } catch (error) {
            console.error(error);
            showError("Unable to login. Please try again.");
        } finally {
            passwordLoginButton.disabled = false;
        }
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        clearError();

        if (!otpStep || otpStep.classList.contains("d-none")) {
            return;
        }

        const otp = otpInput?.value.trim() || "";
        if (!authenticationToken) {
            showError("Request an OTP first.");
            return;
        }

        if (!/^\d{4}$/.test(otp)) {
            showError("Enter the 4-digit OTP.");
            return;
        }

        if (verifyOtpButton) verifyOtpButton.disabled = true;

        try {
            const response = await fetch("/api/user-authentication-tokens", {
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
