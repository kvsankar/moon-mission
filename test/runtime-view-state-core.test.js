import { describe, expect, it } from "vitest";

import {
    buildViewIdentityKey,
    createRuntimeViewState,
    normalizeViewIdentity,
} from "../src/platform/js/core/state/runtime-view-state.js";

function identity(overrides = {}) {
    return {
        originMode: "geo",
        cameraPositionMode: "manual",
        cameraLookMode: "manual",
        planeSelection: "DEFAULT",
        dimension: "3D",
        ...overrides,
    };
}

describe("view identity normalization", () => {
    it("fills every field from the documented defaults", () => {
        expect(normalizeViewIdentity()).toEqual({
            originMode: "geo",
            cameraPositionMode: "manual",
            cameraLookMode: "manual",
            planeSelection: "DEFAULT",
            dimension: "3D",
        });
    });

    it("accepts `config` as an alias for the origin mode", () => {
        expect(normalizeViewIdentity({ config: "lunar" }).originMode).toBe("lunar");
    });

    it("prefers an explicit origin mode over the alias", () => {
        expect(normalizeViewIdentity({ originMode: "lunar", config: "geo" }).originMode)
            .toBe("lunar");
    });

    it("trims whitespace and falls back for blank fields", () => {
        expect(normalizeViewIdentity({ originMode: "  lunar  ", dimension: "   " }))
            .toMatchObject({ originMode: "lunar", dimension: "3D" });
    });

    it("ignores non-string fields", () => {
        expect(normalizeViewIdentity({ originMode: 42, planeSelection: null }))
            .toMatchObject({ originMode: "geo", planeSelection: "DEFAULT" });
    });
});

describe("view identity keys", () => {
    it("distinguishes every identity field", () => {
        const base = buildViewIdentityKey(identity());

        expect(buildViewIdentityKey(identity({ originMode: "lunar" }))).not.toBe(base);
        expect(buildViewIdentityKey(identity({ dimension: "2D" }))).not.toBe(base);
        expect(buildViewIdentityKey(identity({ planeSelection: "XY" }))).not.toBe(base);
        expect(buildViewIdentityKey(identity({ cameraPositionMode: "EARTH" }))).not.toBe(base);
        expect(buildViewIdentityKey(identity({ cameraLookMode: "MOON" }))).not.toBe(base);
    });

    it("is stable for equivalent identities", () => {
        expect(buildViewIdentityKey({ config: "lunar", dimension: "2D" }))
            .toBe(buildViewIdentityKey({ originMode: "lunar", dimension: "2D" }));
    });

    it("keeps the camera pair distinguishable in both directions", () => {
        expect(buildViewIdentityKey(identity({ cameraPositionMode: "A", cameraLookMode: "B" })))
            .not.toBe(buildViewIdentityKey(identity({ cameraPositionMode: "B", cameraLookMode: "A" })));
    });
});

describe("config and dimension transitions", () => {
    it("starts at revision zero", () => {
        expect(createRuntimeViewState().getTransitionRevision()).toBe(0);
    });

    it("counts a revision for each real origin change", () => {
        const state = createRuntimeViewState({ initialConfig: "geo" });

        state.setConfig("lunar");
        expect(state.getTransitionRevision()).toBe(1);

        state.setConfig("lunar");
        expect(state.getTransitionRevision()).toBe(1);

        state.setConfig("geo");
        expect(state.getTransitionRevision()).toBe(2);
    });

    it("counts a revision for each real dimension change", () => {
        const state = createRuntimeViewState({ initialCurrentDimension: "3D" });

        state.setCurrentDimension("2D");
        state.setCurrentDimension("2D");

        expect(state.getCurrentDimension()).toBe("2D");
        expect(state.getTransitionRevision()).toBe(1);
    });

    it("tracks the previous dimension and the changed flag separately", () => {
        const state = createRuntimeViewState();

        state.setPreviousDimension("3D");
        state.setDimensionChanged("yes");

        expect(state.getPreviousDimension()).toBe("3D");
        expect(state.getDimensionChanged()).toBe(true);
        expect(state.getTransitionRevision()).toBe(0);
    });
});

describe("global view flags", () => {
    it("exposes a defensive copy", () => {
        const state = createRuntimeViewState();
        const flags = state.getViewFlags();

        flags.viewOrbit = !flags.viewOrbit;

        expect(state.getViewFlags().viewOrbit).not.toBe(flags.viewOrbit);
    });

    it("applies an initial flag patch at construction", () => {
        const state = createRuntimeViewState({ initialViewFlags: { viewFPS: false, viewSky: false } });

        expect(state.getViewFPS()).toBe(false);
        expect(state.getViewSky()).toBe(false);
    });

    it("ignores a non-object patch", () => {
        const state = createRuntimeViewState();
        const before = state.getViewFlags();

        state.setViewFlags(null);
        state.setViewFlags("orbit");

        expect(state.getViewFlags()).toEqual(before);
    });

    it("coerces boolean flags", () => {
        const state = createRuntimeViewState();

        state.setViewFlags({ viewOrbit: 0, viewFPS: "yes" });

        expect(state.getViewOrbit()).toBe(false);
        expect(state.getViewFPS()).toBe(true);
    });

    it("keeps global flags shared across view identities", () => {
        const state = createRuntimeViewState({ initialConfig: "geo" });
        state.setCurrentViewIdentity(identity());
        state.setViewPhotoMode(true);

        state.setCurrentViewIdentity(identity({ originMode: "lunar" }));

        expect(state.getViewPhotoMode()).toBe(true);
    });

    it("ignores the viewLunarFeatures alias on the global path", () => {
        // `viewLunarCraters` is per-view, so the global apply blocks the alias
        // clause that would have written it.
        const state = createRuntimeViewState();

        state.setViewFlags({ viewLunarFeatures: true });

        expect(state.getViewLunarCraters()).toBe(false);
    });

    it("accepts the viewLunarFeatures alias in a per-view snapshot", () => {
        // `readViewSettings()` carries the derived `viewLunarFeatures` field,
        // and that snapshot is what `setCurrentViewIdentity` stores per view.
        const state = createRuntimeViewState({ initialConfig: "geo" });
        state.setCurrentViewIdentity(identity());

        state.setCurrentViewIdentity(identity({ originMode: "lunar" }), {
            previousViewFlags: { viewLunarFeatures: true, lunarCraterDisplayMode: "always" },
        });
        state.setCurrentViewIdentity(identity());

        expect(state.getViewLunarCraters()).toBe(true);
        expect(state.getViewLunarFeatures()).toBe(true);
    });

    it("lets an explicit crater toggle override the alias in the same patch", () => {
        const state = createRuntimeViewState({ initialConfig: "geo" });
        state.setCurrentViewIdentity(identity());

        state.setCurrentViewIdentity(identity({ originMode: "lunar" }), {
            previousViewFlags: { viewLunarFeatures: true, viewLunarCraters: false },
        });
        state.setCurrentViewIdentity(identity());

        expect(state.getViewLunarCraters()).toBe(false);
    });
});

describe("orbit style and trail brightness", () => {
    it("accepts only the two authored orbit styles", () => {
        const state = createRuntimeViewState();

        state.setOrbitStyle("trail");
        expect(state.getOrbitStyle()).toBe("trail");

        state.setOrbitStyle("something-else");
        expect(state.getOrbitStyle()).toBe("classic");
    });

    it("keeps trail brightness numeric with a unit default", () => {
        const state = createRuntimeViewState();

        state.setTrailTrackBrightness2D(0.25);
        expect(state.getTrailTrackBrightness2D()).toBe(0.25);

        state.setTrailTrackBrightness2D(Number.NaN);
        expect(state.getTrailTrackBrightness2D()).toBe(1);

        state.setTrailTailBrightness3D("bright");
        expect(state.getTrailTailBrightness3D()).toBe(1);
    });
});

describe("per-view lunar feature state", () => {
    it("keeps each view's diameter range separate", () => {
        const state = createRuntimeViewState({ initialConfig: "geo" });
        state.setCurrentViewIdentity(identity());
        state.setLunarCraterMinDiameterKm(40);
        state.setLunarCraterMaxDiameterKm(400);

        state.setCurrentViewIdentity(identity({ originMode: "lunar" }));
        expect(state.getLunarCraterMinDiameterKm()).not.toBe(40);

        state.setCurrentViewIdentity(identity());
        expect(state.getLunarCraterMinDiameterKm()).toBe(40);
        expect(state.getLunarCraterMaxDiameterKm()).toBe(400);
    });

    it("keeps each view's search query and exclusions separate", () => {
        const state = createRuntimeViewState({ initialConfig: "geo" });
        state.setCurrentViewIdentity(identity());
        state.setLunarFeatureSearchQuery("  tycho   crater ");
        state.setLunarFeatureExcludedKeys(["a", "b", "a"]);

        expect(state.getLunarFeatureSearchQuery()).toBe("tycho crater");
        expect(state.getLunarFeatureExcludedKeys()).toEqual(["a", "b"]);

        state.setCurrentViewIdentity(identity({ dimension: "2D" }));
        expect(state.getLunarFeatureSearchQuery()).toBe("");
    });

    it("reports the display mode as a projection of the show-all flag", () => {
        // The effective mode is recomputed from the mode flags, so it only
        // reads back as "always" while show-all is actually on.
        const state = createRuntimeViewState();

        state.setLunarCraterDisplayMode("always");
        expect(state.getLunarCraterDisplayMode()).toBe("hover");

        state.setLunarCraterShowAllEnabled(true);
        expect(state.getLunarCraterDisplayMode()).toBe("always");

        state.setLunarCraterShowAllEnabled(false);
        expect(state.getLunarCraterDisplayMode()).toBe("hover");
    });

    it("drives the derived mode flags from a stored display mode", () => {
        const state = createRuntimeViewState();

        state.setLunarCraterDisplayMode("always");
        state.setViewLunarCraters(true);

        expect(state.getLunarCraterShowAllEnabled()).toBe(true);
        expect(state.getLunarCraterDisplayMode()).toBe("always");
    });

    it("normalizes type filters against the defaults", () => {
        const state = createRuntimeViewState();

        state.setLunarFeatureTypeFilters({ "Mare, maria": { enabled: false } });

        const filters = state.getLunarFeatureTypeFilters();
        expect(filters["Mare, maria"].enabled).toBe(false);
        expect(filters["Crater, craters"]).toBeDefined();
    });

    it("swaps an inverted diameter range", () => {
        const state = createRuntimeViewState();

        state.setViewFlags({
            lunarCraterMinDiameterKm: 400,
            lunarCraterMaxDiameterKm: 40,
        });

        expect(state.getLunarCraterMinDiameterKm())
            .toBeLessThanOrEqual(state.getLunarCraterMaxDiameterKm());
    });

    it("keeps the hover diameter range independent of the show-all range", () => {
        const state = createRuntimeViewState();

        state.setLunarCraterMinDiameterKm(40);
        state.setLunarCraterHoverMinDiameterKm(5);

        expect(state.getLunarCraterMinDiameterKm()).toBe(40);
        expect(state.getLunarCraterHoverMinDiameterKm()).toBe(5);
    });

    it("turns the lunar features on through the feature alias setter", () => {
        const state = createRuntimeViewState();

        state.setViewLunarFeatures(true);
        expect(state.getViewLunarCraters()).toBe(true);

        state.setViewLunarFeatures(false);
        expect(state.getViewLunarCraters()).toBe(false);
    });

    it("keeps the Moon sites overlay per view", () => {
        const state = createRuntimeViewState({ initialConfig: "geo" });
        state.setCurrentViewIdentity(identity());
        state.setViewCraters(false);

        state.setCurrentViewIdentity(identity({ originMode: "lunar" }));
        const lunarValue = state.getViewCraters();
        state.setCurrentViewIdentity(identity());

        expect(state.getViewCraters()).toBe(false);
        expect(lunarValue).toBe(true);
    });
});

describe("view identity switching", () => {
    it("reports no change when the identity is unchanged", () => {
        const state = createRuntimeViewState({ initialConfig: "geo" });
        state.setCurrentViewIdentity(identity());

        const result = state.setCurrentViewIdentity(identity());

        expect(result.changed).toBe(false);
        expect(result.previousIdentityKey).toBe(result.currentIdentityKey);
    });

    it("reports the previous and current keys on a change", () => {
        const state = createRuntimeViewState({ initialConfig: "geo" });
        state.setCurrentViewIdentity(identity());

        const result = state.setCurrentViewIdentity(identity({ dimension: "2D" }));

        expect(result.changed).toBe(true);
        expect(result.previousIdentityKey).toContain("dimension=3D");
        expect(result.currentIdentityKey).toContain("dimension=2D");
    });

    it("hands back the incoming view's effective flags", () => {
        const state = createRuntimeViewState({ initialConfig: "geo" });
        state.setCurrentViewIdentity(identity());

        const result = state.setCurrentViewIdentity(identity({ originMode: "lunar" }), {
            previousViewFlags: { lunarCraterMinDiameterKm: 123 },
        });

        expect(result.viewFlags.lunarCraterMinDiameterKm).not.toBe(123);
        state.setCurrentViewIdentity(identity());
        expect(state.getLunarCraterMinDiameterKm()).toBe(123);
    });

    it("exposes the current identity as a copy", () => {
        const state = createRuntimeViewState({ initialConfig: "geo" });
        state.setCurrentViewIdentity(identity({ originMode: "lunar" }));

        const current = state.getCurrentViewIdentity();
        current.originMode = "mutated";

        expect(state.getCurrentViewIdentity().originMode).toBe("lunar");
    });

    it("ignores an absent previous-flag snapshot", () => {
        const state = createRuntimeViewState({ initialConfig: "geo" });
        state.setCurrentViewIdentity(identity());

        expect(() => state.setCurrentViewIdentity(identity({ originMode: "lunar" }), {}))
            .not.toThrow();
    });
});

describe("every view flag is wired to its own storage", () => {
    function capitalize(key) {
        return key.charAt(0).toUpperCase() + key.slice(1);
    }

    function booleanFlagPairs() {
        const probe = createRuntimeViewState();
        return Object.entries(probe.getViewFlags())
            .filter(([, value]) => typeof value === "boolean")
            .map(([key]) => key)
            .filter((key) =>
                typeof probe[`get${capitalize(key)}`] === "function" &&
                typeof probe[`set${capitalize(key)}`] === "function");
    }

    it("covers most of the published boolean flags", () => {
        expect(booleanFlagPairs().length).toBeGreaterThan(20);
    });

    it.each(booleanFlagPairs())("round-trips %s through its own getter", (key) => {
        // A miswired flag reads back as another flag's value, or ignores the
        // write entirely. Both show up here.
        const state = createRuntimeViewState({ initialConfig: "lunar" });
        const getter = state[`get${capitalize(key)}`];
        const setter = state[`set${capitalize(key)}`];

        setter(true);
        expect(getter()).toBe(true);

        setter(false);
        expect(getter()).toBe(false);
    });

    it.each(booleanFlagPairs())("coerces %s to a boolean", (key) => {
        const state = createRuntimeViewState({ initialConfig: "lunar" });

        state[`set${capitalize(key)}`]("truthy string");

        expect(state[`get${capitalize(key)}`]()).toBe(true);
    });
});
