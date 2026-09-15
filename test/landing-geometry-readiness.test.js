import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { createLandingLoadActions } from "../src/platform/js/app/landing-load-actions.js";
import { createOrbitCurveActions } from "../src/platform/js/app/orbit-curve-actions.js";
import { createSpacecraftCurveActions } from "../src/platform/js/app/spacecraft-curve-actions.js";
import { refreshLandingGeometry } from "../src/platform/js/app/landing-geometry-readiness.js";

function createHarness() {
    let resolveLoad;
    const pendingData = new Promise((resolve) => { resolveLoad = resolve; });
    const state = { data: null, ready: false, visible: true, url: "landing.json" };
    const config = { landing: { enabled: true }, crafts: [{ id: "SC", primary: true }] };
    const render = vi.fn();
    const spacecraftCurves = createSpacecraftCurveActions({
        THREE,
        getGlobalConfig: () => config,
        getLandingChebyshevData: () => state.data,
        planetProperties: { SC: { orbitcolor: "white" } },
        getViewOrbitDescent: () => state.visible,
        getViewOrbit: () => true,
        render,
        wait10: async () => {},
        createLineMaterial: (color) => new THREE.LineBasicMaterial({ color }),
    });
    const vectors = createOrbitCurveActions({
        THREE,
        getLandingEnabled: () => true,
        getEphemerisSource: () => "chebyshev",
        getLandingChebyshevLoaded: () => state.ready,
        getLandingChebyshevData: () => state.data,
        getStartLandingTime: () => 0,
        getEndLandingTime: () => 1000,
        generateCurveFromChebyshev: (data) => data?.points || [
            { x: 1, y: 2, z: 3, vx: 0, vy: 0, vz: 0 },
            { x: 4, y: 5, z: 6, vx: 0, vy: 0, vz: 0 },
        ],
        PC: { KM_PER_AU: 1 },
        getPixelsPerAU: () => 1,
    });
    const scene = {
        name: "lunar",
        initialized3D: false,
        deferred3DInitRunId: 0,
        motherContainer: new THREE.Group(),
        landingCurve: [],
        landingCurveVelocities: [],
        curvesById: {},
        primaryCraftId: "SC",
        constructor: { SCENE_STATE_ADD_CURVE_DONE: 5 },
        processLandingVectors: vi.fn(() => vectors.addLandingCurveVectors({
            config: "lunar",
            landingCurve: scene.landingCurve,
            landingCurveVelocities: scene.landingCurveVelocities,
        })),
        addLandingCurve: vi.fn(() => spacecraftCurves.addLandingCurve(scene)),
        disposeLandingCurve: vi.fn(() => spacecraftCurves.disposeLandingCurve(scene)),
    };
    const loadChebyshev = vi.fn(() => pendingData);
    const loader = createLandingLoadActions({
        getGlobalConfig: () => config,
        getConfigsList: () => ["lunar"],
        getConfig: () => "lunar",
        getScene: () => scene,
        setLandingDataLoaded: vi.fn(),
        setLandingNpzLoaded: vi.fn(),
        setLandingNpzData: vi.fn(),
        setLandingChebyshevLoaded: (_config, ready) => { state.ready = ready; },
        setLandingChebyshevData: (_config, data) => { state.data = data; },
        resolveLandingChebyshevUrl: () => state.url,
        loadChebyshev,
        onLandingDataReady: ({ scene: target, data }) => refreshLandingGeometry(target, data),
    });
    function initializeScene() {
        scene.initialized3D = true;
        scene.deferred3DInitRunId += 1;
        scene.processLandingVectors();
        spacecraftCurves.addSpacecraftCurve(scene);
    }
    return { state, scene, loader, loadChebyshev, resolveLoad, initializeScene, spacecraftCurves, render };
}

describe("landing-only geometry readiness", () => {
    it.each(["data-first", "scene-first"])("creates the same single descent line for %s loading", async (order) => {
        const h = createHarness();
        const pending = h.loader.loadLandingDataAndProcess();
        if (order === "scene-first") {
            h.initializeScene();
            expect(h.scene.landingOrbitLine).toBeUndefined();
        }
        h.resolveLoad({ segments: [{}] });
        await pending;
        if (order === "data-first") h.initializeScene();
        const line = h.scene.landingOrbitLine;
        expect(line).toBeInstanceOf(THREE.Line);
        expect([...line.geometry.getAttribute("position").array]).toEqual([1, 2, 3, 4, 5, 6]);
        expect(line.visible).toBe(true);
        const mainOrbitLines = h.scene.orbitLines;
        const mainCurves = h.scene.curvesById;
        const stateBeforeWarmCall = h.scene.state;
        await h.loader.loadLandingDataAndProcess();
        expect(h.scene.landingOrbitLine).toBe(line);
        expect(h.scene.motherContainer.children).toEqual([line]);
        expect(h.scene.orbitLines).toBe(mainOrbitLines);
        expect(h.scene.curvesById).toBe(mainCurves);
        expect(h.scene.state).toBe(stateBeforeWarmCall);
        expect(h.loadChebyshev).toHaveBeenCalledTimes(1);
        h.spacecraftCurves.disposeSpacecraftCurve(h.scene);
    });

    it("uses the current descent visibility setting for a late install", async () => {
        const h = createHarness();
        h.initializeScene();
        const pending = h.loader.loadLandingDataAndProcess();
        h.state.visible = false;
        h.resolveLoad({ segments: [{}] });
        await pending;
        expect(h.scene.landingOrbitLine.visible).toBe(false);
        expect(h.render).toHaveBeenCalledTimes(1);
        h.spacecraftCurves.disposeSpacecraftCurve(h.scene);
    });

    it("does not build geometry or clear vectors for an uninitialized or disposed scene", () => {
        const h = createHarness();
        const originalCurve = h.scene.landingCurve;
        expect(refreshLandingGeometry(h.scene)).toBe(false);
        h.scene.initialized3D = true;
        h.scene.stopCreationFlag = true;
        expect(refreshLandingGeometry(h.scene)).toBe(false);
        expect(h.scene.processLandingVectors).not.toHaveBeenCalled();
        expect(h.scene.landingCurve).toBe(originalCurve);
        expect(h.scene.motherContainer.children).toEqual([]);
    });

    it("replaces only the landing line when a new source is installed in the same scene", async () => {
        const h = createHarness();
        h.initializeScene();
        const first = h.loader.loadLandingDataAndProcess();
        h.resolveLoad({ segments: [{}] });
        await first;
        const oldLine = h.scene.landingOrbitLine;
        const disposeGeometry = vi.spyOn(oldLine.geometry, "dispose");
        const disposeMaterial = vi.spyOn(oldLine.material, "dispose");
        const mainLines = h.scene.orbitLines;
        const mainCurves = h.scene.curvesById;
        h.state.url = "updated-landing.json";
        const updatedData = {
            segments: [{}],
            points: [
                { x: 7, y: 8, z: 9, vx: 0, vy: 0, vz: 0 },
                { x: 10, y: 11, z: 12, vx: 0, vy: 0, vz: 0 },
            ],
        };
        h.loadChebyshev.mockResolvedValue(updatedData);
        await h.loader.loadLandingDataAndProcess();
        expect(h.scene.landingOrbitLine).not.toBe(oldLine);
        expect([...h.scene.landingOrbitLine.geometry.getAttribute("position").array]).toEqual([7, 8, 9, 10, 11, 12]);
        expect(h.scene.motherContainer.children).toEqual([h.scene.landingOrbitLine]);
        expect(h.scene.orbitLines).toBe(mainLines);
        expect(h.scene.curvesById).toBe(mainCurves);
        expect(disposeGeometry).toHaveBeenCalledTimes(1);
        expect(disposeMaterial).toHaveBeenCalledTimes(1);
        const newLine = h.scene.landingOrbitLine;
        await h.loader.loadLandingDataAndProcess();
        expect(h.scene.landingOrbitLine).toBe(newLine);
        expect(h.render).toHaveBeenCalledTimes(2);
        h.spacecraftCurves.disposeSpacecraftCurve(h.scene);
    });
});
