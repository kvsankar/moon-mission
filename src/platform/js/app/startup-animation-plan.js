function isCurrentTimeWithinMissionSpan({
    nowTimeMs,
    startTime,
    latestEndTime,
}) {
    return Number.isFinite(nowTimeMs) &&
        Number.isFinite(startTime) &&
        Number.isFinite(latestEndTime) &&
        nowTimeMs >= startTime &&
        nowTimeMs <= latestEndTime;
}

function resolveStartupAnimationMode({
    flags,
    nowTimeMs,
    startTime,
    latestEndTime,
}) {
    const startupAnimTimeOverride = Number(flags?.startupAnimTimeOverride);
    const hasStartupAnimTimeOverride = Number.isFinite(startupAnimTimeOverride);
    const isCurrentTimeInMissionSpan = isCurrentTimeWithinMissionSpan({
        nowTimeMs,
        startTime,
        latestEndTime,
    });
    const shouldStartAtNow = !!flags?.reset && isCurrentTimeInMissionSpan;
    const shouldForceMissionStart = !!flags?.reset &&
        Number.isFinite(nowTimeMs) &&
        Number.isFinite(startTime) &&
        Number.isFinite(latestEndTime) &&
        !hasStartupAnimTimeOverride &&
        !isCurrentTimeInMissionSpan;

    if (shouldStartAtNow) {
        return {
            type: "start-now",
            animTime: nowTimeMs,
            shouldSetRealtimeSpeed: true,
            shouldPlayAnimation: true,
        };
    }

    if (shouldForceMissionStart) {
        return {
            type: "mission-start",
        };
    }

    if (hasStartupAnimTimeOverride) {
        return {
            type: "set-time",
            animTime: startupAnimTimeOverride,
        };
    }

    if (flags?.reset) {
        return {
            type: "mission-start",
        };
    }

    return {
        type: "refresh-location",
    };
}

function isStartupViewSceneReady({
    needs3DReady,
    scene,
    isSceneOrbitRenderable,
}) {
    return scene?.disposed !== true && (!needs3DReady || (
        !!scene?.initialized3D &&
        isSceneOrbitRenderable(scene)
    ));
}

function planStartupViewReapply({
    runId,
    latestRunId,
    hasSetView,
    sceneReady,
    attemptsRemaining,
}) {
    if (runId !== latestRunId || !hasSetView) {
        return {
            type: "skip",
        };
    }

    if (sceneReady || attemptsRemaining <= 0) {
        return {
            type: "apply",
        };
    }

    return {
        type: "retry",
    };
}

export {
    isCurrentTimeWithinMissionSpan,
    isStartupViewSceneReady,
    planStartupViewReapply,
    resolveStartupAnimationMode,
};
