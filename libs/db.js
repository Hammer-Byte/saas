import { SQL } from "bun";
import { logger, CONSTANTS } from "@hammerbyte/utils";

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

export async function executeSQLQuery(queryFunction) {
    return await queryFunction(dbConnection);
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
            full_name VARCHAR(128) NOT NULL,
            phone VARCHAR(13) NOT NULL,
            email VARCHAR(255) NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS CUSTOMER_INVOICES (
            id INT AUTO_INCREMENT PRIMARY KEY,
            customer_id INT NOT NULL,
            project_id INT NOT NULL,
            due_date DATE NOT NULL DEFAULT ((CURRENT_DATE + INTERVAL 7 DAY)),
            total DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
            gst DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
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
        `CREATE TABLE IF NOT EXISTS EXTERNAL_CONTRACTS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            company VARCHAR(128) NULL,
            full_name VARCHAR(128) NOT NULL,
            email VARCHAR(255) NOT NULL,
            phone VARCHAR(13) NOT NULL,
            address VARCHAR(512) NOT NULL,
            signing_code VARCHAR(8) NOT NULL,
            active BOOLEAN NOT NULL DEFAULT TRUE,
            signable_till DATETIME NOT NULL,
            signature INT NULL,
            selfie INT NULL,
            identity INT NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            CONSTRAINT fk_external_contracts_signature_media
                FOREIGN KEY (signature)
                REFERENCES MEDIA(id)
                ON DELETE RESTRICT
                ON UPDATE CASCADE,
            CONSTRAINT fk_external_contracts_selfie_media
                FOREIGN KEY (selfie)
                REFERENCES MEDIA(id)
                ON DELETE RESTRICT
                ON UPDATE CASCADE,
            CONSTRAINT fk_external_contracts_identity_media
                FOREIGN KEY (identity)
                REFERENCES MEDIA(id)
                ON DELETE RESTRICT
                ON UPDATE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS CONTRACT_CLAUSES (
            id INT AUTO_INCREMENT PRIMARY KEY,
            external_contract_id INT NOT NULL,
            title VARCHAR(128) NOT NULL,
            view_index INT NOT NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_contract_clauses_external_contract
                FOREIGN KEY (external_contract_id)
                REFERENCES EXTERNAL_CONTRACTS(id)
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

        `INSERT IGNORE INTO SERVICES (title, description, cost) VALUES ('${CONSTANTS.SAAS.SERVICES.MAILER}', 'allows to send emails', 0.00);`,
        `INSERT IGNORE INTO SERVICES (title, description, cost) VALUES ('${CONSTANTS.SAAS.SERVICES.BUCKETIZER}', 'object storage uploads', 0.00);`,
        `INSERT IGNORE INTO USERS (full_name, email) VALUES ('Admin', 'support@hammerbyte.co.in');`,
    ];

    for (const table of requiredTables) {
        await dbConnection.unsafe(table);
    }
}
