import { constrainMoonRenderProfile } from "../core/domain/render-device-policy.js";
import { resolveMoonRenderAssetProfile } from "./moon-render-asset-profiles.js";
import {
    resolveDelayUntilInputIdle,
    shouldDeferForRecentInput,
} from "../core/domain/interaction-idle-policy.js";

const TEXTURE_APPLY_IDLE_MS = 1200;
const TEXTURE_APPLY_POLL_MS = 120;

export function createScene3dInitActions({
    THREE,
    createPlaceholderSceneTextures,
    loadSceneTextures,
    loadSceneTexturesProgressively = null,
    loadMoonRenderProfileTextures = null,
    applyAndRefreshSceneTextures,
    render,
    getLastInputActivityMs = null,
    scheduleTimeout = globalThis?.setTimeout?.bind(globalThis),
    requestAnimationFrame = globalThis?.requestAnimationFrame?.bind(globalThis),
    globalObject = typeof window !== "undefined" ? window : globalThis,
}) {
    const loadMoonTextures = typeof loadMoonRenderProfileTextures === "function"
        ? loadMoonRenderProfileTextures
        : loadSceneTextures;

    function beginMoonPreview(scene) {
        if (!scene.moonRenderer || typeof loadMoonRenderProfileTextures !== "function") return;
        const runId = scene.deferred3DInitRunId;
        const controller = beginProfileLoad();
        scene.moonPreviewLoadPromise = loadMoonTextures({
            THREE,
            minFilter: THREE.LinearFilter,
            moonRenderProfile: "low",
            previewOnly: true,
            globalObject,
            signal: controller?.signal || null,
        }).then((textures) => {
            const stillPlaceholder = Number(scene.moonMap?.image?.width || 0) <= 1;
            if (scene.deferred3DInitRunId !== runId || !scene.initialized3D
                || scene.stopCreationFlag || controller?.signal.aborted || !stillPlaceholder) {
                textures.moonMap?.dispose?.();
                return;
            }
            applyLoadedTextures(scene, textures);
        }).catch((error) => {
            if (error?.name !== "AbortError") console.warn("Moon preview unavailable; full textures will still load.", error);
        }).finally(() => finishProfileLoad(controller));
    }

    function markTextureLoadDone(scene, state) {
        scene.textureLoadState = state;
        scene.textureLoadPending = false;
        scene.textureLoadPromise = null;
    }

    function resolveRequestedMoonProfile() {
        const pendingProfile = String(globalObject.__moonRenderPendingProfile || "")
            .trim()
            .toLowerCase();
        if (pendingProfile === "fast" || pendingProfile === "quality" || pendingProfile === "low") {
            return constrainMoonRenderProfile(pendingProfile, globalObject);
        }
        return resolveMoonRenderAssetProfile({ globalObject });
    }

    function getNowMs() {
        return Date.now();
    }

    function isTextureLoadCurrent(scene, token, runId) {
        return !!scene &&
            scene.textureLoadToken === token &&
            scene.deferred3DInitRunId === runId &&
            scene.initialized3D === true &&
            scene.stopCreationFlag !== true;
    }

    function createStaleTextureLoadError() {
        const error = new Error("Texture load was superseded by a newer scene initialization.");
        error.name = "TextureLoadStaleError";
        return error;
    }

    function beginProfileLoad() {
        const activeLoads = globalObject.__moonRenderProfileLoadControllers instanceof Set
            ? globalObject.__moonRenderProfileLoadControllers
            : new Set();
        globalObject.__moonRenderProfileLoadControllers = activeLoads;
        const controller = typeof AbortController === "function"
            ? new AbortController()
            : null;
        if (controller) activeLoads.add(controller);
        return controller;
    }

    function finishProfileLoad(controller) {
        const activeLoads = globalObject.__moonRenderProfileLoadControllers;
        activeLoads?.delete?.(controller);
        if (activeLoads?.size === 0) {
            delete globalObject.__moonRenderProfileLoadControllers;
        }
    }

    function assertTextureLoadCurrent(scene, token, runId) {
        if (!isTextureLoadCurrent(scene, token, runId)) {
            throw createStaleTextureLoadError();
        }
    }

    function hasRecentInput(minIdleMs = TEXTURE_APPLY_IDLE_MS) {
        if (typeof getLastInputActivityMs !== "function") {
            return false;
        }
        return shouldDeferForRecentInput({
            nowMs: getNowMs(),
            lastInputActivityMs: getLastInputActivityMs(),
            minIdleMs,
        });
    }

    function waitForTextureWorkSlot({
        scene,
        token,
        runId,
        minIdleMs = TEXTURE_APPLY_IDLE_MS,
    } = {}) {
        assertTextureLoadCurrent(scene, token, runId);
        if (typeof scheduleTimeout !== "function") {
            return Promise.resolve();
        }

        const startedAt = getNowMs();
        return new Promise((resolve, reject) => {
            const check = () => {
                try {
                    assertTextureLoadCurrent(scene, token, runId);
                    const nowMs = getNowMs();
                    const lastInputActivityMs = typeof getLastInputActivityMs === "function"
                        ? getLastInputActivityMs()
                        : -Infinity;
                    if (getNowMs() - startedAt < 2000 && shouldDeferForRecentInput({ nowMs, lastInputActivityMs, minIdleMs })) {
                        scheduleTimeout(check, Math.min(
                            2000 - (nowMs - startedAt),
                            Math.max(TEXTURE_APPLY_POLL_MS, resolveDelayUntilInputIdle({ nowMs, lastInputActivityMs, minIdleMs })),
                        ));
                        return;
                    }
                    if (typeof requestAnimationFrame === "function") {
                        requestAnimationFrame(() => {
                            scheduleTimeout(() => {
                                try {
                                    assertTextureLoadCurrent(scene, token, runId);
                                    resolve();
                                } catch (error) {
                                    reject(error);
                                }
                            }, 0);
                        });
                        return;
                    }
                    resolve();
                } catch (error) {
                    reject(error);
                }
            };
            check();
        });
    }

    function refreshMoonProfileInBackground(scene, requestedProfile, applyTextures, loadContext = {}) {
        if (!scene || !requestedProfile || requestedProfile === (scene.moonRenderProfile || "fast")) {
            return null;
        }

        scene.moonTextureLoadState = "loading";
        scene.moonTextureLoadPending = true;
        scene.moonTextureLoadPromise = loadMoonTextures({
            THREE,
            minFilter: THREE.LinearFilter,
            moonRenderProfile: requestedProfile,
            globalObject,
            signal: loadContext.signal,
        }).then(
            async (textures) => {
                if (resolveRequestedMoonProfile() !== requestedProfile) {
                    scene.moonTextureLoadState = "stale";
                    return;
                }
                if (loadContext.token) {
                    await waitForTextureWorkSlot({
                        scene,
                        token: loadContext.token,
                        runId: loadContext.runId,
                    });
                }
                applyTextures(textures);
                scene.moonTextureLoadState = "ready";
            },
            (error) => {
                if (error?.name === "AbortError") {
                    scene.moonTextureLoadState = "stale";
                    return;
                }
                console.warn("Moon profile refresh after scene init failed:", error);
                scene.moonTextureLoadState = "error";
            },
        ).finally(() => {
            scene.moonTextureLoadPending = false;
            scene.moonTextureLoadPromise = null;
        });
        return scene.moonTextureLoadPromise;
    }

    function applyLoadedTextures(scene, textures, loadContext = {}, acceptOwnership = null) {
        applyAndRefreshSceneTextures(scene, textures, {
            disposePrevious: true,
            requestRender: render,
            shouldDeferGeneratedNormalMap: () => hasRecentInput(TEXTURE_APPLY_IDLE_MS),
            onAccepted: acceptOwnership,
        });
        render?.();
    }

    function beginProgressiveTextureLoad(scene, loadContext, requestedProfile) {
        return loadSceneTexturesProgressively({
            THREE,
            minFilter: THREE.LinearFilter,
            moonRenderProfile: requestedProfile,
            globalObject,
            signal: loadContext.signal,
            // Network requests need not wait for input to stop. Heavy installs
            // retain a bounded idle wait; the bundled preview bypasses it.
            beforeLoadGroup: () => assertTextureLoadCurrent(scene, loadContext.token, loadContext.runId),
            beforeApplyGroup: () => waitForTextureWorkSlot({
                scene,
                token: loadContext.token,
                runId: loadContext.runId,
            }),
            onTexturesReady: (textures, ownership = {}) => {
                assertTextureLoadCurrent(scene, loadContext.token, loadContext.runId);
                applyLoadedTextures(scene, textures, loadContext, ownership.acceptOwnership);
            },
        });
    }

    function beginTextureLoad(scene) {
        if (!scene || scene.textureLoadState === "loading" || scene.textureLoadState === "ready") {
            return scene?.textureLoadPromise || null;
        }

        scene.textureLoadState = "loading";
        scene.textureLoadPending = true;
        const requestedProfile = resolveRequestedMoonProfile();
        const profileLoadController = beginProfileLoad();
        const loadContext = {
            token: Number.isFinite(scene.textureLoadToken) ? scene.textureLoadToken + 1 : 1,
            runId: scene.deferred3DInitRunId,
            signal: profileLoadController?.signal || null,
        };
        scene.textureLoadToken = loadContext.token;
        const textureLoad = typeof loadSceneTexturesProgressively === "function"
            ? beginProgressiveTextureLoad(scene, loadContext, requestedProfile)
            : loadSceneTextures({
                THREE,
                minFilter: THREE.LinearFilter,
                moonRenderProfile: requestedProfile,
                globalObject,
                signal: loadContext.signal,
            });
        const handleTextureLoadError = (error) => {
            const stillCurrent = isTextureLoadCurrent(scene, loadContext.token, loadContext.runId);
            profileLoadController?.abort?.();
            if (!stillCurrent) return;
            if (error?.name === "TextureLoadStaleError" || error?.name === "AbortError") {
                markTextureLoadDone(scene, "stale");
                // A quality choice cancels the old Moon request, but the same
                // startup job also owns Earth/sky. Restart it with the winning
                // profile instead of leaving unrelated textures as placeholders.
                if (error.name === "AbortError" && (profileLoadController?.moonProfileSuperseded || globalObject.__moonRenderPendingProfile)) {
                    scheduleTimeout?.(() => {
                        if (isTextureLoadCurrent(scene, loadContext.token, loadContext.runId) && scene.textureLoadState === "stale") beginTextureLoad(scene);
                    }, 0);
                }
                return;
            }
            console.error("Error: couldn't load textures. Using placeholders:", error);
            markTextureLoadDone(scene, "error");
        };
        scene.textureLoadPromise = textureLoad.then(
            async (textures) => {
                assertTextureLoadCurrent(scene, loadContext.token, loadContext.runId);
                const applyTextures = (resolvedTextures) => applyLoadedTextures(
                    scene,
                    resolvedTextures,
                    loadContext,
                );
                if (typeof loadSceneTexturesProgressively !== "function") {
                    applyTextures(textures);
                }

                const latestRequestedProfile = resolveRequestedMoonProfile();
                if ((textures?.moonRenderProfile || "fast") !== latestRequestedProfile) {
                    return refreshMoonProfileInBackground(
                        scene,
                        latestRequestedProfile,
                        applyTextures,
                        loadContext,
                    ).finally(() => {
                        markTextureLoadDone(scene, "ready");
                    });
                }
                markTextureLoadDone(scene, "ready");
            },
            handleTextureLoadError,
        ).catch(handleTextureLoadError).finally(() => {
            finishProfileLoad(profileLoadController);
        });
        return scene.textureLoadPromise;
    }

    function init3d(scene, callback) {
        if (scene.initialized3D) {
            return;
        }

        const placeholderTextures = createPlaceholderSceneTextures({
            THREE,
            minFilter: THREE.LinearFilter,
            moonRenderProfile: "low",
            globalObject,
        });
        applyAndRefreshSceneTextures(scene, placeholderTextures, { disposePrevious: false });
        scene.init3dRest();
        beginMoonPreview(scene);
        callback();
        scene.textureLoadState = "deferred";
        scene.textureLoadPending = false;
        scene.textureLoadPromise = null;
        scene.textureLoadToken = Number.isFinite(scene.textureLoadToken) ? scene.textureLoadToken : 0;
        scene.beginTextureLoad = () => beginTextureLoad(scene);
    }

    return { init3d };
}
