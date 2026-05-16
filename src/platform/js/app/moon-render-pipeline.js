export const MOON_RENDER_PIPELINE_STORAGE_KEY = "moonRenderPipeline";

export const DEFAULT_MOON_RENDER_PIPELINE_STATE = Object.freeze({
    colorTexture: true,
    generatedNormalMap: true,
    displacement: true,
    photometric: true,
    terminatorRelief: true,
    terrainShadows: true,
    earthshine: true,
});

export const MOON_RENDER_PIPELINE_PRESETS = Object.freeze({
    smooth: Object.freeze({
        label: "Smooth",
        state: Object.freeze({
            colorTexture: false,
            generatedNormalMap: false,
            displacement: false,
            photometric: false,
            terminatorRelief: false,
            terrainShadows: false,
            earthshine: false,
        }),
    }),
    normal: Object.freeze({
        label: "Normal",
        state: Object.freeze({
            colorTexture: false,
            generatedNormalMap: true,
            displacement: false,
            photometric: false,
            terminatorRelief: false,
            terrainShadows: false,
            earthshine: false,
        }),
    }),
    texture: Object.freeze({
        label: "Texture",
        state: Object.freeze({
            colorTexture: true,
            generatedNormalMap: false,
            displacement: false,
            photometric: false,
            terminatorRelief: false,
            terrainShadows: false,
            earthshine: false,
        }),
    }),
    textureNormal: Object.freeze({
        label: "Texture + Normal",
        state: Object.freeze({
            colorTexture: true,
            generatedNormalMap: true,
            displacement: false,
            photometric: false,
            terminatorRelief: false,
            terrainShadows: false,
            earthshine: false,
        }),
    }),
    photometric: Object.freeze({
        label: "Photometric",
        state: Object.freeze({
            colorTexture: true,
            generatedNormalMap: true,
            displacement: false,
            photometric: true,
            terminatorRelief: true,
            terrainShadows: false,
            earthshine: true,
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
    ["photometric", "Photometric"],
    ["terminatorRelief", "Terminator"],
    ["terrainShadows", "Terrain Shadows"],
    ["earthshine", "Earthshine"],
]);

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
        normalized[key] = normalizeBoolean(source[key], DEFAULT_MOON_RENDER_PIPELINE_STATE[key]);
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
