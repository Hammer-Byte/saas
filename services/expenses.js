import {
    createExpense,
    deleteExpenseById,
    getExpenseById,
    updateExpenseById,
} from "../db/expenses.js";

export async function addExpense({ body, set }) {
    const id = await createExpense({
        ...body,
        title: body.title.trim(),
        description: body.description?.trim() || null,
    });

    const expense = await getExpenseById({ id });

    set.status = 201;
    return { message: "Expense created", expense };
}

export async function updateExpense({ body, set }) {
    const existingExpense = await getExpenseById({ id: body.id });
    if (!existingExpense) {
        set.status = 404;
        return { error: "Expense not found" };
    }

    await updateExpenseById({
        ...body,
        title: body.title.trim(),
        description: body.description?.trim() || null,
    });

    const expense = await getExpenseById({ id: body.id });

    set.status = 200;
    return { message: "Expense updated", expense };
}

export async function deleteExpense({ params, set }) {
    const existingExpense = await getExpenseById({ id: params.id });
    if (!existingExpense) {
        set.status = 404;
        return { error: "Expense not found" };
    }

    await deleteExpenseById({ id: params.id });
    set.status = 204;
}
