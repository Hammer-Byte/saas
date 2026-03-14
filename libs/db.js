import { SQL } from "bun";
const { logger } = require("@hammerbyte/utils");

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
        `CREATE TABLE IF NOT EXISTS AUTHENTICATION_TOKENS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            otp VARCHAR(4) NOT NULL,
            token VARCHAR(36) NOT NULL UNIQUE,
            active BOOLEAN NOT NULL DEFAULT FALSE,
            validity DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL 24 HOUR),
            created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            CONSTRAINT fk_user
                FOREIGN KEY (user_id) 
                REFERENCES USERS(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE
          )`,
    ];

    for (const table of requiredTables) {
        await dbConnection.unsafe(table);
    }
}
