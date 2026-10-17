import { SQL } from "bun";
// lints/db requires readFileSync for executeDBSeeders; lints/files bans node:fs — scoped override
// eslint-disable-next-line lints/files -- required by lints/db seeder contract
import { readFileSync } from "node:fs";
import { join } from "node:path";

const { logger } = require("@hammerbyte/utils");

const tables = [
	`
	CREATE TABLE IF NOT EXISTS EMAIL_BATCHES (
		id INT AUTO_INCREMENT PRIMARY KEY,
		\`interval\` INT NOT NULL DEFAULT 0,
		active BOOLEAN NOT NULL DEFAULT TRUE,
		created_by INT NULL DEFAULT NULL,
		updated_by INT NULL DEFAULT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
			ON UPDATE CURRENT_TIMESTAMP
	)
	`,
	`
	CREATE TABLE IF NOT EXISTS EMAILS (
		id INT AUTO_INCREMENT PRIMARY KEY,
		batch_id INT NOT NULL DEFAULT 0,
		subject VARCHAR(256) NOT NULL DEFAULT '',
		html TEXT NOT NULL,
		sent BOOLEAN NOT NULL DEFAULT FALSE,
		created_by INT NULL DEFAULT NULL,
		updated_by INT NULL DEFAULT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
			ON UPDATE CURRENT_TIMESTAMP,
		FOREIGN KEY (batch_id) REFERENCES EMAIL_BATCHES(id) ON DELETE CASCADE
	)
	`,
	`
	CREATE TABLE IF NOT EXISTS EMAIL_ATTACHMENTS (
		id INT AUTO_INCREMENT PRIMARY KEY,
		email_id INT NOT NULL DEFAULT 0,
		media_id INT NOT NULL DEFAULT 0,
		name VARCHAR(256) NOT NULL DEFAULT '',
		created_by INT NULL DEFAULT NULL,
		updated_by INT NULL DEFAULT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
			ON UPDATE CURRENT_TIMESTAMP,
		FOREIGN KEY (email_id) REFERENCES EMAILS(id) ON DELETE CASCADE
	)
	`,
	`
	CREATE TABLE IF NOT EXISTS EMAIL_RECIPIENTS (
		id INT AUTO_INCREMENT PRIMARY KEY,
		email_id INT NOT NULL DEFAULT 0,
		recipient VARCHAR(256) NOT NULL DEFAULT '',
		created_by INT NULL DEFAULT NULL,
		updated_by INT NULL DEFAULT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
			ON UPDATE CURRENT_TIMESTAMP,
		FOREIGN KEY (email_id) REFERENCES EMAILS(id) ON DELETE CASCADE
	)
	`,
	`
	CREATE TABLE IF NOT EXISTS EMAIL_CCS (
		id INT AUTO_INCREMENT PRIMARY KEY,
		email_id INT NOT NULL DEFAULT 0,
		cc VARCHAR(256) NOT NULL DEFAULT '',
		created_by INT NULL DEFAULT NULL,
		updated_by INT NULL DEFAULT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
			ON UPDATE CURRENT_TIMESTAMP,
		FOREIGN KEY (email_id) REFERENCES EMAILS(id) ON DELETE CASCADE
	)
	`,
	`
	CREATE TABLE IF NOT EXISTS EMAIL_BCCS (
		id INT AUTO_INCREMENT PRIMARY KEY,
		email_id INT NOT NULL DEFAULT 0,
		bcc VARCHAR(256) NOT NULL DEFAULT '',
		created_by INT NULL DEFAULT NULL,
		updated_by INT NULL DEFAULT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
			ON UPDATE CURRENT_TIMESTAMP,
		FOREIGN KEY (email_id) REFERENCES EMAILS(id) ON DELETE CASCADE
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
