import { getAllConfigs as getAllConfigRows } from "../entities/configs.js";

export async function getConfigs({ set }) {
	set.status = 200;

	const rows = (await getAllConfigRows()) ?? [];
	const configs = Object.fromEntries(rows.map(({ key, value }) => [key, value]));

	if (configs.maintenance !== undefined) {
		configs.maintenance = configs.maintenance === "true";
	}

	return configs;
}
