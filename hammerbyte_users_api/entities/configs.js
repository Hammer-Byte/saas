import { executeSQLQuery } from "../libs/db.js";

const { logger } = require("@hammerbyte/utils");

export async function createConfig({ key, value, created_by = null, updated_by = null }) {
	const config = {
		key,
		value: String(value),
		created_by,
		updated_by,
	};

	return await executeSQLQuery({
		queryFunction: (sql) => sql`INSERT INTO CONFIGS ${sql(config)}`,
	})
		.then(() => getConfigByKey({ key }))
		.catch((error) => logger.error(`createConfig: ${error}`));
}

export async function getConfigByKey({ key }) {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`SELECT * FROM CONFIGS WHERE \`key\` = ${key}`,
	})
		.then((configs) => configs[0])
		.catch((error) => logger.error(`getConfigByKey: ${error}`));
}

export async function getAllConfigs() {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`SELECT * FROM CONFIGS ORDER BY \`key\` ASC`,
	}).catch((error) => logger.error(`getAllConfigs: ${error}`));
}

export async function updateConfigByKey({ key, ...config }) {
	if (Object.hasOwn(config, "value")) {
		config.value = String(config.value);
	}

	await executeSQLQuery({
		queryFunction: (sql) => sql`UPDATE CONFIGS SET ${sql(config)} WHERE \`key\` = ${key}`,
	}).catch((error) => logger.error(`updateConfigByKey: ${error}`));
}

export async function deleteConfigByKey({ key }) {
	await executeSQLQuery({
		queryFunction: (sql) => sql`DELETE FROM CONFIGS WHERE \`key\` = ${key}`,
	}).catch((error) => logger.error(`deleteConfigByKey: ${error}`));
}
