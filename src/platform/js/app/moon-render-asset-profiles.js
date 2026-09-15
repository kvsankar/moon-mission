import { MOON_HEIGHT_SCALE, MOON_HEIGHT_BIAS } from "../rendering/moon-terrain-package.js";
import { constrainMoonRenderProfile, resolveDefaultMoonProfile } from "../core/domain/render-device-policy.js";

const DEFAULT_FAST_MOON_RENDER_ASSET_PATHS = Object.freeze({
    moonMap: "images/moon/lroc_color_2025_4k_fast.jpg",
    moonDisplacementMap: "images/moon/terrain-medium-v2.moon.gz",
});

const DEFAULT_LOW_MOON_RENDER_ASSET_PATHS = Object.freeze({
    moonMap: "images/moon/lroc_color_2025_2k_low.jpg",
    moonDisplacementMap: "images/moon/terrain-low-v2.moon.gz",
});

const DEFAULT_FAST_MOON_RENDER_SETTINGS = Object.freeze({
    geometryWidthSegments: 384,
    geometryHeightSegments: 192,
    normalMapMaxWidth: 2048,
    normalScale: 2.0,
    displacementScale: 0.012,
    displacementBias: -0.0046,
    physicalGeometryWidthSegments: 384,
    physicalGeometryHeightSegments: 192,
    physicalDisplacementScale: MOON_HEIGHT_SCALE,
    physicalDisplacementBias: MOON_HEIGHT_BIAS,
    physicalNormalHeightScale: MOON_HEIGHT_SCALE,
    // Compensate the compact, source-slope-filtered normals without extra GPU work.
    physicalNormalResolutionCompensation: 2.1,
    physicalNormalSlopeBoost: 1.0,
    physicalNormalSlopeBoostStart: 0.16,
    physicalNormalSlopeBoostEnd: 0.34,
    physicalTerrainShadowTexelStride: 1.0,
    physicalTerrainShadowSamples: 8,
    roughness: 0.958,
    metalness: 0.0,
    lommelSeeligerBlend: 0.20,
    shadowLift: 0.0,
    shadowWeightExponent: 1.9,
    terrainShadowStrength: 1.2,
    terrainShadowTexelStride: 6.0,
    terrainShadowSamples: 6,
    shadowNormalBias: 0.00022,
    shadowBias: -0.000004,
});

const DEFAULT_QUALITY_MOON_RENDER_SETTINGS = Object.freeze({
    geometryWidthSegments: 512,
    geometryHeightSegments: 512,
    normalMapMaxWidth: 5760,
    normalScale: 2.2,
    displacementScale: 0.013,
    displacementBias: -0.0048,
    physicalGeometryWidthSegments: 1024,
    physicalGeometryHeightSegments: 512,
    // NASA CGI Moon Kit uint DEM: half-meters with +10 km offset,
    // referenced to a 1737.4 km sphere.
    physicalDisplacementScale: 0.018860078277886497,
    physicalDisplacementBias: -0.005755726948313572,
    physicalNormalHeightScale: 0.018860078277886497,
    physicalNormalResolutionCompensation: 2.08,
    physicalNormalSlopeBoost: 1.5,
    physicalNormalSlopeBoostStart: 0.16,
    physicalNormalSlopeBoostEnd: 0.34,
    physicalTerrainShadowTexelStride: 2.0,
    physicalTerrainShadowSamples: 20,
    roughness: 0.955,
    metalness: 0.0,
    lommelSeeligerBlend: 0.20,
    shadowLift: 0.0,
    shadowWeightExponent: 1.92,
    terrainShadowStrength: 1.2,
    terrainShadowTexelStride: 7.0,
    terrainShadowSamples: 12,
    shadowNormalBias: 0.00018,
    shadowBias: -0.000003,
});

const DEFAULT_LOW_MOON_RENDER_SETTINGS = Object.freeze({
    ...DEFAULT_FAST_MOON_RENDER_SETTINGS,
    geometryWidthSegments: 256,
    geometryHeightSegments: 128,
    normalMapMaxWidth: 1024,
    physicalGeometryWidthSegments: 256,
    physicalGeometryHeightSegments: 128,
    physicalTerrainShadowSamples: 4,
});

export const MOON_PREVIEW_RENDER_SETTINGS = Object.freeze({
    ...DEFAULT_LOW_MOON_RENDER_SETTINGS,
    geometryWidthSegments: 128,
    geometryHeightSegments: 64,
    physicalGeometryWidthSegments: 128,
    physicalGeometryHeightSegments: 64,
    physicalDisplacementScale: 0,
    physicalDisplacementBias: 0,
    physicalNormalHeightScale: 0,
    physicalTerrainShadowSamples: 0,
});

export const MOON_RENDER_ASSET_PROFILE_STORAGE_KEY = "moonRenderAssetProfile";
export const MOON_RENDER_ASSET_PATHS_STORAGE_KEY = "moonRenderAssetPaths";

export const DEFAULT_MOON_RENDER_ASSET_PROFILES = Object.freeze({
    low: DEFAULT_LOW_MOON_RENDER_ASSET_PATHS,
    fast: DEFAULT_FAST_MOON_RENDER_ASSET_PATHS,
    // NASA SVS CGI Moon Kit runtime derivatives.
    // Source page: https://svs.gsfc.nasa.gov/4720/
    // Standard color is derived from the 2025 4k TIFF master.
    // Detailed color is derived from the 2025 16k TIFF master.
    quality: Object.freeze({
        moonMap: "images/moon/lroc_color_2025_16k_quality.jpg",
        moonDisplacementMap: "images/moon/ldem_16_uint_quality.png",
    }),
});

export const DEFAULT_MOON_RENDER_PROFILE_SETTINGS = Object.freeze({
    low: DEFAULT_LOW_MOON_RENDER_SETTINGS,
    fast: DEFAULT_FAST_MOON_RENDER_SETTINGS,
    quality: DEFAULT_QUALITY_MOON_RENDER_SETTINGS,
});

export const MOON_RENDER_ASSET_PROFILE_NAMES = Object.freeze(["low", "fast", "quality"]);

function safeGetStorage(globalObject) {
    try {
        return globalObject?.localStorage || null;
    } catch {
        return null;
    }
}

function normalizeProfileName(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "quality") {
        return "quality";
    }
    if (normalized === "low") {
        return "low";
    }
    if (normalized === "fast") {
        return "fast";
    }
    return null;
}

function normalizeAssetPath(pathValue, fallbackValue) {
    const normalized = String(pathValue || "").trim();
    return normalized || fallbackValue;
}

function migrateLegacyMoonAssetPath(profileName, assetKey, pathValue) {
    const normalized = String(pathValue || "").trim();
    if (!normalized) {
        return normalized;
    }

    if (assetKey === "moonDisplacementMap" && (
        (profileName === "low" && normalized === "images/moon/terrain-low-v1.moon.gz") ||
        (profileName === "fast" && normalized === "images/moon/terrain-medium-v1.moon.gz")
    )) return DEFAULT_MOON_RENDER_ASSET_PROFILES[profileName].moonDisplacementMap;
    if (assetKey === "moonDisplacementMap" && normalized === "images/moon/ldem_16_gsfc.png") {
        return DEFAULT_MOON_RENDER_ASSET_PROFILES[profileName].moonDisplacementMap;
    }
    if (assetKey === "moonMap") {
        if (profileName === "fast" && normalized === "images/moon/Solarsystemscope_texture_8k_moon.jpg") {
            return DEFAULT_FAST_MOON_RENDER_ASSET_PATHS.moonMap;
        }
        if (profileName === "quality" && normalized === "images/moon/lroc_color_2025_8k_quality.jpg") {
            return DEFAULT_MOON_RENDER_ASSET_PROFILES.quality.moonMap;
        }
    }

    return normalized;
}

function normalizeFiniteNumber(value, fallbackValue) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallbackValue;
}

function mergeRenderSettings(defaultSettings, overrides) {
    return Object.fromEntries(Object.entries(defaultSettings).map(([key, value]) => [
        key, normalizeFiniteNumber(overrides?.[key], value),
    ]));
}

export function resolveMoonRenderAssetProfiles({
    globalObject = typeof window !== "undefined" ? window : globalThis,
} = {}) {
    const merged = {
        low: { ...DEFAULT_MOON_RENDER_ASSET_PROFILES.low },
        fast: { ...DEFAULT_MOON_RENDER_ASSET_PROFILES.fast },
        quality: { ...DEFAULT_MOON_RENDER_ASSET_PROFILES.quality },
    };

    const storage = safeGetStorage(globalObject);
    const storedText = storage?.getItem?.(MOON_RENDER_ASSET_PATHS_STORAGE_KEY);
    if (storedText) {
        try {
            const storedOverrides = JSON.parse(storedText);
            if (storedOverrides && typeof storedOverrides === "object") {
                MOON_RENDER_ASSET_PROFILE_NAMES.forEach((profileName) => {
                    const profileOverrides = storedOverrides[profileName];
                    if (!profileOverrides || typeof profileOverrides !== "object") {
                        return;
                    }
                    merged[profileName] = {
                        moonMap: normalizeAssetPath(
                            migrateLegacyMoonAssetPath(profileName, "moonMap", profileOverrides.moonMap),
                            merged[profileName].moonMap,
                        ),
                        moonDisplacementMap: normalizeAssetPath(
                            migrateLegacyMoonAssetPath(profileName, "moonDisplacementMap", profileOverrides.moonDisplacementMap),
                            merged[profileName].moonDisplacementMap,
                        ),
                    };
                });
            }
        } catch {
            // Ignore corrupt local overrides and continue with defaults.
        }
    }

    const overrides = globalObject?.MOON_RENDER_ASSET_PATHS;
    if (!overrides || typeof overrides !== "object") {
        return merged;
    }

    MOON_RENDER_ASSET_PROFILE_NAMES.forEach((profileName) => {
        const profileOverrides = overrides[profileName];
        if (!profileOverrides || typeof profileOverrides !== "object") {
            return;
        }
        merged[profileName] = {
            moonMap: normalizeAssetPath(
                migrateLegacyMoonAssetPath(profileName, "moonMap", profileOverrides.moonMap),
                merged[profileName].moonMap,
            ),
            moonDisplacementMap: normalizeAssetPath(
                migrateLegacyMoonAssetPath(profileName, "moonDisplacementMap", profileOverrides.moonDisplacementMap),
                merged[profileName].moonDisplacementMap,
            ),
        };
    });

    return merged;
}

export function resolveMoonRenderProfileSettings({
    globalObject = typeof window !== "undefined" ? window : globalThis,
} = {}) {
    const merged = {
        low: { ...DEFAULT_MOON_RENDER_PROFILE_SETTINGS.low },
        fast: { ...DEFAULT_MOON_RENDER_PROFILE_SETTINGS.fast },
        quality: { ...DEFAULT_MOON_RENDER_PROFILE_SETTINGS.quality },
    };

    const overrides = globalObject?.MOON_RENDER_PROFILE_SETTINGS;
    if (!overrides || typeof overrides !== "object") {
        return merged;
    }

    MOON_RENDER_ASSET_PROFILE_NAMES.forEach((profileName) => {
        const profileOverrides = overrides[profileName];
        if (!profileOverrides || typeof profileOverrides !== "object") {
            return;
        }
        merged[profileName] = mergeRenderSettings(merged[profileName], profileOverrides);
    });

    return merged;
}

export function resolveMoonRenderAssetProfile({
    search = null,
    globalObject = typeof window !== "undefined" ? window : globalThis,
} = {}) {
    const searchText = search == null ? String(globalObject?.location?.search || "") : String(search || "");
    const params = new URLSearchParams(searchText);
    const queryProfile = normalizeProfileName(params.get("moonRenderProfile") || params.get("moonProfile"));
    const globalProfile = normalizeProfileName(globalObject?.MOON_RENDER_ASSET_PROFILE);
    const storedProfile = normalizeProfileName(safeGetStorage(globalObject)?.getItem?.(MOON_RENDER_ASSET_PROFILE_STORAGE_KEY));
    return constrainMoonRenderProfile(
        queryProfile || globalProfile || storedProfile || resolveDefaultMoonProfile(globalObject),
        globalObject,
    );
}

export function resolveMoonRenderAssetSelection({
    search = null,
    profile = null,
    globalObject = typeof window !== "undefined" ? window : globalThis,
} = {}) {
    const profiles = resolveMoonRenderAssetProfiles({ globalObject });
    const settingsProfiles = resolveMoonRenderProfileSettings({ globalObject });
    const resolvedProfile = constrainMoonRenderProfile(
        normalizeProfileName(profile) || resolveMoonRenderAssetProfile({ search, globalObject }),
        globalObject,
    );
    const active = profiles[resolvedProfile] || profiles.fast;
    const activeRenderSettings = settingsProfiles[resolvedProfile] || settingsProfiles.fast;

    return {
        profile: resolvedProfile,
        active,
        fallback: profiles.fast,
        activeRenderSettings,
        fallbackRenderSettings: settingsProfiles.fast,
    };
}
