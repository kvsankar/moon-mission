import { executeAnimationFrame } from "./scene-frame-loop-actions.js";

function createMissionRuntimeHandlersEntry(ctx) {
    const {
        performanceRef,
        requestAnimationFrameRef,
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
        getSetView,
        getSetDimensionTop,
        getStartupAnimTimeOverride,
        getMissionRuntimeWireup,
        readLoopState,
        writeLoopState,
        getFpsUpdateInterval,
        getTicksPerAnimationStep,
        updateFPSCounter,
        updateFpsCounterState,
        updateFrameDeltaState,
        computeAnimationStepState,
        getAnimationController,
        getScene,
        getCameraControlsCallback,
        updateThreeDLoopCamera,
    } = ctx;

    let startupInitFlagsMerged = false;

    async function initAnimation(flags) {
        const mergedFlags = {
            ...(flags || {}),
        };

        if (!startupInitFlagsMerged) {
            const startupAnimTimeOverride = Number(getStartupAnimTimeOverride?.());
            if (Number.isFinite(startupAnimTimeOverride)) {
                mergedFlags.startupAnimTimeOverride = startupAnimTimeOverride;
            }
            startupInitFlagsMerged = true;
        }

        return getMissionRuntimeWireup().runtimeBootstrapActions.initOrchestrationActions.initAnimation(mergedFlags);
    }

    async function processOrbitData(context) {
        return getMissionRuntimeWireup().runtimeBootstrapActions.processOrbitData(context);
    }

    function animateLoop() {
        const {
            fpsFrameCount,
            fpsLastTime,
            prevFrameTime,
            deltaFrameTime,
            animateLoopCount,
        } = readLoopState();

        const nextLoopState = executeAnimationFrame({
            performanceRef,
            fpsFrameCount,
            fpsLastTime,
            fpsUpdateInterval: getFpsUpdateInterval(),
            updateFPSCounter,
            prevFrameTime,
            deltaFrameTime,
            animateLoopCount,
            ticksPerAnimationStep: getTicksPerAnimationStep(),
            updateFpsCounterState,
            updateFrameDeltaState,
            computeAnimationStepState,
            animationController: getAnimationController(),
            getScene,
            cameraControlsCallback: getCameraControlsCallback(),
            updateThreeDLoopCamera,
        });

        writeLoopState(nextLoopState);
        requestAnimationFrameRef(animateLoop);
    }

    function main() {
        startMissionApp({
            eventBus,
            handlers: {
                reset: (event) => getMissionRuntimeWireup().runtimeBootstrapActions.reset(event),
                toggleMode: (event) => toggleModeGuarded(event),
                toggleRelativeMode: (event) => toggleRelativeMode(event),
                toggleCompareMode: (payload) => toggleCompareMode?.(payload),
                changeCompareMission: (payload) => changeCompareMission?.(payload),
                changeCompareAlignment: (payload) => changeCompareAlignment?.(payload),
                getTimelineEventInfos,
                getPhotoMode,
                setPhotoMode,
                changeCameraFromTo: (event) =>
                    getMissionRuntimeWireup().runtimeBootstrapActions.changeCameraFromTo(event),
                changeDesktopMainFov: (event) =>
                    getMissionRuntimeWireup().runtimeBootstrapActions.changeDesktopMainFov(event),
                toggleDesktopMainFovAuto: () =>
                    getMissionRuntimeWireup().runtimeBootstrapActions.toggleDesktopMainFovAuto(),
                toggleLockSC: (event) => getMissionRuntimeWireup().runtimeBootstrapActions.toggleLockSC(event),
                toggleLockMoon: (event) => getMissionRuntimeWireup().runtimeBootstrapActions.toggleLockMoon(event),
                toggleLockEarth: (event) => getMissionRuntimeWireup().runtimeBootstrapActions.toggleLockEarth(event),
                togglePlane: (event) => getMissionRuntimeWireup().runtimeBootstrapActions.togglePlane(event),
                setView: (event) => {
                    const setView = getSetView();
                    return typeof setView === "function" ? setView(event) : undefined;
                },
                setDimensionTop: (event) => {
                    const setDimensionTop = getSetDimensionTop();
                    return typeof setDimensionTop === "function" ? setDimensionTop(event) : undefined;
                },
                toggleAnimation: (event) => {
                    const runtimeActions = getMissionRuntimeWireup().runtimeBootstrapActions;
                    const handler = runtimeActions.toggleAnimation || runtimeActions.cy3Animate;
                    return typeof handler === "function" ? handler(event) : undefined;
                },
                toggleJoyRide: (event) => getMissionRuntimeWireup().runtimeBootstrapActions.toggleJoyRide(event),
                toggleLanding: (event) => getMissionRuntimeWireup().runtimeBootstrapActions.toggleLanding(event),
                toggleInfo: (event) => getMissionRuntimeWireup().runtimeBootstrapActions.toggleInfo(event),
                setMoonRenderProfile: (profile) => getMissionRuntimeWireup().runtimeBootstrapActions.setMoonRenderProfile(profile),
                getMoonRenderProfile: () => getMissionRuntimeWireup().runtimeBootstrapActions.getMoonRenderProfile(),
                setMoonRenderPipeline: (pipelineState) => getMissionRuntimeWireup().runtimeBootstrapActions.setMoonRenderPipeline(pipelineState),
                getMoonRenderPipeline: () => getMissionRuntimeWireup().runtimeBootstrapActions.getMoonRenderPipeline(),
                initAnimation,
            },
        });
    }

    return {
        initAnimation,
        processOrbitData,
        animateLoop,
        main,
    };
}

export { createMissionRuntimeHandlersEntry };
