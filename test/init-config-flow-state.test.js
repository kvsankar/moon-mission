import { describe, expect, it, vi } from "vitest";
import { createInitConfigFlowActions } from "../src/platform/js/app/init-config-flow-actions.js";
import { createRuntimeViewState } from "../src/platform/js/core/state/runtime-view-state.js";

function harness() {
    const view = createRuntimeViewState({ initialConfig: "geo" });
    const scenes = { geo: {}, lunar: {} };
    let release, reject;
    const loaded = new Promise((resolve, fail) => { release = resolve; reject = fail; });
    const derived = vi.fn(), configure = vi.fn(), controls = vi.fn(), ready = vi.fn();
    const warm = vi.fn();
    const deps = {
        getConfig: view.getConfig,
        getTransitionRevision: view.getTransitionRevision,
        getAnimationScene: origin => scenes[origin],
        AnimationScene: { SCENE_STATE_INIT_CONFIG_DONE: 1 },
        shouldSkipInitConfig: () => false,
        applyInitConfigAlreadyInitialized: warm,
        getGlobalConfig: () => ({}),
        initConfigOrchestrationActions: {
            ensureGlobalConfigLoaded: () => loaded,
            applyConfigDerivedUpdates: derived,
            ensureSceneHandlerInitialized: vi.fn(),
        },
        initConfigSceneSetupActions: { configureSceneForOrigin: configure },
        initConfigUiActions: { configureInitConfigControls: controls },
        setSceneState: ready,
        consoleRef: { debug: vi.fn() },
    };
    return { view, scenes, release, reject, derived, configure, controls, ready, warm, deps,
        actions: createInitConfigFlowActions(deps) };
}

describe("configuration publication ownership", () => {
    for (const [name, supersede] of [
        ["another origin", h => h.view.setConfig("lunar")],
        ["an origin roundtrip", h => { h.view.setConfig("lunar"); h.view.setConfig("geo"); }],
        ["a dimension roundtrip", h => { h.view.setCurrentDimension("2D"); h.view.setCurrentDimension("3D"); }],
        ["scene replacement", h => { h.scenes.geo = {}; }],
    ]) {
        it(`does not publish after ${name}`, async () => {
            const h = harness();
            const pending = h.actions.initConfig();
            supersede(h);
            h.release();
            expect(await pending).toEqual({ status: "superseded", config: "geo" });
            expect(h.derived).not.toHaveBeenCalled();
            expect(h.configure).not.toHaveBeenCalled();
            expect(h.controls).not.toHaveBeenCalled();
            expect(h.ready).not.toHaveBeenCalled();
        });
    }

    it("only publishes the latest same-origin attempt", async () => {
        const h = harness();
        const first = h.actions.initConfig();
        const second = h.actions.initConfig();
        h.release();
        expect(await first).toEqual({ status: "superseded", config: "geo" });
        expect(await second).toEqual({ status: "ready", config: "geo" });
        expect(h.configure).toHaveBeenCalledExactlyOnceWith({ originKey: "geo", configData: {}, isRelativeMode: undefined });
        expect(h.derived).toHaveBeenCalledOnce();
        expect(h.controls).toHaveBeenCalledOnce();
        expect(h.ready).toHaveBeenCalledExactlyOnceWith("geo", 1);
    });

    it("honors the startup owner's cancellation without a view change", async () => {
        const h = harness();
        let current = true;
        const pending = h.actions.initConfig({ isCurrent: () => current });
        current = false;
        h.release();
        expect(await pending).toEqual({ status: "superseded", config: "geo" });
        expect(h.configure).not.toHaveBeenCalled();
    });

    it("does not let an already cancelled caller invalidate pending live work", async () => {
        const h = harness();
        const live = h.actions.initConfig();
        expect(await h.actions.initConfig({ isCurrent: () => false })).toEqual({ status: "superseded", config: "geo" });
        h.release();
        expect(await live).toEqual({ status: "ready", config: "geo" });
        expect(h.configure).toHaveBeenCalledOnce();
    });

    it("does not replay warm-scene UI for an already cancelled caller", async () => {
        const h = harness();
        h.deps.shouldSkipInitConfig = () => true;
        const actions = createInitConfigFlowActions(h.deps);
        expect(await actions.initConfig({ isCurrent: () => false })).toEqual({ status: "superseded", config: "geo" });
        expect(h.warm).not.toHaveBeenCalled();
    });

    it("preserves a live warm-scene activation without loading again", async () => {
        const h = harness();
        h.deps.shouldSkipInitConfig = () => true;
        h.deps.initConfigOrchestrationActions.ensureGlobalConfigLoaded = vi.fn();
        const actions = createInitConfigFlowActions(h.deps);
        expect(await actions.initConfig()).toEqual({ status: "ready", config: "geo" });
        expect(h.warm).toHaveBeenCalledOnce();
        expect(h.deps.initConfigOrchestrationActions.ensureGlobalConfigLoaded).not.toHaveBeenCalled();
    });

    it("suppresses an obsolete load rejection but propagates a current failure", async () => {
        const old = harness();
        const obsolete = old.actions.initConfig();
        old.view.setConfig("lunar");
        old.reject(new Error("old request failed"));
        expect(await obsolete).toEqual({ status: "superseded", config: "geo" });
        expect(old.configure).not.toHaveBeenCalled();

        const current = harness();
        const pending = current.actions.initConfig();
        current.reject(new Error("current request failed"));
        await expect(pending).rejects.toThrow("current request failed");
        expect(current.ready).not.toHaveBeenCalled();
    });
});
