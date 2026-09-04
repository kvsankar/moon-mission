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
