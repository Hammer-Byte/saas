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
    USE_PAGE_TASKS: "USE_PAGE_TASKS",
    USE_PAGE_GEM_TENDERS: "USE_PAGE_GEM_TENDERS",
    USE_PAGE_GEM_TENDER_KEYWORDS: "USE_PAGE_GEM_TENDER_KEYWORDS",
    ASSIGN_GEM_TENDER_ASSIGNEE: "ASSIGN_GEM_TENDER_ASSIGNEE",
    MARK_GEM_TENDER_MASS_STAGE_CHANGE: "MARK_GEM_TENDER_MASS_STAGE_CHANGE",
    ASSIGN_INQUIRY_ASSIGNEE: "ASSIGN_INQUIRY_ASSIGNEE",
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
    MANAGE_INTERNAL_DOCUMENTS: "MANAGE_INTERNAL_DOCUMENTS",
};

export const TASK_STATES = {
    BACKLOG: "backlog",
    ANALYZING: "analyzing",
    IN_PROGRESS: "in_progress",
    UNDER_REVIEW: "under_review",
    DONE: "done",
};

export const TASK_STATE_LABELS = {
    [TASK_STATES.BACKLOG]: "Backlog",
    [TASK_STATES.ANALYZING]: "Analyzing",
    [TASK_STATES.IN_PROGRESS]: "In progress",
    [TASK_STATES.UNDER_REVIEW]: "Under review",
    [TASK_STATES.DONE]: "Done",
};

export const TASK_PRIORITIES = {
    LOW: "low",
    MEDIUM: "medium",
    HIGH: "high",
};

export const TASK_PRIORITY_LABELS = {
    [TASK_PRIORITIES.LOW]: "Low",
    [TASK_PRIORITIES.MEDIUM]: "Medium",
    [TASK_PRIORITIES.HIGH]: "High",
};

export const GEM_KEYWORD_TENDER_STAGES = {
    NEW: "new",
    OUT_OF_SCOPE: "out_of_scope",
    UNATTENDED: "unattended",
    MISSED: "missed",
    ASSIGNED: "assigned",
    WAITING_FOR_DOCS: "waiting_for_docs",
    PREPARING_DOCS: "preparing_docs",
    ELIGIBLE: "eligible",
    NOT_ELIGIBLE: "not_eligible",
    FILED: "filed",
};

export const GEM_KEYWORD_TENDER_STAGE_LABELS = {
    [GEM_KEYWORD_TENDER_STAGES.NEW]: "New",
    [GEM_KEYWORD_TENDER_STAGES.OUT_OF_SCOPE]: "Out of scope",
    [GEM_KEYWORD_TENDER_STAGES.UNATTENDED]: "Unattended",
    [GEM_KEYWORD_TENDER_STAGES.MISSED]: "Missed",
    [GEM_KEYWORD_TENDER_STAGES.ASSIGNED]: "Assigned",
    [GEM_KEYWORD_TENDER_STAGES.WAITING_FOR_DOCS]: "Waiting For Docs",
    [GEM_KEYWORD_TENDER_STAGES.PREPARING_DOCS]: "Preparing Docs",
    [GEM_KEYWORD_TENDER_STAGES.ELIGIBLE]: "Eligible",
    [GEM_KEYWORD_TENDER_STAGES.NOT_ELIGIBLE]: "Not eligible",
    [GEM_KEYWORD_TENDER_STAGES.FILED]: "Filed",
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

export const INQUIRY_STATES = {
    NEW: "new",
    ASSIGNED: "assigned",
    IN_PROGRESS: "in_progress",
    POTENTIAL: "potential",
    IGNORED: "ignored",
    CLOSED: "closed",
    CANCELED: "canceled",
};

export const INQUIRY_STATE_LABELS = {
    [INQUIRY_STATES.NEW]: "New",
    [INQUIRY_STATES.ASSIGNED]: "Assigned",
    [INQUIRY_STATES.IN_PROGRESS]: "In progress",
    [INQUIRY_STATES.POTENTIAL]: "Potential",
    [INQUIRY_STATES.IGNORED]: "Ignored",
    [INQUIRY_STATES.CLOSED]: "Closed",
    [INQUIRY_STATES.CANCELED]: "Canceled",
};

export const INQUIRY_SOURCES = {
    WEBSITE: "website",
    MANUAL: "manual",
    YOUR_INSTITUTE: "your-institute",
};

export const INQUIRY_SOURCE_LABELS = {
    [INQUIRY_SOURCES.WEBSITE]: "Website",
    [INQUIRY_SOURCES.MANUAL]: "Manual",
    [INQUIRY_SOURCES.YOUR_INSTITUTE]: "Your Institute",
};

/** Day offsets after potential_entered_on for follow-up slots 1–3. */
export const INQUIRY_FOLLOWUP_DAY_OFFSETS = {
    1: 3,
    2: 7,
    3: 15,
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
    USE_PAGE_TASKS: "View Tasks page",
    USE_PAGE_GEM_TENDERS: "View GEM Tenders page",
    USE_PAGE_GEM_TENDER_KEYWORDS: "View GEM Tenders keyword + scan and history pages",
    ASSIGN_GEM_TENDER_ASSIGNEE: "Assign any user as GEM tender assignee",
    MARK_GEM_TENDER_MASS_STAGE_CHANGE: "Bulk change GEM tender stage (comment required)",
    ASSIGN_INQUIRY_ASSIGNEE: "Assign any user as inquiry assignee",
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
    MANAGE_INTERNAL_DOCUMENTS: "Add, edit, and delete internal documents",
};
