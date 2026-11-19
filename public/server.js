(() => {
    const modalElement = document.getElementById("run-detail-modal");
    const modalLabel = document.getElementById("run-detail-modal-label");
    const detailBody = document.getElementById("run-detail-body");

    if (modalElement && detailBody) {
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
    }

    const projectCard = document.getElementById("server-project-card");
    const projectSelect = document.getElementById("server-project-select");
    const projectSaveBtn = document.getElementById("server-project-save-btn");
    const projectFeedback = document.getElementById("server-project-feedback");

    if (projectCard && projectSelect && projectSaveBtn) {
        function showProjectFeedback(message, isError) {
            if (!projectFeedback) return;
            projectFeedback.textContent = message;
            projectFeedback.className = `small ${isError ? "text-danger" : "text-success"}`;
            projectFeedback.classList.remove("d-none");
        }

        projectSaveBtn.addEventListener("click", async () => {
            const id = Number(projectCard.dataset.id);
            const name = (projectCard.dataset.name || "").trim();
            const location = (projectCard.dataset.location || "").trim();
            const notes = (projectCard.dataset.notes || "").trim() || null;
            const active = projectCard.dataset.active === "1";
            const projectValue = projectSelect.value.trim();
            const project_id = projectValue ? Number(projectValue) : null;

            if (!id || !name || !location) {
                showProjectFeedback("Missing server details to save.", true);
                return;
            }

            projectSaveBtn.disabled = true;
            showProjectFeedback("Saving…", false);

            try {
                const response = await fetch("/api/monitored-servers", {
                    method: "PATCH",
                    credentials: "same-origin",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        id,
                        name,
                        location,
                        notes,
                        active,
                        project_id,
                    }),
                });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    showProjectFeedback(data.error || "Failed to save project.", true);
                    return;
                }
                showProjectFeedback("Saved", false);
            } catch (error) {
                console.error(error);
                showProjectFeedback("Failed to save project.", true);
            } finally {
                projectSaveBtn.disabled = false;
            }
        });
    }

    // ------------------------------------------------------------ alerts modal

    const alertsModal = document.getElementById("server-alerts-modal");
    const alertsSaveBtn = document.getElementById("server-alerts-save-btn");
    const alertsFormAlert = document.getElementById("server-alerts-form-alert");
    const pingerRecipientsEl = document.getElementById("pinger-recipients");
    const metricerRecipientsEl = document.getElementById("metricer-recipients");

    if (!alertsModal || !alertsSaveBtn || !pingerRecipientsEl || !metricerRecipientsEl) {
        return;
    }

    function decodeJsonAttr(value) {
        try {
            return JSON.parse(decodeURIComponent(value || "") || "{}");
        } catch (error) {
            return {};
        }
    }

    function decodeJsonArrayAttr(value) {
        try {
            const parsed = JSON.parse(decodeURIComponent(value || "") || "[]");
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            return [];
        }
    }

    function recipientKey(row) {
        return `${String(row.email || "").toLowerCase()}|${String(row.phone || "")}`;
    }

    function mergeRecipientRows(candidates, saved) {
        const savedList = Array.isArray(saved) ? saved : [];
        const savedByKey = new Map(savedList.map((row) => [recipientKey(row), row]));
        const rows = [];
        const seen = new Set();

        for (const candidate of candidates) {
            const key = recipientKey(candidate);
            const match = savedByKey.get(key);
            rows.push({
                name: candidate.name || match?.name || "Contact",
                email: candidate.email || null,
                phone: candidate.phone || null,
                email_on: match ? Boolean(match.email_on) : false,
                sms_on: match ? Boolean(match.sms_on) : false,
            });
            seen.add(key);
        }

        for (const savedRow of savedList) {
            const key = recipientKey(savedRow);
            if (seen.has(key)) continue;
            rows.push({
                name: savedRow.name || "Contact",
                email: savedRow.email || null,
                phone: savedRow.phone || null,
                email_on: Boolean(savedRow.email_on),
                sms_on: Boolean(savedRow.sms_on),
            });
        }

        return rows;
    }

    function renderRecipients(container, rows, section) {
        if (!rows.length) {
            container.innerHTML =
                '<p class="text-secondary small mb-0">No contacts yet. Map a project with customer emails/phones, or save custom recipients after adding them on the customer.</p>';
            return;
        }

        container.innerHTML = rows
            .map((row, index) => {
                const labelParts = [];
                if (row.name) labelParts.push(row.name);
                if (row.email) labelParts.push(row.email);
                if (row.phone) labelParts.push(row.phone);
                const label = labelParts.join(" · ");
                const emailDisabled = row.email ? "" : "disabled";
                const smsDisabled = row.phone ? "" : "disabled";
                return `
                    <div class="border rounded p-2 mb-2 alert-recipient-row" data-section="${section}" data-index="${index}">
                        <div class="small fw-semibold mb-1">${escapeHtml(label)}</div>
                        <div class="d-flex flex-wrap gap-3">
                            <div class="form-check mb-0">
                                <input class="form-check-input recipient-email-on" type="checkbox" id="${section}-email-${index}" ${row.email_on ? "checked" : ""} ${emailDisabled} />
                                <label class="form-check-label small" for="${section}-email-${index}">Email</label>
                            </div>
                            <div class="form-check mb-0">
                                <input class="form-check-input recipient-sms-on" type="checkbox" id="${section}-sms-${index}" ${row.sms_on ? "checked" : ""} ${smsDisabled} />
                                <label class="form-check-label small" for="${section}-sms-${index}">SMS</label>
                            </div>
                        </div>
                        <input type="hidden" class="recipient-name" value="${escapeAttr(row.name || "")}" />
                        <input type="hidden" class="recipient-email" value="${escapeAttr(row.email || "")}" />
                        <input type="hidden" class="recipient-phone" value="${escapeAttr(row.phone || "")}" />
                    </div>
                `;
            })
            .join("");
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function escapeAttr(value) {
        return escapeHtml(value).replace(/'/g, "&#39;");
    }

    function readRecipients(container) {
        return Array.from(container.querySelectorAll(".alert-recipient-row"))
            .map((row) => ({
                name: row.querySelector(".recipient-name")?.value.trim() || "",
                email: row.querySelector(".recipient-email")?.value.trim() || null,
                phone: row.querySelector(".recipient-phone")?.value.trim() || null,
                email_on: Boolean(row.querySelector(".recipient-email-on")?.checked),
                sms_on: Boolean(row.querySelector(".recipient-sms-on")?.checked),
            }))
            .filter((row) => row.email_on || row.sms_on);
    }

    function showAlertsFeedback(message, isError) {
        if (!alertsFormAlert) return;
        alertsFormAlert.textContent = message;
        alertsFormAlert.className = `alert alert-${isError ? "danger" : "success"}`;
        alertsFormAlert.classList.remove("d-none");
    }

    function hydrateAlertRecipients() {
        const config = decodeJsonAttr(alertsModal.dataset.alertConfig);
        const candidates = decodeJsonArrayAttr(alertsModal.dataset.alertCandidates);
        renderRecipients(
            pingerRecipientsEl,
            mergeRecipientRows(candidates, config.pinger?.recipients || []),
            "pinger",
        );
        renderRecipients(
            metricerRecipientsEl,
            mergeRecipientRows(candidates, config.metricer?.recipients || []),
            "metricer",
        );
    }

    hydrateAlertRecipients();
    alertsModal.addEventListener("show.bs.modal", () => {
        if (alertsFormAlert) {
            alertsFormAlert.classList.add("d-none");
            alertsFormAlert.textContent = "";
        }
        hydrateAlertRecipients();
    });

    alertsSaveBtn.addEventListener("click", async () => {
        const serverId = Number(alertsModal.dataset.serverId);
        if (!serverId) {
            showAlertsFeedback("Missing server id.", true);
            return;
        }

        const alert_config = {
            pinger: {
                enabled: Boolean(document.getElementById("pinger-enabled")?.checked),
                missed_ping_seconds: Number(document.getElementById("pinger-missed")?.value || 180),
                cooldown_seconds: Number(document.getElementById("pinger-cooldown")?.value || 900),
                recipients: readRecipients(pingerRecipientsEl),
            },
            metricer: {
                enabled: Boolean(document.getElementById("metricer-enabled")?.checked),
                cooldown_seconds: Number(document.getElementById("metricer-cooldown")?.value || 900),
                ram_enabled: Boolean(document.getElementById("metricer-ram-enabled")?.checked),
                ram_percent: Number(document.getElementById("metricer-ram-percent")?.value || 90),
                storage_enabled: Boolean(document.getElementById("metricer-storage-enabled")?.checked),
                storage_percent: Number(document.getElementById("metricer-storage-percent")?.value || 90),
                temp_enabled: Boolean(document.getElementById("metricer-temp-enabled")?.checked),
                temp_celsius: Number(document.getElementById("metricer-temp-celsius")?.value || 80),
                recipients: readRecipients(metricerRecipientsEl),
            },
            dataer: { enabled: false, recipients: [] },
            dber: { enabled: false, recipients: [] },
        };

        alertsSaveBtn.disabled = true;
        showAlertsFeedback("Saving…", false);

        try {
            const response = await fetch(`/api/monitored-servers/${serverId}/alerts`, {
                method: "PATCH",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ alert_config }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showAlertsFeedback(data.error || "Failed to save alerts.", true);
                return;
            }
            if (data.alert_config) {
                alertsModal.dataset.alertConfig = encodeURIComponent(JSON.stringify(data.alert_config));
            }
            showAlertsFeedback(data.message || "Alert settings saved", false);
        } catch (error) {
            console.error(error);
            showAlertsFeedback("Failed to save alerts.", true);
        } finally {
            alertsSaveBtn.disabled = false;
        }
    });
})();
