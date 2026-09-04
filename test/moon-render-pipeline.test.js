import { describe, expect, it } from "vitest";

import {
    DEFAULT_MOON_RENDER_PIPELINE_STATE,
    MOON_RENDER_PIPELINE_PRESETS,
    MOON_RENDER_PIPELINE_SCHEMA_VERSION,
    createMoonRenderPipelineState,
    normalizeMoonRenderPipelineState,
    resolveMoonRenderPipelinePresetId,
    resolveMoonRenderPipelineState,
} from "../src/platform/js/app/moon-render-pipeline.js";

describe("moon render pipeline", () => {
    it("round-trips every declared preset", () => {
        for (const [presetId, preset] of Object.entries(MOON_RENDER_PIPELINE_PRESETS)) {
            expect(normalizeMoonRenderPipelineState(preset.state)).toMatchObject(preset.state);
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

        expect(legacySmooth).toMatchObject({
            ...MOON_RENDER_PIPELINE_PRESETS.smooth.state,
            shadowCrush: true,
        });
        expect(legacySmooth.physicalShadowStrength).toBe(1.1);
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

    it("keeps lighting-model selection independent from stage presets", () => {
        const physicalFull = normalizeMoonRenderPipelineState({
            ...DEFAULT_MOON_RENDER_PIPELINE_STATE,
            lightingModel: "physical-dem",
        });

        expect(physicalFull.lightingModel).toBe("physical-dem");
        expect(resolveMoonRenderPipelinePresetId(physicalFull)).toBe("full");
    });

    it("migrates superseded Physical tone defaults without changing custom values", () => {
        expect(normalizeMoonRenderPipelineState({
            physicalExposure: 0.8,
        })).toMatchObject({
            physicalExposure: 0.6,
            physicalToneGamma: 1,
        });
        expect(normalizeMoonRenderPipelineState({
            physicalExposure: 0.9,
            physicalToneGamma: 0.7,
        })).toMatchObject({
            physicalExposure: 0.6,
            physicalToneGamma: 1,
        });
        expect(normalizeMoonRenderPipelineState({
            schemaVersion: MOON_RENDER_PIPELINE_SCHEMA_VERSION,
            physicalExposure: 0.9,
            physicalToneGamma: 0.7,
        })).toMatchObject({
            physicalExposure: 0.9,
            physicalToneGamma: 0.7,
        });
        expect(createMoonRenderPipelineState({
            physicalExposure: 0.9,
            physicalToneGamma: 0.7,
        })).toMatchObject({
            schemaVersion: MOON_RENDER_PIPELINE_SCHEMA_VERSION,
            physicalExposure: 0.9,
            physicalToneGamma: 0.7,
        });
        expect(normalizeMoonRenderPipelineState({
            physicalExposure: 0.65,
            physicalToneGamma: 1.1,
        })).toMatchObject({
            physicalExposure: 0.65,
            physicalToneGamma: 1.1,
        });
    });

    it("migrates the superseded Physical relief defaults once", () => {
        expect(normalizeMoonRenderPipelineState({
            schemaVersion: 2,
            physicalNormalScale: 0.55,
            physicalShadowStrength: 0.75,
        })).toMatchObject({
            schemaVersion: 3,
            physicalNormalScale: 0.8,
            physicalShadowStrength: 1.1,
        });
        expect(createMoonRenderPipelineState({
            physicalNormalScale: 0.55,
            physicalShadowStrength: 0.75,
        })).toMatchObject({
            schemaVersion: 3,
            physicalNormalScale: 0.55,
            physicalShadowStrength: 0.75,
        });
    });

    it("persists stored Physical relief defaults at the current schema", () => {
        let storedText = JSON.stringify({
            schemaVersion: 2,
            physicalNormalScale: 0.55,
            physicalShadowStrength: 0.75,
        });
        const globalObject = {
            localStorage: {
                getItem: () => storedText,
                setItem: (_key, value) => {
                    storedText = value;
                },
            },
        };

        expect(resolveMoonRenderPipelineState({ globalObject })).toMatchObject({
            schemaVersion: 3,
            physicalNormalScale: 0.8,
            physicalShadowStrength: 1.1,
        });
        expect(JSON.parse(storedText)).toMatchObject({
            schemaVersion: 3,
            physicalNormalScale: 0.8,
            physicalShadowStrength: 1.1,
        });
    });

    it("does not overwrite settings from a future schema", () => {
        const futureState = {
            schemaVersion: 4,
            physicalNormalScale: 0.9,
            physicalShadowStrength: 1.2,
            futureControl: true,
        };
        let storedText = JSON.stringify(futureState);
        const globalObject = {
            localStorage: {
                getItem: () => storedText,
                setItem: (_key, value) => {
                    storedText = value;
                },
            },
        };

        resolveMoonRenderPipelineState({ globalObject });

        expect(JSON.parse(storedText)).toEqual(futureState);
    });
});
