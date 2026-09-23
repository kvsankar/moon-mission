import { resolveSecondaryBodyOrbitGravitationalParameter } from "../app/secondary-body-orbit-parameters.js";

// Owns Moon SOI, osculating orbit and locator-halo scene resources.
export function createSceneVisualAidEffects({ SceneHelpers, PC, getRuntimeState, getDocument = () => globalThis.document }) {
    // Existing hotfix gate; disposition remains in the runtime roadmap.
    const CRAFT_LOCATOR_HALOS_ENABLED = false;
    function addMoonSOI(scene) {
        const { globalConfig, moonRadius, viewMoonSOI, viewMoonHillSphere } = getRuntimeState();
        if (!globalConfig || !globalConfig.is_lunar) {
            return;
        }

        if (!scene.sceneHelpers) {
            scene.sceneHelpers = new SceneHelpers(scene.motherContainer);
        }

        scene.sceneHelpers.createMoonSOI(scene.moon, moonRadius, viewMoonSOI);
        scene.moonSOISphere = scene.sceneHelpers.moonSOISphere;
        scene.sceneHelpers.createMoonHillSphere(scene.moon, moonRadius, viewMoonHillSphere);
        scene.moonHillSphere = scene.sceneHelpers.moonHillSphere;
    }

    function addBodyHalos(scene) {
        const runtimeState = getRuntimeState();
        const earthTarget = scene.earthContainer || scene.earth || null;
        const moonTarget = scene.moonContainer || scene.moon || null;
        const craftTarget = CRAFT_LOCATOR_HALOS_ENABLED
            ? (scene.craft || Object.values(scene.craftsById || {})[0] || null)
            : null;
        if (!scene.sceneHelpers) {
            scene.sceneHelpers = new SceneHelpers(scene.motherContainer);
        }
        scene.sceneHelpers.createBodyHalos({
            earthTarget,
            earthRadius: runtimeState.earthRadius,
            moonTarget: runtimeState.globalConfig?.is_lunar ? moonTarget : null,
            moonRadius: runtimeState.moonRadius,
            craftTarget,
            craftRadius: 0,
            visible: runtimeState.viewBodyHalos,
        });
    }

    function addMoonOsculatingOrbit(scene) {
        const { globalConfig, viewMoonOsculatingOrbit, frameMode } = getRuntimeState();
        if (!globalConfig || !globalConfig.is_lunar || scene.name === "relative") {
            return;
        }

        if (!scene.sceneHelpers) {
            scene.sceneHelpers = new SceneHelpers(scene.motherContainer);
        }

        scene.sceneHelpers.createMoonOsculatingOrbit(viewMoonOsculatingOrbit && frameMode !== "relative");
        scene.moonOsculatingOrbitLine = scene.sceneHelpers.moonOsculatingOrbitLine;
    }

    function disposeMoonSOI(scene) {
        const { globalConfig } = getRuntimeState();
        if (!globalConfig || !globalConfig.is_lunar) {
            return;
        }
        if (scene.sceneHelpers) {
            scene.sceneHelpers.disposeMoonSOI();
            scene.sceneHelpers.disposeMoonHillSphere();
        }
        scene.moonSOISphere = null;
        scene.moonHillSphere = null;
    }

    function disposeBodyHalos(scene) {
        if (scene.sceneHelpers) {
            scene.sceneHelpers.disposeBodyHalos();
        }
    }

    function disposeMoonOsculatingOrbit(scene) {
        const { globalConfig } = getRuntimeState();
        if (!globalConfig || !globalConfig.is_lunar) {
            return;
        }
        if (scene.sceneHelpers) {
            scene.sceneHelpers.disposeMoonOsculatingOrbit();
        }
        scene.moonOsculatingOrbitLine = null;
    }

    function updateSecondaryBodyVisualAids(scene, bodyId, bodyState, pixelsPerAU, timeMs) {
        const runtimeState = getRuntimeState();
        if (
            !runtimeState.globalConfig?.is_lunar ||
            !bodyState?.available ||
            !scene.sceneHelpers
        ) {
            return;
        }

            const moonOrbitToggle = getDocument()?.getElementById?.("view-moon-osculating-orbit");
            const relativeOriginToggle = getDocument()?.getElementById?.("origin-relative");
        const secondaryBodyId = scene.name === "lunar" ? "EARTH" : "MOON";
        const gravitationalParameter = resolveSecondaryBodyOrbitGravitationalParameter(
            PC,
            scene.name,
        );
        const showMoonOrbit =
            bodyId === secondaryBodyId &&
            (moonOrbitToggle?.checked ?? runtimeState.viewMoonOsculatingOrbit) &&
            !(relativeOriginToggle?.checked ?? (runtimeState.frameMode === "relative"));
        if (bodyId === secondaryBodyId && scene.moonOsculatingOrbitLine) {
            scene.sceneHelpers.updateMoonOsculatingOrbit({
                position: bodyState.position,
                velocity: bodyState.velocity,
                pixelsPerAU,
                timeMs,
                gravitationalParameter,
                visible: showMoonOrbit,
            });
        }
    }

    function refreshBodyHalos(scene, { suppress = false } = {}) {
        const runtimeState = getRuntimeState();
        if (
            !scene.sceneHelpers ||
            !scene.camera
        ) {
            return;
        }
        const earthTarget = scene.earthContainer || scene.earth || null;
        const moonTarget = scene.moonContainer || scene.moon || null;
        const craftTarget = CRAFT_LOCATOR_HALOS_ENABLED
            ? (scene.craft || Object.values(scene.craftsById || {})[0] || null)
            : null;
        scene.sceneHelpers.updateBodyHalos({
            camera: scene.camera,
            rendererDomElement: scene.cameraController?._rendererDomElement || scene.renderer?.domElement || null,
            earthTarget,
            earthRadius: runtimeState.earthRadius,
            moonTarget: runtimeState.globalConfig?.is_lunar ? moonTarget : null,
            moonRadius: runtimeState.moonRadius,
            craftTarget,
            craftRadius: 0,
            visible: runtimeState.viewBodyHalos && !suppress,
        });
    }

    return { addMoonSOI, addBodyHalos, addMoonOsculatingOrbit, disposeMoonSOI, disposeBodyHalos, disposeMoonOsculatingOrbit, updateSecondaryBodyVisualAids, refreshBodyHalos };
}
