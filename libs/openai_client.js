import { logger } from "@hammerbyte/utils";

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";

/**
 * Chat Completions with JSON object response.
 * apiKey and model must be provided by the caller (from DB settings).
 * @returns {Promise<object|null>}
 */
export async function openAiChatJson({
    apiKey,
    model,
    system = "",
    user,
    temperature = 0,
}) {
    const key = String(apiKey || "").trim();
    const modelName = String(model || "").trim();
    if (!key) {
        throw new Error("OpenAI API key is not configured");
    }
    if (!modelName) {
        throw new Error("OpenAI model is not configured");
    }

    const messages = [];
    if (String(system || "").trim()) {
        messages.push({ role: "system", content: String(system).trim() });
    }
    messages.push({ role: "user", content: String(user || "") });

    const response = await fetch(OPENAI_CHAT_URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: modelName,
            temperature,
            response_format: { type: "json_object" },
            messages,
        }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        const detail =
            payload?.error?.message ||
            payload?.error ||
            `OpenAI HTTP ${response.status}`;
        logger.error(`openAiChatJson: ${detail}`);
        throw new Error(String(detail));
    }

    const content = payload?.choices?.[0]?.message?.content;
    if (!content) {
        throw new Error("OpenAI returned an empty response");
    }

    try {
        return JSON.parse(content);
    } catch (error) {
        logger.error(`openAiChatJson parse: ${error}`);
        throw new Error("OpenAI returned invalid JSON");
    }
}
