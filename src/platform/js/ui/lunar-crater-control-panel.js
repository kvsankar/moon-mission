import {
    LUNAR_CRATER_DEFAULT_MAX_DIAMETER_KM,
    LUNAR_CRATER_DEFAULT_MIN_DIAMETER_KM,
    LUNAR_CRATER_DIAMETER_STEP_KM,
    LUNAR_CRATER_DISPLAY_MODE_ALWAYS,
    LUNAR_CRATER_DISPLAY_MODE_HOVER,
    LUNAR_CRATER_RANGE_MAX_DIAMETER_KM,
    LUNAR_CRATER_RANGE_MIN_DIAMETER_KM,
    createDefaultLunarCraterViewState,
    normalizeLunarCraterDiameterRange,
    normalizeLunarCraterDisplayMode,
} from "../core/domain/lunar-crater-view.js";
import {
    DEFAULT_LUNAR_FEATURE_TYPES,
    createDefaultLunarFeatureViewState,
    LUNAR_FEATURE_PRESET_IDS,
    normalizeLunarFeatureKeyList,
    normalizeLunarFeatureViewState,
    normalizeLunarFeatureTypeFilters,
} from "../core/domain/lunar-feature-view.js";
import {
    countCraterDisplayFeatures,
    getCraterDisplayFeatures,
    getLunarFeatureKey,
} from "../core/domain/lunar-crater-catalog.js";
import { getLunarFeatureTypeColor } from "../core/domain/lunar-feature-colors.js";
import {
    getLoadedLunarFeatureCatalog,
    loadLunarFeatureCatalog,
} from "../data/lunar-feature-catalog.js";

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
const lunarCraterCatalogConsumers = new Set();

function getLunarCraterCatalog() {
    return lunarCraterCatalog || getLoadedLunarFeatureCatalog() || EMPTY_LUNAR_CRATER_CATALOG;
}

function hasLunarCraterCatalog() {
    return Array.isArray(getLunarCraterCatalog()?.features) &&
        getLunarCraterCatalog().features.length > 0;
}

function requestLunarCraterCatalog(elements = {}) {
    if (elements?.panel) {
        lunarCraterCatalogConsumers.add(elements);
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
            for (const consumerElements of Array.from(lunarCraterCatalogConsumers)) {
                if (consumerElements?.panel?.isConnected === false) {
                    lunarCraterCatalogConsumers.delete(consumerElements);
                    continue;
                }
                resetLunarCraterCatalogControls(consumerElements);
                syncLunarCraterControlPanel(consumerElements);
            }
        })
        .catch((error) => {
            lunarCraterCatalogLoading = false;
            lunarCraterCatalogError = error;
            for (const consumerElements of Array.from(lunarCraterCatalogConsumers)) {
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

function getActiveFilterScope(elements = {}) {
    return normalizeFilterScope(elements.panel?.dataset?.filterScope);
}

function setActiveFilterScope(elements = {}, scope) {
    if (elements.panel?.dataset) {
        elements.panel.dataset.filterScope = normalizeFilterScope(scope);
    }
}

function getStoredControlState(elements = {}) {
    return normalizeLunarFeatureViewState(
        elements.panel?.__lunarCraterControlState || createDefaultLunarFeatureViewState(),
    );
}

function setStoredControlState(elements = {}, state = {}) {
    if (elements.panel) {
        elements.panel.__lunarCraterControlState = normalizeLunarFeatureViewState(state);
    }
}

function removePanelChild(element) {
    element?.parentNode?.removeChild?.(element);
}

function appendPanelChild(panel, element) {
    if (!panel || !element) return;
    panel.appendChild?.(element);
}

function cacheLunarCraterPanelNodes(elements = {}) {
    const panel = elements.panel;
    if (!panel) return;
    if (!panel.__lunarCraterDetachedNodes) {
        panel.__lunarCraterDetachedNodes = {};
    }
    const cache = panel.__lunarCraterDetachedNodes;
    for (const key of [
        "presetContainer",
        "searchWrap",
        "searchInput",
        "searchResultsContainer",
        "typeFilterContainer",
        "rangeLabel",
        "rangeStack",
        "scale",
        "statusRow",
        "nudge",
        "syncedControlsContainer",
    ]) {
        if (elements[key]) {
            cache[key] = elements[key];
        }
    }
    if (!cache.searchInput && cache.searchWrap) {
        cache.searchInput = cache.searchWrap.querySelector?.(".lunar-crater-controls-panel__search-input") || null;
    }
}

function syncLunarCraterTabBody(elements = {}, scope = LUNAR_CRATER_FILTER_SCOPE_SHOW_ALL) {
    const panel = elements.panel;
    if (!panel) return;
    const tabPanel = elements.tabPanelBody || panel;
    cacheLunarCraterPanelNodes(elements);
    const normalizedScope = normalizeFilterScope(scope);
    const isSearchScope = normalizedScope === LUNAR_CRATER_FILTER_SCOPE_SEARCH;
    const isSyncedScope = normalizedScope === LUNAR_CRATER_FILTER_SCOPE_SYNCED;
    if (isSearchScope) {
        const alreadyMounted = elements.searchWrap?.parentNode === tabPanel &&
            elements.searchResultsContainer?.parentNode === tabPanel &&
            elements.presetContainer?.parentNode !== tabPanel &&
            elements.rangeLabel?.parentNode !== tabPanel &&
            elements.typeFilterContainer?.parentNode !== tabPanel &&
            elements.syncedControlsContainer?.parentNode !== tabPanel;
        if (alreadyMounted) {
            return;
        }
    } else if (isSyncedScope) {
        const alreadyMounted = elements.syncedControlsContainer?.parentNode === tabPanel &&
            elements.searchWrap?.parentNode !== tabPanel &&
            elements.searchResultsContainer?.parentNode !== tabPanel &&
            elements.presetContainer?.parentNode !== tabPanel &&
            elements.rangeLabel?.parentNode !== tabPanel &&
            elements.typeFilterContainer?.parentNode !== tabPanel;
        if (alreadyMounted) {
            return;
        }
    } else {
        const alreadyMounted = elements.presetContainer?.parentNode === tabPanel &&
            elements.rangeLabel?.parentNode === tabPanel &&
            elements.typeFilterContainer?.parentNode === tabPanel &&
            elements.searchWrap?.parentNode !== tabPanel &&
            elements.searchResultsContainer?.parentNode !== tabPanel;
        if (alreadyMounted) {
            return;
        }
    }
    const filterElements = [
        elements.presetContainer,
        elements.rangeLabel,
        elements.rangeStack,
        elements.scale,
        elements.typeFilterContainer,
        elements.statusRow,
        elements.nudge,
    ];
    const searchElements = [
        elements.searchWrap,
        elements.searchResultsContainer,
    ];
    const syncedElements = [
        elements.syncedControlsContainer,
    ];
    if (isSearchScope || isSyncedScope) {
        for (const element of filterElements) {
            removePanelChild(element);
        }
        for (const element of isSearchScope ? syncedElements : searchElements) {
            removePanelChild(element);
        }
        if (isSearchScope) {
            appendPanelChild(tabPanel, elements.searchWrap);
            appendPanelChild(tabPanel, elements.searchResultsContainer);
        } else {
            appendPanelChild(tabPanel, elements.syncedControlsContainer);
        }
        return;
    }
    for (const element of [...searchElements, ...syncedElements]) {
        removePanelChild(element);
    }
    for (const element of filterElements) {
        appendPanelChild(tabPanel, element);
    }
}

function getScopedFilterState(state = {}, scope = LUNAR_CRATER_FILTER_SCOPE_SHOW_ALL) {
    const normalized = normalizeLunarFeatureViewState(state);
    const normalizedScope = normalizeFilterScope(scope);
    if (normalizedScope === LUNAR_CRATER_FILTER_SCOPE_SEARCH) {
        return {
            lunarCraterMinDiameterKm: LUNAR_CRATER_RANGE_MIN_DIAMETER_KM,
            lunarCraterMaxDiameterKm: TYPE_FILTER_DEFAULT_MAX_KM,
            lunarFeatureTypeFilters: normalizeLunarFeatureTypeFilters({}, {}),
            lunarFeatureSearchQuery: normalized.lunarFeatureSearchQuery,
            lunarFeatureExcludedKeys: normalized.lunarFeatureExcludedKeys,
        };
    }
    if (normalizedScope === LUNAR_CRATER_FILTER_SCOPE_SYNCED) {
        return {
            lunarCraterMinDiameterKm: normalized.lunarCraterMinDiameterKm,
            lunarCraterMaxDiameterKm: normalized.lunarCraterMaxDiameterKm,
            lunarFeatureTypeFilters: normalized.lunarFeatureTypeFilters,
            lunarFeatureSearchQuery: "",
            lunarFeatureExcludedKeys: [],
        };
    }
    if (normalizedScope === LUNAR_CRATER_FILTER_SCOPE_HOVER) {
        return {
            lunarCraterMinDiameterKm: normalized.lunarCraterHoverMinDiameterKm,
            lunarCraterMaxDiameterKm: normalized.lunarCraterHoverMaxDiameterKm,
            lunarFeatureTypeFilters: normalized.lunarFeatureHoverTypeFilters,
            lunarFeatureSearchQuery: "",
            lunarFeatureExcludedKeys: [],
        };
    }
    return {
        lunarCraterMinDiameterKm: normalized.lunarCraterMinDiameterKm,
        lunarCraterMaxDiameterKm: normalized.lunarCraterMaxDiameterKm,
        lunarFeatureTypeFilters: normalized.lunarFeatureTypeFilters,
        lunarFeatureSearchQuery: "",
        lunarFeatureExcludedKeys: [],
    };
}

function buildScopedFilterPatch(scope, filterState = {}) {
    const has = (key) => Object.prototype.hasOwnProperty.call(filterState, key);
    const normalizedScope = normalizeFilterScope(scope);
    if (normalizedScope === LUNAR_CRATER_FILTER_SCOPE_SEARCH) {
        const patch = {};
        if (has("lunarFeatureSearchQuery")) patch.lunarFeatureSearchQuery = filterState.lunarFeatureSearchQuery;
        if (has("lunarFeatureExcludedKeys")) patch.lunarFeatureExcludedKeys = filterState.lunarFeatureExcludedKeys;
        return patch;
    }
    if (normalizedScope === LUNAR_CRATER_FILTER_SCOPE_SYNCED) {
        return {};
    }
    if (normalizedScope === LUNAR_CRATER_FILTER_SCOPE_HOVER) {
        const patch = {};
        if (has("lunarCraterMinDiameterKm")) patch.lunarCraterHoverMinDiameterKm = filterState.lunarCraterMinDiameterKm;
        if (has("lunarCraterMaxDiameterKm")) patch.lunarCraterHoverMaxDiameterKm = filterState.lunarCraterMaxDiameterKm;
        if (has("lunarFeatureTypeFilters")) patch.lunarFeatureHoverTypeFilters = filterState.lunarFeatureTypeFilters;
        return patch;
    }
    const patch = {};
    if (has("lunarCraterMinDiameterKm")) patch.lunarCraterMinDiameterKm = filterState.lunarCraterMinDiameterKm;
    if (has("lunarCraterMaxDiameterKm")) patch.lunarCraterMaxDiameterKm = filterState.lunarCraterMaxDiameterKm;
    if (has("lunarFeatureTypeFilters")) patch.lunarFeatureTypeFilters = filterState.lunarFeatureTypeFilters;
    return patch;
}

function readScopedFilterFromControls(elements = {}, fallbackState = {}) {
    return {
        lunarCraterMinDiameterKm: readNumericControlValue(
            elements.minDiameterSlider,
            fallbackState.lunarCraterMinDiameterKm,
        ),
        lunarCraterMaxDiameterKm: readNumericControlValue(
            elements.maxDiameterSlider,
            fallbackState.lunarCraterMaxDiameterKm,
        ),
        lunarFeatureTypeFilters: readTypeFiltersFromControls(elements, fallbackState.lunarFeatureTypeFilters),
        lunarFeatureSearchQuery: elements.searchInput?.value || "",
        lunarFeatureExcludedKeys: normalizeLunarFeatureKeyList(
            elements.searchResultsContainer?.dataset?.excludedKeys
                ? elements.searchResultsContainer.dataset.excludedKeys.split("\n")
                : fallbackState.lunarFeatureExcludedKeys,
        ),
    };
}

function getPanelCountState(elements = {}, state = {}) {
    return normalizeLunarFeatureViewState({
        ...state,
        ...getScopedFilterState(state, getActiveFilterScope(elements)),
    });
}

function getFilteredCraterCount(state) {
    return countCraterDisplayFeatures(getLunarCraterCatalog(), normalizeLunarFeatureViewState(state));
}

function setLunarCraterControlPending(elements = {}, pending) {
    elements.panel?.classList?.toggle?.("is-busy", pending === true);
    elements.panel?.setAttribute?.("aria-busy", pending === true ? "true" : "false");
    if (elements.busyIndicator) {
        elements.busyIndicator.hidden = pending !== true;
    }
}

function syncLunarCraterCountStatus(elements = {}, state = {}) {
    if (!hasLunarCraterCatalog()) {
        syncLunarCraterCatalogStatus(elements);
        if (elements.nudge) {
            elements.nudge.textContent = lunarCraterCatalogLoading
                ? "Loading lunar feature catalog."
                : lunarCraterCatalogError
                    ? "Lunar feature catalog could not be loaded."
                    : "Open Lunar Features to load the catalog.";
            elements.nudge.hidden = false;
        }
        return;
    }
    const normalized = normalizeLunarFeatureViewState(state);
    const panelCountState = getPanelCountState(elements, normalized);
    const filteredCount = getFilteredCraterCount(panelCountState);
    if (elements.countValue) {
        elements.countValue.textContent = `${formatCraterCount(filteredCount)} filtered`;
    }
    if (!elements.nudge) {
        return;
    }
    let message = "";
    if (normalized.lunarCraterShowAllEnabled !== true && normalized.lunarCraterHoverEnabled !== true) {
        message = "Filters ready. Choose Recommended or All to enable Show Always or Hover.";
    } else
    if (
        normalized.lunarCraterShowAllEnabled === true &&
        filteredCount > CRATER_DENSE_SELECTION_COUNT &&
        getActiveFilterScope(elements) === LUNAR_CRATER_FILTER_SCOPE_SHOW_ALL
    ) {
        message = "Showing the visible subset. Zoom in for more detail, or switch to hover mode.";
    } else if (
        normalized.lunarCraterHoverEnabled === true &&
        filteredCount > CRATER_DENSE_SELECTION_COUNT &&
        getActiveFilterScope(elements) === LUNAR_CRATER_FILTER_SCOPE_HOVER
    ) {
        message = "Dense range. Hover to inspect individual craters.";
    }
    elements.nudge.textContent = message;
    elements.nudge.hidden = !message;
}

function getSearchResultFeatures(state = {}) {
    const normalized = normalizeLunarFeatureViewState(state);
    if (!normalized.lunarFeatureSearchQuery) {
        return [];
    }
    return getCraterDisplayFeatures(getLunarCraterCatalog(), {
        ...normalized,
        lunarFeatureExcludedKeys: [],
    }).slice(0, SEARCH_RESULT_LIMIT);
}

function formatSearchResultMeta(feature = {}) {
    const typeLabel = formatFeatureTypeLabel(feature.featureType);
    const diameterKm = Number(feature.diameterKm);
    return Number.isFinite(diameterKm)
        ? `${typeLabel} - ${formatDiameterKm(diameterKm)} km`
        : typeLabel;
}

function syncLunarFeatureSearchResults(elements = {}, state = {}) {
    const container = elements.searchResultsContainer;
    if (!container) return;
    if (!hasLunarCraterCatalog()) {
        while (container.firstChild) {
            container.removeChild(container.firstChild);
        }
        container.hidden = true;
        return;
    }

    const normalized = getPanelCountState(elements, state);
    const query = normalized.lunarFeatureSearchQuery;
    const excludedKeys = new Set(normalized.lunarFeatureExcludedKeys);
    while (container.firstChild) {
        container.removeChild(container.firstChild);
    }
    if (!query) {
        container.hidden = true;
        return;
    }

    const features = getSearchResultFeatures(normalized);
    const totalCount = countCraterDisplayFeatures(getLunarCraterCatalog(), {
        ...normalized,
        lunarFeatureExcludedKeys: [],
    });
    container.hidden = false;

    const documentRef = container.ownerDocument || document;
    const header = documentRef.createElement("div");
    header.className = "lunar-crater-controls-panel__search-results-header";
    const title = documentRef.createElement("span");
    title.textContent = "Results";
    const count = documentRef.createElement("span");
    count.textContent = `${formatCraterCount(totalCount)} found`;
    header.appendChild(title);
    header.appendChild(count);
    container.appendChild(header);

    const list = documentRef.createElement("div");
    list.className = "lunar-crater-controls-panel__search-results-list";
    if (features.length === 0) {
        const empty = documentRef.createElement("div");
        empty.className = "lunar-crater-controls-panel__search-results-empty";
        empty.textContent = "No results";
        list.appendChild(empty);
    }
    for (const feature of features) {
        const key = getLunarFeatureKey(feature);
        const row = documentRef.createElement("label");
        row.className = "lunar-crater-controls-panel__search-result";
        row.dataset.featureKey = key;

        const checkbox = documentRef.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "lunar-crater-controls-panel__search-result-check";
        checkbox.checked = !excludedKeys.has(key);
        checkbox.dataset.featureKey = key;

        const swatch = documentRef.createElement("span");
        swatch.className = "lunar-crater-controls-panel__type-swatch";
        swatch.style?.setProperty?.("--lunar-feature-type-color", getLunarFeatureTypeColor(feature.featureType));
        swatch.setAttribute("aria-hidden", "true");

        const text = documentRef.createElement("span");
        text.className = "lunar-crater-controls-panel__search-result-text";
        const name = documentRef.createElement("span");
        name.className = "lunar-crater-controls-panel__search-result-name";
        name.textContent = feature.name || feature.cleanName || "";
        const meta = documentRef.createElement("span");
        meta.className = "lunar-crater-controls-panel__search-result-meta";
        meta.textContent = formatSearchResultMeta(feature);
        text.appendChild(name);
        text.appendChild(meta);

        row.appendChild(checkbox);
        row.appendChild(swatch);
        row.appendChild(text);
        list.appendChild(row);
    }
    if (totalCount > features.length) {
        const overflow = documentRef.createElement("div");
        overflow.className = "lunar-crater-controls-panel__search-results-overflow";
        overflow.textContent = `${formatCraterCount(totalCount - features.length)} more`;
        list.appendChild(overflow);
    }
    container.appendChild(list);
}

function rehydrateTypeFilterControls(elements = {}, { panel, container, presetContainer } = {}) {
    if (!panel || !container) {
        return false;
    }
    const typeControls = new Map();
    const presetButtons = new Map();
    const statsByType = new Map(getOrderedCatalogTypeStats().map((entry) => [entry.featureType, entry]));

    if (presetContainer) {
        const presetButtonNodes = presetContainer.querySelectorAll?.("[data-preset-id]");
        for (const button of presetButtonNodes || []) {
            const presetId = `${button?.dataset?.presetId || ""}`;
            if (!presetId) continue;
            presetButtons.set(presetId, button);
        }
    }

    const rowNodes = container.querySelectorAll?.(".lunar-crater-controls-panel__type-row");
    for (const row of rowNodes || []) {
        const featureType = `${row?.dataset?.featureType || ""}`;
        if (!featureType) continue;
        const toggle = row.querySelector?.(".lunar-crater-controls-panel__type-toggle") || null;
        const dualRange = row.querySelector?.(".lunar-crater-controls-panel__dual-range") || null;
        const dualRangeFill = row.querySelector?.(".lunar-crater-controls-panel__dual-range-fill") || null;
        const minSlider = row.querySelector?.(".lunar-crater-controls-panel__type-slider--min") || null;
        const maxSlider = row.querySelector?.(".lunar-crater-controls-panel__type-slider--max") || null;
        const rangeValue = row.querySelector?.(".lunar-crater-controls-panel__type-range-value") || null;
        typeControls.set(featureType, {
            row,
            toggle,
            dualRange,
            dualRangeFill,
            minSlider,
            maxSlider,
            rangeValue,
            minExplicit: row?.dataset?.typeMinExplicit === "true",
            maxExplicit: row?.dataset?.typeMaxExplicit === "true",
            stats: statsByType.get(featureType) || null,
        });
    }

    elements.typeControls = typeControls;
    elements.presetButtons = presetButtons;
    return typeControls.size > 0;
}

function getLunarFeatureGroupEntries(container) {
    const groups = container?.querySelectorAll?.(".lunar-crater-controls-panel__type-group") || [];
    const tabsById = new Map(
        Array.from(container?.querySelectorAll?.(".lunar-crater-controls-panel__type-group-tab") || [])
            .map((groupTab) => [`${groupTab?.dataset?.groupId || ""}`, groupTab]),
    );
    return Array.from(groups).map((groupContainer) => {
        const groupId = `${groupContainer?.dataset?.groupId || ""}`;
        return {
            groupContainer,
            groupTab: tabsById.get(groupId) || null,
            groupRows: groupContainer.querySelector?.(".lunar-crater-controls-panel__type-group-rows") || null,
        };
    }).filter((entry) => entry.groupTab && entry.groupRows);
}

function setActiveLunarFeatureGroup(container, targetId = null) {
    for (const entry of getLunarFeatureGroupEntries(container)) {
        const groupId = `${entry.groupContainer?.dataset?.groupId || ""}`;
        const active = Boolean(targetId && groupId === targetId);
        entry.groupContainer.dataset.active = active ? "true" : "false";
        entry.groupRows.hidden = !active;
        entry.groupTab.setAttribute("aria-selected", active ? "true" : "false");
        entry.groupTab.setAttribute("tabindex", active ? "0" : "-1");
    }
}

function bindLunarFeatureGroupTabs(container, { openFirst = false } = {}) {
    if (!container) return;
    const entries = getLunarFeatureGroupEntries(container);
    const hasActiveGroup = entries.some((entry) => entry.groupContainer?.dataset?.active === "true");
    if ((openFirst || !hasActiveGroup) && entries.length > 0) {
        const firstGroupId = `${entries[0].groupContainer?.dataset?.groupId || ""}`;
        setActiveLunarFeatureGroup(container, firstGroupId || null);
    }
    if (container.dataset.lunarFeatureTabsBound === "true") {
        return;
    }
    container.addEventListener("click", (event) => {
        const tab = event.target?.closest?.(".lunar-crater-controls-panel__type-group-tab");
        if (!tab || !container.contains(tab)) return;
        setActiveLunarFeatureGroup(container, `${tab?.dataset?.groupId || ""}` || null);
    });
    container.addEventListener("keydown", (event) => {
        const tab = event.target?.closest?.(".lunar-crater-controls-panel__type-group-tab");
        if (!tab || !container.contains(tab)) return;
        const tabs = Array.from(container.querySelectorAll?.(".lunar-crater-controls-panel__type-group-tab") || []);
        const currentIndex = tabs.indexOf(tab);
        if (currentIndex < 0) return;
        let nextIndex = currentIndex;
        if (event.key === "ArrowRight" || event.key === "ArrowDown") {
            nextIndex = (currentIndex + 1) % tabs.length;
        } else
        if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
            nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        } else {
            return;
        }
        event.preventDefault();
        const nextTab = tabs[nextIndex];
        setActiveLunarFeatureGroup(container, `${nextTab?.dataset?.groupId || ""}` || null);
        nextTab?.focus?.();
    });
    container.dataset.lunarFeatureTabsBound = "true";
}

function ensureTypeFilterControls(elements = {}) {
    const panel = elements.panel;
    if (!panel || typeof panel.querySelector !== "function") {
        return;
    }
    if (!hasLunarCraterCatalog()) {
        syncLunarCraterCatalogStatus(elements);
        if (panel.hidden === false) {
            requestLunarCraterCatalog(elements);
        }
        return;
    }
    let container = elements.typeFilterContainer;
    if (!container) {
        container = panel.querySelector(".lunar-crater-controls-panel__type-filters");
        elements.typeFilterContainer = container || null;
    }
    if (!container) {
        return;
    }
    let presetContainer = elements.presetContainer;
    if (!presetContainer) {
        presetContainer = panel.querySelector(".lunar-crater-controls-panel__presets");
        elements.presetContainer = presetContainer || null;
    }
    if (container.dataset.lunarFeatureTypesBuilt === "true") {
        rehydrateTypeFilterControls(elements, { panel, container, presetContainer });
        bindLunarFeatureGroupTabs(container);
        return;
    }
    while (presetContainer?.firstChild) {
        presetContainer.removeChild(presetContainer.firstChild);
    }
    while (container.firstChild) {
        container.removeChild(container.firstChild);
    }

    const typeControls = new Map();
    const presetButtons = new Map();
    for (const preset of LUNAR_FEATURE_PRESETS) {
        const button = panel.ownerDocument?.createElement?.("button")
            || document.createElement("button");
        button.type = "button";
        button.className = "lunar-crater-controls-panel__preset";
        button.dataset.presetId = preset.id;
        button.textContent = preset.label;
        button.title = preset.title;
        presetContainer?.appendChild(button);
        presetButtons.set(preset.id, button);
    }

    const orderedCatalogTypeStats = getOrderedCatalogTypeStats();
    const statsByType = new Map(orderedCatalogTypeStats.map((entry) => [entry.featureType, entry]));
    const groupedStats = FEATURE_TYPE_GROUPS.map((group) => ({
        ...group,
        stats: group.types
            .map((featureType) => statsByType.get(featureType))
            .filter(Boolean),
    }));
    const groupedFeatureTypes = new Set(FEATURE_TYPE_GROUPS.flatMap((group) => group.types));
    const ungroupedStats = orderedCatalogTypeStats.filter(
        (entry) => !groupedFeatureTypes.has(entry.featureType),
    );
    if (ungroupedStats.length > 0) {
        groupedStats.push({
            id: "other",
            label: "Other Features",
            types: ungroupedStats.map((entry) => entry.featureType),
            stats: ungroupedStats,
        });
    }

    const groupTabs = panel.ownerDocument?.createElement?.("div")
        || document.createElement("div");
    groupTabs.className = "lunar-crater-controls-panel__type-group-tabs";
    groupTabs.setAttribute("role", "tablist");
    groupTabs.setAttribute("aria-label", "Feature type groups");
    container.appendChild(groupTabs);

    for (const group of groupedStats) {
        if (!Array.isArray(group.stats) || group.stats.length === 0) {
            continue;
        }
        const groupId = `${group.id || ""}`;
        const groupControlIdPrefix = `${container.id || "lunar-feature-type-filters"}-${groupId}`;
        const groupTab = panel.ownerDocument?.createElement?.("button")
            || document.createElement("button");
        groupTab.id = `${groupControlIdPrefix}-tab`;
        groupTab.type = "button";
        groupTab.className = "lunar-crater-controls-panel__type-group-tab";
        groupTab.dataset.groupId = groupId;
        groupTab.setAttribute("role", "tab");
        groupTab.setAttribute("aria-controls", `${groupControlIdPrefix}-panel`);
        groupTab.setAttribute("aria-selected", "false");
        groupTab.setAttribute("tabindex", "-1");
        groupTab.textContent = group.label || "";
        groupTabs.appendChild(groupTab);

        const groupContainer = panel.ownerDocument?.createElement?.("section")
            || document.createElement("section");
        groupContainer.id = `${groupControlIdPrefix}-panel`;
        groupContainer.className = "lunar-crater-controls-panel__type-group";
        groupContainer.dataset.groupId = groupId;
        groupContainer.setAttribute("role", "tabpanel");
        groupContainer.setAttribute("aria-labelledby", groupTab.id);

        const groupRows = panel.ownerDocument?.createElement?.("div")
            || document.createElement("div");
        groupRows.className = "lunar-crater-controls-panel__type-group-rows";
        groupRows.hidden = true;

        for (const stats of group.stats) {
            const row = panel.ownerDocument?.createElement?.("div")
                || document.createElement("div");
            row.className = "lunar-crater-controls-panel__type-row";
            row.dataset.featureType = stats.featureType;

            const toggle = panel.ownerDocument?.createElement?.("input")
                || document.createElement("input");
            toggle.type = "checkbox";
            toggle.className = "lunar-crater-controls-panel__type-toggle";
            const featureColor = getLunarFeatureTypeColor(stats.featureType);
            if (toggle.style) {
                toggle.style.accentColor = featureColor;
            }

            const swatch = panel.ownerDocument?.createElement?.("span")
                || document.createElement("span");
            swatch.className = "lunar-crater-controls-panel__type-swatch";
            swatch.style?.setProperty?.("--lunar-feature-type-color", featureColor);
            swatch.setAttribute("aria-hidden", "true");

            const label = panel.ownerDocument?.createElement?.("label")
                || document.createElement("label");
            label.className = "lunar-crater-controls-panel__type-label";
            label.textContent = `${formatFeatureTypeLabel(stats.featureType)} (${formatCraterCount(stats.count)})`;

            const range = panel.ownerDocument?.createElement?.("div")
                || document.createElement("div");
            range.className = "lunar-crater-controls-panel__type-range";
            const rangeValue = panel.ownerDocument?.createElement?.("span")
                || document.createElement("span");
            rangeValue.className = "lunar-crater-controls-panel__type-range-value";
            rangeValue.textContent = formatTypeRangeValue(null, null);

            const rangeStack = panel.ownerDocument?.createElement?.("div")
                || document.createElement("div");
            rangeStack.className = "lunar-crater-controls-panel__type-range-stack";

            const createTypeSlider = (className, labelText, sliderMax) => {
                const slider = panel.ownerDocument?.createElement?.("input")
                    || document.createElement("input");
                slider.type = "range";
                slider.className = `lunar-crater-controls-panel__range ${className}`;
                slider.step = String(LUNAR_CRATER_DIAMETER_STEP_KM);
                slider.min = String(TYPE_FILTER_DEFAULT_MIN_KM);
                slider.max = String(sliderMax);
                slider.value = String(TYPE_FILTER_DEFAULT_MIN_KM);
                slider.setAttribute("aria-label", labelText);
                return slider;
            };

            const sliderMax = resolveTypeSliderMax(stats);
            const dualRange = panel.ownerDocument?.createElement?.("div")
                || document.createElement("div");
            dualRange.className = "lunar-crater-controls-panel__dual-range";
            const dualRangeFill = panel.ownerDocument?.createElement?.("span")
                || document.createElement("span");
            dualRangeFill.className = "lunar-crater-controls-panel__dual-range-fill";

            const minSlider = createTypeSlider(
                "lunar-crater-controls-panel__type-slider--min",
                `${formatFeatureTypeLabel(stats.featureType)} minimum diameter`,
                sliderMax,
            );
            const maxSlider = createTypeSlider(
                "lunar-crater-controls-panel__type-slider--max",
                `${formatFeatureTypeLabel(stats.featureType)} maximum diameter`,
                sliderMax,
            );
            maxSlider.value = String(sliderMax);
            dualRange.appendChild(dualRangeFill);
            dualRange.appendChild(minSlider);
            dualRange.appendChild(maxSlider);
            rangeStack.appendChild(dualRange);
            range.appendChild(rangeValue);
            range.appendChild(rangeStack);

            row.appendChild(toggle);
            row.appendChild(swatch);
            row.appendChild(label);
            row.appendChild(range);
            groupRows.appendChild(row);

            typeControls.set(stats.featureType, {
                row,
                toggle,
                swatch,
                dualRange,
                dualRangeFill,
                minSlider,
                maxSlider,
                rangeValue,
                minExplicit: false,
                maxExplicit: false,
                stats,
            });
        }
        groupContainer.appendChild(groupRows);
        container.appendChild(groupContainer);
    }
    bindLunarFeatureGroupTabs(container, { openFirst: true });

    elements.typeControls = typeControls;
    elements.presetButtons = presetButtons;
    container.dataset.lunarFeatureTypesBuilt = "true";
    writeTypeFiltersToControls(
        elements,
        createDefaultLunarFeatureViewState().lunarFeatureTypeFilters,
    );
}

function readTypeFiltersFromControls(elements = {}, fallback = {}) {
    ensureTypeFilterControls(elements);
    const normalizedFallback = normalizeLunarFeatureTypeFilters(fallback);
    const currentGlobal = readGlobalDiameterRangeFromElements(elements);
    if (!(elements.typeControls instanceof Map) || !elements.typeControls.size) {
        return normalizedFallback;
    }
    const next = {};
    for (const [featureType, controls] of elements.typeControls.entries()) {
        const fallbackEntry = normalizedFallback[featureType] || {};
        const sliderMax = readSliderBound(
            controls.maxSlider || controls.minSlider,
            "max",
            resolveTypeSliderMax(controls.stats),
        );
        const minFromSlider = readTypeSliderValue(
            controls.minSlider,
            currentGlobal.lunarCraterMinDiameterKm,
            {
                minBound: TYPE_FILTER_DEFAULT_MIN_KM,
                maxBound: sliderMax,
            },
        );
        const maxFromSlider = readTypeSliderValue(
            controls.maxSlider,
            currentGlobal.lunarCraterMaxDiameterKm,
            {
                minBound: TYPE_FILTER_DEFAULT_MIN_KM,
                maxBound: sliderMax,
            },
        );
        const minDiameterKm = controls.minExplicit === true
            ? minFromSlider
            : fallbackEntry.minDiameterKm ?? null;
        const maxDiameterKm = controls.maxExplicit === true
            ? maxFromSlider
            : fallbackEntry.maxDiameterKm ?? null;
        next[featureType] = {
            enabled: controls.toggle?.checked !== false,
            minDiameterKm,
            maxDiameterKm,
        };
    }
    return normalizeLunarFeatureTypeFilters(next, normalizedFallback);
}

function writeTypeFiltersToControls(elements = {}, typeFilters = {}) {
    ensureTypeFilterControls(elements);
    if (!(elements.typeControls instanceof Map) || !elements.typeControls.size) {
        return;
    }
    const normalized = normalizeLunarFeatureTypeFilters(typeFilters);
    const globalState = readGlobalDiameterRangeFromElements(elements);
    for (const [featureType, controls] of elements.typeControls.entries()) {
        const entry = normalized[featureType] || {};
        const sliderMax = resolveTypeSliderMax(controls.stats);
        const effectiveMin = Number.isFinite(entry.minDiameterKm)
            ? Math.max(TYPE_FILTER_DEFAULT_MIN_KM, Math.min(sliderMax, entry.minDiameterKm))
            : globalState.lunarCraterMinDiameterKm;
        const effectiveMax = Number.isFinite(entry.maxDiameterKm)
            ? Math.max(TYPE_FILTER_DEFAULT_MIN_KM, Math.min(sliderMax, entry.maxDiameterKm))
            : globalState.lunarCraterMaxDiameterKm;
        const boundedMin = Math.min(effectiveMin, effectiveMax);
        const boundedMax = Math.max(effectiveMin, effectiveMax);
        if (controls.toggle) {
            controls.toggle.checked = entry.enabled !== false;
        }
        if (controls.minSlider) {
            controls.minSlider.min = String(TYPE_FILTER_DEFAULT_MIN_KM);
            controls.minSlider.max = String(sliderMax);
            controls.minSlider.value = String(boundedMin);
        }
        if (controls.maxSlider) {
            controls.maxSlider.min = String(TYPE_FILTER_DEFAULT_MIN_KM);
            controls.maxSlider.max = String(sliderMax);
            controls.maxSlider.value = String(boundedMax);
        }
        controls.minExplicit = Number.isFinite(entry.minDiameterKm);
        controls.maxExplicit = Number.isFinite(entry.maxDiameterKm);
        if (controls.row) {
            controls.row.dataset.typeMinExplicit = controls.minExplicit ? "true" : "false";
            controls.row.dataset.typeMaxExplicit = controls.maxExplicit ? "true" : "false";
        }
        syncTypeRangeValueText(controls, boundedMin, boundedMax);
        syncDualRangeFill(controls.dualRangeFill, controls.minSlider, controls.maxSlider);
    }
}

export function getLunarCraterControlPanelElements(documentRef, {
    idPrefix = "lunar-crater",
    pillId = null,
    visibleInputId = null,
} = {}) {
    const getElement = (id) => documentRef?.getElementById?.(id) || null;
    const panel = getElement(`${idPrefix}-controls-panel`);
    const getPanelElement = (key, id) => getElement(id) ||
        panel?.__lunarCraterDetachedNodes?.[key] ||
        null;
    const countValue = getPanelElement("countValue", `${idPrefix}-count-value`);
    const searchWrap = getPanelElement("searchWrap", `${idPrefix}-search-wrap`);
    return {
        idPrefix,
        pill: pillId ? getElement(pillId) : null,
        panel,
        tabPanelBody: getPanelElement("tabPanelBody", `${idPrefix}-tab-panel`),
        closeButton: getElement(`${idPrefix}-close`),
        presetContainer: getPanelElement("presetContainer", `${idPrefix}-presets`),
        searchInput: getElement(`${idPrefix}-search`) ||
            panel?.__lunarCraterDetachedNodes?.searchInput ||
            searchWrap?.querySelector?.(`#${idPrefix}-search`) ||
            searchWrap?.querySelector?.(".lunar-crater-controls-panel__search-input") ||
            null,
        searchResultsContainer: getPanelElement("searchResultsContainer", `${idPrefix}-search-results`),
        searchWrap,
        typeFilterContainer: getPanelElement("typeFilterContainer", `${idPrefix}-type-filters`),
        visibleInput: getElement(visibleInputId || `${idPrefix}-visible`) ||
            (idPrefix === "lunar-crater" ? getElement("view-lunar-craters") : null),
        showAllInput: getElement(`${idPrefix}-show-all-enabled`),
        sitesInput: idPrefix === "lunar-crater" ? getElement("view-craters") : null,
        sitesToggle: getElement(`${idPrefix}-sites-toggle`),
        hoverInput: getElement(`${idPrefix}-hover-labels`),
        modeInput: getElement(`${idPrefix}-display-mode`),
        offToggle: getElement(`${idPrefix}-off-toggle`),
        visibleToggle: getElement(`${idPrefix}-visible-toggle`),
        hoverToggle: getElement(`${idPrefix}-hover-toggle`),
        showAllOffToggle: getElement(`${idPrefix}-show-all-off-toggle`),
        showAllFilterToggle: getElement(`${idPrefix}-show-all-filter-toggle`),
        hoverOffToggle: getElement(`${idPrefix}-hover-off-toggle`),
        hoverFilterToggle: getElement(`${idPrefix}-hover-filter-toggle`),
        filterScopeShowAll: getElement(`${idPrefix}-filter-scope-show-all`),
        filterScopeHover: getElement(`${idPrefix}-filter-scope-hover`),
        filterScopeSynced: getElement(`${idPrefix}-filter-scope-synced`),
        filterScopeSearch: getElement(`${idPrefix}-filter-scope-search`),
        syncedControlsContainer: getPanelElement("syncedControlsContainer", `${idPrefix}-synced-controls`),
        minDiameterSlider: getElement(`${idPrefix}-min-diameter`),
        minDiameterStepDown: getElement(`${idPrefix}-min-diameter-step-down`),
        minDiameterStepUp: getElement(`${idPrefix}-min-diameter-step-up`),
        maxDiameterSlider: getElement(`${idPrefix}-max-diameter`),
        maxDiameterStepDown: getElement(`${idPrefix}-max-diameter-step-down`),
        maxDiameterStepUp: getElement(`${idPrefix}-max-diameter-step-up`),
        globalRangeFill: getPanelElement("rangeStack", `${idPrefix}-range-stack`)?.querySelector?.(`#${idPrefix}-global-range-fill`) ||
            getElement(`${idPrefix}-global-range-fill`),
        rangeLabel: getPanelElement("rangeLabel", `${idPrefix}-range-label`),
        rangeStack: getPanelElement("rangeStack", `${idPrefix}-range-stack`),
        scale: getPanelElement("scale", `${idPrefix}-scale`),
        diameterValue: getElement(`${idPrefix}-diameter-value`),
        countValue,
        busyIndicator: getPanelElement("statusRow", `${idPrefix}-status-row`)?.querySelector?.(`#${idPrefix}-busy-indicator`) ||
            getElement(`${idPrefix}-busy-indicator`),
        statusRow: getPanelElement("statusRow", `${idPrefix}-status-row`) ||
            countValue?.parentNode ||
            null,
        nudge: getPanelElement("nudge", `${idPrefix}-nudge`),
        typeControls: null,
        presetButtons: null,
    };
}

export function readLunarCraterControlState(elements = {}) {
    const fallback = getStoredControlState(elements);
    const activeScope = getActiveFilterScope(elements);
    const scopedPatch = buildScopedFilterPatch(
        activeScope,
        readScopedFilterFromControls(elements, getScopedFilterState(fallback, activeScope)),
    );
    const hasModernModeControls = !!(
        elements.showAllInput ||
        elements.showAllFilterToggle ||
        elements.hoverFilterToggle ||
        elements.filterScopeSynced ||
        elements.filterScopeSearch
    );
    const legacyVisible = elements.visibleInput?.checked === true;
    const legacyMode = normalizeLunarCraterDisplayMode(elements.modeInput?.value);
    const showAllEnabled = hasModernModeControls
        ? elements.showAllInput?.checked === true
        : legacyVisible && legacyMode === LUNAR_CRATER_DISPLAY_MODE_ALWAYS;
    const hoverEnabled = hasModernModeControls
        ? elements.hoverInput?.checked === true
        : legacyVisible && (
            legacyMode === LUNAR_CRATER_DISPLAY_MODE_HOVER ||
            elements.hoverInput?.checked !== false
        );
    return normalizeLunarFeatureViewState({
        ...fallback,
        viewCraters: elements.sitesInput
            ? elements.sitesInput.checked !== false
            : fallback.viewCraters,
        lunarCraterShowAllEnabled: showAllEnabled,
        lunarCraterHoverEnabled: hoverEnabled,
        viewLunarCraters: showAllEnabled || hoverEnabled,
        lunarCraterHoverLabels: hoverEnabled,
        lunarCraterDisplayMode: normalizeLunarCraterDisplayMode(elements.modeInput?.value),
        ...scopedPatch,
    });
}

export function writeLunarCraterControlState(elements = {}, patch = {}) {
    ensureTypeFilterControls(elements);
    const hasModernModeControls = !!(
        elements.showAllInput ||
        elements.showAllFilterToggle ||
        elements.hoverFilterToggle
    );
    const baseState = { ...getStoredControlState(elements) };
    if (!hasModernModeControls) {
        delete baseState.lunarCraterShowAllEnabled;
        delete baseState.lunarCraterHoverEnabled;
    }
    const normalized = normalizeLunarFeatureViewState({
        ...baseState,
        ...patch,
    });
    setStoredControlState(elements, normalized);
    if (Object.prototype.hasOwnProperty.call(patch, "viewCraters") && elements.sitesInput) {
        elements.sitesInput.checked = normalized.viewCraters !== false;
    }
    if (
        (
            Object.prototype.hasOwnProperty.call(patch, "viewLunarCraters") ||
            Object.prototype.hasOwnProperty.call(patch, "lunarCraterShowAllEnabled") ||
            Object.prototype.hasOwnProperty.call(patch, "lunarCraterHoverEnabled")
        ) &&
        elements.visibleInput
    ) {
        elements.visibleInput.checked = normalized.viewLunarCraters === true;
    }
    if (elements.showAllInput) {
        elements.showAllInput.checked = normalized.lunarCraterShowAllEnabled === true;
    }
    if (elements.hoverInput) {
        elements.hoverInput.checked = normalized.lunarCraterHoverEnabled === true;
    }
    if (elements.modeInput) {
        elements.modeInput.value = normalized.lunarCraterDisplayMode;
    }
    const activeScope = getActiveFilterScope(elements);
    const scopedState = getScopedFilterState(normalized, getActiveFilterScope(elements));
    syncLunarCraterTabBody(elements, activeScope);
    if (elements.minDiameterSlider && elements.maxDiameterSlider) {
        elements.minDiameterSlider.value = String(scopedState.lunarCraterMinDiameterKm);
        elements.maxDiameterSlider.value = String(scopedState.lunarCraterMaxDiameterKm);
        syncDualRangeFill(elements.globalRangeFill, elements.minDiameterSlider, elements.maxDiameterSlider);
    }
    if (elements.diameterValue) {
        elements.diameterValue.value = formatDiameterRange(scopedState);
        elements.diameterValue.textContent = formatDiameterRange(scopedState);
    }
    writeTypeFiltersToControls(elements, scopedState.lunarFeatureTypeFilters);
    if (elements.searchInput) {
        elements.searchInput.value = scopedState.lunarFeatureSearchQuery;
    }
    if (elements.searchResultsContainer) {
        elements.searchResultsContainer.dataset.excludedKeys = scopedState.lunarFeatureExcludedKeys.join("\n");
    }
    syncLunarCraterCountStatus(elements, normalized);
    syncLunarFeatureSearchResults(elements, normalized);
}

export function syncLunarCraterControlPanel(elements = {}, state = readLunarCraterControlState(elements)) {
    ensureTypeFilterControls(elements);
    const normalized = normalizeLunarFeatureViewState(state);
    setStoredControlState(elements, normalized);
    const activeScope = getActiveFilterScope(elements);
    const scopedState = getScopedFilterState(normalized, activeScope);
    const isSearchScope = activeScope === LUNAR_CRATER_FILTER_SCOPE_SEARCH;
    const isSyncedScope = activeScope === LUNAR_CRATER_FILTER_SCOPE_SYNCED;
    syncLunarCraterTabBody(elements, activeScope);
    const enabled = normalized.viewLunarCraters === true;
    const featuresEnabled = normalized.viewLunarFeatures === true;
    const controlsDisabled = elements.disabled === true;
    const panelOpen = elements.panel ? elements.panel.hidden === false : false;

    if (elements.pill) {
        elements.pill.classList?.toggle?.("is-active", featuresEnabled);
        elements.pill.classList?.toggle?.("is-open", panelOpen);
        elements.pill.setAttribute?.("aria-pressed", featuresEnabled ? "true" : "false");
        elements.pill.setAttribute?.("aria-expanded", panelOpen ? "true" : "false");
        elements.pill.disabled = controlsDisabled;
    }
    if (elements.sitesToggle) {
        const sitesEnabled = normalized.viewCraters !== false;
        elements.sitesToggle.classList?.toggle?.("is-active", sitesEnabled);
        elements.sitesToggle.setAttribute?.("aria-pressed", sitesEnabled ? "true" : "false");
        elements.sitesToggle.textContent = "Moon sites";
        elements.sitesToggle.disabled = controlsDisabled;
    }
    if (elements.offToggle) {
        elements.offToggle.classList?.toggle?.("is-active", !enabled);
        elements.offToggle.setAttribute?.("aria-pressed", enabled ? "false" : "true");
        elements.offToggle.textContent = "Off";
        elements.offToggle.disabled = controlsDisabled;
    }
    if (elements.visibleToggle) {
        const active = normalized.lunarCraterShowAllEnabled === true;
        elements.visibleToggle.classList?.toggle?.("is-active", active);
        elements.visibleToggle.setAttribute?.("aria-pressed", active ? "true" : "false");
        elements.visibleToggle.textContent = "Show always";
        elements.visibleToggle.disabled = controlsDisabled;
    }
    if (elements.hoverToggle) {
        const active = normalized.lunarCraterHoverEnabled === true;
        elements.hoverToggle.classList?.toggle?.("is-active", active);
        elements.hoverToggle.setAttribute?.("aria-pressed", active ? "true" : "false");
        elements.hoverToggle.textContent = "Show on hover";
        elements.hoverToggle.disabled = controlsDisabled;
    }
    const syncModePair = (offButton, filterButton, active, offLabel = "Off", filterLabel = "Filtered") => {
        if (offButton) {
            offButton.classList?.toggle?.("is-active", !active);
            offButton.setAttribute?.("aria-pressed", active ? "false" : "true");
            offButton.textContent = offLabel;
            offButton.disabled = controlsDisabled;
        }
        if (filterButton) {
            filterButton.classList?.toggle?.("is-active", active);
            filterButton.setAttribute?.("aria-pressed", active ? "true" : "false");
            filterButton.textContent = filterLabel;
            filterButton.disabled = controlsDisabled;
        }
    };
    syncModePair(elements.showAllOffToggle, elements.showAllFilterToggle, normalized.lunarCraterShowAllEnabled === true);
    syncModePair(elements.hoverOffToggle, elements.hoverFilterToggle, normalized.lunarCraterHoverEnabled === true);
    if (elements.filterScopeShowAll) {
        const active = activeScope === LUNAR_CRATER_FILTER_SCOPE_SHOW_ALL;
        elements.filterScopeShowAll.classList?.toggle?.("is-active", active);
        elements.filterScopeShowAll.setAttribute?.("aria-selected", active ? "true" : "false");
        elements.filterScopeShowAll.setAttribute?.("tabindex", active ? "0" : "-1");
        elements.filterScopeShowAll.disabled = controlsDisabled;
    }
    if (elements.filterScopeHover) {
        const active = activeScope === LUNAR_CRATER_FILTER_SCOPE_HOVER;
        elements.filterScopeHover.classList?.toggle?.("is-active", active);
        elements.filterScopeHover.setAttribute?.("aria-selected", active ? "true" : "false");
        elements.filterScopeHover.setAttribute?.("tabindex", active ? "0" : "-1");
        elements.filterScopeHover.disabled = controlsDisabled;
    }
    if (elements.filterScopeSynced) {
        const active = isSyncedScope;
        elements.filterScopeSynced.classList?.toggle?.("is-active", active);
        elements.filterScopeSynced.setAttribute?.("aria-selected", active ? "true" : "false");
        elements.filterScopeSynced.setAttribute?.("tabindex", active ? "0" : "-1");
        elements.filterScopeSynced.disabled = controlsDisabled;
    }
    if (elements.filterScopeSearch) {
        const active = isSearchScope;
        elements.filterScopeSearch.classList?.toggle?.("is-active", active);
        elements.filterScopeSearch.setAttribute?.("aria-selected", active ? "true" : "false");
        elements.filterScopeSearch.setAttribute?.("tabindex", active ? "0" : "-1");
        elements.filterScopeSearch.disabled = controlsDisabled;
    }
    if (elements.tabPanelBody) {
        const labelledBy = isSearchScope
            ? elements.filterScopeSearch?.id
            : isSyncedScope
                ? elements.filterScopeSynced?.id
            : activeScope === LUNAR_CRATER_FILTER_SCOPE_HOVER
                ? elements.filterScopeHover?.id
                : elements.filterScopeShowAll?.id;
        if (labelledBy) {
            elements.tabPanelBody.setAttribute?.("aria-labelledby", labelledBy);
        }
    }
    if (elements.showAllInput) {
        elements.showAllInput.checked = normalized.lunarCraterShowAllEnabled === true;
    }
    if (elements.hoverInput) {
        elements.hoverInput.checked = normalized.lunarCraterHoverEnabled === true;
    }
    if (elements.visibleInput) {
        elements.visibleInput.checked = normalized.viewLunarCraters === true;
    }
    if (elements.modeInput) {
        elements.modeInput.value = normalized.lunarCraterDisplayMode;
    }
    if (elements.minDiameterSlider && elements.maxDiameterSlider) {
        elements.minDiameterSlider.value = String(scopedState.lunarCraterMinDiameterKm);
        elements.maxDiameterSlider.value = String(scopedState.lunarCraterMaxDiameterKm);
        syncDualRangeFill(elements.globalRangeFill, elements.minDiameterSlider, elements.maxDiameterSlider);
        for (const slider of [elements.minDiameterSlider, elements.maxDiameterSlider]) {
            slider.disabled = controlsDisabled;
            slider.setAttribute?.("aria-disabled", slider.disabled ? "true" : "false");
        }
    }
    for (const button of [
        elements.minDiameterStepDown,
        elements.minDiameterStepUp,
        elements.maxDiameterStepDown,
        elements.maxDiameterStepUp,
    ]) {
        if (!button) continue;
        button.disabled = controlsDisabled;
        button.setAttribute?.("aria-disabled", button.disabled ? "true" : "false");
    }
    if (elements.diameterValue) {
        elements.diameterValue.value = formatDiameterRange(scopedState);
        elements.diameterValue.textContent = formatDiameterRange(scopedState);
    }
    if (elements.searchWrap) {
        elements.searchWrap.hidden = false;
    }
    if (elements.closeButton) {
        elements.closeButton.disabled = controlsDisabled;
    }
    if (elements.searchInput) {
        elements.searchInput.disabled = controlsDisabled;
        if (elements.searchInput.value !== scopedState.lunarFeatureSearchQuery) {
            elements.searchInput.value = scopedState.lunarFeatureSearchQuery;
        }
    }
    if (elements.searchResultsContainer) {
        elements.searchResultsContainer.dataset.excludedKeys = scopedState.lunarFeatureExcludedKeys.join("\n");
    }
    if (elements.typeFilterContainer) {
        elements.typeFilterContainer.hidden = isSearchScope;
    }
    if (elements.typeControls instanceof Map) {
        const normalizedTypeFilters = normalizeLunarFeatureTypeFilters(
            scopedState.lunarFeatureTypeFilters,
            createDefaultLunarFeatureViewState().lunarFeatureTypeFilters,
        );
        for (const [featureType, controls] of elements.typeControls.entries()) {
            const entry = normalizedTypeFilters[featureType] || {};
            const active = entry.enabled !== false;
            controls.row?.classList?.toggle?.("is-disabled", controlsDisabled);
            if (controls.toggle) {
                controls.toggle.checked = active;
                controls.toggle.disabled = controlsDisabled;
            }
            if (controls.minSlider) {
                controls.minSlider.disabled = controlsDisabled;
            }
            if (controls.maxSlider) {
                controls.maxSlider.disabled = controlsDisabled;
            }
            if (controls.row) {
                controls.row.title = formatTypeRangeValue(entry.minDiameterKm, entry.maxDiameterKm);
            }
        }
    }
    if (elements.presetButtons instanceof Map) {
        const normalizedTypeFilters = normalizeLunarFeatureTypeFilters(
            scopedState.lunarFeatureTypeFilters,
            createDefaultLunarFeatureViewState().lunarFeatureTypeFilters,
        );
        for (const preset of LUNAR_FEATURE_PRESETS) {
            const button = elements.presetButtons.get(preset.id);
            if (!button) continue;
            const presetFilters = buildPresetTypeFilters(normalizedTypeFilters, preset.id);
            const modeEnabled = activeScope === LUNAR_CRATER_FILTER_SCOPE_HOVER
                ? normalized.lunarCraterHoverEnabled === true
                : normalized.lunarCraterShowAllEnabled === true;
            const active = preset.id === LUNAR_FEATURE_PRESET_IDS.NONE
                ? !modeEnabled
                : modeEnabled && areTypeFiltersEquivalent(normalizedTypeFilters, presetFilters);
            button.setAttribute("aria-pressed", active ? "true" : "false");
            button.classList?.toggle?.("is-active", active);
            button.disabled = controlsDisabled || isSearchScope || isSyncedScope;
        }
    }
    syncLunarCraterCountStatus(elements, normalized);
    syncLunarFeatureSearchResults(elements, normalized);
}

export function bindLunarCraterControlPanel({ elements, commitPatch, sync }) {
    ensureTypeFilterControls(elements);
    const disposers = [];
    let pendingDiameterPatch = null;
    let pendingDiameterOptions = null;
    let pendingDiameterTimer = null;
    let pendingTypePatch = null;
    let pendingTypeOptions = null;
    let pendingTypeTimer = null;
    const scheduleCommit = typeof window !== "undefined" && typeof window.setTimeout === "function"
        ? window.setTimeout.bind(window)
        : setTimeout;
    const clearScheduledCommit = typeof window !== "undefined" && typeof window.clearTimeout === "function"
        ? window.clearTimeout.bind(window)
        : clearTimeout;
    const syncControls = typeof sync === "function"
        ? sync
        : () => syncLunarCraterControlPanel(elements);
    const listen = (element, type, handler, options) => {
        if (!element?.addEventListener) return;
        element.addEventListener(type, handler, options);
        disposers.push(() => element.removeEventListener?.(type, handler, options));
    };
    const flushDiameterCommit = () => {
        if (pendingDiameterTimer !== null) {
            clearScheduledCommit(pendingDiameterTimer);
            pendingDiameterTimer = null;
        }
        if (!pendingDiameterPatch) {
            setLunarCraterControlPending(elements, false);
            return;
        }
        const patch = pendingDiameterPatch;
        const options = pendingDiameterOptions || {};
        pendingDiameterPatch = null;
        pendingDiameterOptions = null;
        writeLunarCraterControlState(elements, patch);
        commitPatch?.(patch, options);
        setLunarCraterControlPending(elements, false);
        syncControls();
    };
    const flushTypeCommit = () => {
        if (pendingTypeTimer !== null) {
            clearScheduledCommit(pendingTypeTimer);
            pendingTypeTimer = null;
        }
        if (!pendingTypePatch) {
            return;
        }
        const patch = pendingTypePatch;
        const options = pendingTypeOptions || {};
        pendingTypePatch = null;
        pendingTypeOptions = null;
        writeLunarCraterControlState(elements, patch);
        commitPatch?.(patch, options);
        syncControls();
    };
    const queueDiameterCommit = (patch, options = {}) => {
        pendingDiameterPatch = patch;
        pendingDiameterOptions = options;
        writeLunarCraterControlState(elements, patch);
        setLunarCraterControlPending(elements, true);
        syncLunarCraterControlPanel(elements, readLunarCraterControlState(elements));
        if (pendingDiameterTimer !== null) {
            clearScheduledCommit(pendingDiameterTimer);
        }
        pendingDiameterTimer = scheduleCommit(flushDiameterCommit, CRATER_DIAMETER_COMMIT_DELAY_MS);
    };
    const queueTypeCommit = (patch, options = {}) => {
        pendingTypePatch = patch;
        pendingTypeOptions = options;
        writeLunarCraterControlState(elements, patch);
        if (pendingTypeTimer !== null) {
            clearScheduledCommit(pendingTypeTimer);
        }
        pendingTypeTimer = scheduleCommit(flushTypeCommit, CRATER_DIAMETER_COMMIT_DELAY_MS);
    };
    const commit = (patch, options = {}) => {
        flushDiameterCommit();
        flushTypeCommit();
        writeLunarCraterControlState(elements, patch);
        commitPatch?.(patch, options);
        syncControls();
    };
    const activateFilterScope = (scope) => {
        flushDiameterCommit();
        flushTypeCommit();
        setActiveFilterScope(elements, scope);
        writeLunarCraterControlState(elements, {});
        syncControls();
    };
    const readCurrentTypeFilters = () => {
        const current = readLunarCraterControlState(elements);
        return normalizeLunarFeatureTypeFilters(
            getScopedFilterState(current, getActiveFilterScope(elements)).lunarFeatureTypeFilters,
            createDefaultLunarFeatureViewState().lunarFeatureTypeFilters,
        );
    };
    const commitCurrentTypeFilters = (sourceId, { queued = false } = {}) => {
        const patch = buildScopedFilterPatch(getActiveFilterScope(elements), {
            ...getScopedFilterState(readLunarCraterControlState(elements), getActiveFilterScope(elements)),
            lunarFeatureTypeFilters: readCurrentTypeFilters(),
        });
        if (queued) {
            queueTypeCommit(patch, { sourceId });
        } else {
            commit(patch, { sourceId });
        }
    };
    const hasModernModeControls = () => !!(
        elements.showAllInput ||
        elements.showAllFilterToggle ||
        elements.hoverFilterToggle ||
        elements.filterScopeSynced ||
        elements.filterScopeSearch
    );
    const getModeEnabledPatch = (scope, enabled) => {
        const current = readLunarCraterControlState(elements);
        if (scope === LUNAR_CRATER_FILTER_SCOPE_HOVER) {
            return {
                lunarCraterHoverEnabled: enabled === true,
                viewLunarCraters: enabled === true || current.lunarCraterShowAllEnabled === true,
            };
        }
        return {
            lunarCraterShowAllEnabled: enabled === true,
            viewLunarCraters: enabled === true || current.lunarCraterHoverEnabled === true,
        };
    };
    listen(elements.sitesToggle, "click", () => {
        const current = readLunarCraterControlState(elements);
        commit(
            { viewCraters: !(current.viewCraters !== false) },
            { sourceId: elements.sitesToggle?.id || "lunar-crater-sites-toggle" },
        );
    });

    listen(elements.offToggle, "click", () => {
        commit(
            {
                viewLunarCraters: false,
                ...(hasModernModeControls() ? {
                    lunarCraterShowAllEnabled: false,
                    lunarCraterHoverEnabled: false,
                } : {}),
            },
            { sourceId: elements.offToggle?.id || "lunar-crater-off-toggle" },
        );
    });
    listen(elements.visibleToggle, "click", () => {
        commit(
            {
                viewLunarCraters: true,
                lunarCraterDisplayMode: LUNAR_CRATER_DISPLAY_MODE_ALWAYS,
                lunarCraterHoverLabels: true,
                ...(hasModernModeControls() ? { lunarCraterShowAllEnabled: true } : {}),
            },
            { sourceId: elements.visibleToggle?.id || "lunar-crater-visible-toggle" },
        );
    });
    listen(elements.hoverToggle, "click", () => {
        commit(
            {
                viewLunarCraters: true,
                lunarCraterDisplayMode: LUNAR_CRATER_DISPLAY_MODE_HOVER,
                lunarCraterHoverLabels: true,
                ...(hasModernModeControls() ? { lunarCraterHoverEnabled: true } : {}),
            },
            { sourceId: elements.hoverToggle?.id || "lunar-crater-hover-toggle" },
        );
    });
    listen(elements.showAllOffToggle, "click", () => {
        commit(
            { lunarCraterShowAllEnabled: false, viewLunarCraters: readLunarCraterControlState(elements).lunarCraterHoverEnabled === true },
            { sourceId: elements.showAllOffToggle?.id || "lunar-crater-show-all-off-toggle" },
        );
    });
    listen(elements.showAllFilterToggle, "click", () => {
        setActiveFilterScope(elements, LUNAR_CRATER_FILTER_SCOPE_SHOW_ALL);
        commit(
            {
                viewLunarCraters: true,
                lunarCraterDisplayMode: LUNAR_CRATER_DISPLAY_MODE_ALWAYS,
                lunarCraterHoverLabels: true,
                lunarCraterShowAllEnabled: true,
            },
            { sourceId: elements.showAllFilterToggle?.id || "lunar-crater-show-all-filter-toggle" },
        );
    });
    listen(elements.hoverOffToggle, "click", () => {
        commit(
            { lunarCraterHoverEnabled: false, viewLunarCraters: readLunarCraterControlState(elements).lunarCraterShowAllEnabled === true },
            { sourceId: elements.hoverOffToggle?.id || "lunar-crater-hover-off-toggle" },
        );
    });
    listen(elements.hoverFilterToggle, "click", () => {
        setActiveFilterScope(elements, LUNAR_CRATER_FILTER_SCOPE_HOVER);
        commit(
            {
                viewLunarCraters: true,
                lunarCraterDisplayMode: LUNAR_CRATER_DISPLAY_MODE_HOVER,
                lunarCraterHoverLabels: true,
                lunarCraterHoverEnabled: true,
            },
            { sourceId: elements.hoverFilterToggle?.id || "lunar-crater-hover-filter-toggle" },
        );
    });
    listen(elements.filterScopeShowAll, "click", () => {
        activateFilterScope(LUNAR_CRATER_FILTER_SCOPE_SHOW_ALL);
    });
    listen(elements.filterScopeHover, "click", () => {
        activateFilterScope(LUNAR_CRATER_FILTER_SCOPE_HOVER);
    });
    listen(elements.filterScopeSynced, "click", () => {
        activateFilterScope(LUNAR_CRATER_FILTER_SCOPE_SYNCED);
    });
    listen(elements.filterScopeSearch, "click", () => {
        activateFilterScope(LUNAR_CRATER_FILTER_SCOPE_SEARCH);
    });
    listen(elements.filterScopeShowAll?.parentElement, "keydown", (event) => {
        const tabs = [
            [elements.filterScopeShowAll, LUNAR_CRATER_FILTER_SCOPE_SHOW_ALL],
            [elements.filterScopeHover, LUNAR_CRATER_FILTER_SCOPE_HOVER],
            [elements.filterScopeSynced, LUNAR_CRATER_FILTER_SCOPE_SYNCED],
            [elements.filterScopeSearch, LUNAR_CRATER_FILTER_SCOPE_SEARCH],
        ].filter(([tab]) => tab && tab.disabled !== true);
        const currentIndex = tabs.findIndex(([tab]) => tab === event.target);
        if (currentIndex < 0) return;
        let nextIndex = currentIndex;
        if (event.key === "ArrowRight" || event.key === "ArrowDown") {
            nextIndex = (currentIndex + 1) % tabs.length;
        } else
        if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
            nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        } else
        if (event.key === "Home") {
            nextIndex = 0;
        } else
        if (event.key === "End") {
            nextIndex = tabs.length - 1;
        } else {
            return;
        }
        event.preventDefault();
        const [nextTab, nextScope] = tabs[nextIndex];
        activateFilterScope(nextScope);
        nextTab?.focus?.();
    });
    listen(elements.closeButton, "click", () => {
        if (elements.panel) {
            elements.panel.hidden = true;
        }
        syncControls();
    });

    listen(elements.searchInput, "input", () => {
        const current = readLunarCraterControlState(elements);
        commit(
            buildScopedFilterPatch(getActiveFilterScope(elements), {
                ...getScopedFilterState(current, getActiveFilterScope(elements)),
                lunarFeatureSearchQuery: elements.searchInput?.value || "",
                lunarFeatureExcludedKeys: [],
            }),
            { sourceId: elements.searchInput?.id || "lunar-feature-search" },
        );
    });

    listen(elements.searchResultsContainer, "change", (event) => {
        const checkbox = event.target?.closest?.(".lunar-crater-controls-panel__search-result-check");
        if (!checkbox || !elements.searchResultsContainer?.contains?.(checkbox)) return;
        const featureKey = `${checkbox.dataset.featureKey || ""}`.trim();
        if (!featureKey) return;
        const current = readLunarCraterControlState(elements);
        const scopedState = getScopedFilterState(current, getActiveFilterScope(elements));
        const excluded = new Set(normalizeLunarFeatureKeyList(scopedState.lunarFeatureExcludedKeys));
        if (checkbox.checked) {
            excluded.delete(featureKey);
        } else {
            excluded.add(featureKey);
        }
        commit(
            buildScopedFilterPatch(getActiveFilterScope(elements), {
                ...scopedState,
                lunarFeatureExcludedKeys: Array.from(excluded),
            }),
            { sourceId: `${elements.searchResultsContainer.id || "lunar-feature-search-results"}:${featureKey}` },
        );
    });

    listen(elements.presetContainer, "click", (event) => {
        const button = event.target?.closest?.("[data-preset-id]");
        if (!button || !elements.presetContainer?.contains?.(button)) {
            return;
        }
        const presetId = `${button.dataset.presetId || ""}`;
        if (!presetId) {
            return;
        }
        const current = readLunarCraterControlState(elements);
        const scopedState = getScopedFilterState(current, getActiveFilterScope(elements));
        const scope = getActiveFilterScope(elements);
        if (scope === LUNAR_CRATER_FILTER_SCOPE_SEARCH) {
            return;
        }
        const presetFilters = buildPresetTypeFilters(scopedState.lunarFeatureTypeFilters, presetId);
        commit(
            {
                ...buildScopedFilterPatch(scope, {
                    lunarFeatureTypeFilters: presetFilters,
                }),
                ...getModeEnabledPatch(scope, presetId !== LUNAR_FEATURE_PRESET_IDS.NONE),
            },
            { sourceId: `lunar-feature-preset:${presetId}` },
        );
    });

    const markTypeExplicit = (controls, key) => {
        if (!controls) return;
        if (key === "min") {
            controls.minExplicit = true;
            controls.row?.dataset && (controls.row.dataset.typeMinExplicit = "true");
        } else if (key === "max") {
            controls.maxExplicit = true;
            controls.row?.dataset && (controls.row.dataset.typeMaxExplicit = "true");
        }
    };
    const commitTypeFromSliders = (featureType, controls, sourceId, { queued = false } = {}) => {
        markTypeExplicit(controls, sourceId.includes("min") ? "min" : "max");
        if (controls?.minSlider && controls?.maxSlider) {
            const sliderMax = readSliderBound(
                controls.maxSlider,
                "max",
                resolveTypeSliderMax(controls.stats),
            );
            let minValue = readTypeSliderValue(
                controls.minSlider,
                TYPE_FILTER_DEFAULT_MIN_KM,
                { minBound: TYPE_FILTER_DEFAULT_MIN_KM, maxBound: sliderMax },
            );
            let maxValue = readTypeSliderValue(
                controls.maxSlider,
                sliderMax,
                { minBound: TYPE_FILTER_DEFAULT_MIN_KM, maxBound: sliderMax },
            );
            if (minValue > maxValue) {
                if (sourceId.includes("min")) {
                    maxValue = minValue;
                    controls.maxSlider.value = String(maxValue);
                } else {
                    minValue = maxValue;
                    controls.minSlider.value = String(minValue);
                }
            }
            syncTypeRangeValueText(controls, minValue, maxValue);
            syncDualRangeFill(controls.dualRangeFill, controls.minSlider, controls.maxSlider);
        }
        commitCurrentTypeFilters(`lunar-feature-type-${sourceId}:${featureType}`, { queued });
    };
    listen(elements.typeFilterContainer, "change", (event) => {
        const row = event.target?.closest?.(".lunar-crater-controls-panel__type-row");
        if (!row || !elements.typeFilterContainer?.contains?.(row)) return;
        const featureType = `${row.dataset.featureType || ""}`;
        if (!featureType) return;
        const controls = elements.typeControls instanceof Map
            ? elements.typeControls.get(featureType)
            : null;
        if (!controls) return;
        if (event.target?.classList?.contains?.("lunar-crater-controls-panel__type-toggle")) {
            commitCurrentTypeFilters(`lunar-feature-type-toggle:${featureType}`);
        } else if (event.target?.classList?.contains?.("lunar-crater-controls-panel__type-slider--min")) {
            commitTypeFromSliders(featureType, controls, "min-change");
        } else if (event.target?.classList?.contains?.("lunar-crater-controls-panel__type-slider--max")) {
            commitTypeFromSliders(featureType, controls, "max-change");
        }
    });
    listen(elements.typeFilterContainer, "input", (event) => {
        const row = event.target?.closest?.(".lunar-crater-controls-panel__type-row");
        if (!row || !elements.typeFilterContainer?.contains?.(row)) return;
        const featureType = `${row.dataset.featureType || ""}`;
        if (!featureType) return;
        const controls = elements.typeControls instanceof Map
            ? elements.typeControls.get(featureType)
            : null;
        if (!controls) return;
        if (event.target?.classList?.contains?.("lunar-crater-controls-panel__type-slider--min")) {
            commitTypeFromSliders(featureType, controls, "min-input", { queued: true });
        } else if (event.target?.classList?.contains?.("lunar-crater-controls-panel__type-slider--max")) {
            commitTypeFromSliders(featureType, controls, "max-input", { queued: true });
        }
    });

    const commitDiameterRange = (source) => {
        const fallback = createDefaultLunarCraterViewState();
        let minDiameterKm = readNumericControlValue(
            elements.minDiameterSlider,
            fallback.lunarCraterMinDiameterKm,
        );
        let maxDiameterKm = readNumericControlValue(
            elements.maxDiameterSlider,
            fallback.lunarCraterMaxDiameterKm,
        );
        if (source === "min" && minDiameterKm > maxDiameterKm) {
            maxDiameterKm = minDiameterKm;
        } else if (source === "max" && maxDiameterKm < minDiameterKm) {
            minDiameterKm = maxDiameterKm;
        }
        const range = normalizeLunarCraterDiameterRange({
            lunarCraterMinDiameterKm: minDiameterKm,
            lunarCraterMaxDiameterKm: maxDiameterKm,
        });
        queueDiameterCommit(
            buildScopedFilterPatch(getActiveFilterScope(elements), range),
            {
                sourceId: source === "max"
                    ? elements.maxDiameterSlider?.id || "lunar-crater-max-diameter"
                    : elements.minDiameterSlider?.id || "lunar-crater-min-diameter",
            },
        );
    };

    const readSliderStep = (slider) => {
        const step = Number(slider?.step);
        return Number.isFinite(step) && step > 0 ? step : LUNAR_CRATER_DIAMETER_STEP_KM;
    };

    const adjustDiameter = (slider, delta, source) => {
        if (!slider || slider.disabled === true) return;
        const fallback = source === "max"
            ? LUNAR_CRATER_DEFAULT_MAX_DIAMETER_KM
            : LUNAR_CRATER_DEFAULT_MIN_DIAMETER_KM;
        const value = readNumericControlValue(slider, fallback);
        const min = readNumericControlValue(slider.min ? { value: slider.min } : null, LUNAR_CRATER_RANGE_MIN_DIAMETER_KM);
        const max = readNumericControlValue(slider.max ? { value: slider.max } : null, LUNAR_CRATER_RANGE_MAX_DIAMETER_KM);
        const nextValue = Math.min(max, Math.max(min, value + delta));
        slider.value = String(nextValue);
        commitDiameterRange(source);
    };

    listen(elements.minDiameterSlider, "input", () => commitDiameterRange("min"));
    listen(elements.minDiameterSlider, "change", () => commitDiameterRange("min"));
    listen(elements.maxDiameterSlider, "input", () => commitDiameterRange("max"));
    listen(elements.maxDiameterSlider, "change", () => commitDiameterRange("max"));
    listen(elements.minDiameterStepDown, "click", () => {
        adjustDiameter(elements.minDiameterSlider, -readSliderStep(elements.minDiameterSlider), "min");
    });
    listen(elements.minDiameterStepUp, "click", () => {
        adjustDiameter(elements.minDiameterSlider, readSliderStep(elements.minDiameterSlider), "min");
    });
    listen(elements.maxDiameterStepDown, "click", () => {
        adjustDiameter(elements.maxDiameterSlider, -readSliderStep(elements.maxDiameterSlider), "max");
    });
    listen(elements.maxDiameterStepUp, "click", () => {
        adjustDiameter(elements.maxDiameterSlider, readSliderStep(elements.maxDiameterSlider), "max");
    });
    listen(elements.visibleInput, "change", syncControls);
    listen(elements.hoverInput, "change", syncControls);
    listen(elements.modeInput, "change", syncControls);

    syncControls();
    return () => {
        if (pendingDiameterTimer !== null) {
            clearScheduledCommit(pendingDiameterTimer);
            pendingDiameterTimer = null;
        }
        if (pendingTypeTimer !== null) {
            clearScheduledCommit(pendingTypeTimer);
            pendingTypeTimer = null;
        }
        setLunarCraterControlPending(elements, false);
        for (const dispose of disposers.splice(0)) {
            dispose();
        }
    };
}

export function createLunarCraterControlPanelElements(documentRef, options = {}) {
    const prefix = options.idPrefix || "lunar-crater";
    const enableSyncedScope = options.enableSyncedScope === true;
    const initialFilterScope = enableSyncedScope
        ? normalizeFilterScope(options.initialFilterScope || LUNAR_CRATER_FILTER_SCOPE_SYNCED)
        : LUNAR_CRATER_FILTER_SCOPE_SHOW_ALL;
    const state = createDefaultLunarFeatureViewState();

    const panel = documentRef.createElement("div");
    panel.id = `${prefix}-controls-panel`;
    panel.className = "lunar-crater-controls-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Lunar feature controls");
    panel.dataset.filterScope = initialFilterScope;
    panel.hidden = true;

    const header = documentRef.createElement("div");
    header.className = "lunar-crater-controls-panel__header";
    const headerTitle = documentRef.createElement("span");
    headerTitle.className = "lunar-crater-controls-panel__title";
    headerTitle.textContent = "Lunar Features";
    const closeButton = documentRef.createElement("button");
    closeButton.id = `${prefix}-close`;
    closeButton.type = "button";
    closeButton.className = "lunar-crater-controls-panel__close";
    closeButton.textContent = "Close";
    closeButton.setAttribute("aria-label", "Close lunar feature controls");
    header.appendChild(headerTitle);
    header.appendChild(closeButton);

    const visibleInput = documentRef.createElement("input");
    visibleInput.type = "checkbox";
    visibleInput.id = `${prefix}-visible`;
    visibleInput.checked = state.viewLunarCraters;
    visibleInput.hidden = true;

    const showAllInput = documentRef.createElement("input");
    showAllInput.type = "checkbox";
    showAllInput.id = `${prefix}-show-all-enabled`;
    showAllInput.checked = state.lunarCraterShowAllEnabled;
    showAllInput.hidden = true;

    const hoverInput = documentRef.createElement("input");
    hoverInput.type = "checkbox";
    hoverInput.id = `${prefix}-hover-labels`;
    hoverInput.checked = state.lunarCraterHoverEnabled;
    hoverInput.hidden = true;

    const modeInput = documentRef.createElement("input");
    modeInput.type = "hidden";
    modeInput.id = `${prefix}-display-mode`;
    modeInput.value = state.lunarCraterDisplayMode;

    const makeButton = (idSuffix, text, title, selected = "false") => {
        const button = documentRef.createElement("button");
        button.id = `${prefix}-${idSuffix}`;
        button.type = "button";
        button.className = "lunar-crater-controls-panel__button";
        button.setAttribute("role", "tab");
        button.setAttribute("aria-selected", selected);
        button.setAttribute("aria-controls", `${prefix}-tab-panel`);
        button.setAttribute("tabindex", selected === "true" ? "0" : "-1");
        button.title = title;
        button.textContent = text;
        return button;
    };

    const scopeToggles = documentRef.createElement("div");
    scopeToggles.className = "lunar-crater-controls-panel__toggles";
    scopeToggles.setAttribute("role", "tablist");
    scopeToggles.setAttribute("aria-label", "Lunar feature modes");
    const filterScopeShowAll = makeButton(
        "filter-scope-show-all",
        "Show Always",
        "Edit the Show Always filter set",
        initialFilterScope === LUNAR_CRATER_FILTER_SCOPE_SHOW_ALL ? "true" : "false",
    );
    const filterScopeHover = makeButton(
        "filter-scope-hover",
        "Hover",
        "Edit the Hover filter set",
        initialFilterScope === LUNAR_CRATER_FILTER_SCOPE_HOVER ? "true" : "false",
    );
    const filterScopeSynced = enableSyncedScope
        ? makeButton(
            "filter-scope-synced",
            "Synced",
            "Show transcript-synced lunar features",
            initialFilterScope === LUNAR_CRATER_FILTER_SCOPE_SYNCED ? "true" : "false",
        )
        : null;
    const filterScopeSearch = makeButton(
        "filter-scope-search",
        "Search",
        "Search and pin lunar feature annotations",
        initialFilterScope === LUNAR_CRATER_FILTER_SCOPE_SEARCH ? "true" : "false",
    );
    scopeToggles.appendChild(filterScopeShowAll);
    scopeToggles.appendChild(filterScopeHover);
    if (filterScopeSynced) {
        scopeToggles.appendChild(filterScopeSynced);
    }
    scopeToggles.appendChild(filterScopeSearch);

    const tabPanelBody = documentRef.createElement("div");
    tabPanelBody.id = `${prefix}-tab-panel`;
    tabPanelBody.className = "lunar-crater-controls-panel__tab-panel";
    tabPanelBody.setAttribute("role", "tabpanel");
    tabPanelBody.setAttribute(
        "aria-labelledby",
        initialFilterScope === LUNAR_CRATER_FILTER_SCOPE_SEARCH
            ? filterScopeSearch.id
            : initialFilterScope === LUNAR_CRATER_FILTER_SCOPE_SYNCED && filterScopeSynced
                ? filterScopeSynced.id
                : initialFilterScope === LUNAR_CRATER_FILTER_SCOPE_HOVER
                    ? filterScopeHover.id
                    : filterScopeShowAll.id,
    );

    const searchWrap = documentRef.createElement("div");
    searchWrap.id = `${prefix}-search-wrap`;
    searchWrap.className = "lunar-crater-controls-panel__search";
    const searchLabel = documentRef.createElement("label");
    searchLabel.className = "lunar-crater-controls-panel__search-label";
    searchLabel.setAttribute("for", `${prefix}-search`);
    searchLabel.textContent = "Search";
    const searchInput = documentRef.createElement("input");
    searchInput.id = `${prefix}-search`;
    searchInput.className = "lunar-crater-controls-panel__search-input";
    searchInput.type = "search";
    searchInput.autocomplete = "off";
    searchInput.spellcheck = false;
    searchInput.placeholder = "Search lunar features";
    searchInput.setAttribute("aria-label", "Search lunar features");
    searchWrap.appendChild(searchLabel);
    searchWrap.appendChild(searchInput);

    const presets = documentRef.createElement("div");
    presets.id = `${prefix}-presets`;
    presets.className = "lunar-crater-controls-panel__presets";

    const typeFilters = documentRef.createElement("div");
    typeFilters.id = `${prefix}-type-filters`;
    typeFilters.className = "lunar-crater-controls-panel__type-filters";
    typeFilters.hidden = true;

    const searchResults = documentRef.createElement("div");
    searchResults.id = `${prefix}-search-results`;
    searchResults.className = "lunar-crater-controls-panel__search-results";
    searchResults.hidden = true;

    const syncedControls = documentRef.createElement("div");
    syncedControls.id = `${prefix}-synced-controls`;
    syncedControls.className = "lunar-crater-controls-panel__synced-controls";

    const label = documentRef.createElement("label");
    label.id = `${prefix}-range-label`;
    label.className = "lunar-crater-controls-panel__range-label";
    label.setAttribute("for", `${prefix}-min-diameter`);
    const labelText = documentRef.createElement("span");
    labelText.textContent = "Diameter";
    const diameterValue = documentRef.createElement("output");
    diameterValue.id = `${prefix}-diameter-value`;
    diameterValue.className = "lunar-crater-controls-panel__diameter-value";
    diameterValue.setAttribute("for", `${prefix}-min-diameter ${prefix}-max-diameter`);
    diameterValue.value = formatDiameterRange(state);
    diameterValue.textContent = formatDiameterRange(state);
    label.appendChild(labelText);
    label.appendChild(diameterValue);

    const rangeStack = documentRef.createElement("div");
    rangeStack.id = `${prefix}-range-stack`;
    rangeStack.className = "lunar-crater-controls-panel__range-stack";

    const createDiameterSlider = (idSuffix, labelTextValue, value, variantClass) => {
        const slider = documentRef.createElement("input");
        slider.id = `${prefix}-${idSuffix}`;
        slider.className = `lunar-crater-controls-panel__range ${variantClass}`;
        slider.type = "range";
        slider.min = String(LUNAR_CRATER_RANGE_MIN_DIAMETER_KM);
        slider.max = String(LUNAR_CRATER_RANGE_MAX_DIAMETER_KM);
        slider.step = String(LUNAR_CRATER_DIAMETER_STEP_KM);
        slider.value = String(value);
        slider.setAttribute("aria-label", labelTextValue);
        return slider;
    };
    const minDiameterSlider = createDiameterSlider(
        "min-diameter",
        "Minimum feature diameter",
        LUNAR_CRATER_DEFAULT_MIN_DIAMETER_KM,
        "lunar-crater-controls-panel__range--min",
    );
    const maxDiameterSlider = createDiameterSlider(
        "max-diameter",
        "Maximum feature diameter",
        LUNAR_CRATER_DEFAULT_MAX_DIAMETER_KM,
        "lunar-crater-controls-panel__range--max",
    );
    const globalDualRange = documentRef.createElement("div");
    globalDualRange.className = "lunar-crater-controls-panel__dual-range";
    const globalRangeFill = documentRef.createElement("span");
    globalRangeFill.id = `${prefix}-global-range-fill`;
    globalRangeFill.className = "lunar-crater-controls-panel__dual-range-fill";
    globalDualRange.appendChild(globalRangeFill);
    globalDualRange.appendChild(minDiameterSlider);
    globalDualRange.appendChild(maxDiameterSlider);
    rangeStack.appendChild(globalDualRange);

    const scale = documentRef.createElement("div");
    scale.id = `${prefix}-scale`;
    scale.className = "lunar-crater-controls-panel__scale";
    scale.setAttribute("aria-hidden", "true");
    const small = documentRef.createElement("span");
    small.textContent = `${LUNAR_CRATER_RANGE_MIN_DIAMETER_KM} km`;
    const large = documentRef.createElement("span");
    large.textContent = `${LUNAR_CRATER_RANGE_MAX_DIAMETER_KM} km`;
    scale.appendChild(small);
    scale.appendChild(large);

    const statusRow = documentRef.createElement("div");
    statusRow.id = `${prefix}-status-row`;
    statusRow.className = "lunar-crater-controls-panel__status-row";
    const busyIndicator = documentRef.createElement("span");
    busyIndicator.id = `${prefix}-busy-indicator`;
    busyIndicator.className = "lunar-crater-controls-panel__busy-indicator";
    busyIndicator.hidden = true;
    busyIndicator.textContent = "Rendering";
    const countValue = documentRef.createElement("span");
    countValue.id = `${prefix}-count-value`;
    countValue.className = "lunar-crater-controls-panel__count-value";
    countValue.setAttribute("aria-live", "polite");
    statusRow.appendChild(busyIndicator);
    statusRow.appendChild(countValue);

    const nudge = documentRef.createElement("div");
    nudge.id = `${prefix}-nudge`;
    nudge.className = "lunar-crater-controls-panel__nudge";
    nudge.hidden = true;

    panel.appendChild(visibleInput);
    panel.appendChild(showAllInput);
    panel.appendChild(hoverInput);
    panel.appendChild(modeInput);
    panel.appendChild(header);
    panel.appendChild(scopeToggles);
    if (initialFilterScope === LUNAR_CRATER_FILTER_SCOPE_SEARCH) {
        tabPanelBody.appendChild(searchWrap);
        tabPanelBody.appendChild(searchResults);
    } else if (initialFilterScope === LUNAR_CRATER_FILTER_SCOPE_SYNCED && enableSyncedScope) {
        tabPanelBody.appendChild(syncedControls);
    } else {
        tabPanelBody.appendChild(presets);
        tabPanelBody.appendChild(label);
        tabPanelBody.appendChild(rangeStack);
        tabPanelBody.appendChild(scale);
        tabPanelBody.appendChild(typeFilters);
        tabPanelBody.appendChild(statusRow);
        tabPanelBody.appendChild(nudge);
    }
    panel.appendChild(tabPanelBody);

    return {
        panel,
        closeButton,
        presetContainer: presets,
        searchWrap,
        searchInput,
        searchResultsContainer: searchResults,
        tabPanelBody,
        typeFilterContainer: typeFilters,
        visibleInput,
        showAllInput,
        hoverInput,
        modeInput,
        offToggle: null,
        visibleToggle: null,
        hoverToggle: null,
        showAllOffToggle: null,
        showAllFilterToggle: null,
        hoverOffToggle: null,
        hoverFilterToggle: null,
        filterScopeShowAll,
        filterScopeHover,
        filterScopeSynced,
        filterScopeSearch,
        syncedControlsContainer: syncedControls,
        minDiameterSlider,
        minDiameterStepDown: null,
        minDiameterStepUp: null,
        maxDiameterSlider,
        maxDiameterStepDown: null,
        maxDiameterStepUp: null,
        globalRangeFill,
        rangeLabel: label,
        rangeStack,
        scale,
        diameterValue,
        countValue,
        busyIndicator,
        statusRow,
        nudge,
        typeControls: null,
        presetButtons: null,
    };
}
