import { join } from "node:path";
import { unlink } from "node:fs/promises";
import { filer, logger } from "@hammerbyte/utils";
import transporter from "../libs/transporter.js";
import { getWritableDate } from "../libs/date.js";
import { generateSigningCode } from "../libs/utils.js";
import {
    buildContractClausesHtml,
    buildContractContractorMediaHtml,
    escapeContractHtml,
    formatContractCreatedOn,
    generateContractPdf,
    resolveContractTemplateAssets,
} from "../libs/contractor.js";
import {
    createContract,
    deleteContractById,
    getContractById,
    getContractBySigningCode,
    updateContractById,
} from "../db/contracts.js";
import {
    getAllContractAttachments,
    getContractAttachmentsByIds,
} from "../db/contract_attachments.js";
import {
    clearContractRequiredAttachmentMediaByContractId,
    createContractRequiredAttachment,
    deleteContractRequiredAttachmentsByContractId,
    getContractRequiredAttachmentById,
    getContractRequiredAttachmentsByContractId,
    updateContractRequiredAttachmentMediaById,
} from "../db/contract_required_attachments.js";
import { getContractClausesByContractId } from "../db/contract_clauses.js";
import { getClauseSubclausesByContractId } from "../db/clause_subclauses.js";
import { deleteMediaById, getMediaById } from "../db/media.js";

function normalizeRequiredAttachmentIds(required_attachments) {
    return Array.from(
        new Set((required_attachments || []).map(Number).filter((id) => Number.isInteger(id) && id > 0)),
    );
}

export function isContractSigned(requiredAttachments) {
    return (
        Array.isArray(requiredAttachments) &&
        requiredAttachments.length > 0 &&
        requiredAttachments.every((required) => required.media_id)
    );
}

function findRequiredAttachmentMedia(requiredAttachments, title) {
    const match = (requiredAttachments || []).find(
        (required) =>
            String(required.title || "").trim().toLowerCase() === title.toLowerCase() &&
            required.media_id,
    );
    return match?.media_id || null;
}

async function getMediaDataUriById(id) {
    if (!id) {
        return null;
    }

    const media = await getMediaById({ id });
    if (!media?.file) {
        return null;
    }

    const diskFile = Bun.file(join(Bun.env.DIRECTORY_MEDIA, media.file));
    if (!(await diskFile.exists())) {
        return null;
    }

    const mimeType = filer.getContentTypeByFileName(media.file) || "image/jpeg";
    const fileBytes = Buffer.from(await diskFile.arrayBuffer()).toString("base64");
    return `data:${mimeType};base64,${fileBytes}`;
}

async function getContractClauses({ contract_id }) {
    const contractClauses = await getContractClausesByContractId({
        contract_id,
    });
    const clauseSubclauses = await getClauseSubclausesByContractId({
        contract_id,
    });

    return contractClauses.map((contractClause) => ({
        id: contractClause.id,
        title: contractClause.title,
        view_index: contractClause.view_index,
        subclauses: clauseSubclauses
            .filter((clauseSubclause) => clauseSubclause.clause_id === contractClause.id)
            .map((clauseSubclause) => ({
                id: clauseSubclause.id,
                body: clauseSubclause.body,
                view_index: clauseSubclause.view_index,
            })),
    }));
}

async function replaceContractRequiredAttachments({ contract_id, required_attachments }) {
    const attachmentIds = normalizeRequiredAttachmentIds(required_attachments);
    if (!attachmentIds.length) {
        return { error: "At least one required attachment is required" };
    }

    const attachments = await getContractAttachmentsByIds({ ids: attachmentIds });
    if (attachments.length !== attachmentIds.length) {
        return { error: "One or more required attachments are invalid" };
    }

    const existingRequired = await getContractRequiredAttachmentsByContractId({
        contract_id,
    });
    const existingIds = existingRequired
        .map((required) => Number(required.attachment_id))
        .sort((left, right) => left - right)
        .join(",");
    const nextIds = attachmentIds
        .slice()
        .sort((left, right) => left - right)
        .join(",");

    if (existingIds === nextIds) {
        return { attachmentIds, unchanged: true };
    }

    const mediaIds = existingRequired.map((required) => required.media_id).filter(Boolean);

    await deleteContractRequiredAttachmentsByContractId({ contract_id });

    for (const mediaId of mediaIds) {
        await removeSignedMedia({ id: mediaId });
    }

    for (const attachment_id of attachmentIds) {
        await createContractRequiredAttachment({
            contract_id,
            attachment_id,
            media_id: null,
        });
    }

    return { attachmentIds };
}

async function removeSignedMedia({ id }) {
    const media = await getMediaById({ id });
    if (!media) {
        return;
    }

    try {
        await unlink(join(Bun.env.DIRECTORY_MEDIA, media.file));
    } catch (error) {
        logger.error(`removeSignedMedia unlink: ${error}`);
    }

    await deleteMediaById({ id: media.id });
}

export async function listContractAttachments({ set }) {
    const attachments = await getAllContractAttachments();
    set.status = 200;
    return { attachments };
}

export async function getContract({ params, set }) {
    const contract = await getContractBySigningCode({
        signing_code: params.signing_code,
    });
    if (!contract) {
        set.status = 404;
        return { error: "Contract not found" };
    }

    const clauses = await getContractClauses({
        contract_id: contract.id,
    });
    const required_attachments = await getContractRequiredAttachmentsByContractId({
        contract_id: contract.id,
    });

    set.status = 200;
    return {
        contract: {
            company: contract.company,
            full_name: contract.full_name,
            email: contract.email,
            phone: contract.phone,
            address: contract.address,
            signing_code: contract.signing_code,
        },
        clauses,
        required_attachments,
        signed: isContractSigned(required_attachments),
    };
}

export async function getContractHtml({ signing_code }) {
    const contract = await getContractBySigningCode({ signing_code });
    if (!contract) {
        return null;
    }

    const clauses = await getContractClauses({
        contract_id: contract.id,
    });
    const requiredAttachments = await getContractRequiredAttachmentsByContractId({
        contract_id: contract.id,
    });

    const contractorName = contract.full_name || contract.company || "";
    const [selfieSrc, signatureSrc] = await Promise.all([
        getMediaDataUriById(findRequiredAttachmentMedia(requiredAttachments, "Selfie")),
        getMediaDataUriById(findRequiredAttachmentMedia(requiredAttachments, "Signature")),
    ]);

    const html = filer.prepareTemplated("templates/contract.html", {
        contractor_name: escapeContractHtml(contractorName),
        created_on: escapeContractHtml(
            formatContractCreatedOn(contract.created_on),
        ),
        clauses: buildContractClausesHtml(clauses),
        contractor_media: buildContractContractorMediaHtml({
            selfie_src: selfieSrc,
            signature_src: signatureSrc,
        }),
    });

    return resolveContractTemplateAssets(html);
}

export async function getContractPdf({ params, set }) {
    const contract = await getContractBySigningCode({
        signing_code: params.signing_code,
    });
    if (!contract) {
        set.status = 404;
        return { error: "Contract not found" };
    }

    const requiredAttachments = await getContractRequiredAttachmentsByContractId({
        contract_id: contract.id,
    });
    if (!isContractSigned(requiredAttachments)) {
        set.status = 400;
        return { error: "Contract is not signed" };
    }

    const html = await getContractHtml({ signing_code: params.signing_code });
    if (!html) {
        set.status = 404;
        return { error: "Contract not found" };
    }

    const pdf = await generateContractPdf(html);
    const fileName = `contract-${contract.signing_code}.pdf`;

    set.headers["Content-Type"] = "application/pdf";
    set.headers["Content-Disposition"] = `attachment; filename="${fileName}"`;
    return pdf;
}

export async function signContract({ body, set }) {
    const contract = await getContractBySigningCode({
        signing_code: body.signing_code,
    });
    if (!contract) {
        set.status = 404;
        return { error: "Contract not found" };
    }

    const requiredAttachments = await getContractRequiredAttachmentsByContractId({
        contract_id: contract.id,
    });
    if (!requiredAttachments.length) {
        set.status = 400;
        return { error: "No required attachments configured for this contract" };
    }
    if (!isContractSigned(requiredAttachments)) {
        set.status = 400;
        return { error: "Upload all required attachments before signing" };
    }

    set.status = 200;
    return { message: "Contract signed" };
}

export async function updateContractRequiredAttachmentMedia({ params, body, set }) {
    const requiredAttachment = await getContractRequiredAttachmentById({ id: params.id });
    if (!requiredAttachment) {
        set.status = 404;
        return { error: "Required attachment not found" };
    }

    const contract = await getContractById({ id: requiredAttachment.contract_id });
    if (!contract || !contract.active) {
        set.status = 404;
        return { error: "Contract not found" };
    }

    const media = await getMediaById({ id: body.media_id });
    if (!media) {
        set.status = 400;
        return { error: "Media is required" };
    }

    const previousMediaId = requiredAttachment.media_id;
    await updateContractRequiredAttachmentMediaById({
        id: requiredAttachment.id,
        media_id: media.id,
    });

    if (previousMediaId && previousMediaId !== media.id) {
        await removeSignedMedia({ id: previousMediaId });
    }

    const updated = await getContractRequiredAttachmentById({ id: requiredAttachment.id });
    set.status = 200;
    return { message: "Attachment media saved", required_attachment: updated };
}

export async function addContract({ body, set }) {
    const signable_till = getWritableDate("YYYY-MM-DD HH:mm:ss", body.signable_till);
    if (!signable_till) {
        set.status = 400;
        return { error: "Signable till is required" };
    }

    const attachmentIds = normalizeRequiredAttachmentIds(body.required_attachments);
    if (!attachmentIds.length) {
        set.status = 400;
        return { error: "At least one required attachment is required" };
    }

    const attachments = await getContractAttachmentsByIds({ ids: attachmentIds });
    if (attachments.length !== attachmentIds.length) {
        set.status = 400;
        return { error: "One or more required attachments are invalid" };
    }

    const contractId = await createContract({
        company: body.company?.trim() || null,
        full_name: body.full_name.trim(),
        email: body.email.trim(),
        phone: body.phone.trim(),
        address: body.address.trim(),
        signing_code: generateSigningCode(),
        active: body.active,
        signable_till,
    });

    if (!contractId) {
        set.status = 400;
        return { error: "Failed to create contract" };
    }

    for (const attachment_id of attachmentIds) {
        await createContractRequiredAttachment({
            contract_id: contractId,
            attachment_id,
            media_id: null,
        });
    }

    const contract = await getContractById({ id: contractId });
    const required_attachments = await getContractRequiredAttachmentsByContractId({
        contract_id: contractId,
    });

    set.status = 201;
    return { message: "Contract created", contract, required_attachments };
}

export async function updateContract({ params, body, set }) {
    const existingContract = await getContractById({ id: params.id });
    if (!existingContract) {
        set.status = 404;
        return { error: "Contract not found" };
    }

    const signable_till = getWritableDate("YYYY-MM-DD HH:mm:ss", body.signable_till);
    if (!signable_till) {
        set.status = 400;
        return { error: "Signable till is required" };
    }

    const replaced = await replaceContractRequiredAttachments({
        contract_id: existingContract.id,
        required_attachments: body.required_attachments,
    });
    if (replaced.error) {
        set.status = 400;
        return { error: replaced.error };
    }

    await updateContractById({
        id: existingContract.id,
        company: body.company?.trim() || null,
        full_name: body.full_name.trim(),
        email: body.email.trim(),
        phone: body.phone.trim(),
        address: body.address.trim(),
        active: body.active,
        signable_till,
    });

    const contract = await getContractById({ id: existingContract.id });
    const required_attachments = await getContractRequiredAttachmentsByContractId({
        contract_id: existingContract.id,
    });

    set.status = 200;
    return { message: "Contract updated", contract, required_attachments };
}

export async function createContractInvite({ params, request, set }) {
    const contract = await getContractById({ id: params.id });
    if (!contract) {
        set.status = 404;
        return { error: "Contract not found" };
    }

    if (!contract.email) {
        set.status = 400;
        return { error: "Contract email is required" };
    }

    const origin = new URL(request.url).origin;
    const sign_url = `${origin}/contracts/${contract.signing_code}/sign`;

    const inviteHtml = filer.prepareTemplated("templates/contract_invite.html", {
        full_name: contract.full_name,
        sign_url,
    });

    transporter.transport({
        recipient: contract.email,
        subject: "Contract signing invite — HammerByte",
        body: inviteHtml,
        html_enabled: true,
    });

    set.status = 200;
    return { message: "Invite sent" };
}

export async function deleteContractSigned({ params, set }) {
    const existingContract = await getContractById({ id: params.id });
    if (!existingContract) {
        set.status = 404;
        return { error: "Contract not found" };
    }

    const requiredAttachments = await getContractRequiredAttachmentsByContractId({
        contract_id: existingContract.id,
    });
    const mediaIds = requiredAttachments.map((required) => required.media_id).filter(Boolean);

    await clearContractRequiredAttachmentMediaByContractId({
        contract_id: existingContract.id,
    });

    for (const mediaId of mediaIds) {
        await removeSignedMedia({ id: mediaId });
    }

    set.status = 200;
    return { message: "Contract unsigned" };
}

export async function deleteContract({ params, set }) {
    const existingContract = await getContractById({ id: params.id });
    if (!existingContract) {
        set.status = 404;
        return { error: "Contract not found" };
    }

    const requiredAttachments = await getContractRequiredAttachmentsByContractId({
        contract_id: existingContract.id,
    });
    const mediaIds = requiredAttachments.map((required) => required.media_id).filter(Boolean);

    await deleteContractById({ id: existingContract.id });

    for (const mediaId of mediaIds) {
        await removeSignedMedia({ id: mediaId });
    }

    set.status = 200;
    return { message: "Contract deleted" };
}
