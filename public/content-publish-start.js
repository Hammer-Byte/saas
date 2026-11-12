document.addEventListener("DOMContentLoaded", () => {
    const pageAlert = document.getElementById("content-publish-alert");
    const startButton = document.getElementById("content-publish-start-btn");
    const imageInput = document.getElementById("content-publish-image");
    const userRadios = [...document.querySelectorAll(".content-publish-user-radio")];
    const platformChecks = [...document.querySelectorAll(".content-publish-platform")];
    const instagramUserIdInput = document.getElementById("instagram-user-id");
    const youtubeChannelIdInput = document.getElementById("youtube-channel-id");
    const linkedinCompanyIdInput = document.getElementById("linkedin-company-id");

    function showAlert(message, type) {
        if (!pageAlert) {
            return;
        }
        pageAlert.textContent = message;
        pageAlert.className = `alert alert-${type}`;
    }

    function selectedUser() {
        return userRadios.find((radio) => radio.checked) || null;
    }

    function applyDestinationPrefills(user) {
        if (instagramUserIdInput) {
            instagramUserIdInput.value = user?.dataset.instagramUserId || "";
        }
        if (youtubeChannelIdInput) {
            youtubeChannelIdInput.value = user?.dataset.youtubeChannelId || "";
        }
        if (linkedinCompanyIdInput) {
            linkedinCompanyIdInput.value = user?.dataset.linkedinCompanyId || "";
        }
    }

    function syncPlatforms() {
        const user = selectedUser();
        for (const checkbox of platformChecks) {
            const platform = checkbox.dataset.platform;
            const enabled = user && user.dataset[platform] === "1";
            checkbox.disabled = !enabled;
            if (!enabled) {
                checkbox.checked = false;
            }
            const fields = document.getElementById(`platform-${platform}-fields`);
            if (fields) {
                fields.classList.toggle("d-none", !checkbox.checked);
            }
        }
    }

    for (const radio of userRadios) {
        radio.addEventListener("change", () => {
            applyDestinationPrefills(selectedUser());
            syncPlatforms();
        });
    }
    for (const checkbox of platformChecks) {
        checkbox.addEventListener("change", syncPlatforms);
    }
    syncPlatforms();

    startButton?.addEventListener("click", async () => {
        const user = selectedUser();
        if (!user) {
            showAlert("Select an automation user", "danger");
            return;
        }
        if (!imageInput?.files?.length) {
            showAlert("Select an image", "danger");
            return;
        }

        const sizeCheck = window.validateUploadFiles?.(imageInput.files[0]);
        if (sizeCheck && !sizeCheck.ok) {
            showAlert(sizeCheck.error, "danger");
            return;
        }

        const platforms = platformChecks
            .filter((checkbox) => checkbox.checked)
            .map((checkbox) => checkbox.value);
        if (!platforms.length) {
            showAlert("Select at least one platform", "danger");
            return;
        }

        const payload = {
            automation_user_id: Number(user.value),
            platforms,
            instagram_user_id: instagramUserIdInput?.value || "",
            instagram_destinations: [
                document.getElementById("instagram-dest-feed")?.checked ? "feed" : null,
                document.getElementById("instagram-dest-story")?.checked ? "story" : null,
            ].filter(Boolean),
            instagram_caption: document.getElementById("instagram-caption")?.value || "",
            youtube_channel_id: youtubeChannelIdInput?.value || "",
            youtube_destination: "community",
            youtube_title: document.getElementById("youtube-title")?.value || "",
            youtube_description: document.getElementById("youtube-description")?.value || "",
            linkedin_company_id: linkedinCompanyIdInput?.value || "",
            linkedin_caption: document.getElementById("linkedin-caption")?.value || "",
        };

        if (platforms.includes("instagram") && !payload.instagram_destinations.length) {
            showAlert("Select at least one Instagram destination (Feed and/or Story)", "danger");
            return;
        }
        if (
            platforms.includes("instagram")
            && payload.instagram_destinations.includes("feed")
            && !payload.instagram_caption.trim()
        ) {
            showAlert("Instagram caption is required for feed posts", "danger");
            return;
        }
        if (platforms.includes("instagram") && !/^\d{5,}$/.test(payload.instagram_user_id.trim())) {
            showAlert("Instagram user id is required", "danger");
            return;
        }
        if (platforms.includes("youtube") && !payload.youtube_title.trim()) {
            showAlert("YouTube title is required", "danger");
            return;
        }
        if (
            platforms.includes("youtube") &&
            !/^UC[\w-]+$/i.test(payload.youtube_channel_id.trim()) &&
            !/channel\/UC[\w-]+/i.test(payload.youtube_channel_id.trim())
        ) {
            showAlert("YouTube channel id (UC… or channel URL) is required", "danger");
            return;
        }
        if (platforms.includes("linkedin") && !payload.linkedin_caption.trim()) {
            showAlert("LinkedIn caption is required", "danger");
            return;
        }
        if (
            platforms.includes("linkedin") &&
            !/^\d+$/.test(payload.linkedin_company_id.trim()) &&
            !/company\/\d+/i.test(payload.linkedin_company_id.trim())
        ) {
            showAlert("LinkedIn page / company id is required", "danger");
            return;
        }

        startButton.disabled = true;
        try {
            const formData = new FormData();
            formData.append("file", imageInput.files[0]);
            const mediaResponse = await fetch("/api/media", {
                method: "POST",
                credentials: "same-origin",
                body: formData,
            });
            const mediaData = await mediaResponse.json().catch(() => ({}));
            if (!mediaResponse.ok) {
                showAlert(mediaData.error || "Image upload failed", "danger");
                return;
            }

            const response = await fetch("/api/content-publish/start", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...payload,
                    media_id: Number(mediaData.id),
                }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showAlert(data.error || "Failed to start publish", "danger");
                return;
            }
            showAlert(data.message || "Publish queued", "success");
            window.location.href = "/app/selenium?source=content_publish";
        } catch (error) {
            showAlert(error instanceof Error ? error.message : String(error), "danger");
        } finally {
            startButton.disabled = false;
        }
    });
});
