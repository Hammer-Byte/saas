export const ERRORS = {
    UNAUTHORIZED: "Unauthorized",
    FILE_REQUIRED: "File name is required",
    ACCUMULATOR_REQUIRED: "Accumulator is required",
    RECIPIENT_REQUIRED: "Recipient is required or invalid",
    SUBJECT_REQUIRED: "Subject is required",
    BODY_REQUIRED: "Body is required",
    HTML_ENABLED_REQUIRED: "HTML enabled is required",
    FULL_NAME_REQUIRED: "Full name is required",
    PHONE_REQUIRED: "Phone is required",
    EMAIL_INVALID: "Email is invalid",
    NO_SUCH_USER: "No Such User Found",
    INVALID_OTP: "Invalid OTP",
    INVALID_PASSWORD: "Invalid email or password",
    LOGIN_METHOD_NOT_ALLOWED: "This login method is not allowed for this user",
    PASSWORD_REQUIRED: "Password is required",
};

export const USER_LOGIN_METHODS = {
    OTP: "otp",
    PASSWORD: "password",
    BOTH: "both",
};

export const USER_LOGIN_METHOD_LABELS = {
    [USER_LOGIN_METHODS.OTP]: "Email OTP",
    [USER_LOGIN_METHODS.PASSWORD]: "Email password",
    [USER_LOGIN_METHODS.BOTH]: "OTP or password",
};

export const SWAGGER = {
    APPLICATION: "Saas Mailer",
};

/** Application service title for external content publish API (also seeded in SERVICES). */
export const CONTENT_PUBLISHER_SERVICE = "content-publisher";

export const AUTHORITIES = {
    USE_PAGE_PROJECTS: "USE_PAGE_PROJECTS",
    USE_PAGE_EXPENSES: "USE_PAGE_EXPENSES",
    USE_PAGE_REVENUE: "USE_PAGE_REVENUE",
    USE_PAGE_CUSTOMERS: "USE_PAGE_CUSTOMERS",
    USE_PAGE_INVOICES: "USE_PAGE_INVOICES",
    USE_PAGE_INQUIRIES: "USE_PAGE_INQUIRIES",
    USE_PAGE_CONTRACTS: "USE_PAGE_CONTRACTS",
    USE_PAGE_INTERNAL_DOCUMENTS: "USE_PAGE_INTERNAL_DOCUMENTS",
    USE_PAGE_SERVERS: "USE_PAGE_SERVERS",
    USE_PAGE_GEM_TENDERS: "USE_PAGE_GEM_TENDERS",
    USE_PAGE_GEM_TENDER_KEYWORDS: "USE_PAGE_GEM_TENDER_KEYWORDS",
    ASSIGN_GEM_TENDER_ASSIGNEE: "ASSIGN_GEM_TENDER_ASSIGNEE",
    USE_PAGE_AUTOMATION: "USE_PAGE_AUTOMATION",
    USE_PAGE_APPLICATIONS: "USE_PAGE_APPLICATIONS",
    USE_PAGE_SERVICES: "USE_PAGE_SERVICES",
    USE_PAGE_USERS: "USE_PAGE_USERS",
    USE_PAGE_ROLES: "USE_PAGE_ROLES",
    USE_PAGE_AUTHORITIES: "USE_PAGE_AUTHORITIES",
    MANAGE_ROLES: "MANAGE_ROLES",
    MANAGE_AUTHORITIES: "MANAGE_AUTHORITIES",
    MANAGE_ROLE_AUTHORITIES: "MANAGE_ROLE_AUTHORITIES",
    MANAGE_USER_ROLES: "MANAGE_USER_ROLES",
};

export const GEM_KEYWORD_TENDER_STAGES = {
    NEW: "new",
    WORK_IN_PROGRESS: "work_in_progress",
    REQUESTED_FOR_QUOTE: "requested_for_quote",
    FILED: "filed",
    WAITING_FOR_TECHNICAL: "waiting_for_technical",
    WAITING_FOR_FINANCIAL: "waiting_for_financial",
};

export const GEM_KEYWORD_TENDER_STAGE_LABELS = {
    [GEM_KEYWORD_TENDER_STAGES.NEW]: "New",
    [GEM_KEYWORD_TENDER_STAGES.WORK_IN_PROGRESS]: "Work in progress",
    [GEM_KEYWORD_TENDER_STAGES.REQUESTED_FOR_QUOTE]: "Requested for quote",
    [GEM_KEYWORD_TENDER_STAGES.FILED]: "Filed",
    [GEM_KEYWORD_TENDER_STAGES.WAITING_FOR_TECHNICAL]: "Waiting for technical",
    [GEM_KEYWORD_TENDER_STAGES.WAITING_FOR_FINANCIAL]: "Waiting for financial",
};

export const GEM_KEYWORD_TENDER_ELIGIBILITY = {
    NEED_TO_CHECK: "need_to_check",
    ELIGIBLE: "eligible",
    NOT_ELIGIBLE: "not_eligible",
};

export const GEM_KEYWORD_TENDER_ELIGIBILITY_LABELS = {
    [GEM_KEYWORD_TENDER_ELIGIBILITY.NEED_TO_CHECK]: "Need to check",
    [GEM_KEYWORD_TENDER_ELIGIBILITY.ELIGIBLE]: "Eligible",
    [GEM_KEYWORD_TENDER_ELIGIBILITY.NOT_ELIGIBLE]: "Not eligible",
};

export const AUTHORITY_DESCRIPTIONS = {
    USE_PAGE_PROJECTS: "View Projects page",
    USE_PAGE_EXPENSES: "View Expenses page",
    USE_PAGE_REVENUE: "View Revenue page",
    USE_PAGE_CUSTOMERS: "View Customers page",
    USE_PAGE_INVOICES: "View Invoices page",
    USE_PAGE_INQUIRIES: "View Inquiries page",
    USE_PAGE_CONTRACTS: "View Contracts page",
    USE_PAGE_INTERNAL_DOCUMENTS: "View Internal Documents page",
    USE_PAGE_SERVERS: "View Servers monitor page",
    USE_PAGE_GEM_TENDERS: "View GEM Tenders page",
    USE_PAGE_GEM_TENDER_KEYWORDS: "View GEM Tenders keyword + scan and history pages",
    ASSIGN_GEM_TENDER_ASSIGNEE: "Assign any user as GEM tender assignee",
    USE_PAGE_AUTOMATION: "View Automation page",
    USE_PAGE_APPLICATIONS: "View Applications page",
    USE_PAGE_SERVICES: "View Services page",
    USE_PAGE_USERS: "View Users page",
    USE_PAGE_ROLES: "View Roles page",
    USE_PAGE_AUTHORITIES: "View Authorities page",
    MANAGE_ROLES: "Create, update, and delete roles",
    MANAGE_AUTHORITIES: "Create and delete authorities",
    MANAGE_ROLE_AUTHORITIES: "Assign authorities to roles",
    MANAGE_USER_ROLES: "Assign roles to users",
};
