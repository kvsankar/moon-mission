import {
    createDefaultLunarCraterViewState,
    normalizeLunarCraterViewState,
    patchLunarCraterViewState,
} from "./lunar-crater-view.js";

export const LUNAR_FEATURE_PRESET_IDS = Object.freeze({
    NONE: "none",
    DEFAULT: "default",
    INTERESTING: "default",
    ALL: "all",
    CRATERS_ONLY: "craters_only",
    NON_CRATER: "non_crater",
});

export const DEFAULT_LUNAR_FEATURE_TYPES = Object.freeze([
    "Crater, craters",
    "Mare, maria",
    "Mons, montes",
    "Rima, rimae",
]);

const BASE_DEFAULT_LUNAR_FEATURE_TYPE_FILTERS = Object.freeze({
    "Satellite Feature": { enabled: false, minDiameterKm: null, maxDiameterKm: null },
    "Crater, craters": { enabled: true, minDiameterKm: null, maxDiameterKm: null },
    "Rima, rimae": { enabled: true, minDiameterKm: null, maxDiameterKm: null },
    "Mons, montes": { enabled: true, minDiameterKm: null, maxDiameterKm: null },
    "Dorsum, dorsa": { enabled: false, minDiameterKm: null, maxDiameterKm: null },
    "Mare, maria": { enabled: true, minDiameterKm: null, maxDiameterKm: null },
    "Catena, catenae": { enabled: false, minDiameterKm: null, maxDiameterKm: null },
    "Vallis, valles": { enabled: false, minDiameterKm: null, maxDiameterKm: null },
    "Promontorium, promontoria": { enabled: false, minDiameterKm: null, maxDiameterKm: null },
    "Palus, paludes": { enabled: false, minDiameterKm: null, maxDiameterKm: null },
    "Oceanus, oceani": { enabled: false, minDiameterKm: null, maxDiameterKm: null },
    "Planitia, planitiae": { enabled: false, minDiameterKm: null, maxDiameterKm: null },
});

const BASE_DEFAULT_LUNAR_FEATURE_HOVER_TYPE_FILTERS = Object.freeze(
    Object.fromEntries(
        Object.entries(BASE_DEFAULT_LUNAR_FEATURE_TYPE_FILTERS)
            .map(([key, value]) => [key, { ...value, enabled: true }]),
    ),
);

const BASE_DEFAULT_LUNAR_FEATURE_VIEW_STATE = Object.freeze({
    viewCraters: true,
    lunarFeatureTypeFilters: BASE_DEFAULT_LUNAR_FEATURE_TYPE_FILTERS,
    lunarFeatureSearchQuery: "",
    lunarFeaturePinnedNames: [],
    lunarFeatureExcludedKeys: [],
    lunarFeatureHoverTypeFilters: BASE_DEFAULT_LUNAR_FEATURE_HOVER_TYPE_FILTERS,
    lunarFeatureHoverSearchQuery: "",
    lunarFeatureHoverExcludedKeys: [],
    ...createDefaultLunarCraterViewState(),
});

export function normalizeLunarFeatureSearchQuery(value) {
    return typeof value === "string"
        ? value.trim().replace(/\s+/g, " ")
        : "";
}

export function normalizeLunarFeatureKeyList(value) {
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(
        value
            .map((entry) => typeof entry === "string" ? entry.trim() : "")
            .filter(Boolean),
    ));
}

export function normalizeLunarFeatureNameList(value) {
    return normalizeLunarFeatureKeyList(value);
}

function normalizeOptionalDiameter(value, fallback = null) {
    if (value === null || value === undefined || value === "") {
        if (fallback === null || fallback === undefined || fallback === "") {
            return null;
        }
        const fallbackNumeric = Number(fallback);
        return Number.isFinite(fallbackNumeric) ? fallbackNumeric : null;
    }
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
        return numeric;
    }
    if (fallback === null || fallback === undefined || fallback === "") {
        return null;
    }
    const fallbackNumeric = Number(fallback);
    return Number.isFinite(fallbackNumeric) ? fallbackNumeric : null;
}

function normalizeLunarFeatureTypeFilterEntry(entry = {}, fallback = {}) {
    const normalized = {
        enabled: entry?.enabled !== false,
        minDiameterKm: normalizeOptionalDiameter(entry?.minDiameterKm, fallback?.minDiameterKm),
        maxDiameterKm: normalizeOptionalDiameter(entry?.maxDiameterKm, fallback?.maxDiameterKm),
    };
    if (
        Number.isFinite(normalized.minDiameterKm) &&
        Number.isFinite(normalized.maxDiameterKm) &&
        normalized.minDiameterKm > normalized.maxDiameterKm
    ) {
        const swap = normalized.minDiameterKm;
        normalized.minDiameterKm = normalized.maxDiameterKm;
        normalized.maxDiameterKm = swap;
    }
    return normalized;
}

export function normalizeLunarFeatureTypeFilters(value = {}, fallback = {}) {
    const merged = {};
    const fallbackSource = fallback && typeof fallback === "object"
        ? fallback
        : {};
    const valueSource = value && typeof value === "object"
        ? value
        : {};
    const keys = new Set([
        ...Object.keys(BASE_DEFAULT_LUNAR_FEATURE_TYPE_FILTERS),
        ...Object.keys(fallbackSource),
        ...Object.keys(valueSource),
    ]);
    for (const key of keys) {
        const fallbackEntry = fallbackSource[key] || BASE_DEFAULT_LUNAR_FEATURE_TYPE_FILTERS[key] || {};
        merged[key] = normalizeLunarFeatureTypeFilterEntry(valueSource[key], fallbackEntry);
    }
    return merged;
}

export function createDefaultLunarFeatureViewState(overrides = {}) {
    return normalizeLunarFeatureViewState({
        ...BASE_DEFAULT_LUNAR_FEATURE_VIEW_STATE,
        ...overrides,
    }, BASE_DEFAULT_LUNAR_FEATURE_VIEW_STATE);
}

export function normalizeLunarFeatureViewState(
    value = {},
    fallback = null,
) {
    const resolvedFallback = fallback
        ? {
            ...BASE_DEFAULT_LUNAR_FEATURE_VIEW_STATE,
            ...fallback,
        }
        : BASE_DEFAULT_LUNAR_FEATURE_VIEW_STATE;
    const searchQuery = Object.prototype.hasOwnProperty.call(value, "lunarFeatureSearchQuery")
        ? normalizeLunarFeatureSearchQuery(value.lunarFeatureSearchQuery)
        : normalizeLunarFeatureSearchQuery(resolvedFallback.lunarFeatureSearchQuery);
    const craterState = normalizeLunarCraterViewState(value, resolvedFallback);
    const normalized = {
        viewCraters: Object.prototype.hasOwnProperty.call(value, "viewCraters")
            ? value.viewCraters !== false
            : resolvedFallback.viewCraters !== false,
        lunarFeatureTypeFilters: normalizeLunarFeatureTypeFilters(
            value.lunarFeatureTypeFilters,
            resolvedFallback.lunarFeatureTypeFilters,
        ),
        lunarFeatureSearchQuery: searchQuery,
        lunarFeaturePinnedNames: Object.prototype.hasOwnProperty.call(value, "lunarFeaturePinnedNames")
            ? normalizeLunarFeatureNameList(value.lunarFeaturePinnedNames)
            : normalizeLunarFeatureNameList(resolvedFallback.lunarFeaturePinnedNames),
        lunarFeatureExcludedKeys: Object.prototype.hasOwnProperty.call(value, "lunarFeatureExcludedKeys")
            ? normalizeLunarFeatureKeyList(value.lunarFeatureExcludedKeys)
            : normalizeLunarFeatureKeyList(resolvedFallback.lunarFeatureExcludedKeys),
        lunarFeatureHoverTypeFilters: normalizeLunarFeatureTypeFilters(
            value.lunarFeatureHoverTypeFilters,
            resolvedFallback.lunarFeatureHoverTypeFilters,
        ),
        lunarFeatureHoverSearchQuery: Object.prototype.hasOwnProperty.call(value, "lunarFeatureHoverSearchQuery")
            ? normalizeLunarFeatureSearchQuery(value.lunarFeatureHoverSearchQuery)
            : normalizeLunarFeatureSearchQuery(resolvedFallback.lunarFeatureHoverSearchQuery),
        lunarFeatureHoverExcludedKeys: Object.prototype.hasOwnProperty.call(value, "lunarFeatureHoverExcludedKeys")
            ? normalizeLunarFeatureKeyList(value.lunarFeatureHoverExcludedKeys)
            : normalizeLunarFeatureKeyList(resolvedFallback.lunarFeatureHoverExcludedKeys),
        ...craterState,
    };
    const hasSearchResultsOverlay = normalized.lunarFeatureSearchQuery.length > 0 ||
        normalized.lunarFeaturePinnedNames.length > 0;
    normalized.viewLunarCraters = normalized.viewLunarCraters === true || hasSearchResultsOverlay;
    normalized.viewLunarFeatures = normalized.viewLunarCraters === true;
    return normalized;
}

export function patchLunarFeatureViewState(
    state = createDefaultLunarFeatureViewState(),
    patch = {},
) {
    const baseState = normalizeLunarFeatureViewState(state);
    const craterPatchState = patchLunarCraterViewState(baseState, patch);
    const nextState = {
        ...craterPatchState,
        viewCraters: Object.prototype.hasOwnProperty.call(patch, "viewCraters")
            ? patch.viewCraters !== false
            : baseState.viewCraters,
        lunarFeatureTypeFilters: Object.prototype.hasOwnProperty.call(patch, "lunarFeatureTypeFilters")
            ? normalizeLunarFeatureTypeFilters(
                patch.lunarFeatureTypeFilters,
                baseState.lunarFeatureTypeFilters,
            )
            : baseState.lunarFeatureTypeFilters,
        lunarFeatureSearchQuery: Object.prototype.hasOwnProperty.call(patch, "lunarFeatureSearchQuery")
            ? normalizeLunarFeatureSearchQuery(patch.lunarFeatureSearchQuery)
            : baseState.lunarFeatureSearchQuery,
        lunarFeaturePinnedNames: Object.prototype.hasOwnProperty.call(patch, "lunarFeaturePinnedNames")
            ? normalizeLunarFeatureNameList(patch.lunarFeaturePinnedNames)
            : baseState.lunarFeaturePinnedNames,
        lunarFeatureExcludedKeys: Object.prototype.hasOwnProperty.call(patch, "lunarFeatureExcludedKeys")
            ? normalizeLunarFeatureKeyList(patch.lunarFeatureExcludedKeys)
            : baseState.lunarFeatureExcludedKeys,
        lunarFeatureHoverTypeFilters: Object.prototype.hasOwnProperty.call(patch, "lunarFeatureHoverTypeFilters")
            ? normalizeLunarFeatureTypeFilters(
                patch.lunarFeatureHoverTypeFilters,
                baseState.lunarFeatureHoverTypeFilters,
            )
            : baseState.lunarFeatureHoverTypeFilters,
        lunarFeatureHoverSearchQuery: Object.prototype.hasOwnProperty.call(patch, "lunarFeatureHoverSearchQuery")
            ? normalizeLunarFeatureSearchQuery(patch.lunarFeatureHoverSearchQuery)
            : baseState.lunarFeatureHoverSearchQuery,
        lunarFeatureHoverExcludedKeys: Object.prototype.hasOwnProperty.call(patch, "lunarFeatureHoverExcludedKeys")
            ? normalizeLunarFeatureKeyList(patch.lunarFeatureHoverExcludedKeys)
            : baseState.lunarFeatureHoverExcludedKeys,
    };
    return normalizeLunarFeatureViewState(nextState, baseState);
}
