import { constrainMoonRenderProfile } from "../core/domain/render-device-policy.js";
import { disposeUnclaimedTextures } from "../rendering/texture-ownership.js";
import { resolveMoonRenderAssetProfile } from "./moon-render-asset-profiles.js";
import { registerSceneCleanup } from "./scene-lifecycle.js";
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
    clearTimeoutFn = globalThis?.clearTimeout?.bind(globalThis),
    requestAnimationFrame = globalThis?.requestAnimationFrame?.bind(globalThis),
    cancelAnimationFrameFn = globalThis?.cancelAnimationFrame?.bind(globalThis),
    globalObject = typeof window !== "undefined" ? window : globalThis,
}) {
    const loadMoonTextures = typeof loadMoonRenderProfileTextures === "function"
        ? loadMoonRenderProfileTextures : loadSceneTextures;
    const initAttempts = new WeakMap();

    function isLive(scene) {
        return !!scene && scene.disposed !== true && scene.stopCreationFlag !== true;
    }

    function isCurrent(scene, context) {
        return isLive(scene) && scene.initialized3D === true &&
            scene.deferred3DInitRunId === context.runId &&
            (context.token == null || scene.textureLoadToken === context.token);
    }

    function staleError() {
        return Object.assign(new Error("Texture load was superseded by a newer scene initialization."),
            { name: "TextureLoadStaleError" });
    }

    function abortError() {
        return Object.assign(new Error("Texture load was cancelled."), { name: "AbortError" });
    }

    function assertCurrent(scene, context) {
        if (!isCurrent(scene, context)) throw staleError();
        if (context.signal?.aborted) throw abortError();
    }

    function disposeResult(textures) {
        disposeUnclaimedTextures(Object.values(textures || {}));
    }

    function resolveRequestedMoonProfile() {
        const pending = String(globalObject.__moonRenderPendingProfile || "").trim().toLowerCase();
        return pending === "fast" || pending === "quality" || pending === "low"
            ? constrainMoonRenderProfile(pending, globalObject)
            : resolveMoonRenderAssetProfile({ globalObject });
    }

    function beginProfileLoad(scene) {
        const activeLoads = globalObject.__moonRenderProfileLoadControllers instanceof Set
            ? globalObject.__moonRenderProfileLoadControllers : new Set();
        globalObject.__moonRenderProfileLoadControllers = activeLoads;
        const controller = typeof AbortController === "function" ? new AbortController() : null;
        if (controller) activeLoads.add(controller);
        const unregister = registerSceneCleanup(scene, () => controller?.abort?.());
        return { controller, unregister };
    }

    function finishProfileLoad(owner) {
        owner.unregister();
        const activeLoads = globalObject.__moonRenderProfileLoadControllers;
        activeLoads?.delete?.(owner.controller);
        if (activeLoads?.size === 0) delete globalObject.__moonRenderProfileLoadControllers;
    }

    // Stop awaiting an uncooperative loader on cancellation, but keep a handler
    // for its eventual result so unclaimed late resources cannot be stranded.
    function awaitOwnedTextures(scene, context, load) {
        return new Promise((resolve, reject) => {
            let settled = false;
            let unregister = () => {};
            const cleanup = () => {
                unregister();
                context.signal?.removeEventListener?.("abort", onAbort);
            };
            const fail = error => {
                if (settled) return;
                settled = true;
                cleanup();
                reject(error);
            };
            const onAbort = () => fail(abortError());
            unregister = registerSceneCleanup(scene, () => fail(staleError()));
            if (settled) { unregister(); return; }
            context.signal?.addEventListener?.("abort", onAbort, { once: true });
            try {
                assertCurrent(scene, context);
                const loading = load();
                Promise.resolve(loading).then(textures => {
                    if (settled) { disposeResult(textures); return; }
                    try { assertCurrent(scene, context); }
                    catch (error) { disposeResult(textures); fail(error); return; }
                    settled = true;
                    cleanup();
                    resolve(textures);
                }, fail);
            } catch (error) { fail(error); }
        });
    }

    function hasRecentInput(minIdleMs = TEXTURE_APPLY_IDLE_MS) {
        return typeof getLastInputActivityMs === "function" && shouldDeferForRecentInput({
            nowMs: Date.now(), lastInputActivityMs: getLastInputActivityMs(), minIdleMs,
        });
    }

    function waitForTextureWorkSlot({ scene, context, minIdleMs = TEXTURE_APPLY_IDLE_MS }) {
        return new Promise((resolve, reject) => {
            let settled = false, timer = null, frame = null;
            let unregister = () => {};
            const finish = error => {
                if (settled) return;
                settled = true;
                if (timer != null) clearTimeoutFn?.(timer);
                if (frame != null) cancelAnimationFrameFn?.(frame);
                timer = null; frame = null;
                unregister();
                context.signal?.removeEventListener?.("abort", onAbort);
                if (error) reject(error); else resolve();
            };
            const onAbort = () => finish(abortError());
            unregister = registerSceneCleanup(scene, () => finish(staleError()));
            if (settled) { unregister(); return; }
            context.signal?.addEventListener?.("abort", onAbort, { once: true });
            const armTimer = (callback, delay) => {
                let invoked = false;
                const handle = scheduleTimeout(() => {
                    invoked = true; timer = null;
                    if (!settled) callback();
                }, delay);
                if (!invoked) {
                    if (settled) clearTimeoutFn?.(handle); else timer = handle;
                }
            };
            const startedAt = Date.now();
            const check = () => {
                if (settled) return;
                try {
                    assertCurrent(scene, context);
                    if (typeof scheduleTimeout !== "function") { finish(); return; }
                    const nowMs = Date.now();
                    const lastInputActivityMs = typeof getLastInputActivityMs === "function"
                        ? getLastInputActivityMs() : -Infinity;
                    if (nowMs - startedAt < 2000 && shouldDeferForRecentInput({ nowMs, lastInputActivityMs, minIdleMs })) {
                        armTimer(check, Math.min(2000 - (nowMs - startedAt),
                            Math.max(TEXTURE_APPLY_POLL_MS, resolveDelayUntilInputIdle({ nowMs, lastInputActivityMs, minIdleMs }))));
                        return;
                    }
                    if (typeof requestAnimationFrame === "function") {
                        let invoked = false;
                        const handle = requestAnimationFrame(() => {
                            invoked = true; frame = null;
                            if (!settled) armTimer(() => {
                                try { assertCurrent(scene, context); finish(); } catch (error) { finish(error); }
                            }, 0);
                        });
                        if (!invoked) {
                            if (settled) cancelAnimationFrameFn?.(handle); else frame = handle;
                        }
                    } else finish();
                } catch (error) { finish(error); }
            };
            check();
        });
    }

    function applyLoadedTextures(scene, textures, context, acceptOwnership = null) {
        try {
            assertCurrent(scene, context);
            applyAndRefreshSceneTextures(scene, textures, {
                disposePrevious: true,
                requestRender: () => { if (isCurrent(scene, context) && !context.signal?.aborted) render?.(); },
                shouldDeferGeneratedNormalMap: () => hasRecentInput(),
                onAccepted: acceptOwnership,
            });
            assertCurrent(scene, context);
            render?.();
        } catch (error) {
            disposeResult(textures); // Claimed scene/renderer leases are not reclaimed.
            throw error;
        }
    }

    function beginMoonPreview(scene) {
        if (!isLive(scene) || !scene.moonRenderer || typeof loadMoonRenderProfileTextures !== "function") return;
        const renderer = scene.moonRenderer;
        const owner = beginProfileLoad(scene);
        const context = { runId: scene.deferred3DInitRunId, signal: owner.controller?.signal };
        const promise = awaitOwnedTextures(scene, context, () => loadMoonTextures({
            THREE, minFilter: THREE.LinearFilter, moonRenderProfile: "low",
            previewOnly: true, globalObject, signal: context.signal || null,
        })).then(textures => {
            if (!isCurrent(scene, context) || context.signal?.aborted ||
                scene.moonRenderer !== renderer || Number(scene.moonMap?.image?.width || 0) > 1) {
                disposeResult(textures);
                return;
            }
            applyLoadedTextures(scene, textures, context);
        }).catch(error => {
            if (isCurrent(scene, context) && error?.name !== "AbortError" && error?.name !== "TextureLoadStaleError") {
                console.warn("Moon preview unavailable; full textures will still load.", error);
            }
        }).finally(() => {
            finishProfileLoad(owner);
            if (isCurrent(scene, context) && scene.moonPreviewLoadPromise === promise) scene.moonPreviewLoadPromise = null;
        });
        if (isCurrent(scene, context)) scene.moonPreviewLoadPromise = promise;
    }

    function markTextureLoadDone(scene, state, context) {
        if (!isCurrent(scene, context)) return;
        scene.textureLoadState = state;
        scene.textureLoadPending = false;
        scene.textureLoadPromise = null;
    }

    function refreshMoonProfileInBackground(scene, requestedProfile, loadContext) {
        if (!isCurrent(scene, loadContext) || !requestedProfile || requestedProfile === (scene.moonRenderProfile || "fast")) {
            return Promise.resolve();
        }
        const owner = beginProfileLoad(scene);
        const context = { ...loadContext, signal: owner.controller?.signal };
        scene.moonTextureLoadState = "loading";
        scene.moonTextureLoadPending = true;
        const promise = awaitOwnedTextures(scene, context, () => loadMoonTextures({
            THREE, minFilter: THREE.LinearFilter, moonRenderProfile: requestedProfile,
            globalObject, signal: context.signal || null,
        })).then(async textures => {
            try {
                assertCurrent(scene, context);
                if (resolveRequestedMoonProfile() !== requestedProfile) {
                    scene.moonTextureLoadState = "stale";
                    disposeResult(textures);
                    return;
                }
                await waitForTextureWorkSlot({ scene, context });
                applyLoadedTextures(scene, textures, context);
                if (isCurrent(scene, context)) scene.moonTextureLoadState = "ready";
            } catch (error) { disposeResult(textures); throw error; }
        }).catch(error => {
            if (!isCurrent(scene, context)) return;
            if (error?.name === "AbortError") {
                scene.moonTextureLoadState = "stale";
                throw error;
            }
            if (error?.name === "TextureLoadStaleError") return;
            console.warn("Moon profile refresh after scene init failed:", error);
            scene.moonTextureLoadState = "error";
        }).finally(() => {
            finishProfileLoad(owner);
            if (isCurrent(scene, context) && scene.moonTextureLoadPromise === promise) {
                scene.moonTextureLoadPending = false;
                scene.moonTextureLoadPromise = null;
            }
        });
        if (isCurrent(scene, context)) scene.moonTextureLoadPromise = promise;
        return promise;
    }

    function scheduleTextureRestart(scene, context) {
        if (typeof scheduleTimeout !== "function") return;
        let finished = false, timer = null;
        let unregister = () => {};
        unregister = registerSceneCleanup(scene, () => {
            finished = true;
            if (timer != null) clearTimeoutFn?.(timer);
        });
        if (finished) { unregister(); return; }
        let invoked = false;
        const handle = scheduleTimeout(() => {
            invoked = true;
            if (finished) return;
            finished = true; unregister();
            if (isCurrent(scene, context) && scene.textureLoadState === "stale") beginTextureLoad(scene);
        }, 0);
        if (!invoked) {
            if (finished) clearTimeoutFn?.(handle); else timer = handle;
        }
    }

    function beginTextureLoad(scene) {
        if (!isLive(scene) || !scene.initialized3D) return null;
        if (scene.textureLoadState === "loading" || scene.textureLoadState === "ready") return scene.textureLoadPromise || null;
        const requestedProfile = resolveRequestedMoonProfile();
        const owner = beginProfileLoad(scene);
        const context = {
            token: Number.isFinite(scene.textureLoadToken) ? scene.textureLoadToken + 1 : 1,
            runId: scene.deferred3DInitRunId, signal: owner.controller?.signal,
        };
        scene.textureLoadToken = context.token;
        scene.textureLoadState = "loading";
        scene.textureLoadPending = true;
        const progressive = typeof loadSceneTexturesProgressively === "function";
        const load = () => progressive ? loadSceneTexturesProgressively({
            THREE, minFilter: THREE.LinearFilter, moonRenderProfile: requestedProfile,
            globalObject, signal: context.signal || null,
            beforeLoadGroup: () => assertCurrent(scene, context),
            beforeApplyGroup: () => waitForTextureWorkSlot({ scene, context }),
            onTexturesReady: (textures, ownership = {}) => applyLoadedTextures(scene, textures, context, ownership.acceptOwnership),
        }) : loadSceneTextures({
            THREE, minFilter: THREE.LinearFilter, moonRenderProfile: requestedProfile,
            globalObject, signal: context.signal || null,
        });
        const promise = awaitOwnedTextures(scene, context, load).then(async textures => {
            try {
                assertCurrent(scene, context);
                if (!progressive) applyLoadedTextures(scene, textures, context);
                assertCurrent(scene, context);
                const latestProfile = resolveRequestedMoonProfile();
                if ((textures?.moonRenderProfile || "fast") !== latestProfile) {
                    await refreshMoonProfileInBackground(scene, latestProfile, context);
                }
                assertCurrent(scene, context);
                markTextureLoadDone(scene, "ready", context);
            } catch (error) { disposeResult(textures); throw error; }
        }).catch(error => {
            owner.controller?.abort?.();
            if (!isCurrent(scene, context)) return;
            if (error?.name === "TextureLoadStaleError" || error?.name === "AbortError") {
                markTextureLoadDone(scene, "stale", context);
                if (error.name === "AbortError" && (owner.controller?.moonProfileSuperseded || globalObject.__moonRenderPendingProfile)) {
                    scheduleTextureRestart(scene, context);
                }
                return;
            }
            console.error("Error: couldn't load textures. Using placeholders:", error);
            markTextureLoadDone(scene, "error", context);
        }).finally(() => finishProfileLoad(owner));
        if (isCurrent(scene, context)) scene.textureLoadPromise = promise;
        return promise;
    }

    function init3d(scene, callback) {
        if (!isLive(scene) || scene.initialized3D) return;
        const attempt = {};
        initAttempts.set(scene, attempt);
        const ownsInit = () => isLive(scene) && initAttempts.get(scene) === attempt;
        const placeholders = createPlaceholderSceneTextures({
            THREE, minFilter: THREE.LinearFilter, moonRenderProfile: "low", globalObject,
        });
        if (!ownsInit()) { disposeResult(placeholders); return; }
        applyAndRefreshSceneTextures(scene, placeholders, { disposePrevious: false });
        if (!ownsInit()) { disposeResult(placeholders); return; }
        scene.init3dRest();
        if (!ownsInit() || !scene.initialized3D) { disposeResult(placeholders); return; }
        scene.textureLoadState = "deferred";
        scene.textureLoadPending = false;
        scene.textureLoadPromise = null;
        scene.textureLoadToken = Number.isFinite(scene.textureLoadToken) ? scene.textureLoadToken : 0;
        scene.beginTextureLoad = () => beginTextureLoad(scene);
        beginMoonPreview(scene);
        if (ownsInit()) callback();
    }

    return { init3d };
}
