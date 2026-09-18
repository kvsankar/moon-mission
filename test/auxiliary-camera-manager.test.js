import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

import { FakeEvent, FakeResizeObserver, installFakeDom } from "./helpers/fake-dom.js";
import { AuxiliaryCameraViewsManager } from "../src/platform/js/app/auxiliary-camera-views.js";
import { getMissionPanelSnapshot } from "../src/platform/js/app/panel-registry.js";

let dom = null;
let manager = null;
let requestRender = null;

/**
 * The manager takes its Three.js namespace by injection, so the panels can be
 * built without a real WebGL context.
 */
class FakeWebGLRenderer {
    constructor(options) {
        this.options = options;
        this.domElement = globalThis.document.createElement("canvas");
        this.shadowMap = { enabled: false, type: null };
        this.capabilities = {
            isWebGL2: true,
            maxTextureSize: 4096,
            getMaxAnisotropy: () => 4,
        };
        this.outputColorSpace = null;
        this.toneMapping = null;
        this.toneMappingExposure = 1;
        this.setPixelRatio = vi.fn();
        this.setSize = vi.fn();
        this.setViewport = vi.fn();
        this.setScissorTest = vi.fn();
        this.clear = vi.fn();
        this.render = vi.fn();
        this.dispose = vi.fn();
        this.getContext = () => ({ getExtension: () => null, getParameter: () => 0 });
    }
}

const fakeThree = { ...THREE, WebGLRenderer: FakeWebGLRenderer };
const STORAGE_KEY = "moon-mission:aux-camera-panels:v1";

function createManager(windowOverrides = {}) {
    dom = installFakeDom([], {
        innerWidth: 1600,
        innerHeight: 900,
        ResizeObserver: FakeResizeObserver,
        requestAnimationFrame: () => 1,
        cancelAnimationFrame: () => {},
        ...windowOverrides,
    });
    requestRender = vi.fn();
    return new AuxiliaryCameraViewsManager({
        THREE: fakeThree,
        overlayHost: dom.document.body,
        requestRender,
    });
}

function panelById(id) {
    return manager.panels.find((panelState) => panelState.id === id);
}

function registryEntry(id) {
    return getMissionPanelSnapshot().find((entry) => entry.id === id) || null;
}

beforeEach(() => {
    vi.useFakeTimers();
    FakeResizeObserver.instances = [];
    manager = createManager();
});

afterEach(() => {
    manager?.dispose();
    manager = null;
    dom?.restore();
    dom = null;
    vi.useRealTimers();
});

describe("panel construction", () => {
    it("builds one panel per authored specification", () => {
        expect(manager.panels.map((panelState) => panelState.id)).toEqual([
            "earth",
            "moon",
            "earth-to-moon",
            "earth-origin-orbit-xy",
            "earth-rise-composer",
        ]);
    });

    it("mounts a single root into the overlay host", () => {
        expect(manager.root.id).toBe("aux-camera-views");
        expect(dom.document.body.children).toContain(manager.root);
    });

    it("gives every panel a viewport, canvas and overlay canvas", () => {
        for (const panelState of manager.panels) {
            expect(panelState.panel.tagName).toBe("SECTION");
            expect(panelState.viewport).toBeTruthy();
            expect(panelState.renderer).toBeInstanceOf(FakeWebGLRenderer);
            expect(panelState.overlayCanvas.tagName).toBe("CANVAS");
        }
    });

    it("gives the view panels a perspective camera and the orbit panel an orthographic one", () => {
        expect(panelById("earth").camera.isPerspectiveCamera).toBe(true);
        expect(panelById("earth-origin-orbit-xy").camera.isOrthographicCamera).toBe(true);
        expect(panelById("earth-origin-orbit-xy").mode).toBe("orbit-xy");
    });

    it("marks the composer panel as a workflow panel", () => {
        const composer = panelById("earth-rise-composer");

        expect(composer.mode).toBe("composer");
        expect(composer.title).toBe("Frame and Shoot");
        expect(composer.panelRegistryId).toBe("aux:earth-rise-composer");
    });

    it("records the anchor and target for each view panel", () => {
        expect(panelById("earth")).toMatchObject({ anchorKey: "craft", targetKey: "earth" });
        expect(panelById("moon")).toMatchObject({ anchorKey: "craft", targetKey: "moon" });
        expect(panelById("earth-to-moon")).toMatchObject({ anchorKey: "earth", targetKey: "moon" });
    });

    it("creates a restore chip for every panel", () => {
        for (const panelState of manager.panels) {
            expect(panelState.chipButton).toBeTruthy();
            expect(panelState.chipButton.hidden).toBe(true);
        }
    });

    it("registers every panel with the mission panel registry", () => {
        for (const panelState of manager.panels) {
            const entry = registryEntry(panelState.panelRegistryId);
            expect(entry).not.toBeNull();
            expect(entry.title).toBe(panelState.title);
            expect(entry.builtIn).toBe(true);
        }
    });

    it("skips construction entirely on a narrow viewport", () => {
        manager.dispose();
        dom.restore();

        manager = createManager({ innerWidth: 500 });

        expect(manager.root).toBeNull();
        expect(manager.panels).toEqual([]);
    });
});

describe("panel state machine", () => {
    let panelState = null;

    beforeEach(() => {
        panelState = panelById("earth");
    });

    it("reports a mission-disabled panel as unavailable", () => {
        expect(manager.getPanelRegistryState(panelState)).toBe("unavailable");
    });

    it("reports an enabled, visible panel as open", () => {
        panelState.missionEnabled = true;

        expect(manager.getPanelRegistryState(panelState)).toBe("open");
    });

    it("reports minimized and closed panels alike as closed", () => {
        panelState.missionEnabled = true;

        manager.setPanelMinimized(panelState, true);
        expect(manager.getPanelRegistryState(panelState)).toBe("closed");

        manager.setPanelClosed(panelState, true);
        expect(manager.getPanelRegistryState(panelState)).toBe("closed");
    });

    it("reports a deleted panel as deleted", () => {
        panelState.missionEnabled = true;

        manager.setPanelDeleted(panelState, true);

        expect(manager.getPanelRegistryState(panelState)).toBe("deleted");
    });

    it("hides the panel and shows its chip when minimized", () => {
        panelState.missionEnabled = true;

        manager.setPanelMinimized(panelState, true);

        expect(panelState.panel.hidden).toBe(true);
        expect(panelState.panel.classList.contains("is-minimized")).toBe(true);
        expect(panelState.chipButton.hidden).toBe(false);
        expect(panelState.chipButton.getAttribute("aria-pressed")).toBe("true");
    });

    it("hides both the panel and its chip when closed", () => {
        manager.setPanelClosed(panelState, true);

        expect(panelState.panel.hidden).toBe(true);
        expect(panelState.chipButton.hidden).toBe(true);
    });

    it("clears the other hidden states when a panel is minimized", () => {
        manager.setPanelClosed(panelState, true);

        manager.setPanelMinimized(panelState, true);

        expect(panelState.closed).toBe(false);
        expect(panelState.deleted).toBe(false);
    });

    it("clears the minimized state when a panel is closed", () => {
        manager.setPanelMinimized(panelState, true);

        manager.setPanelClosed(panelState, true);

        expect(panelState.minimized).toBe(false);
    });

    it("restores a hidden panel to a visible one", () => {
        manager.setPanelClosed(panelState, true);

        manager.restorePanel(panelState);

        expect(panelState.closed).toBe(false);
        expect(panelState.deleted).toBe(false);
        expect(panelState.minimized).toBe(false);
        expect(panelState.panel.hidden).toBe(false);
    });

    it("routes an applied registry state to the matching transition", () => {
        manager.applyPanelVisibilityState(panelState, "closed");
        expect(panelState.closed).toBe(true);

        manager.applyPanelVisibilityState(panelState, "open");
        expect(panelState.closed).toBe(false);

        manager.applyPanelVisibilityState(panelState, "deleted");
        expect(panelState.deleted).toBe(true);
    });

    it("ignores a visibility state for a missing panel", () => {
        expect(() => manager.applyPanelVisibilityState(null, "open")).not.toThrow();
    });

    it("asks before deleting a panel and honours a refusal", () => {
        const confirmFn = vi.fn(() => false);
        vi.stubGlobal("confirm", confirmFn);

        expect(manager.confirmAndDeletePanel(panelState)).toBe(false);
        expect(panelState.deleted).toBe(false);
        expect(confirmFn.mock.calls[0][0]).toContain(panelState.title);

        vi.unstubAllGlobals();
    });

    it("deletes the panel once the prompt is accepted", () => {
        vi.stubGlobal("confirm", vi.fn(() => true));

        expect(manager.confirmAndDeletePanel(panelState)).toBe(true);
        expect(panelState.deleted).toBe(true);

        vi.unstubAllGlobals();
    });

    it("requests a redraw for each visible transition", () => {
        requestRender.mockClear();

        manager.setPanelClosed(panelState, true);
        manager.restorePanel(panelState);

        expect(requestRender.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it("can suppress the redraw and persistence for a silent transition", () => {
        requestRender.mockClear();

        manager.setPanelClosed(panelState, true, { persist: false, requestRender: false });

        expect(requestRender).not.toHaveBeenCalled();
    });
});

describe("maximize", () => {
    let panelState = null;

    beforeEach(() => {
        panelState = panelById("earth");
        panelState.panel.offsetLeft = 100;
        panelState.panel.offsetTop = 120;
        panelState.panel.offsetWidth = 300;
        panelState.panel.offsetHeight = 200;
    });

    it("captures the current frame before maximizing", () => {
        manager.setPanelMaximized(panelState, true);

        expect(panelState.maximized).toBe(true);
        expect(panelState.restoreFrame).toMatchObject({ width: 300, height: 200 });
        expect(panelState.panel.classList.contains("is-maximized")).toBe(true);
    });

    it("returns to the captured frame when restored", () => {
        manager.setPanelMaximized(panelState, true);

        manager.setPanelMaximized(panelState, false);

        expect(panelState.maximized).toBe(false);
        expect(panelState.panel.classList.contains("is-maximized")).toBe(false);
        expect(panelState.panel.style.width).toBe("300px");
        expect(panelState.panel.style.height).toBe("200px");
    });

    it("is a no-op when the state already matches", () => {
        manager.setPanelMaximized(panelState, true);
        const frame = panelState.restoreFrame;

        manager.setPanelMaximized(panelState, true);

        expect(panelState.restoreFrame).toBe(frame);
    });

    it("switches the expand button between expand and restore", () => {
        manager.setPanelMaximized(panelState, true);
        expect(panelState.expandButton.dataset.icon).toBe("restore");
        expect(panelState.expandButton.title).toContain("Restore");

        manager.setPanelMaximized(panelState, false);
        expect(panelState.expandButton.dataset.icon).toBe("expand");
    });

    it("un-maximizes a panel that is being deleted", () => {
        manager.setPanelMaximized(panelState, true);

        manager.setPanelDeleted(panelState, true);

        expect(panelState.maximized).toBe(false);
        expect(panelState.deleted).toBe(true);
    });

    it("keeps the composer's aspect ratio when it is maximized", () => {
        const composer = panelById("earth-rise-composer");

        const frame = manager.resolveMaximizedPanelFrame(composer);

        expect(frame.width / frame.height).toBeCloseTo(16 / 9, 1);
    });

    it("maximizes view panels to a square", () => {
        const frame = manager.resolveMaximizedPanelFrame(panelState);

        expect(frame.width).toBe(frame.height);
    });
});

describe("frame helpers", () => {
    it("keeps a panel rectangle inside the viewport with a margin", () => {
        expect(manager.clampPanelRect({ x: -500, y: -500, width: 300, height: 200 }))
            .toEqual({ x: 8, y: 8 });

        const clamped = manager.clampPanelRect({ x: 5000, y: 5000, width: 300, height: 200 });
        expect(clamped.x).toBe(1600 - 300 - 8);
        expect(clamped.y).toBe(900 - 200 - 8);
    });

    it("keeps an oversized panel pinned to the margin", () => {
        expect(manager.clampPanelRect({ x: 40, y: 40, width: 5000, height: 5000 }))
            .toEqual({ x: 8, y: 8 });
    });

    it("captures the live panel geometry", () => {
        const panelState = panelById("moon");
        panelState.panel.offsetLeft = 40;
        panelState.panel.offsetTop = 60;
        panelState.panel.offsetWidth = 320;
        panelState.panel.offsetHeight = 240;
        panelState.x = Number.NaN;
        panelState.y = Number.NaN;

        expect(manager.capturePanelFrame(panelState)).toEqual({
            x: 40, y: 60, width: 320, height: 240,
        });
    });

    it("returns nothing when there is no panel to capture", () => {
        expect(manager.capturePanelFrame(null)).toBeNull();
    });

    it("rejects a restore frame with no area", () => {
        const fallback = { x: 1, y: 2, width: 3, height: 4 };

        expect(manager.normalizePanelRestoreFrame(null, fallback)).toBe(fallback);
        expect(manager.normalizePanelRestoreFrame({ width: 0, height: 10 }, fallback)).toBe(fallback);
        expect(manager.normalizePanelRestoreFrame({ width: 10, height: -1 }, fallback)).toBe(fallback);
    });

    it("rounds a usable restore frame", () => {
        expect(manager.normalizePanelRestoreFrame({ x: 1.4, y: 2.6, width: 300.2, height: 200.8 }))
            .toEqual({ x: 1, y: 3, width: 300, height: 201 });
    });
});

describe("persistence", () => {
    it("writes panel preferences to storage after the debounce", () => {
        const panelState = panelById("earth");
        panelState.camera.fov = 33;

        manager.queuePersistPanelState();
        vi.advanceTimersByTime(200);

        const raw = dom.window.localStorage.getItem(STORAGE_KEY);
        expect(raw).toBeTruthy();
        expect(JSON.parse(raw).earth.fov).toBe(33);
    });

    it("coalesces repeated persistence requests into one write", () => {
        vi.advanceTimersByTime(500);
        const persist = vi.spyOn(manager, "persistPanelState");

        manager.queuePersistPanelState();
        manager.queuePersistPanelState();
        manager.queuePersistPanelState();
        expect(persist).not.toHaveBeenCalled();

        vi.advanceTimersByTime(200);

        expect(persist).toHaveBeenCalledTimes(1);
        expect(manager.persistStateTimeout).toBeNull();
    });

    it("records the composer's collapse and exposure preferences", () => {
        const composer = panelById("earth-rise-composer");
        composer.composerControlsCollapsed = true;
        composer.composerExposureEv = -1.5;
        composer.composerAutoExposureEnabled = false;

        manager.persistPanelState();

        const stored = JSON.parse(dom.window.localStorage.getItem(STORAGE_KEY));
        expect(stored["earth-rise-composer"]).toMatchObject({
            composerControlsCollapsed: true,
            composerExposureEv: -1.5,
            composerAutoExposureEnabled: false,
        });
    });

    it("reads back an empty state when storage holds nothing", () => {
        dom.window.localStorage.removeItem(STORAGE_KEY);

        expect(manager.readPersistedPanelState()).toEqual({});
    });

    it("ignores unparsable stored state", () => {
        dom.window.localStorage.setItem(STORAGE_KEY, "{not json");

        expect(manager.readPersistedPanelState()).toEqual({});
    });

    it("survives a storage that refuses to answer", () => {
        vi.spyOn(dom.window.localStorage, "getItem").mockImplementation(() => {
            throw new Error("storage disabled");
        });

        expect(manager.readPersistedPanelState()).toEqual({});
    });

    it("survives a storage that refuses to write", () => {
        vi.spyOn(dom.window.localStorage, "setItem").mockImplementation(() => {
            throw new Error("quota exceeded");
        });

        expect(() => manager.persistPanelState()).not.toThrow();
    });
});

describe("moon phase", () => {
    function bodyAt(x, y, z) {
        const object = new THREE.Object3D();
        object.position.set(x, y, z);
        object.updateMatrixWorld(true);
        return object;
    }

    beforeEach(() => {
        manager.moonElongationPrevious = null;
        manager.moonElongationTrend = 1;
    });

    it("needs both bodies to report a phase", () => {
        expect(manager.computeMoonPhaseInfo({ earth: null, moon: bodyAt(1, 0, 0) })).toBeNull();
        expect(manager.computeMoonPhaseInfo({ earth: bodyAt(0, 0, 0), moon: null })).toBeNull();
    });

    it("returns nothing when the Moon sits on the Earth", () => {
        expect(manager.computeMoonPhaseInfo({
            earth: bodyAt(0, 0, 0),
            moon: bodyAt(0, 0, 0),
        })).toBeNull();
    });

    it("reports a new Moon when the Moon lies toward the Sun", () => {
        manager.sunDirectionEarthWorld.set(1, 0, 0);

        const info = manager.computeMoonPhaseInfo({
            earth: bodyAt(0, 0, 0),
            moon: bodyAt(10, 0, 0),
        });

        expect(info.phaseName).toBe("New Moon");
        expect(info.elongationDeg).toBeCloseTo(0, 6);
    });

    it("reports a full Moon when the Moon lies opposite the Sun", () => {
        manager.sunDirectionEarthWorld.set(1, 0, 0);

        const info = manager.computeMoonPhaseInfo({
            earth: bodyAt(0, 0, 0),
            moon: bodyAt(-10, 0, 0),
        });

        expect(info.phaseName).toBe("Full Moon");
        expect(info.elongationDeg).toBeCloseTo(180, 6);
    });

    it("falls back to a Sun object when no Sun direction is published", () => {
        manager.sunDirectionEarthWorld.set(0, 0, 0);

        const info = manager.computeMoonPhaseInfo({
            earth: bodyAt(0, 0, 0),
            moon: bodyAt(0, 10, 0),
            sun: bodyAt(0, -100, 0),
        });

        expect(info.phaseName).toBe("Full Moon");
    });

    it("reports nothing when neither the Sun direction nor a Sun object is available", () => {
        manager.sunDirectionEarthWorld.set(0, 0, 0);

        expect(manager.computeMoonPhaseInfo({
            earth: bodyAt(0, 0, 0),
            moon: bodyAt(0, 10, 0),
        })).toBeNull();
    });

    it("names each phase by elongation and trend", () => {
        expect(manager.resolveMoonPhaseName(5, 1)).toBe("New Moon");
        expect(manager.resolveMoonPhaseName(45, 1)).toBe("Waxing Crescent");
        expect(manager.resolveMoonPhaseName(45, -1)).toBe("Waning Crescent");
        expect(manager.resolveMoonPhaseName(90, 1)).toBe("First Quarter");
        expect(manager.resolveMoonPhaseName(90, -1)).toBe("Last Quarter");
        expect(manager.resolveMoonPhaseName(130, 1)).toBe("Waxing Gibbous");
        expect(manager.resolveMoonPhaseName(130, -1)).toBe("Waning Gibbous");
        expect(manager.resolveMoonPhaseName(175, -1)).toBe("Full Moon");
    });

    it("tracks whether the Moon is waxing or waning between samples", () => {
        manager.sunDirectionEarthWorld.set(1, 0, 0);
        const earth = bodyAt(0, 0, 0);

        manager.computeMoonPhaseInfo({ earth, moon: bodyAt(10, 10, 0) });
        const waning = manager.computeMoonPhaseInfo({ earth, moon: bodyAt(10, 4, 0) });

        expect(manager.moonElongationTrend).toBe(-1);
        expect(waning.phaseName).toContain("Waning");
    });
});

describe("percentage rounding", () => {
    it("keeps the parts summing to one hundred", () => {
        expect(manager.roundPercentParts([33.3, 33.3, 33.4, 0])
            .reduce((total, value) => total + value, 0)).toBe(100);
    });

    it("distributes the remainder to the largest fractions first", () => {
        expect(manager.roundPercentParts([25.5, 25.5, 24.5, 24.5])).toEqual([26, 26, 24, 24]);
    });

    it("passes exact values through unchanged", () => {
        expect(manager.roundPercentParts([50, 25, 25, 0])).toEqual([50, 25, 25, 0]);
    });

    it("floors a negative part at zero", () => {
        expect(manager.roundPercentParts([-10, 40, 30, 30])).toEqual([0, 40, 30, 30]);
    });

    it("corrects an over-full set on the first part so the total stays at one hundred", () => {
        const parts = manager.roundPercentParts([50, 60, 0, 0]);

        expect(parts.reduce((total, value) => total + value, 0)).toBe(100);
        expect(parts[1]).toBe(60);
    });
});

describe("craft-to-Moon visibility", () => {
    function bodyAt(x, y, z) {
        const object = new THREE.Object3D();
        object.position.set(x, y, z);
        object.updateMatrixWorld(true);
        return object;
    }

    it("needs all three bodies", () => {
        expect(manager.computeCraftMoonVisibilityInfo({
            activeCraft: null,
            earth: bodyAt(0, 0, 0),
            moon: bodyAt(1, 0, 0),
        })).toBeNull();
    });

    it("reports nothing when a body sits on the Moon", () => {
        expect(manager.computeCraftMoonVisibilityInfo({
            activeCraft: bodyAt(0, 0, 0),
            earth: bodyAt(0, 0, 0),
            moon: bodyAt(0, 0, 0),
        })).toBeNull();
    });

    it("sees only the near side from directly above the Earth-facing hemisphere", () => {
        manager.sunDirectionMoonWorld.set(1, 0, 0);

        const info = manager.computeCraftMoonVisibilityInfo({
            activeCraft: bodyAt(100, 0, 0),
            earth: bodyAt(1000, 0, 0),
            moon: bodyAt(0, 0, 0),
        });

        expect(info.nearPct).toBe(100);
        expect(info.farPct).toBe(0);
    });

    it("sees only the far side from behind the Moon", () => {
        manager.sunDirectionMoonWorld.set(1, 0, 0);

        const info = manager.computeCraftMoonVisibilityInfo({
            activeCraft: bodyAt(-100, 0, 0),
            earth: bodyAt(1000, 0, 0),
            moon: bodyAt(0, 0, 0),
        });

        expect(info.farPct).toBe(100);
        expect(info.nearPct).toBe(0);
    });

    it("splits day and night across the illuminated hemisphere", () => {
        manager.sunDirectionMoonWorld.set(0, 1, 0);

        const info = manager.computeCraftMoonVisibilityInfo({
            activeCraft: bodyAt(100, 0, 0),
            earth: bodyAt(1000, 0, 0),
            moon: bodyAt(0, 0, 0),
        });

        expect(info.nearDayPct).toBeGreaterThan(0);
        expect(info.nearNightPct).toBeGreaterThan(0);
        expect(info.nearDayPct + info.nearNightPct + info.farDayPct + info.farNightPct).toBe(100);
    });

    it("falls back to a Sun object for illumination", () => {
        manager.sunDirectionMoonWorld.set(0, 0, 0);

        const info = manager.computeCraftMoonVisibilityInfo({
            activeCraft: bodyAt(100, 0, 0),
            earth: bodyAt(1000, 0, 0),
            moon: bodyAt(0, 0, 0),
            sun: bodyAt(0, 10000, 0),
        });

        expect(info).not.toBeNull();
        expect(info.nearDayPct).toBeGreaterThan(0);
    });
});

describe("field of view", () => {
    it("reports nothing for a non-positive distance", () => {
        expect(manager.computeAutoFovDegrees({ distanceToTarget: 0, targetRadius: 1, aspect: 1 }))
            .toBeNull();
        expect(manager.computeAutoFovDegrees({ distanceToTarget: Number.NaN, targetRadius: 1, aspect: 1 }))
            .toBeNull();
    });

    it("widens as the target gets closer", () => {
        const far = manager.computeAutoFovDegrees({ distanceToTarget: 1000, targetRadius: 10, aspect: 1 });
        const near = manager.computeAutoFovDegrees({ distanceToTarget: 100, targetRadius: 10, aspect: 1 });

        expect(near).toBeGreaterThan(far);
    });

    it("widens vertically for a wide viewport", () => {
        const square = manager.computeAutoFovDegrees({ distanceToTarget: 100, targetRadius: 10, aspect: 1 });
        const wide = manager.computeAutoFovDegrees({ distanceToTarget: 100, targetRadius: 10, aspect: 3 });

        expect(wide).toBeCloseTo(square, 6);
        const tall = manager.computeAutoFovDegrees({ distanceToTarget: 100, targetRadius: 10, aspect: 0.25 });
        expect(tall).toBeGreaterThan(square);
    });

    it("never exceeds a full hemisphere", () => {
        const fov = manager.computeAutoFovDegrees({ distanceToTarget: 1, targetRadius: 1000, aspect: 1 });

        expect(fov).toBeLessThanOrEqual(180);
    });

    it("clamps a view panel's automatic field of view into its own range", () => {
        const panelState = panelById("earth");

        expect(manager.clampAutoFovDegrees(panelState, 0.0001)).toBeGreaterThan(0);
        expect(manager.clampAutoFovDegrees(panelState, 500)).toBeLessThan(180);
    });

    it("gives the composer its own tighter minimum", () => {
        const composer = panelById("earth-rise-composer");
        const view = panelById("earth");

        expect(manager.clampAutoFovDegrees(composer, 0.0001))
            .toBeLessThan(manager.clampAutoFovDegrees(view, 0.0001));
    });
});

describe("geometry helpers", () => {
    it("samples a sphere evenly", () => {
        const samples = manager.createFibonacciSphereSamples(120);

        expect(samples).toHaveLength(360);
        for (let index = 0; index < samples.length; index += 3) {
            expect(Math.hypot(samples[index], samples[index + 1], samples[index + 2]))
                .toBeCloseTo(1, 6);
        }
    });

    it("never drops below a usable sample count", () => {
        expect(manager.createFibonacciSphereSamples(4)).toHaveLength(64 * 3);
    });

    it("reports a world position only for a real object", () => {
        const out = new THREE.Vector3();

        expect(manager.getObjectWorldPosition(null, out)).toBe(false);
        expect(manager.getObjectWorldPosition(new THREE.Object3D(), null)).toBe(false);
        expect(manager.getObjectWorldPosition(new THREE.Object3D(), out)).toBe(true);
    });

    it("resolves each anchor key from the render context", () => {
        const context = {
            activeCraft: new THREE.Object3D(),
            earth: new THREE.Object3D(),
            moon: new THREE.Object3D(),
            sun: new THREE.Object3D(),
        };
        context.moon.position.set(5, 0, 0);
        context.moon.updateMatrixWorld(true);
        const out = new THREE.Vector3();

        expect(manager.resolvePositionForKey("moon", context, out)).toBe(true);
        expect(out.x).toBe(5);
        expect(manager.resolvePositionForKey("craft", context, out)).toBe(true);
        expect(manager.resolvePositionForKey("earth", context, out)).toBe(true);
        expect(manager.resolvePositionForKey("sun", context, out)).toBe(true);
        expect(manager.resolvePositionForKey("moon", context, null)).toBe(false);
    });

    it("normalizes the published Sun direction per frame of reference", () => {
        manager.sunDirectionMoonWorld.set(0, 5, 0);
        const out = new THREE.Vector3();

        expect(manager.vectorFromSunDirection(out, "moon")).toBe(true);
        expect(out.toArray()).toEqual([0, 1, 0]);
    });

    it("reports no Sun direction when the published vector is degenerate", () => {
        manager.sunDirectionCraftWorld.set(0, 0, 0);

        expect(manager.vectorFromSunDirection(new THREE.Vector3(), "craft")).toBe(false);
    });

    it("picks the reference frame that matches each panel", () => {
        expect(manager.resolveSunDirectionForPanel(panelById("earth")))
            .toBe(manager.sunDirectionCraftWorld);
        expect(manager.resolveSunDirectionForPanel(panelById("earth-to-moon")))
            .toBe(manager.sunDirectionMoonWorld);
        expect(manager.resolveSunDirectionForPanel(null))
            .toBe(manager.sunDirectionEarthWorld);
    });

    it("estimates an object radius from its bounds", () => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));

        expect(manager.estimateObjectRadius(mesh)).toBeCloseTo(Math.sqrt(3), 5);
        expect(manager.estimateObjectRadius(null, 7)).toBe(7);
        expect(manager.estimateObjectRadius(new THREE.Object3D(), 7)).toBe(7);
    });

    it("estimates the craft radius with a sane fallback", () => {
        expect(manager.estimateCraftRadius(null)).toBe(1);
        expect(manager.estimateCraftRadius(new THREE.Object3D())).toBe(1);
        expect(manager.estimateCraftRadius(new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4))))
            .toBeCloseTo(2 * Math.sqrt(3), 5);
    });

    it("points the camera's up vector at ecliptic north", () => {
        const camera = new THREE.PerspectiveCamera();
        camera.position.set(10, 0, 0);

        manager.applyEclipticNorthUp(camera, new THREE.Vector3(0, 0, 0));

        expect(camera.up.z).toBeCloseTo(1, 6);
    });

    it("falls back when the camera sits on its own look target", () => {
        const camera = new THREE.PerspectiveCamera();
        camera.position.set(0, 0, 0);

        manager.applyEclipticNorthUp(camera, new THREE.Vector3(0, 0, 0));

        expect(camera.up.toArray()).toEqual([0, 0, 1]);
    });

    it("falls back when the view already looks along ecliptic north", () => {
        const camera = new THREE.PerspectiveCamera();
        camera.position.set(0, 0, 10);

        manager.applyEclipticNorthUp(camera, new THREE.Vector3(0, 0, 0));

        expect(camera.up.toArray()).toEqual([1, 0, 0]);
    });

    it("ignores an incomplete up request", () => {
        expect(() => manager.applyEclipticNorthUp(null, new THREE.Vector3())).not.toThrow();
        expect(() => manager.applyEclipticNorthUp(new THREE.PerspectiveCamera(), null)).not.toThrow();
    });
});

describe("temporary visibility suppression", () => {
    it("hides only the visible line primitives in a scene", () => {
        const scene = new THREE.Group();
        const line = new THREE.Line(new THREE.BufferGeometry());
        const hiddenLine = new THREE.Line(new THREE.BufferGeometry());
        hiddenLine.visible = false;
        const mesh = new THREE.Mesh(new THREE.BoxGeometry());
        scene.add(line, hiddenLine, mesh);

        const entries = manager.suppressLinePrimitives(scene);

        expect(entries).toHaveLength(1);
        expect(line.visible).toBe(false);
        expect(mesh.visible).toBe(true);
    });

    it("hides every craft object exactly once", () => {
        const craft = new THREE.Object3D();
        const drone = new THREE.Object3D();

        const entries = manager.suppressCraftVisuals({
            activeCraft: craft,
            craftsById: { ORION: craft, ESM: new THREE.Object3D() },
            dronesById: { DRONE: drone },
        });

        expect(entries).toHaveLength(3);
        expect(craft.visible).toBe(false);
        expect(drone.visible).toBe(false);
    });

    it("restores the recorded visibility", () => {
        const scene = new THREE.Group();
        const line = new THREE.Line(new THREE.BufferGeometry());
        scene.add(line);
        const entries = manager.suppressLinePrimitives(scene);

        manager.restoreVisibility(entries);

        expect(line.visible).toBe(true);
    });

    it("tolerates an empty restore list", () => {
        expect(() => manager.restoreVisibility(null)).not.toThrow();
    });
});

describe("orbit plane projection", () => {
    it("puts the Earth in the middle of the canvas", () => {
        const project = manager.createOrbitPlaneProjector({
            width: 200,
            height: 100,
            earthWorld: new THREE.Vector3(5, 7, 0),
            halfHeight: 50,
        });

        expect(project(new THREE.Vector3(5, 7, 0))).toEqual({ x: 100, y: 50 });
    });

    it("flips the world y axis to canvas coordinates", () => {
        const project = manager.createOrbitPlaneProjector({
            width: 200,
            height: 100,
            earthWorld: new THREE.Vector3(0, 0, 0),
            halfHeight: 50,
        });

        expect(project(new THREE.Vector3(0, 50, 0)).y).toBe(0);
        expect(project(new THREE.Vector3(0, -50, 0)).y).toBe(100);
    });

    it("keeps the aspect ratio square in world units", () => {
        const project = manager.createOrbitPlaneProjector({
            width: 200,
            height: 100,
            earthWorld: new THREE.Vector3(0, 0, 0),
            halfHeight: 50,
        });

        expect(project.scaleX).toBeCloseTo(project.scaleY, 9);
    });

    it("shifts the view by the requested pan offset", () => {
        const project = manager.createOrbitPlaneProjector({
            width: 200,
            height: 100,
            earthWorld: new THREE.Vector3(0, 0, 0),
            halfHeight: 50,
            panOffsetX: 10,
            panOffsetY: -10,
        });

        expect(project.centerX).toBe(10);
        expect(project.centerY).toBe(-10);
    });

    it("guards against a degenerate canvas", () => {
        const project = manager.createOrbitPlaneProjector({
            width: 0,
            height: 0,
            earthWorld: new THREE.Vector3(0, 0, 0),
            halfHeight: 0,
        });

        expect(Number.isFinite(project(new THREE.Vector3(1, 1, 0)).x)).toBe(true);
    });

    it("fits the Moon and the craft into the plane view", () => {
        const halfHeight = manager.computeOrbitPlaneHalfHeight({
            scene: null,
            earthWorld: new THREE.Vector3(0, 0, 0),
            moonWorld: new THREE.Vector3(400, 0, 0),
            craftWorld: new THREE.Vector3(0, 250, 0),
            earthRadius: 6,
            moonRadius: 2,
        });

        expect(halfHeight).toBeGreaterThan(400);
    });

    it("never collapses the plane view to nothing", () => {
        expect(manager.computeOrbitPlaneHalfHeight({
            scene: null,
            earthWorld: new THREE.Vector3(0, 0, 0),
            moonWorld: null,
            craftWorld: null,
            earthRadius: 0,
            moonRadius: 0,
        })).toBeGreaterThanOrEqual(1);
    });

    it("includes the mission curves it is given", () => {
        const scene = {
            activeCraftId: "SC",
            primaryCraftId: "SC",
            curvesById: {
                SC: [new THREE.Vector3(0, 900, 0), new THREE.Vector3(0, -900, 0)],
            },
        };

        const halfHeight = manager.computeOrbitPlaneHalfHeight({
            scene,
            earthWorld: new THREE.Vector3(0, 0, 0),
            moonWorld: new THREE.Vector3(10, 0, 0),
            craftWorld: new THREE.Vector3(10, 0, 0),
            earthRadius: 1,
            moonRadius: 1,
        });

        expect(halfHeight).toBeGreaterThan(900);
    });
});

describe("composer labels", () => {
    it("formats a sub-hour window in minutes", () => {
        expect(manager.formatComposerWindowLabel(30 * 60 * 1000)).toBe("+/-30m");
        expect(manager.formatComposerWindowLabel(0)).toBe("+/-1m");
        expect(manager.formatComposerWindowLabel(-500)).toBe("+/-1m");
    });

    it("formats a whole-hour window without minutes", () => {
        expect(manager.formatComposerWindowLabel(2 * 60 * 60 * 1000)).toBe("+/-2h");
    });

    it("formats a mixed window with both parts", () => {
        expect(manager.formatComposerWindowLabel((90 * 60 * 1000))).toBe("+/-1h 30m");
    });

    it("reports a placeholder for a time it cannot format", () => {
        expect(manager.formatLocalDateTime(Number.NaN)).toBe("--");
    });

    it("formats a real instant as a date and time", () => {
        const text = manager.formatLocalDateTime(Date.UTC(2026, 3, 6, 12, 30, 0));

        expect(text).toMatch(/\d/);
        expect(text.length).toBeGreaterThan(5);
    });

    it("selects bright star labels down to the requested magnitude", () => {
        const bright = manager.resolveComposerBrightStarLabelDescriptors(1);
        const dim = manager.resolveComposerBrightStarLabelDescriptors(4);

        expect(dim.length).toBeGreaterThanOrEqual(bright.length);
        expect(bright.every((entry) => entry.magnitude <= 1.0001)).toBe(true);
    });

    it("caches the descriptor list for a repeated magnitude limit", () => {
        const first = manager.resolveComposerBrightStarLabelDescriptors(2);
        const second = manager.resolveComposerBrightStarLabelDescriptors(2);

        expect(second).toBe(first);
    });
});

describe("disposal", () => {
    it("releases the panels, root and observers", () => {
        const root = manager.root;
        const renderers = manager.panels.map((panelState) => panelState.renderer);

        manager.dispose();

        expect(renderers.every((renderer) => renderer.dispose.mock.calls.length > 0)).toBe(true);
        expect(root.parentNode).toBeNull();
        expect(manager.root).toBeNull();
        expect(manager.panels).toEqual([]);
        manager = null;
    });

    it("is safe to dispose twice", () => {
        manager.dispose();

        expect(() => manager.dispose()).not.toThrow();
        manager = null;
    });

    it("stops responding to window resizes after disposal", () => {
        manager.dispose();
        const handle = manager;
        manager = null;

        expect(() => handle.handleResize()).not.toThrow();
    });
});

describe("render pass", () => {
    function makeBody(x, y, z, radius = 1) {
        const body = new THREE.Mesh(
            new THREE.SphereGeometry(radius, 8, 6),
            new THREE.MeshBasicMaterial(),
        );
        body.position.set(x, y, z);
        return body;
    }

    function makeRenderInput(overrides = {}) {
        const scene = new THREE.Scene();
        const earth = makeBody(0, 0, 0, 6);
        const moon = makeBody(384, 0, 0, 1.7);
        const activeCraft = makeBody(200, 30, 10, 0.02);
        scene.add(earth, moon, activeCraft);
        scene.updateMatrixWorld(true);
        const referenceCamera = new THREE.PerspectiveCamera(50, 1.5, 0.1, 100000);
        referenceCamera.position.set(0, -800, 200);
        referenceCamera.lookAt(new THREE.Vector3());
        referenceCamera.updateMatrixWorld(true);
        return {
            scene,
            earth,
            moon,
            activeCraft,
            referenceCamera,
            earthRadius: 6,
            moonRadius: 1.7,
            sunDirection: { x: 1, y: 0, z: 0 },
            panelsVisible: true,
            ...overrides,
        };
    }

    function enablePanels() {
        for (const panelState of manager.panels) {
            panelState.missionEnabled = true;
            panelState.viewport.setBoundingClientRect({ width: 320, height: 240 });
            panelState.panel.offsetWidth = 320;
            panelState.panel.offsetHeight = 240;
        }
    }

    it("does nothing once the manager has been disposed", () => {
        manager.dispose();
        const handle = manager;
        manager = null;

        expect(() => handle.render(makeRenderInput())).not.toThrow();
    });

    it("hides the overlay when the panels are switched off", () => {
        manager.render(makeRenderInput({ panelsVisible: false }));

        expect(manager.root.hidden).toBe(true);
    });

    it("hides the overlay when there is no scene or craft yet", () => {
        manager.render(makeRenderInput({ scene: null }));
        expect(manager.root.hidden).toBe(true);

        manager.render(makeRenderInput({ activeCraft: null }));
        expect(manager.root.hidden).toBe(true);
    });

    it("shows the overlay and draws each enabled panel", () => {
        enablePanels();

        manager.render(makeRenderInput());

        expect(manager.root.hidden).toBe(false);
        expect(panelById("earth").renderer.render.mock.calls.length).toBeGreaterThan(0);
    });

    it("normalizes the published Sun directions", () => {
        enablePanels();

        manager.render(makeRenderInput({
            sunDirections: {
                earthCentered: { x: 0, y: 5, z: 0 },
                moonCentered: { x: 0, y: 0, z: 3 },
            },
        }));

        expect(manager.sunDirectionEarthWorld.toArray()).toEqual([0, 1, 0]);
        expect(manager.sunDirectionMoonWorld.toArray()).toEqual([0, 0, 1]);
    });

    it("falls back to a default Sun direction when none is published", () => {
        enablePanels();

        manager.render(makeRenderInput({ sunDirection: null }));

        expect(manager.sunDirectionEarthWorld.toArray()).toEqual([1, 0, 0]);
    });

    it("records the flyby window from the mission timeline", () => {
        enablePanels();
        const soiIn = Date.UTC(2026, 3, 6, 4, 43, 12);
        const soiOut = Date.UTC(2026, 3, 7, 17, 27, 12);

        manager.render(makeRenderInput({
            timelineEventInfos: [
                { key: "soiIn", label: "Lunar SOI entry", startTime: new Date(soiIn) },
                { key: "soiOut", label: "Lunar SOI exit", startTime: new Date(soiOut) },
            ],
        }));

        expect(manager.composerFlybyWindowStartMs).toBeLessThan(soiIn);
        expect(manager.composerFlybyWindowEndMs).toBeGreaterThan(soiOut);
        expect(manager.composerFlybyEvents.length).toBeGreaterThan(0);
    });

    it("remembers the animation scene it was handed", () => {
        const animationScene = { name: "geo" };

        manager.render(makeRenderInput({ animationScene }));

        expect(manager.lastAnimationScene).toBe(animationScene);
    });

    it("keeps a closed panel out of the render pass", () => {
        enablePanels();
        const panelState = panelById("earth");
        manager.setPanelClosed(panelState, true);
        panelState.renderer.render.mockClear();

        manager.render(makeRenderInput());

        expect(panelState.renderer.render).not.toHaveBeenCalled();
    });

    it("draws the orbit plane panel onto its overlay canvas", () => {
        enablePanels();
        const orbitPanel = panelById("earth-origin-orbit-xy");

        manager.render(makeRenderInput());

        expect(orbitPanel.overlayCtx.calls.length).toBeGreaterThan(0);
    });
});
