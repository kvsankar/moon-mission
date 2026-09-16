function ensureSceneViewState(scene, defaultViewState) {
    if (!scene) return null;

    if (typeof scene.planeSelection !== "string") scene.planeSelection = defaultViewState.planeSelection;
    if (typeof scene.plane !== "string") scene.plane = defaultViewState.plane;
    if (typeof scene.xVariable !== "string") scene.xVariable = defaultViewState.xVariable;
    if (typeof scene.yVariable !== "string") scene.yVariable = defaultViewState.yVariable;
    if (typeof scene.zVariable !== "string") scene.zVariable = defaultViewState.zVariable;
    if (typeof scene.vxVariable !== "string") scene.vxVariable = defaultViewState.vxVariable;
    if (typeof scene.vyVariable !== "string") scene.vyVariable = defaultViewState.vyVariable;
    if (typeof scene.vzVariable !== "string") scene.vzVariable = defaultViewState.vzVariable;
    if (!Number.isFinite(scene.xFactor)) scene.xFactor = defaultViewState.xFactor;
    if (!Number.isFinite(scene.yFactor)) scene.yFactor = defaultViewState.yFactor;
    if (!Number.isFinite(scene.zFactor)) scene.zFactor = defaultViewState.zFactor;
    if (!Number.isFinite(scene.zoomFactor)) scene.zoomFactor = defaultViewState.zoomFactor;
    if (!Number.isFinite(scene.panx)) scene.panx = defaultViewState.panx;
    if (!Number.isFinite(scene.pany)) scene.pany = defaultViewState.pany;

    return scene;
}

function buildDefaultPlaneVariables(defaultViewState) {
    return {
        plane: defaultViewState.plane,
        xFactor: defaultViewState.xFactor,
        yFactor: defaultViewState.yFactor,
        zFactor: defaultViewState.zFactor,
        xVariable: defaultViewState.xVariable,
        yVariable: defaultViewState.yVariable,
        zVariable: defaultViewState.zVariable,
        vxVariable: defaultViewState.vxVariable,
        vyVariable: defaultViewState.vyVariable,
        vzVariable: defaultViewState.vzVariable,
    };
}

function resolvePlaneSelectionState({
    scene,
    defaultViewState,
    normalizePlaneSelection,
    useLegacyPlaneSelection = false,
    legacyPlaneSelection = null,
}) {
    if (scene) {
        return normalizePlaneSelection(scene.planeSelection);
    }
    if (useLegacyPlaneSelection && typeof legacyPlaneSelection === "string") {
        return normalizePlaneSelection(legacyPlaneSelection);
    }
    return defaultViewState.planeSelection;
}

function resolvePlaneVariablesState({
    scene,
    defaultViewState,
    useLegacyPlaneVariables = false,
    legacyPlaneVariables = null,
}) {
    if (scene) {
        return {
            plane: scene.plane,
            xFactor: scene.xFactor,
            yFactor: scene.yFactor,
            zFactor: scene.zFactor,
            xVariable: scene.xVariable,
            yVariable: scene.yVariable,
            zVariable: scene.zVariable,
            vxVariable: scene.vxVariable,
            vyVariable: scene.vyVariable,
            vzVariable: scene.vzVariable,
        };
    }

    if (useLegacyPlaneVariables && legacyPlaneVariables) {
        return legacyPlaneVariables;
    }

    return buildDefaultPlaneVariables(defaultViewState);
}

function resolveViewTransformState({
    scene,
    key,
    defaultViewState,
    legacyValue = null,
    useLegacyValue = true,
}) {
    if (scene && Number.isFinite(scene[key])) {
        return scene[key];
    }
    if (useLegacyValue && Number.isFinite(legacyValue)) {
        return legacyValue;
    }
    return defaultViewState[key];
}

function resolveEffectivePlaneSelection({
    selection,
    isRelativeMode = false,
    globalConfig = null,
    normalizePlaneSelection,
}) {
    if (isRelativeMode && selection === "DEFAULT") {
        return normalizePlaneSelection(
            globalConfig?.ui?.viewDefaults?.relativeDefaultPlaneSelection || "DEFAULT",
        );
    }
    return selection;
}

export {
    buildDefaultPlaneVariables,
    ensureSceneViewState,
    resolveEffectivePlaneSelection,
    resolvePlaneSelectionState,
    resolvePlaneVariablesState,
    resolveViewTransformState,
};
