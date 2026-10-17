/** Shared pure helpers for this microservice. */
export function sleep({ seconds }) {
	const ms = Math.max(0, Number(seconds) || 0) * 1000;
	if (!ms) {
		return Promise.resolve();
	}
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}
