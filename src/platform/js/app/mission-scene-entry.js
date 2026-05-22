import { createMissionSceneRuntime } from "./mission-scene-runtime.js";

function createMissionSceneEntry(ctx) {
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
        landingNpzLoaded,
        landingNpzData,
        getActiveEphemerisSource,
        resolveBodySource,
        getBodyEphemerisSources,
        generateBodyCurve,
        getAnimationScenes,
        getStartTime,
        getLatestEndTime,
        getLandingEnabled,
        landingChebyshevLoaded,
        landingChebyshevData,
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
        getTrailTrackBrightness3D,
        getTrailTailBrightness3D,
        render,
        bridgeActions,
        clearEventInfo,
        getMissionRuntimeWireup,
        getSvgWidth,
        getSvgHeight,
        setOrbitPointsCount,
        setLandingPointsCount,
        getCraftSize,
        getDefaultCameraDistance,
        getSceneHandler,
        windowRef,
        getMoonRadius,
        getViewMoonOsculatingOrbit,
        frameMode,
        getViewPolarAxes,
        getViewPoles,
        getViewMoonLatLonGrid = () => false,
        getViewMoonLatLonLabels = () => true,
        getViewMoonLatLonHover = () => false,
        getViewEarthLatLonGrid = () => false,
        getViewEarthLatLonLabels = () => true,
        getViewEarthLatLonHover = () => false,
        getViewEarthPoles = null,
        getViewMoonPoles = null,
        getViewEarthPolarAxes = null,
        getViewMoonPolarAxes = null,
        getAnimTime,
        getEarthRadius,
        getViewCraters,
        getViewLunarCraters,
        getLunarCraterMinDiameterKm,
        getLunarCraterMaxDiameterKm,
        getLunarCraterHoverMinDiameterKm,
        getLunarCraterHoverMaxDiameterKm,
        getLunarCraterHoverLabels,
        getLunarCraterDisplayMode,
        getLunarFeatureTypeFilters,
        getLunarFeatureSearchQuery,
        getLunarFeatureExcludedKeys,
        getLunarFeatureHoverTypeFilters,
        getLunarFeatureHoverSearchQuery,
        getLunarFeatureHoverExcludedKeys,
        getViewPhotoMode,
        getViewEarthClouds,
        setViewEarthClouds,
        setViewLunarCraters,
        SceneHelpers,
        d3,
        DEFAULT_VIEW_STATE,
        bindSettingsPanel,
        initSceneHandlerDom,
        isTestMode,
        isCompareMode,
        getRuntimeFlags,
        ensureSceneViewState,
        computeSceneCameraParameters,
        getBodyEphemerisState,
        getEphemerisSource,
        getViewSky,
        getViewConstellationLines,
        getViewMoonSOI,
        getViewMoonHillSphere,
        getViewBodyHalos,
        getViewXYZAxes,
        getViewAuxiliaryPanels,
        getViewSubSolarEarth = () => false,
        getViewSubSolarMoon = () => false,
        getViewSubMoonEarth = () => false,
        getViewSolarGlintEarth = () => false,
        getViewLunarGlintEarth = () => false,
        getViewSubCraftEarth = () => false,
        getViewSubCraftMoon = () => false,
        getViewAntiSolarEarth = () => false,
        getViewAntiSolarMoon = () => false,
        getViewAntiMoonEarth = () => false,
        getViewAntiCraftEarth = () => false,
        getViewAntiCraftMoon = () => false,
        getViewEclipticPlane,
        getViewEquatorialPlane,
        getEventInfos,
        getTimelineEventInfos,
        getLastInputActivityMs,
    } = ctx;
    const readViewEarthClouds = typeof getViewEarthClouds === "function"
        ? getViewEarthClouds
        : () => true;
    const writeViewEarthClouds = typeof setViewEarthClouds === "function"
        ? setViewEarthClouds
        : null;
    const readViewLunarCraters = typeof getViewLunarCraters === "function"
        ? getViewLunarCraters
        : () => false;
    const readLunarCraterMinDiameterKm = typeof getLunarCraterMinDiameterKm === "function"
        ? getLunarCraterMinDiameterKm
        : () => 80;
    const readLunarCraterMaxDiameterKm = typeof getLunarCraterMaxDiameterKm === "function"
        ? getLunarCraterMaxDiameterKm
        : () => 600;
    const readLunarCraterHoverMinDiameterKm = typeof getLunarCraterHoverMinDiameterKm === "function"
        ? getLunarCraterHoverMinDiameterKm
        : () => 0;
    const readLunarCraterHoverMaxDiameterKm = typeof getLunarCraterHoverMaxDiameterKm === "function"
        ? getLunarCraterHoverMaxDiameterKm
        : () => 600;
    const readLunarCraterHoverLabels = typeof getLunarCraterHoverLabels === "function"
        ? getLunarCraterHoverLabels
        : () => true;
    const readLunarCraterDisplayMode = typeof getLunarCraterDisplayMode === "function"
        ? getLunarCraterDisplayMode
        : () => "hover";
    const readLunarFeatureTypeFilters = typeof getLunarFeatureTypeFilters === "function"
        ? getLunarFeatureTypeFilters
        : () => ({});
    const readLunarFeatureSearchQuery = typeof getLunarFeatureSearchQuery === "function"
        ? getLunarFeatureSearchQuery
        : () => "";
    const readLunarFeatureExcludedKeys = typeof getLunarFeatureExcludedKeys === "function"
        ? getLunarFeatureExcludedKeys
        : () => [];
    const readLunarFeatureHoverTypeFilters = typeof getLunarFeatureHoverTypeFilters === "function"
        ? getLunarFeatureHoverTypeFilters
        : () => ({});
    const readLunarFeatureHoverSearchQuery = typeof getLunarFeatureHoverSearchQuery === "function"
        ? getLunarFeatureHoverSearchQuery
        : () => "";
    const readLunarFeatureHoverExcludedKeys = typeof getLunarFeatureHoverExcludedKeys === "function"
        ? getLunarFeatureHoverExcludedKeys
        : () => [];
    const writeViewLunarCraters = typeof setViewLunarCraters === "function"
        ? setViewLunarCraters
        : null;
    const readViewEarthLatLonGrid = typeof getViewEarthLatLonGrid === "function"
        ? getViewEarthLatLonGrid
        : () => false;
    const readViewEarthLatLonLabels = typeof getViewEarthLatLonLabels === "function"
        ? getViewEarthLatLonLabels
        : () => true;
    const readViewEarthLatLonHover = typeof getViewEarthLatLonHover === "function"
        ? getViewEarthLatLonHover
        : () => false;
    const readViewEarthPoles = typeof getViewEarthPoles === "function"
        ? getViewEarthPoles
        : getViewPoles;
    const readViewMoonPoles = typeof getViewMoonPoles === "function"
        ? getViewMoonPoles
        : getViewPoles;
    const readViewEarthPolarAxes = typeof getViewEarthPolarAxes === "function"
        ? getViewEarthPolarAxes
        : getViewPolarAxes;
    const readViewMoonPolarAxes = typeof getViewMoonPolarAxes === "function"
        ? getViewMoonPolarAxes
        : getViewPolarAxes;

    return createMissionSceneRuntime({
        sceneActionDeps: {
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
            getLandingNpzLoaded: (cfg = getConfig()) => !!landingNpzLoaded[cfg],
            getLandingNpzData: (cfg = getConfig()) => landingNpzData[cfg],
            getEphemerisSource: (cfg = getConfig()) => getActiveEphemerisSource(cfg),
            resolveBodySource: (bodyId) =>
                resolveBodySource({
                    bodyId,
                    bodySources: getBodyEphemerisSources(),
                    defaultSpacecraftSource: getEphemerisSource(),
                }),
            generateBodyCurve,
            getStepMs: (cfg) => getAnimationScenes()[cfg].stepDurationInMilliSeconds,
            getStartTime,
            getLatestEndTime,
            getLandingEnabled,
            getLandingChebyshevLoaded: (cfg = getConfig()) => !!landingChebyshevLoaded[cfg],
            getLandingChebyshevData: (cfg = getConfig()) => landingChebyshevData[cfg],
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
            getIsCompareMode: () => Boolean(isCompareMode),
            getTrailTrackBrightness3D,
            getTrailTailBrightness3D,
            render,
            wait10: bridgeActions.wait10,
            wait20: bridgeActions.wait20,
            clearEventInfo,
            computeSVGDimensions: () => getMissionRuntimeWireup().svgActions.computeSVGDimensions(),
            getSvgWidth,
            getSvgHeight,
            cameraControlsCallback: bridgeActions.cameraControlsCallback,
            setOrbitPointsCount,
            setLandingPointsCount,
            getCraftSize,
            getDefaultCameraDistance,
            getRendererDomElement: () => getSceneHandler().renderer.domElement,
            getModelPathPrefix: () => windowRef.missionConfig.modelPath,
            getMoonRadius,
            getViewMoonOsculatingOrbit,
            getFrameMode: () => frameMode,
            getViewPolarAxes,
            getViewPoles,
            getViewMoonPolarAxes: readViewMoonPolarAxes,
            getViewMoonPoles: readViewMoonPoles,
            getViewMoonLatLonGrid,
            getViewMoonLatLonLabels,
            getViewMoonLatLonHover,
            getAnimTime,
            getEarthRadius,
            getViewCraters,
            getViewLunarCraters: readViewLunarCraters,
            getLunarCraterMinDiameterKm: readLunarCraterMinDiameterKm,
            getLunarCraterMaxDiameterKm: readLunarCraterMaxDiameterKm,
            getLunarCraterHoverLabels: readLunarCraterHoverLabels,
            getLunarCraterDisplayMode: readLunarCraterDisplayMode,
            getLunarFeatureTypeFilters: readLunarFeatureTypeFilters,
            getLunarFeatureSearchQuery: readLunarFeatureSearchQuery,
            getLunarFeatureExcludedKeys: readLunarFeatureExcludedKeys,
            getLastInputActivityMs,
            getEventInfos,
            SceneHelpers,
        },
        sceneBootstrapDeps: {
            THREE,
            d3,
            PC,
            DEFAULT_VIEW_STATE,
            SceneHelpers,
            lunar_pole,
            bindSettingsPanel,
            initSceneHandlerDom,
            computeSVGDimensions: () => getMissionRuntimeWireup().svgActions.computeSVGDimensions(),
            getSvgWidth,
            getSvgHeight,
            isTestMode,
            onWindowResize: bridgeActions.onWindowResize,
            updateCraftScale: bridgeActions.updateCraftScale,
            getSceneHandlerRuntimeState: () => {
                const runtimeFlags = getRuntimeFlags();
                return {
                    globalConfig: getGlobalConfig(),
                    joyRideFlag: runtimeFlags.joyRide,
                    landingFlag: runtimeFlags.landing,
                    isCompareMode,
                    viewPhotoMode: getViewPhotoMode(),
                    viewEarthClouds: readViewEarthClouds(),
                    viewLunarCraters: readViewLunarCraters(),
                    lunarCraterMinDiameterKm: readLunarCraterMinDiameterKm(),
                    lunarCraterMaxDiameterKm: readLunarCraterMaxDiameterKm(),
                    lunarCraterHoverMinDiameterKm: readLunarCraterHoverMinDiameterKm(),
                    lunarCraterHoverMaxDiameterKm: readLunarCraterHoverMaxDiameterKm(),
                    lunarCraterHoverLabels: readLunarCraterHoverLabels(),
                    lunarCraterDisplayMode: readLunarCraterDisplayMode(),
                    lunarFeatureTypeFilters: readLunarFeatureTypeFilters(),
                    lunarFeatureSearchQuery: readLunarFeatureSearchQuery(),
                    lunarFeatureExcludedKeys: readLunarFeatureExcludedKeys(),
                    lunarFeatureHoverTypeFilters: readLunarFeatureHoverTypeFilters(),
                    lunarFeatureHoverSearchQuery: readLunarFeatureHoverSearchQuery(),
                    lunarFeatureHoverExcludedKeys: readLunarFeatureHoverExcludedKeys(),
                    viewAuxiliaryPanels: getViewAuxiliaryPanels(),
                    earthRadius: getEarthRadius(),
                    moonRadius: getMoonRadius(),
                    timelineEventInfos:
                        typeof getTimelineEventInfos === "function"
                            ? getTimelineEventInfos()
                            : (typeof getEventInfos === "function" ? getEventInfos() : null),
                };
            },
            getViewEarthClouds: readViewEarthClouds,
            setViewEarthClouds: writeViewEarthClouds,
            getViewLunarCraters: readViewLunarCraters,
            setViewLunarCraters: writeViewLunarCraters,
            ensureSceneViewState,
            computeSceneCameraParameters,
            adjustCameraProjectionMatrixAndSkyAngle: bridgeActions.adjustCameraProjectionMatrixAndSkyAngle,
            getDefaultCameraDistance,
            getBodyEphemerisState,
            resolveBodySource,
            getAnimationSceneRuntimeState: () => ({
                globalConfig: getGlobalConfig(),
                frameMode,
                isCompareMode,
                config: getConfig(),
                npzData,
                npzDataLoaded,
                chebyshevData,
                chebyshevDataLoaded,
                bodyEphemerisSources: getBodyEphemerisSources(),
                ephemerisSource: getEphemerisSource(),
                animTime: getAnimTime(),
                earthRadius: getEarthRadius(),
                moonRadius: getMoonRadius(),
                viewSky: getViewSky(),
                viewConstellationLines: getViewConstellationLines(),
                viewPolarAxes: getViewPolarAxes(),
                viewPoles: getViewPoles(),
                viewMoonLatLonGrid: getViewMoonLatLonGrid(),
                viewMoonLatLonLabels: getViewMoonLatLonLabels(),
                viewMoonLatLonHover: getViewMoonLatLonHover(),
                viewEarthLatLonGrid: readViewEarthLatLonGrid(),
                viewEarthLatLonLabels: readViewEarthLatLonLabels(),
                viewEarthLatLonHover: readViewEarthLatLonHover(),
                viewEarthPoles: readViewEarthPoles(),
                viewMoonPoles: readViewMoonPoles(),
                viewEarthPolarAxes: readViewEarthPolarAxes(),
                viewMoonPolarAxes: readViewMoonPolarAxes(),
                viewMoonSOI: getViewMoonSOI(),
                viewMoonHillSphere: getViewMoonHillSphere(),
                viewBodyHalos: getViewBodyHalos(),
                viewMoonOsculatingOrbit: getViewMoonOsculatingOrbit(),
                viewSubSolarEarth: getViewSubSolarEarth(),
                viewSubSolarMoon: getViewSubSolarMoon(),
                viewSubMoonEarth: getViewSubMoonEarth(),
                viewSolarGlintEarth: getViewSolarGlintEarth(),
                viewLunarGlintEarth: getViewLunarGlintEarth(),
                viewSubCraftEarth: getViewSubCraftEarth(),
                viewSubCraftMoon: getViewSubCraftMoon(),
                viewAntiSolarEarth: getViewAntiSolarEarth(),
                viewAntiSolarMoon: getViewAntiSolarMoon(),
                viewAntiMoonEarth: getViewAntiMoonEarth(),
                viewAntiCraftEarth: getViewAntiCraftEarth(),
                viewAntiCraftMoon: getViewAntiCraftMoon(),
                viewLunarCraters: readViewLunarCraters(),
                lunarCraterMinDiameterKm: readLunarCraterMinDiameterKm(),
                lunarCraterMaxDiameterKm: readLunarCraterMaxDiameterKm(),
                lunarCraterHoverMinDiameterKm: readLunarCraterHoverMinDiameterKm(),
                lunarCraterHoverMaxDiameterKm: readLunarCraterHoverMaxDiameterKm(),
                lunarCraterHoverLabels: readLunarCraterHoverLabels(),
                lunarCraterDisplayMode: readLunarCraterDisplayMode(),
                lunarFeatureTypeFilters: readLunarFeatureTypeFilters(),
                lunarFeatureSearchQuery: readLunarFeatureSearchQuery(),
                lunarFeatureExcludedKeys: readLunarFeatureExcludedKeys(),
                lunarFeatureHoverTypeFilters: readLunarFeatureHoverTypeFilters(),
                lunarFeatureHoverSearchQuery: readLunarFeatureHoverSearchQuery(),
                lunarFeatureHoverExcludedKeys: readLunarFeatureHoverExcludedKeys(),
                viewXYZAxes: getViewXYZAxes(),
                viewEclipticPlane: getViewEclipticPlane(),
                viewEquatorialPlane: getViewEquatorialPlane(),
            }),
        },
    });
}

export { createMissionSceneEntry };


