import { SQL } from "bun";
import { logger, CONSTANTS } from "@hammerbyte/utils";
import { fromDbDateTime } from "./date.js";
import {
    AUTHORITIES,
    AUTHORITY_DESCRIPTIONS,
    CONTENT_PUBLISHER_SERVICE,
} from "../constants.js";

export const dbConnection = new SQL({
    adapter: Bun.env.MYSQL_DIALECT,
    hostname: Bun.env.MYSQL_HOST,
    port: Bun.env.MYSQL_PORT,
    database: Bun.env.MYSQL_DB,
    username: Bun.env.MYSQL_USERNAME,
    password: Bun.env.MYSQL_PASSWORD,
    tls: false,
    allowPublicKeyRetrieval: true,
    max: 1,
    onconnect: (client) => {
        logger.success("Connected to MySQL DataBase");
    },
    onclose: (client, error) => {
        if (error) {
            logger.error(`MySQL connection error ${error}`);
        } else {
            logger.info("MySQL connection closed");
        }
    },
});

function normalizeSqlRow(row) {
    if (!row || typeof row !== "object") {
        return row;
    }

    const normalized = {};
    for (const [key, value] of Object.entries(row)) {
        normalized[key] = value instanceof Date ? fromDbDateTime(value) : value;
    }
    return normalized;
}

function normalizeSqlResult(result) {
    if (result == null) {
        return result;
    }

    if (typeof result.length === "number") {
        for (let index = 0; index < result.length; index++) {
            const row = result[index];
            if (row && typeof row === "object") {
                result[index] = normalizeSqlRow(row);
            }
        }
    }

    return result;
}

export async function executeSQLQuery(queryFunction) {
    const result = await queryFunction(dbConnection);
    return normalizeSqlResult(result);
}

export async function generateDBTables() {
    const requiredTables = [
        `CREATE TABLE IF NOT EXISTS CUSTOMERS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            full_name VARCHAR(128) NOT NULL,
            company VARCHAR(128) NOT NULL,
            pan_gst VARCHAR(32) NULL,
            hsn VARCHAR(16) NULL,
            address VARCHAR(512) NOT NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS CUSTOMER_EMAILS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            customer_id INT NOT NULL,
            email VARCHAR(255) NOT NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY unique_customer_email (customer_id, email),
            CONSTRAINT fk_customer_emails_customer
                FOREIGN KEY (customer_id)
                REFERENCES CUSTOMERS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS CUSTOMER_PHONES (
            id INT AUTO_INCREMENT PRIMARY KEY,
            customer_id INT NOT NULL,
            phone VARCHAR(13) NOT NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY unique_customer_phone (customer_id, phone),
            CONSTRAINT fk_customer_phones_customer
                FOREIGN KEY (customer_id)
                REFERENCES CUSTOMERS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS CUSTOMER_PROJECTS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            customer_id INT NOT NULL,
            title VARCHAR(128) NOT NULL,
            description VARCHAR(512) NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            CONSTRAINT fk_customer_projects_customer
                FOREIGN KEY (customer_id)
                REFERENCES CUSTOMERS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS PROJECT_APPLICATIONS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            title VARCHAR(56) NOT NULL,
            token CHAR(16) NOT NULL DEFAULT (HEX(RANDOM_BYTES(8))),
            active BOOLEAN NOT NULL DEFAULT TRUE,
            project_id INT NOT NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY unique_project_application_title (project_id, title),
            CONSTRAINT fk_project_applications_customer_project
                FOREIGN KEY (project_id)
                REFERENCES CUSTOMER_PROJECTS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS USERS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            full_name VARCHAR(128) NOT NULL,
            email VARCHAR(48) NOT NULL,
            personal_email VARCHAR(128) NULL,
            login_method VARCHAR(16) NOT NULL DEFAULT 'otp',
            password_hash VARCHAR(255) NULL,
            super_admin BOOLEAN NOT NULL DEFAULT FALSE,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY unique_user_email (email)
        )`,
        `CREATE TABLE IF NOT EXISTS USER_AUTHENTICATION_TOKENS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            token CHAR(32) NOT NULL,
            otp CHAR(4) NOT NULL,
            active BOOLEAN NOT NULL DEFAULT FALSE,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY unique_user_authentication_token (token),
            CONSTRAINT fk_user_authentication_tokens_user
                FOREIGN KEY (user_id)
                REFERENCES USERS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS USER_APPLICATIONS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            application_id INT NOT NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY unique_user_application (user_id,application_id)
        )`,
        `CREATE TABLE IF NOT EXISTS ROLES (
            id INT AUTO_INCREMENT PRIMARY KEY,
            title VARCHAR(36) NOT NULL,
            active BOOLEAN NOT NULL DEFAULT TRUE,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_role_title (title)
        )`,
        `CREATE TABLE IF NOT EXISTS AUTHORITIES (
            id INT AUTO_INCREMENT PRIMARY KEY,
            title VARCHAR(72) NOT NULL,
            description VARCHAR(128) NOT NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_authority_title (title)
        )`,
        `CREATE TABLE IF NOT EXISTS ROLE_AUTHORITIES (
            id INT AUTO_INCREMENT PRIMARY KEY,
            role_id INT NOT NULL,
            authority_id INT NOT NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_role_authority (role_id, authority_id)
        )`,
        `CREATE TABLE IF NOT EXISTS USER_ROLES (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            role_id INT NOT NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_user_role (user_id, role_id)
        )`,
        `CREATE TABLE IF NOT EXISTS SERVICES (
            id INT AUTO_INCREMENT PRIMARY KEY,
            title VARCHAR(56) NOT NULL UNIQUE,
            description VARCHAR(128) NOT NULL UNIQUE,
            cost DECIMAL(10, 4) NOT NULL DEFAULT 0.0000,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
          )`,
        `CREATE TABLE IF NOT EXISTS APPLICATION_SERVICES (
            id INT AUTO_INCREMENT PRIMARY KEY,
            application_id INT NOT NULL,
            service_id INT NOT NULL,
            active BOOLEAN NOT NULL DEFAULT TRUE,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY unique_user_application (application_id,service_id)
          )`,
        `CREATE TABLE IF NOT EXISTS MAILS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            application_service_id INT NOT NULL,
            recipient VARCHAR(255) NOT NULL,
            subject VARCHAR(512) NOT NULL,
            body TEXT NOT NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS FILES (
            id INT AUTO_INCREMENT PRIMARY KEY,
            application_service_id INT NOT NULL,
            file VARCHAR(64) NOT NULL,
            size DECIMAL(16, 8) NOT NULL DEFAULT 0,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            deleted_on DATETIME NULL,
            CONSTRAINT fk_files_application_service
                FOREIGN KEY (application_service_id)
                REFERENCES APPLICATION_SERVICES(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS INQUIRIES (
            id INT AUTO_INCREMENT PRIMARY KEY,
            full_name VARCHAR(128) NULL,
            phone VARCHAR(13) NOT NULL,
            email VARCHAR(255) NULL,
            source VARCHAR(64) NULL,
            institute_name VARCHAR(128) NULL,
            city VARCHAR(64) NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS CUSTOMER_INVOICES (
            id INT AUTO_INCREMENT PRIMARY KEY,
            customer_id INT NOT NULL,
            project_id INT NOT NULL,
            due_date DATE NOT NULL DEFAULT ((CURRENT_DATE + INTERVAL 7 DAY)),
            total DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
            gst DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
            hbt_sequence INT NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY unique_customer_invoices_hbt_sequence (hbt_sequence),
            CONSTRAINT fk_customer_invoices_customer
                FOREIGN KEY (customer_id)
                REFERENCES CUSTOMERS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE,
            CONSTRAINT fk_customer_invoices_customer_project
                FOREIGN KEY (project_id)
                REFERENCES CUSTOMER_PROJECTS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS INVOICE_ITEMS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            customer_invoice_id INT NOT NULL,
            item VARCHAR(128) NOT NULL,
            cost DECIMAL(10, 4) NOT NULL,
            quantity DECIMAL(10, 2) NOT NULL DEFAULT 1.00,
            amount DECIMAL(10, 2) GENERATED ALWAYS AS (ROUND(cost * quantity, 2)) STORED,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            CONSTRAINT fk_invoice_items_customer_invoice
                FOREIGN KEY (customer_invoice_id)
                REFERENCES CUSTOMER_INVOICES(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS INVOICE_PAYMENTS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            customer_invoice_id INT NOT NULL,
            amount DECIMAL(10, 2) NOT NULL,
            gst DECIMAL(10, 2) GENERATED ALWAYS AS (ROUND(amount * 0.18, 2)) STORED,
            note VARCHAR(512) NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            CONSTRAINT fk_invoice_payments_customer_invoice
                FOREIGN KEY (customer_invoice_id)
                REFERENCES CUSTOMER_INVOICES(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS EXPENSES (
            id INT AUTO_INCREMENT PRIMARY KEY,
            title VARCHAR(128) NOT NULL,
            description VARCHAR(512) NULL,
            amount DECIMAL(10, 2) NOT NULL,
            expense_date DATE NOT NULL,
            loaned BOOLEAN NOT NULL DEFAULT FALSE,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS MEDIA (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(64) NOT NULL,
            file VARCHAR(64) NOT NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS PROJECT_DOCUMENTS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            project_id INT NOT NULL,
            media_id INT NOT NULL,
            description VARCHAR(512) NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_project_documents_customer_project
                FOREIGN KEY (project_id)
                REFERENCES CUSTOMER_PROJECTS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE,
            CONSTRAINT fk_project_documents_media
                FOREIGN KEY (media_id)
                REFERENCES MEDIA(id)
                ON DELETE RESTRICT
                ON UPDATE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS INTERNAL_DOCUMENTS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            media_id INT NOT NULL,
            description VARCHAR(512) NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_internal_documents_media
                FOREIGN KEY (media_id)
                REFERENCES MEDIA(id)
                ON DELETE RESTRICT
                ON UPDATE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS GEM_MANDATORY_DOCUMENTS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            media_id INT NOT NULL,
            description VARCHAR(512) NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_gem_mandatory_media (media_id),
            CONSTRAINT fk_gem_mandatory_documents_media
                FOREIGN KEY (media_id)
                REFERENCES MEDIA(id)
                ON DELETE RESTRICT
                ON UPDATE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS JOB_POSITIONS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            title VARCHAR(128) NOT NULL,
            description TEXT NOT NULL,
            active BOOLEAN NOT NULL DEFAULT TRUE,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS JOB_APPLICANTS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            job_position_id INT NOT NULL,
            full_name VARCHAR(128) NOT NULL,
            phone VARCHAR(13) NOT NULL,
            email VARCHAR(255) NOT NULL,
            cv INT NOT NULL,
            viewed BOOLEAN NOT NULL DEFAULT FALSE,
            selected BOOLEAN NOT NULL DEFAULT FALSE,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            CONSTRAINT fk_job_applicants_job_position
                FOREIGN KEY (job_position_id)
                REFERENCES JOB_POSITIONS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE,
            CONSTRAINT fk_job_applicants_media
                FOREIGN KEY (cv)
                REFERENCES MEDIA(id)
                ON DELETE RESTRICT
                ON UPDATE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS CONTRACTS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            company VARCHAR(128) NULL,
            full_name VARCHAR(128) NOT NULL,
            email VARCHAR(255) NOT NULL,
            phone VARCHAR(13) NOT NULL,
            address VARCHAR(512) NOT NULL,
            signing_code VARCHAR(8) NOT NULL,
            active BOOLEAN NOT NULL DEFAULT TRUE,
            signable_till DATETIME NOT NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS CONTRACT_ATTACHMENTS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            title VARCHAR(128) NOT NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_contract_attachment_title (title)
        )`,
        `CREATE TABLE IF NOT EXISTS CONTRACT_REQUIRED_ATTACHMENTS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            contract_id INT NOT NULL,
            attachment_id INT NOT NULL,
            media_id INT NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_contract_required_attachment (contract_id, attachment_id),
            CONSTRAINT fk_contract_required_attachments_contract
                FOREIGN KEY (contract_id)
                REFERENCES CONTRACTS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE,
            CONSTRAINT fk_contract_required_attachments_attachment
                FOREIGN KEY (attachment_id)
                REFERENCES CONTRACT_ATTACHMENTS(id)
                ON DELETE RESTRICT
                ON UPDATE CASCADE,
            CONSTRAINT fk_contract_required_attachments_media
                FOREIGN KEY (media_id)
                REFERENCES MEDIA(id)
                ON DELETE RESTRICT
                ON UPDATE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS CONTRACT_CLAUSES (
            id INT AUTO_INCREMENT PRIMARY KEY,
            contract_id INT NOT NULL,
            title VARCHAR(128) NOT NULL,
            view_index INT NOT NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_contract_clauses_contract
                FOREIGN KEY (contract_id)
                REFERENCES CONTRACTS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS CLAUSE_SUBCLAUSES (
            id INT AUTO_INCREMENT PRIMARY KEY,
            clause_id INT NOT NULL,
            body TEXT NOT NULL,
            view_index INT NOT NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_clause_subclauses_clause
                FOREIGN KEY (clause_id)
                REFERENCES CONTRACT_CLAUSES(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS GEM_TENDER_KEYWORDS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            keyword VARCHAR(255) NOT NULL,
            exact_search BOOLEAN NOT NULL DEFAULT FALSE,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_gem_tender_keyword (keyword)
        )`,
        `CREATE TABLE IF NOT EXISTS GEM_KEYWORD_TENDERS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            keyword_id INT NULL,
            tender_id VARCHAR(128) NOT NULL,
            document VARCHAR(512) NULL,
            start_date_time VARCHAR(64) NULL,
            end_date_time VARCHAR(64) NULL,
            ministry VARCHAR(255) NULL,
            department VARCHAR(255) NULL,
            organization VARCHAR(255) NULL,
            office VARCHAR(255) NULL,
            hod_email VARCHAR(255) NULL,
            buyer_email VARCHAR(255) NULL,
            buyer_phone VARCHAR(64) NULL,
            required_minimum_average_turnover VARCHAR(128) NULL,
            required_past_experice_years VARCHAR(128) NULL,
            mse_experience_relaxation VARCHAR(32) NULL,
            mse_turnover_relaxation VARCHAR(32) NULL,
            asked_documents TEXT NULL,
            specification_links TEXT NULL,
            quantity INT NOT NULL DEFAULT 0,
            emd_amount DECIMAL(14, 2) NOT NULL DEFAULT 0,
            eligibility_reminder_sent_on DATETIME NULL,
            eligible VARCHAR(32) NOT NULL DEFAULT 'need_to_check',
            filed BOOLEAN NOT NULL DEFAULT FALSE,
            quote TEXT NULL,
            hidden BOOLEAN NOT NULL DEFAULT FALSE,
            stage VARCHAR(64) NOT NULL DEFAULT 'new',
            assignee_user_id INT NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_gem_keyword_tender (keyword_id, tender_id),
            CONSTRAINT fk_gem_keyword_tenders_keyword
                FOREIGN KEY (keyword_id)
                REFERENCES GEM_TENDER_KEYWORDS(id)
                ON DELETE SET NULL
                ON UPDATE CASCADE,
            CONSTRAINT fk_gem_keyword_tenders_assignee
                FOREIGN KEY (assignee_user_id)
                REFERENCES USERS(id)
                ON DELETE SET NULL
                ON UPDATE CASCADE
        )`,
        // Migrate legacy GEM tender stages into the stage-centric workflow.
        `UPDATE GEM_KEYWORD_TENDERS SET stage = 'out_of_scope' WHERE hidden = TRUE`,
        `UPDATE GEM_KEYWORD_TENDERS SET stage = 'filed' WHERE hidden = FALSE AND filed = TRUE`,
        `UPDATE GEM_KEYWORD_TENDERS SET stage = 'eligible' WHERE hidden = FALSE AND filed = FALSE AND eligible = 'eligible'`,
        `UPDATE GEM_KEYWORD_TENDERS SET stage = 'not_eligible' WHERE hidden = FALSE AND filed = FALSE AND eligible = 'not_eligible'`,
        `UPDATE GEM_KEYWORD_TENDERS
            SET stage = 'assigned'
            WHERE hidden = FALSE
              AND filed = FALSE
              AND eligible = 'need_to_check'
              AND assignee_user_id IS NOT NULL`,
        `UPDATE GEM_KEYWORD_TENDERS
            SET stage = 'new'
            WHERE hidden = FALSE
              AND filed = FALSE
              AND eligible = 'need_to_check'
              AND assignee_user_id IS NULL
              AND stage IN (
                    'new',
                    'work_in_progress',
                    'requested_for_quote',
                    'waiting_for_technical',
                    'waiting_for_financial'
              )`,
        `UPDATE GEM_KEYWORD_TENDERS SET stage = 'assigned' WHERE stage = 'work_in_progress'`,
        `UPDATE GEM_KEYWORD_TENDERS
            SET stage = 'eligible'
            WHERE stage IN ('requested_for_quote', 'waiting_for_technical', 'waiting_for_financial')`,
        // Past-end New/unassigned tenders that were never claimed.
        `UPDATE GEM_KEYWORD_TENDERS
            SET
                stage = 'unattended',
                hidden = TRUE,
                filed = FALSE,
                eligible = 'need_to_check'
            WHERE stage = 'new'
              AND assignee_user_id IS NULL
              AND end_date_time IS NOT NULL
              AND end_date_time < NOW()`,
        `CREATE TABLE IF NOT EXISTS GEM_KEYWORD_TENDER_ACTIVITIES (
            id INT AUTO_INCREMENT PRIMARY KEY,
            gem_keyword_tender_id INT NOT NULL,
            user_id INT NOT NULL,
            activity VARCHAR(512) NOT NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_gem_keyword_tender_activities_tender
                FOREIGN KEY (gem_keyword_tender_id)
                REFERENCES GEM_KEYWORD_TENDERS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE,
            CONSTRAINT fk_gem_keyword_tender_activities_user
                FOREIGN KEY (user_id)
                REFERENCES USERS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS GEM_KEYWORD_TENDER_COMMENTS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            gem_keyword_tender_id INT NOT NULL,
            user_id INT NOT NULL,
            comment TEXT NOT NULL,
            media_id INT NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            CONSTRAINT fk_gem_keyword_tender_comments_tender
                FOREIGN KEY (gem_keyword_tender_id)
                REFERENCES GEM_KEYWORD_TENDERS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE,
            CONSTRAINT fk_gem_keyword_tender_comments_user
                FOREIGN KEY (user_id)
                REFERENCES USERS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE,
            CONSTRAINT fk_gem_keyword_tender_comments_media
                FOREIGN KEY (media_id)
                REFERENCES MEDIA(id)
                ON DELETE SET NULL
                ON UPDATE CASCADE
        )`,
        `ALTER TABLE GEM_KEYWORD_TENDER_COMMENTS
            ADD COLUMN media_id INT NULL`,
        `CREATE TABLE IF NOT EXISTS GEM_TENDER_SCAN_RUNS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            status VARCHAR(32) NOT NULL DEFAULT 'running',
            keyword_count INT NOT NULL DEFAULT 0,
            tender_count INT NOT NULL DEFAULT 0,
            created_by INT NULL,
            error_message TEXT NULL,
            started_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            finished_on DATETIME NULL,
            CONSTRAINT fk_gem_tender_scan_runs_created_by
                FOREIGN KEY (created_by)
                REFERENCES USERS(id)
                ON DELETE SET NULL
                ON UPDATE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS AUTOMATION_USERS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            instagram_cookie TEXT NULL,
            instagram_user_id VARCHAR(64) NULL,
            youtube_cookie TEXT NULL,
            youtube_channel_id VARCHAR(128) NULL,
            linkedin_cookie TEXT NULL,
            linkedin_company_id VARCHAR(64) NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_automation_user_name (name)
        )`,
        `ALTER TABLE AUTOMATION_USERS
            ADD COLUMN youtube_channel_id VARCHAR(128) NULL`,
        `ALTER TABLE AUTOMATION_USERS
            ADD COLUMN linkedin_company_id VARCHAR(64) NULL`,
        `ALTER TABLE AUTOMATION_USERS
            ADD COLUMN instagram_user_id VARCHAR(64) NULL`,
        `CREATE TABLE IF NOT EXISTS CONTENT_PUBLISH_RUNS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            status VARCHAR(32) NOT NULL DEFAULT 'queued',
            media_id INT NOT NULL,
            media_kind VARCHAR(16) NOT NULL DEFAULT 'image',
            automation_user_id INT NULL,
            user_name VARCHAR(255) NOT NULL,
            instagram_caption TEXT NULL,
            youtube_title VARCHAR(255) NULL,
            youtube_description TEXT NULL,
            linkedin_caption TEXT NULL,
            source VARCHAR(32) NOT NULL DEFAULT 'user',
            created_by INT NULL,
            application_id INT NULL,
            application_service_id INT NULL,
            scheduled_by_name VARCHAR(255) NULL,
            run_options TEXT NULL,
            error_message TEXT NULL,
            started_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            finished_on DATETIME NULL
        )`,
        `CREATE TABLE IF NOT EXISTS CONTENT_PUBLISH_RUN_TARGETS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            run_id INT NOT NULL,
            platform VARCHAR(32) NOT NULL,
            status VARCHAR(32) NOT NULL DEFAULT 'pending',
            error_message TEXT NULL,
            screenshot_files TEXT NULL,
            CONSTRAINT fk_content_publish_run_targets_run
                FOREIGN KEY (run_id)
                REFERENCES CONTENT_PUBLISH_RUNS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE
        )`,
        // Existing installs may predate these columns (duplicate ADD is ignored).
        `ALTER TABLE CONTENT_PUBLISH_RUN_TARGETS
            ADD COLUMN screenshot_files TEXT NULL`,
        `ALTER TABLE CONTENT_PUBLISH_RUNS
            ADD COLUMN media_kind VARCHAR(16) NOT NULL DEFAULT 'image'`,
        `ALTER TABLE CONTENT_PUBLISH_RUNS
            ADD COLUMN source VARCHAR(32) NOT NULL DEFAULT 'user'`,
        `ALTER TABLE CONTENT_PUBLISH_RUNS
            ADD COLUMN application_id INT NULL`,
        `ALTER TABLE CONTENT_PUBLISH_RUNS
            ADD COLUMN application_service_id INT NULL`,
        `ALTER TABLE CONTENT_PUBLISH_RUNS
            ADD COLUMN scheduled_by_name VARCHAR(255) NULL`,
        `ALTER TABLE CONTENT_PUBLISH_RUNS
            ADD COLUMN run_options TEXT NULL`,
        `ALTER TABLE CONTENT_PUBLISH_RUNS
            MODIFY COLUMN automation_user_id INT NULL`,
        // Backfill legacy single screenshot_file into screenshot_files, then drop unused columns.
        `UPDATE CONTENT_PUBLISH_RUN_TARGETS
            SET screenshot_files = CONCAT('["', screenshot_file, '"]')
            WHERE screenshot_file IS NOT NULL
              AND screenshot_file != ''
              AND (screenshot_files IS NULL OR screenshot_files = '')`,
        `ALTER TABLE CONTENT_PUBLISH_RUN_TARGETS
            DROP COLUMN screenshot_file`,
        `ALTER TABLE CONTENT_PUBLISH_RUNS
            DROP COLUMN instagram_hashtags`,
        `ALTER TABLE CONTENT_PUBLISH_RUNS
            DROP COLUMN facebook_caption`,
        `ALTER TABLE AUTOMATION_USERS
            DROP COLUMN facebook_cookie`,
        `CREATE TABLE IF NOT EXISTS LINKEDIN_DESIGNATIONS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_linkedin_designation_name (name)
        )`,
        `CREATE TABLE IF NOT EXISTS LINKEDIN_GROW_RUNS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            status VARCHAR(32) NOT NULL DEFAULT 'running',
            per_account_limit INT NOT NULL,
            created_by INT NULL,
            error_message TEXT NULL,
            started_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            finished_on DATETIME NULL
        )`,
        `CREATE TABLE IF NOT EXISTS LINKEDIN_GROW_RUN_ACCOUNTS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            run_id INT NOT NULL,
            linkedin_user_id INT NULL,
            user_name VARCHAR(255) NOT NULL,
            sent_count INT NOT NULL DEFAULT 0,
            status VARCHAR(32) NOT NULL DEFAULT 'pending',
            CONSTRAINT fk_linkedin_grow_run_accounts_run
                FOREIGN KEY (run_id)
                REFERENCES LINKEDIN_GROW_RUNS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS LINKEDIN_GROW_RUN_DESIGNATIONS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            run_id INT NOT NULL,
            designation_name VARCHAR(255) NOT NULL,
            CONSTRAINT fk_linkedin_grow_run_designations_run
                FOREIGN KEY (run_id)
                REFERENCES LINKEDIN_GROW_RUNS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS LINKEDIN_SEARCH_RUNS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            status VARCHAR(32) NOT NULL DEFAULT 'running',
            page_count INT NOT NULL,
            created_by INT NULL,
            error_message TEXT NULL,
            started_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            finished_on DATETIME NULL
        )`,
        `CREATE TABLE IF NOT EXISTS LINKEDIN_SEARCH_RUN_ACCOUNTS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            run_id INT NOT NULL,
            linkedin_user_id INT NULL,
            user_name VARCHAR(255) NOT NULL,
            sent_count INT NOT NULL DEFAULT 0,
            status VARCHAR(32) NOT NULL DEFAULT 'pending',
            CONSTRAINT fk_linkedin_search_run_accounts_run
                FOREIGN KEY (run_id)
                REFERENCES LINKEDIN_SEARCH_RUNS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS LINKEDIN_SEARCH_RUN_DESIGNATIONS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            run_id INT NOT NULL,
            designation_name VARCHAR(255) NOT NULL,
            CONSTRAINT fk_linkedin_search_run_designations_run
                FOREIGN KEY (run_id)
                REFERENCES LINKEDIN_SEARCH_RUNS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS LINKEDIN_DESIGNATION_MESSAGES (
            id INT AUTO_INCREMENT PRIMARY KEY,
            designation_id INT NOT NULL,
            message TEXT NOT NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_linkedin_designation_messages_designation
                FOREIGN KEY (designation_id)
                REFERENCES LINKEDIN_DESIGNATIONS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS LINKEDIN_MESSAGE_RUNS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            status VARCHAR(32) NOT NULL DEFAULT 'running',
            per_account_limit INT NOT NULL,
            created_by INT NULL,
            error_message TEXT NULL,
            started_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            finished_on DATETIME NULL
        )`,
        `CREATE TABLE IF NOT EXISTS LINKEDIN_MESSAGE_RUN_ACCOUNTS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            run_id INT NOT NULL,
            linkedin_user_id INT NULL,
            user_name VARCHAR(255) NOT NULL,
            sent_count INT NOT NULL DEFAULT 0,
            status VARCHAR(32) NOT NULL DEFAULT 'pending',
            CONSTRAINT fk_linkedin_message_run_accounts_run
                FOREIGN KEY (run_id)
                REFERENCES LINKEDIN_MESSAGE_RUNS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS LINKEDIN_MESSAGE_RUN_DESIGNATIONS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            run_id INT NOT NULL,
            designation_name VARCHAR(255) NOT NULL,
            CONSTRAINT fk_linkedin_message_run_designations_run
                FOREIGN KEY (run_id)
                REFERENCES LINKEDIN_MESSAGE_RUNS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS SERVERS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            tag VARCHAR(64) NOT NULL,
            name VARCHAR(128) NULL,
            project_id INT NULL,
            last_seen_at DATETIME NULL,
            agent_version VARCHAR(32) NULL,
            last_sync_at DATETIME NULL,
            last_sync_status VARCHAR(16) NULL,
            last_sync_summary VARCHAR(512) NULL,
            alert BOOLEAN NOT NULL DEFAULT FALSE,
            active BOOLEAN NOT NULL DEFAULT TRUE,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY unique_server_tag (tag),
            CONSTRAINT fk_servers_customer_project
                FOREIGN KEY (project_id)
                REFERENCES CUSTOMER_PROJECTS(id)
                ON DELETE SET NULL
                ON UPDATE CASCADE
        )`,
        `ALTER TABLE SERVERS ADD COLUMN last_sync_at DATETIME NULL`,
        `ALTER TABLE SERVERS ADD COLUMN last_sync_status VARCHAR(16) NULL`,
        `ALTER TABLE SERVERS ADD COLUMN last_sync_summary VARCHAR(512) NULL`,
        `ALTER TABLE SERVERS ADD COLUMN alert BOOLEAN NOT NULL DEFAULT FALSE`,
        `ALTER TABLE SERVERS ADD COLUMN alert_cpu_enabled BOOLEAN NOT NULL DEFAULT FALSE`,
        `ALTER TABLE SERVERS ADD COLUMN alert_cpu_percent INT NOT NULL DEFAULT 80`,
        `ALTER TABLE SERVERS ADD COLUMN alert_memory_enabled BOOLEAN NOT NULL DEFAULT FALSE`,
        `ALTER TABLE SERVERS ADD COLUMN alert_memory_percent INT NOT NULL DEFAULT 80`,
        `ALTER TABLE SERVERS ADD COLUMN alert_ping_enabled BOOLEAN NOT NULL DEFAULT FALSE`,
        `ALTER TABLE SERVERS ADD COLUMN alert_ping_seconds INT NOT NULL DEFAULT 180`,
        `UPDATE SERVERS
            SET alert_memory_enabled = TRUE,
                alert_memory_percent = 90
            WHERE alert = TRUE
              AND alert_memory_enabled = FALSE`,
        `CREATE TABLE IF NOT EXISTS SERVER_METRICS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            server_id INT NOT NULL,
            payload TEXT NOT NULL,
            collected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_server_metrics_server
                FOREIGN KEY (server_id)
                REFERENCES SERVERS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE,
            INDEX idx_server_metrics_server_collected (server_id, collected_at)
        )`,
        `CREATE TABLE IF NOT EXISTS TASKS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            title VARCHAR(128) NOT NULL,
            description TEXT NULL,
            expected_hours DECIMAL(10, 2) NULL,
            actual_hours DECIMAL(10, 2) NULL,
            start_at DATETIME NULL,
            end_at DATETIME NULL,
            completed_on DATETIME NULL,
            state VARCHAR(32) NOT NULL DEFAULT 'todo',
            priority VARCHAR(16) NOT NULL DEFAULT 'medium',
            blocked_reason VARCHAR(512) NULL,
            project_id INT NULL,
            assignee_user_id INT NULL,
            created_by_user_id INT NOT NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            CONSTRAINT fk_tasks_customer_project
                FOREIGN KEY (project_id)
                REFERENCES CUSTOMER_PROJECTS(id)
                ON DELETE SET NULL
                ON UPDATE CASCADE,
            CONSTRAINT fk_tasks_assignee_user
                FOREIGN KEY (assignee_user_id)
                REFERENCES USERS(id)
                ON DELETE SET NULL
                ON UPDATE CASCADE,
            CONSTRAINT fk_tasks_created_by_user
                FOREIGN KEY (created_by_user_id)
                REFERENCES USERS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE,
            INDEX idx_tasks_state (state),
            INDEX idx_tasks_assignee (assignee_user_id),
            INDEX idx_tasks_project (project_id),
            INDEX idx_tasks_end_at (end_at)
        )`,
        `CREATE TABLE IF NOT EXISTS TASK_COMMENTS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            task_id INT NOT NULL,
            user_id INT NOT NULL,
            comment TEXT NOT NULL,
            media_id INT NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            CONSTRAINT fk_task_comments_task
                FOREIGN KEY (task_id)
                REFERENCES TASKS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE,
            CONSTRAINT fk_task_comments_user
                FOREIGN KEY (user_id)
                REFERENCES USERS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE,
            CONSTRAINT fk_task_comments_media
                FOREIGN KEY (media_id)
                REFERENCES MEDIA(id)
                ON DELETE SET NULL
                ON UPDATE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS TASK_ATTACHMENTS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            task_id INT NOT NULL,
            media_id INT NOT NULL,
            description VARCHAR(512) NULL,
            created_by_user_id INT NOT NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_task_attachments_task
                FOREIGN KEY (task_id)
                REFERENCES TASKS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE,
            CONSTRAINT fk_task_attachments_media
                FOREIGN KEY (media_id)
                REFERENCES MEDIA(id)
                ON DELETE RESTRICT
                ON UPDATE CASCADE,
            CONSTRAINT fk_task_attachments_created_by_user
                FOREIGN KEY (created_by_user_id)
                REFERENCES USERS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS TASK_REMINDERS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            task_id INT NOT NULL,
            remind_at DATETIME NOT NULL,
            recipient_user_id INT NOT NULL,
            sent_on DATETIME NULL,
            created_by_user_id INT NOT NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_task_reminders_task
                FOREIGN KEY (task_id)
                REFERENCES TASKS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE,
            CONSTRAINT fk_task_reminders_recipient
                FOREIGN KEY (recipient_user_id)
                REFERENCES USERS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE,
            CONSTRAINT fk_task_reminders_created_by_user
                FOREIGN KEY (created_by_user_id)
                REFERENCES USERS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE,
            INDEX idx_task_reminders_pending (sent_on, remind_at)
        )`,
        `CREATE TABLE IF NOT EXISTS TASK_ACTIVITIES (
            id INT AUTO_INCREMENT PRIMARY KEY,
            task_id INT NOT NULL,
            user_id INT NOT NULL,
            activity VARCHAR(512) NOT NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_task_activities_task
                FOREIGN KEY (task_id)
                REFERENCES TASKS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE,
            CONSTRAINT fk_task_activities_user
                FOREIGN KEY (user_id)
                REFERENCES USERS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS TASK_FOLLOWERS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            task_id INT NOT NULL,
            user_id INT NOT NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_task_follower (task_id, user_id),
            CONSTRAINT fk_task_followers_task
                FOREIGN KEY (task_id)
                REFERENCES TASKS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE,
            CONSTRAINT fk_task_followers_user
                FOREIGN KEY (user_id)
                REFERENCES USERS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE
        )`,
        `INSERT IGNORE INTO SERVICES (title, description, cost) VALUES ('${CONSTANTS.SAAS.SERVICES.MAILER}', 'allows to send emails', 0.00);`,
        `INSERT IGNORE INTO SERVICES (title, description, cost) VALUES ('${CONSTANTS.SAAS.SERVICES.BUCKETIZER}', 'object storage uploads', 0.00);`,
        `INSERT IGNORE INTO SERVICES (title, description, cost) VALUES ('${CONTENT_PUBLISHER_SERVICE}', 'publish images and videos to Instagram LinkedIn YouTube', 0.00);`,
        `INSERT IGNORE INTO USERS (full_name, email, super_admin) VALUES ('Admin', 'support@hammerbyte.co.in', TRUE);`,
        `INSERT IGNORE INTO CONTRACT_ATTACHMENTS (title) VALUES ('Signature'), ('Selfie'), ('Aadhar'), ('PAN'), ('Passport');`,
        `INSERT IGNORE INTO ROLES (title) VALUES ('ADMIN');`,
        `INSERT IGNORE INTO AUTHORITIES (title, description) VALUES ${Object.values(AUTHORITIES)
            .map((title) => {
                const description = (AUTHORITY_DESCRIPTIONS[title] || title).replace(/'/g, "''");
                return `('${title}', '${description}')`;
            })
            .join(", ")};`,
        `INSERT IGNORE INTO ROLE_AUTHORITIES (role_id, authority_id)
            SELECT ROLES.id, AUTHORITIES.id
            FROM ROLES
            CROSS JOIN AUTHORITIES
            WHERE ROLES.title = 'ADMIN';`,
        `UPDATE USERS SET super_admin = TRUE WHERE email = 'support@hammerbyte.co.in';`,
        `INSERT IGNORE INTO USER_ROLES (user_id, role_id)
            SELECT USERS.id, ROLES.id
            FROM USERS
            CROSS JOIN ROLES
            WHERE USERS.super_admin = TRUE;`,
    ];

    for (const table of requiredTables) {
        try {
            await dbConnection.unsafe(table);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            // Ignore idempotent migration noise on already-migrated DBs.
            if (
                !/duplicate column name|check that column\/key exists|can't drop|unknown column|duplicate (foreign )?key|already exists/i.test(
                    message,
                )
            ) {
                throw error;
            }
        }
    }
}
