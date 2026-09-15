import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
        expect(consoleWarn).toHaveBeenCalledWith("Could not load config.json, using defaults");
        expect(consoleError).not.toHaveBeenCalled();
    });
});
