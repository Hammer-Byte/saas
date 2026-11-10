(() => {
    const dataElement = document.getElementById("inquiries-report-data");
    if (!dataElement || !window.Chart) return;

    let chartData = { states: [], sources: [] };
    try {
        chartData = JSON.parse(dataElement.textContent || "{}");
    } catch (error) {
        console.error(error);
        return;
    }

    function makeBarChart(canvasId, rows, label) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const labels = (rows || []).map((row) => row.label);
        const values = (rows || []).map((row) => Number(row.count || 0));
        new window.Chart(canvas, {
            type: "bar",
            data: {
                labels,
                datasets: [
                    {
                        label,
                        data: values,
                        backgroundColor: "#0d6efd",
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

    makeBarChart("inquiries-report-states-chart", chartData.states, "States");
    makeBarChart("inquiries-report-sources-chart", chartData.sources, "Sources");
})();
