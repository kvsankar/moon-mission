import { createRuntimeInitDeps, createRuntimeUiControlsDeps } from "./runtime-deps.js";

function resolveRuntimeBootstrapStateSlices(statePort = {}) {
    const fallbackSlice = statePort;

    return {
        app: statePort?.app || fallbackSlice,
        data: statePort?.data || fallbackSlice,
        session: statePort?.session || fallbackSlice,
        sceneView: statePort?.sceneView || fallbackSlice,
        sceneRuntime: statePort?.sceneRuntime || fallbackSlice,
        interaction: statePort?.interaction || fallbackSlice,
        viewTransform: statePort?.viewTransform || fallbackSlice,
    };
}

function createRuntimeBootstrapAccessors({
    renderPort = {},
    statePort = {},
    clockPort = {},
} = {}) {
    const { app, viewTransform } = resolveRuntimeBootstrapStateSlices(statePort);
    const getConfig = app.getConfig;

    return {
        getPanX: typeof viewTransform.getPanX === "function"
            ? viewTransform.getPanX
            : () => viewTransform.getPanXState(getConfig()),
        getPanY: typeof viewTransform.getPanY === "function"
            ? viewTransform.getPanY
            : () => viewTransform.getPanYState(getConfig()),
        getZoomFactor: typeof viewTransform.getZoomFactor === "function"
            ? viewTransform.getZoomFactor
            : () => viewTransform.getZoomFactorState(getConfig()),
        getZoomTimeoutMs: typeof viewTransform.getZoomTimeoutMs === "function"
            ? viewTransform.getZoomTimeoutMs
            : () => clockPort.UC.ZOOM_TIMEOUT,
        getZoomScale: typeof viewTransform.getZoomScale === "function"
            ? viewTransform.getZoomScale
            : () => clockPort.UC.ZOOM_SCALE,
        setDimension: (value) => {
            renderPort.setDimension(value);
        },
    };
}

function createRuntimeAnimationDeps({
    renderPort = {},
    statePort = {},
    clockPort = {},
} = {}) {
    const { app, session, interaction } = resolveRuntimeBootstrapStateSlices(statePort);

    return {
        animationController: renderPort.animationController,
        getAnimTime: session.getAnimTime,
        getTimeTransLunarInjection: app.getTimeTransLunarInjection,
        getTimeLunarOrbitInsertion: app.getTimeLunarOrbitInsertion,
        setMissionStartCalled: interaction.setMissionStartCalled,
        clearLegacyTimeout: clockPort.clearLegacyTimeout,
    };
}

function createUpdateConfigFromMetadata({ statePort = {} } = {}) {
    const { app } = resolveRuntimeBootstrapStateSlices(statePort);

    return function updateConfigFromMetadata() {
        const cfg = app.getConfig();
        const scene = app.getAnimationScenes()[cfg];
        if (scene?.metadata && scene.metadata.step_size_seconds) {
            const metadataStepSeconds = scene.metadata.step_size_seconds;
            scene.stepDurationInMilliSeconds = metadataStepSeconds * 1000;
            app.setTimelineTotalSteps(
                (app.getLatestEndTime() - app.getStartTime()) /
                scene.stepDurationInMilliSeconds,
            );
        }
    };
}

function createOrbitProcessDeps(
    {
        uiPort = {},
        renderPort = {},
        dataPort = {},
        clockPort = {},
        statePort = {},
    } = {},
    {
        animationActions,
        accessors,
    },
) {
    const { app, session, interaction } = resolveRuntimeBootstrapStateSlices(statePort);

    return {
        d3: uiPort.d3,
        d3SelectAll: uiPort.d3SelectAll,
        hideElementById: uiPort.hideElementById,
        clearProgressLabel: uiPort.clearProgressLabel,
        updateConfigFromMetadata: createUpdateConfigFromMetadata({ statePort }),
        getCurrentDimension: app.getCurrentDimension,
        processOrbitVectorsData: dataPort.processOrbitVectorsData,
        sleep: clockPort.sleep,
        getSvgWidth: app.getSvgWidth,
        getSvgHeight: app.getSvgHeight,
        setSvgRect: app.setSvgRect,
        getOffsetX: app.getOffsetX,
        getOffsetY: app.getOffsetY,
        getPanX: accessors.getPanX,
        getPanY: accessors.getPanY,
        getZoomFactor: accessors.getZoomFactor,
        handleZoom: renderPort.handleZoom,
        zoomEnd: renderPort.zoomEnd,
        getMissionStartCalled: interaction.getMissionStartCalled,
        missionStart: animationActions.missionStart,
        getAnimationRunning: session.getAnimationRunning,
        updateAnimateButtonText: () => {
            uiPort.updateD3ElementText("#animate", "▶");
        },
        zoomChangeTransform: renderPort.zoomChangeTransform,
        getConfig: app.getConfig,
        orbitDataProcessed: dataPort.orbitDataProcessed,
    };
}

function createRuntimeUiControlsDepsFromPorts(
    {
        uiPort = {},
        renderPort = {},
        statePort = {},
    } = {},
    {
        animationActions,
        accessors,
        createMoonRenderProfileActions,
        createMoonRenderPipelineActions,
    },
) {
    const { app, data, session, sceneView, interaction, viewTransform } =
        resolveRuntimeBootstrapStateSlices(statePort);

    return createRuntimeUiControlsDeps({
        cameraState: statePort.camera,
        getTransitionRevision: app.getTransitionRevision,
        createNavigationActions: renderPort.createNavigationActions,
        createRepeatMouseDownHandlers: renderPort.createRepeatMouseDownHandlers,
        createLockActions: renderPort.createLockActions,
        createCameraActions: renderPort.createCameraActions,
        createModeActions: renderPort.createModeActions,
        createMoonRenderProfileActions,
        createMoonRenderPipelineActions,
        createBurnActions: renderPort.createBurnActions,
        getConfig: app.getConfig,
        getPanXState: viewTransform.getPanXState,
        setPanXState: viewTransform.setPanXState,
        getPanYState: viewTransform.getPanYState,
        setPanYState: viewTransform.setPanYState,
        getZoomFactorState: viewTransform.getZoomFactorState,
        setZoomFactorState: viewTransform.setZoomFactorState,
        zoomChange: renderPort.zoomChange,
        zoomEnd: renderPort.zoomEnd,
        render: renderPort.render,
        getZoomTimeoutMs: accessors.getZoomTimeoutMs,
        getZoomScale: accessors.getZoomScale,
        toggleStatsVisibility: uiPort.toggleStatsVisibility,
        forward: animationActions.forward,
        fastForward: animationActions.fastForward,
        backward: animationActions.backward,
        fastBackward: animationActions.fastBackward,
        slower: animationActions.slower,
        resetspeed: animationActions.resetspeed,
        faster: animationActions.faster,
        realtime: animationActions.realtime,
        getMouseDownTimeout: interaction.getMouseDownTimeout,
        setMouseDownTimeout: interaction.setMouseDownTimeout,
        setTimeoutHandleZoom: interaction.setTimeoutHandleZoom,
        animationScenes: app.getAnimationScenes(),
        setChecked: uiPort.setChecked,
        readCameraPositionMode: uiPort.readCameraPositionMode,
        readCameraLookMode: uiPort.readCameraLookMode,
        applyCameraFromTo: uiPort.applyCameraFromTo,
        readPlaneSelection: uiPort.readPlaneSelection,
        setPlaneSelectionState: uiPort.setPlaneSelectionState,
        handlePlaneChange: renderPort.handlePlaneChange,
        getViewSky: sceneView.getViewSky,
        getViewConstellationLines: sceneView.getViewConstellationLines,
        applyViewForCurrentIdentity: uiPort.applyViewForCurrentIdentity,
        getGlobalConfig: app.getGlobalConfig,
        updateCraftScale: renderPort.updateCraftScale,
        getLandingFlag: session.getLandingFlag,
        setLandingFlag: session.setLandingFlag,
        getJoyRideFlag: session.getJoyRideFlag,
        setJoyRideFlag: session.setJoyRideFlag,
        setView: renderPort.setView,
        getEventInfos: data.getEventInfos,
        getTimelineEventInfos: data.getTimelineEventInfos,
        setAnimTime: session.setAnimTime,
        missionSetTime: animationActions.missionSetTime,
        THREE: renderPort.THREE,
        loadSceneTextures: renderPort.loadSceneTextures,
        loadMoonRenderProfileTextures: renderPort.loadMoonRenderProfileTextures,
        applyAndRefreshSceneTextures: renderPort.applyAndRefreshSceneTextures,
        globalObject: uiPort.windowRef,
    });
}

function createRuntimeInitHandlersById(uiControlsActions) {
    return {
        zoomin: uiControlsActions.f1,
        zoomout: uiControlsActions.f2,
        panleft: uiControlsActions.f3,
        panright: uiControlsActions.f4,
        panup: uiControlsActions.f5,
        pandown: uiControlsActions.f6,
        forward: uiControlsActions.f7,
        fastforward: uiControlsActions.f8,
        backward: uiControlsActions.f9,
        fastbackward: uiControlsActions.f10,
        slower: uiControlsActions.f11,
        resetspeed: uiControlsActions.f12,
        faster: uiControlsActions.f13,
        realtime: uiControlsActions.f14,
    };
}

function createRuntimeInitDepsFromPorts(
    {
        uiPort = {},
        renderPort = {},
        dataPort = {},
        clockPort = {},
        statePort = {},
    } = {},
    {
        uiControlsActions,
        accessors,
    },
) {
    const { app, sceneRuntime, interaction } = resolveRuntimeBootstrapStateSlices(statePort);

    return createRuntimeInitDeps({
        getConfig: app.getConfig,
        getTransitionRevision: app.getTransitionRevision,
        getScene: (cfg) => {
            const scene = app.getAnimationScenes()[cfg];
            return scene?.disposed === true ? undefined : scene;
        },
        getSceneStateInitDone: sceneRuntime.getSceneStateInitDone,
        setSceneState: sceneRuntime.setSceneState,
        resetViewTransformState: uiPort.resetViewTransformState,
        initRepeatButtons: uiPort.initRepeatButtons,
        d3SelectAll: uiPort.d3SelectAll,
        setChecked: uiPort.setChecked,
        bindRepeatButtons: uiPort.bindRepeatButtons,
        d3Select: uiPort.d3.select,
        getHandlersById: () => createRuntimeInitHandlersById(uiControlsActions),
        getTimeoutHandleZoom: interaction.getTimeoutHandleZoom,
        setTimeoutHandleZoom: interaction.setTimeoutHandleZoom,
        setMousedownTimeout: interaction.setMouseDownTimeout,
        setMouseDown: interaction.setMouseDown,
        getZoomTimeoutMs: accessors.getZoomTimeoutMs,
        clearTimeoutFn: clockPort.clearTimeoutFn,
        zoomEnd: renderPort.zoomEnd,
        sleep: clockPort.sleep,
        setAnimDate: app.setAnimDate,
        getCurrentDimension: app.getCurrentDimension,
        initSVG: dataPort.initSVG,
        loadOrbitDataIfNeededAndProcess: dataPort.loadOrbitDataIfNeededAndProcess,
        loadLandingDataAndProcess: dataPort.loadLandingDataAndProcess,
    });
}

function createInitOrchestrationDeps(
    {
        uiPort = {},
        renderPort = {},
        dataPort = {},
        clockPort = {},
        statePort = {},
    } = {},
    {
        animationActions,
        uiControlsActions,
        runtimeInitActions,
        accessors,
    },
) {
    const { app, session, interaction } = resolveRuntimeBootstrapStateSlices(statePort);

    return {
        initConfig: renderPort.initConfig,
        init: runtimeInitActions.init,
        getConfig: app.getConfig,
        isOrbitDataProcessed: (cfg) => !!dataPort.orbitDataProcessed[cfg],
        missionStart: animationActions.missionStart,
        missionSetTime: animationActions.missionSetTime,
        setRealtimeSpeed: animationActions.realtime,
        playAnimation: animationActions.playAnimation,
        setAnimTime: session.setAnimTime,
        setLocation: renderPort.setLocation,
        setDimension: accessors.setDimension,
        getSetView: () => renderPort.setView,
        getChangeCameraFromTo: () => uiControlsActions.changeCameraFromTo,
        updateCraftScale: renderPort.updateCraftScale,
        d3: uiPort.d3,
        d3SelectAll: uiPort.d3SelectAll,
        render: renderPort.render,
        requestAnimationFrame: clockPort.requestAnimationFrame,
        animateLoop: renderPort.animateLoop,
        getStartTime: app.getStartTime,
        getLatestEndTime: app.getLatestEndTime,
        animationScenes: app.getAnimationScenes(),
        markInputActivity: interaction.markInputActivity,
        getLastInputActivityMs: interaction.getLastInputActivityMs,
    };
}

export {
    createInitOrchestrationDeps,
    createOrbitProcessDeps,
    createRuntimeAnimationDeps,
    createRuntimeBootstrapAccessors,
    createRuntimeInitDepsFromPorts,
    createRuntimeInitHandlersById,
    createRuntimeUiControlsDepsFromPorts,
    createUpdateConfigFromMetadata,
};
