(() => {
    const page = window.__GEM_CATEGORIES_PAGE__ || {};

    const state = {
        groups: page.groups || [],
        categories: page.categories || [],
        scanKeywords: page.scanKeywords || [],
        tenderCategories: page.tenderCategories || [],
    };
    const selectedKeywordIds = new Set();
    const selectedCategoryIds = new Set();

    const alertElement = document.getElementById("gem-scanner-alert");

    const keywordsList = document.getElementById("gem-keywords-list");
    const keywordsEmpty = document.getElementById("gem-keywords-empty");
    const keywordSelectAllWrap = document.getElementById("gem-keyword-select-all-wrap");
    const keywordSelectAll = document.getElementById("gem-keyword-select-all");
    const keywordAddButton = document.getElementById("gem-keyword-add-btn");

    const groupsList = document.getElementById("gem-groups-list");
    const groupsEmpty = document.getElementById("gem-groups-empty");
    const groupAddButton = document.getElementById("gem-group-add-btn");
    const advanceSelectAllWrap = document.getElementById("gem-advance-select-all-wrap");
    const advanceSelectAll = document.getElementById("gem-advance-select-all");

    const scannerScanButton = document.getElementById("gem-scanner-scan-btn");
    const scannerTabs = document.getElementById("gem-scanner-tabs");
    let activeScannerTab = "direct";

    const tenderCategoriesTbody = document.getElementById("gem-tender-categories-tbody");
    const tenderCategoriesEmpty = document.getElementById("gem-tender-categories-empty");
    const tenderCategoriesTableWrap = document.getElementById("gem-tender-categories-table-wrap");
    const tenderCategoryAddButton = document.getElementById("gem-tender-category-add-btn");

    const keywordModalElement = document.getElementById("gem-keyword-modal");
    const keywordForm = document.getElementById("gem-keyword-form");
    const keywordFormAlert = document.getElementById("gem-keyword-form-alert");
    const keywordIdInput = document.getElementById("gem-keyword-id");
    const keywordInput = document.getElementById("gem-keyword-input");
    const keywordTenderCategorySelect = document.getElementById("gem-keyword-tender-category");
    const keywordExactSearchInput = document.getElementById("gem-keyword-exact-search");
    const keywordSubmitButton = document.getElementById("gem-keyword-submit-btn");

    const groupModalElement = document.getElementById("gem-group-modal");
    const groupForm = document.getElementById("gem-group-form");
    const groupFormAlert = document.getElementById("gem-group-form-alert");
    const groupIdInput = document.getElementById("gem-group-id");
    const groupNameInput = document.getElementById("gem-group-name");
    const groupTenderCategorySelect = document.getElementById("gem-group-tender-category");
    const groupSubmitButton = document.getElementById("gem-group-submit-btn");

    const categoryModalElement = document.getElementById("gem-category-modal");
    const categoryForm = document.getElementById("gem-category-form");
    const categoryFormAlert = document.getElementById("gem-category-form-alert");
    const categoryIdInput = document.getElementById("gem-category-id");
    const categoryGroupIdInput = document.getElementById("gem-category-group-id");
    const categoryNameInput = document.getElementById("gem-category-name");
    const categorySubmitButton = document.getElementById("gem-category-submit-btn");

    const tenderCategoryModalElement = document.getElementById("gem-tender-category-modal");
    const tenderCategoryForm = document.getElementById("gem-tender-category-form");
    const tenderCategoryFormAlert = document.getElementById("gem-tender-category-form-alert");
    const tenderCategoryIdInput = document.getElementById("gem-tender-category-id");
    const tenderCategoryNameInput = document.getElementById("gem-tender-category-name");
    const tenderCategorySubmitButton = document.getElementById("gem-tender-category-submit-btn");

    const editIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true"><path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.468-.325"/></svg>`;
    const deleteIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0z"/><path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4zM2.5 3h11V2h-11z"/></svg>`;

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    async function apiRequest(url, method = "GET", body = undefined) {
        const response = await fetch(url, {
            method,
            credentials: "same-origin",
            headers: body ? { "Content-Type": "application/json" } : undefined,
            body: body ? JSON.stringify(body) : undefined,
        });
        const data = await response.json().catch(() => ({}));
        return { ok: response.ok || response.status === 204, data };
    }

    function confirmDelete(title, description) {
        return showConfirm({
            title,
            description,
            choices: [
                { label: "Cancel", value: false, variant: "outline-secondary" },
                { label: "Delete", value: true, variant: "danger" },
            ],
        });
    }

    function tenderCategoryOptions(selectedId, placeholder) {
        const options = state.tenderCategories.map(
            (tenderCategory) =>
                `<option value="${tenderCategory.id}" ${
                    Number(selectedId) === Number(tenderCategory.id) ? "selected" : ""
                }>${escapeHtml(tenderCategory.name)}</option>`,
        );
        return [
            `<option value="" ${selectedId ? "" : "selected"}>${escapeHtml(placeholder)}</option>`,
            ...options,
        ].join("");
    }

    // ---------- Direct Search ----------

    function syncSharedScanControls() {
        const keywordCount = selectedKeywordIds.size;
        const categoryCount = selectedCategoryIds.size;
        const totalSelected = keywordCount + categoryCount;
        const hideScan = activeScannerTab === "categories";

        scannerScanButton.classList.toggle("d-none", hideScan);
        scannerScanButton.disabled = totalSelected === 0 || hideScan;

        if (!totalSelected) {
            scannerScanButton.textContent = "Scan";
            return;
        }
        const parts = [];
        if (keywordCount) {
            parts.push(`${keywordCount} keyword${keywordCount === 1 ? "" : "s"}`);
        }
        if (categoryCount) {
            parts.push(`${categoryCount} categor${categoryCount === 1 ? "y" : "ies"}`);
        }
        scannerScanButton.textContent = `Scan (${parts.join(" + ")})`;
    }

    function syncKeywordControls() {
        const keywordCount = state.scanKeywords.length;
        const selectedCount = selectedKeywordIds.size;
        keywordSelectAll.checked = keywordCount > 0 && selectedCount === keywordCount;
        keywordSelectAll.indeterminate = selectedCount > 0 && selectedCount < keywordCount;
        syncSharedScanControls();
    }

    function renderKeywords() {
        for (const id of selectedKeywordIds) {
            if (!state.scanKeywords.some((scanKeyword) => scanKeyword.id === id)) {
                selectedKeywordIds.delete(id);
            }
        }
        keywordsEmpty.classList.toggle("d-none", state.scanKeywords.length > 0);
        keywordSelectAllWrap.classList.toggle("d-none", state.scanKeywords.length === 0);
        keywordsList.innerHTML = state.scanKeywords
            .map(
                (scanKeyword) => `
                <div class="d-flex flex-wrap align-items-center gap-3 py-2 border-bottom gem-keyword-row" data-id="${scanKeyword.id}">
                    <div class="form-check mb-0 flex-grow-1">
                        <input
                            class="form-check-input gem-keyword-check"
                            type="checkbox"
                            id="gem-keyword-check-${scanKeyword.id}"
                            ${selectedKeywordIds.has(scanKeyword.id) ? "checked" : ""}
                        />
                        <label class="form-check-label" for="gem-keyword-check-${scanKeyword.id}">
                            ${escapeHtml(scanKeyword.keyword)}
                        </label>
                    </div>
                    <div class="form-check form-switch mb-0">
                        <input
                            class="form-check-input gem-keyword-exact"
                            type="checkbox"
                            role="switch"
                            id="gem-keyword-exact-${scanKeyword.id}"
                            ${scanKeyword.exact_search ? "checked" : ""}
                        />
                        <label class="form-check-label small" for="gem-keyword-exact-${scanKeyword.id}">Exact</label>
                    </div>
                    <select class="form-select form-select-sm w-auto gem-keyword-tender-category" aria-label="HammerByte category">
                        ${tenderCategoryOptions(scanKeyword.tender_category_id, "Select category")}
                    </select>
                    <div class="btn-group btn-group-sm">
                        <button type="button" class="btn btn-outline-secondary gem-keyword-edit-btn" title="Edit keyword" aria-label="Edit keyword">${editIcon}</button>
                        <button type="button" class="btn btn-outline-danger gem-keyword-delete-btn" title="Delete keyword" aria-label="Delete keyword">${deleteIcon}</button>
                    </div>
                </div>`,
            )
            .join("");
        syncKeywordControls();
    }

    async function loadScanKeywords() {
        const { ok, data } = await apiRequest("/api/gem-scan-keywords");
        if (!ok) {
            showAlert(alertElement, data.error || "Failed to load keywords.");
            window.scrollTo({ top: 0, behavior: "smooth" });
            return;
        }
        state.scanKeywords = data.keywords || [];
        renderKeywords();
    }

    function openKeywordModal(scanKeyword) {
        keywordFormAlert.classList.add("d-none");
        keywordIdInput.value = scanKeyword ? scanKeyword.id : "";
        keywordInput.value = scanKeyword ? scanKeyword.keyword : "";
        keywordExactSearchInput.checked = !!scanKeyword?.exact_search;
        keywordTenderCategorySelect.innerHTML = tenderCategoryOptions(
            scanKeyword?.tender_category_id,
            "Select category",
        );
        document.getElementById("gem-keyword-modal-title").textContent = scanKeyword
            ? "Edit keyword"
            : "Add keyword";
        bootstrap.Modal.getOrCreateInstance(keywordModalElement).show();
    }

    keywordAddButton.addEventListener("click", () => openKeywordModal(null));

    keywordModalElement.addEventListener("shown.bs.modal", () => keywordInput.focus());

    keywordForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        keywordFormAlert.classList.add("d-none");
        const id = Number(keywordIdInput.value || 0);
        const keyword = keywordInput.value.trim();
        const tenderCategoryId = Number(keywordTenderCategorySelect.value || 0);
        if (!keyword) {
            showAlert(keywordFormAlert, "Keyword is required.");
            return;
        }
        if (!tenderCategoryId) {
            showAlert(keywordFormAlert, "HammerByte category is required.");
            return;
        }

        keywordSubmitButton.disabled = true;
        try {
            const { ok, data } = await apiRequest(
                id ? `/api/gem-scan-keywords/${id}` : "/api/gem-scan-keywords",
                id ? "PATCH" : "POST",
                {
                    keyword,
                    exact_search: keywordExactSearchInput.checked,
                    tender_category_id: tenderCategoryId,
                },
            );
            if (!ok) {
                showAlert(keywordFormAlert, data.error || "Failed to save keyword.");
                return;
            }
            bootstrap.Modal.getOrCreateInstance(keywordModalElement).hide();
            await loadScanKeywords();
        } catch (error) {
            console.error(error);
            showAlert(keywordFormAlert, "Failed to save keyword.");
        } finally {
            keywordSubmitButton.disabled = false;
        }
    });

    keywordSelectAll.addEventListener("change", () => {
        selectedKeywordIds.clear();
        if (keywordSelectAll.checked) {
            for (const scanKeyword of state.scanKeywords) {
                selectedKeywordIds.add(scanKeyword.id);
            }
        }
        renderKeywords();
    });

    keywordsList.addEventListener("change", async (event) => {
        const row = event.target.closest(".gem-keyword-row");
        if (!row) return;
        const id = Number(row.dataset.id);
        const scanKeyword = state.scanKeywords.find((item) => item.id === id);
        if (!scanKeyword) return;

        if (event.target.classList.contains("gem-keyword-check")) {
            if (event.target.checked) {
                selectedKeywordIds.add(id);
            } else {
                selectedKeywordIds.delete(id);
            }
            syncKeywordControls();
            return;
        }

        const isExactToggle = event.target.classList.contains("gem-keyword-exact");
        const isCategorySelect = event.target.classList.contains("gem-keyword-tender-category");
        if (!isExactToggle && !isCategorySelect) return;

        const payload = {
            keyword: scanKeyword.keyword,
            exact_search: isExactToggle ? event.target.checked : !!scanKeyword.exact_search,
            tender_category_id: isCategorySelect
                ? Number(event.target.value || 0)
                : scanKeyword.tender_category_id,
        };
        if (!payload.tender_category_id) {
            showAlert(alertElement, "HammerByte category is required.");
            window.scrollTo({ top: 0, behavior: "smooth" });
            renderKeywords();
            return;
        }
        try {
            const { ok, data } = await apiRequest(`/api/gem-scan-keywords/${id}`, "PATCH", payload);
            if (!ok) {
                showAlert(alertElement, data.error || "Failed to update keyword.");
            window.scrollTo({ top: 0, behavior: "smooth" });
            }
        } catch (error) {
            console.error(error);
            showAlert(alertElement, "Failed to update keyword.");
            window.scrollTo({ top: 0, behavior: "smooth" });
        }
        await loadScanKeywords();
    });

    keywordsList.addEventListener("click", async (event) => {
        const row = event.target.closest(".gem-keyword-row");
        if (!row) return;
        const id = Number(row.dataset.id);
        const scanKeyword = state.scanKeywords.find((item) => item.id === id);
        if (!scanKeyword) return;

        if (event.target.closest(".gem-keyword-edit-btn")) {
            openKeywordModal(scanKeyword);
            return;
        }

        if (event.target.closest(".gem-keyword-delete-btn")) {
            const confirmed = await confirmDelete(
                "Delete keyword",
                `Delete keyword "${scanKeyword.keyword}"?`,
            );
            if (!confirmed) return;
            try {
                const { ok, data } = await apiRequest(`/api/gem-scan-keywords/${id}`, "DELETE");
                if (!ok) {
                    showAlert(alertElement, data.error || "Failed to delete keyword.");
            window.scrollTo({ top: 0, behavior: "smooth" });
                    return;
                }
                await loadScanKeywords();
            } catch (error) {
                console.error(error);
                showAlert(alertElement, "Failed to delete keyword.");
            window.scrollTo({ top: 0, behavior: "smooth" });
            }
        }
    });

    // ---------- Advance Search ----------

    function syncAdvanceScanControls() {
        const totalCategories = state.categories.length;
        const selectedCount = selectedCategoryIds.size;
        advanceSelectAllWrap.classList.toggle("d-none", totalCategories === 0);
        advanceSelectAll.checked =
            totalCategories > 0 && selectedCount === totalCategories;
        advanceSelectAll.indeterminate =
            selectedCount > 0 && selectedCount < totalCategories;
        syncSharedScanControls();
    }

    function renderGroups() {
        for (const id of selectedCategoryIds) {
            if (!state.categories.some((category) => category.id === id)) {
                selectedCategoryIds.delete(id);
            }
        }
        groupsEmpty.classList.toggle("d-none", state.groups.length > 0);
        if (!state.groups.length) {
            groupsList.innerHTML = "";
            syncAdvanceScanControls();
            return;
        }
        groupsList.innerHTML = `
            <div class="table-responsive">
                <table class="table table-hover align-middle mb-0" id="gem-groups-table">
                    <thead class="table-light">
                        <tr>
                            <th scope="col">Group</th>
                            <th scope="col">HammerByte category</th>
                            <th scope="col">GEM categories</th>
                            <th scope="col" class="text-end">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${state.groups
                            .map((group) => {
                                const groupCategories = state.categories.filter(
                                    (category) => Number(category.group_id) === Number(group.id),
                                );
                                const selectedCount = groupCategories.filter((category) =>
                                    selectedCategoryIds.has(category.id),
                                ).length;
                                const allSelected =
                                    groupCategories.length > 0 &&
                                    selectedCount === groupCategories.length;
                                return `
                        <tr class="gem-group-card" data-id="${group.id}">
                            <td>
                                <div class="fw-semibold">${escapeHtml(group.name)}</div>
                                <div class="form-check mt-2 mb-0">
                                    <input
                                        class="form-check-input gem-group-select-all"
                                        type="checkbox"
                                        id="gem-group-select-all-${group.id}"
                                        ${allSelected ? "checked" : ""}
                                        ${groupCategories.length ? "" : "disabled"}
                                    />
                                    <label class="form-check-label small" for="gem-group-select-all-${group.id}">Select all in group</label>
                                </div>
                            </td>
                            <td>
                                <select class="form-select form-select-sm gem-group-tender-category" aria-label="HammerByte category">
                                    ${tenderCategoryOptions(group.tender_category_id, "No HammerByte category")}
                                </select>
                            </td>
                            <td>
                                <div class="d-flex justify-content-between align-items-center mb-2">
                                    <span class="small text-secondary">${groupCategories.length} categories</span>
                                    <button type="button" class="btn btn-sm btn-outline-primary gem-category-add-btn">Add</button>
                                </div>
                                ${
                                    groupCategories.length
                                        ? groupCategories
                                              .map(
                                                  (category) => `
                                <div class="d-flex align-items-center gap-2 py-1 gem-category-row" data-id="${category.id}">
                                    <div class="form-check mb-0 flex-grow-1">
                                        <input
                                            class="form-check-input gem-category-check"
                                            type="checkbox"
                                            id="gem-category-check-${category.id}"
                                            ${selectedCategoryIds.has(category.id) ? "checked" : ""}
                                        />
                                        <label class="form-check-label small" for="gem-category-check-${category.id}">${escapeHtml(category.name)}</label>
                                    </div>
                                    <div class="d-inline-flex gap-1 hb-icon-actions">
                                        <button type="button" class="btn btn-sm btn-outline-secondary hb-icon-btn gem-category-edit-btn" title="Edit" aria-label="Edit">${editIcon}</button>
                                        <button type="button" class="btn btn-sm btn-outline-danger hb-icon-btn gem-category-delete-btn" title="Delete" aria-label="Delete">${deleteIcon}</button>
                                    </div>
                                </div>`,
                                              )
                                              .join("")
                                        : `<p class="text-secondary small mb-0">No GEM categories in this group yet.</p>`
                                }
                            </td>
                            <td class="text-end">
                                <div class="d-inline-flex gap-1 justify-content-end hb-icon-actions">
                                    <button type="button" class="btn btn-sm btn-outline-secondary hb-icon-btn gem-group-edit-btn" title="Edit" aria-label="Edit">${editIcon}</button>
                                    <button type="button" class="btn btn-sm btn-outline-danger hb-icon-btn gem-group-delete-btn" title="Delete" aria-label="Delete">${deleteIcon}</button>
                                </div>
                            </td>
                        </tr>`;
                            })
                            .join("")}
                    </tbody>
                </table>
            </div>`;
        syncAdvanceScanControls();
    }

    async function loadGroups() {
        const { ok, data } = await apiRequest("/api/gem-category-groups");
        if (!ok) {
            showAlert(alertElement, data.error || "Failed to load groups.");
            window.scrollTo({ top: 0, behavior: "smooth" });
            return;
        }
        state.groups = data.groups || [];
        renderGroups();
    }

    async function loadCategories() {
        const { ok, data } = await apiRequest("/api/gem-categories");
        if (!ok) {
            showAlert(alertElement, data.error || "Failed to load GEM categories.");
            window.scrollTo({ top: 0, behavior: "smooth" });
            return;
        }
        state.categories = data.categories || [];
        renderGroups();
    }

    function openGroupModal(group) {
        groupFormAlert.classList.add("d-none");
        groupIdInput.value = group ? group.id : "";
        groupNameInput.value = group ? group.name : "";
        groupTenderCategorySelect.innerHTML = tenderCategoryOptions(
            group?.tender_category_id,
            "No HammerByte category",
        );
        document.getElementById("gem-group-modal-title").textContent = group
            ? "Edit group"
            : "Add group";
        bootstrap.Modal.getOrCreateInstance(groupModalElement).show();
    }

    function openCategoryModal({ groupId, category }) {
        categoryFormAlert.classList.add("d-none");
        categoryIdInput.value = category ? category.id : "";
        categoryGroupIdInput.value = groupId;
        categoryNameInput.value = category ? category.name : "";
        document.getElementById("gem-category-modal-title").textContent = category
            ? "Edit GEM category"
            : "Add GEM category";
        bootstrap.Modal.getOrCreateInstance(categoryModalElement).show();
    }

    groupAddButton.addEventListener("click", () => openGroupModal(null));

    groupModalElement.addEventListener("shown.bs.modal", () => groupNameInput.focus());
    categoryModalElement.addEventListener("shown.bs.modal", () => categoryNameInput.focus());

    groupForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        groupFormAlert.classList.add("d-none");
        const id = Number(groupIdInput.value || 0);
        const name = groupNameInput.value.trim();
        if (!name) {
            showAlert(groupFormAlert, "Group name is required.");
            return;
        }

        groupSubmitButton.disabled = true;
        try {
            const { ok, data } = await apiRequest(
                id ? `/api/gem-category-groups/${id}` : "/api/gem-category-groups",
                id ? "PATCH" : "POST",
                {
                    name,
                    tender_category_id: Number(groupTenderCategorySelect.value || 0) || null,
                },
            );
            if (!ok) {
                showAlert(groupFormAlert, data.error || "Failed to save group.");
                return;
            }
            bootstrap.Modal.getOrCreateInstance(groupModalElement).hide();
            await loadGroups();
        } catch (error) {
            console.error(error);
            showAlert(groupFormAlert, "Failed to save group.");
        } finally {
            groupSubmitButton.disabled = false;
        }
    });

    categoryForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        categoryFormAlert.classList.add("d-none");
        const id = Number(categoryIdInput.value || 0);
        const name = categoryNameInput.value.trim();
        if (!name) {
            showAlert(categoryFormAlert, "Category name is required.");
            return;
        }

        categorySubmitButton.disabled = true;
        try {
            const { ok, data } = await apiRequest(
                id ? `/api/gem-categories/${id}` : "/api/gem-categories",
                id ? "PATCH" : "POST",
                { group_id: Number(categoryGroupIdInput.value), name },
            );
            if (!ok) {
                showAlert(categoryFormAlert, data.error || "Failed to save category.");
                return;
            }
            bootstrap.Modal.getOrCreateInstance(categoryModalElement).hide();
            await Promise.all([loadCategories(), loadGroups()]);
        } catch (error) {
            console.error(error);
            showAlert(categoryFormAlert, "Failed to save category.");
        } finally {
            categorySubmitButton.disabled = false;
        }
    });

    groupsList.addEventListener("change", async (event) => {
        const card = event.target.closest(".gem-group-card");
        if (!card) return;
        const groupId = Number(card.dataset.id);
        const group = state.groups.find((item) => item.id === groupId);
        if (!group) return;

        if (event.target.classList.contains("gem-group-select-all")) {
            for (const category of state.categories) {
                if (Number(category.group_id) !== groupId) continue;
                if (event.target.checked) {
                    selectedCategoryIds.add(category.id);
                } else {
                    selectedCategoryIds.delete(category.id);
                }
            }
            renderGroups();
            return;
        }

        if (event.target.classList.contains("gem-category-check")) {
            const categoryId = Number(event.target.closest(".gem-category-row").dataset.id);
            if (event.target.checked) {
                selectedCategoryIds.add(categoryId);
            } else {
                selectedCategoryIds.delete(categoryId);
            }
            renderGroups();
            return;
        }

        if (event.target.classList.contains("gem-group-tender-category")) {
            try {
                const { ok, data } = await apiRequest(
                    `/api/gem-category-groups/${groupId}`,
                    "PATCH",
                    {
                        name: group.name,
                        tender_category_id: Number(event.target.value || 0) || null,
                    },
                );
                if (!ok) {
                    showAlert(alertElement, data.error || "Failed to update group.");
            window.scrollTo({ top: 0, behavior: "smooth" });
                }
            } catch (error) {
                console.error(error);
                showAlert(alertElement, "Failed to update group.");
            window.scrollTo({ top: 0, behavior: "smooth" });
            }
            await loadGroups();
        }
    });

    groupsList.addEventListener("click", async (event) => {
        const card = event.target.closest(".gem-group-card");
        if (!card) return;
        const groupId = Number(card.dataset.id);
        const group = state.groups.find((item) => item.id === groupId);
        if (!group) return;

        if (event.target.closest(".gem-group-edit-btn")) {
            openGroupModal(group);
            return;
        }

        if (event.target.closest(".gem-group-delete-btn")) {
            const confirmed = await confirmDelete(
                "Delete group",
                `Delete group "${group.name}"? All GEM categories in this group will also be deleted.`,
            );
            if (!confirmed) return;
            try {
                const { ok, data } = await apiRequest(`/api/gem-category-groups/${groupId}`, "DELETE");
                if (!ok) {
                    showAlert(alertElement, data.error || "Failed to delete group.");
            window.scrollTo({ top: 0, behavior: "smooth" });
                    return;
                }
                await Promise.all([loadGroups(), loadCategories()]);
            } catch (error) {
                console.error(error);
                showAlert(alertElement, "Failed to delete group.");
            window.scrollTo({ top: 0, behavior: "smooth" });
            }
            return;
        }

        if (event.target.closest(".gem-category-add-btn")) {
            openCategoryModal({ groupId, category: null });
            return;
        }

        const categoryRow = event.target.closest(".gem-category-row");
        const category = categoryRow
            ? state.categories.find((item) => item.id === Number(categoryRow.dataset.id))
            : null;

        if (category && event.target.closest(".gem-category-edit-btn")) {
            openCategoryModal({ groupId, category });
            return;
        }

        if (category && event.target.closest(".gem-category-delete-btn")) {
            const confirmed = await confirmDelete(
                "Delete GEM category",
                `Delete GEM category "${category.name}"?`,
            );
            if (!confirmed) return;
            try {
                const { ok, data } = await apiRequest(`/api/gem-categories/${category.id}`, "DELETE");
                if (!ok) {
                    showAlert(alertElement, data.error || "Failed to delete GEM category.");
            window.scrollTo({ top: 0, behavior: "smooth" });
                    return;
                }
                await Promise.all([loadCategories(), loadGroups()]);
            } catch (error) {
                console.error(error);
                showAlert(alertElement, "Failed to delete GEM category.");
            window.scrollTo({ top: 0, behavior: "smooth" });
            }
            return;
        }

    });

    advanceSelectAll.addEventListener("change", () => {
        if (advanceSelectAll.checked) {
            for (const category of state.categories) {
                selectedCategoryIds.add(category.id);
            }
        } else {
            selectedCategoryIds.clear();
        }
        renderGroups();
    });

    scannerScanButton.addEventListener("click", async () => {
        const keywordIds = Array.from(selectedKeywordIds);
        const categoryIds = Array.from(selectedCategoryIds);
        if (!keywordIds.length && !categoryIds.length) {
            showAlert(alertElement, "Select at least one keyword or GEM category to scan.");
            window.scrollTo({ top: 0, behavior: "smooth" });
            return;
        }
        scannerScanButton.disabled = true;
        try {
            const { ok, data } = await apiRequest("/api/gem-scanner/scan", "POST", {
                keyword_ids: keywordIds,
                category_ids: categoryIds,
            });
            if (!ok) {
                showAlert(alertElement, data.error || "Failed to queue scan.");
                window.scrollTo({ top: 0, behavior: "smooth" });
                renderAll();
                return;
            }
            showAlert(alertElement, 
                data.message || "Scan queued. Track it under History.",
                "success",
            );
            window.scrollTo({ top: 0, behavior: "smooth" });
            renderAll();
        } catch (error) {
            console.error(error);
            showAlert(alertElement, "Failed to queue scan.");
            window.scrollTo({ top: 0, behavior: "smooth" });
            renderAll();
        }
    });

    scannerTabs?.addEventListener("shown.bs.tab", (event) => {
        const target = event.target?.getAttribute("data-bs-target") || "";
        if (target.includes("categories")) {
            activeScannerTab = "categories";
        } else if (target.includes("advance")) {
            activeScannerTab = "advance";
        } else {
            activeScannerTab = "direct";
        }
        syncSharedScanControls();
    });

    // ---------- Categories (HammerByte) ----------

    function renderTenderCategories() {
        tenderCategoriesEmpty.classList.toggle("d-none", state.tenderCategories.length > 0);
        tenderCategoriesTableWrap.classList.toggle("d-none", state.tenderCategories.length === 0);
        tenderCategoriesTbody.innerHTML = state.tenderCategories
            .map(
                (tenderCategory) => `
                <tr data-id="${tenderCategory.id}">
                    <td>${tenderCategory.id}</td>
                    <td>${escapeHtml(tenderCategory.name)}</td>
                    <td class="text-end">
                        <div class="btn-group btn-group-sm">
                            <button type="button" class="btn btn-outline-secondary gem-tender-category-edit-btn" title="Edit category" aria-label="Edit category">${editIcon}</button>
                            <button type="button" class="btn btn-outline-danger gem-tender-category-delete-btn" title="Delete category" aria-label="Delete category">${deleteIcon}</button>
                        </div>
                    </td>
                </tr>`,
            )
            .join("");
    }

    // Tender categories feed selects in Direct Search and Advance Search too.
    async function loadTenderCategories() {
        const { ok, data } = await apiRequest("/api/gem-tender-categories");
        if (!ok) {
            showAlert(alertElement, data.error || "Failed to load categories.");
            window.scrollTo({ top: 0, behavior: "smooth" });
            return;
        }
        state.tenderCategories = data.categories || [];
        renderTenderCategories();
        renderKeywords();
        renderGroups();
    }

    function openTenderCategoryModal(tenderCategory) {
        tenderCategoryFormAlert.classList.add("d-none");
        tenderCategoryIdInput.value = tenderCategory ? tenderCategory.id : "";
        tenderCategoryNameInput.value = tenderCategory ? tenderCategory.name : "";
        document.getElementById("gem-tender-category-modal-title").textContent = tenderCategory
            ? "Edit category"
            : "Add category";
        bootstrap.Modal.getOrCreateInstance(tenderCategoryModalElement).show();
    }

    tenderCategoryAddButton.addEventListener("click", () => openTenderCategoryModal(null));

    tenderCategoryModalElement.addEventListener("shown.bs.modal", () =>
        tenderCategoryNameInput.focus(),
    );

    tenderCategoryForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        tenderCategoryFormAlert.classList.add("d-none");
        const id = Number(tenderCategoryIdInput.value || 0);
        const name = tenderCategoryNameInput.value.trim();
        if (!name) {
            showAlert(tenderCategoryFormAlert, "Category name is required.");
            return;
        }

        tenderCategorySubmitButton.disabled = true;
        try {
            const { ok, data } = await apiRequest(
                id ? `/api/gem-tender-categories/${id}` : "/api/gem-tender-categories",
                id ? "PATCH" : "POST",
                { name },
            );
            if (!ok) {
                showAlert(tenderCategoryFormAlert, data.error || "Failed to save category.");
                return;
            }
            bootstrap.Modal.getOrCreateInstance(tenderCategoryModalElement).hide();
            await Promise.all([loadTenderCategories(), loadScanKeywords(), loadGroups()]);
        } catch (error) {
            console.error(error);
            showAlert(tenderCategoryFormAlert, "Failed to save category.");
        } finally {
            tenderCategorySubmitButton.disabled = false;
        }
    });

    tenderCategoriesTbody.addEventListener("click", async (event) => {
        const row = event.target.closest("tr[data-id]");
        if (!row) return;
        const id = Number(row.dataset.id);
        const tenderCategory = state.tenderCategories.find((item) => item.id === id);
        if (!tenderCategory) return;

        if (event.target.closest(".gem-tender-category-edit-btn")) {
            openTenderCategoryModal(tenderCategory);
            return;
        }

        if (event.target.closest(".gem-tender-category-delete-btn")) {
            const confirmed = await confirmDelete(
                "Delete category",
                `Delete category "${tenderCategory.name}"?`,
            );
            if (!confirmed) return;
            try {
                const { ok, data } = await apiRequest(`/api/gem-tender-categories/${id}`, "DELETE");
                if (!ok) {
                    showAlert(alertElement, data.error || "Failed to delete category.");
            window.scrollTo({ top: 0, behavior: "smooth" });
                    return;
                }
                await Promise.all([loadTenderCategories(), loadScanKeywords(), loadGroups()]);
            } catch (error) {
                console.error(error);
                showAlert(alertElement, "Failed to delete category.");
            window.scrollTo({ top: 0, behavior: "smooth" });
            }
        }
    });

    function renderAll() {
        renderKeywords();
        renderGroups();
        renderTenderCategories();
    }

    renderAll();
})();
