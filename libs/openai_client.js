import { logger } from "@hammerbyte/utils";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_FILES_URL = "https://api.openai.com/v1/files";

/** Reasoning models reject temperature; only send it for gpt-* chat models. */
function supportsTemperature(modelName) {
    return /^gpt-/i.test(String(modelName || "").trim());
}

function isImageMimeType(mimeType) {
    return /^image\//i.test(String(mimeType || "").trim());
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
 * Upload a file to OpenAI Files API (purpose=user_data) for Responses input_file.
 * @returns {Promise<string>} file id
 */
export async function uploadOpenAiFile({
    apiKey,
    buffer,
    filename = "document.pdf",
    mimeType = "application/pdf",
}) {
    const key = String(apiKey || "").trim();
    if (!key) {
        throw new Error("OpenAI API key is not configured");
    }
    if (!Buffer.isBuffer(buffer) || !buffer.length) {
        throw new Error("OpenAI file upload requires a non-empty buffer");
    }

    const form = new FormData();
    form.append("purpose", "user_data");
    form.append(
        "file",
        new Blob([buffer], { type: String(mimeType || "application/octet-stream") }),
        String(filename || "document.pdf"),
    );

    logger.info(
        `uploadOpenAiFile: filename=${filename} bytes=${buffer.length} mime=${mimeType || "unknown"}`,
    );

    const response = await fetch(OPENAI_FILES_URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${key}`,
        },
        body: form,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        const detail =
            payload?.error?.message ||
            payload?.error ||
            `OpenAI Files HTTP ${response.status}`;
        logger.error(`uploadOpenAiFile: ${detail}`);
        throw new Error(String(detail));
    }

    const fileId = String(payload?.id || "").trim();
    if (!fileId) {
        throw new Error("OpenAI Files upload returned no file id");
    }
    logger.info(`uploadOpenAiFile: uploaded file_id=${fileId}`);
    return fileId;
}

/** Best-effort delete of an uploaded OpenAI file. */
export async function deleteOpenAiFile({ apiKey, fileId }) {
    const key = String(apiKey || "").trim();
    const id = String(fileId || "").trim();
    if (!key || !id) {
        return false;
    }

    try {
        const response = await fetch(`${OPENAI_FILES_URL}/${encodeURIComponent(id)}`, {
            method: "DELETE",
            headers: {
                Authorization: `Bearer ${key}`,
            },
        });
        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            const detail =
                payload?.error?.message ||
                payload?.error ||
                `OpenAI Files DELETE HTTP ${response.status}`;
            logger.error(`deleteOpenAiFile: ${id} → ${detail}`);
            return false;
        }
        logger.info(`deleteOpenAiFile: deleted file_id=${id}`);
        return true;
    } catch (error) {
        logger.error(`deleteOpenAiFile: ${id} → ${error}`);
        return false;
    }
}

/**
 * Responses API with JSON object output.
 * Pass fileBuffer to upload+attach the SoW (PDF via file_id; images via base64).
 * Uploaded OpenAI files are deleted in finally.
 * @returns {Promise<object>}
 */
export async function openAiChatJson({
    apiKey,
    model,
    system = "",
    user,
    fileBuffer = null,
    filename = "document.pdf",
    mimeType = "application/pdf",
    temperature = 0,
}) {
    const key = String(apiKey || "").trim();
    const modelName = String(model || "").trim();
    const prompt = String(user || "").trim();

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
    let uploadedFileId = null;

    try {
        if (Buffer.isBuffer(fileBuffer) && fileBuffer.length) {
            if (isImageMimeType(mimeType)) {
                const b64 = fileBuffer.toString("base64");
                const dataUrl = `data:${String(mimeType)};base64,${b64}`;
                userContent.push({
                    type: "input_image",
                    image_url: dataUrl,
                });
            } else {
                uploadedFileId = await uploadOpenAiFile({
                    apiKey: key,
                    buffer: fileBuffer,
                    filename,
                    mimeType,
                });
                userContent.push({
                    type: "input_file",
                    file_id: uploadedFileId,
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
            `openAiChatJson: model=${modelName} fileAttached=${!!(
                Buffer.isBuffer(fileBuffer) && fileBuffer.length
            )} fileId=${uploadedFileId || "none"} temperature=${
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
    } finally {
        if (uploadedFileId) {
            await deleteOpenAiFile({ apiKey: key, fileId: uploadedFileId });
        }
    }
}
