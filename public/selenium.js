(() => {
    const page = window.__SELENIUM_PAGE__ || {};
    const pipelineAlert = document.getElementById("pipeline-alert");
    const jobsTbody = document.getElementById("jobs-tbody");
    const pauseButton = document.getElementById("pause-pipeline-btn");
    const resumeButton = document.getElementById("resume-pipeline-btn");
    const refreshButton = document.getElementById("refresh-jobs-btn");
    const saveMaxButton = document.getElementById("save-max-parallel");
    const maxParallelInput = document.getElementById("max-parallel-input");
    const dateRangeForm = document.getElementById("date-range-form");
    const fromInput = document.getElementById("from");
    const toInput = document.getElementById("to");

    let statusFilter = page.statusFilter || "all";

    function showAlert(message, kind = "danger") {
        if (!pipelineAlert) {
            return;
        }
        pipelineAlert.textContent = message;
        pipelineAlert.className = `alert alert-${kind} mt-3 mb-0`;
    }

    function hideAlert() {
        if (!pipelineAlert) {
            return;
        }
        pipelineAlert.className = "alert mt-3 mb-0 d-none";
        pipelineAlert.textContent = "";
    }

    function writableDate(input) {
        if (typeof getWritableDate === "function") {
            return getWritableDate("YYYY-MM-DD", input?.dataset?.dateValue || input?.value);
        }
        return input?.dataset?.dateValue || input?.value || "";
    }

    function updatePipelineUi(pipeline) {
        if (!pipeline) {
            return;
        }
        const statusLabel = document.getElementById("pipeline-status-label");
        const active = document.getElementById("pipeline-active");
        const max = document.getElementById("pipeline-max");
        const runningJobs = document.getElementById("pipeline-running-jobs");
        if (statusLabel) {
            statusLabel.textContent = pipeline.paused ? "Paused" : "Running";
        }
        if (active) {
            active.textContent = pipeline.active_workers || 0;
        }
        if (max) {
            max.textContent = pipeline.max_parallel || 1;
        }
        if (runningJobs) {
            runningJobs.textContent = pipeline.running_jobs || 0;
        }
        if (maxParallelInput) {
            maxParallelInput.value = pipeline.max_parallel || 1;
        }
        if (pauseButton) {
            pauseButton.hidden = !!pipeline.paused;
        }
        if (resumeButton) {
            resumeButton.hidden = !pipeline.paused;
        }
    }

    function updateCounts(counts) {
        if (!counts) {
            return;
        }
        for (const [key, value] of Object.entries(counts)) {
            document.querySelectorAll(`[data-count="${key}"]`).forEach((element) => {
                element.textContent = value || 0;
            });
        }
    }

    function statusBadgeClass(status) {
        switch (String(status || "").toLowerCase()) {
            case "queued":
                return "text-bg-secondary";
            case "running":
                return "text-bg-primary";
            case "completed":
                return "text-bg-success";
            case "failed":
                return "text-bg-danger";
            case "stopped":
                return "text-bg-warning";
            case "skipped":
                return "text-bg-dark";
            default:
                return "text-bg-secondary";
        }
    }

    function renderJobs(jobs) {
        if (!jobsTbody) {
            return;
        }
        jobsTbody.innerHTML = "";
        if (!jobs.length) {
            const emptyRow = document.createElement("tr");
            emptyRow.innerHTML =
                '<td colspan="6" class="text-secondary text-center py-4">No jobs in this range.</td>';
            jobsTbody.appendChild(emptyRow);
            return;
        }

        for (const job of jobs) {
            const row = document.createElement("tr");
            row.dataset.jobId = job.id;
            row.dataset.status = job.status;

            const createdCell = document.createElement("td");
            const createdSpan = document.createElement("span");
            createdSpan.dataset.readableDate = "";
            createdSpan.dataset.dateFormat = "DD/MM/YYYY HH:mm";
            createdSpan.dataset.dateValue = job.created_on || "";
            createdSpan.textContent = job.created_on || "";
            createdCell.appendChild(createdSpan);

            const typeCell = document.createElement("td");
            typeCell.innerHTML = `<div class="fw-semibold"></div><div class="text-secondary small"></div>`;
            typeCell.querySelector(".fw-semibold").textContent = job.type || "";
            typeCell.querySelector(".small").textContent = job.source || "";

            const titleCell = document.createElement("td");
            titleCell.textContent = job.title || "";

            const statusCell = document.createElement("td");
            statusCell.innerHTML = `<span class="badge text-uppercase ${statusBadgeClass(job.status)}"></span>`;
            statusCell.querySelector(".badge").textContent = job.status || "";

            const outcomeCell = document.createElement("td");
            outcomeCell.className = "small";
            if (job.result_summary) {
                const summary = document.createElement("div");
                summary.textContent = job.result_summary;
                outcomeCell.appendChild(summary);
            }
            if (job.error_message) {
                const error = document.createElement("div");
                error.className = "text-danger";
                error.textContent = job.error_message;
                outcomeCell.appendChild(error);
            }
            if (!job.result_summary && !job.error_message) {
                outcomeCell.innerHTML = '<span class="text-secondary">—</span>';
            }

            const actionsCell = document.createElement("td");
            actionsCell.className = "text-end text-nowrap";
            const status = String(job.status || "").toLowerCase();
            if (status === "queued") {
                const skipButton = document.createElement("button");
                skipButton.type = "button";
                skipButton.className = "btn btn-sm btn-outline-warning js-skip-job";
                skipButton.dataset.id = job.id;
                skipButton.textContent = "Skip";
                actionsCell.appendChild(skipButton);
            } else if (status === "running") {
                const stopButton = document.createElement("button");
                stopButton.type = "button";
                stopButton.className = "btn btn-sm btn-outline-danger js-stop-job";
                stopButton.dataset.id = job.id;
                stopButton.textContent = "Stop";
                actionsCell.appendChild(stopButton);
            } else {
                actionsCell.innerHTML = '<span class="text-secondary">—</span>';
            }

            row.appendChild(createdCell);
            row.appendChild(typeCell);
            row.appendChild(titleCell);
            row.appendChild(statusCell);
            row.appendChild(outcomeCell);
            row.appendChild(actionsCell);
            jobsTbody.appendChild(row);
        }

        if (typeof applyReadableDates === "function") {
            applyReadableDates(jobsTbody);
        } else {
            jobsTbody.querySelectorAll("[data-readable-date]").forEach((element) => {
                if (typeof getReadableDate === "function") {
                    element.textContent = getReadableDate(
                        element.dataset.dateFormat || "DD/MM/YYYY HH:mm",
                        element.dataset.dateValue,
                    );
                }
            });
        }
    }

    function highlightFilters() {
        document.querySelectorAll(".selenium-status-filter").forEach((button) => {
            const isActive = button.dataset.status === statusFilter;
            if (button.classList.contains("btn")) {
                button.classList.toggle("btn-primary", isActive);
                button.classList.toggle("btn-outline-secondary", !isActive);
            } else {
                button.classList.toggle("border", isActive);
                button.classList.toggle("border-primary", isActive);
            }
        });
    }

    async function loadJobs() {
        hideAlert();
        const from = writableDate(fromInput) || page.from;
        const to = writableDate(toInput) || page.to;
        const params = new URLSearchParams({ from, to });
        if (statusFilter && statusFilter !== "all") {
            params.set("status", statusFilter);
        }

        const response = await fetch(`/api/selenium/jobs?${params.toString()}`, {
            credentials: "same-origin",
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            showAlert(data.error || "Failed to load jobs");
            return;
        }

        updatePipelineUi(data.pipeline);
        updateCounts(data.counts);
        renderJobs(data.jobs || []);
        highlightFilters();
    }

    async function postAction(url, body) {
        hideAlert();
        const response = await fetch(url, {
            method: "POST",
            credentials: "same-origin",
            headers: body ? { "Content-Type": "application/json" } : undefined,
            body: body ? JSON.stringify(body) : undefined,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            showAlert(data.error || "Action failed");
            return null;
        }
        return data;
    }

    pauseButton?.addEventListener("click", async () => {
        const confirmed =
            typeof showConfirm === "function"
                ? await showConfirm({
                      title: "Pause pipeline?",
                      description:
                          "Queued jobs will wait until you resume. Running jobs keep going unless stopped.",
                      choices: [
                          { label: "Cancel", value: false, variant: "outline-secondary" },
                          { label: "Pause", value: true, variant: "warning" },
                      ],
                  })
                : true;
        if (!confirmed) {
            return;
        }
        const data = await postAction("/api/selenium/pause");
        if (data) {
            updatePipelineUi(data);
            showAlert("Pipeline paused", "warning");
        }
    });

    resumeButton?.addEventListener("click", async () => {
        const data = await postAction("/api/selenium/resume");
        if (data) {
            updatePipelineUi(data);
            showAlert("Pipeline resumed", "success");
            await loadJobs();
        }
    });

    saveMaxButton?.addEventListener("click", async () => {
        const maxParallel = Number(maxParallelInput?.value || 1);
        const response = await fetch("/api/selenium/max-parallel", {
            method: "PATCH",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ max_parallel: maxParallel }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            showAlert(data.error || "Failed to update max parallel");
            return;
        }
        updatePipelineUi(data);
        showAlert(`Max parallel set to ${data.max_parallel}`, "success");
        await loadJobs();
    });

    refreshButton?.addEventListener("click", () => {
        loadJobs();
    });

    dateRangeForm?.addEventListener("submit", (event) => {
        event.preventDefault();
        loadJobs();
    });

    document.querySelectorAll(".selenium-status-filter").forEach((button) => {
        button.addEventListener("click", () => {
            statusFilter = button.dataset.status || "all";
            highlightFilters();
            loadJobs();
        });
    });

    jobsTbody?.addEventListener("click", async (event) => {
        const skipButton = event.target.closest(".js-skip-job");
        const stopButton = event.target.closest(".js-stop-job");
        if (skipButton) {
            const confirmed =
                typeof showConfirm === "function"
                    ? await showConfirm({
                          title: "Skip this job?",
                          description: "It will be marked skipped and will not run.",
                          choices: [
                              { label: "Cancel", value: false, variant: "outline-secondary" },
                              { label: "Skip", value: true, variant: "warning" },
                          ],
                      })
                    : true;
            if (!confirmed) {
                return;
            }
            const data = await postAction(`/api/selenium/jobs/${skipButton.dataset.id}/skip`);
            if (data) {
                showAlert("Job skipped", "warning");
                await loadJobs();
            }
            return;
        }
        if (stopButton) {
            const confirmed =
                typeof showConfirm === "function"
                    ? await showConfirm({
                          title: "Stop this job?",
                          description:
                              "The worker will abort as soon as it can check the stop flag.",
                          choices: [
                              { label: "Cancel", value: false, variant: "outline-secondary" },
                              { label: "Stop", value: true, variant: "danger" },
                          ],
                      })
                    : true;
            if (!confirmed) {
                return;
            }
            const data = await postAction(`/api/selenium/jobs/${stopButton.dataset.id}/stop`);
            if (data) {
                showAlert("Stop requested", "warning");
                await loadJobs();
            }
        }
    });

    highlightFilters();
    setInterval(() => {
        loadJobs().catch(() => {});
    }, 15000);
})();
