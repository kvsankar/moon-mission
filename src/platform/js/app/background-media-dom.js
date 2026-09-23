import { formatShortMissionElapsedTime, formatStatusTime } from "./background-media-policy.js";

const nodeAttributeCache = new WeakMap();
const nodeClassToggleCache = new WeakMap();

function getDocumentRef() {
    return globalThis.document || null;
}

function getWindowRef() {
    return globalThis.window || null;
}

function getNode(id) {
    return getDocumentRef()?.getElementById?.(id) || null;
}

function callMediaMethod(mediaElement, methodName) {
    try {
        return mediaElement?.[methodName]?.();
    } catch {
        return null;
    }
}

function setText(id, text) {
    const node = getNode(id);
    if (node && node.textContent !== text) node.textContent = text;
}

function setHidden(id, hidden) {
    const node = getNode(id);
    const nextHidden = hidden === true;
    if (node && node.hidden !== nextHidden) node.hidden = nextHidden;
}

function setNodeText(node, text) {
    if (node && node.textContent !== text) node.textContent = text;
}

function setNodeHidden(node, hidden) {
    const nextHidden = hidden === true;
    if (node && node.hidden !== nextHidden) node.hidden = nextHidden;
}

function setNodeTitle(node, title) {
    if (node && node.title !== title) node.title = title;
}

function getCachedNodeAttributes(node) {
    if (!node) return null;
    let attributes = nodeAttributeCache.get(node);
    if (!attributes) {
        attributes = new Map();
        nodeAttributeCache.set(node, attributes);
    }
    return attributes;
}

function setNodeAttribute(node, name, value) {
    if (!node || typeof node.setAttribute !== "function") return;
    const nextValue = String(value);
    const currentValue = typeof node.getAttribute === "function"
        ? node.getAttribute(name)
        : getCachedNodeAttributes(node)?.get(name);
    if (currentValue === nextValue) return;
    node.setAttribute(name, nextValue);
    getCachedNodeAttributes(node)?.set(name, nextValue);
}

function setDatasetValue(node, name, value) {
    if (!node?.dataset) return;
    const nextValue = String(value);
    if (node.dataset[name] !== nextValue) {
        node.dataset[name] = nextValue;
    }
}

function setClassToggled(node, className, enabled) {
    if (!node?.classList?.toggle) return;
    const nextEnabled = enabled === true;
    let classStates = nodeClassToggleCache.get(node);
    if (!classStates) {
        classStates = new Map();
        nodeClassToggleCache.set(node, classStates);
    }
    const actualEnabled = typeof node.classList.contains === "function"
        ? node.classList.contains(className)
        : null;
    if (actualEnabled === nextEnabled) {
        classStates.set(className, nextEnabled);
        return;
    }
    if (actualEnabled == null && classStates.get(className) === nextEnabled) return;
    node.classList.toggle(className, nextEnabled);
    classStates.set(className, nextEnabled);
}

function syncTimeOverlay(
    seconds = Number.NaN,
    hidden = false,
    missionTimeMs = Number.NaN,
    missionStartTimeMs = Number.NaN,
) {
    const overlay = getNode("background-media-time-overlay");
    if (!overlay) return;
    const safeSeconds = Number(seconds);
    const hasTime = Number.isFinite(safeSeconds) && safeSeconds >= 0;
    setNodeHidden(overlay, hidden === true || !hasTime);
    if (!hasTime) return;
    const label = formatStatusTime(safeSeconds);
    const metLabel = formatShortMissionElapsedTime(missionTimeMs, missionStartTimeMs);
    const combinedLabel = `${label}\n${metLabel}`;
    setNodeText(overlay, combinedLabel);
    setNodeTitle(overlay, `Broadcast time ${label}; ${metLabel}`);
}
export {
    getDocumentRef,
    getWindowRef,
    getNode,
    callMediaMethod,
    setText,
    setHidden,
    setNodeText,
    setNodeHidden,
    setNodeTitle,
    getCachedNodeAttributes,
    setNodeAttribute,
    setDatasetValue,
    setClassToggled,
    syncTimeOverlay,
};
