import {
    applyModeSwitchForOrigin,
    resolveOriginDescriptor,
} from "../core/domain/origin-compat.js";
import { resolveComparisonDisplayAvailabilityTimeRange } from "../core/domain/comparison-overlay.js";
import { resolveDataPathUrl } from "../core/domain/mission-asset-resolver.js";
import { resolvePrimaryMissionCraft } from "../core/domain/mission-config.js";

function getCraftPhaseConfig(craft, phaseKey) {
    const directPhaseConfig = craft?.[phaseKey];
    if (directPhaseConfig && typeof directPhaseConfig === "object") {
        return directPhaseConfig;
    }

    const originPhaseConfig = craft?.origins?.[phaseKey];
    if (originPhaseConfig && typeof originPhaseConfig === "object") {
        return originPhaseConfig;
    }

    return null;
}

function resolveCraftSupportChebyshevUrls({
    configData,
    phaseKey,
    dataPath,
    primaryCraftId,
}) {
    if (!Array.isArray(configData?.crafts) || !dataPath) {
        return {};
    }

    const supportUrls = {};
    for (const craft of configData.crafts) {
        const craftId = craft?.id;
        if (!craftId || craftId === primaryCraftId) continue;

        const phaseConfig = getCraftPhaseConfig(craft, phaseKey);
        const orbitsFile =
            typeof phaseConfig?.orbits_file === "string"
                ? phaseConfig.orbits_file.trim()
                : "";
        if (!orbitsFile) continue;

        const chebUrl = resolveDataPathUrl(dataPath, `${orbitsFile}-cheb.json`);
        if (chebUrl) {
            supportUrls[craftId] = chebUrl;
        }
    }

    return supportUrls;
}

function appendUniqueBodyId(bodyIds, bodyId) {
    const normalizedIds = Array.isArray(bodyIds) ? bodyIds.slice() : [];
    if (!bodyId || normalizedIds.includes(bodyId)) {
        return normalizedIds;
    }
    normalizedIds.push(bodyId);
    return normalizedIds;
}

function resolveComparisonOverlaySupportChebyshevUrl({
    comparisonOverlay,
    originKey,
    isRelativeMode,
    allowRelativeOrbitOverride,
}) {
    const urlMap = comparisonOverlay?.supportOrbitChebyshevUrlsByOrigin;
    if (!urlMap || typeof urlMap !== "object") {
        return null;
    }

    if (isRelativeMode && allowRelativeOrbitOverride && typeof urlMap.relative === "string") {
        return urlMap.relative;
    }

    const directUrl = urlMap[originKey];
    if (typeof directUrl === "string" && directUrl.length > 0) {
        return directUrl;
    }

    if (originKey === "geo" && typeof urlMap.relative === "string") {
        return urlMap.relative;
    }

    return null;
}

function applyComparisonOverlayToScene({
    scene,
    configData,
    sceneConfig,
    isRelativeMode,
    allowRelativeOrbitOverride,
}) {
    const comparisonOverlay = configData?.comparisonOverlay;
    const compareCraftId = comparisonOverlay?.compareCraftId;
    if (!compareCraftId) {
        return;
    }

    const supportChebUrl = resolveComparisonOverlaySupportChebyshevUrl({
        comparisonOverlay,
        originKey: sceneConfig,
        isRelativeMode,
        allowRelativeOrbitOverride,
    });
    if (!supportChebUrl) {
        return;
    }

    scene.planetsForOrbits = appendUniqueBodyId(scene.planetsForOrbits, compareCraftId);
    scene.planetsForLocations = appendUniqueBodyId(scene.planetsForLocations, compareCraftId);
    scene.supportOrbitsChebByBodyId = {
        ...(scene.supportOrbitsChebByBodyId || {}),
        [compareCraftId]: supportChebUrl,
    };

    const defaultVisibleCraftIds = Array.isArray(comparisonOverlay?.defaultVisibleCraftIds)
        ? comparisonOverlay.defaultVisibleCraftIds.filter(Boolean)
        : [];
    const currentVisibleCraftIds = Array.isArray(scene.visibleCraftIds)
        ? scene.visibleCraftIds.filter(Boolean)
        : [];
    const shouldApplyDefaultVisibleCraftIds =
        currentVisibleCraftIds.length === 0 ||
        (
            currentVisibleCraftIds.length === 1 &&
            currentVisibleCraftIds[0] === scene.primaryCraftId
        );
    if (shouldApplyDefaultVisibleCraftIds && defaultVisibleCraftIds.length > 0) {
        scene.visibleCraftIds = [...new Set(defaultVisibleCraftIds)];
        scene.viewAdditionalCrafts = scene.visibleCraftIds.length > 1;
    }
}

function resolveScenePlaybackBounds({
    configData,
    sceneConfig,
    spacecraftMnemonic,
    getStartAndEndTimes,
}) {
    const earthRange = getStartAndEndTimes("EARTH");
    const spacecraftRange = getStartAndEndTimes(spacecraftMnemonic);
    const earthStartMs = Number(earthRange?.[0]);
    const earthEndMs = Number(earthRange?.[1]);
    const spacecraftStartMs = Number(spacecraftRange?.[0]);
    const spacecraftEndMs = Number(spacecraftRange?.[1]);

    const compareCraftId = configData?.comparisonOverlay?.compareCraftId;
    const comparisonAvailabilityRange = compareCraftId
        ? resolveComparisonDisplayAvailabilityTimeRange({
            globalConfig: configData,
            bodyId: compareCraftId,
            config: sceneConfig,
        })
        : null;
    const comparisonEndMs = Number(comparisonAvailabilityRange?.endMs);

    const startMs = Number.isFinite(earthStartMs)
        ? earthStartMs
        : spacecraftStartMs;
    const endMs = Number.isFinite(comparisonEndMs)
        ? (
            Number.isFinite(earthEndMs)
                ? Math.max(earthEndMs, comparisonEndMs)
                : comparisonEndMs
        )
        : earthEndMs;

    return {
        startMs,
        endMs,
        earthEndMs,
        spacecraftEndMs,
        comparisonEndMs: Number.isFinite(comparisonEndMs)
            ? comparisonEndMs
            : null,
    };
}

function createInitConfigSceneSetupActions(deps) {
    const {
        PC,
        windowRef,
        animationScenes,
        animation3DControllers,
        animation2DControllers,
        AnimationScene,
        Animation3DController,
        Animation2DController,
        planetProperties,
        showPlanet,
        computeSVGDimensions,
        getSvgWidth,
        getSvgHeight,
        setPixelsPerAU,
        setDefaultCameraDistance,
        setTrackWidth,
        setEarthRadius,
        setMoonRadius,
        getEarthRadius,
        getMoonRadius,
        setStartTime,
        setEndTime,
        setEndTimeSC,
        setLatestEndTime,
        setTimelineTotalSteps,
        setTicksPerAnimationStep,
        setEpochJD,
        setEpochDate,
        getStartAndEndTimes,
        animationController,
        resolveOrbitUrls,
        resolveOrbitMetaUrl,
        resolveOrbitNpzUrl,
        resolveOrbitSunChebyshevUrl,
        handleModeSwitchToGeo,
        handleModeSwitchToLunar,
        setRelativeOrbitUrls,
    } = deps;

    function ensureSceneAndControllers(sceneConfig) {
        if (!animationScenes[sceneConfig] || animationScenes[sceneConfig].disposed === true) {
            animationScenes[sceneConfig] = new AnimationScene(sceneConfig);
            animation3DControllers[sceneConfig] = new Animation3DController(sceneConfig, animationScenes[sceneConfig]);
            animation2DControllers[sceneConfig] = new Animation2DController(sceneConfig, {
                planetProperties,
                showPlanet,
            });
        }
        return animationScenes[sceneConfig];
    }

    function applySceneScale({ moonScale = 1.0 } = {}) {
        computeSVGDimensions();

        const pixelsPerAu = Math.min(getSvgWidth(), getSvgHeight()) / (1.2 * (2 * PC.EARTH_MOON_DISTANCE_MEAN_AU));
        setPixelsPerAU(pixelsPerAu);
        setDefaultCameraDistance(2 * PC.EARTH_MOON_DISTANCE_MEAN_AU * pixelsPerAu);
        setTrackWidth(0.6);
        setEarthRadius((PC.EARTH_RADIUS_KM / PC.KM_PER_AU) * pixelsPerAu);
        setMoonRadius((PC.MOON_RADIUS_KM / PC.KM_PER_AU) * pixelsPerAu * moonScale);
    }

    function applyOrbitConfig({ configData, sceneConfig, scene }) {
        const spacecraftMnemonic = configData?.spacecraft_mnemonic || "SC";
        const primaryCraft = resolvePrimaryMissionCraft(configData);
        const primaryCraftId = primaryCraft?.id || "SC";
        const dataPath = windowRef?.missionConfig?.dataPath;
        scene.primaryCraftId = primaryCraftId;
        if (!scene.activeCraftId || scene.activeCraftId === "SC") {
            scene.activeCraftId = primaryCraftId;
        }
        if (!Array.isArray(scene.visibleCraftIds) || scene.visibleCraftIds.length === 0) {
            scene.visibleCraftIds = [primaryCraftId];
        }
        scene.supportOrbitsChebByBodyId = resolveCraftSupportChebyshevUrls({
            configData,
            phaseKey: sceneConfig,
            dataPath,
            primaryCraftId,
        });

        if (configData && configData[sceneConfig]) {
            const cfg = configData[sceneConfig];
            scene.planetsForOrbits = cfg.planets;
            scene.planetsForLocations = cfg.planets;
            scene.stepDurationInMilliSeconds = cfg.step_size_in_seconds * 1000;

            const orbitUrls = resolveOrbitUrls(configData, sceneConfig);
            if (orbitUrls) {
                scene.orbitsJson = orbitUrls.orbitsJson;
                scene.orbitsCheb = orbitUrls.orbitsCheb;
            }
            const orbitMeta = resolveOrbitMetaUrl(configData, sceneConfig);
            if (orbitMeta) {
                scene.orbitsMeta = orbitMeta;
            }
            const orbitNpz = resolveOrbitNpzUrl(configData, sceneConfig);
            if (orbitNpz) {
                scene.orbitsNpz = orbitNpz;
            }
            const orbitSunCheb = resolveOrbitSunChebyshevUrl(configData, sceneConfig);
            if (orbitSunCheb) {
                scene.orbitsSunCheb = orbitSunCheb;
            }
        }

        return spacecraftMnemonic;
    }

    function applyTimelineConfig({ scene, spacecraftMnemonic, configData, sceneConfig }) {
        const {
            startMs,
            endMs,
            spacecraftEndMs,
        } = resolveScenePlaybackBounds({
            configData,
            sceneConfig,
            spacecraftMnemonic,
            getStartAndEndTimes,
        });

        setStartTime(startMs);
        setEndTime(endMs);
        setEndTimeSC(spacecraftEndMs);
        setLatestEndTime(endMs);
        setTimelineTotalSteps((endMs - startMs) / scene.stepDurationInMilliSeconds);
        setTicksPerAnimationStep(1);

        animationController.configure({
            startTime: startMs,
            endTime: endMs,
            stepDurationMs: scene.stepDurationInMilliSeconds,
            stepsPerHop: scene.stepsPerHop,
        });

        setEpochJD("N/A");
        setEpochDate("N/A");
    }

    function configureSceneForOrigin({ originKey, configData, isRelativeMode = false }) {
        const scene = ensureSceneAndControllers(originKey);
        const descriptor = resolveOriginDescriptor(originKey, configData);
        applySceneScale({ moonScale: descriptor.moonScale });

        scene.primaryBody = descriptor.primaryBody;
        scene.primaryBodyRadius = descriptor.primaryBody === "MOON"
            ? getMoonRadius()
            : getEarthRadius();
        scene.secondaryBody = descriptor.secondaryBody;
        scene.secondaryBodyRadius = descriptor.secondaryBody === "MOON"
            ? getMoonRadius()
            : getEarthRadius();

        const spacecraftMnemonic = applyOrbitConfig({
            configData,
            sceneConfig: originKey,
            scene,
        });

        if (isRelativeMode && descriptor.allowRelativeOrbitOverride) {
            const dataPath = windowRef?.missionConfig?.dataPath;
            const configuredRelativeBase = configData?.relative?.orbits_file;
            const relativeBase = (typeof configuredRelativeBase === "string" && configuredRelativeBase.length > 0)
                ? configuredRelativeBase
                : `relative-${spacecraftMnemonic}`;
            const primaryCraftId = scene.primaryCraftId || resolvePrimaryMissionCraft(configData)?.id || "SC";
            if (typeof dataPath === "string" && dataPath.length > 0) {
                // Keep a pointer to the full geo ephemeris file so relative mode can
                // pull non-spacecraft series (for example MOON) when needed.
                scene.relativeSupportOrbitsCheb = scene.orbitsCheb || null;
                scene.supportOrbitsChebByBodyId = {
                    ...scene.supportOrbitsChebByBodyId,
                    MOON: scene.orbitsCheb || null,
                    ...resolveCraftSupportChebyshevUrls({
                        configData,
                        phaseKey: "relative",
                        dataPath,
                        primaryCraftId,
                    }),
                };
                setRelativeOrbitUrls({
                    scene,
                    orbitsJson: `${dataPath}${relativeBase}.json`,
                    orbitsCheb: `${dataPath}${relativeBase}-cheb.json`,
                });
            }
        }

        applyComparisonOverlayToScene({
            scene,
            configData,
            sceneConfig: originKey,
            isRelativeMode,
            allowRelativeOrbitOverride: descriptor.allowRelativeOrbitOverride,
        });

        scene.orbitsJsonFileSizeInBytes = descriptor.orbitFileSizeBytes;
        scene.stepsPerHop = descriptor.stepsPerHop;
        applyTimelineConfig({
            scene,
            spacecraftMnemonic,
            configData,
            sceneConfig: originKey,
        });
        applyModeSwitchForOrigin({
            originKey,
            globalConfig: configData,
            switchToGeo: handleModeSwitchToGeo,
            switchToLunar: handleModeSwitchToLunar,
        });
    }

    return {
        configureSceneForOrigin,
    };
}

export { createInitConfigSceneSetupActions };
export { resolveScenePlaybackBounds };
