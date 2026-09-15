const DEFAULT_MESSAGE = "Loading mission...";
const DEFAULT_HINT = "Preparing the timeline and 3D scene. This can take a moment.";

function setMissionLoadingRetry(onRetry, documentRef) {
    const doc = resolveDocument(documentRef);
    const button = doc?.getElementById?.("mission-loading-retry");
    if (!button) return;
    button.hidden = typeof onRetry !== "function";
    button.disabled = button.hidden;
    button.onclick = typeof onRetry === "function" ? onRetry : null;
}

function resolveDocument(documentRef) {
    return documentRef || globalThis?.document || null;
}

function getLoadingOverlay(documentRef) {
    const doc = resolveDocument(documentRef);
    if (!doc) return null;
    return doc.getElementById?.("mission-loading-overlay") || null;
}

function setMissionLoadingMessage(message, documentRef) {
    const doc = resolveDocument(documentRef);
    if (!doc) return;
    const overlay = getLoadingOverlay(doc);
    const messageNode = doc.getElementById?.("mission-loading-overlay-message");
    if (!overlay || !messageNode) return;
    messageNode.textContent = typeof message === "string" && message.trim()
        ? message.trim()
        : DEFAULT_MESSAGE;
}

function showMissionLoadingOverlay(message = DEFAULT_MESSAGE, documentRef) {
    const doc = resolveDocument(documentRef);
    if (!doc) return;
    const overlay = getLoadingOverlay(doc);
    if (!overlay) return;
    setMissionLoadingMessage(message, doc);
    setMissionLoadingRetry(null, doc);
    const hint = doc.getElementById?.("mission-loading-overlay-hint");
    if (hint) hint.textContent = DEFAULT_HINT;
    overlay.hidden = false;
    overlay.dataset.state = "loading";
    overlay.dataset.blocking = "true";
    overlay.setAttribute?.("aria-busy", "true");
    doc.documentElement?.classList?.remove("mission-loading-complete");
}

function setMissionLoadingOverlayBlocking(blocking = true, documentRef) {
    const doc = resolveDocument(documentRef);
    if (!doc) return;
    const overlay = getLoadingOverlay(doc);
    if (!overlay) return;
    overlay.dataset.blocking = blocking ? "true" : "false";
}

function hideMissionLoadingOverlay(documentRef) {
    const doc = resolveDocument(documentRef);
    if (!doc) return;
    const overlay = getLoadingOverlay(doc);
    if (!overlay) return;
    overlay.dataset.state = "ready";
    overlay.dataset.blocking = "false";
    overlay.hidden = true;
    overlay.setAttribute?.("aria-busy", "false");
    setMissionLoadingRetry(null, doc);
    doc.documentElement?.classList?.add("mission-loading-complete");
}

function failMissionLoadingOverlay(message, documentRef) {
    const doc = resolveDocument(documentRef);
    if (!doc) return;
    const overlay = getLoadingOverlay(doc);
    if (!overlay) return;
    setMissionLoadingMessage(message || "Mission data could not be loaded.", doc);
    overlay.hidden = false;
    overlay.dataset.state = "error";
    overlay.dataset.blocking = "false";
    overlay.setAttribute?.("aria-busy", "false");
    const hint = doc.getElementById?.("mission-loading-overlay-hint");
    if (hint) hint.textContent = "Check your connection, retry, or choose another origin.";
}

export {
    failMissionLoadingOverlay,
    hideMissionLoadingOverlay,
    setMissionLoadingOverlayBlocking,
    setMissionLoadingMessage,
    showMissionLoadingOverlay,
    setMissionLoadingRetry,
};
