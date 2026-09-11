import { constrainMoonRenderProfile } from "../core/domain/render-device-policy.js";
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

export function persistMoonRenderAssetProfile(globalObject, profile) {
    const normalized = constrainMoonRenderProfile(normalizeProfile(profile), globalObject);
    globalObject.MOON_RENDER_ASSET_PROFILE = normalized;
    const storage = safeGetStorage(globalObject);
    try { storage?.setItem?.(MOON_RENDER_ASSET_PROFILE_STORAGE_KEY, normalized); } catch { /* Session-only choice when storage is unavailable. */ }
    if (globalObject.location?.href && globalObject.history?.replaceState) {
        const url = new URL(globalObject.location.href);
        url.searchParams.set("moonRenderProfile", normalized);
        url.searchParams.delete("moonProfile");
        globalObject.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
    return normalized;
}

function beginProfileLoad(globalObject) {
    const activeLoads = globalObject.__moonRenderProfileLoadControllers instanceof Set
        ? globalObject.__moonRenderProfileLoadControllers
        : new Set();
    globalObject.__moonRenderProfileLoadControllers = activeLoads;
    activeLoads.forEach((controller) => {
        if (controller) controller.moonProfileSuperseded = true;
        controller?.abort?.();
    });
    activeLoads.clear();
    const controller = typeof AbortController === "function"
        ? new AbortController()
        : null;
    if (controller) activeLoads.add(controller);
    return controller;
}

function finishProfileLoad(globalObject, controller) {
    const activeLoads = globalObject.__moonRenderProfileLoadControllers;
    activeLoads?.delete?.(controller);
    if (activeLoads?.size === 0) {
        delete globalObject.__moonRenderProfileLoadControllers;
    }
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
    let latestProfileLoadPromise = null;

    function setMoonRenderProfile(profile) {
        const normalized = constrainMoonRenderProfile(normalizeProfile(profile), globalObject);
        latestProfileLoadId += 1;
        const profileLoadId = latestProfileLoadId;
        const loadController = beginProfileLoad(globalObject);
        const sceneMap = animationScenes || {};
        globalObject.__moonRenderPendingProfile = normalized;

        let profileLoadPromise;
        const resolveWinningProfile = async () => {
            if (latestProfileLoadPromise && latestProfileLoadPromise !== profileLoadPromise) {
                try {
                    await latestProfileLoadPromise;
                } catch {
                    // The winning load owns its own failure; this call reports the retained profile.
                }
            }
            return getMoonRenderProfile();
        };
        profileLoadPromise = (async () => {
            let textures;
            try {
                textures = await loadMoonTextures({
                    THREE,
                    minFilter: THREE.LinearFilter,
                    moonRenderProfile: normalized,
                    globalObject,
                    signal: loadController?.signal,
                });
            } catch (error) {
                if (profileLoadId !== latestProfileLoadId || error?.name === "AbortError") {
                    return resolveWinningProfile();
                }
                throw error;
            } finally {
                finishProfileLoad(globalObject, loadController);
            }

            if (profileLoadId !== latestProfileLoadId) {
                disposeLoadedMoonTextures(textures);
                return resolveWinningProfile();
            }

            const initializedScenes = Object.values(sceneMap)
                .filter((scene) => !!scene?.initialized3D);
            if (!initializedScenes.length) {
                disposeLoadedMoonTextures(textures);
                return persistMoonRenderAssetProfile(globalObject, normalized);
            }

            initializedScenes.forEach((scene) => {
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

            persistMoonRenderAssetProfile(globalObject, normalized);
            render?.();
            return normalized;
        })().finally(() => {
            if (
                profileLoadId === latestProfileLoadId &&
                globalObject.__moonRenderPendingProfile === normalized
            ) {
                delete globalObject.__moonRenderPendingProfile;
            }
        });
        latestProfileLoadPromise = profileLoadPromise;
        return profileLoadPromise;
    }

    function getMoonRenderProfile() {
        const globalValue = String(globalObject?.MOON_RENDER_ASSET_PROFILE || "").trim();
        if (globalValue) {
            return constrainMoonRenderProfile(normalizeProfile(globalValue), globalObject);
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
