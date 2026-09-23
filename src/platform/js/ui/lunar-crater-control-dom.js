import { LUNAR_CRATER_DIAMETER_STEP_KM, LUNAR_CRATER_RANGE_MIN_DIAMETER_KM } from "../core/domain/lunar-crater-view.js";
import { createDefaultLunarFeatureViewState, normalizeLunarFeatureKeyList, normalizeLunarFeatureViewState, normalizeLunarFeatureTypeFilters } from "../core/domain/lunar-feature-view.js";
import { countCraterDisplayFeatures, getCraterDisplayFeatures, getLunarFeatureKey } from "../core/domain/lunar-crater-catalog.js";
import { getLunarFeatureTypeColor } from "../core/domain/lunar-feature-colors.js";
import {
    getLunarCraterCatalogLoadState,
    CRATER_DENSE_SELECTION_COUNT,
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
    formatCraterCount,
    getOrderedCatalogTypeStats,
    formatFeatureTypeLabel,
    formatTypeRangeValue,
    resolveTypeSliderMax,
    readSliderBound,
    readTypeSliderValue,
    syncTypeRangeValueText,
    syncDualRangeFill,
    normalizeFilterScope,
} from "./lunar-crater-control-model.js";

export function createLunarCraterControlDom({ onCatalogReady }) {
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
                const catalogLoadState = getLunarCraterCatalogLoadState();
                elements.nudge.textContent = catalogLoadState.loading
                    ? "Loading lunar feature catalog."
                    : catalogLoadState.error
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
                requestLunarCraterCatalog(elements, onCatalogReady);
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

    return {
        getActiveFilterScope,
        setActiveFilterScope,
        getStoredControlState,
        setStoredControlState,
        syncLunarCraterTabBody,
        getScopedFilterState,
        buildScopedFilterPatch,
        readScopedFilterFromControls,
        setLunarCraterControlPending,
        syncLunarCraterCountStatus,
        syncLunarFeatureSearchResults,
        ensureTypeFilterControls,
        writeTypeFiltersToControls,
    };
}
