export function createMissionViewIdentityController({
    documentRef,
    CustomEventClass,
    runtimeViewState,
    cameraState,
    sceneViewStateActions,
    readPlaneSelection,
    readDimensionSelection,
    readViewSettings,
    applyViewSettings,
    getSetView,
    getRuntimeWireup,
}) {
    function dispatchViewSettingsAppliedForIdentity() {
        documentRef.dispatchEvent(
            new CustomEventClass("moon-mission:view-identity-settings-applied", {
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
        const setView = getSetView();
        if (typeof setView === "function") {
            setView({
                detail: {
                    reason: "view-identity-change",
                },
            });
            // Origin/dimension readiness replays retained main-camera intent. An
            // already-applied revision is idempotent, including nested view sync.
            getRuntimeWireup()?.runtimeBootstrapActions?.changeCameraFromTo(undefined, {
                projectControls: false,
                syncViewIdentity: false,
            });
            return true;
        }
        return false;
    }

    return { syncRuntimeViewIdentityFromControls, applyViewForCurrentIdentity };
}
