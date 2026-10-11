import { createUser, deleteUserById, getUserById, getUsersByIds, updateUserById } from "../entities/users.js";
import { ERRORS } from "../constants.js";

const { generator } = require("@hammerbyte/utils");

export async function getUsers({ query, set }) {
	const ids = generator.generateUniques({ values: query.ids });
	const users = await getUsersByIds({ ids });
	set.status = 200;
	return users;
}

export async function getUser({ params, set }) {
	const user = await getUserById(params);
	if (!user) {
		set.status = 404;
		return { error: ERRORS.USER_NOT_FOUND };
	}
	set.status = 200;
	return user;
}

export async function addUser({ body, user, set }) {
	const createdUser = await createUser({
		...body,
		email: body.email.trim().toLowerCase(),
		full_name: body.full_name.trim(),
		active: Object.hasOwn(body, "active") ? body.active : true,
		created_by: user.id,
		updated_by: user.id,
	});

	set.status = 201;
	return createdUser;
}

export async function updateUser({ params, body, user, set }) {
	const existingUser = await getUserById(params);
	if (!existingUser) {
		set.status = 404;
		return { error: ERRORS.USER_NOT_FOUND };
	}

	const userUpdate = { updated_by: user.id };

	if (body.email) {
		userUpdate.email = body.email.trim().toLowerCase();
	}
	if (body.full_name) {
		userUpdate.full_name = body.full_name.trim();
	}
	if (Object.hasOwn(body, "active")) {
		userUpdate.active = body.active;
	}

	await updateUserById({
		id: params.id,
		...userUpdate,
	});

	const updatedUser = await getUserById(params);
	set.status = 200;
	return updatedUser;
}

export async function deleteUser({ params, set }) {
	const existingUser = await getUserById(params);
	if (!existingUser) {
		set.status = 404;
		return { error: ERRORS.USER_NOT_FOUND };
	}

	deleteUserById(params);
	set.status = 204;
	return;
}
