import { cancelSceneWork } from "./scene-lifecycle.js";
import { detachSceneTextureFields, SCENE_TEXTURE_FIELDS } from "./scene-texture-actions.js";

export function createSceneDisposeActions() {
    function dispose(scene) {
        if (!scene || scene.disposed === true) return;
        console.debug("Disposing AnimationScene with complete WebGL cleanup...");
        // Revoke publication before abort/dispose callbacks can re-enter.
        scene.disposed = true;
        scene.stopCreationFlag = true;
        scene.initialized3D = false;
        scene.state = -1;
        scene.decorationsReady3D = false;
        scene.deferred3DInitRunId = Number.isFinite(scene.deferred3DInitRunId)
            ? scene.deferred3DInitRunId + 1
            : 1;

        scene.textureLoadToken = (Number.isFinite(scene.textureLoadToken) ? scene.textureLoadToken : 0) + 1;
        scene.textureLoadState = "disposed";
        scene.textureLoadPending = false;
        scene.textureLoadPromise = null;
        scene.moonTextureLoadState = "disposed";
        scene.moonTextureLoadPending = false;
        scene.moonTextureLoadPromise = null;
        scene.moonPreviewLoadPromise = null;
        const errors = cancelSceneWork(scene);
        for (const method of [
            "disposeEarthLocations", "disposeBodyHalos", "disposeSurfacePointMarkers",
            "disposeEarth", "disposeSky", "disposeSun", "disposeLunarCraterAnnotations",
            "disposeMoonLocations", "disposeMoon", "disposeSpacecraftModel", "disposeSpacecraftCurve",
            "disposeMoonSOI", "disposeLineOfSight", "disposeAxesHelper", "disposeLight", "disposeCamera",
            "disposeSpacecraft",
        ]) {
            try { scene[method]?.(); } catch (error) { errors.push(error); }
        }
        // Inputs may be accepted before a renderer exists or adopts them. Drain
        // the scene lease even if a body adapter skipped work or threw.
        detachSceneTextureFields(scene, Object.values(SCENE_TEXTURE_FIELDS).flat())();

        if (scene.sceneHelpers) {
            scene.sceneHelpers = null;
        }
        if (errors.length) console.warn("Scene cleanup failed:", ...errors);

        console.debug("AnimationScene disposal completed");
    }

    return { dispose };
}

