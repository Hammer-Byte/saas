import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export const GEM_PUBLIC_TEXTS_ID = 1;

export async function getGemPublicTexts() {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM GEM_PUBLIC_TEXTS
            WHERE id = ${GEM_PUBLIC_TEXTS_ID}
            LIMIT 1
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getGemPublicTexts: ${error}`);
            return null;
        });
}

export async function upsertGemPublicTexts({
    scope_text = undefined,
    rules_text = undefined,
    updated_by = null,
}) {
    const existing = await getGemPublicTexts();
    const nextScope =
        scope_text !== undefined
            ? String(scope_text ?? "")
            : existing?.scope_text != null
              ? String(existing.scope_text)
              : "";
    const nextRules =
        rules_text !== undefined
            ? String(rules_text ?? "")
            : existing?.rules_text != null
              ? String(existing.rules_text)
              : "";
    const userId =
        updated_by != null && Number(updated_by) >= 1 ? Number(updated_by) : null;

    await executeSQLQuery(
        (sql) => sql`
            INSERT INTO GEM_PUBLIC_TEXTS (
                id,
                scope_text,
                rules_text,
                updated_by
            )
            VALUES (
                ${GEM_PUBLIC_TEXTS_ID},
                ${nextScope},
                ${nextRules},
                ${userId}
            )
            ON DUPLICATE KEY UPDATE
                scope_text = VALUES(scope_text),
                rules_text = VALUES(rules_text),
                updated_by = VALUES(updated_by)
        `,
    ).catch((error) => {
        logger.error(`upsertGemPublicTexts: ${error}`);
        throw error;
    });

    return await getGemPublicTexts();
}
