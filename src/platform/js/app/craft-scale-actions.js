import { shouldShowSceneCraft } from "./scene-craft-helpers.js";
import { requestSceneOrbitOverlapRefinement } from "./orbit-overlap-manager.js";

export function createCraftScaleActions({
    THREE,
    animationScenes,
    getConfig,
    getJoyRideFlag,
    getLandingFlag,
    getDefaultCameraDistance,
    getAnimTime,
    isLocationAvaialable,
    getViewportWidth,
    getGlobalConfig,
    getOrbitStyle,
}) {
    function readViewportWidth() {
        if (typeof getViewportWidth === "function") {
            const width = Number(getViewportWidth());
            if (Number.isFinite(width) && width > 0) return width;
        }
        if (typeof window !== "undefined" && Number.isFinite(window.innerWidth)) {
            return window.innerWidth;
        }
        return Number.POSITIVE_INFINITY;
    }

    function updateCraftScale() {
        const config = getConfig();
        const scene = animationScenes[config];
        if (!scene || !scene.initialized3D) return;

        const activeCamera = getLandingFlag() && !getJoyRideFlag()
            ? scene.droneCamera
            : scene.camera;
        if (typeof activeCamera?.getWorldPosition !== "function") return;

        const cameraLocation = new THREE.Vector3();
        activeCamera.getWorldPosition(cameraLocation);

        const craftEntries = Object.entries(scene.craftsById || {});
        if (craftEntries.length === 0 && scene.craft) {
            craftEntries.push([scene.primaryCraftId || "SC", scene.craft]);
        }

        const primaryCraftId = scene.primaryCraftId || "SC";
        const fov = activeCamera?.fov ?? scene?.camera?.fov;
        const isMobileViewport = readViewportWidth() <= 600;

        for (const [craftId, craftObject] of craftEntries) {
            if (!craftObject) continue;

            const craftLocation = new THREE.Vector3();
            craftObject.getWorldPosition(craftLocation);

            const distance = cameraLocation.distanceTo(craftLocation);
            let scale = distance / getDefaultCameraDistance();
            if (Number.isFinite(fov) && fov > 0) {
                scale = scale * (fov / 50);
            }
            if (getLandingFlag()) scale = scale * 5;
            if (isMobileViewport) scale = scale * 0.5;

            craftObject.scale.set(scale, scale, scale);

            const droneObject = scene.dronesById?.[craftId] || (craftId === primaryCraftId ? scene.drone : null);
            if (droneObject) {
                droneObject.scale.set(scale, scale, scale);
            }

            if (isLocationAvaialable(craftId, getAnimTime())) {
                const hideForMountedCamera = craftId === primaryCraftId && scene.hideCraftForMountedCamera;
                const allowedByView = shouldShowSceneCraft({
                    scene,
                    globalConfig: getGlobalConfig?.(),
                    bodyId: craftId,
                });
                craftObject.visible = scene.craftVisible && !hideForMountedCamera && allowedByView;
                if (droneObject) {
                    droneObject.visible = false;
                }
            } else {
                craftObject.visible = false;
                if (droneObject) {
                    droneObject.visible = false;
                }
            }
        }
    }

    function cameraControlsCallback() {
        const config = getConfig();
        const scene = animationScenes[config];
        if (!scene || !scene.craft || !scene.initialized3D) return;
        updateCraftScale();
        scene.updateOrbitMilestoneLabels?.();
        requestSceneOrbitOverlapRefinement({
            scene,
            dimension: "3D",
            orbitStyle: getOrbitStyle?.() || "trail",
            viewportWidth: typeof window !== "undefined" ? window.innerWidth : undefined,
            viewportHeight: typeof window !== "undefined" ? window.innerHeight : undefined,
        });
    }

    return { updateCraftScale, cameraControlsCallback };
}
