import { createMoonRenderProfileActions } from "../src/platform/js/app/moon-render-profile-actions.js";
import { describe, expect, it, vi } from "vitest";

import { createScene3dInitActions } from "../src/platform/js/app/scene-3d-init-actions.js";

function createScene() {
    return {
        initialized3D: false,
        init3dRest: vi.fn(function () {
            this.initialized3D = true;
        }),
    };
}

function createDeferred() {
    let resolve;
    let reject;
    const promise = new Promise((promiseResolve, promiseReject) => {
        resolve = promiseResolve;
        reject = promiseReject;
    });
    return { promise, resolve, reject };
}

describe("scene-3d-init-actions", () => {
    it("restarts unrelated textures even when the old cancellation arrives after the tier choice finishes", async () => {
        vi.useFakeTimers();
        try {
            const scene = createScene();
            const first = createDeferred();
            const globalObject = { MOON_RENDER_ASSET_PROFILE: "quality" };
            const load = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue({ moonRenderProfile: "low", earthTexture: "earth" });
            const apply = vi.fn();
            const actions = createScene3dInitActions({ THREE: {}, createPlaceholderSceneTextures: () => ({}), loadSceneTextures: load, applyAndRefreshSceneTextures: apply, render: vi.fn(), globalObject });
            actions.init3d(scene, vi.fn());
            const oldLoad = scene.beginTextureLoad();
            const profiles = createMoonRenderProfileActions({ THREE: {}, animationScenes: { geo: scene }, loadMoonRenderProfileTextures: async () => ({ moonRenderProfile: "low" }), applyAndRefreshSceneTextures: apply, render: vi.fn(), globalObject });
            await profiles.setMoonRenderProfile("low");
            expect(globalObject.__moonRenderPendingProfile).toBeUndefined();
            first.reject(Object.assign(new Error("superseded"), { name: "AbortError" }));
            await oldLoad;
            await vi.advanceTimersByTimeAsync(0);
            expect(load).toHaveBeenCalledTimes(2);
            expect(load).toHaveBeenLastCalledWith(expect.objectContaining({ moonRenderProfile: "low" }));
            expect(scene.textureLoadState).toBe("ready");
        } finally { vi.useRealTimers(); }
    });

    it("stops waiting for input idle at the two-second deadline", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(10000);
        try {
            const scene = createScene();
            const applied = vi.fn();
            const actions = createScene3dInitActions({
                THREE: { LinearFilter: "linear" },
                createPlaceholderSceneTextures: () => ({ moonRenderProfile: "fast" }),
                loadSceneTextures: vi.fn(),
                loadSceneTexturesProgressively: async ({ beforeApplyGroup, onTexturesReady }) => {
                    await beforeApplyGroup({ keys: ["earthTexture"] });
                    applied();
                    await onTexturesReady({ earthTexture: "earth", moonRenderProfile: "fast" });
                    return { moonRenderProfile: "fast" };
                },
                applyAndRefreshSceneTextures: vi.fn(), render: vi.fn(),
                requestAnimationFrame: null,
                getLastInputActivityMs: () => Date.now(), globalObject: {},
            });
            actions.init3d(scene, vi.fn());
            const loading = scene.beginTextureLoad();
            await vi.advanceTimersByTimeAsync(1999);
            expect(applied).not.toHaveBeenCalled();
            await vi.advanceTimersByTimeAsync(1);
            await loading;
            expect(applied).toHaveBeenCalledOnce();
        } finally { vi.useRealTimers(); }
    });

    it("paints the Moon preview independently of heavy textures and recent input", async () => {
        const scene = createScene();
        scene.moonRenderer = {};
        const preview = createDeferred();
        const previewMap = { image: { width: 1024 }, dispose: vi.fn() };
        const apply = vi.fn((target, textures) => { if (textures.moonMap) target.moonMap = textures.moonMap; });
        const loadHeavy = vi.fn();
        const render = vi.fn();
        const actions = createScene3dInitActions({
            THREE: { LinearFilter: "linear" },
            createPlaceholderSceneTextures: vi.fn(() => ({ moonMap: { image: { width: 1 } } })),
            loadSceneTextures: loadHeavy,
            loadMoonRenderProfileTextures: vi.fn(() => preview.promise),
            applyAndRefreshSceneTextures: apply,
            getLastInputActivityMs: () => Date.now(),
            render, globalObject: {},
        });
        actions.init3d(scene, vi.fn());
        expect(loadHeavy).not.toHaveBeenCalled();
        preview.resolve({ moonMap: previewMap, moonRenderProfile: "low", moonDisplacementMap: null });
        await scene.moonPreviewLoadPromise;
        expect(scene.moonMap).toBe(previewMap);
        expect(render).toHaveBeenCalledOnce();
        expect(loadHeavy).not.toHaveBeenCalled();
    });

    it("disposes a late preview rather than replacing an already detailed Moon", async () => {
        const scene = createScene();
        scene.moonRenderer = {};
        const preview = createDeferred();
        const previewMap = { image: { width: 1024 }, dispose: vi.fn() };
        const apply = vi.fn((target, textures) => { if (textures.moonMap) target.moonMap = textures.moonMap; });
        const actions = createScene3dInitActions({
            THREE: { LinearFilter: "linear" },
            createPlaceholderSceneTextures: vi.fn(() => ({ moonMap: { image: { width: 1 } } })),
            loadSceneTextures: vi.fn(), loadMoonRenderProfileTextures: vi.fn(() => preview.promise),
            applyAndRefreshSceneTextures: apply, render: vi.fn(), globalObject: {},
        });
        actions.init3d(scene, vi.fn());
        const detailedMap = { image: { width: 16384 } };
        scene.moonMap = detailedMap;
        preview.resolve({ moonMap: previewMap });
        await scene.moonPreviewLoadPromise;
        expect(scene.moonMap).toBe(detailedMap);
        expect(previewMap.dispose).toHaveBeenCalledOnce();
    });

    it("uses a profile selection that is still being validated", async () => {
        const scene = createScene();
        const loadSceneTextures = vi.fn().mockResolvedValue({
            moonMap: "quality-map",
            moonDisplacementMap: "quality-height",
            moonRenderProfile: "quality",
            moonRenderSettings: {},
        });
        const actions = createScene3dInitActions({
            THREE: { LinearFilter: "linear" },
            createPlaceholderSceneTextures: vi.fn(() => ({ moonRenderProfile: "fast" })),
            loadSceneTextures,
            loadMoonRenderProfileTextures: vi.fn(),
            applyAndRefreshSceneTextures: vi.fn(),
            render: vi.fn(),
            globalObject: {
                MOON_RENDER_ASSET_PROFILE: "fast",
                __moonRenderPendingProfile: "quality",
            },
        });

        actions.init3d(scene, vi.fn());
        await scene.beginTextureLoad();

        expect(loadSceneTextures).toHaveBeenCalledWith(expect.objectContaining({
            moonRenderProfile: "quality",
        }));
    });

    it("loads the requested detailed Moon profile during scene texture startup", async () => {
        const scene = createScene();
        const callback = vi.fn();
        const applyAndRefreshSceneTextures = vi.fn((targetScene, textures) => {
            targetScene.moonRenderProfile = textures.moonRenderProfile;
        });
        const loadSceneTextures = vi.fn().mockResolvedValue({
            moonMap: "quality-map",
            moonDisplacementMap: "quality-height",
            moonRenderProfile: "quality",
            moonRenderSettings: { displacementScale: 0.0128 },
        });
        const loadMoonRenderProfileTextures = vi.fn().mockResolvedValue({
            moonMap: "fast-map",
            moonDisplacementMap: "fast-height",
            moonRenderProfile: "fast",
            moonRenderSettings: { displacementScale: 0.0118 },
        });
        const actions = createScene3dInitActions({
            THREE: { LinearFilter: "linear" },
            createPlaceholderSceneTextures: vi.fn(() => ({ moonRenderProfile: "quality" })),
            loadSceneTextures,
            loadMoonRenderProfileTextures,
            applyAndRefreshSceneTextures,
            render: vi.fn(),
            globalObject: {
                location: {
                    search: "?moonRenderProfile=quality",
                },
            },
        });

        actions.init3d(scene, callback);
        await scene.beginTextureLoad();
        await scene.moonTextureLoadPromise;

        expect(callback).toHaveBeenCalled();
        expect(loadSceneTextures).toHaveBeenCalledWith(expect.objectContaining({
            moonRenderProfile: "quality",
        }));
        expect(loadMoonRenderProfileTextures).not.toHaveBeenCalled();
        expect(applyAndRefreshSceneTextures.mock.calls.map(([, textures]) => textures.moonRenderProfile))
            .toEqual(["quality", "quality"]);
        expect(scene.textureLoadState).toBe("ready");
        expect(scene.moonRenderProfile).toBe("quality");
    });

    it("forwards requestRender into applyAndRefreshSceneTextures so deferred normal-map redraws wake the on-demand loop", async () => {
        // Reviewer-flagged regression case: without forwarding `requestRender`
        // into the startup-path applyAndRefreshSceneTextures call, the
        // generated normal-map's deferred refresh (scheduled inside
        // applyAndRefreshSceneTextures when disposePrevious=true) cannot
        // wake the on-demand render loop after the build completes — the
        // upgraded normal map only becomes visible on the next user
        // interaction.
        const scene = createScene();
        const render = vi.fn();
        const applyAndRefreshSceneTextures = vi.fn((targetScene, textures) => {
            targetScene.moonRenderProfile = textures.moonRenderProfile;
        });
        const loadSceneTextures = vi.fn().mockResolvedValue({
            moonMap: "quality-map",
            moonDisplacementMap: "quality-height",
            moonRenderProfile: "quality",
            moonRenderSettings: {},
        });
        const actions = createScene3dInitActions({
            THREE: { LinearFilter: "linear" },
            createPlaceholderSceneTextures: vi.fn(() => ({ moonRenderProfile: "quality" })),
            loadSceneTextures,
            loadMoonRenderProfileTextures: vi.fn(),
            applyAndRefreshSceneTextures,
            render,
            globalObject: {
                location: { search: "?moonRenderProfile=quality" },
            },
        });

        actions.init3d(scene, vi.fn());
        await scene.beginTextureLoad();
        await scene.moonTextureLoadPromise;

        // The post-load call (disposePrevious=true) MUST include
        // requestRender — that combination triggers the deferred
        // generated-normal-map refresh and wakes the on-demand loop
        // afterward. The earlier placeholder-texture call has
        // disposePrevious=false and intentionally does not need it.
        const disposingCalls = applyAndRefreshSceneTextures.mock.calls
            .filter(([, , options]) => options?.disposePrevious === true);
        expect(disposingCalls.length).toBeGreaterThan(0);
        for (const [, , options] of disposingCalls) {
            expect(options).toMatchObject({
                disposePrevious: true,
                requestRender: render,
            });
        }
    });

    it("keeps startup texture loading pending until a changed Moon profile refresh completes", async () => {
        const scene = createScene();
        const mainLoad = createDeferred();
        const moonRefresh = createDeferred();
        const globalObject = {
            MOON_RENDER_ASSET_PROFILE: "fast",
        };
        const applyAndRefreshSceneTextures = vi.fn((targetScene, textures) => {
            targetScene.moonRenderProfile = textures.moonRenderProfile;
        });
        const loadSceneTextures = vi.fn(() => mainLoad.promise);
        const loadMoonRenderProfileTextures = vi.fn(() => moonRefresh.promise);
        const actions = createScene3dInitActions({
            THREE: { LinearFilter: "linear" },
            createPlaceholderSceneTextures: vi.fn(() => ({ moonRenderProfile: "fast" })),
            loadSceneTextures,
            loadMoonRenderProfileTextures,
            applyAndRefreshSceneTextures,
            render: vi.fn(),
            globalObject,
        });

        actions.init3d(scene, vi.fn());
        const textureLoadPromise = scene.beginTextureLoad();

        globalObject.MOON_RENDER_ASSET_PROFILE = "quality";
        mainLoad.resolve({
            moonMap: "fast-map",
            moonDisplacementMap: "fast-height",
            moonRenderProfile: "fast",
            moonRenderSettings: {},
        });
        await Promise.resolve();
        await Promise.resolve();

        expect(loadMoonRenderProfileTextures).toHaveBeenCalledWith(expect.objectContaining({
            moonRenderProfile: "quality",
        }));
        expect(scene.textureLoadState).toBe("loading");
        expect(scene.textureLoadPending).toBe(true);
        expect(scene.moonTextureLoadPending).toBe(true);

        moonRefresh.resolve({
            moonMap: "quality-map",
            moonDisplacementMap: "quality-height",
            moonRenderProfile: "quality",
            moonRenderSettings: {},
        });
        await textureLoadPromise;

        expect(scene.textureLoadState).toBe("ready");
        expect(scene.textureLoadPending).toBe(false);
        expect(scene.moonTextureLoadPending).toBe(false);
        expect(scene.moonRenderProfile).toBe("quality");
    });

    it("applies progressive startup texture groups after input-idle slots", async () => {
        const scene = createScene();
        const callback = vi.fn();
        const render = vi.fn();
        const applyAndRefreshSceneTextures = vi.fn((targetScene, textures) => {
            targetScene.moonRenderProfile = textures.moonRenderProfile || targetScene.moonRenderProfile;
        });
        let nowMs = 1000;
        const scheduleTimeout = vi.fn((scheduledCallback, delayMs = 0) => {
            nowMs += Number(delayMs) || 0;
            scheduledCallback();
            return 1;
        });
        const requestAnimationFrame = vi.fn((scheduledCallback) => {
            scheduledCallback(nowMs);
            return 1;
        });
        const loadSceneTexturesProgressively = vi.fn(async ({
            beforeLoadGroup,
            beforeApplyGroup,
            onTexturesReady,
        }) => {
            await beforeLoadGroup({ keys: ["earthTexture"] });
            await beforeApplyGroup({ keys: ["earthTexture"], textures: { earthTexture: "earth" } });
            await onTexturesReady({ earthTexture: "earth" }, { keys: ["earthTexture"] });

            await beforeLoadGroup({ keys: ["moonMap"] });
            await beforeApplyGroup({
                keys: ["moonMap"],
                textures: { moonMap: "moon", moonRenderProfile: "fast", moonRenderSettings: {} },
            });
            await onTexturesReady(
                { moonMap: "moon", moonRenderProfile: "fast", moonRenderSettings: {} },
                { keys: ["moonMap"] },
            );
            return {
                earthTexture: "earth",
                moonMap: "moon",
                moonRenderProfile: "fast",
                moonRenderSettings: {},
            };
        });
        const actions = createScene3dInitActions({
            THREE: { LinearFilter: "linear" },
            createPlaceholderSceneTextures: vi.fn(() => ({ moonRenderProfile: "fast" })),
            loadSceneTextures: vi.fn(),
            loadSceneTexturesProgressively,
            loadMoonRenderProfileTextures: vi.fn(),
            applyAndRefreshSceneTextures,
            render,
            getLastInputActivityMs: () => 1000,
            scheduleTimeout,
            requestAnimationFrame,
            globalObject: {},
        });
        const dateNowSpy = vi.spyOn(Date, "now").mockImplementation(() => nowMs);

        try {
            actions.init3d(scene, callback);
            await scene.beginTextureLoad();
        } finally {
            dateNowSpy.mockRestore();
        }

        const appliedTexturePayloads = applyAndRefreshSceneTextures.mock.calls
            .map(([, textures]) => textures);
        expect(appliedTexturePayloads).toEqual([
            { moonRenderProfile: "fast" },
            { earthTexture: "earth" },
            { moonMap: "moon", moonRenderProfile: "fast", moonRenderSettings: {} },
        ]);
        expect(scheduleTimeout.mock.calls.some(([, delayMs]) => delayMs >= 600)).toBe(true);
        expect(render).toHaveBeenCalledTimes(2);
        expect(scene.textureLoadState).toBe("ready");
        expect(callback).toHaveBeenCalled();
    });
});
