document.querySelectorAll(".js-retry-publish").forEach((button) => {
    button.addEventListener("click", async () => {
        const runId = Number(button.dataset.runId);
        const platforms = String(button.dataset.platforms || "")
            .split(",")
            .map((part) => part.trim())
            .filter(Boolean);
        if (!runId || !platforms.length) {
            return;
        }

        const label = platforms.length === 1 ? platforms[0] : platforms.join(", ");
        if (!window.confirm(`Retry ${label} as a new run? Successful platforms will not be re-published.`)) {
            return;
        }

        button.disabled = true;
        const previousText = button.textContent;
        button.textContent = "Queuing…";

        try {
            const response = await fetch(`/api/content-publish/runs/${runId}/retry`, {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ platforms }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data.error || `Retry failed (${response.status})`);
            }
            window.location.reload();
        } catch (error) {
            console.error(error);
            window.alert(error instanceof Error ? error.message : String(error));
            button.disabled = false;
            button.textContent = previousText;
        }
    });
});
