import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

import { installFakeDom } from "./helpers/fake-dom.js";
import { createAnimationSceneClass } from "../src/platform/js/app/animation-scene-class.js";
import { DEFAULT_VIEW_STATE } from "../src/platform/js/app/plane-view-state.js";
import { PHYSICS_CONSTANTS as PC } from "../src/platform/js/core/constants.js";

let dom = null;

/**
 * A single Chebyshev segment covering the whole of 1970 onward, producing a
 * constant quarter-turn frame rotation whatever time is sampled.
 */
const FRAME_ROT_SEGMENT = Object.freeze({
    t_start: 2400000.5,
    t_end: 2500000.5,
    cw: [Math.SQRT1_2],
    cx: [0.0],
    cy: [0.0],
    cz: [Math.SQRT1_2],
});

function spyBundle(names) {
    return Object.fromEntries(names.map((name) => [name, vi.fn()]));
}

function makeDeps(overrides = {}) {
    const runtimeState = {
        earthRadius: 6.4,
        moonRadius: 1.7,
        globalConfig: { is_lunar: true },
        viewSky: true,
        viewConstellationLines: false,
        viewMoonSOI: true,
        viewMoonHillSphere: false,
        viewMoonOsculatingOrbit: true,
        viewBodyHalos: true,
        viewPolarAxes: false,
        viewPoles: false,
        viewEarthPolarAxes: undefined,
        viewEarthPoles: undefined,
        viewEarthLatLonGrid: true,
        viewEarthLatLonLabels: false,
        viewEarthLatLonHover: false,
        viewXYZAxes: true,
        viewEclipticPlane: false,
        viewEquatorialPlane: true,
        frameMode: "inertial",
        config: "geo",
        animTime: 1_700_000_000_000,
        chebyshevData: {},
        chebyshevDataLoaded: true,
        npzData: {},
        npzDataLoaded: false,
        ephemerisSource: "chebyshev",
        bodyEphemerisSources: {},
        ...(overrides.runtimeState || {}),
    };

    class FakeSceneHelpers {
        constructor(container) {
            this.container = container;
            this.moonSOISphere = { name: "soi" };
            this.moonHillSphere = { name: "hill" };
            this.moonOsculatingOrbitLine = { name: "osculating" };
            this.createMoonSOI = vi.fn();
            this.createMoonHillSphere = vi.fn();
            this.createMoonOsculatingOrbit = vi.fn();
            this.createBodyHalos = vi.fn();
            this.updateBodyHalos = vi.fn();
            this.updateMoonOsculatingOrbit = vi.fn();
            this.disposeMoonSOI = vi.fn();
            this.disposeMoonHillSphere = vi.fn();
            this.disposeMoonOsculatingOrbit = vi.fn();
            this.disposeBodyHalos = vi.fn();
        }
    }

    const deps = {
        THREE,
        PC,
        DEFAULT_VIEW_STATE,
        SceneHelpers: FakeSceneHelpers,
        lunar_pole: vi.fn(() => ({ alpha: 0.1, delta: 0.2, W: 0.3 })),
        sceneCreationActions: spyBundle(["stopCreation"]),
        sceneCameraPositionActions: {
            setCameraPosition: vi.fn(),
            cameraDisntance: vi.fn(() => 12.5),
        },
        scene3dInitActions: spyBundle(["init3d"]),
        dimensionsActions: spyBundle(["computeDimensions"]),
        skyActions: spyBundle(["addSky", "disposeSky"]),
        sunActions: spyBundle(["addSun", "disposeSun"]),
        earthActions: spyBundle(["addEarth", "disposeEarth"]),
        moonActions: spyBundle(["addMoon", "disposeMoon"]),
        lunarCraterActions: spyBundle([
            "addLunarCraterAnnotations",
            "disposeLunarCraterAnnotations",
            "setLunarCraterAnnotationsVisible",
            "setLunarCraterDiameterRange",
            "setLunarCraterDisplayMode",
            "setLunarCraterHoverLabelsEnabled",
            "setLunarFeatureTypeFilters",
            "setLunarFeatureSearchQuery",
            "setLunarFeatureExcludedKeys",
            "updateLunarCraterLabelScales",
            "updateLunarCraterHoverFromPointer",
            "hideLunarCraterHover",
        ]),
        surfacePointMarkerActions: spyBundle([
            "addSurfacePointMarkers",
            "disposeSurfacePointMarkers",
            "setSurfacePointMarkersVisible",
            "updateSurfacePointMarkers",
        ]),
        locationActions: spyBundle([
            "addEarthLocations",
            "disposeEarthLocations",
            "addMoonLocations",
            "disposeMoonLocations",
        ]),
        primarySecondaryBodiesActions: spyBundle(["setPrimaryAndSecondaryBodies"]),
        spacecraftCurveActions: spyBundle([
            "addSpacecraftCurve",
            "addLandingCurve",
            "disposeLandingCurve",
            "disposeSpacecraftCurve",
            "cancelSpacecraftCurveBuild",
        ]),
        spacecraftActions: spyBundle(["addSpacecraft", "disposeSpacecraft"]),
        lineOfSightActions: spyBundle(["addLineOfSight", "disposeLineOfSight"]),
        axesHelperActions: spyBundle(["addAxesHelper", "disposeAxesHelper"]),
        lightActions: spyBundle(["addLight", "disposeLight"]),
        sceneCameraControllerActions: spyBundle(["addCamera", "disposeCamera"]),
        spacecraftModelActions: {
            addSpacecraftModel: vi.fn(async () => {}),
            disposeSpacecraftModel: vi.fn(),
        },
        sceneInitActions: spyBundle(["init3dRest"]),
        orbitVectorProcessingActions: spyBundle([
            "processOrbitVectorsData3D",
            "processLandingVectors",
        ]),
        bodyRotationActions: {
            rotateMoon: vi.fn(),
            rotateEarth: vi.fn(),
            getEarthInertialQuaternion: vi.fn(() => ({ x: 0, y: 0, z: 0, w: 1 })),
        },
        sceneDisposeActions: spyBundle(["dispose"]),
        ensureSceneViewState: vi.fn((scene) => ({ planeSelection: scene.planeSelection })),
        computeSceneCameraParameters: vi.fn(() => ({
            fov: 50,
            up: { x: 0, y: 0, z: 1 },
            position: { x: 1, y: 2, z: 3 },
            lookTarget: { x: 0, y: 0, z: 0 },
            craftVisible: true,
            pinEarthBelowPanel: false,
        })),
        adjustCameraProjectionMatrixAndSkyAngle: vi.fn(),
        getDefaultCameraDistance: vi.fn(() => 40),
        getBodyEphemerisState: vi.fn(() => ({ available: false })),
        resolveBodySource: vi.fn(() => "chebyshev"),
        getRuntimeState: () => runtimeState,
        ...overrides,
    };
    deps.runtimeState = runtimeState;
    return deps;
}

function makeScene(overrides = {}) {
    const deps = makeDeps(overrides);
    const AnimationScene = createAnimationSceneClass(deps);
    const scene = new AnimationScene("geo");
    return { AnimationScene, scene, deps, runtimeState: deps.runtimeState };
}

beforeEach(() => {
    dom = installFakeDom();
});

afterEach(() => {
    dom?.restore();
    dom = null;
});

describe("scene construction", () => {
    it("starts in the initial creation state with no 3D objects", () => {
        const { AnimationScene, scene } = makeScene();

        expect(scene.name).toBe("geo");
        expect(scene.state).toBe(AnimationScene.SCENE_STATE_START);
        expect(scene.disposed).toBe(false);
        expect(scene.initialized3D).toBe(false);
        expect(scene.earth).toBeNull();
        expect(scene.camera).toBeNull();
        expect(scene.sceneHelpers).toBeNull();
    });

    it("seeds the view state from the shared defaults", () => {
        const { scene } = makeScene();

        expect(scene.planeSelection).toBe(DEFAULT_VIEW_STATE.planeSelection);
        expect(scene.xVariable).toBe(DEFAULT_VIEW_STATE.xVariable);
        expect(scene.zoomFactor).toBe(DEFAULT_VIEW_STATE.zoomFactor);
        expect(scene.panx).toBe(DEFAULT_VIEW_STATE.panx);
    });

    it("defaults the craft identity to the legacy single-craft id", () => {
        const { scene } = makeScene();

        expect(scene.primaryCraftId).toBe("SC");
        expect(scene.activeCraftId).toBe("SC");
        expect(scene.visibleCraftIds).toBeNull();
        expect(scene.craftsById).toEqual({});
    });

    it("exposes ordered creation-state constants", () => {
        const { AnimationScene } = makeScene();

        expect(AnimationScene.SCENE_STATE_START).toBe(0);
        expect(AnimationScene.SCENE_STATE_ADD_CURVE_DONE).toBe(3);
    });
});

describe("creation lifecycle delegation", () => {
    it("cancels an in-flight curve build when creation stops", () => {
        const { scene, deps } = makeScene();

        scene.stopCreation();

        expect(deps.sceneCreationActions.stopCreation).toHaveBeenCalledWith(scene);
        expect(deps.spacecraftCurveActions.cancelSpacecraftCurveBuild).toHaveBeenCalledWith(scene);
    });

    it("tolerates a curve bundle without a cancel hook", () => {
        const { scene, deps } = makeScene();
        delete deps.spacecraftCurveActions.cancelSpacecraftCurveBuild;

        expect(() => scene.stopCreation()).not.toThrow();
    });

    it("forwards the plain scene lifecycle calls", () => {
        const { scene, deps } = makeScene();
        const callback = vi.fn();

        scene.init3d(callback);
        scene.computeDimensions();
        scene.init3dRest();
        scene.setPrimaryAndSecondaryBodies();
        scene.dispose();

        expect(deps.scene3dInitActions.init3d).toHaveBeenCalledWith(scene, callback);
        expect(deps.dimensionsActions.computeDimensions).toHaveBeenCalledWith(scene);
        expect(deps.sceneInitActions.init3dRest).toHaveBeenCalledWith(scene);
        expect(deps.primarySecondaryBodiesActions.setPrimaryAndSecondaryBodies)
            .toHaveBeenCalledWith(scene);
        expect(deps.sceneDisposeActions.dispose).toHaveBeenCalledWith(scene);
    });

    it("awaits the spacecraft model loader", async () => {
        const { scene, deps } = makeScene();

        await scene.addSpacecraftModel();
        scene.disposeSpacecraftModel();

        expect(deps.spacecraftModelActions.addSpacecraftModel).toHaveBeenCalledWith(scene);
        expect(deps.spacecraftModelActions.disposeSpacecraftModel).toHaveBeenCalledWith(scene);
    });

    it("returns curve build results to the caller", () => {
        const { scene, deps } = makeScene();
        deps.spacecraftCurveActions.addSpacecraftCurve.mockReturnValue("curve-handle");
        deps.spacecraftCurveActions.addLandingCurve.mockReturnValue("landing-handle");

        expect(scene.addSpacecraftCurve()).toBe("curve-handle");
        expect(scene.addLandingCurve()).toBe("landing-handle");
    });
});

describe("runtime-state driven composition", () => {
    it("passes the current sky view flags into the sky builder", () => {
        const { scene, deps } = makeScene();

        scene.addSky();

        expect(deps.skyActions.addSky).toHaveBeenCalledWith(scene, {
            earthRadius: 6.4,
            viewSky: true,
            viewConstellationLines: false,
        });
    });

    it("prefers the Earth-specific pole toggles over the shared ones", () => {
        const { scene, deps } = makeScene({
            runtimeState: { viewPoles: false, viewEarthPoles: true, viewEarthPolarAxes: true },
        });

        scene.addEarth();

        expect(deps.earthActions.addEarth).toHaveBeenCalledWith(scene, expect.objectContaining({
            viewPoles: true,
            viewPolarAxes: true,
        }));
    });

    it("falls back to the shared pole toggles when no Earth override exists", () => {
        const { scene, deps } = makeScene({
            runtimeState: { viewPoles: true, viewPolarAxes: true },
        });

        scene.addEarth();

        expect(deps.earthActions.addEarth).toHaveBeenCalledWith(scene, expect.objectContaining({
            viewPoles: true,
            viewPolarAxes: true,
        }));
    });

    it("passes the axes and reference-plane flags through", () => {
        const { scene, deps } = makeScene();

        scene.addAxesHelper();

        expect(deps.axesHelperActions.addAxesHelper).toHaveBeenCalledWith(scene, {
            earthRadius: 6.4,
            viewXYZAxes: true,
            viewEclipticPlane: false,
            viewEquatorialPlane: true,
        });
    });
});

describe("moon influence shells", () => {
    it("creates both shells for a lunar mission and publishes them", () => {
        const { scene } = makeScene();
        scene.moon = { name: "moon" };
        scene.motherContainer = { name: "mother" };

        scene.addMoonSOI();

        expect(scene.sceneHelpers.createMoonSOI).toHaveBeenCalledWith({ name: "moon" }, 1.7, true);
        expect(scene.sceneHelpers.createMoonHillSphere).toHaveBeenCalledWith({ name: "moon" }, 1.7, false);
        expect(scene.moonSOISphere).toEqual({ name: "soi" });
        expect(scene.moonHillSphere).toEqual({ name: "hill" });
    });

    it("skips the shells entirely for a non-lunar mission", () => {
        const { scene } = makeScene({ runtimeState: { globalConfig: { is_lunar: false } } });

        scene.addMoonSOI();

        expect(scene.sceneHelpers).toBeNull();
    });

    it("skips shell disposal for a non-lunar mission", () => {
        const { scene, runtimeState } = makeScene();
        scene.motherContainer = {};
        scene.addMoonSOI();
        const helpers = scene.sceneHelpers;
        runtimeState.globalConfig = { is_lunar: false };

        scene.disposeMoonSOI();

        expect(helpers.disposeMoonSOI).not.toHaveBeenCalled();
        expect(scene.moonSOISphere).not.toBeNull();
    });

    it("clears both shell references on disposal", () => {
        const { scene } = makeScene();
        scene.motherContainer = {};
        scene.addMoonSOI();
        const helpers = scene.sceneHelpers;

        scene.disposeMoonSOI();

        expect(helpers.disposeMoonSOI).toHaveBeenCalled();
        expect(helpers.disposeMoonHillSphere).toHaveBeenCalled();
        expect(scene.moonSOISphere).toBeNull();
        expect(scene.moonHillSphere).toBeNull();
    });
});

describe("body halos", () => {
    it("marks Earth and the Moon but never the craft", () => {
        const { scene } = makeScene();
        scene.motherContainer = {};
        scene.earthContainer = { name: "earth" };
        scene.moonContainer = { name: "moon" };
        scene.craft = { name: "craft" };

        scene.addBodyHalos();

        expect(scene.sceneHelpers.createBodyHalos).toHaveBeenCalledWith({
            earthTarget: { name: "earth" },
            earthRadius: 6.4,
            moonTarget: { name: "moon" },
            moonRadius: 1.7,
            craftTarget: null,
            craftRadius: 0,
            visible: true,
        });
    });

    it("drops the Moon halo for a non-lunar mission", () => {
        const { scene } = makeScene({ runtimeState: { globalConfig: { is_lunar: false } } });
        scene.motherContainer = {};
        scene.moonContainer = { name: "moon" };

        scene.addBodyHalos();

        expect(scene.sceneHelpers.createBodyHalos)
            .toHaveBeenCalledWith(expect.objectContaining({ moonTarget: null }));
    });

    it("does nothing on refresh before a camera exists", () => {
        const { scene } = makeScene();
        scene.motherContainer = {};
        scene.addBodyHalos();

        scene.refreshBodyHalos();

        expect(scene.sceneHelpers.updateBodyHalos).not.toHaveBeenCalled();
    });

    it("suppresses the halos on request without changing the view flag", () => {
        const { scene } = makeScene();
        scene.motherContainer = {};
        scene.camera = new THREE.PerspectiveCamera();
        scene.addBodyHalos();

        scene.refreshBodyHalos({ suppress: true });

        expect(scene.sceneHelpers.updateBodyHalos)
            .toHaveBeenCalledWith(expect.objectContaining({ visible: false }));
    });

    it("passes the renderer surface through on refresh", () => {
        const { scene } = makeScene();
        scene.motherContainer = {};
        scene.camera = new THREE.PerspectiveCamera();
        scene.renderer = { domElement: { id: "canvas" } };
        scene.addBodyHalos();

        scene.refreshBodyHalos();

        expect(scene.sceneHelpers.updateBodyHalos)
            .toHaveBeenCalledWith(expect.objectContaining({
                rendererDomElement: { id: "canvas" },
                visible: true,
            }));
    });
});

describe("secondary body osculating orbit", () => {
    it("is not created for the relative scene", () => {
        const deps = makeDeps();
        const AnimationScene = createAnimationSceneClass(deps);
        const scene = new AnimationScene("relative");
        scene.motherContainer = {};

        scene.addMoonOsculatingOrbit();

        expect(scene.sceneHelpers).toBeNull();
    });

    it("starts hidden while the runtime is in the relative frame", () => {
        const { scene } = makeScene({ runtimeState: { frameMode: "relative" } });
        scene.motherContainer = {};

        scene.addMoonOsculatingOrbit();

        expect(scene.sceneHelpers.createMoonOsculatingOrbit).toHaveBeenCalledWith(false);
    });

    it("is visible in the inertial frame when the view flag is on", () => {
        const { scene } = makeScene();
        scene.motherContainer = {};

        scene.addMoonOsculatingOrbit();

        expect(scene.sceneHelpers.createMoonOsculatingOrbit).toHaveBeenCalledWith(true);
        expect(scene.moonOsculatingOrbitLine).toEqual({ name: "osculating" });
    });

    it("updates the orbit from the secondary body state", () => {
        const { scene } = makeScene();
        scene.motherContainer = {};
        scene.addMoonOsculatingOrbit();
        const bodyState = {
            available: true,
            position: { x: 1, y: 2, z: 3 },
            velocity: { vx: 0, vy: 1, vz: 0 },
        };

        scene.updateSecondaryBodyVisualAids("MOON", bodyState, 100, 5000);

        expect(scene.sceneHelpers.updateMoonOsculatingOrbit).toHaveBeenCalledWith({
            position: bodyState.position,
            velocity: bodyState.velocity,
            pixelsPerAU: 100,
            timeMs: 5000,
            gravitationalParameter: PC.EARTH_GM_KM3_S2 + PC.MOON_GM_KM3_S2,
            visible: true,
        });
    });

    it("tracks Earth as the secondary body in the selenocentric scene", () => {
        const deps = makeDeps();
        const AnimationScene = createAnimationSceneClass(deps);
        const scene = new AnimationScene("lunar");
        scene.motherContainer = {};
        scene.addMoonOsculatingOrbit();

        scene.updateSecondaryBodyVisualAids("MOON", {
            available: true,
            position: {},
            velocity: {},
        }, 100, 0);
        expect(scene.sceneHelpers.updateMoonOsculatingOrbit).not.toHaveBeenCalled();

        scene.updateSecondaryBodyVisualAids("EARTH", {
            available: true,
            position: {},
            velocity: {},
        }, 100, 0);
        expect(scene.sceneHelpers.updateMoonOsculatingOrbit).toHaveBeenCalledTimes(1);
    });

    it("lets a live origin-relative control hide the orbit", () => {
        dom.restore();
        dom = installFakeDom([
            { id: "origin-relative", tag: "input", checked: true },
        ]);
        const { scene } = makeScene();
        scene.motherContainer = {};
        scene.addMoonOsculatingOrbit();

        scene.updateSecondaryBodyVisualAids("MOON", {
            available: true,
            position: {},
            velocity: {},
        }, 100, 0);

        expect(scene.sceneHelpers.updateMoonOsculatingOrbit)
            .toHaveBeenCalledWith(expect.objectContaining({ visible: false }));
    });

    it("ignores an unavailable body state", () => {
        const { scene } = makeScene();
        scene.motherContainer = {};
        scene.addMoonOsculatingOrbit();

        scene.updateSecondaryBodyVisualAids("MOON", { available: false }, 100, 0);

        expect(scene.sceneHelpers.updateMoonOsculatingOrbit).not.toHaveBeenCalled();
    });
});

describe("lunar feature delegation", () => {
    it("resolves the camera and renderer surface for annotation builds", () => {
        const { scene, deps } = makeScene();
        scene.camera = { name: "scene-camera" };
        scene.cameraController = { _rendererDomElement: { id: "canvas" } };

        scene.addLunarCraterAnnotations();

        expect(deps.lunarCraterActions.addLunarCraterAnnotations).toHaveBeenCalledWith({
            scene,
            camera: { name: "scene-camera" },
            rendererDomElement: { id: "canvas" },
        });
    });

    it("lets the caller override the camera and renderer surface", () => {
        const { scene, deps } = makeScene();
        scene.camera = { name: "scene-camera" };

        scene.addLunarCraterAnnotations({
            camera: { name: "override" },
            rendererDomElement: { id: "other" },
        });

        expect(deps.lunarCraterActions.addLunarCraterAnnotations).toHaveBeenCalledWith({
            scene,
            camera: { name: "override" },
            rendererDomElement: { id: "other" },
        });
    });

    it("accepts either spelling of the diameter range keys", () => {
        const { scene, deps } = makeScene();

        scene.setLunarCraterDiameterRange({ lunarCraterMinDiameterKm: 10, maxDiameterKm: 400 });

        expect(deps.lunarCraterActions.setLunarCraterDiameterRange)
            .toHaveBeenCalledWith(expect.objectContaining({
                minDiameterKm: 10,
                maxDiameterKm: 400,
            }));
    });

    it("forwards the remaining lunar feature controls", () => {
        const { scene, deps } = makeScene();

        scene.setLunarCraterAnnotationsVisible(true);
        scene.setLunarCraterDisplayMode("hover");
        scene.setLunarCraterHoverLabelsEnabled(false);
        scene.setLunarFeatureTypeFilters({ "Mare, maria": { enabled: false } });
        scene.setLunarFeatureSearchQuery("tycho");
        scene.setLunarFeatureExcludedKeys(["k1"]);
        scene.clearLunarCraterHover();
        scene.disposeLunarCraterAnnotations();

        expect(deps.lunarCraterActions.setLunarCraterAnnotationsVisible)
            .toHaveBeenCalledWith({ scene, visible: true });
        expect(deps.lunarCraterActions.setLunarCraterDisplayMode)
            .toHaveBeenCalledWith(expect.objectContaining({ mode: "hover" }));
        expect(deps.lunarCraterActions.setLunarCraterHoverLabelsEnabled)
            .toHaveBeenCalledWith({ scene, enabled: false });
        expect(deps.lunarCraterActions.setLunarFeatureSearchQuery)
            .toHaveBeenCalledWith(expect.objectContaining({ searchQuery: "tycho" }));
        expect(deps.lunarCraterActions.setLunarFeatureExcludedKeys)
            .toHaveBeenCalledWith(expect.objectContaining({ excludedKeys: ["k1"] }));
        expect(deps.lunarCraterActions.hideLunarCraterHover).toHaveBeenCalledWith({ scene });
        expect(deps.lunarCraterActions.disposeLunarCraterAnnotations).toHaveBeenCalledWith({ scene });
    });
});

describe("lat/lon grid delegation", () => {
    it("reports false when no body renderer is mounted", () => {
        const { scene } = makeScene();

        expect(scene.updateMoonLatLonGridForCamera({})).toBe(false);
        expect(scene.updateEarthLatLonGridForCamera({})).toBe(false);
        expect(scene.updateMoonLatLonHoverFromPointer({})).toBe(false);
        expect(scene.updateEarthLatLonHoverFromPointer({})).toBe(false);
        expect(scene.clearMoonLatLonHover()).toBe(false);
        expect(scene.clearEarthLatLonHover()).toBe(false);
    });

    it("reports the renderer's own answer when it is mounted", () => {
        const { scene } = makeScene();
        scene.moonRenderer = {
            updateLatLonGridForCamera: vi.fn(() => true),
            updateLatLonHoverFromPointer: vi.fn(() => false),
            hideLatLonHover: vi.fn(() => true),
        };
        scene.earthRenderer = { updateLatLonGridForCamera: vi.fn(() => true) };

        expect(scene.updateMoonLatLonGridForCamera({ x: 1 })).toBe(true);
        expect(scene.updateMoonLatLonHoverFromPointer({})).toBe(false);
        expect(scene.clearMoonLatLonHover()).toBe(true);
        expect(scene.updateEarthLatLonGridForCamera({})).toBe(true);
        expect(scene.moonRenderer.updateLatLonGridForCamera).toHaveBeenCalledWith({ x: 1 });
    });
});

describe("camera parameters", () => {
    function mountCamera(scene) {
        scene.camera = new THREE.PerspectiveCamera();
        scene.camera.lookAt = vi.fn();
        scene.cameraController = {
            setFov: vi.fn(),
            setUp: vi.fn(),
            getDistanceFromOrigin: vi.fn(() => 33),
            controls: { target: new THREE.Vector3(), update: vi.fn() },
        };
        return scene;
    }

    it("reports the live controller distance to the planner", () => {
        const { scene, deps } = makeScene();
        mountCamera(scene);

        scene.setCameraParameters(false);

        expect(deps.computeSceneCameraParameters)
            .toHaveBeenCalledWith(expect.objectContaining({
                controllerDistance: 33,
                isInitialization: false,
                defaultCameraDistance: 40,
            }));
    });

    it("reports no controller distance before the controller exists", () => {
        const { scene, deps } = makeScene();

        scene.setCameraParameters(true);

        expect(deps.computeSceneCameraParameters)
            .toHaveBeenCalledWith(expect.objectContaining({ controllerDistance: null }));
    });

    it("treats a checked origin-relative control as relative mode", () => {
        dom.restore();
        dom = installFakeDom([{ id: "origin-relative", tag: "input", checked: true }]);
        const { scene, deps } = makeScene();

        scene.setCameraParameters(true);

        expect(deps.computeSceneCameraParameters)
            .toHaveBeenCalledWith(expect.objectContaining({ isRelativeMode: true }));
    });

    it("reads the mission's relative default plane", () => {
        const { scene, deps } = makeScene({
            runtimeState: {
                globalConfig: { is_lunar: true, ui: { viewDefaults: { relativeDefaultPlaneSelection: "ZX" } } },
            },
        });

        scene.setCameraParameters(true);

        expect(deps.computeSceneCameraParameters)
            .toHaveBeenCalledWith(expect.objectContaining({ relativeDefaultPlaneSelection: "ZX" }));
    });

    it("applies the planned camera pose and records the look target", () => {
        const { scene, deps } = makeScene();
        mountCamera(scene);

        scene.setCameraParameters(true);

        expect(scene.cameraController.setFov).toHaveBeenCalledWith(50);
        expect(scene.cameraController.setUp).toHaveBeenCalledWith(0, 0, 1);
        expect(deps.sceneCameraPositionActions.setCameraPosition)
            .toHaveBeenCalledWith(scene, 1, 2, 3);
        expect(scene.defaultLookTarget).toEqual({ x: 0, y: 0, z: 0 });
        expect(scene.cameraController.controls.update).toHaveBeenCalled();
        expect(scene.craftVisible).toBe(true);
        expect(deps.adjustCameraProjectionMatrixAndSkyAngle).toHaveBeenCalled();
    });

    it("records a null look target when the plan has none", () => {
        const { scene, deps } = makeScene();
        deps.computeSceneCameraParameters.mockReturnValue({
            fov: 50,
            craftVisible: false,
        });
        mountCamera(scene);

        scene.setCameraParameters(true);

        expect(scene.defaultLookTarget).toBeNull();
        expect(scene.cameraController.setUp).not.toHaveBeenCalled();
        expect(scene.craftVisible).toBe(false);
    });

    it("keeps the desktop look target when panel anchoring is requested on a wide viewport", () => {
        const { scene, deps } = makeScene();
        deps.computeSceneCameraParameters.mockReturnValue({
            fov: 50,
            lookTarget: { x: 4, y: 5, z: 6 },
            craftVisible: true,
            pinEarthBelowPanel: true,
        });
        mountCamera(scene);

        scene.setCameraParameters(true);

        expect(scene.defaultLookTarget).toEqual({ x: 4, y: 5, z: 6 });
    });

    it("keeps the base look target on mobile when the mission is not Artemis II", () => {
        dom.restore();
        dom = installFakeDom([{ id: "mobile-card-mission", tag: "div" }], { innerWidth: 390 });
        const { scene, deps } = makeScene();
        deps.computeSceneCameraParameters.mockReturnValue({
            fov: 50,
            lookTarget: { x: 4, y: 5, z: 6 },
            craftVisible: true,
            pinEarthBelowPanel: true,
        });
        mountCamera(scene);

        scene.setCameraParameters(true);

        expect(scene.defaultLookTarget).toEqual({ x: 4, y: 5, z: 6 });
    });
});

describe("body rotation", () => {
    it("delegates inertial Moon rotation to the shared action", () => {
        const { scene, deps, runtimeState } = makeScene();
        scene.moonContainer = new THREE.Object3D();

        scene.rotateMoon(1234);

        expect(deps.bodyRotationActions.rotateMoon).toHaveBeenCalledWith({
            timeMs: 1234,
            globalConfig: runtimeState.globalConfig,
            moonContainer: scene.moonContainer,
        });
    });

    it("uses the current animation time by default", () => {
        const { scene, deps, runtimeState } = makeScene();
        scene.moonContainer = new THREE.Object3D();

        scene.rotateMoon();

        expect(deps.bodyRotationActions.rotateMoon)
            .toHaveBeenCalledWith(expect.objectContaining({ timeMs: runtimeState.animTime }));
    });

    it("skips Moon rotation for a non-lunar mission or a missing container", () => {
        const { scene, deps } = makeScene({ runtimeState: { globalConfig: { is_lunar: false } } });
        scene.moonContainer = new THREE.Object3D();
        scene.rotateMoon(0);
        expect(deps.bodyRotationActions.rotateMoon).not.toHaveBeenCalled();

        const lunar = makeScene();
        lunar.scene.rotateMoon(0);
        expect(lunar.deps.bodyRotationActions.rotateMoon).not.toHaveBeenCalled();
    });

    it("builds the Moon orientation from the published relative frame quaternion", () => {
        const { scene, deps } = makeScene({
            runtimeState: {
                frameMode: "relative",
                config: "geo",
                chebyshevData: { geo: { FRAME_ROT: { segments: [FRAME_ROT_SEGMENT] } } },
            },
        });
        scene.moonContainer = new THREE.Object3D();

        scene.rotateMoon(1234);

        // The published frame quaternion short-circuits the ephemeris fallback.
        expect(deps.getBodyEphemerisState).not.toHaveBeenCalled();
        expect(scene.moonContainer.quaternion.lengthSq()).toBeCloseTo(1, 9);
        expect(scene.moonContainer.quaternion.equals(new THREE.Quaternion())).toBe(false);
    });

    it("derives a relative Moon frame from the ephemeris when no quaternion exists", () => {
        const { scene, deps } = makeScene({ runtimeState: { frameMode: "relative", config: "geo" } });
        deps.getBodyEphemerisState.mockReturnValue({
            available: true,
            position: { x: 384400, y: 0, z: 0 },
            velocity: { vx: 0, vy: 1.022, vz: 0 },
        });
        scene.moonContainer = new THREE.Object3D();

        scene.rotateMoon(1234);

        expect(deps.getBodyEphemerisState).toHaveBeenCalled();
        expect(scene.moonContainer.quaternion.lengthSq()).toBeCloseTo(1, 9);
    });

    it("leaves the Moon alone when its relative state is degenerate", () => {
        const { scene, deps } = makeScene({ runtimeState: { frameMode: "relative", config: "geo" } });
        deps.getBodyEphemerisState.mockReturnValue({
            available: true,
            position: { x: 0, y: 0, z: 0 },
            velocity: { vx: 0, vy: 0, vz: 0 },
        });
        scene.moonContainer = new THREE.Object3D();
        const before = scene.moonContainer.quaternion.clone();

        scene.rotateMoon(1234);

        expect(scene.moonContainer.quaternion.equals(before)).toBe(true);
    });

    it("keeps the sky inertial outside relative mode", () => {
        const { scene, deps } = makeScene();
        scene.earthContainer = new THREE.Object3D();
        scene.skyContainer = new THREE.Object3D();
        scene.skyBaseQuaternion = new THREE.Quaternion(0, 0, Math.SQRT1_2, Math.SQRT1_2);

        scene.rotateEarth(1234);

        expect(deps.bodyRotationActions.rotateEarth).toHaveBeenCalledWith({
            timeMs: 1234,
            earthContainer: scene.earthContainer,
        });
        expect(scene.skyContainer.quaternion.equals(scene.skyBaseQuaternion)).toBe(true);
    });

    it("rotates the sky with the relative frame", () => {
        const { scene, deps } = makeScene({ runtimeState: { frameMode: "relative", config: "geo" } });
        deps.getBodyEphemerisState.mockReturnValue({
            available: true,
            position: { x: 384400, y: 0, z: 0 },
            velocity: { vx: 0, vy: 1.022, vz: 0 },
        });
        scene.earthContainer = new THREE.Object3D();
        scene.skyContainer = new THREE.Object3D();
        scene.skyBaseQuaternion = new THREE.Quaternion();

        scene.rotateEarth(1234);

        expect(deps.bodyRotationActions.rotateEarth).not.toHaveBeenCalled();
        expect(scene.skyContainer.quaternion.lengthSq()).toBeCloseTo(1, 9);
    });

    it("leaves Earth alone when its relative state is unavailable", () => {
        const { scene, deps } = makeScene({ runtimeState: { frameMode: "relative", config: "geo" } });
        deps.getBodyEphemerisState.mockReturnValue({ available: false });
        scene.earthContainer = new THREE.Object3D();
        const before = scene.earthContainer.quaternion.clone();

        scene.rotateEarth(1234);

        expect(scene.earthContainer.quaternion.equals(before)).toBe(true);
        expect(deps.bodyRotationActions.rotateEarth).not.toHaveBeenCalled();
    });
});

describe("orbit vector processing", () => {
    it("forwards both 3D vector passes and the camera distance query", () => {
        const { scene, deps } = makeScene();

        scene.processOrbitVectorsData3D();
        scene.processLandingVectors();

        expect(deps.orbitVectorProcessingActions.processOrbitVectorsData3D)
            .toHaveBeenCalledWith(scene);
        expect(deps.orbitVectorProcessingActions.processLandingVectors)
            .toHaveBeenCalledWith(scene);
        expect(scene.cameraDisntance({ x: 1, y: 2, z: 3 })).toBe(12.5);
    });
});
