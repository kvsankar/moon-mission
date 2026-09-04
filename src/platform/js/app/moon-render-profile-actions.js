import {
    MOON_RENDER_ASSET_PATHS_STORAGE_KEY,
    MOON_RENDER_ASSET_PROFILE_STORAGE_KEY,
    resolveMoonRenderAssetProfile,
} from "./moon-render-asset-profiles.js";

function normalizeProfile(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "quality" || normalized === "low") {
        return normalized;
    }
    return "fast";
}

function safeGetStorage(globalObject) {
    try {
        return globalObject?.localStorage || null;
    } catch {
        return null;
    }
}

function disposeLoadedMoonTextures(textures) {
    const uniqueTextures = new Set([
        textures?.moonMap,
        textures?.moonDisplacementMap,
    ]);
    uniqueTextures.delete(null);
    uniqueTextures.delete(undefined);
    uniqueTextures.forEach((texture) => texture?.dispose?.());
}

function persistActiveProfile(globalObject, profile) {
    const normalized = normalizeProfile(profile);
    globalObject.MOON_RENDER_ASSET_PROFILE = normalized;
    const storage = safeGetStorage(globalObject);
    storage?.setItem?.(MOON_RENDER_ASSET_PROFILE_STORAGE_KEY, normalized);
    return normalized;
}

export function createMoonRenderProfileActions({
    THREE,
    animationScenes,
    loadSceneTextures,
    loadMoonRenderProfileTextures = null,
    applyAndRefreshSceneTextures,
    render,
    globalObject = typeof window !== "undefined" ? window : globalThis,
}) {
    const loadMoonTextures = typeof loadMoonRenderProfileTextures === "function"
        ? loadMoonRenderProfileTextures
        : loadSceneTextures;
    let latestProfileLoadId = 0;

    async function setMoonRenderProfile(profile) {
        const normalized = persistActiveProfile(globalObject, profile);
        latestProfileLoadId += 1;
        const profileLoadId = latestProfileLoadId;
        const sceneMap = animationScenes || {};
        const initializedScenes = Object.values(sceneMap).filter((scene) => !!scene?.initialized3D);

        if (!initializedScenes.length) {
            return normalized;
        }

        const textures = await loadMoonTextures({
            THREE,
            minFilter: THREE.LinearFilter,
            moonRenderProfile: normalized,
            globalObject,
        });

        const activeProfile = getMoonRenderProfile();
        if (profileLoadId !== latestProfileLoadId || activeProfile !== normalized) {
            disposeLoadedMoonTextures(textures);
            return activeProfile;
        }

        Object.values(sceneMap).filter((scene) => !!scene?.initialized3D).forEach((scene) => {
            // Pass `render` so that when the deferred normal-map rebuild
            // completes (asynchronously, via requestIdleCallback), it can
            // trigger a redraw. Without this the new textures wouldn't show
            // up until the next user interaction woke the on-demand render
            // loop — visible to the user as the profile switch "hanging."
            applyAndRefreshSceneTextures(scene, textures, {
                disposePrevious: true,
                requestRender: render,
            });
        });

        render?.();
        return normalized;
    }

    function getMoonRenderProfile() {
        const globalValue = String(globalObject?.MOON_RENDER_ASSET_PROFILE || "").trim();
        if (globalValue) {
            return normalizeProfile(globalValue);
        }
        return resolveMoonRenderAssetProfile({ globalObject });
    }

    function resetMoonRenderAssetPathOverrides() {
        delete globalObject.MOON_RENDER_ASSET_PATHS;
        const storage = safeGetStorage(globalObject);
        storage?.removeItem?.(MOON_RENDER_ASSET_PATHS_STORAGE_KEY);
    }

    return {
        getMoonRenderProfile,
        setMoonRenderProfile,
        resetMoonRenderAssetPathOverrides,
    };
}
