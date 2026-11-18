import { getCustomerProjectById } from "../db/customer_projects.js";
import {
    createServer,
    deleteServerById,
    getServerById,
    getServerByUnmappedOtp,
    markServerTagMappedById,
    updateServerById,
} from "../db/servers.js";
import { generateOTP } from "../libs/utils.js";

async function allocateServerOtp() {
    for (let attempt = 0; attempt < 20; attempt += 1) {
        const otp = generateOTP();
        const existingServer = await getServerByUnmappedOtp({ otp });
        if (!existingServer) {
            return otp;
        }
    }
    return null;
}

async function resolveProjectId({ project_id, set }) {
    if (project_id == null) {
        return { projectId: null };
    }

    const existingProject = await getCustomerProjectById({ id: project_id });
    if (!existingProject) {
        set.status = 404;
        return { error: "Project not found" };
    }

    return { projectId: existingProject.id };
}

export async function addServer({ body, set }) {
    const projectResult = await resolveProjectId({
        project_id: body.project_id ?? null,
        set,
    });
    if (projectResult.error) {
        return { error: projectResult.error };
    }

    const otp = await allocateServerOtp();
    if (!otp) {
        set.status = 500;
        return { error: "Could not allocate a unique OTP" };
    }

    const notes =
        body.notes == null || String(body.notes).trim() === ""
            ? null
            : String(body.notes).trim();

    const id = await createServer({
        name: body.name.trim(),
        location: body.location.trim(),
        project_id: projectResult.projectId,
        notes,
        tag: crypto.randomUUID(),
        otp,
        active: body.active === false ? false : undefined,
    });

    if (!id) {
        set.status = 500;
        return { error: "Failed to create server" };
    }

    const server = await getServerById({ id });
    set.status = 201;
    return { message: "Server created", server };
}

export async function updateServer({ body, set }) {
    const existingServer = await getServerById({ id: body.id });
    if (!existingServer) {
        set.status = 404;
        return { error: "Server not found" };
    }

    const projectResult = await resolveProjectId({
        project_id: body.project_id ?? null,
        set,
    });
    if (projectResult.error) {
        return { error: projectResult.error };
    }

    const notes =
        body.notes == null || String(body.notes).trim() === ""
            ? null
            : String(body.notes).trim();

    await updateServerById({
        id: body.id,
        name: body.name.trim(),
        location: body.location.trim(),
        project_id: projectResult.projectId,
        notes,
        active: Boolean(body.active),
    });

    const server = await getServerById({ id: body.id });
    set.status = 200;
    return { message: "Server updated", server };
}

export async function deleteServer({ params, set }) {
    const existingServer = await getServerById({ id: params.id });
    if (!existingServer) {
        set.status = 404;
        return { error: "Server not found" };
    }

    await deleteServerById({ id: params.id });
    set.status = 204;
}

export async function handleServerRequest({ body, set }) {
    if (body.TYPE !== "CREATE_TAG") {
        set.status = 401;
        return { error: "Unsupported request type" };
    }

    const otp = String(body.otp || "").trim();
    if (!/^\d{4}$/.test(otp)) {
        set.status = 401;
        return { error: "Invalid OTP" };
    }

    const existingServer = await getServerByUnmappedOtp({ otp });
    if (!existingServer) {
        set.status = 401;
        return { error: "No unmapped server found for this OTP" };
    }

    await markServerTagMappedById({ id: existingServer.id });

    set.status = 201;
    return { tag_id: existingServer.tag };
}
