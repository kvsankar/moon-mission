import { DEFAULT_MOON_RENDER_ASSET_PROFILES, MOON_PREVIEW_RENDER_SETTINGS, resolveMoonRenderAssetSelection } from "./moon-render-asset-profiles.js";
import { resolveRuntimeAssetUrl } from "../core/domain/runtime-asset-url.js";
import { decodeMoonUint16RgbaToFloatHeightData } from "../rendering/moon-physical-normal-data.js";
import { disposeUnclaimedTextures, registerTextureDependency } from "../rendering/texture-ownership.js";

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

// Bundled with the app: first Moon paint does not depend on the large-asset CDN.
export const MOON_PREVIEW_TEXTURE_URL = new URL("../../assets/moon-preview.jpg", import.meta.url).href;

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
                disposeUnclaimedTextures([texture]);
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
    texture.needsUpdate = true;
    return texture;
}

function createPhysicalMoonNormalTexture(THREE, normalData, width, height) {
    const texture = new THREE.DataTexture(
        normalData,
        width,
        height,
        THREE.RGBAFormat,
        normalData instanceof Uint8Array ? THREE.UnsignedByteType : THREE.HalfFloatType,
    );
    texture.flipY = true;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.userData = {
        ...(texture.userData || {}),
        moonNormalEncoding: normalData instanceof Uint8Array ? "physical-spherical-rgba8" : "physical-spherical-half-float",
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
        const workerResult = await decodeNasaMoonDemInWorker(
            pngBytes,
            physicalNormalSettings.physicalNormalHeightScale,
            controller.signal,
            physicalNormalSettings,
        );
        return { fetchMilliseconds, workerResult };
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

async function loadNasaUint16MoonDem(THREE, fileName, renderSettings, signal = null) {
    const textureUrl = resolveRuntimeAssetUrl(fileName);
    const physicalNormalSettings = {
        physicalNormalHeightScale: Number(renderSettings?.physicalNormalHeightScale),
        physicalNormalSlopeBoost: Number(renderSettings?.physicalNormalSlopeBoost),
        physicalNormalSlopeBoostStart: Number(renderSettings?.physicalNormalSlopeBoostStart),
        physicalNormalSlopeBoostEnd: Number(renderSettings?.physicalNormalSlopeBoostEnd),
    };
    const { fetchMilliseconds, workerResult } = await acquireMoonDemDecode(
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
        workerResult.normalType === "uint8" ? new Uint8Array(workerResult.normalBuffer) : new Uint16Array(workerResult.normalBuffer),
        workerResult.width,
        workerResult.height,
    );
    physicalNormalTexture.userData.buildMilliseconds = workerResult.normalBuildMilliseconds;
    physicalNormalTexture.userData.sourceEncoding = "nasa-uint16-float";
    texture.userData.physicalNormalTexture = physicalNormalTexture;
    registerTextureDependency(texture, physicalNormalTexture);
    if (signal?.aborted) {
        disposeUnclaimedTextures([texture]);
        throw createAbortError();
    }
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
    })).catch(error => {
        const disposed = new Set();
        for (const promise of promisesByCacheKey.values()) promise.then(texture => {
            if (texture && !disposed.has(texture)) { disposed.add(texture); disposeUnclaimedTextures([texture]); }
        }, () => {});
        throw error;
    });
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
        if (key === "moonDisplacementMap") {
            try {
                texture = await loadNasaUint16MoonDem(
                    THREE,
                    fileName,
                    moonAssets.activeRenderSettings,
                    signal,
                );
            } catch (error) {
                if (error?.name === "AbortError") throw error;
                const detail = error?.message ? ` ${error.message}` : "";
                throw new Error(`Moon terrain precision decode failed.${detail}`);
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
        disposeUnclaimedTextures([texture]);
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
    // Linear minification never samples mip levels; avoid allocating/building
    // an unused 16K mip chain in every main/auxiliary WebGL context.
    if (texturesByKey.moonMap && minFilter === THREE.LinearFilter) {
        texturesByKey.moonMap.generateMipmaps = false;
    }
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
    prefetchMoon = textureGroups === DEFAULT_PROGRESSIVE_SCENE_TEXTURE_GROUPS,
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
    const deliveredTextures = new Set();
    if (prefetchMoon) {
        for (const key of ["moonMap", "moonDisplacementMap"]) {
            const fileName = normalizeTextureFileName(resolvedFiles[key]);
            if (!fileName || !textureGroups.some(group => group.includes(key))) continue;
            const cacheKey = getSceneTextureCacheKey(key, fileName, moonAssets);
            const loading = loadSceneTextureEntry(loader, key, fileName, moonAssets, THREE, signal);
            // The normal group loop remains responsible for propagating failure.
            // A prefetched rejection must not become unhandled while Earth loads.
            loading.catch(() => {});
            promisesByCacheKey.set(cacheKey, loading);
        }
    }

    try {
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
            // Consumers may move/delete payload fields while taking ownership.
            // The receipt must retain the identities supplied by this producer.
            const groupResources = new Set(textures.filter(texture => typeof texture?.dispose === "function"));
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
                let accepting = true;
                const acceptOwnership = () => {
                    if (!accepting) return false;
                    groupResources.forEach(texture => deliveredTextures.add(texture));
                    return true;
                };
                try {
                    await onTexturesReady(byKey, { ...groupInfo, done: false, acceptOwnership });
                    // Successful legacy callbacks accept their whole group. A
                    // scene may accept earlier, before subsequent render effects.
                    acceptOwnership();
                } finally {
                    accepting = false;
                }
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
    } catch (error) {
        const disposed = new Set();
        for (const loading of promisesByCacheKey.values()) {
            loading.then(texture => {
                if (!texture || deliveredTextures.has(texture) || disposed.has(texture)) return;
                disposed.add(texture);
                disposeUnclaimedTextures([texture]);
            }, () => {});
        }
        throw error;
    }
}

export async function loadMoonRenderProfileTextures({
    THREE,
    minFilter = null,
    search = null,
    moonRenderProfile = null,
    globalObject = typeof window !== "undefined" ? window : globalThis,
    signal = null,
    previewOnly = false,
    onPreview = null,
}) {
    const loader = new THREE.TextureLoader();
    if (previewOnly || typeof onPreview === "function") {
        let previewMap = null;
        try {
            previewMap = await loadTextureUrlWithSignal(THREE, loader, MOON_PREVIEW_TEXTURE_URL, signal);
        } catch (error) {
            if (error?.name === "AbortError" || previewOnly) throw error;
            console.warn("Moon preview unavailable; loading requested resources directly.", error);
        }
        if (previewMap) {
            const preview = {
                moonMap: previewMap,
                moonDisplacementMap: null,
                moonRenderProfile: "low",
                moonRenderSettings: MOON_PREVIEW_RENDER_SETTINGS,
                moonPreview: true,
            };
            applyTextureDefaults({ THREE, texturesByKey: { moonMap: previewMap }, minFilter: minFilter || THREE.LinearFilter });
            if (previewOnly) return preview;
            await onPreview(preview);
            throwIfAborted(signal);
        }
    }
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
