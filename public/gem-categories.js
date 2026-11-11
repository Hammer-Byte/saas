(() => {
    const alertElement = document.getElementById("gem-categories-alert");
    const groupForm = document.getElementById("gem-group-form");
    const groupIdInput = document.getElementById("gem-group-id");
    const groupNameInput = document.getElementById("gem-group-name");
    const groupSubmitBtn = document.getElementById("gem-group-submit-btn");
    const groupCancelBtn = document.getElementById("gem-group-cancel-btn");
    const groupsList = document.getElementById("gem-groups-list");

    const categoryForm = document.getElementById("gem-category-form");
    const categoryIdInput = document.getElementById("gem-category-id");
    const categoryNameInput = document.getElementById("gem-category-name");
    const categorySubmitBtn = document.getElementById("gem-category-submit-btn");
    const categoryCancelBtn = document.getElementById("gem-category-cancel-btn");

    const page = window.__GEM_CATEGORIES_PAGE__ || {};
    let selectedGroupId =
        page.selectedGroupId != null && Number(page.selectedGroupId) >= 1
            ? Number(page.selectedGroupId)
            : null;
    const scanWasProcessing = !!page.processing;
    const scanButton = document.getElementById("gem-category-scan-btn");
    const scanSelection = document.getElementById("gem-scan-selection");

    function showAlert(message, type = "danger") {
        if (!alertElement) return;
        alertElement.textContent = message;
        alertElement.className = `alert alert-${type}`;
        alertElement.classList.remove("d-none");
    }

    function resetGroupForm() {
        if (groupIdInput) groupIdInput.value = "";
        if (groupNameInput) groupNameInput.value = "";
        if (groupSubmitBtn) groupSubmitBtn.textContent = "Add group";
        groupCancelBtn?.classList.add("d-none");
    }

    function resetCategoryForm() {
        if (categoryIdInput) categoryIdInput.value = "";
        if (categoryNameInput) categoryNameInput.value = "";
        if (categorySubmitBtn) categorySubmitBtn.textContent = "Add category";
        categoryCancelBtn?.classList.add("d-none");
    }

    function reloadWithGroup(groupId) {
        const url = new URL(window.location.href);
        if (groupId >= 1) {
            url.searchParams.set("group_id", String(groupId));
        } else {
            url.searchParams.delete("group_id");
        }
        window.location.href = url.toString();
    }

    groupForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const name = String(groupNameInput?.value || "").trim();
        if (!name) {
            showAlert("Group name is required.");
            return;
        }

        const id = Number(groupIdInput?.value || 0);
        const isEdit = id >= 1;
        groupSubmitBtn.disabled = true;
        try {
            const response = await fetch(
                isEdit ? `/api/gem-category-groups/${id}` : "/api/gem-category-groups",
                {
                    method: isEdit ? "PATCH" : "POST",
                    credentials: "same-origin",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name }),
                },
            );
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showAlert(data.error || "Failed to save group.");
                return;
            }
            const nextId = Number(data.group?.id || id || selectedGroupId || 0);
            reloadWithGroup(nextId);
        } catch (error) {
            console.error(error);
            showAlert("Failed to save group.");
        } finally {
            groupSubmitBtn.disabled = false;
        }
    });

    groupCancelBtn?.addEventListener("click", () => resetGroupForm());

    groupsList?.addEventListener("click", async (event) => {
        const item = event.target.closest(".gem-group-item");
        if (!item) return;
        const id = Number(item.dataset.id || 0);
        const name = item.dataset.name || "";

        if (event.target.closest(".gem-group-select-btn")) {
            if (id >= 1) reloadWithGroup(id);
            return;
        }

        if (event.target.closest(".gem-group-edit-btn")) {
            if (groupIdInput) groupIdInput.value = String(id);
            if (groupNameInput) groupNameInput.value = name;
            if (groupSubmitBtn) groupSubmitBtn.textContent = "Update group";
            groupCancelBtn?.classList.remove("d-none");
            groupNameInput?.focus();
            return;
        }

        if (event.target.closest(".gem-group-delete-btn")) {
            const confirmed = window.confirm(
                `Delete group "${name}"? All categories in this group will also be deleted.`,
            );
            if (!confirmed) return;
            try {
                const response = await fetch(`/api/gem-category-groups/${id}`, {
                    method: "DELETE",
                    credentials: "same-origin",
                });
                if (!response.ok && response.status !== 204) {
                    const data = await response.json().catch(() => ({}));
                    showAlert(data.error || "Failed to delete group.");
                    return;
                }
                const nextId = selectedGroupId === id ? null : selectedGroupId;
                reloadWithGroup(nextId);
            } catch (error) {
                console.error(error);
                showAlert("Failed to delete group.");
            }
        }
    });

    categoryForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!(selectedGroupId >= 1)) {
            showAlert("Select a group first.");
            return;
        }
        const name = String(categoryNameInput?.value || "").trim();
        if (!name) {
            showAlert("Category name is required.");
            return;
        }

        const id = Number(categoryIdInput?.value || 0);
        const isEdit = id >= 1;
        categorySubmitBtn.disabled = true;
        try {
            const response = await fetch(
                isEdit ? `/api/gem-categories/${id}` : "/api/gem-categories",
                {
                    method: isEdit ? "PATCH" : "POST",
                    credentials: "same-origin",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        group_id: selectedGroupId,
                        name,
                    }),
                },
            );
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showAlert(data.error || "Failed to save category.");
                return;
            }
            reloadWithGroup(selectedGroupId);
        } catch (error) {
            console.error(error);
            showAlert("Failed to save category.");
        } finally {
            categorySubmitBtn.disabled = false;
        }
    });

    categoryCancelBtn?.addEventListener("click", () => resetCategoryForm());

    function categoryScanCheckboxes() {
        return Array.from(
            scanSelection?.querySelectorAll(".gem-scan-category-check") || [],
        );
    }

    function selectedScanCategoryIds() {
        return categoryScanCheckboxes()
            .filter((input) => input.checked)
            .map((input) => Number(input.value || 0))
            .filter((id) => id >= 1);
    }

    function syncGroupCheckFromCategories(groupId) {
        const groupCheck = scanSelection?.querySelector(
            `.gem-scan-group-check[value="${groupId}"]`,
        );
        if (!groupCheck) return;
        const categoryChecks = Array.from(
            scanSelection.querySelectorAll(
                `.gem-scan-category-check[data-group-id="${groupId}"]`,
            ),
        );
        const checkedCount = categoryChecks.filter((input) => input.checked).length;
        groupCheck.checked =
            categoryChecks.length > 0 && checkedCount === categoryChecks.length;
        groupCheck.indeterminate =
            checkedCount > 0 && checkedCount < categoryChecks.length;
    }

    function syncScanButton() {
        if (!scanButton || scanWasProcessing) return;
        const selectedCount = selectedScanCategoryIds().length;
        scanButton.disabled = selectedCount === 0;
        scanButton.textContent =
            selectedCount > 0 ? `Start scan (${selectedCount})` : "Start scan";
    }

    function setScanRunning() {
        if (!scanButton) return;
        scanButton.disabled = true;
        scanButton.textContent = "Scan in progress…";
        for (const input of categoryScanCheckboxes()) {
            input.disabled = true;
        }
        for (const input of scanSelection?.querySelectorAll(".gem-scan-group-check") || []) {
            input.disabled = true;
        }
    }

    scanSelection?.addEventListener("change", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;

        if (target.classList.contains("gem-scan-group-check")) {
            const groupId = target.value;
            const checked = target.checked;
            for (const input of scanSelection.querySelectorAll(
                `.gem-scan-category-check[data-group-id="${groupId}"]`,
            )) {
                input.checked = checked;
            }
            target.indeterminate = false;
            syncScanButton();
            return;
        }

        if (target.classList.contains("gem-scan-category-check")) {
            syncGroupCheckFromCategories(target.dataset.groupId);
            syncScanButton();
        }
    });

    scanButton?.addEventListener("click", async () => {
        const category_ids = selectedScanCategoryIds();
        if (!category_ids.length) {
            showAlert("Select at least one category to scan.");
            return;
        }

        scanButton.disabled = true;
        try {
            const response = await fetch("/api/gem-categories/scan", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ category_ids }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showAlert(data.error || "Failed to start scan.");
                syncScanButton();
                return;
            }
            setScanRunning();
            showAlert(
                data.message || `Scan started for ${category_ids.length} categor${category_ids.length === 1 ? "y" : "ies"}.`,
                "success",
            );
        } catch (error) {
            console.error(error);
            showAlert("Failed to start scan.");
            syncScanButton();
        }
    });

    syncScanButton();

    document.getElementById("gem-categories-tbody")?.addEventListener("click", async (event) => {
        const row = event.target.closest("tr[data-id]");
        if (!row) return;
        const id = Number(row.dataset.id || 0);
        const name = row.dataset.name || "";

        if (event.target.closest(".gem-category-edit-btn")) {
            if (categoryIdInput) categoryIdInput.value = String(id);
            if (categoryNameInput) categoryNameInput.value = name;
            if (categorySubmitBtn) categorySubmitBtn.textContent = "Update category";
            categoryCancelBtn?.classList.remove("d-none");
            categoryNameInput?.focus();
            return;
        }

        if (event.target.closest(".gem-category-delete-btn")) {
            const confirmed = window.confirm(`Delete category "${name}"?`);
            if (!confirmed) return;
            try {
                const response = await fetch(`/api/gem-categories/${id}`, {
                    method: "DELETE",
                    credentials: "same-origin",
                });
                if (!response.ok && response.status !== 204) {
                    const data = await response.json().catch(() => ({}));
                    showAlert(data.error || "Failed to delete category.");
                    return;
                }
                reloadWithGroup(selectedGroupId);
            } catch (error) {
                console.error(error);
                showAlert("Failed to delete category.");
            }
        }
    });
})();
