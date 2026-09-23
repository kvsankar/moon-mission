import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

import { FakeResizeObserver } from "./helpers/fake-dom.js";
import { createManagerHarness, FakeWebGLRenderer } from "./helpers/auxiliary-camera-manager-harness.js";
import { getMissionPanelSnapshot } from "../src/platform/js/app/panel-registry.js";

let dom = null;
let manager = null;
let requestRender = null;

const STORAGE_KEY = "moon-mission:aux-camera-panels:v1";

function createManager(windowOverrides = {}) {
    const harness = createManagerHarness(windowOverrides);
    dom = harness.dom;
    requestRender = harness.requestRender;
    return harness.manager;
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
