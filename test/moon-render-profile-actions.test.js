import { describe, expect, it, vi } from "vitest";

import { createMoonRenderProfileActions } from "../src/platform/js/app/moon-render-profile-actions.js";

function createHarness(globalObject = {}) {
    return createMoonRenderProfileActions({
        THREE: { LinearFilter: "LinearFilter" },
        animationScenes: {},
        loadSceneTextures: vi.fn(),
        applyAndRefreshSceneTextures: vi.fn(),
        render: vi.fn(),
        globalObject,
    });
}

describe("moon-render-profile-actions", () => {
    it("uses the Artemis II mission default when no explicit override is present", () => {
        const actions = createHarness({
            location: {
                search: "?mission=artemis2",
                pathname: "/astro/lunar-missions/mission.html",
            },
            localStorage: {
                getItem: vi.fn(() => null),
            },
        });

        expect(actions.getMoonRenderProfile()).toBe("quality");
    });

    it("keeps an explicit global override ahead of the mission default", () => {
        const actions = createHarness({
            MOON_RENDER_ASSET_PROFILE: "fast",
            location: {
                search: "?mission=artemis2",
                pathname: "/astro/lunar-missions/mission.html",
            },
            localStorage: {
                getItem: vi.fn(() => null),
            },
        });

        expect(actions.getMoonRenderProfile()).toBe("fast");
    });

    it("accepts the low resource tier as an explicit profile", async () => {
        const actions = createHarness({});

        await expect(actions.setMoonRenderProfile("low")).resolves.toBe("low");
        expect(actions.getMoonRenderProfile()).toBe("low");
    });

    it("does not apply an older profile load after a newer choice wins", async () => {
        const scene = { initialized3D: true };
        const pendingLoads = [];
        const staleMoonMap = { dispose: vi.fn() };
        const staleMoonDisplacementMap = { dispose: vi.fn() };
        const applyAndRefreshSceneTextures = vi.fn();
        const actions = createMoonRenderProfileActions({
            THREE: { LinearFilter: "LinearFilter" },
            animationScenes: { geo: scene },
            loadSceneTextures: vi.fn(),
            loadMoonRenderProfileTextures: vi.fn(({ moonRenderProfile }) => new Promise((resolve) => {
                pendingLoads.push({ moonRenderProfile, resolve });
            })),
            applyAndRefreshSceneTextures,
            render: vi.fn(),
            globalObject: {},
        });

        const fastPromise = actions.setMoonRenderProfile("fast");
        const qualityPromise = actions.setMoonRenderProfile("quality");

        pendingLoads.find((load) => load.moonRenderProfile === "quality").resolve({
            moonMap: "quality-map",
            moonDisplacementMap: "quality-height",
            moonRenderProfile: "quality",
            moonRenderSettings: {},
        });
        await qualityPromise;

        pendingLoads.find((load) => load.moonRenderProfile === "fast").resolve({
            moonMap: staleMoonMap,
            moonDisplacementMap: staleMoonDisplacementMap,
            moonRenderProfile: "fast",
            moonRenderSettings: {},
        });
        await expect(fastPromise).resolves.toBe("quality");

        expect(applyAndRefreshSceneTextures).toHaveBeenCalledTimes(1);
        expect(staleMoonMap.dispose).toHaveBeenCalledTimes(1);
        expect(staleMoonDisplacementMap.dispose).toHaveBeenCalledTimes(1);
        expect(applyAndRefreshSceneTextures).toHaveBeenCalledWith(
            scene,
            expect.objectContaining({ moonRenderProfile: "quality" }),
            // requestRender forwarded so the deferred normal-map rebuild can
            // wake the on-demand render loop after the profile switch lands.
            expect.objectContaining({ disposePrevious: true, requestRender: expect.anything() }),
        );
    });
});
