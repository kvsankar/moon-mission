import { describe, expect, it } from "vitest";

import {
    createMissionInteractionStateCells,
    createMissionSessionStateCells,
    createMissionViewStateCells,
} from "../src/platform/js/app/mission-state-cell-groups.js";

describe("mission state cell groups", () => {
    it("builds writable and readonly view-state cells", () => {
        const state = {
            config: "geo",
            currentDimension: "3D",
            previousDimension: "2D",
            dimensionChanged: false,
            viewAuxiliaryPanels: true,
            viewOrbit: true,
            viewOrbitDescent: false,
            viewCraters: false,
            viewLunarCraters: false,
            lunarCraterShowAllEnabled: false,
            lunarCraterHoverEnabled: false,
            viewMoonLatLonGrid: false,
            viewMoonLatLonLabels: true,
            viewMoonLatLonHover: false,
            lunarCraterHoverLabels: true,
            lunarCraterDisplayMode: "hover",
            lunarCraterMinDiameterKm: 80,
            lunarCraterMaxDiameterKm: 600,
            lunarCraterHoverMinDiameterKm: 0,
            lunarCraterHoverMaxDiameterKm: 600,
            lunarFeatureTypeFilters: {},
            lunarFeatureSearchQuery: "",
            lunarFeatureExcludedKeys: [],
            lunarFeatureHoverTypeFilters: {},
            lunarFeatureHoverSearchQuery: "",
            lunarFeatureHoverExcludedKeys: [],
            viewXYZAxes: false,
            viewPoles: false,
            viewPolarAxes: false,
            viewSky: true,
            viewConstellationLines: false,
            viewMoonSOI: false,
            viewMoonHillSphere: false,
            viewBodyHalos: true,
            viewMoonOsculatingOrbit: false,
            viewEclipticPlane: false,
            viewEquatorialPlane: false,
            viewFPS: false,
            orbitStyle: "trail",
            trailTrackBrightness2D: 1,
            trailTrackBrightness3D: 0.5,
            trailTailBrightness2D: 0.25,
            trailTailBrightness3D: 0.1,
        };
        let effectiveOrbitStyle = "trail";
        const runtimeViewState = {
            getConfig: () => state.config,
            setConfig: (value) => { state.config = value; },
            getCurrentDimension: () => state.currentDimension,
            setCurrentDimension: (value) => { state.currentDimension = value; },
            getPreviousDimension: () => state.previousDimension,
            setPreviousDimension: (value) => { state.previousDimension = value; },
            getDimensionChanged: () => state.dimensionChanged,
            setDimensionChanged: (value) => { state.dimensionChanged = value; },
            getViewAuxiliaryPanels: () => state.viewAuxiliaryPanels,
            setViewAuxiliaryPanels: (value) => { state.viewAuxiliaryPanels = value; },
            getViewOrbit: () => state.viewOrbit,
            setViewOrbit: (value) => { state.viewOrbit = value; },
            getViewOrbitDescent: () => state.viewOrbitDescent,
            setViewOrbitDescent: (value) => { state.viewOrbitDescent = value; },
            getViewCraters: () => state.viewCraters,
            setViewCraters: (value) => { state.viewCraters = value; },
            getViewLunarCraters: () => state.viewLunarCraters,
            setViewLunarCraters: (value) => { state.viewLunarCraters = value; },
            getLunarCraterShowAllEnabled: () => state.lunarCraterShowAllEnabled,
            setLunarCraterShowAllEnabled: (value) => { state.lunarCraterShowAllEnabled = value; },
            getLunarCraterHoverEnabled: () => state.lunarCraterHoverEnabled,
            setLunarCraterHoverEnabled: (value) => { state.lunarCraterHoverEnabled = value; },
            getViewMoonLatLonGrid: () => state.viewMoonLatLonGrid,
            setViewMoonLatLonGrid: (value) => { state.viewMoonLatLonGrid = value; },
            getViewMoonLatLonLabels: () => state.viewMoonLatLonLabels,
            setViewMoonLatLonLabels: (value) => { state.viewMoonLatLonLabels = value; },
            getViewMoonLatLonHover: () => state.viewMoonLatLonHover,
            setViewMoonLatLonHover: (value) => { state.viewMoonLatLonHover = value; },
            getLunarCraterHoverLabels: () => state.lunarCraterHoverLabels,
            setLunarCraterHoverLabels: (value) => { state.lunarCraterHoverLabels = value; },
            getLunarCraterDisplayMode: () => state.lunarCraterDisplayMode,
            setLunarCraterDisplayMode: (value) => { state.lunarCraterDisplayMode = value; },
            getLunarCraterMinDiameterKm: () => state.lunarCraterMinDiameterKm,
            setLunarCraterMinDiameterKm: (value) => { state.lunarCraterMinDiameterKm = value; },
            getLunarCraterMaxDiameterKm: () => state.lunarCraterMaxDiameterKm,
            setLunarCraterMaxDiameterKm: (value) => { state.lunarCraterMaxDiameterKm = value; },
            getLunarCraterHoverMinDiameterKm: () => state.lunarCraterHoverMinDiameterKm,
            setLunarCraterHoverMinDiameterKm: (value) => { state.lunarCraterHoverMinDiameterKm = value; },
            getLunarCraterHoverMaxDiameterKm: () => state.lunarCraterHoverMaxDiameterKm,
            setLunarCraterHoverMaxDiameterKm: (value) => { state.lunarCraterHoverMaxDiameterKm = value; },
            getLunarFeatureTypeFilters: () => state.lunarFeatureTypeFilters,
            setLunarFeatureTypeFilters: (value) => { state.lunarFeatureTypeFilters = value; },
            getLunarFeatureSearchQuery: () => state.lunarFeatureSearchQuery,
            setLunarFeatureSearchQuery: (value) => { state.lunarFeatureSearchQuery = value; },
            getLunarFeatureExcludedKeys: () => state.lunarFeatureExcludedKeys,
            setLunarFeatureExcludedKeys: (value) => { state.lunarFeatureExcludedKeys = value; },
            getLunarFeatureHoverTypeFilters: () => state.lunarFeatureHoverTypeFilters,
            setLunarFeatureHoverTypeFilters: (value) => { state.lunarFeatureHoverTypeFilters = value; },
            getLunarFeatureHoverSearchQuery: () => state.lunarFeatureHoverSearchQuery,
            setLunarFeatureHoverSearchQuery: (value) => { state.lunarFeatureHoverSearchQuery = value; },
            getLunarFeatureHoverExcludedKeys: () => state.lunarFeatureHoverExcludedKeys,
            setLunarFeatureHoverExcludedKeys: (value) => { state.lunarFeatureHoverExcludedKeys = value; },
            getViewXYZAxes: () => state.viewXYZAxes,
            setViewXYZAxes: (value) => { state.viewXYZAxes = value; },
            getViewPoles: () => state.viewPoles,
            setViewPoles: (value) => { state.viewPoles = value; },
            getViewPolarAxes: () => state.viewPolarAxes,
            setViewPolarAxes: (value) => { state.viewPolarAxes = value; },
            getViewSky: () => state.viewSky,
            setViewSky: (value) => { state.viewSky = value; },
            getViewConstellationLines: () => state.viewConstellationLines,
            setViewConstellationLines: (value) => { state.viewConstellationLines = value; },
            getViewMoonSOI: () => state.viewMoonSOI,
            setViewMoonSOI: (value) => { state.viewMoonSOI = value; },
            getViewMoonHillSphere: () => state.viewMoonHillSphere,
            setViewMoonHillSphere: (value) => { state.viewMoonHillSphere = value; },
            getViewBodyHalos: () => state.viewBodyHalos,
            setViewBodyHalos: (value) => { state.viewBodyHalos = value; },
            getViewMoonOsculatingOrbit: () => state.viewMoonOsculatingOrbit,
            setViewMoonOsculatingOrbit: (value) => { state.viewMoonOsculatingOrbit = value; },
            getViewEclipticPlane: () => state.viewEclipticPlane,
            setViewEclipticPlane: (value) => { state.viewEclipticPlane = value; },
            getViewEquatorialPlane: () => state.viewEquatorialPlane,
            setViewEquatorialPlane: (value) => { state.viewEquatorialPlane = value; },
            getViewFPS: () => state.viewFPS,
            setViewFPS: (value) => { state.viewFPS = value; },
            getOrbitStyle: () => state.orbitStyle,
            setOrbitStyle: (value) => { state.orbitStyle = value; },
            getTrailTrackBrightness2D: () => state.trailTrackBrightness2D,
            setTrailTrackBrightness2D: (value) => { state.trailTrackBrightness2D = value; },
            getTrailTrackBrightness3D: () => state.trailTrackBrightness3D,
            setTrailTrackBrightness3D: (value) => { state.trailTrackBrightness3D = value; },
            getTrailTailBrightness2D: () => state.trailTailBrightness2D,
            setTrailTailBrightness2D: (value) => { state.trailTailBrightness2D = value; },
            getTrailTailBrightness3D: () => state.trailTailBrightness3D,
            setTrailTailBrightness3D: (value) => { state.trailTailBrightness3D = value; },
        };

        const cells = createMissionViewStateCells(
            runtimeViewState,
            () => effectiveOrbitStyle,
        );

        expect(cells.config.get()).toBe("geo");
        cells.config.set("lunar");
        expect(state.config).toBe("lunar");

        expect(cells.viewOrbit.get()).toBe(true);
        cells.viewOrbit.set(false);
        expect(state.viewOrbit).toBe(false);
        cells.viewLunarCraters.set(true);
        expect(state.viewLunarCraters).toBe(true);
        cells.lunarCraterShowAllEnabled.set(true);
        cells.lunarCraterHoverEnabled.set(true);
        expect(state.lunarCraterShowAllEnabled).toBe(true);
        expect(state.lunarCraterHoverEnabled).toBe(true);
        cells.viewMoonLatLonGrid.set(true);
        expect(state.viewMoonLatLonGrid).toBe(true);
        cells.viewMoonLatLonLabels.set(false);
        expect(state.viewMoonLatLonLabels).toBe(false);
        cells.viewMoonLatLonHover.set(true);
        expect(state.viewMoonLatLonHover).toBe(true);
        cells.lunarCraterHoverLabels.set(false);
        cells.lunarCraterDisplayMode.set("always");
        cells.lunarCraterMinDiameterKm.set(40);
        cells.lunarCraterMaxDiameterKm.set(120);
        cells.lunarCraterHoverMinDiameterKm.set(10);
        cells.lunarCraterHoverMaxDiameterKm.set(240);
        cells.lunarFeatureTypeFilters.set({ crater: { enabled: true } });
        cells.lunarFeatureSearchQuery.set("Tycho");
        cells.lunarFeatureExcludedKeys.set(["tycho"]);
        cells.lunarFeatureHoverTypeFilters.set({ mare: { enabled: true } });
        cells.lunarFeatureHoverSearchQuery.set("Mare");
        cells.lunarFeatureHoverExcludedKeys.set(["mare"]);
        expect(state.lunarCraterHoverLabels).toBe(false);
        expect(state.lunarCraterDisplayMode).toBe("always");
        expect(state.lunarCraterMinDiameterKm).toBe(40);
        expect(state.lunarCraterMaxDiameterKm).toBe(120);
        expect(state.lunarCraterHoverMinDiameterKm).toBe(10);
        expect(state.lunarCraterHoverMaxDiameterKm).toBe(240);
        expect(state.lunarFeatureTypeFilters).toEqual({ crater: { enabled: true } });
        expect(state.lunarFeatureSearchQuery).toBe("Tycho");
        expect(state.lunarFeatureExcludedKeys).toEqual(["tycho"]);
        expect(state.lunarFeatureHoverTypeFilters).toEqual({ mare: { enabled: true } });
        expect(state.lunarFeatureHoverSearchQuery).toBe("Mare");
        expect(state.lunarFeatureHoverExcludedKeys).toEqual(["mare"]);

        expect(cells.effectiveOrbitStyle.get()).toBe("trail");
        effectiveOrbitStyle = "classic";
        expect(cells.effectiveOrbitStyle.get()).toBe("classic");
        cells.effectiveOrbitStyle.set("ignored");
        expect(cells.effectiveOrbitStyle.get()).toBe("classic");
    });

    it("builds session and interaction state cells with the expected mutability", () => {
        const sessionState = {
            animTime: 100,
            animationRunning: true,
        };
        const interactionState = {
            startLandingFlag: false,
            mousedownTimeout: 25,
            timeoutHandleZoom: null,
            mouseDown: false,
            missionStartCalled: false,
            legacyTimeoutHandle: 42,
        };
        const runtimeSessionState = {
            getAnimTime: () => sessionState.animTime,
            setAnimTime: (value) => { sessionState.animTime = value; },
            getAnimationRunning: () => sessionState.animationRunning,
        };
        const runtimeInteractionState = {
            getStartLandingFlag: () => interactionState.startLandingFlag,
            setStartLandingFlag: (value) => { interactionState.startLandingFlag = value; },
            getMouseDownTimeout: () => interactionState.mousedownTimeout,
            setMouseDownTimeout: (value) => { interactionState.mousedownTimeout = value; },
            getTimeoutHandleZoom: () => interactionState.timeoutHandleZoom,
            setTimeoutHandleZoom: (value) => { interactionState.timeoutHandleZoom = value; },
            getMouseDown: () => interactionState.mouseDown,
            setMouseDown: (value) => { interactionState.mouseDown = value; },
            getMissionStartCalled: () => interactionState.missionStartCalled,
            setMissionStartCalled: (value) => { interactionState.missionStartCalled = value; },
            getLegacyTimeoutHandle: () => interactionState.legacyTimeoutHandle,
        };

        const sessionCells = createMissionSessionStateCells(runtimeSessionState);
        const interactionCells = createMissionInteractionStateCells(runtimeInteractionState);

        sessionCells.animTime.set(250);
        expect(sessionState.animTime).toBe(250);
        sessionCells.animationRunning.set(false);
        expect(sessionState.animationRunning).toBe(true);

        interactionCells.startLandingFlag.set(true);
        interactionCells.timeoutHandleZoom.set("zoom-timeout");
        interactionCells.timeoutHandle.set("ignored");

        expect(interactionState.startLandingFlag).toBe(true);
        expect(interactionState.timeoutHandleZoom).toBe("zoom-timeout");
        expect(interactionState.legacyTimeoutHandle).toBe(42);
    });
});
