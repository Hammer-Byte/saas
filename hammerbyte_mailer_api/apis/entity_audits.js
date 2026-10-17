import { HEADERS } from "../constants.js";

const { logger } = require("@hammerbyte/utils");

const SERVICE_USERS = process.env.SERVICE_USERS || "localhost:3000";

export async function getEntityAudit({ entity, authentication_token }) {
	const url = `${SERVICE_USERS}/entity-audits`;

	try {
		const response = await fetch(url, {
			method: "PATCH",
			headers: {
				"Content-Type": "application/json",
				[HEADERS.AUTHENTICATION_TOKEN]: authentication_token,
			},
			body: JSON.stringify(entity),
		});
		if (response.status === 200) {
			return await response.json();
		}
		throw new Error(`getEntityAudit: ${response.statusText}`);
	} catch (error) {
		logger.error(`getEntityAudit: ${error}`);
		return entity;
	}
}

export async function getEntitiesBatchAudit({ entities, authentication_token }) {
	const url = `${SERVICE_USERS}/entity-audits/batch`;

	try {
		const response = await fetch(url, {
			method: "PATCH",
			headers: {
				"Content-Type": "application/json",
				[HEADERS.AUTHENTICATION_TOKEN]: authentication_token,
			},
			body: JSON.stringify(entities),
		});
		if (response.status === 200) {
			return await response.json();
		}
		throw new Error(`getEntitiesBatchAudit: ${response.statusText}`);
	} catch (error) {
		logger.error(`getEntitiesBatchAudit: ${error}`);
		return entities;
	}
}
