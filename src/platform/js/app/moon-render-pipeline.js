import {
    MOON_LIGHTING_MODEL_CURRENT,
    normalizeMoonLightingModel,
} from "./moon-lighting-models.js";

export const MOON_RENDER_PIPELINE_STORAGE_KEY = "moonRenderPipeline";
export const MOON_RENDER_PIPELINE_SCHEMA_VERSION = 5;
const MOON_RENDER_TONE_CALIBRATION_VERSION = 2;
const MOON_RENDER_RELIEF_CALIBRATION_VERSION = 3;
const MOON_RENDER_REFLECTANCE_CALIBRATION_VERSION = 4;
const MOON_RENDER_GEOMETRY_CALIBRATION_VERSION = 5;

export const DEFAULT_MOON_RENDER_PIPELINE_STATE = Object.freeze({
    schemaVersion: MOON_RENDER_PIPELINE_SCHEMA_VERSION,
    lightingModel: MOON_LIGHTING_MODEL_CURRENT,
    physicalBrdfBlend: 0.20,
    physicalNormalScale: 1.00,
    physicalReliefScale: 1.00,
    physicalShadowStrength: 1.00,
    physicalShadowFill: 0.015,
    physicalExposure: 0.45,
    physicalToneGamma: 1.00,
    colorTexture: true,
    generatedNormalMap: true,
    displacement: true,
    photometric: true,
    terminatorContrast: false,
    terminatorRelief: true,
    terrainRelief: true,
    terrainShadows: true,
    indirectOcclusion: true,
    shadowCrush: true,
    earthshine: true,
    geometricMask: false,
});

export const MOON_RENDER_PIPELINE_PRESETS = Object.freeze({
    smooth: Object.freeze({
        label: "Smooth",
        state: Object.freeze({
            lightingModel: MOON_LIGHTING_MODEL_CURRENT,
            colorTexture: false,
            generatedNormalMap: false,
            displacement: false,
            photometric: false,
            terminatorContrast: false,
            terminatorRelief: false,
            terrainRelief: false,
            terrainShadows: false,
            indirectOcclusion: false,
            shadowCrush: false,
            earthshine: false,
            geometricMask: false,
        }),
    }),
    normal: Object.freeze({
        label: "Normal",
        state: Object.freeze({
            lightingModel: MOON_LIGHTING_MODEL_CURRENT,
            colorTexture: false,
            generatedNormalMap: true,
            displacement: false,
            photometric: false,
            terminatorContrast: false,
            terminatorRelief: false,
            terrainRelief: false,
            terrainShadows: false,
            indirectOcclusion: false,
            shadowCrush: false,
            earthshine: false,
            geometricMask: false,
        }),
    }),
    texture: Object.freeze({
        label: "Texture",
        state: Object.freeze({
            lightingModel: MOON_LIGHTING_MODEL_CURRENT,
            colorTexture: true,
            generatedNormalMap: false,
            displacement: false,
            photometric: false,
            terminatorContrast: false,
            terminatorRelief: false,
            terrainRelief: false,
            terrainShadows: false,
            indirectOcclusion: false,
            shadowCrush: false,
            earthshine: false,
            geometricMask: false,
        }),
    }),
    textureNormal: Object.freeze({
        label: "Texture + Normal",
        state: Object.freeze({
            lightingModel: MOON_LIGHTING_MODEL_CURRENT,
            colorTexture: true,
            generatedNormalMap: true,
            displacement: false,
            photometric: false,
            terminatorContrast: false,
            terminatorRelief: false,
            terrainRelief: false,
            terrainShadows: false,
            indirectOcclusion: false,
            shadowCrush: false,
            earthshine: false,
            geometricMask: false,
        }),
    }),
    photometric: Object.freeze({
        label: "Photometric",
        state: Object.freeze({
            lightingModel: MOON_LIGHTING_MODEL_CURRENT,
            colorTexture: true,
            generatedNormalMap: true,
            displacement: false,
            photometric: true,
            terminatorContrast: true,
            terminatorRelief: true,
            terrainRelief: false,
            terrainShadows: false,
            indirectOcclusion: true,
            shadowCrush: true,
            earthshine: true,
            geometricMask: false,
        }),
    }),
    geometric: Object.freeze({
        label: "Geometric Mask",
        state: Object.freeze({
            lightingModel: MOON_LIGHTING_MODEL_CURRENT,
            colorTexture: false,
            generatedNormalMap: false,
            displacement: false,
            photometric: false,
            terminatorContrast: false,
            terminatorRelief: false,
            terrainRelief: false,
            terrainShadows: false,
            indirectOcclusion: false,
            shadowCrush: false,
            earthshine: false,
            geometricMask: true,
        }),
    }),
    full: Object.freeze({
        label: "Full",
        state: DEFAULT_MOON_RENDER_PIPELINE_STATE,
    }),
});

export const MOON_RENDER_PIPELINE_STAGE_CONTROLS = Object.freeze([
    ["colorTexture", "Color Texture"],
    ["generatedNormalMap", "Normal Map"],
    ["displacement", "Displacement"],
    ["photometric", "BRDF"],
    ["terminatorContrast", "Terminator Contrast"],
    ["terminatorRelief", "Terminator Tone"],
    ["terrainRelief", "Terrain Relief"],
    ["terrainShadows", "Terrain Shadows"],
    ["indirectOcclusion", "Indirect Occlusion"],
    ["shadowCrush", "Shadow Crush"],
    ["earthshine", "Earthshine"],
    ["geometricMask", "Geometric Mask"],
]);

export const MOON_PHYSICAL_RENDER_CONTROLS = Object.freeze([
    Object.freeze({ key: "physicalBrdfBlend", label: "BRDF", min: 0, max: 1, step: 0.05 }),
    Object.freeze({ key: "physicalNormalScale", label: "Normal Scale", min: 0, max: 1.25, step: 0.05 }),
    Object.freeze({ key: "physicalReliefScale", label: "Relief Scale", min: 0, max: 1, step: 0.05 }),
    Object.freeze({ key: "physicalShadowStrength", label: "Geometry Shadows", min: 0, max: 1, step: 0.05 }),
    Object.freeze({ key: "physicalShadowFill", label: "Shadow Fill", min: 0, max: 0.04, step: 0.005 }),
    Object.freeze({ key: "physicalExposure", label: "Exposure", min: 0.2, max: 1.25, step: 0.05 }),
    Object.freeze({ key: "physicalToneGamma", label: "Tone Gamma", min: 0.6, max: 1.2, step: 0.02 }),
]);

const LEGACY_STAGE_FALLBACKS = Object.freeze({
    terrainRelief: "terrainShadows",
    indirectOcclusion: "terminatorRelief",
});

export const MOON_RENDER_PIPELINE_STAGE_KEYS = Object.freeze(
    Object.keys(DEFAULT_MOON_RENDER_PIPELINE_STATE)
        .filter((key) => typeof DEFAULT_MOON_RENDER_PIPELINE_STATE[key] === "boolean"),
);

function safeGetStorage(globalObject) {
    try {
        return globalObject?.localStorage || null;
    } catch {
        return null;
    }
}

function normalizeBoolean(value, fallback) {
    return typeof value === "boolean" ? value : fallback;
}

function normalizeNumber(value, fallback, min, max) {
    const numeric = Number(value);
    return Number.isFinite(numeric)
        ? Math.min(max, Math.max(min, numeric))
        : fallback;
}

function usesSupersededPhysicalToneDefaults(source) {
    const schemaVersion = Number(source.schemaVersion);
    if (Number.isFinite(schemaVersion) && schemaVersion >= MOON_RENDER_TONE_CALIBRATION_VERSION) {
        return false;
    }
    const exposure = Number(source.physicalExposure);
    const toneGamma = Number(source.physicalToneGamma);
    const hasToneGamma = source.physicalToneGamma != null &&
        String(source.physicalToneGamma).trim() !== "" &&
        Number.isFinite(toneGamma);
    return (
        (!hasToneGamma && exposure === 0.8) ||
        (hasToneGamma && exposure === 0.9 && toneGamma === 0.7)
    );
}

function usesSupersededPhysicalReliefDefaults(source) {
    const schemaVersion = Number(source.schemaVersion);
    if (Number.isFinite(schemaVersion) && schemaVersion >= MOON_RENDER_RELIEF_CALIBRATION_VERSION) {
        return false;
    }
    return Number(source.physicalNormalScale) === 0.55 &&
        Number(source.physicalShadowStrength) === 0.75;
}

function usesSupersededPhysicalReflectanceDefaults(source) {
    const schemaVersion = Number(source.schemaVersion);
    if (Number.isFinite(schemaVersion) && schemaVersion >= MOON_RENDER_REFLECTANCE_CALIBRATION_VERSION) {
        return false;
    }
    return Number(source.physicalBrdfBlend) === 0.20 &&
        Number(source.physicalExposure) === 0.60 &&
        Number(source.physicalToneGamma) === 1.00;
}

function usesSupersededPhysicalGeometryDefaults(source) {
    const schemaVersion = Number(source.schemaVersion);
    if (Number.isFinite(schemaVersion) && schemaVersion >= MOON_RENDER_GEOMETRY_CALIBRATION_VERSION) {
        return false;
    }
    return Number(source.physicalNormalScale) === 0.80 &&
        Number(source.physicalReliefScale) === 0.45 &&
        Number(source.physicalShadowStrength) === 1.10;
}

export function normalizeMoonRenderPipelineState(value = null) {
    const source = value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};
    const normalized = {
        schemaVersion: MOON_RENDER_PIPELINE_SCHEMA_VERSION,
        lightingModel: normalizeMoonLightingModel(source.lightingModel),
    };
    const migratePhysicalToneDefaults = usesSupersededPhysicalToneDefaults(source);
    const migratePhysicalReliefDefaults = usesSupersededPhysicalReliefDefaults(source);
    const migratePhysicalReflectanceDefaults = usesSupersededPhysicalReflectanceDefaults(source);
    const migratePhysicalGeometryDefaults = usesSupersededPhysicalGeometryDefaults(source);
    for (const control of MOON_PHYSICAL_RENDER_CONTROLS) {
        const migrateControl = (
            migratePhysicalToneDefaults &&
            (control.key === "physicalExposure" || control.key === "physicalToneGamma")
        ) || (
            migratePhysicalReliefDefaults &&
            (control.key === "physicalNormalScale" || control.key === "physicalShadowStrength")
        ) || (
            migratePhysicalReflectanceDefaults &&
            control.key === "physicalExposure"
        ) || (
            migratePhysicalGeometryDefaults &&
            (
                control.key === "physicalNormalScale" ||
                control.key === "physicalReliefScale" ||
                control.key === "physicalShadowStrength"
            )
        );
        const sourceValue = migrateControl
            ? undefined
            : source[control.key];
        normalized[control.key] = normalizeNumber(
            sourceValue,
            DEFAULT_MOON_RENDER_PIPELINE_STATE[control.key],
            control.min,
            control.max,
        );
    }
    for (const key of MOON_RENDER_PIPELINE_STAGE_KEYS) {
        const legacyKey = LEGACY_STAGE_FALLBACKS[key];
        const fallback = legacyKey
            ? normalizeBoolean(source[legacyKey], DEFAULT_MOON_RENDER_PIPELINE_STATE[key])
            : DEFAULT_MOON_RENDER_PIPELINE_STATE[key];
        normalized[key] = normalizeBoolean(source[key], fallback);
    }
    return normalized;
}

export function createMoonRenderPipelineState(value = null) {
    const source = value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};
    return normalizeMoonRenderPipelineState({
        ...source,
        schemaVersion: MOON_RENDER_PIPELINE_SCHEMA_VERSION,
    });
}

export function resolveMoonRenderPipelinePresetId(state = null) {
    const normalized = normalizeMoonRenderPipelineState(state);
    const entries = Object.entries(MOON_RENDER_PIPELINE_PRESETS);
    for (const [presetId, preset] of entries) {
        const presetState = normalizeMoonRenderPipelineState(preset.state);
        const matches = MOON_RENDER_PIPELINE_STAGE_KEYS
            .every((key) => normalized[key] === presetState[key]);
        if (matches) {
            return presetId;
        }
    }
    return "custom";
}

export function resolveMoonRenderPipelineState({
    globalObject = typeof window !== "undefined" ? window : globalThis,
} = {}) {
    const globalState = globalObject?.MOON_RENDER_PIPELINE;
    if (globalState && typeof globalState === "object") {
        return normalizeMoonRenderPipelineState(globalState);
    }

    const storage = safeGetStorage(globalObject);
    const storedText = storage?.getItem?.(MOON_RENDER_PIPELINE_STORAGE_KEY);
    if (storedText) {
        try {
            const storedState = JSON.parse(storedText);
            const normalized = normalizeMoonRenderPipelineState(storedState);
            const storedSchemaVersion = Number(storedState?.schemaVersion);
            if (
                !Number.isFinite(storedSchemaVersion) ||
                storedSchemaVersion < MOON_RENDER_PIPELINE_SCHEMA_VERSION
            ) {
                try {
                    storage?.setItem?.(
                        MOON_RENDER_PIPELINE_STORAGE_KEY,
                        JSON.stringify(normalized),
                    );
                } catch {
                    // Keep the normalized in-memory state when storage is read-only.
                }
            }
            return normalized;
        } catch {
            // Ignore corrupt local overrides.
        }
    }

    return normalizeMoonRenderPipelineState(DEFAULT_MOON_RENDER_PIPELINE_STATE);
}

export function persistMoonRenderPipelineState(
    state,
    {
        globalObject = typeof window !== "undefined" ? window : globalThis,
    } = {},
) {
    const normalized = normalizeMoonRenderPipelineState(state);
    globalObject.MOON_RENDER_PIPELINE = normalized;
    const storage = safeGetStorage(globalObject);
    storage?.setItem?.(MOON_RENDER_PIPELINE_STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
}
