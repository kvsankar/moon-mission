import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

import {
    AuxiliaryCameraViewsManager,
    AUXILIARY_VIEW_CAMERA_PRESETS,
    createAuxiliaryWebGLRendererWithFallback,
} from "../src/platform/js/app/auxiliary-camera-views.js";

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("createAuxiliaryWebGLRendererWithFallback", () => {
    function makeFakeRendererCtor({ failOnAntialias = false, failAlways = false } = {}) {
        const calls = [];
        const Ctor = vi.fn(function FakeWebGLRenderer(options) {
            calls.push(options);
            if (failAlways) {
                throw new Error("WebGL not available");
            }
            if (failOnAntialias && options?.antialias === true) {
                throw new Error("antialias not granted");
            }
            this.options = options;
        });
        return { Ctor, calls };
    }

    it("returns a renderer on the first attempt when antialias is available", () => {
        const { Ctor, calls } = makeFakeRendererCtor();
        const fakeTHREE = { WebGLRenderer: Ctor };

        const renderer = createAuxiliaryWebGLRendererWithFallback(fakeTHREE);

        expect(renderer).toBeInstanceOf(Ctor);
        expect(calls).toHaveLength(1);
        expect(calls[0]).toMatchObject({ antialias: true });
    });

    it("falls back to non-antialiased on antialias failure (no panel removal)", () => {
        // Reviewer-flagged regression case: previously aux panel construction
        // wrapped a single antialias:true attempt in try/catch and removed
        // the panel on failure. Low-end browsers silently lost composer /
        // Craft-to-Moon panels. Now we fall back instead.
        const { Ctor, calls } = makeFakeRendererCtor({ failOnAntialias: true });
        const fakeTHREE = { WebGLRenderer: Ctor };

        const renderer = createAuxiliaryWebGLRendererWithFallback(fakeTHREE);

        expect(renderer).toBeInstanceOf(Ctor);
        // First attempt has antialias:true and threw; the constructor was
        // called again with antialias:false, which succeeded.
        expect(calls.length).toBeGreaterThanOrEqual(2);
        expect(calls[0]).toMatchObject({ antialias: true });
        expect(calls[1]).toMatchObject({ antialias: false });
        expect(renderer.options.antialias).toBe(false);
    });

    it("throws the last error when every fallback attempt fails", () => {
        const { Ctor, calls } = makeFakeRendererCtor({ failAlways: true });
        const fakeTHREE = { WebGLRenderer: Ctor };

        expect(() => createAuxiliaryWebGLRendererWithFallback(fakeTHREE))
            .toThrow(/WebGL not available/);
        expect(calls.length).toBeGreaterThanOrEqual(3);
    });
});

describe("AUXILIARY_VIEW_CAMERA_PRESETS", () => {
    it("exposes the three desktop auxiliary view semantics for mobile reuse", () => {
        expect(AUXILIARY_VIEW_CAMERA_PRESETS).toEqual([
            {
                id: "earth",
                label: "Craft \u2192 Earth",
                positionMode: "spacecraft",
                lookMode: "earth",
            },
            {
                id: "moon",
                label: "Craft \u2192 Moon",
                positionMode: "spacecraft",
                lookMode: "moon",
            },
            {
                id: "earth-to-moon",
                label: "Earth \u2192 Moon",
                positionMode: "earth",
                lookMode: "moon",
            },
        ]);
    });
});

function createRecordingCanvasContext() {
    const strokes = [];
    let currentPath = [];
    const ctx = {
        strokes,
        save: vi.fn(),
        restore: vi.fn(),
        clearRect: vi.fn(),
        fillRect: vi.fn(),
        fill: vi.fn(),
        fillText: vi.fn(),
        arc: vi.fn(),
        setLineDash: vi.fn(),
        beginPath: vi.fn(() => {
            currentPath = [];
        }),
        moveTo: vi.fn((x, y) => {
            currentPath.push({ command: "M", x, y });
        }),
        lineTo: vi.fn((x, y) => {
            currentPath.push({ command: "L", x, y });
        }),
        closePath: vi.fn(() => {
            currentPath.push({ command: "Z" });
        }),
        stroke: vi.fn(() => {
            strokes.push({
                commands: currentPath.slice(),
                lineWidth: ctx.lineWidth,
                strokeStyle: ctx.strokeStyle,
            });
        }),
        font: "",
        fillStyle: "",
        lineWidth: 1,
        strokeStyle: "",
        textBaseline: "",
    };
    return ctx;
}

describe("Earth Orbit XY overlay", () => {
    function createManager() {
        vi.stubGlobal("window", { innerWidth: 500 });
        return new AuxiliaryCameraViewsManager({
            THREE,
            overlayHost: {},
            requestRender: vi.fn(),
        });
    }

    it("draws the orbit curve from scene trajectory data when line objects are absent", () => {
        const manager = createManager();
        const ctx = createRecordingCanvasContext();
        const scene = {
            activeCraftId: "SC",
            primaryCraftId: "SC",
            curvesById: {
                SC: [
                    new THREE.Vector3(0, 0, 0),
                    new THREE.Vector3(10, 7, 0),
                    new THREE.Vector3(20, 0, 0),
                ],
            },
            traverse: vi.fn(),
        };

        manager.renderOrbitPlane2DOverlay(
            {
                overlayCanvas: { width: 200, height: 100 },
                overlayCtx: ctx,
                orbitPanOffsetX: 0,
                orbitPanOffsetY: 0,
            },
            {
                scene,
                earthWorld: new THREE.Vector3(0, 0, 0),
                moonWorld: new THREE.Vector3(0, 18, 0),
                craftWorld: new THREE.Vector3(20, 0, 0),
                earthRadius: 1,
                moonRadius: 1,
                halfHeight: 20,
            },
        );

        expect(ctx.strokes.some((stroke) =>
            stroke.lineWidth === 1.35 &&
            stroke.commands.length === 3 &&
            stroke.commands[0].command === "M" &&
            stroke.commands[1].command === "L" &&
            stroke.commands[2].command === "L" &&
            stroke.commands[1].y < stroke.commands[0].y
        )).toBe(true);
    });

    it("treats empty draw ranges as undrawn line objects", () => {
        const manager = createManager();
        const ctx = createRecordingCanvasContext();
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
            "position",
            new THREE.Float32BufferAttribute([
                0, 0, 0,
                10, 0, 0,
            ], 3),
        );
        geometry.setDrawRange(0, 1);
        const line = new THREE.Line(
            geometry,
            new THREE.LineBasicMaterial({ color: 0x75b0ff }),
        );

        const drew = manager.drawOrbitPlaneLineObject(ctx, line, (point) => ({
            x: point.x,
            y: point.y,
        }));

        expect(drew).toBe(false);
        expect(ctx.strokes).toHaveLength(0);
    });

    it("auto-fits by resetting Orbit XY pan and zoom", () => {
        const manager = Object.create(AuxiliaryCameraViewsManager.prototype);
        const panelState = {
            mode: "orbit-xy",
            camera: { isOrthographicCamera: true },
            orbitZoomFovDegrees: 12,
            orbitPanOffsetX: 123,
            orbitPanOffsetY: -456,
            fovControl: {
                setFovDegrees: vi.fn(),
            },
        };

        expect(manager.applyOrbitPlaneAutoFit(panelState)).toBe(true);

        expect(panelState.orbitPanOffsetX).toBe(0);
        expect(panelState.orbitPanOffsetY).toBe(0);
        expect(panelState.orbitZoomFovDegrees).toBe(45);
        expect(panelState.fovControl.setFovDegrees).toHaveBeenCalledWith(45, 45);
    });
});

describe("Auxiliary visible panel refresh scheduling", () => {
    it("refreshes all visible panels after shared composer controls change", () => {
        let rafCallback = null;
        vi.stubGlobal("requestAnimationFrame", vi.fn((callback) => {
            rafCallback = callback;
            return 17;
        }));
        vi.stubGlobal("cancelAnimationFrame", vi.fn());

        const visibleEarthPanel = { panel: { hidden: false }, viewport: {} };
        const hiddenMoonPanel = { panel: { hidden: true }, viewport: {} };
        const visibleComposerPanel = { panel: { hidden: false }, viewport: {} };
        const manager = Object.assign(Object.create(AuxiliaryCameraViewsManager.prototype), {
            panels: [visibleEarthPanel, hiddenMoonPanel, visibleComposerPanel],
            visiblePanelsRefreshRaf: null,
            requestRender: vi.fn(),
            syncPanelSize: vi.fn(),
        });

        manager.scheduleVisiblePanelsRefresh();

        expect(manager.requestRender).not.toHaveBeenCalled();

        rafCallback();

        expect(manager.syncPanelSize).toHaveBeenCalledWith(visibleEarthPanel);
        expect(manager.syncPanelSize).toHaveBeenCalledWith(visibleComposerPanel);
        expect(manager.syncPanelSize).not.toHaveBeenCalledWith(hiddenMoonPanel);
        expect(manager.requestRender).toHaveBeenCalledTimes(1);
    });
});

describe("Auxiliary default panel layout", () => {
    function createPanel(hidden = false) {
        const style = {};
        return {
            hidden,
            style,
            get offsetWidth() {
                return Number.parseInt(style.width, 10) || 0;
            },
            get offsetHeight() {
                return Number.parseInt(style.height, 10) || 0;
            },
        };
    }

    function createPanelState(id, { mode = "target", hidden = false } = {}) {
        return {
            id,
            mode,
            side: mode === "composer" ? "left" : "right",
            defaultLayoutManaged: true,
            panel: createPanel(hidden),
        };
    }

    it("stacks the three visible right panels and centers Frame and Shoot beside them", () => {
        vi.stubGlobal("window", { innerWidth: 1600, innerHeight: 900 });
        vi.stubGlobal("document", {
            getElementById: vi.fn(() => null),
            querySelector: vi.fn(() => null),
            querySelectorAll: vi.fn(() => []),
        });

        const moon = createPanelState("moon");
        const earth = createPanelState("earth");
        const earthToMoon = createPanelState("earth-to-moon", { hidden: true });
        const orbitXy = createPanelState("earth-origin-orbit-xy");
        const composer = createPanelState("earth-rise-composer", { mode: "composer" });
        const manager = Object.assign(Object.create(AuxiliaryCameraViewsManager.prototype), {
            panels: [earth, moon, earthToMoon, orbitXy, composer],
            THREE: {
                MathUtils: {
                    clamp(value, min, max) {
                        return Math.min(Math.max(value, min), max);
                    },
                },
            },
            resolvePanelViewportBounds: () => ({
                left: 8,
                top: 80,
                right: 1592,
                bottom: 820,
                width: 1584,
                height: 740,
            }),
            readTimelineDockOffset: () => 8,
            clampPanelRect: ({ x, y }) => ({ x, y }),
        });

        manager.applyDefaultPanelLayout();

        expect(moon.panel.style.left).toBe("1376px");
        expect(moon.panel.style.top).toBe("80px");
        expect(earth.panel.style.left).toBe("1376px");
        expect(earth.panel.style.top).toBe("304px");
        expect(orbitXy.panel.style.left).toBe("1376px");
        expect(orbitXy.panel.style.top).toBe("528px");
        expect(earthToMoon.panel.style.left).toBeUndefined();
        expect(composer.panel.style.left).toBe("696px");
        expect(composer.panel.style.top).toBe("80px");
    });
});
