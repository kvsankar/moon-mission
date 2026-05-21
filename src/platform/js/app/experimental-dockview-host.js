import "dockview-core/dist/styles/dockview.css";

import { createPanelLayoutHost } from "./panel-layout-host.js";
import { readPanelLayoutHostState } from "./panel-layout-host.js";
import {
    getMissionPanelSnapshot,
    invokeMissionPanelAction,
    subscribeMissionPanels,
} from "./panel-registry.js";
import {
    DOCKED_WORKFLOW_PANEL_IDS,
    MAIN_VIEW_PANEL_ID,
} from "./dockview-workflow-panels.js";
import { resolveMissionKeyFromWindow } from "./panel-layout-store.js";

const DOCKVIEW_SPIKE_PARAM = "dockPanels";
const LEGACY_PANELS_PARAM = "legacyPanels";
const DOCKVIEW_SPIKE_STORAGE_PREFIX = "moon-mission:dockview-spike:v10";
const DOCKVIEW_SPIKE_SHELL_STORAGE_SUFFIX = ":shell";
const DOCKVIEW_SPIKE_SHELL_MIN_WIDTH = 360;
const DOCKVIEW_SPIKE_SHELL_MIN_HEIGHT = 260;
const DOCKVIEW_SPIKE_SHELL_MARGIN = 12;
const DOCKVIEW_SPIKE_SHELL_DEFAULT_TOP = 126;
const DOCKVIEW_SPIKE_SHELL_DEFAULT_BOTTOM = 132;
const DOCKVIEW_SPIKE_SHELL_DEFAULT_WIDTH = 560;
const DEFAULT_OPEN_DOCKVIEW_PANEL_IDS = [
    "workflow:background-media",
    "workflow:background-transcript",
    "workflow:media-browser",
    "aux:earth-rise-composer",
    "aux:moon",
    "aux:earth",
    "aux:earth-origin-orbit-xy",
];
const DEFAULT_CLOSED_DOCKVIEW_PANEL_IDS = [
    "aux:earth-rise-composer-controls",
    "aux:earth-to-moon",
    "workflow:splashdown",
];
const DEFAULT_WORKSPACE_PANEL_IDS = [
    MAIN_VIEW_PANEL_ID,
    ...DEFAULT_OPEN_DOCKVIEW_PANEL_IDS,
];
const DOCKVIEW_FLOATING_GROUP_WIDTH = 640;
const DOCKVIEW_FLOATING_GROUP_HEIGHT = 420;

function isTruthyParamValue(value) {
    const normalized = String(value || "").trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes";
}

function isFalseyParamValue(value) {
    const normalized = String(value || "").trim().toLowerCase();
    return normalized === "0" || normalized === "false" || normalized === "no";
}

function isDesktopDockviewViewport(windowRef = globalThis?.window) {
    return (Number(windowRef?.innerWidth) || 0) > 600;
}

function isDockviewSpikeEnabled(urlSearch = globalThis?.location?.search || "", windowRef = globalThis?.window) {
    const params = new URLSearchParams(urlSearch);
    const legacyValue = params.get(LEGACY_PANELS_PARAM);
    if (isTruthyParamValue(legacyValue)) {
        return false;
    }
    const dockviewValue = params.get(DOCKVIEW_SPIKE_PARAM);
    if (isTruthyParamValue(dockviewValue)) {
        return true;
    }
    if (isFalseyParamValue(dockviewValue)) {
        return false;
    }
    return isDesktopDockviewViewport(windowRef);
}

function getDockviewSpikeStorageKey() {
    return `${DOCKVIEW_SPIKE_STORAGE_PREFIX}:${resolveMissionKeyFromWindow()}`;
}

function getDockviewSpikeShellStorageKey(storageKey = getDockviewSpikeStorageKey()) {
    return `${storageKey}${DOCKVIEW_SPIKE_SHELL_STORAGE_SUFFIX}`;
}

function resolveDockviewPopoutUrl(locationRef = globalThis?.location) {
    try {
        return new URL("../popout.html", locationRef?.href || "http://127.0.0.1/").pathname;
    } catch {
        return "/popout.html";
    }
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

function createDockviewPanelLaunchStrip(documentRef = globalThis?.document) {
    const header = documentRef?.getElementById?.("header");
    const navbar = header?.querySelector?.(".navbar") || header;
    if (!navbar || documentRef.getElementById("dockview-panel-launch-strip")) {
        return { dispose() {} };
    }

    const strip = documentRef.createElement("div");
    strip.id = "dockview-panel-launch-strip";
    strip.className = "dockview-panel-launch-strip";
    strip.setAttribute("aria-label", "Open mission panels");

    const sourceButtons = [
        ["panel-pill-background", "Flyby"],
        ["panel-pill-media", "Media"],
        ["flyby-pill", "Frame & Shoot"],
        ["focus-pill-splashdown", "Splashdown"],
        ["panel-pill-craft-moon", "C -> M"],
        ["panel-pill-craft-earth", "C -> E"],
        ["panel-pill-earth-orbit-xy", "Orbit"],
        ["compare-pill-button", "Compare"],
    ];

    const proxyButtons = sourceButtons.map(([targetId, label]) => {
        const button = documentRef.createElement("button");
        button.type = "button";
        button.className = "dockview-panel-launch-strip__pill";
        button.dataset.proxyTarget = targetId;
        button.textContent = label;
        button.addEventListener("click", () => {
            const target = documentRef.getElementById(targetId);
            target?.dispatchEvent?.(new MouseEvent("click", { bubbles: true, cancelable: true }));
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
        for (const button of proxyButtons) {
            const target = documentRef.getElementById(button.dataset.proxyTarget || "");
            const unavailable = !target || target.hidden || target.closest?.("[hidden]");
            setHiddenIfChanged(button, !!unavailable);
            setAttributeIfChanged(button, "aria-pressed", target?.getAttribute?.("aria-pressed") || "false");
            button.title = target?.title || `Open ${button.textContent} panel`;
        }
        setHiddenIfChanged(resetViewButton, false);
    };

    navbar.appendChild(strip);
    sync();

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

function scheduleDockviewMainControlRibbonArrangement(documentRef = globalThis?.document) {
    arrangeDockviewMainControlRibbon(documentRef);
    const scheduleFrame = typeof requestAnimationFrame === "function"
        ? requestAnimationFrame
        : (callback) => setTimeout(callback, 0);
    scheduleFrame(() => arrangeDockviewMainControlRibbon(documentRef));
    setTimeout(() => arrangeDockviewMainControlRibbon(documentRef), 250);
}

function clampWorkspaceSize(value, min, max) {
    return Math.min(Math.max(Math.round(Number(value) || min), min), max);
}

function shrinkWorkspaceRailSizes(sizes, targetMain, width) {
    let { leftRail, frameShoot, auxRail } = sizes;
    const currentMain = width - leftRail - frameShoot - auxRail;
    const deficit = Math.max(0, targetMain - currentMain);
    if (deficit <= 0) {
        return { leftRail, frameShoot, auxRail };
    }

    const compactMinimums = {
        leftRail: 180,
        frameShoot: 200,
        auxRail: 130,
    };
    let remainingDeficit = deficit;

    for (const key of ["leftRail", "frameShoot", "auxRail"]) {
        const current = key === "leftRail" ? leftRail : key === "frameShoot" ? frameShoot : auxRail;
        const shrink = Math.min(current - compactMinimums[key], Math.ceil(remainingDeficit / 3));
        if (shrink <= 0) {
            continue;
        }
        if (key === "leftRail") {
            leftRail -= shrink;
        } else if (key === "frameShoot") {
            frameShoot -= shrink;
        } else {
            auxRail -= shrink;
        }
        remainingDeficit -= shrink;
    }

    return { leftRail, frameShoot, auxRail };
}

function calculateDefaultDockviewWorkspaceSizes(width, height) {
    const initialSizes = {
        leftRail: clampWorkspaceSize(width * 0.255, 320, 500),
        frameShoot: clampWorkspaceSize(width * 0.34, 360, 680),
        auxRail: clampWorkspaceSize(width * 0.113, 170, 240),
    };
    const targetMain = Math.min(width - 420, 560);
    const railSizes = shrinkWorkspaceRailSizes(initialSizes, targetMain, width);
    return {
        ...railSizes,
        main: Math.max(360, width - railSizes.leftRail - railSizes.frameShoot - railSizes.auxRail),
    };
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

function applyDefaultDockviewWorkspaceLayout(layoutHost) {
    const api = layoutHost?.api;
    if (!api?.fromJSON || !api?.toJSON) {
        return false;
    }
    if (!DEFAULT_WORKSPACE_PANEL_IDS.every((panelId) => api.getPanel?.(panelId))) {
        return false;
    }
    const current = api.toJSON();
    const width = Math.max(900, Math.round(Number(api.width) || globalThis?.innerWidth || 1440));
    const height = Math.max(520, Math.round(Number(api.height) || globalThis?.innerHeight || 760));
    const {
        leftRail,
        frameShoot,
        auxRail,
        main,
    } = calculateDefaultDockviewWorkspaceSizes(width, height);
    const broadcastHeight = clampWorkspaceSize((leftRail * 9 / 16) + 48, 220, Math.max(260, Math.round(height * 0.48)));
    const transcriptHeight = Math.max(220, height - broadcastHeight);
    const frameShootHeight = clampWorkspaceSize(Math.round(height * 0.51), 260, Math.max(280, height - 260));
    const mediaHeight = Math.max(240, height - frameShootHeight);
    const auxThirdHeight = Math.max(160, Math.round(height / 3));

    api.fromJSON({
        grid: {
            root: {
                type: "branch",
                data: [
                    {
                        type: "branch",
                        data: [
                            {
                                type: "leaf",
                                data: {
                                    views: ["workflow:background-media"],
                                    activeView: "workflow:background-media",
                                    id: "left-broadcast",
                                },
                                size: broadcastHeight,
                            },
                            {
                                type: "leaf",
                                data: {
                                    views: ["workflow:background-transcript"],
                                    activeView: "workflow:background-transcript",
                                    id: "left-broadcast-transcript",
                                },
                                size: transcriptHeight,
                            },
                        ],
                        size: leftRail,
                    },
                    {
                        type: "leaf",
                        data: {
                            views: [MAIN_VIEW_PANEL_ID],
                            activeView: MAIN_VIEW_PANEL_ID,
                            id: "main-view",
                        },
                        size: main,
                    },
                    {
                        type: "branch",
                        data: [
                            {
                                type: "leaf",
                                data: {
                                    views: ["aux:earth-rise-composer"],
                                    activeView: "aux:earth-rise-composer",
                                    id: "right-frame-shoot",
                                },
                                size: frameShootHeight,
                            },
                            {
                                type: "leaf",
                                data: {
                                    views: ["workflow:media-browser"],
                                    activeView: "workflow:media-browser",
                                    id: "right-media",
                                },
                                size: mediaHeight,
                            },
                        ],
                        size: frameShoot,
                    },
                    {
                        type: "branch",
                        data: [
                            {
                                type: "leaf",
                                data: {
                                    views: ["aux:moon"],
                                    activeView: "aux:moon",
                                    id: "right-craft-moon",
                                },
                                size: auxThirdHeight,
                            },
                            {
                                type: "leaf",
                                data: {
                                    views: ["aux:earth"],
                                    activeView: "aux:earth",
                                    id: "right-craft-earth",
                                },
                                size: auxThirdHeight,
                            },
                            {
                                type: "leaf",
                                data: {
                                    views: ["aux:earth-origin-orbit-xy"],
                                    activeView: "aux:earth-origin-orbit-xy",
                                    id: "right-orbit",
                                },
                                size: auxThirdHeight,
                            },
                        ],
                        size: auxRail,
                    },
                ],
                size: height,
            },
            width,
            height,
            orientation: "HORIZONTAL",
        },
        panels: current.panels,
        activeGroup: "main-view",
    }, { reuseExistingPanels: true });
    api.layout?.(width, height, true);
    layoutHost.focusPanel?.(MAIN_VIEW_PANEL_ID);
    layoutHost.saveLayout?.();
    return true;
}

const DEFAULT_DOCKVIEW_SPIKE_PANELS = [
    {
        id: MAIN_VIEW_PANEL_ID,
        component: "mission-main-view",
        title: "Main View",
        minimumWidth: 560,
        minimumHeight: 260,
        params: {
            required: true,
        },
    },
    {
        id: "workflow:background-transcript",
        component: "mounted-element",
        title: "Broadcast Transcript",
        minimumWidth: 280,
        minimumHeight: 160,
        params: {
            mountElementId: "background-media-transcript",
            mountClassName: "background-media-panel__transcript--dockview",
            fallbackParentId: "background-media-panel",
        },
    },
];

function scheduleMainViewResize() {
    const schedule = typeof requestAnimationFrame === "function"
        ? requestAnimationFrame
        : (callback) => setTimeout(callback, 0);
    schedule(() => {
        if (typeof globalThis?.__moonMissionResizeMainView === "function") {
            globalThis.__moonMissionResizeMainView();
        }
    });
}

function renderMainViewPanel() {
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
        scheduleDockviewMainControlRibbonArrangement(document);
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
    scheduleMainViewResize();

    return {
        element,
        layout() {
            scheduleMainViewResize();
        },
        dispose() {
            if (mountedControls) {
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
                const parent = entry.originalParent || document.getElementById("content-wrapper");
                if (!parent) continue;
                if (entry.originalNextSibling && entry.originalNextSibling.parentNode === parent) {
                    parent.insertBefore(entry.node, entry.originalNextSibling);
                } else {
                    parent.appendChild(entry.node);
                }
            }
            scheduleMainViewResize();
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
            if (typeof CustomEvent === "function") {
                mountedElement?.dispatchEvent?.(new CustomEvent("moon-mission:dockview-panel-layout"));
            }
        },
        dispose() {
            disposed = true;
            observer?.disconnect?.();
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

function renderExperimentalPanel(context) {
    if (context?.id === MAIN_VIEW_PANEL_ID) {
        return renderMainViewPanel();
    }
    if (context?.params?.mountElementId) {
        return renderMountedElementPanel(context);
    }
    return renderPlaceholderPanel(context);
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

function initializeExperimentalDockviewHost() {
    if (!isDockviewSpikeEnabled()) {
        return null;
    }

    const documentRef = globalThis?.document;
    if (!documentRef?.body) {
        return null;
    }

    globalThis.__moonMissionDockviewSpike?.dispose?.();
    documentRef.getElementById("experimental-dockview-host")?.remove();
    documentRef.body.classList?.add?.("dockview-panels-enabled");
    const panelLaunchStrip = createDockviewPanelLaunchStrip(documentRef);

    const storageKey = getDockviewSpikeStorageKey();
    const shellStorageKey = getDockviewSpikeShellStorageKey(storageKey);
    const hadSavedLayout = !!readPanelLayoutHostState(storageKey);
    const { root, toolbar, dockRoot, resetButton, resizeGrip } = createHostRoot(documentRef, { shellStorageKey });
    let suppressPanelCloseSync = false;
    const layoutHost = createPanelLayoutHost({
        container: dockRoot,
        missionKey: resolveMissionKeyFromWindow(),
        panels: DEFAULT_DOCKVIEW_SPIKE_PANELS,
        storageKey,
        dockviewOptions: {
            floatingGroupBounds: "boundedWithinViewport",
            popoutUrl: resolveDockviewPopoutUrl(),
            createRightHeaderActionComponent() {
                return createDockviewHeaderActionsRenderer({
                    popoutUrl: resolveDockviewPopoutUrl(),
                });
            },
            getTabContextMenuItems: createDockviewTabContextMenuItems,
        },
        renderPanel: renderExperimentalPanel,
        onPanelClose(panelId) {
            if (panelId === MAIN_VIEW_PANEL_ID) {
                queueMicrotask(() => {
                    layoutHost.addPanel(DEFAULT_DOCKVIEW_SPIKE_PANELS[0]);
                    layoutHost.focusPanel(MAIN_VIEW_PANEL_ID);
                    layoutHost.saveLayout();
                });
                return;
            }
            if (suppressPanelCloseSync || !DOCKED_WORKFLOW_PANEL_IDS.includes(panelId)) {
                return;
            }
            queueMicrotask(() => {
                const panel = getMissionPanelSnapshot().find((entry) => entry.id === panelId);
                if (panel?.state === "open") {
                    invokeMissionPanelAction(panelId, "close");
                }
            });
        },
    });
    const unbindShellInteractions = () => {};
    if (!layoutHost.api?.getPanel?.(MAIN_VIEW_PANEL_ID)) {
        layoutHost.addPanel(DEFAULT_DOCKVIEW_SPIKE_PANELS[0]);
    }
    if (!layoutHost.api?.getPanel?.("workflow:background-transcript")) {
        layoutHost.addPanel(DEFAULT_DOCKVIEW_SPIKE_PANELS[1]);
    }
    layoutHost.closePanel("aux:earth-rise-composer-controls");
    layoutHost.focusPanel(MAIN_VIEW_PANEL_ID);
    let unsubscribeDefaultPanelOpen = null;
    let resetWorkspaceRetryHandle = null;

    const resetDockviewWorkspaceLayout = () => {
        enableAuxiliaryPanelsForDockviewDefaults(documentRef);
        for (const panel of getMissionPanelSnapshot() || []) {
            if (
                DEFAULT_CLOSED_DOCKVIEW_PANEL_IDS.includes(panel.id) &&
                panel.available !== false &&
                panel.state === "open"
            ) {
                invokeMissionPanelAction(panel.id, "close");
            }
        }
        if (!layoutHost.api?.getPanel?.(MAIN_VIEW_PANEL_ID)) {
            layoutHost.addPanel(DEFAULT_DOCKVIEW_SPIKE_PANELS[0]);
        }
        if (!layoutHost.api?.getPanel?.("workflow:background-transcript")) {
            layoutHost.addPanel(DEFAULT_DOCKVIEW_SPIKE_PANELS[1]);
        }
        for (const panelId of DEFAULT_OPEN_DOCKVIEW_PANEL_IDS) {
            if (layoutHost.api?.getPanel?.(panelId)) {
                continue;
            }
            invokeMissionPanelAction(panelId, "restore") ||
                invokeMissionPanelAction(panelId, "open") ||
                invokeMissionPanelAction(panelId, "focus");
        }
        const applyWithRetry = (attempt = 0) => {
            if (resetWorkspaceRetryHandle != null) {
                clearTimeout(resetWorkspaceRetryHandle);
                resetWorkspaceRetryHandle = null;
            }
            const applied = applyDefaultDockviewWorkspaceLayout(layoutHost);
            if (applied) {
                layoutHost.focusPanel(MAIN_VIEW_PANEL_ID);
                return;
            }
            if (attempt >= 16) {
                layoutHost.focusPanel(MAIN_VIEW_PANEL_ID);
                layoutHost.saveLayout?.();
                return;
            }
            resetWorkspaceRetryHandle = setTimeout(() => applyWithRetry(attempt + 1), 250);
        };
        suppressPanelCloseSync = true;
        try {
            applyWithRetry();
        } finally {
            suppressPanelCloseSync = false;
        }
    };
    globalThis.__moonMissionResetDockviewWorkspace = resetDockviewWorkspaceLayout;

    if (!hadSavedLayout) {
        const pendingDefaultPanelIds = new Set(DEFAULT_OPEN_DOCKVIEW_PANEL_IDS);
        let defaultWorkspaceLayoutApplied = false;
        enableAuxiliaryPanelsForDockviewDefaults(documentRef);
        const openDefaultPanels = (snapshot = getMissionPanelSnapshot()) => {
            for (const panelId of Array.from(pendingDefaultPanelIds)) {
                if (layoutHost.api?.getPanel?.(panelId)) {
                    pendingDefaultPanelIds.delete(panelId);
                }
            }
            for (const panel of snapshot || []) {
                if (
                    DEFAULT_CLOSED_DOCKVIEW_PANEL_IDS.includes(panel.id) &&
                    panel.available !== false &&
                    panel.state === "open"
                ) {
                    invokeMissionPanelAction(panel.id, "close");
                }
            }
            for (const panel of snapshot || []) {
                if (!pendingDefaultPanelIds.has(panel.id) || panel.available === false) {
                    continue;
                }
                if (layoutHost.api?.getPanel?.(panel.id)) {
                    pendingDefaultPanelIds.delete(panel.id);
                    continue;
                }
                const opened = invokeMissionPanelAction(panel.id, "restore") ||
                    invokeMissionPanelAction(panel.id, "open") ||
                    invokeMissionPanelAction(panel.id, "focus");
                if (opened) {
                    pendingDefaultPanelIds.delete(panel.id);
                }
            }
            if (!defaultWorkspaceLayoutApplied) {
                defaultWorkspaceLayoutApplied = applyDefaultDockviewWorkspaceLayout(layoutHost);
            }
            layoutHost.focusPanel(MAIN_VIEW_PANEL_ID);
            if (pendingDefaultPanelIds.size === 0) {
                unsubscribeDefaultPanelOpen?.();
                unsubscribeDefaultPanelOpen = null;
            }
        };
        unsubscribeDefaultPanelOpen = subscribeMissionPanels(openDefaultPanels);
        setTimeout(() => {
            openDefaultPanels();
            if (pendingDefaultPanelIds.size === 0) {
                return;
            }
            unsubscribeDefaultPanelOpen?.();
            unsubscribeDefaultPanelOpen = null;
        }, 8000);
    }

    resetButton.addEventListener("click", resetDockviewWorkspaceLayout);

    const dispose = () => {
        unsubscribeDefaultPanelOpen?.();
        if (resetWorkspaceRetryHandle != null) {
            clearTimeout(resetWorkspaceRetryHandle);
            resetWorkspaceRetryHandle = null;
        }
        unbindShellInteractions();
        layoutHost.dispose();
        root.remove();
        panelLaunchStrip.dispose();
        if (globalThis.__moonMissionResetDockviewWorkspace === resetDockviewWorkspaceLayout) {
            delete globalThis.__moonMissionResetDockviewWorkspace;
        }
        documentRef.body.classList?.remove?.("dockview-panels-enabled");
    };

    globalThis.__moonMissionDockviewSpike = {
        api: layoutHost.api,
        layoutHost,
        root,
        storageKey,
        shellStorageKey,
        resetWorkspaceLayout: resetDockviewWorkspaceLayout,
        dispose,
    };

    return globalThis.__moonMissionDockviewSpike;
}

export {
    DOCKVIEW_SPIKE_PARAM,
    DEFAULT_DOCKVIEW_SPIKE_PANELS,
    DEFAULT_OPEN_DOCKVIEW_PANEL_IDS,
    MAIN_VIEW_PANEL_ID,
    applyDefaultDockviewWorkspaceLayout,
    applyShellRect,
    calculateDefaultDockviewWorkspaceSizes,
    clampShellRect,
    getDockviewSpikeStorageKey,
    getDockviewSpikeShellStorageKey,
    getDefaultShellRect,
    resolveDockviewPopoutUrl,
    createDockviewHeaderActionsRenderer,
    createDockviewPanelLaunchStrip,
    createFullscreenToggleButton,
    createDockviewTabContextMenuItems,
    initializeExperimentalDockviewHost,
    isDesktopDockviewViewport,
    isDockviewSpikeEnabled,
    readDockviewSpikeShellRect,
};
