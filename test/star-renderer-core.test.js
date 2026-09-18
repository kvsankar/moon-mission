import { describe, expect, it } from "vitest";
import * as THREE from "three";

import {
    StarRenderer,
    bvToLinearRgb,
    isStarVisibleForMagnitudeLimit,
} from "../src/platform/js/rendering/StarRenderer.js";
import {
    degreesToRadians,
    localSiderealRadians,
    raDecToEquatorialUnitVector,
    stableUnitHash,
} from "../src/platform/js/rendering/sky-math.js";

const CATALOG = [
    { id: "HIP-1", name: "Alpha", raDeg: 0, decDeg: 0, vmag: 1.2, bv: 0.0 },
    { id: "HIP-2", name: "Beta", raDeg: 90, decDeg: 45, vmag: -5, bv: 1.5 },
    { name: "Gamma", raDeg: 180, decDeg: -30, vmag: 12 },
    { raDeg: 270, decDeg: 80, vmag: 4.5, bv: "not a number" },
];

function makeRenderer(options = {}) {
    const parent = new THREE.Group();
    const renderer = new StarRenderer(parent, { catalog: CATALOG, ...options });
    return { parent, renderer };
}

function relativeLuminance([r, g, b]) {
    return (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
}

describe("stellar color from the B-V index", () => {
    it("normalizes every star to the same photometric luminance", () => {
        // Brightness is owned by the magnitude attribute, so the color term
        // must not make blue stars look dimmer than red ones.
        for (const bv of [-0.4, -0.2, 0, 0.65, 1.2, 2.0]) {
            expect(relativeLuminance(bvToLinearRgb(bv))).toBeCloseTo(1, 9);
        }
    });

    it("tints hot stars blue and cool stars red", () => {
        const [hotR, , hotB] = bvToLinearRgb(-0.3);
        const [coolR, , coolB] = bvToLinearRgb(1.8);

        expect(hotB).toBeGreaterThan(hotR);
        expect(coolR).toBeGreaterThan(coolB);
        expect(coolR).toBeGreaterThan(hotR);
        expect(hotB).toBeGreaterThan(coolB);
    });

    it("clamps the color index to the range the temperature fit is valid over", () => {
        expect(bvToLinearRgb(-9)).toEqual(bvToLinearRgb(-0.4));
        expect(bvToLinearRgb(99)).toEqual(bvToLinearRgb(2.0));
    });

    it("accepts a numeric string color index", () => {
        expect(bvToLinearRgb("0.65")).toEqual(bvToLinearRgb(0.65));
    });
});

describe("limiting magnitude", () => {
    it("keeps stars at or brighter than the limit", () => {
        expect(isStarVisibleForMagnitudeLimit(2.5, 6)).toBe(true);
        expect(isStarVisibleForMagnitudeLimit(6, 6)).toBe(true);
        expect(isStarVisibleForMagnitudeLimit(6.5, 6)).toBe(false);
    });

    it("tolerates a star exactly on the limit after float rounding", () => {
        expect(isStarVisibleForMagnitudeLimit(6.00005, 6)).toBe(true);
    });

    it("coerces numeric strings on both sides", () => {
        expect(isStarVisibleForMagnitudeLimit("2.5", "6")).toBe(true);
    });

    it("rejects a comparison that is not fully numeric", () => {
        expect(isStarVisibleForMagnitudeLimit(Number.NaN, 6)).toBe(false);
        expect(isStarVisibleForMagnitudeLimit(2.5, "bright")).toBe(false);
        expect(isStarVisibleForMagnitudeLimit(undefined, undefined)).toBe(false);
    });
});

describe("uniform defaults", () => {
    it("starts from the naked-eye defaults", () => {
        const { renderer } = makeRenderer();
        const { uniforms } = renderer;

        expect(renderer.radius).toBe(1300000);
        expect(renderer.layer).toBe(2);
        expect(uniforms.uBaseSize.value).toBe(2.8);
        expect(uniforms.uStarSizeScale.value).toBe(1.0);
        expect(uniforms.uMinPointSize.value).toBe(1.25);
        expect(uniforms.uMaxPointSize.value).toBe(7.2);
        expect(uniforms.uSkyRadius.value).toBe(1300000);
        expect(uniforms.uMagnitudeLimit.value).toBe(8.0);
        expect(uniforms.uAtmosphereEnabled.value).toBe(0);
        expect(uniforms.uExtinctionStrength.value).toBe(0.2);
        expect(uniforms.uTwinkleStrength.value).toBe(1.0);
        expect(uniforms.uHaloStrength.value).toBe(0.2);
    });

    it("adopts every supplied option", () => {
        const { renderer } = makeRenderer({
            radius: 99,
            layer: 5,
            baseSize: 3.5,
            starSizeScale: 2,
            minPointSize: 0.5,
            maxPointSize: 20,
            magnitudeLimit: 4,
            atmosphereEnabled: true,
            extinctionStrength: 0.9,
            twinkleStrength: 0.1,
            haloStrength: 0.7,
        });
        const { uniforms } = renderer;

        expect(renderer.radius).toBe(99);
        expect(renderer.layer).toBe(5);
        expect(uniforms.uBaseSize.value).toBe(3.5);
        expect(uniforms.uStarSizeScale.value).toBe(2);
        expect(uniforms.uMinPointSize.value).toBe(0.5);
        expect(uniforms.uMaxPointSize.value).toBe(20);
        expect(uniforms.uSkyRadius.value).toBe(99);
        expect(uniforms.uMagnitudeLimit.value).toBe(4);
        expect(uniforms.uAtmosphereEnabled.value).toBe(1);
        expect(uniforms.uExtinctionStrength.value).toBe(0.9);
        expect(uniforms.uTwinkleStrength.value).toBe(0.1);
        expect(uniforms.uHaloStrength.value).toBe(0.7);
    });

    it("ignores options that are not finite numbers", () => {
        const { renderer } = makeRenderer({ radius: "far", layer: null, baseSize: Number.NaN });

        expect(renderer.radius).toBe(1300000);
        expect(renderer.layer).toBe(2);
        expect(renderer.uniforms.uBaseSize.value).toBe(2.8);
    });

    it("falls back to the bundled bright-star catalog", () => {
        const renderer = new StarRenderer(new THREE.Group(), { catalog: "everything" });

        expect(Array.isArray(renderer.catalog)).toBe(true);
        expect(renderer.catalog.length).toBeGreaterThan(100);
    });
});

describe("scene construction", () => {
    it("mounts one point cloud on the configured layer", () => {
        const { parent, renderer } = makeRenderer({ layer: 4 });

        renderer.create();

        expect(parent.children).toEqual([renderer.container]);
        expect(renderer.container.children).toEqual([renderer.points]);
        expect(renderer.container.visible).toBe(true);
        expect(renderer.points.frustumCulled).toBe(false);
        expect(renderer.points.renderOrder).toBe(-24);
        expect(renderer.points.layers.mask).toBe(1 << 4);
        expect(renderer.object3D).toBe(renderer.container);
    });

    it("can be built hidden", () => {
        const { renderer } = makeRenderer();

        renderer.create(false);

        expect(renderer.container.visible).toBe(false);
    });

    it("reuses the existing cloud and only retoggles visibility", () => {
        const { parent, renderer } = makeRenderer();

        renderer.create(true);
        const firstGeometry = renderer.geometry;
        renderer.create(false);

        expect(renderer.geometry).toBe(firstGeometry);
        expect(parent.children).toHaveLength(1);
        expect(renderer.container.visible).toBe(false);
    });

    it("places each star on the sky sphere along its equatorial direction", () => {
        const { renderer } = makeRenderer({ radius: 10 });

        renderer.create();
        const positions = renderer.geometry.getAttribute("position");
        const directions = renderer.geometry.getAttribute("aDirection");
        const expected = raDecToEquatorialUnitVector(90, 45);

        expect(positions.count).toBe(CATALOG.length);
        expect(directions.getX(1)).toBeCloseTo(expected.x, 6);
        expect(directions.getY(1)).toBeCloseTo(expected.y, 6);
        expect(directions.getZ(1)).toBeCloseTo(expected.z, 6);
        expect(positions.getX(1)).toBeCloseTo(expected.x * 10, 5);
        expect(positions.getY(1)).toBeCloseTo(expected.y * 10, 5);
        expect(positions.getZ(1)).toBeCloseTo(expected.z * 10, 5);
    });

    it("clamps catalog magnitudes into the shader range", () => {
        const { renderer } = makeRenderer();

        renderer.create();
        const magnitudes = renderer.geometry.getAttribute("aMagnitude");

        expect(magnitudes.getX(0)).toBeCloseTo(1.2, 6);
        expect(magnitudes.getX(1)).toBe(-3);
        expect(magnitudes.getX(2)).toBe(8);
    });

    it("substitutes a sun-like color index when the catalog omits one", () => {
        const { renderer } = makeRenderer();

        renderer.create();
        const bvs = renderer.geometry.getAttribute("aBv");
        const colors = renderer.geometry.getAttribute("aColor");
        const expected = bvToLinearRgb(0.65);

        expect(bvs.getX(2)).toBeCloseTo(0.65, 6);
        expect(bvs.getX(3)).toBeCloseTo(0.65, 6);
        expect(colors.getX(2)).toBeCloseTo(expected[0], 5);
        expect(colors.getY(2)).toBeCloseTo(expected[1], 5);
        expect(colors.getZ(2)).toBeCloseTo(expected[2], 5);
    });

    it("seeds the twinkle hash from the id, then the name, then the row number", () => {
        // A stable per-star seed is what keeps twinkling from re-rolling every
        // time the catalog is rebuilt.
        const { renderer } = makeRenderer();

        renderer.create();
        const hashes = renderer.geometry.getAttribute("aIdHash");

        expect(hashes.getX(0)).toBeCloseTo(stableUnitHash("HIP-1"), 6);
        expect(hashes.getX(2)).toBeCloseTo(stableUnitHash("Gamma"), 6);
        expect(hashes.getX(3)).toBeCloseTo(stableUnitHash("4"), 6);
    });

    it("computes a bounding sphere that encloses the sky radius", () => {
        const { renderer } = makeRenderer({ radius: 10 });

        renderer.create();

        expect(renderer.geometry.boundingSphere.radius).toBeGreaterThan(9.9);
    });

    it("builds an additive, depth-write-free material bound to the live uniforms", () => {
        const { renderer } = makeRenderer();

        renderer.create();

        expect(renderer.material.transparent).toBe(true);
        expect(renderer.material.blending).toBe(THREE.AdditiveBlending);
        expect(renderer.material.depthWrite).toBe(false);
        expect(renderer.material.toneMapped).toBe(false);
        expect(renderer.material.uniforms).toBe(renderer.uniforms);
    });

    it("survives an empty catalog", () => {
        const parent = new THREE.Group();
        const renderer = new StarRenderer(parent, { catalog: [] });

        renderer.create();

        expect(renderer.geometry.getAttribute("position").count).toBe(0);
    });
});

describe("per-frame updates", () => {
    it("pins the sky sphere to the camera so the stars stay at infinity", () => {
        const { renderer } = makeRenderer();
        renderer.create();
        const camera = new THREE.PerspectiveCamera();
        camera.position.set(7, -3, 11);
        camera.updateMatrixWorld(true);

        renderer.updatePosition(camera);

        expect(renderer.container.position.toArray()).toEqual([7, -3, 11]);
    });

    it("ignores a frame with no camera or no cloud", () => {
        const { renderer } = makeRenderer();

        expect(() => renderer.updatePosition(new THREE.PerspectiveCamera())).not.toThrow();

        renderer.create();
        renderer.updatePosition(null);
        expect(renderer.container.position.toArray()).toEqual([0, 0, 0]);
    });

    it("toggles visibility only once the cloud exists", () => {
        const { renderer } = makeRenderer();

        renderer.setVisible(true);
        expect(renderer.container).toBeNull();

        renderer.create(false);
        renderer.setVisible("yes");
        expect(renderer.container.visible).toBe(true);
    });

    it("scales the point sprite with the viewport but never below the floor", () => {
        const { renderer } = makeRenderer();

        renderer.setViewportHeight(1080);
        expect(renderer.uniforms.uPointScale.value).toBe(540);

        renderer.setViewportHeight(100);
        expect(renderer.uniforms.uPointScale.value).toBe(120);

        renderer.setViewportHeight(Number.NaN);
        expect(renderer.uniforms.uPointScale.value).toBe(120);
    });
});

describe("observer and time", () => {
    it("stores the observer in radians for the shader", () => {
        const { renderer } = makeRenderer();

        renderer.setObserver(45, -75);

        expect(renderer.observerLatitudeRad).toBeCloseTo(degreesToRadians(45), 12);
        expect(renderer.observerLongitudeRad).toBeCloseTo(degreesToRadians(-75), 12);
        expect(renderer.uniforms.uObserverLat.value).toBe(renderer.observerLatitudeRad);
        expect(renderer.uniforms.uObserverLon.value).toBe(renderer.observerLongitudeRad);
    });

    it("derives the sidereal angle at the observer longitude", () => {
        const { renderer } = makeRenderer();
        const when = Date.UTC(2026, 8, 18, 3, 30, 0);

        renderer.setObserver(0, -75);
        renderer.setSiderealTimeFromDate(when);

        expect(renderer.uniforms.uSiderealAngle.value)
            .toBeCloseTo(localSiderealRadians(when, degreesToRadians(-75)), 12);
    });

    it("sets both clocks from a single wall-clock stamp", () => {
        const { renderer } = makeRenderer();
        const when = Date.UTC(2026, 8, 18, 3, 30, 0);

        renderer.setObserver(0, 0);
        renderer.setTime(when);

        expect(renderer.uniforms.uTimeSeconds.value).toBeCloseTo(when / 1000, 6);
        expect(renderer.uniforms.uSiderealAngle.value)
            .toBeCloseTo(localSiderealRadians(when, 0), 12);
    });

    it("leaves the clocks alone for a stamp that is not a number", () => {
        const { renderer } = makeRenderer();
        renderer.setTime(1000);
        const seconds = renderer.uniforms.uTimeSeconds.value;

        renderer.setTime("later");

        expect(renderer.uniforms.uTimeSeconds.value).toBe(seconds);
    });

    it("zeroes a sidereal angle or elapsed time that is not a number", () => {
        const { renderer } = makeRenderer();

        renderer.setSiderealAngle(1.25);
        expect(renderer.uniforms.uSiderealAngle.value).toBe(1.25);

        renderer.setSiderealAngle("spin");
        expect(renderer.uniforms.uSiderealAngle.value).toBe(0);

        renderer.setTimeSeconds("now");
        expect(renderer.uniforms.uTimeSeconds.value).toBe(0);
    });

    it("switches atmospheric extinction and twinkle on and off", () => {
        const { renderer } = makeRenderer();

        renderer.setAtmosphereEnabled(true);
        expect(renderer.uniforms.uAtmosphereEnabled.value).toBe(1);

        renderer.setAtmosphereEnabled(false);
        expect(renderer.uniforms.uAtmosphereEnabled.value).toBe(0);
    });
});

describe("runtime parameter patches", () => {
    it("applies every supported uniform", () => {
        const { renderer } = makeRenderer();

        renderer.setParams({
            baseSize: 4,
            starSizeScale: 1.5,
            extinctionStrength: 0.3,
            twinkleStrength: 0.4,
            haloStrength: 0.5,
            twinkleRate: 2,
            minPointSize: 1,
            maxPointSize: 9,
            photometricScale: 100,
            magnitudeLimit: 5,
        });
        const { uniforms } = renderer;

        expect(uniforms.uBaseSize.value).toBe(4);
        expect(uniforms.uStarSizeScale.value).toBe(1.5);
        expect(uniforms.uExtinctionStrength.value).toBe(0.3);
        expect(uniforms.uTwinkleStrength.value).toBe(0.4);
        expect(uniforms.uHaloStrength.value).toBe(0.5);
        expect(uniforms.uTwinkleRate.value).toBe(2);
        expect(uniforms.uMinPointSize.value).toBe(1);
        expect(uniforms.uMaxPointSize.value).toBe(9);
        expect(uniforms.uPhotometricScale.value).toBe(100);
        expect(uniforms.uMagnitudeLimit.value).toBe(5);
    });

    it("clamps a limiting magnitude to the catalog range", () => {
        const { renderer } = makeRenderer();

        renderer.setParams({ magnitudeLimit: 99 });
        expect(renderer.uniforms.uMagnitudeLimit.value).toBe(8);

        renderer.setParams({ magnitudeLimit: -99 });
        expect(renderer.uniforms.uMagnitudeLimit.value).toBe(-3);
    });

    it("leaves unmentioned and non-numeric keys untouched", () => {
        const { renderer } = makeRenderer();
        const before = { ...renderer.uniforms };

        renderer.setParams({ baseSize: "big", magnitudeLimit: undefined });
        renderer.setParams();

        expect(renderer.uniforms.uBaseSize.value).toBe(before.uBaseSize.value);
        expect(renderer.uniforms.uMagnitudeLimit.value).toBe(8);
    });
});

describe("legacy snake_case patches", () => {
    it("maps the persisted control names onto the uniforms", () => {
        const { renderer } = makeRenderer();

        renderer.setParameters({
            observer_lat: 12,
            observer_lon: -34,
            atmosphere_enabled: true,
            star_size_scale: 2.5,
            extinction_strength: 0.45,
            twinkle_strength: 0.65,
            star_intensity_scale: 120,
            magnitude_limit: 5.5,
        });
        const { uniforms } = renderer;

        expect(renderer.observerLatitudeRad).toBeCloseTo(degreesToRadians(12), 12);
        expect(renderer.observerLongitudeRad).toBeCloseTo(degreesToRadians(-34), 12);
        expect(uniforms.uAtmosphereEnabled.value).toBe(1);
        expect(uniforms.uStarSizeScale.value).toBe(2.5);
        expect(uniforms.uExtinctionStrength.value).toBe(0.45);
        expect(uniforms.uTwinkleStrength.value).toBe(0.65);
        expect(uniforms.uPhotometricScale.value).toBe(120);
        expect(uniforms.uMagnitudeLimit.value).toBe(5.5);
    });

    it("accepts the camelCase spelling of the same controls", () => {
        const { renderer } = makeRenderer();

        renderer.setParameters({
            observerLat: 12,
            observerLon: -34,
            atmosphereEnabled: true,
            starSizeScale: 2.5,
            extinctionStrength: 0.45,
            twinkleStrength: 0.65,
            starIntensityScale: 120,
            magnitudeLimit: 5.5,
        });
        const { uniforms } = renderer;

        expect(renderer.observerLatitudeRad).toBeCloseTo(degreesToRadians(12), 12);
        expect(uniforms.uAtmosphereEnabled.value).toBe(1);
        expect(uniforms.uStarSizeScale.value).toBe(2.5);
        expect(uniforms.uPhotometricScale.value).toBe(120);
        expect(uniforms.uMagnitudeLimit.value).toBe(5.5);
    });

    it("prefers the snake_case spelling when both are present", () => {
        const { renderer } = makeRenderer();

        renderer.setParameters({ star_size_scale: 3, starSizeScale: 9 });

        expect(renderer.uniforms.uStarSizeScale.value).toBe(3);
    });

    it("keeps the other half of the observer when only one axis is patched", () => {
        const { renderer } = makeRenderer();
        renderer.setObserver(10, 20);

        renderer.setParameters({ observer_lat: 30 });

        expect(renderer.observerLatitudeRad).toBeCloseTo(degreesToRadians(30), 10);
        expect(renderer.observerLongitudeRad).toBeCloseTo(degreesToRadians(20), 10);
    });

    it("leaves the observer alone when the patch carries no location", () => {
        const { renderer } = makeRenderer();
        renderer.setObserver(10, 20);

        renderer.setParameters({ star_size_scale: 2 });

        expect(renderer.observerLatitudeRad).toBeCloseTo(degreesToRadians(10), 12);
        expect(renderer.observerLongitudeRad).toBeCloseTo(degreesToRadians(20), 12);
    });

    it("translates the bloom control into a halo strength", () => {
        const { renderer } = makeRenderer();

        renderer.setParameters({ bloom_strength: 0 });
        expect(renderer.uniforms.uHaloStrength.value).toBeCloseTo(0.1, 12);

        renderer.setParameters({ bloom_strength: 1 });
        expect(renderer.uniforms.uHaloStrength.value).toBeCloseTo(0.28, 12);
    });

    it("only reads a boolean atmosphere switch", () => {
        const { renderer } = makeRenderer({ atmosphereEnabled: true });

        renderer.setParameters({ atmosphere_enabled: "no" });

        expect(renderer.uniforms.uAtmosphereEnabled.value).toBe(1);
    });

    it("tolerates an empty patch", () => {
        const { renderer } = makeRenderer();

        expect(() => renderer.setParameters()).not.toThrow();
        expect(renderer.uniforms.uStarSizeScale.value).toBe(1);
    });

    it("routes the legacy setConfig alias through the same path", () => {
        const { renderer } = makeRenderer();

        renderer.setConfig({ star_size_scale: 4 });

        expect(renderer.uniforms.uStarSizeScale.value).toBe(4);
    });
});

describe("disposal", () => {
    it("releases the GPU resources and detaches from the scene", () => {
        const { parent, renderer } = makeRenderer();
        renderer.create();
        const geometry = renderer.geometry;
        const material = renderer.material;
        let disposedGeometry = false;
        let disposedMaterial = false;
        geometry.addEventListener("dispose", () => { disposedGeometry = true; });
        material.addEventListener("dispose", () => { disposedMaterial = true; });

        renderer.dispose();

        expect(disposedGeometry).toBe(true);
        expect(disposedMaterial).toBe(true);
        expect(parent.children).toEqual([]);
        expect(renderer.container).toBeNull();
        expect(renderer.points).toBeNull();
        expect(renderer.geometry).toBeNull();
        expect(renderer.material).toBeNull();
        expect(renderer.object3D).toBeNull();
    });

    it("is a no-op before the cloud is built and after it is torn down", () => {
        const { renderer } = makeRenderer();

        expect(() => renderer.dispose()).not.toThrow();

        renderer.create();
        renderer.dispose();
        expect(() => renderer.dispose()).not.toThrow();
    });

    it("can be rebuilt after disposal", () => {
        const { parent, renderer } = makeRenderer();

        renderer.create();
        renderer.dispose();
        renderer.create();

        expect(parent.children).toEqual([renderer.container]);
        expect(renderer.geometry.getAttribute("position").count).toBe(CATALOG.length);
    });
});
