(() => {
    const pageAlert = document.getElementById("job-alert");
    const searchInput = document.getElementById("applicants-search");
    const tableBody = document.getElementById("applicants-tbody");
    const emptyState = document.getElementById("applicants-empty");
    const tableWrap = document.getElementById("applicants-table-wrap");
    const selectAllCheckbox = document.getElementById("applicants-select-all");
    const bulkBar = document.getElementById("applicants-bulk-bar");
    const selectedCountLabel = document.getElementById("applicants-selected-count");
    const bulkShortlistBtn = document.getElementById("applicants-bulk-shortlist-btn");
    const bulkClearBtn = document.getElementById("applicants-bulk-clear-btn");

    const interviewModalElement = document.getElementById("interview-modal");
    const interviewForm = document.getElementById("interview-form");
    const interviewFormAlert = document.getElementById("interview-form-alert");
    const interviewApplicantId = document.getElementById("interview-applicant-id");
    const interviewApplicantLabel = document.getElementById("interview-applicant-label");
    const interviewDate = document.getElementById("interview-date");
    const interviewTime = document.getElementById("interview-time");
    const interviewMeetingLink = document.getElementById("interview-meeting-link");
    const interviewSubmitBtn = document.getElementById("interview-submit-btn");

    const outcomeModalElement = document.getElementById("outcome-modal");
    const outcomeForm = document.getElementById("outcome-form");
    const outcomeFormAlert = document.getElementById("outcome-form-alert");
    const outcomeApplicantId = document.getElementById("outcome-applicant-id");
    const outcomeNotes = document.getElementById("outcome-notes");
    const outcomeSubmitBtn = document.getElementById("outcome-submit-btn");

    function showAlert(target, message, type) {
        if (!target) return;
        target.textContent = message;
        target.className = `alert alert-${type}`;
        target.classList.remove("d-none");
    }

    function hideAlert(target) {
        if (!target) return;
        target.classList.add("d-none");
        target.textContent = "";
    }

    function visibleRows() {
        if (!tableBody) return [];
        return [...tableBody.querySelectorAll("tr[data-id]")].filter(
            (row) => !row.classList.contains("d-none"),
        );
    }

    function selectedCheckboxes() {
        if (!tableBody) return [];
        return [...tableBody.querySelectorAll(".applicant-select:checked")].filter(
            (input) => !input.closest("tr")?.classList.contains("d-none"),
        );
    }

    function syncBulkBar() {
        const selected = selectedCheckboxes();
        const count = selected.length;
        if (selectedCountLabel) {
            selectedCountLabel.textContent = `${count} selected`;
        }
        bulkBar?.classList.toggle("d-none", count === 0);
        if (bulkShortlistBtn) bulkShortlistBtn.disabled = count === 0;

        const visible = visibleRows();
        const visibleChecked = visible.filter((row) =>
            row.querySelector(".applicant-select")?.checked,
        );
        if (selectAllCheckbox) {
            selectAllCheckbox.checked =
                visible.length > 0 && visibleChecked.length === visible.length;
            selectAllCheckbox.indeterminate =
                visibleChecked.length > 0 && visibleChecked.length < visible.length;
        }
    }

    function applySearch() {
        if (!tableBody) return;
        const query = String(searchInput?.value || "")
            .trim()
            .toLowerCase();
        let visibleCount = 0;
        for (const row of tableBody.querySelectorAll("tr[data-id]")) {
            const haystack = [
                row.dataset.name || "",
                row.dataset.email || "",
                row.dataset.phone || "",
                row.dataset.city || "",
                row.dataset.state || "",
            ]
                .join(" ")
                .toLowerCase();
            const match = !query || haystack.includes(query);
            row.classList.toggle("d-none", !match);
            if (!match) {
                const checkbox = row.querySelector(".applicant-select");
                if (checkbox) checkbox.checked = false;
            }
            if (match) visibleCount += 1;
        }
        emptyState?.classList.toggle("d-none", visibleCount > 0);
        tableWrap?.classList.toggle("d-none", visibleCount === 0 && !!query);
        syncBulkBar();
    }

    function fillInterviewForm(row) {
        hideAlert(interviewFormAlert);
        if (interviewApplicantId) interviewApplicantId.value = row.dataset.id || "";
        if (interviewApplicantLabel) {
            interviewApplicantLabel.textContent = `${row.dataset.name || ""} · ${row.dataset.email || ""}`;
        }
        if (interviewMeetingLink) {
            interviewMeetingLink.value = row.dataset.meetingLink || "";
        }

        const existing = row.dataset.interviewAt || "";
        if (existing && window.getReadableDate) {
            if (interviewDate) {
                interviewDate.value = window.getReadableDate("YYYY-MM-DD", existing) || "";
            }
            if (interviewTime) {
                interviewTime.value = window.getReadableDate("HH:mm", existing) || "";
            }
        } else {
            if (interviewDate) interviewDate.value = "";
            if (interviewTime) interviewTime.value = "";
        }
    }

    searchInput?.addEventListener("input", applySearch);

    selectAllCheckbox?.addEventListener("change", () => {
        const checked = !!selectAllCheckbox.checked;
        for (const row of visibleRows()) {
            const checkbox = row.querySelector(".applicant-select");
            if (checkbox) checkbox.checked = checked;
        }
        syncBulkBar();
    });

    tableBody?.addEventListener("change", (event) => {
        if (event.target.classList.contains("applicant-select")) {
            syncBulkBar();
        }
    });

    bulkClearBtn?.addEventListener("click", () => {
        for (const checkbox of tableBody?.querySelectorAll(".applicant-select:checked") || []) {
            checkbox.checked = false;
        }
        if (selectAllCheckbox) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        }
        syncBulkBar();
    });

    bulkShortlistBtn?.addEventListener("click", async () => {
        const ids = selectedCheckboxes().map((input) => Number(input.value));
        if (!ids.length) return;

        const confirmed = await window.showConfirm({
            title: "Mark shortlisted?",
            description: "Selected applicants who are not already shortlisted will be emailed.",
            choices: [
                { label: "Cancel", value: false, className: "btn-outline-secondary" },
                { label: "Mark shortlisted", value: true, className: "btn-primary" },
            ],
        });
        if (!confirmed) return;

        hideAlert(pageAlert);
        try {
            const response = await fetch("/api/job-applications/shortlist", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showAlert(pageAlert, data.error || "Failed to shortlist applicants.", "danger");
                return;
            }
            window.location.reload();
        } catch (error) {
            showAlert(pageAlert, error?.message || "Failed to shortlist applicants.", "danger");
        }
    });

    tableBody?.addEventListener("click", async (event) => {
        const row = event.target.closest("tr[data-id]");
        if (!row) return;

        const interviewButton = event.target.closest(".applicant-interview-btn");
        const outcomeButton = event.target.closest(".applicant-outcome-btn");
        const selectButton = event.target.closest(".applicant-select-btn");
        const rejectButton = event.target.closest(".applicant-reject-btn");

        if (interviewButton) {
            fillInterviewForm(row);
            if (interviewModalElement && window.bootstrap?.Modal) {
                window.bootstrap.Modal.getOrCreateInstance(interviewModalElement).show();
            }
            return;
        }

        if (outcomeButton) {
            hideAlert(outcomeFormAlert);
            if (outcomeApplicantId) outcomeApplicantId.value = row.dataset.id || "";
            if (outcomeNotes) outcomeNotes.value = row.dataset.outcome || "";
            if (outcomeModalElement && window.bootstrap?.Modal) {
                window.bootstrap.Modal.getOrCreateInstance(outcomeModalElement).show();
            }
            return;
        }

        if (selectButton || rejectButton) {
            const decision = selectButton ? "selected" : "rejected";
            const confirmed = await window.showConfirm({
                title: decision === "selected" ? "Mark selected?" : "Mark rejected?",
                description: `Set this application as ${decision}.`,
                choices: [
                    { label: "Cancel", value: false, className: "btn-outline-secondary" },
                    {
                        label: decision === "selected" ? "Selected" : "Reject",
                        value: true,
                        className: decision === "selected" ? "btn-success" : "btn-danger",
                    },
                ],
            });
            if (!confirmed) return;

            hideAlert(pageAlert);
            try {
                const response = await fetch("/api/job-applications", {
                    method: "PATCH",
                    credentials: "same-origin",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        id: Number(row.dataset.id),
                        decision,
                    }),
                });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    showAlert(pageAlert, data.error || "Failed to update decision.", "danger");
                    return;
                }
                window.location.reload();
            } catch (error) {
                showAlert(pageAlert, error?.message || "Failed to update decision.", "danger");
            }
        }
    });

    interviewForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideAlert(interviewFormAlert);

        const id = Number(interviewApplicantId?.value || 0);
        const date = String(interviewDate?.value || "").trim();
        const time = String(interviewTime?.value || "").trim();
        const meetingLink = String(interviewMeetingLink?.value || "").trim();

        if (!id || !date || !time || !meetingLink) {
            showAlert(interviewFormAlert, "Date, time, and meeting link are required.", "danger");
            return;
        }

        const interviewAt = window.getWritableDate
            ? window.getWritableDate("YYYY-MM-DD HH:mm:ss", `${date} ${time}:00`)
            : `${date} ${time}:00`;

        if (interviewSubmitBtn) interviewSubmitBtn.disabled = true;
        try {
            const response = await fetch("/api/job-applications/interview", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id,
                    interview_at: interviewAt,
                    meeting_link: meetingLink,
                }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showAlert(
                    interviewFormAlert,
                    data.error || "Failed to send interview email.",
                    "danger",
                );
                return;
            }
            window.location.reload();
        } catch (error) {
            showAlert(
                interviewFormAlert,
                error?.message || "Failed to send interview email.",
                "danger",
            );
        } finally {
            if (interviewSubmitBtn) interviewSubmitBtn.disabled = false;
        }
    });

    outcomeForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideAlert(outcomeFormAlert);

        const id = Number(outcomeApplicantId?.value || 0);
        if (!id) {
            showAlert(outcomeFormAlert, "Application not found.", "danger");
            return;
        }

        if (outcomeSubmitBtn) outcomeSubmitBtn.disabled = true;
        try {
            const response = await fetch("/api/job-applications", {
                method: "PATCH",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id,
                    interview_outcome: String(outcomeNotes?.value || "").trim() || null,
                }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showAlert(outcomeFormAlert, data.error || "Failed to save outcome.", "danger");
                return;
            }
            window.location.reload();
        } catch (error) {
            showAlert(outcomeFormAlert, error?.message || "Failed to save outcome.", "danger");
        } finally {
            if (outcomeSubmitBtn) outcomeSubmitBtn.disabled = false;
        }
    });

    syncBulkBar();
})();
