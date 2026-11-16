(() => {
    const page = document.getElementById("job-application-page");
    const pageAlert = document.getElementById("job-application-alert");
    const applicantId = Number(page?.dataset.applicantId || 0);
    const shortlistBtn = document.getElementById("shortlist-applicant-btn");
    const selectBtn = document.getElementById("select-applicant-btn");
    const rejectBtn = document.getElementById("reject-applicant-btn");

    const interviewForm = document.getElementById("interview-form");
    const interviewFormAlert = document.getElementById("interview-form-alert");
    const interviewDate = document.getElementById("interview-date");
    const interviewTime = document.getElementById("interview-time");
    const interviewInterviewer = document.getElementById("interview-interviewer");
    const interviewMeetingLink = document.getElementById("interview-meeting-link");
    const interviewSubmitBtn = document.getElementById("interview-submit-btn");

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

    async function setDecision(decision) {
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
                body: JSON.stringify({ id: applicantId, decision }),
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

    shortlistBtn?.addEventListener("click", async () => {
        const confirmed = await window.showConfirm({
            title: "Mark shortlisted?",
            description: "The applicant will receive a shortlist email.",
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
                body: JSON.stringify({ ids: [applicantId] }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showAlert(pageAlert, data.error || "Failed to shortlist applicant.", "danger");
                return;
            }
            window.location.reload();
        } catch (error) {
            showAlert(pageAlert, error?.message || "Failed to shortlist applicant.", "danger");
        }
    });

    selectBtn?.addEventListener("click", () => setDecision("selected"));
    rejectBtn?.addEventListener("click", () => setDecision("rejected"));

    interviewForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideAlert(interviewFormAlert);

        const date = String(interviewDate?.value || "").trim();
        const time = String(interviewTime?.value || "").trim();
        const interviewerUserId = Number(interviewInterviewer?.value || 0);
        const meetingLink = String(interviewMeetingLink?.value || "").trim();

        if (!date || !time || !meetingLink || !interviewerUserId) {
            showAlert(
                interviewFormAlert,
                "Date, time, interviewer, and meeting link are required.",
                "danger",
            );
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
                    id: applicantId,
                    interviewer_user_id: interviewerUserId,
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

    document.querySelectorAll(".save-interview-outcome-btn").forEach((button) => {
        button.addEventListener("click", async () => {
            const row = button.closest("tr[data-interview-id]");
            if (!row) return;
            const interviewId = Number(row.dataset.interviewId || 0);
            const outcomeInput = row.querySelector(".interview-outcome-input");
            const outcome = String(outcomeInput?.value || "").trim() || null;

            hideAlert(pageAlert);
            button.disabled = true;
            try {
                const response = await fetch("/api/job-applicant-interviews", {
                    method: "PATCH",
                    credentials: "same-origin",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: interviewId, outcome }),
                });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    showAlert(pageAlert, data.error || "Failed to save outcome.", "danger");
                    return;
                }
                showAlert(pageAlert, "Interview outcome saved.", "success");
            } catch (error) {
                showAlert(pageAlert, error?.message || "Failed to save outcome.", "danger");
            } finally {
                button.disabled = false;
            }
        });
    });
})();
