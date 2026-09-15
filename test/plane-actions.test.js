import { describe, expect, it, vi } from "vitest";
import { createPlaneActions } from "../src/platform/js/app/plane-actions.js";

function createHarness(dimension = "2D") {
    const state = { config: "geo", dimension, selection: "XY", revision: 0 };
    const animationScenes = {
        geo: { setCameraParameters: vi.fn() },
        lunar: { setCameraParameters: vi.fn() },
    };
    const pending = [];
    const effects = {
        setPlaneVariables: vi.fn(), initSVG: vi.fn(),
        handleDimensionSwitch: vi.fn(), setLocation: vi.fn(),
    };
    const actions = createPlaneActions({
        ...effects,
        getConfig: () => state.config,
        getCurrentDimension: () => state.dimension,
        getPlaneSelection: () => state.selection,
        getTransitionRevision: () => state.revision,
        animationScenes,
        loadOrbitDataIfNeededAndProcess: callback => pending.push(callback),
    });
    return { state, animationScenes, pending, effects, actions };
}

function expectNoCompletion(effects) {
    expect(effects.handleDimensionSwitch).not.toHaveBeenCalled();
    expect(effects.setLocation).not.toHaveBeenCalled();
}

describe("plane transition completion ownership", () => {
    it.each(["2D", "3D"])("applies a current %s request once it is ready", dimension => {
        const { actions, pending, effects, animationScenes } = createHarness(dimension);
        actions.handlePlaneChange();
        expect(pending).toHaveLength(1);
        expectNoCompletion(effects);
        pending[0]();
        expect(effects.handleDimensionSwitch).toHaveBeenCalledWith(dimension);
        expect(effects.setLocation).toHaveBeenCalledOnce();
        expect(effects.initSVG).toHaveBeenCalledTimes(dimension === "2D" ? 1 : 0);
        expect(animationScenes.geo.setCameraParameters).toHaveBeenCalledTimes(dimension === "3D" ? 1 : 0);
    });

    it.each(["2D", "3D"])("ignores an obsolete %s completion after dimension changes", dimension => {
        const { actions, state, pending, effects } = createHarness(dimension);
        actions.handlePlaneChange();
        state.dimension = dimension === "2D" ? "3D" : "2D";
        pending[0]();
        expectNoCompletion(effects);
    });

    it("ignores a completion after origin changes", () => {
        const { actions, state, pending, effects } = createHarness();
        actions.handlePlaneChange();
        state.config = "lunar";
        pending[0]();
        expectNoCompletion(effects);
    });

    it.each(["origin", "dimension"])("rejects an %s ABA transition using its revision", axis => {
        const { actions, state, pending, effects } = createHarness();
        actions.handlePlaneChange();
        const key = axis === "origin" ? "config" : "dimension";
        const previous = state[key];
        state[key] = axis === "origin" ? "lunar" : "3D";
        state.revision += 1;
        state[key] = previous;
        state.revision += 1;
        pending[0]();
        expectNoCompletion(effects);
    });

    it("rejects a replaced scene even when origin and selection are unchanged", () => {
        const { actions, pending, effects, animationScenes } = createHarness();
        actions.handlePlaneChange();
        animationScenes.geo = { setCameraParameters: vi.fn() };
        pending[0]();
        expectNoCompletion(effects);
    });

    it("ignores a completion after the selected plane changes", () => {
        const { actions, state, pending, effects } = createHarness();
        actions.handlePlaneChange();
        state.selection = "YZ";
        pending[0]();
        expectNoCompletion(effects);
    });

    it("only applies the newest request when planes return to the same selection", () => {
        const { actions, state, pending, effects } = createHarness();
        actions.handlePlaneChange();
        state.selection = "YZ";
        actions.handlePlaneChange();
        state.selection = "XY";
        actions.handlePlaneChange();
        expect(pending).toHaveLength(3);
        pending[2]();
        pending[1]();
        pending[0]();
        expect(effects.handleDimensionSwitch).toHaveBeenCalledExactlyOnceWith("2D");
        expect(effects.setLocation).toHaveBeenCalledOnce();
    });

    it("supersedes an earlier forced request with the same identity", () => {
        const { actions, pending, effects } = createHarness();
        actions.handlePlaneChange(true);
        actions.handlePlaneChange(true);
        expect(pending).toHaveLength(2);
        pending[1]();
        pending[0]();
        expect(effects.handleDimensionSwitch).toHaveBeenCalledExactlyOnceWith("2D");
        expect(effects.setLocation).toHaveBeenCalledOnce();
    });

    it("does not strand a valid pending request when unchanged selection is repeated", () => {
        const { actions, pending, effects } = createHarness();
        actions.handlePlaneChange();
        actions.handlePlaneChange();
        expect(pending).toHaveLength(1);
        pending[0]();
        expect(effects.handleDimensionSwitch).toHaveBeenCalledExactlyOnceWith("2D");
        expect(effects.setLocation).toHaveBeenCalledOnce();
    });
});
