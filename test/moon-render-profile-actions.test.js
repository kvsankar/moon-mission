import { describe, expect, it, vi } from "vitest";

import { createMoonRenderProfileActions, persistMoonRenderAssetProfile } from "../src/platform/js/app/moon-render-profile-actions.js";

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
    it("skips a scene retired by an earlier consumer during shared profile installation", async () => {
        const first = { initialized3D: true }, second = { initialized3D: true };
        const apply = vi.fn(scene => {
            if (scene === first) { second.disposed = true; second.initialized3D = false; }
        });
        const actions = createMoonRenderProfileActions({ THREE: {}, animationScenes: { geo: first, lunar: second },
            loadMoonRenderProfileTextures: async () => ({ moonRenderProfile: "low" }),
            applyAndRefreshSceneTextures: apply, render: vi.fn(), globalObject: {} });
        await actions.setMoonRenderProfile("low");
        expect(apply).toHaveBeenCalledOnce();
        expect(apply.mock.calls[0][0]).toBe(first);
    });

    it("replaces launch profile parameters when the user selects another tier", () => {
        const globalObject = { location: { href: "http://localhost/artemis2/?moonProfile=quality&time=123#view" }, history: { replaceState: vi.fn() }, localStorage: { setItem: vi.fn() } };
        persistMoonRenderAssetProfile(globalObject, "low");
        expect(globalObject.history.replaceState).toHaveBeenCalledWith(null, "", "/artemis2/?time=123&moonRenderProfile=low#view");
        expect(globalObject.MOON_RENDER_ASSET_PROFILE).toBe("low");
    });

    it("uses the device default for Artemis II when no explicit override is present", () => {
        const actions = createHarness({
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

    it("does not persist or present a profile whose assets fail to load", async () => {
        const storage = {
            getItem: vi.fn(() => "fast"),
            setItem: vi.fn(),
        };
        const globalObject = {
            MOON_RENDER_ASSET_PROFILE: "fast",
            localStorage: storage,
        };
        const actions = createMoonRenderProfileActions({
            THREE: { LinearFilter: "LinearFilter" },
            animationScenes: { geo: { initialized3D: true } },
            loadSceneTextures: vi.fn(),
            loadMoonRenderProfileTextures: vi.fn(() => Promise.reject(new Error("decode failed"))),
            applyAndRefreshSceneTextures: vi.fn(),
            render: vi.fn(),
            globalObject,
        });

        await expect(actions.setMoonRenderProfile("quality")).rejects.toThrow("decode failed");
        expect(actions.getMoonRenderProfile()).toBe("fast");
        expect(globalObject.MOON_RENDER_ASSET_PROFILE).toBe("fast");
        expect(storage.setItem).not.toHaveBeenCalled();
    });

    it("validates profile assets before persisting when no 3D scene is initialized", async () => {
        const storage = {
            getItem: vi.fn(() => "fast"),
            setItem: vi.fn(),
        };
        const globalObject = {
            MOON_RENDER_ASSET_PROFILE: "fast",
            localStorage: storage,
        };
        const actions = createMoonRenderProfileActions({
            THREE: { LinearFilter: "LinearFilter" },
            animationScenes: {},
            loadSceneTextures: vi.fn(() => Promise.reject(new Error("precision decode failed"))),
            applyAndRefreshSceneTextures: vi.fn(),
            render: vi.fn(),
            globalObject,
        });

        await expect(actions.setMoonRenderProfile("quality"))
            .rejects.toThrow("precision decode failed");
        expect(actions.getMoonRenderProfile()).toBe("fast");
        expect(globalObject.MOON_RENDER_ASSET_PROFILE).toBe("fast");
        expect(storage.setItem).not.toHaveBeenCalled();
    });

    it("applies a validated profile to a scene initialized while the load is pending", async () => {
        let resolveLoad;
        const scene = { initialized3D: false };
        const applyAndRefreshSceneTextures = vi.fn();
        const loadMoonRenderProfileTextures = vi.fn(() => new Promise((resolve) => {
            resolveLoad = resolve;
        }));
        const actions = createMoonRenderProfileActions({
            THREE: { LinearFilter: "LinearFilter" },
            animationScenes: { geo: scene },
            loadSceneTextures: vi.fn(),
            loadMoonRenderProfileTextures,
            applyAndRefreshSceneTextures,
            render: vi.fn(),
            globalObject: {},
        });

        const profileLoad = actions.setMoonRenderProfile("quality");
        scene.initialized3D = true;
        resolveLoad({
            moonMap: "quality-map",
            moonDisplacementMap: "quality-height",
            moonRenderProfile: "quality",
            moonRenderSettings: {},
        });
        await profileLoad;

        expect(applyAndRefreshSceneTextures).toHaveBeenCalledWith(
            scene,
            expect.objectContaining({ moonRenderProfile: "quality" }),
            expect.objectContaining({ disposePrevious: true }),
        );
    });

    it("aborts an older profile load when a newer selection starts", async () => {
        const loadSignals = [];
        const loadMoonRenderProfileTextures = vi.fn(({ moonRenderProfile, signal }) => {
            loadSignals.push({ moonRenderProfile, signal });
            if (moonRenderProfile === "quality") {
                return Promise.resolve({
                    moonMap: { dispose: vi.fn() },
                    moonDisplacementMap: { dispose: vi.fn() },
                    moonRenderProfile: "quality",
                    moonRenderSettings: {},
                });
            }
            return new Promise((resolve, reject) => {
                signal.addEventListener("abort", () => {
                    const error = new Error("superseded");
                    error.name = "AbortError";
                    reject(error);
                }, { once: true });
            });
        });
        const actions = createMoonRenderProfileActions({
            THREE: { LinearFilter: "LinearFilter" },
            animationScenes: {},
            loadSceneTextures: vi.fn(),
            loadMoonRenderProfileTextures,
            applyAndRefreshSceneTextures: vi.fn(),
            render: vi.fn(),
            globalObject: {},
        });

        const oldLoad = actions.setMoonRenderProfile("fast");
        const newLoad = actions.setMoonRenderProfile("quality");

        await expect(newLoad).resolves.toBe("quality");
        await expect(oldLoad).resolves.toBe("quality");
        expect(loadSignals[0].signal.aborted).toBe(true);
        expect(loadSignals[1].signal.aborted).toBe(false);
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
