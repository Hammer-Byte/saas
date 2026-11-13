(() => {
    const dataElement = document.getElementById("gem-tender-report-data");
    const fromInput = document.getElementById("report-from");
    const toInput = document.getElementById("report-to");
    const rangeForm = document.getElementById("gem-report-range-form");
    const personSelect = document.getElementById("gem-report-person-select");
    const logBody = document.getElementById("gem-report-log-body");
    const employeeRows = Array.from(document.querySelectorAll(".gem-report-employee-row"));

    function startOfIndianQuarterKey(dateKey) {
        const year = Number(dateKey.slice(0, 4));
        const month = Number(dateKey.slice(5, 7));
        if (month <= 3) return `${year}-01-01`;
        if (month <= 6) return `${year}-04-01`;
        if (month <= 9) return `${year}-07-01`;
        return `${year}-10-01`;
    }

    function endOfIndianQuarterKey(dateKey) {
        const year = Number(dateKey.slice(0, 4));
        const month = Number(dateKey.slice(5, 7));
        if (month <= 3) return `${year}-03-31`;
        if (month <= 6) return `${year}-06-30`;
        if (month <= 9) return `${year}-09-30`;
        return `${year}-12-31`;
    }

    function setQuickDateRange(range) {
        const today = window.getIstDate?.() || "";
        if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return;

        const addDays = window.addIstCalendarDays;
        const year = Number(today.slice(0, 4));
        const month = Number(today.slice(5, 7));
        let fromKey = today;
        let toKey = today;

        if (range === "today") {
            fromKey = today;
            toKey = today;
        } else if (range === "this-week") {
            fromKey = window.getMondayDate?.(today) || today;
            toKey = today;
        } else if (range === "last-7-days") {
            fromKey = addDays?.(today, -6) || today;
            toKey = today;
        } else if (range === "last-15-days") {
            fromKey = addDays?.(today, -14) || today;
            toKey = today;
        } else if (range === "this-month") {
            fromKey = `${year}-${`${month}`.padStart(2, "0")}-01`;
            toKey = today;
        } else if (range === "last-month") {
            if (month === 1) {
                fromKey = `${year - 1}-12-01`;
                toKey = `${year - 1}-12-31`;
            } else {
                fromKey = `${year}-${`${month - 1}`.padStart(2, "0")}-01`;
                toKey =
                    addDays?.(`${year}-${`${month}`.padStart(2, "0")}-01`, -1) ||
                    today;
            }
        } else if (range === "this-quarter") {
            fromKey = startOfIndianQuarterKey(today);
            toKey = today;
        } else if (range === "last-quarter") {
            const previousDay = addDays?.(startOfIndianQuarterKey(today), -1);
            if (!previousDay) return;
            fromKey = startOfIndianQuarterKey(previousDay);
            toKey = endOfIndianQuarterKey(previousDay);
        } else {
            return;
        }

        if (fromInput) fromInput.value = fromKey;
        if (toInput) toInput.value = toKey;
        rangeForm?.requestSubmit?.() || rangeForm?.submit?.();
    }

    document.getElementById("gem-report-quick-ranges")?.addEventListener("click", (event) => {
        const button = event.target?.closest?.(".gem-report-quick-btn");
        if (!button) return;
        setQuickDateRange(button.dataset.range || "");
    });

    let data = {};
    try {
        data = JSON.parse(dataElement?.textContent || "{}");
    } catch (error) {
        console.error(error);
    }
    const dates = data.dates || [];
    const actionTypes = data.actionTypes || [];
    const people = data.people || [];
    const log = data.log || [];
    const hasChart = typeof window.Chart === "function";

    let personChart = null;

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function formatDayLabel(dateKey) {
        return window.getReadableDate?.("DD/MM", dateKey) || dateKey;
    }

    function sumDaily(daily) {
        return dates.map((_, index) =>
            actionTypes.reduce((sum, type) => sum + Number(daily?.[type.key]?.[index] || 0), 0),
        );
    }

    function showEmpty(canvas, message) {
        const parent = canvas?.parentElement;
        if (!parent) return;
        canvas.classList.add("d-none");
        let empty = parent.querySelector(".gem-report-chart-empty");
        if (!empty) {
            empty = document.createElement("p");
            empty.className = "text-secondary small mb-0 gem-report-chart-empty";
            parent.appendChild(empty);
        }
        empty.textContent = message;
        empty.classList.remove("d-none");
    }

    function hideEmpty(canvas) {
        const parent = canvas?.parentElement;
        if (!parent) return;
        canvas.classList.remove("d-none");
        parent.querySelector(".gem-report-chart-empty")?.classList.add("d-none");
    }

    function stackedBarOptions() {
        return {
            responsive: true,
            maintainAspectRatio: false,
            resizeDelay: 100,
            animation: false,
            plugins: {
                legend: { display: true, position: "bottom" },
                tooltip: { mode: "index", intersect: false },
            },
            scales: {
                x: { stacked: true, ticks: { autoSkip: true, maxRotation: 45, minRotation: 0 } },
                y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } },
            },
        };
    }

    function renderDailyByEmployee() {
        const canvas = document.getElementById("chart-daily-by-employee");
        if (!canvas || !hasChart) return;
        const datasets = people
            .map((person) => ({
                label: person.label,
                data: sumDaily(person.daily),
                backgroundColor: person.color,
                borderWidth: 0,
                stack: "daily",
            }))
            .filter((dataset) => dataset.data.some((value) => value > 0));
        if (!dates.length || !datasets.length) {
            showEmpty(canvas, "No actions in this range.");
            return;
        }
        hideEmpty(canvas);
        new window.Chart(canvas, {
            type: "bar",
            data: { labels: dates.map(formatDayLabel), datasets },
            options: stackedBarOptions(),
        });
    }

    function renderPersonChart(userId) {
        const canvas = document.getElementById("chart-daily-person");
        if (!canvas || !hasChart) return;
        if (personChart) {
            personChart.destroy();
            personChart = null;
        }
        const person = people.find((row) => String(row.user_id) === String(userId));
        const datasets = person
            ? actionTypes
                  .map((type) => ({
                      label: type.label,
                      data: person.daily?.[type.key] || [],
                      backgroundColor: type.color,
                      borderWidth: 0,
                      stack: "daily",
                  }))
                  .filter((dataset) => dataset.data.some((value) => Number(value) > 0))
            : [];
        if (!dates.length || !datasets.length) {
            showEmpty(canvas, "No actions by this person in this range.");
            return;
        }
        hideEmpty(canvas);
        personChart = new window.Chart(canvas, {
            type: "bar",
            data: { labels: dates.map(formatDayLabel), datasets },
            options: stackedBarOptions(),
        });
    }

    function renderLog(userId) {
        if (!logBody) return;
        const rows = log.filter((row) => String(row.user_id) === String(userId));
        if (!rows.length) {
            logBody.innerHTML =
                '<tr><td colspan="4" class="text-secondary small">No activity logged by this person in this range.</td></tr>';
            return;
        }
        logBody.innerHTML = rows
            .map(
                (row) => `
                    <tr>
                        <td class="small text-nowrap">${escapeHtml(row.at)}</td>
                        <td class="small text-nowrap">
                            <a href="/app/gem-tenders/${encodeURIComponent(row.gem_tender_id)}" target="_blank" rel="noopener noreferrer">
                                ${escapeHtml(row.tender_id || `#${row.gem_tender_id}`)}
                            </a>
                        </td>
                        <td class="small text-nowrap">${row.action ? escapeHtml(row.action) : '<span class="text-body-tertiary">-</span>'}</td>
                        <td class="small">${escapeHtml(row.activity)}</td>
                    </tr>`,
            )
            .join("");
    }

    function selectPerson(userId) {
        for (const row of employeeRows) {
            row.classList.toggle("table-active", row.dataset.userId === String(userId));
        }
        renderPersonChart(userId);
        renderLog(userId);
    }

    personSelect?.addEventListener("change", () => selectPerson(personSelect.value));

    for (const row of employeeRows) {
        row.addEventListener("click", () => {
            if (personSelect) personSelect.value = row.dataset.userId;
            selectPerson(row.dataset.userId);
            document.getElementById("gem-report-person")?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
    }

    renderDailyByEmployee();
    if (personSelect?.value) {
        selectPerson(personSelect.value);
    }
})();
