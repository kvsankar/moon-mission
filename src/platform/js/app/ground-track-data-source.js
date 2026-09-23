import * as THREE from "three";
import { loadChebyshev } from "../data/mission-data.js";
import { getBodyEphemerisState } from "../data/ephemeris-provider.js";
import { EARTH_REFERENCE_RADIUS_KM } from "./ground-track-config.js";
import { resolveTelemetryBodyId, hasVector, normalizeVelocityVector, subtractVectors, negateVector, magnitude, eciToLatLonDegrees } from "./ground-track-geometry.js";
import { deriveGeoOrbitChebUrl, resolveGroundTrackWindowMs, resolvePostHorizonExtension } from "./ground-track-policy.js";
import { unwrapTimedTrackPoints, timedPointsToSegments, resolveGeneratedTrackSegments } from "./ground-track-primitives.js";

export function createGroundTrackDataSource({ getMissionConfigData, getLatestPayload, onTrackDataReady }) {
    const cacheByKey = new Map();
    const trackChebyshevDataByUrl = new Map();
    const trackChebyshevLoadPromisesByUrl = new Map();

    function isRelativeFrameActive(config) {
        if (config === "relative") return true;
        if (config !== "geo") return false;
        return !!document.getElementById("origin-relative")?.checked;
    }

    function resolveSpacecraftMnemonic() {
        return String(getMissionConfigData()?.spacecraft_mnemonic || "SC").trim().toUpperCase();
    }

    function resolveGroundTrackCraftId(config) {
        const scene = window.animationScenes?.[config];
        return scene?.activeCraftId || scene?.primaryCraftId || "SC";
    }

    function resolveGroundTrackChebyshevDescriptor(config, relativeFrameActive = isRelativeFrameActive(config)) {
        const scene = window.animationScenes?.[config];
        const geoScene = window.animationScenes?.geo;
        if (config === "geo" && relativeFrameActive) {
            const craftUrl =
                scene?.relativeSupportOrbitsCheb ||
                scene?.supportOrbitsChebByBodyId?.MOON ||
                geoScene?.relativeSupportOrbitsCheb ||
                geoScene?.supportOrbitsChebByBodyId?.MOON ||
                deriveGeoOrbitChebUrl(scene?.orbitsCheb) ||
                deriveGeoOrbitChebUrl(geoScene?.orbitsCheb) ||
                geoScene?.orbitsCheb ||
                "";
            if (!craftUrl) return null;
            return {
                key: `geo-relative:${craftUrl}`,
                mode: "geo-relative",
                craftUrl,
                geoSupportUrl: craftUrl,
            };
        }
        if (config === "lunar") {
            const craftUrl = scene?.orbitsCheb || "";
            const geoSupportUrl =
                geoScene?.relativeSupportOrbitsCheb ||
                geoScene?.orbitsCheb ||
                deriveGeoOrbitChebUrl(craftUrl);
            if (!craftUrl || !geoSupportUrl) return null;
            return {
                key: `lunar-earth:${craftUrl}:${geoSupportUrl}`,
                mode: "lunar-earth",
                craftUrl,
                geoSupportUrl,
            };
        }
        return null;
    }

    async function ensureTrackChebyshevLoaded(url) {
        if (typeof url !== "string" || url.length === 0) {
            return null;
        }
        if (trackChebyshevDataByUrl.has(url)) {
            return trackChebyshevDataByUrl.get(url);
        }
        if (trackChebyshevLoadPromisesByUrl.has(url)) {
            return trackChebyshevLoadPromisesByUrl.get(url);
        }
        const promise = loadChebyshev(url)
            .then((data) => {
                trackChebyshevDataByUrl.set(url, data);
                trackChebyshevLoadPromisesByUrl.delete(url);
                return data;
            })
            .catch((error) => {
                trackChebyshevLoadPromisesByUrl.delete(url);
                throw error;
            });
        trackChebyshevLoadPromisesByUrl.set(url, promise);
        return promise;
    }

    function getLoadedTrackChebyshevData(url) {
        if (typeof url !== "string" || url.length === 0) return null;
        return trackChebyshevDataByUrl.get(url) || null;
    }

    function ensureTrackDescriptorLoaded(descriptor) {
        if (!descriptor) return;
        const urls = [
            descriptor.craftUrl,
            descriptor.geoSupportUrl,
        ].filter((url, index, array) => typeof url === "string" && url.length > 0 && array.indexOf(url) === index);
        if (urls.length === 0) return;
        Promise.all(urls.map((url) => ensureTrackChebyshevLoaded(url)))
            .then(() => {
                if (getLatestPayload()) {
                    queueMicrotask(() => {
                        if (getLatestPayload()) {
                            onTrackDataReady(getLatestPayload());
                        }
                    });
                }
            })
            .catch((error) => {
                console.error("Failed to load ground track ephemeris support", error);
            });
    }

    function buildTrackEphemerisInput(config, chebyshevDataMap) {
        const chebyshevDataLoaded = {};
        Object.keys(chebyshevDataMap || {}).forEach((key) => {
            chebyshevDataLoaded[key] = !!chebyshevDataMap[key];
        });
        return {
            config,
            npzData: null,
            npzDataLoaded: {},
            chebyshevData: chebyshevDataMap,
            chebyshevDataLoaded,
            landingNpzData: null,
            landingNpzLoaded: false,
            landingChebyshevData: null,
            landingChebyshevLoaded: false,
            globalConfig: getMissionConfigData(),
            startLandingTime: Number.NaN,
            endLandingTime: Number.NaN,
            bodySources: {},
            defaultSpacecraftSource: "chebyshev",
            spacecraftMnemonic: resolveSpacecraftMnemonic(),
            resolvedSource: "chebyshev",
        };
    }

    function sampleChebyshevState({ bodyId, timeMs, config, chebyshevDataMap }) {
        return getBodyEphemerisState({
            bodyId,
            timeMs,
            ...buildTrackEphemerisInput(config, chebyshevDataMap),
        });
    }

    function resolveEphemerisEarthCenteredSample({ descriptor, timeMs, craftId }) {
        if (!descriptor || !Number.isFinite(timeMs)) return null;
        if (descriptor.mode === "geo-relative") {
            const craftData = getLoadedTrackChebyshevData(descriptor.craftUrl);
            if (!craftData) return null;
            const craftState = sampleChebyshevState({
                bodyId: craftId,
                timeMs,
                config: "geo",
                chebyshevDataMap: { geo: craftData },
            });
            if (!craftState?.available || !hasVector(craftState.position)) return null;
            return {
                vector: craftState.position,
                velocity: normalizeVelocityVector(craftState.velocity),
            };
        }
        if (descriptor.mode === "lunar-earth") {
            const lunarData = getLoadedTrackChebyshevData(descriptor.craftUrl);
            const geoData = getLoadedTrackChebyshevData(descriptor.geoSupportUrl);
            if (!lunarData || !geoData) return null;
            const craftState = sampleChebyshevState({
                bodyId: craftId,
                timeMs,
                config: "lunar",
                chebyshevDataMap: { lunar: lunarData },
            });
            const moonState = sampleChebyshevState({
                bodyId: "MOON",
                timeMs,
                config: "geo",
                chebyshevDataMap: { geo: geoData },
            });
            const craftVelocity = normalizeVelocityVector(craftState?.velocity || null);
            const moonVelocity = normalizeVelocityVector(moonState?.velocity || null);
            const earthPositionInLunar = negateVector(moonState?.position || null);
            const earthVelocityInLunar = negateVector(moonVelocity);
            if (!craftState?.available || !hasVector(craftState.position) || !hasVector(earthPositionInLunar)) {
                return null;
            }
            return {
                vector: subtractVectors(craftState.position, earthPositionInLunar),
                velocity: hasVector(craftVelocity) && hasVector(earthVelocityInLunar)
                    ? subtractVectors(craftVelocity, earthVelocityInLunar)
                    : null,
            };
        }
        return null;
    }

    function resolveCurrentEarthCenteredVector(sceneState, config, animTime, descriptor = null) {
        const craftId = resolveTelemetryBodyId(sceneState) || resolveGroundTrackCraftId(config);
        const ephemerisSample = resolveEphemerisEarthCenteredSample({
            descriptor,
            timeMs: animTime,
            craftId,
        });
        if (hasVector(ephemerisSample?.vector)) {
            return ephemerisSample.vector;
        }
        const bodies = sceneState?.bodies || {};
        const craftPos = bodies?.[craftId]?.position || null;
        if (!hasVector(craftPos)) return null;
        if (config === "lunar") {
            const earthPos = bodies?.EARTH?.position || null;
            if (!hasVector(earthPos)) return null;
            return subtractVectors(craftPos, earthPos);
        }
        return craftPos;
    }

    function resolveCurrentEarthCenteredVelocity(sceneState, config, animTime, descriptor = null) {
        const craftId = resolveTelemetryBodyId(sceneState) || resolveGroundTrackCraftId(config);
        const ephemerisSample = resolveEphemerisEarthCenteredSample({
            descriptor,
            timeMs: animTime,
            craftId,
        });
        if (hasVector(ephemerisSample?.velocity)) {
            return ephemerisSample.velocity;
        }
        const bodies = sceneState?.bodies || {};
        const craftVel = normalizeVelocityVector(bodies?.[craftId]?.velocity || null);
        if (!hasVector(craftVel)) return null;
        if (config === "lunar") {
            const earthVel = normalizeVelocityVector(bodies?.EARTH?.velocity || null);
            if (!hasVector(earthVel)) return null;
            return subtractVectors(craftVel, earthVel);
        }
        return craftVel;
    }

    function resolveEarthDistanceKm(sceneState, config, earthCenteredVector) {
        const telemetry = sceneState?.telemetry || null;
        if (Number.isFinite(telemetry?.distanceEarth)) {
            return telemetry.distanceEarth;
        }
        if (config === "geo" && Number.isFinite(telemetry?.distancePrimary)) {
            return telemetry.distancePrimary;
        }
        return magnitude(earthCenteredVector);
    }

    function resolveEarthVelocityKmPerSec(sceneState, config, earthCenteredVelocity) {
        const telemetry = sceneState?.telemetry || null;
        if (Number.isFinite(telemetry?.velocityEarth)) {
            return telemetry.velocityEarth;
        }
        if (config === "geo" && Number.isFinite(telemetry?.velocityPrimary)) {
            return telemetry.velocityPrimary;
        }
        return magnitude(earthCenteredVelocity);
    }

    function resolveEarthAltitudeKm(sceneState, config, earthDistanceKm) {
        const telemetry = sceneState?.telemetry || null;
        if (Number.isFinite(earthDistanceKm)) {
            return earthDistanceKm - EARTH_REFERENCE_RADIUS_KM;
        }
        if (Number.isFinite(telemetry?.altitudeEarth)) {
            return telemetry.altitudeEarth;
        }
        if (config === "geo" && Number.isFinite(telemetry?.altitudePrimary)) {
            return telemetry.altitudePrimary;
        }
        return Number.NaN;
    }

    function resolveTrackSegments(config, relativeFrameActive = isRelativeFrameActive(config)) {
        if (config !== "geo" && config !== "lunar") {
            return {
                key: `${config}:none`,
                segments: [],
                generatedSegments: [],
                sourceEndMs: Number.NaN,
            };
        }
        const scene = window.animationScenes?.[config];
        if (!scene) {
            return {
                key: `${config}:none`,
                segments: [],
                generatedSegments: [],
                sourceEndMs: Number.NaN,
            };
        }
        const craftId = scene.activeCraftId || scene.primaryCraftId || "SC";
        const craftCurve = scene.curvesById?.[craftId] || [];
        const craftTimes = scene.curveTimesById?.[craftId] || [];
        if (!Array.isArray(craftTimes) || craftTimes.length < 2) {
            return {
                key: `${config}:${craftId}:empty`,
                segments: [],
                generatedSegments: [],
                sourceEndMs: Number.NaN,
            };
        }
        const descriptor = resolveGroundTrackChebyshevDescriptor(config, relativeFrameActive);
        if ((relativeFrameActive || config === "lunar") && !descriptor) {
            return {
                key: `${config}:${relativeFrameActive ? "relative" : "inertial"}:${craftId}:pending`,
                segments: [],
                generatedSegments: [],
                sourceEndMs: Number.NaN,
                loading: true,
            };
        }
        const useEphemerisTrackData = !!descriptor;
        if (!useEphemerisTrackData && (!Array.isArray(craftCurve) || craftCurve.length < 2)) {
            return {
                key: `${config}:${craftId}:empty`,
                segments: [],
                generatedSegments: [],
                sourceEndMs: Number.NaN,
            };
        }
        if (useEphemerisTrackData) {
            const craftData = getLoadedTrackChebyshevData(descriptor.craftUrl);
            const geoSupportData = getLoadedTrackChebyshevData(descriptor.geoSupportUrl);
            if (!craftData || !geoSupportData) {
                ensureTrackDescriptorLoaded(descriptor);
                return {
                    key: `${descriptor.key}:loading`,
                    segments: [],
                    generatedSegments: [],
                    sourceEndMs: Number.NaN,
                    loading: true,
                };
            }
        }
        const count = Math.min(craftTimes.length, useEphemerisTrackData ? craftTimes.length : craftCurve.length);
        const windowBounds = resolveGroundTrackWindowMs(getMissionConfigData(), config);
        const provenance = resolvePostHorizonExtension(getMissionConfigData(), config);
        const sourceEndMs = provenance?.sourceEndMs;
        const startMs = windowBounds.startMs;
        const endMs = Number.isFinite(craftTimes[count - 1]) ? craftTimes[count - 1] : windowBounds.endMs;
        const key = `${config}:${relativeFrameActive ? "relative" : "inertial"}:${craftId}:${count}:${descriptor?.key || "scene"}:${Number.isFinite(startMs) ? startMs : "na"}:${Number.isFinite(endMs) ? endMs : "na"}:${Number.isFinite(sourceEndMs) ? sourceEndMs : "na"}`;
        if (cacheByKey.has(key)) return { key, ...cacheByKey.get(key) };

        const points = [];
        let lastLocation = null;
        for (let i = 0; i < count; i += 1) {
            const timeMs = craftTimes[i];
            if (!Number.isFinite(timeMs)) continue;
            if (Number.isFinite(startMs) && timeMs < startMs) continue;
            if (Number.isFinite(endMs) && timeMs > endMs) continue;
            let earthCentered = null;
            if (useEphemerisTrackData) {
                earthCentered = resolveEphemerisEarthCenteredSample({
                    descriptor,
                    timeMs,
                    craftId,
                })?.vector || null;
            } else {
                const craft = craftCurve[i];
                if (!hasVector(craft)) continue;
                earthCentered = craft;
            }
            if (!hasVector(earthCentered)) continue;
            const latLon = eciToLatLonDegrees(earthCentered, timeMs);
            if (!latLon) continue;
            points.push({
                lat: latLon[0],
                lon: latLon[1],
                timeMs,
            });
            lastLocation = latLon;
        }
        const unwrappedPoints = unwrapTimedTrackPoints(points);
        const segments = timedPointsToSegments(unwrappedPoints);
        const generatedSegments = resolveGeneratedTrackSegments(unwrappedPoints, sourceEndMs);
        const result = {
            segments,
            generatedSegments,
            lastLocation,
            startMs,
            endMs,
            sourceEndMs,
        };
        cacheByKey.set(key, result);
        return { key, ...result };
    }

    return {
        isRelativeFrameActive,
        resolveGroundTrackChebyshevDescriptor,
        resolveCurrentEarthCenteredVector,
        resolveCurrentEarthCenteredVelocity,
        resolveEarthDistanceKm,
        resolveEarthVelocityKmPerSec,
        resolveEarthAltitudeKm,
        resolveTrackSegments,
        clearCache: () => cacheByKey.clear(),
    };
}
