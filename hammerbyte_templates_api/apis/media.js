import { HEADERS } from "../constants.js";

const { logger } = require("@hammerbyte/utils");

const SERVICE_MEDIA = process.env.SERVICE_MEDIA || "localhost:3000";

export async function getMediaById({ id, authentication_token }) {
	const url = `${SERVICE_MEDIA}/media/${id}`;

	try {
		const response = await fetch(url, {
			headers: {
				[HEADERS.AUTHENTICATION_TOKEN]: authentication_token,
			},
		});
		const content = Buffer.from(await response.arrayBuffer());
		const contentType =
			response.headers.get("Content-Type") || "application/octet-stream";
		const disposition = response.headers.get("Content-Disposition") || "";
		const filenameMatch = disposition.match(/filename="([^"]+)"/);
		return {
			content,
			contentType,
			filename: filenameMatch?.[1],
		};
	} catch (error) {
		logger.error(`getMediaById: ${error}`);
	}
}
