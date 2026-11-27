document.addEventListener("DOMContentLoaded", () => {
    const pageAlert = document.getElementById("topics-alert");
    const openAddButton = document.getElementById("open-add-topic-btn");
    const modalElement = document.getElementById("topic-modal");
    const form = document.getElementById("topic-form");
    const formAlert = document.getElementById("topic-form-alert");
    const submitButton = document.getElementById("topic-submit-btn");
    const idInput = document.getElementById("topic-id");
    const titleInput = document.getElementById("topic-title");
    const descriptionInput = document.getElementById("topic-description");
    const activeInput = document.getElementById("topic-active");
    const modalTitle = document.getElementById("topic-modal-label");
    const modal = modalElement ? bootstrap.Modal.getOrCreateInstance(modalElement) : null;

    function showAlert(element, message, type) {
        window.showAlert?.(element, message, type);
    }

    function hideAlert(element) {
        window.hideAlert?.(element);
    }

    function resetForm() {
        hideAlert(formAlert);
        idInput.value = "";
        titleInput.value = "";
        descriptionInput.value = "";
        activeInput.checked = true;
        modalTitle.textContent = "Add topic";
        submitButton.textContent = "Save";
    }

    openAddButton?.addEventListener("click", () => {
        resetForm();
    });

    document.querySelectorAll(".topic-edit-btn").forEach((button) => {
        button.addEventListener("click", () => {
            const row = button.closest("tr");
            if (!row) {
                return;
            }
            resetForm();
            idInput.value = row.dataset.id || "";
            titleInput.value = row.dataset.title || "";
            descriptionInput.value = row.dataset.description || "";
            activeInput.checked = row.dataset.active === "1";
            modalTitle.textContent = "Edit topic";
            modal?.show();
        });
    });

    form?.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideAlert(formAlert);
        const id = idInput.value.trim();
        const payload = {
            title: titleInput.value.trim(),
            description: descriptionInput.value.trim(),
            active: !!activeInput.checked,
        };

        submitButton.disabled = true;
        try {
            const response = await fetch(
                id ? `/api/consultation-topics/${id}` : "/api/consultation-topics",
                {
                    method: id ? "PATCH" : "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                },
            );
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showAlert(formAlert, data.error || "Could not save topic", "danger");
                return;
            }
            modal?.hide();
            showAlert(pageAlert, data.message || "Saved", "success");
            window.location.reload();
        } catch {
            showAlert(formAlert, "Could not save topic", "danger");
        } finally {
            submitButton.disabled = false;
        }
    });
});
