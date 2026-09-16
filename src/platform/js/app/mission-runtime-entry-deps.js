import { readCheckedRadioValue, toggleVisibilityById } from "../ui/dom-helpers.js";
import { createMissionStatePorts } from "../core/state/mission-state-store.js";
import { createMissionUiEffects } from "../shell/ui/mission-ui-effects.js";
import { createClockEffects } from "../shell/time/clock-effects.js";

function createMissionStatePortsContext(ctx, { getRuntimeBootstrapActions }) {
    return {
        state: ctx.missionStateCells,
        runtimeFlags: ctx.runtimeFlags,
        animationScenes: ctx.animationScenes,
        orbitDataProcessed: ctx.orbitDataProcessed,
        chebyshevData: ctx.chebyshevData,
        chebyshevDataLoaded: ctx.chebyshevDataLoaded,
        npzData: ctx.npzData,
        npzDataLoaded: ctx.npzDataLoaded,
        landingNpzData: ctx.landingNpzData,
        landingNpzLoaded: ctx.landingNpzLoaded,
        landingChebyshevData: ctx.landingChebyshevData,
        landingChebyshevLoaded: ctx.landingChebyshevLoaded,
        planetProperties: ctx.planetProperties,
        ephemerisStatuses: ctx.ephemerisStatuses,
        resolveBodySource: ctx.resolveBodySource,
        getActiveEphemerisSource: ctx.getActiveEphemerisSource,
        ...ctx.sceneViewStateActions,
        getRuntimeBootstrapActions,
        getAnimationSceneInitDone: () => ctx.AnimationScene.SCENE_STATE_INIT_DONE,
    };
}

function createMissionStatePortsForEntry(ctx, getRuntimeBootstrapActions) {
    return createMissionStatePorts(
        createMissionStatePortsContext(ctx, { getRuntimeBootstrapActions }),
    );
}

function createMissionRuntimeEffects(
    ctx,
    missionStatePorts,
    { clearTimeoutFn = clearTimeout } = {},
) {
    return {
        missionUiEffects: createMissionUiEffects({ d3: ctx.d3 }),
        missionClockEffects: createClockEffects({
            clearTimeoutFn,
            getLegacyTimeoutHandle: missionStatePorts.interaction.getLegacyTimeoutHandle,
        }),
    };
}

function createModeSwitchWireupActions(modeSwitchActions) {
    return {
        handleDimensionSwitch: modeSwitchActions.switchDimension,
        handleModeSwitchToGeo: modeSwitchActions.switchToGeo,
        handleModeSwitchToLunar: modeSwitchActions.switchToLunar,
    };
}

function createMissionRuntimeWireupContext(
    ctx,
    {
        missionStatePorts,
        missionUiEffects,
        missionClockEffects,
    },
) {
    return {
        ...ctx.staticWireupDeps,
        ...ctx.bridgeActions,
        ...ctx.sceneViewStateActions,
        ...createModeSwitchWireupActions(ctx.modeSwitchActions),
        isRelativeMode: ctx.isRelativeMode,
        isCompareMode: ctx.isCompareMode,
        initAnimation: ctx.initAnimation,
        animateLoop: ctx.animateLoop,
        isTestMode: ctx.isTestMode,
        statePorts: missionStatePorts,
        cameraState: ctx.cameraState,
        uiEffects: missionUiEffects,
        clockEffects: missionClockEffects,
        readPlaneSelection: ctx.readPlaneSelection,
        toggleStatsVisibility: ctx.toggleStatsVisibility,
        syncViewIdentity: ctx.syncViewIdentity,
        applyViewForCurrentIdentity: ctx.applyViewForCurrentIdentity,
    };
}

function createMissionRuntimeStaticDepsContext(ctx) {
    return {
        d3: ctx.d3,
        d3SelectAll: ctx.d3SelectAll,
        THREE: ctx.THREE,
        Astronomy: ctx.Astronomy,
        windowRef: ctx.windowRef,
        documentRef: ctx.documentRef,
        consoleRef: ctx.consoleRef,
        SwiperClass: ctx.SwiperClass,
        formatMetric: ctx.formatMetric,
        animationScenes: ctx.animationScenes,
        animation3DControllers: ctx.animation3DControllers,
        animation2DControllers: ctx.animation2DControllers,
        orbitDataLoaded: ctx.orbitDataLoaded,
        orbitDataProcessed: ctx.orbitDataProcessed,
        chebyshevData: ctx.chebyshevData,
        chebyshevDataLoaded: ctx.chebyshevDataLoaded,
        npzData: ctx.npzData,
        npzDataLoaded: ctx.npzDataLoaded,
        ephemerisRecords: ctx.ephemerisRecords,
        ephemerisStatuses: ctx.ephemerisStatuses,
        planetProperties: ctx.planetProperties,
        animationController: ctx.animationController,
        AnimationScene: ctx.AnimationScene,
        SceneHandlerClass: ctx.SceneHandlerClass,
        bindInfoPanelControls: ctx.bindInfoPanelControls,
        updateEphemerisPanel: ctx.updateEphemerisPanel,
        PIXELS_PER_AU: ctx.pixelsPerAU,
        render: ctx.render,
        processOrbitData: ctx.processOrbitData,
        setTimelineMediaMarkers: ctx.setTimelineMediaMarkers,
    };
}

function createMissionRuntimeEntryContext(ctx, { staticWireupDeps }) {
    return {
        cameraState: ctx.cameraState,
        syncViewIdentity: ctx.syncViewIdentity,
        applyViewForCurrentIdentity: ctx.applyViewForCurrentIdentity,
        d3: ctx.d3,
        missionStateCells: ctx.missionStateCells,
        runtimeFlags: ctx.runtimeFlags,
        animationScenes: ctx.animationScenes,
        orbitDataProcessed: ctx.orbitDataProcessed,
        chebyshevData: ctx.chebyshevData,
        chebyshevDataLoaded: ctx.chebyshevDataLoaded,
        npzData: ctx.npzData,
        npzDataLoaded: ctx.npzDataLoaded,
        landingNpzData: ctx.landingNpzData,
        landingNpzLoaded: ctx.landingNpzLoaded,
        landingChebyshevData: ctx.landingChebyshevData,
        landingChebyshevLoaded: ctx.landingChebyshevLoaded,
        planetProperties: ctx.planetProperties,
        ephemerisStatuses: ctx.ephemerisStatuses,
        resolveBodySource: ctx.resolveBodySource,
        getActiveEphemerisSource: ctx.getActiveEphemerisSource,
        sceneViewStateActions: ctx.sceneViewStateActions,
        AnimationScene: ctx.AnimationScene,
        bridgeActions: ctx.bridgeActions,
        modeSwitchActions: ctx.modeSwitchActions,
        staticWireupDeps,
        readPlaneSelection: () => readCheckedRadioValue("plane", "DEFAULT"),
        toggleStatsVisibility: () => {
            toggleVisibilityById("stats");
        },
        animateLoop: ctx.animateLoop,
        initAnimation: ctx.initAnimation,
        isRelativeMode: ctx.isRelativeMode,
        isCompareMode: ctx.isCompareMode,
        isTestMode: ctx.isTestMode,
    };
}

export {
    createMissionRuntimeEffects,
    createMissionRuntimeEntryContext,
    createMissionRuntimeStaticDepsContext,
    createMissionRuntimeWireupContext,
    createMissionStatePortsContext,
    createMissionStatePortsForEntry,
    createModeSwitchWireupActions,
};
