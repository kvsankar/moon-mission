const DEFAULT_FAST_MOON_RENDER_ASSET_PATHS = Object.freeze({
    moonMap: "images/moon/lroc_color_2025_4k_fast.jpg",
    moonDisplacementMap: "images/moon/ldem_16_gsfc.png",
});

const DEFAULT_LOW_MOON_RENDER_ASSET_PATHS = Object.freeze({
    moonMap: DEFAULT_FAST_MOON_RENDER_ASSET_PATHS.moonMap,
    moonDisplacementMap: "",
});

const DEFAULT_FAST_MOON_RENDER_SETTINGS = Object.freeze({
    geometryWidthSegments: 384,
    geometryHeightSegments: 192,
    normalMapMaxWidth: 2048,
    normalMapStrength: 2.2,
    normalDetailBoost: 1.85,
    normalDetailRadius: 4,
    normalScale: 2.0,
    displacementScale: 0.012,
    displacementBias: -0.0046,
    physicalGeometryWidthSegments: 384,
    physicalGeometryHeightSegments: 192,
    physicalDisplacementScale: 0.012,
    physicalDisplacementBias: -0.0046,
    physicalNormalHeightScale: 0.0,
    physicalTerrainShadowTexelStride: 0.0,
    physicalTerrainShadowSamples: 0,
    roughness: 0.958,
    metalness: 0.0,
    lommelSeeligerBlend: 0.20,
    lsClampMin: 0.76,
    lsClampMax: 1.0,
    oppositionStrength: 0.0022,
    shadowLift: 0.0,
    highlightBoost: 1.15,
    shadowWeightExponent: 1.9,
    highlightWeightExponent: 1.2,
    terminatorContrast: 1.8,
    terminatorReliefStrength: 7.0,
    terminatorShadowFloor: 0.04,
    terminatorIndirectOcclusion: 0.96,
    terrainReliefStrength: 1.8,
    terrainShadowStrength: 1.2,
    terrainShadowTexelStride: 6.0,
    terrainShadowSlopeBias: 0.0014,
    terrainShadowSamples: 6,
    shadowNormalBias: 0.00022,
    shadowBias: -0.000004,
});

const DEFAULT_QUALITY_MOON_RENDER_SETTINGS = Object.freeze({
    geometryWidthSegments: 512,
    geometryHeightSegments: 512,
    normalMapMaxWidth: 5760,
    normalMapStrength: 2.4,
    normalDetailBoost: 2.0,
    normalDetailRadius: 4,
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
    physicalTerrainShadowTexelStride: 2.0,
    physicalTerrainShadowSamples: 20,
    roughness: 0.955,
    metalness: 0.0,
    lommelSeeligerBlend: 0.20,
    lsClampMin: 0.74,
    lsClampMax: 1.0,
    oppositionStrength: 0.0023,
    shadowLift: 0.0,
    highlightBoost: 1.20,
    shadowWeightExponent: 1.92,
    highlightWeightExponent: 1.2,
    terminatorContrast: 1.8,
    terminatorReliefStrength: 7.5,
    terminatorShadowFloor: 0.0,
    terminatorIndirectOcclusion: 1.0,
    terrainReliefStrength: 2.2,
    terrainShadowStrength: 1.2,
    terrainShadowTexelStride: 7.0,
    terrainShadowSlopeBias: 0.0014,
    terrainShadowSamples: 12,
    shadowNormalBias: 0.00018,
    shadowBias: -0.000003,
});

const DEFAULT_LOW_MOON_RENDER_SETTINGS = Object.freeze({
    ...DEFAULT_FAST_MOON_RENDER_SETTINGS,
    geometryWidthSegments: 128,
    geometryHeightSegments: 64,
    normalMapMaxWidth: 512,
    normalMapStrength: 0.0,
    normalDetailBoost: 0.0,
    normalScale: 0.0,
    displacementScale: 0.0,
    displacementBias: 0.0,
    physicalGeometryWidthSegments: 128,
    physicalGeometryHeightSegments: 64,
    physicalDisplacementScale: 0.0,
    physicalDisplacementBias: 0.0,
    physicalNormalHeightScale: 0.0,
    physicalTerrainShadowTexelStride: 0.0,
    physicalTerrainShadowSamples: 0,
    terrainReliefStrength: 0.0,
    terrainShadowStrength: 0.0,
    terrainShadowSamples: 0,
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

function resolveMissionSlug({ searchText = "", pathname = "" } = {}) {
    try {
        const params = new URLSearchParams(searchText);
        const missionFromQuery = String(params.get("mission") || "").trim().toLowerCase();
        if (missionFromQuery) {
            return missionFromQuery;
        }
    } catch {
        // Ignore malformed query strings.
    }

    const segments = String(pathname || "")
        .split("/")
        .map((segment) => segment.trim().toLowerCase())
        .filter(Boolean);
    if (segments.length === 0) {
        return "";
    }
    const lastSegment = segments[segments.length - 1];
    if (lastSegment && lastSegment !== "mission.html" && lastSegment !== "index.html") {
        return lastSegment;
    }
    return "";
}

function resolveMissionDefaultMoonRenderProfile({
    searchText = "",
    pathname = "",
} = {}) {
    const missionSlug = resolveMissionSlug({ searchText, pathname });
    if (missionSlug === "artemis2") {
        return "quality";
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
    if (!overrides || typeof overrides !== "object") {
        return { ...defaultSettings };
    }

    return {
        geometryWidthSegments: normalizeFiniteNumber(
            overrides.geometryWidthSegments,
            defaultSettings.geometryWidthSegments,
        ),
        geometryHeightSegments: normalizeFiniteNumber(
            overrides.geometryHeightSegments,
            defaultSettings.geometryHeightSegments,
        ),
        normalMapMaxWidth: normalizeFiniteNumber(
            overrides.normalMapMaxWidth,
            defaultSettings.normalMapMaxWidth,
        ),
        normalMapStrength: normalizeFiniteNumber(
            overrides.normalMapStrength,
            defaultSettings.normalMapStrength,
        ),
        normalDetailBoost: normalizeFiniteNumber(
            overrides.normalDetailBoost,
            defaultSettings.normalDetailBoost,
        ),
        normalDetailRadius: normalizeFiniteNumber(
            overrides.normalDetailRadius,
            defaultSettings.normalDetailRadius,
        ),
        normalScale: normalizeFiniteNumber(overrides.normalScale, defaultSettings.normalScale),
        displacementScale: normalizeFiniteNumber(
            overrides.displacementScale,
            defaultSettings.displacementScale,
        ),
        displacementBias: normalizeFiniteNumber(
            overrides.displacementBias,
            defaultSettings.displacementBias,
        ),
        physicalGeometryWidthSegments: normalizeFiniteNumber(
            overrides.physicalGeometryWidthSegments,
            defaultSettings.physicalGeometryWidthSegments,
        ),
        physicalGeometryHeightSegments: normalizeFiniteNumber(
            overrides.physicalGeometryHeightSegments,
            defaultSettings.physicalGeometryHeightSegments,
        ),
        physicalDisplacementScale: normalizeFiniteNumber(
            overrides.physicalDisplacementScale,
            defaultSettings.physicalDisplacementScale,
        ),
        physicalDisplacementBias: normalizeFiniteNumber(
            overrides.physicalDisplacementBias,
            defaultSettings.physicalDisplacementBias,
        ),
        physicalNormalHeightScale: normalizeFiniteNumber(
            overrides.physicalNormalHeightScale,
            defaultSettings.physicalNormalHeightScale,
        ),
        physicalTerrainShadowTexelStride: normalizeFiniteNumber(
            overrides.physicalTerrainShadowTexelStride,
            defaultSettings.physicalTerrainShadowTexelStride,
        ),
        physicalTerrainShadowSamples: normalizeFiniteNumber(
            overrides.physicalTerrainShadowSamples,
            defaultSettings.physicalTerrainShadowSamples,
        ),
        roughness: normalizeFiniteNumber(overrides.roughness, defaultSettings.roughness),
        metalness: normalizeFiniteNumber(overrides.metalness, defaultSettings.metalness),
        lommelSeeligerBlend: normalizeFiniteNumber(
            overrides.lommelSeeligerBlend,
            defaultSettings.lommelSeeligerBlend,
        ),
        lsClampMin: normalizeFiniteNumber(overrides.lsClampMin, defaultSettings.lsClampMin),
        lsClampMax: normalizeFiniteNumber(overrides.lsClampMax, defaultSettings.lsClampMax),
        oppositionStrength: normalizeFiniteNumber(
            overrides.oppositionStrength,
            defaultSettings.oppositionStrength,
        ),
        shadowLift: normalizeFiniteNumber(overrides.shadowLift, defaultSettings.shadowLift),
        highlightBoost: normalizeFiniteNumber(
            overrides.highlightBoost,
            defaultSettings.highlightBoost,
        ),
        shadowWeightExponent: normalizeFiniteNumber(
            overrides.shadowWeightExponent,
            defaultSettings.shadowWeightExponent,
        ),
        highlightWeightExponent: normalizeFiniteNumber(
            overrides.highlightWeightExponent,
            defaultSettings.highlightWeightExponent,
        ),
        terminatorContrast: normalizeFiniteNumber(
            overrides.terminatorContrast,
            defaultSettings.terminatorContrast,
        ),
        terminatorReliefStrength: normalizeFiniteNumber(
            overrides.terminatorReliefStrength,
            defaultSettings.terminatorReliefStrength,
        ),
        terminatorShadowFloor: normalizeFiniteNumber(
            overrides.terminatorShadowFloor,
            defaultSettings.terminatorShadowFloor,
        ),
        terminatorIndirectOcclusion: normalizeFiniteNumber(
            overrides.terminatorIndirectOcclusion,
            defaultSettings.terminatorIndirectOcclusion,
        ),
        terrainReliefStrength: normalizeFiniteNumber(
            overrides.terrainReliefStrength,
            normalizeFiniteNumber(
                overrides.terrainShadowStrength,
                defaultSettings.terrainReliefStrength,
            ),
        ),
        terrainShadowStrength: normalizeFiniteNumber(
            overrides.terrainShadowStrength,
            defaultSettings.terrainShadowStrength,
        ),
        terrainShadowTexelStride: normalizeFiniteNumber(
            overrides.terrainShadowTexelStride,
            defaultSettings.terrainShadowTexelStride,
        ),
        terrainShadowSlopeBias: normalizeFiniteNumber(
            overrides.terrainShadowSlopeBias,
            defaultSettings.terrainShadowSlopeBias,
        ),
        terrainShadowSamples: normalizeFiniteNumber(
            overrides.terrainShadowSamples,
            defaultSettings.terrainShadowSamples,
        ),
        shadowNormalBias: normalizeFiniteNumber(
            overrides.shadowNormalBias,
            defaultSettings.shadowNormalBias,
        ),
        shadowBias: normalizeFiniteNumber(
            overrides.shadowBias,
            defaultSettings.shadowBias,
        ),
    };
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
    const searchText = search == null
        ? String(globalObject?.location?.search || "")
        : String(search || "");
    const pathname = String(globalObject?.location?.pathname || "");
    const params = new URLSearchParams(searchText);
    const queryProfile = normalizeProfileName(
        params.get("moonRenderProfile") || params.get("moonProfile"),
    );
    if (queryProfile) {
        return queryProfile;
    }

    const globalProfile = normalizeProfileName(globalObject?.MOON_RENDER_ASSET_PROFILE);
    if (globalProfile) {
        return globalProfile;
    }

    const storage = safeGetStorage(globalObject);
    const storedProfile = normalizeProfileName(
        storage?.getItem?.(MOON_RENDER_ASSET_PROFILE_STORAGE_KEY),
    );
    if (storedProfile) {
        return storedProfile;
    }

    const missionDefaultProfile = resolveMissionDefaultMoonRenderProfile({
        searchText,
        pathname,
    });
    if (missionDefaultProfile) {
        return missionDefaultProfile;
    }

    return "fast";
}

export function resolveMoonRenderAssetSelection({
    search = null,
    profile = null,
    globalObject = typeof window !== "undefined" ? window : globalThis,
} = {}) {
    const profiles = resolveMoonRenderAssetProfiles({ globalObject });
    const settingsProfiles = resolveMoonRenderProfileSettings({ globalObject });
    const resolvedProfile = normalizeProfileName(profile) ||
        resolveMoonRenderAssetProfile({ search, globalObject });
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
