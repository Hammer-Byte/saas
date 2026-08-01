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
        `CREATE TABLE IF NOT EXISTS APPLICATIONS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            title VARCHAR(56) NOT NULL UNIQUE,
            token CHAR(16) NOT NULL DEFAULT (HEX(RANDOM_BYTES(8))),
            active BOOLEAN NOT NULL DEFAULT TRUE,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
          )`,
        `CREATE TABLE IF NOT EXISTS USERS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            application_id INT NOT NULL,
            email VARCHAR(48) NOT NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY unique_application_email (application_id, email),
            CONSTRAINT fk_application 
                FOREIGN KEY (application_id) 
                REFERENCES APPLICATIONS(id)
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
        `CREATE TABLE IF NOT EXISTS INQUIRIES (
            id INT AUTO_INCREMENT PRIMARY KEY,
            full_name VARCHAR(128) NOT NULL,
            phone VARCHAR(13) NOT NULL,
            email VARCHAR(255) NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS APPLICATION_INVOICES (
            id INT AUTO_INCREMENT PRIMARY KEY,
            application_id INT NOT NULL,
            due_date DATE NOT NULL DEFAULT ((CURRENT_DATE + INTERVAL 7 DAY)),
            total DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
            gst DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            CONSTRAINT fk_application_invoices_application
                FOREIGN KEY (application_id)
                REFERENCES APPLICATIONS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS INVOICE_ITEMS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            invoice_id INT NOT NULL,
            item VARCHAR(128) NOT NULL,
            cost DECIMAL(10, 2) NOT NULL,
            quantity DECIMAL(10, 2) NOT NULL DEFAULT 1.00,
            amount DECIMAL(10, 2) GENERATED ALWAYS AS (ROUND(cost * quantity, 2)) STORED,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            CONSTRAINT fk_invoice_items_invoice
                FOREIGN KEY (invoice_id)
                REFERENCES APPLICATION_INVOICES(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS INVOICE_PAYMENTS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            invoice_id INT NOT NULL,
            amount DECIMAL(10, 2) NOT NULL,
            gst DECIMAL(10, 2) GENERATED ALWAYS AS (ROUND(amount * 0.18, 2)) STORED,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            CONSTRAINT fk_invoice_payments_invoice
                FOREIGN KEY (invoice_id)
                REFERENCES APPLICATION_INVOICES(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS APPLICATION_CUSTOMER (
            id INT AUTO_INCREMENT PRIMARY KEY,
            application_id INT NOT NULL,
            full_name VARCHAR(128) NOT NULL,
            company VARCHAR(128) NOT NULL,
            pan_gst VARCHAR(32) NOT NULL,
            hsn VARCHAR(16) NOT NULL,
            address VARCHAR(512) NOT NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY unique_application_customer (application_id),
            CONSTRAINT fk_application_customer_application
                FOREIGN KEY (application_id)
                REFERENCES APPLICATIONS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS CUSTOMER_EMAILS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            application_customer_id INT NOT NULL,
            email VARCHAR(255) NOT NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY unique_customer_email (application_customer_id, email),
            CONSTRAINT fk_customer_emails_customer
                FOREIGN KEY (application_customer_id)
                REFERENCES APPLICATION_CUSTOMER(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS CUSTOMER_PHONES (
            id INT AUTO_INCREMENT PRIMARY KEY,
            application_customer_id INT NOT NULL,
            phone VARCHAR(13) NOT NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY unique_customer_phone (application_customer_id, phone),
            CONSTRAINT fk_customer_phones_customer
                FOREIGN KEY (application_customer_id)
                REFERENCES APPLICATION_CUSTOMER(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE
        )`,

        `INSERT IGNORE INTO SERVICES (title, description) VALUES ('${CONSTANTS.SAAS.SERVICES.MAILER}', 'allows to send emails');`,
        `INSERT IGNORE INTO SERVICES (title, description) VALUES ('${CONSTANTS.SAAS.SERVICES.BUCKETIZER}', 'object storage uploads');`
    ];

    for (const table of requiredTables) {
        await dbConnection.unsafe(table);
    }
}
