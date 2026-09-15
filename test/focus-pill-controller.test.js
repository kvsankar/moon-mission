import { describe, expect, it, vi } from "vitest";

import { createFocusPillController } from "../src/platform/js/ui/focus-pill-controller.js";

function createClassList(initial = []) {
    const values = new Set(initial);
    return {
        add(value) {
            values.add(value);
        },
        remove(value) {
            values.delete(value);
        },
        contains(value) {
            return values.has(value);
        },
        toggle(value, force) {
            if (force === true) {
                values.add(value);
                return true;
            }
            if (force === false) {
                values.delete(value);
                return false;
            }
            if (values.has(value)) {
                values.delete(value);
                return false;
            }
            values.add(value);
            return true;
        },
    };
}

function createElement(id, options = {}) {
    const listeners = new Map();
    const attributes = new Map();
    return {
        id,
        checked: options.checked === true,
        disabled: options.disabled === true,
        hidden: options.hidden === true,
        textContent: options.textContent || "",
        dataset: { ...(options.dataset || {}) },
        scrollLeft: 0,
        classList: createClassList(options.classes || []),
        addEventListener(type, handler) {
            if (!listeners.has(type)) listeners.set(type, []);
            listeners.get(type).push(handler);
        },
        dispatchEvent(event) {
            const handlers = listeners.get(event.type) || [];
            handlers.forEach((handler) => handler(event));
        },
        click() {
            this.clicked = true;
        },
        setAttribute(name, value) {
            attributes.set(name, String(value));
            this[name] = String(value);
        },
        closest(selector) {
            if (selector === ".header-pill-group") {
                return options.closestHeaderGroup || null;
            }
            return null;
        },
    };
}

function createHarness(options = {}) {
    const rafQueue = [];
    const documentListeners = new Map();
    const observerInstances = [];
    let splashdownVisible = options.splashdownVisible === true;
    let composerVisible = options.composerVisible === true;
    let backgroundVisible = options.backgroundVisible === true;
    let groundTrackVisible = options.groundTrackVisible === true;
    let mediaVisible = options.mediaVisible === true;
    let craftMoonVisible = options.craftMoonVisible === true;
    let craftEarthVisible = options.craftEarthVisible === true;
    let earthOrbitXyVisible = options.earthOrbitXyVisible === true;

    class FakeMutationObserver {
        constructor(callback) {
            this.callback = callback;
            observerInstances.push(this);
        }

        observe(target, config) {
            this.target = target;
            this.config = config;
        }
    }

    const flybyGroup = createElement("flyby-group");
    const flybyWrap = createElement("flyby-pill-wrap", { closestHeaderGroup: flybyGroup });
    const backgroundPill = createElement("panel-pill-background");
    const flybyPill = createElement("flyby-pill");
    const splashdownPill = createElement("focus-pill-splashdown");
    const mediaPill = createElement("panel-pill-media");
    const craftMoonPill = createElement("panel-pill-craft-moon");
    const craftEarthPill = createElement("panel-pill-craft-earth");
    const earthOrbitXyPill = createElement("panel-pill-earth-orbit-xy");
    const tertiaryRow = createElement("header-pill-strip-tertiary");
    const auxPanelsToggle = createElement("view-aux-camera-panels");
    const burnButtonsHost = createElement("burnbuttons");
    const composerChip = createElement("composer-chip", { textContent: "Flyby" });

    const byId = new Map([
        ["flyby-pill-wrap", flybyWrap],
        ["panel-pill-background", backgroundPill],
        ["flyby-pill", flybyPill],
        ["focus-pill-splashdown", splashdownPill],
        ["panel-pill-media", mediaPill],
        ["panel-pill-craft-moon", craftMoonPill],
        ["panel-pill-craft-earth", craftEarthPill],
        ["panel-pill-earth-orbit-xy", earthOrbitXyPill],
        ["header-pill-strip-tertiary", tertiaryRow],
        ["view-aux-camera-panels", auxPanelsToggle],
        ["burnbuttons", burnButtonsHost],
    ]);

    const documentRef = {
        getElementById(id) {
            return byId.get(id) || null;
        },
        querySelector(selector) {
            if (selector === "#aux-camera-views .aux-camera-view[data-mode=\"composer\"]:not([hidden])") {
                return composerVisible ? { id: "composer-view" } : null;
            }
            if (selector === "#ground-track-panel:not(.ground-track-panel--hidden)") {
                return groundTrackVisible ? { id: "ground-track-panel" } : null;
            }
            if (selector === "#media-browser-panel:not(.media-browser-panel--hidden)") {
                return mediaVisible ? { id: "media-browser-panel" } : null;
            }
            if (selector === "#background-media-panel:not(.background-media-panel--hidden)") {
                return backgroundVisible ? { id: "background-media-panel" } : null;
            }
            if (selector === "#aux-camera-views .aux-camera-view[data-panel-id=\"aux:moon\"]:not([hidden])") {
                return craftMoonVisible ? { id: "moon-view" } : null;
            }
            if (selector === "#aux-camera-views .aux-camera-view[data-panel-id=\"aux:earth\"]:not([hidden])") {
                return craftEarthVisible ? { id: "earth-view" } : null;
            }
            if (selector === "#aux-camera-views .aux-camera-view[data-panel-id=\"aux:earth-origin-orbit-xy\"]:not([hidden])") {
                return earthOrbitXyVisible ? { id: "earth-origin-orbit-xy-view" } : null;
            }
            if (selector === "#aux-camera-views .aux-camera-chip--composer-tab") {
                return options.hasComposerTab === false ? null : composerChip;
            }
            return null;
        },
        querySelectorAll(selector) {
            if (selector === "#burnbuttons button[data-event-key]") {
                return splashdownVisible
                    ? [createElement("splashdown-button", { dataset: { eventKey: "splashdown" } })]
                    : [];
            }
            if (selector === "#aux-camera-views .aux-camera-chip") {
                return [composerChip];
            }
            return [];
        },
        addEventListener(type, handler) {
            if (!documentListeners.has(type)) documentListeners.set(type, []);
            documentListeners.get(type).push(handler);
        },
        dispatchEvent(event) {
            const handlers = documentListeners.get(event.type) || [];
            handlers.forEach((handler) => handler(event));
        },
    };

    const windowRef = {
        location: {
            pathname: options.pathname || "/artemis2/",
            search: options.search || "",
        },
        matchMedia: () => ({ matches: options.mobile !== true }),
        __moonMissionDockviewSpike: options.progressiveWorkspace ? { progressiveWorkspace: {} } : undefined,
        requestAnimationFrame(callback) {
            rafQueue.push(callback);
        },
    };

    const invokeMissionPanelAction = vi.fn((panelId) =>
        (options.restoreComposer === true && panelId === "aux:earth-rise-composer") ||
        (options.restoreBackground === true && panelId === "workflow:background-media") ||
        options.restoredPanelId === panelId);
    const setView = vi.fn();
    const createCustomEvent = (type) => ({ type });
    const controller = createFocusPillController({
        createCustomEvent,
        documentRef,
        invokeMissionPanelAction,
        MutationObserverImpl: FakeMutationObserver,
        requestAnimationFrameImpl(callback) {
            rafQueue.push(callback);
        },
        setView,
        windowRef,
    });

    function flushRaf() {
        while (rafQueue.length) {
            const callback = rafQueue.shift();
            callback();
        }
    }

    return {
        auxPanelsToggle,
        backgroundPill,
        composerChip,
        controller,
        craftEarthPill,
        craftMoonPill,
        documentRef,
        earthOrbitXyPill,
        flushRaf,
        flybyGroup,
        flybyPill,
        invokeMissionPanelAction,
        observerInstances,
        setComposerVisible(value) {
            composerVisible = value;
        },
        setBackgroundVisible(value) {
            backgroundVisible = value;
        },
        setGroundTrackVisible(value) {
            groundTrackVisible = value;
        },
        setMediaVisible(value) {
            mediaVisible = value;
        },
        setCraftMoonVisible(value) {
            craftMoonVisible = value;
        },
        setCraftEarthVisible(value) {
            craftEarthVisible = value;
        },
        setEarthOrbitXyVisible(value) {
            earthOrbitXyVisible = value;
        },
        setSplashdownVisible(value) {
            splashdownVisible = value;
        },
        setView,
        mediaPill,
        splashdownPill,
        tertiaryRow,
    };
}

describe("createFocusPillController", function () {
    it("lets progressive mode hide mobile desktop groups without closing their mission state", () => {
        const progressive = createHarness({ mobile: true, progressiveWorkspace: true });
        progressive.controller.bind();
        expect(progressive.invokeMissionPanelAction).not.toHaveBeenCalled();
        expect(progressive.flybyPill.hidden).toBe(true);
        const legacy = createHarness({ mobile: true });
        legacy.controller.bind();
        expect(legacy.invokeMissionPanelAction).toHaveBeenCalledWith("aux:earth-rise-composer", "close");
    });
    it("preserves header scroll during unchanged animation updates", () => {
        const harness = createHarness({ composerVisible: true });
        harness.controller.bind();
        harness.flushRaf();
        harness.tertiaryRow.scrollLeft = 120;
        harness.controller.sync();
        harness.flushRaf();
        expect(harness.tertiaryRow.scrollLeft).toBe(120);
    });

    it("syncs initial focus pill visibility and active state for Artemis II", function () {
        const harness = createHarness({
            composerVisible: true,
            backgroundVisible: true,
            craftEarthVisible: true,
            craftMoonVisible: true,
            earthOrbitXyVisible: true,
            groundTrackVisible: true,
            mediaVisible: true,
            splashdownVisible: true,
        });

        harness.controller.bind();
        harness.flushRaf();

        expect(harness.backgroundPill.hidden).toBe(false);
        expect(harness.flybyPill.hidden).toBe(false);
        expect(harness.splashdownPill.hidden).toBe(false);
        expect(harness.mediaPill.hidden).toBe(false);
        expect(harness.craftMoonPill.hidden).toBe(false);
        expect(harness.craftEarthPill.hidden).toBe(false);
        expect(harness.earthOrbitXyPill.hidden).toBe(false);
        expect(harness.flybyGroup.hidden).toBe(false);
        expect(harness.backgroundPill.classList.contains("is-active")).toBe(true);
        expect(harness.flybyPill.classList.contains("is-active")).toBe(true);
        expect(harness.splashdownPill.classList.contains("is-active")).toBe(true);
        expect(harness.mediaPill.classList.contains("is-active")).toBe(true);
        expect(harness.craftMoonPill.classList.contains("is-active")).toBe(true);
        expect(harness.craftEarthPill.classList.contains("is-active")).toBe(true);
        expect(harness.earthOrbitXyPill.classList.contains("is-active")).toBe(true);
        expect(harness.tertiaryRow.scrollLeft).toBe(0);
    });

    it("opens the composer flow from the flyby pill", function () {
        const harness = createHarness({
            composerVisible: false,
            restoreComposer: false,
        });

        harness.controller.bind();
        harness.auxPanelsToggle.checked = false;
        harness.flybyPill.dispatchEvent({ type: "click" });
        harness.flushRaf();

        expect(harness.auxPanelsToggle.checked).toBe(true);
        expect(harness.setView).toHaveBeenCalled();
        expect(harness.invokeMissionPanelAction).toHaveBeenCalledWith(
            "aux:earth-rise-composer",
            "restoreGuided",
        );
        expect(harness.invokeMissionPanelAction).toHaveBeenCalledWith(
            "aux:earth-rise-composer",
            "restore",
        );
        expect(harness.composerChip.clicked).toBe(true);
    });

    it("opens the one-click panel shortcuts through mission panel actions", function () {
        const harness = createHarness();

        harness.controller.bind();
        harness.auxPanelsToggle.checked = false;
        harness.backgroundPill.dispatchEvent({ type: "click" });
        harness.mediaPill.dispatchEvent({ type: "click" });
        harness.craftMoonPill.dispatchEvent({ type: "click" });
        harness.craftEarthPill.dispatchEvent({ type: "click" });
        harness.earthOrbitXyPill.dispatchEvent({ type: "click" });
        harness.flushRaf();

        expect(harness.invokeMissionPanelAction).toHaveBeenCalledWith("workflow:background-media", "restore");
        expect(harness.invokeMissionPanelAction).toHaveBeenCalledWith("workflow:media-browser", "restore");
        expect(harness.invokeMissionPanelAction).toHaveBeenCalledWith("aux:moon", "restore");
        expect(harness.invokeMissionPanelAction).toHaveBeenCalledWith("aux:earth", "restore");
        expect(harness.invokeMissionPanelAction).toHaveBeenCalledWith("aux:earth-origin-orbit-xy", "restore");
        expect(harness.auxPanelsToggle.checked).toBe(true);
        expect(harness.setView).toHaveBeenCalled();
    });

    it("closes visible panel shortcuts when their pills are clicked again", function () {
        const harness = createHarness({
            composerVisible: true,
            backgroundVisible: true,
            craftEarthVisible: true,
            craftMoonVisible: true,
            earthOrbitXyVisible: true,
            groundTrackVisible: true,
            mediaVisible: true,
        });
        const dispatchSpy = vi.spyOn(harness.documentRef, "dispatchEvent");

        harness.controller.bind();
        harness.backgroundPill.dispatchEvent({ type: "click" });
        harness.flybyPill.dispatchEvent({ type: "click" });
        harness.mediaPill.dispatchEvent({ type: "click" });
        harness.craftMoonPill.dispatchEvent({ type: "click" });
        harness.craftEarthPill.dispatchEvent({ type: "click" });
        harness.earthOrbitXyPill.dispatchEvent({ type: "click" });
        harness.splashdownPill.dispatchEvent({ type: "click" });

        expect(harness.invokeMissionPanelAction).toHaveBeenCalledWith("workflow:background-media", "close");
        expect(harness.invokeMissionPanelAction).toHaveBeenCalledWith("aux:earth-rise-composer", "close");
        expect(harness.invokeMissionPanelAction).toHaveBeenCalledWith("workflow:media-browser", "close");
        expect(harness.invokeMissionPanelAction).toHaveBeenCalledWith("aux:moon", "close");
        expect(harness.invokeMissionPanelAction).toHaveBeenCalledWith("aux:earth", "close");
        expect(harness.invokeMissionPanelAction).toHaveBeenCalledWith("aux:earth-origin-orbit-xy", "close");
        expect(harness.invokeMissionPanelAction).toHaveBeenCalledWith("workflow:splashdown", "close");
        expect(dispatchSpy).not.toHaveBeenCalledWith({ type: "ground-track-panel-open" });
    });

    it("dispatches the splashdown open event only for Artemis II", function () {
        const harness = createHarness({
            pathname: "/artemis2/",
        });
        const dispatchSpy = vi.spyOn(harness.documentRef, "dispatchEvent");

        harness.controller.bind();
        harness.splashdownPill.dispatchEvent({ type: "click" });

        expect(dispatchSpy).toHaveBeenCalledWith({ type: "ground-track-panel-open" });
    });

    it("re-syncs visibility when burn button mutations change splashdown availability", function () {
        const harness = createHarness({
            splashdownVisible: false,
        });

        harness.controller.bind();
        expect(harness.splashdownPill.hidden).toBe(true);

        harness.setSplashdownVisible(true);
        harness.observerInstances[0].callback();
        harness.flushRaf();

        expect(harness.splashdownPill.hidden).toBe(false);
    });

    it("re-syncs the Media pill when the media panel reports restored state", function () {
        const harness = createHarness({
            mediaVisible: false,
        });

        harness.controller.bind();
        expect(harness.mediaPill.classList.contains("is-active")).toBe(false);

        harness.setMediaVisible(true);
        harness.documentRef.dispatchEvent({ type: "mission-media-panel-state" });

        expect(harness.mediaPill.classList.contains("is-active")).toBe(true);
    });
});
