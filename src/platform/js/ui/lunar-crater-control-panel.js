import { LUNAR_CRATER_DEFAULT_MAX_DIAMETER_KM, LUNAR_CRATER_DEFAULT_MIN_DIAMETER_KM, LUNAR_CRATER_DIAMETER_STEP_KM, LUNAR_CRATER_DISPLAY_MODE_ALWAYS, LUNAR_CRATER_DISPLAY_MODE_HOVER, LUNAR_CRATER_RANGE_MAX_DIAMETER_KM, LUNAR_CRATER_RANGE_MIN_DIAMETER_KM, createDefaultLunarCraterViewState, normalizeLunarCraterDiameterRange, normalizeLunarCraterDisplayMode } from "../core/domain/lunar-crater-view.js";
import { createDefaultLunarFeatureViewState, LUNAR_FEATURE_PRESET_IDS, normalizeLunarFeatureKeyList, normalizeLunarFeatureViewState, normalizeLunarFeatureTypeFilters } from "../core/domain/lunar-feature-view.js";
import {
    CRATER_DIAMETER_COMMIT_DELAY_MS,
    TYPE_FILTER_DEFAULT_MIN_KM,
    LUNAR_CRATER_FILTER_SCOPE_SHOW_ALL,
    LUNAR_CRATER_FILTER_SCOPE_HOVER,
    LUNAR_CRATER_FILTER_SCOPE_SYNCED,
    LUNAR_CRATER_FILTER_SCOPE_SEARCH,
    LUNAR_FEATURE_PRESETS,
    readNumericControlValue,
    formatDiameterRange,
    formatTypeRangeValue,
    resolveTypeSliderMax,
    readSliderBound,
    readTypeSliderValue,
    syncTypeRangeValueText,
    syncDualRangeFill,
    buildPresetTypeFilters,
    areTypeFiltersEquivalent,
} from "./lunar-crater-control-model.js";
import { createLunarCraterControlDom } from "./lunar-crater-control-dom.js";

const {
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
} = createLunarCraterControlDom({
    onCatalogReady: (elements) => syncLunarCraterControlPanel(elements),
});

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

export {
    getLunarCraterControlPanelElements,
    createLunarCraterControlPanelElements,
} from "./lunar-crater-control-elements.js";
