import { afterEach, describe, expect, it, vi } from "vitest";
import { createOrbitLoadActions } from "../src/platform/js/app/orbit-load-actions.js";
import { createOrbitProcessActions } from "../src/platform/js/app/orbit-process-actions.js";

const deferred = () => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
};
function harness({ processSleep = async () => {}, loaded = {}, loadJson, processVectors = async () => {} } = {}) {
    vi.stubGlobal("document", { getElementById: () => null });
    const state = { config: "geo", dimension: "3D", revision: 0 };
    const scenes = Object.fromEntries(["geo", "lunar"].map(config => [config, {
        orbitsCheb: `${config}.json`, primaryCraftId: "SC", planetsForLocations: ["SC"],
    }]));
    const requests = [];
    const processed = {};
    const data = {};
    const metadata = vi.fn();
    const unlock = vi.fn();
    const effects = { hide: vi.fn(), error: vi.fn(), status: vi.fn(), loaded: vi.fn(), record: vi.fn() };
    const processing = createOrbitProcessActions({
        updateConfigFromMetadata: metadata, getCurrentDimension: () => state.dimension,
        sleep: processSleep, getMissionStartCalled: () => true,
        getAnimationRunning: () => true, d3SelectAll: () => ({ attr: unlock }),
        zoomChangeTransform: vi.fn(), getConfig: () => state.config,
        orbitDataProcessed: processed,
        processOrbitVectorsData: processVectors,
    });
    const loading = createOrbitLoadActions({
        sleep: async () => {}, getConfig: () => state.config,
        getCurrentDimension: () => state.dimension, getTransitionRevision: () => state.revision,
        animationScenes: scenes, orbitDataLoaded: loaded,
        chebyshevData: data, chebyshevDataLoaded: {}, npzData: {}, npzDataLoaded: {},
        getDataLoaded: () => false, setDataLoaded: effects.loaded,
        loadChebyshev: url => { const request = { url, ...deferred() }; requests.push(request); return request.promise; },
        processOrbitData: processing.processOrbitData,
        loadJson, onEphemerisLoaded: effects.record,
        ensureIndeterminateProgressBar: vi.fn(), showElementById: vi.fn(),
        hideElementById: effects.hide, updateProgressLabel: vi.fn(),
        setEventInfoText: effects.error, onEphemerisStatus: effects.status,
        getBodySource: id => id === "SC" ? "chebyshev" : "astronomy",
        getBodiesForConfig: () => ["SC"],
    });
    const switchTo = config => { state.config = config; state.revision += 1; };
    return { state, scenes, requests, processed, loaded, data, metadata, unlock, effects, loading, switchTo };
}
afterEach(() => vi.unstubAllGlobals());

describe("orbit request identity and publication", () => {
    it("returns failed then ready outcomes when a request is retried", async () => {
        const h = harness();
        const failed = h.loading.loadOrbitDataIfNeededAndProcess(vi.fn());
        await vi.waitFor(() => expect(h.requests).toHaveLength(1));
        h.requests[0].reject(new Error("offline"));
        expect(await failed).toMatchObject({ status: "failed", config: "geo" });
        expect(h.loaded.geo).not.toBe(true);
        const retry = h.loading.loadOrbitDataIfNeededAndProcess(vi.fn());
        await vi.waitFor(() => expect(h.requests).toHaveLength(2));
        h.requests[1].resolve({ SC: { segments: [] } });
        expect(await retry).toMatchObject({ status: "ready", config: "geo" });
        expect(h.processed.geo).toBe(true);
    });
    it("propagates cancelled SVG construction without publishing readiness", async () => {
        const h = harness({ loaded: { geo: true }, processVectors: async () => false });
        h.state.dimension = "2D";
        const callback = vi.fn();
        await h.loading.loadOrbitDataIfNeededAndProcess(callback);
        expect(h.processed).toEqual({});
        expect(h.unlock).not.toHaveBeenCalled();
        expect(callback).not.toHaveBeenCalled();
    });

    it.each(["pending", "cached"])("applies %s style metadata on warm reactivation", async state => {
        const style = deferred();
        const loadJson = vi.fn(() => style.promise);
        const h = harness({ loadJson });
        h.scenes.geo.orbitsMeta = "geo-style.json";
        const pending = h.loading.loadOrbitDataIfNeededAndProcess(vi.fn());
        await vi.waitFor(() => expect(h.requests).toHaveLength(1));
        h.requests[0].resolve({ SC: { segments: [] } });
        await pending;
        expect(loadJson).toHaveBeenCalledOnce();
        h.switchTo("lunar");
        if (state === "cached") {
            style.resolve({ bodies: { SC: { marker: "authored" } } });
            await style.promise; await Promise.resolve();
            expect(h.scenes.geo.loadedOrbitStyleMetadataByBodyId).toBeUndefined();
        }
        h.switchTo("geo");
        await h.loading.loadOrbitDataIfNeededAndProcess(vi.fn());
        if (state === "pending") style.resolve({ bodies: { SC: { marker: "authored" } } });
        await vi.waitFor(() => expect(h.scenes.geo.loadedOrbitStyleMetadataByBodyId?.SC?.marker).toBe("authored"));
        expect(loadJson).toHaveBeenCalledOnce();
    });

    it("publishes cached origin provenance when that origin becomes active", async () => {
        const h = harness();
        const pending = h.loading.loadOrbitDataIfNeededAndProcess(vi.fn());
        await vi.waitFor(() => expect(h.requests).toHaveLength(1));
        h.switchTo("lunar");
        h.requests[0].resolve({ SC: { segments: [] } });
        await pending;
        expect(h.effects.record).not.toHaveBeenCalled();
        h.switchTo("geo");
        await h.loading.loadOrbitDataIfNeededAndProcess(vi.fn());
        expect(h.effects.record).toHaveBeenCalledWith(expect.objectContaining({ config: "geo", url: "geo.json" }));
        expect(h.effects.status).toHaveBeenLastCalledWith("geo", "chebyshev", "ok");
        expect(h.processed.geo).toBe(true);
    });
    it("caches inactive-origin data without processing or publishing active UI", async () => {
        const h = harness();
        const callback = vi.fn();
        const pending = h.loading.loadOrbitDataIfNeededAndProcess(callback);
        await vi.waitFor(() => expect(h.requests).toHaveLength(1));
        h.switchTo("lunar");
        h.effects.status.mockClear();
        h.requests[0].resolve({ SC: { segments: [] } });
        await pending;
        expect(h.loaded.geo).toBe(true);
        expect(h.processed).toEqual({});
        expect(h.metadata).not.toHaveBeenCalled();
        expect(h.unlock).not.toHaveBeenCalled();
        expect(h.effects.hide).not.toHaveBeenCalled();
        expect(h.effects.status).not.toHaveBeenCalled();
        expect(callback).not.toHaveBeenCalled();
    });

    it("rejects an old activation even after origin returns before a new load starts", async () => {
        const h = harness();
        const callback = vi.fn();
        const pending = h.loading.loadOrbitDataIfNeededAndProcess(callback);
        await vi.waitFor(() => expect(h.requests).toHaveLength(1));
        h.switchTo("lunar"); h.switchTo("geo");
        h.requests[0].resolve({ SC: { segments: [] } });
        await pending;
        expect(h.processed).toEqual({});
        expect(callback).not.toHaveBeenCalled();
    });

    it("does not let an older same-origin request overwrite newer cache data", async () => {
        const h = harness();
        const oldCallback = vi.fn();
        const newCallback = vi.fn();
        const old = h.loading.loadOrbitDataIfNeededAndProcess(oldCallback);
        await vi.waitFor(() => expect(h.requests).toHaveLength(1));
        h.switchTo("lunar"); h.switchTo("geo");
        const current = h.loading.loadOrbitDataIfNeededAndProcess(newCallback);
        await vi.waitFor(() => expect(h.requests).toHaveLength(2));
        h.requests[1].resolve({ marker: "new", SC: { segments: [] } });
        await current;
        h.requests[0].resolve({ marker: "old", SC: { segments: [] } });
        await old;
        expect(h.data.geo.marker).toBe("new");
        expect(oldCallback).not.toHaveBeenCalled();
        expect(newCallback).toHaveBeenCalledOnce();
        expect(h.processed).toEqual({ geo: true });
    });

    it.each(["removed", "replaced"])("ignores completion when its scene was %s", async change => {
        const h = harness();
        const callback = vi.fn();
        const pending = h.loading.loadOrbitDataIfNeededAndProcess(callback);
        await vi.waitFor(() => expect(h.requests).toHaveLength(1));
        if (change === "removed") delete h.scenes.geo;
        else h.scenes.geo = { ...h.scenes.geo };
        h.requests[0].resolve({ SC: { segments: [] } });
        await pending;
        expect(h.data.geo).toBeUndefined();
        expect(h.processed).toEqual({});
        expect(callback).not.toHaveBeenCalled();
        expect(h.effects.error).not.toHaveBeenCalled();
    });

    it("rechecks identity after processing yields on the warm path", async () => {
        const gate = deferred();
        const h = harness({ processSleep: () => gate.promise, loaded: { geo: true } });
        const callback = vi.fn();
        const pending = h.loading.loadOrbitDataIfNeededAndProcess(callback);
        expect(h.metadata).toHaveBeenCalledOnce();
        h.switchTo("lunar");
        gate.resolve();
        await pending;
        expect(h.processed).toEqual({});
        expect(h.unlock).not.toHaveBeenCalled();
        expect(callback).not.toHaveBeenCalled();
    });

    it("does not publish an obsolete request error into the current view", async () => {
        const h = harness();
        const pending = h.loading.loadOrbitDataIfNeededAndProcess(vi.fn());
        await vi.waitFor(() => expect(h.requests).toHaveLength(1));
        h.switchTo("lunar");
        h.effects.status.mockClear();
        h.requests[0].reject(new Error("old geo request failed"));
        await pending;
        expect(h.effects.error).not.toHaveBeenCalled();
        expect(h.effects.hide).not.toHaveBeenCalled();
        expect(h.effects.status).not.toHaveBeenCalled();
    });
});
