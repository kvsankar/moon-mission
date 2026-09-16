export function createSceneInitActions({ THREE, render, wait20, clearEventInfo }) {
    function shouldContinueDeferredSceneDecoration(scene, runId) {
        return !!scene &&
            scene.disposed !== true &&
            scene.stopCreationFlag !== true &&
            scene.initialized3D === true &&
            scene.deferred3DInitRunId === runId &&
            !!scene.scene &&
            !!scene.motherContainer;
    }

    async function runDeferredSceneDecorations(scene, runId) {
        const deferredSteps = [
            () => scene.addBodyHalos(),
            () => scene.addAxesHelper(),
            () => scene.addSurfacePointMarkers(),
            () => scene.addEarthLocations(),
            () => scene.addMoonLocations(),
            () => scene.addLunarCraterAnnotations(),
            () => scene.addLineOfSight(),
        ];

        for (const step of deferredSteps) {
            await wait20();
            if (!shouldContinueDeferredSceneDecoration(scene, runId)) {
                return;
            }
            step();
            if (!shouldContinueDeferredSceneDecoration(scene, runId)) return;
            render();
        }

        if (!shouldContinueDeferredSceneDecoration(scene, runId)) {
            return;
        }

        scene.decorationsReady3D = true;
        clearEventInfo();
    }

    function init3dRest(scene) {
        if (scene.disposed === true) return;
        const runId = Number.isFinite(scene.deferred3DInitRunId)
            ? scene.deferred3DInitRunId + 1
            : 1;
        scene.deferred3DInitRunId = runId;
        scene.decorationsReady3D = false;
        scene.scene = new THREE.Scene();
        scene.motherContainer = new THREE.Group();

        const isCurrent = () => scene.disposed !== true && scene.stopCreationFlag !== true &&
            scene.deferred3DInitRunId === runId;
        for (const method of ["computeDimensions", "addLight", "addSky", "addSun", "addMoon", "addEarth",
            "setPrimaryAndSecondaryBodies", "addSpacecraft", "addCamera"]) {
            if (!isCurrent()) return;
            scene[method]();
            if (!isCurrent()) return;
            render();
        }

        if (!isCurrent()) return;
        scene.initialized3D = true;
        render();

        if (!isCurrent()) return;
        scene.addSpacecraftCurve();
        if (!isCurrent()) return;
        render();

        if (isCurrent()) void runDeferredSceneDecorations(scene, runId);
    }

    return { init3dRest };
}

