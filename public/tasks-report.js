(() => {
    const FILTERS_STORAGE_KEY = "tasks-report-filters";

    const rangeForm = document.getElementById("tasks-report-range-form");
    const fromInput = document.getElementById("tasks-report-from");
    const toInput = document.getElementById("tasks-report-to");
    const clearFiltersButton = document.getElementById("tasks-report-clear-filters-btn");

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

    const storedFilters = readStoredFilters();
    if (storedFilters?.from && storedFilters?.to) {
        const url = new URL(window.location.href);
        const urlFrom = url.searchParams.get("from") || "";
        const urlTo = url.searchParams.get("to") || "";
        if (urlFrom !== storedFilters.from || urlTo !== storedFilters.to) {
            url.searchParams.set("from", storedFilters.from);
            url.searchParams.set("to", storedFilters.to);
            window.location.replace(url.toString());
            return;
        }
    }

    if (storedFilters?.from && fromInput) {
        fromInput.dataset.dateValue = storedFilters.from;
        fromInput.value = storedFilters.from;
    }
    if (storedFilters?.to && toInput) {
        toInput.dataset.dateValue = storedFilters.to;
        toInput.value = storedFilters.to;
    }

    rangeForm?.addEventListener("submit", (event) => {
        const from = window.getWritableDate("YYYY-MM-DD", fromInput?.value || "");
        const to = window.getWritableDate("YYYY-MM-DD", toInput?.value || "");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(from || "") || !/^\d{4}-\d{2}-\d{2}$/.test(to || "")) {
            event.preventDefault();
            window.alert("Enter valid dates as dd/mm/yyyy.");
            return;
        }
        if (fromInput) fromInput.value = from;
        if (toInput) toInput.value = to;
        writeStoredFilters({ from, to });
    });

    clearFiltersButton?.addEventListener("click", () => {
        try {
            window.localStorage.removeItem(FILTERS_STORAGE_KEY);
        } catch (error) {
            console.error(error);
        }
        window.location.href = "/app/tasks/report";
    });

    const dataElement = document.getElementById("tasks-report-data");
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

    const palette = ["#0d6efd", "#198754", "#ffc107", "#dc3545", "#6f42c1", "#20c997", "#fd7e14"];

    function makeChart(canvasId, type, labels, values, label) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        const hasData = (values || []).some((value) => Number(value) > 0);
        if (!hasData) {
            const parent = canvas.parentElement;
            if (parent) {
                canvas.remove();
                const empty = document.createElement("p");
                empty.className = "text-secondary small mb-0";
                empty.textContent = "No data in this range.";
                parent.appendChild(empty);
            }
            return;
        }

        new window.Chart(canvas, {
            type,
            data: {
                labels: labels || [],
                datasets: [
                    {
                        label,
                        data: values || [],
                        backgroundColor:
                            type === "doughnut" || type === "pie" ? palette : palette[0],
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

    makeChart(
        "chart-tasks-by-employee",
        "bar",
        charts.tasksByEmployee?.labels,
        charts.tasksByEmployee?.values,
        "Tasks",
    );
    makeChart(
        "chart-tasks-by-project",
        "bar",
        charts.tasksByProject?.labels,
        charts.tasksByProject?.values,
        "Tasks",
    );
    makeChart(
        "chart-tasks-by-state",
        "doughnut",
        charts.tasksByState?.labels,
        charts.tasksByState?.values,
        "By state",
    );
    makeChart(
        "chart-overdue-by-employee",
        "bar",
        charts.overdueByEmployee?.labels,
        charts.overdueByEmployee?.values,
        "Overdue",
    );
})();
