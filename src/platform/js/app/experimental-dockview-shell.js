import { resolveMissionKeyFromWindow } from "./panel-layout-store.js";

const DOCKVIEW_SPIKE_STORAGE_PREFIX = "moon-mission:dockview-spike:v10";
const DOCKVIEW_SPIKE_SHELL_STORAGE_SUFFIX = ":shell";
const DOCKVIEW_SPIKE_SHELL_MIN_WIDTH = 360;
const DOCKVIEW_SPIKE_SHELL_MIN_HEIGHT = 260;
const DOCKVIEW_SPIKE_SHELL_MARGIN = 12;
const DOCKVIEW_SPIKE_SHELL_DEFAULT_TOP = 126;
const DOCKVIEW_SPIKE_SHELL_DEFAULT_BOTTOM = 132;
const DOCKVIEW_SPIKE_SHELL_DEFAULT_WIDTH = 560;
function getDockviewSpikeStorageKey() {
    return `${DOCKVIEW_SPIKE_STORAGE_PREFIX}:${resolveMissionKeyFromWindow()}`;
}

function getDockviewSpikeShellStorageKey(storageKey = getDockviewSpikeStorageKey()) {
    return `${storageKey}${DOCKVIEW_SPIKE_SHELL_STORAGE_SUFFIX}`;
}

function getViewportSize(windowRef = globalThis?.window) {
    return {
        width: Math.max(1, Number(windowRef?.innerWidth) || 1440),
        height: Math.max(1, Number(windowRef?.innerHeight) || 900),
    };
}

function getDefaultShellRect(windowRef = globalThis?.window) {
    const viewport = getViewportSize(windowRef);
    const width = Math.min(
        DOCKVIEW_SPIKE_SHELL_DEFAULT_WIDTH,
        Math.max(DOCKVIEW_SPIKE_SHELL_MIN_WIDTH, viewport.width - (2 * DOCKVIEW_SPIKE_SHELL_MARGIN)),
    );
    const top = Math.min(
        DOCKVIEW_SPIKE_SHELL_DEFAULT_TOP,
        Math.max(DOCKVIEW_SPIKE_SHELL_MARGIN, viewport.height - DOCKVIEW_SPIKE_SHELL_MIN_HEIGHT - DOCKVIEW_SPIKE_SHELL_MARGIN),
    );
    const availableHeight = viewport.height - top - DOCKVIEW_SPIKE_SHELL_DEFAULT_BOTTOM;
    const height = Math.max(DOCKVIEW_SPIKE_SHELL_MIN_HEIGHT, availableHeight);
    return clampShellRect({
        left: viewport.width - width - DOCKVIEW_SPIKE_SHELL_MARGIN,
        top,
        width,
        height,
    }, windowRef);
}

function clampShellRect(rect, windowRef = globalThis?.window) {
    const viewport = getViewportSize(windowRef);
    const maxWidth = Math.max(DOCKVIEW_SPIKE_SHELL_MIN_WIDTH, viewport.width - (2 * DOCKVIEW_SPIKE_SHELL_MARGIN));
    const maxHeight = Math.max(DOCKVIEW_SPIKE_SHELL_MIN_HEIGHT, viewport.height - (2 * DOCKVIEW_SPIKE_SHELL_MARGIN));
    const width = Math.min(
        Math.max(Math.round(Number(rect?.width) || DOCKVIEW_SPIKE_SHELL_DEFAULT_WIDTH), DOCKVIEW_SPIKE_SHELL_MIN_WIDTH),
        maxWidth,
    );
    const height = Math.min(
        Math.max(Math.round(Number(rect?.height) || DOCKVIEW_SPIKE_SHELL_MIN_HEIGHT), DOCKVIEW_SPIKE_SHELL_MIN_HEIGHT),
        maxHeight,
    );
    const left = Math.min(
        Math.max(Math.round(Number(rect?.left) || DOCKVIEW_SPIKE_SHELL_MARGIN), DOCKVIEW_SPIKE_SHELL_MARGIN),
        Math.max(DOCKVIEW_SPIKE_SHELL_MARGIN, viewport.width - width - DOCKVIEW_SPIKE_SHELL_MARGIN),
    );
    const top = Math.min(
        Math.max(Math.round(Number(rect?.top) || DOCKVIEW_SPIKE_SHELL_MARGIN), DOCKVIEW_SPIKE_SHELL_MARGIN),
        Math.max(DOCKVIEW_SPIKE_SHELL_MARGIN, viewport.height - height - DOCKVIEW_SPIKE_SHELL_MARGIN),
    );
    return { left, top, width, height };
}

function readDockviewSpikeShellRect(storageKey, windowRef = globalThis?.window) {
    try {
        const raw = globalThis?.localStorage?.getItem?.(storageKey);
        if (!raw) return getDefaultShellRect(windowRef);
        return clampShellRect(JSON.parse(raw), windowRef);
    } catch {
        return getDefaultShellRect(windowRef);
    }
}

function writeDockviewSpikeShellRect(storageKey, rect) {
    try {
        globalThis?.localStorage?.setItem?.(storageKey, JSON.stringify(clampShellRect(rect)));
    } catch {
        // Ignore persistence failures in the experimental host.
    }
}

function applyShellRect(root, rect) {
    if (!root?.style) return;
    const clamped = clampShellRect(rect);
    root.style.left = `${clamped.left}px`;
    root.style.top = `${clamped.top}px`;
    root.style.width = `${clamped.width}px`;
    root.style.height = `${clamped.height}px`;
    root.style.right = "auto";
    root.style.bottom = "auto";
}

function readShellRectFromElement(root) {
    const rect = root?.getBoundingClientRect?.() || {};
    return clampShellRect({
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
    });
}

function createHostRoot(documentRef, { shellStorageKey } = {}) {
    const root = documentRef.createElement("section");
    root.id = "experimental-dockview-host";
    root.className = "experimental-dockview-host experimental-dockview-host--workspace";
    root.dataset.dockviewWorkspace = "true";
    root.setAttribute("aria-label", "Mission panel workspace");

    const toolbar = documentRef.createElement("div");
    toolbar.className = "experimental-dockview-host__toolbar";

    const label = documentRef.createElement("div");
    label.className = "experimental-dockview-host__label";
    label.textContent = "Mission panel workspace";
    toolbar.appendChild(label);

    const resetButton = documentRef.createElement("button");
    resetButton.id = "experimental-dockview-reset";
    resetButton.type = "button";
    resetButton.className = "experimental-dockview-host__button";
    resetButton.textContent = "Reset";
    resetButton.title = "Reset panel layout and dimensions";
    toolbar.appendChild(resetButton);

    const dockRoot = documentRef.createElement("div");
    dockRoot.className = "experimental-dockview-host__dock dockview-theme-abyss-spaced";

    const resizeGrip = documentRef.createElement("div");
    resizeGrip.className = "experimental-dockview-host__resize-grip";
    resizeGrip.setAttribute("aria-hidden", "true");

    root.append(toolbar, dockRoot, resizeGrip);
    (documentRef.getElementById("content-wrapper") ||
        documentRef.getElementById("wrapper") ||
        documentRef.body).appendChild(root);

    return { root, toolbar, dockRoot, resetButton, resizeGrip };
}

function bindShellInteractions({
    root,
    toolbar,
    resizeGrip,
    storageKey,
    onShellLayout,
}) {
    let dragState = null;
    let resizeState = null;

    const persist = () => {
        const rect = readShellRectFromElement(root);
        writeDockviewSpikeShellRect(storageKey, rect);
        onShellLayout?.();
    };

    const startDrag = (event) => {
        if (event.button !== 0) return;
        if (event.target?.closest?.("button, input, select, option, label, output, a")) return;
        const rect = root.getBoundingClientRect();
        dragState = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
        };
        toolbar.setPointerCapture?.(event.pointerId);
        event.preventDefault();
    };

    const moveDrag = (event) => {
        if (!dragState || dragState.pointerId !== event.pointerId) return;
        applyShellRect(root, {
            left: dragState.left + (event.clientX - dragState.startX),
            top: dragState.top + (event.clientY - dragState.startY),
            width: dragState.width,
            height: dragState.height,
        });
        onShellLayout?.();
        event.preventDefault();
    };

    const finishDrag = (event) => {
        if (!dragState || dragState.pointerId !== event.pointerId) return;
        toolbar.releasePointerCapture?.(event.pointerId);
        dragState = null;
        persist();
        event.preventDefault();
    };

    const startResize = (event) => {
        if (event.button !== 0) return;
        const rect = root.getBoundingClientRect();
        resizeState = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
        };
        resizeGrip.setPointerCapture?.(event.pointerId);
        event.preventDefault();
    };

    const moveResize = (event) => {
        if (!resizeState || resizeState.pointerId !== event.pointerId) return;
        applyShellRect(root, {
            left: resizeState.left,
            top: resizeState.top,
            width: resizeState.width + (event.clientX - resizeState.startX),
            height: resizeState.height + (event.clientY - resizeState.startY),
        });
        onShellLayout?.();
        event.preventDefault();
    };

    const finishResize = (event) => {
        if (!resizeState || resizeState.pointerId !== event.pointerId) return;
        resizeGrip.releasePointerCapture?.(event.pointerId);
        resizeState = null;
        persist();
        event.preventDefault();
    };

    const handleWindowResize = () => {
        applyShellRect(root, readShellRectFromElement(root));
        persist();
    };

    toolbar.addEventListener("pointerdown", startDrag);
    toolbar.addEventListener("pointermove", moveDrag);
    toolbar.addEventListener("pointerup", finishDrag);
    toolbar.addEventListener("pointercancel", finishDrag);
    resizeGrip.addEventListener("pointerdown", startResize);
    resizeGrip.addEventListener("pointermove", moveResize);
    resizeGrip.addEventListener("pointerup", finishResize);
    resizeGrip.addEventListener("pointercancel", finishResize);
    globalThis?.addEventListener?.("resize", handleWindowResize, { passive: true });

    return () => {
        toolbar.removeEventListener("pointerdown", startDrag);
        toolbar.removeEventListener("pointermove", moveDrag);
        toolbar.removeEventListener("pointerup", finishDrag);
        toolbar.removeEventListener("pointercancel", finishDrag);
        resizeGrip.removeEventListener("pointerdown", startResize);
        resizeGrip.removeEventListener("pointermove", moveResize);
        resizeGrip.removeEventListener("pointerup", finishResize);
        resizeGrip.removeEventListener("pointercancel", finishResize);
        globalThis?.removeEventListener?.("resize", handleWindowResize);
    };
}

export {
    applyShellRect,
    clampShellRect,
    createHostRoot,
    getDockviewSpikeShellStorageKey,
    getDockviewSpikeStorageKey,
    getDefaultShellRect,
    readDockviewSpikeShellRect,
};
