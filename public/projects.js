(() => {
    const table = document.getElementById("projects-table");
    const tableBody = table?.tBodies?.[0];
  if (!tableBody) {
        return;
    }

    bindClientSearch({
        input: "#projects-search",
        rows: "#projects-table tbody tr",
        emptyElement: "#projects-empty",
        tableWrap: "#projects-table-wrap",
    });

    bindSortableHeaders({
        table,
        getValue(row, sortKey) {
            if (sortKey === "id") {
                return Number(row.dataset.id || 0);
            }
            return row.dataset[sortKey] ?? row.textContent;
        },
    });
})();