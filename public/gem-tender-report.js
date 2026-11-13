(() => {
    const dataElement = document.getElementById("gem-tender-report-data");
    const fromInput = document.getElementById("report-from");
    const toInput = document.getElementById("report-to");
    const rangeForm = document.getElementById("gem-report-range-form");
    const personSelect = document.getElementById("gem-report-person-select");
    const seriesChecks = Array.from(
        document.querySelectorAll(".gem-report-series-check"),
    );

    if (!dataElement || typeof window.Chart !== "function") {
        return;
    }

    let charts = {};
    try {
        charts = JSON.parse(dataElement.textContent || "{}");
    } catch (error) {
        console.error(error);
        return;
    }

    const palette = [
        "#0d6efd",
        "#198754",
        "#ffc107",
        "#dc3545",
        "#6f42c1",
        "#20c997",
        "#fd7e14",
        "#0dcaf0",
        "#d63384",
        "#6c757d",
        "#795548",
        "#8bc34a",
    ];

    const SERIES_STORAGE_KEY = "gem-tender-report-series";
    const dailyEvents = charts.dailyEvents || {
        series: [],
        dates: [],
        overall: { values: {}, total: 0 },
        people: [],
    };

    let overallChart = null;
    let personChart = null;

    function formatDayLabel(dateKey) {
        return window.getReadableDate?.("DD/MM", dateKey) || dateKey;
    }

    function selectedSeriesKeys() {
        return seriesChecks
            .filter((input) => input.checked)
            .map((input) => input.value);
    }

    function readStoredSeries() {
        try {
            const raw = window.localStorage.getItem(SERIES_STORAGE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed.map(String) : null;
        } catch {
            return null;
        }
    }

    function writeStoredSeries(keys) {
        try {
            window.localStorage.setItem(SERIES_STORAGE_KEY, JSON.stringify(keys));
        } catch {
            // ignore
        }
    }

    function applyStoredSeriesSelection() {
        const stored = readStoredSeries();
        if (!stored || !stored.length) return;
        const storedSet = new Set(stored);
        for (const input of seriesChecks) {
            input.checked = storedSet.has(input.value);
        }
    }

    function buildStackedDatasets(valuesByKey, selectedKeys) {
        const seriesMeta = new Map(
            (dailyEvents.series || []).map((item) => [item.key, item]),
        );
        return selectedKeys
            .map((key) => {
                const meta = seriesMeta.get(key);
                const data = valuesByKey?.[key] || [];
                const hasData = data.some((value) => Number(value) > 0);
                if (!hasData && selectedKeys.length > 1) {
                    // Keep empty series so legend stays stable when toggling.
                }
                return {
                    key,
                    label: meta?.label || key,
                    data,
                    backgroundColor: meta?.color || palette[0],
                    borderWidth: 0,
                    stack: "daily",
                };
            })
            .filter((dataset) =>
                (dataset.data || []).some((value) => Number(value) > 0),
            );
    }

    function stackedOptions() {
        return {
            responsive: true,
            maintainAspectRatio: false,
            resizeDelay: 100,
            animation: false,
            plugins: {
                legend: {
                    display: true,
                    position: "bottom",
                },
                tooltip: {
                    mode: "index",
                    intersect: false,
                },
            },
            scales: {
                x: {
                    stacked: true,
                    ticks: {
                        autoSkip: true,
                        maxRotation: 45,
                        minRotation: 0,
                    },
                },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    ticks: { precision: 0 },
                },
            },
        };
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
        const empty = parent.querySelector(".gem-report-chart-empty");
        if (empty) empty.classList.add("d-none");
    }

    function renderOverallChart() {
        const canvas = document.getElementById("chart-daily-overall");
        if (!canvas) return;

        const selectedKeys = selectedSeriesKeys();
        const labels = (dailyEvents.dates || []).map(formatDayLabel);
        const datasets = buildStackedDatasets(
            dailyEvents.overall?.values || {},
            selectedKeys,
        );

        if (overallChart) {
            overallChart.destroy();
            overallChart = null;
        }

        if (!labels.length || !datasets.length) {
            showEmpty(canvas, "No matching activity in this range.");
            return;
        }

        hideEmpty(canvas);
        overallChart = new window.Chart(canvas, {
            type: "bar",
            data: { labels, datasets },
            options: stackedOptions(),
        });
    }

    function renderPersonChart() {
        const canvas = document.getElementById("chart-daily-person");
        if (!canvas) return;

        const people = dailyEvents.people || [];
        const selectedPersonKey =
            personSelect?.value || people[0]?.key || "";
        const person = people.find((row) => row.key === selectedPersonKey);

        if (personChart) {
            personChart.destroy();
            personChart = null;
        }

        if (!person) {
            showEmpty(canvas, "No person activity in this range.");
            return;
        }

        const selectedKeys = selectedSeriesKeys();
        const labels = (dailyEvents.dates || []).map(formatDayLabel);
        const datasets = buildStackedDatasets(person.values || {}, selectedKeys);

        if (!labels.length || !datasets.length) {
            showEmpty(canvas, "No matching activity for this person.");
            return;
        }

        hideEmpty(canvas);
        personChart = new window.Chart(canvas, {
            type: "bar",
            data: { labels, datasets },
            options: stackedOptions(),
        });
    }

    function refreshDailyCharts() {
        writeStoredSeries(selectedSeriesKeys());
        renderOverallChart();
        renderPersonChart();
    }

    function makeChart(canvasId, type, labels, values, label) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        const hasData = (values || []).some((value) => Number(value) > 0);
        if (!hasData) {
            showEmpty(canvas, "No data in this range.");
            return;
        }

        hideEmpty(canvas);
        new window.Chart(canvas, {
            type,
            data: {
                labels: labels || [],
                datasets: [
                    {
                        label,
                        data: values || [],
                        backgroundColor:
                            type === "doughnut" || type === "pie"
                                ? (labels || []).map(
                                      (_, index) => palette[index % palette.length],
                                  )
                                : palette[0],
                        borderWidth: 0,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                resizeDelay: 100,
                animation: false,
                plugins: {
                    legend: {
                        display: type === "doughnut" || type === "pie",
                        position: "bottom",
                    },
                },
                scales:
                    type === "doughnut" || type === "pie"
                        ? {}
                        : {
                              x: {
                                  ticks: {
                                      autoSkip: true,
                                      maxRotation: 45,
                                      minRotation: 0,
                                  },
                              },
                              y: {
                                  beginAtZero: true,
                                  ticks: { precision: 0 },
                              },
                          },
            },
        });
    }

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

    document.getElementById("gem-report-series-all")?.addEventListener("click", () => {
        for (const input of seriesChecks) input.checked = true;
        refreshDailyCharts();
    });
    document.getElementById("gem-report-series-none")?.addEventListener("click", () => {
        for (const input of seriesChecks) input.checked = false;
        refreshDailyCharts();
    });
    document.getElementById("gem-report-series-stages")?.addEventListener("click", () => {
        for (const input of seriesChecks) {
            input.checked = input.dataset.kind === "stage";
        }
        refreshDailyCharts();
    });
    document.getElementById("gem-report-series-locks")?.addEventListener("click", () => {
        for (const input of seriesChecks) {
            input.checked = input.dataset.kind === "lock";
        }
        refreshDailyCharts();
    });

    for (const input of seriesChecks) {
        input.addEventListener("change", refreshDailyCharts);
    }

    personSelect?.addEventListener("change", renderPersonChart);

    applyStoredSeriesSelection();
    refreshDailyCharts();

    makeChart(
        "chart-tenders-by-assignee",
        "bar",
        charts.tendersByAssignee?.labels,
        charts.tendersByAssignee?.values,
        "Assigned tenders",
    );
    makeChart(
        "chart-activity-by-user",
        "bar",
        charts.activityByUser?.labels,
        charts.activityByUser?.values,
        "Activities",
    );
    makeChart(
        "chart-lock-reasons",
        "doughnut",
        charts.lockReasons?.labels,
        charts.lockReasons?.values,
        "Lock reasons",
    );
    makeChart(
        "chart-stages",
        "doughnut",
        charts.stagesOverall?.labels,
        charts.stagesOverall?.values,
        "Stages",
    );
})();
