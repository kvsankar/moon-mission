import { TIME_CONSTANTS } from "../core/constants.js";
import {
    buildComparisonOverlayCraft,
    buildComparisonOverlayCraftId,
    buildComparisonOverlaySupportBodyId,
} from "../core/domain/comparison-overlay.js";
import {
    extractEphemerisManifest,
    resolveOrbitAssetUrls,
} from "../core/domain/mission-asset-resolver.js";
import { resolvePrimaryMissionCraft } from "../core/domain/mission-config.js";
import { computeEventsUpdate } from "./config-events.js";
import { computeMissionEventTimes } from "./config-times.js";
import { resolveMissionBodyTimeRange } from "./start-end-times.js";

function asTrimmedString(value, fallback = "") {
    if (typeof value !== "string") return fallback;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
}

function buildTimeRangeObject(rangeTuple) {
    if ([rangeTuple?.[0], rangeTuple?.[1]].some(value =>
        value == null || (typeof value === "string" && value.trim() === ""))) {
        return null;
    }
    const startMs = Number(rangeTuple?.[0]);
    const endMs = Number(rangeTuple?.[1]);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
        return null;
    }
    return { startMs, endMs };
}

function resolveCraftEphemerisSource(config, craft) {
    const sourceByBodyId = config?.ephemeris_sources;
    if (sourceByBodyId && typeof sourceByBodyId === "object") {
        const directSource = sourceByBodyId[craft?.id];
        if (typeof directSource === "string" && directSource.trim().length > 0) {
            return directSource.toLowerCase();
        }

        const mnemonicSource = sourceByBodyId[craft?.mnemonic];
        if (typeof mnemonicSource === "string" && mnemonicSource.trim().length > 0) {
            return mnemonicSource.toLowerCase();
        }

        const scSource = sourceByBodyId.SC;
        if (typeof scSource === "string" && scSource.trim().length > 0) {
            return scSource.toLowerCase();
        }
    }

    const fallbackSource = asTrimmedString(config?.ephemeris_source, "chebyshev");
    return fallbackSource.toLowerCase();
}

function collectOriginKeys(baseConfig, comparisonConfig) {
    const originKeys = new Set();
    for (const config of [baseConfig, comparisonConfig]) {
        for (const originKey of config?.origins || []) {
            if (typeof originKey === "string" && originKey.length > 0) {
                originKeys.add(originKey);
            }
        }
    }
    originKeys.add("geo");
    originKeys.add("lunar");
    return [...originKeys];
}

function buildComparisonTimeRanges({
    primaryConfig,
    primaryCraftId,
    comparisonConfig,
    comparisonCraftId,
    createUTCTimestamp,
    resolveMissionBodyTimeRangeImpl = resolveMissionBodyTimeRange,
}) {
    const displayTimeRangesByOrigin = {};
    const sourceTimeRangesByOrigin = {};
    const originKeys = collectOriginKeys(primaryConfig, comparisonConfig);

    for (const originKey of originKeys) {
        const displayRange = buildTimeRangeObject(
            resolveMissionBodyTimeRangeImpl({
                globalConfig: primaryConfig,
                config: originKey,
                bodyId: primaryCraftId,
                createUTCTimestamp,
                oneMinuteMs: TIME_CONSTANTS.ONE_MINUTE_MS,
            }),
        );
        if (displayRange) {
            displayTimeRangesByOrigin[originKey] = displayRange;
        }

        const sourceRange = buildTimeRangeObject(
            resolveMissionBodyTimeRangeImpl({
                globalConfig: comparisonConfig,
                config: originKey,
                bodyId: comparisonCraftId,
                createUTCTimestamp,
                oneMinuteMs: TIME_CONSTANTS.ONE_MINUTE_MS,
            }),
        );
        if (sourceRange) {
            sourceTimeRangesByOrigin[originKey] = sourceRange;
        }
    }

    return {
        displayTimeRangesByOrigin,
        sourceTimeRangesByOrigin,
    };
}

function buildComparisonOrbitUrlsByOrigin({
    comparisonConfig,
    comparisonDataPath,
    extractEphemerisManifestImpl = extractEphemerisManifest,
    resolveOrbitAssetUrlsImpl = resolveOrbitAssetUrls,
    resolvePrimaryMissionCraftImpl = resolvePrimaryMissionCraft,
}) {
    const orbitUrlsByOrigin = {};
    const primaryCraft = resolvePrimaryMissionCraftImpl(comparisonConfig);
    const configuredRelativeBase = asTrimmedString(comparisonConfig?.relative?.orbits_file);
    const relativeFallbackBase =
        configuredRelativeBase ||
        `relative-${asTrimmedString(primaryCraft?.mnemonic) || asTrimmedString(comparisonConfig?.spacecraft_mnemonic) || "SC"}`;

    for (const originKey of ["geo", "lunar", "relative"]) {
        const orbitUrls = resolveOrbitAssetUrlsImpl({
            dataPath: comparisonDataPath,
            manifest: extractEphemerisManifestImpl(comparisonConfig),
            phaseKey: originKey,
            phaseConfig: comparisonConfig?.[originKey],
        });
        if (orbitUrls?.orbitsCheb) {
            orbitUrlsByOrigin[originKey] = orbitUrls.orbitsCheb;
            continue;
        }

        if (originKey === "relative" && relativeFallbackBase) {
            orbitUrlsByOrigin.relative = `${comparisonDataPath}${relativeFallbackBase}-cheb.json`;
        }
    }

    return orbitUrlsByOrigin;
}

function buildComparisonTimelineSourceEventsByOrigin({
    missionConfig,
    sourceTimeRangesByOrigin,
    computeEventsUpdateImpl = computeEventsUpdate,
    nowDate = new Date(),
}) {
    const eventInfosByOrigin = {};

    for (const [originKey, sourceRange] of Object.entries(sourceTimeRangesByOrigin || {})) {
        const eventsUpdate = computeEventsUpdateImpl({
            globalConfig: missionConfig,
            config: originKey,
            nowDate,
            getDataEndTimeMs: () => sourceRange?.endMs,
        });
        if (!Array.isArray(eventsUpdate?.eventInfos) || eventsUpdate.eventInfos.length === 0) {
            continue;
        }
        eventInfosByOrigin[originKey] = eventsUpdate.eventInfos;
    }

    return eventInfosByOrigin;
}

function buildComparisonOverlayAugmentation({
    baseConfig,
    comparisonConfig,
    comparisonDataPath,
    compareMission,
    currentMissionFolder = "",
    createUTCTimestamp,
    selectedPrimaryAlignmentEventKey = "",
    selectedComparisonAlignmentEventKey = "",
    resolvePrimaryMissionCraftImpl = resolvePrimaryMissionCraft,
    buildComparisonOverlayCraftIdImpl = buildComparisonOverlayCraftId,
    buildComparisonOverlayCraftImpl = buildComparisonOverlayCraft,
    buildComparisonOverlaySupportBodyIdImpl = buildComparisonOverlaySupportBodyId,
    buildComparisonTimeRangesImpl = buildComparisonTimeRanges,
    buildComparisonOrbitUrlsByOriginImpl = buildComparisonOrbitUrlsByOrigin,
    buildComparisonTimelineSourceEventsByOriginImpl = buildComparisonTimelineSourceEventsByOrigin,
    computeMissionEventTimesImpl = computeMissionEventTimes,
}) {
    const primaryCraft = resolvePrimaryMissionCraftImpl(baseConfig);
    const comparisonPrimaryCraft = resolvePrimaryMissionCraftImpl(comparisonConfig);
    if (!primaryCraft || !comparisonPrimaryCraft) {
        return null;
    }

    const missionFolder =
        asTrimmedString(compareMission?.folder) ||
        asTrimmedString(currentMissionFolder, "comparison");
    const compareCraftId = buildComparisonOverlayCraftIdImpl({
        missionFolder,
        sourceCraftId: comparisonPrimaryCraft.id,
    });
    const compareCraft = buildComparisonOverlayCraftImpl({
        sourceCraft: comparisonPrimaryCraft,
        primaryCraft,
        compareCraftId,
        missionFolder,
        missionLabel:
            comparisonConfig?.mission_name ||
            compareMission?.missionName ||
            missionFolder,
        missionShortLabel:
            comparisonConfig?.mission_name_short ||
            compareMission?.missionName ||
            missionFolder,
    });

    const normalizationSourceBodyIdsByOrigin = {
        geo: "MOON",
        relative: "MOON",
        lunar: "EARTH",
    };
    const normalizationSupportBodyIdsByOrigin = Object.fromEntries(
        Object.entries(normalizationSourceBodyIdsByOrigin).map(
            ([originKey, sourceBodyId]) => [
                originKey,
                buildComparisonOverlaySupportBodyIdImpl({
                    compareCraftId,
                    sourceBodyId,
                }),
            ],
        ),
    );

    const { displayTimeRangesByOrigin, sourceTimeRangesByOrigin } =
        buildComparisonTimeRangesImpl({
            primaryConfig: baseConfig,
            primaryCraftId: primaryCraft.id,
            comparisonConfig,
            comparisonCraftId: comparisonPrimaryCraft.id,
            createUTCTimestamp,
        });

    if (
        Object.keys(displayTimeRangesByOrigin).length === 0 ||
        Object.keys(sourceTimeRangesByOrigin).length === 0
    ) {
        return null;
    }

    const supportOrbitChebyshevUrlsByOrigin = buildComparisonOrbitUrlsByOriginImpl({
        comparisonConfig,
        comparisonDataPath,
        resolvePrimaryMissionCraftImpl,
    });
    const primaryTimelineEventInfosByOrigin = buildComparisonTimelineSourceEventsByOriginImpl({
        missionConfig: baseConfig,
        sourceTimeRangesByOrigin: displayTimeRangesByOrigin,
    });
    const timelineSourceEventInfosByOrigin = buildComparisonTimelineSourceEventsByOriginImpl({
        missionConfig: comparisonConfig,
        sourceTimeRangesByOrigin,
    });
    const comparisonMissionEventTimes = computeMissionEventTimesImpl({
        globalConfig: comparisonConfig,
    });

    return {
        compareCraft,
        ephemerisSourceByCraftId: {
            [compareCraftId]: resolveCraftEphemerisSource(
                comparisonConfig,
                comparisonPrimaryCraft,
            ),
        },
        comparisonOverlay: {
            missionFolder,
            missionKey: missionFolder,
            missionName:
                comparisonConfig?.mission_name ||
                compareMission?.missionName ||
                missionFolder,
            missionShortLabel:
                comparisonConfig?.mission_name_short ||
                compareMission?.missionName ||
                missionFolder,
            isLunarMission: !!comparisonConfig?.is_lunar,
            missionEventTimes: comparisonMissionEventTimes,
            compareCraftId,
            sourceCraftId: comparisonPrimaryCraft.id,
            sourceCraftMnemonic: comparisonPrimaryCraft.mnemonic,
            normalizationSourceBodyIdsByOrigin,
            normalizationSupportBodyIdsByOrigin,
            displayTimeRangesByOrigin,
            sourceTimeRangesByOrigin,
            primaryTimelineEventInfosByOrigin,
            timelineSourceEventInfosByOrigin,
            selectedPrimaryAlignmentEventKey,
            selectedComparisonAlignmentEventKey,
            supportOrbitChebyshevUrlsByOrigin,
            defaultVisibleCraftIds: [primaryCraft.id, compareCraftId],
        },
    };
}

function mergeComparisonOverlayIntoBaseConfig(baseConfig, augmentation) {
    if (!baseConfig || !augmentation) {
        return baseConfig;
    }

    return {
        ...baseConfig,
        crafts: [
            ...(Array.isArray(baseConfig.crafts) ? baseConfig.crafts : []),
            augmentation.compareCraft,
        ],
        ephemeris_sources: {
            ...(baseConfig.ephemeris_sources || {}),
            ...(augmentation.ephemerisSourceByCraftId || {}),
        },
        comparisonOverlay: augmentation.comparisonOverlay,
    };
}

export {
    buildComparisonOverlayAugmentation,
    buildComparisonOrbitUrlsByOrigin,
    buildComparisonTimeRanges,
    buildComparisonTimelineSourceEventsByOrigin,
    mergeComparisonOverlayIntoBaseConfig,
};
