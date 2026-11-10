(() => {
    const FILTERS_STORAGE_KEY = "inquiries-filters";
    const fromInput = document.getElementById("inquiries-from");
    const toInput = document.getElementById("inquiries-to");
    const searchInput = document.getElementById("inquiries-search");
    const followupFilter = document.getElementById("inquiries-filter-followup");
    const stateFilterRoot = document.getElementById("inquiries-filter-state");
    const sourceFilterRoot = document.getElementById("inquiries-filter-source");
    const assigneeFilterRoot = document.getElementById("inquiries-filter-assignee");
    const multiFilters = [stateFilterRoot, sourceFilterRoot, assigneeFilterRoot].filter(Boolean);
    const filtersPanel = document.getElementById("inquiries-filters-panel");
    const applyFiltersBtn = document.getElementById("inquiries-filters-apply-btn");
    const resetFiltersBtn = document.getElementById("inquiries-filters-reset-btn");
    const filterStatus = document.getElementById("inquiries-filter-status");
    const tableBody = document.getElementById("inquiries-tbody");
    const tableWrap = document.getElementById("inquiries-table-wrap");
    const emptyState = document.getElementById("inquiries-empty");
    const loadingState = document.getElementById("inquiries-loading");
    const followupOffsets = window.INQUIRY_FOLLOWUP_DAY_OFFSETS || { 1: 3, 2: 7, 3: 15 };

    const pageFrom =
        fromInput?.dataset.pageFrom ||
        new URL(window.location.href).searchParams.get("from") ||
        "";
    const pageTo =
        toInput?.dataset.pageTo ||
        new URL(window.location.href).searchParams.get("to") ||
        "";

    function emptyFilters(from = pageFrom, to = pageTo) {
        return {
            from: from || "",
            to: to || "",
            search: "",
            states: [],
            sources: [],
            assignees: [],
            followup: "",
        };
    }

    let appliedFilters = emptyFilters();

    function readStoredFilters() {
        try {
            const raw = window.localStorage.getItem(FILTERS_STORAGE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === "object" ? parsed : null;
        } catch (error) {
            return null;
        }
    }

    function writeStoredFilters(filters) {
        try {
            window.localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filters));
        } catch (error) {
            console.error(error);
        }
    }

    function multiOptions(root) {
        return Array.from(root?.querySelectorAll(".inquiries-multi-filter-option") || []);
    }

    function selectedMultiValues(root) {
        return multiOptions(root)
            .filter((input) => input.checked)
            .map((input) => String(input.value || "").trim())
            .filter(Boolean);
    }

    function selectedMultiLabels(root) {
        return multiOptions(root)
            .filter((input) => input.checked)
            .map((input) => String(input.dataset.label || input.value || "").trim())
            .filter(Boolean);
    }

    function updateMultiFilterLabel(root) {
        if (!root) return;
        const labelElement = root.querySelector(".inquiries-multi-filter-label");
        if (!labelElement) return;
        const emptyLabel = root.dataset.emptyLabel || "All";
        const labels = selectedMultiLabels(root);
        if (!labels.length) {
            labelElement.textContent = emptyLabel;
            return;
        }
        if (labels.length <= 2) {
            labelElement.textContent = labels.join(", ");
            return;
        }
        labelElement.textContent = `${labels.slice(0, 2).join(", ")} +${labels.length - 2}`;
    }

    function setSelectedMultiValues(root, values) {
        if (!root) return;
        const wanted = new Set((Array.isArray(values) ? values : []).map((value) => String(value)));
        for (const input of multiOptions(root)) {
            input.checked = wanted.has(String(input.value));
        }
        updateMultiFilterLabel(root);
    }

    function normalizeDateInput(value, fallback = "") {
        const raw = String(value || "").trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
        const fallbackRaw = String(fallback || "").trim();
        return /^\d{4}-\d{2}-\d{2}$/.test(fallbackRaw) ? fallbackRaw : "";
    }

    function normalizeStoredFilters(filters) {
        return {
            from: normalizeDateInput(filters.from, pageFrom),
            to: normalizeDateInput(filters.to, pageTo),
            search: String(filters.search || "").trim().toLowerCase(),
            states: Array.isArray(filters.states) ? filters.states.map(String).filter(Boolean) : [],
            sources: Array.isArray(filters.sources)
                ? filters.sources.map(String).filter(Boolean)
                : [],
            assignees: Array.isArray(filters.assignees)
                ? filters.assignees.map(String).filter(Boolean)
                : [],
            followup: String(filters.followup || "").trim(),
        };
    }

    function readFiltersFromDom() {
        return {
            from: normalizeDateInput(fromInput?.value, pageFrom),
            to: normalizeDateInput(toInput?.value, pageTo),
            search: String(searchInput?.value || "").trim().toLowerCase(),
            states: selectedMultiValues(stateFilterRoot),
            sources: selectedMultiValues(sourceFilterRoot),
            assignees: selectedMultiValues(assigneeFilterRoot),
            followup: String(followupFilter?.value || "").trim(),
        };
    }

    function writeFiltersToDom(filters) {
        if (fromInput) fromInput.value = filters.from || pageFrom;
        if (toInput) toInput.value = filters.to || pageTo;
        if (searchInput) searchInput.value = filters.search || "";
        if (followupFilter) followupFilter.value = filters.followup || "";
        setSelectedMultiValues(stateFilterRoot, filters.states);
        setSelectedMultiValues(sourceFilterRoot, filters.sources);
        setSelectedMultiValues(assigneeFilterRoot, filters.assignees);
    }

    function daysSince(dateValue, now) {
        const entered = new Date(dateValue);
        if (Number.isNaN(entered.getTime())) return 0;
        return Math.floor((now.getTime() - entered.getTime()) / (24 * 60 * 60 * 1000));
    }

    function matchesFollowupFilter(row, followup, now) {
        if (!followup) return true;
        const state = row.dataset.state || "";
        if (state !== "potential") return false;

        const openSlot = Number(row.dataset.openSlot || 0);
        const potentialEnteredOn = row.dataset.potentialEnteredOn || "";

        if (followup === "pending") {
            if (!(openSlot >= 1 && openSlot <= 3) || !potentialEnteredOn) return false;
            const dayOffset = Number(followupOffsets[openSlot] || 0);
            return daysSince(potentialEnteredOn, now) >= dayOffset;
        }

        const wantedSlot = Number(followup);
        return openSlot === wantedSlot;
    }

    function applyFilters() {
        const rows = Array.from(tableBody?.querySelectorAll("tr.inquiry-row") || []);
        const now = new Date();
        let visibleCount = 0;

        for (const row of rows) {
            let visible = true;

            if (appliedFilters.states.length) {
                visible = appliedFilters.states.includes(row.dataset.state || "");
            }

            if (visible && appliedFilters.sources.length) {
                visible = appliedFilters.sources.includes(row.dataset.source || "");
            }

            if (visible && appliedFilters.assignees.length) {
                visible = appliedFilters.assignees.includes(
                    String(row.dataset.assigneeUserId || "unassigned"),
                );
            }

            if (visible && appliedFilters.search) {
                const haystack = String(row.dataset.search || "");
                visible = haystack.includes(appliedFilters.search);
            }

            if (visible && appliedFilters.followup) {
                visible = matchesFollowupFilter(row, appliedFilters.followup, now);
            }

            row.classList.toggle("d-none", !visible);
            if (visible) visibleCount += 1;
        }

        const total = rows.length;
        if (filterStatus) {
            filterStatus.textContent = `Showing ${visibleCount} of ${total}`;
        }

        if (tableWrap) tableWrap.classList.toggle("d-none", visibleCount === 0);
        if (emptyState) emptyState.classList.toggle("d-none", visibleCount !== 0);
        if (loadingState) loadingState.classList.add("d-none");
    }

    function finishListLoading() {
        applyFilters();
    }

    function commitFilters({ reloadIfDatesChanged = true } = {}) {
        const nextFilters = readFiltersFromDom();
        writeStoredFilters(nextFilters);

        if (
            reloadIfDatesChanged &&
            (nextFilters.from !== pageFrom || nextFilters.to !== pageTo)
        ) {
            const url = new URL(window.location.href);
            url.searchParams.set("from", nextFilters.from);
            url.searchParams.set("to", nextFilters.to);
            window.location.assign(url.toString());
            return;
        }

        appliedFilters = nextFilters;
        applyFilters();
        const dismissButton = document.querySelector(
            '#inquiries-filters-panel [data-bs-dismiss="offcanvas"]',
        );
        dismissButton?.click();
    }

    function formatIsoDate(date) {
        const year = date.getFullYear();
        const month = `${date.getMonth() + 1}`.padStart(2, "0");
        const day = `${date.getDate()}`.padStart(2, "0");
        return `${year}-${month}-${day}`;
    }

    function startOfIndianQuarter(date) {
        const year = date.getFullYear();
        const month = date.getMonth();
        if (month <= 2) return new Date(year, 0, 1);
        if (month <= 5) return new Date(year, 3, 1);
        if (month <= 8) return new Date(year, 6, 1);
        return new Date(year, 9, 1);
    }

    function endOfIndianQuarter(date) {
        const year = date.getFullYear();
        const month = date.getMonth();
        if (month <= 2) return new Date(year, 2, 31);
        if (month <= 5) return new Date(year, 5, 30);
        if (month <= 8) return new Date(year, 8, 30);
        return new Date(year, 11, 31);
    }

    function startOfWeekMonday(date) {
        const value = new Date(date);
        const weekday = value.getDay();
        const offset = weekday === 0 ? -6 : 1 - weekday;
        value.setDate(value.getDate() + offset);
        return value;
    }

    function setQuickDateRange(range) {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        let fromDate = new Date(now);
        let toDate = new Date(now);

        if (range === "today") {
            fromDate = now;
            toDate = now;
        } else if (range === "this-week") {
            fromDate = startOfWeekMonday(now);
            toDate = now;
        } else if (range === "last-7-days") {
            fromDate = new Date(now);
            fromDate.setDate(fromDate.getDate() - 6);
            toDate = now;
        } else if (range === "last-15-days") {
            fromDate = new Date(now);
            fromDate.setDate(fromDate.getDate() - 14);
            toDate = now;
        } else if (range === "last-30-days") {
            fromDate = new Date(now);
            fromDate.setDate(fromDate.getDate() - 29);
            toDate = now;
        } else if (range === "this-month") {
            fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
            toDate = now;
        } else if (range === "last-month") {
            fromDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            toDate = new Date(now.getFullYear(), now.getMonth(), 0);
        } else if (range === "this-quarter") {
            fromDate = startOfIndianQuarter(now);
            toDate = now;
        } else if (range === "last-quarter") {
            const previous = new Date(startOfIndianQuarter(now));
            previous.setDate(previous.getDate() - 1);
            fromDate = startOfIndianQuarter(previous);
            toDate = endOfIndianQuarter(previous);
        } else {
            return;
        }

        if (fromInput) fromInput.value = formatIsoDate(fromDate);
        if (toInput) toInput.value = formatIsoDate(toDate);
    }

    function showFormAlert(element, message, type = "danger") {
        if (!element) return;
        element.textContent = message;
        element.className = `alert alert-${type}`;
        element.classList.remove("d-none");
    }

    function hideFormAlert(element) {
        if (!element) return;
        element.classList.add("d-none");
        element.textContent = "";
    }

    for (const root of multiFilters) {
        updateMultiFilterLabel(root);
        root.addEventListener("change", (event) => {
            if (!event.target?.classList?.contains("inquiries-multi-filter-option")) return;
            updateMultiFilterLabel(root);
        });
    }

    filtersPanel?.addEventListener("show.bs.offcanvas", () => {
        writeFiltersToDom(appliedFilters);
    });

    filtersPanel?.addEventListener("click", (event) => {
        const quickBtn = event.target?.closest?.(".inquiries-date-quick-btn");
        if (quickBtn) {
            setQuickDateRange(quickBtn.dataset.range || "");
            return;
        }

        const clearBtn = event.target?.closest?.(".inquiries-filter-clear-btn");
        if (!clearBtn) return;

        const multiId = clearBtn.dataset.clearMulti;
        if (multiId) {
            setSelectedMultiValues(document.getElementById(multiId), []);
            return;
        }

        const selectId = clearBtn.dataset.clearSelect;
        if (selectId) {
            const select = document.getElementById(selectId);
            if (select) select.value = "";
            return;
        }

        const inputId = clearBtn.dataset.clearInput;
        if (inputId) {
            const input = document.getElementById(inputId);
            if (input) input.value = "";
        }
    });

    applyFiltersBtn?.addEventListener("click", () => {
        commitFilters();
    });

    resetFiltersBtn?.addEventListener("click", () => {
        appliedFilters = emptyFilters();
        writeFiltersToDom(appliedFilters);
        writeStoredFilters(appliedFilters);
        if (appliedFilters.from !== pageFrom || appliedFilters.to !== pageTo) {
            const url = new URL(window.location.href);
            url.searchParams.set("from", appliedFilters.from);
            url.searchParams.set("to", appliedFilters.to);
            window.location.assign(url.toString());
            return;
        }
        applyFilters();
    });

    const stored = readStoredFilters();
    if (stored) {
        appliedFilters = normalizeStoredFilters({
            ...emptyFilters(),
            ...stored,
            from: pageFrom,
            to: pageTo,
        });
        writeFiltersToDom(appliedFilters);
        if (
            stored.from &&
            stored.to &&
            (normalizeDateInput(stored.from, pageFrom) !== pageFrom ||
                normalizeDateInput(stored.to, pageTo) !== pageTo)
        ) {
            const url = new URL(window.location.href);
            url.searchParams.set("from", normalizeDateInput(stored.from, pageFrom));
            url.searchParams.set("to", normalizeDateInput(stored.to, pageTo));
            window.location.replace(url.toString());
            return;
        }
    } else {
        writeFiltersToDom(appliedFilters);
    }

    requestAnimationFrame(() => {
        requestAnimationFrame(finishListLoading);
    });

    const addForm = document.getElementById("inquiry-add-form");
    const addFormAlert = document.getElementById("inquiry-add-form-alert");
    const addSubmitBtn = document.getElementById("inquiry-add-submit-btn");

    addForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideFormAlert(addFormAlert);

        const phone = String(document.getElementById("inquiry-add-phone")?.value || "").trim();
        if (!phone) {
            showFormAlert(addFormAlert, "Phone is required");
            return;
        }

        const assigneeValue = String(
            document.getElementById("inquiry-add-assignee")?.value || "",
        ).trim();
        const payload = {
            phone,
            full_name:
                String(document.getElementById("inquiry-add-full-name")?.value || "").trim() ||
                null,
            email: String(document.getElementById("inquiry-add-email")?.value || "").trim() || null,
            institute_name:
                String(document.getElementById("inquiry-add-institute")?.value || "").trim() ||
                null,
            city: String(document.getElementById("inquiry-add-city")?.value || "").trim() || null,
            quote: String(document.getElementById("inquiry-add-quote")?.value || "").trim() || null,
            assignee_user_id: assigneeValue ? Number(assigneeValue) : null,
        };

        if (addSubmitBtn) addSubmitBtn.disabled = true;
        try {
            const response = await fetch("/api/inquiries/manual", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showFormAlert(addFormAlert, data.error || "Failed to create inquiry");
                return;
            }
            window.location.reload();
        } catch (error) {
            showFormAlert(addFormAlert, "Failed to create inquiry");
            console.error(error);
        } finally {
            if (addSubmitBtn) addSubmitBtn.disabled = false;
        }
    });
})();
