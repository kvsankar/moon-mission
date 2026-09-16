import { LIGHT_SETTINGS as LT } from "../core/constants.js";
import { holdTextures, replaceTextureOwner, retainTextureOwner } from "../rendering/texture-ownership.js";

export const SCENE_TEXTURE_FIELDS = Object.freeze({
    earth: ["earthTexture", "earthPhotoTexture", "earthSpecularTexture", "earthNightTexture"],
    moon: ["moonMap", "moonDisplacementMap"],
    sky: ["skyTexture", "skyConstellationTexture"],
});
const allTextureFields = Object.values(SCENE_TEXTURE_FIELDS).flat();
const sceneTextures = scene => allTextureFields.map(key => scene[key]);

export function detachSceneTextureFields(scene, fields) {
    retainTextureOwner(scene, sceneTextures(scene));
    const release = holdTextures(fields.map(key => scene[key]));
    for (const key of fields) scene[key] = null;
    replaceTextureOwner(scene, sceneTextures(scene));
    return release;
}

const moonNormalRefreshGeneration = new WeakMap();

function hasTextureKey(textures, key) {
    return Object.prototype.hasOwnProperty.call(textures, key);
}

export function applySceneTextures(scene, textures) {
    if (hasTextureKey(textures, "earthTexture")) {
        scene.earthTexture = textures.earthTexture;
    }
    if (hasTextureKey(textures, "earthPhotoTexture") || hasTextureKey(textures, "earthTexture")) {
        scene.earthPhotoTexture = textures.earthPhotoTexture || textures.earthTexture || null;
    }
    if (hasTextureKey(textures, "earthSpecularTexture")) {
        scene.earthSpecularTexture = textures.earthSpecularTexture;
    }
    if (hasTextureKey(textures, "earthNightTexture")) {
        scene.earthNightTexture = textures.earthNightTexture;
    }
    if (hasTextureKey(textures, "moonMap")) {
        scene.moonMap = textures.moonMap;
    }
    if (hasTextureKey(textures, "moonDisplacementMap")) {
        scene.moonDisplacementMap = textures.moonDisplacementMap;
    }
    if (hasTextureKey(textures, "moonRenderProfile")) {
        scene.moonRenderProfile = textures.moonRenderProfile || scene.moonRenderProfile || "fast";
    }
    if (hasTextureKey(textures, "moonRenderSettings")) {
        scene.moonRenderSettings = textures.moonRenderSettings || scene.moonRenderSettings || null;
    }
    if (hasTextureKey(textures, "skyTexture") || hasTextureKey(textures, "skyMilkyWayTexture")) {
        scene.skyTexture = textures.skyTexture || textures.skyMilkyWayTexture || scene.skyTexture;
    }
    if (hasTextureKey(textures, "skyConstellationTexture")) {
        scene.skyConstellationTexture = textures.skyConstellationTexture;
    }
}

function syncLunarMoonFillLights(scene) {
    const bodyAmbientLight = scene?.lightManager?.bodyAmbientLight || null;
    if (bodyAmbientLight) {
        bodyAmbientLight.intensity = Number.isFinite(LT.AMBIENT_INTENSITY)
            ? LT.AMBIENT_INTENSITY
            : 0;
    }
    if (scene?.lightFill) {
        if (!Number.isFinite(scene.lightFill.intensity) || scene.lightFill.intensity <= 0) {
            scene.lightFill.intensity = Number.isFinite(LT.EARTHSHINE_INTENSITY) ? LT.EARTHSHINE_INTENSITY : 0.02;
        }
    }
    if (scene?.lightMoonshine) {
        if (!Number.isFinite(scene.lightMoonshine.intensity) || scene.lightMoonshine.intensity <= 0) {
            scene.lightMoonshine.intensity = Number.isFinite(LT.MOONSHINE_INTENSITY) ? LT.MOONSHINE_INTENSITY : 0.0004;
        }
    }
}

function syncMoonShadowTuning(scene) {
    const primaryLight = scene?.lightManager?.primaryLight || null;
    const renderSettings = scene?.moonRenderSettings || null;
    if (!primaryLight?.shadow || !renderSettings) {
        return;
    }

    const shadowNormalBias = Number(renderSettings.shadowNormalBias);
    if (Number.isFinite(shadowNormalBias)) {
        primaryLight.shadow.normalBias = shadowNormalBias;
    }

    const shadowBias = Number(renderSettings.shadowBias);
    if (Number.isFinite(shadowBias)) {
        primaryLight.shadow.bias = shadowBias;
    }
}


function scheduleGeneratedMoonNormalMapRefresh(callback, {
    shouldDefer = null,
    maxDeferrals = 40,
    retryDelayMs = 250,
    minIdleTimeMs = 8,
} = {}) {
    if (typeof callback !== "function") {
        return;
    }

    let deferrals = 0;
    const shouldWaitLonger = (deadline) => {
        if (typeof shouldDefer === "function" && shouldDefer(deadline)) {
            return true;
        }
        if (
            deadline &&
            deadline.didTimeout !== true &&
            typeof deadline.timeRemaining === "function" &&
            deadline.timeRemaining() < minIdleTimeMs
        ) {
            return true;
        }
        return false;
    };
    const scheduleRetry = () => {
        globalThis?.setTimeout?.(schedule, retryDelayMs);
    };
    const run = (deadline) => {
        if (deferrals < maxDeferrals && shouldWaitLonger(deadline)) {
            deferrals += 1;
            scheduleRetry();
            return;
        }
        callback(deadline);
    };
    const schedule = () => {
        if (typeof globalThis?.requestIdleCallback === "function") {
            globalThis.requestIdleCallback(run, { timeout: 1500 });
            return;
        }
        globalThis?.setTimeout?.(() => run({
            didTimeout: true,
            timeRemaining: () => 0,
        }), retryDelayMs);
    };

    if (typeof globalThis?.setTimeout !== "function") {
        callback({
            didTimeout: true,
            timeRemaining: () => minIdleTimeMs,
        });
        return;
    }

    schedule();
}

export function applyAndRefreshSceneTextures(scene, textures, {
    disposePrevious = false,
    requestRender = null,
    shouldDeferGeneratedNormalMap = null,
    onAccepted = null,
} = {}) {
    retainTextureOwner(scene, sceneTextures(scene));
    applySceneTextures(scene, textures);
    replaceTextureOwner(scene, sceneTextures(scene), { disposePrevious });
    // State now owns the input textures, even if a later renderer effect fails.
    onAccepted?.();
    syncLunarMoonFillLights(scene);
    syncMoonShadowTuning(scene);
    const hasEarthTextureUpdate =
        hasTextureKey(textures, "earthTexture") ||
        hasTextureKey(textures, "earthSpecularTexture") ||
        hasTextureKey(textures, "earthNightTexture");
    const hasMoonTextureUpdate =
        hasTextureKey(textures, "moonMap") ||
        hasTextureKey(textures, "moonDisplacementMap") ||
        hasTextureKey(textures, "moonRenderSettings");
    const hasSkyTextureUpdate =
        hasTextureKey(textures, "skyTexture") ||
        hasTextureKey(textures, "skyMilkyWayTexture") ||
        hasTextureKey(textures, "skyConstellationTexture");
    const normalRefreshGeneration = hasMoonTextureUpdate
        ? (moonNormalRefreshGeneration.get(scene) || 0) + 1
        : null;
    if (normalRefreshGeneration != null) {
        moonNormalRefreshGeneration.set(scene, normalRefreshGeneration);
    }

    if (hasEarthTextureUpdate && scene.earthRenderer?.updateTextures) {
        scene.earthRenderer.updateTextures(
            scene.earthTexture,
            scene.earthSpecularTexture,
            scene.earthNightTexture,
            { disposePrevious },
        );
    }

    if (hasMoonTextureUpdate && scene.moonRenderer?.updateTextures) {
        scene.moonRenderer.updateTextures(
            scene.moonMap,
            scene.moonDisplacementMap,
            null,
            {
                disposePrevious,
                renderSettings: scene.moonRenderSettings,
                deferGeneratedNormalMap: disposePrevious === true && !!scene.moonDisplacementMap && !scene.moonDisplacementMap.userData?.physicalNormalTexture,
            },
        );
        if (
            disposePrevious === true &&
            !scene.moonDisplacementMap?.userData?.physicalNormalTexture &&
            Number(scene.moonDisplacementMap?.image?.width) > 1 &&
            Number(scene.moonDisplacementMap?.image?.height) > 1 &&
            scene.moonRenderer?.refreshGeneratedNormalMap
        ) {
            // Capture the renderer instance at scheduling time. A subsequent
            // scene/profile change before the idle fires can replace
            // scene.moonRenderer; without this guard the callback would
            // refresh the wrong (or null) renderer.
            const capturedMoonRenderer = scene.moonRenderer;
            scheduleGeneratedMoonNormalMapRefresh(() => {
                if (
                    scene.moonRenderer !== capturedMoonRenderer ||
                    moonNormalRefreshGeneration.get(scene) !== normalRefreshGeneration
                ) {
                    return;
                }
                capturedMoonRenderer.refreshGeneratedNormalMap({ disposePrevious: true });
                // The render loop is on-demand: switching profiles loads new
                // textures + rebuilds the normal map, but unless we
                // explicitly request a render here the scene won't redraw
                // until the next user interaction wakes the loop. Without
                // this, switching Standard <-> Detailed appeared to hang
                // until the user moved the cursor or clicked.
                if (typeof requestRender === "function") {
                    requestRender();
                }
            }, {
                shouldDefer: shouldDeferGeneratedNormalMap,
            });
        }
    }

    if (hasSkyTextureUpdate && scene.skyRenderer?.updateTextures) {
        scene.skyRenderer.updateTextures(
            scene.skyTexture,
            scene.skyConstellationTexture,
            { disposePrevious },
        );
    }

}
