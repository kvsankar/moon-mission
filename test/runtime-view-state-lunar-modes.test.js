import { describe, expect, it } from "vitest";

import { createRuntimeViewState } from "../src/platform/js/core/state/runtime-view-state.js";

/**
 * `lunarCraterShowAllEnabled` and `lunarCraterHoverEnabled` are the two Lunar
 * Features mode flags. Every other lunar feature key is remembered per view
 * identity, and `normalizeLunarCraterViewState` honours an explicit value in
 * preference to deriving one from the display mode. These tests pin that the
 * two mode flags follow the same contract.
 */
function identity(originMode, dimension = "3D") {
    return {
        originMode,
        dimension,
        cameraPositionMode: "manual",
        cameraLookMode: "manual",
        planeSelection: "DEFAULT",
    };
}

describe("explicit lunar feature mode flags", () => {
    it("honours an explicit show-all flag instead of deriving it", () => {
        const state = createRuntimeViewState({ initialConfig: "lunar" });

        state.setViewFlags({
            viewLunarCraters: true,
            lunarCraterDisplayMode: "hover",
            lunarCraterShowAllEnabled: true,
            lunarCraterHoverEnabled: false,
        });

        expect(state.getLunarCraterShowAllEnabled()).toBe(true);
        expect(state.getLunarCraterHoverEnabled()).toBe(false);
    });

    it("still derives the mode flags when the patch omits them", () => {
        const state = createRuntimeViewState({ initialConfig: "lunar" });

        state.setViewFlags({ lunarCraterDisplayMode: "always" });
        state.setViewFlags({ viewLunarCraters: true });

        expect(state.getLunarCraterShowAllEnabled()).toBe(true);
    });

    it("applies the dedicated mode setters", () => {
        const state = createRuntimeViewState({ initialConfig: "lunar" });

        state.setLunarCraterShowAllEnabled(true);
        expect(state.getLunarCraterShowAllEnabled()).toBe(true);

        state.setLunarCraterShowAllEnabled(false);
        state.setLunarCraterHoverEnabled(true);
        expect(state.getLunarCraterShowAllEnabled()).toBe(false);
        expect(state.getLunarCraterHoverEnabled()).toBe(true);
    });

    it("clears both mode flags when the features are switched off", () => {
        const state = createRuntimeViewState({ initialConfig: "lunar" });
        state.setViewFlags({ lunarCraterDisplayMode: "always" });
        state.setViewFlags({ viewLunarCraters: true });

        state.setViewFlags({ viewLunarCraters: false });

        expect(state.getLunarCraterShowAllEnabled()).toBe(false);
        expect(state.getLunarCraterHoverEnabled()).toBe(false);
    });
});

describe("per-view retention of the lunar feature mode flags", () => {
    it("remembers each view's mode selection across a view switch", () => {
        const state = createRuntimeViewState({ initialConfig: "geo" });
        state.setCurrentViewIdentity(identity("geo"));

        // Geocentric view: hover only.
        state.setCurrentViewIdentity(identity("lunar"), {
            previousViewFlags: {
                viewLunarCraters: true,
                lunarCraterDisplayMode: "hover",
                lunarCraterShowAllEnabled: false,
                lunarCraterHoverEnabled: true,
            },
        });

        // Selenocentric view: show always.
        state.setViewFlags({
            viewLunarCraters: true,
            lunarCraterDisplayMode: "always",
            lunarCraterShowAllEnabled: true,
            lunarCraterHoverEnabled: false,
        });
        expect(state.getLunarCraterShowAllEnabled()).toBe(true);

        // Back to the geocentric view: its own hover-only selection must return.
        const result = state.setCurrentViewIdentity(identity("geo"), {
            previousViewFlags: {
                viewLunarCraters: true,
                lunarCraterDisplayMode: "always",
                lunarCraterShowAllEnabled: true,
                lunarCraterHoverEnabled: false,
            },
        });

        expect(result.changed).toBe(true);
        expect(result.viewFlags.lunarCraterShowAllEnabled).toBe(false);
        expect(result.viewFlags.lunarCraterHoverEnabled).toBe(true);
    });

    it("seeds a brand-new view from the global defaults", () => {
        const state = createRuntimeViewState({ initialConfig: "geo" });

        const result = state.setCurrentViewIdentity(identity("lunar"));

        expect(typeof result.viewFlags.lunarCraterShowAllEnabled).toBe("boolean");
        expect(typeof result.viewFlags.lunarCraterHoverEnabled).toBe("boolean");
    });
});
