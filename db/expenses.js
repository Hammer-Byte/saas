import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createExpense({ title, description = null, amount, expense_date }) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO EXPENSES ${sql(
                { title, description, amount, expense_date },
                "title",
                "description",
                "amount",
                "expense_date",
            )}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createExpense: ${error}`);
            throw error;
        });
}

export async function updateExpenseById({ id, title, description = null, amount, expense_date }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE EXPENSES
            SET
                title = ${title},
                description = ${description},
                amount = ${amount},
                expense_date = ${expense_date}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateExpenseById: ${error}`);
        throw error;
    });
}

export async function deleteExpenseById({ id }) {
    await executeSQLQuery((sql) => sql`DELETE FROM EXPENSES WHERE id = ${id}`).catch((error) => {
        logger.error(`deleteExpenseById: ${error}`);
        throw error;
    });
}

export async function getExpenseById({ id }) {
    return await executeSQLQuery((sql) => sql`SELECT * FROM EXPENSES WHERE id = ${id}`)
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getExpenseById: ${error}`);
            return null;
        });
}

export async function getExpensesByDateRange({ start, end }) {
    logger.info(`Getting Expenses From ${start} To ${end}`);
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM EXPENSES
            WHERE expense_date >= ${start} AND expense_date <= ${end}
            ORDER BY expense_date DESC, id DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getExpensesByDateRange: ${error}`);
            return [];
        });
}
