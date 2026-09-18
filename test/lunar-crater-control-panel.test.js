import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeEvent, installFakeDom } from "./helpers/fake-dom.js";
import {
    bindLunarCraterControlPanel,
    createLunarCraterControlPanelElements,
    getLunarCraterControlPanelElements,
    readLunarCraterControlState,
    syncLunarCraterControlPanel,
    writeLunarCraterControlState,
} from "../src/platform/js/ui/lunar-crater-control-panel.js";
import { setLoadedLunarFeatureCatalogForTests } from "../src/platform/js/data/lunar-feature-catalog.js";
import { createDefaultLunarFeatureViewState } from "../src/platform/js/core/domain/lunar-feature-view.js";

function feature(name, featureType, diameterKm, latitudeDeg = 0, longitudeDeg = 0) {
    return { name, cleanName: name, featureType, diameterKm, latitudeDeg, longitudeDeg };
}

/**
 * A small stand-in catalog carrying one entry for every feature type the
 * default filter set knows about, so preset comparisons and the generated type
 * rows behave the same way they do against the real catalog.
 */
const TEST_CATALOG = {
    display: {},
    features: [
        feature("Tycho", "Crater, craters", 85, -43.3, -11.4),
        feature("Copernicus", "Crater, craters", 96, 9.6, -20.1),
        feature("Plato", "Crater, craters", 100, 51.6, -9.3),
        feature("Mare Imbrium", "Mare, maria", 1146, 32.8, -15.6),
        feature("Mons Hadley", "Mons, montes", 25, 26.5, 4.7),
        feature("Rima Hadley", "Rima, rimae", 80, 25.0, 3.0),
        feature("Vallis Alpes", "Vallis, valles", 166, 48.5, 3.2),
        feature("Oceanus Procellarum", "Oceanus, oceani", 2568, 18.4, -57.4),
        feature("Tycho A", "Satellite Feature", 5, -43.0, -11.0),
        feature("Dorsum Azara", "Dorsum, dorsa", 105, 26.7, 19.3),
        feature("Catena Davy", "Catena, catenae", 50, -11.1, -7.0),
        feature("Promontorium Agarum", "Promontorium, promontoria", 66, 14.0, 66.4),
        feature("Palus Putredinis", "Palus, paludes", 153, 26.5, 0.4),
        feature("Planitia Descensus", "Planitia, planitiae", 40, 7.1, -64.4),
    ],
};

let dom = null;

beforeEach(() => {
    dom = installFakeDom();
    setLoadedLunarFeatureCatalogForTests(TEST_CATALOG);
});

afterEach(() => {
    setLoadedLunarFeatureCatalogForTests(null);
    dom?.restore();
    dom = null;
    vi.useRealTimers();
});

function makeElement(tag, id, props = {}) {
    const element = dom.document.createElement(tag);
    if (id) element.id = id;
    Object.assign(element, props);
    dom.document.body.appendChild(element);
    return element;
}

/**
 * `createLunarCraterControlPanelElements` deliberately leaves the mode toggles
 * and diameter step buttons null: those live in the runtime mission markup and
 * are resolved by `getLunarCraterControlPanelElements`. Recreate them here so
 * the sync/bind contracts for those controls can be exercised.
 */
function attachRuntimeToggles(elements, prefix = "lunar-crater") {
    const add = (key, idSuffix) => {
        const button = dom.document.createElement("button");
        button.id = `${prefix}-${idSuffix}`;
        elements.panel.appendChild(button);
        elements[key] = button;
        return button;
    };
    add("sitesToggle", "sites-toggle");
    add("offToggle", "off-toggle");
    add("visibleToggle", "visible-toggle");
    add("hoverToggle", "hover-toggle");
    add("showAllOffToggle", "show-all-off-toggle");
    add("showAllFilterToggle", "show-all-filter-toggle");
    add("hoverOffToggle", "hover-off-toggle");
    add("hoverFilterToggle", "hover-filter-toggle");
    add("minDiameterStepDown", "min-diameter-step-down");
    add("minDiameterStepUp", "min-diameter-step-up");
    add("maxDiameterStepDown", "max-diameter-step-down");
    add("maxDiameterStepUp", "max-diameter-step-up");
    elements.sitesInput = makeElement("input", "view-craters", { checked: true });
    return elements;
}

describe("getLunarCraterControlPanelElements", () => {
    it("resolves controls by the requested id prefix", () => {
        makeElement("div", "aux-crater-controls-panel");
        makeElement("input", "aux-crater-visible", { checked: true });
        makeElement("input", "aux-crater-min-diameter", { value: "12" });

        const elements = getLunarCraterControlPanelElements(dom.document, { idPrefix: "aux-crater" });

        expect(elements.idPrefix).toBe("aux-crater");
        expect(elements.panel?.id).toBe("aux-crater-controls-panel");
        expect(elements.visibleInput?.id).toBe("aux-crater-visible");
        expect(elements.minDiameterSlider?.value).toBe("12");
    });

    it("falls back to the runtime Lunar Features checkbox for the default prefix", () => {
        makeElement("input", "view-lunar-craters", { checked: true });
        makeElement("input", "view-craters", { checked: true });

        const elements = getLunarCraterControlPanelElements(dom.document);

        expect(elements.visibleInput?.id).toBe("view-lunar-craters");
        // `view-craters` is the legacy Moon Sites overlay, wired separately.
        expect(elements.sitesInput?.id).toBe("view-craters");
    });

    it("never binds the legacy Moon Sites overlay for a non-default prefix", () => {
        makeElement("input", "view-craters", { checked: true });

        const elements = getLunarCraterControlPanelElements(dom.document, { idPrefix: "composer-crater" });

        expect(elements.sitesInput).toBeNull();
        expect(elements.visibleInput).toBeNull();
    });

    it("resolves a pill only when one is requested", () => {
        makeElement("button", "crater-pill");

        expect(getLunarCraterControlPanelElements(dom.document).pill).toBeNull();
        expect(
            getLunarCraterControlPanelElements(dom.document, { pillId: "crater-pill" }).pill?.id,
        ).toBe("crater-pill");
    });

    it("recovers detached panel nodes that are no longer in the document", () => {
        const panel = makeElement("div", "lunar-crater-controls-panel");
        const searchWrap = dom.document.createElement("div");
        const searchInput = dom.document.createElement("input");
        searchInput.className = "lunar-crater-controls-panel__search-input";
        searchWrap.appendChild(searchInput);
        panel.__lunarCraterDetachedNodes = { searchWrap, statusRow: null };

        const elements = getLunarCraterControlPanelElements(dom.document);

        expect(elements.searchWrap).toBe(searchWrap);
        expect(elements.searchInput).toBe(searchInput);
    });

    it("tolerates a missing document reference", () => {
        const elements = getLunarCraterControlPanelElements(null);
        expect(elements.panel).toBeNull();
        expect(elements.minDiameterSlider).toBeNull();
    });
});

describe("readLunarCraterControlState", () => {
    it("derives show-all from a legacy always-mode control", () => {
        const visibleInput = makeElement("input", "view-lunar-craters", { checked: true });
        const modeInput = makeElement("input", "lunar-crater-display-mode", { value: "always" });
        const elements = { visibleInput, modeInput };

        const state = readLunarCraterControlState(elements);

        expect(state.lunarCraterShowAllEnabled).toBe(true);
        expect(state.viewLunarCraters).toBe(true);
        // With no hover checkbox present the legacy branch leaves hover on, so
        // legacy markup never silently drops hover labels.
        expect(state.lunarCraterHoverEnabled).toBe(true);
    });

    it("turns legacy hover off when the legacy hover checkbox is explicitly cleared", () => {
        const elements = {
            visibleInput: makeElement("input", "view-lunar-craters", { checked: true }),
            modeInput: makeElement("input", "lunar-crater-display-mode", { value: "always" }),
            hoverInput: makeElement("input", "lunar-crater-hover-labels", { checked: false }),
        };

        // `hoverInput` alone is not a "modern" mode control, so the legacy
        // branch still applies and honours the explicit `false`.
        expect(readLunarCraterControlState(elements).lunarCraterHoverEnabled).toBe(false);
    });

    it("treats a legacy hover mode as hover-only", () => {
        const visibleInput = makeElement("input", "view-lunar-craters", { checked: true });
        const modeInput = makeElement("input", "lunar-crater-display-mode", { value: "hover" });

        const state = readLunarCraterControlState({ visibleInput, modeInput });

        expect(state.lunarCraterShowAllEnabled).toBe(false);
        expect(state.lunarCraterHoverEnabled).toBe(true);
    });

    it("reads the modern show-all and hover checkboxes independently", () => {
        const showAllInput = makeElement("input", "lunar-crater-show-all-enabled", { checked: false });
        const hoverInput = makeElement("input", "lunar-crater-hover-labels", { checked: true });

        const state = readLunarCraterControlState({ showAllInput, hoverInput });

        expect(state.lunarCraterShowAllEnabled).toBe(false);
        expect(state.lunarCraterHoverEnabled).toBe(true);
        expect(state.viewLunarCraters).toBe(true);
    });

    it("reports features off when both modern modes are off", () => {
        const showAllInput = makeElement("input", "lunar-crater-show-all-enabled", { checked: false });
        const hoverInput = makeElement("input", "lunar-crater-hover-labels", { checked: false });

        const state = readLunarCraterControlState({ showAllInput, hoverInput });

        expect(state.viewLunarCraters).toBe(false);
    });

    it("reads the diameter range and search query from the live controls", () => {
        const elements = {
            minDiameterSlider: makeElement("input", "lunar-crater-min-diameter", { value: "40" }),
            maxDiameterSlider: makeElement("input", "lunar-crater-max-diameter", { value: "300" }),
            searchInput: makeElement("input", "lunar-crater-search", { value: "  tycho   crater " }),
        };

        const state = readLunarCraterControlState(elements);

        expect(state.lunarCraterMinDiameterKm).toBe(40);
        expect(state.lunarCraterMaxDiameterKm).toBe(300);
        // The search scope is not active, so the query is not promoted.
        expect(state.lunarFeatureSearchQuery).toBe("");
    });

    it("promotes the query and exclusions only while the search scope is active", () => {
        const panel = makeElement("div", "lunar-crater-controls-panel");
        panel.dataset.filterScope = "search";
        const searchResultsContainer = makeElement("div", "lunar-crater-search-results");
        searchResultsContainer.dataset.excludedKeys = "a\nb\n\nb";
        const elements = {
            panel,
            searchInput: makeElement("input", "lunar-crater-search", { value: "mare" }),
            searchResultsContainer,
        };

        const state = readLunarCraterControlState(elements);

        expect(state.lunarFeatureSearchQuery).toBe("mare");
        expect(state.lunarFeatureExcludedKeys).toEqual(["a", "b"]);
    });

    it("keeps hover ranges separate from show-all ranges", () => {
        const panel = makeElement("div", "lunar-crater-controls-panel");
        panel.dataset.filterScope = "hover";
        const elements = {
            panel,
            minDiameterSlider: makeElement("input", "lunar-crater-min-diameter", { value: "7" }),
            maxDiameterSlider: makeElement("input", "lunar-crater-max-diameter", { value: "70" }),
        };

        const state = readLunarCraterControlState(elements);

        expect(state.lunarCraterHoverMinDiameterKm).toBe(7);
        expect(state.lunarCraterHoverMaxDiameterKm).toBe(70);
        expect(state.lunarCraterMinDiameterKm).not.toBe(7);
    });
});

describe("writeLunarCraterControlState", () => {
    function makeWritableElements() {
        const panel = makeElement("div", "lunar-crater-controls-panel");
        // Keep the panel closed so the module never kicks off a catalog fetch.
        panel.hidden = true;
        return {
            panel,
            visibleInput: makeElement("input", "view-lunar-craters"),
            showAllInput: makeElement("input", "lunar-crater-show-all-enabled"),
            hoverInput: makeElement("input", "lunar-crater-hover-labels"),
            modeInput: makeElement("input", "lunar-crater-display-mode", { value: "always" }),
            sitesInput: makeElement("input", "view-craters", { checked: true }),
            minDiameterSlider: makeElement("input", "lunar-crater-min-diameter", { value: "1" }),
            maxDiameterSlider: makeElement("input", "lunar-crater-max-diameter", { value: "1000" }),
            diameterValue: makeElement("output", "lunar-crater-diameter-value"),
            searchInput: makeElement("input", "lunar-crater-search"),
            searchResultsContainer: makeElement("div", "lunar-crater-search-results"),
            countValue: makeElement("span", "lunar-crater-count-value"),
            nudge: makeElement("div", "lunar-crater-nudge"),
        };
    }

    it("mirrors an applied mode patch onto every mode control", () => {
        const elements = makeWritableElements();

        writeLunarCraterControlState(elements, {
            lunarCraterShowAllEnabled: true,
            lunarCraterHoverEnabled: false,
            viewLunarCraters: true,
        });

        expect(elements.showAllInput.checked).toBe(true);
        expect(elements.hoverInput.checked).toBe(false);
        expect(elements.visibleInput.checked).toBe(true);
    });

    it("stores normalized state on the panel so later reads are stable", () => {
        const elements = makeWritableElements();

        writeLunarCraterControlState(elements, { lunarCraterMinDiameterKm: 25, lunarCraterMaxDiameterKm: 250 });

        expect(elements.panel.__lunarCraterControlState.lunarCraterMinDiameterKm).toBe(25);
        expect(elements.minDiameterSlider.value).toBe("25");
        expect(elements.maxDiameterSlider.value).toBe("250");
    });

    it("renders the diameter range into both the value and text of the output", () => {
        const elements = makeWritableElements();

        writeLunarCraterControlState(elements, { lunarCraterMinDiameterKm: 12.5, lunarCraterMaxDiameterKm: 300 });

        expect(elements.diameterValue.value).toBe("12.5-300 km");
        expect(elements.diameterValue.textContent).toBe("12.5-300 km");
    });

    it("only follows the Moon Sites checkbox when the patch mentions it", () => {
        const elements = makeWritableElements();

        writeLunarCraterControlState(elements, { lunarCraterShowAllEnabled: true });
        expect(elements.sitesInput.checked).toBe(true);

        writeLunarCraterControlState(elements, { viewCraters: false });
        expect(elements.sitesInput.checked).toBe(false);
    });

    it("reports the filtered feature count from the seeded catalog", () => {
        const elements = makeWritableElements();

        writeLunarCraterControlState(elements, {
            lunarCraterShowAllEnabled: true,
            lunarCraterMinDiameterKm: 0,
            lunarCraterMaxDiameterKm: 6000,
        });

        // The range is clamped to the 0-600 km control range, and the default
        // type filters keep only craters, maria, montes and rimae. That leaves
        // the three craters plus Mons Hadley and Rima Hadley; Mare Imbrium and
        // Oceanus Procellarum are above 600 km, and every other catalog entry
        // belongs to a type that is disabled by default.
        expect(elements.countValue.textContent).toBe("5 filtered");
    });

    it("nudges the user to pick a mode while both modes are off", () => {
        const elements = makeWritableElements();

        writeLunarCraterControlState(elements, {
            lunarCraterShowAllEnabled: false,
            lunarCraterHoverEnabled: false,
        });

        expect(elements.nudge.hidden).toBe(false);
        expect(elements.nudge.textContent).toContain("Choose Recommended or All");
    });

    it("reports an unavailable catalog instead of a feature count", () => {
        setLoadedLunarFeatureCatalogForTests(null);
        const elements = makeWritableElements();

        writeLunarCraterControlState(elements, { lunarCraterShowAllEnabled: true });

        expect(elements.countValue.textContent).toBe("Features not loaded");
        expect(elements.nudge.textContent).toBe("Open Lunar Features to load the catalog.");
    });

    it("writes the search query and exclusions while the search scope is active", () => {
        const elements = makeWritableElements();
        elements.panel.dataset.filterScope = "search";

        writeLunarCraterControlState(elements, {
            lunarFeatureSearchQuery: "mare",
            lunarFeatureExcludedKeys: ["k1", "k2"],
        });

        expect(elements.searchInput.value).toBe("mare");
        expect(elements.searchResultsContainer.dataset.excludedKeys).toBe("k1\nk2");
    });
});

describe("crater control panel construction", () => {
    it("builds the show-all layout by default and hides the panel", () => {
        const elements = createLunarCraterControlPanelElements(dom.document);

        expect(elements.panel.hidden).toBe(true);
        expect(elements.panel.dataset.filterScope).toBe("showAll");
        expect(elements.filterScopeSynced).toBeNull();
        expect(elements.tabPanelBody.children).toContain(elements.presetContainer);
        expect(elements.tabPanelBody.children).not.toContain(elements.searchWrap);
    });

    it("opens directly on the synced scope when that scope is enabled", () => {
        const elements = createLunarCraterControlPanelElements(dom.document, {
            idPrefix: "composer-crater",
            enableSyncedScope: true,
        });

        expect(elements.panel.dataset.filterScope).toBe("synced");
        expect(elements.filterScopeSynced?.id).toBe("composer-crater-filter-scope-synced");
        expect(elements.tabPanelBody.children).toContain(elements.syncedControlsContainer);
        expect(elements.tabPanelBody.getAttribute("aria-labelledby"))
            .toBe("composer-crater-filter-scope-synced");
    });

    it("ignores a synced initial scope when the synced tab is not enabled", () => {
        const elements = createLunarCraterControlPanelElements(dom.document, {
            initialFilterScope: "synced",
        });

        expect(elements.panel.dataset.filterScope).toBe("showAll");
    });

    it("opens on the search scope when requested with the synced tab enabled", () => {
        const elements = createLunarCraterControlPanelElements(dom.document, {
            enableSyncedScope: true,
            initialFilterScope: "search",
        });

        expect(elements.panel.dataset.filterScope).toBe("search");
        expect(elements.tabPanelBody.children).toContain(elements.searchWrap);
        expect(elements.tabPanelBody.children).toContain(elements.searchResultsContainer);
    });

    it("prefixes every generated control id", () => {
        const elements = createLunarCraterControlPanelElements(dom.document, { idPrefix: "aux" });

        expect(elements.panel.id).toBe("aux-controls-panel");
        expect(elements.minDiameterSlider.id).toBe("aux-min-diameter");
        expect(elements.maxDiameterSlider.id).toBe("aux-max-diameter");
        expect(elements.searchInput.id).toBe("aux-search");
    });
});

describe("syncLunarCraterControlPanel", () => {
    let elements = null;

    beforeEach(() => {
        elements = attachRuntimeToggles(createLunarCraterControlPanelElements(dom.document));
        dom.document.body.appendChild(elements.panel);
    });

    it("builds one type row per catalog feature type present", () => {
        syncLunarCraterControlPanel(elements, { lunarCraterShowAllEnabled: true });

        expect(elements.typeFilterContainer.dataset.lunarFeatureTypesBuilt).toBe("true");
        expect([...elements.typeControls.keys()].sort()).toEqual([
            "Catena, catenae",
            "Crater, craters",
            "Dorsum, dorsa",
            "Mare, maria",
            "Mons, montes",
            "Oceanus, oceani",
            "Palus, paludes",
            "Planitia, planitiae",
            "Promontorium, promontoria",
            "Rima, rimae",
            "Satellite Feature",
            "Vallis, valles",
        ]);
    });

    it("opens the first feature-type group and leaves the others collapsed", () => {
        syncLunarCraterControlPanel(elements, { lunarCraterShowAllEnabled: true });

        const groups = elements.typeFilterContainer
            .querySelectorAll(".lunar-crater-controls-panel__type-group");
        expect(groups.length).toBeGreaterThan(1);
        expect(groups[0].dataset.active).toBe("true");
        expect(groups.slice(1).every((group) => group.dataset.active === "false")).toBe(true);
    });

    it("marks the active scope tab and deactivates the others", () => {
        syncLunarCraterControlPanel(elements, { lunarCraterShowAllEnabled: true });

        expect(elements.filterScopeShowAll.getAttribute("aria-selected")).toBe("true");
        expect(elements.filterScopeShowAll.getAttribute("tabindex")).toBe("0");
        expect(elements.filterScopeHover.getAttribute("aria-selected")).toBe("false");
        expect(elements.filterScopeSearch.getAttribute("tabindex")).toBe("-1");
    });

    it("reflects the mode toggles in their pressed state and labels", () => {
        syncLunarCraterControlPanel(elements, {
            lunarCraterShowAllEnabled: true,
            lunarCraterHoverEnabled: false,
        });

        expect(elements.showAllFilterToggle.getAttribute("aria-pressed")).toBe("true");
        expect(elements.showAllOffToggle.getAttribute("aria-pressed")).toBe("false");
        expect(elements.hoverFilterToggle.getAttribute("aria-pressed")).toBe("false");
        expect(elements.hoverOffToggle.textContent).toBe("Off");
    });

    it("disables every interactive control when the panel is disabled", () => {
        elements.disabled = true;

        syncLunarCraterControlPanel(elements, { lunarCraterShowAllEnabled: true });

        expect(elements.minDiameterSlider.disabled).toBe(true);
        expect(elements.minDiameterSlider.getAttribute("aria-disabled")).toBe("true");
        expect(elements.closeButton.disabled).toBe(true);
        expect(elements.searchInput.disabled).toBe(true);
        expect(elements.filterScopeShowAll.disabled).toBe(true);
        expect([...elements.typeControls.values()].every((controls) => controls.toggle.disabled))
            .toBe(true);
    });

    it("marks the preset that matches the current type filters", () => {
        // A state with no explicit type filters normalizes to every type
        // enabled, which is exactly the "All" preset.
        syncLunarCraterControlPanel(elements, { lunarCraterShowAllEnabled: true });

        expect(elements.presetButtons.get("all").getAttribute("aria-pressed")).toBe("true");
        expect(elements.presetButtons.get("default").getAttribute("aria-pressed")).toBe("false");
        expect(elements.presetButtons.get("none").getAttribute("aria-pressed")).toBe("false");
    });

    it("marks the Recommended preset for the default filter set", () => {
        syncLunarCraterControlPanel(elements, createDefaultLunarFeatureViewState({
            lunarCraterShowAllEnabled: true,
        }));

        expect(elements.presetButtons.get("default").getAttribute("aria-pressed")).toBe("true");
        expect(elements.presetButtons.get("all").getAttribute("aria-pressed")).toBe("false");
    });

    it("marks the Off preset when the mode is disabled", () => {
        syncLunarCraterControlPanel(elements, {
            lunarCraterShowAllEnabled: false,
            lunarCraterHoverEnabled: false,
        });

        expect(elements.presetButtons.get("none").getAttribute("aria-pressed")).toBe("true");
        expect(elements.presetButtons.get("default").getAttribute("aria-pressed")).toBe("false");
    });

    it("swaps the tab body to the search controls for the search scope", () => {
        elements.panel.dataset.filterScope = "search";

        syncLunarCraterControlPanel(elements, { lunarCraterShowAllEnabled: true });

        expect(elements.searchWrap.parentNode).toBe(elements.tabPanelBody);
        expect(elements.presetContainer.parentNode).not.toBe(elements.tabPanelBody);
        expect(elements.typeFilterContainer.hidden).toBe(true);
        expect(elements.tabPanelBody.getAttribute("aria-labelledby"))
            .toBe(elements.filterScopeSearch.id);
    });

    it("renders search results with a per-feature exclusion checkbox", () => {
        elements.panel.dataset.filterScope = "search";

        syncLunarCraterControlPanel(elements, {
            lunarCraterShowAllEnabled: true,
            lunarFeatureSearchQuery: "tycho",
        });

        expect(elements.searchResultsContainer.hidden).toBe(false);
        const rows = elements.searchResultsContainer
            .querySelectorAll(".lunar-crater-controls-panel__search-result");
        expect(rows.map((row) => row.querySelector(".lunar-crater-controls-panel__search-result-name").textContent))
            .toEqual(["Tycho", "Tycho A"]);
        expect(rows.every((row) => row.querySelector("input").checked)).toBe(true);
    });

    it("unchecks a search result that is already excluded", () => {
        elements.panel.dataset.filterScope = "search";

        syncLunarCraterControlPanel(elements, {
            lunarCraterShowAllEnabled: true,
            lunarFeatureSearchQuery: "tycho",
            lunarFeatureExcludedKeys: ["Tycho|Crater, craters|-43.3000|-11.4000"],
        });

        const checkboxes = elements.searchResultsContainer
            .querySelectorAll(".lunar-crater-controls-panel__search-result-check");
        expect(checkboxes.map((checkbox) => checkbox.checked)).toEqual([false, true]);
    });

    it("reports an empty result list for a query with no matches", () => {
        elements.panel.dataset.filterScope = "search";

        syncLunarCraterControlPanel(elements, {
            lunarCraterShowAllEnabled: true,
            lunarFeatureSearchQuery: "zzzz-no-such-feature",
        });

        expect(
            elements.searchResultsContainer
                .querySelector(".lunar-crater-controls-panel__search-results-empty")
                ?.textContent,
        ).toBe("No results");
    });

    it("hides the results container when the query is cleared", () => {
        elements.panel.dataset.filterScope = "search";

        syncLunarCraterControlPanel(elements, {
            lunarCraterShowAllEnabled: true,
            lunarFeatureSearchQuery: "",
        });

        expect(elements.searchResultsContainer.hidden).toBe(true);
    });
});

describe("bindLunarCraterControlPanel", () => {
    let elements = null;
    let commitPatch = null;
    let dispose = null;

    beforeEach(() => {
        vi.useFakeTimers();
        elements = attachRuntimeToggles(createLunarCraterControlPanelElements(dom.document));
        dom.document.body.appendChild(elements.panel);
        commitPatch = vi.fn();
        dispose = bindLunarCraterControlPanel({ elements, commitPatch });
        commitPatch.mockClear();
    });

    afterEach(() => {
        dispose?.();
        dispose = null;
    });

    function click(element) {
        element.dispatchEvent(new FakeEvent("click", { bubbles: true }));
    }

    it("turns both modes off through the Off toggle", () => {
        click(elements.offToggle);

        expect(commitPatch).toHaveBeenCalledWith(
            expect.objectContaining({
                viewLunarCraters: false,
                lunarCraterShowAllEnabled: false,
                lunarCraterHoverEnabled: false,
            }),
            expect.objectContaining({ sourceId: "lunar-crater-off-toggle" }),
        );
    });

    it("keeps features visible when only one of the two modes is switched off", () => {
        click(elements.hoverFilterToggle);
        commitPatch.mockClear();
        click(elements.showAllFilterToggle);
        commitPatch.mockClear();

        click(elements.showAllOffToggle);

        expect(commitPatch).toHaveBeenCalledWith(
            { lunarCraterShowAllEnabled: false, viewLunarCraters: true },
            expect.objectContaining({ sourceId: "lunar-crater-show-all-off-toggle" }),
        );
    });

    it("switches the edited filter scope with the mode filter tabs", () => {
        click(elements.hoverFilterToggle);
        expect(elements.panel.dataset.filterScope).toBe("hover");

        click(elements.showAllFilterToggle);
        expect(elements.panel.dataset.filterScope).toBe("showAll");
    });

    it("changes scope without committing state when a scope tab is selected", () => {
        click(elements.filterScopeSearch);

        expect(elements.panel.dataset.filterScope).toBe("search");
        expect(commitPatch).not.toHaveBeenCalled();
    });

    it("moves between scope tabs with the arrow keys", () => {
        elements.filterScopeShowAll.focus();
        const event = new FakeEvent("keydown", { bubbles: true });
        event.key = "ArrowRight";
        elements.filterScopeShowAll.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
        expect(elements.panel.dataset.filterScope).toBe("hover");
        expect(dom.document.activeElement).toBe(elements.filterScopeHover);
    });

    it("wraps from the last scope tab back to the first", () => {
        const event = new FakeEvent("keydown", { bubbles: true });
        event.key = "ArrowLeft";
        elements.filterScopeShowAll.dispatchEvent(event);

        expect(elements.panel.dataset.filterScope).toBe("search");
    });

    it("ignores unrelated keys on the scope tab strip", () => {
        const event = new FakeEvent("keydown", { bubbles: true });
        event.key = "a";
        elements.filterScopeShowAll.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(false);
        expect(elements.panel.dataset.filterScope).toBe("showAll");
    });

    it("applies a preset and enables the scope's mode in one commit", () => {
        const allPreset = elements.presetContainer.querySelector('[data-preset-id="all"]');

        click(allPreset);

        expect(commitPatch).toHaveBeenCalledTimes(1);
        const [patch] = commitPatch.mock.calls[0];
        expect(patch.lunarCraterShowAllEnabled).toBe(true);
        expect(patch.lunarFeatureTypeFilters["Satellite Feature"].enabled).toBe(true);
        expect(patch.lunarFeatureTypeFilters["Vallis, valles"].enabled).toBe(true);
    });

    it("disables the mode when the Off preset is chosen", () => {
        click(elements.presetContainer.querySelector('[data-preset-id="none"]'));

        const [patch] = commitPatch.mock.calls[0];
        expect(patch.lunarCraterShowAllEnabled).toBe(false);
        expect(Object.values(patch.lunarFeatureTypeFilters).every((entry) => entry.enabled === false))
            .toBe(true);
    });

    it("writes preset changes into the hover filter set while the hover scope is active", () => {
        click(elements.hoverFilterToggle);
        commitPatch.mockClear();

        click(elements.presetContainer.querySelector('[data-preset-id="all"]'));

        const [patch] = commitPatch.mock.calls[0];
        expect(patch.lunarFeatureHoverTypeFilters).toBeDefined();
        expect(patch.lunarFeatureTypeFilters).toBeUndefined();
        expect(patch.lunarCraterHoverEnabled).toBe(true);
    });

    it("ignores preset clicks that do not land on a preset button", () => {
        click(elements.presetContainer);
        expect(commitPatch).not.toHaveBeenCalled();
    });

    it("debounces diameter slider input into a single commit", () => {
        elements.minDiameterSlider.value = "40";
        elements.minDiameterSlider.dispatchEvent(new FakeEvent("input", { bubbles: true }));
        elements.minDiameterSlider.value = "60";
        elements.minDiameterSlider.dispatchEvent(new FakeEvent("input", { bubbles: true }));

        expect(commitPatch).not.toHaveBeenCalled();
        expect(elements.panel.classList.contains("is-busy")).toBe(true);

        vi.advanceTimersByTime(200);

        expect(commitPatch).toHaveBeenCalledTimes(1);
        expect(commitPatch.mock.calls[0][0].lunarCraterMinDiameterKm).toBe(60);
        expect(elements.panel.classList.contains("is-busy")).toBe(false);
    });

    it("pushes the maximum up when the minimum is dragged past it", () => {
        elements.maxDiameterSlider.value = "50";
        elements.minDiameterSlider.value = "500";
        elements.minDiameterSlider.dispatchEvent(new FakeEvent("input", { bubbles: true }));
        vi.advanceTimersByTime(200);

        const [patch] = commitPatch.mock.calls[0];
        expect(patch.lunarCraterMinDiameterKm).toBe(500);
        expect(patch.lunarCraterMaxDiameterKm).toBe(500);
    });

    it("pulls the minimum down when the maximum is dragged below it", () => {
        elements.minDiameterSlider.value = "500";
        elements.maxDiameterSlider.value = "50";
        elements.maxDiameterSlider.dispatchEvent(new FakeEvent("input", { bubbles: true }));
        vi.advanceTimersByTime(200);

        const [patch] = commitPatch.mock.calls[0];
        expect(patch.lunarCraterMinDiameterKm).toBe(50);
        expect(patch.lunarCraterMaxDiameterKm).toBe(50);
    });

    it("steps the diameter sliders by their step size", () => {
        const before = Number(elements.minDiameterSlider.value);
        const step = Number(elements.minDiameterSlider.step);

        click(elements.minDiameterStepUp);
        vi.advanceTimersByTime(200);

        expect(Number(elements.minDiameterSlider.value)).toBe(before + step);
        expect(commitPatch).toHaveBeenCalledTimes(1);
    });

    it("clamps a step below the slider minimum", () => {
        elements.minDiameterSlider.value = elements.minDiameterSlider.min;

        click(elements.minDiameterStepDown);
        vi.advanceTimersByTime(200);

        expect(elements.minDiameterSlider.value).toBe(String(Number(elements.minDiameterSlider.min)));
    });

    it("does not step a disabled slider", () => {
        elements.minDiameterSlider.disabled = true;

        click(elements.minDiameterStepDown);
        vi.advanceTimersByTime(200);

        expect(commitPatch).not.toHaveBeenCalled();
    });

    it("commits a type toggle immediately", () => {
        const row = elements.typeFilterContainer
            .querySelector('[data-feature-type="Mare, maria"]');
        const toggle = row.querySelector(".lunar-crater-controls-panel__type-toggle");
        toggle.checked = false;

        toggle.dispatchEvent(new FakeEvent("change", { bubbles: true }));

        expect(commitPatch).toHaveBeenCalledTimes(1);
        const [patch, options] = commitPatch.mock.calls[0];
        expect(patch.lunarFeatureTypeFilters["Mare, maria"].enabled).toBe(false);
        expect(options.sourceId).toContain("Mare, maria");
    });

    it("records an explicit per-type range once a type slider is moved", () => {
        const row = elements.typeFilterContainer
            .querySelector('[data-feature-type="Crater, craters"]');
        const minSlider = row.querySelector(".lunar-crater-controls-panel__type-slider--min");
        minSlider.value = "120";

        minSlider.dispatchEvent(new FakeEvent("change", { bubbles: true }));

        expect(row.dataset.typeMinExplicit).toBe("true");
        const [patch] = commitPatch.mock.calls[0];
        expect(patch.lunarFeatureTypeFilters["Crater, craters"].minDiameterKm).toBe(120);
    });

    it("debounces continuous type-slider input", () => {
        const row = elements.typeFilterContainer
            .querySelector('[data-feature-type="Crater, craters"]');
        const maxSlider = row.querySelector(".lunar-crater-controls-panel__type-slider--max");
        maxSlider.value = "200";

        maxSlider.dispatchEvent(new FakeEvent("input", { bubbles: true }));
        expect(commitPatch).not.toHaveBeenCalled();

        vi.advanceTimersByTime(200);
        expect(commitPatch).toHaveBeenCalledTimes(1);
    });

    it("ignores type events that do not come from a known row", () => {
        const stray = dom.document.createElement("input");
        elements.typeFilterContainer.appendChild(stray);

        stray.dispatchEvent(new FakeEvent("change", { bubbles: true }));

        expect(commitPatch).not.toHaveBeenCalled();
    });

    it("commits the search query as the user types", () => {
        click(elements.filterScopeSearch);
        elements.searchInput.value = "plato";

        elements.searchInput.dispatchEvent(new FakeEvent("input", { bubbles: true }));

        expect(commitPatch).toHaveBeenCalledWith(
            expect.objectContaining({ lunarFeatureSearchQuery: "plato", lunarFeatureExcludedKeys: [] }),
            expect.objectContaining({ sourceId: "lunar-crater-search" }),
        );
    });

    it("excludes a feature when its search result checkbox is cleared", () => {
        click(elements.filterScopeSearch);
        elements.searchInput.value = "tycho";
        elements.searchInput.dispatchEvent(new FakeEvent("input", { bubbles: true }));
        commitPatch.mockClear();

        const checkbox = elements.searchResultsContainer
            .querySelector(".lunar-crater-controls-panel__search-result-check");
        checkbox.checked = false;
        checkbox.dispatchEvent(new FakeEvent("change", { bubbles: true }));

        const [patch] = commitPatch.mock.calls[0];
        expect(patch.lunarFeatureExcludedKeys).toEqual([checkbox.dataset.featureKey]);
    });

    it("re-includes a feature when its checkbox is set again", () => {
        click(elements.filterScopeSearch);
        elements.searchInput.value = "tycho";
        elements.searchInput.dispatchEvent(new FakeEvent("input", { bubbles: true }));
        const checkbox = elements.searchResultsContainer
            .querySelector(".lunar-crater-controls-panel__search-result-check");
        checkbox.checked = false;
        checkbox.dispatchEvent(new FakeEvent("change", { bubbles: true }));
        commitPatch.mockClear();

        const refreshed = elements.searchResultsContainer
            .querySelector(".lunar-crater-controls-panel__search-result-check");
        refreshed.checked = true;
        refreshed.dispatchEvent(new FakeEvent("change", { bubbles: true }));

        expect(commitPatch.mock.calls[0][0].lunarFeatureExcludedKeys).toEqual([]);
    });

    it("hides the panel from the close button", () => {
        elements.panel.hidden = false;

        click(elements.closeButton);

        expect(elements.panel.hidden).toBe(true);
    });

    it("flushes a pending diameter commit before an immediate commit", () => {
        elements.minDiameterSlider.value = "80";
        elements.minDiameterSlider.dispatchEvent(new FakeEvent("input", { bubbles: true }));

        click(elements.offToggle);

        expect(commitPatch).toHaveBeenCalledTimes(2);
        expect(commitPatch.mock.calls[0][0].lunarCraterMinDiameterKm).toBe(80);
        expect(commitPatch.mock.calls[1][0].viewLunarCraters).toBe(false);
    });

    it("cancels pending commits and detaches listeners on disposal", () => {
        elements.minDiameterSlider.value = "90";
        elements.minDiameterSlider.dispatchEvent(new FakeEvent("input", { bubbles: true }));

        dispose();
        dispose = null;
        vi.advanceTimersByTime(500);
        click(elements.offToggle);

        expect(commitPatch).not.toHaveBeenCalled();
        expect(elements.panel.classList.contains("is-busy")).toBe(false);
    });

    it("uses a caller-supplied sync function instead of the built-in one", () => {
        dispose?.();
        const sync = vi.fn();

        dispose = bindLunarCraterControlPanel({ elements, commitPatch, sync });

        expect(sync).toHaveBeenCalledTimes(1);
        sync.mockClear();
        click(elements.offToggle);
        expect(sync).toHaveBeenCalledTimes(1);
    });
});
