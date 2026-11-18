(() => {
    const modalElement = document.getElementById("run-detail-modal");
    const modalLabel = document.getElementById("run-detail-modal-label");
    const detailBody = document.getElementById("run-detail-body");

    if (!modalElement || !detailBody) {
        return;
    }

    document.addEventListener("click", (event) => {
        const button = event.target.closest(".run-detail-btn");
        if (!button) {
            return;
        }

        if (modalLabel) {
            modalLabel.textContent = button.dataset.title || "Run detail";
        }
        let detailText = "";
        try {
            detailText = decodeURIComponent(button.dataset.detail || "");
        } catch (error) {
            detailText = button.dataset.detail || "";
        }
        detailBody.textContent = detailText || "No detail available.";

        const modal = window.bootstrap?.Modal?.getOrCreateInstance(modalElement);
        modal?.show();
    });
})();
