import {
    planCameraPairTransition,
    resolveAllowedLooks,
    resolveAllowedPositions,
    resolveLockAvailability,
    resolvePairFromValue,
    resolvePairKey,
} from "../core/domain/camera-policy.js";
import {
    clampFovDegrees as clampFovDegreesForRange,
    zoomSliderValueToFovDegrees,
} from "./fov-slider-scale.js";
import { mountMissionFovControl } from "./mission-fov-control.js";
import { applySkyLayerVisibility } from "./sky-visibility.js";

export function createCameraActions({
    animationScenes,
    getConfig,
    readCameraPositionMode,
    readCameraLookMode,
    applyCameraFromTo,
    readPlaneSelection,
    setPlaneSelection,
    handlePlaneChange,
    applyViewForCurrentIdentity = null,
    render,
    getViewSky,
    getViewConstellationLines,
}) {
    const CAMERA_MODE_VALUES = ["manual", "earth", "moon", "spacecraft"];
    const MIN_FOV_DEGREES = 0.1;
    const MAX_FOV_DEGREES = 179;
    const AUTO_FOV_MARGIN_SCALE = 1.03;
    const AUTO_FOV_EPSILON_DEGREES = 1e-4;
    let pendingApplyHandle = null;
    let lastAppliedPositionMode = "manual";
    let lastAppliedLookMode = "manual";
    let lastAppliedConfig = null;
    let desktopMainViewAutoFovEnabled = true;
    let lastSyncedDesktopMainFov = 50;
    const desktopMainFovControl = mountMissionFovControl(
        typeof document !== "undefined" ? document.getElementById("desktop-main-fov") : null,
        {
            groupAriaLabel: "Main view field of view",
            autoButtonAriaLabel: "Main view automatic field of view",
            sliderAriaLabel: "Main view zoom slider",
            valueAriaLabel: "Main view field of view value",
            initialFovDegrees: 50,
            minDegrees: MIN_FOV_DEGREES,
            maxDegrees: MAX_FOV_DEGREES,
            classNames: {
                label: ["header-main-fov__label"],
                autoButton: ["header-main-fov__auto"],
                track: ["header-main-fov__track"],
                edge: ["header-main-fov__edge"],
                slider: ["header-main-fov__slider"],
                value: ["header-main-fov__value"],
            },
            ids: {
                autoButton: "desktop-main-fov-auto",
                slider: "desktop-main-fov-slider",
                value: "desktop-main-fov-value",
            },
        },
    );

    const mountedBodyOverride = {
        earth: { hidden: null },
        moon: { hidden: null },
    };
    let autoAdjusting = false;
    setDesktopMainFovAutoEnabled(true);

    function resolveManualLookTarget(scene) {
        const target = scene?.defaultLookTarget;
        if (
            target &&
            Number.isFinite(target.x) &&
            Number.isFinite(target.y) &&
            Number.isFinite(target.z)
        ) {
            return target;
        }
        return { x: 0, y: 0, z: 0 };
    }

    function resetManualCameraControls(scene, { resetCameraParameters = false, resetUp = true } = {}) {
        if (!scene) return false;
        if (resetCameraParameters) {
            scene.setCameraParameters?.(false);
        }

        const controls = scene.cameraController?.controls;
        if (!controls?.target) return resetCameraParameters;

        const manualTarget = resolveManualLookTarget(scene);
        controls.target.set(
            manualTarget.x,
            manualTarget.y,
            manualTarget.z,
        );
        controls.enabled = true;
        controls.noRotate = false;
        controls.noPan = false;
        controls.noZoom = false;
        scene.cameraController?._setFreeFlyEnabled?.(false);
        if (resetUp) {
            scene.camera?.up?.set?.(0, 0, 1);
        }
        scene.camera?.lookAt?.(controls.target);
        controls.update?.();
        return true;
    }

    function resolveFromToTargets(scene) {
        return {
            earth: scene.earthContainer ?? null,
            moon: scene.moonContainer ?? null,
            spacecraft: scene.craft ?? null,
        };
    }

    function applySkyVisibility(scene) {
        applySkyLayerVisibility(scene, {
            viewSky: getViewSky(),
            viewConstellationLines: getViewConstellationLines(),
        });
    }

    function getAllowedLook(positionMode) {
        return resolveAllowedLooks(positionMode);
    }

    function getAllowedPosition(lookMode) {
        return resolveAllowedPositions(lookMode);
    }

    function updateSelectOptions(selectId, allowedValues) {
        const select = document.getElementById(selectId);
        if (!select) return;
        const allowed = new Set(allowedValues);
        for (const option of select.options) {
            option.disabled = !allowed.has(option.value);
        }
    }

    function updatePillOptions(groupName, allowedValues) {
        const inputs = document.querySelectorAll(`input[name="${groupName}"]`);
        if (!inputs.length) return;
        const allowed = new Set(allowedValues);

        inputs.forEach((input) => {
            const enabled = allowed.has(input.value);
            input.disabled = !enabled;
            const wrapper = input.closest(".camera-pill");
            if (wrapper) {
                wrapper.classList.toggle("is-disabled", !enabled);
            }
        });
    }

    function updateFromToOptionStates(positionMode, lookMode) {
        const allowedLookModes = getAllowedLook(positionMode);
        const allowedPositionModes = getAllowedPosition(lookMode);

        updateSelectOptions("camera-look", allowedLookModes);
        updateSelectOptions("camera-position", allowedPositionModes);
        // Keep pill controls fully interactive; normalization handles invalid
        // combinations by auto-selecting the nearest valid pair.
        updatePillOptions("camera-look-pill", CAMERA_MODE_VALUES);
        updatePillOptions("camera-position-pill", CAMERA_MODE_VALUES);
    }

    function updateCameraModeSelection(positionMode, lookMode, pairKeyOverride) {
        const positionPill = document.querySelector(
            `input[name="camera-position-pill"][value="${positionMode}"]`,
        );
        if (positionPill && !positionPill.checked) {
            positionPill.checked = true;
        }

        const lookPill = document.querySelector(
            `input[name="camera-look-pill"][value="${lookMode}"]`,
        );
        if (lookPill && !lookPill.checked) {
            lookPill.checked = true;
        }

        // Backward-compatible sync for legacy camera-pair radios (if present).
        const key = pairKeyOverride || resolvePairKey(positionMode, lookMode);
        const selected = document.querySelector(`input[name="camera-pair"][value="${key}"]`);
        if (selected && !selected.checked) {
            selected.checked = true;
        }
    }

    function resolvePairFromEvent(event) {
        const value = event?.target?.value;
        return resolvePairFromValue(value);
    }

    function updateLockOption(scene, { id, enabled, flagKey }) {
        const input = document.getElementById(id);
        if (!input) return;
        input.disabled = !enabled;
        const wrapper = input.closest(".settings-option");
        if (wrapper) {
            wrapper.classList.toggle("is-disabled", !enabled);
        }
        if (!enabled && input.checked) {
            input.checked = false;
            if (scene) {
                if (flagKey === "sc") scene.lockOnSC = false;
                if (flagKey === "moon") scene.lockOnMoon = false;
                if (flagKey === "earth") scene.lockOnEarth = false;
            }
        }
    }

    function updateLockOnAvailability(scene, positionMode, lookMode) {
        const allowSet = new Set(resolveLockAvailability(positionMode, lookMode));

        updateLockOption(scene, {
            id: "checkbox-lock-sc",
            enabled: allowSet.has("sc"),
            flagKey: "sc",
        });
        updateLockOption(scene, {
            id: "checkbox-lock-moon",
            enabled: allowSet.has("moon"),
            flagKey: "moon",
        });
        updateLockOption(scene, {
            id: "checkbox-lock-earth",
            enabled: allowSet.has("earth"),
            flagKey: "earth",
        });
    }

    function getActiveScene() {
        return animationScenes[getConfig()] || null;
    }

    function clampFovDegrees(value) {
        return clampFovDegreesForRange(value, {
            minDegrees: MIN_FOV_DEGREES,
            maxDegrees: MAX_FOV_DEGREES,
            fallbackDegrees: 50,
        });
    }

    function getDesktopMainFovElements() {
        return desktopMainFovControl
            ? {
                container: desktopMainFovControl.container,
                autoButton: desktopMainFovControl.autoButton,
                slider: desktopMainFovControl.slider,
                value: desktopMainFovControl.value,
                control: desktopMainFovControl,
            }
            : {
                container: null,
                autoButton: null,
                slider: null,
                value: null,
                control: null,
            };
    }

    function resolveCurrentDesktopMainFov(scene) {
        const { control } = getDesktopMainFovElements();
        const currentFov = Number(scene?.camera?.fov ?? scene?.cameraController?.camera?.fov);
        if (Number.isFinite(currentFov)) {
            return clampFovDegrees(currentFov);
        }
        const sliderFov = control?.readSliderFovDegrees(50);
        if (Number.isFinite(sliderFov)) {
            return sliderFov;
        }
        return 50;
    }

    function parseDesktopMainFovValue(rawValue, fallbackValue) {
        const parsed = Number.parseFloat(String(rawValue ?? "").trim());
        if (!Number.isFinite(parsed)) {
            return clampFovDegrees(fallbackValue);
        }
        return clampFovDegrees(parsed);
    }

    function updateDesktopMainFovValue(fovDegrees) {
        const { control } = getDesktopMainFovElements();
        const parsedFov = Number(fovDegrees);
        const nextFov = Number.isFinite(parsedFov)
            ? clampFovDegrees(parsedFov)
            : clampFovDegrees(lastSyncedDesktopMainFov);
        lastSyncedDesktopMainFov = nextFov;
        control?.setFovDegrees(nextFov, 50);
    }

    function setDesktopMainFovAutoEnabled(enabled) {
        desktopMainViewAutoFovEnabled = enabled === true;
        const { control } = getDesktopMainFovElements();
        control?.setAutoEnabled(desktopMainViewAutoFovEnabled);
        control?.setDisabledState({
            autoButtonDisabled: control?.autoButton?.disabled === true,
            sliderDisabled: desktopMainViewAutoFovEnabled,
            valueDisabled: desktopMainViewAutoFovEnabled,
        });
    }

    function resolveDesktopMainFovInputValue(event, fallbackValue) {
        const target = event?.target;
        const targetId = target?.id;
        if (targetId === "desktop-main-fov-slider") {
            return desktopMainFovControl?.readSliderFovDegrees(fallbackValue)
                ?? zoomSliderValueToFovDegrees(target?.value, {
                    minDegrees: MIN_FOV_DEGREES,
                    maxDegrees: MAX_FOV_DEGREES,
                    fallbackDegrees: fallbackValue,
                });
        }
        return parseDesktopMainFovValue(target?.value, fallbackValue);
    }

    function isDesktopMainFovViewMode(positionMode, lookMode) {
        if (lookMode !== "earth" && lookMode !== "moon") {
            return false;
        }
        if (positionMode !== "earth" && positionMode !== "moon" && positionMode !== "spacecraft") {
            return false;
        }
        return positionMode !== lookMode;
    }

    function isDesktopAutoFovSupported(positionMode, lookMode) {
        return isDesktopMainFovViewMode(positionMode, lookMode);
    }

    function isCenteredMountedView(positionMode, lookMode) {
        if (positionMode === "manual" || lookMode === "manual") {
            return false;
        }
        return positionMode !== lookMode;
    }

    function updateDesktopMainFovInteractionMode(scene, positionMode, lookMode) {
        const controller = scene?.cameraController;
        if (!controller) return;
        const shouldUseMountedWheelFov = isDesktopMainFovViewMode(positionMode, lookMode);
        controller.setMountedWheelFovEnabled?.(shouldUseMountedWheelFov);
        controller.setMountedDollyEnabled?.(!shouldUseMountedWheelFov);
    }

    function resolveDesktopMainFovViewportMetrics() {
        const documentRef = typeof document !== "undefined" ? document : null;
        const viewportWidth = Math.max(
            Number(typeof window !== "undefined" ? window.innerWidth : 0) || 0,
            1,
        );
        const viewportHeight = Math.max(
            Number(typeof window !== "undefined" ? window.innerHeight : 0) || 0,
            1,
        );
        const centerX = viewportWidth * 0.5;
        const centerY = viewportHeight * 0.5;

        const headerBottom = Math.max(
            0,
            Number(documentRef?.getElementById("header")?.getBoundingClientRect?.().bottom) || 0,
        );
        const bottomAnchors = ["control-panel", "timeline-dock"]
            .map((id) => documentRef?.getElementById(id)?.getBoundingClientRect?.())
            .filter((rect) => rect && Number.isFinite(rect.top) && rect.bottom > 0 && rect.top < viewportHeight);
        const bottomLimit = bottomAnchors.length
            ? Math.min(...bottomAnchors.map((rect) => rect.top))
            : viewportHeight;

        const safeHalfWidth = Math.max(1, Math.min(centerX, viewportWidth - centerX));
        const safeHalfHeight = Math.max(1, Math.min(centerY - headerBottom, bottomLimit - centerY));

        return {
            usableHalfWidthFraction: Math.min(1, safeHalfWidth / Math.max(centerX, 1)),
            usableHalfHeightFraction: Math.min(1, safeHalfHeight / Math.max(centerY, 1)),
        };
    }

    function computeAutoFovDegrees({
        distanceToTarget,
        targetRadius,
        aspect,
        usableHalfWidthFraction = 1,
        usableHalfHeightFraction = 1,
    }) {
        if (!Number.isFinite(distanceToTarget) || distanceToTarget <= 0) {
            return Number.NaN;
        }
        const radius = Number.isFinite(targetRadius) && targetRadius > 0 ? targetRadius : 1;
        const fitRadius = radius * AUTO_FOV_MARGIN_SCALE;
        const safeDistance = Math.max(distanceToTarget, fitRadius + 1e-9);
        const ratio = Math.min(fitRadius / safeDistance, 0.999999);
        const angularRadius = Math.asin(ratio);
        const safeAspect = Math.max(Number(aspect) || 1, 1e-3);
        const safeHeightFraction = Math.max(Number(usableHalfHeightFraction) || 0, 1e-3);
        const safeWidthFraction = Math.max(Number(usableHalfWidthFraction) || 0, 1e-3);
        const tanAngularRadius = Math.tan(angularRadius);
        const verticalFromHeight = 2 * Math.atan(tanAngularRadius / safeHeightFraction);
        const verticalFromWidth = 2 * Math.atan(tanAngularRadius / (safeAspect * safeWidthFraction));
        return (Math.max(verticalFromHeight, verticalFromWidth) * 180) / Math.PI;
    }

    function resolveDesktopAutoFovDegrees(scene, positionMode, lookMode) {
        if (!scene || !isDesktopAutoFovSupported(positionMode, lookMode)) {
            return Number.NaN;
        }
        const targets = resolveFromToTargets(scene);
        const anchor = targets[positionMode] || null;
        const target = targets[lookMode] || null;
        if (!anchor?.getWorldPosition || !target?.getWorldPosition || !scene?.camera) {
            return Number.NaN;
        }
        const anchorWorld = scene.camera.position.clone();
        const targetWorld = scene.camera.position.clone();
        anchor.getWorldPosition(anchorWorld);
        target.getWorldPosition(targetWorld);
        const distanceToTarget = anchorWorld.distanceTo(targetWorld);
        const targetRadius = estimateRadius(scene, lookMode);
        const viewportMetrics = resolveDesktopMainFovViewportMetrics();
        return computeAutoFovDegrees({
            distanceToTarget,
            targetRadius,
            aspect: scene.camera.aspect,
            usableHalfWidthFraction: viewportMetrics.usableHalfWidthFraction,
            usableHalfHeightFraction: viewportMetrics.usableHalfHeightFraction,
        });
    }

    function applyDesktopMainFov(scene, fovDegrees, { dispatchChange = true } = {}) {
        const nextFov = clampFovDegrees(fovDegrees);
        const controller = scene?.cameraController;
        if (!controller?.setFov) {
            updateDesktopMainFovValue(nextFov);
            return false;
        }
        const currentFov = Number(scene?.camera?.fov ?? controller.camera?.fov);
        if (Number.isFinite(currentFov) && Math.abs(currentFov - nextFov) < AUTO_FOV_EPSILON_DEGREES) {
            updateDesktopMainFovValue(currentFov);
            return false;
        }
        controller.setFov(nextFov);
        scene?.camera?.updateProjectionMatrix?.();
        if (!controller._freeFlyActive) {
            controller.controls?.update?.();
            if (dispatchChange) {
                controller.controls?.dispatchEvent?.({ type: "change" });
            }
        }
        updateDesktopMainFovValue(nextFov);
        return true;
    }

    function syncDesktopMainFovUi(scene, positionMode, lookMode) {
        const { container, autoButton, slider, value, control } = getDesktopMainFovElements();
        if (!container && !autoButton && !slider && !value) {
            return;
        }
        const shouldShow = isDesktopMainFovViewMode(positionMode, lookMode);
        updateDesktopMainFovInteractionMode(scene, positionMode, lookMode);
        if (container) {
            container.hidden = !shouldShow;
        }
        if (!shouldShow) {
            if (autoButton) {
                autoButton.disabled = true;
            }
            control?.setDisabledState({
                autoButtonDisabled: true,
                sliderDisabled: true,
                valueDisabled: true,
            });
            return;
        }
        const autoSupported = isDesktopAutoFovSupported(positionMode, lookMode);
        if (autoButton) {
            autoButton.disabled = !autoSupported;
        }
        if (!autoSupported && desktopMainViewAutoFovEnabled) {
            setDesktopMainFovAutoEnabled(false);
        }

        let currentFov = resolveCurrentDesktopMainFov(scene);
        if (desktopMainViewAutoFovEnabled && autoSupported) {
            const autoFov = resolveDesktopAutoFovDegrees(scene, positionMode, lookMode);
            if (Number.isFinite(autoFov)) {
                applyDesktopMainFov(scene, autoFov, { dispatchChange: false });
                currentFov = autoFov;
            }
        }
        updateDesktopMainFovValue(currentFov);
        control?.setDisabledState({
            autoButtonDisabled: !autoSupported,
            sliderDisabled: desktopMainViewAutoFovEnabled,
            valueDisabled: desktopMainViewAutoFovEnabled,
        });
    }

    function changeDesktopMainFov(event) {
        const scene = getActiveScene();
        const positionMode = readCameraPositionMode();
        const lookMode = readCameraLookMode();
        if (!isDesktopMainFovViewMode(positionMode, lookMode)) {
            syncDesktopMainFovUi(scene, positionMode, lookMode);
            return;
        }
        if (desktopMainViewAutoFovEnabled) {
            setDesktopMainFovAutoEnabled(false);
        }
        const currentFov = resolveCurrentDesktopMainFov(scene);
        const nextFov = resolveDesktopMainFovInputValue(event, currentFov);
        if (!scene) {
            updateDesktopMainFovValue(nextFov);
            return;
        }
        applyDesktopMainFov(scene, nextFov);
        render();
    }

    function toggleDesktopMainFovAuto() {
        const scene = getActiveScene();
        const positionMode = readCameraPositionMode();
        const lookMode = readCameraLookMode();
        const autoSupported = isDesktopAutoFovSupported(positionMode, lookMode);
        if (!autoSupported) {
            setDesktopMainFovAutoEnabled(false);
            syncDesktopMainFovUi(scene, positionMode, lookMode);
            return;
        }
        if (desktopMainViewAutoFovEnabled) {
            setDesktopMainFovAutoEnabled(false);
            syncDesktopMainFovUi(scene, positionMode, lookMode);
            render();
            return;
        }
        setDesktopMainFovAutoEnabled(true);
        syncDesktopMainFovUi(scene, positionMode, lookMode);
        render();
    }

    function estimateRadius(scene, mode) {
        if (!scene) return null;

        const mesh = mode === "earth"
            ? scene.earth
            : mode === "moon"
                ? scene.moon
                : null;

        const geometry = mesh?.geometry;
        if (geometry) {
            if (!geometry.boundingSphere) {
                geometry.computeBoundingSphere?.();
            }
            const r = geometry.boundingSphere?.radius;
            if (Number.isFinite(r) && r > 0) {
                return r;
            }
        }

        return null;
    }

    function resolveDefaultLookTarget(scene, positionMode) {
        if (!scene) return null;

        if (positionMode === "spacecraft") {
            return scene.moonContainer ?? scene.earthContainer ?? null;
        }

        // From Earth/Moon center, default to looking toward the spacecraft.
        return scene.craft ?? null;
    }

    function updateMountedCraftVisibility(scene, positionMode) {
        if (!scene?.craft) return;

        const hideCraft = positionMode === "spacecraft";
        scene.hideCraftForMountedCamera = hideCraft;

        if (hideCraft) {
            scene.craft.visible = false;
            if (scene.drone) scene.drone.visible = false;
        }
    }

    function updateMountedBodyVisibility(scene, positionMode) {
        if (!scene) return;

        updateMountedCraftVisibility(scene, positionMode);
        if (!scene.cameraController) return;

        const controller = scene.cameraController;

        // When not mounted, lift any visibility override.
        if (positionMode !== "earth") {
            mountedBodyOverride.earth.hidden = null;
            if (scene.earthContainer) scene.earthContainer.visible = true;
        }
        if (positionMode !== "moon") {
            mountedBodyOverride.moon.hidden = null;
            if (scene.moonContainer) scene.moonContainer.visible = true;
        }

        const updateOne = (bodyMode) => {
            const container = bodyMode === "earth" ? scene.earthContainer : scene.moonContainer;
            if (!container) return;

            const radius = estimateRadius(scene, bodyMode);
            if (!Number.isFinite(radius) || radius <= 0) return;

            const distance = controller.mountOffset?.length?.();
            if (!Number.isFinite(distance)) return;

            const hideThreshold = 0.95 * radius;
            const showThreshold = 1.05 * radius;

            const state = mountedBodyOverride[bodyMode];
            if (state.hidden === null) {
                state.hidden = distance < radius;
            } else if (state.hidden && distance > showThreshold) {
                state.hidden = false;
            } else if (!state.hidden && distance < hideThreshold) {
                state.hidden = true;
            }

            // Hide only when the camera is inside the body; otherwise allow normal visibility rules.
            container.visible = !state.hidden;
        };

        if (positionMode === "earth") updateOne("earth");
        if (positionMode === "moon") updateOne("moon");
    }

    function ensureMountedVisibilityListener(scene) {
        const controller = scene?.cameraController;
        const controls = controller?.controls;
        if (!controller || !controls) return;
        if (controller.__fromToMountedVisibilityListenerAttached) return;
        controller.__fromToMountedVisibilityListenerAttached = true;

        controls.addEventListener("change", () => {
            if (autoAdjusting) return;
            const positionMode = readCameraPositionMode();
            const lookMode = readCameraLookMode();
            const currentFov = Number(scene?.camera?.fov);

            if (
                desktopMainViewAutoFovEnabled &&
                isDesktopMainFovViewMode(positionMode, lookMode) &&
                Number.isFinite(currentFov) &&
                Math.abs(currentFov - lastSyncedDesktopMainFov) > AUTO_FOV_EPSILON_DEGREES
            ) {
                setDesktopMainFovAutoEnabled(false);
            }

            updateMountedBodyVisibility(scene, positionMode);
            syncDesktopMainFovUi(scene, positionMode, lookMode);

            // If the mounted body is hidden (camera inside), "look at self" becomes meaningless.
            // Auto-switch to manual aim and orient toward a meaningful target without teleporting.
            const hiddenState = mountedBodyOverride[positionMode]?.hidden;
            if ((positionMode === "earth" || positionMode === "moon") && hiddenState === true && lookMode === positionMode) {
                autoAdjusting = true;
                try {
                    applyCameraFromTo?.({ lookMode: "manual" });
                    controller.setFromToModes?.(positionMode, "manual");

                    const targets = resolveFromToTargets(scene);
                    controller.updateFromTo?.(targets);

                    const mountPos = controller._resolveTargetWorld?.(positionMode, controller._mountWorld);
                    if (mountPos) {
                        const cameraWorld = mountPos.clone().add(controller.mountOffset);
                        const defaultLookTarget = resolveDefaultLookTarget(scene, positionMode);
                        const lookWorld = defaultLookTarget?.getWorldPosition?.(controller._lookWorld);
                        if (lookWorld) {
                            const dir = lookWorld.clone().sub(cameraWorld).normalize();
                            const epsilon = Math.max(controller.mountOffset.length() * 0.05, 0.01);
                            const targetWorld = cameraWorld.clone().add(dir.multiplyScalar(epsilon));
                            controller.setMountTargetOffset?.(targetWorld.clone().sub(mountPos));
                            if (controller.controls?.target) {
                                controller.controls.target.copy(targetWorld);
                                controller.controls.update();
                            }
                        }
                    }

                    render();
                } finally {
                    autoAdjusting = false;
                }
            }
        }, { passive: true });

        controls.addEventListener("mounted-fov-input", () => {
            const positionMode = readCameraPositionMode();
            const lookMode = readCameraLookMode();
            if (!isDesktopMainFovViewMode(positionMode, lookMode)) {
                return;
            }
            if (desktopMainViewAutoFovEnabled) {
                setDesktopMainFovAutoEnabled(false);
            }
        }, { passive: true });
    }

    function snapMountedCamera(scene, positionMode, lookMode, { preserveDistance = false, preserveOffset = false } = {}) {
        const controller = scene?.cameraController;
        if (!controller || !scene.camera) return;
        if (positionMode === "manual") return;

        const targets = resolveFromToTargets(scene);
        controller.updateFromTo?.(targets);

        const mountPos = controller._resolveTargetWorld?.(positionMode, controller._mountWorld);
        if (!mountPos) return;

        const defaultDistance = 0;
        const liveDistance = scene.camera?.position?.distanceTo?.(mountPos);
        const distance = preserveDistance
            ? Math.max(
                Number.isFinite(liveDistance) ? liveDistance : (controller.mountOffset?.length?.() ?? defaultDistance),
                0,
            )
            : defaultDistance;
        const currentOffset = controller.mountOffset?.clone?.() ?? null;

        // Default view direction when using manual aim:
        // - From Earth/Moon: look toward spacecraft
        // - From Spacecraft: look toward Moon (fallback Earth)
        let mountOffset = { x: 0, y: 0, z: distance };
        if (
            preserveDistance &&
            preserveOffset &&
            currentOffset &&
            Number.isFinite(currentOffset.lengthSq?.()) &&
            currentOffset.lengthSq() > 1e-18
        ) {
            mountOffset = { x: currentOffset.x, y: currentOffset.y, z: currentOffset.z };
        }
        let lookWorld = null;
        if (!preserveOffset && lookMode === "manual") {
            const defaultLookTarget = resolveDefaultLookTarget(scene, positionMode);
            lookWorld = defaultLookTarget?.getWorldPosition?.(controller._lookWorld) ?? null;
            if (lookWorld) {
                const dir = lookWorld.clone().sub(mountPos).normalize();
                // Place the camera opposite the direction of the target so the target is "in front".
                const cameraOffset = dir.clone().multiplyScalar(-distance);
                mountOffset = { x: cameraOffset.x, y: cameraOffset.y, z: cameraOffset.z };
            }
        }

        controller.setMountOffset?.(mountOffset);
        controller.setMountTargetOffset?.({ x: 0, y: 0, z: 0 });

        scene.camera.position.copy(mountPos).add(controller.mountOffset);

        // Ensure TrackballControls has up-to-date camera+target state immediately.
        if (lookMode === "manual") {
            scene.camera.up.set(0, 0, 1);
            if (lookWorld) {
                scene.camera.lookAt(lookWorld);
            }
        }

        updateMountedBodyVisibility(scene, positionMode);
    }

    function changeCameraFromTo(event) {
        const preserveManualRelease = event?.detail?.preserveManualRelease === true;
        const targetName = event?.target?.name;
        const sourceId = targetName === "camera-position-pill"
            ? "camera-position"
            : targetName === "camera-look-pill"
                ? "camera-look"
                : event?.target?.id;
        const pairSelection = targetName === "camera-pair"
            ? resolvePairFromEvent(event)
            : null;

        if (targetName === "camera-position-pill") {
            applyCameraFromTo?.({ positionMode: event?.target?.value });
        } else if (targetName === "camera-look-pill") {
            applyCameraFromTo?.({ lookMode: event?.target?.value });
        } else if (targetName === "camera-pair") {
            if (pairSelection) {
                applyCameraFromTo?.(pairSelection);
            }
        }

        let positionMode = readCameraPositionMode();
        let lookMode = readCameraLookMode();

        const transitionPlan = planCameraPairTransition({
            positionMode,
            lookMode,
            sourceId,
        });

        if (
            transitionPlan.positionMode !== positionMode ||
            transitionPlan.lookMode !== lookMode
        ) {
            applyCameraFromTo?.({
                positionMode: transitionPlan.positionMode,
                lookMode: transitionPlan.lookMode,
            });
            positionMode = transitionPlan.positionMode;
            lookMode = transitionPlan.lookMode;
        }

        updateFromToOptionStates(positionMode, lookMode);
        updateCameraModeSelection(positionMode, lookMode, transitionPlan.pairKey);

        const config = getConfig();
        const scene = animationScenes[config];
        updateLockOnAvailability(scene, positionMode, lookMode);
        syncDesktopMainFovUi(scene, positionMode, lookMode);

        const configChanged = config !== lastAppliedConfig;
        const positionChanged = positionMode !== lastAppliedPositionMode;
        const lookChanged = lookMode !== lastAppliedLookMode;
        const shouldSnap =
            positionMode !== "manual" &&
            (positionChanged || lookChanged || configChanged);
        if (!scene || !scene.initialized3D) {
            // Browser reloads can restore <select> values after scripts start.
            // Re-try shortly so UI selections always match camera behavior.
            if (!pendingApplyHandle) {
                pendingApplyHandle = setTimeout(() => {
                    pendingApplyHandle = null;
                    changeCameraFromTo();
                }, 200);
            }
            return;
        }

        if (scene && scene.initialized3D) {
            scene.cameraController?.setFromToModes?.(positionMode, lookMode);
            applySkyVisibility(scene);

            ensureMountedVisibilityListener(scene);

            // Immediate camera feedback: mounted source->target views must re-center on the
            // source body instead of inheriting a previous free-fly offset.
            if (positionMode !== "manual" && shouldSnap) {
                const shouldCenterMountedView = isCenteredMountedView(positionMode, lookMode);
                snapMountedCamera(scene, positionMode, lookMode, {
                    preserveDistance: !shouldCenterMountedView,
                    preserveOffset: !shouldCenterMountedView && !positionChanged && !configChanged,
                });
            }

            scene.cameraController?.updateFromTo?.(resolveFromToTargets(scene));
            // Ensure forced-look changes take effect immediately even if the animation is paused.
            if (!scene.cameraController?._freeFlyActive) {
                scene.cameraController?.controls?.update?.();
            }

            updateMountedBodyVisibility(scene, positionMode);

            // Preserve the legacy "Camera: Default" behavior: when returning to the standard
            // manual/manual mode, reset camera parameters to a predictable default.
            if (positionMode === "manual" && lookMode === "manual") {
                // Ensure TrackballControls rotates around the free-camera target again.
                // Follow-pill release preserves camera position, but still needs to drop the
                // body-centered pivot/up vector that forced-look mode installed.
                resetManualCameraControls(scene, {
                    resetCameraParameters: !preserveManualRelease,
                });
                // Lift any visibility overrides when returning to free camera.
                updateMountedBodyVisibility(scene, positionMode);
                // Re-enable full controls for manual/manual
                if (scene.cameraController?.controls) {
                    scene.cameraController.controls.enabled = true;
                    scene.cameraController.controls.noRotate = false;
                    scene.cameraController.controls.noPan = false;
                    scene.cameraController._setFreeFlyEnabled?.(false);
                    scene.cameraController.controls.update?.();
                }
            }
        }

        lastAppliedPositionMode = positionMode;
        lastAppliedLookMode = lookMode;
        lastAppliedConfig = config;
        if (typeof applyViewForCurrentIdentity === "function" && applyViewForCurrentIdentity()) {
            return;
        }
        render();
    }

    function recenterMountedCamera() {
        const positionMode = readCameraPositionMode();
        if (positionMode === "manual") return;

        // Reset aim to manual and snap back to center-feel defaults.
        applyCameraFromTo?.({ lookMode: "manual" });

        const config = getConfig();
        const scene = animationScenes[config];
        if (!scene || !scene.initialized3D) return;

        scene.cameraController?.setFromToModes?.(positionMode, "manual");
        snapMountedCamera(scene, positionMode, "manual");
        scene.cameraController?.updateFromTo?.(resolveFromToTargets(scene));
        if (!scene.cameraController?._freeFlyActive) {
            scene.cameraController?.controls?.update?.();
        }
        updateMountedBodyVisibility(scene, positionMode);
        if (typeof applyViewForCurrentIdentity === "function" && applyViewForCurrentIdentity()) {
            return;
        }
        render();
    }

    function togglePlane() {
        setPlaneSelection(readPlaneSelection());
        handlePlaneChange(false, false);

        // Plane switches should preserve legacy centered behavior in manual view:
        // reset TrackballControls pivot to scene origin so DEFAULT/plane views
        // keep the origin centered on screen.
        const positionMode = readCameraPositionMode();
        const lookMode = readCameraLookMode();
        if (positionMode === "manual" && lookMode === "manual") {
            const config = getConfig();
            const scene = animationScenes[config];
            if (resetManualCameraControls(scene, { resetUp: false })) {
                render();
            }
        }
        if (typeof applyViewForCurrentIdentity === "function") {
            applyViewForCurrentIdentity();
        }
    }

    return {
        changeCameraFromTo,
        changeDesktopMainFov,
        toggleDesktopMainFovAuto,
        togglePlane,
        recenterMountedCamera,
    };
}
