import { AUTHORITIES } from "../constants.js";

export function appPage(session, extra = {}) {
    return {
        username: session?.username,
        authorities: session?.authorities ?? [],
        roles: session?.roles ?? [],
        super_admin: !!session?.super_admin,
        AUTHORITIES,
        ...extra,
    };
}

export function hasAuthority(authorities, requiredAuthority) {
    return Array.isArray(authorities) && authorities.includes(requiredAuthority);
}
