document.addEventListener("DOMContentLoaded", () => {
    const pageAlert = document.getElementById("leads-alert");
    const filterStatus = document.getElementById("leads-filter-status");
    const tableBody = document.getElementById("leads-tbody");
    const emptyState = document.getElementById("leads-empty");
    const tableWrap = document.getElementById("leads-table-wrap");
    const fromInput = document.getElementById("leads-from");
    const toInput = document.getElementById("leads-to");
    const searchInput = document.getElementById("leads-search");
    const organizationInput = document.getElementById("leads-filter-organization");
    const phoneInput = document.getElementById("leads-filter-phone");
    const emailInput = document.getElementById("leads-filter-email");
    const designationInput = document.getElementById("leads-filter-designation");
    const locationInput = document.getElementById("leads-filter-location");
    const targetedForInput = document.getElementById("leads-filter-targeted-for");
    const sourceInput = document.getElementById("leads-filter-source");
    const applyFiltersButton = document.getElementById("leads-filters-apply-btn");
    const clearFiltersButton = document.getElementById("leads-filters-clear-btn");

    const openAddButton = document.getElementById("open-add-lead-btn");
    const modalElement = document.getElementById("lead-modal");
    const form = document.getElementById("lead-form");
    const formAlert = document.getElementById("lead-form-alert");
    const submitButton = document.getElementById("lead-submit-btn");
    const phonesList = document.getElementById("lead-phones-list");
    const emailsList = document.getElementById("lead-emails-list");
    const addPhoneButton = document.getElementById("lead-add-phone-btn");
    const addEmailButton = document.getElementById("lead-add-email-btn");

    const emailKinds = window.__LEAD_EMAIL_KINDS__ || {
        PERSONAL: "personal",
        PROFESSIONAL: "professional",
    };
    const emailKindLabels = window.__LEAD_EMAIL_KIND_LABELS__ || {
        personal: "Personal",
        professional: "Professional",
    };
    const storageKey = "crm-leads-filters";

    function showAlert(element, message, type) {
        window.showAlert?.(element, message, type);
    }

    function hideAlert(element) {
        window.hideAlert?.(element);
    }

    function applyClientFilters() {
        const query = (searchInput?.value || "").trim().toLowerCase();
        const organization = (organizationInput?.value || "").trim().toLowerCase();
        const phone = (phoneInput?.value || "").trim().toLowerCase();
        const email = (emailInput?.value || "").trim().toLowerCase();
        const designation = (designationInput?.value || "").trim().toLowerCase();
        const location = (locationInput?.value || "").trim().toLowerCase();
        const targetedFor = (targetedForInput?.value || "").trim().toLowerCase();
        const source = (sourceInput?.value || "").trim().toLowerCase();

        let visibleCount = 0;
        tableBody?.querySelectorAll("tr").forEach((row) => {
            const matchesQuery =
                !query ||
                String(row.dataset.search || "")
                    .toLowerCase()
                    .includes(query);
            const matchesOrganization =
                !organization ||
                String(row.dataset.organization || "")
                    .toLowerCase()
                    .includes(organization);
            const matchesPhone =
                !phone ||
                String(row.dataset.phone || "")
                    .toLowerCase()
                    .includes(phone);
            const matchesEmail =
                !email ||
                String(row.dataset.email || "")
                    .toLowerCase()
                    .includes(email);
            const matchesDesignation =
                !designation ||
                String(row.dataset.designation || "")
                    .toLowerCase()
                    .includes(designation);
            const matchesLocation =
                !location ||
                String(row.dataset.location || "")
                    .toLowerCase()
                    .includes(location);
            const matchesTargeted =
                !targetedFor ||
                String(row.dataset.targeted || "")
                    .toLowerCase()
                    .includes(targetedFor);
            const matchesSource =
                !source ||
                String(row.dataset.source || "")
                    .toLowerCase()
                    .includes(source);
            const visible =
                matchesQuery &&
                matchesOrganization &&
                matchesPhone &&
                matchesEmail &&
                matchesDesignation &&
                matchesLocation &&
                matchesTargeted &&
                matchesSource;
            row.classList.toggle("d-none", !visible);
            if (visible) visibleCount += 1;
        });

        emptyState?.classList.toggle("d-none", visibleCount > 0);
        tableWrap?.classList.toggle("d-none", visibleCount === 0);
        if (filterStatus) {
            filterStatus.textContent = `Showing ${visibleCount} lead${visibleCount === 1 ? "" : "s"}.`;
        }

        try {
            localStorage.setItem(
                storageKey,
                JSON.stringify({
                    search: searchInput?.value || "",
                    organization: organizationInput?.value || "",
                    phone: phoneInput?.value || "",
                    email: emailInput?.value || "",
                    designation: designationInput?.value || "",
                    location: locationInput?.value || "",
                    targeted_for: targetedForInput?.value || "",
                    source: sourceInput?.value || "",
                }),
            );
        } catch (error) {
            console.error(error);
        }
    }

    function restoreFilters() {
        try {
            const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
            if (searchInput) searchInput.value = saved.search || "";
            if (organizationInput) organizationInput.value = saved.organization || "";
            if (phoneInput) phoneInput.value = saved.phone || "";
            if (emailInput) emailInput.value = saved.email || "";
            if (designationInput) designationInput.value = saved.designation || "";
            if (locationInput) locationInput.value = saved.location || "";
            if (targetedForInput) targetedForInput.value = saved.targeted_for || "";
            if (sourceInput) sourceInput.value = saved.source || "";
        } catch (error) {
            console.error(error);
        }
        applyClientFilters();
    }

    function reloadWithDateRange() {
        const fromValue = fromInput?.value || fromInput?.dataset.pageFrom || "";
        const toValue = toInput?.value || toInput?.dataset.pageTo || "";
        if (!fromValue || !toValue) return;
        const params = new URLSearchParams({ from: fromValue, to: toValue });
        window.location.href = `/app/crm/leads?${params.toString()}`;
    }

    applyFiltersButton?.addEventListener("click", () => {
        const pageFrom = fromInput?.dataset.pageFrom || "";
        const pageTo = toInput?.dataset.pageTo || "";
        if (
            fromInput?.value &&
            toInput?.value &&
            (fromInput.value !== pageFrom || toInput.value !== pageTo)
        ) {
            reloadWithDateRange();
            return;
        }
        applyClientFilters();
        const offcanvasElement = document.getElementById("leads-filters-panel");
        window.bootstrap?.Offcanvas?.getInstance(offcanvasElement)?.hide();
    });

    clearFiltersButton?.addEventListener("click", () => {
        if (searchInput) searchInput.value = "";
        if (organizationInput) organizationInput.value = "";
        if (phoneInput) phoneInput.value = "";
        if (emailInput) emailInput.value = "";
        if (designationInput) designationInput.value = "";
        if (locationInput) locationInput.value = "";
        if (targetedForInput) targetedForInput.value = "";
        if (sourceInput) sourceInput.value = "";
        applyClientFilters();
    });

    searchInput?.addEventListener("input", applyClientFilters);
    window.bindSortableHeaders?.(document.getElementById("leads-table"));
    restoreFilters();

    function syncPhoneRemoveButtons() {
        const rows = phonesList?.querySelectorAll(".lead-phone-row") || [];
        rows.forEach((row) => {
            const removeButton = row.querySelector(".lead-phone-remove-btn");
            if (removeButton) removeButton.classList.toggle("d-none", rows.length <= 1);
        });
    }

    function syncEmailRemoveButtons() {
        const rows = emailsList?.querySelectorAll(".lead-email-row") || [];
        rows.forEach((row) => {
            const removeButton = row.querySelector(".lead-email-remove-btn");
            if (removeButton) removeButton.classList.toggle("d-none", rows.length <= 1);
        });
    }

    function addPhoneRow({ phone = "", is_whatsapp = false } = {}) {
        if (!phonesList) return;
        const rowIndex = phonesList.querySelectorAll(".lead-phone-row").length;
        const wrapper = document.createElement("div");
        wrapper.className = "lead-phone-row border rounded p-2";
        wrapper.innerHTML = `
            <div class="row g-2 align-items-center">
                <div class="col-md-7">
                    <label class="form-label small mb-1">Phone</label>
                    <input type="text" class="form-control form-control-sm lead-phone-input" maxlength="32" value="${window.escapeHtml?.(phone) || phone}" required />
                </div>
                <div class="col-md-3">
                    <div class="form-check mt-md-4">
                        <input type="checkbox" class="form-check-input lead-phone-whatsapp" id="lead-phone-whatsapp-${rowIndex}" ${is_whatsapp ? "checked" : ""} />
                        <label class="form-check-label" for="lead-phone-whatsapp-${rowIndex}">WhatsApp</label>
                    </div>
                </div>
                <div class="col-md-2 text-md-end">
                    <button type="button" class="btn btn-sm btn-outline-danger lead-phone-remove-btn mt-md-3">Remove</button>
                </div>
            </div>
        `;
        phonesList.appendChild(wrapper);
        syncPhoneRemoveButtons();
    }

    function addEmailRow({ email = "", kind = emailKinds.PROFESSIONAL } = {}) {
        if (!emailsList) return;
        const rowIndex = emailsList.querySelectorAll(".lead-email-row").length;
        const personalChecked = kind === emailKinds.PERSONAL ? "checked" : "";
        const professionalChecked = kind !== emailKinds.PERSONAL ? "checked" : "";
        const wrapper = document.createElement("div");
        wrapper.className = "lead-email-row border rounded p-2";
        wrapper.innerHTML = `
            <div class="row g-2 align-items-center">
                <div class="col-md-6">
                    <label class="form-label small mb-1">Email</label>
                    <input type="email" class="form-control form-control-sm lead-email-input" maxlength="255" value="${window.escapeHtml?.(email) || email}" required />
                </div>
                <div class="col-md-4">
                    <div class="mt-md-4 d-flex flex-wrap gap-3">
                        <div class="form-check">
                            <input class="form-check-input lead-email-kind" type="radio" name="lead-email-kind-${rowIndex}" value="${emailKinds.PERSONAL}" ${personalChecked} />
                            <label class="form-check-label">${emailKindLabels[emailKinds.PERSONAL] || "Personal"}</label>
                        </div>
                        <div class="form-check">
                            <input class="form-check-input lead-email-kind" type="radio" name="lead-email-kind-${rowIndex}" value="${emailKinds.PROFESSIONAL}" ${professionalChecked} />
                            <label class="form-check-label">${emailKindLabels[emailKinds.PROFESSIONAL] || "Professional"}</label>
                        </div>
                    </div>
                </div>
                <div class="col-md-2 text-md-end">
                    <button type="button" class="btn btn-sm btn-outline-danger lead-email-remove-btn mt-md-3">Remove</button>
                </div>
            </div>
        `;
        emailsList.appendChild(wrapper);
        syncEmailRemoveButtons();
    }

    function resetLeadForm() {
        form?.reset();
        hideAlert(formAlert);
        if (phonesList) phonesList.innerHTML = "";
        if (emailsList) emailsList.innerHTML = "";
        addPhoneRow();
        addEmailRow();
    }

    openAddButton?.addEventListener("click", () => {
        resetLeadForm();
    });

    modalElement?.addEventListener("show.bs.modal", () => {
        if (!phonesList?.querySelector(".lead-phone-row")) {
            resetLeadForm();
        }
    });

    addPhoneButton?.addEventListener("click", () => addPhoneRow());
    addEmailButton?.addEventListener("click", () => addEmailRow());

    phonesList?.addEventListener("click", (event) => {
        if (!event.target.closest(".lead-phone-remove-btn")) return;
        event.target.closest(".lead-phone-row")?.remove();
        syncPhoneRemoveButtons();
    });

    emailsList?.addEventListener("click", (event) => {
        if (!event.target.closest(".lead-email-remove-btn")) return;
        event.target.closest(".lead-email-row")?.remove();
        syncEmailRemoveButtons();
    });

    form?.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideAlert(formAlert);

        const fullName = document.getElementById("lead-full-name")?.value?.trim() || "";
        if (!fullName) {
            showAlert(formAlert, "Full name is required.", "danger");
            return;
        }

        const phones = [];
        phonesList?.querySelectorAll(".lead-phone-row").forEach((row) => {
            const phone = row.querySelector(".lead-phone-input")?.value?.trim() || "";
            if (!phone) return;
            phones.push({
                phone,
                is_whatsapp: !!row.querySelector(".lead-phone-whatsapp")?.checked,
            });
        });
        if (!phones.length) {
            showAlert(formAlert, "At least one phone number is required.", "danger");
            return;
        }

        const emails = [];
        emailsList?.querySelectorAll(".lead-email-row").forEach((row) => {
            const email = row.querySelector(".lead-email-input")?.value?.trim() || "";
            if (!email) return;
            const kindInput = row.querySelector(".lead-email-kind:checked");
            emails.push({
                email,
                kind: kindInput?.value || emailKinds.PROFESSIONAL,
            });
        });
        if (!emails.length) {
            showAlert(formAlert, "At least one email is required.", "danger");
            return;
        }

        const payload = {
            full_name: fullName,
            website: document.getElementById("lead-website")?.value?.trim() || null,
            organization: document.getElementById("lead-organization")?.value?.trim() || null,
            designation: document.getElementById("lead-designation")?.value?.trim() || null,
            location: document.getElementById("lead-location")?.value?.trim() || null,
            refer_by: document.getElementById("lead-refer-by")?.value?.trim() || null,
            targeted_for: document.getElementById("lead-targeted-for")?.value?.trim() || null,
            source: document.getElementById("lead-source")?.value?.trim() || null,
            note: document.getElementById("lead-note")?.value?.trim() || null,
            phones,
            emails,
        };

        if (submitButton) submitButton.disabled = true;
        try {
            const response = await fetch("/api/leads", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showAlert(formAlert, data.error || "Failed to create lead.", "danger");
                return;
            }
            window.location.reload();
        } catch (error) {
            console.error(error);
            showAlert(formAlert, "Failed to create lead.", "danger");
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    });
});
