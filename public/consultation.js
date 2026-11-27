document.addEventListener("DOMContentLoaded", () => {
    const state = {
        topic: null,
        slot: null,
        verificationToken: null,
        booking: null,
    };

    const alertEl = document.getElementById("consultation-alert");
    const topicsEl = document.getElementById("consultation-topics");
    const slotsEl = document.getElementById("consultation-slots");
    const detailsForm = document.getElementById("consultation-details-form");
    const otpForm = document.getElementById("consultation-otp-form");
    const sendOtpBtn = document.getElementById("consultation-send-otp");
    const bookBtn = document.getElementById("consultation-book-btn");
    const successCopy = document.getElementById("consultation-success-copy");
    const successLink = document.getElementById("consultation-success-link");
    const waFab = document.getElementById("consultation-whatsapp-fab");

    function showAlert(message, type = "error") {
        if (!alertEl) {
            return;
        }
        alertEl.hidden = false;
        alertEl.textContent = message;
        alertEl.classList.toggle("is-success", type === "success");
    }

    function clearAlert() {
        if (!alertEl) {
            return;
        }
        alertEl.hidden = true;
        alertEl.textContent = "";
        alertEl.classList.remove("is-success");
    }

    function goToStep(step) {
        document.querySelectorAll(".consultation-step").forEach((section) => {
            const active = Number(section.dataset.step) === step;
            section.hidden = !active;
            section.classList.toggle("is-active", active);
        });
        document.querySelectorAll("[data-step-indicator]").forEach((indicator) => {
            indicator.classList.toggle(
                "is-active",
                Number(indicator.dataset.stepIndicator) === Math.min(step, 4),
            );
        });
        clearAlert();
    }

    function formatSlotLabel(startsAt) {
        try {
            const normalized = String(startsAt).replace(" ", "T");
            const date = new Date(normalized);
            if (Number.isNaN(date.getTime())) {
                return String(startsAt);
            }
            return date.toLocaleString("en-IN", {
                weekday: "short",
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
            });
        } catch {
            return String(startsAt);
        }
    }

    async function loadSettings() {
        try {
            const response = await fetch("/api/consultation/settings");
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                return;
            }
            const number = String(data.whatsapp_number || "").replace(/\D/g, "");
            const message = String(data.whatsapp_message || "");
            if (!number || !waFab) {
                return;
            }
            const href = `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
            waFab.href = href;
            waFab.hidden = false;
        } catch {
            // ignore
        }
    }

    async function loadTopics() {
        topicsEl.innerHTML = `<p class="consultation-note">Loading topics…</p>`;
        try {
            const response = await fetch("/api/consultation/topics");
            const data = await response.json().catch(() => ({}));
            const topics = data.topics || [];
            if (!topics.length) {
                topicsEl.innerHTML = `<p class="consultation-note">No topics are open right now. Message us on WhatsApp instead.</p>`;
                return;
            }
            topicsEl.innerHTML = "";
            topics.forEach((topic) => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "consultation-card";
                button.innerHTML = `<strong>${escapeHtml(topic.title)}</strong><span>${escapeHtml(topic.description || "")}</span>`;
                button.addEventListener("click", () => {
                    state.topic = topic;
                    topicsEl.querySelectorAll(".consultation-card").forEach((el) => {
                        el.classList.toggle("is-selected", el === button);
                    });
                    loadSlots().then(() => goToStep(2));
                });
                topicsEl.appendChild(button);
            });
        } catch {
            topicsEl.innerHTML = `<p class="consultation-note">Could not load topics.</p>`;
        }
    }

    async function loadSlots() {
        slotsEl.innerHTML = `<p class="consultation-note">Loading slots…</p>`;
        try {
            const response = await fetch("/api/consultation/slots");
            const data = await response.json().catch(() => ({}));
            const slots = data.slots || [];
            if (!slots.length) {
                slotsEl.innerHTML = `<p class="consultation-note">No upcoming free slots. Try WhatsApp or check back soon.</p>`;
                return;
            }
            slotsEl.innerHTML = "";
            slots.forEach((slot) => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "consultation-slot";
                button.innerHTML = `<strong>${escapeHtml(formatSlotLabel(slot.starts_at))}</strong><span>With ${escapeHtml(slot.owner_name || "HammerByte")}</span>`;
                button.addEventListener("click", () => {
                    state.slot = slot;
                    slotsEl.querySelectorAll(".consultation-slot").forEach((el) => {
                        el.classList.toggle("is-selected", el === button);
                    });
                    goToStep(3);
                });
                slotsEl.appendChild(button);
            });
        } catch {
            slotsEl.innerHTML = `<p class="consultation-note">Could not load slots.</p>`;
        }
    }

    function escapeHtml(value) {
        return String(value || "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;");
    }

    document.querySelectorAll("[data-back]").forEach((button) => {
        button.addEventListener("click", () => {
            goToStep(Number(button.dataset.back));
        });
    });

    detailsForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        clearAlert();
        if (!state.topic || !state.slot) {
            showAlert("Pick a topic and slot first");
            return;
        }

        const payload = {
            full_name: document.getElementById("consultation-name").value.trim(),
            phone: document.getElementById("consultation-phone").value.trim(),
            email: document.getElementById("consultation-email").value.trim(),
            topic_id: Number(state.topic.id),
            slot_id: Number(state.slot.id),
        };

        sendOtpBtn.disabled = true;
        try {
            const response = await fetch("/api/consultation/otp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showAlert(data.error || "Could not send verification code");
                return;
            }
            state.verificationToken = data.verification_token;
            goToStep(4);
            showAlert("Code sent to your email", "success");
        } catch {
            showAlert("Could not send verification code");
        } finally {
            sendOtpBtn.disabled = false;
        }
    });

    otpForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        clearAlert();
        if (!state.verificationToken) {
            showAlert("Request a verification code first");
            return;
        }

        bookBtn.disabled = true;
        try {
            const response = await fetch("/api/consultation/book", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    verification_token: state.verificationToken,
                    otp: document.getElementById("consultation-otp").value.trim(),
                }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showAlert(data.error || "Could not confirm booking");
                return;
            }
            state.booking = data.booking;
            if (successCopy) {
                successCopy.textContent = `${data.booking.topic_title} on ${formatSlotLabel(data.booking.starts_at)}.`;
            }
            if (successLink) {
                if (data.booking.meeting_link) {
                    successLink.innerHTML = `Meeting link: <a href="${escapeHtml(data.booking.meeting_link)}" target="_blank" rel="noopener">${escapeHtml(data.booking.meeting_link)}</a>`;
                } else {
                    successLink.textContent = "We will share the meeting link by email.";
                }
            }
            goToStep(5);
        } catch {
            showAlert("Could not confirm booking");
        } finally {
            bookBtn.disabled = false;
        }
    });

    loadSettings();
    loadTopics();
});
