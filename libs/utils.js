export function generateOTP() {
    const value = crypto.getRandomValues(new Uint32Array(1))[0] % 10000;
    return String(value).padStart(4, "0");
}

export function generateAuthenticationToken() {
    return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
        byte.toString(16).padStart(2, "0"),
    ).join("");
}

export function formatCurrency(value) {
    return Number(value || 0).toFixed(2);
}
