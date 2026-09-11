export const MOON_LIGHTING_MODEL_PHYSICAL_DEM = "physical-dem";
export const MOON_LIGHTING_MODELS = Object.freeze([
    Object.freeze({ id: MOON_LIGHTING_MODEL_PHYSICAL_DEM, label: "Moon" }),
]);

// Accept old links/settings without retaining a second runtime lighting model.
export function normalizeMoonLightingModel() { return MOON_LIGHTING_MODEL_PHYSICAL_DEM; }

export function resolveMoonLightingModelStages(pipelineState = {}) {
    return { ...pipelineState, lightingModel: MOON_LIGHTING_MODEL_PHYSICAL_DEM, physicalModel: true };
}
