import { getUserById } from "../entities/users.js";

async function injectEntityAudit({ entity }) {
	const [createdBy, updatedBy] = await Promise.all([
		getUserById({ id: entity.created_by }),
		getUserById({ id: entity.updated_by }),
	]);

	return {
		...entity,
		created_by: createdBy,
		updated_by: updatedBy,
	};
}

export async function addEntityAudit({ body, set }) {
	set.status = 200;
	return await injectEntityAudit({ entity: body });
}

export async function addEntitiesBatchAudit({ body, set }) {
	set.status = 200;
	return await Promise.all(body.map((entity) => injectEntityAudit({ entity })));
}
