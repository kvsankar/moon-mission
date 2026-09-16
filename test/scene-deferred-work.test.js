import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { createMoonActions } from "../src/platform/js/app/moon-actions.js";
import { createSceneInitActions } from "../src/platform/js/app/scene-init-actions.js";
import { applyAndRefreshSceneTextures } from "../src/platform/js/app/scene-texture-actions.js";
import { registerSceneCleanup, cancelSceneWork } from "../src/platform/js/app/scene-lifecycle.js";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function idleHarness() {
    const callbacks = [];
    const cancel = vi.fn();
    vi.stubGlobal("requestIdleCallback", vi.fn(callback => { callbacks.push(callback); return callbacks.length; }));
    vi.stubGlobal("cancelIdleCallback", cancel);
    return { callbacks, cancel };
}
function moonHarness() {
    class Renderer {
        constructor() { this.refreshGeneratedNormalMap = vi.fn(); }
        setRenderInvalidationCallback() {} setTextures() {} setRenderSettings() {} setRenderPipeline() {} create() {}
    }
    const scene = { moonDisplacementMap: { image: { width: 2, height: 2 } },
        addMoonSOI: vi.fn(), addMoonOsculatingOrbit: vi.fn(), rotateMoon: vi.fn() };
    const render = vi.fn();
    const actions = createMoonActions({ MoonRenderer: Renderer, getMoonRadius: () => 1,
        getGlobalConfig: () => ({ is_lunar: true }), getViewPolarAxes: () => false,
        getViewPoles: () => false, getAnimTime: () => 0, render });
    return { actions, scene, render };
}

describe("scene-owned deferred work", () => {
    it("does not render after a deferred decoration retires the scene", async () => {
        const scene = {};
        for (const method of ["computeDimensions", "addLight", "addSky", "addSun", "addMoon", "addEarth",
            "setPrimaryAndSecondaryBodies", "addSpacecraft", "addCamera", "addSpacecraftCurve"])
            scene[method] = vi.fn();
        const render = vi.fn();
        scene.addBodyHalos = () => { scene.disposed = true; render.mockClear(); };
        const actions = createSceneInitActions({ THREE, render, wait20: () => Promise.resolve(), clearEventInfo: vi.fn() });
        actions.init3dRest(scene);
        await Promise.resolve();
        expect(scene.disposed).toBe(true);
        expect(render).not.toHaveBeenCalled();
    });

    it("does not send an old Moon initialization callback to a replacement renderer", () => {
        const idle = idleHarness(), h = moonHarness();
        h.actions.addMoon(h.scene);
        const old = h.scene.moonRenderer;
        const next = { refreshGeneratedNormalMap: vi.fn() };
        h.scene.moonRenderer = next;
        idle.callbacks[0]();
        expect(next.refreshGeneratedNormalMap).not.toHaveBeenCalled();
        expect(old.refreshGeneratedNormalMap).not.toHaveBeenCalled();
    });

    it("cancels an initial Moon idle upgrade and makes an already-queued callback inert", () => {
        const idle = idleHarness(), h = moonHarness();
        h.actions.addMoon(h.scene);
        h.render.mockClear();
        h.scene.disposed = true;
        cancelSceneWork(h.scene);
        expect(idle.cancel).toHaveBeenCalledWith(1);
        idle.callbacks[0]();
        expect(h.scene.moonRenderer.refreshGeneratedNormalMap).not.toHaveBeenCalled();
        expect(h.render).not.toHaveBeenCalled();
    });

    it("cancels an installed-profile idle upgrade and prevents late rendering", () => {
        const idle = idleHarness(), render = vi.fn();
        const scene = { moonRenderer: { updateTextures: vi.fn(), refreshGeneratedNormalMap: vi.fn() } };
        applyAndRefreshSceneTextures(scene, { moonDisplacementMap: { image: { width: 2, height: 2 } } },
            { disposePrevious: true, requestRender: render });
        scene.disposed = true;
        cancelSceneWork(scene);
        expect(idle.cancel).toHaveBeenCalledWith(1);
        idle.callbacks[0]({ didTimeout: true });
        expect(scene.moonRenderer.refreshGeneratedNormalMap).not.toHaveBeenCalled();
        expect(render).not.toHaveBeenCalled();
    });

    it("does not resurrect scene initialization after a render callback retires it", async () => {
        const scene = { initialized3D: false, computeDimensions: vi.fn() };
        for (const method of ["addLight", "addSky", "addSun", "addMoon", "addEarth", "setPrimaryAndSecondaryBodies",
            "addSpacecraft", "addCamera", "addSpacecraftCurve", "addBodyHalos", "addAxesHelper",
            "addSurfacePointMarkers", "addEarthLocations", "addMoonLocations", "addLunarCraterAnnotations",
            "addLineOfSight"]) scene[method] = vi.fn();
        const actions = createSceneInitActions({ THREE, render: () => { scene.disposed = true; },
            wait20: () => Promise.resolve(), clearEventInfo: vi.fn() });
        actions.init3dRest(scene);
        await Promise.resolve();
        expect(scene.addLight).not.toHaveBeenCalled();
        expect(scene.initialized3D).toBe(false);
    });

    it("starts no initialization work on a terminal scene", () => {
        const scene = { disposed: true, computeDimensions: vi.fn() };
        for (const method of ["addLight", "addSky", "addSun", "addMoon", "addEarth", "setPrimaryAndSecondaryBodies",
            "addSpacecraft", "addCamera", "addSpacecraftCurve", "addBodyHalos", "addAxesHelper",
            "addSurfacePointMarkers", "addEarthLocations", "addMoonLocations", "addLunarCraterAnnotations",
            "addLineOfSight"]) scene[method] = vi.fn();
        const render = vi.fn();
        const actions = createSceneInitActions({ THREE, render, wait20: () => Promise.resolve(), clearEventInfo: vi.fn() });
        actions.init3dRest(scene);
        expect(scene.computeDimensions).not.toHaveBeenCalled();
        expect(render).not.toHaveBeenCalled();
    });

    it("isolates cleanup registration, supports unsubscribe, and continues after cleanup failures", () => {
        const a = {}, b = {}, kept = vi.fn(), removed = vi.fn(), other = vi.fn(), late = vi.fn();
        registerSceneCleanup(a, () => { throw new Error("abort failed"); });
        registerSceneCleanup(a, kept);
        registerSceneCleanup(a, removed)();
        registerSceneCleanup(b, other);
        vi.spyOn(console, "warn").mockImplementation(() => {});
        a.disposed = true;
        expect(cancelSceneWork(a)).toHaveLength(1);
        registerSceneCleanup(a, late);
        cancelSceneWork(a);
        expect(kept).toHaveBeenCalledOnce();
        expect(late).toHaveBeenCalledOnce();
        expect(removed).not.toHaveBeenCalled();
        expect(other).not.toHaveBeenCalled();
        cancelSceneWork(b);
        expect(other).toHaveBeenCalledOnce();
    });
});
