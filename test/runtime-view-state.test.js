import { describe, expect, it } from "vitest";
import { createRuntimeViewState } from "../src/platform/js/core/state/runtime-view-state.js";

describe("runtime-view-state", () => {
    it("invalidates origin and dimension ABA transitions without treating no-op selections as changes", () => {
        const state = createRuntimeViewState({ initialConfig: "geo", initialCurrentDimension: "3D" });
        expect(state.getTransitionRevision()).toBe(0);
        state.setConfig("geo"); state.setCurrentDimension("3D");
        expect(state.getTransitionRevision()).toBe(0);
        state.setConfig("lunar"); state.setConfig("geo");
        expect(state.getTransitionRevision()).toBe(2);
        state.setCurrentDimension("2D"); state.setCurrentDimension("3D");
        expect(state.getTransitionRevision()).toBe(4);
        state.setViewFlags({ viewOrbit: false });
        expect(state.getTransitionRevision()).toBe(4);
    });
    it("tracks config and dimension state", () => {
        const state = createRuntimeViewState({
            initialConfig: "geo",
            initialCurrentDimension: "3D",
            initialPreviousDimension: null,
            initialDimensionChanged: false,
        });

        expect(state.getConfig()).toBe("geo");
        expect(state.getCurrentDimension()).toBe("3D");
        expect(state.getPreviousDimension()).toBe(null);
        expect(state.getDimensionChanged()).toBe(false);

        state.setConfig("lunar");
        state.setCurrentDimension("2D");
        state.setPreviousDimension("3D");
        state.setDimensionChanged(true);

        expect(state.getConfig()).toBe("lunar");
        expect(state.getCurrentDimension()).toBe("2D");
        expect(state.getPreviousDimension()).toBe("3D");
        expect(state.getDimensionChanged()).toBe(true);
    });

    it("applies view flag patches and single-flag setters", () => {
        const state = createRuntimeViewState({
            initialViewFlags: {
                viewOrbit: true,
                viewMoonSOI: false,
            },
        });

        expect(state.getViewAuxiliaryPanels()).toBe(false);
        expect(state.getViewPhotoMode()).toBe(false);
        expect(state.getViewEarthClouds()).toBe(true);
        expect(state.getViewOrbit()).toBe(true);
        expect(state.getViewMoonSOI()).toBe(false);
        expect(state.getViewLunarCraters()).toBe(false);
        expect(state.getViewMoonLatLonGrid()).toBe(false);
        expect(state.getViewMoonLatLonLabels()).toBe(true);
        expect(state.getViewMoonLatLonHover()).toBe(false);
        expect(state.getLunarCraterHoverLabels()).toBe(true);
        expect(state.getLunarCraterDisplayMode()).toBe("hover");
        expect(state.getLunarCraterMinDiameterKm()).toBe(80);
        expect(state.getLunarCraterMaxDiameterKm()).toBe(600);
        expect(state.getViewBodyHalos()).toBe(true);
        expect(state.getViewMoonOsculatingOrbit()).toBe(true);
        expect(state.getViewConstellationLines()).toBe(false);

        state.setViewFlags({
            viewPhotoMode: true,
            viewEarthClouds: false,
            viewOrbit: false,
            viewLunarCraters: true,
            viewMoonLatLonGrid: true,
            viewMoonLatLonLabels: false,
            viewMoonLatLonHover: true,
            lunarCraterHoverLabels: false,
            lunarCraterDisplayMode: "always",
            lunarCraterMinDiameterKm: 40,
            lunarCraterMaxDiameterKm: 120,
            viewMoonSOI: true,
            viewBodyHalos: false,
            viewMoonOsculatingOrbit: true,
            viewXYZAxes: false,
            viewConstellationLines: false,
        });

        expect(state.getViewPhotoMode()).toBe(true);
        expect(state.getViewEarthClouds()).toBe(false);
        expect(state.getViewOrbit()).toBe(false);
        expect(state.getViewLunarCraters()).toBe(true);
        expect(state.getViewMoonLatLonGrid()).toBe(true);
        expect(state.getViewMoonLatLonLabels()).toBe(false);
        expect(state.getViewMoonLatLonHover()).toBe(true);
        expect(state.getLunarCraterHoverLabels()).toBe(false);
        expect(state.getLunarCraterDisplayMode()).toBe("always");
        expect(state.getLunarCraterMinDiameterKm()).toBe(40);
        expect(state.getLunarCraterMaxDiameterKm()).toBe(120);
        expect(state.getViewMoonSOI()).toBe(true);
        expect(state.getViewBodyHalos()).toBe(false);
        expect(state.getViewMoonOsculatingOrbit()).toBe(true);
        expect(state.getViewXYZAxes()).toBe(false);
        expect(state.getViewConstellationLines()).toBe(false);

        state.setViewEquatorialPlane(true);
        state.setViewLunarCraters(false);
        state.setLunarCraterHoverLabels(true);
        state.setLunarCraterDisplayMode("hover");
        state.setLunarCraterMinDiameterKm(90);
        state.setLunarCraterMaxDiameterKm(300);
        state.setViewEarthClouds(true);
        state.setViewMoonLatLonGrid(false);
        state.setViewMoonLatLonLabels(true);
        state.setViewMoonLatLonHover(false);
        state.setViewFPS(false);

        const flags = state.getViewFlags();
        expect(flags.viewEarthClouds).toBe(true);
        expect(flags.viewLunarCraters).toBe(false);
        expect(flags.lunarCraterHoverLabels).toBe(true);
        expect(flags.lunarCraterDisplayMode).toBe("hover");
        expect(flags.lunarCraterMinDiameterKm).toBe(90);
        expect(flags.lunarCraterMaxDiameterKm).toBe(300);
        expect(flags.viewEquatorialPlane).toBe(true);
        expect(flags.viewMoonLatLonGrid).toBe(false);
        expect(flags.viewMoonLatLonLabels).toBe(true);
        expect(flags.viewMoonLatLonHover).toBe(false);
        expect(flags.viewFPS).toBe(false);
    });

    it("keeps lunar crater presentation scoped to the current view identity", () => {
        const state = createRuntimeViewState({
            initialConfig: "geo",
            initialCurrentDimension: "3D",
        });

        state.setCurrentViewIdentity({
            originMode: "geo",
            cameraPositionMode: "manual",
            cameraLookMode: "manual",
            planeSelection: "DEFAULT",
            dimension: "3D",
        });
        state.setViewFlags({
            viewLunarCraters: true,
            lunarCraterDisplayMode: "always",
            lunarCraterHoverLabels: false,
            lunarCraterMinDiameterKm: 40,
            lunarCraterMaxDiameterKm: 120,
        });

        state.setCurrentViewIdentity({
            originMode: "geo",
            cameraPositionMode: "spacecraft",
            cameraLookMode: "moon",
            planeSelection: "DEFAULT",
            dimension: "3D",
        });

        expect(state.getViewLunarCraters()).toBe(false);
        expect(state.getLunarCraterDisplayMode()).toBe("hover");
        expect(state.getLunarCraterHoverLabels()).toBe(true);
        expect(state.getLunarCraterMinDiameterKm()).toBe(80);
        expect(state.getLunarCraterMaxDiameterKm()).toBe(600);

        state.setViewFlags({
            viewLunarCraters: true,
            lunarCraterDisplayMode: "hover",
            lunarCraterHoverLabels: true,
            lunarCraterMinDiameterKm: 90,
            lunarCraterMaxDiameterKm: 300,
        });

        state.setCurrentViewIdentity({
            originMode: "geo",
            cameraPositionMode: "manual",
            cameraLookMode: "manual",
            planeSelection: "DEFAULT",
            dimension: "3D",
        });
        expect(state.getViewLunarCraters()).toBe(true);
        expect(state.getLunarCraterDisplayMode()).toBe("always");
        expect(state.getLunarCraterHoverLabels()).toBe(false);
        expect(state.getLunarCraterMinDiameterKm()).toBe(40);
        expect(state.getLunarCraterMaxDiameterKm()).toBe(120);

        state.setCurrentViewIdentity({
            originMode: "geo",
            cameraPositionMode: "spacecraft",
            cameraLookMode: "moon",
            planeSelection: "DEFAULT",
            dimension: "3D",
        });
        expect(state.getViewLunarCraters()).toBe(true);
        expect(state.getLunarCraterDisplayMode()).toBe("hover");
        expect(state.getLunarCraterHoverLabels()).toBe(true);
        expect(state.getLunarCraterMinDiameterKm()).toBe(90);
        expect(state.getLunarCraterMaxDiameterKm()).toBe(300);
    });
});


