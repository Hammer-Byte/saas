/**
 * Minimal RFC4180-ish CSV parser.
 * Returns { headers: string[], rows: string[][] } (data rows only).
 */
export function parseCsv(text) {
    const source = String(text || "").replace(/^\uFEFF/, "");
    const rows = [];
    let currentField = "";
    let currentRow = [];
    let inQuotes = false;

    for (let index = 0; index < source.length; index += 1) {
        const character = source[index];
        const nextCharacter = source[index + 1];

        if (inQuotes) {
            if (character === '"' && nextCharacter === '"') {
                currentField += '"';
                index += 1;
                continue;
            }
            if (character === '"') {
                inQuotes = false;
                continue;
            }
            currentField += character;
            continue;
        }

        if (character === '"') {
            inQuotes = true;
            continue;
        }

        if (character === ",") {
            currentRow.push(currentField);
            currentField = "";
            continue;
        }

        if (character === "\n") {
            currentRow.push(currentField);
            rows.push(currentRow);
            currentRow = [];
            currentField = "";
            continue;
        }

        if (character === "\r") {
            continue;
        }

        currentField += character;
    }

    if (currentField.length || currentRow.length) {
        currentRow.push(currentField);
        rows.push(currentRow);
    }

    if (!rows.length) {
        return { headers: [], rows: [] };
    }

    const headers = rows[0].map((header) => String(header || "").trim());
    const dataRows = rows
        .slice(1)
        .filter((row) => row.some((cell) => String(cell || "").trim() !== ""));

    return { headers, rows: dataRows };
}

export function csvRowsToObjects({ headers, rows }) {
    return rows.map((row) => {
        const record = {};
        headers.forEach((header, index) => {
            const key = String(header || "")
                .trim()
                .toLowerCase()
                .replace(/\s+/g, "_");
            if (!key) return;
            record[key] = row[index] ?? "";
        });
        return record;
    });
}
