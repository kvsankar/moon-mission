import { describe, expect, it } from "vitest";

import {
    DEFAULT_MOON_RENDER_PIPELINE_STATE,
    MOON_RENDER_PIPELINE_PRESETS,
    normalizeMoonRenderPipelineState,
    resolveMoonRenderPipelinePresetId,
} from "../src/platform/js/app/moon-render-pipeline.js";

describe("moon render pipeline", () => {
    it("round-trips every declared preset", () => {
        for (const [presetId, preset] of Object.entries(MOON_RENDER_PIPELINE_PRESETS)) {
            expect(normalizeMoonRenderPipelineState(preset.state)).toEqual(preset.state);
            expect(resolveMoonRenderPipelinePresetId(preset.state)).toBe(presetId);
        }
    });

    it("preserves the original unconditional shadow crush for stored seven-stage states", () => {
        const legacySmooth = normalizeMoonRenderPipelineState({
            colorTexture: false,
            generatedNormalMap: false,
            displacement: false,
            photometric: false,
            terminatorRelief: false,
            terrainShadows: false,
            earthshine: false,
        });

        expect(legacySmooth).toEqual({
            ...MOON_RENDER_PIPELINE_PRESETS.smooth.state,
            shadowCrush: true,
        });
    });

    it("migrates a stored seven-stage full state to the corrected full preset", () => {
        const legacyFull = normalizeMoonRenderPipelineState({
            colorTexture: true,
            generatedNormalMap: true,
            displacement: true,
            photometric: true,
            terminatorRelief: true,
            terrainShadows: true,
            earthshine: true,
        });

        expect(legacyFull).toEqual(DEFAULT_MOON_RENDER_PIPELINE_STATE);
        expect(resolveMoonRenderPipelinePresetId(legacyFull)).toBe("full");
    });

    it("keeps full rendering as the default and geometric masking opt-in", () => {
        expect(normalizeMoonRenderPipelineState()).toEqual(DEFAULT_MOON_RENDER_PIPELINE_STATE);
        expect(DEFAULT_MOON_RENDER_PIPELINE_STATE.terminatorContrast).toBe(false);
        expect(DEFAULT_MOON_RENDER_PIPELINE_STATE.geometricMask).toBe(false);
    });
});
