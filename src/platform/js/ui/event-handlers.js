import { createControlPanelTimelineController } from "./control-panel-timeline-controller.js";
import { createCompareModeController } from "./compare-mode-controller.js";
import { createComparePanelController } from "./compare-panel-controller.js";
import { createDesktopChromeAutohideController } from "./desktop-chrome-autohide.js";
import { createHeaderBlurbController } from "./header-blurb-controller.js";
import { createHeaderPillStripController } from "./header-pill-strip-controller.js";
import { bindMobileMissionCardSync } from "./mobile-mission-card-sync.js";
import { createKeyboardShortcutsController } from "./keyboard-shortcuts-controller.js";
import {
    bindMainControlControllerSet,
    bindMainControlElements,
    createMainControlControllers,
    syncMainControlControllerSet,
} from "./main-control-bindings.js";
import { createSettingsPanelController } from "./settings-panel-controller.js";
import { isDomElement } from "./dom-helpers.js";

/**
 * UI Event Handlers
 *
 * Centralizes DOM event wiring for mission.html.
 * This keeps mission.js focused on orchestration and business logic.
 */

function onClick(id, handler) {
    const element = document.getElementById(id);
    if (!element) return;
    element.addEventListener("click", handler);
}

function onChange(id, handler) {
    const element = document.getElementById(id);
    if (!element) return;
    element.addEventListener("change", handler);
}

function onInput(id, handler) {
    const element = document.getElementById(id);
    if (!element) return;
    element.addEventListener("input", handler);
}

function getMissionDialogApi() {
    return window.MissionDialog || window.CY3Dialog || null;
}

const MEANINGFUL_ACTIVITY_KEYS = new Set([
    " ",
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown",
    "PageUp",
    "PageDown",
    "Home",
    "End",
]);
function isInteractiveInputTarget(target) {
    if (!target) return false;
    const tag = target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    return target.isContentEditable === true;
}

function dispatchSyntheticPress(target, pointerType = "mouse") {
    if (!target || target.disabled) return false;
    if (typeof window.PointerEvent === "function") {
        target.dispatchEvent(new PointerEvent("pointerdown", {
            bubbles: true,
            cancelable: true,
            pointerId: 1,
            pointerType,
            isPrimary: true,
            button: 0,
        }));
        target.dispatchEvent(new PointerEvent("pointerup", {
            bubbles: true,
            cancelable: true,
            pointerId: 1,
            pointerType,
            isPrimary: true,
            button: 0,
        }));
        return true;
    }
    target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
    return true;
}

function isMobileViewport() {
    return window.innerWidth <= 600;
}

function isElementLayoutVisible(element) {
    if (!isDomElement(element)) return false;
    if (element.hasAttribute("hidden")) return false;
    const style = window.getComputedStyle?.(element);
    if (!style) return false;
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
        return false;
    }
    const rect = element.getBoundingClientRect?.();
    return !!rect && rect.width > 0 && rect.height > 0;
}

let settingsPanelController = null;
let keyboardShortcutsController = null;
let controlPanelTimelineController = null;
let desktopChromeAutohideController = null;
let headerBlurbController = null;
let headerPillStripController = null;
let comparePanelController = null;
let compareModeController = null;

function getControlPanelTimelineController() {
    if (!controlPanelTimelineController) {
        controlPanelTimelineController = createControlPanelTimelineController({
            documentRef: document,
            windowRef: window,
            requestAnimationFrameImpl: requestAnimationFrame,
        });
    }
    return controlPanelTimelineController;
}

function getSettingsPanelController() {
    if (!settingsPanelController) {
        settingsPanelController = createSettingsPanelController({
            onClick,
            getMissionDialogApi,
            isMobileViewport,
            isElementLayoutVisible,
            setControlPanelCollapsedState: (collapsed) =>
                getControlPanelTimelineController().setControlPanelCollapsedState(collapsed),
        });
    }
    return settingsPanelController;
}

function getKeyboardShortcutsController() {
    if (!keyboardShortcutsController) {
        keyboardShortcutsController = createKeyboardShortcutsController({
            onClick,
            isInteractiveInputTarget,
            dispatchSyntheticPress,
        });
    }
    return keyboardShortcutsController;
}

function getDesktopChromeAutohideController() {
    if (!desktopChromeAutohideController) {
        desktopChromeAutohideController = createDesktopChromeAutohideController({
            getMissionDialogApi,
            isComparePanelOpen: () => getComparePanelController().isComparePanelOpen(),
            isElementLayoutVisible,
            isInteractiveInputTarget,
            isMobileViewport,
            isSettingsPanelOpen,
            meaningfulActivityKeys: MEANINGFUL_ACTIVITY_KEYS,
            requestAnimationFrameImpl: requestAnimationFrame,
            setControlPanelCollapsedState: (collapsed) =>
                getControlPanelTimelineController().setControlPanelCollapsedState(collapsed),
            setHeaderPillStripAutoCollapsedState: (collapsed) =>
                getHeaderPillStripController().setAutoCollapsedState(collapsed),
        });
    }
    return desktopChromeAutohideController;
}

function getComparePanelController() {
    if (!comparePanelController) {
        comparePanelController = createComparePanelController({
            documentRef: document,
            windowRef: window,
        });
    }
    return comparePanelController;
}

function getCompareModeController(deps = null) {
    if (!compareModeController) {
        compareModeController = createCompareModeController({
            documentRef: document,
            windowRef: window,
            ...(deps || {}),
        });
    }
    return compareModeController;
}

function getHeaderBlurbController() {
    if (!headerBlurbController) {
        headerBlurbController = createHeaderBlurbController({
            isInteractiveInputTarget,
            isMobileViewport,
            meaningfulActivityKeys: MEANINGFUL_ACTIVITY_KEYS,
        });
    }
    return headerBlurbController;
}

function getHeaderPillStripController() {
    if (!headerPillStripController) {
        headerPillStripController = createHeaderPillStripController({
            requestAnimationFrameImpl: requestAnimationFrame,
        });
    }
    return headerPillStripController;
}

function isSettingsPanelOpen() {
    return getSettingsPanelController().isSettingsPanelOpen();
}

function bindHeaderBlurbBehavior() {
    getHeaderBlurbController().bind();
}

function bindDesktopChromeAutohideBehavior() {
    getDesktopChromeAutohideController().bind();
}

/**
 * Bind the Settings panel opener.
 */
export function bindSettingsPanel() {
    getSettingsPanelController().bind();
}

/**
 * Bind the dynamically-created burn buttons to the provided handler.
 * @param {number} eventCount
 * @param {(index: number) => void} onBurn
 */
export function bindBurnButtons(eventCount, onBurn) {
    const burnButtons = document.querySelectorAll("#burnbuttons button[data-event-index]");
    if (burnButtons.length > 0) {
        burnButtons.forEach((button) => {
            const eventIndex = Number.parseInt(button.getAttribute("data-event-index") || "", 10);
            if (!Number.isFinite(eventIndex)) return;
            button.onclick = function () {
                onBurn(eventIndex);
            };
        });
        return;
    }

    for (let i = 0; i < eventCount; ++i) {
        onClick("burn" + (i + 1), function () {
            onBurn(i);
        });
    }
}

/**
 * Bind main UI controls.
 * @param {Object} handlers
 */
export function bindMainControls(handlers) {
    const {
        reset,
        toggleMode,
        toggleRelativeMode,
        toggleCompareMode,
        changeCompareMission,
        changeCompareAlignment,
        getTimelineEventInfos,
        changeCameraFromTo,
        changeDesktopMainFov,
        toggleDesktopMainFovAuto,
        togglePlane,
        setView,
        setDimensionTop,
        toggleAnimation,
        // Legacy compatibility while callers migrate.
        cy3Animate,
        toggleJoyRide,
        toggleLanding,
        toggleInfo,
        setMoonRenderProfile,
        getMoonRenderProfile,
        setMoonRenderPipeline,
        getMoonRenderPipeline,
        setPhotoMode,
        getPhotoMode,
    } = handlers;
    const controllers = createMainControlControllers({
        toggleMode,
        toggleRelativeMode,
        changeCameraFromTo,
        togglePlane,
        setView,
        setDimensionTop,
        toggleLanding,
        getMoonRenderProfile,
        setMoonRenderProfile,
        getMoonRenderPipeline,
        setMoonRenderPipeline,
        getPhotoMode,
        setPhotoMode,
        headerPillStripController: getHeaderPillStripController(),
    });
    bindMainControlControllerSet({
        controllers,
        bindHeaderBlurbBehavior,
        bindDesktopChromeAutohideBehavior,
    });
    bindMainControlElements({
        onClick,
        onChange,
        onInput,
        reset,
        changeDesktopMainFov,
        toggleDesktopMainFovAuto,
        setView,
        toggleAnimation,
        cy3Animate,
        toggleJoyRide,
        toggleLanding,
        toggleInfo,
    });
    getCompareModeController({
        toggleCompareMode,
        changeCompareMission,
        changeCompareAlignment,
        getTimelineEventInfos,
    }).bind();
    getComparePanelController().bind();
    syncMainControlControllerSet(controllers);
}

export function syncCompareModeControls(compareModeActive) {
    compareModeController?.syncAlignmentControls(compareModeActive);
}

export function bindKeyboardShortcuts() {
    getKeyboardShortcutsController().bind();
}

export function bindControlPanelToggle() {
    getControlPanelTimelineController().bind();
}

export function bindMobileMissionCard({ changeCameraFromTo } = {}) {
    bindMobileMissionCardSync({
        changeCameraFromTo,
        dispatchSyntheticPress,
        isMobileViewport,
        resetSettingsPanelForMobileMode: () => getSettingsPanelController().resetForMobileMode(),
        setHeaderPillStripAutoCollapsedState: (collapsed) =>
            getHeaderPillStripController().setAutoCollapsedState(collapsed),
    });
}
