import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveDockviewEnabled } from "../src/platform/js/core/domain/dockview-policy.js";

function createJsonResponse(value, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: vi.fn(async () => value),
    };
}

describe("mission-data", () => {
    beforeEach(() => {
        vi.resetModules();
        vi.restoreAllMocks();
        global.window = {
            location: {
                search: "?testProfile=ssim",
            },
            missionConfig: {
                dataPath: "assets/ch3/data/",
            },
        };
        global.fetch = vi.fn();
    });

    afterEach(() => {
        delete global.window;
        delete global.fetch;
    });

    it("loads config overlays once and reuses the cached result", async () => {
        const baseConfig = {
            spacecraft_mnemonic: "CH3",
            origins: ["geo"],
            geo: {
                center: "earth_center",
                orbits_file: "geo-CH3",
            },
            ui: {
                headerTitle: "Base Header",
            },
        };
        const profilePatch = {
            ui: {
                headerTitle: "Profile Header",
                dockviewEnabled: false,
            },
        };
        const manifestData = {
            phases: {
                geo: {
                    artifacts: {},
                },
            },
        };
        global.fetch
            .mockResolvedValueOnce(createJsonResponse(baseConfig))
            .mockResolvedValueOnce(createJsonResponse(profilePatch))
            .mockResolvedValueOnce(createJsonResponse(manifestData));

        const consoleDebug = vi.spyOn(console, "debug").mockImplementation(() => {});
        const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const { loadMissionConfig } = await import("../src/platform/js/data/mission-data.js");

        const firstConfig = await loadMissionConfig();
        const secondConfig = await loadMissionConfig();

        expect(global.fetch).toHaveBeenCalledTimes(3);
        expect(global.fetch.mock.calls.map(([url]) => url)).toEqual([
            "assets/ch3/data/config.json",
            "assets/ch3/data/config.ssim.json",
            "assets/ch3/data/ephemeris-manifest.json",
        ]);
        expect(firstConfig).toBe(secondConfig);
        expect(firstConfig.ui.headerTitle).toBe("Profile Header");
        expect(firstConfig.ui.dockviewEnabled).toBe(false);
        expect(firstConfig.ephemeris_manifest).toEqual(manifestData);
        expect(consoleWarn).not.toHaveBeenCalled();
        expect(consoleDebug).toHaveBeenCalledWith("Config loaded successfully:", firstConfig);
    });

    it("returns null when the base config request is unavailable", async () => {
        global.fetch.mockResolvedValueOnce(createJsonResponse({}, 404));

        const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
        const { loadMissionConfig } = await import("../src/platform/js/data/mission-data.js");

        await expect(loadMissionConfig()).resolves.toBeNull();
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(consoleWarn).toHaveBeenCalledWith("Could not load required config.json (404)");
        expect(consoleError).not.toHaveBeenCalled();
    });

    it("deduplicates failed loads but allows an explicit retry and caches its success", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => {});
        vi.spyOn(console, "debug").mockImplementation(() => {});
        const baseConfig = { spacecraft_mnemonic: "CH3", origins: ["geo"], geo: {} };
        global.fetch
            .mockResolvedValueOnce(createJsonResponse({}, 503))
            .mockResolvedValueOnce(createJsonResponse(baseConfig))
            .mockResolvedValueOnce(createJsonResponse({ ui: { dockviewEnabled: false } }))
            .mockResolvedValueOnce(createJsonResponse({}, 404));
        const { loadMissionConfig } = await import("../src/platform/js/data/mission-data.js");

        expect(await Promise.all([loadMissionConfig(), loadMissionConfig()])).toEqual([null, null]);
        expect(global.fetch).toHaveBeenCalledTimes(1);
        await Promise.resolve();
        expect(global.fetch).toHaveBeenCalledTimes(1);

        const [retried, concurrent] = await Promise.all([loadMissionConfig(), loadMissionConfig()]);
        expect(retried).not.toBeNull();
        expect(retried).toBe(concurrent);
        expect(retried.ui.dockviewEnabled).toBe(false);
        expect(global.fetch).toHaveBeenCalledTimes(4);
        expect(await loadMissionConfig()).toBe(retried);
        expect(global.fetch).toHaveBeenCalledTimes(4);
    });

    it("waits for successful config before choosing Dockview, without initiating retries", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => {});
        vi.spyOn(console, "debug").mockImplementation(() => {});
        global.fetch
            .mockResolvedValueOnce(createJsonResponse({}, 503))
            .mockResolvedValueOnce(createJsonResponse({ spacecraft_mnemonic: "CH3", origins: ["geo"], geo: {} }))
            .mockResolvedValueOnce(createJsonResponse({ ui: { dockviewEnabled: false } }))
            .mockResolvedValueOnce(createJsonResponse({}, 404));
        const { loadMissionConfig, whenMissionConfigLoaded } = await import("../src/platform/js/data/mission-data.js");
        const chooseWorkspace = vi.fn(missionConfig => resolveDockviewEnabled({
            urlSearch: "?testProfile=ssim", viewportWidth: 1280, missionConfig,
        }));
        const workspaceReady = whenMissionConfigLoaded().then(chooseWorkspace);
        expect(global.fetch).not.toHaveBeenCalled();
        await expect(loadMissionConfig()).resolves.toBeNull();
        await Promise.resolve();
        expect(chooseWorkspace).not.toHaveBeenCalled();
        expect(global.fetch).toHaveBeenCalledTimes(1);

        const retried = await loadMissionConfig();
        await expect(workspaceReady).resolves.toBe(false);
        expect(chooseWorkspace).toHaveBeenCalledExactlyOnceWith(retried);
        await expect(whenMissionConfigLoaded()).resolves.toBe(retried);
        expect(global.fetch).toHaveBeenCalledTimes(4);
    });
});
