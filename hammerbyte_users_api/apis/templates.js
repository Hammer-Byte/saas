import { HEADERS } from "../constants.js";

const { logger } = require("@hammerbyte/utils");

const SERVICE_TEMPLATES = process.env.SERVICE_TEMPLATES || "localhost:3000";

export async function getInjectedTemplate({ id, injects, authentication_token }) {
	const url = `${SERVICE_TEMPLATES}/templates/${id}/injected`;

	try {
		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				[HEADERS.AUTHENTICATION_TOKEN]: authentication_token,
			},
			body: JSON.stringify({ injects }),
		});
		if (response.status === 200) {
			return await response.json();
		}
	} catch (error) {
		logger.error(`getInjectedTemplate: ${error}`);
	}
}
