import {
    DEFAULT_COMPOSE_FOV,
    buildMobileViewFovDisplayState,
    clampMobileViewFov,
    computeMobileAutoFovDegrees,
    resolveMobileTouchDistance,
    shouldSkipMobileAutoFovUpdate,
} from "../core/domain/mobile-view-fov-state.js";

function createMobileViewFovSync(deps) {
    const {
        mobileViewsFovSlider,
        mobileComposeFovSlider,
        mobileViewsFovValue,
        mobileComposeFovValue,
        mobileViewsFovAuto,
        mobileComposeFovAuto,
        contentWrapper,
        mobileViewPresetById,
        mobileComposePresetById,
        resolveActiveScene,
        resolveSceneObject,
        getActiveTab,
        getActiveViewPresetId,
        getActiveComposePresetId,
        getComposeFeatureEnabled,
        isMobileViewport,
        getTapPlaybackEnabled = () => false,
        onTapPlaybackToggle = () => {},
        onMoonVisibilityRefresh = () => {},
        onComposePresentationSync = () => {},
        windowRef = globalThis?.window || globalThis,
        performanceRef = globalThis?.performance,
        composeDefaultFov = DEFAULT_COMPOSE_FOV,
        initialAutoFovEnabled = true,
    } = deps;

    const radiusByObject = new WeakMap();
    const autoFovRadiusCacheByScene = new WeakMap();
    let autoFovEnabled = !!initialAutoFovEnabled;
    let composeDefaultFovApplied = false;
    let pinchState = null;
    let tapCandidate = null;
    let autoFovRefreshRevision = 0;

    function updateDisplay(fovDegrees) {
        const displayState = buildMobileViewFovDisplayState(fovDegrees);
        if (mobileViewsFovSlider) {
            mobileViewsFovSlider.value = displayState.sliderValue;
        }
        if (mobileComposeFovSlider) {
            mobileComposeFovSlider.value = displayState.sliderValue;
        }
        if (mobileViewsFovValue) {
            mobileViewsFovValue.textContent = displayState.text;
            mobileViewsFovValue.value = displayState.text;
        }
        if (mobileComposeFovValue) {
            mobileComposeFovValue.textContent = displayState.text;
            mobileComposeFovValue.value = displayState.text;
        }
        return displayState.fov;
    }

    function estimateObjectRadius(object, fallback = 1) {
        if (!object) return fallback;
        if (radiusByObject.has(object)) {
            return radiusByObject.get(object);
        }
        let radius = null;
        const takeRadius = (geometry) => {
            if (!geometry) return;
            if (!geometry.boundingSphere && typeof geometry.computeBoundingSphere === "function") {
                geometry.computeBoundingSphere();
            }
            const candidate = geometry.boundingSphere?.radius;
            if (Number.isFinite(candidate) && candidate > 0) {
                radius = candidate;
            }
        };

        takeRadius(object.geometry);
        if (!Number.isFinite(radius) && typeof object.traverse === "function") {
            object.traverse((node) => {
                if (Number.isFinite(radius)) return;
                takeRadius(node?.geometry);
            });
        }
        const resolved = Number.isFinite(radius) && radius > 0 ? radius : fallback;
        radiusByObject.set(object, resolved);
        return resolved;
    }

    function resolveBodyMeshRadius(scene, mode) {
        if (!scene) return Number.NaN;
        const key = String(mode || "").toUpperCase();
        if (key === "EARTH") {
            const meshRadius = estimateObjectRadius(scene.earth, Number.NaN);
            if (Number.isFinite(meshRadius) && meshRadius > 0) return meshRadius;
        }
        if (key === "MOON") {
            const meshRadius = estimateObjectRadius(scene.moon, Number.NaN);
            if (Number.isFinite(meshRadius) && meshRadius > 0) return meshRadius;
        }
        return Number.NaN;
    }

    function resolveBodyRadius(scene, targetMode, targetObject) {
        const mode = String(targetMode || "").toUpperCase();
        if (!scene || (mode !== "EARTH" && mode !== "MOON")) {
            return estimateObjectRadius(targetObject, 1);
        }

        let sceneRadiusCache = autoFovRadiusCacheByScene.get(scene);
        if (!sceneRadiusCache) {
            sceneRadiusCache = new Map();
            autoFovRadiusCacheByScene.set(scene, sceneRadiusCache);
        }
        const cachedRadius = sceneRadiusCache.get(mode);
        if (Number.isFinite(cachedRadius) && cachedRadius > 0) {
            return cachedRadius;
        }

        const primary = String(scene?.primaryBody || "").toUpperCase();
        const secondary = String(scene?.secondaryBody || "").toUpperCase();
        if (mode === "EARTH") {
            if (primary === "EARTH" && Number.isFinite(scene?.primaryBodyRadius)) {
                sceneRadiusCache.set(mode, scene.primaryBodyRadius);
                return scene.primaryBodyRadius;
            }
            if (secondary === "EARTH" && Number.isFinite(scene?.secondaryBodyRadius)) {
                sceneRadiusCache.set(mode, scene.secondaryBodyRadius);
                return scene.secondaryBodyRadius;
            }
        }
        if (mode === "MOON") {
            if (primary === "MOON" && Number.isFinite(scene?.primaryBodyRadius)) {
                sceneRadiusCache.set(mode, scene.primaryBodyRadius);
                return scene.primaryBodyRadius;
            }
            if (secondary === "MOON" && Number.isFinite(scene?.secondaryBodyRadius)) {
                sceneRadiusCache.set(mode, scene.secondaryBodyRadius);
                return scene.secondaryBodyRadius;
            }
        }

        const bodyMeshRadius = resolveBodyMeshRadius(scene, mode);
        if (Number.isFinite(bodyMeshRadius) && bodyMeshRadius > 0) {
            sceneRadiusCache.set(mode, bodyMeshRadius);
            return bodyMeshRadius;
        }

        const estimatedRadius = estimateObjectRadius(targetObject, Number.NaN);
        if (Number.isFinite(estimatedRadius) && estimatedRadius > 0) {
            sceneRadiusCache.set(mode, estimatedRadius);
            return estimatedRadius;
        }

        return Number.isFinite(cachedRadius) && cachedRadius > 0 ? cachedRadius : 1;
    }

    function applyFov(fovDegrees) {
        if (!isMobileViewport?.()) return false;
        const scene = resolveActiveScene?.();
        if (scene?.disposed === true) return false;
        const controller = scene?.cameraController;
        const nextFov = clampMobileViewFov(fovDegrees);
        if (!controller?.setFov) {
            updateDisplay(nextFov);
            return false;
        }
        controller.setFov(nextFov);
        scene?.camera?.updateProjectionMatrix?.();
        if (!controller._freeFlyActive) {
            controller.controls?.update?.();
            controller.controls?.dispatchEvent?.({ type: "change" });
        }
        updateDisplay(nextFov);
        return true;
    }

    function applyAutoFov(fovDegrees) {
        if (!isMobileViewport?.()) return false;
        const scene = resolveActiveScene?.();
        if (scene?.disposed === true) return false;
        const controller = scene?.cameraController;
        const nextFov = clampMobileViewFov(fovDegrees);
        if (!controller?.setFov) {
            updateDisplay(nextFov);
            return false;
        }
        controller.setFov(nextFov);
        updateDisplay(nextFov);
        return true;
    }

    function requestSceneRender() {
        if (!isMobileViewport?.()) return;
        const scene = resolveActiveScene?.();
        if (scene?.disposed === true) return;
        const controller = scene?.cameraController;
        if (!controller) return;
        if (!controller._freeFlyActive) {
            controller.controls?.update?.();
            controller.controls?.dispatchEvent?.({ type: "change" });
        }
    }

    function setAutoFovEnabled(enabled) {
        autoFovRefreshRevision += 1;
        autoFovEnabled = !!enabled;
        [mobileViewsFovAuto, mobileComposeFovAuto].forEach((button) => {
            if (!button) return;
            button.classList?.toggle?.("is-active", autoFovEnabled);
            button.setAttribute?.("aria-pressed", autoFovEnabled ? "true" : "false");
            button.title = autoFovEnabled ? "Auto FoV enabled" : "Auto FoV disabled";
        });
    }

    function isAutoFovEnabled() {
        return autoFovEnabled;
    }

    function resolveActivePreset() {
        const activeTab = getActiveTab?.();
        const composeTab = activeTab === "compose" && !!getComposeFeatureEnabled?.();
        const viewsTab = activeTab === "views";
        if (!composeTab && !viewsTab) return null;
        return composeTab
            ? mobileComposePresetById?.get(getActiveComposePresetId?.())
            : mobileViewPresetById?.get(getActiveViewPresetId?.());
    }

    function applyAutoFovForActivePreset() {
        if (!autoFovEnabled || !isMobileViewport?.()) return false;
        const preset = resolveActivePreset();
        if (!preset) return false;

        const scene = resolveActiveScene?.();
        if (!scene?.camera?.position?.clone) return false;

        const anchorObject = resolveSceneObject?.(scene, preset.positionMode);
        const targetObject = resolveSceneObject?.(scene, preset.lookMode);
        if (!anchorObject || !targetObject) return false;

        const anchorWorld = scene.camera.position.clone();
        const targetWorld = scene.camera.position.clone();
        anchorObject.getWorldPosition?.(anchorWorld);
        targetObject.getWorldPosition?.(targetWorld);
        const distanceToTarget = anchorWorld.distanceTo?.(targetWorld);
        if (!Number.isFinite(distanceToTarget) || distanceToTarget <= 0) return false;

        const targetRadius = resolveBodyRadius(scene, preset.lookMode, targetObject);
        const aspect = scene.camera.aspect || (windowRef?.innerWidth / Math.max(windowRef?.innerHeight || 1, 1));
        const autoFov = computeMobileAutoFovDegrees({
            distanceToTarget,
            targetRadius,
            aspect,
        });
        if (!Number.isFinite(autoFov)) {
            if (Number.isFinite(scene.camera.fov)) {
                updateDisplay(scene.camera.fov);
            }
            return false;
        }

        const clampedAutoFov = clampMobileViewFov(autoFov);
        const currentFov = Number(scene.camera?.fov);
        if (shouldSkipMobileAutoFovUpdate({
            currentFov,
            nextFov: clampedAutoFov,
        })) {
            updateDisplay(currentFov);
            return false;
        }
        return applyAutoFov(clampedAutoFov);
    }

    function scheduleAutoFovRefresh() {
        const revision = ++autoFovRefreshRevision;
        const ownsRefresh = () => revision === autoFovRefreshRevision && autoFovEnabled && isMobileViewport?.();
        if (!ownsRefresh()) return;
        windowRef?.requestAnimationFrame?.(() => {
            if (!ownsRefresh()) return;
            windowRef?.requestAnimationFrame?.(() => {
                if (!ownsRefresh()) return;
                const activeTab = getActiveTab?.();
                if (activeTab !== "views" && activeTab !== "compose") return;
                applyAutoFovForActivePreset();
                if (!ownsRefresh()) return;
                requestSceneRender();
                if (!ownsRefresh()) return;
                onMoonVisibilityRefresh({ force: true });
            });
        });
    }

    function ensureComposeDefaultFov() {
        if (composeDefaultFovApplied || !isMobileViewport?.()) return false;
        setAutoFovEnabled(false);
        applyFov(composeDefaultFov);
        composeDefaultFovApplied = true;
        return true;
    }

    function syncDisplayFromScene() {
        const scene = resolveActiveScene?.();
        if (scene?.camera?.fov) {
            updateDisplay(scene.camera.fov);
            return true;
        }
        return false;
    }

    function shouldHandleMobilePinchZoom() {
        if (!isMobileViewport?.()) return false;
        const activeTab = getActiveTab?.();
        if (activeTab === "views") {
            return !!mobileViewPresetById?.get(getActiveViewPresetId?.());
        }
        if (activeTab === "compose") {
            return !!getComposeFeatureEnabled?.();
        }
        return false;
    }

    function nowMs() {
        if (typeof performanceRef?.now === "function") {
            return performanceRef.now();
        }
        return Date.now();
    }

    function bind() {
        [mobileViewsFovAuto, mobileComposeFovAuto].forEach((button) => {
            if (!button) return;
            button.addEventListener("click", function () {
                if (!isMobileViewport?.()) return;
                setAutoFovEnabled(!autoFovEnabled);
                applyAutoFovForActivePreset();
                onMoonVisibilityRefresh({ force: true });
            });
        });

        [mobileViewsFovSlider, mobileComposeFovSlider].forEach((slider) => {
            if (!slider) return;
            const onManualFovChange = (event) => {
                if (!isMobileViewport?.()) return;
                const sourceSlider = event?.currentTarget;
                setAutoFovEnabled(false);
                applyFov(Number(sourceSlider?.value));
                onMoonVisibilityRefresh({ force: true });
            };
            slider.addEventListener("input", onManualFovChange);
            slider.addEventListener("change", onManualFovChange);
        });

        if (!contentWrapper) return;
        const MOBILE_TAP_MAX_DURATION_MS = 280;
        const MOBILE_TAP_MAX_MOVE_PX = 12;

        const onTouchStart = (event) => {
            if (getTapPlaybackEnabled() && event.touches && event.touches.length === 1) {
                const touch = event.touches[0];
                tapCandidate = {
                    x: touch.clientX,
                    y: touch.clientY,
                    startMs: nowMs(),
                    moved: false,
                };
            } else if (!event.touches || event.touches.length !== 1) {
                tapCandidate = null;
            }

            if (!shouldHandleMobilePinchZoom()) return;
            if (!event.touches || event.touches.length !== 2) return;
            const distance = resolveMobileTouchDistance(event.touches[0], event.touches[1]);
            if (!Number.isFinite(distance) || distance <= 0) return;
            const scene = resolveActiveScene?.();
            const fovInput = getActiveTab?.() === "compose" ? mobileComposeFovSlider : mobileViewsFovSlider;
            const baseFov = clampMobileViewFov(scene?.camera?.fov ?? Number(fovInput?.value));
            pinchState = {
                baseDistance: distance,
                baseFov,
            };
            setAutoFovEnabled(false);
            event.preventDefault?.();
        };

        const onTouchMove = (event) => {
            if (tapCandidate && event.touches && event.touches.length === 1) {
                const touch = event.touches[0];
                const dx = touch.clientX - tapCandidate.x;
                const dy = touch.clientY - tapCandidate.y;
                if (Math.hypot(dx, dy) > MOBILE_TAP_MAX_MOVE_PX) {
                    tapCandidate.moved = true;
                }
            } else if (tapCandidate && (!event.touches || event.touches.length !== 1)) {
                tapCandidate = null;
            }

            if (!shouldHandleMobilePinchZoom()) {
                pinchState = null;
                return;
            }
            if (!pinchState || !event.touches || event.touches.length !== 2) return;
            const distance = resolveMobileTouchDistance(event.touches[0], event.touches[1]);
            if (!Number.isFinite(distance) || distance <= 0 || pinchState.baseDistance <= 0) return;
            const scale = distance / pinchState.baseDistance;
            if (!Number.isFinite(scale) || scale <= 0) return;
            const nextFov = clampMobileViewFov(pinchState.baseFov / scale);
            applyFov(nextFov);
            if (getActiveTab?.() === "compose") {
                onComposePresentationSync();
            }
            onMoonVisibilityRefresh();
            event.preventDefault?.();
        };

        const clearPinchState = (event) => {
            pinchState = null;
            if (
                tapCandidate &&
                getTapPlaybackEnabled() &&
                event?.changedTouches &&
                event.changedTouches.length === 1
            ) {
                const endTouch = event.changedTouches[0];
                const dx = endTouch.clientX - tapCandidate.x;
                const dy = endTouch.clientY - tapCandidate.y;
                const elapsed = nowMs() - tapCandidate.startMs;
                const moved = tapCandidate.moved || Math.hypot(dx, dy) > MOBILE_TAP_MAX_MOVE_PX;
                const target = event.target;
                const targetElement = target && (target === contentWrapper || typeof target.closest === "function")
                    ? target
                    : null;
                const isRenderAreaTap = !!(
                    targetElement &&
                    (
                        targetElement === contentWrapper ||
                        targetElement.closest?.("#content-wrapper")
                    )
                );
                if (!moved && elapsed <= MOBILE_TAP_MAX_DURATION_MS && isRenderAreaTap) {
                    onTapPlaybackToggle();
                }
            }
            tapCandidate = null;
        };

        contentWrapper.addEventListener("touchstart", onTouchStart, { passive: false });
        contentWrapper.addEventListener("touchmove", onTouchMove, { passive: false });
        contentWrapper.addEventListener("touchend", clearPinchState, { passive: true });
        contentWrapper.addEventListener("touchcancel", clearPinchState, { passive: true });
    }

    return {
        applyAutoFovForActivePreset,
        applyFov,
        bind,
        ensureComposeDefaultFov,
        isAutoFovEnabled,
        requestSceneRender,
        scheduleAutoFovRefresh,
        setAutoFovEnabled,
        syncDisplayFromScene,
        updateDisplay,
    };
}

export { createMobileViewFovSync };
