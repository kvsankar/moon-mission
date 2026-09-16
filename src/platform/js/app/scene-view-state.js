import {
    ensureSceneViewState as ensureSceneViewStateCore,
    resolveEffectivePlaneSelection,
    resolvePlaneSelectionState,
    resolvePlaneVariablesState,
    resolveViewTransformState,
} from "../core/domain/scene-view-state-core.js";

function createSceneViewStateActions(deps) {
    const {
        defaultViewState,
        getConfig,
        getGlobalConfig,
        getSceneForConfig,
        normalizePlaneSelection,
        getPlaneVariablesForSelection,
        syncPlaneSelectionControls,
        setChecked,
        isRelativeMode = false,
        getLegacyPlaneSelection,
        setLegacyPlaneSelection,
        getLegacyPlaneVariables,
        setLegacyPlaneVariables,
        getLegacyZoomFactor,
        setLegacyZoomFactor,
        getLegacyPanX,
        setLegacyPanX,
        getLegacyPanY,
        setLegacyPanY,
    } = deps;

    function ensureSceneViewState(scene) {
        return ensureSceneViewStateCore(scene, defaultViewState);
    }

    function getActiveSceneViewState(cfg = getConfig()) {
        return ensureSceneViewState(getSceneForConfig(cfg));
    }

    function getPlaneSelectionState(cfg = getConfig()) {
        return resolvePlaneSelectionState({
            scene: getActiveSceneViewState(cfg),
            defaultViewState,
            normalizePlaneSelection,
            useLegacyPlaneSelection: cfg === getConfig(),
            legacyPlaneSelection: getLegacyPlaneSelection(),
        });
    }

    function setPlaneSelectionState(value, cfg = getConfig()) {
        const normalized = normalizePlaneSelection(value);
        const scene = getActiveSceneViewState(cfg);
        if (scene) scene.planeSelection = normalized;
        if (cfg === getConfig()) setLegacyPlaneSelection(normalized);
    }

    function setPlaneVariablesState(planeConfig, cfg = getConfig()) {
        const scene = getActiveSceneViewState(cfg);
        if (scene) {
            scene.plane = planeConfig.plane;
            scene.xFactor = planeConfig.xFactor;
            scene.yFactor = planeConfig.yFactor;
            scene.zFactor = planeConfig.zFactor;
            scene.xVariable = planeConfig.xVariable;
            scene.yVariable = planeConfig.yVariable;
            scene.zVariable = planeConfig.zVariable;
            scene.vxVariable = planeConfig.vxVariable;
            scene.vyVariable = planeConfig.vyVariable;
            scene.vzVariable = planeConfig.vzVariable;
        }

        // Transitional fallback for code paths not yet scene-scoped.
        if (cfg === getConfig()) setLegacyPlaneVariables(planeConfig);
    }

    function getPlaneVariablesState(cfg = getConfig()) {
        return resolvePlaneVariablesState({
            scene: getActiveSceneViewState(cfg),
            defaultViewState,
            useLegacyPlaneVariables: cfg === getConfig(),
            legacyPlaneVariables: getLegacyPlaneVariables(),
        });
    }

    function getZoomFactorState(cfg = getConfig()) {
        return resolveViewTransformState({
            scene: getActiveSceneViewState(cfg),
            key: "zoomFactor",
            defaultViewState,
            legacyValue: getLegacyZoomFactor(),
            useLegacyValue: cfg === getConfig(),
        });
    }

    function setZoomFactorState(value, cfg = getConfig()) {
        const scene = getActiveSceneViewState(cfg);
        if (scene) scene.zoomFactor = value;
        if (cfg === getConfig()) setLegacyZoomFactor(value);
    }

    function getPanXState(cfg = getConfig()) {
        return resolveViewTransformState({
            scene: getActiveSceneViewState(cfg),
            key: "panx",
            defaultViewState,
            legacyValue: getLegacyPanX(),
            useLegacyValue: cfg === getConfig(),
        });
    }

    function setPanXState(value, cfg = getConfig()) {
        const scene = getActiveSceneViewState(cfg);
        if (scene) scene.panx = value;
        if (cfg === getConfig()) setLegacyPanX(value);
    }

    function getPanYState(cfg = getConfig()) {
        return resolveViewTransformState({
            scene: getActiveSceneViewState(cfg),
            key: "pany",
            defaultViewState,
            legacyValue: getLegacyPanY(),
            useLegacyValue: cfg === getConfig(),
        });
    }

    function setPanYState(value, cfg = getConfig()) {
        const scene = getActiveSceneViewState(cfg);
        if (scene) scene.pany = value;
        if (cfg === getConfig()) setLegacyPanY(value);
    }

    function resetViewTransformState(cfg = getConfig()) {
        setZoomFactorState(defaultViewState.zoomFactor, cfg);
        setPanXState(defaultViewState.panx, cfg);
        setPanYState(defaultViewState.pany, cfg);
    }

    function syncPlaneStateForConfig(cfg = getConfig()) {
        const selection = getPlaneSelectionState(cfg);
        const normalizedSelection = cfg === getConfig()
            ? syncPlaneSelectionControls(selection, setChecked)
            : normalizePlaneSelection(selection);
        const effectiveSelection = resolveEffectivePlaneSelection({
            selection: normalizedSelection,
            isRelativeMode,
            globalConfig: getGlobalConfig(),
            normalizePlaneSelection,
        });
        setPlaneSelectionState(normalizedSelection, cfg);
        setPlaneVariablesState(getPlaneVariablesForSelection(effectiveSelection), cfg);
    }

    return {
        syncPlaneStateForConfig,
        ensureSceneViewState,
        getActiveSceneViewState,
        getPlaneSelectionState,
        setPlaneSelectionState,
        setPlaneVariablesState,
        getPlaneVariablesState,
        getZoomFactorState,
        setZoomFactorState,
        getPanXState,
        setPanXState,
        getPanYState,
        setPanYState,
        resetViewTransformState,
    };
}

export { createSceneViewStateActions };
