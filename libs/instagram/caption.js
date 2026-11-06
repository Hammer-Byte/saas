/** Join caption + hashtags the way Instagram feed expects. */
export function buildInstagramCaption(caption = null, hashtags = null) {
    return [String(caption || "").trim(), String(hashtags || "").trim()]
        .filter(Boolean)
        .join("\n\n");
}
