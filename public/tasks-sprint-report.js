(() => {
    const charts = window.__SPRINT_BURN_CHARTS__ || {};

    function renderBarChart(canvasId, chartData, label) {
        const canvas = document.getElementById(canvasId);
        if (!canvas || !window.Chart) return;
        const labels = chartData?.labels || [];
        const values = chartData?.values || [];
        if (!labels.length) {
            const context = canvas.getContext("2d");
            context.clearRect(0, 0, canvas.width, canvas.height);
            context.font = "14px sans-serif";
            context.fillStyle = "#6c757d";
            context.fillText("No data", 12, 24);
            return;
        }
        new window.Chart(canvas, {
            type: "bar",
            data: {
                labels,
                datasets: [
                    {
                        label,
                        data: values,
                        backgroundColor: "rgba(13, 110, 253, 0.55)",
                        borderColor: "rgba(13, 110, 253, 1)",
                        borderWidth: 1,
                    },
                ],
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: false },
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { precision: 0 },
                    },
                },
            },
        });
    }

    renderBarChart(
        "sprint-actual-hours-chart",
        charts.actualHoursByEmployee,
        "Actual hours",
    );
    renderBarChart(
        "sprint-expected-hours-chart",
        charts.expectedHoursByEmployee,
        "Expected hours",
    );
})();
