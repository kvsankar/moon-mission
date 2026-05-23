import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

import {
    AuxiliaryCameraViewsManager,
    AUXILIARY_VIEW_CAMERA_PRESETS,
    computeComposerDragSensitivityScale,
    composerRollDialKnobOffset,
    createAuxiliaryWebGLRendererWithFallback,
    isComposerPlanetVisibleForMagnitudeLimit,
    isComposerSkyLabelPointOccluded,
    normalizeComposerRollRad,
    resolveComposerSeeThroughMarkers,
    resolveComposerSkyLabelOccluders,
    resolveLunarFlybyWindowMs,
    rollRadFromDialPointer,
    selectComposerSkyLabelCandidates,
    shouldRenderComposerLunarCraterHover,
} from "../src/platform/js/app/auxiliary-camera-views.js";
import { LIGHT_SETTINGS as LT } from "../src/platform/js/core/constants.js";

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

describe("resolveLunarFlybyWindowMs", () => {
    it("returns SOI entry/exit bounds when present in mission events", () => {
        const paddingMs = 5 * 60 * 1000;
        const startMs = Date.UTC(2026, 3, 6, 4, 43, 12);
        const endMs = Date.UTC(2026, 3, 7, 17, 27, 12);
        const window = resolveLunarFlybyWindowMs([
            {
                key: "lunarSoiEntry",
                label: "Lunar SOI In",
                startTime: new Date(startMs),
            },
            {
                key: "closestApproach",
                label: "Lunar Flyby",
                startTime: new Date(Date.UTC(2026, 3, 6, 23, 6, 12)),
            },
            {
                key: "lunarSoiExit",
                label: "Lunar SOI Out",
                startTime: new Date(endMs),
            },
        ]);

        expect(window.startMs).toBe(startMs - paddingMs);
        expect(window.endMs).toBe(endMs + paddingMs);
    });

    it("returns NaN bounds when SOI entry/exit events are missing", () => {
        const window = resolveLunarFlybyWindowMs([
            {
                key: "closestApproach",
                label: "Lunar Flyby",
                startTime: new Date(Date.UTC(2026, 3, 6, 23, 6, 12)),
            },
        ]);

        expect(Number.isNaN(window.startMs)).toBe(true);
        expect(Number.isNaN(window.endMs)).toBe(true);
    });
});

describe("Frame and Shoot roll dial math", () => {
    it("normalizes roll angles into one positive turn", () => {
        expect(normalizeComposerRollRad(0)).toBe(0);
        expect(normalizeComposerRollRad(Math.PI * 2)).toBe(0);
        expect(normalizeComposerRollRad(-Math.PI / 2)).toBeCloseTo(Math.PI * 1.5);
    });

    it("maps dial pointer positions with 0 degrees at the top and counterclockwise positive", () => {
        const center = { centerX: 100, centerY: 100 };

        expect(rollRadFromDialPointer({ ...center, pointerX: 100, pointerY: 80 })).toBeCloseTo(0);
        expect(rollRadFromDialPointer({ ...center, pointerX: 120, pointerY: 100 })).toBeCloseTo(Math.PI * 1.5);
        expect(rollRadFromDialPointer({ ...center, pointerX: 100, pointerY: 120 })).toBeCloseTo(Math.PI);
        expect(rollRadFromDialPointer({ ...center, pointerX: 80, pointerY: 100 })).toBeCloseTo(Math.PI / 2);
    });

    it("places the roll knob on the same polar convention", () => {
        expect(composerRollDialKnobOffset(0, 18).x).toBeCloseTo(0);
        expect(composerRollDialKnobOffset(0, 18).y).toBeCloseTo(-18);
        expect(composerRollDialKnobOffset(Math.PI / 2, 18).x).toBeCloseTo(-18);
        expect(composerRollDialKnobOffset(Math.PI / 2, 18).y).toBeCloseTo(0);
    });
});

describe("Frame and Shoot drag sensitivity math", () => {
    it("keeps default FoV drag at the existing sensitivity", () => {
        expect(computeComposerDragSensitivityScale(50)).toBeCloseTo(1, 8);
    });

    it("reduces drag sensitivity at narrow FoV values", () => {
        const scaleAtOneDegree = computeComposerDragSensitivityScale(1);
        const expectedScale = Math.tan((1 * Math.PI / 180) * 0.5) /
            Math.tan((50 * Math.PI / 180) * 0.5);

        expect(scaleAtOneDegree).toBeCloseTo(expectedScale, 8);
        expect(scaleAtOneDegree).toBeLessThan(0.02);
    });

    it("continues tapering drag sensitivity for crater-scale FoV values", () => {
        const scaleAtTenthDegree = computeComposerDragSensitivityScale(0.1);
        const expectedScale = Math.tan((0.1 * Math.PI / 180) * 0.5) /
            Math.tan((50 * Math.PI / 180) * 0.5);

        expect(scaleAtTenthDegree).toBeCloseTo(expectedScale, 8);
        expect(scaleAtTenthDegree).toBeLessThan(0.002);
    });

    it("does not increase drag sensitivity beyond the legacy wide-FoV feel", () => {
        expect(computeComposerDragSensitivityScale(120)).toBe(1);
        expect(computeComposerDragSensitivityScale(Number.NaN)).toBe(1);
    });
});

describe("Frame and Shoot FoV bounds", () => {
    it("requests lunar feature hover renders in Show Always and hover modes", () => {
        expect(shouldRenderComposerLunarCraterHover({
            viewLunarCraters: true,
            lunarCraterDisplayMode: "always",
            lunarCraterHoverLabels: true,
        })).toBe(true);
        expect(shouldRenderComposerLunarCraterHover({
            viewLunarCraters: true,
            lunarCraterDisplayMode: "hover",
            lunarCraterHoverLabels: true,
        })).toBe(true);
        expect(shouldRenderComposerLunarCraterHover({
            viewLunarCraters: true,
            lunarCraterDisplayMode: "always",
            lunarCraterHoverLabels: false,
        })).toBe(false);
        expect(shouldRenderComposerLunarCraterHover({
            viewLunarCraters: false,
            lunarCraterDisplayMode: "always",
            lunarCraterHoverLabels: true,
        })).toBe(false);
    });

    it("applies lunar crater visibility for a composer render without mutating the shared scene", () => {
        const manager = Object.create(AuxiliaryCameraViewsManager.prototype);
        const renderer = {};
        const camera = {};
        const craterGroup = { visible: false };
        const scene = {
            getObjectByName: vi.fn((name) =>
                name === "lunar-crater-annotations" ? craterGroup : null,
            ),
        };
        const renderedVisibility = [];
        manager.renderLayers = vi.fn(() => {
            renderedVisibility.push(craterGroup.visible);
        });

        manager.renderComposerLayers(
            {
                renderer,
                camera,
                composerLunarCratersEnabled: true,
            },
            scene,
            { renderSkyLayer: false },
        );

        expect(renderedVisibility).toEqual([true]);
        expect(craterGroup.visible).toBe(false);

        craterGroup.visible = true;
        manager.renderComposerLayers(
            {
                renderer,
                camera,
                composerLunarCratersEnabled: false,
            },
            scene,
            { renderSkyLayer: false },
        );

        expect(renderedVisibility).toEqual([true, false]);
        expect(craterGroup.visible).toBe(true);
    });

    it("freezes Frame and Shoot lunar label scaling during viewport drag", () => {
        const manager = Object.create(AuxiliaryCameraViewsManager.prototype);
        const renderer = {};
        const camera = {};
        const animationScene = {
            lunarCraterGroup: { name: "lunar-crater-annotations", visible: false },
            addLunarCraterAnnotations: vi.fn(function addLunarCraterAnnotations() {
                this.lunarCraterGroup = { name: "lunar-crater-annotations", visible: false };
            }),
            setLunarCraterHoverLabelsEnabled: vi.fn(),
            clearLunarCraterHover: vi.fn(),
            updateLunarCraterLabelScales: vi.fn(),
        };
        const scene = {
            getObjectByName: vi.fn((name) =>
                name === "lunar-crater-annotations" ? animationScene.lunarCraterGroup : null,
            ),
        };
        manager.renderLayers = vi.fn();

        manager.renderComposerLayers(
            {
                renderer,
                camera,
                composerLunarCratersEnabled: true,
                composerViewportPointer: { pointerId: 1 },
            },
            scene,
            { animationScene },
        );

        expect(animationScene.updateLunarCraterLabelScales).toHaveBeenCalledWith({
            camera,
            rendererDomElement: null,
            freezeScale: true,
        });
    });

    it("injects active transcript lunar feature names into the composer crater render", () => {
        const manager = Object.create(AuxiliaryCameraViewsManager.prototype);
        const renderer = {};
        const camera = {};
        const pinnedNameCalls = [];
        const animationScene = {
            lunarCraterGroup: { name: "lunar-crater-annotations", visible: false },
            addLunarCraterAnnotations: vi.fn(function addLunarCraterAnnotations() {
                pinnedNameCalls.push(this.lunarFeaturePinnedNames);
                this.lunarCraterGroup = { name: "lunar-crater-annotations", visible: false };
            }),
            setLunarCraterHoverLabelsEnabled: vi.fn(),
            clearLunarCraterHover: vi.fn(),
            updateLunarCraterLabelScales: vi.fn(),
            disposeLunarCraterAnnotations: vi.fn(),
        };
        const scene = {
            getObjectByName: vi.fn((name) =>
                name === "lunar-crater-annotations" ? animationScene.lunarCraterGroup : null,
            ),
        };
        manager.renderLayers = vi.fn();

        manager.renderComposerLayers(
            {
                renderer,
                camera,
                composerLunarCratersEnabled: false,
                composerLunarFeatureMentionView: {
                    activeCatalogNames: ["Grimaldi", "Ohm"],
                },
            },
            scene,
            { animationScene },
        );

        expect(pinnedNameCalls[0]).toEqual(["Grimaldi", "Ohm"]);
        expect(animationScene.setLunarCraterHoverLabelsEnabled).toHaveBeenCalledWith(true);
    });

    it("does not inject transcript lunar features when Frame and Shoot sync is disabled", () => {
        const manager = Object.create(AuxiliaryCameraViewsManager.prototype);
        const renderer = {};
        const camera = {};
        const pinnedNameCalls = [];
        const animationScene = {
            lunarCraterGroup: { name: "lunar-crater-annotations", visible: false },
            addLunarCraterAnnotations: vi.fn(function addLunarCraterAnnotations() {
                pinnedNameCalls.push(this.lunarFeaturePinnedNames);
                this.lunarCraterGroup = { name: "lunar-crater-annotations", visible: false };
            }),
            setLunarCraterHoverLabelsEnabled: vi.fn(),
            clearLunarCraterHover: vi.fn(),
            updateLunarCraterLabelScales: vi.fn(),
            disposeLunarCraterAnnotations: vi.fn(),
        };
        const scene = {
            getObjectByName: vi.fn((name) =>
                name === "lunar-crater-annotations" ? animationScene.lunarCraterGroup : null,
            ),
        };
        manager.renderLayers = vi.fn();

        manager.renderComposerLayers(
            {
                renderer,
                camera,
                composerLunarCratersEnabled: false,
                composerLunarFeatureSyncedEnabled: false,
                composerLunarFeatureMentionView: {
                    activeCatalogNames: ["Grimaldi"],
                },
            },
            scene,
            { animationScene },
        );

        expect(pinnedNameCalls).toEqual([]);
        expect(animationScene.setLunarCraterHoverLabelsEnabled).not.toHaveBeenCalled();
    });

    it("keeps ordinary auxiliary renders independent from fullscreen lunar crater visibility", () => {
        const manager = Object.create(AuxiliaryCameraViewsManager.prototype);
        const renderer = {};
        const camera = {};
        const craterGroup = { visible: true };
        const scene = {
            getObjectByName: vi.fn((name) =>
                name === "lunar-crater-annotations" ? craterGroup : null,
            ),
        };
        const renderedVisibility = [];
        manager.renderLayers = vi.fn(() => {
            renderedVisibility.push(craterGroup.visible);
        });

        manager.renderAuxiliaryPanelLayers(
            { renderer, camera },
            scene,
            { renderSkyLayer: false },
        );

        expect(renderedVisibility).toEqual([false]);
        expect(craterGroup.visible).toBe(true);
    });

    it("allows manual crater-scale FoV down to a tenth of a degree", () => {
        const updates = [];
        const position = { x: 12, y: 34, z: 56 };
        const manager = Object.create(AuxiliaryCameraViewsManager.prototype);
        const panelState = {
            camera: {
                fov: 50,
                position,
                updateProjectionMatrix: vi.fn(() => updates.push("projection")),
            },
            fovControl: {
                setFovDegrees: vi.fn(),
            },
            overlayDirty: false,
        };

        manager.setPanelFov(panelState, 0.1);

        expect(panelState.camera.fov).toBe(0.1);
        expect(panelState.camera.updateProjectionMatrix).toHaveBeenCalledTimes(1);
        expect(panelState.overlayDirty).toBe(true);
        expect(panelState.fovControl.setFovDegrees).toHaveBeenCalledWith(0.1, 0.1);
        expect(panelState.camera.position).toBe(position);
        expect(panelState.camera.position).toEqual({ x: 12, y: 34, z: 56 });
        expect(updates).toEqual(["projection"]);
    });

    it("clamps Frame and Shoot FoV below a tenth of a degree", () => {
        const manager = Object.create(AuxiliaryCameraViewsManager.prototype);
        const panelState = {
            camera: {
                fov: 50,
                updateProjectionMatrix: vi.fn(),
            },
            fovControl: {
                setFovDegrees: vi.fn(),
            },
            overlayDirty: false,
        };

        manager.setPanelFov(panelState, 0.01);

        expect(panelState.camera.fov).toBe(0.1);
        expect(panelState.fovControl.setFovDegrees).toHaveBeenCalledWith(0.1, 0.1);
    });

    it("keeps target-panel Auto FoV in presentation bounds", () => {
        const manager = Object.create(AuxiliaryCameraViewsManager.prototype);
        const panelState = {
            mode: "target",
            camera: { fov: 45 },
        };

        expect(manager.clampAutoFovDegrees(panelState, 0.5)).toBe(3);
        expect(manager.clampAutoFovDegrees(panelState, 174.5)).toBe(70);
        expect(manager.clampAutoFovDegrees(panelState, 12)).toBe(12);
    });

    it("allows Moon target panels to auto-fit below the generic target-panel floor", () => {
        const manager = Object.create(AuxiliaryCameraViewsManager.prototype);
        const panelState = {
            mode: "target",
            targetKey: "moon",
            camera: { fov: 45 },
        };

        expect(manager.clampAutoFovDegrees(panelState, 0.5)).toBe(1.5);
        expect(manager.clampAutoFovDegrees(panelState, 1.6)).toBe(1.6);
    });

    it("lets Frame and Shoot Auto FoV use a practical wide-angle range", () => {
        const manager = Object.create(AuxiliaryCameraViewsManager.prototype);
        const panelState = {
            mode: "composer",
            camera: { fov: 50 },
        };

        expect(manager.clampAutoFovDegrees(panelState, 0.5)).toBe(0.5);
        expect(manager.clampAutoFovDegrees(panelState, 174.5)).toBe(120);
        expect(manager.clampAutoFovDegrees(panelState, 119.5)).toBe(119.5);
        expect(manager.clampAutoFovDegrees(panelState, 12)).toBe(12);
    });

    it("does not pin far or near Frame and Shoot Auto FoV to the old composition bounds", () => {
        const manager = Object.assign(Object.create(AuxiliaryCameraViewsManager.prototype), {
            THREE,
            tmpVectorA: new THREE.Vector3(),
            tmpVectorB: new THREE.Vector3(),
        });
        const panelState = {
            mode: "composer",
            camera: {
                fov: 50,
                aspect: 16 / 9,
            },
        };

        const farTargetFov = manager.computeComposerAutoFovDegrees({
            panelState,
            craftWorld: new THREE.Vector3(0, 0, 0),
            moonWorld: new THREE.Vector3(1000, 0, 0),
            earthWorld: new THREE.Vector3(0, 0, 0),
            moonRadius: 1,
            earthRadius: 1,
            lockTarget: "moon",
        });
        const nearTargetFov = manager.computeComposerAutoFovDegrees({
            panelState,
            craftWorld: new THREE.Vector3(0, 0, 0),
            moonWorld: new THREE.Vector3(1.1, 0, 0),
            earthWorld: new THREE.Vector3(0, 0, 0),
            moonRadius: 1,
            earthRadius: 1,
            lockTarget: "moon",
        });

        expect(farTargetFov).toBeLessThan(2);
        expect(manager.clampAutoFovDegrees(panelState, farTargetFov)).toBeCloseTo(farTargetFov);
        expect(nearTargetFov).toBeGreaterThan(70);
        expect(manager.clampAutoFovDegrees(panelState, nearTargetFov)).toBeGreaterThan(70);
        expect(manager.clampAutoFovDegrees(panelState, nearTargetFov)).toBeLessThanOrEqual(120);
    });

    it("widens Moon-locked Auto FoV to include a close foreground Earth", () => {
        const manager = Object.assign(Object.create(AuxiliaryCameraViewsManager.prototype), {
            THREE,
            tmpVectorA: new THREE.Vector3(),
            tmpVectorB: new THREE.Vector3(),
        });
        const panelState = {
            mode: "composer",
            camera: {
                fov: 50,
                aspect: 16 / 9,
            },
        };

        const moonOnlyFov = manager.computeComposerAutoFovDegrees({
            panelState,
            craftWorld: new THREE.Vector3(0, 0, 0),
            moonWorld: new THREE.Vector3(1000, 0, 0),
            earthWorld: new THREE.Vector3(0, 1000, 0),
            moonRadius: 1,
            earthRadius: 40,
            lockTarget: "moon",
        });
        const foregroundEarthFov = manager.computeComposerAutoFovDegrees({
            panelState,
            craftWorld: new THREE.Vector3(0, 0, 0),
            moonWorld: new THREE.Vector3(1000, 0, 0),
            earthWorld: new THREE.Vector3(100, 2, 0),
            moonRadius: 1,
            earthRadius: 40,
            lockTarget: "moon",
        });

        expect(moonOnlyFov).toBeLessThan(2);
        expect(foregroundEarthFov).toBeGreaterThan(90);
        expect(manager.clampAutoFovDegrees(panelState, foregroundEarthFov)).toBe(foregroundEarthFov);
    });

    it("caps Earth-locked Auto FoV when the craft is extremely close to Earth", () => {
        const manager = Object.assign(Object.create(AuxiliaryCameraViewsManager.prototype), {
            THREE,
            tmpVectorA: new THREE.Vector3(),
            tmpVectorB: new THREE.Vector3(),
        });
        const panelState = {
            mode: "composer",
            camera: {
                fov: 50,
                aspect: 16 / 9,
            },
        };

        const autoFov = manager.computeComposerAutoFovDegrees({
            panelState,
            craftWorld: new THREE.Vector3(0, 0, 0),
            earthWorld: new THREE.Vector3(1, 0, 0),
            moonWorld: new THREE.Vector3(1000, 0, 0),
            earthRadius: 1,
            moonRadius: 1,
            lockTarget: "earth",
        });

        expect(autoFov).toBeGreaterThan(179);
        expect(manager.clampAutoFovDegrees(panelState, autoFov)).toBe(120);
    });

    it("allows manual Frame and Shoot FoV across the optical range", () => {
        const manager = Object.create(AuxiliaryCameraViewsManager.prototype);
        const panelState = {
            mode: "composer",
            camera: {
                fov: 50,
                updateProjectionMatrix: vi.fn(),
            },
            fovControl: {
                setFovDegrees: vi.fn(),
            },
        };

        manager.setPanelFov(panelState, 143.5);

        expect(panelState.camera.fov).toBe(143.5);
        expect(panelState.fovControl.setFovDegrees).toHaveBeenCalledWith(143.5, 143.5);
    });

    it("applies eclipse auto exposure only when the Frame and Shoot Moon target is eligible", () => {
        const manager = Object.assign(Object.create(AuxiliaryCameraViewsManager.prototype), {
            THREE,
        });
        const panelState = {
            mode: "composer",
            composerExposureEv: 0,
            composerAutoExposureEnabled: true,
            composerSolarEclipseActive: true,
            composerEclipseAutoExposureEligible: true,
        };

        expect(manager.resolveComposerExposureState(panelState).autoEv).toBe(5);

        panelState.composerEclipseAutoExposureEligible = false;
        const earthOnlyState = manager.resolveComposerExposureState(panelState);

        expect(earthOnlyState.autoEv).toBe(0);
        expect(earthOnlyState.multiplier).toBe(1);
    });

    it("applies eclipse auto exposure to the visible active occluder", () => {
        const manager = Object.assign(Object.create(AuxiliaryCameraViewsManager.prototype), {
            THREE,
            tmpVectorA: new THREE.Vector3(),
            tmpVectorB: new THREE.Vector3(),
        });
        const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 1000);
        const panelState = {
            mode: "composer",
            camera,
            renderer: {
                domElement: {
                    width: 1280,
                    height: 720,
                },
            },
        };

        camera.position.set(0, 0, 0);
        camera.lookAt(new THREE.Vector3(100, 0, 0));
        camera.updateMatrixWorld(true);
        camera.updateProjectionMatrix();

        expect(manager.shouldApplyComposerEclipseAutoExposure(panelState, {
            eclipseState: { active: true, occluder: "earth" },
            earthWorld: new THREE.Vector3(100, 0, 0),
            earthRadius: 10,
            moonWorld: new THREE.Vector3(0, 100, 0),
            moonRadius: 3,
        })).toBe(true);
        expect(manager.shouldApplyComposerEclipseAutoExposure(panelState, {
            eclipseState: { active: true, occluder: "moon" },
            earthWorld: new THREE.Vector3(100, 0, 0),
            earthRadius: 10,
            moonWorld: new THREE.Vector3(0, 100, 0),
            moonRadius: 3,
        })).toBe(false);

        camera.lookAt(new THREE.Vector3(0, 100, 0));
        camera.updateMatrixWorld(true);
        camera.updateProjectionMatrix();

        expect(manager.shouldApplyComposerEclipseAutoExposure(panelState, {
            eclipseState: { active: true, occluder: "moon" },
            earthWorld: new THREE.Vector3(100, 0, 0),
            earthRadius: 10,
            moonWorld: new THREE.Vector3(0, 100, 0),
            moonRadius: 3,
        })).toBe(true);
        expect(manager.shouldApplyComposerEclipseAutoExposure(panelState, {
            eclipseState: { active: true, occluder: "earth" },
            earthWorld: new THREE.Vector3(100, 0, 0),
            earthRadius: 10,
            moonWorld: new THREE.Vector3(0, 100, 0),
            moonRadius: 3,
        })).toBe(false);
    });

    it("clamps manual Frame and Shoot FoV at optical bounds", () => {
        const manager = Object.create(AuxiliaryCameraViewsManager.prototype);
        const panelState = {
            mode: "composer",
            camera: {
                fov: 50,
                updateProjectionMatrix: vi.fn(),
            },
            fovControl: {
                setFovDegrees: vi.fn(),
            },
        };

        manager.setPanelFov(panelState, 240);

        expect(panelState.camera.fov).toBe(179);
        expect(panelState.fovControl.setFovDegrees).toHaveBeenCalledWith(179, 179);
    });
});

describe("Frame and Shoot lock target FoV behavior", () => {
    function createLockTargetHarness({ lockTarget = "moon", autoFovEnabled = false } = {}) {
        const panelState = {
            mode: "composer",
            composerInteractionEnabled: true,
            composerLockTarget: lockTarget,
            autoFovEnabled,
        };
        const manager = Object.assign(Object.create(AuxiliaryCameraViewsManager.prototype), {
            activateComposerWindow: vi.fn(),
            queuePersistPanelState: vi.fn(),
            requestRender: vi.fn(),
        });
        const syncComposerLockUi = vi.fn();
        const syncAutoToggleUi = vi.fn();
        return {
            manager,
            panelState,
            syncComposerLockUi,
            syncAutoToggleUi,
        };
    }

    it("re-enables auto FoV when switching between Earth and Moon locks", () => {
        const {
            manager,
            panelState,
            syncComposerLockUi,
            syncAutoToggleUi,
        } = createLockTargetHarness({
            lockTarget: "moon",
            autoFovEnabled: false,
        });

        manager.setComposerLockTarget(panelState, "earth", {
            syncComposerLockUi,
            syncAutoToggleUi,
        });

        expect(panelState.composerLockTarget).toBe("earth");
        expect(panelState.autoFovEnabled).toBe(true);
        expect(syncAutoToggleUi).toHaveBeenCalledTimes(1);
        expect(syncComposerLockUi).toHaveBeenCalledTimes(1);
        expect(manager.requestRender).toHaveBeenCalledTimes(1);
    });

    it("does not discard a manual crater-scale FoV when re-clicking the same body lock", () => {
        const {
            manager,
            panelState,
            syncAutoToggleUi,
        } = createLockTargetHarness({
            lockTarget: "moon",
            autoFovEnabled: false,
        });

        manager.setComposerLockTarget(panelState, "moon", {
            syncAutoToggleUi,
        });

        expect(panelState.composerLockTarget).toBe("moon");
        expect(panelState.autoFovEnabled).toBe(false);
        expect(syncAutoToggleUi).not.toHaveBeenCalled();
    });

    it("can force auto FoV back on for guided composer restores", () => {
        const {
            manager,
            panelState,
            syncAutoToggleUi,
        } = createLockTargetHarness({
            lockTarget: "moon",
            autoFovEnabled: false,
        });

        manager.setComposerLockTarget(panelState, "moon", {
            syncAutoToggleUi,
            forceAuto: true,
        });

        expect(panelState.composerLockTarget).toBe("moon");
        expect(panelState.autoFovEnabled).toBe(true);
        expect(syncAutoToggleUi).toHaveBeenCalledTimes(1);
    });

    it("turns off auto FoV when switching to Free", () => {
        const {
            manager,
            panelState,
            syncComposerLockUi,
            syncAutoToggleUi,
        } = createLockTargetHarness({
            lockTarget: "moon",
            autoFovEnabled: true,
        });

        manager.setComposerLockTarget(panelState, "none", {
            syncComposerLockUi,
            syncAutoToggleUi,
        });

        expect(panelState.composerLockTarget).toBe("none");
        expect(panelState.autoFovEnabled).toBe(false);
        expect(syncAutoToggleUi).toHaveBeenCalledTimes(1);
        expect(syncComposerLockUi).toHaveBeenCalledTimes(1);
        expect(manager.requestRender).toHaveBeenCalledTimes(1);
    });

    it("clears stale media-shot state when a lock button is selected", () => {
        const {
            manager,
            panelState,
        } = createLockTargetHarness({
            lockTarget: "earth",
            autoFovEnabled: false,
        });
        panelState.composerMediaDriven = true;
        panelState.composerSurfaceTarget = { bodyId: "moon" };

        manager.setComposerLockTarget(panelState, "moon");

        expect(panelState.composerLockTarget).toBe("moon");
        expect(panelState.composerMediaDriven).toBe(false);
        expect(panelState.composerSurfaceTarget).toBe(null);
    });
});

describe("Frame and Shoot media shot hints", () => {
    it("applies Earth shot hints as locked manual-FoV composer views", () => {
        const panelState = {
            mode: "composer",
            composerInteractionEnabled: true,
            composerLockTarget: "moon",
            composerOrientationReference: "world",
            autoFovEnabled: true,
            camera: {
                fov: 50,
                updateProjectionMatrix: vi.fn(),
            },
            fovControl: {
                setFovDegrees: vi.fn(),
            },
            syncComposerLockUi: vi.fn(),
            syncComposerAutoToggleUi: vi.fn(),
        };
        const manager = Object.assign(Object.create(AuxiliaryCameraViewsManager.prototype), {
            activateComposerWindow: vi.fn(),
            queuePersistPanelState: vi.fn(),
            requestRender: vi.fn(),
        });

        const applied = manager.applyComposerMediaShotHint(panelState, {
            lockTarget: "earth",
            orientationReference: "moon-north",
            verticalFovDegrees: 12.5,
        });

        expect(applied).toBe(true);
        expect(panelState.composerLockTarget).toBe("earth");
        expect(panelState.composerOrientationReference).toBe("moon-north");
        expect(panelState.autoFovEnabled).toBe(false);
        expect(panelState.camera.fov).toBeCloseTo(12.5);
        expect(panelState.composerMediaDriven).toBe(true);
        expect(panelState.syncComposerLockUi).toHaveBeenCalled();
        expect(panelState.syncComposerAutoToggleUi).toHaveBeenCalled();
    });
});

describe("Frame and Shoot local event time formatting", () => {
    it("shows available event precision down to seconds", () => {
        const manager = Object.create(AuxiliaryCameraViewsManager.prototype);

        const formatted = manager.formatLocalDateTime(Date.UTC(2026, 3, 1, 12, 34, 56));

        expect(formatted).toMatch(/\d{2}:\d{2}:56/);
    });
});

describe("selectComposerSkyLabelCandidates", () => {
    it("selects the brightest 20 percent of projected in-view stars", () => {
        const candidates = [
            { text: "dim", magnitude: 5, point: { x: 10, y: 10 } },
            { text: "brightest", magnitude: -1, point: { x: 20, y: 20 } },
            { text: "mid", magnitude: 2, point: { x: 30, y: 30 } },
            { text: "bright", magnitude: 0, point: { x: 40, y: 40 } },
            { text: "faint", magnitude: 4, point: { x: 50, y: 50 } },
            { text: "middle", magnitude: 3, point: { x: 60, y: 60 } },
            { text: "fainter", magnitude: 4.5, point: { x: 70, y: 70 } },
            { text: "middim", magnitude: 3.5, point: { x: 80, y: 80 } },
            { text: "barely", magnitude: 5.5, point: { x: 90, y: 90 } },
            { text: "very dim", magnitude: 6, point: { x: 100, y: 100 } },
        ];

        expect(selectComposerSkyLabelCandidates(candidates).map((candidate) => candidate.text)).toEqual([
            "brightest",
            "bright",
        ]);
    });

    it("ignores non-projectable candidates and respects the label cap", () => {
        const candidates = [
            { text: "bad point", magnitude: -2, point: { x: Number.NaN, y: 10 } },
            { text: "", magnitude: -1, point: { x: 10, y: 10 } },
            { text: "A", magnitude: 0, point: { x: 10, y: 10 } },
            { text: "B", magnitude: 1, point: { x: 10, y: 10 } },
            { text: "C", magnitude: 2, point: { x: 10, y: 10 } },
        ];

        expect(
            selectComposerSkyLabelCandidates(candidates, {
                visibleFraction: 1,
                maxCount: 2,
            }).map((candidate) => candidate.text),
        ).toEqual(["A", "B"]);
    });

    it("ranks planet and star label candidates in one brightness order", () => {
        const candidates = [
            { text: "Sirius", style: "star", magnitude: -1.46, point: { x: 10, y: 10 } },
            { text: "Venus", style: "planet", magnitude: -4.4, point: { x: 20, y: 20 } },
            { text: "Jupiter", style: "planet", magnitude: -2.7, point: { x: 30, y: 30 } },
            { text: "Canopus", style: "star", magnitude: -0.74, point: { x: 40, y: 40 } },
        ];

        const selected = selectComposerSkyLabelCandidates(candidates, {
            visibleFraction: 1,
            maxCount: 4,
        });

        expect(selected.map((candidate) => candidate.text)).toEqual([
            "Venus",
            "Jupiter",
            "Sirius",
            "Canopus",
        ]);
        expect(selected[0].style).toBe("planet");
    });
});

describe("Frame and Shoot sky label occlusion", () => {
    it("treats label anchors inside a foreground body disk as occluded", () => {
        const occluders = [{ x: 100, y: 120, radiusPx: 24 }];

        expect(isComposerSkyLabelPointOccluded({ x: 110, y: 130 }, occluders)).toBe(true);
        expect(isComposerSkyLabelPointOccluded({ x: 140, y: 120 }, occluders)).toBe(false);
    });

    it("projects Earth and Moon world positions into screen-space label occluders", () => {
        const camera = new THREE.PerspectiveCamera(60, 2, 0.1, 1000);
        camera.position.set(0, 0, 0);
        camera.lookAt(0, 0, -1);
        camera.updateMatrixWorld(true);
        camera.updateProjectionMatrix();

        const occluders = resolveComposerSkyLabelOccluders({
            THREE,
            camera,
            width: 1000,
            height: 500,
            bodies: [
                { bodyId: "earth", centerWorld: new THREE.Vector3(0, 0, -10), radius: 1 },
                { bodyId: "behind-camera", centerWorld: new THREE.Vector3(0, 0, 10), radius: 1 },
            ],
            paddingPx: 0,
        });

        expect(occluders).toHaveLength(1);
        expect(occluders[0].bodyId).toBe("earth");
        expect(occluders[0].x).toBeCloseTo(500, 6);
        expect(occluders[0].y).toBeCloseTo(250, 6);
        expect(occluders[0].radiusPx).toBeGreaterThan(40);
    });
});

describe("Frame and Shoot see-through markers", () => {
    it("returns a dotted Sun marker when the Sun is behind Earth/Moon occluders", () => {
        const camera = new THREE.PerspectiveCamera(60, 2, 0.1, 1000);
        camera.position.set(0, 0, 0);
        camera.lookAt(0, 0, -1);
        camera.updateMatrixWorld(true);
        camera.updateProjectionMatrix();

        const skyContainer = new THREE.Object3D();
        skyContainer.updateMatrixWorld(true);

        const position = new Float32Array([
            0, 0, -1,
            0.6, 0, -0.8,
        ]);
        const alpha = new Float32Array([1, 1]);
        const size = new Float32Array([6.2, 4.3]);
        const color = new Float32Array([
            1, 0.95, 0.74,
            1, 0.56, 0.40,
        ]);
        const planetRenderer = {
            bodySlots: ["Sun", "Mars"],
            geometry: {
                getAttribute(name) {
                    if (name === "position") return { array: position, count: 2 };
                    if (name === "aAlpha") return { array: alpha, count: 2 };
                    if (name === "aSize") return { array: size, count: 2 };
                    if (name === "aColor") return { array: color, count: 2 };
                    return null;
                },
            },
        };

        const occluders = resolveComposerSkyLabelOccluders({
            THREE,
            camera,
            width: 1000,
            height: 500,
            bodies: [
                { bodyId: "earth", centerWorld: new THREE.Vector3(0, 0, -10), radius: 1 },
            ],
            paddingPx: 0,
        });

        const markers = resolveComposerSeeThroughMarkers({
            THREE,
            camera,
            width: 1000,
            height: 500,
            skyContainer,
            planetRenderer,
            occluders,
        });

        expect(markers).toHaveLength(1);
        expect(markers[0].label).toBe("Sun");
        expect(markers[0].x).toBeCloseTo(500, 6);
        expect(markers[0].y).toBeCloseTo(250, 6);
        expect(markers[0].radiusPx).toBeGreaterThan(5);
    });

    it("excludes Earth/Moon and only returns actually occluded bodies", () => {
        const camera = new THREE.PerspectiveCamera(60, 2, 0.1, 1000);
        camera.position.set(0, 0, 0);
        camera.lookAt(0, 0, -1);
        camera.updateMatrixWorld(true);
        camera.updateProjectionMatrix();

        const skyContainer = new THREE.Object3D();
        skyContainer.updateMatrixWorld(true);

        const position = new Float32Array([
            0, 0, -1,
            0, 0, -1,
            0.75, 0, -0.66,
        ]);
        const alpha = new Float32Array([1, 1, 1]);
        const size = new Float32Array([4.9, 4.6, 4.3]);
        const planetRenderer = {
            bodySlots: ["Earth", "Moon", "Mars"],
            geometry: {
                getAttribute(name) {
                    if (name === "position") return { array: position, count: 3 };
                    if (name === "aAlpha") return { array: alpha, count: 3 };
                    if (name === "aSize") return { array: size, count: 3 };
                    return null;
                },
            },
        };

        const occluders = resolveComposerSkyLabelOccluders({
            THREE,
            camera,
            width: 1000,
            height: 500,
            bodies: [
                { bodyId: "earth", centerWorld: new THREE.Vector3(0, 0, -10), radius: 1 },
            ],
            paddingPx: 0,
        });

        const markers = resolveComposerSeeThroughMarkers({
            THREE,
            camera,
            width: 1000,
            height: 500,
            skyContainer,
            planetRenderer,
            occluders,
        });

        expect(markers).toHaveLength(0);
    });
});

describe("Frame and Shoot body ambient controls", () => {
    function createManagerForAmbientTests() {
        return Object.assign(Object.create(AuxiliaryCameraViewsManager.prototype), {
            THREE: {
                MathUtils: {
                    clamp(value, min, max) {
                        return Math.min(Math.max(value, min), max);
                    },
                },
            },
        });
    }

    function createBodyWithMaterial(material) {
        return {
            traverse(callback) {
                callback({
                    isMesh: true,
                    material,
                });
            },
        };
    }

    it("applies Earth ambient to the Earth nightside shader uniform", () => {
        const manager = createManagerForAmbientTests();
        const material = {
            map: {},
            userData: {
                earthNightsideLift: 0,
            },
        };
        const uniform = { value: 0 };
        material.userData.refreshEarthShaderUniforms = () => {
            uniform.value = material.userData.earthNightsideLift;
        };

        const restore = manager.applyComposerBodyAmbientLighting({
            panelState: {
                composerEarthAmbient: 1.25,
                composerMoonAmbient: 0,
                composerEarthshineGain: 2.4,
            },
            earth: createBodyWithMaterial(material),
        });

        expect(material.userData.earthNightsideLift).toBeCloseTo(1.25, 6);
        expect(uniform.value).toBeCloseTo(1.25, 6);

        restore();

        expect(material.userData.earthNightsideLift).toBe(0);
        expect(uniform.value).toBe(0);
    });

    it("applies Frame and Shoot Earth ambient as shared panel-render lighting", () => {
        const manager = createManagerForAmbientTests();
        manager.panels = [
            {
                mode: "composer",
                composerEarthAmbient: 1.75,
                composerMoonAmbient: 0,
                composerMoonshineGain: 0,
            },
        ];
        const material = {
            map: {},
            userData: {
                earthNightsideLift: 0,
            },
        };
        const uniform = { value: 0 };
        material.userData.refreshEarthShaderUniforms = () => {
            uniform.value = material.userData.earthNightsideLift;
        };

        const restore = manager.applySharedComposerBodyAmbientLighting({
            earth: createBodyWithMaterial(material),
        });

        expect(material.userData.earthNightsideLift).toBeCloseTo(1.75, 6);
        expect(uniform.value).toBeCloseTo(1.75, 6);

        restore();

        expect(material.userData.earthNightsideLift).toBe(0);
        expect(uniform.value).toBe(0);
    });

    it("applies Moonshine gain to the Earth night-side shader as shared panel lighting", () => {
        const manager = createManagerForAmbientTests();
        manager.panels = [
            {
                mode: "composer",
                composerEarthAmbient: 0,
                composerMoonAmbient: 0,
                composerMoonshineGain: 2,
            },
        ];
        const material = {
            map: {},
            userData: {
                earthNightsideLift: 0,
                earthMoonshineLift: 0,
            },
        };
        const uniforms = {
            ambient: 0,
            moonshine: 0,
        };
        material.userData.refreshEarthShaderUniforms = () => {
            uniforms.ambient = material.userData.earthNightsideLift;
            uniforms.moonshine = material.userData.earthMoonshineLift;
        };

        const restore = manager.applySharedComposerBodyAmbientLighting({
            earth: createBodyWithMaterial(material),
        });

        expect(material.userData.earthNightsideLift).toBe(0);
        const expectedMoonshineLift = 2 * 0.65 * LT.MOONSHINE_TO_EARTHSHINE_INTENSITY_RATIO;
        expect(material.userData.earthMoonshineLift).toBeCloseTo(expectedMoonshineLift, 6);
        expect(uniforms.ambient).toBe(0);
        expect(uniforms.moonshine).toBeCloseTo(expectedMoonshineLift, 6);

        restore();

        expect(material.userData.earthNightsideLift).toBe(0);
        expect(material.userData.earthMoonshineLift).toBe(0);
        expect(uniforms.ambient).toBe(0);
        expect(uniforms.moonshine).toBe(0);
    });

    it("keeps Moon creative fill at zero when the Moon Fill slider is zero", () => {
        const manager = createManagerForAmbientTests();
        const material = {
            map: {},
            userData: {
                moonShadowLift: 0.42,
            },
        };
        const uniform = { value: 0.42 };
        material.userData.refreshMoonShaderUniforms = () => {
            uniform.value = material.userData.moonShadowLift;
        };

        const restore = manager.applyComposerBodyAmbientLighting({
            panelState: {
                composerEarthAmbient: 0,
                composerMoonAmbient: 0,
                composerEarthshineGain: 2.4,
            },
            moon: createBodyWithMaterial(material),
        });

        expect(material.userData.moonShadowLift).toBe(0);
        expect(uniform.value).toBe(0);

        restore();

        expect(material.userData.moonShadowLift).toBeCloseTo(0.42, 6);
        expect(uniform.value).toBeCloseTo(0.42, 6);
    });
});

describe("Frame and Shoot constellation line rendering", () => {
    function createManagerForExposureTests() {
        return Object.assign(Object.create(AuxiliaryCameraViewsManager.prototype), {
            THREE: {
                MathUtils: {
                    clamp(value, min, max) {
                        return Math.min(Math.max(value, min), max);
                    },
                },
            },
        });
    }

    it("persists Frame and Shoot exposure controls with the panel state", () => {
        const storage = new Map();
        vi.stubGlobal("localStorage", {
            getItem(key) {
                return storage.get(key) || null;
            },
            setItem(key, value) {
                storage.set(key, String(value));
            },
        });
        const manager = Object.assign(Object.create(AuxiliaryCameraViewsManager.prototype), {
            panels: [
                {
                    id: "composer",
                    mode: "composer",
                    panelRegistryId: "composer",
                    missionEnabled: true,
                    camera: { fov: 42 },
                    autoFovEnabled: false,
                    composerControlsCollapsed: false,
                    composerExposureEv: 1.5,
                    composerAutoExposureEnabled: false,
                    panel: {
                        offsetLeft: 0,
                        offsetTop: 0,
                        offsetWidth: 640,
                        offsetHeight: 360,
                    },
                    restoreFrame: null,
                    maximized: false,
                    layoutPresetVersion: "",
                },
            ],
        });

        manager.persistPanelState();

        const persisted = JSON.parse(storage.get("moon-mission:aux-camera-panels:v1"));
        expect(persisted.composer).not.toHaveProperty("autoFovEnabled");
        expect(persisted.composer.composerExposureEv).toBe(1.5);
        expect(persisted.composer.composerAutoExposureEnabled).toBe(false);
    });

    it("applies manual Frame and Shoot exposure EV and restores renderer exposure", () => {
        const manager = createManagerForExposureTests();
        const panelState = {
            mode: "composer",
            renderer: { toneMappingExposure: 1.14 },
            composerSunProfile: "camera",
            composerSunStrength: 1,
            composerSunHaloGain: 1,
            composerSunStarburstGain: 1,
            composerSunFlareGain: 1,
            composerExposureEv: 1,
            composerAutoExposureEnabled: false,
            composerEarthshineGain: 2.4,
            composerStarMagnitudeLimit: 6,
            composerConstellationLinesEnabled: false,
        };

        const restore = manager.applyComposerExposureProfile({}, panelState, null);

        expect(panelState.renderer.toneMappingExposure).toBeCloseTo(0.98 * 2, 6);

        restore();

        expect(panelState.renderer.toneMappingExposure).toBeCloseTo(1.14, 6);
    });

    it("adds auto exposure only during Frame and Shoot eclipse renders", () => {
        const manager = createManagerForExposureTests();
        const panelState = {
            mode: "composer",
            renderer: { toneMappingExposure: 1 },
            composerSunProfile: "camera",
            composerSunStrength: 1,
            composerSunHaloGain: 1,
            composerSunStarburstGain: 1,
            composerSunFlareGain: 1,
            composerExposureEv: 0,
            composerAutoExposureEnabled: true,
            composerEarthshineGain: 1,
            composerStarMagnitudeLimit: 6,
            composerConstellationLinesEnabled: false,
        };

        const restoreEclipse = manager.applyComposerExposureProfile({}, panelState, null, { eclipseActive: true });

        expect(panelState.renderer.toneMappingExposure).toBeCloseTo(0.98 * 32, 6);

        restoreEclipse();

        const restoreNormal = manager.applyComposerExposureProfile({}, panelState, null, { eclipseActive: false });

        expect(panelState.renderer.toneMappingExposure).toBeCloseTo(0.98, 6);

        restoreNormal();
    });

    it("temporarily enables the Milky Way sky layer for the composer render", () => {
        const manager = createManagerForExposureTests();
        const panelState = {
            mode: "composer",
            renderer: { toneMappingExposure: 1 },
            composerSunProfile: "camera",
            composerSunStrength: 1,
            composerSunHaloGain: 1,
            composerSunStarburstGain: 1,
            composerSunFlareGain: 1,
            composerEarthshineGain: 1,
            composerStarMagnitudeLimit: 6,
            composerConstellationLinesEnabled: false,
        };
        const skyRenderer = {
            container: { visible: false },
            starRenderer: { container: { visible: false } },
            skyMesh: {
                visible: false,
                material: { opacity: 0.18 },
            },
            constellationMesh: {
                visible: false,
                material: { opacity: 0.06 },
            },
        };

        const restore = manager.applyComposerExposureProfile({}, panelState, null, { skyRenderer });

        expect(skyRenderer.container.visible).toBe(true);
        expect(skyRenderer.skyMesh.visible).toBe(true);
        expect(skyRenderer.skyMesh.material.opacity).toBeCloseTo(0.03);
        expect(skyRenderer.starRenderer.container.visible).toBe(true);
        expect(skyRenderer.constellationMesh.visible).toBe(false);

        restore();

        expect(skyRenderer.container.visible).toBe(false);
        expect(skyRenderer.skyMesh.visible).toBe(false);
        expect(skyRenderer.skyMesh.material.opacity).toBeCloseTo(0.18);
        expect(skyRenderer.starRenderer.container.visible).toBe(false);
        expect(skyRenderer.constellationMesh.visible).toBe(false);
    });

    it("temporarily enables the sky constellation layer only when the composer checkbox is on", () => {
        const manager = createManagerForExposureTests();
        const panelState = {
            mode: "composer",
            renderer: { toneMappingExposure: 1 },
            composerSunProfile: "camera",
            composerSunStrength: 1,
            composerSunHaloGain: 1,
            composerSunStarburstGain: 1,
            composerSunFlareGain: 1,
            composerEarthshineGain: 1,
            composerStarMagnitudeLimit: 6,
            composerConstellationLinesEnabled: true,
        };
        const skyRenderer = {
            container: { visible: false },
            skyMesh: {
                visible: false,
                material: { opacity: 0.18 },
            },
            constellationMesh: {
                visible: false,
                material: { opacity: 0.06 },
            },
        };

        const restore = manager.applyComposerExposureProfile({}, panelState, null, { skyRenderer });

        expect(skyRenderer.container.visible).toBe(true);
        expect(skyRenderer.skyMesh.visible).toBe(true);
        expect(skyRenderer.constellationMesh.visible).toBe(true);
        expect(skyRenderer.constellationMesh.material.opacity).toBeCloseTo(0.06);

        restore();

        expect(skyRenderer.container.visible).toBe(false);
        expect(skyRenderer.skyMesh.visible).toBe(false);
        expect(skyRenderer.constellationMesh.visible).toBe(false);
        expect(skyRenderer.constellationMesh.material.opacity).toBeCloseTo(0.06);
    });

    it("keeps regular Sun optics controls active outside eclipse", () => {
        const manager = createManagerForExposureTests();

        const profile = manager.resolveComposerSunOpticsProfile({
            mode: "composer",
            composerSunProfile: "camera",
            composerSunStrength: 1,
            composerSunHaloGain: 1,
            composerSunStarburstGain: 1,
            composerSunFlareGain: 1,
        });

        expect(profile.sunVisualState.haloOpacity).toBeGreaterThan(0.3);
        expect(profile.sunVisualState.haloScaleMul).toBeLessThan(12);
        expect(profile.sunVisualState.starburstOpacity).toBeGreaterThan(0);
        expect(profile.sunVisualState.flareOpacity).toBeGreaterThan(0);
        expect(profile.sunVisualState.coronaOpacity).toBe(0);
        expect(profile.sunVisualState.coronaFlowOpacity).toBe(0);
    });

    it("uses the composer magnitude limit for planet markers too", () => {
        expect(isComposerPlanetVisibleForMagnitudeLimit("Venus", -3)).toBe(true);
        expect(isComposerPlanetVisibleForMagnitudeLimit("Mars", -3)).toBe(false);
        expect(isComposerPlanetVisibleForMagnitudeLimit("Uranus", 6)).toBe(true);
        expect(isComposerPlanetVisibleForMagnitudeLimit("Neptune", 6)).toBe(false);
    });

    it("temporarily filters composer planet markers by magnitude during render presentation", () => {
        const manager = createManagerForExposureTests();
        const alphas = new Float32Array([1, 0.8, 0.6, 0.4]);
        const alphaAttr = { array: alphas, needsUpdate: false };
        const panelState = {
            mode: "composer",
            renderer: { toneMappingExposure: 1 },
            composerSunProfile: "camera",
            composerSunStrength: 1,
            composerSunHaloGain: 1,
            composerSunStarburstGain: 1,
            composerSunFlareGain: 1,
            composerEarthshineGain: 1,
            composerStarMagnitudeLimit: -3,
        };
        const skyRenderer = {
            planetRenderer: {
                bodySlots: ["Venus", "Mars", "Sun", "Neptune"],
                geometry: {
                    getAttribute: (name) => (name === "aAlpha" ? alphaAttr : null),
                },
            },
        };

        const restore = manager.applyComposerExposureProfile({}, panelState, null, { skyRenderer });

        expect(alphas[0]).toBeCloseTo(1);
        expect(alphas[1]).toBeCloseTo(0);
        expect(alphas[2]).toBeCloseTo(0.6);
        expect(alphas[3]).toBeCloseTo(0);
        expect(alphaAttr.needsUpdate).toBe(true);

        restore();

        expect(alphas[0]).toBeCloseTo(1);
        expect(alphas[1]).toBeCloseTo(0.8);
        expect(alphas[2]).toBeCloseTo(0.6);
        expect(alphas[3]).toBeCloseTo(0.4);
    });

    it("ignores regular Sun optics controls during eclipse and uses corona controls instead", () => {
        const manager = createManagerForExposureTests();

        const lowRegularOptics = manager.resolveComposerSunOpticsProfile({
            mode: "composer",
            composerSunProfile: "camera",
            composerSunStrength: 0,
            composerSunHaloGain: 0,
            composerSunStarburstGain: 0,
            composerSunFlareGain: 0,
            composerEclipseCoronaIntensity: 1.3,
            composerEclipseCoronaMotion: 0.8,
            composerEclipseCoronaStructure: 1.4,
        }, { eclipseActive: true });
        const highRegularOptics = manager.resolveComposerSunOpticsProfile({
            mode: "composer",
            composerSunProfile: "camera",
            composerSunStrength: 2.4,
            composerSunHaloGain: 2.5,
            composerSunStarburstGain: 2.5,
            composerSunFlareGain: 2.5,
            composerEclipseCoronaIntensity: 1.3,
            composerEclipseCoronaMotion: 0.8,
            composerEclipseCoronaStructure: 1.4,
        }, { eclipseActive: true });

        expect(lowRegularOptics.sunVisualState).toMatchObject(highRegularOptics.sunVisualState);
        expect(lowRegularOptics.sunVisualState.haloOpacity).toBe(0);
        expect(lowRegularOptics.sunVisualState.starburstOpacity).toBe(0);
        expect(lowRegularOptics.sunVisualState.flareOpacity).toBe(0);
        expect(lowRegularOptics.sunVisualState.coronaOpacity).toBeGreaterThan(0.9);
        expect(lowRegularOptics.sunVisualState.coronaFlowOpacity).toBeGreaterThan(0.25);
        expect(lowRegularOptics.sunVisualState.coronaMotionMul).toBeCloseTo(0.8);
    });

    it("scales eclipse corona intensity and motion from separate controls", () => {
        const manager = createManagerForExposureTests();

        const dim = manager.resolveComposerSunOpticsProfile({
            mode: "composer",
            composerSunProfile: "camera",
            composerEclipseCoronaIntensity: 0.5,
            composerEclipseCoronaMotion: 0.25,
            composerEclipseCoronaStructure: 0.5,
        }, { eclipseActive: true });
        const bright = manager.resolveComposerSunOpticsProfile({
            mode: "composer",
            composerSunProfile: "camera",
            composerEclipseCoronaIntensity: 1.5,
            composerEclipseCoronaMotion: 1.75,
            composerEclipseCoronaStructure: 1.5,
        }, { eclipseActive: true });

        expect(bright.sunVisualState.coronaOpacity).toBeGreaterThan(dim.sunVisualState.coronaOpacity);
        expect(bright.sunVisualState.coronaFlowOpacity).toBeGreaterThan(dim.sunVisualState.coronaFlowOpacity);
        expect(bright.sunVisualState.coronaMotionMul).toBeCloseTo(1.75);
        expect(dim.sunVisualState.coronaMotionMul).toBeCloseTo(0.25);
    });

    it("detects craft-view solar eclipse geometry only at full Sun occultation", () => {
        const manager = Object.assign(createManagerForExposureTests(), {
            sunDirectionCraftWorld: {
                x: 1,
                y: 0,
                z: 0,
                length: () => 1,
            },
        });

        const fullyEclipsed = manager.resolveComposerSolarEclipseState({
            craftWorld: { x: 0, y: 0, z: 0 },
            moonWorld: { x: 100, y: 0, z: 0 },
            moonRadius: 4,
            earthWorld: { x: 0, y: 100, z: 0 },
            earthRadius: 10,
        });
        const partial = manager.resolveComposerSolarEclipseState({
            craftWorld: { x: 0, y: 0, z: 0 },
            moonWorld: { x: 10000, y: 5, z: 0 },
            moonRadius: 4,
            earthWorld: { x: 0, y: 100, z: 0 },
            earthRadius: 10,
        });
        const clear = manager.resolveComposerSolarEclipseState({
            craftWorld: { x: 0, y: 0, z: 0 },
            moonWorld: { x: 100, y: 30, z: 0 },
            moonRadius: 4,
            earthWorld: { x: 0, y: 100, z: 0 },
            earthRadius: 10,
        });

        expect(fullyEclipsed.active).toBe(true);
        expect(fullyEclipsed.occluder).toBe("moon");
        expect(fullyEclipsed.fullyObscured).toBe(true);
        expect(partial.coverage).toBeGreaterThan(0);
        expect(partial.active).toBe(false);
        expect(clear.active).toBe(false);
    });

    it("updates animated corona appearance when applying eclipse Sun state", () => {
        const manager = createManagerForExposureTests();
        const panelState = {
            mode: "composer",
            renderer: { toneMappingExposure: 1 },
            composerSunProfile: "camera",
            composerSunStrength: 1,
            composerSunHaloGain: 1,
            composerSunStarburstGain: 1,
            composerSunFlareGain: 1,
            composerEclipseCoronaIntensity: 1,
            composerEclipseCoronaMotion: 1,
            composerEclipseCoronaStructure: 1,
            composerSolarEclipseActive: true,
            composerEarthshineGain: 1,
            composerStarMagnitudeLimit: 6,
            composerConstellationLinesEnabled: false,
        };
        const sunRenderer = {
            getVisualState: vi.fn(() => ({ haloOpacity: 0.36, coronaOpacity: 0, starburstOpacity: 0, flareOpacity: 0 })),
            setVisualState: vi.fn(),
            updateAppearance: vi.fn(),
        };

        const restore = manager.applyComposerExposureProfile({}, panelState, sunRenderer, { eclipseActive: true });
        const appliedState = sunRenderer.setVisualState.mock.calls[0][0];

        expect(appliedState.haloOpacity).toBe(0);
        expect(appliedState.starburstOpacity).toBe(0);
        expect(appliedState.flareOpacity).toBe(0);
        expect(appliedState.coronaFlowOpacity).toBeGreaterThan(0.15);
        expect(sunRenderer.updateAppearance).toHaveBeenCalledTimes(1);

        restore();
    });

    it("applies regular Sun optics when applying non-eclipse Sun state", () => {
        const manager = createManagerForExposureTests();
        const panelState = {
            mode: "composer",
            renderer: { toneMappingExposure: 1 },
            composerSunProfile: "camera",
            composerSunStrength: 1,
            composerSunHaloGain: 1,
            composerSunStarburstGain: 1,
            composerSunFlareGain: 1,
            composerEclipseCoronaIntensity: 1,
            composerEclipseCoronaMotion: 1,
            composerEclipseCoronaStructure: 1,
            composerSolarEclipseActive: false,
            composerEarthshineGain: 1,
            composerStarMagnitudeLimit: 6,
            composerConstellationLinesEnabled: false,
        };
        const sunRenderer = {
            getVisualState: vi.fn(() => ({ haloOpacity: 0.36, coronaOpacity: 0, starburstOpacity: 0, flareOpacity: 0 })),
            setVisualState: vi.fn(),
            updateAppearance: vi.fn(),
        };

        const restore = manager.applyComposerExposureProfile({}, panelState, sunRenderer, { eclipseActive: false });
        const appliedState = sunRenderer.setVisualState.mock.calls[0][0];

        expect(appliedState.starburstOpacity).toBeGreaterThan(0);
        expect(appliedState.flareOpacity).toBeGreaterThan(0);
        expect(appliedState.coronaFlowOpacity).toBe(0);
        expect(sunRenderer.updateAppearance).toHaveBeenCalledTimes(1);

        restore();
    });

    it("schedules one follow-up render frame for animated composer corona", () => {
        let queuedCallback = null;
        const requestRender = vi.fn();
        const requestAnimationFrameMock = vi.fn((callback) => {
            queuedCallback = callback;
            return 42;
        });
        vi.stubGlobal("requestAnimationFrame", requestAnimationFrameMock);
        const manager = Object.assign(Object.create(AuxiliaryCameraViewsManager.prototype), {
            requestRender,
            composerCoronaAnimationRaf: null,
        });

        manager.requestComposerCoronaAnimationFrame();
        manager.requestComposerCoronaAnimationFrame();

        expect(requestAnimationFrameMock).toHaveBeenCalledTimes(1);
        expect(manager.composerCoronaAnimationRaf).toBe(42);

        queuedCallback();

        expect(manager.composerCoronaAnimationRaf).toBeNull();
        expect(requestRender).toHaveBeenCalledTimes(1);
    });
});

describe("Frame and Shoot reflected-light gain controls", () => {
    function createManagerForLightTests() {
        return Object.assign(Object.create(AuxiliaryCameraViewsManager.prototype), {
            THREE: {
                MathUtils: {
                    clamp(value, min, max) {
                        return Math.min(Math.max(value, min), max);
                    },
                },
            },
        });
    }

    it("scales Earthshine reflected light during composer renders and restores it", () => {
        const manager = createManagerForLightTests();
        const scene = {
            lightFill: {
                intensity: 0.02,
            },
        };

        const restore = manager.applyComposerEarthshineGain({
            composerEarthshineGain: 2.4,
        }, scene);

        expect(scene.lightFill.intensity).toBeCloseTo(0.048, 8);

        restore();

        expect(scene.lightFill.intensity).toBeCloseTo(0.02, 8);
    });

    it("keeps Earthshine dark when the physical phase light is dark", () => {
        const manager = createManagerForLightTests();
        const scene = {
            lightFill: {
                intensity: 0,
            },
        };

        const restore = manager.applyComposerEarthshineGain({
            composerEarthshineGain: 2.4,
        }, scene);

        expect(scene.lightFill.intensity).toBe(0);

        restore();

        expect(scene.lightFill.intensity).toBe(0);
    });

    it("scales Moonshine reflected light during composer renders and restores it", () => {
        const manager = createManagerForLightTests();
        const scene = {
            lightMoonshine: {
                intensity: 0.0005,
            },
        };

        const restore = manager.applyComposerMoonshineGain({
            composerMoonshineGain: 2.4,
        }, scene);

        expect(scene.lightMoonshine.intensity).toBeCloseTo(0.0012, 8);

        restore();

        expect(scene.lightMoonshine.intensity).toBeCloseTo(0.0005, 8);
    });

    it("keeps Moonshine dark when the physical phase light is dark", () => {
        const manager = createManagerForLightTests();
        const scene = {
            lightMoonshine: {
                intensity: 0,
            },
        };

        const restore = manager.applyComposerMoonshineGain({
            composerMoonshineGain: 2.4,
        }, scene);

        expect(scene.lightMoonshine.intensity).toBe(0);

        restore();

        expect(scene.lightMoonshine.intensity).toBe(0);
    });
});

describe("Frame and Shoot timeline phase tracking", () => {
    const phases = [
        {
            id: "launch",
            label: "Launch & Earth Orbit",
            startMs: 0,
            endMs: 100,
            events: [{ key: "launch" }, { key: "solarArrays" }],
        },
        {
            id: "lunar",
            label: "Lunar Flyby",
            startMs: 100,
            endMs: 200,
            events: [{ key: "lunarSoiEntry" }, { key: "closestApproach" }],
        },
    ];

    function createTimelineHarness() {
        const manager = Object.assign(Object.create(AuxiliaryCameraViewsManager.prototype), {
            THREE: {
                MathUtils: {
                    clamp(value, min, max) {
                        return Math.min(Math.max(value, min), max);
                    },
                },
            },
            composerTimelinePhases: phases,
            composerSelectedPhaseIndex: -1,
            composerActivePhaseIndex: -1,
            composerFlybyEvents: [],
            readMainTimelineState: vi.fn(),
            syncComposerTransportUi: vi.fn(),
            syncComposerPhaseSelect: vi.fn(),
            setComposerInteractionEnabled: vi.fn(),
            setComposerTimelineLocalText: vi.fn(),
            syncComposerFlybyEventPills: vi.fn(),
        });
        const panelState = {
            composerTimelineSlider: { value: "" },
            composerTimelineLabel: { textContent: "" },
            composerTimelineDragging: false,
        };
        return { manager, panelState };
    }

    it("does not permanently pin the first rendered phase before the composer seek lands", () => {
        const { manager, panelState } = createTimelineHarness();
        manager.readMainTimelineState.mockReturnValue({
            min: 0,
            max: 200,
            value: 50,
            stepMs: 1,
        });

        manager.syncComposerTimelineUi(panelState);

        expect(manager.composerActivePhaseIndex).toBe(0);
        expect(manager.composerSelectedPhaseIndex).toBe(-1);

        manager.readMainTimelineState.mockReturnValue({
            min: 0,
            max: 200,
            value: 150,
            stepMs: 1,
        });
        manager.syncComposerTimelineUi(panelState);

        expect(manager.composerActivePhaseIndex).toBe(1);
        expect(manager.composerSelectedPhaseIndex).toBe(-1);
        expect(manager.composerFlybyEvents.map((eventInfo) => eventInfo.key)).toEqual([
            "lunarSoiEntry",
            "closestApproach",
        ]);
    });

    it("clears an explicit phase selection after the timeline moves outside it", () => {
        const { manager, panelState } = createTimelineHarness();
        manager.composerSelectedPhaseIndex = 0;
        manager.readMainTimelineState.mockReturnValue({
            min: 0,
            max: 200,
            value: 150,
            stepMs: 1,
        });

        manager.syncComposerTimelineUi(panelState);

        expect(manager.composerSelectedPhaseIndex).toBe(-1);
        expect(manager.composerActivePhaseIndex).toBe(1);
    });

    it("seeks to the middle of a selected phase instead of the boundary", () => {
        const { manager } = createTimelineHarness();

        expect(manager.resolveComposerPhaseSeekTimeMs({
            phase: phases[1],
            timelineMinMs: 0,
            timelineMaxMs: 200,
            stepMs: 10,
        })).toBe(150);
    });

    it("keeps selected phase seeks inside very short phase ranges", () => {
        const { manager } = createTimelineHarness();

        expect(manager.resolveComposerPhaseSeekTimeMs({
            phase: { startMs: 100, endMs: 101 },
            timelineMinMs: 0,
            timelineMaxMs: 200,
            stepMs: 10,
        })).toBe(100);
    });

    it("nudges Frame and Shoot transport by absolute mission time instead of phase bounds", () => {
        const { manager, panelState } = createTimelineHarness();
        panelState.composerTimelineStartMs = 100;
        panelState.composerTimelineEndMs = 200;

        expect(manager.resolveComposerTransportStepTimeMs({
            min: 0,
            max: 1000,
            value: 150,
        }, -60)).toBe(90);
        expect(manager.resolveComposerTransportStepTimeMs({
            min: 0,
            max: 1000,
            value: 150,
        }, 60)).toBe(210);
    });

    it("reads Frame and Shoot transport time from the full timeline range when the playhead is outside the zoomed view", () => {
        class FakeInput {}
        const slider = new FakeInput();
        Object.assign(slider, {
            min: "400000",
            max: "500000",
            value: "400000",
            step: "1000",
            dataset: {
                currentTimeMs: "900000",
                rangeMinMs: "0",
                rangeMaxMs: "1000000",
            },
            ownerDocument: {
                defaultView: {
                    HTMLInputElement: FakeInput,
                },
            },
        });
        vi.stubGlobal("document", {
            getElementById: vi.fn((id) => (id === "timeline-slider" ? slider : null)),
        });
        const manager = Object.assign(Object.create(AuxiliaryCameraViewsManager.prototype), {
            THREE: {
                MathUtils: {
                    clamp(value, min, max) {
                        return Math.min(Math.max(value, min), max);
                    },
                },
            },
        });

        const timelineState = manager.readMainTimelineState();

        expect(timelineState).toMatchObject({
            min: 0,
            max: 1000000,
            value: 900000,
            stepMs: 1000,
        });
        expect(manager.resolveComposerTransportStepTimeMs(timelineState, -60000)).toBe(840000);
    });

    it("programmatic Frame and Shoot seeks keep the real target time even outside the visible timeline window", () => {
        class FakeInput {
            dispatchEvent(event) {
                this.events.push(event.type);
            }
        }
        class FakeEvent {
            constructor(type, options = {}) {
                this.type = type;
                this.bubbles = options.bubbles === true;
            }
        }
        const slider = new FakeInput();
        Object.assign(slider, {
            min: "400000",
            max: "500000",
            value: "400000",
            step: "1000",
            dataset: {
                currentTimeMs: "900000",
                rangeMinMs: "0",
                rangeMaxMs: "1000000",
            },
            events: [],
            ownerDocument: {
                defaultView: {
                    HTMLInputElement: FakeInput,
                },
            },
        });
        vi.stubGlobal("Event", FakeEvent);
        vi.stubGlobal("document", {
            getElementById: vi.fn((id) => (id === "timeline-slider" ? slider : null)),
        });
        const manager = Object.assign(Object.create(AuxiliaryCameraViewsManager.prototype), {
            THREE: {
                MathUtils: {
                    clamp(value, min, max) {
                        return Math.min(Math.max(value, min), max);
                    },
                },
            },
        });

        manager.seekMainTimelineTime(840000, true);

        expect(slider.value).toBe("500000");
        expect(slider.dataset.currentTimeMs).toBe("840000");
        expect(slider.dataset.programmaticSeekSource).toBe("frame-shoot");
        expect(slider.dataset.programmaticSeekTimeMs).toBe("840000");
        expect(slider.events).toEqual(["input", "change"]);
    });

    it("restores the guided composer view without seeking the main timeline by default", () => {
        const manager = Object.assign(Object.create(AuxiliaryCameraViewsManager.prototype), {
            restorePanel: vi.fn(),
            applyComposerGuidedViewState: vi.fn(() => true),
            seekMainTimelineTime: vi.fn(),
            requestRender: vi.fn(),
            queuePersistPanelState: vi.fn(),
        });
        const panelState = {
            mode: "composer",
            syncComposerLockUi: vi.fn(),
            syncComposerAutoToggleUi: vi.fn(),
        };

        expect(manager.restoreComposerGuidedPanel(panelState)).toBe(true);

        expect(manager.restorePanel).toHaveBeenCalledWith(panelState);
        expect(manager.applyComposerGuidedViewState).toHaveBeenCalledWith(panelState, expect.objectContaining({
            persist: false,
        }));
        expect(manager.seekMainTimelineTime).not.toHaveBeenCalled();
        expect(manager.requestRender).toHaveBeenCalledTimes(1);
        expect(manager.queuePersistPanelState).toHaveBeenCalledTimes(1);
    });

    it("keeps explicit guided composer seeks available for deliberate jumps", () => {
        const manager = Object.assign(Object.create(AuxiliaryCameraViewsManager.prototype), {
            restorePanel: vi.fn(),
            applyComposerGuidedViewState: vi.fn(() => true),
            seekMainTimelineTime: vi.fn(),
            requestRender: vi.fn(),
            queuePersistPanelState: vi.fn(),
        });
        const panelState = {
            mode: "composer",
            syncComposerLockUi: vi.fn(),
            syncComposerAutoToggleUi: vi.fn(),
        };

        manager.restoreComposerGuidedPanel(panelState, { seekTimeMs: 150 });

        expect(manager.seekMainTimelineTime).toHaveBeenCalledWith(150, true);
    });

    it("returns phase selection to the guided Moon Auto FoV view", () => {
        const { manager, panelState } = createTimelineHarness();
        Object.assign(manager, {
            seekMainTimelineTime: vi.fn(),
            requestRender: vi.fn(),
        });
        manager.readMainTimelineState.mockReturnValue({
            min: 0,
            max: 200,
            value: 25,
            stepMs: 1,
        });
        Object.assign(panelState, {
            mode: "composer",
            composerLockTarget: "earth",
            composerOrientationReference: "moon-north",
            composerMediaDriven: true,
            composerSurfaceTarget: { bodyId: "moon" },
            autoFovEnabled: false,
            syncComposerLockUi: vi.fn(),
            syncComposerAutoToggleUi: vi.fn(),
        });

        manager.selectComposerTimelinePhase(panelState, 1);

        expect(panelState.composerLockTarget).toBe("moon");
        expect(panelState.composerOrientationReference).toBe("world");
        expect(panelState.autoFovEnabled).toBe(true);
        expect(panelState.composerMediaDriven).toBe(false);
        expect(panelState.composerSurfaceTarget).toBe(null);
        expect(panelState.syncComposerLockUi).toHaveBeenCalledTimes(1);
        expect(panelState.syncComposerAutoToggleUi).toHaveBeenCalledTimes(1);
    });
});

describe("Frame and Shoot event pill highlighting", () => {
    class FakeElement {
        constructor(tagName = "div") {
            this.tagName = tagName;
            this.children = [];
            this.className = "";
            this.textContent = "";
            this.attributes = {};
            this.listeners = new Map();
            this.classList = {
                add: (...names) => {
                    const values = new Set(this.className.split(/\s+/).filter(Boolean));
                    for (const name of names) values.add(name);
                    this.className = Array.from(values).join(" ");
                },
                remove: (...names) => {
                    const values = new Set(this.className.split(/\s+/).filter(Boolean));
                    for (const name of names) values.delete(name);
                    this.className = Array.from(values).join(" ");
                },
                contains: (name) => this.className.split(/\s+/).filter(Boolean).includes(name),
                toggle: (name, enabled) => {
                    if (enabled) {
                        this.classList.add(name);
                        return true;
                    }
                    this.classList.remove(name);
                    return false;
                },
            };
        }

        appendChild(child) {
            this.children.push(child);
            return child;
        }

        replaceChildren(...children) {
            this.children = children;
        }

        setAttribute(name, value) {
            this.attributes[name] = String(value);
        }

        removeAttribute(name) {
            delete this.attributes[name];
        }

        addEventListener(type, handler) {
            const handlers = this.listeners.get(type) || [];
            handlers.push(handler);
            this.listeners.set(type, handlers);
        }
    }

    function createHarness() {
        vi.stubGlobal("document", {
            createElement(tagName) {
                return new FakeElement(tagName);
            },
        });

        const manager = Object.assign(Object.create(AuxiliaryCameraViewsManager.prototype), {
            composerActivePhaseIndex: -1,
            composerSelectedPhaseIndex: -1,
            composerFlybyEvents: [
                { key: "e1", title: "Event 1", timeMs: 1000 },
                { key: "e2", title: "Event 2", timeMs: 2000 },
            ],
            formatLocalDateTime: (timeMs) => String(timeMs),
            seekMainTimelineTime: vi.fn(),
            syncComposerTimelineUi: vi.fn(),
            requestRender: vi.fn(),
        });
        const composerFlybyEventsDetails = new FakeElement("details");
        composerFlybyEventsDetails.open = false;
        const panelState = {
            mode: "composer",
            composerLockTarget: "earth",
            composerOrientationReference: "moon-north",
            composerMediaDriven: true,
            composerSurfaceTarget: { bodyId: "moon" },
            autoFovEnabled: false,
            composerFlybyEventsDetails,
            composerFlybyEventsSummary: new FakeElement("summary"),
            composerFlybyEventsWrap: new FakeElement(),
            composerFlybyEventsSignature: "",
            composerFlybyEventNodes: [],
            composerFlybySelectedEventTimeMs: Number.NaN,
            syncComposerLockUi: vi.fn(),
            syncComposerAutoToggleUi: vi.fn(),
        };
        return { manager, panelState };
    }

    it("shows dashed boundaries for the two surrounding events between event times", () => {
        const { manager, panelState } = createHarness();

        manager.syncComposerFlybyEventPills(panelState, 1500);

        expect(panelState.composerFlybyEventNodes[0].element.classList.contains("is-boundary")).toBe(true);
        expect(panelState.composerFlybyEventNodes[1].element.classList.contains("is-boundary")).toBe(true);
        expect(panelState.composerFlybyEventNodes[0].element.classList.contains("is-active")).toBe(false);
        expect(panelState.composerFlybyEventNodes[1].element.classList.contains("is-active")).toBe(false);
        expect(panelState.composerFlybyEventsSummary.textContent).toBe("Events");
    });

    it("uses the solid active pill only on an exact event time", () => {
        const { manager, panelState } = createHarness();

        manager.syncComposerFlybyEventPills(panelState, 1000);

        expect(panelState.composerFlybyEventNodes[0].element.classList.contains("is-active")).toBe(true);
        expect(panelState.composerFlybyEventNodes[0].element.classList.contains("is-boundary")).toBe(false);
        expect(panelState.composerFlybyEventNodes[1].element.classList.contains("is-active")).toBe(false);
        expect(panelState.composerFlybyEventNodes[1].element.classList.contains("is-boundary")).toBe(false);
        expect(panelState.composerFlybyEventsSummary.textContent).toBe("Events");
    });

    it("returns event selection to the guided Moon Auto FoV view and closes the popup", () => {
        const { manager, panelState } = createHarness();
        panelState.composerFlybyEventsDetails.open = true;
        manager.syncComposerFlybyEventPills(panelState, 1500);

        const clickHandlers = panelState.composerFlybyEventNodes[0].element.listeners.get("click") || [];
        clickHandlers[0]?.();

        expect(panelState.composerLockTarget).toBe("moon");
        expect(panelState.composerOrientationReference).toBe("world");
        expect(panelState.autoFovEnabled).toBe(true);
        expect(panelState.composerMediaDriven).toBe(false);
        expect(panelState.composerSurfaceTarget).toBe(null);
        expect(panelState.syncComposerLockUi).toHaveBeenCalledTimes(1);
        expect(panelState.syncComposerAutoToggleUi).toHaveBeenCalledTimes(1);
        expect(panelState.composerFlybyEventsDetails.open).toBe(false);
        expect(panelState.composerFlybyEventsSummary.textContent).toBe("Event 1");
    });

    it("clears the selected event label after the animation time moves away", () => {
        const { manager, panelState } = createHarness();
        manager.syncComposerFlybyEventPills(panelState, 1500);

        const jumped = manager.selectComposerFlybyEvent(panelState, 1);

        expect(jumped).toBe(true);
        expect(manager.seekMainTimelineTime).toHaveBeenCalledWith(2000, true);
        expect(panelState.composerFlybySelectedEventTimeMs).toBe(2000);
        expect(panelState.composerFlybyEventsSummary.textContent).toBe("Event 2");

        manager.syncComposerFlybyEventPills(panelState, 1500);

        expect(Number.isNaN(panelState.composerFlybySelectedEventTimeMs)).toBe(true);
        expect(panelState.composerFlybyEventsSummary.textContent).toBe("Events");
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
