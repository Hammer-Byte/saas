(() => {
    const agentCard = document.getElementById("agent-card");
    const pageAlert = document.getElementById("server-page-alert");
    const serverId = Number(agentCard?.dataset.serverId || 0);
    if (!serverId) {
        return;
    }

    function showPageAlert(message, type) {
        if (!pageAlert) return;
        pageAlert.textContent = message;
        pageAlert.className = `alert alert-${type}`;
        pageAlert.classList.remove("d-none");
    }

    async function send(url, body) {
        const response = await fetch(url, {
            method: "PATCH",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        const data = await response.json().catch(() => ({}));
        return { ok: response.ok, data };
    }

    // ------------------------------------------------------------ approval + agent active

    document.querySelectorAll(".server-approval-btn").forEach((button) => {
        button.addEventListener("click", async () => {
            const status = button.dataset.status;
            if (status === "rejected" && !window.confirm("Reject this machine? All its services stop; the agent keeps waiting.")) {
                return;
            }
            button.disabled = true;
            try {
                const { ok, data } = await send(`/api/monitored-servers/${serverId}/approval`, { approval_status: status });
                if (!ok) {
                    showPageAlert(data.error || "Failed to update approval.", "danger");
                    button.disabled = false;
                    return;
                }
                window.location.reload();
            } catch (error) {
                console.error(error);
                showPageAlert("Failed to update approval.", "danger");
                button.disabled = false;
            }
        });
    });

    const activeToggle = document.getElementById("agent-active-toggle");
    const pollInput = document.getElementById("agent-poll-seconds");
    const retentionInput = document.getElementById("agent-log-retention-days");
    const settingsSaveBtn = document.getElementById("agent-settings-save-btn");

    activeToggle?.addEventListener("change", async () => {
        const next = activeToggle.checked;
        if (!next && !window.confirm("Pause the agent? Every service on this machine stops within about one poll interval.")) {
            activeToggle.checked = true;
            return;
        }
        activeToggle.disabled = true;
        try {
            const { ok, data } = await send(`/api/monitored-servers/${serverId}/agent`, { agent_active: next });
            if (!ok) {
                activeToggle.checked = !next;
                showPageAlert(data.error || "Failed to update agent.", "danger");
                return;
            }
            showPageAlert(data.message || "Saved.", "success");
        } catch (error) {
            console.error(error);
            activeToggle.checked = !next;
            showPageAlert("Failed to update agent.", "danger");
        } finally {
            activeToggle.disabled = false;
        }
    });

    settingsSaveBtn?.addEventListener("click", async () => {
        const pollSeconds = Number(pollInput?.value);
        const logRetentionDays = Number(retentionInput?.value);
        if (!Number.isInteger(pollSeconds) || pollSeconds < 5 || pollSeconds > 300) {
            showPageAlert("Poll interval must be an integer from 5 to 300.", "danger");
            return;
        }
        if (!Number.isInteger(logRetentionDays) || logRetentionDays < 1 || logRetentionDays > 90) {
            showPageAlert("Log retention must be an integer from 1 to 90.", "danger");
            return;
        }
        settingsSaveBtn.disabled = true;
        try {
            const { ok, data } = await send(`/api/monitored-servers/${serverId}/agent`, {
                agent_active: Boolean(activeToggle?.checked),
                poll_seconds: pollSeconds,
                log_retention_days: logRetentionDays,
            });
            if (!ok) {
                showPageAlert(data.error || "Failed to save agent settings.", "danger");
                return;
            }
            showPageAlert(data.message || "Agent settings saved.", "success");
        } catch (error) {
            console.error(error);
            showPageAlert("Failed to save agent settings.", "danger");
        } finally {
            settingsSaveBtn.disabled = false;
        }
    });

    // ------------------------------------------------------------ service forms

    const pairTemplate = document.getElementById("pair-row-template");

    function readConfig(form) {
        const config = {};
        form.querySelectorAll("[data-key]").forEach((element) => {
            const key = element.dataset.key;
            const type = element.dataset.type;
            if (type === "int") {
                config[key] = element.value.trim() === "" ? "" : Number(element.value);
            } else if (type === "text") {
                config[key] = element.value.trim();
            } else if (type === "password") {
                config[key] = element.value;
            } else if (type === "bool") {
                config[key] = element.checked;
            } else if (type === "lines") {
                config[key] = element.value
                    .split(/\r?\n/)
                    .map((line) => line.trim())
                    .filter(Boolean);
            } else if (type === "checklist") {
                config[key] = {};
                element.querySelectorAll("[data-option]").forEach((checkbox) => {
                    config[key][checkbox.dataset.option] = checkbox.checked;
                });
            } else if (type === "pairs") {
                config[key] = Array.from(element.querySelectorAll(".pair-row")).map((row) => {
                    const lines = (selector) =>
                        (row.querySelector(selector)?.value || "")
                            .split(/\r?\n/)
                            .map((line) => line.trim())
                            .filter(Boolean);
                    return {
                        share: row.querySelector(".pair-share").value.trim(),
                        local_path: row.querySelector(".pair-local").value.trim(),
                        exclude_dirs: lines(".pair-exclude-dirs"),
                        exclude_files: lines(".pair-exclude-files"),
                    };
                });
            }
        });
        return config;
    }

    /** Required-field check that gates the Enable switch; the server re-validates everything. */
    function missingRequirements(form) {
        const problems = [];
        form.querySelectorAll("[data-key]").forEach((element) => {
            const label = element.dataset.label || element.dataset.key;
            const type = element.dataset.type;
            if (type === "int") {
                const value = element.value.trim();
                const number = Number(value);
                const min = Number(element.min);
                const max = Number(element.max);
                if (value === "" || !Number.isInteger(number) || number < min || number > max) {
                    problems.push(`${label} (${min}–${max})`);
                }
            } else if (type === "text" && element.required && !element.value.trim()) {
                problems.push(label);
            } else if (type === "password" && !element.value && form.dataset.passwordSet !== "true") {
                problems.push(label);
            } else if (type === "checklist" && !element.querySelector("[data-option]:checked")) {
                problems.push(`${label} (pick at least one)`);
            } else if (type === "pairs") {
                const rows = Array.from(element.querySelectorAll(".pair-row"));
                if (!rows.length) {
                    problems.push(`${label} (add at least one)`);
                } else if (rows.some((row) => !row.querySelector(".pair-share").value.trim() || !row.querySelector(".pair-local").value.trim())) {
                    problems.push(`${label} (fill share and local path in every row)`);
                }
            }
        });
        return problems;
    }

    function refreshEnableState(form) {
        const toggle = form.querySelector(".service-enabled");
        const hint = form.querySelector(".service-enable-hint");
        const problems = missingRequirements(form);
        if (problems.length) {
            toggle.disabled = !toggle.checked;
            hint.textContent = `To enable, complete: ${problems.join(", ")}`;
            hint.classList.remove("d-none");
        } else {
            toggle.disabled = false;
            hint.classList.add("d-none");
        }
        form.querySelectorAll(".pairs-list").forEach((list) => {
            const addButton = list.closest(".col-12")?.querySelector(".pair-add-btn");
            if (addButton) {
                addButton.disabled = list.querySelectorAll(".pair-row").length >= Number(list.dataset.max || 26);
            }
        });
    }

    function setFeedback(form, message, isError) {
        const feedback = form.querySelector(".service-feedback");
        feedback.textContent = message;
        feedback.className = `service-feedback small ${isError ? "text-danger" : "text-success"}`;
    }

    document.querySelectorAll(".service-form").forEach((form) => {
        form.addEventListener("input", () => refreshEnableState(form));
        form.addEventListener("change", () => refreshEnableState(form));

        form.addEventListener("click", (event) => {
            const addButton = event.target.closest(".pair-add-btn");
            if (addButton && pairTemplate) {
                const list = addButton.closest(".col-12").querySelector(".pairs-list");
                list.appendChild(pairTemplate.content.firstElementChild.cloneNode(true));
                refreshEnableState(form);
                return;
            }
            const removeButton = event.target.closest(".pair-remove-btn");
            if (removeButton) {
                removeButton.closest(".pair-row").remove();
                refreshEnableState(form);
            }
        });

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const toggle = form.querySelector(".service-enabled");
            const enabled = toggle.checked;
            if (enabled && missingRequirements(form).length) {
                setFeedback(form, "Complete the required settings before enabling.", true);
                return;
            }
            const submit = form.querySelector("button[type=submit]");
            submit.disabled = true;
            setFeedback(form, "Saving…", false);
            try {
                const { ok, data } = await send(
                    `/api/monitored-servers/${serverId}/services/${form.dataset.service}`,
                    { enabled, config: readConfig(form) },
                );
                if (!ok) {
                    const details = Array.isArray(data.errors) && data.errors.length ? `: ${data.errors.join("; ")}` : "";
                    setFeedback(form, `${data.error || "Failed to save"}${details}`, true);
                    return;
                }
                setFeedback(form, data.message || "Saved.", false);
                setTimeout(() => window.location.reload(), 900);
            } catch (error) {
                console.error(error);
                setFeedback(form, "Failed to save.", true);
            } finally {
                submit.disabled = false;
            }
        });

        refreshEnableState(form);
    });
})();
