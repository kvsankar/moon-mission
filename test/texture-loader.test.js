import { describe, expect, it, vi } from "vitest";

import {
    loadSceneTexturesProgressively,
    loadMoonRenderProfileTextures,
    loadSceneTextures,
} from "../src/platform/js/app/texture-loader.js";

const ASSET_BASE_URL = "https://assets.sankara.net/moon-mission";

function createFakeThree(loadCalls) {
    class TextureLoader {
        load(fileName, onLoad) {
            loadCalls.push(fileName);
            onLoad({
                fileName,
                dispose: vi.fn(),
            });
        }
    }

    return {
        TextureLoader,
        LinearFilter: "linear",
        RGBAFormat: "rgba",
        SRGBColorSpace: "srgb",
        DataTexture: class DataTexture {
            constructor(data, width, height, format) {
                this.data = data;
                this.image = { width, height };
                this.format = format;
                this.dispose = vi.fn();
            }
        },
        Color: class Color {
            constructor(hexColor) {
                this.r = ((hexColor >> 16) & 255) / 255;
                this.g = ((hexColor >> 8) & 255) / 255;
                this.b = (hexColor & 255) / 255;
            }
        },
    };
}

describe("texture-loader", () => {
    it("shares one load for repeated texture URLs", async () => {
        const loadCalls = [];
        const THREE = createFakeThree(loadCalls);
        const files = {
            earthTexture: "/textures/earth-day.jpg",
            earthPhotoTexture: "/textures/earth-photo.jpg",
            earthSpecularTexture: "/textures/earth-spec.jpg",
            earthNightTexture: "/textures/earth-night.jpg",
            moonMap: "/textures/moon-fast.jpg",
            moonDisplacementMap: "/textures/moon-height.png",
            skyMilkyWayTexture: "/textures/sky.jpg",
            skyTexture: "/textures/sky.jpg",
            skyConstellationTexture: "/textures/constellation.jpg",
        };
        const globalObject = {
            MOON_RENDER_ASSET_PATHS: {
                fast: {
                    moonMap: files.moonMap,
                    moonDisplacementMap: files.moonDisplacementMap,
                },
            },
        };

        const textures = await loadSceneTextures({ THREE, files, globalObject });

        expect(loadCalls.filter((fileName) => fileName === `${ASSET_BASE_URL}/textures/sky.jpg`)).toHaveLength(1);
        expect(textures.skyTexture).toBe(textures.skyMilkyWayTexture);
    });

    it("can load only the active Moon render profile textures", async () => {
        const loadCalls = [];
        const THREE = createFakeThree(loadCalls);
        const globalObject = {
            MOON_RENDER_ASSET_PATHS: {
                quality: {
                    moonMap: "/textures/moon-quality.jpg",
                    moonDisplacementMap: "/textures/moon-quality-height.png",
                },
            },
        };

        const textures = await loadMoonRenderProfileTextures({
            THREE,
            moonRenderProfile: "quality",
            globalObject,
        });

        expect(loadCalls).toEqual([
            `${ASSET_BASE_URL}/textures/moon-quality.jpg`,
            `${ASSET_BASE_URL}/textures/moon-quality-height.png`,
        ]);
        expect(textures).toMatchObject({
            moonRenderProfile: "quality",
        });
        expect(textures.moonMap.fileName).toBe(`${ASSET_BASE_URL}/textures/moon-quality.jpg`);
        expect(textures.earthTexture).toBeUndefined();
    });

    it("does not download a DEM for the low resource tier", async () => {
        const loadCalls = [];
        const THREE = createFakeThree(loadCalls);

        const textures = await loadMoonRenderProfileTextures({
            THREE,
            moonRenderProfile: "low",
            globalObject: {},
        });

        expect(loadCalls).toEqual([
            `${ASSET_BASE_URL}/images/moon/lroc_color_2025_4k_fast.jpg`,
        ]);
        expect(textures.moonRenderProfile).toBe("low");
        expect(textures.moonDisplacementMap).toBeNull();
        expect(textures.moonRenderSettings.terrainShadowSamples).toBe(0);
    });

    it("does not share a texture object across Moon color and height roles", async () => {
        const loadCalls = [];
        const THREE = createFakeThree(loadCalls);
        const globalObject = {
            MOON_RENDER_ASSET_PATHS: {
                quality: {
                    moonMap: "/textures/shared-moon-source.png",
                    moonDisplacementMap: "/textures/shared-moon-source.png",
                },
            },
        };

        const textures = await loadMoonRenderProfileTextures({
            THREE,
            moonRenderProfile: "quality",
            globalObject,
        });

        expect(loadCalls).toEqual([
            `${ASSET_BASE_URL}/textures/shared-moon-source.png`,
            `${ASSET_BASE_URL}/textures/shared-moon-source.png`,
        ]);
        expect(textures.moonMap).not.toBe(textures.moonDisplacementMap);
    });

    it("can progressively load and report texture groups", async () => {
        const loadCalls = [];
        const applyCalls = [];
        const THREE = createFakeThree(loadCalls);
        const files = {
            earthTexture: "/textures/earth-day.jpg",
            earthSpecularTexture: "/textures/earth-spec.jpg",
            moonMap: "/textures/moon-fast.jpg",
            moonDisplacementMap: "/textures/moon-height.png",
            skyMilkyWayTexture: "/textures/sky.jpg",
            skyTexture: "/textures/sky.jpg",
        };
        const globalObject = {
            MOON_RENDER_ASSET_PATHS: {
                fast: {
                    moonMap: files.moonMap,
                    moonDisplacementMap: files.moonDisplacementMap,
                },
            },
        };

        const textures = await loadSceneTexturesProgressively({
            THREE,
            files,
            globalObject,
            textureGroups: [
                ["earthTexture"],
                ["moonMap"],
                ["moonDisplacementMap"],
                ["skyMilkyWayTexture", "skyTexture"],
            ],
            onTexturesReady: (groupTextures, groupInfo) => {
                applyCalls.push({
                    keys: groupInfo.keys,
                    textures: groupTextures,
                });
            },
        });

        expect(loadCalls).toEqual([
            `${ASSET_BASE_URL}/textures/earth-day.jpg`,
            `${ASSET_BASE_URL}/textures/moon-fast.jpg`,
            `${ASSET_BASE_URL}/textures/moon-height.png`,
            `${ASSET_BASE_URL}/textures/sky.jpg`,
        ]);
        expect(applyCalls.map((call) => call.keys)).toEqual([
            ["earthTexture"],
            ["moonMap"],
            ["moonDisplacementMap"],
            ["skyMilkyWayTexture", "skyTexture"],
        ]);
        expect(applyCalls[1].textures).toMatchObject({
            moonRenderProfile: "fast",
        });
        expect(textures.skyTexture).toBe(textures.skyMilkyWayTexture);
    });

    it("skips the DEM in the progressive startup path for Low", async () => {
        const loadCalls = [];
        const THREE = createFakeThree(loadCalls);

        const textures = await loadSceneTexturesProgressively({
            THREE,
            moonRenderProfile: "low",
            globalObject: {},
            textureGroups: [
                ["moonMap"],
                ["moonDisplacementMap"],
            ],
        });

        expect(loadCalls).toEqual([
            `${ASSET_BASE_URL}/images/moon/lroc_color_2025_4k_fast.jpg`,
        ]);
        expect(textures.moonMap).toBeTruthy();
        expect(textures.moonDisplacementMap).toBeNull();
        expect(textures.moonRenderProfile).toBe("low");
    });
});
