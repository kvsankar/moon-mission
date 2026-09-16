import { describe, expect, it } from "vitest";

import {
    buildDefaultPlaneVariables,
    ensureSceneViewState,
    resolveEffectivePlaneSelection,
    resolvePlaneSelectionState,
    resolvePlaneVariablesState,
    resolveViewTransformState,
} from "../src/platform/js/core/domain/scene-view-state-core.js";

const defaultViewState = {
    planeSelection: "DEFAULT",
    plane: "xy",
    xFactor: 1,
    yFactor: 2,
    zFactor: 3,
    xVariable: "x",
    yVariable: "y",
    zVariable: "z",
    vxVariable: "vx",
    vyVariable: "vy",
    vzVariable: "vz",
    zoomFactor: 4,
    panx: 5,
    pany: 6,
};

describe("scene-view-state-core", () => {
    it("fills missing scene view state defaults in place", () => {
        const scene = {
            planeSelection: "XY",
            plane: "yz",
            yFactor: 9,
            zoomFactor: 12,
        };

        const result = ensureSceneViewState(scene, defaultViewState);

        expect(result).toBe(scene);
        expect(scene.planeSelection).toBe("XY");
        expect(scene.plane).toBe("yz");
        expect(scene.xFactor).toBe(1);
        expect(scene.yFactor).toBe(9);
        expect(scene.zFactor).toBe(3);
        expect(scene.xVariable).toBe("x");
        expect(scene.vzVariable).toBe("vz");
        expect(scene.zoomFactor).toBe(12);
        expect(scene.panx).toBe(5);
        expect(scene.pany).toBe(6);
    });

    it("resolves plane selection from scene state, then legacy fallback, then defaults", () => {
        const normalizePlaneSelection = (value) => String(value).toUpperCase();

        expect(resolvePlaneSelectionState({
            scene: { planeSelection: "xy" },
            defaultViewState,
            normalizePlaneSelection,
        })).toBe("XY");

        expect(resolvePlaneSelectionState({
            scene: null,
            defaultViewState,
            normalizePlaneSelection,
            useLegacyPlaneSelection: true,
            legacyPlaneSelection: "yz",
        })).toBe("YZ");

        expect(resolvePlaneSelectionState({
            scene: null,
            defaultViewState,
            normalizePlaneSelection,
            useLegacyPlaneSelection: false,
            legacyPlaneSelection: "zx",
        })).toBe("DEFAULT");
    });

    it("resolves plane variables from scene state, then legacy fallback, then defaults", () => {
        const legacyPlaneVariables = {
            plane: "legacy",
            xFactor: 8,
            yFactor: 9,
            zFactor: 10,
            xVariable: "lx",
            yVariable: "ly",
            zVariable: "lz",
            vxVariable: "lvx",
            vyVariable: "lvy",
            vzVariable: "lvz",
        };

        expect(resolvePlaneVariablesState({
            scene: {
                plane: "scene",
                xFactor: 11,
                yFactor: 12,
                zFactor: 13,
                xVariable: "sx",
                yVariable: "sy",
                zVariable: "sz",
                vxVariable: "svx",
                vyVariable: "svy",
                vzVariable: "svz",
            },
            defaultViewState,
        })).toEqual({
            plane: "scene",
            xFactor: 11,
            yFactor: 12,
            zFactor: 13,
            xVariable: "sx",
            yVariable: "sy",
            zVariable: "sz",
            vxVariable: "svx",
            vyVariable: "svy",
            vzVariable: "svz",
        });

        expect(resolvePlaneVariablesState({
            scene: null,
            defaultViewState,
            useLegacyPlaneVariables: true,
            legacyPlaneVariables,
        })).toBe(legacyPlaneVariables);

        expect(resolvePlaneVariablesState({
            scene: null,
            defaultViewState,
            useLegacyPlaneVariables: false,
            legacyPlaneVariables,
        })).toEqual(buildDefaultPlaneVariables(defaultViewState));
    });

    it("maps relative DEFAULT selection through the configured relative default plane", () => {
        const normalizePlaneSelection = (value) => String(value).toUpperCase();

        expect(resolveEffectivePlaneSelection({
            selection: "DEFAULT",
            isRelativeMode: true,
            globalConfig: {
                ui: {
                    viewDefaults: {
                        relativeDefaultPlaneSelection: "yz-",
                    },
                },
            },
            normalizePlaneSelection,
        })).toBe("YZ-");

        expect(resolveEffectivePlaneSelection({
            selection: "XY",
            isRelativeMode: true,
            globalConfig: {},
            normalizePlaneSelection,
        })).toBe("XY");
    });

    it("resolves view transform values from scene state, then legacy fallback, then defaults", () => {
        expect(resolveViewTransformState({
            scene: { zoomFactor: 12 },
            key: "zoomFactor",
            defaultViewState,
            legacyValue: 7,
        })).toBe(12);

        expect(resolveViewTransformState({
            scene: null,
            key: "panx",
            defaultViewState,
            legacyValue: 9,
            useLegacyValue: true,
        })).toBe(9);

        expect(resolveViewTransformState({
            scene: null,
            key: "panx",
            defaultViewState,
            legacyValue: 9,
            useLegacyValue: false,
        })).toBe(5);

        expect(resolveViewTransformState({
            scene: null,
            key: "pany",
            defaultViewState,
            legacyValue: Number.NaN,
        })).toBe(6);
    });
});
