const LOGIN_API_URL = "/api/auth/login";

const form = document.getElementById("login-form");
const usernameInput = document.getElementById("login-username");
const passwordInput = document.getElementById("login-password");
const submitBtn = document.getElementById("login-submit");
const statusEl = document.getElementById("login-status");

if (form && usernameInput && passwordInput && submitBtn) {
    function showError(message) {
        if (!statusEl) return;
        statusEl.hidden = false;
        statusEl.textContent = message;
    }

    function clearError() {
        if (!statusEl) return;
        statusEl.hidden = true;
        statusEl.textContent = "";
    }

    usernameInput.addEventListener("input", clearError);
    passwordInput.addEventListener("input", clearError);

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        clearError();

        const username = usernameInput.value.trim();
        const password = passwordInput.value;

        if (!username || !password) {
            showError("Username and password are required.");
            return;
        }

        submitBtn.disabled = true;

        try {
            const response = await fetch(LOGIN_API_URL, {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                body: JSON.stringify({ username, password }),
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                showError(data.error || "Invalid username or password.");
                return;
            }

            window.location.href = data.redirect || "/app";
        } catch (error) {
            console.error(error);
            showError("Unable to sign in. Please try again.");
        } finally {
            submitBtn.disabled = false;
        }
    });
}
