import { degreesToRadians, distance3D, sphericalToCartesian } from "../utils/math-utils.js";
import { SkyController } from "../rendering/SkyController.js";
import { SunRenderer } from "../rendering/sun-renderer.js";
import { LightManager } from "../rendering/light-manager.js";
import { EarthRenderer } from "../rendering/earth-renderer.js";
import { MoonRenderer } from "../rendering/moon-renderer.js";
import { SpacecraftRenderer } from "../rendering/spacecraft-renderer.js";
import { CameraController } from "../rendering/camera-controller.js";
import { createOrbitCurveActions } from "./orbit-curve-actions.js";
import { createBodyRotationActions } from "./body-rotation-actions.js";
import { createLocationActions } from "./location-actions.js";
import { createSpacecraftCurveActions } from "./spacecraft-curve-actions.js";
import { createPrimarySecondaryBodiesActions } from "./primary-secondary-bodies-actions.js";
import {
    createPlaceholderSceneTextures,
    loadMoonRenderProfileTextures,
    loadSceneTextures,
    loadSceneTexturesProgressively,
} from "./texture-loader.js";
import { createSceneInitActions } from "./scene-init-actions.js";
import { createSceneDisposeActions } from "./scene-dispose-actions.js";
import { createDimensionsActions } from "./dimensions-actions.js";
import { applyAndRefreshSceneTextures } from "./scene-texture-actions.js";
import { createScene3dInitActions } from "./scene-3d-init-actions.js";
import { createSceneCameraPositionActions } from "./scene-camera-position-actions.js";
import { createSceneCreationActions } from "./scene-creation-actions.js";
import { createOrbitVectorProcessingActions } from "./orbit-vector-processing-actions.js";
import { createLineOfSightActions } from "./line-of-sight-actions.js";
import { createAxesHelperActions } from "./axes-helper-actions.js";
import { createLightActions } from "./light-actions.js";
import { createSpacecraftActions } from "./spacecraft-actions.js";
import { createSceneCameraControllerActions } from "./scene-camera-controller-actions.js";
import { createSpacecraftModelActions } from "./spacecraft-model-actions.js";
import { createSkyActions } from "./sky-actions.js";
import { createSunActions } from "./sun-actions.js";
import { createEarthActions } from "./earth-actions.js";
import { createMoonActions } from "./moon-actions.js";
import { createLunarCraterActions } from "./lunar-crater-actions.js";
import { createSurfacePointMarkerActions } from "./surface-point-marker-actions.js";
import { createOrbitMilestoneActions } from "./orbit-milestone-actions.js";

function createMissionSceneActionBundle(deps) {
    const {
        THREE,
        Astronomy,
        lunar_pole,
        COL,
        PC,
        generateCurveFromChebyshev,
        chebyshevDataLoaded,
        chebyshevData,
        npzData,
        npzDataLoaded,
        getLandingNpzLoaded,
        getLandingNpzData,
        getEphemerisSource,
        resolveBodySource,
        generateBodyCurve,
        getStepMs,
        getStartTime,
        getLatestEndTime,
        getLandingEnabled,
        getLandingChebyshevLoaded,
        getLandingChebyshevData,
        getStartLandingTime,
        getEndLandingTime,
        getPixelsPerAU,
        getGlobalConfig,
        getConfig,
        getCraftId,
        planetProperties,
        getOrbitPointsCount,
        getLandingPointsCount,
        getViewOrbitDescent,
        getViewOrbit,
        getOrbitStyle,
        getIsCompareMode,
        getTrailTrackBrightness3D,
        getTrailTailBrightness3D,
        render,
        wait10,
        wait20,
        clearEventInfo,
        computeSVGDimensions,
        getSvgWidth,
        getSvgHeight,
        cameraControlsCallback,
        setOrbitPointsCount,
        setLandingPointsCount,
        getCraftSize,
        getDefaultCameraDistance,
        getRendererDomElement,
        getModelPathPrefix,
        getMoonRadius,
        getViewMoonOsculatingOrbit,
        getFrameMode,
        getViewPolarAxes,
        getViewPoles,
        getViewMoonPolarAxes = getViewPolarAxes,
        getViewMoonPoles = getViewPoles,
        getViewMoonLatLonGrid = () => false,
        getViewMoonLatLonLabels = () => true,
        getViewMoonLatLonHover = () => false,
        getAnimTime,
        getEarthRadius,
        getViewCraters,
        getViewLunarCraters,
        getLunarCraterMinDiameterKm,
        getLunarCraterMaxDiameterKm,
        getLunarCraterHoverMinDiameterKm,
        getLunarCraterHoverMaxDiameterKm,
        getLunarCraterDisplayMode,
        getLunarFeatureTypeFilters,
        getLunarFeatureSearchQuery,
        getLunarFeatureExcludedKeys,
        getLunarFeatureHoverTypeFilters,
        getLunarFeatureHoverSearchQuery,
        getLunarFeatureHoverExcludedKeys,
        getLastInputActivityMs,
        getEventInfos,
        SceneHelpers,
    } = deps;

    const orbitCurveActions = createOrbitCurveActions({
        THREE,
        generateCurveFromChebyshev,
        chebyshevDataLoaded,
        chebyshevData,
        npzData,
        npzDataLoaded,
        getLandingNpzLoaded,
        getLandingNpzData,
        getEphemerisSource,
        resolveBodySource,
        generateBodyCurve,
        getStepMs,
        getStartTime,
        getLatestEndTime,
        getLandingEnabled,
        getLandingChebyshevLoaded,
        getLandingChebyshevData,
        getStartLandingTime,
        getEndLandingTime,
        PC,
        getPixelsPerAU,
    });

    const bodyRotationActions = createBodyRotationActions({
        lunar_pole,
        Astronomy,
        degreesToRadians,
        PC,
    });

    const locationActions = createLocationActions({
        THREE,
        sphericalToCartesian,
        degreesToRadians,
        COL,
        getEarthRadius,
        getMoonRadius,
        getGlobalConfig,
        getViewCraters,
    });

    const spacecraftCurveActions = createSpacecraftCurveActions({
        THREE,
        getGlobalConfig,
        planetProperties,
        getViewOrbitDescent,
        getViewOrbit,
        getOrbitStyle,
        getTrailTrackBrightness3D,
        getTrailTailBrightness3D,
        render,
        wait10,
        createLineMaterial: (color, options = {}) => new THREE.LineBasicMaterial({
            color,
            linewidth: Number.isFinite(options.linewidth) ? options.linewidth : 0.2,
            transparent: !!options.transparent,
            opacity: Number.isFinite(options.opacity) ? options.opacity : 1,
            depthWrite: options.depthWrite ?? true,
            depthTest: options.depthTest ?? true,
            blending: options.blending ?? THREE.NormalBlending,
        }),
    });

    const primarySecondaryBodiesActions = createPrimarySecondaryBodiesActions({
        getConfig,
        getGlobalConfig,
    });

    const sceneInitActions = createSceneInitActions({
        THREE,
        render,
        wait20,
        clearEventInfo,
    });

    const sceneDisposeActions = createSceneDisposeActions();

    const dimensionsActions = createDimensionsActions({
        computeSVGDimensions,
        getSvgWidth,
        getSvgHeight,
    });

    const scene3dInitActions = createScene3dInitActions({
        THREE,
        createPlaceholderSceneTextures,
        loadSceneTextures,
        loadSceneTexturesProgressively,
        loadMoonRenderProfileTextures,
        applyAndRefreshSceneTextures,
        render,
        getLastInputActivityMs,
        globalObject: typeof window !== "undefined" ? window : globalThis,
    });

    const sceneCameraPositionActions = createSceneCameraPositionActions({
        cameraControlsCallback,
        distance3D,
    });

    const sceneCreationActions = createSceneCreationActions();

    const orbitVectorProcessingActions = createOrbitVectorProcessingActions({
        THREE,
        orbitCurveActions,
        generateBodyCurve,
        getConfig,
        getGlobalConfig,
        npzData,
        npzDataLoaded,
        chebyshevData,
        chebyshevDataLoaded,
        getStartTime,
        getLatestEndTime,
        getStepMs,
        getPixelsPerAU,
        getEphemerisSource,
        resolveBodySource,
        getIsCompareMode,
        setOrbitPointsCount,
        setLandingPointsCount,
    });

    const lineOfSightActions = createLineOfSightActions();

    const axesHelperActions = createAxesHelperActions({
        SceneHelpers,
        getPixelsPerAU,
        PC,
    });

    const lightActions = createLightActions({
        LightManager,
    });

    const spacecraftActions = createSpacecraftActions({
        SpacecraftRenderer,
        planetProperties,
        getCraftSize,
        getGlobalConfig,
    });

    const sceneCameraControllerActions = createSceneCameraControllerActions({
        CameraController,
        getDefaultCameraDistance,
        getRendererDomElement,
        cameraControlsCallback,
        render,
    });

    const spacecraftModelActions = createSpacecraftModelActions({
        SpacecraftRenderer,
        planetProperties,
        getCraftSize,
        getGlobalConfig,
        getModelPathPrefix,
    });

    const skyActions = createSkyActions({
        SkyRenderer: SkyController,
        render,
    });

    const sunActions = createSunActions({
        SunRenderer,
        render,
    });

    const earthActions = createEarthActions({
        EarthRenderer,
        render,
    });

    const moonActions = createMoonActions({
        MoonRenderer,
        getMoonRadius,
        getGlobalConfig,
        getViewMoonOsculatingOrbit,
        getFrameMode,
        getViewPolarAxes,
        getViewPoles,
        getViewMoonPolarAxes,
        getViewMoonPoles,
        getViewMoonLatLonGrid,
        getViewMoonLatLonLabels,
        getViewMoonLatLonHover,
        getAnimTime,
        render,
    });

    const lunarCraterActions = createLunarCraterActions({
        THREE,
        sphericalToCartesian,
        degreesToRadians,
        PC,
        getMoonRadius,
        getGlobalConfig,
        getViewLunarCraters,
        getLunarCraterMinDiameterKm,
        getLunarCraterMaxDiameterKm,
        getLunarCraterHoverMinDiameterKm,
        getLunarCraterHoverMaxDiameterKm,
        getLunarCraterDisplayMode,
        getLunarFeatureTypeFilters,
        getLunarFeatureSearchQuery,
        getLunarFeatureExcludedKeys,
        getLunarFeatureHoverTypeFilters,
        getLunarFeatureHoverSearchQuery,
        getLunarFeatureHoverExcludedKeys,
        render,
    });

    const surfacePointMarkerActions = createSurfacePointMarkerActions({
        THREE,
        render,
    });

    const orbitMilestoneActions = createOrbitMilestoneActions({
        THREE,
        d3: deps.d3,
        getEventInfos,
        getGlobalConfig,
        getViewOrbit,
        render,
    });

    return {
        orbitCurveActions,
        bodyRotationActions,
        locationActions,
        spacecraftCurveActions,
        primarySecondaryBodiesActions,
        sceneInitActions,
        sceneDisposeActions,
        dimensionsActions,
        scene3dInitActions,
        sceneCameraPositionActions,
        sceneCreationActions,
        orbitVectorProcessingActions,
        lineOfSightActions,
        axesHelperActions,
        lightActions,
        spacecraftActions,
        sceneCameraControllerActions,
        spacecraftModelActions,
        skyActions,
        sunActions,
        earthActions,
        moonActions,
        lunarCraterActions,
        surfacePointMarkerActions,
        orbitMilestoneActions,
    };
}

export { createMissionSceneActionBundle };
