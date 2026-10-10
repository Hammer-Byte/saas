import { SQL } from "bun";
// lints/db requires readFileSync for executeDBSeeders; lints/files bans node:fs — scoped override
// eslint-disable-next-line lints/files -- required by lints/db seeder contract
import { readFileSync } from "node:fs";
import { join } from "node:path";

const { logger } = require("@hammerbyte/utils");

const tables = [
	`
	CREATE TABLE IF NOT EXISTS PROJECTS (
		id INT AUTO_INCREMENT PRIMARY KEY,
		title VARCHAR(128) NOT NULL DEFAULT '',
		description VARCHAR(2048) NOT NULL DEFAULT '',
		active BOOLEAN NOT NULL DEFAULT TRUE,
		created_by INT NULL DEFAULT NULL,
		updated_by INT NULL DEFAULT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
			ON UPDATE CURRENT_TIMESTAMP
	)
	`,
	`
	CREATE TABLE IF NOT EXISTS PROJECT_USERS (
		id INT AUTO_INCREMENT PRIMARY KEY,
		project_id INT NOT NULL DEFAULT 0,
		user_id INT NOT NULL DEFAULT 0,
		active BOOLEAN NOT NULL DEFAULT TRUE,
		created_by INT NULL DEFAULT NULL,
		updated_by INT NULL DEFAULT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
			ON UPDATE CURRENT_TIMESTAMP,
		UNIQUE KEY unique_project_user (project_id, user_id),
		FOREIGN KEY (project_id) REFERENCES PROJECTS(id) ON DELETE CASCADE
	)
	`,
	`
	CREATE TABLE IF NOT EXISTS PROJECT_DIRECTORIES (
		id INT AUTO_INCREMENT PRIMARY KEY,
		project_id INT NOT NULL DEFAULT 0,
		parent_id INT NULL DEFAULT NULL,
		title VARCHAR(128) NOT NULL DEFAULT '',
		created_by INT NULL DEFAULT NULL,
		updated_by INT NULL DEFAULT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
			ON UPDATE CURRENT_TIMESTAMP,
		UNIQUE KEY unique_project_directory_title (project_id, parent_id, title),
		FOREIGN KEY (project_id) REFERENCES PROJECTS(id) ON DELETE CASCADE,
		FOREIGN KEY (parent_id) REFERENCES PROJECT_DIRECTORIES(id) ON DELETE CASCADE
	)
	`,
	`
	CREATE TABLE IF NOT EXISTS DIRECTORY_DOCUMENTS (
		id INT AUTO_INCREMENT PRIMARY KEY,
		project_directory_id INT NOT NULL DEFAULT 0,
		title VARCHAR(255) NOT NULL DEFAULT '',
		stored_name VARCHAR(255) NOT NULL DEFAULT '',
		mime_type VARCHAR(128) NOT NULL DEFAULT '',
		size_bytes BIGINT NOT NULL DEFAULT 0,
		created_by INT NULL DEFAULT NULL,
		updated_by INT NULL DEFAULT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
			ON UPDATE CURRENT_TIMESTAMP,
		UNIQUE KEY unique_directory_stored_name (project_directory_id, stored_name),
		FOREIGN KEY (project_directory_id) REFERENCES PROJECT_DIRECTORIES(id) ON DELETE CASCADE
	)
	`,
	`
	CREATE TABLE IF NOT EXISTS PROJECT_APPLICATIONS (
		id INT AUTO_INCREMENT PRIMARY KEY,
		project_id INT NOT NULL DEFAULT 0,
		title VARCHAR(128) NOT NULL DEFAULT '',
		description VARCHAR(2048) NOT NULL DEFAULT '',
		url VARCHAR(512) NOT NULL DEFAULT '',
		active BOOLEAN NOT NULL DEFAULT TRUE,
		created_by INT NULL DEFAULT NULL,
		updated_by INT NULL DEFAULT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
			ON UPDATE CURRENT_TIMESTAMP,
		FOREIGN KEY (project_id) REFERENCES PROJECTS(id) ON DELETE CASCADE
	)
	`,
	`
	CREATE TABLE IF NOT EXISTS PROJECT_INVOICES (
		id INT AUTO_INCREMENT PRIMARY KEY,
		project_id INT NOT NULL DEFAULT 0,
		title VARCHAR(128) NOT NULL DEFAULT '',
		notes VARCHAR(2048) NOT NULL DEFAULT '',
		issued_at DATETIME NOT NULL,
		due_at DATETIME NULL DEFAULT NULL,
		active BOOLEAN NOT NULL DEFAULT TRUE,
		created_by INT NULL DEFAULT NULL,
		updated_by INT NULL DEFAULT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
			ON UPDATE CURRENT_TIMESTAMP,
		FOREIGN KEY (project_id) REFERENCES PROJECTS(id) ON DELETE CASCADE
	)
	`,
	`
	CREATE TABLE IF NOT EXISTS INVOICE_ITEMS (
		id INT AUTO_INCREMENT PRIMARY KEY,
		project_invoice_id INT NOT NULL DEFAULT 0,
		title VARCHAR(128) NOT NULL DEFAULT '',
		description VARCHAR(2048) NOT NULL DEFAULT '',
		quantity DECIMAL(12,2) NOT NULL DEFAULT 1,
		unit_price DECIMAL(12,2) NOT NULL DEFAULT 0,
		created_by INT NULL DEFAULT NULL,
		updated_by INT NULL DEFAULT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
			ON UPDATE CURRENT_TIMESTAMP,
		FOREIGN KEY (project_invoice_id) REFERENCES PROJECT_INVOICES(id) ON DELETE CASCADE
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
	for (const table of [...tables]) {
		await dbConnection.unsafe(table);
	}
}

export async function executeDBSeeders({ seeders }) {
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
}
