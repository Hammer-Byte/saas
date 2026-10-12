import { SQL } from "bun";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const { logger } = require("@hammerbyte/utils");

const tables = [
	`
	CREATE TABLE IF NOT EXISTS MEDIA (
		id INT AUTO_INCREMENT PRIMARY KEY,
		name VARCHAR(256) NOT NULL DEFAULT '',
		file VARCHAR(512) NOT NULL DEFAULT '',
		private BOOLEAN NOT NULL DEFAULT FALSE,
		created_by INT NULL DEFAULT NULL,
		updated_by INT NULL DEFAULT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
			ON UPDATE CURRENT_TIMESTAMP
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

