import { SQL } from "bun";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const { logger } = require("@hammerbyte/utils");

const tables = [
	`
	CREATE TABLE IF NOT EXISTS TASK_STATUSES (
		id INT AUTO_INCREMENT PRIMARY KEY,
		title VARCHAR(72) NOT NULL DEFAULT '',
		created_by INT NULL DEFAULT NULL,
		updated_by INT NULL DEFAULT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
			ON UPDATE CURRENT_TIMESTAMP,
		UNIQUE KEY unique_task_status_title (title)
	)
	`,
	`
	CREATE TABLE IF NOT EXISTS TASK_PRIORITIES (
		id INT AUTO_INCREMENT PRIMARY KEY,
		title VARCHAR(72) NOT NULL DEFAULT '',
		created_by INT NULL DEFAULT NULL,
		updated_by INT NULL DEFAULT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
			ON UPDATE CURRENT_TIMESTAMP,
		UNIQUE KEY unique_task_priority_title (title)
	)
	`,
	`
	CREATE TABLE IF NOT EXISTS TASKS (
		id INT AUTO_INCREMENT PRIMARY KEY,
		title VARCHAR(128) NOT NULL DEFAULT '',
		description VARCHAR(2048) NOT NULL DEFAULT '',
		status_id INT NOT NULL DEFAULT 1,
		priority_id INT NOT NULL DEFAULT 1,
		due_at DATETIME NOT NULL,
		handler_id INT NULL DEFAULT NULL,
		created_by INT NULL DEFAULT NULL,
		updated_by INT NULL DEFAULT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
			ON UPDATE CURRENT_TIMESTAMP
	)
	`,
	`
	CREATE TABLE IF NOT EXISTS TASK_ATTACHMENTS (
		id INT AUTO_INCREMENT PRIMARY KEY,
		task_id INT NOT NULL DEFAULT 0,
		media_id INT NOT NULL DEFAULT 0,
		created_by INT NULL DEFAULT NULL,
		updated_by INT NULL DEFAULT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
			ON UPDATE CURRENT_TIMESTAMP,
		UNIQUE KEY unique_task_media (task_id, media_id),
		FOREIGN KEY (task_id) REFERENCES TASKS(id) ON DELETE CASCADE
	)
	`,
	`
	CREATE TABLE IF NOT EXISTS TASK_COMMENTS (
		id INT AUTO_INCREMENT PRIMARY KEY,
		task_id INT NOT NULL DEFAULT 0,
		comment VARCHAR(2048) NOT NULL DEFAULT '',
		created_by INT NULL DEFAULT NULL,
		updated_by INT NULL DEFAULT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
			ON UPDATE CURRENT_TIMESTAMP,
		FOREIGN KEY (task_id) REFERENCES TASKS(id) ON DELETE CASCADE
	)
	`,
	`
	CREATE TABLE IF NOT EXISTS TASK_COMMENT_ATTACHMENTS (
		id INT AUTO_INCREMENT PRIMARY KEY,
		task_comment_id INT NOT NULL DEFAULT 0,
		media_id INT NOT NULL DEFAULT 0,
		created_by INT NULL DEFAULT NULL,
		updated_by INT NULL DEFAULT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
			ON UPDATE CURRENT_TIMESTAMP,
		UNIQUE KEY unique_task_comment_media (task_comment_id, media_id),
		FOREIGN KEY (task_comment_id) REFERENCES TASK_COMMENTS(id) ON DELETE CASCADE
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
