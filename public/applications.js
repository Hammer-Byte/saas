(() => {
    const table = document.getElementById("applications-table");
    if (!table?.tBodies?.[0]) {
        return;
    }

    bindClientSearch({
        input: "#applications-search",
        rows: "#applications-table tbody tr",
        emptyElement: "#applications-empty",
        tableWrap: "#applications-table-wrap",
    });

    bindSortableHeaders({
        table,
        getValue(row, sortKey) {
            if (sortKey === "id") {
                return Number(row.dataset.id || 0);
            }
            if (sortKey === "active") {
                return Number(row.dataset.active || 0);
            }
            return row.dataset[sortKey] ?? row.textContent;
        },
    });
})();