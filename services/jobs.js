import { join } from "node:path";
import { unlink } from "node:fs/promises";
import { logger } from "@hammerbyte/utils";
import { AUTHORITIES } from "../constants.js";
import { hasAuthority } from "../libs/app_page.js";
import {
    createJobPosition,
    deleteJobPositionById,
    getJobPositionById,
    updateJobPositionById,
} from "../db/job_positions.js";
import { getJobApplicantMediaByJobPositionId } from "../db/job_applicants.js";
import { deleteMediaById } from "../db/media.js";
import { getCurrentUser } from "./authentication.js";

export function canUseJobs(currentUser) {
    if (!currentUser?.id) {
        return false;
    }
    if (currentUser.super_admin) {
        return true;
    }
    return hasAuthority(currentUser.authorities, AUTHORITIES.USE_PAGE_JOBS);
}

async function requireJobsUser({ cookie, set }) {
    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return { error: "Unauthorized", currentUser: null };
    }
    if (!canUseJobs(currentUser)) {
        set.status = 403;
        return { error: "You do not have access to Jobs", currentUser };
    }
    return { currentUser };
}

async function removeMediaFile(fileName) {
    if (!fileName) {
        return;
    }

    try {
        await unlink(join(Bun.env.DIRECTORY_MEDIA, fileName));
    } catch (error) {
        logger.error(`removeMediaFile unlink: ${error}`);
    }
}

export async function addJob({ body, cookie, set }) {
    const gate = await requireJobsUser({ cookie, set });
    if (gate.error) {
        return { error: gate.error };
    }

    const title = body.title.trim();
    const description = body.description.trim();
    const experience = body.experience.trim();
    const replyEmail = String(body.reply_email || "")
        .trim()
        .toLowerCase();
    const active = body.active === undefined ? null : !!body.active;

    if (!replyEmail) {
        set.status = 400;
        return { error: "Reply email is required" };
    }

    const id = await createJobPosition({
        title,
        description,
        experience,
        reply_email: replyEmail,
        active,
    });
    if (!id) {
        set.status = 400;
        return { error: "Failed to create job" };
    }

    const job = await getJobPositionById({ id });
    set.status = 201;
    return { message: "Job created", job };
}

export async function updateJob({ body, cookie, set }) {
    const gate = await requireJobsUser({ cookie, set });
    if (gate.error) {
        return { error: gate.error };
    }

    const existingJob = await getJobPositionById({ id: body.id });
    if (!existingJob) {
        set.status = 404;
        return { error: "Job not found" };
    }

    const replyEmail = String(body.reply_email || "")
        .trim()
        .toLowerCase();
    if (!replyEmail) {
        set.status = 400;
        return { error: "Reply email is required" };
    }

    await updateJobPositionById({
        id: body.id,
        title: body.title.trim(),
        description: body.description.trim(),
        experience: body.experience.trim(),
        reply_email: replyEmail,
        active: !!body.active,
    });

    const job = await getJobPositionById({ id: body.id });
    set.status = 200;
    return { message: "Job updated", job };
}

export async function deleteJob({ params, cookie, set }) {
    const gate = await requireJobsUser({ cookie, set });
    if (gate.error) {
        return { error: gate.error };
    }

    const existingJob = await getJobPositionById({ id: params.id });
    if (!existingJob) {
        set.status = 404;
        return { error: "Job not found" };
    }

    const mediaRows = await getJobApplicantMediaByJobPositionId({
        job_position_id: existingJob.id,
    });

    await deleteJobPositionById({ id: existingJob.id });

    for (const mediaRow of mediaRows) {
        await removeMediaFile(mediaRow.media_file);
        await deleteMediaById({ id: mediaRow.media_id });
    }

    set.status = 200;
    return { message: "Job deleted" };
}
