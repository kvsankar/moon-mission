import { describe, expect, it } from "vitest";
import {
    DEFAULT_MOON_RENDER_ASSET_PROFILES,
    DEFAULT_MOON_RENDER_PROFILE_SETTINGS,
    MOON_RENDER_ASSET_PATHS_STORAGE_KEY,
    MOON_RENDER_ASSET_PROFILE_STORAGE_KEY,
    resolveMoonRenderAssetProfile,
    resolveMoonRenderAssetProfiles,
    resolveMoonRenderProfileSettings,
    resolveMoonRenderAssetSelection,
} from "../src/platform/js/app/moon-render-asset-profiles.js";

describe("moon-render-asset-profiles", () => {
    it("defaults to the fast profile", () => {
        expect(
            resolveMoonRenderAssetProfile({
                search: "",
                globalObject: {},
            }),
        ).toBe("fast");
    });

    it("lets the query string select the quality profile", () => {
        expect(
            resolveMoonRenderAssetProfile({
                search: "?moonRenderProfile=quality",
                globalObject: {},
            }),
        ).toBe("quality");
    });

    it("resolves a DEM-free low resource tier", () => {
        const selection = resolveMoonRenderAssetSelection({
            profile: "low",
            globalObject: {},
        });

        expect(selection.profile).toBe("low");
        expect(selection.active.moonMap).toBe(DEFAULT_MOON_RENDER_ASSET_PROFILES.fast.moonMap);
        expect(selection.active.moonDisplacementMap).toBe("");
        expect(selection.activeRenderSettings.geometryWidthSegments).toBe(128);
        expect(selection.activeRenderSettings.terrainShadowSamples).toBe(0);
    });

    it("defaults Artemis II to the quality profile when no explicit override is present", () => {
        expect(
            resolveMoonRenderAssetProfile({
                search: "?mission=artemis2",
                globalObject: {
                    location: {
                        pathname: "/astro/lunar-missions/mission.html",
                    },
                },
            }),
        ).toBe("quality");
    });

    it("keeps a saved resource tier ahead of the Artemis II mission default", () => {
        expect(
            resolveMoonRenderAssetProfile({
                search: "?mission=artemis2",
                globalObject: {
                    location: {
                        pathname: "/astro/lunar-missions/mission.html",
                    },
                    localStorage: {
                        getItem: () => "low",
                    },
                },
            }),
        ).toBe("low");
    });

    it("merges global profile path overrides", () => {
        const profiles = resolveMoonRenderAssetProfiles({
            globalObject: {
                MOON_RENDER_ASSET_PATHS: {
                    quality: {
                        moonMap: "/textures/moon/nasa-color.webp",
                        moonDisplacementMap: "/textures/moon/lola-height.png",
                    },
                },
            },
        });

        expect(profiles.quality).toEqual({
            moonMap: "/textures/moon/nasa-color.webp",
            moonDisplacementMap: "/textures/moon/lola-height.png",
        });
        expect(profiles.fast).toEqual(DEFAULT_MOON_RENDER_ASSET_PROFILES.fast);
    });

    it("merges global render setting overrides", () => {
        const settings = resolveMoonRenderProfileSettings({
            globalObject: {
                MOON_RENDER_PROFILE_SETTINGS: {
                    quality: {
                        normalMapStrength: 1.48,
                        terminatorContrast: 2.18,
                    },
                },
            },
        });

        expect(settings.quality.normalMapStrength).toBe(1.48);
        expect(settings.quality.terminatorContrast).toBe(2.18);
        expect(settings.fast).toEqual(DEFAULT_MOON_RENDER_PROFILE_SETTINGS.fast);
        expect(settings.quality.terrainShadowStrength).toBe(1.2);
        expect(settings.quality.terrainReliefStrength).toBe(2.2);
        expect(settings.quality.physicalGeometryWidthSegments).toBe(1024);
        expect(settings.quality.physicalGeometryHeightSegments).toBe(512);
        expect(settings.quality.physicalDisplacementScale).toBeCloseTo(0.018860078277886497, 12);
        expect(settings.quality.physicalDisplacementBias).toBeCloseTo(-0.005755726948313572, 12);
        expect(settings.quality.physicalNormalHeightScale).toBeCloseTo(0.018860078277886497, 12);
        expect(settings.quality.physicalTerrainShadowTexelStride).toBe(2);
        expect(settings.quality.physicalTerrainShadowSamples).toBe(20);
    });

    it("reads persisted profile and path overrides from local storage", () => {
        const storageMap = new Map([
            [MOON_RENDER_ASSET_PROFILE_STORAGE_KEY, "quality"],
            [
                MOON_RENDER_ASSET_PATHS_STORAGE_KEY,
                JSON.stringify({
                    quality: {
                        moonMap: "/persisted/moon-color.jpg",
                        moonDisplacementMap: "/persisted/moon-height.png",
                    },
                }),
            ],
        ]);
        const fakeStorage = {
            getItem(key) {
                return storageMap.has(key) ? storageMap.get(key) : null;
            },
        };
        const globalObject = { localStorage: fakeStorage };

        expect(resolveMoonRenderAssetProfile({ search: "", globalObject })).toBe("quality");
        expect(resolveMoonRenderAssetProfiles({ globalObject }).quality).toEqual({
            moonMap: "/persisted/moon-color.jpg",
            moonDisplacementMap: "/persisted/moon-height.png",
        });
    });

    it("uses a legacy terrain-shadow override as the relief fallback", () => {
        const settings = resolveMoonRenderProfileSettings({
            globalObject: {
                MOON_RENDER_PROFILE_SETTINGS: {
                    quality: {
                        terrainShadowStrength: 0.9,
                    },
                },
            },
        });

        expect(settings.quality.terrainShadowStrength).toBe(0.9);
        expect(settings.quality.terrainReliefStrength).toBe(0.9);
    });

    it("resolves active and fallback assets together", () => {
        const selection = resolveMoonRenderAssetSelection({
            search: "?moonProfile=quality",
            globalObject: {
                MOON_RENDER_ASSET_PATHS: {
                    quality: {
                        moonMap: "/quality/moon-color.jpg",
                        moonDisplacementMap: "/quality/moon-height.png",
                    },
                },
            },
        });

        expect(selection.profile).toBe("quality");
        expect(selection.active).toEqual({
            moonMap: "/quality/moon-color.jpg",
            moonDisplacementMap: "/quality/moon-height.png",
        });
        expect(selection.fallback).toEqual(DEFAULT_MOON_RENDER_ASSET_PROFILES.fast);
        expect(selection.activeRenderSettings).toEqual(DEFAULT_MOON_RENDER_PROFILE_SETTINGS.quality);
        expect(selection.fallbackRenderSettings).toEqual(DEFAULT_MOON_RENDER_PROFILE_SETTINGS.fast);
    });

    it("allows callers to request a specific profile without mutating URL or global state", () => {
        const selection = resolveMoonRenderAssetSelection({
            profile: "fast",
            search: "?moonProfile=quality",
            globalObject: {},
        });

        expect(selection.profile).toBe("fast");
        expect(selection.active).toEqual(DEFAULT_MOON_RENDER_ASSET_PROFILES.fast);
    });
});
