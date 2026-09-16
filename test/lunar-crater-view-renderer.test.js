import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { createLunarCraterActions } from "../src/platform/js/app/lunar-crater-actions.js";

import { renderWithLunarCraterView } from "../src/platform/js/app/lunar-crater-view-renderer.js";
import {
    LUNAR_CRATER_DISPLAY_MODE_ALWAYS,
    LUNAR_CRATER_DISPLAY_MODE_HOVER,
    LUNAR_CRATER_VIEW_IDS,
} from "../src/platform/js/core/domain/lunar-crater-view.js";

function makeCraterScene({
    visible = true,
    displayMode = LUNAR_CRATER_DISPLAY_MODE_HOVER,
    minDiameterKm = 80,
    maxDiameterKm = 600,
    hoverLabelsEnabled = true,
} = {}) {
    const animationScene = {
        lunarCraterGroup: { name: "lunar-crater-annotations", visible },
        lunarCraterDisplayMode: displayMode,
        lunarCraterMinDiameterKm: minDiameterKm,
        lunarCraterMaxDiameterKm: maxDiameterKm,
        lunarCraterHoverLabelsEnabled: hoverLabelsEnabled,
        addLunarCraterAnnotations: vi.fn(function addLunarCraterAnnotations() {
            this.lunarCraterGroup = {
                name: "lunar-crater-annotations",
                visible: false,
            };
        }),
        setLunarCraterHoverLabelsEnabled: vi.fn(function setLunarCraterHoverLabelsEnabled(enabled) {
            this.lunarCraterHoverLabelsEnabled = enabled !== false;
        }),
        updateLunarCraterHoverFromPointer: vi.fn(),
        clearLunarCraterHover: vi.fn(),
        updateLunarCraterLabelScales: vi.fn(),
        disposeLunarCraterAnnotations: vi.fn(function disposeLunarCraterAnnotations() {
            this.lunarCraterGroup = null;
        }),
    };
    const scene = {
        getObjectByName: vi.fn((name) =>
            name === "lunar-crater-annotations" ? animationScene.lunarCraterGroup : null,
        ),
    };
    return { animationScene, scene };
}

describe("renderWithLunarCraterView", () => {
    it("restores fallback group visibility without mutating a scene that cannot apply presentation", () => {
        const group = { visible: false };
        const animationScene = {};
        renderWithLunarCraterView({
            viewId: LUNAR_CRATER_VIEW_IDS.FRAME_AND_SHOOT,
            viewState: { viewLunarCraters: true },
            animationScene,
            scene: { getObjectByName: () => group },
            render: () => expect(group.visible).toBe(true),
        });
        expect(group.visible).toBe(false);
        expect(animationScene).toStrictEqual({});
    });

    const fields = [
        "lunarCraterDisplayMode", "lunarCraterMinDiameterKm", "lunarCraterMaxDiameterKm",
        "lunarCraterShowAllEnabled", "lunarCraterHoverEnabled", "lunarCraterHoverMinDiameterKm",
        "lunarCraterHoverMaxDiameterKm", "lunarFeatureTypeFilters", "lunarFeatureSearchQuery",
        "lunarFeaturePinnedNames", "lunarFeatureExcludedKeys", "lunarFeatureHoverTypeFilters",
        "lunarFeatureHoverSearchQuery", "lunarFeatureHoverExcludedKeys", "lunarCraterHoverLabelsEnabled",
    ];
    const snapshot = scene => Object.fromEntries(fields.map(key => [key, scene[key]]));
    function authoredScene(hasGroup) {
        const result = makeCraterScene();
        Object.assign(result.animationScene, {
            lunarFeatureSearchQuery: "main", lunarFeaturePinnedNames: ["main-pin"],
            lunarFeatureExcludedKeys: ["main-exclusion"], lunarFeatureHoverSearchQuery: "main-hover",
            lunarFeatureHoverExcludedKeys: ["main-hover-exclusion"], lunarCraterShowAllEnabled: true,
            lunarCraterHoverEnabled: true, lunarCraterHoverMinDiameterKm: 2, lunarCraterHoverMaxDiameterKm: 80,
        });
        if (!hasGroup) result.animationScene.lunarCraterGroup = null;
        return result;
    }
    function auxiliaryRender(animationScene, scene, render = vi.fn()) {
        renderWithLunarCraterView({
            viewId: LUNAR_CRATER_VIEW_IDS.FRAME_AND_SHOOT,
            viewState: { viewLunarCraters: true, lunarCraterMinDiameterKm: 10,
                lunarFeatureSearchQuery: "auxiliary", lunarCraterHoverLabels: false },
            animationScene, scene, render,
        });
    }

    it("restores authored fields after the real annotation builder normalizes them", () => {
        const actions = createLunarCraterActions({ THREE, getMoonRadius: () => 1,
            getGlobalConfig: () => ({ is_lunar: true }), getViewLunarCraters: () => true,
            craterCatalog: { features: [] }, PC: { MOON_RADIUS_KM: 1737.4 } });
        const { animationScene } = authoredScene(true);
        animationScene.moonContainer = new THREE.Group();
        animationScene.lunarCraterGroup = new THREE.Group();
        animationScene.moonContainer.add(animationScene.lunarCraterGroup);
        animationScene.addLunarCraterAnnotations = (options = {}) => actions.addLunarCraterAnnotations({ scene: animationScene, ...options });
        animationScene.disposeLunarCraterAnnotations = () => actions.disposeLunarCraterAnnotations({ scene: animationScene });
        animationScene.setLunarCraterHoverLabelsEnabled = enabled => actions.setLunarCraterHoverLabelsEnabled({ scene: animationScene, enabled });
        const before = snapshot(animationScene);
        try {
            auxiliaryRender(animationScene);
            expect(snapshot(animationScene)).toEqual(before);
        } finally { animationScene.disposeLunarCraterAnnotations(); }
    });

    for (const method of ["addLunarCraterAnnotations", "setLunarCraterHoverLabelsEnabled"]) {
        it(`restores authored fields and visibility if ${method} mutates then throws during restoration`, () => {
            const { animationScene, scene } = authoredScene(true);
            animationScene.lunarCraterGroup.visible = false;
            const before = snapshot(animationScene);
            const error = new Error("restoration failed");
            const original = animationScene[method].getMockImplementation();
            animationScene[method].mockImplementationOnce(original).mockImplementationOnce(function () {
                this.lunarFeatureSearchQuery = "corrupted-during-restore";
                this.lunarCraterHoverLabelsEnabled = false;
                throw error;
            });
            expect(() => auxiliaryRender(animationScene, scene)).toThrow(error);
            expect(snapshot(animationScene)).toEqual(before);
            expect(animationScene.lunarCraterGroup.visible).toBe(false);
        });
    }

    it("restores every main-view field and removes only transient geometry when initially cold", () => {
        const { animationScene, scene } = authoredScene(false);
        const before = snapshot(animationScene);
        auxiliaryRender(animationScene, scene, () => {
            expect(animationScene.lunarFeatureSearchQuery).toBe("auxiliary");
            expect(animationScene.lunarCraterMinDiameterKm).toBe(10);
        });
        expect(snapshot(animationScene)).toEqual(before);
        expect(animationScene.lunarCraterGroup).toBeNull();
        expect(animationScene.disposeLunarCraterAnnotations).toHaveBeenCalledOnce();
    });

    it("leaves main-view state for a catalog that arrives after auxiliary rendering", () => {
        const { animationScene, scene } = authoredScene(false);
        const before = snapshot(animationScene);
        animationScene.addLunarCraterAnnotations.mockImplementation(() => {});
        auxiliaryRender(animationScene, scene);
        // The real catalog completion invokes this same scene method later.
        animationScene.addLunarCraterAnnotations.mockImplementation(() => {
            expect(snapshot(animationScene)).toEqual(before);
        });
        animationScene.addLunarCraterAnnotations();
    });

    for (const hasGroup of [false, true]) for (const failure of ["annotations", "hover", "render"]) {
        it(`restores state after ${failure} throws with existing group=${hasGroup}`, () => {
            const { animationScene, scene } = authoredScene(hasGroup);
            const before = snapshot(animationScene);
            const error = new Error(`${failure} failed`);
            if (failure === "annotations") animationScene.addLunarCraterAnnotations.mockImplementationOnce(() => { throw error; });
            if (failure === "hover") animationScene.setLunarCraterHoverLabelsEnabled.mockImplementationOnce(function () {
                this.lunarCraterHoverLabelsEnabled = false;
                throw error;
            });
            expect(() => auxiliaryRender(animationScene, scene, () => {
                if (failure === "render") throw error;
            })).toThrow(error);
            expect(snapshot(animationScene)).toEqual(before);
            expect(animationScene.lunarCraterGroup?.visible ?? null).toBe(hasGroup ? true : null);
        });
    }

    it("hides crater annotations for unsupported auxiliary views only during render", () => {
        const { animationScene, scene } = makeCraterScene({ visible: true });
        const renderedVisibility = [];

        renderWithLunarCraterView({
            viewId: "craft_to_moon",
            viewState: { viewLunarCraters: true },
            animationScene,
            scene,
            render: () => {
                renderedVisibility.push(animationScene.lunarCraterGroup.visible);
            },
        });

        expect(renderedVisibility).toEqual([false]);
        expect(animationScene.lunarCraterGroup.visible).toBe(true);
        expect(animationScene.addLunarCraterAnnotations).not.toHaveBeenCalled();
    });

    it("applies Frame and Shoot crater state and restores the shared scene presentation", () => {
        const { animationScene, scene } = makeCraterScene({
            visible: true,
            displayMode: LUNAR_CRATER_DISPLAY_MODE_HOVER,
            minDiameterKm: 60,
            maxDiameterKm: 240,
            hoverLabelsEnabled: true,
        });
        const renderedPresentation = [];

        renderWithLunarCraterView({
            viewId: LUNAR_CRATER_VIEW_IDS.FRAME_AND_SHOOT,
            viewState: {
                viewLunarCraters: true,
                lunarCraterDisplayMode: LUNAR_CRATER_DISPLAY_MODE_ALWAYS,
                lunarCraterHoverLabels: false,
                lunarCraterMinDiameterKm: 40,
                lunarCraterMaxDiameterKm: 120,
            },
            animationScene,
            scene,
            render: () => {
                renderedPresentation.push({
                    visible: animationScene.lunarCraterGroup.visible,
                    displayMode: animationScene.lunarCraterDisplayMode,
                    minDiameterKm: animationScene.lunarCraterMinDiameterKm,
                    maxDiameterKm: animationScene.lunarCraterMaxDiameterKm,
                    hoverLabelsEnabled: animationScene.lunarCraterHoverLabelsEnabled,
                });
            },
        });

        expect(renderedPresentation).toEqual([{
            visible: true,
            displayMode: LUNAR_CRATER_DISPLAY_MODE_ALWAYS,
            minDiameterKm: 40,
            maxDiameterKm: 120,
            hoverLabelsEnabled: false,
        }]);
        expect(animationScene.lunarCraterDisplayMode).toBe(LUNAR_CRATER_DISPLAY_MODE_HOVER);
        expect(animationScene.lunarCraterMinDiameterKm).toBe(60);
        expect(animationScene.lunarCraterMaxDiameterKm).toBe(240);
        expect(animationScene.lunarCraterHoverLabelsEnabled).toBe(true);
        expect(animationScene.lunarCraterGroup.visible).toBe(true);
        expect(animationScene.updateLunarCraterLabelScales).toHaveBeenCalledWith({
            camera: null,
            rendererDomElement: null,
            freezeScale: false,
        });
    });

    it("uses the Frame and Shoot pointer for hover-mode crater renders", () => {
        const { animationScene, scene } = makeCraterScene();
        const camera = {};
        const rendererDomElement = {};

        renderWithLunarCraterView({
            viewId: LUNAR_CRATER_VIEW_IDS.FRAME_AND_SHOOT,
            viewState: {
                viewLunarCraters: true,
                lunarCraterDisplayMode: LUNAR_CRATER_DISPLAY_MODE_HOVER,
                lunarCraterHoverLabels: true,
                lunarCraterMinDiameterKm: 80,
                lunarCraterMaxDiameterKm: 600,
            },
            animationScene,
            scene,
            camera,
            rendererDomElement,
            pointer: { clientX: 12, clientY: 34 },
            render: vi.fn(),
        });

        expect(animationScene.updateLunarCraterHoverFromPointer).toHaveBeenCalledWith({
            camera,
            rendererDomElement,
            clientX: 12,
            clientY: 34,
        });
        expect(animationScene.clearLunarCraterHover).not.toHaveBeenCalled();
        expect(animationScene.updateLunarCraterLabelScales).toHaveBeenCalledWith({
            camera,
            rendererDomElement,
            freezeScale: false,
        });
    });

    it("can freeze crater label scale updates while a view camera is being dragged", () => {
        const { animationScene, scene } = makeCraterScene();
        const camera = {};
        const rendererDomElement = {};

        renderWithLunarCraterView({
            viewId: LUNAR_CRATER_VIEW_IDS.FRAME_AND_SHOOT,
            viewState: {
                viewLunarCraters: true,
                lunarCraterDisplayMode: LUNAR_CRATER_DISPLAY_MODE_ALWAYS,
                lunarCraterHoverLabels: true,
            },
            animationScene,
            scene,
            camera,
            rendererDomElement,
            freezeLabelScale: true,
            render: vi.fn(),
        });

        expect(animationScene.updateLunarCraterLabelScales).toHaveBeenCalledWith({
            camera,
            rendererDomElement,
            freezeScale: true,
        });
    });

    it("uses the Frame and Shoot pointer for Show Always hover inspection", () => {
        const { animationScene, scene } = makeCraterScene();
        const camera = {};
        const rendererDomElement = {};

        renderWithLunarCraterView({
            viewId: LUNAR_CRATER_VIEW_IDS.FRAME_AND_SHOOT,
            viewState: {
                viewLunarCraters: true,
                lunarCraterDisplayMode: LUNAR_CRATER_DISPLAY_MODE_ALWAYS,
                lunarCraterHoverLabels: true,
                lunarCraterMinDiameterKm: 80,
                lunarCraterMaxDiameterKm: 600,
            },
            animationScene,
            scene,
            camera,
            rendererDomElement,
            pointer: { clientX: 56, clientY: 78 },
            render: vi.fn(),
        });

        expect(animationScene.setLunarCraterHoverLabelsEnabled).toHaveBeenCalledWith(true);
        expect(animationScene.updateLunarCraterHoverFromPointer).toHaveBeenCalledWith({
            camera,
            rendererDomElement,
            clientX: 56,
            clientY: 78,
        });
        expect(animationScene.clearLunarCraterHover).not.toHaveBeenCalled();
    });
});
