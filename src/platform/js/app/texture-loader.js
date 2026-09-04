import { DEFAULT_MOON_RENDER_ASSET_PROFILES, resolveMoonRenderAssetSelection } from "./moon-render-asset-profiles.js";
import { resolveRuntimeAssetUrl } from "../core/domain/runtime-asset-url.js";

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

function loadTexture(loader, fileName) {
    const textureUrl = resolveRuntimeAssetUrl(fileName);
    return new Promise((resolve, reject) => {
        loader.load(
            textureUrl,
            (texture) => resolve(texture),
            undefined,
            (error) => reject(error),
        );
    });
}

function normalizeTextureFileName(fileName) {
    return String(fileName || "").trim();
}

async function loadTextureWithFallback(loader, primaryFileName, fallbackFileName, { logLabel = "" } = {}) {
    try {
        return await loadTexture(loader, primaryFileName);
    } catch (primaryError) {
        if (!fallbackFileName || fallbackFileName === primaryFileName) {
            throw primaryError;
        }

        console.warn(
            `Moon asset load failed for ${logLabel || primaryFileName}; falling back to fast profile asset.`,
            primaryError,
        );
        return loadTexture(loader, fallbackFileName);
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

function loadSceneTextureEntry(loader, key, fileName, moonAssets) {
    if (MOON_TEXTURE_KEYS.has(key)) {
        return loadTextureWithFallback(
            loader,
            fileName,
            moonAssets.fallback[key],
            { logLabel: `${moonAssets.profile}.${key}` },
        );
    }
    return loadTexture(loader, fileName);
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
    loader,
    entries,
    moonAssets,
    promisesByCacheKey,
}) {
    const textures = [];
    for (const [key, fileName] of entries) {
        const normalizedFileName = normalizeTextureFileName(fileName);
        if (!normalizedFileName) {
            textures.push(null);
            continue;
        }
        const cacheKey = getSceneTextureCacheKey(key, normalizedFileName, moonAssets);
        if (!promisesByCacheKey.has(cacheKey)) {
            promisesByCacheKey.set(
                cacheKey,
                loadSceneTextureEntry(loader, key, normalizedFileName, moonAssets),
            );
        }
        textures.push(await promisesByCacheKey.get(cacheKey));
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
            texture.minFilter = minFilter;
        });
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
        return loadSceneTextureEntry(loader, key, fileName, moonAssets);
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
} = {}) {
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
        }

        const textures = await loadProgressiveTextureEntries({
            loader,
            entries,
            moonAssets,
            promisesByCacheKey,
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
        }
        Object.assign(finalByKey, byKey);
        if (typeof onTexturesReady === "function") {
            await onTexturesReady(byKey, {
                ...groupInfo,
                done: false,
            });
        }
    }

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
        loadTextureWithFallback(
            loader,
            fileName,
            moonAssets.fallback[key],
            { logLabel: `${moonAssets.profile}.${key}` },
        )
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
