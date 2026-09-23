function asTrimmedString(value) {
    if (typeof value !== "string") return "";
    return value.trim();
}

function normalizeKey(value) {
    return asTrimmedString(value).toLowerCase();
}

function escapeHtml(text) {
    var value = text === null || text === undefined ? "" : String(text);
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function ensureTrailingPeriod(text) {
    var t = asTrimmedString(text);
    if (!t) return "";
    if (/[.!?]$/.test(t)) return t;
    return t + ".";
}

function cleanMetadataText(text) {
    var raw = asTrimmedString(text);
    if (!raw) return "";
    return raw
        .replace(/\*{3,}/g, " ")
        .replace(/\s+/g, " ")
        .replace(/ +([,.;:!?])/g, "$1")
        .trim();
}

function sentenceSplit(text) {
    var cleaned = cleanMetadataText(text);
    if (!cleaned) return [];
    return cleaned
        .split(/(?<=[.!?])\s+/)
        .map(function(s) { return asTrimmedString(s); })
        .filter(Boolean);
}

export { asTrimmedString, normalizeKey, escapeHtml, ensureTrailingPeriod, cleanMetadataText, sentenceSplit };
