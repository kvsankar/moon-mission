import { afterEach, describe, expect, it, vi } from "vitest";
import { createScene3dInitActions } from "../src/platform/js/app/scene-3d-init-actions.js";
import { cancelSceneWork } from "../src/platform/js/app/scene-lifecycle.js";

function deferred() {
    let resolve, reject;
    const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
    return { promise, resolve, reject };
}
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

function retire(scene) {
    Object.assign(scene, {
        disposed: true, stopCreationFlag: true, initialized3D: false, decorationsReady3D: false,
        deferred3DInitRunId: (scene.deferred3DInitRunId || 0) + 1,
        textureLoadToken: (scene.textureLoadToken || 0) + 1,
        textureLoadState: "disposed", moonTextureLoadState: "disposed",
        textureLoadPending: false, moonTextureLoadPending: false,
        textureLoadPromise: null, moonTextureLoadPromise: null, moonPreviewLoadPromise: null,
    });
    cancelSceneWork(scene);
}

function makeScene() {
    return { initialized3D: false, deferred3DInitRunId: 0,
        init3dRest: vi.fn(function () { this.initialized3D = true; this.deferred3DInitRunId += 1; }) };
}

function harness(extra = {}) {
    const requests = [], profiles = [];
    const globalObject = { MOON_RENDER_ASSET_PROFILE: "fast" };
    const load = vi.fn(options => { const request = { ...options, ...deferred() }; requests.push(request); return request.promise; });
    const loadProfile = vi.fn(options => { const request = { ...options, ...deferred() }; profiles.push(request); return request.promise; });
    const apply = vi.fn((scene, textures, options) => { Object.assign(scene, textures); options?.onAccepted?.(); });
    const render = vi.fn();
    const deps = { THREE: {}, createPlaceholderSceneTextures: () => ({ moonMap: { image: { width: 1 } } }),
        loadSceneTextures: load, loadMoonRenderProfileTextures: loadProfile,
        applyAndRefreshSceneTextures: apply, render, globalObject, ...extra };
    return { actions: createScene3dInitActions(deps), deps, requests, profiles, globalObject, apply, render, load };
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("scene-owned texture work", () => {
    it("does not initialize a terminally disposed scene", () => {
        const h = harness(), scene = makeScene(), ready = vi.fn();
        retire(scene);
        h.actions.init3d(scene, ready);
        expect(scene.init3dRest).not.toHaveBeenCalled();
        expect(h.apply).not.toHaveBeenCalled();
        expect(ready).not.toHaveBeenCalled();
        expect(scene.textureLoadState).toBe("disposed");
    });

    it("does not overwrite disposal performed by the initialization callback", () => {
        const h = harness(), scene = makeScene();
        h.actions.init3d(scene, () => retire(scene));
        expect(scene.textureLoadState).toBe("disposed");
        expect(scene.textureLoadPromise).toBeNull();
        scene.beginTextureLoad?.();
        expect(h.load).not.toHaveBeenCalled();
    });

    it("rejects placeholders produced after re-entrant disposal", () => {
        const scene = makeScene(), map = { dispose: vi.fn() };
        const h = harness({ createPlaceholderSceneTextures: () => { retire(scene); return { moonMap: map }; } });
        h.actions.init3d(scene, vi.fn());
        expect(h.apply).not.toHaveBeenCalled();
        expect(scene.init3dRest).not.toHaveBeenCalled();
        expect(map.dispose).toHaveBeenCalledOnce();
    });

    it("aborts only the disposed scene's preview and main controllers", async () => {
        const h = harness(), first = makeScene(), second = makeScene();
        first.moonRenderer = {}; second.moonRenderer = {};
        h.actions.init3d(first, vi.fn()); h.actions.init3d(second, vi.fn());
        first.beginTextureLoad(); second.beginTextureLoad();
        retire(first);
        expect(h.requests[0].signal.aborted).toBe(true);
        expect(h.profiles[0].signal.aborted).toBe(true);
        expect(h.requests[1].signal.aborted).toBe(false);
        expect(h.profiles[1].signal.aborted).toBe(false);
        retire(second);
        [...h.requests, ...h.profiles].forEach(request => request.resolve({ moonRenderProfile: "fast" }));
        await flush();
    });

    it("settles a cancelled load and disposes unclaimed results that arrive later", async () => {
        const h = harness(), scene = makeScene();
        h.actions.init3d(scene, vi.fn());
        let settled = false;
        const pending = scene.beginTextureLoad().then(() => { settled = true; });
        retire(scene);
        await flush();
        expect(settled).toBe(true);
        const map = { dispose: vi.fn() };
        h.requests[0].resolve({ earthTexture: map, moonRenderProfile: "fast" });
        await pending; await flush();
        expect(map.dispose).toHaveBeenCalledOnce();
        expect(scene.textureLoadState).toBe("disposed");
        expect(h.render).not.toHaveBeenCalled();
    });

    it("does not render or publish ready after disposal during texture application", async () => {
        const h = harness(), scene = makeScene();
        h.actions.init3d(scene, vi.fn());
        h.apply.mockImplementation(target => retire(target));
        const pending = scene.beginTextureLoad();
        h.requests[0].resolve({ moonRenderProfile: "fast" });
        await pending;
        expect(scene.textureLoadState).toBe("disposed");
        expect(scene.textureLoadPromise).toBeNull();
        expect(h.render).not.toHaveBeenCalled();
    });

    for (const outcome of ["resolve", "reject"]) {
        it(`does not publish stale profile ${outcome} or finally metadata`, async () => {
            const h = harness(), scene = makeScene();
            h.actions.init3d(scene, vi.fn());
            const pending = scene.beginTextureLoad();
            h.globalObject.MOON_RENDER_ASSET_PROFILE = "quality";
            h.requests[0].resolve({ moonRenderProfile: "fast" });
            await flush();
            expect(h.profiles).toHaveLength(1);
            retire(scene);
            const map = { dispose: vi.fn() };
            if (outcome === "resolve") h.profiles[0].resolve({ moonMap: map, moonRenderProfile: "quality" });
            else h.profiles[0].reject(new Error("late profile failure"));
            await pending; await flush();
            expect(scene.textureLoadState).toBe("disposed");
            expect(scene.moonTextureLoadState).toBe("disposed");
            expect(scene.moonTextureLoadPromise).toBeNull();
            if (outcome === "resolve") expect(map.dispose).toHaveBeenCalledOnce();
        });
    }

    for (const kind of ["idle timer", "animation frame"]) {
        it(`cancels and settles the ${kind} work slot without another browser tick`, async () => {
            vi.useFakeTimers(); vi.setSystemTime(10000);
            let frame;
            const cancelFrame = vi.fn();
            let waitSettled = false;
            const h = harness({
                getLastInputActivityMs: () => kind === "idle timer" ? Date.now() : -Infinity,
                requestAnimationFrame: kind === "animation frame" ? (callback) => { frame = callback; return 41; } : null,
                cancelAnimationFrameFn: cancelFrame,
                loadSceneTexturesProgressively: async ({ beforeApplyGroup }) => {
                    const waiting = beforeApplyGroup();
                    waiting.then(() => { waitSettled = true; }, () => { waitSettled = true; });
                    await waiting;
                    return { moonRenderProfile: "fast" };
                },
            });
            const scene = makeScene(); h.actions.init3d(scene, vi.fn());
            const pending = scene.beginTextureLoad();
            retire(scene);
            await flush();
            expect(waitSettled).toBe(true);
            expect(vi.getTimerCount()).toBe(0);
            if (kind === "animation frame") {
                expect(cancelFrame).toHaveBeenCalledWith(41);
                frame(); // A callback already queued by the browser is inert.
                expect(vi.getTimerCount()).toBe(0);
            }
            await pending;
        });
    }

    it("unregisters completed controller work", async () => {
        const h = harness(), scene = makeScene(); h.actions.init3d(scene, vi.fn());
        const pending = scene.beginTextureLoad();
        h.requests[0].resolve({ moonRenderProfile: "fast" });
        await pending;
        cancelSceneWork(scene);
        expect(h.requests[0].signal.aborted).toBe(false);
    });

    it("makes a captured deferred render invalidation inert after disposal", async () => {
        const h = harness(), scene = makeScene(); h.actions.init3d(scene, vi.fn());
        const pending = scene.beginTextureLoad();
        h.requests[0].resolve({ moonRenderProfile: "fast" });
        await pending;
        const options = h.apply.mock.calls.at(-1)[2];
        h.render.mockClear();
        retire(scene);
        options.requestRender();
        expect(h.render).not.toHaveBeenCalled();
    });

    it("does not clear a newer live texture promise when an older token settles", async () => {
        const h = harness(), scene = makeScene(); h.actions.init3d(scene, vi.fn());
        const old = scene.beginTextureLoad();
        scene.textureLoadState = "stale";
        const fresh = scene.beginTextureLoad();
        const obsoleteMap = { dispose: vi.fn() };
        h.requests[0].resolve({ earthTexture: obsoleteMap, moonRenderProfile: "fast" });
        await old;
        expect(obsoleteMap.dispose).toHaveBeenCalledOnce();
        expect(scene.textureLoadPromise).toBe(fresh);
        expect(scene.textureLoadState).toBe("loading");
        expect(scene.textureLoadPending).toBe(true);
        expect(h.requests[1].signal.aborted).toBe(false);
        h.requests[1].resolve({ moonRenderProfile: "fast" });
        await fresh;
        expect(scene.textureLoadState).toBe("ready");
    });

    it("does not clear a newer live Moon profile promise from an old profile's finally", async () => {
        const h = harness(), scene = makeScene(); h.actions.init3d(scene, vi.fn());
        const old = scene.beginTextureLoad();
        h.globalObject.MOON_RENDER_ASSET_PROFILE = "quality";
        h.requests[0].resolve({ moonRenderProfile: "fast" });
        await flush();
        scene.textureLoadState = "stale";
        const fresh = scene.beginTextureLoad();
        h.requests[1].resolve({ moonRenderProfile: "fast" });
        await flush();
        expect(h.profiles).toHaveLength(2);
        const freshProfile = scene.moonTextureLoadPromise;
        const obsoleteMap = { dispose: vi.fn() };
        h.profiles[0].resolve({ moonMap: obsoleteMap, moonRenderProfile: "quality" });
        await old;
        expect(obsoleteMap.dispose).toHaveBeenCalledOnce();
        expect(scene.textureLoadPromise).toBe(fresh);
        expect(scene.moonTextureLoadPromise).toBe(freshProfile);
        expect(scene.moonTextureLoadState).toBe("loading");
        expect(scene.moonTextureLoadPending).toBe(true);
        h.profiles[1].resolve({ moonRenderProfile: "quality" });
        await fresh;
        expect(scene.textureLoadState).toBe("ready");
    });

    it("disposes a late preview for a replaced renderer without changing the live scene", async () => {
        const h = harness(), scene = makeScene(); scene.moonRenderer = {};
        h.actions.init3d(scene, vi.fn());
        const preview = scene.moonPreviewLoadPromise;
        const placeholder = scene.moonMap;
        scene.moonRenderer = {};
        const obsoleteMap = { dispose: vi.fn(), image: { width: 1024 } };
        h.profiles[0].resolve({ moonMap: obsoleteMap });
        await preview;
        expect(obsoleteMap.dispose).toHaveBeenCalledOnce();
        expect(scene.moonMap).toBe(placeholder);
        expect(h.render).not.toHaveBeenCalled();
        cancelSceneWork(scene);
        expect(h.profiles[0].signal.aborted).toBe(false);
    });
});
