import { SQL } from "bun";

export const dbConnection = new SQL({
    adapter: Bun.env.MYSQL_DIALECT,
    hostname: Bun.env.MYSQL_HOST,
    port: Bun.env.MYSQL_PORT,
    database: Bun.env.MYSQL_DB,
    username: Bun.env.MYSQL_USERNAME,
    password: Bun.env.MYSQL_PASSWORD,
});

export async function generateDBTables() {
    const requiredTables = [
        `CREATE TABLE IF NOT EXISTS USERS (
            id INT AUTO_INCREMENT PRIMARY KEY,
            full_name VARCHAR(36) NULL,
            email VARCHAR(48) NOT NULL UNIQUE
          )`,
    ];

    for (const table of requiredTables) {
        await dbConnection.unsafe(table);
    }
}
