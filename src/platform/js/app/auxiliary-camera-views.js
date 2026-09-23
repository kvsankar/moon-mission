import { isDesktopViewport, AUXILIARY_VIEW_CAMERA_PRESETS, computeComposerDragSensitivityScale, composerRollDialKnobOffset, createAuxiliaryWebGLRendererWithFallback, isComposerPlanetVisibleForMagnitudeLimit, isComposerSkyLabelPointOccluded, normalizeComposerRollRad, resolveComposerSeeThroughMarkers, resolveComposerSkyLabelOccluders, resolveLunarFlybyTimeMs, resolveLunarFlybyWindowMs, rollRadFromDialPointer, selectSkyLabelCandidates, shouldEnableAuxiliaryPanels, shouldRenderComposerLunarCraterHover } from "./auxiliary-camera-shared.js";
import { panelLayoutMethods } from "./auxiliary-camera-panel-layout-methods.js";
import { panelStateMethods } from "./auxiliary-camera-panel-state-methods.js";
import { composerViewMethods } from "./auxiliary-camera-composer-view-methods.js";
import { panelDockingMethods } from "./auxiliary-camera-panel-docking-methods.js";
import { panelRuntimeMethods } from "./auxiliary-camera-panel-runtime-methods.js";
import { composerTimelineMethods } from "./auxiliary-camera-composer-timeline-methods.js";
import { composerCameraMethods } from "./auxiliary-camera-composer-camera-methods.js";
import { renderingMethods } from "./auxiliary-camera-rendering-methods.js";
import { disposalMethods } from "./auxiliary-camera-disposal-methods.js";

class AuxiliaryCameraViewsManager {
    constructor({
        THREE,
        overlayHost,
        requestRender,
        getEarthCloudsEnabled = null,
        setEarthCloudsEnabled = null,
    }) {
        this.THREE = THREE;
        this.overlayHost = overlayHost || document.body;
        this.requestRender = typeof requestRender === "function" ? requestRender : null;
        this.getEarthCloudsEnabled = typeof getEarthCloudsEnabled === "function"
            ? getEarthCloudsEnabled
            : () => true;
        this.setEarthCloudsEnabled = typeof setEarthCloudsEnabled === "function"
            ? setEarthCloudsEnabled
            : null;
        this.root = null;
        this.chipDock = null;
        this.chipDockLeft = null;
        this.chipDockRight = null;
        this.lastAnimationScene = null;
        this.panels = [];
        this.panelsEnabled = true;
        this.zIndexCounter = 1;
        this.dragState = null;
        this.handleResizeBound = this.handleResize.bind(this);
        this.handleExternalLayoutRequestBound = this.handleExternalLayoutRequest.bind(this);
        this.handleMissionMediaItemSelectBound = this.handleMissionMediaItemSelect.bind(this);
        this.panelStateByElement = new WeakMap();
        this.pendingResizePanelStates = new Set();
        this.pendingResizeRaf = null;
        this.composerCoronaAnimationRaf = null;
        this.defaultLayoutRaf = null;
        this.handlePanelResizeEntriesBound = this.handlePanelResizeEntries.bind(this);
        this.persistedPanelState = this.readPersistedPanelState();
        this.persistStateTimeout = null;
        this.missionPanelsEnabled = false;
        this.composerEnabled = false;
        this.lastMissionConfig = null;
        this.lunarFeatureMentionTimeline = null;
        this.lunarFeatureMentionTimelinePromise = null;
        this.lunarFeatureMentionTimelineDataPath = "";
        this.lunarFeatureMentionTimelineMissing = false;

        this.craftWorld = new THREE.Vector3();
        this.anchorWorld = new THREE.Vector3();
        this.targetWorld = new THREE.Vector3();
        this.earthWorld = new THREE.Vector3();
        this.moonWorld = new THREE.Vector3();
        this.sunWorld = new THREE.Vector3();
        this.sunDirectionWorld = new THREE.Vector3();
        this.sunDirectionEarthWorld = new THREE.Vector3(1, 0, 0);
        this.sunDirectionMoonWorld = new THREE.Vector3(1, 0, 0);
        this.sunDirectionCraftWorld = new THREE.Vector3(1, 0, 0);
        this.sunDirectionFromEarth = new THREE.Vector3();
        this.craftFromMoonDir = new THREE.Vector3();
        this.earthFromMoonDir = new THREE.Vector3();
        this.sunFromMoonDir = new THREE.Vector3();
        this.earthNorthWorld = new THREE.Vector3(0, 0, 1);
        this.moonNorthWorld = new THREE.Vector3(0, 0, 1);
        this.composerSurfaceTargetWorld = new THREE.Vector3();
        this.composerSurfaceTargetLocal = new THREE.Vector3();
        this.tmpVectorA = new THREE.Vector3();
        this.tmpVectorB = new THREE.Vector3();
        this.tmpVectorC = new THREE.Vector3();
        this.tmpVectorD = new THREE.Vector3();
        this.tmpVectorE = new THREE.Vector3();
        this.tmpVectorF = new THREE.Vector3();
        this.viewDir = new THREE.Vector3();
        this.projectedUp = new THREE.Vector3();
        this.targetUp = new THREE.Vector3();
        this.composerWorldUp = new THREE.Vector3(0, 0, 1);
        this.composerBaseUp = new THREE.Vector3();
        this.composerRotatedUp = new THREE.Vector3();
        this.targetQuat = new THREE.Quaternion();
        this.tmpQuatA = new THREE.Quaternion();
        this.tmpQuatB = new THREE.Quaternion();
        this.panelCameraWorldQuat = new THREE.Quaternion();
        this.panelCameraWorldQuatInv = new THREE.Quaternion();
        this.earthDirInCamera = new THREE.Vector3();
        this.cameraOffset = new THREE.Vector3();
        this.composerLookWorld = new THREE.Vector3();
        this.composerLookAtWorld = new THREE.Vector3();
        this.boundingBox = new THREE.Box3();
        this.boundingSphere = new THREE.Sphere();
        this.originalSkyPosition = new THREE.Vector3();
        this.originalSunReference = new THREE.Vector3();
        this.panelCameraWorldPosition = new THREE.Vector3();
        this.panelSkyLocalPosition = new THREE.Vector3();
        this.panelSunLocalPosition = new THREE.Vector3();
        this.orbitPlaneCenterWorld = new THREE.Vector3();
        this.orbitPlaneCameraPosition = new THREE.Vector3();
        this.moonElongationPrevious = null;
        this.moonElongationTrend = 1;
        this.moonVisibilitySamples = this.createFibonacciSphereSamples(720);
        this.analyticsLastUpdateMs = -Infinity;
        this.cachedMoonPhaseInfo = null;
        this.cachedMoonVisibilityInfo = null;
        this.composerFlybyTimeMs = Number.NaN;
        this.composerFlybyWindowStartMs = Number.NaN;
        this.composerFlybyWindowEndMs = Number.NaN;
        this.composerFlybyEvents = [];
        this.composerTimelinePhases = [];
        this.composerActivePhaseIndex = -1;
        this.composerSelectedPhaseIndex = -1;
        this.visiblePanelsRefreshRaf = null;
        this.composerBrightStarCatalogRef = null;
        this.composerBrightStarMagnitudeLimit = Number.NaN;
        this.composerBrightStarLabelDescriptors = [];

        if (!isDesktopViewport()) {
            return;
        }

        this.createDom();
        window.addEventListener("resize", this.handleResizeBound, { passive: true });
        document.addEventListener("moon-mission:auxiliary-panels-layout-request", this.handleExternalLayoutRequestBound);
        document.addEventListener("mission-media-item-select", this.handleMissionMediaItemSelectBound);
    }
}

Object.assign(
    AuxiliaryCameraViewsManager.prototype,
    panelLayoutMethods,
    panelStateMethods,
    composerViewMethods,
    panelDockingMethods,
    panelRuntimeMethods,
    composerTimelineMethods,
    composerCameraMethods,
    renderingMethods,
    disposalMethods,
);

export {
    AuxiliaryCameraViewsManager,
    AUXILIARY_VIEW_CAMERA_PRESETS,
    computeComposerDragSensitivityScale,
    composerRollDialKnobOffset,
    createAuxiliaryWebGLRendererWithFallback,
    isComposerPlanetVisibleForMagnitudeLimit,
    isComposerSkyLabelPointOccluded,
    normalizeComposerRollRad,
    resolveComposerSeeThroughMarkers,
    resolveComposerSkyLabelOccluders,
    resolveLunarFlybyTimeMs,
    resolveLunarFlybyWindowMs,
    rollRadFromDialPointer,
    selectSkyLabelCandidates as selectComposerSkyLabelCandidates,
    shouldEnableAuxiliaryPanels,
    shouldRenderComposerLunarCraterHover,
};
