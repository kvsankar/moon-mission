export const MOON_LIGHTING_MODEL_CURRENT = "current";
export const MOON_LIGHTING_MODEL_PHYSICAL_DEM = "physical-dem";

export const MOON_LIGHTING_MODELS = Object.freeze([
    Object.freeze({ id: MOON_LIGHTING_MODEL_CURRENT, label: "Current" }),
    Object.freeze({ id: MOON_LIGHTING_MODEL_PHYSICAL_DEM, label: "Physical DEM" }),
]);

export function normalizeMoonLightingModel(value) {
    return String(value || "").trim().toLowerCase() === MOON_LIGHTING_MODEL_PHYSICAL_DEM
        ? MOON_LIGHTING_MODEL_PHYSICAL_DEM
        : MOON_LIGHTING_MODEL_CURRENT;
}

export function resolveMoonLightingModelStages(pipelineState = {}) {
    const lightingModel = normalizeMoonLightingModel(pipelineState.lightingModel);
    if (lightingModel === MOON_LIGHTING_MODEL_CURRENT) {
        return {
            ...pipelineState,
            lightingModel,
            physicalModel: false,
        };
    }

    return {
        ...pipelineState,
        lightingModel,
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
    };
}
