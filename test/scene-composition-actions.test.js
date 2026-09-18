import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

import { installFakeDom } from "./helpers/fake-dom.js";
import { createAxesHelperActions } from "../src/platform/js/app/axes-helper-actions.js";
import { createBodyRotationActions } from "../src/platform/js/app/body-rotation-actions.js";
import { createLightActions } from "../src/platform/js/app/light-actions.js";
import { createSceneCameraControllerActions } from "../src/platform/js/app/scene-camera-controller-actions.js";
import { createSkyActions } from "../src/platform/js/app/sky-actions.js";
import {
    computePrimarySecondaryBodies,
    createPrimarySecondaryBodiesActions,
} from "../src/platform/js/app/primary-secondary-bodies-actions.js";
import { LIGHT_SETTINGS as LT, PHYSICS_CONSTANTS as PC } from "../src/platform/js/core/constants.js";

let dom = null;

afterEach(() => {
    dom?.restore();
    dom = null;
});

describe("light actions", () => {
    function makeScene() {
        return {
            motherContainer: { id: "mother" },
            scene: { add: vi.fn(), remove: vi.fn() },
        };
    }

    class FakeLightManager {
        constructor(container) {
            this.container = container;
            this.primaryLight = { name: "primary" };
            this.earthshineLight = { name: "earthshine" };
            this.moonshineLight = { name: "moonshine" };
            this.craftLight = { name: "craft" };
            this.create = vi.fn();
            this.dispose = vi.fn();
        }
    }

    it("publishes each managed light onto the scene", () => {
        const actions = createLightActions({ LightManager: FakeLightManager });
        const scene = makeScene();

        actions.addLight(scene);

        expect(scene.lightManager.container).toBe(scene.motherContainer);
        expect(scene.light).toBe(scene.lightManager.primaryLight);
        expect(scene.lightFill).toBe(scene.lightManager.earthshineLight);
        expect(scene.lightMoonshine).toBe(scene.lightManager.moonshineLight);
        expect(scene.light2).toBe(scene.lightManager.craftLight);
        expect(scene.scene.add).toHaveBeenCalledWith(scene.motherContainer);
    });

    it("disposes the manager and clears every light reference", () => {
        const actions = createLightActions({ LightManager: FakeLightManager });
        const scene = makeScene();
        actions.addLight(scene);
        const manager = scene.lightManager;

        actions.disposeLight(scene);

        expect(manager.dispose).toHaveBeenCalledTimes(1);
        expect(scene.lightManager).toBeNull();
        expect(scene.light).toBeNull();
        expect(scene.lightFill).toBeNull();
        expect(scene.lightMoonshine).toBeNull();
        expect(scene.light2).toBeNull();
        expect(scene.scene.remove).toHaveBeenCalledWith(scene.motherContainer);
    });

    it("does nothing for a scene that was never composed", () => {
        const actions = createLightActions({ LightManager: FakeLightManager });
        const scene = { scene: { remove: vi.fn() } };

        actions.disposeLight(scene);

        expect(scene.scene.remove).not.toHaveBeenCalled();
    });
});

describe("axes helper actions", () => {
    class FakeSceneHelpers {
        constructor(container) {
            this.container = container;
            this.axesHelper = { name: "axes" };
            this.eclipticPolarGridHelper = { name: "eclipticGrid" };
            this.eclipticPlaneHelper = { name: "ecliptic" };
            this.equatorialPolarGridHelper = { name: "equatorialGrid" };
            this.equatorialPlaneHelper = { name: "equatorial" };
            this.createAxesHelper = vi.fn();
            this.createEclipticPlane = vi.fn();
            this.createEquatorialPlane = vi.fn();
            this.disposeAxesHelper = vi.fn();
            this.disposeEclipticPlane = vi.fn();
            this.disposeEquatorialPlane = vi.fn();
        }
    }

    function makeActions(pixelsPerAU = 100) {
        return createAxesHelperActions({
            SceneHelpers: FakeSceneHelpers,
            getPixelsPerAU: () => pixelsPerAU,
            PC,
        });
    }

    it("sizes the axes and reference planes from the Earth-Moon distance", () => {
        const actions = makeActions(100);
        const scene = { motherContainer: { id: "mother" } };

        actions.addAxesHelper(scene, {
            viewXYZAxes: true,
            viewEclipticPlane: false,
            viewEquatorialPlane: true,
        });

        const expectedAxesSize = 2 * 100 * PC.EARTH_MOON_DISTANCE_MEAN_AU;
        const expectedPlaneRadius = 100 * PC.EARTH_MOON_DISTANCE_MEAN_AU * 1.5;
        expect(scene.sceneHelpers.createAxesHelper).toHaveBeenCalledWith(expectedAxesSize, true);
        expect(scene.sceneHelpers.createEclipticPlane).toHaveBeenCalledWith(expectedPlaneRadius, false);
        expect(scene.sceneHelpers.createEquatorialPlane).toHaveBeenCalledWith(expectedPlaneRadius, true);
    });

    it("mirrors the created helpers onto the scene", () => {
        const actions = makeActions();
        const scene = { motherContainer: {} };

        actions.addAxesHelper(scene, {});

        expect(scene.axesHelper).toBe(scene.sceneHelpers.axesHelper);
        expect(scene.eclipticPlaneHelper).toBe(scene.sceneHelpers.eclipticPlaneHelper);
        expect(scene.equatorialPlaneHelper).toBe(scene.sceneHelpers.equatorialPlaneHelper);
    });

    it("reuses an existing SceneHelpers instance", () => {
        const actions = makeActions();
        const existing = new FakeSceneHelpers({});
        const scene = { motherContainer: {}, sceneHelpers: existing };

        actions.addAxesHelper(scene, {});

        expect(scene.sceneHelpers).toBe(existing);
    });

    it("disposes all three helpers and clears the scene references", () => {
        const actions = makeActions();
        const scene = { motherContainer: {} };
        actions.addAxesHelper(scene, {});
        const helpers = scene.sceneHelpers;

        actions.disposeAxesHelper(scene);

        expect(helpers.disposeAxesHelper).toHaveBeenCalled();
        expect(helpers.disposeEclipticPlane).toHaveBeenCalled();
        expect(helpers.disposeEquatorialPlane).toHaveBeenCalled();
        expect(scene.axesHelper).toBeNull();
        expect(scene.eclipticPlaneHelper).toBeNull();
        expect(scene.equatorialPolarGridHelper).toBeNull();
    });

    it("clears scene references even without a helpers instance", () => {
        const actions = makeActions();
        const scene = { axesHelper: {}, eclipticPlaneHelper: {} };

        actions.disposeAxesHelper(scene);

        expect(scene.axesHelper).toBeNull();
        expect(scene.eclipticPlaneHelper).toBeNull();
    });
});

describe("body rotation actions", () => {
    const Astronomy = { SiderealTime: vi.fn(() => 6) };
    const lunarPole = vi.fn(() => ({ alpha: 0.1, delta: 0.2, W: 0.3 }));
    const degreesToRadians = (degrees) => (degrees * Math.PI) / 180;

    function makeActions() {
        return createBodyRotationActions({
            lunar_pole: lunarPole,
            Astronomy,
            degreesToRadians,
            PC,
        });
    }

    it("skips Moon rotation for a non-lunar mission", () => {
        const actions = makeActions();
        const moonContainer = new THREE.Object3D();
        moonContainer.rotation.set(1, 1, 1);

        actions.rotateMoon({ timeMs: 0, globalConfig: { is_lunar: false }, moonContainer });

        expect(moonContainer.rotation.x).toBe(1);
    });

    it("skips Moon rotation without a container", () => {
        const actions = makeActions();
        expect(() => actions.rotateMoon({
            timeMs: 0,
            globalConfig: { is_lunar: true },
            moonContainer: null,
        })).not.toThrow();
    });

    it("rebuilds the Moon orientation from the lunar pole each frame", () => {
        const actions = makeActions();
        const moonContainer = new THREE.Object3D();
        const timeMs = Date.UTC(2026, 3, 1);

        actions.rotateMoon({ timeMs, globalConfig: { is_lunar: true }, moonContainer });
        const first = moonContainer.quaternion.clone();
        // A second call must reset to identity first, not compound rotations.
        actions.rotateMoon({ timeMs, globalConfig: { is_lunar: true }, moonContainer });

        expect(moonContainer.quaternion.angleTo(first)).toBeLessThan(1e-6);
        expect(lunarPole).toHaveBeenCalledWith(new Date(timeMs));
    });

    it("rotates the Earth to Greenwich apparent sidereal time", () => {
        const actions = makeActions();
        const earthContainer = new THREE.Object3D();

        actions.rotateEarth({ timeMs: 0, earthContainer });

        // SiderealTime is stubbed at six hours, i.e. a quarter turn.
        expect(earthContainer.rotation.z).toBeCloseTo(Math.PI / 2, 12);
    });

    it("ignores an Earth rotation with no container", () => {
        const actions = makeActions();
        expect(() => actions.rotateEarth({ timeMs: 0, earthContainer: null })).not.toThrow();
    });

    it("reports the same Earth orientation as a quaternion", () => {
        const actions = makeActions();
        const earthContainer = new THREE.Object3D();
        actions.rotateEarth({ timeMs: 0, earthContainer });

        const quaternion = actions.getEarthInertialQuaternion(0);

        expect(new THREE.Quaternion(quaternion.x, quaternion.y, quaternion.z, quaternion.w)
            .angleTo(earthContainer.quaternion)).toBeLessThan(1e-12);
    });
});

describe("scene camera controller actions", () => {
    class FakeCameraController {
        constructor(width, height, distance) {
            this.width = width;
            this.height = height;
            this.distance = distance;
            this.camera = { name: "main" };
            this.craftCamera = { name: "craft" };
            this.droneCamera = { name: "drone" };
            this.controls = { name: "controls" };
            this.createMainCamera = vi.fn();
            this.createCraftCamera = vi.fn();
            this.createDroneCamera = vi.fn();
            this.createControls = vi.fn();
            this.dispose = vi.fn();
        }
    }

    function makeScene(cameraControlsEnabled) {
        return {
            width: 800,
            height: 600,
            craft: { name: "craft-object" },
            drone: { name: "drone-object" },
            cameraControlsEnabled,
            setCameraPosition: vi.fn(),
            setCameraParameters: vi.fn(),
        };
    }

    function makeActions(domElement = { id: "canvas" }) {
        return createSceneCameraControllerActions({
            CameraController: FakeCameraController,
            getDefaultCameraDistance: () => 42,
            getRendererDomElement: () => domElement,
            cameraControlsCallback: vi.fn(),
            render: vi.fn(),
        });
    }

    it("builds the camera rig at the default distance", () => {
        const actions = makeActions();
        const scene = makeScene(true);

        actions.addCamera(scene);

        expect(scene.cameraController.width).toBe(800);
        expect(scene.cameraController.distance).toBe(42);
        expect(scene.setCameraPosition).toHaveBeenCalledWith(42, 42, 42);
        expect(scene.cameraController.createCraftCamera).toHaveBeenCalledWith(scene.craft, 50);
        expect(scene.cameraController.createDroneCamera).toHaveBeenCalledWith(scene.drone, 100);
        expect(scene.setCameraParameters).toHaveBeenCalledWith(true);
    });

    it("creates orbit controls only when the scene enables them", () => {
        const actions = makeActions();

        const withControls = makeScene(true);
        actions.addCamera(withControls);
        expect(withControls.cameraController.createControls).toHaveBeenCalledTimes(1);
        expect(withControls.cameraControls).toBe(withControls.cameraController.controls);

        const withoutControls = makeScene(false);
        actions.addCamera(withoutControls);
        expect(withoutControls.cameraController.createControls).not.toHaveBeenCalled();
    });

    it("hands the craft and drone back for disposal", () => {
        const actions = makeActions();
        const scene = makeScene(true);
        actions.addCamera(scene);
        const controller = scene.cameraController;

        actions.disposeCamera(scene);

        expect(controller.dispose).toHaveBeenCalledWith(scene.craft, scene.drone);
        expect(scene.cameraController).toBeNull();
        expect(scene.camera).toBeNull();
        expect(scene.craftCamera).toBeNull();
        expect(scene.droneCamera).toBeNull();
        expect(scene.cameraControls).toBeNull();
    });

    it("clears camera references for a scene with no controller", () => {
        const actions = makeActions();
        const scene = { camera: {}, craftCamera: {} };

        actions.disposeCamera(scene);

        expect(scene.camera).toBeNull();
        expect(scene.craftCamera).toBeNull();
    });
});

describe("primary and secondary body selection", () => {
    it("puts Earth first in the geocentric frame", () => {
        expect(computePrimarySecondaryBodies({ config: "geo", isLunarMission: true }))
            .toEqual({ primaryBody: "earth", secondaryBody: "moon", addMoonComponents: true });
    });

    it("drops the Moon from a non-lunar geocentric mission", () => {
        expect(computePrimarySecondaryBodies({ config: "geo", isLunarMission: false }))
            .toEqual({ primaryBody: "earth", secondaryBody: null, addMoonComponents: false });
    });

    it("puts the Moon first in the selenocentric frame", () => {
        expect(computePrimarySecondaryBodies({ config: "lunar", isLunarMission: true }))
            .toEqual({ primaryBody: "moon", secondaryBody: "earth", addMoonComponents: true });
    });

    it("falls back to an Earth-only frame for an unknown origin", () => {
        expect(computePrimarySecondaryBodies({ config: "helio", isLunarMission: true }))
            .toEqual({ primaryBody: "earth", secondaryBody: null, addMoonComponents: false });
    });
});

describe("primary/secondary body composition", () => {
    function makeScene() {
        const scene = {
            motherContainer: new THREE.Group(),
            earthContainer: new THREE.Group(),
            moonContainer: new THREE.Group(),
            earthAxis: new THREE.Object3D(),
            earthNorthPoleSphere: new THREE.Object3D(),
            earthSouthPoleSphere: new THREE.Object3D(),
            moonAxis: new THREE.Object3D(),
            moonNorthPoleSphere: new THREE.Object3D(),
            moonSouthPoleSphere: new THREE.Object3D(),
        };
        return scene;
    }

    it("mounts Earth as the primary body in the geocentric frame", () => {
        const actions = createPrimarySecondaryBodiesActions({
            getConfig: () => "geo",
            getGlobalConfig: () => ({ is_lunar: true }),
        });
        const scene = makeScene();

        actions.setPrimaryAndSecondaryBodies(scene);

        expect(scene.primaryBody3D).toBe(scene.earthContainer);
        expect(scene.secondaryBody3D).toBe(scene.moonContainer);
        expect(scene.motherContainer.children)
            .toEqual([scene.earthContainer, scene.moonContainer]);
        expect(scene.earthContainer.children).toContain(scene.earthAxis);
        expect(scene.moonContainer.children).toContain(scene.moonAxis);
    });

    it("mounts the Moon as the primary body in the selenocentric frame", () => {
        const actions = createPrimarySecondaryBodiesActions({
            getConfig: () => "lunar",
            getGlobalConfig: () => ({ is_lunar: true }),
        });
        const scene = makeScene();

        actions.setPrimaryAndSecondaryBodies(scene);

        expect(scene.primaryBody3D).toBe(scene.moonContainer);
        expect(scene.motherContainer.children)
            .toEqual([scene.moonContainer, scene.earthContainer]);
    });

    it("leaves lunar pole markers off a non-lunar mission", () => {
        const actions = createPrimarySecondaryBodiesActions({
            getConfig: () => "geo",
            getGlobalConfig: () => ({ is_lunar: false }),
        });
        const scene = makeScene();

        actions.setPrimaryAndSecondaryBodies(scene);

        expect(scene.moonContainer.children).not.toContain(scene.moonAxis);
        // The Moon container is still the secondary reference for the frame.
        expect(scene.secondaryBody3D).toBe(scene.moonContainer);
    });

    it("enables the reflected-light layers on both body containers", () => {
        const actions = createPrimarySecondaryBodiesActions({
            getConfig: () => "geo",
            getGlobalConfig: () => ({ is_lunar: true }),
        });
        const scene = makeScene();

        actions.setPrimaryAndSecondaryBodies(scene);

        expect(scene.earthContainer.layers.isEnabled(LT.EARTH_REFLECTED_LIGHT_LAYER)).toBe(true);
        expect(scene.earthAxis.layers.isEnabled(LT.EARTH_REFLECTED_LIGHT_LAYER)).toBe(true);
        expect(scene.moonContainer.layers.isEnabled(LT.MOON_REFLECTED_LIGHT_LAYER)).toBe(true);
    });
});

describe("sky actions", () => {
    class FakeSkyRenderer {
        constructor(container, earthRadius) {
            this.container = new THREE.Group();
            this.parent = container;
            this.earthRadius = earthRadius;
            this.skyMesh = new THREE.Object3D();
            this.constellationMesh = new THREE.Object3D();
            this.setTextures = vi.fn();
            this.create = vi.fn();
            this.setParameters = vi.fn();
            this.setLayerVisibility = vi.fn();
            this.dispose = vi.fn();
        }
    }

    function makeScene(name = "geo") {
        return {
            name,
            motherContainer: new THREE.Group(),
            skyTexture: { id: "sky" },
            skyConstellationTexture: { id: "constellations" },
        };
    }

    it("publishes the renderer's meshes and a base orientation", () => {
        const render = vi.fn();
        const actions = createSkyActions({ SkyRenderer: FakeSkyRenderer, render });
        const scene = makeScene();

        actions.addSky(scene, { earthRadius: 3, viewSky: true, viewConstellationLines: false });

        expect(scene.skyRenderer.earthRadius).toBe(3);
        expect(scene.sky).toBe(scene.skyRenderer.skyMesh);
        expect(scene.skyConstellation).toBe(scene.skyRenderer.constellationMesh);
        expect(scene.skyBaseQuaternion).toBeInstanceOf(THREE.Quaternion);
        expect(scene.skyRenderer.setTextures).toHaveBeenCalledWith({ id: "sky" }, { id: "constellations" });
        expect(render).toHaveBeenCalledTimes(1);
    });

    it("creates the sky when either layer is requested", () => {
        const actions = createSkyActions({ SkyRenderer: FakeSkyRenderer, render: vi.fn() });

        const constellationsOnly = makeScene();
        actions.addSky(constellationsOnly, {
            earthRadius: 3,
            viewSky: false,
            viewConstellationLines: true,
        });
        expect(constellationsOnly.skyRenderer.create).toHaveBeenCalledWith(true);

        const neither = makeScene();
        actions.addSky(neither, { earthRadius: 3, viewSky: false, viewConstellationLines: false });
        expect(neither.skyRenderer.create).toHaveBeenCalledWith(false);
    });

    it("applies the requested layer visibility to the meshes", () => {
        const actions = createSkyActions({ SkyRenderer: FakeSkyRenderer, render: vi.fn() });
        const scene = makeScene();

        actions.addSky(scene, { earthRadius: 3, viewSky: false, viewConstellationLines: true });

        expect(scene.sky.visible).toBe(false);
        expect(scene.skyConstellation.visible).toBe(true);
        expect(scene.skyContainer.visible).toBe(true);
    });

    it("centres the sky on the Moon for the lunar scene", () => {
        const actions = createSkyActions({ SkyRenderer: FakeSkyRenderer, render: vi.fn() });
        dom = installFakeDom();
        const scene = makeScene("lunar");

        actions.addSky(scene, { earthRadius: 3, viewSky: true, viewConstellationLines: true });

        const [parameters] = scene.skyRenderer.setParameters.mock.calls[0];
        expect(parameters.planet_center_mode).toBe("moon");
        expect(parameters.procedural_stars_enabled).toBe(true);
    });

    it("leaves optional sky parameters undefined when no controls exist", () => {
        const actions = createSkyActions({ SkyRenderer: FakeSkyRenderer, render: vi.fn() });
        dom = installFakeDom();
        const scene = makeScene();

        actions.addSky(scene, { earthRadius: 3, viewSky: true, viewConstellationLines: true });

        const [parameters] = scene.skyRenderer.setParameters.mock.calls[0];
        expect(parameters.bloom_strength).toBeUndefined();
        expect(parameters.atmosphere_enabled).toBeUndefined();
        expect(parameters.sky_time_ms).toBeUndefined();
    });

    it("reads sky parameters from whichever control id is present", () => {
        const actions = createSkyActions({ SkyRenderer: FakeSkyRenderer, render: vi.fn() });
        dom = installFakeDom([
            { id: "atmosphere-enabled", tag: "input", checked: true },
            { id: "bloom_strength", tag: "input", value: "0.7" },
            { id: "sky-observer-lat", tag: "input", value: "19.1" },
            { id: "sky-time-seconds", tag: "input", value: "3" },
            { id: "sky-twinkle-strength", tag: "input", value: "oops" },
        ]);
        const scene = makeScene();

        actions.addSky(scene, { earthRadius: 3, viewSky: true, viewConstellationLines: true });

        const [parameters] = scene.skyRenderer.setParameters.mock.calls[0];
        expect(parameters.atmosphere_enabled).toBe(true);
        expect(parameters.bloom_strength).toBe(0.7);
        expect(parameters.observer_lat).toBe(19.1);
        expect(parameters.sky_time_ms).toBe(3000);
        expect(parameters.twinkle_strength).toBeUndefined();
    });

    it("disposes the renderer and releases every sky field", () => {
        const actions = createSkyActions({ SkyRenderer: FakeSkyRenderer, render: vi.fn() });
        const scene = makeScene();
        actions.addSky(scene, { earthRadius: 3, viewSky: true, viewConstellationLines: true });
        const renderer = scene.skyRenderer;

        actions.disposeSky(scene);

        expect(renderer.dispose).toHaveBeenCalledTimes(1);
        expect(scene.skyRenderer).toBeNull();
        expect(scene.sky).toBeNull();
        expect(scene.skyConstellation).toBeNull();
        expect(scene.skyContainer).toBeNull();
        expect(scene.skyBaseQuaternion).toBeNull();
        expect(scene.skyTexture).toBeNull();
        expect(scene.skyConstellationTexture).toBeNull();
    });

    it("still releases the sky textures when the renderer throws on dispose", () => {
        const actions = createSkyActions({ SkyRenderer: FakeSkyRenderer, render: vi.fn() });
        const scene = makeScene();
        actions.addSky(scene, { earthRadius: 3, viewSky: true, viewConstellationLines: true });
        scene.skyRenderer.dispose = () => {
            throw new Error("renderer teardown failed");
        };

        expect(() => actions.disposeSky(scene)).toThrow("renderer teardown failed");
        expect(scene.skyTexture).toBeNull();
        expect(scene.skyConstellationTexture).toBeNull();
    });
});
