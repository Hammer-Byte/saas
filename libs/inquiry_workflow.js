import { AUTHORITIES, INQUIRY_STATES } from "../constants.js";

export function isInquiryAdminUser(currentUser) {
    if (!currentUser) {
        return false;
    }
    if (currentUser.super_admin) {
        return true;
    }
    const roles = Array.isArray(currentUser.roles) ? currentUser.roles : [];
    return roles.includes("ADMIN");
}

export function canUserManageInquiry({ inquiry, currentUser }) {
    if (!inquiry || !currentUser?.id) {
        return false;
    }
    if (isInquiryAdminUser(currentUser)) {
        return true;
    }
    return (
        Number(inquiry.assignee_user_id) >= 1 &&
        Number(inquiry.assignee_user_id) === Number(currentUser.id)
    );
}

export function canUserAssignInquiryOthers(currentUser) {
    if (!currentUser) {
        return false;
    }
    if (isInquiryAdminUser(currentUser)) {
        return true;
    }
    const authorities = Array.isArray(currentUser.authorities)
        ? currentUser.authorities
        : [];
    return authorities.includes(AUTHORITIES.ASSIGN_INQUIRY_ASSIGNEE);
}

export function normalizeInquiryState(value) {
    if (Object.values(INQUIRY_STATES).includes(value)) {
        return value;
    }
    return INQUIRY_STATES.NEW;
}

export function displayInquirySource(source) {
    if (!source) {
        return "website";
    }
    return source;
}
