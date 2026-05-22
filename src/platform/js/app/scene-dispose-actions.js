export function createSceneDisposeActions() {
    function dispose(scene) {
        console.debug("Disposing AnimationScene with complete WebGL cleanup...");
        scene.decorationsReady3D = false;
        scene.deferred3DInitRunId = Number.isFinite(scene.deferred3DInitRunId)
            ? scene.deferred3DInitRunId + 1
            : 1;

        scene.disposeEarthLocations();
        scene.disposeBodyHalos?.();
        scene.disposeSurfacePointMarkers?.();
        scene.disposeEarth();
        scene.disposeSky();
        scene.disposeSun();
        scene.disposeLunarCraterAnnotations?.();
        scene.disposeMoonLocations();
        scene.disposeMoon();
        scene.disposeSpacecraftModel();
        scene.disposeOrbitMilestones3D?.();
        scene.disposeSpacecraftCurve();
        scene.disposeMoonSOI();
        scene.disposeLineOfSight();
        scene.disposeAxesHelper();
        scene.disposeLight();
        scene.disposeCamera();
        scene.disposeSpacecraft();

        if (scene.sceneHelpers) {
            scene.sceneHelpers = null;
        }

        console.debug("AnimationScene disposal completed");
    }

    return { dispose };
}

