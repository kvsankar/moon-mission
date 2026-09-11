import { describe, expect, it } from "vitest";
import { normalizeMoonLightingModel, resolveMoonLightingModelStages, MOON_LIGHTING_MODELS } from "../src/platform/js/app/moon-lighting-models.js";
describe("single Moon lighting model", () => {
    it("maps old, absent and unknown model names to Physical", () => {
        for (const old of [undefined, "current", "physical-dem", "unknown"]) expect(normalizeMoonLightingModel(old)).toBe("physical-dem");
        expect(MOON_LIGHTING_MODELS.map(m => m.id)).toEqual(["physical-dem"]);
    });
    it("keeps diagnostics on the same Physical pipeline", () => {
        expect(resolveMoonLightingModelStages({ colorTexture: false, generatedNormalMap: false, displacement: false })).toMatchObject({ physicalModel: true, lightingModel: "physical-dem", colorTexture: false, generatedNormalMap: false, displacement: false });
    });
});
