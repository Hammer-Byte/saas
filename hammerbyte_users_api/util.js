/** Shared pure helpers for this microservice. */
export function isPresent({ value }) {
	return !!value;
}

export function generateOTP() {
	return Math.floor(1000 + Math.random() * 9000).toString();
}

export function generateToken() {
	return crypto.randomUUID();
}
