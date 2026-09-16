function createRuntimeNavigationControlGroup(deps) {
    const navigationActions = deps.createNavigationActions({
        getPanX: deps.getPanX,
        setPanX: deps.setPanX,
        getPanY: deps.getPanY,
        setPanY: deps.setPanY,
        getZoomFactor: deps.getZoomFactor,
        setZoomFactor: deps.setZoomFactor,
        zoomChange: deps.zoomChange,
        zoomEnd: deps.zoomEnd,
        render: deps.render,
        getZoomTimeoutMs: deps.getZoomTimeoutMs,
        getZoomScale: deps.getZoomScale,
        toggleInfo: deps.toggleStatsVisibility,
    });

    const repeatHandlers = deps.createRepeatMouseDownHandlers({
        zoomIn: navigationActions.zoomIn,
        zoomOut: navigationActions.zoomOut,
        panLeft: navigationActions.panLeft,
        panRight: navigationActions.panRight,
        panUp: navigationActions.panUp,
        panDown: navigationActions.panDown,
        forward: deps.forward,
        fastForward: deps.fastForward,
        backward: deps.backward,
        fastBackward: deps.fastBackward,
        slower: deps.slower,
        resetspeed: deps.resetspeed,
        faster: deps.faster,
        realtime: deps.realtime,
        getDelayMs: deps.getMouseDownTimeout,
        setDelayMs: deps.setMouseDownTimeout,
        setTimeoutHandle: deps.setTimeoutHandleZoom,
    });

    return {
        navigationActions,
        repeatHandlers,
    };
}

function createRuntimeLockControlActions(deps, { navigationActions }) {
    return deps.createLockActions({
        animationScenes: deps.animationScenes,
        getConfig: deps.getConfig,
        reset: navigationActions.reset,
        setChecked: deps.setChecked,
    });
}

function createRuntimeCameraControlActions(deps) {
    return deps.createCameraActions({
        cameraState: deps.cameraState,
        getTransitionRevision: deps.getTransitionRevision,
        animationScenes: deps.animationScenes,
        getConfig: deps.getConfig,
        readCameraPositionMode: deps.readCameraPositionMode,
        readCameraLookMode: deps.readCameraLookMode,
        applyCameraFromTo: deps.applyCameraFromTo,
        readPlaneSelection: deps.readPlaneSelection,
        setPlaneSelection: deps.setPlaneSelection,
        handlePlaneChange: deps.handlePlaneChange,
        applyViewForCurrentIdentity: deps.applyViewForCurrentIdentity,
        render: deps.render,
        getViewSky: deps.getViewSky,
        getViewConstellationLines: deps.getViewConstellationLines,
    });
}

function createRuntimeModeControlActions(deps) {
    return deps.createModeActions({
        animationScenes: deps.animationScenes,
        getConfig: deps.getConfig,
        getGlobalConfig: deps.getGlobalConfig,
        render: deps.render,
        updateCraftScale: deps.updateCraftScale,
        getLandingFlag: deps.getLandingFlag,
        setLandingFlag: deps.setLandingFlag,
        getJoyRideFlag: deps.getJoyRideFlag,
        setJoyRideFlag: deps.setJoyRideFlag,
        setView: deps.setView,
    });
}

function createRuntimeMoonRenderProfileControlActions(deps) {
    return deps.createMoonRenderProfileActions({
        THREE: deps.THREE,
        animationScenes: deps.animationScenes,
        loadSceneTextures: deps.loadSceneTextures,
        loadMoonRenderProfileTextures: deps.loadMoonRenderProfileTextures,
        applyAndRefreshSceneTextures: deps.applyAndRefreshSceneTextures,
        render: deps.render,
        globalObject: deps.globalObject,
    });
}

function createRuntimeMoonRenderPipelineControlActions(deps) {
    if (typeof deps.createMoonRenderPipelineActions !== "function") {
        return {};
    }
    return deps.createMoonRenderPipelineActions({
        animationScenes: deps.animationScenes,
        render: deps.render,
        globalObject: deps.globalObject,
    });
}

function createRuntimeBurnControlActions(deps) {
    return deps.createBurnActions({
        getEventInfos: deps.getTimelineEventInfos || deps.getEventInfos,
        setAnimTime: deps.setAnimTime,
        missionSetTime: deps.missionSetTime,
    });
}

function createRuntimeUiControlGroups(deps) {
    const navigationControlGroup = createRuntimeNavigationControlGroup(deps);

    return {
        ...navigationControlGroup,
        lockActions: createRuntimeLockControlActions(deps, navigationControlGroup),
        cameraActions: createRuntimeCameraControlActions(deps),
        modeActions: createRuntimeModeControlActions(deps),
        moonRenderProfileActions: createRuntimeMoonRenderProfileControlActions(deps),
        moonRenderPipelineActions: createRuntimeMoonRenderPipelineControlActions(deps),
        burnActions: createRuntimeBurnControlActions(deps),
    };
}

export {
    createRuntimeBurnControlActions,
    createRuntimeCameraControlActions,
    createRuntimeLockControlActions,
    createRuntimeModeControlActions,
    createRuntimeMoonRenderPipelineControlActions,
    createRuntimeMoonRenderProfileControlActions,
    createRuntimeNavigationControlGroup,
    createRuntimeUiControlGroups,
};
