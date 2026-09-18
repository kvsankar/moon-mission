import { describe, expect, it, vi } from "vitest";

import { createMissionStatePorts } from "../src/platform/js/core/state/mission-state-port-builders.js";

/**
 * The ports are the seam between mission runtime code and the state cells.
 * Each one is built from a context object plus a cell map; these tests drive
 * them through that seam with real cells backed by a plain object.
 */
function createCells(initial = {}) {
    const values = { ...initial };
    const cells = new Proxy({}, {
        get(_target, key) {
            if (typeof key !== "string") return undefined;
            return {
                get: () => values[key],
                set: (value) => { values[key] = value; },
            };
        },
        has: () => true,
    });
    return { cells, values };
}

function createContext(overrides = {}) {
    const { cells, values } = createCells({
        config: "geo",
        currentDimension: "3D",
        ephemerisSource: "chebyshev",
        bodyEphemerisSources: { MOON: "npz" },
        lastInputActivityMs: 1000,
        ...(overrides.initialState || {}),
    });

    const context = {
        state: cells,
        planetProperties: { SC: { name: "SC" } },
        animationScenes: {
            geo: { planetsForLocations: ["EARTH", "MOON", "SC"] },
            lunar: { planetsForLocations: ["MOON", "EARTH"] },
        },
        runtimeFlags: { joyRide: false, landing: false },
        landingNpzData: {},
        landingNpzLoaded: {},
        landingChebyshevData: {},
        landingChebyshevLoaded: {},
        orbitDataProcessed: { geo: true },
        chebyshevData: { geo: {} },
        chebyshevDataLoaded: { geo: true },
        npzData: {},
        npzDataLoaded: {},
        ephemerisStatuses: {},
        resolveBodySource: vi.fn(({ bodyId, bodySources, defaultSpacecraftSource }) =>
            bodySources?.[bodyId] || defaultSpacecraftSource),
        getActiveEphemerisSource: vi.fn((cfg) => `active:${cfg}`),
        getRuntimeBootstrapActions: vi.fn(() => ({
            burnButtonHandler: "burn-handler",
            toggleLanding: vi.fn(),
        })),
        getAnimationSceneInitDone: vi.fn(() => true),
        getPlaneVariablesState: vi.fn(() => ({
            xFactor: 1, yFactor: -1, xVariable: "x", yVariable: "y",
        })),
        getZoomFactorState: vi.fn(() => 2),
        getPanXState: vi.fn(() => 10),
        getPanYState: vi.fn(() => 20),
        getPlaneSelectionState: vi.fn(() => "XY"),
        setPlaneVariablesState: vi.fn(),
        syncPlaneStateForConfig: vi.fn(),
        ...overrides,
    };

    return { ports: createMissionStatePorts(context), context, values };
}

describe("port composition", () => {
    it("builds all six mission state ports", () => {
        const { ports } = createContext();

        expect(Object.keys(ports).sort()).toEqual([
            "app", "data", "interaction", "sceneRuntime", "sceneView", "session",
        ]);
    });
});

describe("application state port", () => {
    it("round-trips the mission configuration and frame", () => {
        const { ports, values } = createContext();

        ports.app.setGlobalConfig({ mission_name: "Artemis II" });
        ports.app.setConfig("lunar");
        ports.app.setCurrentDimension("2D");
        ports.app.setPreviousDimension("3D");
        ports.app.setDimensionChanged(true);

        expect(ports.app.getGlobalConfig()).toEqual({ mission_name: "Artemis II" });
        expect(ports.app.getConfig()).toBe("lunar");
        expect(ports.app.getCurrentDimension()).toBe("2D");
        expect(ports.app.getPreviousDimension()).toBe("3D");
        expect(ports.app.getDimensionChanged()).toBe(true);
        expect(values.config).toBe("lunar");
    });

    it("reports a transition revision of zero when the cell has none", () => {
        const { ports } = createContext();

        expect(ports.app.getTransitionRevision()).toBe(0);
    });

    it("reports the live transition revision when the cell supplies one", () => {
        const { ports } = createContext({ initialState: { transitionRevision: 7 } });

        expect(ports.app.getTransitionRevision()).toBe(7);
    });

    it("round-trips the SVG container and load flag", () => {
        const { ports } = createContext();

        ports.app.setSvgContainer({ id: "svg" });
        ports.app.setDataLoaded(true);

        expect(ports.app.getSvgContainer()).toEqual({ id: "svg" });
        expect(ports.app.getDataLoaded()).toBe(true);
    });
});

describe("data state port", () => {
    it("lists the bodies for the current configuration", () => {
        const { ports } = createContext();

        expect(ports.data.getBodiesForConfig()).toEqual(["EARTH", "MOON", "SC"]);
        expect(ports.data.getBodiesForConfig("lunar")).toEqual(["MOON", "EARTH"]);
    });

    it("reports no bodies for an unknown configuration", () => {
        const { ports } = createContext();

        expect(ports.data.getBodiesForConfig("helio")).toEqual([]);
    });

    it("resolves a per-body ephemeris source with the default as fallback", () => {
        const { ports } = createContext();

        expect(ports.data.getBodySource("MOON")).toBe("npz");
        expect(ports.data.getBodySource("SC")).toBe("chebyshev");
        expect(ports.data.resolveBodySourceFn("MOON")).toBe("npz");
    });

    it("falls back to the scene keys when no origins are configured", () => {
        const { ports } = createContext();

        expect(ports.data.getConfigsList()).toEqual(expect.arrayContaining(["geo", "lunar"]));
    });

    it("keeps landing data per configuration", () => {
        const { ports } = createContext();

        ports.data.setLandingNpzLoaded("geo", true);
        ports.data.setLandingNpzData("geo", { samples: 3 });
        ports.data.setLandingChebyshevLoaded("lunar", true);
        ports.data.setLandingChebyshevData("lunar", { segments: 2 });

        expect(ports.data.getLandingNpzLoaded("geo")).toBe(true);
        expect(ports.data.getLandingNpzData("geo")).toEqual({ samples: 3 });
        expect(ports.data.getLandingChebyshevLoaded("lunar")).toBe(true);
        expect(ports.data.getLandingChebyshevData("lunar")).toEqual({ segments: 2 });
    });

    it("defaults landing lookups to the current configuration", () => {
        const { ports } = createContext();
        ports.data.setLandingNpzLoaded("geo", true);

        expect(ports.data.getLandingNpzLoaded()).toBe(true);
        expect(ports.data.getLandingChebyshevLoaded()).toBe(false);
    });

    it("exposes the shared ephemeris tables by reference", () => {
        const { ports, context } = createContext();

        expect(ports.data.getChebyshevData()).toBe(context.chebyshevData);
        expect(ports.data.getChebyshevDataLoaded()).toBe(context.chebyshevDataLoaded);
        expect(ports.data.getNpzData()).toBe(context.npzData);
        expect(ports.data.getNpzDataLoaded()).toBe(context.npzDataLoaded);
    });

    it("records an ephemeris status per configuration", () => {
        const { ports, context } = createContext();

        ports.data.setEphemerisStatusesForConfig("geo", "ready");

        expect(context.ephemerisStatuses.geo).toBe("ready");
    });

    it("round-trips the ephemeris source selections", () => {
        const { ports } = createContext();

        ports.data.setEphemerisSource("npz");
        ports.data.setBodyEphemerisSources({ SC: "npz" });

        expect(ports.data.getEphemerisSource()).toBe("npz");
        expect(ports.data.getEphemerisSourceFromData()).toBe("npz");
        expect(ports.data.getBodySources()).toEqual({ SC: "npz" });
    });

    it("reports whether orbit data was processed for a configuration", () => {
        const { ports } = createContext();

        expect(ports.data.isOrbitDataProcessed("geo")).toBe(true);
        expect(ports.data.isOrbitDataProcessed("lunar")).toBeUndefined();
    });

    it("delegates the active ephemeris source per configuration", () => {
        const { ports, context } = createContext();

        expect(ports.data.getActiveEphemerisSourceForConfig("lunar")).toBe("active:lunar");
        expect(context.getActiveEphemerisSource).toHaveBeenCalledWith("lunar");
    });

    it("hands back the shared planet presentation table", () => {
        const { ports, context } = createContext();

        expect(ports.data.getPlanetProperties()).toBe(context.planetProperties);
    });

    it("round-trips the timeline event list", () => {
        const { ports } = createContext();

        ports.data.setEventInfos([{ key: "tli" }]);

        expect(ports.data.getEventInfos()).toEqual([{ key: "tli" }]);
    });
});

describe("session state port", () => {
    it("round-trips the camera mode flags on the shared runtime object", () => {
        const { ports, context } = createContext();

        ports.session.setJoyRideFlag(true);
        ports.session.setLandingFlag(true);

        expect(ports.session.getJoyRideFlag()).toBe(true);
        expect(ports.session.getLandingFlag()).toBe(true);
        expect(context.runtimeFlags).toEqual({ joyRide: true, landing: true });
    });

    it("round-trips the animation time", () => {
        const { ports } = createContext();

        ports.session.setAnimTime(1_700_000);

        expect(ports.session.getAnimTime()).toBe(1_700_000);
    });

    it("reads the playback flag without exposing a setter", () => {
        const { ports } = createContext({ initialState: { animationRunning: true } });

        expect(ports.session.getAnimationRunning()).toBe(true);
        expect(ports.session.setAnimationRunning).toBeUndefined();
    });
});

describe("scene view state port", () => {
    it("reads the plane projection for the current configuration", () => {
        const { ports, context } = createContext();

        expect(ports.sceneView.getPlaneVariables()).toEqual({
            xFactor: 1, yFactor: -1, xVariable: "x", yVariable: "y",
        });
        expect(ports.sceneView.getXFactor()).toBe(1);
        expect(ports.sceneView.getYFactor()).toBe(-1);
        expect(ports.sceneView.getXVariable()).toBe("x");
        expect(ports.sceneView.getYVariable()).toBe("y");
        expect(context.getPlaneVariablesState).toHaveBeenCalledWith("geo");
    });

    it("reads the zoom and pan for the current configuration", () => {
        const { ports } = createContext();

        expect(ports.sceneView.getZoomFactor()).toBe(2);
        expect(ports.sceneView.getPanX()).toBe(10);
        expect(ports.sceneView.getPanY()).toBe(20);
        expect(ports.sceneView.getPlaneSelection()).toBe("XY");
    });

    it("writes the plane projection against the current configuration", () => {
        const { ports, context } = createContext();

        ports.sceneView.setPlaneVariables({ xVariable: "z" });

        expect(context.setPlaneVariablesState).toHaveBeenCalledWith({ xVariable: "z" }, "geo");
    });

    it("applies only the view flags the caller supplied", () => {
        const { ports, values } = createContext();

        ports.sceneView.setViewFlags({ viewOrbit: true, viewCraters: undefined });

        expect(values.viewOrbit).toBe(true);
        expect("viewCraters" in values).toBe(false);
    });

    it("coerces supplied view flags to booleans", () => {
        const { ports, values } = createContext();

        ports.sceneView.setViewFlags({ viewOrbit: 1, viewLunarCraters: "" });

        expect(values.viewOrbit).toBe(true);
        expect(values.viewLunarCraters).toBe(false);
    });

    it("applies only finite numeric view settings", () => {
        const { ports, values } = createContext();

        ports.sceneView.setViewFlags({
            lunarCraterMinDiameterKm: 40,
            lunarCraterMaxDiameterKm: "not a number",
        });

        expect(values.lunarCraterMinDiameterKm).toBe(40);
        expect("lunarCraterMaxDiameterKm" in values).toBe(false);
    });

    it("accepts only the two authored crater display modes", () => {
        const { ports, values } = createContext();

        ports.sceneView.setViewFlags({ lunarCraterDisplayMode: "always" });
        expect(values.lunarCraterDisplayMode).toBe("always");

        ports.sceneView.setViewFlags({ lunarCraterDisplayMode: "sometimes" });
        expect(values.lunarCraterDisplayMode).toBe("always");
    });

    it("applies the lunar feature filter objects only when they are objects", () => {
        const { ports, values } = createContext();

        ports.sceneView.setViewFlags({ lunarFeatureTypeFilters: { "Mare, maria": {} } });
        expect(values.lunarFeatureTypeFilters).toEqual({ "Mare, maria": {} });

        ports.sceneView.setViewFlags({ lunarFeatureTypeFilters: "everything" });
        expect(values.lunarFeatureTypeFilters).toEqual({ "Mare, maria": {} });
    });

    it("applies a search query only when it is a string", () => {
        const { ports, values } = createContext();

        ports.sceneView.setViewFlags({ lunarFeatureSearchQuery: "tycho" });
        expect(values.lunarFeatureSearchQuery).toBe("tycho");

        ports.sceneView.setViewFlags({ lunarFeatureSearchQuery: 42 });
        expect(values.lunarFeatureSearchQuery).toBe("tycho");
    });

    it("carries both lunar feature mode flags through", () => {
        const { ports, values } = createContext();

        ports.sceneView.setViewFlags({
            lunarCraterShowAllEnabled: true,
            lunarCraterHoverEnabled: false,
        });

        expect(values.lunarCraterShowAllEnabled).toBe(true);
        expect(values.lunarCraterHoverEnabled).toBe(false);
    });
});

describe("scene runtime port", () => {
    it("round-trips the scene handler", () => {
        const { ports } = createContext();

        ports.sceneRuntime.setSceneHandler({ id: "handler" });

        expect(ports.sceneRuntime.getSceneHandler()).toEqual({ id: "handler" });
    });

    it("writes a scene state only for a mounted scene", () => {
        const { ports, context } = createContext();

        ports.sceneRuntime.setSceneState("geo", 3);
        ports.sceneRuntime.setSceneState("helio", 3);

        expect(context.animationScenes.geo.state).toBe(3);
        expect(context.animationScenes.helio).toBeUndefined();
    });

    it("reads the burn handler from the live bootstrap actions", () => {
        const { ports } = createContext();

        expect(ports.sceneRuntime.getBurnButtonHandler()).toBe("burn-handler");
    });

    it("reports no burn handler before bootstrap", () => {
        const { ports } = createContext({ getRuntimeBootstrapActions: () => null });

        expect(ports.sceneRuntime.getBurnButtonHandler()).toBeUndefined();
    });

    it("reports scene initialization completion", () => {
        const { ports } = createContext();

        expect(ports.sceneRuntime.getSceneStateInitDone()).toBe(true);
    });

    it("delegates the landing toggle to the bootstrap actions", () => {
        const toggleLanding = vi.fn();
        const { ports } = createContext({
            getRuntimeBootstrapActions: () => ({ toggleLanding }),
        });

        ports.sceneRuntime.toggleLanding();

        expect(toggleLanding).toHaveBeenCalledTimes(1);
    });
});

describe("interaction state port", () => {
    it("clears the landing start flag", () => {
        const { ports } = createContext({ initialState: { startLandingFlag: true } });

        expect(ports.interaction.getStartLandingFlag()).toBe(true);
        ports.interaction.clearStartLandingFlag();
        expect(ports.interaction.getStartLandingFlag()).toBe(false);
    });

    it("round-trips the pending timeout handles", () => {
        const { ports } = createContext();

        ports.interaction.setMouseDownTimeout(11);
        ports.interaction.setTimeoutHandleZoom(22);

        expect(ports.interaction.getMouseDownTimeout()).toBe(11);
        expect(ports.interaction.getTimeoutHandleZoom()).toBe(22);
    });

    it("round-trips the mission start flag", () => {
        const { ports } = createContext();

        ports.interaction.setMissionStartCalled(true);

        expect(ports.interaction.getMissionStartCalled()).toBe(true);
    });

    it("records input activity and reports it back", () => {
        const { ports } = createContext();

        expect(ports.interaction.markInputActivity(5000)).toBe(5000);
        expect(ports.interaction.getLastInputActivityMs()).toBe(5000);
    });

    it("defaults the activity stamp to now", () => {
        const { ports } = createContext();

        const stamped = ports.interaction.markInputActivity();

        expect(stamped).toBeGreaterThan(0);
        expect(ports.interaction.getInputIdleMs(stamped)).toBe(0);
    });

    it("measures the idle interval since the last activity", () => {
        const { ports } = createContext();
        ports.interaction.markInputActivity(1000);

        expect(ports.interaction.getInputIdleMs(4000)).toBe(3000);
    });

    it("never reports a negative idle interval", () => {
        const { ports } = createContext();
        ports.interaction.markInputActivity(5000);

        expect(ports.interaction.getInputIdleMs(1000)).toBe(0);
    });

    it("reports an infinite idle interval without a usable stamp", () => {
        const { ports } = createContext({ initialState: { lastInputActivityMs: undefined } });

        expect(ports.interaction.getInputIdleMs(1000)).toBe(Infinity);
        expect(ports.interaction.getInputIdleMs(Number.NaN)).toBe(Infinity);
    });

    it("reports recent activity inside the grace window only", () => {
        const { ports } = createContext();
        ports.interaction.markInputActivity(1000);

        expect(ports.interaction.isInputRecentlyActive(2000, 2500)).toBe(true);
        expect(ports.interaction.isInputRecentlyActive(2000, 3500)).toBe(false);
    });

    it("treats a missing or negative grace window as no grace", () => {
        const { ports } = createContext();
        ports.interaction.markInputActivity(1000);

        expect(ports.interaction.isInputRecentlyActive(undefined, 1000)).toBe(false);
        expect(ports.interaction.isInputRecentlyActive(-500, 1000)).toBe(false);
    });

    it("reports no recent activity without a usable stamp", () => {
        const { ports } = createContext({ initialState: { lastInputActivityMs: undefined } });

        expect(ports.interaction.isInputRecentlyActive(1000, 1000)).toBe(false);
    });
});

describe("full view flag projection", () => {
    const BOOLEAN_VIEW_KEYS = [
        "viewPhotoMode", "viewEarthClouds", "viewAuxiliaryPanels", "viewOrbit",
        "viewOrbitDescent", "viewCraters", "viewLunarCraters",
        "lunarCraterShowAllEnabled", "lunarCraterHoverEnabled",
        "viewMoonLatLonGrid", "viewMoonLatLonLabels", "viewMoonLatLonHover",
        "viewEarthLatLonGrid", "viewEarthLatLonLabels", "viewEarthLatLonHover",
        "lunarCraterHoverLabels", "viewXYZAxes", "viewPoles", "viewPolarAxes",
        "viewEarthPoles", "viewMoonPoles", "viewEarthPolarAxes", "viewMoonPolarAxes",
        "viewSky", "viewConstellationLines", "viewMoonSOI", "viewMoonHillSphere",
        "viewBodyHalos", "viewMoonOsculatingOrbit", "viewSubSolarEarth",
        "viewSubSolarMoon", "viewSubMoonEarth", "viewSolarGlintEarth",
        "viewLunarGlintEarth", "viewSubCraftEarth", "viewSubCraftMoon",
        "viewAntiSolarEarth", "viewAntiSolarMoon", "viewAntiMoonEarth",
        "viewAntiCraftEarth", "viewAntiCraftMoon", "viewEclipticPlane",
        "viewEquatorialPlane", "viewFPS",
    ];

    it("carries every published boolean view flag to its own cell", () => {
        // A key typed twice, or mapped to a neighbouring cell, shows up here.
        const { ports, values } = createContext();
        const view = Object.fromEntries(BOOLEAN_VIEW_KEYS.map((key) => [key, true]));

        ports.sceneView.setViewFlags(view);

        for (const key of BOOLEAN_VIEW_KEYS) {
            expect(values[key], `${key} did not reach its cell`).toBe(true);
        }
    });

    it("carries a fully false view flag set through as well", () => {
        const { ports, values } = createContext();
        const view = Object.fromEntries(BOOLEAN_VIEW_KEYS.map((key) => [key, false]));

        ports.sceneView.setViewFlags(view);

        for (const key of BOOLEAN_VIEW_KEYS) {
            expect(values[key], `${key} did not reach its cell`).toBe(false);
        }
    });

    it("leaves every cell untouched for an empty patch", () => {
        const { ports, values } = createContext();

        ports.sceneView.setViewFlags({});

        for (const key of BOOLEAN_VIEW_KEYS) {
            expect(key in values, `${key} was written by an empty patch`).toBe(false);
        }
    });

    it("carries the hover-scoped lunar feature filters", () => {
        const { ports, values } = createContext();

        ports.sceneView.setViewFlags({
            lunarFeatureHoverTypeFilters: { "Mare, maria": {} },
            lunarFeatureHoverSearchQuery: "mare",
            lunarFeatureHoverExcludedKeys: ["k1"],
            lunarCraterHoverMinDiameterKm: 5,
            lunarCraterHoverMaxDiameterKm: 500,
        });

        expect(values.lunarFeatureHoverTypeFilters).toEqual({ "Mare, maria": {} });
        expect(values.lunarFeatureHoverSearchQuery).toBe("mare");
        expect(values.lunarFeatureHoverExcludedKeys).toEqual(["k1"]);
        expect(values.lunarCraterHoverMinDiameterKm).toBe(5);
        expect(values.lunarCraterHoverMaxDiameterKm).toBe(500);
    });

    it("applies excluded key lists only when they are arrays", () => {
        const { ports, values } = createContext();

        ports.sceneView.setViewFlags({ lunarFeatureExcludedKeys: ["a"] });
        expect(values.lunarFeatureExcludedKeys).toEqual(["a"]);

        ports.sceneView.setViewFlags({ lunarFeatureExcludedKeys: "a,b" });
        expect(values.lunarFeatureExcludedKeys).toEqual(["a"]);
    });

    it("accepts only the two authored orbit styles", () => {
        const { ports, values } = createContext();

        ports.sceneView.setViewFlags({ orbitStyle: "trail" });
        expect(values.orbitStyle).toBe("trail");

        ports.sceneView.setViewFlags({ orbitStyle: "sparkly" });
        expect(values.orbitStyle).toBe("trail");

        ports.sceneView.setViewFlags({ orbitStyle: "classic" });
        expect(values.orbitStyle).toBe("classic");
    });

    it("applies only finite trail brightness values", () => {
        const { ports, values } = createContext();

        ports.sceneView.setViewFlags({
            trailTrackBrightness2D: 0.5,
            trailTrackBrightness3D: 0.6,
            trailTailBrightness2D: 0.7,
            trailTailBrightness3D: Number.NaN,
        });

        expect(values.trailTrackBrightness2D).toBe(0.5);
        expect(values.trailTrackBrightness3D).toBe(0.6);
        expect(values.trailTailBrightness2D).toBe(0.7);
        expect("trailTailBrightness3D" in values).toBe(false);
    });
});

describe("scene view readback", () => {
    it("reads every lunar feature cell back through its own getter", () => {
        const { ports } = createContext({
            initialState: {
                viewSky: true,
                viewConstellationLines: false,
                lunarCraterHoverLabels: true,
                lunarCraterDisplayMode: "always",
                lunarCraterMinDiameterKm: 40,
                lunarCraterMaxDiameterKm: 400,
                lunarCraterHoverMinDiameterKm: 5,
                lunarCraterHoverMaxDiameterKm: 500,
                lunarFeatureTypeFilters: { a: 1 },
                lunarFeatureSearchQuery: "tycho",
                lunarFeatureExcludedKeys: ["k"],
                lunarFeatureHoverTypeFilters: { b: 2 },
                lunarFeatureHoverSearchQuery: "mare",
                lunarFeatureHoverExcludedKeys: ["h"],
            },
        });

        expect(ports.sceneView.getViewSky()).toBe(true);
        expect(ports.sceneView.getViewConstellationLines()).toBe(false);
        expect(ports.sceneView.getLunarCraterHoverLabels()).toBe(true);
        expect(ports.sceneView.getLunarCraterDisplayMode()).toBe("always");
        expect(ports.sceneView.getLunarCraterMinDiameterKm()).toBe(40);
        expect(ports.sceneView.getLunarCraterMaxDiameterKm()).toBe(400);
        expect(ports.sceneView.getLunarCraterHoverMinDiameterKm()).toBe(5);
        expect(ports.sceneView.getLunarCraterHoverMaxDiameterKm()).toBe(500);
        expect(ports.sceneView.getLunarFeatureTypeFilters()).toEqual({ a: 1 });
        expect(ports.sceneView.getLunarFeatureSearchQuery()).toBe("tycho");
        expect(ports.sceneView.getLunarFeatureExcludedKeys()).toEqual(["k"]);
        expect(ports.sceneView.getLunarFeatureHoverTypeFilters()).toEqual({ b: 2 });
        expect(ports.sceneView.getLunarFeatureHoverSearchQuery()).toBe("mare");
        expect(ports.sceneView.getLunarFeatureHoverExcludedKeys()).toEqual(["h"]);
    });

    it("reads the trail brightness cells back", () => {
        const { ports } = createContext({
            initialState: {
                orbitStyle: "trail",
                trailTrackBrightness2D: 0.1,
                trailTrackBrightness3D: 0.2,
                trailTailBrightness2D: 0.3,
                trailTailBrightness3D: 0.4,
            },
        });

        expect(ports.sceneView.getOrbitStyle()).toBe("trail");
        expect(ports.sceneView.getTrailTrackBrightness2D()).toBe(0.1);
        expect(ports.sceneView.getTrailTrackBrightness3D()).toBe(0.2);
        expect(ports.sceneView.getTrailTailBrightness2D()).toBe(0.3);
        expect(ports.sceneView.getTrailTailBrightness3D()).toBe(0.4);
    });

    it("prefers a dedicated effective-orbit-style cell when one exists", () => {
        const { ports } = createContext({
            initialState: { orbitStyle: "trail", effectiveOrbitStyle: "classic" },
        });

        expect(ports.sceneView.getEffectiveOrbitStyle()).toBe("classic");
    });

    it("reads the per-configuration view helpers", () => {
        const { ports, context } = createContext();

        expect(ports.sceneView.getPlaneVariablesStateForConfig()).toEqual({
            xFactor: 1, yFactor: -1, xVariable: "x", yVariable: "y",
        });
        expect(ports.sceneView.getZoomFactorStateForConfig()).toBe(2);
        expect(ports.sceneView.getPanXStateForConfig()).toBe(10);
        expect(ports.sceneView.getPanYStateForConfig()).toBe(20);
        expect(context.getZoomFactorState).toHaveBeenCalledWith("geo");
    });

    it("resyncs the plane state when the origin changes", () => {
        const { ports, context } = createContext();

        ports.sceneView.onConfigChanged("lunar");

        expect(context.syncPlaneStateForConfig).toHaveBeenCalledWith("lunar");
    });
});
