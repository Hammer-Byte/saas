import { SQL } from "bun";
const { logger } = require("@hammerbyte/utils");
const { SAAS } = require("@hammerbyte/utils");

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
            unit_cost FLOAT NOT NULL DEFAULT 0,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY unique_user_application (application_id,service_id)
          )`,
        `CREATE TABLE IF NOT EXISTS MAILER_MESSAGES (
            id INT AUTO_INCREMENT PRIMARY KEY,
            recipient VARCHAR(255) NOT NULL,
            subject VARCHAR(512) NOT NULL,
            body TEXT NOT NULL,
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,

        `INSERT IGNORE INTO SERVICES (title, description) VALUES ('${SAAS.SERVICES.MAILER}', 'allows to send emails');`,
        `INSERT IGNORE INTO SERVICES (title, description) VALUES ('${SAAS.SERVICES.BUCKETIZER}', 'object storage uploads');`
    ];

    for (const table of requiredTables) {
        await dbConnection.unsafe(table);
    }
}
