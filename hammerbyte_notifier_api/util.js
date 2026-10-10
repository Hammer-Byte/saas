/** Shared pure helpers for this microservice. */
export function isPresent({ value }) {
	return !!value;
}

export function getFileExtension({ name }) {
	const parts = String(name || "").split(".");
	if (parts.length < 2) {
		return "bin";
	}
	return parts[parts.length - 1].toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
}

export function sleep({ seconds }) {
	const ms = Math.max(0, Number(seconds) || 0) * 1000;
	if (!ms) {
		return Promise.resolve();
	}
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}
