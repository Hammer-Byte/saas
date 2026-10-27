import { AUTHORITIES } from "../constants.js";
import { resolveInvoiceNumber } from "./invoicer.js";

export function appPage(session, extra = {}) {
    return {
        username: session?.username,
        authorities: session?.authorities ?? [],
        roles: session?.roles ?? [],
        super_admin: !!session?.super_admin,
        AUTHORITIES,
        resolveInvoiceNumber,
        ...extra,
    };
}

export function hasAuthority(authorities, requiredAuthority) {
    return Array.isArray(authorities) && authorities.includes(requiredAuthority);
}
