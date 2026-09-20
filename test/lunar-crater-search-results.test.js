import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeEvent, installFakeDom } from "./helpers/fake-dom.js";
import {
    bindLunarCraterControlPanel,
    createLunarCraterControlPanelElements,
    readLunarCraterControlState,
    syncLunarCraterControlPanel,
} from "../src/platform/js/ui/lunar-crater-control-panel.js";
import { setLoadedLunarFeatureCatalogForTests } from "../src/platform/js/data/lunar-feature-catalog.js";

function feature(name, featureType, diameterKm, latitudeDeg = 0, longitudeDeg = 0) {
    return { name, cleanName: name, featureType, diameterKm, latitudeDeg, longitudeDeg };
}

/** Several craters share a prefix so a query can match more than one. */
const TEST_CATALOG = {
    display: {},
    features: [
        feature("Tycho", "Crater, craters", 85, -43.3, -11.4),
        feature("Tycho A", "Crater, craters", 5, -43.0, -11.0),
        feature("Tycho B", "Crater, craters", 12, -44.0, -12.0),
        feature("Copernicus", "Crater, craters", 96, 9.6, -20.1),
        feature("Plato", "Crater, craters", 100, 51.6, -9.3),
        feature("Mare Imbrium", "Mare, maria", 1146, 32.8, -15.6),
        feature("Mons Hadley", "Mons, montes", 25, 26.5, 4.7),
        feature("Rima Hadley", "Rima, rimae", 80, 25.0, 3.0),
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
    vi.restoreAllMocks();
});

/**
 * Only the search scope keeps the typed query; the other scopes replace it,
 * so the panel has to open on that tab for the results list to render.
 */
function makePanel() {
    const elements = createLunarCraterControlPanelElements(dom.document, {
        enableSyncedScope: true,
        initialFilterScope: "search",
    });
    dom.document.body.appendChild(elements.panel);
    return elements;
}

function search(elements, query) {
    elements.searchInput.value = query;
    syncLunarCraterControlPanel(elements, readLunarCraterControlState(elements));
    return elements.searchResultsContainer;
}

function resultRows(container) {
    const list = container.children.find((child) =>
        child.classList.contains("lunar-crater-controls-panel__search-results-list"));
    return list ? list.children : [];
}

function resultNames(container) {
    return resultRows(container)
        .filter((row) => row.dataset?.featureKey)
        .map((row) => row.children[2].children[0].textContent);
}

function headerCount(container) {
    const header = container.children.find((child) =>
        child.classList.contains("lunar-crater-controls-panel__search-results-header"));
    return header?.children[1]?.textContent || "";
}

describe("the search results list", () => {
    it("stays hidden and empty with no query", () => {
        const elements = makePanel();

        const container = search(elements, "");

        expect(container.hidden).toBe(true);
        expect(container.children).toHaveLength(0);
    });

    it("opens with one row per matching feature", () => {
        const elements = makePanel();

        const container = search(elements, "tycho");

        expect(container.hidden).toBe(false);
        // Larger features come first, so the prominent crater leads its satellites.
        expect(resultNames(container)).toEqual(["Tycho", "Tycho B", "Tycho A"]);
    });

    it("heads the list with the number of matches", () => {
        const elements = makePanel();

        const container = search(elements, "tycho");

        expect(headerCount(container)).toMatch(/^3 /);
        expect(headerCount(container)).toContain("found");
    });

    it("says so when a query matches nothing", () => {
        const elements = makePanel();

        const container = search(elements, "zzzz");

        expect(container.hidden).toBe(false);
        expect(resultRows(container)[0].textContent).toBe("No results");
        expect(resultNames(container)).toEqual([]);
    });

    it("clears the previous results when the query changes", () => {
        const elements = makePanel();
        search(elements, "tycho");

        const container = search(elements, "plato");

        expect(resultNames(container)).toEqual(["Plato"]);
    });

    it("closes again when the query is cleared", () => {
        const elements = makePanel();
        search(elements, "tycho");

        const container = search(elements, "");

        expect(container.hidden).toBe(true);
        expect(container.children).toHaveLength(0);
    });

    it("carries each feature key so a row can be toggled", () => {
        const elements = makePanel();

        const container = search(elements, "tycho");

        const keys = resultRows(container)
            .filter((row) => row.dataset?.featureKey)
            .map((row) => row.dataset.featureKey);
        expect(new Set(keys).size).toBe(3);
        expect(keys.every(Boolean)).toBe(true);
    });

    it("checks every row that is not excluded", () => {
        const elements = makePanel();

        const container = search(elements, "tycho");

        const checks = resultRows(container)
            .filter((row) => row.dataset?.featureKey)
            .map((row) => row.children[0].checked);
        expect(checks).toEqual([true, true, true]);
    });

    it("labels each row with its type and diameter", () => {
        const elements = makePanel();

        const container = search(elements, "copernicus");

        const meta = resultRows(container)[0].children[2].children[1].textContent;
        expect(meta).toContain("Crater");
        expect(meta).toContain("km");
    });

    it("gives every row a type colour swatch", () => {
        const elements = makePanel();

        const container = search(elements, "tycho");

        const swatch = resultRows(container)[0].children[1];
        expect(swatch.getAttribute("aria-hidden")).toBe("true");
        expect(swatch.classList.contains("lunar-crater-controls-panel__type-swatch")).toBe(true);
    });

    it("empties the list when there is no catalog loaded", () => {
        const elements = makePanel();
        search(elements, "tycho");

        setLoadedLunarFeatureCatalogForTests(null);
        const container = search(elements, "tycho");

        expect(container.hidden).toBe(true);
        expect(container.children).toHaveLength(0);
    });
});

describe("excluding a search result", () => {
    function bindPanel(elements) {
        const commits = [];
        bindLunarCraterControlPanel({
            elements,
            commitPatch: (patch) => {
                commits.push(patch);
                if (Object.prototype.hasOwnProperty.call(patch, "lunarFeatureExcludedKeys")) {
                    elements.searchResultsContainer.dataset.excludedKeys =
                        (patch.lunarFeatureExcludedKeys || []).join("\n");
                }
            },
            sync: () => syncLunarCraterControlPanel(elements, readLunarCraterControlState(elements)),
        });
        return commits;
    }

    it("publishes the excluded key when a row is unchecked", () => {
        const elements = makePanel();
        const commits = bindPanel(elements);
        const container = search(elements, "tycho");
        const row = resultRows(container)[0];

        row.children[0].checked = false;
        row.children[0].dispatchEvent(new FakeEvent("change", { bubbles: true }));

        const patch = commits.findLast((entry) =>
            Object.prototype.hasOwnProperty.call(entry, "lunarFeatureExcludedKeys"));
        expect(patch.lunarFeatureExcludedKeys).toEqual([row.dataset.featureKey]);
    });

    it("leaves the row unchecked on the next sync", () => {
        const elements = makePanel();
        bindPanel(elements);
        const container = search(elements, "tycho");
        const row = resultRows(container)[0];
        const key = row.dataset.featureKey;

        row.children[0].checked = false;
        row.children[0].dispatchEvent(new FakeEvent("change", { bubbles: true }));
        const afterSync = search(elements, "tycho");

        const rebuilt = resultRows(afterSync).find((entry) => entry.dataset?.featureKey === key);
        expect(rebuilt.children[0].checked).toBe(false);
    });

    it("drops the key again when the row is re-checked", () => {
        const elements = makePanel();
        const commits = bindPanel(elements);
        const container = search(elements, "tycho");
        const row = resultRows(container)[0];

        row.children[0].checked = false;
        row.children[0].dispatchEvent(new FakeEvent("change", { bubbles: true }));
        const reChecked = resultRows(search(elements, "tycho"))[0];
        reChecked.children[0].checked = true;
        reChecked.children[0].dispatchEvent(new FakeEvent("change", { bubbles: true }));

        const patch = commits.findLast((entry) =>
            Object.prototype.hasOwnProperty.call(entry, "lunarFeatureExcludedKeys"));
        expect(patch.lunarFeatureExcludedKeys).toEqual([]);
    });
});

describe("reading the search state back", () => {
    it("reports the trimmed query", () => {
        const elements = makePanel();
        elements.searchInput.value = "  tycho  ";

        expect(readLunarCraterControlState(elements).lunarFeatureSearchQuery).toBe("tycho");
    });

    it("reports an empty exclusion list by default", () => {
        const elements = makePanel();

        expect(readLunarCraterControlState(elements).lunarFeatureExcludedKeys).toEqual([]);
    });

    it("reports the stored exclusion list", () => {
        const elements = makePanel();
        elements.searchResultsContainer.dataset.excludedKeys = "a\nb";

        expect(readLunarCraterControlState(elements).lunarFeatureExcludedKeys).toEqual(["a", "b"]);
    });
});
