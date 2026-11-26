import { SQL } from "bun";
import { logger, CONSTANTS } from "@hammerbyte/utils";
import { fromDbDateTime } from "./date.js";
import {
    AUTHORITIES,
    AUTHORITY_DESCRIPTIONS,
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
    max: 4,
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

let istTimeZoneReady = false;

/** Ensure MySQL session DATETIME wall-clock is Asia/Kolkata (+05:30). */
export async function ensureIstTimeZone() {
    if (istTimeZoneReady) {
        return;
    }
    try {
        await dbConnection.unsafe("SET time_zone = '+05:30'");
        istTimeZoneReady = true;
    } catch (error) {
        logger.error(`ensureIstTimeZone: ${error}`);
    }
}

export async function executeSQLQuery(queryFunction) {
    await ensureIstTimeZone();
    const result = await queryFunction(dbConnection);
    return normalizeSqlResult(result);
}

export async function generateDBTables() {
    await ensureIstTimeZone();
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
            personal_email VARCHAR(128) NOT NULL,
            phone VARCHAR(13) NOT NULL,
            login_method VARCHAR(16) NOT NULL DEFAULT 'otp',
            login_email VARCHAR(16) NOT NULL DEFAULT 'professional',
            password_hash VARCHAR(255) NULL,
            hourly_rate DECIMAL(10, 2) NULL,
            login_active BOOLEAN NOT NULL DEFAULT TRUE,
            last_login DATETIME NULL,
            super_admin BOOLEAN NOT NULL DEFAULT FALSE,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY unique_user_email (email),
            CONSTRAINT chk_users_professional_email CHECK (email LIKE '%@hammerbyte.co.in')
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
            organization VARCHAR(128) NULL,
            city VARCHAR(64) NULL,
            state VARCHAR(32) NOT NULL DEFAULT 'new',
            assignee_user_id INT NULL,
            quote TEXT NULL,
            potential_entered_on DATETIME NULL,
            followup_1_reminder_sent_on DATETIME NULL,
            followup_2_reminder_sent_on DATETIME NULL,
            followup_3_reminder_sent_on DATETIME NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_inquiries_assignee
                FOREIGN KEY (assignee_user_id)
                REFERENCES USERS(id)
                ON DELETE SET NULL
                ON UPDATE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS INQUIRY_NOTES (
            id INT AUTO_INCREMENT PRIMARY KEY,
            inquiry_id INT NOT NULL,
            user_id INT NOT NULL,
            note TEXT NOT NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            CONSTRAINT fk_inquiry_notes_inquiry
                FOREIGN KEY (inquiry_id)
                REFERENCES INQUIRIES(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE,
            CONSTRAINT fk_inquiry_notes_user
                FOREIGN KEY (user_id)
                REFERENCES USERS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS INQUIRY_FOLLOWUPS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            inquiry_id INT NOT NULL,
            user_id INT NOT NULL,
            note TEXT NOT NULL,
            followed_up_on DATETIME NOT NULL,
            slot TINYINT NOT NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_inquiry_followup_slot (inquiry_id, slot),
            CONSTRAINT fk_inquiry_followups_inquiry
                FOREIGN KEY (inquiry_id)
                REFERENCES INQUIRIES(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE,
            CONSTRAINT fk_inquiry_followups_user
                FOREIGN KEY (user_id)
                REFERENCES USERS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS INQUIRY_ACTIVITIES (
            id INT AUTO_INCREMENT PRIMARY KEY,
            inquiry_id INT NOT NULL,
            user_id INT NOT NULL,
            activity VARCHAR(512) NOT NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_inquiry_activities_inquiry
                FOREIGN KEY (inquiry_id)
                REFERENCES INQUIRIES(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE,
            CONSTRAINT fk_inquiry_activities_user
                FOREIGN KEY (user_id)
                REFERENCES USERS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE
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
        `CREATE TABLE IF NOT EXISTS JOB_POSITIONS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            title VARCHAR(128) NOT NULL,
            description TEXT NOT NULL,
            experience VARCHAR(128) NOT NULL,
            reply_email VARCHAR(255) NOT NULL,
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
            state VARCHAR(64) NOT NULL,
            city VARCHAR(64) NOT NULL,
            country VARCHAR(64) NOT NULL DEFAULT 'India',
            cv INT NOT NULL,
            shortlisted BOOLEAN NOT NULL DEFAULT FALSE,
            decision VARCHAR(16) NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_job_applicants_job_email (job_position_id, email),
            UNIQUE KEY uq_job_applicants_job_phone (job_position_id, phone),
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
        `CREATE TABLE IF NOT EXISTS JOB_APPLICANT_INTERVIEWS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            job_applicant_id INT NOT NULL,
            interviewer_user_id INT NOT NULL,
            interview_at DATETIME NOT NULL,
            meeting_link VARCHAR(512) NOT NULL,
            outcome TEXT NULL,
            reminder_sent_on DATETIME NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_job_applicant_interviews_reminder (reminder_sent_on, interview_at),
            CONSTRAINT fk_job_applicant_interviews_applicant
                FOREIGN KEY (job_applicant_id)
                REFERENCES JOB_APPLICANTS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE,
            CONSTRAINT fk_job_applicant_interviews_interviewer
                FOREIGN KEY (interviewer_user_id)
                REFERENCES USERS(id)
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
            broken BOOLEAN NOT NULL DEFAULT FALSE,
            break_date DATETIME NULL,
            broken_by VARCHAR(16) NULL,
            broken_at DATETIME NULL,
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
        `CREATE TABLE IF NOT EXISTS GEM_TENDER_CATEGORIES (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_gem_tender_category_name (name)
        )`,
        `CREATE TABLE IF NOT EXISTS GEM_CATEGORY_GROUPS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            tender_category_id INT NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_gem_category_group_name (name),
            CONSTRAINT fk_gem_category_groups_tender_category
                FOREIGN KEY (tender_category_id)
                REFERENCES GEM_TENDER_CATEGORIES(id)
                ON DELETE SET NULL
                ON UPDATE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS GEM_CATEGORIES (
            id INT AUTO_INCREMENT PRIMARY KEY,
            group_id INT NOT NULL,
            name VARCHAR(512) NOT NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_gem_category_group_name (group_id, name),
            CONSTRAINT fk_gem_categories_group
                FOREIGN KEY (group_id)
                REFERENCES GEM_CATEGORY_GROUPS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS GEM_SCAN_KEYWORDS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            keyword VARCHAR(512) NOT NULL,
            exact_search TINYINT(1) NOT NULL DEFAULT 0,
            tender_category_id INT NOT NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_gem_scan_keyword (keyword),
            CONSTRAINT fk_gem_scan_keywords_tender_category
                FOREIGN KEY (tender_category_id)
                REFERENCES GEM_TENDER_CATEGORIES(id)
                ON DELETE RESTRICT
                ON UPDATE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS GEM_TENDERS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            category_group_id INT NULL,
            tender_category_id INT NULL,
            tender_id VARCHAR(128) NOT NULL,
            document VARCHAR(512) NULL,
            document_media_id INT NULL,
            start_date_time VARCHAR(64) NULL,
            end_date_time VARCHAR(64) NULL,
            ministry VARCHAR(255) NULL,
            department VARCHAR(255) NULL,
            organization VARCHAR(255) NULL,
            office VARCHAR(255) NULL,
            hod_email VARCHAR(255) NULL,
            buyer_email VARCHAR(255) NULL,
            buyer_phone VARCHAR(64) NULL,
            buyer_name VARCHAR(255) NULL,
            required_minimum_average_turnover VARCHAR(128) NULL,
            required_past_experice_years VARCHAR(128) NULL,
            mse_experience_relaxation TINYINT(1) NULL,
            mse_turnover_relaxation TINYINT(1) NULL,
            asked_documents TEXT NULL,
            specification_links TEXT NULL,
            quantity INT NOT NULL DEFAULT 0,
            emd_amount DECIMAL(14, 2) NOT NULL DEFAULT 0,
            eligibility_reminder_sent_on DATETIME NULL,
            eligible BOOLEAN NOT NULL DEFAULT FALSE,
            ineligible BOOLEAN NOT NULL DEFAULT FALSE,
            out_of_scope BOOLEAN NOT NULL DEFAULT FALSE,
            requires_review TINYINT(1) NOT NULL DEFAULT 0,
            missed BOOLEAN NOT NULL DEFAULT FALSE,
            unattended BOOLEAN NOT NULL DEFAULT FALSE,
            filed BOOLEAN NOT NULL DEFAULT FALSE,
            quote TEXT NULL,
            hidden BOOLEAN NOT NULL DEFAULT FALSE,
            locked TINYINT(1) NOT NULL DEFAULT 0,
            lock_message VARCHAR(255) NULL,
            stage VARCHAR(64) NULL DEFAULT NULL,
            assignee_user_id INT NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_gem_tender (tender_id),
            CONSTRAINT fk_gem_tenders_category_group
                FOREIGN KEY (category_group_id)
                REFERENCES GEM_CATEGORY_GROUPS(id)
                ON DELETE SET NULL
                ON UPDATE CASCADE,
            CONSTRAINT fk_gem_tenders_tender_category
                FOREIGN KEY (tender_category_id)
                REFERENCES GEM_TENDER_CATEGORIES(id)
                ON DELETE SET NULL
                ON UPDATE CASCADE,
            CONSTRAINT fk_gem_tenders_assignee
                FOREIGN KEY (assignee_user_id)
                REFERENCES USERS(id)
                ON DELETE SET NULL
                ON UPDATE CASCADE,
            CONSTRAINT fk_gem_tenders_document_media
                FOREIGN KEY (document_media_id)
                REFERENCES MEDIA(id)
                ON DELETE SET NULL
                ON UPDATE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS GEM_TENDER_ACTIVITIES (
            id INT AUTO_INCREMENT PRIMARY KEY,
            gem_tender_id INT NOT NULL,
            user_id INT NOT NULL,
            activity VARCHAR(512) NOT NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_gem_tender_activities_tender
                FOREIGN KEY (gem_tender_id)
                REFERENCES GEM_TENDERS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE,
            CONSTRAINT fk_gem_tender_activities_user
                FOREIGN KEY (user_id)
                REFERENCES USERS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS GEM_TENDER_COMMENTS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            gem_tender_id INT NOT NULL,
            user_id INT NOT NULL,
            comment TEXT NOT NULL,
            media_id INT NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            CONSTRAINT fk_gem_tender_comments_tender
                FOREIGN KEY (gem_tender_id)
                REFERENCES GEM_TENDERS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE,
            CONSTRAINT fk_gem_tender_comments_user
                FOREIGN KEY (user_id)
                REFERENCES USERS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE,
            CONSTRAINT fk_gem_tender_comments_media
                FOREIGN KEY (media_id)
                REFERENCES MEDIA(id)
                ON DELETE SET NULL
                ON UPDATE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS GEM_TENDER_DOCUMENTS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            gem_tender_id INT NOT NULL,
            media_id INT NOT NULL,
            name VARCHAR(128) NOT NULL,
            created_by INT NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_gem_tender_documents_tender
                FOREIGN KEY (gem_tender_id)
                REFERENCES GEM_TENDERS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE,
            CONSTRAINT fk_gem_tender_documents_media
                FOREIGN KEY (media_id)
                REFERENCES MEDIA(id)
                ON DELETE RESTRICT
                ON UPDATE CASCADE,
            CONSTRAINT fk_gem_tender_documents_created_by
                FOREIGN KEY (created_by)
                REFERENCES USERS(id)
                ON DELETE SET NULL
                ON UPDATE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS GEM_DOCUMENTS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            media_id INT NOT NULL,
            description VARCHAR(512) NULL,
            created_by INT NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            CONSTRAINT fk_gem_documents_media
                FOREIGN KEY (media_id)
                REFERENCES MEDIA(id)
                ON DELETE RESTRICT
                ON UPDATE CASCADE,
            CONSTRAINT fk_gem_documents_created_by
                FOREIGN KEY (created_by)
                REFERENCES USERS(id)
                ON DELETE SET NULL
                ON UPDATE CASCADE
        )`,
        // Remove retired GeM AI scope columns/table from older installs.
        `ALTER TABLE GEM_TENDERS DROP COLUMN ai_confidence`,
        `ALTER TABLE GEM_TENDERS DROP COLUMN ai_analyzed`,
        `DROP TABLE IF EXISTS GEM_TENDER_AI_SETTINGS`,
        `CREATE TABLE IF NOT EXISTS GEM_PUBLIC_TEXTS (
            id INT PRIMARY KEY,
            scope_text TEXT NOT NULL,
            rules_text TEXT NOT NULL,
            updated_by INT NULL,
            updated_on DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            CONSTRAINT fk_gem_public_texts_user
                FOREIGN KEY (updated_by)
                REFERENCES USERS(id)
                ON DELETE SET NULL
                ON UPDATE CASCADE
        )`,
        `INSERT IGNORE INTO GEM_PUBLIC_TEXTS (id, scope_text, rules_text) VALUES (1, '', '')`,
        `CREATE TABLE IF NOT EXISTS GEM_TENDER_SCAN_RUNS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            status VARCHAR(32) NOT NULL DEFAULT 'running',
            scan_type VARCHAR(32) NOT NULL DEFAULT 'advance_search',
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
        `CREATE TABLE IF NOT EXISTS SERVERS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(128) NOT NULL,
            location VARCHAR(128) NOT NULL,
            project_id INT NULL,
            notes TEXT NULL,
            active BOOLEAN NOT NULL DEFAULT TRUE,
            tag CHAR(36) NOT NULL,
            tag_mapped BOOLEAN NOT NULL DEFAULT FALSE,
            otp CHAR(4) NOT NULL,
            utility_username VARCHAR(128) NULL,
            utility_password VARCHAR(255) NULL,
            alert_config MEDIUMTEXT NULL,
            alert_state MEDIUMTEXT NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY unique_server_tag (tag),
            INDEX idx_servers_otp_tag_mapped (otp, tag_mapped),
            CONSTRAINT fk_servers_customer_project
                FOREIGN KEY (project_id)
                REFERENCES CUSTOMER_PROJECTS(id)
                ON DELETE SET NULL
                ON UPDATE CASCADE
        )`,
        `ALTER TABLE SERVERS ADD COLUMN utility_username VARCHAR(128) NULL`,
        `ALTER TABLE SERVERS ADD COLUMN utility_password VARCHAR(255) NULL`,
        `CREATE TABLE IF NOT EXISTS SERVER_PINGS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            server_id INT NOT NULL,
            client_timestamp VARCHAR(64) NULL,
            payload TEXT NOT NULL,
            received_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_server_pings_server
                FOREIGN KEY (server_id)
                REFERENCES SERVERS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE,
            INDEX idx_server_pings_server_received (server_id, received_on)
        )`,
        `CREATE TABLE IF NOT EXISTS SERVER_METRICS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            server_id INT NOT NULL,
            client_timestamp VARCHAR(64) NULL,
            payload MEDIUMTEXT NOT NULL,
            received_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_server_metrics_server
                FOREIGN KEY (server_id)
                REFERENCES SERVERS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE,
            INDEX idx_server_metrics_server_received (server_id, received_on)
        )`,
        `CREATE TABLE IF NOT EXISTS SERVER_DATAER_RUNS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            server_id INT NOT NULL,
            host VARCHAR(256) NULL,
            remote VARCHAR(512) NULL,
            local_path VARCHAR(512) NULL,
            interval_seconds INT NULL,
            success BOOLEAN NULL,
            result VARCHAR(512) NULL,
            duration_seconds DECIMAL(12, 3) NULL,
            finished_at VARCHAR(64) NULL,
            detail TEXT NULL,
            client_timestamp VARCHAR(64) NULL,
            payload MEDIUMTEXT NOT NULL,
            received_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_server_dataer_runs_server
                FOREIGN KEY (server_id)
                REFERENCES SERVERS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE,
            INDEX idx_server_dataer_runs_server_received (server_id, received_on)
        )`,
        `CREATE TABLE IF NOT EXISTS SERVER_DBER_RUNS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            server_id INT NOT NULL,
            from_host VARCHAR(256) NULL,
            from_database VARCHAR(256) NULL,
            to_host VARCHAR(256) NULL,
            to_database VARCHAR(256) NULL,
            interval_seconds INT NULL,
            success BOOLEAN NULL,
            result VARCHAR(512) NULL,
            duration_seconds DECIMAL(12, 3) NULL,
            finished_at VARCHAR(64) NULL,
            bacpac_path VARCHAR(1024) NULL,
            detail TEXT NULL,
            client_timestamp VARCHAR(64) NULL,
            payload MEDIUMTEXT NOT NULL,
            received_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_server_dber_runs_server
                FOREIGN KEY (server_id)
                REFERENCES SERVERS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE,
            INDEX idx_server_dber_runs_server_received (server_id, received_on)
        )`,
        `CREATE TABLE IF NOT EXISTS SERVER_ALERT_LOG (
            id INT AUTO_INCREMENT PRIMARY KEY,
            server_id INT NOT NULL,
            kind VARCHAR(64) NOT NULL,
            detail TEXT NULL,
            recipients TEXT NULL,
            sent_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_server_alert_log_server
                FOREIGN KEY (server_id)
                REFERENCES SERVERS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE,
            INDEX idx_server_alert_log_server_sent (server_id, sent_on)
        )`,
        `CREATE TABLE IF NOT EXISTS TASKS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            title VARCHAR(128) NOT NULL,
            description TEXT NULL,
            expected_hours DECIMAL(10, 2) NULL,
            actual_hours DECIMAL(10, 2) NULL,
            cost DECIMAL(10, 2) NULL,
            charge DECIMAL(10, 2) NULL,
            start_at DATETIME NULL,
            end_at DATETIME NULL,
            completed_on DATETIME NULL,
            state VARCHAR(32) NOT NULL DEFAULT 'backlog',
            priority VARCHAR(16) NOT NULL DEFAULT 'p3',
            blocked_reason VARCHAR(512) NULL,
            project_id INT NULL,
            assignee_user_id INT NULL,
            reviewer_user_id INT NULL,
            created_by_user_id INT NOT NULL,
            sprint_week_start DATE NULL,
            overdue_alert_sent_on DATETIME NULL,
            customer_invoice_id INT NULL,
            invoice_item_id INT NULL,
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
            CONSTRAINT fk_tasks_reviewer_user
                FOREIGN KEY (reviewer_user_id)
                REFERENCES USERS(id)
                ON DELETE SET NULL
                ON UPDATE CASCADE,
            CONSTRAINT fk_tasks_created_by_user
                FOREIGN KEY (created_by_user_id)
                REFERENCES USERS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE,
            CONSTRAINT fk_tasks_customer_invoice
                FOREIGN KEY (customer_invoice_id)
                REFERENCES CUSTOMER_INVOICES(id)
                ON DELETE SET NULL
                ON UPDATE CASCADE,
            CONSTRAINT fk_tasks_invoice_item
                FOREIGN KEY (invoice_item_id)
                REFERENCES INVOICE_ITEMS(id)
                ON DELETE SET NULL
                ON UPDATE CASCADE,
            INDEX idx_tasks_state (state),
            INDEX idx_tasks_assignee (assignee_user_id),
            INDEX idx_tasks_reviewer (reviewer_user_id),
            INDEX idx_tasks_project (project_id),
            INDEX idx_tasks_end_at (end_at),
            INDEX idx_tasks_sprint_week_start (sprint_week_start)
        )`,
        `UPDATE TASKS SET priority = CASE
            WHEN priority = 'high' THEN 'p1'
            WHEN priority = 'medium' THEN 'p3'
            WHEN priority = 'low' THEN 'p5'
            WHEN priority IN ('p1', 'p2', 'p3', 'p4', 'p5') THEN priority
            ELSE 'p3'
        END`,
        `ALTER TABLE TASKS MODIFY COLUMN priority VARCHAR(16) NOT NULL DEFAULT 'p3'`,
        `ALTER TABLE TASKS ADD COLUMN overdue_alert_sent_on DATETIME NULL`,
        `CREATE TABLE IF NOT EXISTS TASK_EFFORTS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            task_id INT NOT NULL,
            user_id INT NOT NULL,
            hours DECIMAL(10, 2) NOT NULL,
            hourly_rate DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
            charge DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
            note VARCHAR(512) NULL,
            created_by_user_id INT NOT NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_task_efforts_task
                FOREIGN KEY (task_id)
                REFERENCES TASKS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE,
            CONSTRAINT fk_task_efforts_user
                FOREIGN KEY (user_id)
                REFERENCES USERS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE,
            CONSTRAINT fk_task_efforts_created_by_user
                FOREIGN KEY (created_by_user_id)
                REFERENCES USERS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE,
            INDEX idx_task_efforts_task (task_id)
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
        `CREATE TABLE IF NOT EXISTS LEAD_SOURCES (
            id INT AUTO_INCREMENT PRIMARY KEY,
            title VARCHAR(128) NOT NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_lead_source_title (title)
        )`,
        `CREATE TABLE IF NOT EXISTS LEADS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            full_name VARCHAR(128) NOT NULL,
            website VARCHAR(255) NULL,
            organization VARCHAR(128) NULL,
            designation VARCHAR(128) NULL,
            location VARCHAR(128) NULL,
            refer_by VARCHAR(128) NULL,
            targeted_for VARCHAR(255) NULL,
            source_id INT NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_leads_created_on (created_on),
            INDEX idx_leads_organization (organization),
            INDEX idx_leads_source_id (source_id),
            CONSTRAINT fk_leads_source
                FOREIGN KEY (source_id)
                REFERENCES LEAD_SOURCES(id)
                ON DELETE SET NULL
                ON UPDATE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS LEAD_PHONES (
            id INT AUTO_INCREMENT PRIMARY KEY,
            lead_id INT NOT NULL,
            phone VARCHAR(32) NOT NULL,
            is_whatsapp BOOLEAN NOT NULL DEFAULT FALSE,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_lead_phone (lead_id, phone),
            CONSTRAINT fk_lead_phones_lead
                FOREIGN KEY (lead_id)
                REFERENCES LEADS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS LEAD_EMAILS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            lead_id INT NOT NULL,
            email VARCHAR(255) NOT NULL,
            kind VARCHAR(32) NOT NULL DEFAULT 'professional',
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_lead_email (lead_id, email),
            CONSTRAINT fk_lead_emails_lead
                FOREIGN KEY (lead_id)
                REFERENCES LEADS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS LEAD_NOTES (
            id INT AUTO_INCREMENT PRIMARY KEY,
            lead_id INT NOT NULL,
            user_id INT NOT NULL,
            note TEXT NOT NULL,
            media_id INT NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            CONSTRAINT fk_lead_notes_lead
                FOREIGN KEY (lead_id)
                REFERENCES LEADS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE,
            CONSTRAINT fk_lead_notes_user
                FOREIGN KEY (user_id)
                REFERENCES USERS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE,
            CONSTRAINT fk_lead_notes_media
                FOREIGN KEY (media_id)
                REFERENCES MEDIA(id)
                ON DELETE SET NULL
                ON UPDATE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS LEAD_COMMUNICATIONS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            lead_id INT NOT NULL,
            channel VARCHAR(32) NOT NULL,
            to_address VARCHAR(255) NOT NULL,
            from_address VARCHAR(255) NULL,
            subject VARCHAR(512) NULL,
            body TEXT NOT NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_lead_communications_lead_channel (lead_id, channel),
            CONSTRAINT fk_lead_communications_lead
                FOREIGN KEY (lead_id)
                REFERENCES LEADS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE
        )`,
        `INSERT IGNORE INTO SERVICES (title, description, cost) VALUES ('${CONSTANTS.SAAS.SERVICES.MAILER}', 'allows to send emails', 0.00);`,
        `INSERT IGNORE INTO SERVICES (title, description, cost) VALUES ('${CONSTANTS.SAAS.SERVICES.BUCKETIZER}', 'object storage uploads', 0.00);`,
        `INSERT IGNORE INTO USERS (full_name, email, personal_email, phone, super_admin) VALUES ('Admin', 'support@hammerbyte.co.in', 'support@hammerbyte.co.in', '0000000000', TRUE);`,
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
        `INSERT IGNORE INTO USER_ROLES (user_id, role_id)
            SELECT USERS.id, ROLES.id
            FROM USERS
            CROSS JOIN ROLES
            WHERE USERS.super_admin = TRUE;`,
        `CREATE TABLE IF NOT EXISTS ENTITY_COMMENTS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            entity_type VARCHAR(32) NOT NULL,
            entity_id INT NOT NULL,
            user_id INT NOT NULL,
            comment TEXT NOT NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_entity_comments_entity (entity_type, entity_id),
            CONSTRAINT fk_entity_comments_user
                FOREIGN KEY (user_id)
                REFERENCES USERS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE
        )`,
    ];

    for (const table of requiredTables) {
        try {
            await dbConnection.unsafe(table);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            // Ignore idempotent noise (duplicate keys/columns, or DROP of missing column/table).
            if (
                !/duplicate (foreign )?key|already exists|duplicate column|check that (column|table)|unknown (column|table)|doesn't exist|does not exist/i.test(
                    message,
                )
            ) {
                throw error;
            }
        }
    }
}
