import { SQL } from "bun";
// lints/db requires readFileSync for executeDBSeeders; lints/files bans node:fs — scoped override
// eslint-disable-next-line lints/files -- required by lints/db seeder contract
import { readFileSync } from "node:fs";
import { join } from "node:path";

const { logger } = require("@hammerbyte/utils");

const tables = [
	`
	CREATE TABLE IF NOT EXISTS EMAIL_TEMPLATES (
		id INT AUTO_INCREMENT PRIMARY KEY,
		title VARCHAR(128) NOT NULL DEFAULT '',
		file VARCHAR(512) NOT NULL DEFAULT '',
		created_by INT NULL DEFAULT NULL,
		updated_by INT NULL DEFAULT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
			ON UPDATE CURRENT_TIMESTAMP,
		UNIQUE KEY unique_email_template_title (title)
	)
	`,
	`
	CREATE TABLE IF NOT EXISTS PLACE_HOLDERS (
		id INT AUTO_INCREMENT PRIMARY KEY,
		template_id INT NOT NULL DEFAULT 0,
		place_holder VARCHAR(72) NOT NULL DEFAULT '',
		created_by INT NULL DEFAULT NULL,
		updated_by INT NULL DEFAULT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
			ON UPDATE CURRENT_TIMESTAMP,
		UNIQUE KEY unique_place_holder (template_id, place_holder),
		FOREIGN KEY (template_id) REFERENCES EMAIL_TEMPLATES(id) ON DELETE CASCADE
	)
	`,
	`
	CREATE TABLE IF NOT EXISTS EMAIL_BATCHES (
		id INT AUTO_INCREMENT PRIMARY KEY,
		\`interval\` INT NOT NULL DEFAULT 0,
		template_id INT NOT NULL DEFAULT 0,
		active BOOLEAN NOT NULL DEFAULT TRUE,
		created_by INT NULL DEFAULT NULL,
		updated_by INT NULL DEFAULT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
			ON UPDATE CURRENT_TIMESTAMP,
		FOREIGN KEY (template_id) REFERENCES EMAIL_TEMPLATES(id)
	)
	`,
	`
	CREATE TABLE IF NOT EXISTS EMAILS (
		id INT AUTO_INCREMENT PRIMARY KEY,
		batch_id INT NOT NULL DEFAULT 0,
		subject VARCHAR(256) NOT NULL DEFAULT '',
		inject TEXT NOT NULL DEFAULT ('{}'),
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
		file VARCHAR(512) NOT NULL DEFAULT '',
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
