import { MAIN_VIEW_PANEL_ID } from "./dockview-workflow-panels.js";
import {
    createDeferredWorkspaceWork,
    scheduleDockviewMainControlRibbonArrangement,
} from "./experimental-dockview-controls.js";

function scheduleMainViewResize(work) {
    work.frame(() => {
        if (typeof globalThis?.__moonMissionResizeMainView === "function") {
            globalThis.__moonMissionResizeMainView();
        }
    });
}

function isMountedWithin(node, owner) {
    for (let parent = node?.parentNode; parent; parent = parent.parentNode) {
        if (parent === owner) return true;
    }
    return false;
}

function renderMainViewPanel(isOwnerCurrent = () => true) {
    const work = createDeferredWorkspaceWork(isOwnerCurrent);
    let disposed = false;
    const element = document.createElement("div");
    element.className = "experimental-dockview-panel experimental-dockview-panel--mounted mission-main-view-pane";
    const surface = document.createElement("div");
    surface.id = "mission-main-view-surface";
    surface.className = "mission-main-view-surface";
    element.appendChild(surface);

    const controlsStrip = document.getElementById("header-pill-strip");
    const mountedControls = controlsStrip
        ? {
            node: controlsStrip,
            originalParent: controlsStrip.parentNode,
            originalNextSibling: controlsStrip.nextSibling,
        }
        : null;
    if (mountedControls) {
        element.appendChild(mountedControls.node);
        mountedControls.node.classList.add("header-pill-strip--collapsed");
        mountedControls.node.classList.remove("header-pill-strip--groups-expanded");
        scheduleDockviewMainControlRibbonArrangement(document, work);
    }

    const mountIds = [
        "svg-top-baseline",
        "svg-wrapper",
        "canvas-wrapper",
        "mobile-moon-farside-overlay",
    ];
    const mountedNodes = mountIds
        .map((id) => document.getElementById(id))
        .filter(Boolean)
        .map((node) => ({
            node,
            originalParent: node.parentNode,
            originalNextSibling: node.nextSibling,
        }));

    for (const entry of mountedNodes) {
        surface.appendChild(entry.node);
    }
    scheduleMainViewResize(work);

    return {
        element,
        layout() {
            scheduleMainViewResize(work);
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            work.dispose();
            if (mountedControls && isMountedWithin(mountedControls.node, element)) {
                [
                    "header-pill-strip-primary",
                    "header-pill-strip-secondary",
                    "header-pill-strip-quaternary",
                    "header-pill-strip-tertiary",
                    "lunar-crater-controls-panel",
                    "surface-points-controls-panel",
                    "guides-controls-panel",
                ].forEach((id) => {
                    const node = document.getElementById(id);
                    if (node && node.parentElement !== mountedControls.node) {
                        mountedControls.node.appendChild(node);
                    }
                });
                const lunarGroup = element.querySelector(".mission-main-view-lunar-toggle .header-pill-group");
                if (lunarGroup) {
                    (document.getElementById("header-pill-strip-primary") || mountedControls.node).appendChild(lunarGroup);
                }
                const parent = mountedControls.originalParent || document.getElementById("header");
                if (parent) {
                    if (
                        mountedControls.originalNextSibling &&
                        mountedControls.originalNextSibling.parentNode === parent
                    ) {
                        parent.insertBefore(mountedControls.node, mountedControls.originalNextSibling);
                    } else {
                        parent.appendChild(mountedControls.node);
                    }
                }
            }
            for (const entry of mountedNodes) {
                if (!isMountedWithin(entry.node, element)) continue;
                const parent = entry.originalParent || document.getElementById("content-wrapper");
                if (!parent) continue;
                if (entry.originalNextSibling && entry.originalNextSibling.parentNode === parent) {
                    parent.insertBefore(entry.node, entry.originalNextSibling);
                } else {
                    parent.appendChild(entry.node);
                }
            }
        },
    };
}

function renderMountedElementPanel({ params }) {
    const element = document.createElement("div");
    element.className = "experimental-dockview-panel experimental-dockview-panel--mounted";
    const mountElementId = String(params?.mountElementId || "").trim();
    const mountClassName = String(params?.mountClassName || "").trim();
    let mountedElement = null;
    let originalParent = null;
    let originalNextSibling = null;
    let disposed = false;
    let observer = null;

    const mountElement = (candidate) => {
        if (disposed || !candidate || candidate === mountedElement) {
            return false;
        }
        mountedElement = candidate;
        originalParent = candidate.parentNode;
        originalNextSibling = candidate.nextSibling;
        if (mountClassName) {
            candidate.classList?.add?.(mountClassName);
        }
        if (mountElementId === "background-media-transcript") {
            candidate.hidden = false;
        }
        element.replaceChildren(candidate);
        if (typeof CustomEvent === "function") {
            candidate.dispatchEvent(new CustomEvent("moon-mission:dockview-panel-layout"));
            candidate.dispatchEvent(new CustomEvent("moon-mission:dockview-panel-mounted", {
                bubbles: true,
                detail: { mountElementId },
            }));
        }
        observer?.disconnect?.();
        observer = null;
        return true;
    };

    if (!mountElement(document.getElementById(mountElementId))) {
        element.textContent = "Waiting for panel content...";
        if (mountElementId && typeof MutationObserver !== "undefined") {
            observer = new MutationObserver(() => {
                mountElement(document.getElementById(mountElementId));
            });
            observer.observe(document.body || document.documentElement, {
                childList: true,
                subtree: true,
            });
        }
    }

    return {
        element,
        layout() {
            if (disposed) return;
            if (typeof CustomEvent === "function") {
                mountedElement?.dispatchEvent?.(new CustomEvent("moon-mission:dockview-panel-layout"));
            }
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            observer?.disconnect?.();
            if (!mountedElement || mountedElement.parentNode !== element) return;
            if (mountClassName) {
                mountedElement?.classList?.remove?.(mountClassName);
            }
            if (typeof CustomEvent === "function") {
                mountedElement?.dispatchEvent?.(new CustomEvent("moon-mission:dockview-panel-unmounted", {
                    bubbles: true,
                    detail: { mountElementId },
                }));
            }
            const fallbackParent = document.getElementById(params?.fallbackParentId || "");
            const nextParent = originalParent || fallbackParent;
            if (!nextParent || !mountedElement) return;
            if (originalNextSibling && originalNextSibling.parentNode === nextParent) {
                nextParent.insertBefore(mountedElement, originalNextSibling);
            } else {
                nextParent.appendChild(mountedElement);
            }
        },
    };
}

function renderPlaceholderPanel({ title, params }) {
    const element = document.createElement("div");
    element.className = "experimental-dockview-panel";
    const copy = params?.copy || "";
    const items = Array.isArray(params?.items) ? params.items : [];

    const heading = document.createElement("h2");
    heading.className = "experimental-dockview-panel__title";
    heading.textContent = title || "Panel";

    const paragraph = document.createElement("p");
    paragraph.className = "experimental-dockview-panel__copy";
    paragraph.textContent = copy;

    const list = document.createElement("ul");
    list.className = "experimental-dockview-panel__list";
    for (const item of items) {
        const row = document.createElement("li");
        row.textContent = item;
        list.appendChild(row);
    }

    element.replaceChildren(heading, paragraph, list);
    return element;
}

function renderExperimentalPanel(context, isOwnerCurrent) {
    if (context?.id === MAIN_VIEW_PANEL_ID) {
        return renderMainViewPanel(isOwnerCurrent);
    }
    if (context?.params?.mountElementId) {
        return renderMountedElementPanel(context);
    }
    return renderPlaceholderPanel(context);
}

export { renderExperimentalPanel };
