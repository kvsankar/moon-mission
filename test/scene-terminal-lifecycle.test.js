import { afterEach, describe, expect, it, vi } from "vitest";
import { Texture } from "three";
import { createSceneDisposeActions } from "../src/platform/js/app/scene-dispose-actions.js";
import { applyAndRefreshSceneTextures } from "../src/platform/js/app/scene-texture-actions.js";
import { isStartupViewSceneReady } from "../src/platform/js/app/startup-animation-plan.js";
import { createSpacecraftCurveActions } from "../src/platform/js/app/spacecraft-curve-actions.js";

const cleanupNames = ["disposeEarthLocations", "disposeBodyHalos", "disposeSurfacePointMarkers",
    "disposeEarth", "disposeSky", "disposeSun", "disposeLunarCraterAnnotations", "disposeMoonLocations",
    "disposeMoon", "disposeSpacecraftModel", "disposeSpacecraftCurve", "disposeMoonSOI",
    "disposeLineOfSight", "disposeAxesHelper", "disposeLight", "disposeCamera", "disposeSpacecraft"];
function sceneFixture() {
    return { ...Object.fromEntries(cleanupNames.map(key => [key, vi.fn()])),
        initialized3D: true, decorationsReady3D: true, stopCreationFlag: false,
        deferred3DInitRunId: 7, textureLoadToken: 4, state: 3,
        textureLoadState: "loading", textureLoadPending: true, textureLoadPromise: Promise.resolve(),
        moonTextureLoadState: "loading", moonTextureLoadPending: true, moonTextureLoadPromise: Promise.resolve(),
    };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("terminal scene disposal", () => {
    it("keeps terminal readiness after the real curve cleanup adapter runs", () => {
        const scene = sceneFixture();
        scene.constructor = { SCENE_STATE_INIT_DONE: 2 };
        const curves = createSpacecraftCurveActions({});
        scene.disposeSpacecraftCurve = () => curves.disposeSpacecraftCurve(scene);
        createSceneDisposeActions().dispose(scene);
        expect(scene.state).toBe(-1);
    });

    it("revokes readiness and pending publication before invoking the first cleanup hook", () => {
        const scene = sceneFixture();
        const seen = [];
        scene.disposeEarthLocations.mockImplementation(() => seen.push({
            disposed: scene.disposed, initialized: scene.initialized3D, stopped: scene.stopCreationFlag,
            state: scene.state, generation: scene.deferred3DInitRunId, token: scene.textureLoadToken,
            textureState: scene.textureLoadState, moonState: scene.moonTextureLoadState,
            texturePending: scene.textureLoadPending, moonPending: scene.moonTextureLoadPending,
            texturePromise: scene.textureLoadPromise, moonPromise: scene.moonTextureLoadPromise,
        }));
        createSceneDisposeActions().dispose(scene);
        expect(seen).toEqual([{ disposed: true, initialized: false, stopped: true,
            state: -1, generation: 8, token: 5, textureState: "disposed", moonState: "disposed",
            texturePending: false, moonPending: false, texturePromise: null, moonPromise: null }]);
    });

    it("is idempotent even when cleanup re-enters disposal", () => {
        const scene = sceneFixture(), actions = createSceneDisposeActions();
        scene.disposeEarthLocations.mockImplementationOnce(() => actions.dispose(scene));
        actions.dispose(scene);
        actions.dispose(scene);
        for (const key of cleanupNames) expect(scene[key], key).toHaveBeenCalledOnce();
        expect(scene.deferred3DInitRunId).toBe(8);
    });

    it("continues cleanup and releases accepted scene-only aliases when a cleanup hook fails", () => {
        const scene = sceneFixture(), texture = new Texture(), disposed = vi.fn();
        texture.addEventListener("dispose", disposed);
        applyAndRefreshSceneTextures(scene, { earthTexture: texture, earthPhotoTexture: texture, moonMap: texture });
        scene.disposeEarthLocations.mockImplementation(() => { throw new Error("cleanup failed"); });
        vi.spyOn(console, "warn").mockImplementation(() => {});
        const actions = createSceneDisposeActions();
        expect(() => actions.dispose(scene)).not.toThrow();
        actions.dispose(scene);
        expect(scene.disposeSpacecraft).toHaveBeenCalledOnce();
        expect(disposed).toHaveBeenCalledOnce();
        expect(scene.earthTexture).toBeNull();
        expect(scene.moonMap).toBeNull();
    });

    it("releases accepted inputs after renderer adoption failure without harming another scene", () => {
        const a = sceneFixture(), b = sceneFixture(), texture = new Texture(), disposed = vi.fn();
        texture.addEventListener("dispose", disposed);
        applyAndRefreshSceneTextures(b, { earthTexture: texture });
        a.earthRenderer = { updateTextures() { throw new Error("adoption failed"); } };
        expect(() => applyAndRefreshSceneTextures(a, { earthTexture: texture }, { onAccepted: vi.fn() }))
            .toThrow("adoption failed");
        const actions = createSceneDisposeActions();
        actions.dispose(a);
        expect(disposed).not.toHaveBeenCalled();
        actions.dispose(b);
        expect(disposed).toHaveBeenCalledOnce();
    });

    it.each([true, false])("never reports a disposed scene ready (needs3D=%s)", needs3DReady => {
        expect(isStartupViewSceneReady({ needs3DReady, scene: { disposed: true, initialized3D: true },
            isSceneOrbitRenderable: () => true })).toBe(false);
    });

    it("rejects late texture installation without accepting or publishing the inputs", () => {
        const scene = sceneFixture(), texture = new Texture(), accepted = vi.fn();
        createSceneDisposeActions().dispose(scene);
        expect(() => applyAndRefreshSceneTextures(scene, { earthTexture: texture }, { onAccepted: accepted }))
            .toThrow();
        expect(accepted).not.toHaveBeenCalled();
        expect(scene.earthTexture).toBeNull();
        texture.dispose(); // Rejected producer input remains the producer's responsibility.
    });
});
