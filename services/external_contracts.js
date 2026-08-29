import { join } from "node:path";
import { unlink } from "node:fs/promises";
import { filer, logger } from "@hammerbyte/utils";
import transporter from "../libs/transporter.js";
import { getWritableDate } from "../libs/date.js";
import { generateSigningCode } from "../libs/utils.js";
import {
    buildExternalContractClausesHtml,
    buildExternalContractContractorMediaHtml,
    escapeExternalContractHtml,
    formatExternalContractCreatedOn,
    generateExternalContractPdf,
    resolveExternalContractTemplateAssets,
} from "../libs/external_contractor.js";
import {
    clearExternalContractSignedMediaById,
    createExternalContract,
    deleteExternalContractById,
    getExternalContractById,
    getExternalContractBySigningCode,
    updateExternalContractById,
    updateExternalContractSignedMediaById,
} from "../db/external_contracts.js";
import { getContractClausesByExternalContractId } from "../db/contract_clauses.js";
import { getClauseSubclausesByExternalContractId } from "../db/clause_subclauses.js";
import { deleteMediaById, getMediaById } from "../db/media.js";

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

async function getExternalContractClauses({ external_contract_id }) {
    const contractClauses = await getContractClausesByExternalContractId({
        external_contract_id,
    });
    const clauseSubclauses = await getClauseSubclausesByExternalContractId({
        external_contract_id,
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

export async function getExternalContract({ params, set }) {
    const externalContract = await getExternalContractBySigningCode({
        signing_code: params.signing_code,
    });
    if (!externalContract) {
        set.status = 404;
        return { error: "External contract not found" };
    }

    const clauses = await getExternalContractClauses({
        external_contract_id: externalContract.id,
    });

    set.status = 200;
    return {
        contract: {
            company: externalContract.company,
            full_name: externalContract.full_name,
            email: externalContract.email,
            phone: externalContract.phone,
            address: externalContract.address,
            signing_code: externalContract.signing_code,
        },
        clauses,
    };
}

export async function getExternalContractHtml({ signing_code }) {
    const externalContract = await getExternalContractBySigningCode({ signing_code });
    if (!externalContract) {
        return null;
    }

    const clauses = await getExternalContractClauses({
        external_contract_id: externalContract.id,
    });

    const contractorName = externalContract.full_name || externalContract.company || "";
    const [selfieSrc, signatureSrc] = await Promise.all([
        getMediaDataUriById(externalContract.selfie),
        getMediaDataUriById(externalContract.signature),
    ]);

    const html = filer.prepareTemplated("templates/contract.html", {
        contractor_name: escapeExternalContractHtml(contractorName),
        created_on: escapeExternalContractHtml(
            formatExternalContractCreatedOn(externalContract.created_on),
        ),
        clauses: buildExternalContractClausesHtml(clauses),
        contractor_media: buildExternalContractContractorMediaHtml({
            selfie_src: selfieSrc,
            signature_src: signatureSrc,
        }),
    });

    return resolveExternalContractTemplateAssets(html);
}

export async function getExternalContractPdf({ params, set }) {
    const externalContract = await getExternalContractBySigningCode({
        signing_code: params.signing_code,
    });
    if (!externalContract) {
        set.status = 404;
        return { error: "External contract not found" };
    }

    if (!(externalContract.signature && externalContract.selfie && externalContract.identity)) {
        set.status = 400;
        return { error: "External contract is not signed" };
    }

    const html = await getExternalContractHtml({ signing_code: params.signing_code });
    if (!html) {
        set.status = 404;
        return { error: "External contract not found" };
    }

    const pdf = await generateExternalContractPdf(html);
    const fileName = `contract-${externalContract.signing_code}.pdf`;

    set.headers["Content-Type"] = "application/pdf";
    set.headers["Content-Disposition"] = `attachment; filename="${fileName}"`;
    return pdf;
}

export async function signExternalContract({ body, set }) {
    const externalContract = await getExternalContractBySigningCode({
        signing_code: body.signing_code,
    });
    if (!externalContract) {
        set.status = 404;
        return { error: "External contract not found" };
    }

    if (externalContract.signature || externalContract.selfie || externalContract.identity) {
        set.status = 400;
        return { error: "External contract is already signed" };
    }

    const signatureMedia = await getMediaById({ id: body.signature });
    const selfieMedia = await getMediaById({ id: body.selfie });
    const identityMedia = await getMediaById({ id: body.identity });
    if (!signatureMedia || !selfieMedia || !identityMedia) {
        set.status = 400;
        return { error: "Signature, selfie, and identity media are required" };
    }

    await updateExternalContractSignedMediaById({
        id: externalContract.id,
        signature: signatureMedia.id,
        selfie: selfieMedia.id,
        identity: identityMedia.id,
    });

    set.status = 200;
    return { message: "Contract signed" };
}

export async function addExternalContract({ body, set }) {
    const signable_till = getWritableDate("YYYY-MM-DD HH:mm:ss", body.signable_till);
    if (!signable_till) {
        set.status = 400;
        return { error: "Signable till is required" };
    }

    const contractId = await createExternalContract({
        company: body.company?.trim() || null,
        full_name: body.full_name.trim(),
        email: body.email.trim(),
        phone: body.phone.trim(),
        address: body.address.trim(),
        signing_code: generateSigningCode(),
        active: body.active,
        signable_till,
    });

    const contract = await getExternalContractById({ id: contractId });

    set.status = 201;
    return { message: "External contract created", contract };
}

export async function updateExternalContract({ params, body, set }) {
    const existingContract = await getExternalContractById({ id: params.id });
    if (!existingContract) {
        set.status = 404;
        return { error: "External contract not found" };
    }

    const signable_till = getWritableDate("YYYY-MM-DD HH:mm:ss", body.signable_till);
    if (!signable_till) {
        set.status = 400;
        return { error: "Signable till is required" };
    }

    await updateExternalContractById({
        id: existingContract.id,
        company: body.company?.trim() || null,
        full_name: body.full_name.trim(),
        email: body.email.trim(),
        phone: body.phone.trim(),
        address: body.address.trim(),
        active: body.active,
        signable_till,
    });

    const contract = await getExternalContractById({ id: existingContract.id });

    set.status = 200;
    return { message: "External contract updated", contract };
}

export async function createExternalContractInvite({ params, request, set }) {
    const contract = await getExternalContractById({ id: params.id });
    if (!contract) {
        set.status = 404;
        return { error: "External contract not found" };
    }

    if (!contract.email) {
        set.status = 400;
        return { error: "Contract email is required" };
    }

    const origin = new URL(request.url).origin;
    const sign_url = `${origin}/external-contracts/${contract.signing_code}/sign`;

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

export async function deleteExternalContractSigned({ params, set }) {
    const existingContract = await getExternalContractById({ id: params.id });
    if (!existingContract) {
        set.status = 404;
        return { error: "External contract not found" };
    }

    const mediaIds = [
        existingContract.signature,
        existingContract.selfie,
        existingContract.identity,
    ].filter(Boolean);

    await clearExternalContractSignedMediaById({ id: existingContract.id });

    for (const mediaId of mediaIds) {
        await removeSignedMedia({ id: mediaId });
    }

    set.status = 200;
    return { message: "Contract unsigned" };
}

export async function deleteExternalContract({ params, set }) {
    const existingContract = await getExternalContractById({ id: params.id });
    if (!existingContract) {
        set.status = 404;
        return { error: "External contract not found" };
    }

    await deleteExternalContractById({ id: existingContract.id });

    set.status = 200;
    return { message: "External contract deleted" };
}
