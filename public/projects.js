(() => {
    const addForm = document.getElementById("add-project-form");
    const tbody = document.getElementById("projects-tbody");
    const empty = document.getElementById("projects-empty");
    const tableWrap = document.getElementById("projects-table-wrap");
    const alertBox = document.getElementById("projects-alert");

    if (!addForm || !tbody || !alertBox) {
        return;
    }

    function showAlert(message, type) {
        alertBox.textContent = message;
        alertBox.className = `alert alert-${type}`;
        alertBox.classList.remove("d-none");
    }

    function hideAlert() {
        alertBox.classList.add("d-none");
        alertBox.textContent = "";
    }

    function showTable() {
        empty?.classList.add("d-none");
        tableWrap?.classList.remove("d-none");
    }

    function hideTableIfEmpty() {
        if (tbody.children.length === 0) {
            empty?.classList.remove("d-none");
            tableWrap?.classList.add("d-none");
        }
    }

    function createRow(projectTag) {
        const tr = document.createElement("tr");
        tr.dataset.id = projectTag.id;
        tr.innerHTML = `
            <td></td>
            <td>
                <span class="project-title-text"></span>
                <input type="text" class="form-control form-control-sm project-title-input d-none" maxlength="56" />
            </td>
            <td>
                <div class="d-flex gap-2 flex-wrap project-view-actions">
                    <button type="button" class="btn btn-sm btn-outline-secondary project-edit-btn" title="Edit">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
                            <path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.468-.325"/>
                        </svg>
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-danger project-delete-btn">Delete</button>
                </div>
                <div class="d-flex gap-2 flex-wrap project-edit-actions d-none">
                    <button type="button" class="btn btn-sm btn-primary project-save-btn">Save</button>
                    <button type="button" class="btn btn-sm btn-outline-secondary project-cancel-btn">Cancel</button>
                </div>
            </td>
        `;
        tr.children[0].textContent = projectTag.id;
        tr.querySelector(".project-title-text").textContent = projectTag.title;
        tr.querySelector(".project-title-input").value = projectTag.title;
        return tr;
    }

    function setRowEditing(row, editing) {
        row.querySelector(".project-title-text")?.classList.toggle("d-none", editing);
        row.querySelector(".project-title-input")?.classList.toggle("d-none", !editing);
        row.querySelector(".project-view-actions")?.classList.toggle("d-none", editing);
        row.querySelector(".project-edit-actions")?.classList.toggle("d-none", !editing);
    }

    addForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideAlert();

        const title = addForm.elements.namedItem("title")?.value?.trim() || "";
        if (!title) {
            showAlert("Title is required.", "danger");
            return;
        }

        try {
            const response = await fetch("/api/project-tags", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title }),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                showAlert(data.error || "Failed to add project.", "danger");
                return;
            }

            showTable();
            tbody.appendChild(createRow(data.projectTag));
            addForm.reset();
            showAlert("Project added.", "success");
        } catch (error) {
            console.error(error);
            showAlert("Failed to add project.", "danger");
        }
    });

    tbody.addEventListener("click", async (event) => {
        const row = event.target.closest("tr[data-id]");
        if (!row) return;

        const id = Number(row.dataset.id);
        const titleText = row.querySelector(".project-title-text");
        const titleInput = row.querySelector(".project-title-input");

        if (event.target.closest(".project-edit-btn")) {
            titleInput.value = titleText.textContent;
            setRowEditing(row, true);
            titleInput.focus();
            return;
        }

        if (event.target.closest(".project-cancel-btn")) {
            titleInput.value = titleText.textContent;
            setRowEditing(row, false);
            return;
        }

        if (event.target.closest(".project-save-btn")) {
            hideAlert();
            const title = titleInput.value.trim();
            if (!title) {
                showAlert("Title is required.", "danger");
                return;
            }

            try {
                const response = await fetch("/api/project-tags", {
                    method: "PATCH",
                    credentials: "same-origin",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id, title }),
                });
                const data = await response.json().catch(() => ({}));

                if (!response.ok) {
                    showAlert(data.error || "Failed to update project.", "danger");
                    return;
                }

                titleText.textContent = data.projectTag.title;
                titleInput.value = data.projectTag.title;
                setRowEditing(row, false);
                showAlert("Project updated.", "success");
            } catch (error) {
                console.error(error);
                showAlert("Failed to update project.", "danger");
            }
            return;
        }

        if (event.target.closest(".project-delete-btn")) {
            if (!window.confirm("Delete this project tag?")) {
                return;
            }

            hideAlert();
            try {
                const response = await fetch(`/api/project-tags/${id}`, {
                    method: "DELETE",
                    credentials: "same-origin",
                });

                if (!response.ok && response.status !== 204) {
                    const data = await response.json().catch(() => ({}));
                    showAlert(data.error || "Failed to delete project.", "danger");
                    return;
                }

                row.remove();
                hideTableIfEmpty();
                showAlert("Project deleted.", "success");
            } catch (error) {
                console.error(error);
                showAlert("Failed to delete project.", "danger");
            }
        }
    });
})();
