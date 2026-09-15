import { describe, expect, it, vi } from "vitest";
import { createLandingLoadActions } from "../src/platform/js/app/landing-load-actions.js";

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
    return { promise, resolve, reject };
}

function createHarness(configs = ["lunar"]) {
    const state = {
        config: "lunar",
        globalConfig: { landing: { enabled: true } },
        anyLoaded: false,
        loaded: {},
        data: {},
        urls: Object.fromEntries(configs.map((config) => [config, config])),
    };
    const scene = { name: "lunar", initialized3D: true, deferred3DInitRunId: 1 };
    const scenes = { lunar: scene };
    const requests = new Map(configs.map((config) => [config, deferred()]));
    const loadChebyshev = vi.fn((url) => requests.get(url).promise);
    const onLandingDataReady = vi.fn();
    const onEphemerisStatus = vi.fn();
    const actions = createLandingLoadActions({
        getGlobalConfig: () => state.globalConfig,
        getConfigsList: () => configs,
        getConfig: () => state.config,
        getScene: (config) => scenes[config],
        getLandingDataLoaded: () => state.anyLoaded,
        getLandingChebyshevLoaded: (config) => state.loaded[config],
        getLandingChebyshevData: (config) => state.data[config],
        setLandingDataLoaded: (value) => { state.anyLoaded = value; },
        setLandingChebyshevLoaded: (config, value) => { state.loaded[config] = value; },
        setLandingChebyshevData: (config, value) => { state.data[config] = value; },
        setLandingNpzLoaded: vi.fn(),
        setLandingNpzData: vi.fn(),
        resolveLandingChebyshevUrl: (_globalConfig, config) => state.urls[config],
        loadChebyshev,
        onLandingDataReady,
        onEphemerisStatus,
    });
    return { state, scene, scenes, requests, loadChebyshev, onLandingDataReady, onEphemerisStatus, actions };
}

describe("landing data readiness", () => {
    it("publishes late data to its active initialized scene", async () => {
        const h = createHarness();
        const pending = h.actions.loadLandingDataAndProcess();
        const data = { segments: [{}] };
        h.requests.get("lunar").resolve(data);
        await pending;
        expect(h.onLandingDataReady).toHaveBeenCalledWith({ config: "lunar", scene: h.scene, data });
        expect(h.state.loaded.lunar).toBe(true);
    });

    it("shares in-flight loads while each caller can observe readiness", async () => {
        const h = createHarness();
        const first = h.actions.loadLandingDataAndProcess();
        const second = h.actions.loadLandingDataAndProcess();
        expect(h.loadChebyshev).toHaveBeenCalledTimes(1);
        h.requests.get("lunar").resolve({ segments: [{}] });
        await Promise.all([first, second]);
        expect(h.onLandingDataReady).toHaveBeenCalled();
    });

    it("reuses ready data on warm activation instead of skipping readiness", async () => {
        const h = createHarness();
        const first = h.actions.loadLandingDataAndProcess();
        h.requests.get("lunar").resolve({ segments: [{}] });
        await first;
        h.onLandingDataReady.mockClear();
        await h.actions.loadLandingDataAndProcess();
        expect(h.loadChebyshev).toHaveBeenCalledTimes(1);
        expect(h.onLandingDataReady).toHaveBeenCalledTimes(1);
    });

    it("caches inactive completion and applies it on later warm re-entry", async () => {
        const h = createHarness();
        const pending = h.actions.loadLandingDataAndProcess();
        h.state.config = "geo";
        h.requests.get("lunar").resolve({ segments: [{}] });
        await pending;
        expect(h.state.loaded.lunar).toBe(true);
        expect(h.onLandingDataReady).not.toHaveBeenCalled();
        h.state.config = "lunar";
        await h.actions.loadLandingDataAndProcess();
        expect(h.onLandingDataReady).toHaveBeenCalledTimes(1);
        expect(h.loadChebyshev).toHaveBeenCalledTimes(1);
    });

    it.each(["replace", "dispose", "reinitialize"])("does not publish to a scene after %s", async (change) => {
        const h = createHarness();
        const pending = h.actions.loadLandingDataAndProcess();
        if (change === "replace") h.scenes.lunar = { ...h.scene };
        if (change === "dispose") h.scene.stopCreationFlag = true;
        if (change === "reinitialize") h.scene.deferred3DInitRunId += 1;
        h.requests.get("lunar").resolve({ segments: [{}] });
        await pending;
        expect(h.onLandingDataReady).not.toHaveBeenCalled();
    });

    it("accepts the first cold 3D initialization of the captured scene", async () => {
        const h = createHarness();
        h.scene.initialized3D = false;
        h.scene.deferred3DInitRunId = 0;
        const pending = h.actions.loadLandingDataAndProcess();
        h.scene.initialized3D = true;
        h.scene.deferred3DInitRunId = 1;
        h.requests.get("lunar").resolve({ segments: [{}] });
        await pending;
        expect(h.onLandingDataReady).toHaveBeenCalledTimes(1);
    });

    it("does not publish old mission data after its config is replaced", async () => {
        const h = createHarness();
        const pending = h.actions.loadLandingDataAndProcess();
        h.state.globalConfig = { landing: { enabled: true } };
        h.requests.get("lunar").resolve({ segments: [{}] });
        await pending;
        expect(h.state.loaded.lunar).not.toBe(true);
        expect(h.onLandingDataReady).not.toHaveBeenCalled();
    });

    it("retries a failed origin without reloading another successful origin", async () => {
        const h = createHarness(["geo", "lunar"]);
        const pending = h.actions.loadLandingDataAndProcess();
        h.requests.get("geo").resolve({ segments: [{}] });
        h.requests.get("lunar").reject(new Error("503"));
        await pending;
        expect(h.state.loaded.geo).toBe(true);
        expect(h.state.loaded.lunar).toBe(false);
        expect(h.onLandingDataReady).not.toHaveBeenCalled();
        h.requests.set("lunar", deferred());
        const retry = h.actions.loadLandingDataAndProcess();
        h.requests.get("lunar").resolve({ segments: [{}] });
        await retry;
        expect(h.loadChebyshev.mock.calls.map(([url]) => url)).toEqual(["geo", "lunar", "lunar"]);
        expect(h.onLandingDataReady).toHaveBeenCalledTimes(1);
    });

    it("does not overwrite ready state when an obsolete source URL finishes later", async () => {
        const h = createHarness();
        const older = h.actions.loadLandingDataAndProcess();
        h.state.urls.lunar = "new-lunar";
        h.requests.set("new-lunar", deferred());
        const newer = h.actions.loadLandingDataAndProcess();
        const newData = { segments: [{ source: "new" }] };
        h.requests.get("new-lunar").resolve(newData);
        await newer;
        h.requests.get("lunar").resolve({ segments: [{ source: "old" }] });
        expect(await older).toEqual({ status: "superseded" });
        expect(h.state.data.lunar).toBe(newData);
        expect(h.state.anyLoaded).toBe(true);
        expect(h.onLandingDataReady).toHaveBeenCalledTimes(1);
    });
});
