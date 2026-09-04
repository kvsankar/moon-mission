import { describe, expect, it } from "vitest";

import {
    MOON_LIGHTING_MODEL_CURRENT,
    MOON_LIGHTING_MODEL_PHYSICAL_DEM,
    normalizeMoonLightingModel,
    resolveMoonLightingModelStages,
} from "../src/platform/js/app/moon-lighting-models.js";

describe("moon lighting models", () => {
    it("defaults unknown values to the current renderer", () => {
        expect(normalizeMoonLightingModel()).toBe(MOON_LIGHTING_MODEL_CURRENT);
        expect(normalizeMoonLightingModel("unknown")).toBe(MOON_LIGHTING_MODEL_CURRENT);
    });

    it("removes artistic darkening stages from the physical DEM model", () => {
        expect(resolveMoonLightingModelStages({
            lightingModel: MOON_LIGHTING_MODEL_PHYSICAL_DEM,
            colorTexture: false,
            generatedNormalMap: false,
            displacement: false,
            photometric: false,
            terminatorContrast: true,
            terminatorRelief: true,
            terrainRelief: true,
            terrainShadows: false,
            indirectOcclusion: true,
            shadowCrush: true,
            earthshine: false,
            geometricMask: true,
        })).toEqual(expect.objectContaining({
            lightingModel: MOON_LIGHTING_MODEL_PHYSICAL_DEM,
            physicalModel: true,
            colorTexture: true,
            generatedNormalMap: true,
            displacement: true,
            photometric: true,
            terminatorContrast: false,
            terminatorRelief: false,
            terrainRelief: false,
            terrainShadows: true,
            indirectOcclusion: false,
            shadowCrush: false,
            earthshine: true,
            geometricMask: false,
        }));
    });
});
