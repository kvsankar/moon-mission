import { createSvgActions } from "./svg-actions.js";
import { createOrbitLoadActions } from "./orbit-load-actions.js";
import { createLandingLoadActions } from "./landing-load-actions.js";
import { createOrbitElementsActions } from "./orbit-elements-actions.js";
import { createBodyLocationActions } from "./body-location-actions.js";
import { createCraftScaleActions } from "./craft-scale-actions.js";
import { createOrbitVectorsActions } from "./orbit-vectors-actions.js";
import { createLabelActions } from "./label-actions.js";
import { createZoomActions } from "./zoom-actions.js";
import { createPlaneActions } from "./plane-actions.js";
import { createOrbitMilestoneActions } from "./orbit-milestone-actions.js";

function createDataflowWiringActions(deps) {
    const {
        d3,
        THREE,
        Astronomy,
        sleep,
        updateProgressLabel,
        ensureIndeterminateProgressBar,
        showElementById,
        hideElementById,
        loadJson,
        loadChebyshev,
        loadNpz,
        processOrbitData,
        resolveLandingNpzUrl,
        resolveLandingChebyshevUrl,
        getConfig,
        getCurrentDimension,
        setSvgContainer,
        setDataLoaded,
        setSvgX,
        setSvgY,
        setSvgWidth,
        setSvgHeight,
        setOffsetX,
        setOffsetY,
        getOffsetX,
        getOffsetY,
        animationScenes,
        orbitDataLoaded,
        chebyshevData,
        chebyshevDataLoaded,
        npzData,
        npzDataLoaded,
        getDataLoaded,
        setEventInfoText,
        getEphemerisSource,
        getBodiesForConfig,
        ephemerisRecords,
        ephemerisStatuses,
        updateEphemerisPanel,
        getBodySource,
        getGlobalConfig,
        getConfigsList,
        getLandingDataLoaded,
        setLandingDataLoaded,
        setLandingNpzLoaded,
        setLandingNpzData,
        setLandingChebyshevLoaded,
        setLandingChebyshevData,
        getSvgContainer,
        planetProperties,
        PC,
        PIXELS_PER_AU,
        getZoomFactor,
        setEpochJD,
        setEpochDate,
        getStartTime,
        getEndTimeSC,
        getStartLandingTime,
        getEndLandingTime,
        getLandingNpzLoaded,
        getLandingNpzData,
        getLandingChebyshevLoaded,
        getLandingChebyshevData,
        getStartAndEndTimes,
        TC,
        getFrameMode,
        getActiveEphemerisSource,
        getIsCompareMode,
        resolveBodySourceFn,
        getBodyEphemerisRange,
        getBodyEphemerisState,
        getJoyRideFlag,
        getLandingFlag,
        getDefaultCameraDistance,
        getAnimTime,
        generateBodyCurve,
        getLatestEndTime,
        getPlaneVariables,
        planetStartTimeOverride,
        UC,
        getPixelsPerAU,
        getEpochJD,
        getEpochDate,
        setEpochDisplay,
        showPlanet,
        isLocationAvaialableOverride,
        getBodyLocationOverride,
        getXFactor,
        getYFactor,
        getXVariable,
        getYVariable,
        getCraftData,
        setZoomFactorState,
        getPanX,
        setPanXState,
        getPanY,
        setPanYState,
        adjustLabelLocationsOverride,
        showGreenwichLongitudeOverride,
        getPlaneSelection,
        setPlaneVariables,
        loadOrbitDataIfNeededAndProcessOverride,
        handleDimensionSwitch,
        setLocation,
        getOrbitStyle,
        getViewOrbit,
        getEventInfos,
        getTrailTrackBrightness2D,
        getTrailTailBrightness2D,
        getViewportWidth,
        render,
        loadProgress,
    } = deps;

    const svgActions = createSvgActions({
        d3,
        getConfig,
        getCurrentDimension,
        setSvgContainer,
        setDataLoaded,
        setSvgX,
        setSvgY,
        setSvgWidth,
        setSvgHeight,
        setOffsetX,
        setOffsetY,
        getOffsetX,
        getOffsetY,
        updateProgressLabel,
    });

    const { loadOrbitDataIfNeededAndProcess } = createOrbitLoadActions({
        d3,
        sleep,
        getConfig,
        animationScenes,
        orbitDataLoaded,
        chebyshevData,
        chebyshevDataLoaded,
        npzData,
        npzDataLoaded,
        getDataLoaded,
        setDataLoaded,
        loadChebyshev,
        loadNpz,
        processOrbitData,
        ensureIndeterminateProgressBar,
        showElementById,
        hideElementById,
        updateProgressLabel,
        setEventInfoText,
        getEphemerisSource,
        getBodiesForConfig,
        onEphemerisLoaded: ({ config, source, url, bodies = [] }) => {
            ephemerisRecords[config] = ephemerisRecords[config] || {};
            ephemerisRecords[config][source] = { url, bodies };
            updateEphemerisPanel();
        },
        onEphemerisStatus: (cfg, source, status, message = "") => {
            ephemerisStatuses[cfg] = ephemerisStatuses[cfg] || {};
            ephemerisStatuses[cfg][source] = { status, message };
            updateEphemerisPanel();
        },
        getBodySource,
        loadJson,
        getGlobalConfig,
        getViewOrbit,
        getOrbitStyle,
        render,
        loadProgress,
    });

    const { loadLandingDataAndProcess } = createLandingLoadActions({
        getGlobalConfig,
        getConfigsList,
        getLandingDataLoaded,
        setLandingDataLoaded,
        setLandingNpzLoaded,
        setLandingNpzData,
        setLandingChebyshevLoaded,
        setLandingChebyshevData,
        resolveLandingNpzUrl,
        resolveLandingChebyshevUrl,
        loadNpz,
        loadChebyshev,
        loadProgress,
        onEphemerisLoaded: ({ config, source, url, bodies = [] }) => {
            ephemerisRecords[config] = ephemerisRecords[config] || {};
            ephemerisRecords[config][source] = { url, bodies };
            updateEphemerisPanel();
        },
        onEphemerisStatus: (cfg, source, status, message = "") => {
            ephemerisStatuses[cfg] = ephemerisStatuses[cfg] || {};
            ephemerisStatuses[cfg][source] = { status, message };
            updateEphemerisPanel();
        },
    });

    const { processOrbitElementsData } = createOrbitElementsActions({
        getSvgContainer,
        getConfig,
        animationScenes,
        planetProperties,
        PC,
        PIXELS_PER_AU,
        getZoomFactor,
        setEpochJD,
        setEpochDate,
    });

    const {
        shouldDrawOrbit,
        planetStartTime,
        isLocationAvaialable,
        getBodyLocation,
    } = createBodyLocationActions({
        THREE,
        getConfig,
        getGlobalConfig,
        getStartTime,
        getEndTimeSC,
        getStartLandingTime,
        getEndLandingTime,
        chebyshevDataLoaded,
        chebyshevData,
        npzData,
        npzDataLoaded,
        getLandingNpzLoaded,
        getLandingNpzData,
        getLandingChebyshevLoaded,
        getLandingChebyshevData,
        getStartAndEndTimes,
        TC,
        getFrameMode,
        getEphemerisSource: (cfg = getConfig()) => getActiveEphemerisSource(cfg),
        resolveBodySource: resolveBodySourceFn,
        getBodyEphemerisRange,
        getBodyEphemerisState,
    });

    const craftScaleActions = createCraftScaleActions({
        THREE,
        animationScenes,
        getConfig,
        getJoyRideFlag,
        getLandingFlag,
        getDefaultCameraDistance,
        getAnimTime,
        isLocationAvaialable: isLocationAvaialableOverride || isLocationAvaialable,
        getViewportWidth,
        getGlobalConfig,
        getOrbitStyle,
    });

    const { processOrbitVectorsData: processOrbitVectorsDataBase } = createOrbitVectorsActions({
        d3,
        sleep,
        getSvgContainer,
        getCurrentDimension,
        getConfig,
        animationScenes,
        planetProperties,
        shouldDrawOrbit,
        chebyshevDataLoaded,
        chebyshevData,
        npzData,
        npzDataLoaded,
        getEphemerisSource: (cfg = getConfig()) => getActiveEphemerisSource(cfg),
        resolveBodySource: resolveBodySourceFn,
        generateBodyCurve,
        getStartTime,
        getLatestEndTime,
        getZoomFactor,
        getPlaneVariables,
        getGlobalConfig,
        getOrbitStyle,
        getTrailTrackBrightness2D,
        getTrailTailBrightness2D,
        planetStartTime: planetStartTimeOverride || planetStartTime,
        PC,
        UC,
        getPixelsPerAU,
        getEpochJD,
        getEpochDate,
        setEpochDisplay,
        getIsCompareMode,
    });

    const orbitMilestoneActions = createOrbitMilestoneActions({
        THREE,
        d3,
        getEventInfos,
        getGlobalConfig,
        getViewOrbit,
        getZoomFactor,
    });

    async function processOrbitVectorsData() {
        await processOrbitVectorsDataBase();
        orbitMilestoneActions.add2DMilestones({
            scene: animationScenes[getConfig()],
            svgContainer: getSvgContainer(),
        });
    }

    const { setLabelLocation, showGreenwichLongitude, adjustLabelLocations } = createLabelActions({
        d3,
        Astronomy,
        getCurrentDimension,
        getConfig,
        animationScenes,
        planetProperties,
        showPlanet,
        isLocationAvaialable: isLocationAvaialableOverride || isLocationAvaialable,
        getAnimTime,
        getBodyLocation: getBodyLocationOverride || getBodyLocation,
        PC,
        UC,
        getPixelsPerAU,
        getZoomFactor,
        getXFactor,
        getYFactor,
        getXVariable,
        getYVariable,
        getCraftData,
        getGlobalConfig,
    });

    const { handleZoom, handleZoomNew, zoomEnd, zoomChangeTransform, zoomChange } = createZoomActions({
        d3,
        getSvgContainer,
        getCurrentDimension,
        animationScenes,
        getConfig,
        getZoomFactor,
        setZoomFactor: (val) => {
            setZoomFactorState(val, getConfig());
        },
        getPanX,
        setPanX: (val) => {
            setPanXState(val, getConfig());
        },
        getPanY,
        setPanY: (val) => {
            setPanYState(val, getConfig());
        },
        getOffsetX,
        getOffsetY,
        adjustLabelLocations: adjustLabelLocationsOverride || adjustLabelLocations,
        showGreenwichLongitude: showGreenwichLongitudeOverride || showGreenwichLongitude,
        getOrbitStyle,
        refreshOrbitMilestones2D: () => orbitMilestoneActions.add2DMilestones({
            scene: animationScenes[getConfig()],
            svgContainer: getSvgContainer(),
        }),
    });

    const planeActions = createPlaneActions({
        getPlaneSelection,
        setPlaneVariables,
        getCurrentDimension,
        animationScenes,
        getConfig,
        getGlobalConfig,
        getFrameMode,
        initSVG: svgActions.initSVG,
        loadOrbitDataIfNeededAndProcess: loadOrbitDataIfNeededAndProcessOverride || loadOrbitDataIfNeededAndProcess,
        handleDimensionSwitch,
        setLocation,
    });

    return {
        svgActions,
        loadOrbitDataIfNeededAndProcess,
        loadLandingDataAndProcess,
        processOrbitElementsData,
        shouldDrawOrbit,
        planetStartTime,
        isLocationAvaialable,
        getBodyLocation,
        craftScaleActions,
        processOrbitVectorsData,
        setLabelLocation,
        showGreenwichLongitude,
        adjustLabelLocations,
        handleZoom,
        handleZoomNew,
        zoomEnd,
        zoomChangeTransform,
        zoomChange,
        planeActions,
    };
}

export { createDataflowWiringActions };
