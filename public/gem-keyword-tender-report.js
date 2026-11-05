(() => {
    const dataElement = document.getElementById("gem-tender-report-data");
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
                            type === "doughnut" || type === "pie"
                                ? palette
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
        "chart-eligibility",
        "doughnut",
        charts.eligibilityOverall?.labels,
        charts.eligibilityOverall?.values,
        "Eligibility",
    );
    makeChart(
        "chart-stages",
        "doughnut",
        charts.stagesOverall?.labels,
        charts.stagesOverall?.values,
        "Stages",
    );
})();
