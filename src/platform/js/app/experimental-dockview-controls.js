import { MAIN_VIEW_PANEL_ID } from "./dockview-workflow-panels.js";
import { DEFAULT_DOCKVIEW_SPIKE_PANELS } from "./experimental-dockview-layout.js";

const DOCKVIEW_FLOATING_GROUP_WIDTH = 640;
const DOCKVIEW_FLOATING_GROUP_HEIGHT = 420;
function resolveDockviewPopoutUrl(locationRef = globalThis?.location) {
    try {
        return new URL("../popout.html", locationRef?.href || "http://127.0.0.1/").pathname;
    } catch {
        return "/popout.html";
    }
}

function getFullscreenElement(documentRef = globalThis?.document) {
    return documentRef?.fullscreenElement ||
        documentRef?.webkitFullscreenElement ||
        documentRef?.mozFullScreenElement ||
        documentRef?.msFullscreenElement ||
        null;
}

function getFullscreenRequestTarget(documentRef = globalThis?.document) {
    return documentRef?.documentElement || documentRef?.body || null;
}

function isFullscreenSupported(documentRef = globalThis?.document) {
    const target = getFullscreenRequestTarget(documentRef);
    return !!(
        target?.requestFullscreen ||
        target?.webkitRequestFullscreen ||
        target?.mozRequestFullScreen ||
        target?.msRequestFullscreen
    );
}

function invokeFullscreenPromise(result) {
    if (result && typeof result.catch === "function") {
        result.catch(() => {
            // Browsers can reject fullscreen requests outside direct user gestures.
        });
    }
}

function requestAppFullscreen(documentRef = globalThis?.document) {
    const target = getFullscreenRequestTarget(documentRef);
    const requestFullscreen =
        target?.requestFullscreen ||
        target?.webkitRequestFullscreen ||
        target?.mozRequestFullScreen ||
        target?.msRequestFullscreen;
    if (typeof requestFullscreen !== "function") return false;
    invokeFullscreenPromise(requestFullscreen.call(target));
    return true;
}

function exitAppFullscreen(documentRef = globalThis?.document) {
    const exitFullscreen =
        documentRef?.exitFullscreen ||
        documentRef?.webkitExitFullscreen ||
        documentRef?.mozCancelFullScreen ||
        documentRef?.msExitFullscreen;
    if (typeof exitFullscreen !== "function") return false;
    invokeFullscreenPromise(exitFullscreen.call(documentRef));
    return true;
}

function createFullscreenToggleButton(documentRef = globalThis?.document) {
    const button = documentRef.createElement("button");
    button.type = "button";
    button.id = "dockview-fullscreen-toggle";
    button.className = "dockview-panel-launch-strip__pill dockview-panel-launch-strip__pill--fullscreen";

    const icon = documentRef.createElement("span");
    icon.className = "dockview-panel-launch-strip__fullscreen-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "⛶";
    button.appendChild(icon);

    const supported = isFullscreenSupported(documentRef);
    button.disabled = !supported;
    button.setAttribute("aria-disabled", supported ? "false" : "true");

    const sync = () => {
        const isFullscreen = !!getFullscreenElement(documentRef);
        button.classList.toggle("is-active", isFullscreen);
        button.setAttribute("aria-pressed", isFullscreen ? "true" : "false");
        button.setAttribute(
            "aria-label",
            isFullscreen ? "Exit fullscreen" : "Enter fullscreen",
        );
        button.title = supported ? (isFullscreen ? "Exit fullscreen" : "Fullscreen") : "Fullscreen unavailable";
    };

    const toggle = () => {
        if (!supported) return;
        if (getFullscreenElement(documentRef)) {
            exitAppFullscreen(documentRef);
        } else {
            requestAppFullscreen(documentRef);
        }
        sync();
    };

    button.addEventListener("click", toggle);
    const fullscreenEvents = [
        "fullscreenchange",
        "webkitfullscreenchange",
        "mozfullscreenchange",
        "MSFullscreenChange",
    ];
    fullscreenEvents.forEach((eventName) => documentRef.addEventListener?.(eventName, sync));
    sync();

    return {
        button,
        dispose() {
            button.removeEventListener?.("click", toggle);
            fullscreenEvents.forEach((eventName) => documentRef.removeEventListener?.(eventName, sync));
        },
    };
}

// Each owner cancels its handles and also guards callbacks already delivered
// to the browser queue. A replacement host never inherits old deferred work.
function createDeferredWorkspaceWork(isOwnerCurrent = () => true) {
    let disposed = false;
    const timers = new Set();
    const frames = new Set();
    const active = () => !disposed && isOwnerCurrent();
    const timeout = (callback, delay = 0) => {
        if (!active()) return null;
        const handle = setTimeout(() => {
            timers.delete(handle);
            if (active()) callback();
        }, delay);
        timers.add(handle);
        return handle;
    };
    return {
        active,
        timeout,
        clearTimeout(handle) { timers.delete(handle); clearTimeout(handle); },
        frame(callback) {
            if (!active()) return null;
            if (typeof requestAnimationFrame !== "function") return timeout(callback);
            const handle = requestAnimationFrame(() => {
                frames.delete(handle);
                if (active()) callback();
            });
            frames.add(handle);
            return handle;
        },
        microtask(callback) { queueMicrotask(() => { if (active()) callback(); }); },
        dispose() {
            if (disposed) return;
            disposed = true;
            timers.forEach(handle => clearTimeout(handle));
            frames.forEach(handle => globalThis.cancelAnimationFrame?.(handle));
            timers.clear(); frames.clear();
        },
    };
}

function createDockviewPanelLaunchStrip(documentRef = globalThis?.document, isOwnerCurrent = () => true) {
    const header = documentRef?.getElementById?.("header");
    const navbar = header?.querySelector?.(".navbar") || header;
    if (!navbar || documentRef.getElementById("dockview-panel-launch-strip")) {
        return { dispose() {} };
    }
    const work = createDeferredWorkspaceWork(isOwnerCurrent);

    const strip = documentRef.createElement("div");
    strip.id = "dockview-panel-launch-strip";
    strip.className = "dockview-panel-launch-strip";
    strip.setAttribute("aria-label", "Open mission panels");

    const sourceButtons = [
        ["panel-pill-background", "Flyby", "workflow:background-media"],
        ["panel-pill-background", "Transcript", "workflow:background-transcript"],
        ["panel-pill-media", "Media", "workflow:media-browser"],
        ["flyby-pill", "Frame & Shoot", "aux:earth-rise-composer"],
        ["focus-pill-splashdown", "Splashdown", "workflow:splashdown"],
        ["panel-pill-craft-moon", "C -> M", "aux:moon"],
        ["panel-pill-craft-earth", "C -> E", "aux:earth"],
        ["panel-pill-earth-orbit-xy", "Orbit", "aux:earth-origin-orbit-xy"],
        ["compare-pill-button", "Compare"],
    ];

    const tools = documentRef.createElement("details");
    tools.className = "workspace-tools";
    const toolsSummary = documentRef.createElement("summary");
    toolsSummary.className = "dockview-panel-launch-strip__pill workspace-tools__summary";
    toolsSummary.textContent = "Tools";
    const toolsBody = documentRef.createElement("div");
    toolsBody.className = "workspace-tools__body";
    toolsBody.id = "workspace-tools-body";
    toolsSummary.setAttribute("aria-controls", toolsBody.id);
    tools.append(toolsSummary, toolsBody);
    const closeToolsAfterSelection = () => {
        if (!work.active()) return;
        if (tools.open) {
            tools.open = false;
            toolsSummary.focus();
        }
    };
    const sceneButton = documentRef.createElement("button");
    sceneButton.type = "button";
    sceneButton.className = "dockview-panel-launch-strip__pill workspace-scene-return";
    sceneButton.textContent = "Scene";
    sceneButton.addEventListener("click", () => {
        if (work.active()) globalThis.__moonMissionDockviewSpike?.progressiveWorkspace?.revealPanel(MAIN_VIEW_PANEL_ID);
    });
    strip.appendChild(sceneButton);

    const proxyButtons = sourceButtons.map(([targetId, label, panelId]) => {
        const button = documentRef.createElement("button");
        button.type = "button";
        button.className = "dockview-panel-launch-strip__pill";
        button.dataset.proxyTarget = targetId;
        button.dataset.shortLabel = label;
        if (panelId) button.dataset.workspacePanel = panelId;
        button.textContent = label;
        button.addEventListener("click", () => {
            if (!work.active()) return;
            const progressive = globalThis.__moonMissionDockviewSpike?.progressiveWorkspace;
            if (panelId === "workflow:background-transcript") {
                const host = globalThis.__moonMissionDockviewSpike?.layoutHost;
                if (!host?.api.getPanel(panelId)) host?.addPanel(DEFAULT_DOCKVIEW_SPIKE_PANELS[1]);
                progressive?.revealPanel(panelId);
                closeToolsAfterSelection();
                return;
            }
            if (panelId && progressive?.isCollapsed(panelId)) {
                progressive.revealPanel(panelId);
                closeToolsAfterSelection();
                return;
            }
            const target = documentRef.getElementById(targetId);
            const wasOpen = target?.getAttribute?.("aria-pressed") === "true";
            target?.dispatchEvent?.(new MouseEvent("click", { bubbles: true, cancelable: true }));
            if (panelId && !wasOpen) work.microtask(() => progressive?.revealPanel(panelId));
            closeToolsAfterSelection();
        });
        strip.appendChild(button);
        return button;
    });

    const orbitDetailsButton = documentRef.createElement("button");
    orbitDetailsButton.type = "button";
    orbitDetailsButton.id = "dockview-orbit-details-toggle";
    orbitDetailsButton.className = "dockview-panel-launch-strip__pill dockview-panel-launch-strip__pill--orbit-details";
    orbitDetailsButton.textContent = "Orbit Details";
    orbitDetailsButton.setAttribute("aria-expanded", "false");
    orbitDetailsButton.setAttribute("aria-haspopup", "true");
    orbitDetailsButton.title = "Show orbit detail toggles";
    const orbitDetailsPopover = documentRef.createElement("div");
    orbitDetailsPopover.id = "dockview-orbit-details-popover";
    orbitDetailsPopover.className = "dockview-orbit-details-popover";
    orbitDetailsPopover.hidden = true;
    orbitDetailsButton.addEventListener("click", () => {
        if (!work.active()) return;
        orbitDetailsPopover.hidden = !orbitDetailsPopover.hidden;
        orbitDetailsButton.setAttribute("aria-expanded", orbitDetailsPopover.hidden ? "false" : "true");
    });
    strip.append(orbitDetailsButton, orbitDetailsPopover);

    const resetViewButton = documentRef.createElement("button");
    resetViewButton.type = "button";
    resetViewButton.className = "dockview-panel-launch-strip__pill dockview-panel-launch-strip__pill--reset-view";
    resetViewButton.textContent = "Reset View";
    resetViewButton.title = "Reset panel layout and dimensions";
    resetViewButton.addEventListener("click", () => {
        if (!work.active()) return;
        if (typeof globalThis?.__moonMissionResetDockviewWorkspace === "function") {
            globalThis.__moonMissionResetDockviewWorkspace();
            return;
        }
        const resetButton = documentRef.getElementById("experimental-dockview-reset");
        resetButton?.dispatchEvent?.(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    strip.appendChild(resetViewButton);

    const fullscreenToggle = createFullscreenToggleButton(documentRef);
    strip.appendChild(fullscreenToggle.button);
    strip.appendChild(tools);
    const closeTools = event => {
        if (!work.active()) return;
        if (event.key === "Escape" && tools.open) {
            tools.open = false;
            toolsSummary.focus();
        }
    };
    const dismissTools = event => { if (work.active() && tools.open && !tools.contains(event.target)) tools.open = false; };
    documentRef.addEventListener("keydown", closeTools);
    documentRef.addEventListener("pointerdown", dismissTools);

    const setAttributeIfChanged = (element, name, value) => {
        const nextValue = String(value);
        if (element.getAttribute(name) !== nextValue) {
            element.setAttribute(name, nextValue);
        }
    };
    const setHiddenIfChanged = (element, hidden) => {
        if (element.hidden !== hidden) {
            element.hidden = hidden;
        }
    };

    const sync = () => {
        if (!work.active()) return;
        const progressive = globalThis.__moonMissionDockviewSpike?.progressiveWorkspace;
        const level = progressive?.level || "full";
        for (const button of proxyButtons) {
            const target = documentRef.getElementById(button.dataset.proxyTarget || "");
            const unavailable = !target || target.hidden || target.closest?.("[hidden]");
            setHiddenIfChanged(button, !!unavailable);
            button.disabled = !!target?.disabled || target?.getAttribute?.("aria-disabled") === "true";
            const collapsed = progressive?.isCollapsed(button.dataset.workspacePanel);
            setAttributeIfChanged(button, "aria-pressed", collapsed ? "false" : target?.getAttribute?.("aria-pressed") || "false");
            button.title = target?.title || `Open ${button.textContent} panel`;
            const transcript = button.dataset.workspacePanel === "workflow:background-transcript";
            const keepInline = (level === "full" && !transcript) || (level === "compact" && ["panel-pill-media", "flyby-pill"].includes(button.dataset.proxyTarget));
            if (transcript && level === "full") setHiddenIfChanged(button, true);
            const expandedLabels = { "C -> M": "Craft → Moon", "C -> E": "Craft → Earth" };
            const text = keepInline ? button.dataset.shortLabel : expandedLabels[button.dataset.shortLabel] || button.dataset.shortLabel;
            if (button.textContent !== text) button.textContent = text;
            const parent = keepInline ? strip : toolsBody;
            if (button.parentElement !== parent) parent.insertBefore(button, keepInline ? tools : null);
        }
        for (const button of [orbitDetailsButton, resetViewButton]) {
            const parent = level === "full" ? strip : toolsBody;
            if (button.parentElement !== parent) parent.insertBefore(button, level === "full" ? tools : null);
        }
        // Keep logical order as different controls move into the overflow.
        const overflowButtons = [...proxyButtons, orbitDetailsButton, resetViewButton]
            .filter(button => button.parentElement === toolsBody);
        overflowButtons.forEach((button, index) => {
            if (toolsBody.children[index] !== button) toolsBody.insertBefore(button, toolsBody.children[index] || null);
        });
        tools.hidden = level === "full";
        sceneButton.hidden = !["minimal", "focused"].includes(level);
        setHiddenIfChanged(resetViewButton, false);
    };

    navbar.appendChild(strip);
    sync();
    documentRef.addEventListener("moon-mission:workspace-disclosure-change", sync);

    const observer = typeof MutationObserver === "function"
        ? new MutationObserver(sync)
        : null;
    for (const [targetId] of sourceButtons) {
        const target = documentRef.getElementById(targetId);
        if (target) {
            observer?.observe?.(target, {
                attributes: true,
                attributeFilter: ["aria-pressed", "class", "hidden", "style", "title"],
            });
        }
    }
    return {
        dispose() {
            work.dispose();
            documentRef.removeEventListener("moon-mission:workspace-disclosure-change", sync);
            documentRef.removeEventListener("keydown", closeTools);
            documentRef.removeEventListener("pointerdown", dismissTools);
            observer?.disconnect?.();
            fullscreenToggle.dispose();
            strip.remove();
        },
    };
}

function enableAuxiliaryPanelsForDockviewDefaults(documentRef = globalThis?.document) {
    const toggle = documentRef?.getElementById?.("view-aux-camera-panels");
    if (!toggle || toggle.disabled || toggle.checked === true) {
        return;
    }
    toggle.checked = true;
    toggle.dispatchEvent(new Event("click", { bubbles: true }));
}

function arrangeDockviewMainControlRibbon(documentRef = globalThis?.document) {
    const strip = documentRef?.getElementById?.("header-pill-strip");
    if (!strip) return;
    const mainPane = strip.closest?.(".mission-main-view-pane") || null;

    const primaryRow = documentRef.getElementById("header-pill-strip-primary");
    const secondaryRow = documentRef.getElementById("header-pill-strip-secondary");
    const tertiaryRow = documentRef.getElementById("header-pill-strip-tertiary");
    if (!primaryRow || !secondaryRow || !tertiaryRow) return;

    let quaternaryRow = documentRef.getElementById("header-pill-strip-quaternary");
    if (!quaternaryRow) {
        quaternaryRow = documentRef.createElement("div");
        quaternaryRow.id = "header-pill-strip-quaternary";
        quaternaryRow.className = "header-pill-strip__row header-pill-strip__row--quaternary";
        quaternaryRow.setAttribute("aria-label", "Lunar and tool controls");
        strip.appendChild(quaternaryRow);
    }

    const ensureMainViewOverlay = (className, label) => {
        if (!mainPane) return null;
        let overlay = mainPane.querySelector(`.${className}`);
        if (!overlay) {
            overlay = documentRef.createElement("div");
            overlay.className = className;
            overlay.setAttribute("aria-label", label);
            mainPane.appendChild(overlay);
        }
        return overlay;
    };
    const annotationOverlay = ensureMainViewOverlay(
        "mission-main-view-annotation-bar",
        "Annotation controls",
    );
    const viewOverlay = annotationOverlay;
    const toggleOverlay = ensureMainViewOverlay(
        "mission-main-view-toggle-launcher",
        "View toggle controls",
    );
    [
        "lunar-crater-controls-panel",
        "surface-points-controls-panel",
        "guides-controls-panel",
    ].forEach((id) => {
        const panel = documentRef.getElementById(id);
        if (panel && mainPane && panel.parentElement !== mainPane) {
            mainPane.appendChild(panel);
        }
    });
    if (viewOverlay && !viewOverlay.querySelector(".mission-main-view-view-launcher__button")) {
        const viewButton = documentRef.createElement("button");
        viewButton.type = "button";
        viewButton.className = "header-pill-segment__btn mission-main-view-view-launcher__button";
        viewButton.textContent = "View";
        viewButton.setAttribute("aria-expanded", "false");
        viewButton.setAttribute("aria-haspopup", "dialog");
        viewButton.title = "View controls";
        viewButton.addEventListener("click", () => {
            const body = mainPane?.querySelector(".mission-main-view-view-launcher__body");
            if (!body) return;
            body.hidden = !body.hidden;
            viewButton.setAttribute("aria-expanded", body.hidden ? "false" : "true");
            viewButton.classList.toggle("is-open", !body.hidden);
        });
        viewOverlay.appendChild(viewButton);
    }
    if (toggleOverlay && !toggleOverlay.querySelector(".mission-main-view-toggle-launcher__button")) {
        const toggleButton = documentRef.createElement("button");
        toggleButton.type = "button";
        toggleButton.className = "mission-main-view-toggle-launcher__button";
        toggleButton.setAttribute("aria-label", "Show view toggles");
        toggleButton.title = "Show view toggles";
        const toggleBody = documentRef.createElement("div");
        toggleBody.className = "mission-main-view-toggle-launcher__body";
        toggleOverlay.append(toggleButton, toggleBody);
    }
    const toggleBody = toggleOverlay?.querySelector(".mission-main-view-toggle-launcher__body") || null;
    let viewBody = mainPane?.querySelector(".mission-main-view-view-launcher__body") || null;
    if (mainPane && !viewBody) {
        viewBody = documentRef.createElement("div");
        viewBody.id = "dockview-view-controls-popover";
        viewBody.className = "mission-main-view-view-launcher__body";
        viewBody.hidden = true;
        mainPane.appendChild(viewBody);
    }
    if (viewBody && !viewBody.id) {
        viewBody.id = "dockview-view-controls-popover";
    }
    const viewButton = annotationOverlay?.querySelector(".mission-main-view-view-launcher__button");
    if (viewButton && viewBody?.id) {
        viewButton.setAttribute("aria-controls", viewBody.id);
    }
    let viewHeader = viewBody?.querySelector(".mission-main-view-view-launcher__header") || null;
    if (viewBody && !viewHeader) {
        viewHeader = documentRef.createElement("div");
        viewHeader.className = "mission-main-view-view-launcher__header";
        const closeButton = documentRef.createElement("button");
        closeButton.type = "button";
        closeButton.className = "experimental-dockview-host__header-action experimental-dockview-host__header-action--close mission-main-view-view-launcher__close";
        closeButton.title = "Close view controls";
        closeButton.setAttribute("aria-label", "Close view controls");
        const closeIcon = documentRef.createElement("span");
        closeIcon.className = "experimental-dockview-host__header-action-icon";
        closeIcon.setAttribute("aria-hidden", "true");
        closeButton.appendChild(closeIcon);
        closeButton.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            viewBody.hidden = true;
            viewButton?.setAttribute("aria-expanded", "false");
            viewButton?.classList.remove("is-open");
        });
        viewHeader.append(closeButton);
        viewBody.prepend(viewHeader);
    }
    const orbitDetailsPopover = documentRef.getElementById("dockview-orbit-details-popover");

    const appendById = (row, id) => {
        const element = documentRef.getElementById(id);
        if (element) {
            row.appendChild(element);
        }
        return element;
    };
    const appendGroupByLabel = (row, labelText) => {
        const groups = [
            ...Array.from(mainPane?.querySelectorAll?.(".header-pill-group") || []),
            ...Array.from(strip.querySelectorAll(".header-pill-group") || []),
            ...Array.from(documentRef.querySelectorAll?.(".header-pill-group") || []),
        ];
        const group = groups
            .find((candidate) => candidate.querySelector(".header-pill-group__label")?.textContent?.trim() === labelText);
        if (group) {
            row.appendChild(group);
        }
        return group;
    };
    const appendAnnotationSegment = (row) => {
        const existingSegment = documentRef.getElementById("toggle-pill-lunar-craters")?.closest?.(".header-pill-segment");
        if (existingSegment) {
            row.appendChild(existingSegment);
            return;
        }
        const groups = [
            ...Array.from(mainPane?.querySelectorAll?.(".header-pill-group") || []),
            ...Array.from(strip.querySelectorAll(".header-pill-group") || []),
            ...Array.from(documentRef.querySelectorAll?.(".header-pill-group") || []),
        ];
        const group = groups
            .find((candidate) => candidate.querySelector(".header-pill-group__label")?.textContent?.trim() === "Annotations");
        const segment = group?.querySelector?.(".header-pill-segment");
        if (segment) {
            row.appendChild(segment);
        }
        if (group && !group.querySelector(".header-pill-segment")) {
            group.remove?.();
        }
    };

    for (const row of [primaryRow, secondaryRow, tertiaryRow, quaternaryRow]) {
        const spacer = row.querySelector(".header-pill-strip__spacer");
        if (spacer) {
            row.appendChild(spacer);
        }
    }

    annotationOverlay?.appendChild(quaternaryRow);
    appendAnnotationSegment(quaternaryRow);
    if (viewButton && quaternaryRow.firstChild !== viewButton) {
        quaternaryRow.insertBefore(viewButton, quaternaryRow.firstChild);
    }

    viewBody?.appendChild(primaryRow);
    viewBody?.appendChild(secondaryRow);

    appendGroupByLabel(primaryRow, "Origin");
    appendGroupByLabel(primaryRow, "Dimension");
    appendGroupByLabel(primaryRow, "Plane");
    appendGroupByLabel(secondaryRow, "Follow");
    appendGroupByLabel(secondaryRow, "View");
    appendGroupByLabel(secondaryRow, "Zoom");

    const lunarGroup = appendGroupByLabel(toggleBody, "Lunar");
    if (lunarGroup) {
        lunarGroup.classList.add("mission-main-view-lunar-toggle-item");
        lunarGroup.setAttribute("aria-label", "Detailed lunar texture");
        const fastPill = lunarGroup.querySelector("#moon-profile-pill-fast");
        const qualityPill = lunarGroup.querySelector("#moon-profile-pill-quality");
        if (fastPill) {
            fastPill.hidden = true;
        }
        if (qualityPill) {
            qualityPill.textContent = "Detailed Texture";
            qualityPill.title = "Toggle detailed Moon texture";
            qualityPill.setAttribute("aria-label", "Toggle detailed Moon texture");
            qualityPill.dataset.toggleProfileOff = "fast";
        }
    }
    toggleBody?.appendChild(tertiaryRow);
    const tertiaryLabel = tertiaryRow?.querySelector?.(".header-pill-group__label");
    if (tertiaryLabel?.textContent?.trim() === "Annotations") {
        tertiaryLabel.remove();
    }

    const advancedWrap = appendById(viewBody || strip, "advanced-controls-pill-wrap");
    advancedWrap?.classList?.toggle?.("mission-main-view-advanced-pill", !!viewBody);

    const restoreDockviewToggleLabel = (element, id) => {
        if (!element) return;
        const fullLabel = element.getAttribute("aria-label") ||
            element.getAttribute("title") ||
            element.textContent?.trim() ||
            id;
        delete element.dataset.compactLabel;
        element.textContent = fullLabel.replace(/^Toggle\s+/i, "");
        element.setAttribute("aria-label", fullLabel);
        element.setAttribute("title", fullLabel);
    };

    [
        "locators-pill",
        "toggle-pill-landing",
        "toggle-pill-orbit",
        "toggle-pill-descent",
        "toggle-pill-moon-orbit",
        "toggle-pill-sky",
        "toggle-pill-constellations",
        "toggle-pill-moon-soi",
        "toggle-pill-moon-hill-sphere",
        "toggle-pill-ecliptic",
        "toggle-pill-equatorial",
        "toggle-pill-craters",
    ].forEach((id) => restoreDockviewToggleLabel(appendById(tertiaryRow, id), id));

    appendById(strip, "compare-pill-wrap");
    appendGroupByLabel(strip, "Panels");
}

function scheduleDockviewMainControlRibbonArrangement(documentRef, work) {
    arrangeDockviewMainControlRibbon(documentRef);
    work.frame(() => arrangeDockviewMainControlRibbon(documentRef));
    work.timeout(() => arrangeDockviewMainControlRibbon(documentRef), 250);
}

function getFloatingGroupPosition(group) {
    const rect = group?.element?.getBoundingClientRect?.() || {};
    const viewportWidth = Math.max(1, Number(globalThis?.innerWidth) || 1440);
    const viewportHeight = Math.max(1, Number(globalThis?.innerHeight) || 900);
    const width = Math.min(DOCKVIEW_FLOATING_GROUP_WIDTH, Math.max(360, viewportWidth - 48));
    const height = Math.min(DOCKVIEW_FLOATING_GROUP_HEIGHT, Math.max(260, viewportHeight - 48));
    const x = Math.min(
        Math.max(24, Math.round(Number(rect.left) || ((viewportWidth - width) / 2))),
        Math.max(24, viewportWidth - width - 24),
    );
    const y = Math.min(
        Math.max(24, Math.round(Number(rect.top) || ((viewportHeight - height) / 2))),
        Math.max(24, viewportHeight - height - 24),
    );
    return { x, y, width, height };
}

function getHeaderActionTarget({ group, activePanel }) {
    return group || activePanel;
}

function openDockviewPopout(containerApi, target, popoutUrl) {
    const result = containerApi?.addPopoutGroup?.(target, { popoutUrl });
    if (result && typeof result.catch === "function") {
        result.catch((error) => {
            console.warn("Unable to open Dockview panel in a new window.", error);
        });
    }
    return result;
}

function createDockviewHeaderButton({ className, label, title, onClick }) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `experimental-dockview-host__header-action ${className || ""}`.trim();
    button.title = title;
    button.setAttribute("aria-label", label);
    const icon = document.createElement("span");
    icon.className = "experimental-dockview-host__header-action-icon";
    icon.setAttribute("aria-hidden", "true");
    button.appendChild(icon);
    button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick?.();
    });
    return button;
}

class DockviewMissionHeaderActionsRenderer {
    constructor({ popoutUrl = resolveDockviewPopoutUrl() } = {}) {
        this.popoutUrl = popoutUrl;
        this.element = document.createElement("div");
        this.element.className = "experimental-dockview-host__header-actions";
    }

    init(params) {
        const group = params?.group;
        const groupApi = params?.api;
        const containerApi = params?.containerApi;
        const getActivePanel = () => group?.activePanel || params?.activePanel;

        const maximizeButton = createDockviewHeaderButton({
            className: "experimental-dockview-host__header-action--maximize",
            label: "Maximize panel group",
            title: "Maximize or restore this group",
            onClick: () => {
                if (groupApi?.isMaximized?.()) {
                    groupApi.exitMaximized?.();
                } else {
                    groupApi?.maximize?.();
                }
            },
        });
        const floatButton = createDockviewHeaderButton({
            className: "experimental-dockview-host__header-action--float",
            label: "Float panel group",
            title: "Float this group as a resizable panel",
            onClick: () => {
                containerApi?.addFloatingGroup?.(
                    getHeaderActionTarget({ group, activePanel: getActivePanel() }),
                    getFloatingGroupPosition(group),
                );
            },
        });
        const popoutButton = createDockviewHeaderButton({
            className: "experimental-dockview-host__header-action--popout",
            label: "Open panel group in a new window",
            title: "Open this group in a new window",
            onClick: () => {
                openDockviewPopout(
                    containerApi,
                    getHeaderActionTarget({ group, activePanel: getActivePanel() }),
                    this.popoutUrl,
                );
            },
        });

        this.element.replaceChildren(maximizeButton, floatButton, popoutButton);
    }

    dispose() {
        this.element.replaceChildren();
    }
}

function createDockviewHeaderActionsRenderer(options) {
    return new DockviewMissionHeaderActionsRenderer(options);
}

function createDockviewTabContextMenuItems({ panel, group, api } = {}) {
    const target = panel || group;
    const popoutUrl = resolveDockviewPopoutUrl();
    return [
        {
            label: "Maximize Group",
            action: () => {
                if (group?.api?.isMaximized?.()) {
                    group.api.exitMaximized?.();
                } else {
                    group?.api?.maximize?.();
                }
            },
        },
        {
            label: "Float Group",
            action: () => api?.addFloatingGroup?.(group || target, getFloatingGroupPosition(group)),
        },
        {
            label: "Open in New Window",
            action: () => openDockviewPopout(api, target, popoutUrl),
        },
        "separator",
        "close",
        "closeOthers",
        "closeAll",
    ];
}

export {
    createDeferredWorkspaceWork,
    createDockviewHeaderActionsRenderer,
    createDockviewPanelLaunchStrip,
    createDockviewTabContextMenuItems,
    createFullscreenToggleButton,
    enableAuxiliaryPanelsForDockviewDefaults,
    resolveDockviewPopoutUrl,
    scheduleDockviewMainControlRibbonArrangement,
};
