import {
	createUser,
	deleteUserById,
	getAllUsers,
	getUserById,
	updateUserById,
} from "../entities/users.js";
import { ERRORS } from "../constants.js";

function publicUser({ user }) {
	if (!user) {
		return;
	}

	const { password, ...safeUser } = user;
	void password;
	return safeUser;
}

export async function getUsers({ set }) {
	const users = await getAllUsers();
	set.status = 200;
	return users.map((user) => publicUser({ user }));
}

export async function getUser({ params, set }) {
	const user = await getUserById(params);
	if (!user) {
		set.status = 404;
		return { error: ERRORS.USER_NOT_FOUND };
	}
	set.status = 200;
	return publicUser({ user });
}

export async function addUser({ body, user, set }) {
	const password = await Bun.password.hash(body.password);

	const createdUser = await createUser({
		...body,
		email: body.email.trim().toLowerCase(),
		password,
		full_name: body.full_name.trim(),
		active: Object.hasOwn(body, "active") ? body.active : true,
		created_by: user.id,
		updated_by: user.id,
	});

	set.status = 201;
	return publicUser({ user: createdUser });
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
	if (body.password) {
		userUpdate.password = await Bun.password.hash(body.password);
	}
	if (body.full_name) {
		userUpdate.full_name = body.full_name.trim();
	}
	if (Object.hasOwn(body, "active")) {
		userUpdate.active = body.active;
	}

	const updatedUser = await updateUserById({
		id: params.id,
		...userUpdate,
	});

	set.status = 200;
	return publicUser({ user: updatedUser });
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
