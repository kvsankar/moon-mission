import { createRuntimeCameraState } from "../core/state/runtime-camera-state.js";
import { createRuntimeViewState } from "../core/state/runtime-view-state.js";
import { createRuntimeSessionState } from "../core/state/runtime-session-state.js";
import { createRuntimeLoopState } from "../core/state/runtime-loop-state.js";
import { createRuntimeInteractionState } from "../core/state/runtime-interaction-state.js";
import { bindRuntimeInteractionActivity } from "../ui/runtime-interaction-activity.js";
import { createMissionSceneRender } from "./mission-scene-composition.js";

export function createMissionRuntimeStateBootstrap({
    initialConfig,
    initialCurrentDimension,
    initialPreviousDimension,
    initialDimensionChanged,
    initialAnimTime,
    initialAnimationRunning,
    initialMissionStartCalled,
    initialStartLandingFlag,
    initialMouseDown,
    initialMouseDownTimeout,
    initialTimeoutHandleZoom,
    initialLegacyTimeoutHandle,
    minuteStepMs,
    documentRef,
    getSceneHandler,
    getAnimationScenes,
}) {
    const cameraState = createRuntimeCameraState();
    const runtimeViewState = createRuntimeViewState({
        initialConfig,
        initialCurrentDimension,
        initialPreviousDimension,
        initialDimensionChanged,
    });
    const runtimeSessionState = createRuntimeSessionState({
        initialAnimTime,
        initialAnimationRunning,
        initialJoyRide: false,
        initialLanding: false,
    });
    const runtimeFlags = runtimeSessionState.getRuntimeFlags();
    const runtimeLoopState = createRuntimeLoopState({ initialDeltaFrameTime: minuteStepMs });
    const runtimeInteractionState = createRuntimeInteractionState({
        initialMissionStartCalled,
        initialStartLandingFlag,
        initialMouseDown,
        initialMouseDownTimeout,
        initialTimeoutHandleZoom,
        initialLegacyTimeoutHandle,
    });
    bindRuntimeInteractionActivity({
        documentRef,
        markInputActivity: runtimeInteractionState.markInputActivity,
    });

    function getEffectiveOrbitStyle() {
        const selectedStyle = runtimeViewState.getOrbitStyle();
        if (selectedStyle !== "trail") return "classic";
        return runtimeSessionState.getAnimationRunning() ? "trail" : "classic";
    }

    const render = createMissionSceneRender({
        getSceneHandler,
        getAnimationScenes,
        getConfig: () => runtimeViewState.getConfig(),
    });

    function getSceneForConfig(cfg = runtimeViewState.getConfig()) {
        const scene = getAnimationScenes()[cfg];
        return scene?.disposed === true ? undefined : scene;
    }

    return {
        cameraState,
        runtimeViewState,
        runtimeSessionState,
        runtimeFlags,
        runtimeLoopState,
        runtimeInteractionState,
        getEffectiveOrbitStyle,
        getSceneForConfig,
        render,
    };
}
