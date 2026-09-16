import { describe, expect, it, vi } from "vitest";

import { bindMobileMissionCardSync } from "../src/platform/js/ui/mobile-mission-card-sync.js";
import { createRuntimeCameraState } from "../src/platform/js/core/state/runtime-camera-state.js";

function createClassList(initialValues = []) {
    const values = new Set(initialValues);
    return {
        add(value) {
            values.add(value);
        },
        remove(value) {
            values.delete(value);
        },
        toggle(value, force) {
            if (force === undefined) {
                if (values.has(value)) {
                    values.delete(value);
                    return false;
                }
                values.add(value);
                return true;
            }
            if (force) {
                values.add(value);
                return true;
            }
            values.delete(value);
            return false;
        },
        contains(value) {
            return values.has(value);
        },
    };
}

function createStyle() {
    const values = new Map();
    return {
        setProperty(name, value) {
            values.set(name, value);
        },
        getPropertyValue(name) {
            return values.get(name) || "";
        },
    };
}

function createElement({ value = "", checked = false, hidden = false, disabled = false, classNames = [] } = {}) {
    const listeners = new Map();
    const attributes = {};
    const element = {
        value,
        checked,
        hidden,
        disabled,
        textContent: "",
        title: "",
        dataset: {},
        style: createStyle(),
        classList: createClassList(classNames),
        dispatchedEvents: [],
        clickCount: 0,
        addEventListener(type, handler) {
            const handlers = listeners.get(type) || [];
            handlers.push(handler);
            listeners.set(type, handlers);
        },
        dispatchEvent(event) {
            const type = event?.type || "";
            this.dispatchedEvents.push(type);
            const handlers = listeners.get(type) || [];
            handlers.forEach((handler) => handler.call(this, event));
            return true;
        },
        click() {
            this.clickCount += 1;
            this.dispatchEvent({ type: "click" });
        },
        setAttribute(name, valueToSet) {
            attributes[name] = String(valueToSet);
        },
        getAttribute(name) {
            return attributes[name] || "";
        },
        querySelector() {
            return null;
        },
    };
    return element;
}

function createHarness() {
    const elements = {
        mobileShell: createElement(),
        missionCard: createElement(),
        missionBody: createElement(),
        viewsCard: createElement(),
        viewsBody: createElement(),
        composeCard: createElement(),
        panelCollapseButton: createElement(),
        contentWrapper: createElement(),
        missionEvent: createElement({ hidden: true }),
        mobileShellNav: createElement(),
        cameraPosition: createElement({ value: "spacecraft" }),
        cameraLook: createElement({ value: "moon" }),
        bodyHalos: createElement({ checked: true }),
        auxPanels: createElement({ checked: true }),
        animate: createElement(),
        timelineSlider: createElement({ value: "0" }),
        burnButtonsHost: createElement(),
        mobileViewsMoonVisibilitySummary: createElement(),
        mobileViewsMoonVisibilityHead: createElement(),
        mobileViewsMoonVisibilityValues: createElement(),
        modeGeo: createElement({ value: "geo", checked: true }),
        viewPresetEarth: createElement(),
        viewPresetMoon: createElement(),
        composeLockFree: createElement(),
        navMission: createElement(),
        navViews: createElement(),
        navCompose: createElement(),
    };

    elements.mobileShell.dataset = {};
    elements.navMission.dataset = { mobileTab: "mission" };
    elements.navViews.dataset = { mobileTab: "views" };
    elements.navCompose.dataset = { mobileTab: "compose" };
    elements.viewPresetEarth.dataset = { mobileViewPreset: "earth" };
    elements.viewPresetMoon.dataset = { mobileViewPreset: "moon" };
    elements.composeLockFree.dataset = { mobileComposeLockPreset: "free" };
    elements.mobileViewsMoonVisibilitySummary.querySelector = (selector) => {
        if (selector === ".mobile-shell__views-visibility-head") {
            return elements.mobileViewsMoonVisibilityHead;
        }
        if (selector === ".mobile-shell__views-visibility-values") {
            return elements.mobileViewsMoonVisibilityValues;
        }
        return null;
    };
    elements.mobileShell.querySelector = (selector) => {
        if (selector === ".mobile-shell__nav") return elements.mobileShellNav;
        if (selector === '.mobile-shell__nav-btn[data-mobile-tab="compose"]') return elements.navCompose;
        return null;
    };

    const rafQueue = [];
    const windowListeners = new Map();
    const windowRef = {
        missionConfig: { dataPath: "/missions/chandrayaan3/data" },
        animationScenes: {
            geo: { initialized3D: false },
        },
        localStorage: {
            getItem: vi.fn(() => null),
            setItem: vi.fn(),
        },
        requestAnimationFrame(callback) {
            rafQueue.push(callback);
            return rafQueue.length;
        },
        addEventListener: vi.fn((type, handler) => {
            const handlers = windowListeners.get(type) || [];
            handlers.push(handler);
            windowListeners.set(type, handlers);
        }),
    };

    const documentRef = {
        body: { dataset: {}, classList: createClassList() },
        getElementById(id) {
            const mapping = {
                "mobile-shell": elements.mobileShell,
                "mobile-card-mission": elements.missionCard,
                "mobile-mission-body": elements.missionBody,
                "mobile-card-views": elements.viewsCard,
                "mobile-views-body": elements.viewsBody,
                "mobile-card-compose": elements.composeCard,
                "mobile-views-collapse": elements.panelCollapseButton,
                "content-wrapper": elements.contentWrapper,
                "mobile-mission-event": elements.missionEvent,
                "camera-position": elements.cameraPosition,
                "camera-look": elements.cameraLook,
                "view-body-halos": elements.bodyHalos,
                "view-aux-camera-panels": elements.auxPanels,
                animate: elements.animate,
                "timeline-slider": elements.timelineSlider,
                burnbuttons: elements.burnButtonsHost,
                "mobile-views-moon-visibility-summary": elements.mobileViewsMoonVisibilitySummary,
            };
            return mapping[id] || createElement();
        },
        querySelector(selector) {
            if (selector === 'input[name="mode"]:checked') return elements.modeGeo;
            return null;
        },
        querySelectorAll(selector) {
            if (selector === ".mobile-shell__view-btn") {
                return [elements.viewPresetEarth, elements.viewPresetMoon];
            }
            if (selector === ".mobile-shell__compose-lock-btn") {
                return [elements.composeLockFree];
            }
            if (selector === ".mobile-shell__nav-btn") {
                return [elements.navMission, elements.navViews, elements.navCompose];
            }
            if (selector === "#burnbuttons button[data-event-index]") {
                return [];
            }
            return [];
        },
    };

    const instances = {};
    const committedCameraPairs = [];
    const createSync = (name, api) => (deps) => {
        const instance = { ...api, __deps: deps };
        instances[name] = instance;
        return instance;
    };

    const resetSettingsPanelForMobileMode = vi.fn();
    const setHeaderPillStripAutoCollapsedState = vi.fn();
    const cameraState = createRuntimeCameraState({ positionMode: "spacecraft", lookMode: "moon" });

    const result = bindMobileMissionCardSync({
        getCameraState: cameraState.get,
        documentRef,
        windowRef,
        performanceRef: {},
        localStorageRef: windowRef.localStorage,
        dispatchSyntheticPress: vi.fn(),
        isMobileViewport: () => true,
        resetSettingsPanelForMobileMode,
        setHeaderPillStripAutoCollapsedState,
        createSharedControlBackendImpl: () => ({
            commitCameraPair(positionMode, lookMode) {
                cameraState.commit({ positionMode, lookMode });
                committedCameraPairs.push([positionMode, lookMode]);
                elements.cameraPosition.value = positionMode;
                elements.cameraLook.value = lookMode;
            },
        }),
        createMobileComposeTimelineSyncImpl: createSync("timeline", {
            bind: vi.fn(),
            sync: vi.fn(),
        }),
        createMobileComposeLockSyncImpl: createSync("composeLock", {
            bind: vi.fn(),
            syncState: vi.fn(),
        }),
        createMobileComposeControlsSyncImpl: createSync("composeControls", {
            bind: vi.fn(),
            initialize: vi.fn(),
            syncControls: vi.fn(),
            syncPresentation: vi.fn(),
        }),
        createMobileViewFovSyncImpl: createSync("viewFov", {
            bind: vi.fn(),
            setAutoFovEnabled: vi.fn(),
            syncDisplayFromScene: vi.fn(),
            applyAutoFovForActivePreset: vi.fn(),
            scheduleAutoFovRefresh: vi.fn(),
            ensureComposeDefaultFov: vi.fn(),
            requestSceneRender: vi.fn(),
            isAutoFovEnabled: vi.fn(() => true),
        }),
        createMobileMoonVisibilitySyncImpl: createSync("moonVisibility", {
            bind: vi.fn(),
            startLoop: vi.fn(),
            stopLoop: vi.fn(),
            sync: vi.fn(),
        }),
        createMobileShellLayoutSyncImpl: createSync("layout", {
            syncNavLayout: vi.fn(),
            initializeCollapsedState: vi.fn(),
            syncPanelCollapseButton: vi.fn(),
            toggleMode: vi.fn(),
            applyRenderViewportCentering: vi.fn(),
            setMissionCardCollapsed: vi.fn(),
            setViewsCardCollapsed: vi.fn(),
        }),
        createMobileViewPresetSyncImpl: createSync("viewPreset", {
            bind: vi.fn(),
            syncState: vi.fn(),
            applyPreset: vi.fn(),
        }),
        createMobileShellTabSyncImpl: createSync("shellTab", {
            bind: vi.fn(),
            setActiveTab(tabName) {
                this.__deps.setActiveTab(tabName);
            },
        }),
        bindMobileTransportSyncImpl: createSync("transport", {
            syncTransportState: vi.fn(),
        }),
    });

    function flushAnimationFrames() {
        while (rafQueue.length > 0) {
            const callback = rafQueue.shift();
            callback();
        }
    }

    function dispatchWindowEvent(type) {
        const handlers = windowListeners.get(type) || [];
        handlers.forEach((handler) => handler());
    }

    return {
        elements,
        instances,
        committedCameraPairs,
        resetSettingsPanelForMobileMode,
        setHeaderPillStripAutoCollapsedState,
        result,
        flushAnimationFrames,
        dispatchWindowEvent,
    };
}

describe("bindMobileMissionCardSync", () => {
    it("restores mobile shell session state across enter and exit mobile mode", () => {
        const harness = createHarness();
        harness.instances.moonVisibility.startLoop.mockClear();
        harness.instances.moonVisibility.stopLoop.mockClear();
        harness.instances.moonVisibility.sync.mockClear();
        harness.instances.composeControls.syncControls.mockClear();
        harness.instances.composeControls.syncPresentation.mockClear();

        harness.result.mobileShellTabSync.setActiveTab("views");
        harness.result.mobileShellTabSync.__deps.onEnterSimplifiedTab();
        harness.elements.cameraPosition.value = "manual";
        harness.elements.cameraLook.value = "manual";

        harness.result.mobileShellLayoutSync.__deps.onEnterMobileMode();
        expect(harness.resetSettingsPanelForMobileMode).toHaveBeenCalledTimes(1);
        expect(harness.setHeaderPillStripAutoCollapsedState).toHaveBeenLastCalledWith(true);
        expect(harness.elements.auxPanels.checked).toBe(false);
        expect(harness.instances.moonVisibility.startLoop).toHaveBeenCalledTimes(1);
        expect(harness.instances.composeControls.syncControls).toHaveBeenCalledTimes(1);

        harness.result.mobileShellLayoutSync.__deps.onExitMobileMode();
        expect(harness.setHeaderPillStripAutoCollapsedState).toHaveBeenLastCalledWith(false);
        expect(harness.elements.auxPanels.checked).toBe(true);
        expect(harness.elements.bodyHalos.checked).toBe(true);
        expect(harness.elements.cameraPosition.value).toBe("spacecraft");
        expect(harness.elements.cameraLook.value).toBe("moon");
        expect(harness.committedCameraPairs).toContainEqual(["spacecraft", "moon"]);
        expect(harness.instances.moonVisibility.stopLoop).toHaveBeenCalledTimes(1);
        expect(harness.instances.composeControls.syncPresentation).toHaveBeenCalledTimes(1);
    });

    it("queues a transport resync after mobile tap playback toggles animation", () => {
        const harness = createHarness();
        harness.instances.transport.syncTransportState.mockClear();
        harness.elements.animate.clickCount = 0;

        harness.result.mobileViewFovSync.__deps.onTapPlaybackToggle();
        expect(harness.elements.animate.clickCount).toBe(1);
        expect(harness.instances.transport.syncTransportState).not.toHaveBeenCalled();

        harness.flushAnimationFrames();
        expect(harness.instances.transport.syncTransportState).toHaveBeenCalledTimes(1);
    });

    it("suppresses render recenter animation during startup and window resizes", () => {
        const harness = createHarness();

        expect(harness.instances.layout.toggleMode).toHaveBeenCalledWith({ disableTransition: true });

        harness.instances.layout.toggleMode.mockClear();
        harness.instances.viewFov.scheduleAutoFovRefresh.mockClear();
        harness.dispatchWindowEvent("resize");

        expect(harness.instances.layout.toggleMode).toHaveBeenCalledWith({ disableTransition: true });
        expect(harness.instances.viewFov.scheduleAutoFovRefresh).toHaveBeenCalledTimes(1);
    });
});
