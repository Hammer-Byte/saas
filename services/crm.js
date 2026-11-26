import { AUTHORITIES } from "../constants.js";
import { hasAuthority } from "../libs/app_page.js";
import { getCurrentUser } from "./authentication.js";

export function canUseCrm(currentUser) {
    if (!currentUser?.id) {
        return false;
    }
    if (currentUser.super_admin) {
        return true;
    }
    return hasAuthority(currentUser.authorities, AUTHORITIES.USE_PAGE_CRM);
}

export async function requireCrmUser({ cookie, set }) {
    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return { error: "Unauthorized", currentUser: null };
    }
    if (!canUseCrm(currentUser)) {
        set.status = 403;
        return { error: "You do not have access to CRM", currentUser };
    }
    return { currentUser };
}
