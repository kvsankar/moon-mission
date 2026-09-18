import { describe, expect, it, vi } from "vitest";

import {
    createMissionInteractionStateCells,
    createMissionSessionStateCells,
    createMissionViewStateCells,
    createMutableStateCell,
    createReadonlyStateCell,
} from "../src/platform/js/app/mission-state-cell-groups.js";
import { createRuntimeViewState } from "../src/platform/js/core/state/runtime-view-state.js";
import { createRuntimeSessionState } from "../src/platform/js/core/state/runtime-session-state.js";
import { createRuntimeInteractionState } from "../src/platform/js/core/state/runtime-interaction-state.js";

describe("state cell wrappers", () => {
    it("routes reads and writes through the supplied accessors", () => {
        let stored = 1;
        const cell = createMutableStateCell(() => stored, (value) => { stored = value; });

        expect(cell.get()).toBe(1);
        cell.set(7);
        expect(stored).toBe(7);
    });

    it("swallows writes to a readonly cell", () => {
        const cell = createReadonlyStateCell(() => "fixed");

        expect(cell.get()).toBe("fixed");
        expect(() => cell.set("other")).not.toThrow();
        expect(cell.get()).toBe("fixed");
    });
});

describe("view state cells against the runtime store", () => {
    function makeCells() {
        const runtimeViewState = createRuntimeViewState();
        const getEffectiveOrbitStyle = vi.fn(() => "trail");
        return {
            runtimeViewState,
            getEffectiveOrbitStyle,
            cells: createMissionViewStateCells(runtimeViewState, getEffectiveOrbitStyle),
        };
    }

    it("exposes every runtime view flag as a cell", () => {
        const { cells } = makeCells();

        for (const key of [
            "config",
            "currentDimension",
            "viewOrbit",
            "viewCraters",
            "viewLunarCraters",
            "viewMoonLatLonGrid",
            "trailTrackBrightness2D",
            "trailTailBrightness3D",
        ]) {
            expect(typeof cells[key]?.get).toBe("function");
            expect(typeof cells[key]?.set).toBe("function");
        }
    });

    it("round-trips a value through the runtime view state", () => {
        const { cells, runtimeViewState } = makeCells();

        cells.config.set("lunar");

        expect(runtimeViewState.getConfig()).toBe("lunar");
        expect(cells.config.get()).toBe("lunar");
    });

    it("tracks the dimension change flags together", () => {
        const { cells } = makeCells();

        cells.currentDimension.set("2D");
        cells.previousDimension.set("3D");
        cells.dimensionChanged.set(true);

        expect(cells.currentDimension.get()).toBe("2D");
        expect(cells.previousDimension.get()).toBe("3D");
        expect(cells.dimensionChanged.get()).toBe(true);
    });

    it("keeps the transition revision read-only", () => {
        const { cells, runtimeViewState } = makeCells();
        const before = cells.transitionRevision.get();

        cells.transitionRevision.set(999);

        expect(cells.transitionRevision.get()).toBe(before);
        expect(cells.transitionRevision.get()).toBe(runtimeViewState.getTransitionRevision());
    });

    it("round-trips an explicit lunar feature mode flag", () => {
        const { cells } = makeCells();

        cells.lunarCraterShowAllEnabled.set(true);
        expect(cells.lunarCraterShowAllEnabled.get()).toBe(true);

        cells.lunarCraterShowAllEnabled.set(false);
        cells.lunarCraterHoverEnabled.set(true);
        expect(cells.lunarCraterShowAllEnabled.get()).toBe(false);
        expect(cells.lunarCraterHoverEnabled.get()).toBe(true);
    });

    it("derives the mode flags from the display mode when none is written", () => {
        const { cells, runtimeViewState } = makeCells();

        runtimeViewState.setLunarCraterDisplayMode("always");
        cells.viewLunarCraters.set(true);
        expect(cells.lunarCraterShowAllEnabled.get()).toBe(true);

        runtimeViewState.setLunarCraterDisplayMode("hover");
        cells.viewLunarCraters.set(true);
        expect(cells.lunarCraterShowAllEnabled.get()).toBe(false);
        expect(cells.lunarCraterHoverEnabled.get()).toBe(true);
    });

    it("clears both lunar feature modes when the features are switched off", () => {
        const { cells, runtimeViewState } = makeCells();
        runtimeViewState.setLunarCraterDisplayMode("always");
        cells.viewLunarCraters.set(true);

        cells.viewLunarCraters.set(false);

        expect(cells.lunarCraterShowAllEnabled.get()).toBe(false);
        expect(cells.lunarCraterHoverEnabled.get()).toBe(false);
    });

    it("round-trips the lunar feature view toggles that are stored per view", () => {
        const { cells } = makeCells();

        cells.viewLunarCraters.set(true);
        cells.viewCraters.set(false);

        expect(cells.viewLunarCraters.get()).toBe(true);
        expect(cells.viewCraters.get()).toBe(false);
    });

    it("round-trips the trail brightness controls", () => {
        const { cells } = makeCells();

        cells.trailTrackBrightness2D.set(0.4);
        cells.trailTailBrightness3D.set(1.7);

        expect(cells.trailTrackBrightness2D.get()).toBe(0.4);
        expect(cells.trailTailBrightness3D.get()).toBe(1.7);
    });

    it("round-trips the photo and auxiliary view toggles", () => {
        const { cells } = makeCells();

        cells.viewPhotoMode.set(true);
        cells.viewAuxiliaryPanels.set(false);
        cells.viewEarthClouds.set(false);

        expect(cells.viewPhotoMode.get()).toBe(true);
        expect(cells.viewAuxiliaryPanels.get()).toBe(false);
        expect(cells.viewEarthClouds.get()).toBe(false);
    });
});

describe("session state cells against the runtime store", () => {
    it("round-trips the animation time", () => {
        const runtimeSessionState = createRuntimeSessionState();
        const cells = createMissionSessionStateCells(runtimeSessionState);

        cells.animTime.set(1_700_000_000_000);

        expect(cells.animTime.get()).toBe(1_700_000_000_000);
        expect(runtimeSessionState.getAnimTime()).toBe(1_700_000_000_000);
    });

    it("keeps the playback flag read-only", () => {
        const runtimeSessionState = createRuntimeSessionState();
        const cells = createMissionSessionStateCells(runtimeSessionState);
        const before = cells.animationRunning.get();

        cells.animationRunning.set(!before);

        expect(cells.animationRunning.get()).toBe(before);
    });
});

describe("interaction state cells against the runtime store", () => {
    function makeCells() {
        const runtimeInteractionState = createRuntimeInteractionState();
        return {
            runtimeInteractionState,
            cells: createMissionInteractionStateCells(runtimeInteractionState),
        };
    }

    it("round-trips the pointer and landing flags", () => {
        const { cells } = makeCells();

        cells.mouseDown.set(true);
        cells.startLandingFlag.set(true);
        cells.missionStartCalled.set(true);

        expect(cells.mouseDown.get()).toBe(true);
        expect(cells.startLandingFlag.get()).toBe(true);
        expect(cells.missionStartCalled.get()).toBe(true);
    });

    it("round-trips the pending timeout handles", () => {
        const { cells } = makeCells();

        cells.mousedownTimeout.set(11);
        cells.timeoutHandleZoom.set(22);

        expect(cells.mousedownTimeout.get()).toBe(11);
        expect(cells.timeoutHandleZoom.get()).toBe(22);
    });

    it("keeps the legacy timeout handle read-only", () => {
        const { cells } = makeCells();
        const before = cells.timeoutHandle.get();

        cells.timeoutHandle.set(42);

        expect(cells.timeoutHandle.get()).toBe(before);
    });

    it("records input activity through the cell", () => {
        const { cells, runtimeInteractionState } = makeCells();

        cells.lastInputActivityMs.set(5000);

        expect(cells.lastInputActivityMs.get()).toBe(5000);
        expect(runtimeInteractionState.getLastInputActivityMs()).toBe(5000);
    });
});
