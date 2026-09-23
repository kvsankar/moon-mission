import { LUNAR_CRATER_DEFAULT_MAX_DIAMETER_KM, LUNAR_CRATER_DEFAULT_MIN_DIAMETER_KM, LUNAR_CRATER_DIAMETER_STEP_KM, LUNAR_CRATER_RANGE_MAX_DIAMETER_KM, LUNAR_CRATER_RANGE_MIN_DIAMETER_KM } from "../core/domain/lunar-crater-view.js";
import { createDefaultLunarFeatureViewState } from "../core/domain/lunar-feature-view.js";
import {
    LUNAR_CRATER_FILTER_SCOPE_SHOW_ALL,
    LUNAR_CRATER_FILTER_SCOPE_HOVER,
    LUNAR_CRATER_FILTER_SCOPE_SYNCED,
    LUNAR_CRATER_FILTER_SCOPE_SEARCH,
    formatDiameterRange,
    normalizeFilterScope,
} from "./lunar-crater-control-model.js";

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
