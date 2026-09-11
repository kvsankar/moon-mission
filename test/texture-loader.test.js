import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import {
    createUint16MoonDemTexture,
    decodeNasaMoonDemInWorker,
    loadSceneTexturesProgressively,
    loadMoonRenderProfileTextures,
    loadSceneTextures,
    MOON_PREVIEW_TEXTURE_URL,
} from "../src/platform/js/app/texture-loader.js";

const ASSET_BASE_URL = "https://assets.sankara.net/moon-mission";

let activeLoadCalls = [];

function createFakeThree(loadCalls) {
    activeLoadCalls = loadCalls;
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
        NearestFilter: "nearest",
        RGBAFormat: "rgba",
        RedFormat: "red",
        FloatType: "float",
        HalfFloatType: "half-float",
        UnsignedByteType: "ubyte",
        RepeatWrapping: "repeat",
        ClampToEdgeWrapping: "clamp",
        SRGBColorSpace: "srgb",
        DataTexture: class DataTexture {
            constructor(data, width, height, format, type) {
                this.data = data;
                this.image = { data, width, height };
                this.format = format;
                this.type = type;
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
    beforeEach(() => {
        activeLoadCalls = [];
        vi.stubGlobal("fetch", vi.fn(async (url) => {
            activeLoadCalls.push(url);
            return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
        }));
        vi.stubGlobal("Worker", class {
            terminate = vi.fn(() => { this.closed = true; });
            postMessage() {
                queueMicrotask(() => {
                    if (!this.closed) this.onmessage({ data: {
                        width: 2, height: 2, heightBuffer: new Float32Array(4).buffer,
                        normalBuffer: new Uint16Array(16).buffer, decodeMilliseconds: 0, normalBuildMilliseconds: 0,
                    } });
                });
            }
        });
    });
    afterEach(() => vi.unstubAllGlobals());
    it("loads a bundled preview without requesting the selected high-resolution assets", async () => {
        const calls = [];
        const THREE = createFakeThree(calls);
        const textures = await loadMoonRenderProfileTextures({ THREE, moonRenderProfile: "quality", previewOnly: true, globalObject: {} });
        expect(calls).toEqual([MOON_PREVIEW_TEXTURE_URL]);
        expect(textures).toMatchObject({ moonRenderProfile: "low", moonDisplacementMap: null, moonPreview: true });
        expect(textures.moonRenderSettings.physicalGeometryWidthSegments).toBe(128);
        expect(textures.moonMap.generateMipmaps).toBe(false);
    });

    it("delivers the preview before starting requested resources", async () => {
        const calls = [];
        const THREE = createFakeThree(calls);
        let releasePreview;
        const previewPainted = new Promise(resolve => { releasePreview = resolve; });
        const onPreview = vi.fn(() => previewPainted);
        const loading = loadMoonRenderProfileTextures({
            THREE, moonRenderProfile: "quality", onPreview,
            globalObject: { MOON_RENDER_ASSET_PATHS: { quality: { moonMap: "/textures/high.jpg", moonDisplacementMap: "/textures/high-height.png" } } },
        });
        await vi.waitFor(() => expect(onPreview).toHaveBeenCalledOnce());
        expect(calls).toEqual([MOON_PREVIEW_TEXTURE_URL]);
        releasePreview();
        await loading;
        expect(calls[1]).toContain("high.jpg");
    });

    it("forwards Moon DEM worker results and terminates the worker", async () => {
        const workers = [];
        class FakeWorker {
            constructor(url, options) {
                this.url = url;
                this.options = options;
                this.terminate = vi.fn();
                this.postMessage = vi.fn();
                workers.push(this);
            }
        }
        vi.stubGlobal("Worker", FakeWorker);

        try {
            const pngBytes = new ArrayBuffer(8);
            const decodePromise = decodeNasaMoonDemInWorker(pngBytes, 0.25, null, {
                physicalNormalSlopeBoost: 1.5,
                physicalNormalSlopeBoostStart: 0.16,
                physicalNormalSlopeBoostEnd: 0.34,
            });
            expect(workers).toHaveLength(1);
            expect(workers[0].options).toEqual({ type: "module" });
            expect(workers[0].postMessage).toHaveBeenCalledWith({
                pngBytes,
                physicalNormalHeightScale: 0.25,
                physicalNormalSlopeBoost: 1.5,
                physicalNormalSlopeBoostStart: 0.16,
                physicalNormalSlopeBoostEnd: 0.34,
            }, [pngBytes]);

            const heightBuffer = new Float32Array([0.25, 0.5, 0.75, 1]).buffer;
            const normalBuffer = new Uint16Array(16).buffer;
            workers[0].onmessage({
                data: {
                    width: 2,
                    height: 2,
                    heightBuffer,
                    normalBuffer,
                    decodeMilliseconds: 4,
                    normalBuildMilliseconds: 6,
                },
            });

            await expect(decodePromise).resolves.toMatchObject({
                width: 2,
                height: 2,
                heightBuffer,
                normalBuffer,
            });
            expect(workers[0].terminate).toHaveBeenCalledTimes(1);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it("terminates the Moon DEM worker when its load is aborted", async () => {
        const workers = [];
        class FakeWorker {
            constructor() {
                this.terminate = vi.fn();
                this.postMessage = vi.fn();
                workers.push(this);
            }
        }
        vi.stubGlobal("Worker", FakeWorker);

        try {
            const controller = new AbortController();
            const decodePromise = decodeNasaMoonDemInWorker(
                new ArrayBuffer(8),
                0.25,
                controller.signal,
            );
            controller.abort();

            await expect(decodePromise).rejects.toMatchObject({ name: "AbortError" });
            expect(workers[0].terminate).toHaveBeenCalledTimes(1);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it("cancels ordinary browser image requests when a profile load is superseded", async () => {
        const images = [];
        class FakeImage {
            constructor() {
                this.src = "";
                images.push(this);
            }
        }
        vi.stubGlobal("Image", FakeImage);

        try {
            const controller = new AbortController();
            const loadPromise = loadMoonRenderProfileTextures({
                THREE: createFakeThree([]),
                moonRenderProfile: "fast",
                globalObject: {},
                signal: controller.signal,
            });
            controller.abort();

            await expect(loadPromise).rejects.toMatchObject({ name: "AbortError" });
            expect(images).toHaveLength(1);
            expect(images.every((image) => image.src === "")).toBe(true);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it("forwards Moon DEM worker failures and terminates the worker", async () => {
        const workers = [];
        class FakeWorker {
            constructor() {
                this.terminate = vi.fn();
                this.postMessage = vi.fn();
                workers.push(this);
            }
        }
        vi.stubGlobal("Worker", FakeWorker);

        try {
            const decodePromise = decodeNasaMoonDemInWorker(new ArrayBuffer(8), 0.25);
            workers[0].onmessage({ data: { error: "invalid uint16 PNG" } });

            await expect(decodePromise).rejects.toThrow("invalid uint16 PNG");
            expect(workers[0].terminate).toHaveBeenCalledTimes(1);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it("preserves NASA uint16 DEM samples in a float DataTexture", () => {
        const THREE = createFakeThree([]);
        const source = new Uint16Array([
            2037, 2037, 2037, 65535,
            20000, 20000, 20000, 65535,
            32768, 32768, 32768, 65535,
            41371, 41371, 41371, 65535,
        ]);

        const texture = createUint16MoonDemTexture(THREE, {
            width: 2,
            height: 2,
            depth: 16,
            data: source,
        });

        expect(texture.image.data).toBeInstanceOf(Float32Array);
        expect(texture.image.data[0]).toBeCloseTo(2037 / 65535, 7);
        expect(texture.image.data[3]).toBeCloseTo(41371 / 65535, 7);
        expect(texture.format).toBe(THREE.RedFormat);
        expect(texture.type).toBe(THREE.FloatType);
        expect(texture.minFilter).toBe(THREE.NearestFilter);
        expect(texture.wrapS).toBe(THREE.RepeatWrapping);
        expect(texture.userData.sourceBitDepth).toBe(16);
        expect(texture.userData.legacyTexture).toBeUndefined();
    });

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

    it("coalesces concurrent High DEM fetch and worker preparation", async () => {
        const loadCalls = [];
        const THREE = createFakeThree(loadCalls);
        const workers = [];
        const fetchMock = vi.fn(async () => ({
            ok: true,
            arrayBuffer: async () => new ArrayBuffer(8),
        }));
        class FakeWorker {
            constructor() {
                this.terminate = vi.fn();
                workers.push(this);
            }

            postMessage() {
                setTimeout(() => {
                    this.onmessage({
                        data: {
                            width: 2,
                            height: 2,
                            heightBuffer: new Float32Array(4).buffer,
                            normalBuffer: new Uint16Array(16).buffer,
                            decodeMilliseconds: 4,
                            normalBuildMilliseconds: 6,
                        },
                    });
                }, 0);
            }
        }
        vi.stubGlobal("fetch", fetchMock);
        vi.stubGlobal("Worker", FakeWorker);

        try {
            const firstLoad = loadMoonRenderProfileTextures({
                THREE,
                moonRenderProfile: "quality",
                globalObject: {},
            });
            const secondLoad = loadMoonRenderProfileTextures({
                THREE,
                moonRenderProfile: "quality",
                globalObject: {},
            });
            const [firstTextures, secondTextures] = await Promise.all([firstLoad, secondLoad]);

            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(workers).toHaveLength(1);
            expect(firstTextures.moonDisplacementMap)
                .not.toBe(secondTextures.moonDisplacementMap);
            expect(firstTextures.moonDisplacementMap.image.data.buffer)
                .toBe(secondTextures.moonDisplacementMap.image.data.buffer);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it("loads the compact physical DEM for the low resource tier", async () => {
        const loadCalls = [];
        const THREE = createFakeThree(loadCalls);

        const textures = await loadMoonRenderProfileTextures({
            THREE,
            moonRenderProfile: "low",
            globalObject: {},
        });

        expect(loadCalls).toEqual([
            `${ASSET_BASE_URL}/images/moon/lroc_color_2025_2k_low.jpg`,
            `${ASSET_BASE_URL}/images/moon/terrain-low-v1.moon.gz`,
        ]);
        expect(textures.moonRenderProfile).toBe("low");
        expect(textures.moonDisplacementMap.userData.moonDemEncoding).toBe("nasa-uint16-float");
        expect(textures.moonRenderSettings.physicalTerrainShadowSamples).toBe(4);
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

    it("prefetches Moon resources while Earth loads, then applies groups in order", async () => {
        const calls = [];
        const applied = [];
        const THREE = createFakeThree(calls);
        let finishEarth;
        THREE.TextureLoader = class {
            load(url, onLoad) {
                calls.push(url);
                if (url.includes("earth-day")) finishEarth = () => onLoad({ dispose: vi.fn() });
                else onLoad({ dispose: vi.fn() });
            }
        };
        const loading = loadSceneTexturesProgressively({
            THREE,
            files: { earthTexture: "/textures/earth-day.jpg" },
            globalObject: { MOON_RENDER_ASSET_PATHS: { fast: { moonMap: "/textures/moon.jpg", moonDisplacementMap: "/textures/height.png" } } },
            textureGroups: [["earthTexture"], ["moonMap"], ["moonDisplacementMap"]],
            prefetchMoon: true,
            onTexturesReady: (textures, info) => applied.push(info.keys),
        });
        await vi.waitFor(() => expect(finishEarth).toBeTypeOf("function"));
        expect(calls.map(url => url.split('/').pop())).toEqual(["moon.jpg", "height.png", "earth-day.jpg"]);
        expect(applied).toEqual([]);
        finishEarth();
        await loading;
        expect(applied).toEqual([["earthTexture"], ["moonMap"], ["moonDisplacementMap"]]);
        expect(calls).toHaveLength(3);
    });

    it("releases unused prefetched Moon textures when an earlier group fails", async () => {
        const THREE = createFakeThree([]);
        const prefetched = [];
        THREE.TextureLoader = class {
            load(url, onLoad, progress, onError) {
                if (url.includes("earth-day")) onError(new Error("Earth failed"));
                else { const texture = { dispose: vi.fn() }; prefetched.push(texture); onLoad(texture); }
            }
        };
        await expect(loadSceneTexturesProgressively({
            THREE,
            files: { earthTexture: "/textures/earth-day.jpg" },
            globalObject: { MOON_RENDER_ASSET_PATHS: { fast: { moonMap: "/textures/moon.jpg", moonDisplacementMap: "/textures/height.png" } } },
            textureGroups: [["earthTexture"], ["moonMap"], ["moonDisplacementMap"]],
            prefetchMoon: true,
        })).rejects.toThrow("Earth failed");
        expect(prefetched).toHaveLength(1);
        prefetched.forEach(texture => expect(texture.dispose).toHaveBeenCalledOnce());
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

    it("stops progressive loading when the profile load is aborted", async () => {
        const loadCalls = [];
        const THREE = createFakeThree(loadCalls);
        const controller = new AbortController();

        const loadPromise = loadSceneTexturesProgressively({
            THREE,
            files: { earthTexture: "/textures/earth-day.jpg" },
            globalObject: {},
            textureGroups: [["earthTexture"]],
            signal: controller.signal,
            beforeLoadGroup: () => controller.abort(),
        });

        await expect(loadPromise).rejects.toMatchObject({ name: "AbortError" });
        expect(loadCalls).toEqual([]);
    });

    it("loads Low physical terrain through the progressive path", async () => {
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
            `${ASSET_BASE_URL}/images/moon/lroc_color_2025_2k_low.jpg`,
            `${ASSET_BASE_URL}/images/moon/terrain-low-v1.moon.gz`,
        ]);
        expect(textures.moonMap).toBeTruthy();
        expect(textures.moonDisplacementMap.userData.moonDemEncoding).toBe("nasa-uint16-float");
        expect(textures.moonRenderProfile).toBe("low");
    });
});
