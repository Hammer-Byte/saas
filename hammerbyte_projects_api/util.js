/** Shared pure helpers for this microservice. */
export function isPresent({ value }) {
	return !!value;
}

export function sanitizeStoredFileName({ name }) {
	const trimmed = String(name || "file").trim() || "file";
	const sanitized = trimmed.replace(/[^a-zA-Z0-9._-]/g, "_");
	return sanitized.slice(0, 200) || "file";
}

export function computeInvoiceTotal({ items }) {
	return (items || []).reduce(
		(sum, item) => sum + Number(item.quantity) * Number(item.unit_price),
		0,
	);
}
