(() => {
    const form = document.getElementById("job-form");
    const formAlert = document.getElementById("job-form-alert");
    const pageAlert = document.getElementById("jobs-alert");
    const modalElement = document.getElementById("job-modal");
    const modalLabel = document.getElementById("job-modal-label");
    const submitButton = document.getElementById("job-submit-btn");
    const openAddButton = document.getElementById("open-add-job-btn");
    const searchInput = document.getElementById("jobs-search");
    const tableBody = document.getElementById("jobs-tbody");
    const emptyState = document.getElementById("jobs-empty");
    const tableWrap = document.getElementById("jobs-table-wrap");

    const idInput = form?.elements.namedItem("id");
    const titleInput = form?.elements.namedItem("title");
    const experienceInput = form?.elements.namedItem("experience");
    const descriptionInput = form?.elements.namedItem("description");
    const replyEmailInput = form?.elements.namedItem("reply_email");
    const activeInput = form?.elements.namedItem("active");

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

    function resetForm() {
        form?.reset();
        if (idInput) idInput.value = "";
        if (activeInput) activeInput.checked = true;
        hideAlert(formAlert);
    }

    function openAddModal() {
        resetForm();
        if (modalLabel) modalLabel.textContent = "Add job";
        if (submitButton) submitButton.textContent = "Save";
    }

    function openEditModal(row) {
        hideAlert(formAlert);
        if (modalLabel) modalLabel.textContent = "Edit job";
        if (submitButton) submitButton.textContent = "Save";
        if (idInput) idInput.value = row.dataset.id || "";
        if (titleInput) titleInput.value = row.dataset.title || "";
        if (experienceInput) experienceInput.value = row.dataset.experience || "";
        if (descriptionInput) descriptionInput.value = row.dataset.description || "";
        if (replyEmailInput) replyEmailInput.value = row.dataset.replyEmail || "";
        if (activeInput) activeInput.checked = row.dataset.active === "1";
    }

    function applySearch() {
        if (!tableBody) return;
        const query = String(searchInput?.value || "")
            .trim()
            .toLowerCase();
        let visibleCount = 0;
        for (const row of tableBody.querySelectorAll("tr[data-id]")) {
            const haystack = [
                row.dataset.title || "",
                row.dataset.experience || "",
                row.dataset.description || "",
            ]
                .join(" ")
                .toLowerCase();
            const match = !query || haystack.includes(query);
            row.classList.toggle("d-none", !match);
            if (match) visibleCount += 1;
        }
        emptyState?.classList.toggle("d-none", visibleCount > 0);
        tableWrap?.classList.toggle("d-none", visibleCount === 0 && !!query);
    }

    const sortableHeaders = Array.from(
        document.querySelectorAll("#jobs-table thead th.jobs-sortable"),
    );
    let sortState = { key: null, direction: "asc" };

    function sortValue(row, key) {
        if (key === "id" || key === "active" || key === "applications") {
            return Number(row.dataset[key] || 0);
        }
        return String(row.dataset[key] || "").toLowerCase();
    }

    function compareRows(left, right, key, direction) {
        const leftValue = sortValue(left, key);
        const rightValue = sortValue(right, key);
        let result = 0;
        if (typeof leftValue === "number" && typeof rightValue === "number") {
            result = leftValue - rightValue;
        } else {
            result = String(leftValue).localeCompare(String(rightValue), undefined, {
                numeric: true,
                sensitivity: "base",
            });
        }
        return direction === "asc" ? result : -result;
    }

    function applySort() {
        if (!tableBody || !sortState.key) return;
        const rows = Array.from(tableBody.querySelectorAll("tr[data-id]"));
        rows.sort((left, right) =>
            compareRows(left, right, sortState.key, sortState.direction),
        );
        for (const row of rows) {
            tableBody.appendChild(row);
        }
        for (const header of sortableHeaders) {
            if (header.dataset.sortKey === sortState.key) {
                header.setAttribute(
                    "aria-sort",
                    sortState.direction === "asc" ? "ascending" : "descending",
                );
            } else {
                header.setAttribute("aria-sort", "none");
            }
        }
    }

    for (const header of sortableHeaders) {
        header.style.cursor = "pointer";
        header.addEventListener("click", () => {
            const key = header.dataset.sortKey;
            if (!key) return;
            if (sortState.key === key) {
                sortState.direction = sortState.direction === "asc" ? "desc" : "asc";
            } else {
                sortState = { key, direction: "asc" };
            }
            applySort();
        });
    }

    openAddButton?.addEventListener("click", openAddModal);

    searchInput?.addEventListener("input", applySearch);

    tableBody?.addEventListener("click", async (event) => {
        const editButton = event.target.closest(".job-edit-btn");
        const deleteButton = event.target.closest(".job-delete-btn");
        const row = event.target.closest("tr[data-id]");
        if (!row) return;

        if (editButton) {
            event.preventDefault();
            event.stopPropagation();
            openEditModal(row);
            if (modalElement && window.bootstrap?.Modal) {
                window.bootstrap.Modal.getOrCreateInstance(modalElement).show();
            }
            return;
        }

        if (deleteButton) {
            event.preventDefault();
            event.stopPropagation();
            const confirmed = await window.showConfirm({
                title: "Delete job?",
                description:
                    "This deletes the opening, all applications, and uploaded resumes. This cannot be undone.",
                choices: [
                    { label: "Cancel", value: false, className: "btn-outline-secondary" },
                    { label: "Delete", value: true, className: "btn-danger" },
                ],
            });
            if (!confirmed) return;

            hideAlert(pageAlert);
            try {
                const response = await fetch(`/api/jobs/${row.dataset.id}`, {
                    method: "DELETE",
                    credentials: "same-origin",
                });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    showAlert(pageAlert, data.error || "Failed to delete job.", "danger");
                    return;
                }
                window.location.reload();
            } catch (error) {
                showAlert(pageAlert, error?.message || "Failed to delete job.", "danger");
            }
            return;
        }

        if (event.target.closest("button, a, input, label")) {
            return;
        }
        if (row.dataset.href) {
            window.location.href = row.dataset.href;
        }
    });

    form?.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideAlert(formAlert);

        const id = Number(idInput?.value || 0);
        const title = String(titleInput?.value || "").trim();
        const experience = String(experienceInput?.value || "").trim();
        const description = String(descriptionInput?.value || "").trim();
        const replyEmail = String(replyEmailInput?.value || "").trim();
        const active = !!activeInput?.checked;

        if (!title || !experience || !description || !replyEmail) {
            showAlert(
                formAlert,
                "Title, experience, description, and reply email are required.",
                "danger",
            );
            return;
        }

        const payload = {
            title,
            experience,
            description,
            reply_email: replyEmail,
            active,
        };
        const isEdit = id > 0;
        if (isEdit) {
            payload.id = id;
        }

        if (submitButton) {
            submitButton.disabled = true;
        }

        try {
            const response = await fetch("/api/jobs", {
                method: isEdit ? "PATCH" : "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showAlert(formAlert, data.error || "Failed to save job.", "danger");
                return;
            }
            window.location.reload();
        } catch (error) {
            showAlert(formAlert, error?.message || "Failed to save job.", "danger");
        } finally {
            if (submitButton) {
                submitButton.disabled = false;
            }
        }
    });
})();
