import {
    persistMoonRenderPipelineState,
    resolveMoonRenderPipelineState,
} from "./moon-render-pipeline.js";

function applyMoonRenderPipelineToScene(scene, pipelineState) {
    if (!scene?.moonRenderer?.setRenderPipeline) {
        return false;
    }
    scene.moonRenderer.setRenderPipeline(pipelineState);
    return true;
}

export function createMoonRenderPipelineActions({
    animationScenes,
    render,
    globalObject = typeof window !== "undefined" ? window : globalThis,
} = {}) {
    function getMoonRenderPipeline() {
        return resolveMoonRenderPipelineState({ globalObject });
    }

    function setMoonRenderPipeline(pipelineState) {
        const normalized = persistMoonRenderPipelineState(pipelineState, { globalObject });
        Object.values(animationScenes || {}).forEach((scene) => {
            applyMoonRenderPipelineToScene(scene, normalized);
        });
        render?.();
        return normalized;
    }

    return {
        getMoonRenderPipeline,
        setMoonRenderPipeline,
    };
}
