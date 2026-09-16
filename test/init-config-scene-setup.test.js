import { describe, expect, it, vi } from "vitest";

import {
    createInitConfigSceneSetupActions,
    resolveScenePlaybackBounds,
} from "../src/platform/js/app/init-config-scene-setup.js";

function buildSceneSetupDeps(overrides = {}) {
    return {
        PC: {
            EARTH_MOON_DISTANCE_MEAN_AU: 1,
            EARTH_RADIUS_KM: 6378,
            MOON_RADIUS_KM: 1737,
            KM_PER_AU: 149597870.7,
        },
        windowRef: {
            missionConfig: {
                dataPath: "assets/primary/data/",
            },
        },
        animationScenes: {},
        animation3DControllers: {},
        animation2DControllers: {},
        AnimationScene: class AnimationScene {
            constructor(originKey) {
                this.originKey = originKey;
            }
        },
        Animation3DController: class Animation3DController {},
        Animation2DController: class Animation2DController {},
        planetProperties: {},
        showPlanet: vi.fn(),
        computeSVGDimensions: vi.fn(),
        getSvgWidth: vi.fn(() => 1200),
        getSvgHeight: vi.fn(() => 800),
        setPixelsPerAU: vi.fn(),
        setDefaultCameraDistance: vi.fn(),
        setTrackWidth: vi.fn(),
        setEarthRadius: vi.fn(),
        setMoonRadius: vi.fn(),
        getEarthRadius: vi.fn(() => 10),
        getMoonRadius: vi.fn(() => 3),
        setStartTime: vi.fn(),
        setEndTime: vi.fn(),
        setEndTimeSC: vi.fn(),
        setLatestEndTime: vi.fn(),
        setTimelineTotalSteps: vi.fn(),
        setTicksPerAnimationStep: vi.fn(),
        setEpochJD: vi.fn(),
        setEpochDate: vi.fn(),
        getStartAndEndTimes: vi.fn((bodyId) => {
            if (bodyId === "EARTH") {
                return [1000, 5000];
            }
            return [1000, 5000];
        }),
        animationController: {
            configure: vi.fn(),
        },
        resolveOrbitUrls: vi.fn(() => null),
        resolveOrbitMetaUrl: vi.fn(() => null),
        resolveOrbitNpzUrl: vi.fn(() => null),
        resolveOrbitSunChebyshevUrl: vi.fn(() => null),
        handleModeSwitchToGeo: vi.fn(),
        handleModeSwitchToLunar: vi.fn(),
        setRelativeOrbitUrls: vi.fn(),
        ...overrides,
    };
}

describe("init config scene setup", () => {
    it("replaces a terminal scene and its controllers rather than reusing it", () => {
        const oldScene = { disposed: true }, old3D = {}, old2D = {};
        const deps = buildSceneSetupDeps({ animationScenes: { geo: oldScene },
            animation3DControllers: { geo: old3D }, animation2DControllers: { geo: old2D } });
        createInitConfigSceneSetupActions(deps).configureSceneForOrigin({ originKey: "geo", configData: {
            geo: { planets: ["EARTH", "MOON", "SC"], step_size_in_seconds: 60 },
        } });
        expect(deps.animationScenes.geo).not.toBe(oldScene);
        expect(deps.animation3DControllers.geo).not.toBe(old3D);
        expect(deps.animation2DControllers.geo).not.toBe(old2D);
    });

    it("extends compare playback bounds to the longer overlay mission window", () => {
        const bounds = resolveScenePlaybackBounds({
            configData: {
                comparisonOverlay: {
                    compareCraftId: "CMP_TEST",
                    displayTimeRangesByOrigin: {
                        geo: { startMs: 1000, endMs: 5000 },
                    },
                    sourceTimeRangesByOrigin: {
                        geo: { startMs: 2000, endMs: 10000 },
                    },
                },
            },
            sceneConfig: "geo",
            spacecraftMnemonic: "SC",
            getStartAndEndTimes: (bodyId) => {
                if (bodyId === "EARTH") {
                    return [1000, 5000];
                }
                return [1000, 5000];
            },
        });

        expect(bounds).toEqual({
            startMs: 1000,
            endMs: 9000,
            earthEndMs: 5000,
            spacecraftEndMs: 5000,
            comparisonEndMs: 9000,
        });
    });

    it("configures compare-mode playback against the longer displayed mission end", () => {
        const deps = buildSceneSetupDeps();
        const actions = createInitConfigSceneSetupActions(deps);
        const configData = {
            spacecraft_mnemonic: "SC",
            crafts: [
                {
                    id: "SC",
                    mnemonic: "SC",
                },
            ],
            geo: {
                planets: ["EARTH", "MOON", "SC"],
                step_size_in_seconds: 1,
            },
            comparisonOverlay: {
                compareCraftId: "CMP_TEST",
                displayTimeRangesByOrigin: {
                    geo: { startMs: 1000, endMs: 5000 },
                },
                sourceTimeRangesByOrigin: {
                    geo: { startMs: 2000, endMs: 10000 },
                },
                supportOrbitChebyshevUrlsByOrigin: {
                    geo: "assets/compare/data/geo-cmp-cheb.json",
                },
            },
        };

        actions.configureSceneForOrigin({
            originKey: "geo",
            configData,
            isRelativeMode: false,
        });

        expect(deps.setStartTime).toHaveBeenCalledWith(1000);
        expect(deps.setEndTime).toHaveBeenCalledWith(9000);
        expect(deps.setEndTimeSC).toHaveBeenCalledWith(5000);
        expect(deps.setLatestEndTime).toHaveBeenCalledWith(9000);
        expect(deps.setTimelineTotalSteps).toHaveBeenCalledWith(8);
        expect(deps.animationController.configure).toHaveBeenCalledWith({
            startTime: 1000,
            endTime: 9000,
            stepDurationMs: 1000,
            stepsPerHop: 4,
        });
    });

    it("keeps geo compare on the inertial geo orbit files instead of the relative override", () => {
        const deps = buildSceneSetupDeps({
            resolveOrbitUrls: vi.fn(() => ({
                orbitsJson: "assets/primary/data/geo-SC.json",
                orbitsCheb: "assets/primary/data/geo-SC-cheb.json",
            })),
        });
        const actions = createInitConfigSceneSetupActions(deps);
        const configData = {
            spacecraft_mnemonic: "SC",
            crafts: [
                {
                    id: "SC",
                    mnemonic: "SC",
                },
            ],
            geo: {
                planets: ["EARTH", "MOON", "SC"],
                step_size_in_seconds: 60,
            },
            relative: {
                orbits_file: "relative-SC",
            },
            comparisonOverlay: {
                compareCraftId: "CMP_TEST",
                supportOrbitChebyshevUrlsByOrigin: {
                    geo: "assets/compare/data/geo-cmp-cheb.json",
                    relative: "assets/compare/data/relative-cmp-cheb.json",
                },
            },
        };

        actions.configureSceneForOrigin({
            originKey: "geo",
            configData,
            isRelativeMode: false,
        });

        expect(deps.setRelativeOrbitUrls).not.toHaveBeenCalled();
        expect(deps.animationScenes.geo.orbitsCheb).toBe("assets/primary/data/geo-SC-cheb.json");
        expect(deps.animationScenes.geo.supportOrbitsChebByBodyId).toEqual({
            CMP_TEST: "assets/compare/data/geo-cmp-cheb.json",
        });
    });
});
