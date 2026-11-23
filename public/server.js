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

        const copyBtn = document.getElementById("run-detail-copy-btn");
        copyBtn?.addEventListener("click", async () => {
            const text = detailBody.textContent || "";
            try {
                if (navigator.clipboard?.writeText) {
                    await navigator.clipboard.writeText(text);
                } else {
                    const area = document.createElement("textarea");
                    area.value = text;
                    document.body.appendChild(area);
                    area.select();
                    document.execCommand("copy");
                    area.remove();
                }
                const previous = copyBtn.textContent;
                copyBtn.textContent = "Copied";
                setTimeout(() => {
                    copyBtn.textContent = previous || "Copy";
                }, 1200);
            } catch (error) {
                console.error(error);
                copyBtn.textContent = "Copy failed";
                setTimeout(() => {
                    copyBtn.textContent = "Copy";
                }, 1200);
            }
        });
    }

    const utilityPasswordEl = document.getElementById("server-utility-password");
    const utilityPasswordToggle = document.getElementById("server-utility-password-toggle");
    if (utilityPasswordEl && utilityPasswordToggle) {
        utilityPasswordToggle.addEventListener("click", () => {
            const hidden = utilityPasswordEl.dataset.hidden !== "0";
            let password = utilityPasswordEl.dataset.password || "";
            try {
                password = decodeURIComponent(password);
            } catch (error) {
                // keep raw value if decode fails
            }
            if (hidden) {
                utilityPasswordEl.textContent = password;
                utilityPasswordEl.dataset.hidden = "0";
                utilityPasswordToggle.title = "Hide password";
                utilityPasswordToggle.setAttribute("aria-label", "Hide password");
                utilityPasswordToggle.setAttribute("aria-pressed", "true");
            } else {
                utilityPasswordEl.textContent = "••••••••";
                utilityPasswordEl.dataset.hidden = "1";
                utilityPasswordToggle.title = "Show password";
                utilityPasswordToggle.setAttribute("aria-label", "Show password");
                utilityPasswordToggle.setAttribute("aria-pressed", "false");
            }
        });
    }

    const projectCard = document.getElementById("server-project-card");
    const projectSelect = document.getElementById("server-project-select");
    const projectSaveBtn = document.getElementById("server-project-save-btn");
    const projectFeedback = document.getElementById("server-project-feedback");
    const mappedToggle = document.getElementById("server-mapped-toggle");
    const unmapFeedback = document.getElementById("server-unmap-feedback");

    if (projectCard && projectSelect && projectSaveBtn) {
        function showProjectFeedback(message, isError) {
            if (!projectFeedback) return;
            projectFeedback.textContent = message;
            projectFeedback.className = `small ${isError ? "text-danger" : "text-success"}`;
            projectFeedback.classList.remove("d-none");
        }

        function showUnmapFeedback(message, isError) {
            if (!unmapFeedback) return;
            unmapFeedback.textContent = message;
            unmapFeedback.className = `small ${isError ? "text-danger" : "text-success"}`;
            unmapFeedback.classList.remove("d-none");
        }

        mappedToggle?.addEventListener("change", async () => {
            // Turning on is not allowed from UI — agent must CREATE_TAG with OTP.
            if (mappedToggle.checked) {
                mappedToggle.checked = false;
                showUnmapFeedback("Remap by claiming the OTP on the agent.", true);
                return;
            }

            const id = Number(projectCard.dataset.id);
            if (!id) {
                mappedToggle.checked = true;
                showUnmapFeedback("Missing server id.", true);
                return;
            }
            if (!window.confirm("Unmap this tag? The agent must claim the OTP again to remap.")) {
                mappedToggle.checked = true;
                return;
            }

            mappedToggle.disabled = true;
            showUnmapFeedback("Unmapping…", false);
            try {
                const response = await fetch(`/api/monitored-servers/${id}/unmap`, {
                    method: "PATCH",
                    credentials: "same-origin",
                    headers: { "Content-Type": "application/json" },
                });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    mappedToggle.checked = true;
                    showUnmapFeedback(data.error || "Failed to unmap tag.", true);
                    return;
                }
                projectCard.dataset.tagMapped = "0";
                mappedToggle.checked = false;
                mappedToggle.disabled = true;
                showUnmapFeedback(data.message || "Tag unmapped", false);
            } catch (error) {
                console.error(error);
                mappedToggle.checked = true;
                mappedToggle.disabled = false;
                showUnmapFeedback("Failed to unmap tag.", true);
            }
        });

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
    const dataerRecipientsEl = document.getElementById("dataer-recipients");
    const dberRecipientsEl = document.getElementById("dber-recipients");

    if (
        !alertsModal
        || !alertsSaveBtn
        || !pingerRecipientsEl
        || !metricerRecipientsEl
        || !dataerRecipientsEl
        || !dberRecipientsEl
    ) {
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
        const candidateKeys = new Set(candidates.map((row) => recipientKey(row)));
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
                custom: false,
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
                custom: !candidateKeys.has(key),
            });
        }

        return rows;
    }

    function renderRecipients(container, rows, section) {
        if (!rows.length) {
            container.innerHTML =
                '<p class="text-secondary small mb-0">No contacts yet. Add a person below, or map a project with customer emails/phones.</p>';
            return;
        }

        container.innerHTML = rows
            .map((row, index) => {
                const detailParts = [];
                if (row.email) detailParts.push(row.email);
                if (row.phone) detailParts.push(row.phone);
                const detail = detailParts.join(" · ");
                const isCustom = Boolean(row.custom);
                const actions = isCustom
                    ? `<div class="d-flex gap-2">
                            <button type="button" class="btn btn-link btn-sm p-0 recipient-edit-btn">Edit</button>
                            <button type="button" class="btn btn-link btn-sm text-danger p-0 recipient-remove-btn">Delete</button>
                       </div>`
                    : "";
                const mediums = [];
                if (row.email) {
                    mediums.push(`
                        <div class="form-check mb-0">
                            <input class="form-check-input recipient-email-on" type="checkbox" id="${section}-email-${index}" ${row.email_on ? "checked" : ""} />
                            <label class="form-check-label small" for="${section}-email-${index}">Email</label>
                        </div>
                    `);
                }
                if (row.phone) {
                    mediums.push(`
                        <div class="form-check mb-0">
                            <input class="form-check-input recipient-sms-on" type="checkbox" id="${section}-sms-${index}" ${row.sms_on ? "checked" : ""} />
                            <label class="form-check-label small" for="${section}-sms-${index}">Mobile</label>
                        </div>
                    `);
                }
                return `
                    <div class="border rounded p-2 mb-2 alert-recipient-row" data-section="${section}" data-index="${index}" data-custom="${isCustom ? "1" : "0"}">
                        <div class="d-flex justify-content-between align-items-start gap-2 mb-1">
                            <div>
                                <div class="small fw-semibold">${escapeHtml(row.name || "Contact")}</div>
                                ${detail ? `<div class="small text-secondary">${escapeHtml(detail)}</div>` : ""}
                            </div>
                            ${actions}
                        </div>
                        <div class="d-flex flex-wrap gap-3">${mediums.join("")}</div>
                        <input type="hidden" class="recipient-name" value="${escapeAttr(row.name || "")}" />
                        <input type="hidden" class="recipient-email" value="${escapeAttr(row.email || "")}" />
                        <input type="hidden" class="recipient-phone" value="${escapeAttr(row.phone || "")}" />
                    </div>
                `;
            })
            .join("");
    }

    function recipientsContainerForSection(section) {
        if (section === "metricer") {
            return metricerRecipientsEl;
        }
        if (section === "dataer") {
            return dataerRecipientsEl;
        }
        if (section === "dber") {
            return dberRecipientsEl;
        }
        return pingerRecipientsEl;
    }

    function personFormForSection(section) {
        return alertsModal.querySelector(`.alert-add-person[data-section="${section}"]`);
    }

    function personFormCollapseEl(form) {
        return form?.querySelector(".collapse") || null;
    }

    function setPersonFormExpanded(form, expanded) {
        const collapseEl = personFormCollapseEl(form);
        if (!collapseEl || !window.bootstrap?.Collapse) {
            collapseEl?.classList.toggle("show", expanded);
            return;
        }
        window.bootstrap.Collapse.getOrCreateInstance(collapseEl, { toggle: false })[expanded ? "show" : "hide"]();
    }

    function readAllRecipientRows(container) {
        return Array.from(container.querySelectorAll(".alert-recipient-row")).map((row) => ({
            name: row.querySelector(".recipient-name")?.value.trim() || "",
            email: row.querySelector(".recipient-email")?.value.trim() || null,
            phone: row.querySelector(".recipient-phone")?.value.trim() || null,
            email_on: Boolean(row.querySelector(".recipient-email-on")?.checked),
            sms_on: Boolean(row.querySelector(".recipient-sms-on")?.checked),
            custom: row.dataset.custom === "1",
        }));
    }

    function setPersonFormMode(form, { editing = false } = {}) {
        const title = form.querySelector(".alert-add-person-title");
        const submitBtn = form.querySelector(".alert-add-person-btn");
        const cancelBtn = form.querySelector(".alert-add-person-cancel");
        const toggleBtn = form.querySelector(".alert-add-person-toggle");
        if (title) title.textContent = editing ? "Edit person" : "Add person";
        if (submitBtn) submitBtn.textContent = editing ? "Save" : "Add";
        if (cancelBtn) cancelBtn.classList.toggle("d-none", !editing);
        if (toggleBtn) toggleBtn.textContent = editing ? "Edit person" : "Add person";
    }

    function clearAddPersonForm(form, { collapse = false } = {}) {
        const nameInput = form.querySelector(".alert-add-name");
        const emailInput = form.querySelector(".alert-add-email");
        const phoneInput = form.querySelector(".alert-add-phone");
        const errorEl = form.querySelector(".alert-add-person-error");
        if (nameInput) nameInput.value = "";
        if (emailInput) emailInput.value = "";
        if (phoneInput) phoneInput.value = "";
        delete form.dataset.editIndex;
        setPersonFormMode(form, { editing: false });
        if (errorEl) {
            errorEl.textContent = "";
            errorEl.classList.add("d-none");
        }
        if (collapse) setPersonFormExpanded(form, false);
    }

    function showAddPersonError(form, message) {
        const errorEl = form.querySelector(".alert-add-person-error");
        if (!errorEl) return;
        errorEl.textContent = message;
        errorEl.classList.toggle("d-none", !message);
    }

    function beginEditPerson(section, index) {
        const form = personFormForSection(section);
        const container = recipientsContainerForSection(section);
        if (!form || !container) return;
        const rows = readAllRecipientRows(container);
        const row = rows[index];
        if (!row || !row.custom) return;

        form.dataset.editIndex = String(index);
        form.querySelector(".alert-add-name").value = row.name || "";
        form.querySelector(".alert-add-email").value = row.email || "";
        form.querySelector(".alert-add-phone").value = row.phone || "";
        setPersonFormMode(form, { editing: true });
        showAddPersonError(form, "");
        setPersonFormExpanded(form, true);
        form.querySelector(".alert-add-name")?.focus();
    }

    function savePersonFromForm(form) {
        const section = form.dataset.section || "pinger";
        const container = recipientsContainerForSection(section);
        const name = form.querySelector(".alert-add-name")?.value.trim() || "";
        const email = form.querySelector(".alert-add-email")?.value.trim() || "";
        const phone = form.querySelector(".alert-add-phone")?.value.trim() || "";
        const editIndex = form.dataset.editIndex != null ? Number(form.dataset.editIndex) : null;
        const isEditing = Number.isInteger(editIndex) && editIndex >= 0;

        if (!name) {
            showAddPersonError(form, "Name is required.");
            return;
        }
        if (!email && !phone) {
            showAddPersonError(form, "Enter an email or phone/mobile.");
            return;
        }

        const existing = readAllRecipientRows(container);
        const previous = isEditing ? existing[editIndex] : null;
        if (isEditing && (!previous || !previous.custom)) {
            showAddPersonError(form, "That person can no longer be edited.");
            return;
        }

        const next = {
            name,
            email: email || null,
            phone: phone || null,
            email_on: Boolean(previous?.email_on) && Boolean(email),
            sms_on: Boolean(previous?.sms_on) && Boolean(phone),
            custom: true,
        };
        const key = recipientKey(next);
        const duplicate = existing.some((row, index) => {
            if (isEditing && index === editIndex) return false;
            return recipientKey(row) === key;
        });
        if (duplicate) {
            showAddPersonError(form, "That contact is already in the list.");
            return;
        }

        if (isEditing) {
            existing[editIndex] = next;
        } else {
            existing.push(next);
        }
        renderRecipients(container, existing, section);
        clearAddPersonForm(form, { collapse: true });
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
            .filter((row) => row.email || row.phone);
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
        renderRecipients(
            dataerRecipientsEl,
            mergeRecipientRows(candidates, config.dataer?.recipients || []),
            "dataer",
        );
        renderRecipients(
            dberRecipientsEl,
            mergeRecipientRows(candidates, config.dber?.recipients || []),
            "dber",
        );
    }

    hydrateAlertRecipients();
    alertsModal.addEventListener("show.bs.modal", () => {
        if (alertsFormAlert) {
            alertsFormAlert.classList.add("d-none");
            alertsFormAlert.textContent = "";
        }
        hydrateAlertRecipients();
        alertsModal.querySelectorAll(".alert-add-person").forEach((form) => clearAddPersonForm(form, { collapse: true }));
    });

    alertsModal.addEventListener("click", (event) => {
        const addBtn = event.target.closest(".alert-add-person-btn");
        if (addBtn) {
            const form = addBtn.closest(".alert-add-person");
            if (form) savePersonFromForm(form);
            return;
        }

        const cancelBtn = event.target.closest(".alert-add-person-cancel");
        if (cancelBtn) {
            const form = cancelBtn.closest(".alert-add-person");
            if (form) clearAddPersonForm(form, { collapse: true });
            return;
        }

        const editBtn = event.target.closest(".recipient-edit-btn");
        if (editBtn) {
            const row = editBtn.closest(".alert-recipient-row");
            if (!row || row.dataset.custom !== "1") return;
            beginEditPerson(row.dataset.section || "pinger", Number(row.dataset.index));
            return;
        }

        const removeBtn = event.target.closest(".recipient-remove-btn");
        if (removeBtn) {
            const row = removeBtn.closest(".alert-recipient-row");
            if (!row || row.dataset.custom !== "1") return;
            const section = row.dataset.section || "pinger";
            const container = recipientsContainerForSection(section);
            const index = Number(row.dataset.index);
            const next = readAllRecipientRows(container).filter((_, i) => i !== index);
            renderRecipients(container, next, section);
            const form = personFormForSection(section);
            if (form && form.dataset.editIndex != null && Number(form.dataset.editIndex) === index) {
                clearAddPersonForm(form, { collapse: true });
            }
        }
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
                cpu_enabled: Boolean(document.getElementById("metricer-cpu-enabled")?.checked),
                cpu_percent: Number(document.getElementById("metricer-cpu-percent")?.value || 90),
                storage_enabled: Boolean(document.getElementById("metricer-storage-enabled")?.checked),
                storage_percent: Number(document.getElementById("metricer-storage-percent")?.value || 90),
                storage_drives: Array.from(
                    document.getElementById("metricer-storage-drives")?.selectedOptions || [],
                ).map((opt) => String(opt.value || "").trim()).filter(Boolean),
                temp_enabled: Boolean(document.getElementById("metricer-temp-enabled")?.checked),
                temp_celsius: Number(document.getElementById("metricer-temp-celsius")?.value || 80),
                recipients: readRecipients(metricerRecipientsEl),
            },
            dataer: {
                enabled: Boolean(document.getElementById("dataer-enabled")?.checked),
                skip_success_alerts: Boolean(document.getElementById("dataer-skip-success")?.checked),
                recipients: readRecipients(dataerRecipientsEl),
            },
            dber: {
                enabled: Boolean(document.getElementById("dber-enabled")?.checked),
                skip_success_alerts: Boolean(document.getElementById("dber-skip-success")?.checked),
                recipients: readRecipients(dberRecipientsEl),
            },
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
