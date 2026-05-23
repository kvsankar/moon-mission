import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

import { createSurfacePointMarkerActions } from "../src/platform/js/app/surface-point-marker-actions.js";

const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;

function createScene() {
    const earthContainer = new THREE.Group();
    const moonContainer = new THREE.Group();
    const craft = new THREE.Group();

    moonContainer.position.set(12, 0, 0);
    craft.position.set(0, 12, 0);
    earthContainer.updateMatrixWorld(true);
    moonContainer.updateMatrixWorld(true);
    craft.updateMatrixWorld(true);

    return {
        earthContainer,
        moonContainer,
        earthRenderer: { radius: 6 },
        moonRenderer: { radius: 2 },
        craftsById: { SC: craft },
        craft,
        primaryCraftId: "SC",
        activeCraftId: "SC",
        surfacePointMarkerVisibility: {},
    };
}

afterEach(() => {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
    vi.restoreAllMocks();
});

describe("surface point marker actions", () => {
    it("adds soft additive glint parts only to glint markers", () => {
        const scene = createScene();
        const actions = createSurfacePointMarkerActions({ THREE, render: vi.fn() });

        actions.addSurfacePointMarkers({ scene });

        const solarGlint = scene.surfacePointMarkers.solarGlintEarth;
        const lunarGlint = scene.surfacePointMarkers.lunarGlintEarth;

        expect(solarGlint.userData.surfacePointGlintParts).toBeTruthy();
        expect(lunarGlint.userData.surfacePointGlintParts).toBeTruthy();
        expect(solarGlint.getObjectByName("solarGlintEarth-color-ring")).toBeUndefined();
        expect(solarGlint.getObjectByName("solarGlintEarth-dot")).toBeUndefined();
        expect(solarGlint.getObjectByName("solarGlintEarth-glint-wash")).toBeTruthy();
        expect(solarGlint.getObjectByName("solarGlintEarth-glint-fleck-0")).toBeTruthy();
        expect(solarGlint.getObjectByName("solarGlintEarth-glint-wash").scale.x)
            .toBe(solarGlint.getObjectByName("solarGlintEarth-glint-wash").scale.y);
        expect(solarGlint.getObjectByName("solarGlintEarth-glint-fleck-0").position.x).toBe(0);
        expect(solarGlint.getObjectByName("solarGlintEarth-glint-fleck-0").position.y).toBe(0);
        expect(scene.surfacePointMarkers.subSolarEarth.userData.surfacePointGlintParts).toBeUndefined();
        expect(scene.surfacePointMarkers.subMoonEarth.userData.surfacePointGlintParts).toBeUndefined();
        expect(scene.surfacePointMarkers.subSolarEarth.getObjectByName("subSolarEarth-color-ring")).toBeTruthy();
    });

    it("runs the glint animation loop only while a glint marker is visible", () => {
        let scheduledCallback = null;
        globalThis.requestAnimationFrame = vi.fn((callback) => {
            scheduledCallback = callback;
            return 42;
        });
        globalThis.cancelAnimationFrame = vi.fn();

        const scene = createScene();
        const render = vi.fn();
        const actions = createSurfacePointMarkerActions({ THREE, render });

        actions.addSurfacePointMarkers({ scene });
        actions.setSurfacePointMarkersVisible({
            scene,
            view: { viewSolarGlintEarth: true },
        });
        actions.updateSurfacePointMarkers({
            scene,
            sunDirections: {
                earthCentered: { x: 1, y: 0, z: 0 },
                moonCentered: { x: 1, y: 0, z: 0 },
            },
            craftId: "SC",
        });

        const marker = scene.surfacePointMarkers.solarGlintEarth;
        const parts = marker.userData.surfacePointGlintParts;
        expect(marker.visible).toBe(true);
        expect(globalThis.requestAnimationFrame).toHaveBeenCalledTimes(1);
        expect(scene.surfacePointMarkerAnimationFrame).toBe(42);

        render.mockClear();
        scheduledCallback(450);

        expect(render).toHaveBeenCalledTimes(1);
        expect(parts.fleckRoot.rotation.z).not.toBe(0);
        expect(parts.glow.scale.x).toBe(parts.glow.scale.y);
        expect(parts.core.scale.x).toBe(parts.core.scale.y);
        expect(parts.core.material.opacity).toBeGreaterThan(0.22);
        expect(globalThis.requestAnimationFrame).toHaveBeenCalledTimes(2);

        actions.setSurfacePointMarkersVisible({
            scene,
            view: { viewSolarGlintEarth: false },
        });

        expect(globalThis.cancelAnimationFrame).toHaveBeenCalledWith(42);
        expect(scene.surfacePointMarkerAnimationFrame).toBeNull();
        expect(marker.visible).toBe(false);
    });

    it("caps surface point marker size aggressively against body radius", () => {
        const scene = createScene();
        const actions = createSurfacePointMarkerActions({ THREE, render: vi.fn() });

        actions.addSurfacePointMarkers({ scene });
        actions.setSurfacePointMarkersVisible({
            scene,
            view: {
                viewSubSolarEarth: true,
                viewSolarGlintEarth: true,
            },
        });
        actions.updateSurfacePointMarkers({
            scene,
            sunDirections: {
                earthCentered: { x: 1, y: 0, z: 0 },
                moonCentered: { x: 1, y: 0, z: 0 },
            },
            craftId: "SC",
        });

        const subSolar = scene.surfacePointMarkers.subSolarEarth;
        const solarGlint = scene.surfacePointMarkers.solarGlintEarth;

        expect(subSolar.visible).toBe(true);
        expect(solarGlint.visible).toBe(true);
        expect(subSolar.scale.x).toBeCloseTo(6 * 0.030);
        expect(solarGlint.scale.x).toBeCloseTo(6 * 0.050);
        expect(solarGlint.scale.x).toBeLessThan(6 * 0.15);
    });
});
