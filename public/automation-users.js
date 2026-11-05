document.addEventListener("DOMContentLoaded", () => {
    const pageAlert = document.getElementById("automation-users-alert");
    const tableWrap = document.getElementById("automation-users-table-wrap");
    const emptyState = document.getElementById("automation-users-empty");
    const tableBody = document.getElementById("automation-users-tbody");
    const form = document.getElementById("automation-user-form");
    const idInput = document.getElementById("automation-user-id");
    const nameInput = document.getElementById("automation-user-name");
    const facebookCookieInput = document.getElementById("automation-user-facebook-cookie");
    const instagramCookieInput = document.getElementById("automation-user-instagram-cookie");
    const youtubeCookieInput = document.getElementById("automation-user-youtube-cookie");
    const youtubeChannelIdInput = document.getElementById("automation-user-youtube-channel-id");
    const linkedinCookieInput = document.getElementById("automation-user-linkedin-cookie");
    const linkedinCompanyIdInput = document.getElementById("automation-user-linkedin-company-id");
    const submitButton = document.getElementById("automation-user-submit-btn");

    function showAlert(message, type) {
        if (!pageAlert) {
            return;
        }
        pageAlert.textContent = message;
        pageAlert.className = `alert alert-${type}`;
    }

    function resetForm() {
        idInput.value = "";
        nameInput.value = "";
        facebookCookieInput.value = "";
        instagramCookieInput.value = "";
        youtubeCookieInput.value = "";
        if (youtubeChannelIdInput) {
            youtubeChannelIdInput.value = "";
        }
        linkedinCookieInput.value = "";
        if (linkedinCompanyIdInput) {
            linkedinCompanyIdInput.value = "";
        }
        submitButton.textContent = "Add user";
    }

    form?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const userId = Number(idInput.value || 0);
        const isEdit = userId >= 1;
        const payload = {
            name: nameInput.value.trim(),
            facebook_cookie: facebookCookieInput.value.trim(),
            instagram_cookie: instagramCookieInput.value.trim(),
            youtube_cookie: youtubeCookieInput.value.trim(),
            youtube_channel_id: youtubeChannelIdInput?.value.trim() || "",
            linkedin_cookie: linkedinCookieInput.value.trim(),
            linkedin_company_id: linkedinCompanyIdInput?.value.trim() || "",
        };

        if (!payload.name) {
            showAlert("Name is required", "danger");
            return;
        }
        if (
            !payload.facebook_cookie &&
            !payload.instagram_cookie &&
            !payload.youtube_cookie &&
            !payload.linkedin_cookie
        ) {
            showAlert("At least one platform cookie is required", "danger");
            return;
        }
        if (
            payload.youtube_cookie &&
            !/^UC[\w-]+$/i.test(payload.youtube_channel_id) &&
            !/channel\/UC[\w-]+/i.test(payload.youtube_channel_id)
        ) {
            showAlert("YouTube channel id (UC… or channel URL) is required with a YouTube cookie", "danger");
            return;
        }
        if (
            payload.linkedin_cookie &&
            !/^\d+$/.test(payload.linkedin_company_id) &&
            !/company\/\d+/i.test(payload.linkedin_company_id)
        ) {
            showAlert("LinkedIn page / company id is required with a LinkedIn cookie", "danger");
            return;
        }

        submitButton.disabled = true;
        try {
            const response = await fetch(
                isEdit ? `/api/automation-users/${userId}` : "/api/automation-users",
                {
                    method: isEdit ? "PATCH" : "POST",
                    credentials: "same-origin",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                },
            );
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showAlert(data.error || "Request failed", "danger");
                return;
            }
            window.location.reload();
        } catch (error) {
            showAlert(error instanceof Error ? error.message : String(error), "danger");
        } finally {
            submitButton.disabled = false;
        }
    });

    tableBody?.addEventListener("click", async (event) => {
        const editButton = event.target.closest(".automation-user-edit-btn");
        if (editButton) {
            const row = editButton.closest("tr");
            if (!row) {
                return;
            }
            idInput.value = row.dataset.id || "";
            nameInput.value = row.dataset.name || "";
            facebookCookieInput.value = row.dataset.facebookCookie || "";
            instagramCookieInput.value = row.dataset.instagramCookie || "";
            youtubeCookieInput.value = row.dataset.youtubeCookie || "";
            if (youtubeChannelIdInput) {
                youtubeChannelIdInput.value = row.dataset.youtubeChannelId || "";
            }
            linkedinCookieInput.value = row.dataset.linkedinCookie || "";
            if (linkedinCompanyIdInput) {
                linkedinCompanyIdInput.value = row.dataset.linkedinCompanyId || "";
            }
            submitButton.textContent = "Save changes";
            nameInput.focus();
            return;
        }

        const deleteButton = event.target.closest(".automation-user-delete-btn");
        if (!deleteButton) {
            return;
        }
        const userId = Number(deleteButton.dataset.id || 0);
        if (!(userId >= 1)) {
            return;
        }
        const confirmed = await showConfirm({
            title: "Delete automation user?",
            description: "This removes the account and its stored cookies.",
            choices: [
                { label: "Cancel", value: false, className: "btn-outline-secondary" },
                { label: "Delete", value: true, className: "btn-danger" },
            ],
        });
        if (!confirmed) {
            return;
        }
        try {
            const response = await fetch(`/api/automation-users/${userId}`, {
                method: "DELETE",
                credentials: "same-origin",
            });
            if (!response.ok && response.status !== 204) {
                const data = await response.json().catch(() => ({}));
                showAlert(data.error || "Delete failed", "danger");
                return;
            }
            window.location.reload();
        } catch (error) {
            showAlert(error instanceof Error ? error.message : String(error), "danger");
        }
    });

    if (!tableBody?.children.length) {
        tableWrap?.classList.add("d-none");
        emptyState?.classList.remove("d-none");
    }
});
