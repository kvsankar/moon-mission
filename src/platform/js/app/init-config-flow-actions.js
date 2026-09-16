function createInitConfigFlowActions(deps) {
    const {
        getConfig,
        getTransitionRevision = () => 0,
        getAnimationScene,
        AnimationScene,
        shouldSkipInitConfig,
        applyInitConfigAlreadyInitialized,
        handleModeSwitchToGeo,
        handleModeSwitchToLunar,
        setChecked,
        normalizePlaneSelection,
        setPlaneSelectionState,
        syncPlaneSelectionControls,
        initConfigOrchestrationActions,
        getGlobalConfig,
        initConfigSceneSetupActions,
        isRelativeMode,
        initConfigUiActions,
        setSceneState,
        consoleRef,
    } = deps;

    let latestAttempt = 0;

    async function initConfig({ isCurrent: isCallerCurrent = () => true } = {}) {
        const config = getConfig();
        if (!isCallerCurrent()) return { status: "superseded", config };
        const attempt = ++latestAttempt;
        const revision = getTransitionRevision();
        const existingScene = getAnimationScene(config);
        const isCurrent = () => attempt === latestAttempt && isCallerCurrent() &&
            config === getConfig() && revision === getTransitionRevision() &&
            getAnimationScene(config) === existingScene;
        const superseded = () => ({ status: "superseded", config });
        if (!isCurrent()) return superseded();
        if (shouldSkipInitConfig({ animationScene: existingScene, AnimationScene })) {
            applyInitConfigAlreadyInitialized({
                config,
                globalConfig: getGlobalConfig(),
                handleModeSwitchToGeo,
                handleModeSwitchToLunar,
                setChecked,
                animationScene: existingScene,
                syncPlaneSelection: (selection) => {
                    const normalized = normalizePlaneSelection(selection);
                    setPlaneSelectionState(normalized, config);
                    syncPlaneSelectionControls(normalized, setChecked);
                },
            });
            return { status: "ready", config };
        }

        try {
            // Mission-wide loading is shared; activation effects belong only to
            // this origin/scene/revision and the latest startup owner.
            await initConfigOrchestrationActions.ensureGlobalConfigLoaded();
        } catch (error) {
            if (!isCurrent()) return superseded();
            throw error;
        }
        if (!isCurrent()) return superseded();

        const configData = getGlobalConfig();
        initConfigOrchestrationActions.applyConfigDerivedUpdates();
        initConfigOrchestrationActions.ensureSceneHandlerInitialized();

        initConfigSceneSetupActions.configureSceneForOrigin({
            originKey: config,
            configData,
            isRelativeMode,
        });

        initConfigUiActions.configureInitConfigControls();

        setSceneState(config, AnimationScene.SCENE_STATE_INIT_CONFIG_DONE);
        consoleRef.debug(`initConfig(${config}) returning - state at SCENE_STATE_ADD_CURVE_DONE`);
        return { status: "ready", config };
    }

    return {
        initConfig,
    };
}

export { createInitConfigFlowActions };
