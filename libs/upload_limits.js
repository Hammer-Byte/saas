import { DEFAULT_MAX_REQUEST_BODY_SIZE } from "../constants.js";

export function getMaxRequestBodySize() {
    const fromEnv = Number(Bun.env.MAX_REQUEST_BODY_SIZE);
    if (Number.isFinite(fromEnv) && fromEnv > 0) {
        return fromEnv;
    }
    return DEFAULT_MAX_REQUEST_BODY_SIZE;
}
