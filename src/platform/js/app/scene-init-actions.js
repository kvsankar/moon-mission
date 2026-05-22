export function createSceneInitActions({ THREE, render, wait20, clearEventInfo }) {
    function shouldContinueDeferredSceneDecoration(scene, runId) {
        return !!scene &&
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
            render();
        }

        if (!shouldContinueDeferredSceneDecoration(scene, runId)) {
            return;
        }

        scene.decorationsReady3D = true;
        clearEventInfo();
    }

    function init3dRest(scene) {
        const runId = Number.isFinite(scene.deferred3DInitRunId)
            ? scene.deferred3DInitRunId + 1
            : 1;
        scene.deferred3DInitRunId = runId;
        scene.decorationsReady3D = false;
        scene.scene = new THREE.Scene();
        scene.motherContainer = new THREE.Group();

        scene.computeDimensions();
        render();
        wait20().then();

        scene.addLight();
        render();
        wait20().then();

        scene.addSky();
        render();
        wait20().then();

        scene.addSun();
        render();
        wait20().then();

        scene.addMoon();
        render();
        wait20().then();

        scene.addEarth();
        render();
        wait20().then();

        scene.setPrimaryAndSecondaryBodies();
        render();
        wait20().then();

        scene.addSpacecraft();
        render();
        wait20().then();

        scene.addCamera();
        render();
        wait20().then();

        scene.initialized3D = true;
        render();

        scene.addSpacecraftCurve();
        render();
        wait20().then();

        scene.addOrbitMilestones3D?.();
        render();
        wait20().then();

        void runDeferredSceneDecorations(scene, runId);
    }

    return { init3dRest };
}

