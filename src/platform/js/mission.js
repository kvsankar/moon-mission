
// Copyright (c) 2013-2024 Sankaranarayanan Viswanathan. All rights reserved.

import {
    CELESTIAL_BODIES as CB,
    FORMAT_CONSTANTS as FC,
    TIME_CONSTANTS as TC,
    UI_CONSTANTS as UC
} from "./core/constants.js";
import {
    clearEventInfo,
    d3SelectAll,
    updateEventInfo,
    updateD3ElementText,
    updateFPSCounter,
} from "./core/dom.js";
import {
    isCompareRuntimeMode,
    isRelativeFrameRuntimeMode,
    resolveCompareOriginMode,
    resolveFrameModeForRuntimeMode,
} from "./core/domain/runtime-mode.js";
import { startMissionApp } from "./app/mission-app.js";
import { createRuntimeCameraState } from "./core/state/runtime-camera-state.js";
import { whenMissionConfigLoaded } from "./data/mission-data.js";
import { resolveDockviewEnabled } from "./core/domain/dockview-policy.js";
import { showElementById } from "./ui/dom-helpers.js";
import {
    applyViewSettings,
    readDimensionSelection,
    readPlaneSelection,
    readViewSettings,
} from "./ui/ui-state.js";
import { syncCompareModeControls } from "./ui/event-handlers.js";
import { bindRuntimeInteractionActivity } from "./ui/runtime-interaction-activity.js";
import {
    resolveBodySource,
} from "./data/ephemeris-provider.js";
import {
    DEFAULT_VIEW_STATE,
} from "./app/plane-view-state.js";
import { createEphemerisInfoPanelActions } from "./app/ephemeris-info-panel.js";
import { createMissionLegacyState } from "./app/mission-legacy-state.js";
import {
    createMissionRuntimeRoot,
    publishMissionRuntimeGlobals,
} from "./app/mission-runtime-root.js";
import {
    createMissionSceneComposition,
    createMissionSceneRender,
} from "./app/mission-scene-composition.js";
import {
    createMissionLegacyStateCells,
} from "./app/mission-legacy-state-cells.js";
import {
    createMissionLegacyStateBindings,
} from "./app/mission-legacy-state-bindings.js";
import {
    createMissionRuntimeHandlersEntryContext,
    createMissionRuntimeWireupEntryContext,
} from "./app/mission-runtime-root-context.js";
import { createMissionViewEntry } from "./app/mission-view-entry.js";
import {
    computeAnimationStepState,
    updateFpsCounterState,
    updateFrameDeltaState,
    updateThreeDLoopCamera,
} from "./app/animation-loop.js";
import { adjustSceneCameraProjectionAndSky } from "./app/scene-camera-upkeep-actions.js";
import { createRuntimeInteractionState } from "./core/state/runtime-interaction-state.js";
import { createRuntimeLoopState } from "./core/state/runtime-loop-state.js";
import { createRuntimeSessionState } from "./core/state/runtime-session-state.js";
import { createRuntimeViewState } from "./core/state/runtime-view-state.js";
import { createMissionPlaybackRuntime } from "./app/mission-entry-composition.js";
import { buildTimelineEventInfos } from "./app/comparison-timeline.js";

import Swiper from 'swiper/bundle';
import * as THREE from 'three';

// Expose THREE for runtime modules that are initialized outside DI wiring.
if (typeof window !== "undefined" && !window.THREE) {
    window.THREE = THREE;
}

// Check if running in test mode (for consistent visual regression testing)
const startupParams = new URLSearchParams(window.location.search);
const isTestMode = startupParams.get('testMode') === 'true';
const urlMode = startupParams.get('mode');
const compareOriginMode = resolveCompareOriginMode({
    mode: urlMode,
    origin: startupParams.get("origin"),
});
const isCompareMode = isCompareRuntimeMode(urlMode);
const isRelativeMode = isRelativeFrameRuntimeMode({
    mode: urlMode,
    compareOrigin: compareOriginMode,
});
const frameMode = resolveFrameModeForRuntimeMode({
    mode: urlMode,
    compareOrigin: compareOriginMode,
});

let {
    craftSize,
    planetProperties,
    FORMAT_METRIC,
    craftId,
    config: initialConfig,
    missionStartCalled: initialMissionStartCalled,
    orbitDataLoaded,
    orbitDataProcessed,
    landingDataLoaded,
    ephemerisSource,
    chebyshevDataLoaded,
    chebyshevData,
    npzDataLoaded,
    npzData,
    landingNpzLoaded,
    landingNpzData,
    landingChebyshevLoaded,
    landingChebyshevData,
    nOrbitPoints,
    nLandingPoints,
    sunLongitude,
    mouseDown: initialMouseDown,
    planeSelection,
    plane,
    xVariable,
    yVariable,
    zVariable,
    vxVariable,
    vyVariable,
    vzVariable,
    xFactor,
    yFactor,
    zFactor,
    craftData,
    PIXELS_PER_AU,
    svgX,
    svgY,
    svgWidth,
    svgHeight,
    offsetx,
    offsety,
    trackWidth,
    earthRadius,
    moonRadius,
    svgContainer,
    svgRect,
    zoomFactor,
    panx,
    pany,
    defaultCameraDistance,
    epochJD,
    epochDate,
    startTime,
    endTime,
    endTimeSC,
    latestEndTime,
    startLandingTime,
    endLandingTime,
    timelineTotalSteps,
    animDate,
    animTime,
    animationRunning,
    startLandingFlag: initialStartLandingFlag,
    timeoutHandle: initialLegacyTimeoutHandle,
    timeoutHandleZoom: initialTimeoutHandleZoom,
    dataLoaded,
    ticksPerAnimationStep,
    mousedownTimeout: initialMouseDownTimeout,
    fpsUpdateInterval,
    timeTransLunarInjection,
    timeLunarOrbitInsertion,
    eventInfos,
    currentDimension: initialCurrentDimension,
    previousDimension: initialPreviousDimension,
    dimensionChanged: initialDimensionChanged,
    theSceneHandler,
    animationScenes,
    animation3DControllers,
    animation2DControllers,
} = createMissionLegacyState({
    CB,
    FC,
    TC,
    UC,
    DEFAULT_VIEW_STATE,
    d3,
});

export { animationScenes };

const cameraState = createRuntimeCameraState();
const runtimeViewState = createRuntimeViewState({
    initialConfig,
    initialCurrentDimension,
    initialPreviousDimension,
    initialDimensionChanged,
});

function getActiveEphemerisSource(cfg = runtimeViewState.getConfig()) {
    return ephemerisSource;
}
const ephemerisRecords = {}; // config -> { npz?: { url, bodies }, chebyshev?: { url } }
const ephemerisStatuses = {}; // config -> { npz?: { status, message }, chebyshev?: { status, message } }
let bodyEphemerisSources = {}; // optional per-body overrides from config

const {
    bindInfoPanelControls,
    updateEphemerisPanel,
} = createEphemerisInfoPanelActions({
    getGlobalConfig: () => globalConfig,
    getEphemerisSource: () => ephemerisSource,
    getEphemerisRecords: () => ephemerisRecords,
    getEphemerisStatuses: () => ephemerisStatuses,
    getBodyEphemerisSources: () => bodyEphemerisSources,
    resolveBodySource,
});

let missionRuntimeWireup = null;
let timelineEventInfosCache = {
    compareMode: null,
    config: null,
    globalConfig: null,
    eventInfos: null,
    result: [],
};
let timelineMediaMarkers = [];

function setTimelineMediaMarkers(nextMarkers) {
    timelineMediaMarkers = Array.isArray(nextMarkers) ? nextMarkers : [];
    syncTimelineDock?.();
}

function getSceneForConfig(cfg = runtimeViewState.getConfig()) {
    const scene = animationScenes[cfg];
    return scene?.disposed === true ? undefined : scene;
}

let toggleMode;
let setDimensionTop;
let setView;
const runtimeSessionState = createRuntimeSessionState({
    initialAnimTime: animTime,
    initialAnimationRunning: animationRunning,
    initialJoyRide: false,
    initialLanding: false,
});
const runtimeFlags = runtimeSessionState.getRuntimeFlags();
const runtimeLoopState = createRuntimeLoopState({
    initialDeltaFrameTime: TC.ONE_MINUTE_MS,
});
const runtimeInteractionState = createRuntimeInteractionState({
    initialMissionStartCalled,
    initialStartLandingFlag,
    initialMouseDown,
    initialMouseDownTimeout,
    initialTimeoutHandleZoom,
    initialLegacyTimeoutHandle,
});
bindRuntimeInteractionActivity({
    documentRef: document,
    markInputActivity: runtimeInteractionState.markInputActivity,
});

function getEffectiveOrbitStyle() {
    const selectedStyle = runtimeViewState.getOrbitStyle();
    if (selectedStyle !== "trail") {
        return "classic";
    }
    return runtimeSessionState.getAnimationRunning() ? "trail" : "classic";
}

const render = createMissionSceneRender({
    getSceneHandler: () => theSceneHandler,
    getAnimationScenes: () => animationScenes,
    getConfig: () => runtimeViewState.getConfig(),
});

const {
    bridgeActions,
    sceneViewStateActions,
    modeSwitchActions,
    initialMissionViewState,
} = createMissionViewEntry({
    d3,
    d3SelectAll,
    windowRef: window,
    showElementById,
    getGlobalConfig: () => globalConfig,
    getConfig: () => runtimeViewState.getConfig(),
    setConfig: (val) => {
        runtimeViewState.setConfig(val);
    },
    getLandingFlag: () => runtimeSessionState.getLandingFlag(),
    setLandingFlag: (val) => {
        runtimeSessionState.setLandingFlag(val);
    },
    getCraftScaleActions: () => missionRuntimeWireup?.craftScaleActions,
    getSceneFrameOrchestrationActions: () => missionRuntimeWireup?.sceneFrameOrchestrationActions,
    render,
    adjustSceneCameraProjectionAndSky,
    getAnimationScenes: () => animationScenes,
    computeSVGDimensions: () => missionRuntimeWireup?.svgActions?.computeSVGDimensions?.(),
    getSvgWidth: () => svgWidth,
    getSvgHeight: () => svgHeight,
    getSceneHandler: () => theSceneHandler,
    getSceneForConfig,
    getLegacyPlaneSelection: () => planeSelection,
    setLegacyPlaneSelection: (value) => {
        planeSelection = value;
    },
    getLegacyPlaneVariables: () => ({
        plane: plane,
        xFactor: xFactor,
        yFactor: yFactor,
        zFactor: zFactor,
        xVariable: xVariable,
        yVariable: yVariable,
        zVariable: zVariable,
        vxVariable: vxVariable,
        vyVariable: vyVariable,
        vzVariable: vzVariable,
    }),
    setLegacyPlaneVariables: (planeConfig) => {
        plane = planeConfig.plane;
        xFactor = planeConfig.xFactor;
        yFactor = planeConfig.yFactor;
        zFactor = planeConfig.zFactor;
        xVariable = planeConfig.xVariable;
        yVariable = planeConfig.yVariable;
        zVariable = planeConfig.zVariable;
        vxVariable = planeConfig.vxVariable;
        vyVariable = planeConfig.vyVariable;
        vzVariable = planeConfig.vzVariable;
    },
    getLegacyZoomFactor: () => zoomFactor,
    setLegacyZoomFactor: (value) => {
        zoomFactor = value;
    },
    getLegacyPanX: () => panx,
    setLegacyPanX: (value) => {
        panx = value;
    },
    getLegacyPanY: () => pany,
    setLegacyPanY: (value) => {
        pany = value;
    },
    isRelativeMode,
    isCompareMode,
    getToggleMode: () => toggleMode,
    getCurrentAnimTime: () => runtimeSessionState.getAnimTime(),
    planeSelection,
});

const {
    toggleRelativeMode,
    toggleModeGuarded,
    toggleCompareMode,
    changeCompareMission,
    changeCompareAlignment,
} = initialMissionViewState;
runtimeViewState.setConfig(initialMissionViewState.config);
runtimeViewState.setCurrentViewIdentity({
    originMode: initialMissionViewState.config,
    cameraPositionMode: cameraState.get().positionMode,
    cameraLookMode: cameraState.get().lookMode,
    planeSelection,
    dimension: runtimeViewState.getCurrentDimension(),
});
runtimeViewState.setViewFlags({
    viewPhotoMode: runtimeViewState.getViewPhotoMode(),
    viewEarthClouds: runtimeViewState.getViewEarthClouds(),
    viewAuxiliaryPanels: initialMissionViewState.viewAuxiliaryPanels,
    viewOrbit: initialMissionViewState.viewOrbit,
    viewOrbitDescent: initialMissionViewState.viewOrbitDescent,
    viewCraters: initialMissionViewState.viewCraters,
    viewLunarCraters: initialMissionViewState.viewLunarCraters,
    lunarCraterShowAllEnabled:
        initialMissionViewState.lunarCraterShowAllEnabled ?? runtimeViewState.getLunarCraterShowAllEnabled(),
    lunarCraterHoverEnabled:
        initialMissionViewState.lunarCraterHoverEnabled ?? runtimeViewState.getLunarCraterHoverEnabled(),
    viewMoonLatLonGrid: initialMissionViewState.viewMoonLatLonGrid,
    viewMoonLatLonLabels: initialMissionViewState.viewMoonLatLonLabels ?? runtimeViewState.getViewMoonLatLonLabels(),
    viewMoonLatLonHover: initialMissionViewState.viewMoonLatLonHover ?? runtimeViewState.getViewMoonLatLonHover(),
    viewEarthLatLonGrid: initialMissionViewState.viewEarthLatLonGrid,
    viewEarthLatLonLabels: initialMissionViewState.viewEarthLatLonLabels ?? runtimeViewState.getViewEarthLatLonLabels(),
    viewEarthLatLonHover: initialMissionViewState.viewEarthLatLonHover ?? runtimeViewState.getViewEarthLatLonHover(),
    lunarCraterMinDiameterKm:
        initialMissionViewState.lunarCraterMinDiameterKm ?? runtimeViewState.getLunarCraterMinDiameterKm(),
    lunarCraterMaxDiameterKm:
        initialMissionViewState.lunarCraterMaxDiameterKm ?? runtimeViewState.getLunarCraterMaxDiameterKm(),
    lunarCraterHoverMinDiameterKm:
        initialMissionViewState.lunarCraterHoverMinDiameterKm ?? runtimeViewState.getLunarCraterHoverMinDiameterKm(),
    lunarCraterHoverMaxDiameterKm:
        initialMissionViewState.lunarCraterHoverMaxDiameterKm ?? runtimeViewState.getLunarCraterHoverMaxDiameterKm(),
    lunarCraterHoverLabels: initialMissionViewState.lunarCraterHoverLabels ?? runtimeViewState.getLunarCraterHoverLabels(),
    lunarCraterDisplayMode: initialMissionViewState.lunarCraterDisplayMode ?? runtimeViewState.getLunarCraterDisplayMode(),
    lunarFeatureTypeFilters:
        initialMissionViewState.lunarFeatureTypeFilters ?? runtimeViewState.getLunarFeatureTypeFilters(),
    lunarFeatureSearchQuery:
        initialMissionViewState.lunarFeatureSearchQuery ?? runtimeViewState.getLunarFeatureSearchQuery(),
    lunarFeatureExcludedKeys:
        initialMissionViewState.lunarFeatureExcludedKeys ?? runtimeViewState.getLunarFeatureExcludedKeys(),
    lunarFeatureHoverTypeFilters:
        initialMissionViewState.lunarFeatureHoverTypeFilters ?? runtimeViewState.getLunarFeatureHoverTypeFilters(),
    lunarFeatureHoverSearchQuery:
        initialMissionViewState.lunarFeatureHoverSearchQuery ?? runtimeViewState.getLunarFeatureHoverSearchQuery(),
    lunarFeatureHoverExcludedKeys:
        initialMissionViewState.lunarFeatureHoverExcludedKeys ?? runtimeViewState.getLunarFeatureHoverExcludedKeys(),
    viewXYZAxes: initialMissionViewState.viewXYZAxes,
    viewPoles: initialMissionViewState.viewPoles,
    viewPolarAxes: initialMissionViewState.viewPolarAxes,
    viewEarthPoles: initialMissionViewState.viewEarthPoles,
    viewMoonPoles: initialMissionViewState.viewMoonPoles,
    viewEarthPolarAxes: initialMissionViewState.viewEarthPolarAxes,
    viewMoonPolarAxes: initialMissionViewState.viewMoonPolarAxes,
    viewSky: initialMissionViewState.viewSky,
    viewConstellationLines: initialMissionViewState.viewConstellationLines,
    viewMoonSOI: initialMissionViewState.viewMoonSOI,
    viewMoonHillSphere: initialMissionViewState.viewMoonHillSphere,
    viewBodyHalos: initialMissionViewState.viewBodyHalos,
    viewMoonOsculatingOrbit: initialMissionViewState.viewMoonOsculatingOrbit,
    viewSubSolarEarth: initialMissionViewState.viewSubSolarEarth,
    viewSubSolarMoon: initialMissionViewState.viewSubSolarMoon,
    viewSubMoonEarth: initialMissionViewState.viewSubMoonEarth,
    viewSolarGlintEarth: initialMissionViewState.viewSolarGlintEarth,
    viewLunarGlintEarth: initialMissionViewState.viewLunarGlintEarth,
    viewSubCraftEarth: initialMissionViewState.viewSubCraftEarth,
    viewSubCraftMoon: initialMissionViewState.viewSubCraftMoon,
    viewAntiSolarEarth: initialMissionViewState.viewAntiSolarEarth,
    viewAntiSolarMoon: initialMissionViewState.viewAntiSolarMoon,
    viewAntiMoonEarth: initialMissionViewState.viewAntiMoonEarth,
    viewAntiCraftEarth: initialMissionViewState.viewAntiCraftEarth,
    viewAntiCraftMoon: initialMissionViewState.viewAntiCraftMoon,
    viewEclipticPlane: initialMissionViewState.viewEclipticPlane,
    viewEquatorialPlane: initialMissionViewState.viewEquatorialPlane,
    viewFPS: initialMissionViewState.viewFPS,
    orbitStyle: runtimeViewState.getOrbitStyle(),
    trailTrackBrightness2D: runtimeViewState.getTrailTrackBrightness2D(),
    trailTrackBrightness3D: runtimeViewState.getTrailTrackBrightness3D(),
    trailTailBrightness2D: runtimeViewState.getTrailTailBrightness2D(),
    trailTailBrightness3D: runtimeViewState.getTrailTailBrightness3D(),
});

function dispatchViewSettingsAppliedForIdentity() {
    document.dispatchEvent(
        new CustomEvent("moon-mission:view-identity-settings-applied", {
            detail: {
                viewIdentity: runtimeViewState.getCurrentViewIdentity(),
                viewIdentityKey: runtimeViewState.getCurrentViewIdentityKey(),
            },
        }),
    );
}

function readCurrentViewIdentity() {
    return {
        originMode: runtimeViewState.getConfig() || "geo",
        cameraPositionMode: cameraState.get().positionMode,
        cameraLookMode: cameraState.get().lookMode,
        planeSelection:
            sceneViewStateActions.getPlaneSelectionState?.(runtimeViewState.getConfig()) ||
            readPlaneSelection(),
        dimension: runtimeViewState.getCurrentDimension() || readDimensionSelection(),
    };
}

function syncRuntimeViewIdentityFromControls() {
    const result = runtimeViewState.setCurrentViewIdentity(
        readCurrentViewIdentity(),
        { previousViewFlags: readViewSettings() },
    );
    if (result.changed) {
        applyViewSettings(result.viewFlags);
        dispatchViewSettingsAppliedForIdentity();
    }
    return result;
}

function applyViewForCurrentIdentity() {
    syncRuntimeViewIdentityFromControls();
    if (typeof setView === "function") {
        setView({
            detail: {
                reason: "view-identity-change",
            },
        });
        // Origin/dimension readiness replays retained main-camera intent. An
        // already-applied revision is idempotent, including nested view sync.
        missionRuntimeWireup?.runtimeBootstrapActions?.changeCameraFromTo(undefined, {
            projectControls: false,
            syncViewIdentity: false,
        });
        return true;
    }
    return false;
}

function getTimelineEventInfos() {
    const currentConfig = runtimeViewState.getConfig();
    if (
        timelineEventInfosCache.compareMode === isCompareMode &&
        timelineEventInfosCache.config === currentConfig &&
        timelineEventInfosCache.globalConfig === globalConfig &&
        timelineEventInfosCache.eventInfos === eventInfos
    ) {
        return timelineEventInfosCache.result;
    }

    const result = buildTimelineEventInfos({
        compareMode: isCompareMode,
        globalConfig,
        config: currentConfig,
        primaryEventInfos: eventInfos,
    });
    timelineEventInfosCache = {
        compareMode: isCompareMode,
        config: currentConfig,
        globalConfig,
        eventInfos,
        result,
    };
    return result;
}

const {
    eventBus,
    animationController,
    syncTimelineDock,
    syncActiveCraftControl,
} = createMissionPlaybackRuntime({
    windowRef: window,
    documentRef: document,
    CustomEventClass: typeof CustomEvent === "function" ? CustomEvent : null,
    runtimeSessionState,
    bridgeActions,
    updateD3ElementText,
    getSetView: () => setView,
    getAnimationScenes: () => animationScenes,
    getConfig: () => runtimeViewState.getConfig(),
    getGlobalConfig: () => globalConfig,
    getStartTime: () => startTime,
    getLatestEndTime: () => latestEndTime,
    getAnimTime: () => runtimeSessionState.getAnimTime(),
    getEventInfos: () => eventInfos,
    getTimelineEventInfos,
    getTimelineMediaMarkers: () => timelineMediaMarkers,
    getIsCompareMode: () => isCompareMode,
    syncTimelineEventButtons: (timelineEventInfos) => {
        missionRuntimeWireup?.initConfigUiActions?.syncBurnButtons?.(timelineEventInfos);
        syncCompareModeControls(isCompareMode);
    },
    defaultStepMs: TC.ONE_MINUTE_MS,
    maxTimelineStepMs: TC.ONE_SECOND_MS,
    updateEventInfo,
    clearEventInfo,
});

var globalConfig = null; // Store loaded config from config.json

const {
    SceneHandler,
    AnimationScene,
} = createMissionSceneComposition({
    d3,
    THREE,
    Astronomy,
    DEFAULT_VIEW_STATE,
    isTestMode,
    isCompareMode,
    frameMode,
    chebyshevDataLoaded,
    chebyshevData,
    npzData,
    npzDataLoaded,
    landingNpzLoaded,
    landingNpzData,
    getActiveEphemerisSource,
    resolveBodySource,
    getBodyEphemerisSources: () => bodyEphemerisSources,
    getAnimationScenes: () => animationScenes,
    getStartTime: () => startTime,
    getLatestEndTime: () => latestEndTime,
    getLandingEnabled: () => !!(globalConfig && globalConfig.landing && globalConfig.landing.enabled),
    landingChebyshevLoaded,
    landingChebyshevData,
    getStartLandingTime: () => startLandingTime,
    getEndLandingTime: () => endLandingTime,
    getPixelsPerAU: () => PIXELS_PER_AU,
    getGlobalConfig: () => globalConfig,
    getConfig: () => runtimeViewState.getConfig(),
    getCraftId: () => craftId,
    planetProperties,
    getOrbitPointsCount: () => nOrbitPoints,
    getLandingPointsCount: () => nLandingPoints,
    getViewOrbitDescent: () => runtimeViewState.getViewOrbitDescent(),
    getViewOrbit: () => runtimeViewState.getViewOrbit(),
    getOrbitStyle: () => getEffectiveOrbitStyle(),
    getTrailTrackBrightness3D: () => runtimeViewState.getTrailTrackBrightness3D(),
    getTrailTailBrightness3D: () => runtimeViewState.getTrailTailBrightness3D(),
    bridgeActions,
    clearEventInfo,
    getMissionRuntimeWireup: () => missionRuntimeWireup,
    getSvgWidth: () => svgWidth,
    getSvgHeight: () => svgHeight,
    setOrbitPointsCount: (count) => {
        nOrbitPoints = count;
    },
    setLandingPointsCount: (count) => {
        nLandingPoints = count;
    },
    getCraftSize: () => craftSize,
    getDefaultCameraDistance: () => defaultCameraDistance,
    getSceneHandler: () => theSceneHandler,
    windowRef: window,
    getMoonRadius: () => moonRadius,
    getViewPolarAxes: () => runtimeViewState.getViewPolarAxes(),
    getViewPoles: () => runtimeViewState.getViewPoles(),
    getViewEarthPolarAxes: () => runtimeViewState.getViewEarthPolarAxes(),
    getViewMoonPolarAxes: () => runtimeViewState.getViewMoonPolarAxes(),
    getViewEarthPoles: () => runtimeViewState.getViewEarthPoles(),
    getViewMoonPoles: () => runtimeViewState.getViewMoonPoles(),
    getViewEarthLatLonGrid: () => runtimeViewState.getViewEarthLatLonGrid(),
    getViewEarthLatLonLabels: () => runtimeViewState.getViewEarthLatLonLabels(),
    getViewEarthLatLonHover: () => runtimeViewState.getViewEarthLatLonHover(),
    getViewMoonLatLonGrid: () => runtimeViewState.getViewMoonLatLonGrid(),
    getViewMoonLatLonLabels: () => runtimeViewState.getViewMoonLatLonLabels(),
    getViewMoonLatLonHover: () => runtimeViewState.getViewMoonLatLonHover(),
    getAnimTime: () => runtimeSessionState.getAnimTime(),
    getEarthRadius: () => earthRadius,
    getViewCraters: () => runtimeViewState.getViewCraters(),
    getViewLunarCraters: () => runtimeViewState.getViewLunarCraters(),
    getLunarCraterMinDiameterKm: () => runtimeViewState.getLunarCraterMinDiameterKm(),
    getLunarCraterMaxDiameterKm: () => runtimeViewState.getLunarCraterMaxDiameterKm(),
    getLunarCraterHoverLabels: () => runtimeViewState.getLunarCraterHoverLabels(),
    getLunarCraterDisplayMode: () => runtimeViewState.getLunarCraterDisplayMode(),
    getLunarFeatureTypeFilters: () => runtimeViewState.getLunarFeatureTypeFilters(),
    getLunarFeatureSearchQuery: () => runtimeViewState.getLunarFeatureSearchQuery(),
    getLunarFeatureExcludedKeys: () => runtimeViewState.getLunarFeatureExcludedKeys(),
    getLunarCraterHoverMinDiameterKm: () => runtimeViewState.getLunarCraterHoverMinDiameterKm(),
    getLunarCraterHoverMaxDiameterKm: () => runtimeViewState.getLunarCraterHoverMaxDiameterKm(),
    getLunarFeatureHoverTypeFilters: () => runtimeViewState.getLunarFeatureHoverTypeFilters(),
    getLunarFeatureHoverSearchQuery: () => runtimeViewState.getLunarFeatureHoverSearchQuery(),
    getLunarFeatureHoverExcludedKeys: () => runtimeViewState.getLunarFeatureHoverExcludedKeys(),
    getViewPhotoMode: () => runtimeViewState.getViewPhotoMode(),
    getViewEarthClouds: () => runtimeViewState.getViewEarthClouds(),
    setViewEarthClouds: (value) => {
        runtimeViewState.setViewEarthClouds(value);
        render();
        return runtimeViewState.getViewEarthClouds();
    },
    setViewLunarCraters: (value) => {
        runtimeViewState.setViewLunarCraters(value);
        const enabled = runtimeViewState.getViewLunarCraters();
        const craterDisplayMode = runtimeViewState.getLunarCraterDisplayMode();
        applyViewSettings({
            viewCraters: runtimeViewState.getViewCraters(),
            viewLunarCraters: enabled,
            lunarCraterDisplayMode: craterDisplayMode,
            lunarCraterMinDiameterKm: runtimeViewState.getLunarCraterMinDiameterKm(),
            lunarCraterMaxDiameterKm: runtimeViewState.getLunarCraterMaxDiameterKm(),
            lunarCraterHoverMinDiameterKm: runtimeViewState.getLunarCraterHoverMinDiameterKm(),
            lunarCraterHoverMaxDiameterKm: runtimeViewState.getLunarCraterHoverMaxDiameterKm(),
            lunarFeatureTypeFilters: runtimeViewState.getLunarFeatureTypeFilters(),
            lunarFeatureSearchQuery: runtimeViewState.getLunarFeatureSearchQuery(),
            lunarFeatureExcludedKeys: runtimeViewState.getLunarFeatureExcludedKeys(),
            lunarFeatureHoverTypeFilters: runtimeViewState.getLunarFeatureHoverTypeFilters(),
            lunarFeatureHoverSearchQuery: runtimeViewState.getLunarFeatureHoverSearchQuery(),
            lunarFeatureHoverExcludedKeys: runtimeViewState.getLunarFeatureHoverExcludedKeys(),
        });
        const lunarCraterPill = document.getElementById("toggle-pill-lunar-craters");
        if (lunarCraterPill) {
            lunarCraterPill.classList.toggle("is-active", enabled);
            lunarCraterPill.setAttribute("aria-pressed", enabled ? "true" : "false");
        }
        const lunarCraterOffToggle = document.getElementById("lunar-crater-off-toggle");
        if (lunarCraterOffToggle) {
            lunarCraterOffToggle.classList.toggle("is-active", !enabled);
            lunarCraterOffToggle.setAttribute("aria-pressed", enabled ? "false" : "true");
            lunarCraterOffToggle.textContent = "Off";
        }
        const lunarCraterVisibleToggle = document.getElementById("lunar-crater-visible-toggle");
        if (lunarCraterVisibleToggle) {
            const active = enabled && craterDisplayMode === "always";
            lunarCraterVisibleToggle.classList.toggle("is-active", active);
            lunarCraterVisibleToggle.setAttribute("aria-pressed", active ? "true" : "false");
            lunarCraterVisibleToggle.textContent = "Show always";
        }
        const lunarCraterHoverToggle = document.getElementById("lunar-crater-hover-toggle");
        if (lunarCraterHoverToggle) {
            const active = enabled && craterDisplayMode === "hover";
            lunarCraterHoverToggle.classList.toggle("is-active", active);
            lunarCraterHoverToggle.setAttribute("aria-pressed", active ? "true" : "false");
            lunarCraterHoverToggle.textContent = "Show on hover";
        }
        if (typeof setView === "function") {
            setView();
        } else {
            render();
        }
        return enabled;
    },
    getRuntimeFlags: () => runtimeSessionState.getRuntimeFlags(),
    ensureSceneViewState: sceneViewStateActions.ensureSceneViewState,
    getEphemerisSource: () => ephemerisSource,
    getViewSky: () => runtimeViewState.getViewSky(),
    getViewConstellationLines: () => runtimeViewState.getViewConstellationLines(),
    getViewMoonSOI: () => runtimeViewState.getViewMoonSOI(),
    getViewMoonHillSphere: () => runtimeViewState.getViewMoonHillSphere(),
    getViewBodyHalos: () => runtimeViewState.getViewBodyHalos(),
    getViewMoonOsculatingOrbit: () => runtimeViewState.getViewMoonOsculatingOrbit(),
    getViewSubSolarEarth: () => runtimeViewState.getViewSubSolarEarth(),
    getViewSubSolarMoon: () => runtimeViewState.getViewSubSolarMoon(),
    getViewSubMoonEarth: () => runtimeViewState.getViewSubMoonEarth(),
    getViewSolarGlintEarth: () => runtimeViewState.getViewSolarGlintEarth(),
    getViewLunarGlintEarth: () => runtimeViewState.getViewLunarGlintEarth(),
    getViewSubCraftEarth: () => runtimeViewState.getViewSubCraftEarth(),
    getViewSubCraftMoon: () => runtimeViewState.getViewSubCraftMoon(),
    getViewEarthLatLonGrid: () => runtimeViewState.getViewEarthLatLonGrid(),
    getViewEarthLatLonLabels: () => runtimeViewState.getViewEarthLatLonLabels(),
    getViewEarthLatLonHover: () => runtimeViewState.getViewEarthLatLonHover(),
    getViewMoonLatLonGrid: () => runtimeViewState.getViewMoonLatLonGrid(),
    getViewMoonLatLonLabels: () => runtimeViewState.getViewMoonLatLonLabels(),
    getViewMoonLatLonHover: () => runtimeViewState.getViewMoonLatLonHover(),
    getViewXYZAxes: () => runtimeViewState.getViewXYZAxes(),
    getViewAuxiliaryPanels: () => runtimeViewState.getViewAuxiliaryPanels(),
    getViewEclipticPlane: () => runtimeViewState.getViewEclipticPlane(),
    getViewEquatorialPlane: () => runtimeViewState.getViewEquatorialPlane(),
    getEventInfos: () => eventInfos,
    getTimelineEventInfos,
    getLastInputActivityMs: runtimeInteractionState.getLastInputActivityMs,
    render,
});

const missionStateCells = createMissionLegacyStateCells({
    ...createMissionLegacyStateBindings({
        getGlobalConfig: () => globalConfig,
        setGlobalConfig: (value) => { globalConfig = value; },
        getSvgContainer: () => svgContainer,
        setSvgContainer: (value) => { svgContainer = value; },
        getDataLoaded: () => dataLoaded,
        setDataLoaded: (value) => { dataLoaded = value; },
        getSvgX: () => svgX,
        setSvgX: (value) => { svgX = value; },
        getSvgY: () => svgY,
        setSvgY: (value) => { svgY = value; },
        getSvgWidth: () => svgWidth,
        setSvgWidth: (value) => { svgWidth = value; },
        getSvgHeight: () => svgHeight,
        setSvgHeight: (value) => { svgHeight = value; },
        getOffsetX: () => offsetx,
        setOffsetX: (value) => { offsetx = value; },
        getOffsetY: () => offsety,
        setOffsetY: (value) => { offsety = value; },
        getLandingDataLoaded: () => landingDataLoaded,
        setLandingDataLoaded: (value) => { landingDataLoaded = value; },
        getEpochJD: () => epochJD,
        setEpochJD: (value) => { epochJD = value; },
        getEpochDate: () => epochDate,
        setEpochDate: (value) => { epochDate = value; },
        getStartTime: () => startTime,
        setStartTime: (value) => { startTime = value; },
        getEndTime: () => endTime,
        setEndTime: (value) => { endTime = value; },
        getEndTimeSC: () => endTimeSC,
        setEndTimeSC: (value) => { endTimeSC = value; },
        getLatestEndTime: () => latestEndTime,
        setLatestEndTime: (value) => { latestEndTime = value; },
        getTimelineTotalSteps: () => timelineTotalSteps,
        setTimelineTotalSteps: (value) => { timelineTotalSteps = value; },
        getTicksPerAnimationStep: () => ticksPerAnimationStep,
        setTicksPerAnimationStep: (value) => { ticksPerAnimationStep = value; },
        getPixelsPerAU: () => PIXELS_PER_AU,
        setPixelsPerAU: (value) => { PIXELS_PER_AU = value; },
        getDefaultCameraDistance: () => defaultCameraDistance,
        setDefaultCameraDistance: (value) => { defaultCameraDistance = value; },
        getTrackWidth: () => trackWidth,
        setTrackWidth: (value) => { trackWidth = value; },
        getEarthRadius: () => earthRadius,
        setEarthRadius: (value) => { earthRadius = value; },
        getMoonRadius: () => moonRadius,
        setMoonRadius: (value) => { moonRadius = value; },
        getStartLandingTime: () => startLandingTime,
        setStartLandingTime: (value) => { startLandingTime = value; },
        getEndLandingTime: () => endLandingTime,
        setEndLandingTime: (value) => { endLandingTime = value; },
        getCraftData: () => craftData,
        setCraftData: (value) => { craftData = value; },
        getEventInfos: () => eventInfos,
        setEventInfos: (value) => { eventInfos = value; },
        getEphemerisSource: () => ephemerisSource,
        setEphemerisSource: (value) => { ephemerisSource = value; },
        getBodyEphemerisSources: () => bodyEphemerisSources,
        setBodyEphemerisSources: (value) => { bodyEphemerisSources = value; },
        getTimeTransLunarInjection: () => timeTransLunarInjection,
        setTimeTransLunarInjection: (value) => { timeTransLunarInjection = value; },
        getTimeLunarOrbitInsertion: () => timeLunarOrbitInsertion,
        setTimeLunarOrbitInsertion: (value) => { timeLunarOrbitInsertion = value; },
        getSceneHandler: () => theSceneHandler,
        setSceneHandler: (value) => { theSceneHandler = value; },
        getAnimDate: () => animDate,
        setAnimDate: (value) => { animDate = value; },
        getSvgRect: () => svgRect,
        setSvgRect: (value) => { svgRect = value; },
        getSunLongitude: () => sunLongitude,
        setSunLongitude: (value) => { sunLongitude = value; },
        getFrameMode: () => frameMode,
        getCraftId: () => craftId,
    }),
    runtimeViewState,
    runtimeSessionState,
    runtimeInteractionState,
    getEffectiveOrbitStyle,
});

function getPhotoMode() {
    return runtimeViewState.getViewPhotoMode();
}

function setPhotoMode(value) {
    runtimeViewState.setViewPhotoMode(value);
    render();
    return runtimeViewState.getViewPhotoMode();
}

const handlersEntryContext = createMissionRuntimeHandlersEntryContext({
    performanceRef: performance,
    requestAnimationFrameRef: requestAnimationFrame,
    startMissionApp,
    eventBus,
    toggleModeGuarded,
    toggleRelativeMode,
    toggleCompareMode,
    changeCompareMission,
    changeCompareAlignment,
    getTimelineEventInfos,
    getPhotoMode,
    setPhotoMode,
    getStartupAnimTimeOverride: () => initialMissionViewState.startupAnimTimeOverride,
    runtimeLoopState,
    getFpsUpdateInterval: () => fpsUpdateInterval,
    getTicksPerAnimationStep: () => ticksPerAnimationStep,
    updateFPSCounter,
    updateFpsCounterState,
    updateFrameDeltaState,
    computeAnimationStepState,
    animationController,
    animationScenes,
    runtimeViewState,
    bridgeActions,
    updateThreeDLoopCamera,
});

const wireupEntryContext = createMissionRuntimeWireupEntryContext({
    d3,
    d3SelectAll,
    THREE,
    Astronomy,
    windowRef: window,
    documentRef: document,
    consoleRef: console,
    SwiperClass: Swiper,
    formatMetric: FORMAT_METRIC,
    missionStateCells,
    runtimeFlags,
    animationScenes,
    orbitDataLoaded,
    orbitDataProcessed,
    chebyshevData,
    chebyshevDataLoaded,
    npzData,
    npzDataLoaded,
    landingNpzData,
    landingNpzLoaded,
    landingChebyshevData,
    landingChebyshevLoaded,
    planetProperties,
    ephemerisRecords,
    ephemerisStatuses,
    resolveBodySource,
    getActiveEphemerisSource,
    getBodyEphemerisSources: () => bodyEphemerisSources,
    sceneViewStateActions,
    AnimationScene,
    SceneHandlerClass: SceneHandler,
    bridgeActions,
    modeSwitchActions,
    animation3DControllers,
    animation2DControllers,
    animationController,
    bindInfoPanelControls,
    updateEphemerisPanel,
    pixelsPerAU: PIXELS_PER_AU,
    render,
    isRelativeMode,
    isCompareMode,
    isTestMode,
    getTimelineEventInfos,
    setTimelineMediaMarkers,
    syncViewIdentity: syncRuntimeViewIdentityFromControls,
    applyViewForCurrentIdentity,
    cameraState,
});

const {
    initAnimation,
    processOrbitData,
    animateLoop,
    main,
    missionRuntimeWireup: nextMissionRuntimeWireup,
    toggleMode: runtimeToggleMode,
    setDimensionTop: runtimeSetDimensionTop,
    setView: runtimeSetView,
} = createMissionRuntimeRoot({
    handlersEntryContext,
    wireupEntryContext,
    syncTimelineDock,
    syncActiveCraftControl,
});
missionRuntimeWireup = nextMissionRuntimeWireup;
toggleMode = runtimeToggleMode;
setDimensionTop = runtimeSetDimensionTop;
setView = runtimeSetView;
window.__moonMissionResizeMainView = () => {
    bridgeActions.onWindowResize();
};
export { main };

publishMissionRuntimeGlobals({
    windowRef: window,
    animationScenes,
    AnimationScene,
    main,
});

let runtimeCleanupRegistered = false;
let runtimeCleanupComplete = false;

function disposeMissionRuntimeResources() {
    if (runtimeCleanupComplete) {
        return;
    }
    runtimeCleanupComplete = true;
    if (window.__moonMissionResizeMainView) {
        delete window.__moonMissionResizeMainView;
    }
    missionRuntimeWireup?.sceneUiUpdateActions?.dispose?.();
    Object.values(animationScenes || {}).forEach((scene) => {
        scene?.dispose?.();
    });
    theSceneHandler?.dispose?.();
    theSceneHandler = null;
}

function registerMissionRuntimeCleanup() {
    if (runtimeCleanupRegistered || typeof window === "undefined") {
        return;
    }
    runtimeCleanupRegistered = true;
    window.addEventListener("pagehide", (event) => {
        if (event?.persisted === true) {
            return;
        }
        disposeMissionRuntimeResources();
    }, { once: true });
    window.addEventListener("beforeunload", () => {
        disposeMissionRuntimeResources();
    }, { once: true });
}

registerMissionRuntimeCleanup();

// Wait for a successful runtime-driven load (including an explicit retry) before
// importing or mounting the workspace. Never use defaults after a config failure:
// CY3's SSIM profile, for example, explicitly selects the legacy scene layout.
whenMissionConfigLoaded().then(async (missionConfig) => {
    const enabled = resolveDockviewEnabled({
        urlSearch: window.location.search,
        viewportWidth: window.innerWidth,
        missionConfig,
    });
    if (!enabled) {
        document.documentElement.dataset.panelLayout = "legacy";
        return;
    }
    const { initializeExperimentalDockviewHost } = await import("./app/experimental-dockview-host.js");
    const workspace = initializeExperimentalDockviewHost({ missionConfig });
    document.documentElement.dataset.panelLayout = workspace ? "dockview" : "legacy";
}).catch((error) => {
    document.documentElement.dataset.panelLayout = "error";
    console.warn("Dockview panel workspace failed to initialize", error);
});

// end of file
