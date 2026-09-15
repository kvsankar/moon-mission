import {
    isStartupViewSceneReady,
    planStartupViewReapply,
    resolveStartupAnimationMode,
} from "./startup-animation-plan.js";
import {
    failMissionLoadingOverlay,
    hideMissionLoadingOverlay,
    setMissionLoadingOverlayBlocking,
    setMissionLoadingMessage,
    showMissionLoadingOverlay,
} from "../ui/mission-loading-overlay.js";

function createInitOrchestrationActions(deps) {
    const {
        initConfig,
        init,
        getConfig,
        isOrbitDataProcessed,
        missionStart,
        missionSetTime,
        setRealtimeSpeed,
        playAnimation,
        setAnimTime,
        setLocation,
        setDimension,
        getSetView,
        getChangeCameraFromTo,
        updateCraftScale,
        d3,
        d3SelectAll,
        render,
        requestAnimationFrame,
        animateLoop,
        getStartTime,
        getLatestEndTime,
        animationScenes,
        scheduleTimeout = setTimeout,
        markInputActivity = () => {},
        resolveStartupAnimationMode: resolveStartupAnimationModeImpl = resolveStartupAnimationMode,
        planStartupViewReapply: planStartupViewReapplyImpl = planStartupViewReapply,
        isStartupViewSceneReady: isStartupViewSceneReadyImpl = isStartupViewSceneReady,
    } = deps;
    let animationLoopStarted = false;
    let latestInitRunId = 0;

    function clampTimeToMissionSpan(timeMs) {
        const numericTimeMs = Number(timeMs);
        if (!Number.isFinite(numericTimeMs)) {
            return numericTimeMs;
        }

        const startTime = Number(getStartTime?.());
        const latestEndTime = Number(getLatestEndTime?.());
        if (!Number.isFinite(startTime) || !Number.isFinite(latestEndTime)) {
            return numericTimeMs;
        }
        if (numericTimeMs < startTime) {
            return startTime;
        }
        if (numericTimeMs > latestEndTime) {
            return latestEndTime;
        }
        return numericTimeMs;
    }

    function shouldWaitFor3DSceneReady() {
        if (typeof document === "undefined") return false;
        return !!document.getElementById("dimension-3D")?.checked;
    }

    function isSceneOrbitRenderable(scene) {
        if (!scene) return false;
        const addCurveDoneState = scene?.constructor?.SCENE_STATE_ADD_CURVE_DONE;
        if (Number.isFinite(addCurveDoneState) && scene.state === addCurveDoneState) {
            return true;
        }
        const bodyMap = scene.orbitLinesByBodyId || {};
        return Object.values(bodyMap).some((lines) => Array.isArray(lines) && lines.length > 0);
    }

    function reapplyStartupViewWhenReady(runId, maxAttempts = 40, pollIntervalMs = 50) {
        const setView = getSetView();
        const cfg = getConfig();
        const scene = animationScenes?.[cfg];
        const reapplyPlan = planStartupViewReapplyImpl({
            runId,
            latestRunId: latestInitRunId,
            hasSetView: typeof setView === "function",
            sceneReady: isStartupViewSceneReadyImpl({
                needs3DReady: shouldWaitFor3DSceneReady(),
                scene,
                isSceneOrbitRenderable,
            }),
            attemptsRemaining: maxAttempts,
        });

        if (reapplyPlan.type === "skip") {
            return;
        }

        if (reapplyPlan.type === "apply") {
            setView();
            return;
        }

        scheduleTimeout(() => {
            reapplyStartupViewWhenReady(runId, maxAttempts - 1, pollIntervalMs);
        }, pollIntervalMs);
    }

    function isStartupCoreInteractive() {
        const cfg = getConfig();
        const scene = animationScenes?.[cfg];
        if (!scene) return false;
        if (scene.cameraControlsEnabled === false) return false;
        return isStartupViewSceneReadyImpl({
            needs3DReady: shouldWaitFor3DSceneReady(),
            scene,
            isSceneOrbitRenderable,
        });
    }

    function hideLoadingOverlayAfterResponsiveFrames({
        requiredStableFrames = 3,
        maxFrameGapMs = 140,
        maxWaitMs = 5000,
    } = {}) {
        if (typeof requestAnimationFrame !== "function") {
            scheduleTimeout(() => hideMissionLoadingOverlay(), 0);
            return;
        }
        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            hideMissionLoadingOverlay();
        };
        scheduleTimeout(finish, maxWaitMs);
        let stableFrames = 0;
        let previousFrameMs = 0;
        let startMs = 0;
        const step = (frameMs) => {
            if (done) return;
            if (!Number.isFinite(startMs) || startMs <= 0) {
                startMs = frameMs;
            }
            if (Number.isFinite(previousFrameMs) && previousFrameMs > 0) {
                const deltaMs = frameMs - previousFrameMs;
                stableFrames = deltaMs <= maxFrameGapMs ? stableFrames + 1 : 0;
            }
            previousFrameMs = frameMs;
            if (stableFrames >= requiredStableFrames || frameMs - startMs >= maxWaitMs) {
                finish();
                return;
            }
            requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }

    function beginDeferredTextureLoad(scene) {
        if (scene?.textureLoadState !== "deferred" || typeof scene.beginTextureLoad !== "function") {
            return false;
        }
        scene.beginTextureLoad();
        return true;
    }

    function startTextureLoadAfterCoreReady(scene, runId) {
        // Texture networking must not be postponed indefinitely by pointer input.
        // The first Moon preview is already loading; heavy installs yield in the
        // texture application layer instead of starving network requests here.
        scheduleTimeout(() => {
            if (!scene || runId !== latestInitRunId) return;
            beginDeferredTextureLoad(scene);
        }, 0);
    }

    function settleLoadingOverlayWhenInteractive(runId, maxAttempts = 120, pollIntervalMs = 50) {
        if (typeof document === "undefined") {
            return;
        }
        if (runId !== latestInitRunId) {
            return;
        }
        const scene = animationScenes?.[getConfig()];
        if (isStartupCoreInteractive() || maxAttempts <= 0) {
            setMissionLoadingOverlayBlocking(false);
            if (scene?.textureLoadState === "deferred") {
                startTextureLoadAfterCoreReady(scene, runId);
            }
            setMissionLoadingMessage("Finalizing controls...");
            hideLoadingOverlayAfterResponsiveFrames();
            return;
        }
        setMissionLoadingMessage("Finalizing controls...");
        scheduleTimeout(() => {
            settleLoadingOverlayWhenInteractive(runId, maxAttempts - 1, pollIntervalMs);
        }, pollIntervalMs);
    }

    function releaseStartupButtonDisable() {
        if (typeof document === "undefined") {
            d3SelectAll("button").attr("disabled", null);
            return;
        }
        const slowerButton = document.getElementById("slower");
        const fasterButton = document.getElementById("faster");
        const slowerWasDisabled = slowerButton?.getAttribute("aria-disabled") === "true";
        const fasterWasDisabled = fasterButton?.getAttribute("aria-disabled") === "true";
        d3SelectAll("button").attr("disabled", null);
        if (slowerButton) {
            slowerButton.disabled = slowerWasDisabled;
            slowerButton.setAttribute("aria-disabled", slowerWasDisabled ? "true" : "false");
        }
        if (fasterButton) {
            fasterButton.disabled = fasterWasDisabled;
            fasterButton.setAttribute("aria-disabled", fasterWasDisabled ? "true" : "false");
        }
    }

    /**
     * @param {{ onReady?: Function, pollIntervalMs?: number, runId?: number }} [options]
     */
    async function waitUntilOrbitDataProcessed({
        onReady,
        pollIntervalMs = 50,
        runId = 0,
    } = {}) {
        if (runId !== latestInitRunId) {
            return;
        }
        const cfg = getConfig();
        if (!isOrbitDataProcessed(cfg)) {
            scheduleTimeout(() => {
                waitUntilOrbitDataProcessed({
                    onReady,
                    pollIntervalMs,
                    runId,
                });
            }, pollIntervalMs);
            return;
        }

        if (runId === latestInitRunId && typeof onReady === "function") {
            onReady();
        }
    }

    async function initAnimation(flags) {
        const runId = ++latestInitRunId;
        markInputActivity();
        showMissionLoadingOverlay("Loading mission data...");
        const applyTimeSetOrLocationRefresh = (timeMs) => {
            const clampedTimeMs = clampTimeToMissionSpan(timeMs);
            setAnimTime?.(clampedTimeMs);
            if (typeof missionSetTime === "function") {
                missionSetTime();
            } else {
                setLocation();
            }
        };
        const applyStartupAnimationMode = (startupAction) => {
            switch (startupAction.type) {
            case "start-now":
                applyTimeSetOrLocationRefresh(startupAction.animTime);
                if (startupAction.shouldSetRealtimeSpeed && typeof setRealtimeSpeed === "function") {
                    setRealtimeSpeed();
                }
                if (startupAction.shouldPlayAnimation && typeof playAnimation === "function") {
                    playAnimation();
                }
                return;
            case "set-time":
                applyTimeSetOrLocationRefresh(startupAction.animTime);
                return;
            case "mission-start":
                missionStart();
                return;
            default:
                setLocation();
            }
        };
        try {
            setMissionLoadingMessage("Loading mission configuration...");
            await initConfig();
            if (runId !== latestInitRunId) return;
            setMissionLoadingMessage("Preparing orbit data...");
            await init(() => {}, { isCurrent: () => runId === latestInitRunId });
            if (runId !== latestInitRunId) return;

            await waitUntilOrbitDataProcessed({
                runId,
                onReady: () => {
                    if (runId !== latestInitRunId) {
                        return;
                    }
                    const startupAction = resolveStartupAnimationModeImpl({
                        flags,
                        nowTimeMs: Date.now(),
                        startTime: Number(getStartTime?.()),
                        latestEndTime: Number(getLatestEndTime?.()),
                    });

                    applyStartupAnimationMode(startupAction);

                    setDimension(true);

                    const setView = getSetView();
                    if (typeof setView === "function") {
                        setView();
                    }
                    // Dimension switch can finalize asynchronously (3D init), so apply
                    // startup view settings again once the scene is actually ready.
                    reapplyStartupViewWhenReady(runId);

                    // Also resets camera parameters in manual/manual mode for consistent startup.
                    const changeCameraFromTo = getChangeCameraFromTo();
                    if (typeof changeCameraFromTo === "function") {
                        changeCameraFromTo();
                    }

                    updateCraftScale();

                    // Re-run the frame once startup view/camera state has settled.
                    setLocation();

                    // Some startup paths (for example missions that begin in 3D and
                    // don't re-enter the orbit-processing unlock path) can leave
                    // controls disabled. Always release the startup blanket-disable.
                    releaseStartupButtonDisable();
                    settleLoadingOverlayWhenInteractive(runId);
                },
            });
        } catch (error) {
            if (runId !== latestInitRunId) return;
            d3.select("#eventinfo").text("Failed to load the animation. Please restart the browser and try again.");
            failMissionLoadingOverlay("Mission failed to load. Please refresh and try again.");
            console.error("Error: exception in initAnimation(): " + error);
            d3SelectAll("button").attr("disabled", true);
            return;
        }

        if (runId !== latestInitRunId) return;
        render();
        if (!animationLoopStarted) {
            requestAnimationFrame(animateLoop);
            animationLoopStarted = true;
        }
    }

    return {
        initAnimation,
    };
}

export { createInitOrchestrationActions };
