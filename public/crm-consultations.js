document.addEventListener("DOMContentLoaded", () => {
    const pageAlert = document.getElementById("bookings-alert");
    const form = document.getElementById("reschedule-form");
    const formAlert = document.getElementById("reschedule-form-alert");
    const bookingIdInput = document.getElementById("reschedule-booking-id");
    const slotSelect = document.getElementById("reschedule-slot-id");
    const startsInput = document.getElementById("reschedule-starts-at");
    const submitButton = document.getElementById("reschedule-submit-btn");
    const modalElement = document.getElementById("reschedule-modal");
    const modal = modalElement ? bootstrap.Modal.getOrCreateInstance(modalElement) : null;

    function showAlert(element, message, type) {
        window.showAlert?.(element, message, type);
    }

    function hideAlert(element) {
        window.hideAlert?.(element);
    }

    function toApiDateTime(value) {
        if (!value) {
            return "";
        }
        return value.replace("T", " ") + ":00";
    }

    document.querySelectorAll(".booking-status-select").forEach((select) => {
        select.addEventListener("change", async () => {
            const row = select.closest("tr");
            if (!row) {
                return;
            }
            const id = row.dataset.id;
            const status = select.value;
            if (
                status === (window.__CONSULTATION_STATUSES__?.CANCELLED || "cancelled") &&
                select.dataset.canCancel !== "1"
            ) {
                showAlert(pageAlert, "Only the slot owner can cancel this booking", "danger");
                select.value = row.dataset.status;
                return;
            }
            select.disabled = true;
            try {
                const response = await fetch(`/api/consultation-bookings/${id}/status`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ status }),
                });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    showAlert(pageAlert, data.error || "Could not update status", "danger");
                    select.value = row.dataset.status;
                    return;
                }
                row.dataset.status = status;
                showAlert(pageAlert, data.message || "Updated", "success");
                if (status !== (window.__CONSULTATION_STATUSES__?.OPEN || "open")) {
                    window.location.reload();
                }
            } catch {
                showAlert(pageAlert, "Could not update status", "danger");
                select.value = row.dataset.status;
            } finally {
                select.disabled = false;
            }
        });
    });

    async function loadAvailableSlots() {
        slotSelect.innerHTML = `<option value="">Loading…</option>`;
        try {
            const response = await fetch("/api/consultation/slots");
            const data = await response.json().catch(() => ({}));
            const slots = data.slots || [];
            if (!slots.length) {
                slotSelect.innerHTML = `<option value="">No available slots</option>`;
                return;
            }
            slotSelect.innerHTML = `<option value="">Select a slot</option>`;
            slots.forEach((slot) => {
                const option = document.createElement("option");
                option.value = String(slot.id);
                option.textContent = String(slot.starts_at);
                slotSelect.appendChild(option);
            });
        } catch {
            slotSelect.innerHTML = `<option value="">Could not load slots</option>`;
        }
    }

    document.querySelectorAll(".booking-reschedule-btn").forEach((button) => {
        button.addEventListener("click", async () => {
            const row = button.closest("tr");
            if (!row) {
                return;
            }
            hideAlert(formAlert);
            bookingIdInput.value = row.dataset.id || "";
            startsInput.value = "";
            await loadAvailableSlots();
            modal?.show();
        });
    });

    form?.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideAlert(formAlert);
        const id = bookingIdInput.value.trim();
        const slot_id = Number(slotSelect.value) || null;
        const starts_at = toApiDateTime(startsInput.value) || null;
        if (!slot_id && !starts_at) {
            showAlert(formAlert, "Pick a slot or enter a new start time", "danger");
            return;
        }

        submitButton.disabled = true;
        try {
            const response = await fetch(`/api/consultation-bookings/${id}/reschedule`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...(slot_id ? { slot_id } : {}),
                    ...(starts_at ? { starts_at } : {}),
                }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showAlert(formAlert, data.error || "Could not reschedule", "danger");
                return;
            }
            modal?.hide();
            window.location.reload();
        } catch {
            showAlert(formAlert, "Could not reschedule", "danger");
        } finally {
            submitButton.disabled = false;
        }
    });
});
