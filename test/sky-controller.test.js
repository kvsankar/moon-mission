import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

import { SkyController } from "../src/platform/js/rendering/SkyController.js";

const BASE_RADIUS = 6371;
const SKY_LAYER = 2;

let controllers = [];

afterEach(() => {
    for (const controller of controllers) {
        try {
            controller.dispose();
        } catch {
            // Already disposed by the test.
        }
    }
    controllers = [];
    vi.restoreAllMocks();
});

function makeController({ create = false, visible = true, textures = false } = {}) {
    const parent = new THREE.Group();
    const controller = new SkyController(parent, BASE_RADIUS);
    controllers.push(controller);
    const skyTexture = textures ? new THREE.Texture() : null;
    const constellationTexture = textures ? new THREE.Texture() : null;
    if (textures) controller.setTextures(skyTexture, constellationTexture);
    if (create) controller.create(visible);
    return { parent, controller, skyTexture, constellationTexture };
}

describe("construction", () => {
    it("sizes the celestial sphere well outside the mission volume", () => {
        const { controller } = makeController();

        expect(controller.radius).toBe(200 * BASE_RADIUS);
        expect(controller.container).toBeNull();
        expect(controller.isVisible()).toBe(false);
    });

    it("starts from the published sky defaults", () => {
        const { controller } = makeController();

        expect(controller.parameters.atmosphere_enabled).toBe(false);
        expect(controller.parameters.procedural_stars_enabled).toBe(true);
        expect(controller.parameters.planet_center_mode).toBe("earth");
        expect(controller.parameters.magnitude_limit).toBe(8);
        expect(controller.parameters.observer_lat).toBeCloseTo(28.6139, 6);
        expect(controller.parameters.observer_lon).toBeCloseTo(77.209, 6);
        expect(controller.viewSky).toBe(true);
        expect(controller.viewConstellationLines).toBe(false);
    });
});

describe("parameter clamping", () => {
    function patched(patch) {
        const { controller } = makeController();
        controller.setParameters(patch);
        return controller.parameters;
    }

    it("clamps every numeric control into its published range", () => {
        expect(patched({ bloom_strength: 99 }).bloom_strength).toBe(3);
        expect(patched({ bloom_strength: -1 }).bloom_strength).toBe(0);
        expect(patched({ star_size_scale: 99 }).star_size_scale).toBe(6);
        expect(patched({ star_size_scale: 0 }).star_size_scale).toBe(0.1);
        expect(patched({ star_intensity_scale: 99999 }).star_intensity_scale).toBe(4000);
        expect(patched({ star_intensity_scale: 0 }).star_intensity_scale).toBe(0.5);
        expect(patched({ magnitude_limit: 99 }).magnitude_limit).toBe(8);
        expect(patched({ magnitude_limit: -99 }).magnitude_limit).toBe(-3);
        expect(patched({ extinction_strength: 9 }).extinction_strength).toBe(1.2);
        expect(patched({ twinkle_strength: 9 }).twinkle_strength).toBe(2);
        expect(patched({ observer_lat: 95 }).observer_lat).toBe(89.9);
        expect(patched({ observer_lat: -95 }).observer_lat).toBe(-89.9);
        expect(patched({ observer_lon: 900 }).observer_lon).toBe(180);
        expect(patched({ observer_lon: -900 }).observer_lon).toBe(-180);
    });

    it("keeps the previous value when a control is sent a non-number", () => {
        const { controller } = makeController();
        controller.setParameters({ star_size_scale: 2 });

        controller.setParameters({ star_size_scale: "bigger" });

        expect(controller.parameters.star_size_scale).toBe(2);
    });

    it("leaves controls that are absent from the patch untouched", () => {
        const { controller } = makeController();
        const before = { ...controller.parameters };

        controller.setParameters({ bloom_strength: 1 });

        expect(controller.parameters.star_size_scale).toBe(before.star_size_scale);
        expect(controller.parameters.observer_lat).toBe(before.observer_lat);
    });

    it("ignores a patch that is not an object", () => {
        const { controller } = makeController();
        const before = { ...controller.parameters };

        controller.setParameters(null);
        controller.setParameters("atmosphere");

        expect(controller.parameters).toEqual(before);
    });

    it("reads the atmosphere switch from booleans and their string spellings", () => {
        expect(patched({ atmosphere_enabled: true }).atmosphere_enabled).toBe(true);
        expect(patched({ atmosphere_enabled: "true" }).atmosphere_enabled).toBe(true);
        expect(patched({ atmosphere_enabled: "false" }).atmosphere_enabled).toBe(false);
        expect(patched({ atmosphere_enabled: 1 }).atmosphere_enabled).toBe(false);
    });

    it("accepts only the two supported planet center modes", () => {
        expect(patched({ planet_center_mode: "moon" }).planet_center_mode).toBe("moon");
        expect(patched({ planetCenterMode: "moon" }).planet_center_mode).toBe("moon");
        expect(patched({ planet_center_mode: "mars" }).planet_center_mode).toBe("earth");
    });

    it("accepts the camelCase magnitude limit alias", () => {
        expect(patched({ magnitudeLimit: 4.5 }).magnitude_limit).toBe(4.5);
    });

    it("accepts every spelling of the sky clock", () => {
        expect(patched({ sky_time_ms: 1000 }).sky_time_ms).toBe(1000);
        expect(patched({ time: 2000 }).sky_time_ms).toBe(2000);
        expect(patched({ timeMs: 3000 }).sky_time_ms).toBe(3000);
        expect(patched({ timeSeconds: 4 }).sky_time_ms).toBe(4000);
    });

    it("cannot be talked out of procedural stars", () => {
        // Visibility is owned by the view-sky flag, not by this control.
        expect(patched({ procedural_stars_enabled: false }).procedural_stars_enabled).toBe(true);
    });
});

describe("scene construction", () => {
    it("mounts the star map, constellations, atmosphere, stars and planets", () => {
        const { parent, controller } = makeController({ create: true });

        expect(parent.children).toEqual([controller.container]);
        expect(controller.container.children).toContain(controller.skyMesh);
        expect(controller.container.children).toContain(controller.constellationMesh);
        expect(controller.container.children).toContain(controller.atmosphereMesh);
        expect(controller.starRenderer.object3D.parent).toBe(controller.container);
        expect(controller.planetRenderer).not.toBeNull();
    });

    it("puts every sky surface on the dedicated sky layer behind the scene", () => {
        const { controller } = makeController({ create: true });

        for (const mesh of [controller.skyMesh, controller.constellationMesh, controller.atmosphereMesh]) {
            expect(mesh.layers.mask).toBe(1 << SKY_LAYER);
            expect(mesh.castShadow).toBe(false);
            expect(mesh.receiveShadow).toBe(false);
        }
        expect(controller.skyMesh.renderOrder).toBe(-30);
        expect(controller.constellationMesh.renderOrder).toBe(-29);
        expect(controller.atmosphereMesh.renderOrder).toBe(-28);
    });

    it("shares one sphere geometry across all three sky shells", () => {
        const { controller } = makeController({ create: true });

        expect(controller.skyMesh.geometry).toBe(controller.geometry);
        expect(controller.constellationMesh.geometry).toBe(controller.geometry);
        expect(controller.atmosphereMesh.geometry).toBe(controller.geometry);
    });

    it("mirrors the container so the sky reads from the inside", () => {
        const { controller } = makeController({ create: true });

        expect(controller.container.scale.toArray()).toEqual([-1, 1, 1]);
    });

    it("renders the star map only once a texture is supplied", () => {
        const { controller: bare } = makeController({ create: true });
        expect(bare.skyMesh.material.opacity).toBe(0);
        expect(bare.constellationMesh.material.opacity).toBe(0);

        const { controller: dressed } = makeController({ create: true, textures: true });
        expect(dressed.skyMesh.material.opacity).toBeCloseTo(0.18, 6);
        expect(dressed.constellationMesh.material.opacity).toBeCloseTo(0.06, 6);
    });

    it("dims the star map and constellations once the atmosphere is lit", () => {
        const { controller } = makeController({ create: true, textures: true });

        controller.setParameters({ atmosphere_enabled: true });

        expect(controller.skyMesh.material.opacity).toBeCloseTo(0.18 * 0.58, 9);
        expect(controller.constellationMesh.material.opacity).toBeCloseTo(0.06 * 0.8, 9);
    });

    it("builds the procedural stars on the same sky radius and layer", () => {
        const { controller } = makeController({ create: true });

        expect(controller.starRenderer.radius).toBe(controller.radius);
        expect(controller.starRenderer.points.layers.mask).toBe(1 << SKY_LAYER);
    });
});

describe("parameter propagation to the star field", () => {
    it("boosts the procedural stars beyond the raw control values", () => {
        // The raw slider range is tuned for the textured star map; the
        // procedural point cloud needs a much larger photometric scale to
        // reach a comparable brightness.
        const { controller } = makeController({ create: true });

        controller.setParameters({ star_intensity_scale: 100, star_size_scale: 1 });

        expect(controller.starRenderer.uniforms.uPhotometricScale.value).toBeCloseTo(100 * 64, 6);
        expect(controller.starRenderer.uniforms.uStarSizeScale.value).toBeCloseTo(1.24, 6);
        expect(controller.starRenderer.uniforms.uMinPointSize.value).toBe(1.08);
        expect(controller.starRenderer.uniforms.uMaxPointSize.value).toBe(9.5);
    });

    it("holds the halo above a floor so faint stars keep a visible glow", () => {
        const { controller } = makeController({ create: true });

        controller.setParameters({ bloom_strength: 0 });

        expect(controller.starRenderer.uniforms.uHaloStrength.value)
            .toBeCloseTo(0.10 + (0.95 * 0.18), 9);
    });

    it("forwards the limiting magnitude, extinction and observer to the shader", () => {
        const { controller } = makeController({ create: true });

        controller.setParameters({
            magnitude_limit: 4.5,
            extinction_strength: 0.5,
            twinkle_strength: 0.75,
            observer_lat: 12,
            observer_lon: -34,
        });
        const { uniforms } = controller.starRenderer;

        expect(uniforms.uMagnitudeLimit.value).toBe(4.5);
        expect(uniforms.uExtinctionStrength.value).toBeCloseTo(0.5, 9);
        expect(uniforms.uTwinkleStrength.value).toBeCloseTo(0.75, 9);
        expect(uniforms.uObserverLat.value).toBeCloseTo((12 * Math.PI) / 180, 9);
        expect(uniforms.uObserverLon.value).toBeCloseTo((-34 * Math.PI) / 180, 9);
    });

    it("forwards the center mode and atmosphere switch to the planet renderer", () => {
        const { controller } = makeController({ create: true });

        controller.setParameters({ planet_center_mode: "moon", atmosphere_enabled: true });

        expect(controller.planetRenderer.centerMode).toBe("moon");
        expect(controller.planetRenderer.atmosphereEnabled).toBe(true);
    });

    it("applies parameters set before the scene is built once it is built", () => {
        const { controller } = makeController();

        controller.setParameters({ magnitude_limit: 3, planet_center_mode: "moon" });
        controller.create(true);

        expect(controller.starRenderer.uniforms.uMagnitudeLimit.value).toBe(3);
        expect(controller.planetRenderer.centerMode).toBe("moon");
    });
});

describe("the atmosphere shell", () => {
    it("stays switched off and hidden while the atmosphere is disabled", () => {
        const { controller } = makeController({ create: true });

        expect(controller.atmosphereMesh.material.uniforms.uEnabled.value).toBe(0);
        expect(controller.atmosphereMesh.visible).toBe(false);
    });

    it("lights up and becomes visible with the sky layer", () => {
        const { controller } = makeController({ create: true });

        controller.setParameters({ atmosphere_enabled: true });

        expect(controller.atmosphereMesh.material.uniforms.uEnabled.value).toBe(1);
        expect(controller.atmosphereMesh.visible).toBe(true);
    });

    it("stays hidden when the atmosphere is on but the sky layer is off", () => {
        const { controller } = makeController({ create: true });

        controller.setParameters({ atmosphere_enabled: true });
        controller.setLayerVisibility({ viewSky: false, viewConstellationLines: true });

        expect(controller.atmosphereMesh.visible).toBe(false);
    });

    it("thickens the haze with extinction and twinkle, up to a cap", () => {
        const { controller } = makeController({ create: true });

        controller.setParameters({ extinction_strength: 0, twinkle_strength: 0 });
        expect(controller.atmosphereMesh.material.uniforms.uHaze.value).toBeCloseTo(0.25, 9);

        controller.setParameters({ extinction_strength: 0.2, twinkle_strength: 0.4 });
        expect(controller.atmosphereMesh.material.uniforms.uHaze.value).toBeCloseTo(0.95, 9);

        controller.setParameters({ extinction_strength: 1.2, twinkle_strength: 2 });
        expect(controller.atmosphereMesh.material.uniforms.uHaze.value).toBe(1.35);
    });

    it("warms the gradient when the atmosphere is lit", () => {
        const { controller } = makeController({ create: true });
        const night = controller.atmosphereMesh.material.uniforms.uZenithColor.value.clone();

        controller.setParameters({ atmosphere_enabled: true });
        const twilight = controller.atmosphereMesh.material.uniforms.uZenithColor.value;

        expect(twilight.equals(night)).toBe(false);
    });
});

describe("visibility", () => {
    it("shows the sky layer and hides the constellations by default", () => {
        const { controller } = makeController({ create: true });

        expect(controller.isVisible()).toBe(true);
        expect(controller.skyMesh.visible).toBe(true);
        expect(controller.constellationMesh.visible).toBe(false);
        expect(controller.starRenderer.object3D.visible).toBe(true);
    });

    it("keeps the container mounted but dark when both layers are off", () => {
        const { parent, controller } = makeController({ create: true });

        controller.setLayerVisibility({ viewSky: false, viewConstellationLines: false });

        expect(parent.children).toEqual([controller.container]);
        expect(controller.container.visible).toBe(false);
        expect(controller.skyMesh.visible).toBe(false);
        expect(controller.starRenderer.object3D.visible).toBe(false);
    });

    it("keeps the container up for constellations alone", () => {
        const { controller } = makeController({ create: true });

        controller.setLayerVisibility({ viewSky: false, viewConstellationLines: true });

        expect(controller.container.visible).toBe(true);
        expect(controller.constellationMesh.visible).toBe(true);
        expect(controller.skyMesh.visible).toBe(false);
    });

    it("treats a missing layer flag as off", () => {
        const { controller } = makeController({ create: true });

        controller.setLayerVisibility();

        expect(controller.viewSky).toBe(false);
        expect(controller.viewConstellationLines).toBe(false);
    });

    it("lets the master switch override the layer flags", () => {
        const { controller } = makeController({ create: true });

        controller.setVisible(false);

        expect(controller.visible).toBe(false);
        expect(controller.skyMesh.visible).toBe(false);
        expect(controller.isVisible()).toBe(false);

        controller.setVisible("on");
        expect(controller.skyMesh.visible).toBe(true);
    });

    it("can be built hidden", () => {
        const { controller } = makeController({ create: true, visible: false });

        expect(controller.container.visible).toBe(false);
        expect(controller.starRenderer.object3D.visible).toBe(false);
    });

    it("tolerates visibility calls before the scene exists", () => {
        const { controller } = makeController();

        expect(() => {
            controller.setVisible(false);
            controller.setLayerVisibility({ viewSky: true });
        }).not.toThrow();
    });
});

describe("the sky clock", () => {
    it("drives both renderers from one stamp", () => {
        const { controller } = makeController({ create: true });
        const planetTime = vi.spyOn(controller.planetRenderer, "setTime");
        const when = Date.UTC(2026, 8, 18, 6, 0, 0);

        controller.setTime(when);

        expect(controller.parameters.sky_time_ms).toBe(when);
        expect(controller.starRenderer.uniforms.uTimeSeconds.value).toBeCloseTo(when / 1000, 6);
        expect(planetTime).toHaveBeenCalledWith(when, { force: true });
    });

    it("skips the forced planet recompute on a realtime animation frame", () => {
        const { controller } = makeController({ create: true });
        const planetTime = vi.spyOn(controller.planetRenderer, "setTime");

        controller.setTime(1000, { realtimeFrame: true });

        expect(planetTime).toHaveBeenCalledWith(1000, { force: false });
    });

    it("holds the last good stamp when handed something that is not a time", () => {
        const { controller } = makeController({ create: true });
        controller.setTime(5000);

        controller.setTime("noon");

        expect(controller.parameters.sky_time_ms).toBe(5000);
    });

    it("records the time even before the renderers exist", () => {
        const { controller } = makeController();

        controller.setTime(7000);

        expect(controller.parameters.sky_time_ms).toBe(7000);
    });
});

describe("textures", () => {
    it("swaps the live star map without rebuilding the scene", () => {
        const { controller } = makeController({ create: true, textures: true });
        const replacement = new THREE.Texture();
        const version = controller.skyMesh.material.version;

        controller.updateTextures(replacement, null);

        expect(controller.skyMesh.material.map).toBe(replacement);
        // `needsUpdate` is write-only on three materials; the recompile request
        // shows up as a version bump.
        expect(controller.skyMesh.material.version).toBeGreaterThan(version);
        expect(controller.constellationMesh.material.map).toBeNull();
    });

    it("accepts textures before the scene is built", () => {
        const { controller } = makeController();
        const texture = new THREE.Texture();

        controller.updateTextures(texture, null);
        controller.create(true);

        expect(controller.skyMesh.material.map).toBe(texture);
        expect(controller.skyMesh.material.opacity).toBeCloseTo(0.18, 6);
    });

    it("keeps a texture alive while another consumer still holds it", () => {
        const { controller } = makeController({ create: true, textures: true });
        const texture = controller.skyTexture;
        const disposed = vi.spyOn(texture, "dispose");

        controller.updateTextures(new THREE.Texture(), null, { disposePrevious: false });

        expect(disposed).not.toHaveBeenCalled();
    });
});

describe("per-frame updates", () => {
    it("pins the celestial sphere to the camera", () => {
        const { controller } = makeController({ create: true });
        const camera = new THREE.PerspectiveCamera();
        camera.position.set(1, 2, 3);
        camera.updateMatrixWorld(true);

        controller.updatePosition(camera);

        expect(controller.container.position.toArray()).toEqual([1, 2, 3]);
    });

    it("ignores a frame with no camera or no scene", () => {
        const { controller } = makeController({ create: true });

        controller.updatePosition(null);
        controller.updatePosition({});

        expect(controller.container.position.toArray()).toEqual([0, 0, 0]);
        expect(() => makeController().controller.updatePosition(new THREE.PerspectiveCamera()))
            .not.toThrow();
    });
});

describe("disposal", () => {
    it("tears down every mesh, renderer and texture reference", () => {
        const { parent, controller } = makeController({ create: true, textures: true });
        const geometry = controller.geometry;
        let geometryDisposed = false;
        geometry.addEventListener("dispose", () => { geometryDisposed = true; });

        controller.dispose();

        expect(geometryDisposed).toBe(true);
        expect(parent.children).toEqual([]);
        expect(controller.container).toBeNull();
        expect(controller.skyMesh).toBeNull();
        expect(controller.constellationMesh).toBeNull();
        expect(controller.atmosphereMesh).toBeNull();
        expect(controller.geometry).toBeNull();
        expect(controller.starRenderer).toBeNull();
        expect(controller.planetRenderer).toBeNull();
        expect(controller.skyTexture).toBeNull();
        expect(controller.constellationTexture).toBeNull();
    });

    it("is safe before the scene is built and after it is torn down", () => {
        const { controller } = makeController();

        expect(() => controller.dispose()).not.toThrow();

        controller.create(true);
        controller.dispose();
        expect(() => controller.dispose()).not.toThrow();
    });

    it("releases the textures even when a renderer throws on the way down", () => {
        const { controller } = makeController({ create: true, textures: true });
        vi.spyOn(controller.starRenderer, "dispose").mockImplementation(() => {
            throw new Error("gpu lost");
        });

        expect(() => controller.dispose()).toThrow("gpu lost");
        expect(controller.skyTexture).toBeNull();
    });
});
