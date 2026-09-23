import { LUNAR_CRATER_DIAMETER_STEP_KM, createDefaultLunarCraterViewState, normalizeLunarCraterDiameterRange } from "../core/domain/lunar-crater-view.js";
import { DEFAULT_LUNAR_FEATURE_TYPES, LUNAR_FEATURE_PRESET_IDS, normalizeLunarFeatureViewState, normalizeLunarFeatureTypeFilters } from "../core/domain/lunar-feature-view.js";
import { getLoadedLunarFeatureCatalog, loadLunarFeatureCatalog } from "../data/lunar-feature-catalog.js";

const CRATER_DENSE_SELECTION_COUNT = 1000;
const CRATER_DIAMETER_COMMIT_DELAY_MS = 180;
const SEARCH_RESULT_LIMIT = 12;
const TYPE_FILTER_DEFAULT_MIN_KM = 0;
const TYPE_FILTER_DEFAULT_MAX_KM = 6000;
const LUNAR_CRATER_FILTER_SCOPE_SHOW_ALL = "showAll";
const LUNAR_CRATER_FILTER_SCOPE_HOVER = "hover";
const LUNAR_CRATER_FILTER_SCOPE_SYNCED = "synced";
const LUNAR_CRATER_FILTER_SCOPE_SEARCH = "search";
const EMPTY_LUNAR_CRATER_CATALOG = Object.freeze({
    display: Object.freeze({}),
    features: Object.freeze([]),
});

let lunarCraterCatalog = getLoadedLunarFeatureCatalog();
let lunarCraterCatalogLoading = false;
let lunarCraterCatalogError = null;
const lunarCraterCatalogConsumers = new Map();

function getLunarCraterCatalog() {
    return lunarCraterCatalog || getLoadedLunarFeatureCatalog() || EMPTY_LUNAR_CRATER_CATALOG;
}

function hasLunarCraterCatalog() {
    return Array.isArray(getLunarCraterCatalog()?.features) &&
        getLunarCraterCatalog().features.length > 0;
}

function getLunarCraterCatalogLoadState() {
    return { loading: lunarCraterCatalogLoading, error: lunarCraterCatalogError };
}

function requestLunarCraterCatalog(elements = {}, onCatalogReady = null) {
    if (elements?.panel) {
        lunarCraterCatalogConsumers.set(elements, onCatalogReady);
    }
    if (hasLunarCraterCatalog() || lunarCraterCatalogLoading) {
        syncLunarCraterCatalogStatus(elements);
        return;
    }
    lunarCraterCatalogLoading = true;
    lunarCraterCatalogError = null;
    syncLunarCraterCatalogStatus(elements);
    loadLunarFeatureCatalog()
        .then((catalog) => {
            lunarCraterCatalog = catalog;
            lunarCraterCatalogLoading = false;
            for (const [consumerElements, notifyReady] of Array.from(lunarCraterCatalogConsumers)) {
                if (consumerElements?.panel?.isConnected === false) {
                    lunarCraterCatalogConsumers.delete(consumerElements);
                    continue;
                }
                resetLunarCraterCatalogControls(consumerElements);
                notifyReady?.(consumerElements);
            }
        })
        .catch((error) => {
            lunarCraterCatalogLoading = false;
            lunarCraterCatalogError = error;
            for (const consumerElements of lunarCraterCatalogConsumers.keys()) {
                syncLunarCraterCatalogStatus(consumerElements);
            }
            console.error("Failed to load lunar feature catalog", error);
        });
}

function resetLunarCraterCatalogControls(elements = {}) {
    if (elements.typeFilterContainer?.dataset) {
        delete elements.typeFilterContainer.dataset.lunarFeatureTypesBuilt;
    }
    elements.typeControls = null;
    elements.presetButtons = null;
}

function syncLunarCraterCatalogStatus(elements = {}) {
    const loading = lunarCraterCatalogLoading === true;
    elements.panel?.classList?.toggle?.("is-loading-catalog", loading);
    if (elements.busyIndicator && !elements.panel?.classList?.contains?.("is-busy")) {
        elements.busyIndicator.hidden = !loading;
        elements.busyIndicator.textContent = loading ? "Loading" : "Rendering";
    }
    if (elements.countValue && !hasLunarCraterCatalog()) {
        elements.countValue.textContent = loading
            ? "Loading features"
            : lunarCraterCatalogError
                ? "Features unavailable"
                : "Features not loaded";
    }
}

const LUNAR_FEATURE_PRESETS = Object.freeze([
    {
        id: LUNAR_FEATURE_PRESET_IDS.NONE,
        label: "Off",
        title: "Disable this lunar feature mode",
    },
    {
        id: LUNAR_FEATURE_PRESET_IDS.DEFAULT,
        label: "Recommended",
        title: "Show the recommended Lunar Features group",
    },
    {
        id: LUNAR_FEATURE_PRESET_IDS.ALL,
        label: "All",
        title: "Show all lunar feature classes",
    },
]);

const FEATURE_TYPE_DISPLAY_ORDER = Object.freeze([
    "Crater, craters",
    "Mare, maria",
    "Mons, montes",
    "Rima, rimae",
    "Vallis, valles",
    "Dorsum, dorsa",
    "Catena, catenae",
    "Promontorium, promontoria",
    "Oceanus, oceani",
    "Palus, paludes",
    "Planitia, planitiae",
    "Satellite Feature",
]);

const FEATURE_TYPE_GROUPS = Object.freeze([
    {
        id: "popular",
        label: "Popular",
        types: DEFAULT_LUNAR_FEATURE_TYPES,
    },
    {
        id: "structures",
        label: "Lines & Relief",
        types: ["Vallis, valles", "Dorsum, dorsa", "Catena, catenae", "Promontorium, promontoria"],
    },
    {
        id: "regions",
        label: "Large Regions",
        types: ["Oceanus, oceani", "Palus, paludes", "Planitia, planitiae"],
    },
    {
        id: "reference",
        label: "Satellite Features",
        types: ["Satellite Feature"],
    },
]);

const craterCountFormatter = typeof Intl !== "undefined"
    ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 })
    : null;

function readNumericControlValue(control, fallback) {
    const value = Number(control?.value);
    return Number.isFinite(value) ? value : fallback;
}

function readGlobalDiameterRangeFromElements(elements = {}) {
    const fallback = createDefaultLunarCraterViewState();
    return normalizeLunarCraterDiameterRange({
        lunarCraterMinDiameterKm: readNumericControlValue(
            elements.minDiameterSlider,
            fallback.lunarCraterMinDiameterKm,
        ),
        lunarCraterMaxDiameterKm: readNumericControlValue(
            elements.maxDiameterSlider,
            fallback.lunarCraterMaxDiameterKm,
        ),
    });
}

function formatDiameterKm(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return "";
    if (Number.isInteger(numericValue)) return String(numericValue);
    return numericValue.toFixed(1).replace(/\.0$/, "");
}

function formatDiameterRange(state) {
    const normalized = normalizeLunarFeatureViewState(state);
    return `${formatDiameterKm(normalized.lunarCraterMinDiameterKm)}-${formatDiameterKm(
        normalized.lunarCraterMaxDiameterKm,
    )} km`;
}

function formatCraterCount(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return "0";
    return craterCountFormatter
        ? craterCountFormatter.format(numericValue)
        : String(Math.round(numericValue));
}

function getCatalogTypeStats(catalog = getLunarCraterCatalog()) {
    const statsByType = new Map();
    for (const feature of catalog?.features || []) {
        const featureType = typeof feature?.featureType === "string"
            ? feature.featureType
            : "";
        if (!featureType) continue;
        const diameterKm = Number(feature?.diameterKm);
        if (!Number.isFinite(diameterKm)) continue;
        const existing = statsByType.get(featureType);
        if (!existing) {
            statsByType.set(featureType, {
                featureType,
                count: 1,
                minDiameterKm: diameterKm,
                maxDiameterKm: diameterKm,
            });
            continue;
        }
        existing.count += 1;
        existing.minDiameterKm = Math.min(existing.minDiameterKm, diameterKm);
        existing.maxDiameterKm = Math.max(existing.maxDiameterKm, diameterKm);
    }
    return Array.from(statsByType.values())
        .sort((a, b) => b.count - a.count);
}

function getOrderedCatalogTypeStats(statsList = getCatalogTypeStats()) {
    const orderIndex = new Map(FEATURE_TYPE_DISPLAY_ORDER.map((name, index) => [name, index]));
    return [...statsList].sort((a, b) => {
        const aIdx = orderIndex.has(a.featureType) ? orderIndex.get(a.featureType) : Number.MAX_SAFE_INTEGER;
        const bIdx = orderIndex.has(b.featureType) ? orderIndex.get(b.featureType) : Number.MAX_SAFE_INTEGER;
        if (aIdx !== bIdx) {
            return aIdx - bIdx;
        }
        if (b.count !== a.count) {
            return b.count - a.count;
        }
        return a.featureType.localeCompare(b.featureType);
    });
}

function formatFeatureTypeLabel(featureType) {
    const primary = String(featureType || "").split(",")[0].trim();
    return primary || String(featureType || "");
}

function formatTypeRangeValue(minDiameterKm, maxDiameterKm) {
    const min = Number(minDiameterKm);
    const max = Number(maxDiameterKm);
    const safeMin = Number.isFinite(min) ? Math.max(0, min) : TYPE_FILTER_DEFAULT_MIN_KM;
    const safeMax = Number.isFinite(max)
        ? Math.max(safeMin, max)
        : TYPE_FILTER_DEFAULT_MAX_KM;
    return `${formatDiameterKm(safeMin)}-${formatDiameterKm(safeMax)} km`;
}

function resolveTypeSliderMax(stats = null) {
    const maxFromStats = Number(stats?.maxDiameterKm);
    if (!Number.isFinite(maxFromStats)) {
        return TYPE_FILTER_DEFAULT_MAX_KM;
    }
    return Math.max(
        TYPE_FILTER_DEFAULT_MAX_KM,
        Math.ceil(maxFromStats / LUNAR_CRATER_DIAMETER_STEP_KM) * LUNAR_CRATER_DIAMETER_STEP_KM,
    );
}

function readSliderBound(slider, key, fallback) {
    if (!slider) return fallback;
    const value = Number(slider[key]);
    return Number.isFinite(value) ? value : fallback;
}

function readTypeSliderValue(slider, fallback, { minBound = 0, maxBound = TYPE_FILTER_DEFAULT_MAX_KM } = {}) {
    const value = Number(slider?.value);
    if (!Number.isFinite(value)) {
        return fallback;
    }
    return Math.max(minBound, Math.min(maxBound, value));
}

function syncTypeRangeValueText(controls, minDiameterKm, maxDiameterKm) {
    if (!controls?.rangeValue) return;
    controls.rangeValue.textContent = formatTypeRangeValue(minDiameterKm, maxDiameterKm);
}

function syncDualRangeFill(fillElement, minSlider, maxSlider) {
    if (!fillElement || !minSlider || !maxSlider) return;
    const minBound = readSliderBound(minSlider, "min", TYPE_FILTER_DEFAULT_MIN_KM);
    const maxBound = readSliderBound(maxSlider, "max", TYPE_FILTER_DEFAULT_MAX_KM);
    const span = Math.max(1, maxBound - minBound);
    const minValue = readTypeSliderValue(minSlider, minBound, { minBound, maxBound });
    const maxValue = readTypeSliderValue(maxSlider, maxBound, { minBound, maxBound });
    const leftPct = ((minValue - minBound) / span) * 100;
    const rightPct = ((maxBound - maxValue) / span) * 100;
    fillElement.style.left = `${Math.max(0, Math.min(100, leftPct))}%`;
    fillElement.style.right = `${Math.max(0, Math.min(100, rightPct))}%`;
}

function buildPresetTypeFilters(baseFilters, presetId) {
    const current = normalizeLunarFeatureTypeFilters(baseFilters);
    const next = {};
    for (const stats of getOrderedCatalogTypeStats()) {
        const existing = current[stats.featureType] || {};
        const minDiameterKm = Number.isFinite(existing.minDiameterKm)
            ? existing.minDiameterKm
            : null;
        const maxDiameterKm = Number.isFinite(existing.maxDiameterKm)
            ? existing.maxDiameterKm
            : null;
        next[stats.featureType] = {
            enabled: existing.enabled !== false,
            minDiameterKm,
            maxDiameterKm,
        };
    }
    for (const [featureType, filter] of Object.entries(next)) {
        const isCrater = featureType === "Crater, craters";
        const isSatellite = featureType === "Satellite Feature";
        const isDefaultType = DEFAULT_LUNAR_FEATURE_TYPES.includes(featureType);
        filter.minDiameterKm = null;
        filter.maxDiameterKm = null;
        switch (presetId) {
            case LUNAR_FEATURE_PRESET_IDS.ALL:
                filter.enabled = true;
                break;
            case LUNAR_FEATURE_PRESET_IDS.NONE:
                filter.enabled = false;
                break;
            case LUNAR_FEATURE_PRESET_IDS.CRATERS_ONLY:
                filter.enabled = isCrater;
                break;
            case LUNAR_FEATURE_PRESET_IDS.NON_CRATER:
                filter.enabled = !isCrater && !isSatellite;
                break;
            case LUNAR_FEATURE_PRESET_IDS.DEFAULT:
            default:
                filter.enabled = isDefaultType;
                break;
        }
    }
    return normalizeLunarFeatureTypeFilters(next, current);
}

function areTypeFilterEntriesEquivalent(a = {}, b = {}) {
    const aEnabled = a.enabled !== false;
    const bEnabled = b.enabled !== false;
    const aMin = Number.isFinite(Number(a.minDiameterKm)) ? Number(a.minDiameterKm) : null;
    const bMin = Number.isFinite(Number(b.minDiameterKm)) ? Number(b.minDiameterKm) : null;
    const aMax = Number.isFinite(Number(a.maxDiameterKm)) ? Number(a.maxDiameterKm) : null;
    const bMax = Number.isFinite(Number(b.maxDiameterKm)) ? Number(b.maxDiameterKm) : null;
    return aEnabled === bEnabled && aMin === bMin && aMax === bMax;
}

function areTypeFiltersEquivalent(a = {}, b = {}) {
    const normalizedA = normalizeLunarFeatureTypeFilters(a);
    const normalizedB = normalizeLunarFeatureTypeFilters(b);
    const keys = new Set([
        ...Object.keys(normalizedA),
        ...Object.keys(normalizedB),
    ]);
    for (const key of keys) {
        if (!areTypeFilterEntriesEquivalent(normalizedA[key], normalizedB[key])) {
            return false;
        }
    }
    return true;
}

function normalizeFilterScope(value) {
    if (value === LUNAR_CRATER_FILTER_SCOPE_SEARCH) {
        return LUNAR_CRATER_FILTER_SCOPE_SEARCH;
    }
    if (value === LUNAR_CRATER_FILTER_SCOPE_SYNCED) {
        return LUNAR_CRATER_FILTER_SCOPE_SYNCED;
    }
    return value === LUNAR_CRATER_FILTER_SCOPE_HOVER
        ? LUNAR_CRATER_FILTER_SCOPE_HOVER
        : LUNAR_CRATER_FILTER_SCOPE_SHOW_ALL;
}
export {
    getLunarCraterCatalogLoadState,
    CRATER_DENSE_SELECTION_COUNT,
    CRATER_DIAMETER_COMMIT_DELAY_MS,
    SEARCH_RESULT_LIMIT,
    TYPE_FILTER_DEFAULT_MIN_KM,
    TYPE_FILTER_DEFAULT_MAX_KM,
    LUNAR_CRATER_FILTER_SCOPE_SHOW_ALL,
    LUNAR_CRATER_FILTER_SCOPE_HOVER,
    LUNAR_CRATER_FILTER_SCOPE_SYNCED,
    LUNAR_CRATER_FILTER_SCOPE_SEARCH,
    getLunarCraterCatalog,
    hasLunarCraterCatalog,
    requestLunarCraterCatalog,
    syncLunarCraterCatalogStatus,
    LUNAR_FEATURE_PRESETS,
    FEATURE_TYPE_GROUPS,
    readNumericControlValue,
    readGlobalDiameterRangeFromElements,
    formatDiameterKm,
    formatDiameterRange,
    formatCraterCount,
    getOrderedCatalogTypeStats,
    formatFeatureTypeLabel,
    formatTypeRangeValue,
    resolveTypeSliderMax,
    readSliderBound,
    readTypeSliderValue,
    syncTypeRangeValueText,
    syncDualRangeFill,
    buildPresetTypeFilters,
    areTypeFiltersEquivalent,
    normalizeFilterScope,
};
