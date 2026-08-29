import { getExternalContractById } from "../db/external_contracts.js";
import {
    createContractClause,
    deleteContractClauseById,
    getContractClauseByExternalContractIdAndViewIndex,
    getContractClauseById,
    getMaxContractClauseViewIndexByExternalContractId,
    updateContractClauseById,
    updateContractClauseViewIndexById,
} from "../db/contract_clauses.js";

export async function addContractClause({ body, set }) {
    const contract = await getExternalContractById({ id: body.external_contract_id });
    if (!contract) {
        set.status = 404;
        return { error: "External contract not found" };
    }

    const maxViewIndex = await getMaxContractClauseViewIndexByExternalContractId({
        external_contract_id: contract.id,
    });

    const clauseId = await createContractClause({
        external_contract_id: contract.id,
        title: body.title.trim(),
        view_index: maxViewIndex + 1,
    });

    const clause = await getContractClauseById({ id: clauseId });

    set.status = 201;
    return { message: "Contract clause created", clause };
}

export async function updateContractClause({ params, body, set }) {
    const existingClause = await getContractClauseById({ id: params.id });
    if (!existingClause) {
        set.status = 404;
        return { error: "Contract clause not found" };
    }

    await updateContractClauseById({
        id: existingClause.id,
        title: body.title.trim(),
    });

    const clause = await getContractClauseById({ id: existingClause.id });

    set.status = 200;
    return { message: "Contract clause updated", clause };
}

export async function updateContractClauseViewIndex({ params, body, set }) {
    const existingClause = await getContractClauseById({ id: params.id });
    if (!existingClause) {
        set.status = 404;
        return { error: "Contract clause not found" };
    }

    const currentViewIndex = Number(existingClause.view_index);
    const neighborViewIndex =
        body.direction === "up" ? currentViewIndex - 1 : currentViewIndex + 1;

    const neighborClause = await getContractClauseByExternalContractIdAndViewIndex({
        external_contract_id: existingClause.external_contract_id,
        view_index: neighborViewIndex,
    });
    if (!neighborClause) {
        set.status = 400;
        return { error: "Cannot move further" };
    }

    await updateContractClauseViewIndexById({
        id: neighborClause.id,
        view_index: currentViewIndex,
    });
    await updateContractClauseViewIndexById({
        id: existingClause.id,
        view_index: neighborViewIndex,
    });

    const clause = await getContractClauseById({ id: existingClause.id });

    set.status = 200;
    return { message: "Contract clause view index updated", clause };
}

export async function deleteContractClause({ params, set }) {
    const existingClause = await getContractClauseById({ id: params.id });
    if (!existingClause) {
        set.status = 404;
        return { error: "Contract clause not found" };
    }

    await deleteContractClauseById({ id: existingClause.id });

    set.status = 200;
    return { message: "Contract clause deleted" };
}
