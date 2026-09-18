import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as AstronomyEngine from "astronomy-engine";
import * as THREE from "three";

import { LightManager } from "../src/platform/js/rendering/light-manager.js";
import { PlanetRenderer } from "../src/platform/js/rendering/PlanetRenderer.js";
import { LIGHT_SETTINGS as LT } from "../src/platform/js/core/constants.js";

describe("LightManager", () => {
    let parent = null;
    let lights = null;

    beforeEach(() => {
        parent = new THREE.Group();
        lights = new LightManager(parent);
    });

    afterEach(() => {
        lights?.dispose();
        lights = null;
        parent = null;
    });

    it("starts with nothing attached", () => {
        expect(lights.primaryLight).toBeNull();
        expect(lights.ambientLights).toEqual([]);
        expect(parent.children).toEqual([]);
    });

    it("creates one shadow-casting primary light and its target", () => {
        lights.create();

        expect(lights.primaryLight.castShadow).toBe(true);
        expect(lights.primaryLight.shadow.mapSize.width).toBe(LT.SHADOW_MAP_SIZE);
        expect(lights.primaryLight.shadow.camera.far).toBe(LT.SHADOW_FAR);
        expect(parent.children).toContain(lights.primaryLight);
        expect(parent.children).toContain(lights.primaryLight.target);
    });

    it("uses a symmetric shadow frustum", () => {
        lights.create();

        const { camera } = lights.primaryLight.shadow;
        expect(camera.right).toBe(-camera.left);
        expect(camera.top).toBe(-camera.bottom);
    });

    it("confines each reflected-light fill to its own body layer", () => {
        lights.create();

        expect(lights.earthshineLight.layers.isEnabled(LT.MOON_REFLECTED_LIGHT_LAYER)).toBe(true);
        expect(lights.earthshineLight.layers.isEnabled(LT.EARTH_REFLECTED_LIGHT_LAYER)).toBe(false);
        expect(lights.moonshineLight.layers.isEnabled(LT.EARTH_REFLECTED_LIGHT_LAYER)).toBe(true);
    });

    it("puts the craft lights on the craft layer only", () => {
        lights.create();

        expect(lights.craftLight.layers.isEnabled(1)).toBe(true);
        expect(lights.craftLight.layers.isEnabled(0)).toBe(false);
        expect(lights.craftAmbientLight.layers.isEnabled(1)).toBe(true);
    });

    it("keeps the body ambient light on the default layer", () => {
        lights.create();

        expect(lights.bodyAmbientLight.layers.isEnabled(0)).toBe(true);
        expect(lights.ambientLights).toEqual([lights.bodyAmbientLight, lights.craftAmbientLight]);
    });

    it("attaches every light to the parent container", () => {
        lights.create();

        for (const light of [
            lights.primaryLight,
            lights.earthshineLight,
            lights.moonshineLight,
            lights.craftLight,
            lights.bodyAmbientLight,
            lights.craftAmbientLight,
        ]) {
            expect(parent.children).toContain(light);
        }
    });

    it("detaches and disposes every light", () => {
        lights.create();
        const created = [
            lights.primaryLight,
            lights.earthshineLight,
            lights.moonshineLight,
            lights.craftLight,
            ...lights.ambientLights,
        ];
        const spies = created.map((light) => vi.spyOn(light, "dispose"));

        lights.dispose();

        expect(spies.every((spy) => spy.mock.calls.length > 0)).toBe(true);
        expect(parent.children).toEqual([]);
        expect(lights.primaryLight).toBeNull();
        expect(lights.craftAmbientLight).toBeNull();
        expect(lights.ambientLights).toEqual([]);
    });

    it("is safe to dispose before creating", () => {
        expect(() => lights.dispose()).not.toThrow();
    });
});

describe("PlanetRenderer", () => {
    const EARTH_SLOT_COUNT = 9;
    let parent = null;
    let renderer = null;
    let previousAstronomy = null;

    beforeEach(() => {
        parent = new THREE.Group();
        previousAstronomy = globalThis.Astronomy;
        globalThis.Astronomy = AstronomyEngine;
    });

    afterEach(() => {
        renderer?.dispose();
        renderer = null;
        parent = null;
        if (previousAstronomy === undefined) delete globalThis.Astronomy;
        else globalThis.Astronomy = previousAstronomy;
    });

    function attribute(name) {
        return renderer.geometry.getAttribute(name);
    }

    it("defaults to an Earth-centred sky on layer two", () => {
        renderer = new PlanetRenderer(parent, { radius: 100 });

        expect(renderer.centerMode).toBe("earth");
        expect(renderer.layer).toBe(2);
        expect(renderer.radius).toBe(100);
    });

    it("falls back to sane defaults for bad options", () => {
        renderer = new PlanetRenderer(parent, { radius: Number.NaN, layer: "two" });

        expect(renderer.radius).toBe(1);
        expect(renderer.layer).toBe(2);
    });

    it("builds one point slot per catalogued body", () => {
        renderer = new PlanetRenderer(parent, { radius: 100 });

        renderer.create();

        expect(attribute("position").count).toBe(EARTH_SLOT_COUNT);
        expect(renderer.points.frustumCulled).toBe(false);
        expect(renderer.points.layers.isEnabled(2)).toBe(true);
        expect(parent.children).toContain(renderer.points);
    });

    it("only builds once", () => {
        renderer = new PlanetRenderer(parent, { radius: 100 });
        renderer.create();
        const points = renderer.points;

        renderer.create(false);

        expect(renderer.points).toBe(points);
        expect(points.visible).toBe(false);
    });

    it("gives the markers a bounding sphere so they are never culled away", () => {
        renderer = new PlanetRenderer(parent, { radius: 100 });

        renderer.create();

        expect(renderer.geometry.boundingSphere.radius).toBeCloseTo(101, 6);
    });

    it("keeps every marker inside the sky shell", () => {
        renderer = new PlanetRenderer(parent, { radius: 100 });

        renderer.create();
        renderer.setTime(Date.UTC(2026, 3, 6), { force: true });

        const position = attribute("position");
        for (let index = 0; index < position.count; index += 1) {
            const length = Math.hypot(
                position.getX(index),
                position.getY(index),
                position.getZ(index),
            );
            expect(length).toBeLessThanOrEqual(100);
            expect(length).toBeGreaterThan(0);
        }
    });

    it("makes every catalogued marker visible with a real ephemeris", () => {
        renderer = new PlanetRenderer(parent, { radius: 100 });

        renderer.create();
        renderer.setTime(Date.UTC(2026, 3, 6), { force: true });

        const alphas = attribute("aAlpha");
        for (let index = 0; index < alphas.count; index += 1) {
            expect(alphas.getX(index)).toBe(1);
        }
    });

    it("gives each body its authored colour and size", () => {
        renderer = new PlanetRenderer(parent, { radius: 100 });

        renderer.create();

        const sizes = attribute("aSize");
        for (let index = 0; index < sizes.count; index += 1) {
            expect(sizes.getX(index)).toBeGreaterThan(0);
        }
        // The Sun is the largest marker in the catalogue.
        const sunIndex = renderer.bodySlots.indexOf("Sun");
        const maxSize = Math.max(...Array.from({ length: sizes.count }, (_, i) => sizes.getX(i)));
        expect(sizes.getX(sunIndex)).toBe(maxSize);
    });

    it("swaps the catalogue when the sky is recentred on the Moon", () => {
        renderer = new PlanetRenderer(parent, { radius: 100 });
        renderer.create();
        expect(renderer.bodySlots).toContain("Moon");

        renderer.setCenterMode("moon");

        expect(renderer.bodySlots).toContain("Earth");
        expect(renderer.bodySlots).not.toContain("Moon");
    });

    it("ignores an unchanged or unknown centre mode", () => {
        renderer = new PlanetRenderer(parent, { radius: 100 });
        renderer.create();
        const slots = [...renderer.bodySlots];

        renderer.setCenterMode("earth");
        renderer.setCenterMode("somewhere-else");

        expect(renderer.bodySlots).toEqual(slots);
        expect(renderer.centerMode).toBe("earth");
    });

    it("hides and shows the marker layer", () => {
        renderer = new PlanetRenderer(parent, { radius: 100 });
        renderer.create();

        renderer.setVisible(false);
        expect(renderer.points.visible).toBe(false);

        renderer.setVisible(true);
        expect(renderer.points.visible).toBe(true);
    });

    it("remembers the requested visibility before creation", () => {
        renderer = new PlanetRenderer(parent, { radius: 100 });

        renderer.setVisible(false);
        renderer.create(true);

        expect(renderer.points.visible).toBe(true);
    });

    it("publishes the atmosphere flag to the shader", () => {
        renderer = new PlanetRenderer(parent, { radius: 100, atmosphereEnabled: true });
        renderer.create();
        expect(renderer.material.uniforms.uAtmosphereEnabled.value).toBe(1);

        renderer.setAtmosphereEnabled(false);
        expect(renderer.material.uniforms.uAtmosphereEnabled.value).toBe(0);
    });

    it("tolerates an atmosphere change before creation", () => {
        renderer = new PlanetRenderer(parent, { radius: 100 });

        expect(() => renderer.setAtmosphereEnabled(true)).not.toThrow();
        expect(renderer.atmosphereEnabled).toBe(true);
    });

    it("throttles repeated updates at the same mission time", () => {
        renderer = new PlanetRenderer(parent, { radius: 100 });
        renderer.create();
        renderer.setTime(Date.UTC(2026, 3, 6), { force: true });
        const firstX = attribute("position").getX(0);

        renderer.setTime(Date.UTC(2026, 3, 6) + 1000);

        expect(attribute("position").getX(0)).toBe(firstX);
        expect(renderer.timeMs).toBe(Date.UTC(2026, 3, 6) + 1000);
    });

    it("refreshes after a large mission-time jump", () => {
        renderer = new PlanetRenderer(parent, { radius: 100 });
        renderer.create();
        renderer.setTime(Date.UTC(2026, 3, 6), { force: true });
        const firstX = attribute("position").getX(0);

        renderer.setTime(Date.UTC(2026, 6, 6));

        expect(attribute("position").getX(0)).not.toBe(firstX);
    });

    it("keeps its last time for a non-finite request", () => {
        renderer = new PlanetRenderer(parent, { radius: 100 });
        renderer.create();
        renderer.setTime(Date.UTC(2026, 3, 6), { force: true });

        renderer.setTime(Number.NaN, { force: true });

        expect(renderer.timeMs).toBe(Date.UTC(2026, 3, 6));
    });

    it("hides every marker when no ephemeris engine is available", () => {
        delete globalThis.Astronomy;
        renderer = new PlanetRenderer(parent, { radius: 100 });

        renderer.create();

        const alphas = attribute("aAlpha");
        const sizes = attribute("aSize");
        for (let index = 0; index < alphas.count; index += 1) {
            expect(alphas.getX(index)).toBe(0);
            expect(sizes.getX(index)).toBe(0);
        }
    });

    it("hides every marker when the Moon position cannot be resolved", () => {
        globalThis.Astronomy = {
            Body: AstronomyEngine.Body,
            GeoVector: () => {
                throw new Error("ephemeris unavailable");
            },
        };
        renderer = new PlanetRenderer(parent, { radius: 100, centerMode: "moon" });

        renderer.create();

        const alphas = attribute("aAlpha");
        for (let index = 0; index < alphas.count; index += 1) {
            expect(alphas.getX(index)).toBe(0);
        }
    });

    it("places Earth opposite the Moon's geocentric direction in the lunar sky", () => {
        renderer = new PlanetRenderer(parent, { radius: 100, centerMode: "moon" });
        renderer.create();
        renderer.setTime(Date.UTC(2026, 3, 6), { force: true });

        const earthIndex = renderer.bodySlots.indexOf("Earth");
        const position = attribute("position");
        const length = Math.hypot(
            position.getX(earthIndex),
            position.getY(earthIndex),
            position.getZ(earthIndex),
        );

        expect(length).toBeCloseTo(99.5, 1);
        expect(attribute("aAlpha").getX(earthIndex)).toBe(1);
    });

    it("releases its geometry, material and points on disposal", () => {
        renderer = new PlanetRenderer(parent, { radius: 100 });
        renderer.create();
        const points = renderer.points;
        const geometrySpy = vi.spyOn(renderer.geometry, "dispose");
        const materialSpy = vi.spyOn(renderer.material, "dispose");

        renderer.dispose();

        expect(geometrySpy).toHaveBeenCalled();
        expect(materialSpy).toHaveBeenCalled();
        expect(renderer.points).toBeNull();
        expect(renderer.geometry).toBeNull();
        expect(renderer.material).toBeNull();
        expect(parent.children).not.toContain(points);
        renderer = null;
    });

    it("is safe to dispose before creating", () => {
        renderer = new PlanetRenderer(parent, { radius: 100 });

        expect(() => renderer.dispose()).not.toThrow();
    });
});
