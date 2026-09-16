import { describe, expect, it, vi } from "vitest";

import { createInitConfigOrchestrationActions } from "../src/platform/js/app/init-config-orchestration.js";
import { loadComparisonOverlayConfig } from "../src/platform/js/app/comparison-overlay-loader.js";
import { readFileSync } from "node:fs";

function buildDeps(overrides = {}) {
    let globalConfig = null;
    return {
        loadMissionConfig: vi.fn(async () => ({
            ui: {
                viewDefaults: {
                    viewXYZAxes: false,
                    viewPoles: false,
                },
            },
        })),
        loadComparisonOverlay: undefined,
        getGlobalConfig: vi.fn(() => globalConfig),
        setGlobalConfig: vi.fn((value) => {
            globalConfig = value;
        }),
        setViewFlags: vi.fn(),
        applyViewSettings: vi.fn(),
        setEventInfos: vi.fn(),
        getEphemerisSource: vi.fn(() => "chebyshev"),
        setEphemerisSource: vi.fn(),
        setBodyEphemerisSources: vi.fn(),
        setEphemerisStatusesForConfig: vi.fn(),
        bindInfoPanelControls: vi.fn(),
        updateEphemerisPanel: vi.fn(),
        applyMissionMetadata: vi.fn(),
        getPlanetProperties: vi.fn(() => ({})),
        documentRef: {},
        updateMultipleElementsText: vi.fn(),
        updateSpacecraftMnemonic: vi.fn(),
        updateMoonUIFromConfig: vi.fn(),
        updateLandingUIFromConfig: vi.fn(),
        applyLandingTimesUpdate: vi.fn(),
        computeLandingTimesUpdate: vi.fn(() => ({})),
        createUTCTimestamp: vi.fn(),
        setStartLandingTime: vi.fn(),
        setEndLandingTime: vi.fn(),
        consoleRef: { debug: vi.fn() },
        applyEventsUpdate: vi.fn(),
        computeEventsUpdate: vi.fn(() => ({ shouldUpdate: false })),
        getConfig: vi.fn(() => "geo"),
        getDataEndTimeMs: vi.fn(() => 0),
        computeMissionEventTimes: vi.fn(() => ({})),
        setTimeTransLunarInjection: vi.fn(),
        setTimeLunarOrbitInsertion: vi.fn(),
        getSceneHandler: vi.fn(() => null),
        setSceneHandler: vi.fn(),
        SceneHandlerClass: class {},
        loadProgress: null,
        ...overrides,
    };
}

describe("createInitConfigOrchestrationActions", () => {
    it("retries required comparison without refetching or mutating the cached primary configuration", async () => {
        vi.resetModules();
        const primary = JSON.parse(readFileSync(new URL("../assets/chandrayaan3/data/config.json", import.meta.url), "utf8"));
        const secondary = JSON.parse(readFileSync(new URL("../assets/artemis1/data/config.json", import.meta.url), "utf8"));
        let failSecondary = true, primaryRequests = 0, secondaryRequests = 0;
        const windowRef = { location: { search: "?mode=compare&compareMission=artemis1" },
            missionConfig: { dataPath: "assets/chandrayaan3/data/" } };
        const fetchImpl = vi.fn(async url => {
            if (url === "assets/chandrayaan3/data/config.json") {
                primaryRequests += 1;
                return { ok: true, json: async () => structuredClone(primary) };
            }
            if (url === "assets/artemis1/data/config.json") {
                secondaryRequests += 1;
                return failSecondary ? { ok: false, status: 503 } : { ok: true, json: async () => structuredClone(secondary) };
            }
            return { ok: false, status: 404 };
        });
        vi.stubGlobal("window", windowRef);
        vi.stubGlobal("fetch", fetchImpl);
        const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
        try {
            const { loadMissionConfig } = await import("../src/platform/js/data/mission-data.js");
            const deps = buildDeps({ loadMissionConfig, loadComparisonOverlay: baseConfig => loadComparisonOverlayConfig({
                baseConfig, windowRef, fetchImpl, createUTCTimestamp: () => 0,
            }) });
            const actions = createInitConfigOrchestrationActions(deps);
            await expect(actions.ensureGlobalConfigLoaded()).rejects.toMatchObject({ name: "ComparisonLoadError" });
            expect(deps.setGlobalConfig).not.toHaveBeenCalled();
            expect(deps.bindInfoPanelControls).not.toHaveBeenCalled();
            const cached = await loadMissionConfig();
            const snapshot = structuredClone(cached);
            failSecondary = false;
            await actions.ensureGlobalConfigLoaded();
            expect(primaryRequests).toBe(1);
            expect(secondaryRequests).toBe(2);
            expect(deps.setGlobalConfig).toHaveBeenCalledOnce();
            expect(deps.getGlobalConfig().comparisonOverlay.compareCraftId).toMatch(/^CMP_ARTEMIS1_/);
            expect(cached).toEqual(snapshot);
            expect(cached.comparisonOverlay).toBeUndefined();
            expect(await loadMissionConfig()).toBe(cached);
        } finally { debug.mockRestore(); vi.unstubAllGlobals(); }
    });

    it("releases a failed shared load so an explicit retry can publish", async () => {
        let reject;
        const pending = new Promise((resolve, fail) => { reject = fail; });
        const config = { origins: ["geo"] };
        const deps = buildDeps({ loadMissionConfig: vi.fn().mockReturnValueOnce(pending).mockResolvedValue(config) });
        const actions = createInitConfigOrchestrationActions(deps);
        const attempts = Promise.allSettled([actions.ensureGlobalConfigLoaded(), actions.ensureGlobalConfigLoaded()]);
        reject(new Error("offline"));
        expect((await attempts).map(result => result.status)).toEqual(["rejected", "rejected"]);
        expect(deps.loadMissionConfig).toHaveBeenCalledOnce();
        expect(deps.setGlobalConfig).not.toHaveBeenCalled();
        await actions.ensureGlobalConfigLoaded();
        expect(deps.loadMissionConfig).toHaveBeenCalledTimes(2);
        expect(deps.setGlobalConfig).toHaveBeenCalledExactlyOnceWith(config);
    });

    it("shares pending configuration work and publishes mission defaults only once", async () => {
        let release;
        const loaded = new Promise(resolve => { release = resolve; });
        const config = { ui: { viewDefaults: { viewSky: false } } };
        const deps = buildDeps({ loadMissionConfig: vi.fn(() => loaded) });
        const actions = createInitConfigOrchestrationActions(deps);
        const first = actions.ensureGlobalConfigLoaded();
        const second = actions.ensureGlobalConfigLoaded();
        release(config);
        await Promise.all([first, second]);
        expect(deps.loadMissionConfig).toHaveBeenCalledOnce();
        expect(deps.setGlobalConfig).toHaveBeenCalledExactlyOnceWith(config);
        expect(deps.applyViewSettings).toHaveBeenCalledOnce();
        expect(deps.bindInfoPanelControls).toHaveBeenCalledOnce();
        await actions.ensureGlobalConfigLoaded();
        expect(deps.applyViewSettings).toHaveBeenCalledOnce();
    });

    it("fails required configuration without publishing defaults and allows explicit retry", async () => {
        const loadedConfig = { ui: { dockviewEnabled: false } };
        const deps = buildDeps({
            loadMissionConfig: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(loadedConfig),
            loadComparisonOverlay: vi.fn(async config => config),
        });
        const actions = createInitConfigOrchestrationActions(deps);

        await expect(actions.ensureGlobalConfigLoaded()).rejects.toThrow("Required mission configuration failed to load");
        expect(deps.getGlobalConfig()).toBeNull();
        expect(deps.loadComparisonOverlay).not.toHaveBeenCalled();
        expect(deps.setGlobalConfig).not.toHaveBeenCalled();
        expect(deps.setEventInfos).not.toHaveBeenCalled();
        expect(deps.bindInfoPanelControls).not.toHaveBeenCalled();
        expect(deps.applyMissionMetadata).not.toHaveBeenCalled();
        expect(deps.loadMissionConfig).toHaveBeenCalledOnce();

        await actions.ensureGlobalConfigLoaded();
        expect(deps.getGlobalConfig()).toBe(loadedConfig);
        expect(deps.setGlobalConfig).toHaveBeenCalledExactlyOnceWith(loadedConfig);
        expect(deps.loadMissionConfig).toHaveBeenCalledTimes(2);
    });

    it("applies mission-config view defaults when config loads", async () => {
        const deps = buildDeps();
        const actions = createInitConfigOrchestrationActions(deps);

        await actions.ensureGlobalConfigLoaded();

        expect(deps.setViewFlags).toHaveBeenCalledWith({
            viewXYZAxes: false,
            viewPoles: false,
        });
        expect(deps.applyViewSettings).toHaveBeenCalledWith({
            viewXYZAxes: false,
            viewPoles: false,
        });
    });

    it("does not apply view defaults when config omits them", async () => {
        const deps = buildDeps({
            loadMissionConfig: vi.fn(async () => ({ ui: {} })),
        });
        const actions = createInitConfigOrchestrationActions(deps);

        await actions.ensureGlobalConfigLoaded();

        expect(deps.setViewFlags).not.toHaveBeenCalled();
        expect(deps.applyViewSettings).not.toHaveBeenCalled();
    });

    it("applies mission-config moon visual aids even in test mode", async () => {
        const deps = buildDeps({
            isTestMode: true,
            loadMissionConfig: vi.fn(async () => ({
                ui: {
                    viewDefaults: {
                        viewBodyHalos: true,
                        viewMoonOsculatingOrbit: true,
                    },
                },
            })),
        });
        const actions = createInitConfigOrchestrationActions(deps);

        await actions.ensureGlobalConfigLoaded();

        expect(deps.setViewFlags).toHaveBeenCalledWith({
            viewBodyHalos: true,
            viewMoonOsculatingOrbit: true,
        });
        expect(deps.applyViewSettings).toHaveBeenCalledWith({
            viewBodyHalos: true,
            viewMoonOsculatingOrbit: true,
        });
    });

    it("applies comparison overlay loading before publishing the global config", async () => {
        const deps = buildDeps({
            loadMissionConfig: vi.fn(async () => ({
                mission_name: "Primary",
                ui: {},
            })),
            loadComparisonOverlay: vi.fn(async (baseConfig) => ({
                ...baseConfig,
                comparisonOverlay: {
                    compareCraftId: "CMP_ARTEMIS1_ORION",
                },
            })),
        });
        const actions = createInitConfigOrchestrationActions(deps);

        await actions.ensureGlobalConfigLoaded();

        expect(deps.loadComparisonOverlay).toHaveBeenCalledWith({
            mission_name: "Primary",
            ui: {},
        });
        expect(deps.setGlobalConfig).toHaveBeenCalledWith({
            mission_name: "Primary",
            ui: {},
            comparisonOverlay: {
                compareCraftId: "CMP_ARTEMIS1_ORION",
            },
        });
    });

    it("enables additional crafts by default when comparison overlay supplies a visible pair", async () => {
        const deps = buildDeps({
            loadMissionConfig: vi.fn(async () => ({
                ui: {},
            })),
            loadComparisonOverlay: vi.fn(async (baseConfig) => ({
                ...baseConfig,
                comparisonOverlay: {
                    compareCraftId: "CMP_ARTEMIS1_ORION",
                    defaultVisibleCraftIds: ["SC", "CMP_ARTEMIS1_ORION"],
                },
            })),
        });
        const actions = createInitConfigOrchestrationActions(deps);

        await actions.ensureGlobalConfigLoaded();

        expect(deps.setViewFlags).toHaveBeenCalledWith({
            viewAdditionalCrafts: true,
        });
        expect(deps.applyViewSettings).toHaveBeenCalledWith({
            viewAdditionalCrafts: true,
        });
    });
});

