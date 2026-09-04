export const MOON_RENDER_PIPELINE_STORAGE_KEY = "moonRenderPipeline";

export const DEFAULT_MOON_RENDER_PIPELINE_STATE = Object.freeze({
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

const LEGACY_STAGE_FALLBACKS = Object.freeze({
    terrainRelief: "terrainShadows",
    indirectOcclusion: "terminatorRelief",
});

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

export function normalizeMoonRenderPipelineState(value = null) {
    const source = value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};
    const normalized = {};
    for (const key of Object.keys(DEFAULT_MOON_RENDER_PIPELINE_STATE)) {
        const legacyKey = LEGACY_STAGE_FALLBACKS[key];
        const fallback = legacyKey
            ? normalizeBoolean(source[legacyKey], DEFAULT_MOON_RENDER_PIPELINE_STATE[key])
            : DEFAULT_MOON_RENDER_PIPELINE_STATE[key];
        normalized[key] = normalizeBoolean(source[key], fallback);
    }
    return normalized;
}

export function resolveMoonRenderPipelinePresetId(state = null) {
    const normalized = normalizeMoonRenderPipelineState(state);
    const entries = Object.entries(MOON_RENDER_PIPELINE_PRESETS);
    for (const [presetId, preset] of entries) {
        const presetState = normalizeMoonRenderPipelineState(preset.state);
        const matches = Object.keys(DEFAULT_MOON_RENDER_PIPELINE_STATE)
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
            return normalizeMoonRenderPipelineState(JSON.parse(storedText));
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
