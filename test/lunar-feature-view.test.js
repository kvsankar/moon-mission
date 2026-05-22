import { describe, expect, it } from "vitest";

import {
    DEFAULT_LUNAR_FEATURE_TYPES,
    LUNAR_FEATURE_PRESET_IDS,
    createDefaultLunarFeatureViewState,
    normalizeLunarFeatureViewState,
} from "../src/platform/js/core/domain/lunar-feature-view.js";

describe("lunar feature view domain", () => {
    it("defaults to the first Lunar Features group only", () => {
        const state = createDefaultLunarFeatureViewState();
        const enabledTypes = Object.entries(state.lunarFeatureTypeFilters)
            .filter(([, filter]) => filter.enabled !== false)
            .map(([featureType]) => featureType)
            .sort();

        expect(enabledTypes).toEqual([...DEFAULT_LUNAR_FEATURE_TYPES].sort());
    });

    it("exposes the panel preset identifiers", () => {
        expect(LUNAR_FEATURE_PRESET_IDS.NONE).toBe("none");
        expect(LUNAR_FEATURE_PRESET_IDS.DEFAULT).toBe("default");
        expect(LUNAR_FEATURE_PRESET_IDS.ALL).toBe("all");
    });

    it("normalizes the Lunar Features search query", () => {
        expect(normalizeLunarFeatureViewState({
            lunarFeatureSearchQuery: "  Mare   Tranquillitatis  ",
        }).lunarFeatureSearchQuery).toBe("Mare Tranquillitatis");
    });

    it("treats search results as an active Lunar Features overlay", () => {
        const state = normalizeLunarFeatureViewState({
            lunarCraterShowAllEnabled: false,
            lunarCraterHoverEnabled: false,
            viewLunarCraters: false,
            lunarFeatureSearchQuery: "Orientale",
        });

        expect(state.lunarCraterShowAllEnabled).toBe(false);
        expect(state.lunarCraterHoverEnabled).toBe(false);
        expect(state.viewLunarCraters).toBe(true);
        expect(state.viewLunarFeatures).toBe(true);
    });

    it("treats pinned feature names as an active Lunar Features overlay", () => {
        const state = normalizeLunarFeatureViewState({
            lunarCraterShowAllEnabled: false,
            lunarCraterHoverEnabled: false,
            viewLunarCraters: false,
            lunarFeaturePinnedNames: ["Glushko", "Ohm"],
        });

        expect(state.lunarFeaturePinnedNames).toEqual(["Glushko", "Ohm"]);
        expect(state.viewLunarCraters).toBe(true);
        expect(state.viewLunarFeatures).toBe(true);
    });

    it("normalizes excluded lunar feature keys", () => {
        expect(normalizeLunarFeatureViewState({
            lunarFeatureExcludedKeys: [" Tycho ", "Tycho", "", null],
        }).lunarFeatureExcludedKeys).toEqual(["Tycho"]);
    });
});
