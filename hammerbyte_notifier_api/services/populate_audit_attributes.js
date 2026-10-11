import { getUserById, getUserByIds } from "../apis/users.js";

function isAuditUserId({ value }) {
	if (typeof value === "number") {
		return Number.isFinite(value) && value > 0;
	}
	if (typeof value === "string" && value.trim()) {
		const numericId = Number(value);
		return Number.isFinite(numericId) && numericId > 0;
	}
	return false;
}

function toAuditUserId({ value }) {
	if (!isAuditUserId({ value })) {
		return;
	}
	return Number(value);
}

export function collectAuditEntities({ value, auditEntities = [] }) {
	if (!value || typeof value !== "object") {
		return auditEntities;
	}

	if (Array.isArray(value)) {
		for (const nestedEntity of value) {
			collectAuditEntities({ value: nestedEntity, auditEntities });
		}
		return auditEntities;
	}

	const hasCreatedBy = Object.hasOwn(value, "created_by");
	const hasUpdatedBy = Object.hasOwn(value, "updated_by");
	if (hasCreatedBy || hasUpdatedBy) {
		const createdUnresolved =
			!hasCreatedBy || !value.created_by || isAuditUserId({ value: value.created_by });
		const updatedUnresolved =
			!hasUpdatedBy || !value.updated_by || isAuditUserId({ value: value.updated_by });
		if (createdUnresolved && updatedUnresolved) {
			auditEntities.push(value);
		}
	}

	for (const [key, child] of Object.entries(value)) {
		if (key === "created_by" || key === "updated_by" || key === "send_results") {
			continue;
		}
		collectAuditEntities({ value: child, auditEntities });
	}

	return auditEntities;
}

export async function populateAuditAttributes({ entity, authentication_token }) {
	if (!entity) {
		return entity;
	}

	const createdById = toAuditUserId({ value: entity.created_by });
	const updatedById = toAuditUserId({ value: entity.updated_by });

	if (createdById && updatedById && createdById === updatedById) {
		const user = await getUserById({ id: createdById, authentication_token });
		entity.created_by = user;
		entity.updated_by = user;
		return entity;
	}

	const [createdByUser, updatedByUser] = await Promise.all([
		createdById ? getUserById({ id: createdById, authentication_token }) : undefined,
		updatedById ? getUserById({ id: updatedById, authentication_token }) : undefined,
	]);

	entity.created_by = createdByUser;
	entity.updated_by = updatedByUser;
	return entity;
}

export async function populateAuditAttributesList({ entities, authentication_token }) {
	if (!entities?.length) {
		return entities;
	}

	const ids = [];
	const seen = new Set();
	for (const entity of entities) {
		for (const rawId of [entity.created_by, entity.updated_by]) {
			const id = toAuditUserId({ value: rawId });
			if (id && !seen.has(id)) {
				seen.add(id);
				ids.push(id);
			}
		}
	}

	const users = await getUserByIds({ ids, authentication_token });
	const usersById = new Map((users || []).map((user) => [user.id, user]));

	for (const entity of entities) {
		const createdById = toAuditUserId({ value: entity.created_by });
		const updatedById = toAuditUserId({ value: entity.updated_by });
		entity.created_by = createdById ? usersById.get(createdById) : undefined;
		entity.updated_by = updatedById ? usersById.get(updatedById) : undefined;
	}

	return entities;
}

export async function populateAuditAttributesDeep({ value, authentication_token }) {
	const auditEntities = collectAuditEntities({ value });
	if (!auditEntities.length) {
		return value;
	}
	if (auditEntities.length === 1) {
		await populateAuditAttributes({
			entity: auditEntities[0],
			authentication_token,
		});
		return value;
	}
	await populateAuditAttributesList({ entities: auditEntities, authentication_token });
	return value;
}
