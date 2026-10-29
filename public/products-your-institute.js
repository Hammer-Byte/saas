const form = document.getElementById("yi-inquiry-form");
const phoneInput = document.getElementById("yi-phone");
const submitButton = document.getElementById("yi-submit");
const statusEl = document.getElementById("yi-status");

function syncSubmitState() {
    if (!submitButton) return;
    submitButton.disabled = !(phoneInput?.value.trim().length > 0);
}

function showStatus(message, type) {
    if (!statusEl) return;
    statusEl.hidden = false;
    statusEl.textContent = message;
    statusEl.classList.remove("yi-status-success", "yi-status-error");
    statusEl.classList.add(type === "success" ? "yi-status-success" : "yi-status-error");
}

function clearStatus() {
    if (!statusEl) return;
    statusEl.hidden = true;
    statusEl.textContent = "";
    statusEl.classList.remove("yi-status-success", "yi-status-error");
}

if (form && phoneInput && submitButton) {
    phoneInput.addEventListener("input", () => {
        clearStatus();
        syncSubmitState();
    });
    syncSubmitState();

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        clearStatus();

        const phone = phoneInput.value.trim();
        if (!phone) {
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
                    phone,
                    source: "your-institute",
                }),
            });

            if (response.status !== 201) {
                throw new Error(`Inquiry request failed (${response.status})`);
            }

            form.reset();
            syncSubmitState();
            showStatus("Inquiry submitted. We’ll get back to you soon.", "success");
        } catch (error) {
            console.error(error);
            syncSubmitState();
            showStatus("Unable to submit inquiry. Please try again.", "error");
        } finally {
            submitButton.classList.remove("is-submitting");
        }
    });
}

const revealNodes = document.querySelectorAll("[data-reveal]");
if (revealNodes.length) {
    if ("IntersectionObserver" in window) {
        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (!entry.isIntersecting) continue;
                    entry.target.classList.add("is-visible");
                    observer.unobserve(entry.target);
                }
            },
            { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
        );
        revealNodes.forEach((node, index) => {
            node.style.transitionDelay = `${Math.min(index % 6, 4) * 70}ms`;
            observer.observe(node);
        });
    } else {
        revealNodes.forEach((node) => node.classList.add("is-visible"));
    }
}
