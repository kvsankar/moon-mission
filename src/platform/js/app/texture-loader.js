import { DEFAULT_MOON_RENDER_ASSET_PROFILES, resolveMoonRenderAssetSelection } from "./moon-render-asset-profiles.js";
import { resolveRuntimeAssetUrl } from "../core/domain/runtime-asset-url.js";
import { decodeMoonUint16RgbaToFloatHeightData } from "../rendering/moon-physical-normal-data.js";

export const DEFAULT_SCENE_TEXTURE_FILES = {
    earthTexture: "images/earth/2_no_clouds_8k.jpg",
    // Mirrored from NASA's Blue Marble cloud composite to keep Photo Mode CORS-safe.
    earthPhotoTexture: "images/earth/nasa_blue_marble_clouds_2048.jpg",
    earthSpecularTexture: "images/earth/earthspec1k.jpg",
    earthNightTexture: "https://assets.science.nasa.gov/content/dam/science/esd/eo/images/imagerecords/144000/144898/BlackMarble_2016_01deg.jpg",
    moonMap: DEFAULT_MOON_RENDER_ASSET_PROFILES.fast.moonMap,
    moonDisplacementMap: DEFAULT_MOON_RENDER_ASSET_PROFILES.fast.moonDisplacementMap,
    // Primary sky background is treated as Milky Way + diffuse background layer.
    skyMilkyWayTexture: "images/sky/starmap_4k.jpg",
    skyTexture: "images/sky/starmap_4k.jpg",
    skyConstellationTexture: "images/sky/constellation_figures_2020_4k.jpg",
};

const PLACEHOLDER_COLORS = Object.freeze({
    earthTexture: 0x2f6fe0,
    earthPhotoTexture: 0x6b89c9,
    earthSpecularTexture: 0x111111,
    earthNightTexture: 0x000000,
    moonMap: 0x8f8f8f,
    moonDisplacementMap: 0x808080,
    skyMilkyWayTexture: 0x081325,
    skyTexture: 0x081325,
    skyConstellationTexture: 0x000000,
});

const MOON_TEXTURE_KEYS = new Set(["moonMap", "moonDisplacementMap"]);
const SHAREABLE_TEXTURE_KEY_GROUPS = Object.freeze({
    skyMilkyWayTexture: "skyBackground",
    skyTexture: "skyBackground",
});
const DEFAULT_PROGRESSIVE_SCENE_TEXTURE_GROUPS = Object.freeze([
    Object.freeze(["earthTexture"]),
    Object.freeze(["earthSpecularTexture"]),
    Object.freeze(["moonMap"]),
    Object.freeze(["moonDisplacementMap"]),
    Object.freeze(["skyMilkyWayTexture", "skyTexture"]),
    Object.freeze(["skyConstellationTexture"]),
    Object.freeze(["earthPhotoTexture"]),
    Object.freeze(["earthNightTexture"]),
]);
const inFlightMoonDemDecodes = new Map();

function loadTextureUrl(loader, textureUrl) {
    return new Promise((resolve, reject) => {
        loader.load(
            textureUrl,
            (texture) => resolve(texture),
            undefined,
            (error) => reject(error),
        );
    });
}

function loadTextureUrlWithSignal(THREE, loader, textureUrl, signal = null) {
    if (!signal || typeof globalThis.Image !== "function") {
        return loadTextureUrl(loader, textureUrl).then((texture) => {
            if (signal?.aborted) {
                texture?.dispose?.();
                throw createAbortError();
            }
            return texture;
        });
    }
    return new Promise((resolve, reject) => {
        const image = new globalThis.Image();
        let settled = false;
        const cleanup = () => {
            signal.removeEventListener?.("abort", onAbort);
            image.onload = null;
            image.onerror = null;
        };
        const rejectOnce = (error) => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(error);
        };
        const onAbort = () => {
            if (settled) return;
            settled = true;
            cleanup();
            image.src = "";
            reject(createAbortError());
        };
        if (signal.aborted) {
            onAbort();
            return;
        }
        signal.addEventListener?.("abort", onAbort, { once: true });
        image.crossOrigin = "anonymous";
        image.onload = () => {
            if (settled) return;
            settled = true;
            const texture = new THREE.Texture(image);
            texture.needsUpdate = true;
            cleanup();
            resolve(texture);
        };
        image.onerror = () => rejectOnce(new Error(`Unable to load texture ${textureUrl}.`));
        image.src = textureUrl;
    });
}

function isNasaUint16MoonDem(fileName) {
    return /(?:^|\/)ldem_16_uint_quality\.png(?:$|[?#])/i.test(String(fileName || ""));
}

export function createUint16MoonDemTexture(THREE, parsedPng) {
    const width = Number(parsedPng?.width) || 0;
    const height = Number(parsedPng?.height) || 0;
    const source = parsedPng?.data;
    if (
        Number(parsedPng?.depth) !== 16 ||
        width < 2 ||
        height < 2 ||
        !(source instanceof Uint16Array) ||
        source.length < width * height * 4
    ) {
        throw new Error("Expected a 16-bit RGBA PNG decode for the NASA Moon DEM.");
    }

    const heightData = decodeMoonUint16RgbaToFloatHeightData(source, width, height);
    const legacyHeightData = new Uint8Array(width * height);
    for (let pixel = 0; pixel < heightData.length; pixel += 1) {
        const sample = source[pixel * 4];
        legacyHeightData[pixel] = Math.round(sample / 257);
    }
    const texture = new THREE.DataTexture(
        heightData,
        width,
        height,
        THREE.RedFormat,
        THREE.FloatType,
    );
    texture.flipY = true;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.userData = {
        ...(texture.userData || {}),
        moonDemEncoding: "nasa-uint16-float",
        sourceBitDepth: 16,
    };
    const legacyTexture = new THREE.DataTexture(
        legacyHeightData,
        width,
        height,
        THREE.RedFormat,
        THREE.UnsignedByteType,
    );
    legacyTexture.flipY = true;
    legacyTexture.wrapS = THREE.RepeatWrapping;
    legacyTexture.wrapT = THREE.ClampToEdgeWrapping;
    legacyTexture.minFilter = THREE.LinearFilter;
    legacyTexture.magFilter = THREE.LinearFilter;
    legacyTexture.generateMipmaps = false;
    legacyTexture.userData = {
        ...(legacyTexture.userData || {}),
        moonDemEncoding: "legacy-uint8-view",
        sourceBitDepth: 8,
    };
    legacyTexture.needsUpdate = true;
    texture.userData.legacyTexture = legacyTexture;
    texture.addEventListener?.("dispose", () => legacyTexture.dispose?.());
    texture.needsUpdate = true;
    return texture;
}

function createPhysicalMoonNormalTexture(THREE, normalData, width, height) {
    const texture = new THREE.DataTexture(
        normalData,
        width,
        height,
        THREE.RGBAFormat,
        THREE.HalfFloatType,
    );
    texture.flipY = true;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.userData = {
        ...(texture.userData || {}),
        moonNormalEncoding: "physical-spherical-half-float",
    };
    texture.needsUpdate = true;
    return texture;
}

function createAbortError() {
    const error = new Error("Moon DEM load was superseded.");
    error.name = "AbortError";
    return error;
}

function throwIfAborted(signal) {
    if (signal?.aborted) {
        throw createAbortError();
    }
}

function loadTextureBlob(THREE, loader, blob, signal = null) {
    if (typeof globalThis.Image !== "function") {
        const objectUrl = URL.createObjectURL(blob);
        return loadTextureUrl(loader, objectUrl).then((texture) => {
            if (signal?.aborted) {
                texture?.dispose?.();
                throw createAbortError();
            }
            return texture;
        }).finally(() => URL.revokeObjectURL(objectUrl));
    }

    return new Promise((resolve, reject) => {
        const image = new globalThis.Image();
        const objectUrl = URL.createObjectURL(blob);
        let settled = false;
        const cleanup = () => {
            signal?.removeEventListener?.("abort", onAbort);
            image.onload = null;
            image.onerror = null;
            URL.revokeObjectURL(objectUrl);
        };
        const rejectOnce = (error) => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(error);
        };
        const onAbort = () => {
            if (settled) return;
            settled = true;
            cleanup();
            image.src = "";
            reject(createAbortError());
        };
        if (signal?.aborted) {
            onAbort();
            return;
        }
        signal?.addEventListener?.("abort", onAbort, { once: true });
        image.onload = () => {
            if (settled) return;
            settled = true;
            const texture = new THREE.Texture(image);
            texture.needsUpdate = true;
            cleanup();
            resolve(texture);
        };
        image.onerror = () => rejectOnce(new Error("Unable to decode the Moon DEM image."));
        image.src = objectUrl;
    });
}

export function decodeNasaMoonDemInWorker(
    pngBytes,
    physicalNormalHeightScale,
    signal = null,
    physicalNormalOptions = null,
) {
    return new Promise((resolve, reject) => {
        const worker = new Worker(
            new URL("../workers/moon-dem-worker.js", import.meta.url),
            { type: "module" },
        );
        const cleanup = () => {
            signal?.removeEventListener?.("abort", onAbort);
            worker.terminate();
        };
        const onAbort = () => {
            cleanup();
            reject(createAbortError());
        };
        if (signal?.aborted) {
            onAbort();
            return;
        }
        signal?.addEventListener?.("abort", onAbort, { once: true });
        worker.onmessage = (event) => {
            cleanup();
            if (event.data?.error) {
                reject(new Error(event.data.error));
                return;
            }
            resolve(event.data);
        };
        worker.onerror = (event) => {
            cleanup();
            reject(new Error(event.message || "Moon DEM worker failed."));
        };
        worker.postMessage({
            pngBytes,
            physicalNormalHeightScale,
            ...(physicalNormalOptions || {}),
        }, [pngBytes]);
    });
}

function waitForPromiseWithSignal(promise, signal) {
    if (!signal) return promise;
    if (signal.aborted) return Promise.reject(createAbortError());
    return new Promise((resolve, reject) => {
        const cleanup = () => signal.removeEventListener?.("abort", onAbort);
        const onAbort = () => {
            cleanup();
            reject(createAbortError());
        };
        signal.addEventListener?.("abort", onAbort, { once: true });
        promise.then(
            (value) => {
                cleanup();
                resolve(value);
            },
            (error) => {
                cleanup();
                reject(error);
            },
        );
    });
}

function createMoonDemDecodeEntry(textureUrl, physicalNormalSettings) {
    const controller = new AbortController();
    const decodePromise = (async () => {
        const fetchStartedAt = globalThis.performance?.now?.() ?? Date.now();
        const response = await fetch(textureUrl, { signal: controller.signal });
        if (!response.ok) {
            throw new Error(`Unable to load NASA Moon DEM (${response.status}).`);
        }
        const pngBytes = await response.arrayBuffer();
        const fetchMilliseconds = (globalThis.performance?.now?.() ?? Date.now()) - fetchStartedAt;
        const legacyBlob = new Blob([pngBytes], { type: "image/png" });
        const workerResult = await decodeNasaMoonDemInWorker(
            pngBytes,
            physicalNormalSettings.physicalNormalHeightScale,
            controller.signal,
            physicalNormalSettings,
        );
        return { fetchMilliseconds, legacyBlob, workerResult };
    })();
    return {
        controller,
        decodePromise,
        settled: false,
        subscriberCount: 0,
    };
}

async function acquireMoonDemDecode(textureUrl, physicalNormalSettings, signal) {
    const cacheKey = `${textureUrl}\u0000${JSON.stringify(physicalNormalSettings)}`;
    let entry = inFlightMoonDemDecodes.get(cacheKey);
    if (!entry) {
        entry = createMoonDemDecodeEntry(textureUrl, physicalNormalSettings);
        inFlightMoonDemDecodes.set(cacheKey, entry);
        entry.decodePromise.then(
            () => {
                entry.settled = true;
                if (inFlightMoonDemDecodes.get(cacheKey) === entry) {
                    inFlightMoonDemDecodes.delete(cacheKey);
                }
            },
            () => {
                entry.settled = true;
                if (inFlightMoonDemDecodes.get(cacheKey) === entry) {
                    inFlightMoonDemDecodes.delete(cacheKey);
                }
            },
        );
    }
    entry.subscriberCount += 1;
    try {
        return await waitForPromiseWithSignal(entry.decodePromise, signal);
    } finally {
        entry.subscriberCount -= 1;
        if (entry.subscriberCount === 0 && !entry.settled) {
            if (inFlightMoonDemDecodes.get(cacheKey) === entry) {
                inFlightMoonDemDecodes.delete(cacheKey);
            }
            entry.controller.abort();
        }
    }
}

async function loadNasaUint16MoonDem(THREE, loader, fileName, renderSettings, signal = null) {
    const textureUrl = resolveRuntimeAssetUrl(fileName);
    const physicalNormalSettings = {
        physicalNormalHeightScale: Number(renderSettings?.physicalNormalHeightScale),
        physicalNormalSlopeBoost: Number(renderSettings?.physicalNormalSlopeBoost),
        physicalNormalSlopeBoostStart: Number(renderSettings?.physicalNormalSlopeBoostStart),
        physicalNormalSlopeBoostEnd: Number(renderSettings?.physicalNormalSlopeBoostEnd),
    };
    const { fetchMilliseconds, legacyBlob, workerResult } = await acquireMoonDemDecode(
        textureUrl,
        physicalNormalSettings,
        signal,
    );
    throwIfAborted(signal);
    const texture = new THREE.DataTexture(
        new Float32Array(workerResult.heightBuffer),
        workerResult.width,
        workerResult.height,
        THREE.RedFormat,
        THREE.FloatType,
    );
    texture.flipY = true;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.userData = {
        ...(texture.userData || {}),
        moonDemEncoding: "nasa-uint16-float",
        sourceBitDepth: 16,
        fetchMilliseconds,
        decodeMilliseconds: workerResult.decodeMilliseconds,
        normalBuildMilliseconds: workerResult.normalBuildMilliseconds,
    };
    const physicalNormalTexture = createPhysicalMoonNormalTexture(
        THREE,
        new Uint16Array(workerResult.normalBuffer),
        workerResult.width,
        workerResult.height,
    );
    physicalNormalTexture.userData.buildMilliseconds = workerResult.normalBuildMilliseconds;
    physicalNormalTexture.userData.sourceEncoding = "nasa-uint16-float";
    texture.userData.physicalNormalTexture = physicalNormalTexture;
    texture.addEventListener?.("dispose", () => physicalNormalTexture.dispose?.());
    if (signal?.aborted) {
        texture.dispose?.();
        throw createAbortError();
    }
    let legacyTexture;
    try {
        legacyTexture = await loadTextureBlob(THREE, loader, legacyBlob, signal);
    } catch (error) {
        texture.dispose?.();
        throw error;
    }
    if (signal?.aborted) {
        legacyTexture?.dispose?.();
        texture.dispose?.();
        throw createAbortError();
    }
    legacyTexture.wrapS = THREE.RepeatWrapping;
    legacyTexture.wrapT = THREE.ClampToEdgeWrapping;
    legacyTexture.minFilter = THREE.LinearFilter;
    legacyTexture.magFilter = THREE.LinearFilter;
    legacyTexture.needsUpdate = true;
    legacyTexture.userData = {
        ...(legacyTexture.userData || {}),
        moonDemEncoding: "legacy-browser-image",
        sourceBitDepth: 8,
    };
    texture.userData.legacyTexture = legacyTexture;
    texture.addEventListener?.("dispose", () => legacyTexture.dispose?.());
    texture.needsUpdate = true;
    return texture;
}

function normalizeTextureFileName(fileName) {
    return String(fileName || "").trim();
}

async function loadTextureWithFallback(loader, primaryFileName, fallbackFileName, {
    logLabel = "",
    THREE = null,
    signal = null,
} = {}) {
    try {
        const textureUrl = resolveRuntimeAssetUrl(primaryFileName);
        return await loadTextureUrlWithSignal(THREE, loader, textureUrl, signal);
    } catch (primaryError) {
        if (primaryError?.name === "AbortError") throw primaryError;
        if (!fallbackFileName || fallbackFileName === primaryFileName) {
            throw primaryError;
        }

        console.warn(
            `Moon asset load failed for ${logLabel || primaryFileName}; falling back to fast profile asset.`,
            primaryError,
        );
        const fallbackUrl = resolveRuntimeAssetUrl(fallbackFileName);
        return loadTextureUrlWithSignal(THREE, loader, fallbackUrl, signal);
    }
}

function loadTextureEntries(loader, entries, loadEntryTexture, { getCacheKey = null } = {}) {
    const promisesByCacheKey = new Map();

    return Promise.all(entries.map(([key, fileName]) => {
        const normalizedFileName = normalizeTextureFileName(fileName);
        if (!normalizedFileName) {
            return Promise.resolve(null);
        }

        const cacheKey = typeof getCacheKey === "function"
            ? getCacheKey(key, normalizedFileName)
            : normalizedFileName;
        if (!promisesByCacheKey.has(cacheKey)) {
            promisesByCacheKey.set(cacheKey, loadEntryTexture(key, normalizedFileName));
        }
        return promisesByCacheKey.get(cacheKey);
    }));
}

function resolveSceneTextureFiles({
    files = DEFAULT_SCENE_TEXTURE_FILES,
    search = null,
    moonRenderProfile = null,
    globalObject = typeof window !== "undefined" ? window : globalThis,
} = {}) {
    const moonAssets = resolveMoonRenderAssetSelection({
        search,
        profile: moonRenderProfile,
        globalObject,
    });
    const resolvedFiles = {
        ...files,
        moonMap: moonAssets.active.moonMap || files.moonMap,
        moonDisplacementMap: Object.prototype.hasOwnProperty.call(moonAssets.active, "moonDisplacementMap")
            ? moonAssets.active.moonDisplacementMap
            : files.moonDisplacementMap,
    };
    return { moonAssets, resolvedFiles };
}

function getSceneTextureCacheKey(key, fileName, moonAssets) {
    return MOON_TEXTURE_KEYS.has(key)
        ? `${key}\u0000${fileName}\u0000${normalizeTextureFileName(moonAssets.fallback[key])}`
        : `${SHAREABLE_TEXTURE_KEY_GROUPS[key] || key}\u0000${fileName}`;
}

async function loadSceneTextureEntry(loader, key, fileName, moonAssets, THREE, signal = null) {
    throwIfAborted(signal);
    let texture;
    if (MOON_TEXTURE_KEYS.has(key)) {
        if (key === "moonDisplacementMap" && isNasaUint16MoonDem(fileName)) {
            try {
                texture = await loadNasaUint16MoonDem(
                    THREE,
                    loader,
                    fileName,
                    moonAssets.activeRenderSettings,
                    signal,
                );
            } catch (error) {
                if (error?.name === "AbortError") throw error;
                const detail = error?.message ? ` ${error.message}` : "";
                throw new Error(`Detailed Moon DEM precision decode failed.${detail}`);
            }
        } else {
            texture = await loadTextureWithFallback(
                loader,
                fileName,
                moonAssets.fallback[key],
                {
                    logLabel: `${moonAssets.profile}.${key}`,
                    THREE,
                    signal,
                },
            );
        }
    } else {
        const textureUrl = resolveRuntimeAssetUrl(fileName);
        texture = await loadTextureUrlWithSignal(THREE, loader, textureUrl, signal);
    }
    if (signal?.aborted) {
        texture?.dispose?.();
        throw createAbortError();
    }
    return texture;
}

function makeTextureResult({
    THREE,
    entries,
    textures,
    minFilter = null,
    moonAssets,
}) {
    const byKey = {};
    let hasMoonTexture = false;
    for (let i = 0; i < entries.length; i += 1) {
        const [key] = entries[i];
        byKey[key] = textures[i];
        if (MOON_TEXTURE_KEYS.has(key)) {
            hasMoonTexture = true;
        }
    }
    if (!byKey.skyTexture && byKey.skyMilkyWayTexture) {
        byKey.skyTexture = byKey.skyMilkyWayTexture;
    }

    applyTextureDefaults({
        THREE,
        texturesByKey: byKey,
        minFilter,
    });

    if (hasMoonTexture) {
        byKey.moonRenderProfile = moonAssets.profile;
        byKey.moonRenderSettings = moonAssets.activeRenderSettings || null;
    }

    return byKey;
}

async function loadProgressiveTextureEntries({
    THREE,
    loader,
    entries,
    moonAssets,
    promisesByCacheKey,
    signal = null,
}) {
    const textures = [];
    for (const [key, fileName] of entries) {
        throwIfAborted(signal);
        const normalizedFileName = normalizeTextureFileName(fileName);
        if (!normalizedFileName) {
            textures.push(null);
            continue;
        }
        const cacheKey = getSceneTextureCacheKey(key, normalizedFileName, moonAssets);
        if (!promisesByCacheKey.has(cacheKey)) {
            promisesByCacheKey.set(
                cacheKey,
                loadSceneTextureEntry(loader, key, normalizedFileName, moonAssets, THREE, signal),
            );
        }
        textures.push(await promisesByCacheKey.get(cacheKey));
        throwIfAborted(signal);
    }
    return textures;
}

function setColorTextureSpace(THREE, texture) {
    if (!texture) return;
    if ("colorSpace" in texture && THREE.SRGBColorSpace) {
        texture.colorSpace = THREE.SRGBColorSpace;
    } else if ("encoding" in texture && THREE.sRGBEncoding) {
        texture.encoding = THREE.sRGBEncoding;
    }
}

function applyTextureDefaults({
    THREE,
    texturesByKey,
    minFilter = null,
}) {
    const textures = Object.values(texturesByKey);
    if (minFilter) {
        textures.forEach((texture) => {
            if (!texture) return;
            if (texture.userData?.moonDemEncoding === "nasa-uint16-float") return;
            texture.minFilter = minFilter;
        });
    }

    const moonDem = texturesByKey.moonDisplacementMap;
    if (moonDem) {
        moonDem.wrapS = THREE.RepeatWrapping;
        moonDem.wrapT = THREE.ClampToEdgeWrapping;
        moonDem.needsUpdate = true;
    }

    // Color textures should be sampled in sRGB space.
    setColorTextureSpace(THREE, texturesByKey.earthTexture);
    setColorTextureSpace(THREE, texturesByKey.earthPhotoTexture);
    setColorTextureSpace(THREE, texturesByKey.earthNightTexture);
    setColorTextureSpace(THREE, texturesByKey.moonMap);
    setColorTextureSpace(THREE, texturesByKey.skyMilkyWayTexture);
    setColorTextureSpace(THREE, texturesByKey.skyTexture);
    setColorTextureSpace(THREE, texturesByKey.skyConstellationTexture);
}

function createSolidTexture(THREE, hexColor) {
    const color = THREE.Color ? new THREE.Color(hexColor) : null;
    const r = Math.max(0, Math.min(255, Math.round((color?.r ?? 0) * 255)));
    const g = Math.max(0, Math.min(255, Math.round((color?.g ?? 0) * 255)));
    const b = Math.max(0, Math.min(255, Math.round((color?.b ?? 0) * 255)));
    const data = new Uint8Array([r, g, b, 255]);
    const texture = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
    texture.needsUpdate = true;
    return texture;
}

export function createPlaceholderSceneTextures({
    THREE,
    minFilter = null,
    search = null,
    moonRenderProfile = null,
    globalObject = typeof window !== "undefined" ? window : globalThis,
}) {
    const moonAssets = resolveMoonRenderAssetSelection({
        search,
        profile: moonRenderProfile,
        globalObject,
    });
    const byKey = {
        earthTexture: createSolidTexture(THREE, PLACEHOLDER_COLORS.earthTexture),
        earthPhotoTexture: createSolidTexture(THREE, PLACEHOLDER_COLORS.earthPhotoTexture),
        earthSpecularTexture: createSolidTexture(THREE, PLACEHOLDER_COLORS.earthSpecularTexture),
        earthNightTexture: createSolidTexture(THREE, PLACEHOLDER_COLORS.earthNightTexture),
        moonMap: createSolidTexture(THREE, PLACEHOLDER_COLORS.moonMap),
        moonDisplacementMap: createSolidTexture(THREE, PLACEHOLDER_COLORS.moonDisplacementMap),
        skyMilkyWayTexture: createSolidTexture(THREE, PLACEHOLDER_COLORS.skyMilkyWayTexture),
        skyTexture: createSolidTexture(THREE, PLACEHOLDER_COLORS.skyTexture),
        skyConstellationTexture: createSolidTexture(THREE, PLACEHOLDER_COLORS.skyConstellationTexture),
    };

    applyTextureDefaults({
        THREE,
        texturesByKey: byKey,
        minFilter,
    });

    byKey.moonRenderProfile = moonAssets.profile;
    byKey.moonRenderSettings = moonAssets.activeRenderSettings || null;

    return byKey;
}

export function loadSceneTextures({
    THREE,
    files = DEFAULT_SCENE_TEXTURE_FILES,
    minFilter = null,
    search = null,
    moonRenderProfile = null,
    globalObject = typeof window !== "undefined" ? window : globalThis,
    signal = null,
}) {
    const loader = new THREE.TextureLoader();
    const { moonAssets, resolvedFiles } = resolveSceneTextureFiles({
        files,
        search,
        moonRenderProfile,
        globalObject,
    });

    const entries = Object.entries(resolvedFiles);
    const texturePromise = loadTextureEntries(loader, entries, (key, fileName) => {
        return loadSceneTextureEntry(loader, key, fileName, moonAssets, THREE, signal);
    }, {
        getCacheKey: (key, fileName) => getSceneTextureCacheKey(key, fileName, moonAssets),
    });

    return texturePromise.then((textures) => {
        const byKey = {};
        for (let i = 0; i < entries.length; i += 1) {
            const [key] = entries[i];
            byKey[key] = textures[i];
        }
        if (!byKey.skyTexture && byKey.skyMilkyWayTexture) {
            byKey.skyTexture = byKey.skyMilkyWayTexture;
        }

        applyTextureDefaults({
            THREE,
            texturesByKey: byKey,
            minFilter,
        });

        byKey.moonRenderProfile = moonAssets.profile;
        byKey.moonRenderSettings = moonAssets.activeRenderSettings || null;

        return byKey;
    });
}

export async function loadSceneTexturesProgressively({
    THREE,
    files = DEFAULT_SCENE_TEXTURE_FILES,
    minFilter = null,
    search = null,
    moonRenderProfile = null,
    globalObject = typeof window !== "undefined" ? window : globalThis,
    textureGroups = DEFAULT_PROGRESSIVE_SCENE_TEXTURE_GROUPS,
    beforeLoadGroup = null,
    beforeApplyGroup = null,
    onTexturesReady = null,
    signal = null,
} = {}) {
    throwIfAborted(signal);
    const loader = new THREE.TextureLoader();
    const { moonAssets, resolvedFiles } = resolveSceneTextureFiles({
        files,
        search,
        moonRenderProfile,
        globalObject,
    });
    const promisesByCacheKey = new Map();
    const finalByKey = {};

    for (let groupIndex = 0; groupIndex < textureGroups.length; groupIndex += 1) {
        throwIfAborted(signal);
        const keys = textureGroups[groupIndex];
        const entries = keys
            .map((key) => [key, resolvedFiles[key]])
            .filter(([, fileName]) => !!normalizeTextureFileName(fileName));

        if (!entries.length) {
            continue;
        }

        const groupInfo = {
            groupIndex,
            keys: entries.map(([key]) => key),
            entries,
        };
        if (typeof beforeLoadGroup === "function") {
            await beforeLoadGroup(groupInfo);
            throwIfAborted(signal);
        }

        const textures = await loadProgressiveTextureEntries({
            THREE,
            loader,
            entries,
            moonAssets,
            promisesByCacheKey,
            signal,
        });
        const byKey = makeTextureResult({
            THREE,
            entries,
            textures,
            minFilter,
            moonAssets,
        });

        if (typeof beforeApplyGroup === "function") {
            await beforeApplyGroup({
                ...groupInfo,
                textures: byKey,
            });
            throwIfAborted(signal);
        }
        Object.assign(finalByKey, byKey);
        if (typeof onTexturesReady === "function") {
            await onTexturesReady(byKey, {
                ...groupInfo,
                done: false,
            });
            throwIfAborted(signal);
        }
    }

    throwIfAborted(signal);
    if (!finalByKey.skyTexture && finalByKey.skyMilkyWayTexture) {
        finalByKey.skyTexture = finalByKey.skyMilkyWayTexture;
    }
    if (!normalizeTextureFileName(moonAssets.active.moonDisplacementMap)) {
        finalByKey.moonDisplacementMap = null;
    }
    finalByKey.moonRenderProfile = moonAssets.profile;
    finalByKey.moonRenderSettings = moonAssets.activeRenderSettings || null;
    return finalByKey;
}

export function loadMoonRenderProfileTextures({
    THREE,
    minFilter = null,
    search = null,
    moonRenderProfile = null,
    globalObject = typeof window !== "undefined" ? window : globalThis,
    signal = null,
}) {
    const loader = new THREE.TextureLoader();
    const moonAssets = resolveMoonRenderAssetSelection({
        search,
        profile: moonRenderProfile,
        globalObject,
    });
    const entries = [
        ["moonMap", moonAssets.active.moonMap],
        ["moonDisplacementMap", moonAssets.active.moonDisplacementMap],
    ];
    const texturePromise = loadTextureEntries(loader, entries, (key, fileName) => (
        loadSceneTextureEntry(loader, key, fileName, moonAssets, THREE, signal)
    ), {
        getCacheKey: (key, fileName) => (
            `${key}\u0000${fileName}\u0000${normalizeTextureFileName(moonAssets.fallback[key])}`
        ),
    });

    return texturePromise.then((textures) => {
        const byKey = {};
        for (let i = 0; i < entries.length; i += 1) {
            const [key] = entries[i];
            byKey[key] = textures[i];
        }

        applyTextureDefaults({
            THREE,
            texturesByKey: byKey,
            minFilter,
        });

        byKey.moonRenderProfile = moonAssets.profile;
        byKey.moonRenderSettings = moonAssets.activeRenderSettings || null;

        return byKey;
    });
}
