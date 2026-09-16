export function createSpacecraftModelActions({
    SpacecraftRenderer,
    planetProperties,
    getCraftSize,
    getGlobalConfig,
    getModelPathPrefix,
}) {
    async function addSpacecraftModel(scene) {
        const globalConfig = getGlobalConfig();
        if (!globalConfig?.spacecraftModel?.enabled) {
            return;
        }

        const craftColor = planetProperties["SC"]["color"];
        const modelPath = getModelPathPrefix() + globalConfig.spacecraftModel.file;

        const renderer = new SpacecraftRenderer(
            scene.motherContainer,
            getCraftSize(),
            craftColor,
        );
        scene.spacecraftRenderer = renderer;
        const generation = scene.deferred3DInitRunId;
        const outcome = await renderer.loadModel(modelPath);
        if (outcome?.status !== "ready" || scene.disposed === true || scene.stopCreationFlag === true ||
            scene.spacecraftRenderer !== renderer || scene.deferred3DInitRunId !== generation) {
            renderer.disposeModel();
            return outcome;
        }

        scene.craft = renderer.craft;
        scene.craftInner = renderer.craftInner;
        scene.craftAxesHelper = renderer.axesHelper;
        scene.craftVisible = renderer.visible;
        return outcome;
    }

    function disposeSpacecraftModel(scene) {
        if (scene.spacecraftRenderer) {
            scene.spacecraftRenderer.disposeModel();
            scene.spacecraftRenderer = null;
        }

        scene.craft = null;
        scene.craftInner = null;
        scene.craftAxesHelper = null;
        scene.craftVisible = false;
    }

    return { addSpacecraftModel, disposeSpacecraftModel };
}
