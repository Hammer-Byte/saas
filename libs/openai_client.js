import { logger } from "@hammerbyte/utils";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

function isLikelyImageUrl(url) {
    return /\.(png|jpe?g|gif|webp|bmp)(\?|#|$)/i.test(String(url || ""));
}

/** Reasoning models reject temperature; only send it for gpt-* chat models. */
function supportsTemperature(modelName) {
    return /^gpt-/i.test(String(modelName || "").trim());
}

function extractOutputText(payload) {
    if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
        return payload.output_text.trim();
    }
    const chunks = [];
    for (const item of payload?.output || []) {
        if (item?.type !== "message") continue;
        for (const part of item?.content || []) {
            if (part?.type === "output_text" && part.text) {
                chunks.push(String(part.text));
            }
        }
    }
    return chunks.join("\n").trim();
}

/**
 * Responses API with JSON object output.
 * Prefer text-only prompts. fileUrl is optional and usually unused for GeM SoW
 * (those URLs are not publicly fetchable by OpenAI).
 * @returns {Promise<object>}
 */
export async function openAiChatJson({
    apiKey,
    model,
    system = "",
    user,
    fileUrl = null,
    temperature = 0,
}) {
    const key = String(apiKey || "").trim();
    const modelName = String(model || "").trim();
    const prompt = String(user || "").trim();
    const remoteUrl = String(fileUrl || "").trim();

    if (!key) {
        throw new Error("OpenAI API key is not configured");
    }
    if (!modelName) {
        throw new Error("OpenAI model is not configured");
    }
    if (!prompt) {
        throw new Error("OpenAI prompt is empty");
    }

    const userContent = [{ type: "input_text", text: prompt }];
    if (remoteUrl) {
        if (isLikelyImageUrl(remoteUrl)) {
            userContent.push({
                type: "input_image",
                image_url: remoteUrl,
            });
        } else {
            userContent.push({
                type: "input_file",
                file_url: remoteUrl,
            });
        }
    }

    const input = [];
    if (String(system || "").trim()) {
        input.push({
            role: "system",
            content: String(system).trim(),
        });
    }
    input.push({
        role: "user",
        content: userContent,
    });

    const body = {
        model: modelName,
        text: { format: { type: "json_object" } },
        input,
    };
    if (supportsTemperature(modelName)) {
        body.temperature = temperature;
    }

    logger.info(
        `openAiChatJson: model=${modelName} fileAttached=${!!remoteUrl} temperature=${
            supportsTemperature(modelName) ? temperature : "omitted"
        }`,
    );

    const response = await fetch(OPENAI_RESPONSES_URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
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

    const content = extractOutputText(payload);
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
