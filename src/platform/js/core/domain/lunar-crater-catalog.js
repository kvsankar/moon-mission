import {
    LUNAR_CRATER_DEFAULT_MAX_DIAMETER_KM,
    LUNAR_CRATER_DEFAULT_MIN_DIAMETER_KM,
    LUNAR_CRATER_RANGE_MAX_DIAMETER_KM,
    LUNAR_CRATER_RANGE_MIN_DIAMETER_KM,
    normalizeLunarCraterDiameterRange,
} from "./lunar-crater-view.js";

import {
    craterFeatureCache,
    DEFAULT_LUNAR_RADIUS_KM,
    DEFAULT_MIN_SCREEN_DIAMETER_PX,
    DEFAULT_MAX_CRATERS_TO_RENDER,
    readFiniteNumber,
    readOptionalFiniteNumber,
    normalizeSearchText,
    normalizeFeatureName,
    normalizeFeatureNameSet,
    getLunarFeatureKey,
    featureMatchesSearch,
} from "./lunar-crater-common.js";
import {
    craterLatLonToUnitVector,
    resolveViewFrame,
    getCraterAngularRadius,
    projectCraterToView,
} from "./lunar-crater-projection.js";
import { chooseLabelKeys } from "./lunar-crater-labels.js";

export { getLunarFeatureKey };
export { craterLatLonToUnitVector, getCraterBoundaryTone } from "./lunar-crater-projection.js";
export { getCraterLabelPlacement, getCraterHoverLabelScreenAnchor } from "./lunar-crater-labels.js";

export function getValidCraterFeatures(catalog = {}) {
    if (catalog && typeof catalog === "object" && craterFeatureCache.has(catalog)) {
        return craterFeatureCache.get(catalog);
    }
    const features = (catalog?.features || [])
        .filter((feature) =>
            Number.isFinite(feature?.latitudeDeg) &&
            Number.isFinite(feature?.longitudeDeg) &&
            Number.isFinite(feature?.diameterKm) &&
            typeof feature.name === "string" &&
            feature.name.trim(),
        )
        .sort((a, b) => b.diameterKm - a.diameterKm);
    if (catalog && typeof catalog === "object") {
        craterFeatureCache.set(catalog, features);
    }
    return features;
}

export function getCraterDiameterBounds(catalog = {}) {
    const configuredMin = Number(catalog?.display?.rangeMinDiameterKm);
    const configuredMax = Number(catalog?.display?.rangeMaxDiameterKm);
    const featureDiameters = (catalog?.features || [])
        .map((feature) => Number(feature?.diameterKm))
        .filter(Number.isFinite);
    const largestFeatureDiameter = featureDiameters.length
        ? Math.max(...featureDiameters)
        : LUNAR_CRATER_RANGE_MAX_DIAMETER_KM;
    const maxDiameterKm = Number.isFinite(configuredMax)
        ? configuredMax
        : Math.max(
            LUNAR_CRATER_RANGE_MAX_DIAMETER_KM,
            Math.ceil(largestFeatureDiameter / 10) * 10,
        );
    const minDiameterKm = Number.isFinite(configuredMin)
        ? configuredMin
        : LUNAR_CRATER_RANGE_MIN_DIAMETER_KM;

    return {
        minDiameterKm,
        maxDiameterKm: Math.max(minDiameterKm, maxDiameterKm),
    };
}

export function getCraterDiameterFallback(catalog = {}) {
    return {
        lunarCraterMinDiameterKm: Number.isFinite(Number(catalog?.display?.defaultMinDiameterKm))
            ? Number(catalog.display.defaultMinDiameterKm)
            : (Number.isFinite(Number(catalog?.display?.minDiameterKm))
                ? Number(catalog.display.minDiameterKm)
                : LUNAR_CRATER_DEFAULT_MIN_DIAMETER_KM),
        lunarCraterMaxDiameterKm: Number.isFinite(Number(catalog?.display?.defaultMaxDiameterKm))
            ? Number(catalog.display.defaultMaxDiameterKm)
            : LUNAR_CRATER_DEFAULT_MAX_DIAMETER_KM,
    };
}

export function normalizeCraterDisplayDiameterRange(value = {}, catalog = {}) {
    return normalizeLunarCraterDiameterRange(
        value,
        getCraterDiameterFallback(catalog),
        getCraterDiameterBounds(catalog),
    );
}

export function getCraterDisplayFeatures(catalog = {}, options = {}) {
    const features = getValidCraterFeatures(catalog);
    const typeFilters = options?.lunarFeatureTypeFilters && typeof options.lunarFeatureTypeFilters === "object"
        ? options.lunarFeatureTypeFilters
        : null;
    const searchQuery = normalizeSearchText(options.lunarFeatureSearchQuery ?? options.searchQuery);
    const pinnedNames = normalizeFeatureNameSet(options.lunarFeaturePinnedNames);
    const excludedKeys = new Set(Array.isArray(options.lunarFeatureExcludedKeys)
        ? options.lunarFeatureExcludedKeys.map((entry) => String(entry || "").trim()).filter(Boolean)
        : []);
    if (
        options.includeAll === true &&
        !Number.isFinite(Number(options.lunarCraterMinDiameterKm ?? options.minDiameterKm)) &&
        !Number.isFinite(Number(options.lunarCraterMaxDiameterKm ?? options.maxDiameterKm)) &&
        !typeFilters &&
        !searchQuery &&
        pinnedNames.size === 0 &&
        excludedKeys.size === 0
    ) {
        return features;
    }
    const diameterRange = normalizeCraterDisplayDiameterRange(options, catalog);
    const selectedFeatures = [];
    for (const feature of features) {
        const pinned = pinnedNames.has(normalizeFeatureName(feature.name)) ||
            pinnedNames.has(normalizeFeatureName(feature.cleanName));
        if (searchQuery && !featureMatchesSearch(feature, searchQuery) && !pinned) {
            continue;
        }
        if (!searchQuery && pinnedNames.size > 0 && !pinned) {
            continue;
        }
        if (excludedKeys.has(getLunarFeatureKey(feature))) {
            continue;
        }
        if (pinned) {
            selectedFeatures.push(feature);
            continue;
        }
        const typeFilter = typeFilters
            ? typeFilters[feature.featureType] || null
            : null;
        if (typeFilter?.enabled === false) {
            continue;
        }
        const minDiameterKm = readOptionalFiniteNumber(
            typeFilter?.minDiameterKm,
            diameterRange.lunarCraterMinDiameterKm,
        );
        const maxDiameterKm = readOptionalFiniteNumber(
            typeFilter?.maxDiameterKm,
            diameterRange.lunarCraterMaxDiameterKm,
        );
        if (feature.diameterKm > maxDiameterKm) {
            continue;
        }
        if (feature.diameterKm < minDiameterKm) {
            if (!typeFilters) {
                break;
            }
            continue;
        }
        selectedFeatures.push(feature);
    }
    return selectedFeatures;
}

export function countCraterDisplayFeatures(catalog = {}, options = {}) {
    return getCraterDisplayFeatures(catalog, options).length;
}

export function getCratersToShow(catalog = {}, options = {}) {
    const filteredFeatures = getCraterDisplayFeatures(catalog, options);
    const rawMaxCount = Number(options.maxCount ?? options.renderLimit);
    const maxCount = Math.max(
        0,
        Math.floor(Number.isFinite(rawMaxCount) ? rawMaxCount : DEFAULT_MAX_CRATERS_TO_RENDER),
    );
    if (maxCount <= 0) {
        return {
            craters: [],
            filteredCount: filteredFeatures.length,
            candidateCount: 0,
            renderedCount: 0,
            omittedCount: filteredFeatures.length,
            hasViewFrame: false,
        };
    }

    const minScreenDiameterPx = Math.max(
        0,
        readFiniteNumber(options.minScreenDiameterPx, DEFAULT_MIN_SCREEN_DIAMETER_PX),
    );
    const viewFrame = resolveViewFrame(options);
    const candidates = viewFrame
        ? filteredFeatures
            .map((feature) => projectCraterToView(feature, viewFrame, options))
            .filter(Boolean)
            .filter((entry) => entry.projectedDiameterPx >= minScreenDiameterPx)
        : filteredFeatures.map((feature) => ({
            feature,
            centerNormal: craterLatLonToUnitVector(feature.latitudeDeg, feature.longitudeDeg),
            angularRadiusRad: getCraterAngularRadius(feature, options.lunarRadiusKm || DEFAULT_LUNAR_RADIUS_KM),
            angularDistanceRad: 0,
            normalizedX: 0,
            normalizedY: 0,
            screenX: null,
            screenY: null,
            projectedDiameterPx: null,
            insideViewRect: true,
        })).filter((entry) => entry.centerNormal && entry.angularRadiusRad);

    candidates.sort((a, b) => {
        const aDistance = Math.hypot(a.normalizedX || 0, a.normalizedY || 0);
        const bDistance = Math.hypot(b.normalizedX || 0, b.normalizedY || 0);
        return aDistance - bDistance ||
            (b.projectedDiameterPx || 0) - (a.projectedDiameterPx || 0) ||
            b.feature.diameterKm - a.feature.diameterKm ||
            String(a.feature.name).localeCompare(String(b.feature.name));
    });

    const selected = candidates.slice(0, maxCount);
    const labelKeys = options.labelEveryRenderedCrater === true
        ? new Set(selected.map((entry) => entry.feature.name))
        : chooseLabelKeys(selected, options);
    const craters = selected.map((entry) => ({
        crater: entry.feature,
        feature: entry.feature,
        centerNormal: entry.centerNormal,
        angularRadiusRad: entry.angularRadiusRad,
        angularDistanceRad: entry.angularDistanceRad,
        normalizedX: entry.normalizedX,
        normalizedY: entry.normalizedY,
        screenX: entry.screenX,
        screenY: entry.screenY,
        projectedDiameterPx: entry.projectedDiameterPx,
        observerDepth: entry.observerDepth,
        sunlit: entry.sunlit,
        illumination: entry.illumination,
        boundaryTone: entry.boundaryTone,
        showLabel: labelKeys.has(entry.feature.name),
    }));

    return {
        craters,
        filteredCount: filteredFeatures.length,
        candidateCount: candidates.length,
        renderedCount: craters.length,
        omittedCount: Math.max(0, filteredFeatures.length - craters.length),
        hasViewFrame: !!viewFrame,
    };
}
