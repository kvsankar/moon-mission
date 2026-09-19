import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

import { installFakeDom } from "./helpers/fake-dom.js";
import { createLunarCraterActions } from "../src/platform/js/app/lunar-crater-actions.js";

const CATALOG = {
    display: {
        defaultMinDiameterKm: 0,
        defaultMaxDiameterKm: 600,
        rangeMinDiameterKm: 0,
        rangeMaxDiameterKm: 600,
    },
    features: [
        { name: "Tycho", latitudeDeg: -43.31, longitudeDeg: 348.82, diameterKm: 85.3, featureType: "Crater, craters" },
        { name: "Clavius", latitudeDeg: -58.62, longitudeDeg: 345.59, diameterKm: 230.8, featureType: "Crater, craters" },
        { name: "Mare Tranquillitatis", latitudeDeg: 8.5, longitudeDeg: 31.4, diameterKm: 500, featureType: "Mare, maria" },
    ],
};

let dom = null;

beforeEach(() => {
    dom = installFakeDom();
});

afterEach(() => {
    dom?.restore();
    dom = null;
    vi.restoreAllMocks();
});

function makeActions({ isLunar = true, displayMode = "always" } = {}) {
    return createLunarCraterActions({
        THREE,
        sphericalToCartesian: (radius, longitudeRad, latitudeRad) => ({
            x: radius * Math.cos(latitudeRad) * Math.cos(longitudeRad),
            y: radius * Math.cos(latitudeRad) * Math.sin(longitudeRad),
            z: radius * Math.sin(latitudeRad),
        }),
        degreesToRadians: (degrees) => (degrees * Math.PI) / 180,
        PC: { MOON_RADIUS_KM: 1737.4 },
        getMoonRadius: () => 10,
        getGlobalConfig: () => ({ is_lunar: isLunar }),
        getViewLunarCraters: () => true,
        getLunarCraterMinDiameterKm: () => 0,
        getLunarCraterMaxDiameterKm: () => 600,
        getLunarCraterDisplayMode: () => displayMode,
        getLunarFeatureTypeFilters: () => ({}),
        craterCatalog: CATALOG,
    });
}

/** A scene with a Moon container, so annotation rebuilds actually happen. */
function makeScene({ withMoon = true } = {}) {
    const scene = {};
    if (withMoon) scene.moonContainer = new THREE.Group();
    return scene;
}

function annotatedScene(actions, options = {}) {
    const scene = makeScene(options);
    actions.addLunarCraterAnnotations({ scene });
    return scene;
}

describe("annotation visibility", () => {
    it("hides and shows an existing annotation group", () => {
        const actions = makeActions();
        const scene = annotatedScene(actions);

        expect(actions.setLunarCraterAnnotationsVisible({ scene, visible: false })).toBe(true);
        expect(scene.lunarCraterGroup.visible).toBe(false);

        expect(actions.setLunarCraterAnnotationsVisible({ scene, visible: true })).toBe(true);
        expect(scene.lunarCraterGroup.visible).toBe(true);
    });

    it("treats anything but true as hidden", () => {
        const actions = makeActions();
        const scene = annotatedScene(actions);

        actions.setLunarCraterAnnotationsVisible({ scene, visible: "yes" });

        expect(scene.lunarCraterGroup.visible).toBe(false);
    });

    it("builds the annotations on first show when none exist yet", () => {
        const actions = makeActions();
        const scene = makeScene();

        expect(actions.setLunarCraterAnnotationsVisible({ scene, visible: true })).toBe(true);
        expect(scene.lunarCraterGroup).toBeTruthy();
    });

    it("does nothing when asked to hide before anything was built", () => {
        const actions = makeActions();
        const scene = makeScene();

        expect(actions.setLunarCraterAnnotationsVisible({ scene, visible: false })).toBe(false);
        expect(scene.lunarCraterGroup).toBeUndefined();
    });

    it("does nothing away from the lunar frame", () => {
        const actions = makeActions({ isLunar: false });
        const scene = makeScene();

        expect(actions.setLunarCraterAnnotationsVisible({ scene, visible: true })).toBe(false);
    });

    it("does nothing without a Moon to annotate", () => {
        const actions = makeActions();
        const scene = makeScene({ withMoon: false });

        expect(actions.setLunarCraterAnnotationsVisible({ scene, visible: true })).toBe(false);
    });
});

describe("the display diameter range", () => {
    it("adopts a new range and rebuilds the annotations", () => {
        const actions = makeActions();
        const scene = annotatedScene(actions);

        expect(actions.setLunarCraterDiameterRange({
            scene,
            minDiameterKm: 100,
            maxDiameterKm: 400,
        })).toBe(true);
        expect(scene.lunarCraterMinDiameterKm).toBe(100);
        expect(scene.lunarCraterMaxDiameterKm).toBe(400);
    });

    it("reports no change when the same range is re-applied", () => {
        const actions = makeActions();
        const scene = annotatedScene(actions);
        actions.setLunarCraterDiameterRange({ scene, minDiameterKm: 100, maxDiameterKm: 400 });

        expect(actions.setLunarCraterDiameterRange({
            scene,
            minDiameterKm: 100,
            maxDiameterKm: 400,
        })).toBe(false);
    });

    it("keeps the current bound when only one end is supplied", () => {
        const actions = makeActions();
        const scene = annotatedScene(actions);
        actions.setLunarCraterDiameterRange({ scene, minDiameterKm: 100, maxDiameterKm: 400 });

        actions.setLunarCraterDiameterRange({ scene, minDiameterKm: 200 });

        expect(scene.lunarCraterMinDiameterKm).toBe(200);
        expect(scene.lunarCraterMaxDiameterKm).toBe(400);
    });

    it("ignores a bound that is not a number", () => {
        const actions = makeActions();
        const scene = annotatedScene(actions);
        actions.setLunarCraterDiameterRange({ scene, minDiameterKm: 100, maxDiameterKm: 400 });

        actions.setLunarCraterDiameterRange({ scene, minDiameterKm: "wide", maxDiameterKm: "narrow" });

        expect(scene.lunarCraterMinDiameterKm).toBe(100);
        expect(scene.lunarCraterMaxDiameterKm).toBe(400);
    });

    it("records the range but skips the rebuild away from the lunar frame", () => {
        const actions = makeActions({ isLunar: false });
        const scene = makeScene();

        expect(actions.setLunarCraterDiameterRange({
            scene,
            minDiameterKm: 100,
            maxDiameterKm: 400,
        })).toBe(false);
        expect(scene.lunarCraterMinDiameterKm).toBe(100);
    });

    it("refuses a call with no scene", () => {
        const actions = makeActions();

        expect(actions.setLunarCraterDiameterRange({ minDiameterKm: 10 })).toBe(false);
        expect(actions.setLunarCraterDiameterRange()).toBe(false);
    });
});

describe("the display mode", () => {
    it("switches between the two published modes", () => {
        const actions = makeActions();
        const scene = annotatedScene(actions);

        expect(actions.setLunarCraterDisplayMode({ scene, mode: "hover" })).toBe(true);
        expect(scene.lunarCraterDisplayMode).toBe("hover");

        expect(actions.setLunarCraterDisplayMode({ scene, mode: "always" })).toBe(true);
        expect(scene.lunarCraterDisplayMode).toBe("always");
    });

    it("reports no change when the mode is already active", () => {
        const actions = makeActions();
        const scene = annotatedScene(actions);
        actions.setLunarCraterDisplayMode({ scene, mode: "hover" });

        expect(actions.setLunarCraterDisplayMode({ scene, mode: "hover" })).toBe(false);
    });

    it("normalizes an unrecognized mode to hover", () => {
        const actions = makeActions();
        const scene = annotatedScene(actions);

        actions.setLunarCraterDisplayMode({ scene, mode: "sometimes" });

        expect(scene.lunarCraterDisplayMode).toBe("hover");
    });

    it("refuses a call with no scene", () => {
        expect(makeActions().setLunarCraterDisplayMode({ mode: "hover" })).toBe(false);
    });
});

describe("hover labels", () => {
    it("turns hover labels off and on", () => {
        const actions = makeActions();
        const scene = annotatedScene(actions);

        expect(actions.setLunarCraterHoverLabelsEnabled({ scene, enabled: false })).toBe(true);
        expect(scene.lunarCraterHoverLabelsEnabled).toBe(false);

        expect(actions.setLunarCraterHoverLabelsEnabled({ scene, enabled: true })).toBe(true);
        expect(scene.lunarCraterHoverLabelsEnabled).toBe(true);
    });

    it("treats anything but an explicit false as enabled", () => {
        const actions = makeActions();
        const scene = annotatedScene(actions);
        actions.setLunarCraterHoverLabelsEnabled({ scene, enabled: false });

        actions.setLunarCraterHoverLabelsEnabled({ scene, enabled: undefined });

        expect(scene.lunarCraterHoverLabelsEnabled).toBe(true);
    });

    it("reports no change when the setting is unchanged", () => {
        const actions = makeActions();
        const scene = annotatedScene(actions);
        actions.setLunarCraterHoverLabelsEnabled({ scene, enabled: true });

        expect(actions.setLunarCraterHoverLabelsEnabled({ scene, enabled: true })).toBe(false);
    });

    it("refuses a call with no scene", () => {
        expect(makeActions().setLunarCraterHoverLabelsEnabled({ enabled: true })).toBe(false);
    });
});

describe("the feature type filters", () => {
    it("adopts a new filter set", () => {
        const actions = makeActions();
        const scene = annotatedScene(actions);

        expect(actions.setLunarFeatureTypeFilters({
            scene,
            typeFilters: { "Mare, maria": { enabled: false } },
        })).toBe(true);
        expect(scene.lunarFeatureTypeFilters["Mare, maria"].enabled).toBe(false);
    });

    it("reports no change when the same filter set is re-applied", () => {
        const actions = makeActions();
        const scene = annotatedScene(actions);
        actions.setLunarFeatureTypeFilters({ scene, typeFilters: { "Mare, maria": { enabled: false } } });

        expect(actions.setLunarFeatureTypeFilters({
            scene,
            typeFilters: { "Mare, maria": { enabled: false } },
        })).toBe(false);
    });

    it("records the filters but skips the rebuild away from the lunar frame", () => {
        const actions = makeActions({ isLunar: false });
        const scene = makeScene();

        expect(actions.setLunarFeatureTypeFilters({
            scene,
            typeFilters: { "Mare, maria": { enabled: false } },
        })).toBe(true);
    });

    it("refuses a call with no scene", () => {
        expect(makeActions().setLunarFeatureTypeFilters({ typeFilters: {} })).toBe(false);
        expect(makeActions().setLunarFeatureTypeFilters()).toBe(false);
    });
});

describe("the feature search query", () => {
    it("adopts a new query", () => {
        const actions = makeActions();
        const scene = annotatedScene(actions);

        expect(actions.setLunarFeatureSearchQuery({ scene, searchQuery: "tycho" })).toBe(true);
        expect(scene.lunarFeatureSearchQuery).toBe("tycho");
    });

    it("reports no change for an equivalent query", () => {
        const actions = makeActions();
        const scene = annotatedScene(actions);
        actions.setLunarFeatureSearchQuery({ scene, searchQuery: "tycho" });

        expect(actions.setLunarFeatureSearchQuery({ scene, searchQuery: "tycho" })).toBe(false);
    });

    it("clears the query for an empty value", () => {
        const actions = makeActions();
        const scene = annotatedScene(actions);
        actions.setLunarFeatureSearchQuery({ scene, searchQuery: "tycho" });

        actions.setLunarFeatureSearchQuery({ scene, searchQuery: "" });

        expect(scene.lunarFeatureSearchQuery).toBe("");
    });

    it("refuses a call with no scene", () => {
        expect(makeActions().setLunarFeatureSearchQuery({ searchQuery: "x" })).toBe(false);
        expect(makeActions().setLunarFeatureSearchQuery()).toBe(false);
    });
});

describe("the excluded feature keys", () => {
    it("adopts a new exclusion list", () => {
        const actions = makeActions();
        const scene = annotatedScene(actions);

        expect(actions.setLunarFeatureExcludedKeys({ scene, excludedKeys: ["tycho"] })).toBe(true);
        expect(scene.lunarFeatureExcludedKeys).toEqual(["tycho"]);
    });

    it("reports no change for the same list in the same order", () => {
        const actions = makeActions();
        const scene = annotatedScene(actions);
        actions.setLunarFeatureExcludedKeys({ scene, excludedKeys: ["tycho", "clavius"] });

        expect(actions.setLunarFeatureExcludedKeys({
            scene,
            excludedKeys: ["tycho", "clavius"],
        })).toBe(false);
    });

    it("notices a list that changed length", () => {
        const actions = makeActions();
        const scene = annotatedScene(actions);
        actions.setLunarFeatureExcludedKeys({ scene, excludedKeys: ["tycho"] });

        expect(actions.setLunarFeatureExcludedKeys({
            scene,
            excludedKeys: ["tycho", "clavius"],
        })).toBe(true);
    });

    it("clears the list for a non-array value", () => {
        const actions = makeActions();
        const scene = annotatedScene(actions);
        actions.setLunarFeatureExcludedKeys({ scene, excludedKeys: ["tycho"] });

        actions.setLunarFeatureExcludedKeys({ scene, excludedKeys: "tycho" });

        expect(scene.lunarFeatureExcludedKeys).toEqual([]);
    });

    it("refuses a call with no scene", () => {
        expect(makeActions().setLunarFeatureExcludedKeys({ excludedKeys: [] })).toBe(false);
        expect(makeActions().setLunarFeatureExcludedKeys()).toBe(false);
    });
});

describe("label scaling", () => {
    function makeCamera() {
        const camera = new THREE.PerspectiveCamera(50, 1.6, 0.1, 1000);
        camera.position.set(0, 0, 40);
        camera.updateMatrixWorld(true);
        return camera;
    }

    it("does nothing before the annotations exist", () => {
        const actions = makeActions();

        expect(actions.updateLunarCraterLabelScales({
            scene: makeScene(),
            camera: makeCamera(),
        })).toBe(false);
    });

    it("does nothing without a camera", () => {
        const actions = makeActions();
        const scene = annotatedScene(actions);

        expect(actions.updateLunarCraterLabelScales({ scene, camera: null })).toBe(false);
    });

    it("does nothing while the scale is frozen", () => {
        // A frozen scale is what keeps labels steady during a capture.
        const actions = makeActions();
        const scene = annotatedScene(actions);

        expect(actions.updateLunarCraterLabelScales({
            scene,
            camera: makeCamera(),
            freezeScale: true,
        })).toBe(false);
    });

    it("runs a pass over the annotation group with a camera", () => {
        const actions = makeActions();
        const scene = annotatedScene(actions);
        scene.moonContainer.updateMatrixWorld(true);

        expect(() => actions.updateLunarCraterLabelScales({
            scene,
            camera: makeCamera(),
        })).not.toThrow();
    });
});

describe("teardown", () => {
    it("removes the annotation group from the Moon", () => {
        const actions = makeActions();
        const scene = annotatedScene(actions);
        const group = scene.lunarCraterGroup;

        actions.disposeLunarCraterAnnotations({ scene });

        expect(scene.lunarCraterGroup).toBeFalsy();
        expect(scene.moonContainer.children).not.toContain(group);
    });

    it("is safe before anything was built", () => {
        const actions = makeActions();

        expect(() => actions.disposeLunarCraterAnnotations({ scene: makeScene() })).not.toThrow();
    });

    it("hides the hover state without a scene", () => {
        const actions = makeActions();

        expect(actions.hideLunarCraterHover({})).toBe(false);
    });
});
