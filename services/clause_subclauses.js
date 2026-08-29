import { getContractClauseById } from "../db/contract_clauses.js";
import {
    createClauseSubclause,
    deleteClauseSubclauseById,
    getClauseSubclauseByClauseIdAndViewIndex,
    getClauseSubclauseById,
    getMaxClauseSubclauseViewIndexByClauseId,
    updateClauseSubclauseById,
    updateClauseSubclauseViewIndexById,
} from "../db/clause_subclauses.js";

export async function addClauseSubclause({ body, set }) {
    const clause = await getContractClauseById({ id: body.clause_id });
    if (!clause) {
        set.status = 404;
        return { error: "Contract clause not found" };
    }

    const maxViewIndex = await getMaxClauseSubclauseViewIndexByClauseId({
        clause_id: clause.id,
    });

    const subclauseId = await createClauseSubclause({
        clause_id: clause.id,
        body: body.body.trim(),
        view_index: maxViewIndex + 1,
    });

    const subclause = await getClauseSubclauseById({ id: subclauseId });

    set.status = 201;
    return { message: "Clause subclause created", subclause };
}

export async function updateClauseSubclause({ params, body, set }) {
    const existingSubclause = await getClauseSubclauseById({ id: params.id });
    if (!existingSubclause) {
        set.status = 404;
        return { error: "Clause subclause not found" };
    }

    await updateClauseSubclauseById({
        id: existingSubclause.id,
        body: body.body.trim(),
    });

    const subclause = await getClauseSubclauseById({ id: existingSubclause.id });

    set.status = 200;
    return { message: "Clause subclause updated", subclause };
}

export async function updateClauseSubclauseViewIndex({ params, body, set }) {
    const existingSubclause = await getClauseSubclauseById({ id: params.id });
    if (!existingSubclause) {
        set.status = 404;
        return { error: "Clause subclause not found" };
    }

    const currentViewIndex = Number(existingSubclause.view_index);
    const neighborViewIndex =
        body.direction === "up" ? currentViewIndex - 1 : currentViewIndex + 1;

    const neighborSubclause = await getClauseSubclauseByClauseIdAndViewIndex({
        clause_id: existingSubclause.clause_id,
        view_index: neighborViewIndex,
    });
    if (!neighborSubclause) {
        set.status = 400;
        return { error: "Cannot move further" };
    }

    await updateClauseSubclauseViewIndexById({
        id: neighborSubclause.id,
        view_index: currentViewIndex,
    });
    await updateClauseSubclauseViewIndexById({
        id: existingSubclause.id,
        view_index: neighborViewIndex,
    });

    const subclause = await getClauseSubclauseById({ id: existingSubclause.id });

    set.status = 200;
    return { message: "Clause subclause view index updated", subclause };
}

export async function deleteClauseSubclause({ params, set }) {
    const existingSubclause = await getClauseSubclauseById({ id: params.id });
    if (!existingSubclause) {
        set.status = 404;
        return { error: "Clause subclause not found" };
    }

    await deleteClauseSubclauseById({ id: existingSubclause.id });

    set.status = 200;
    return { message: "Clause subclause deleted" };
}
