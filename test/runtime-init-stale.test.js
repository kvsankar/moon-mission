import { describe, expect, it, vi } from "vitest";
import { createRuntimeInitActions } from "../src/platform/js/app/runtime-init.js";

function deferred() {
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    return { promise, resolve };
}

function createHarness(pauseAt = 1, useRevision = true) {
    const state = { config: "geo", revision: 0 };
    const scenes = { geo: { state: 0 }, lunar: { state: 0 } };
    const paused = deferred();
    const resume = deferred();
    let sleepCount = 0;
    const effects = {
        resetViewTransformState: vi.fn(),
        initRepeatButtons: vi.fn(),
        setAnimDate: vi.fn(),
        initSVG: vi.fn(),
        loadOrbitDataIfNeededAndProcess: vi.fn().mockResolvedValue({ status: "ready", config: "geo" }),
        loadLandingDataAndProcess: vi.fn(),
        setSceneState: vi.fn(),
    };
    const actions = createRuntimeInitActions({
        getConfig: () => state.config,
        getScene: (config) => scenes[config],
        ...(useRevision ? { getTransitionRevision: () => state.revision } : {}),
        getSceneStateInitDone: () => 2,
        getHandlersById: () => ({}),
        d3Select: () => "date-selection",
        sleep: async () => {
            if (++sleepCount === pauseAt) {
                paused.resolve();
                await resume.promise;
            }
        },
        getCurrentDimension: () => "2D",
        ...effects,
    });
    return { state, scenes, paused, resume, effects, actions };
}

describe("runtime initialization ownership", () => {
    it.each([false, true])("a newer same-identity init supersedes suspended work (warm=%s)", async warm => {
        const h = createHarness();
        const oldCallback = vi.fn();
        const currentCallback = vi.fn();
        const old = h.actions.init(oldCallback);
        await h.paused.promise;
        if (warm) h.scenes.geo.state = 2;
        await h.actions.init(currentCallback);
        h.resume.resolve();
        await old;
        expect(h.effects.loadOrbitDataIfNeededAndProcess).toHaveBeenCalledTimes(1);
        expect(h.effects.loadOrbitDataIfNeededAndProcess).toHaveBeenCalledWith(currentCallback, expect.objectContaining({ isCurrent: expect.any(Function) }));
    });

    it("does not initiate work after its parent startup is superseded before the next init call", async () => {
        const h = createHarness();
        let current = true;
        const pending = h.actions.init(vi.fn(), { isCurrent: () => current });
        await h.paused.promise;
        current = false;
        h.resume.resolve();
        await pending;
        expect(h.effects.loadOrbitDataIfNeededAndProcess).not.toHaveBeenCalled();
        expect(h.effects.loadLandingDataAndProcess).not.toHaveBeenCalled();
    });
    const invalidations = {
        "origin changes": (h) => { h.state.config = "lunar"; },
        "origin leaves and returns": (h) => { h.state.revision += 2; },
        "scene is replaced": (h) => { h.scenes.geo = { state: 0 }; },
    };
    for (const [name, invalidate] of Object.entries(invalidations)) {
        it.each([1, 2, 3])(`stops initiating effects after ${name} at yield %i`, async (pauseAt) => {
            const h = createHarness(pauseAt);
            const pending = h.actions.init(vi.fn());
            await h.paused.promise;
            const counts = Object.fromEntries(Object.entries(h.effects).map(([key, effect]) => [key, effect.mock.calls.length]));
            invalidate(h);
            h.resume.resolve();
            await pending;
            for (const [key, effect] of Object.entries(h.effects)) {
                expect(effect, key).toHaveBeenCalledTimes(counts[key]);
            }
            expect(h.effects.loadOrbitDataIfNeededAndProcess).not.toHaveBeenCalled();
            expect(h.effects.loadLandingDataAndProcess).not.toHaveBeenCalled();
            expect(h.effects.setSceneState).not.toHaveBeenCalled();
        });
    }

    it("preserves the no-revision cold initialization contract", async () => {
        const h = createHarness(1, false);
        const callback = vi.fn();
        h.resume.resolve();
        await h.actions.init(callback);
        expect(h.effects.loadOrbitDataIfNeededAndProcess).toHaveBeenCalledWith(callback, expect.objectContaining({ isCurrent: expect.any(Function) }));
        expect(h.effects.loadLandingDataAndProcess).toHaveBeenCalledTimes(1);
        expect(h.effects.setSceneState).toHaveBeenCalledWith("geo", 2);
    });

    it("rechecks load outcomes for a warm scene without repeating shell initialization", async () => {
        const h = createHarness();
        h.scenes.geo.state = 2;
        expect(await h.actions.init(vi.fn())).toMatchObject({ status: "ready" });
        expect(h.effects.loadOrbitDataIfNeededAndProcess).toHaveBeenCalledOnce();
        expect(h.effects.loadLandingDataAndProcess).toHaveBeenCalledOnce();
        expect(h.effects.initSVG).toHaveBeenCalledOnce();
        expect(h.effects.initSVG.mock.invocationCallOrder[0]).toBeLessThan(h.effects.loadOrbitDataIfNeededAndProcess.mock.invocationCallOrder[0]);
        expect(h.effects.initRepeatButtons).not.toHaveBeenCalled();
        expect(h.effects.resetViewTransformState).not.toHaveBeenCalled();
    });
});
