import { SQL } from "bun";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const { logger } = require("@hammerbyte/utils");

const tables = [
	`
	CREATE TABLE IF NOT EXISTS ROLES (
		id INT AUTO_INCREMENT PRIMARY KEY,
		title VARCHAR(72) NOT NULL DEFAULT '',
		active BOOLEAN NOT NULL DEFAULT TRUE,
		created_by INT NULL DEFAULT NULL,
		updated_by INT NULL DEFAULT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
			ON UPDATE CURRENT_TIMESTAMP,
		UNIQUE KEY unique_role_title (title)
	)
	`,
	`
	CREATE TABLE IF NOT EXISTS AUTHORITIES (
		id INT AUTO_INCREMENT PRIMARY KEY,
		title VARCHAR(72) NOT NULL DEFAULT '',
		description VARCHAR(128) NOT NULL DEFAULT '',
		created_by INT NULL DEFAULT NULL,
		updated_by INT NULL DEFAULT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
			ON UPDATE CURRENT_TIMESTAMP,
		UNIQUE KEY unique_authority_title (title)
	)
	`,
	`
	CREATE TABLE IF NOT EXISTS ROLE_AUTHORITIES (
		id INT AUTO_INCREMENT PRIMARY KEY,
		role_id INT NOT NULL DEFAULT 0,
		authority_id INT NOT NULL DEFAULT 0,
		created_by INT NULL DEFAULT NULL,
		updated_by INT NULL DEFAULT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
			ON UPDATE CURRENT_TIMESTAMP,
		UNIQUE KEY unique_role_authority (role_id, authority_id),
		FOREIGN KEY (role_id) REFERENCES ROLES(id) ON DELETE CASCADE,
		FOREIGN KEY (authority_id) REFERENCES AUTHORITIES(id) ON DELETE CASCADE
	)
	`,
];

export const dbConnection = new SQL({
	adapter: Bun.env.MYSQL_DIALECT,
	hostname: Bun.env.MYSQL_HOST,
	port: Bun.env.MYSQL_PORT,
	database: Bun.env.MYSQL_DB,
	username: Bun.env.MYSQL_USERNAME,
	password: Bun.env.MYSQL_PASSWORD,
	tls: false,
	max: 1,
	onconnect: () => {
		logger.success("Connected to MySQL DataBase");
	},
	onclose: (_client, error) => {
		if (error) {
			logger.error(`MySQL connection error ${error}`);
		} else {
			logger.info("MySQL connection closed");
		}
	},
});

export const executeSQLQuery = async ({ queryFunction }) => {
	try {
		return await queryFunction(dbConnection);
	} catch (exception) {
		logger.error(exception);
		throw exception;
	}
};

/** Format an ISO/Date value as local wall-clock MySQL DATETIME (matches CURRENT_TIMESTAMP). */
export function prepareSQLDateTime({ value }) {
	const date = value instanceof Date ? value : new Date(value);
	return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()} ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`;
}

export async function generateDBTables() {
	try {
		for (const table of [...tables]) {
			await dbConnection.unsafe(table);
		}
	} catch (exception) {
		logger.error(exception);
		throw exception;
	}
}

export async function executeDBSeeders({ seeders }) {
	try {
		for (const seeder of seeders) {
			const seederQueries = readFileSync(
				join(process.cwd(), "entities", "seeders", seeder),
				"utf8",
			);
			const dbQueries = seederQueries
				.split(";")
				.map((query) => query.trim())
				.filter(Boolean);

			for (const query of dbQueries) {
				await dbConnection.unsafe(`${query};`);
			}
		}

		logger.success("Database seeded...");
	} catch (exception) {
		logger.error(exception);
		throw exception;
	}
}
