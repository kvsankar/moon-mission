import { loadChebyshevData } from "../chebyshev.js";
import { loadNpzEphemeris } from "./npz-ephemeris.js";
import { createCachedResourceLoader } from "./cached-resource-loader.js";
import { getMissionConfigProfileUrl } from "../core/domain/mission-data-resolvers.js";
import { assembleMissionConfig } from "../core/domain/mission-config-assembly.js";
import {
    extractEphemerisManifest,
    resolveLandingChebyshevAssetUrl,
    resolveLandingNpzAssetUrl,
    resolveMissionConfigUrl,
    resolveMissionManifestUrl,
    resolveOrbitMetaAssetUrl,
    resolveOrbitAssetUrls,
    resolveOrbitNpzAssetUrl,
    resolveOrbitSunChebyshevAssetUrl,
} from "../core/domain/mission-asset-resolver.js";

let missionConfigLoaded = false;
let missionConfigValue = null;
let missionConfigPromise = null;
let resolveMissionConfigReady;
const missionConfigReady = new Promise(resolve => {
    resolveMissionConfigReady = resolve;
});

// Observe the first successful config without starting a request or a retry.
// Failed loads leave observers pending until the runtime explicitly retries.
export function whenMissionConfigLoaded() {
    return missionConfigReady;
}

export function getMissionDataPath() {
    const dataPath = window?.missionConfig?.dataPath;
    if (typeof dataPath !== "string" || dataPath.length === 0) return null;
    return dataPath;
}

export function getMissionConfigUrl() {
    return resolveMissionConfigUrl(getMissionDataPath());
}

function getMissionConfigProfileName() {
    try {
        const value = new URLSearchParams(window?.location?.search || "").get("testProfile");
        if (typeof value !== "string") return null;
        const profile = value.trim().toLowerCase();
        if (!profile) return null;
        return /^[a-z0-9_-]+$/.test(profile) ? profile : null;
    } catch (_error) {
        return null;
    }
}

export function getMissionManifestUrl() {
    return resolveMissionManifestUrl(getMissionDataPath());
}

export async function loadMissionConfig() {
    if (missionConfigLoaded) return missionConfigValue;
    if (missionConfigPromise) return missionConfigPromise;

    missionConfigPromise = (async () => {
        const configUrl = getMissionConfigUrl();
        if (!configUrl) {
            console.error("No mission configuration found. Please set window.missionConfig.dataPath in your HTML file.");
            return null;
        }

        try {
            const response = await fetch(configUrl, { cache: "no-store" });
            if (!response.ok) {
                console.warn(`Could not load required config.json (${response.status})`);
                return null;
            }

            const baseConfig = await response.json();
            const configProfile = getMissionConfigProfileName();
            let profilePatch;
            if (configProfile) {
                const profileUrl = getMissionConfigProfileUrl(getMissionDataPath(), configProfile);
                if (profileUrl) {
                    try {
                        const profileResponse = await fetch(profileUrl, { cache: "no-store" });
                        if (profileResponse.ok) {
                            profilePatch = await profileResponse.json();
                            console.debug(`Applied mission config test profile '${configProfile}'`);
                        } else {
                            console.debug(
                                `Mission config test profile '${configProfile}' not found (${profileResponse.status}), using base config`,
                            );
                        }
                    } catch (profileError) {
                        console.debug(`Could not load mission config test profile '${configProfile}':`, profileError);
                    }
                }
            }

            const manifestUrl = getMissionManifestUrl();
            let manifestData;
            if (manifestUrl) {
                try {
                    const manifestResponse = await fetch(manifestUrl, { cache: "no-store" });
                    if (manifestResponse.ok) {
                        manifestData = await manifestResponse.json();
                    }
                } catch (manifestError) {
                    console.debug("Could not load ephemeris-manifest.json:", manifestError);
                }
            }

            const { config, warnings } = assembleMissionConfig({
                baseConfig,
                profilePatch,
                manifestData,
            });
            for (let i = 0; i < warnings.length; i += 1) {
                console.warn(warnings[i]);
            }
            console.debug("Config loaded successfully:", config);
            return config;
        } catch (error) {
            console.warn("Error loading config.json:", error);
            return null;
        }
    })();

    missionConfigValue = await missionConfigPromise;
    missionConfigLoaded = missionConfigValue !== null;
    missionConfigPromise = null;
    if (missionConfigLoaded) {
        resolveMissionConfigReady(missionConfigValue);
    }
    return missionConfigValue;
}

export function resolveOrbitUrls(configData, mode) {
    const dataPath = getMissionDataPath();
    if (!dataPath) return null;

    return resolveOrbitAssetUrls({
        dataPath,
        manifest: extractEphemerisManifest(configData),
        phaseKey: mode,
        phaseConfig: configData?.[mode],
    });
}

export function resolveOrbitNpzUrl(configData, mode) {
    const dataPath = getMissionDataPath();
    if (!dataPath) return null;

    return resolveOrbitNpzAssetUrl({
        dataPath,
        manifest: extractEphemerisManifest(configData),
        phaseKey: mode,
        phaseConfig: configData?.[mode],
    });
}

export function resolveOrbitSunChebyshevUrl(configData, mode) {
    const dataPath = getMissionDataPath();
    if (!dataPath) return null;

    return resolveOrbitSunChebyshevAssetUrl({
        dataPath,
        manifest: extractEphemerisManifest(configData),
        phaseKey: mode,
        phaseConfig: configData?.[mode],
    });
}

export function resolveOrbitMetaUrl(configData, mode) {
    const dataPath = getMissionDataPath();
    if (!dataPath) return null;

    return resolveOrbitMetaAssetUrl({
        dataPath,
        manifest: extractEphemerisManifest(configData),
        phaseKey: mode,
        phaseConfig: configData?.[mode],
    });
}

export function resolveLandingChebyshevUrl(configData, cfgKey = null) {
    const dataPath = getMissionDataPath();
    if (!dataPath) return null;

    return resolveLandingChebyshevAssetUrl({
        dataPath,
        manifest: extractEphemerisManifest(configData),
        configData,
        cfgKey,
    });
}

export function resolveLandingNpzUrl(configData, cfgKey = null) {
    const dataPath = getMissionDataPath();
    if (!dataPath) return null;

    return resolveLandingNpzAssetUrl({
        dataPath,
        manifest: extractEphemerisManifest(configData),
        configData,
        cfgKey,
    });
}

const loadChebyshev = createCachedResourceLoader({
    label: "loadChebyshev",
    load: (url) => loadChebyshevData(url),
});

const loadJson = createCachedResourceLoader({
    label: "loadJson",
    load: async (url) => {
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) {
            throw new Error(`Failed to load JSON from ${url}: ${response.status}`);
        }
        return response.json();
    },
});

const loadNpz = createCachedResourceLoader({
    label: "loadNpz",
    load: (url) => loadNpzEphemeris(url),
});

export { getEphemerisSource } from "../core/domain/mission-data-resolvers.js";
export { loadChebyshev, loadJson, loadNpz };
