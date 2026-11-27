document.addEventListener("DOMContentLoaded", () => {
    const pageAlert = document.getElementById("slots-alert");
    const form = document.getElementById("slot-form");
    const formAlert = document.getElementById("slot-form-alert");
    const submitButton = document.getElementById("slot-submit-btn");
    const startsInput = document.getElementById("slot-starts-at");
    const modalElement = document.getElementById("slot-modal");
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

    form?.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideAlert(formAlert);
        const starts_at = toApiDateTime(startsInput.value);
        if (!starts_at) {
            showAlert(formAlert, "Start time is required", "danger");
            return;
        }

        submitButton.disabled = true;
        try {
            const response = await fetch("/api/consultation-slots", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ starts_at }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showAlert(formAlert, data.error || "Could not create slot", "danger");
                return;
            }
            modal?.hide();
            window.location.reload();
        } catch {
            showAlert(formAlert, "Could not create slot", "danger");
        } finally {
            submitButton.disabled = false;
        }
    });

    document.querySelectorAll(".slot-toggle-btn").forEach((button) => {
        button.addEventListener("click", async () => {
            const row = button.closest("tr");
            if (!row || row.dataset.canEdit !== "1") {
                return;
            }
            const id = row.dataset.id;
            const nextActive = row.dataset.active !== "1";
            button.disabled = true;
            try {
                const response = await fetch(`/api/consultation-slots/${id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ active: nextActive }),
                });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    showAlert(pageAlert, data.error || "Could not update slot", "danger");
                    return;
                }
                window.location.reload();
            } catch {
                showAlert(pageAlert, "Could not update slot", "danger");
            } finally {
                button.disabled = false;
            }
        });
    });
});
