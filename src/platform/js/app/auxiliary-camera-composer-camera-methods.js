import {
    AUXILIARY_CAMERA_COMPOSER_LIGHTING_DEPENDENCIES,
    AUXILIARY_CAMERA_ORBIT_PLANE_DEPENDENCIES,
    AUXILIARY_CAMERA_OVERLAY_DEPENDENCIES,
} from "./auxiliary-camera-dependencies.js";
import * as shared from "./auxiliary-camera-shared.js";

const {
    AUTO_FOV_MARGIN_SCALE,
    AUTO_FOV_MAX_DEGREES,
    AUTO_FOV_MIN_DEGREES,
    COMPOSER_AUTO_FOV_MAX_DEGREES,
    COMPOSER_AUTO_FOV_MIN_DEGREES,
    COMPOSER_MANUAL_FOV_MAX_DEGREES,
    COMPOSER_MAX_PITCH_RAD,
    LUNAR_CRATER_VIEW_IDS,
    MOON_TARGET_AUTO_FOV_MIN_DEGREES,
    ORBIT_XY_AUTO_FOV_DEGREES,
    PANEL_MIN_SIDE_COMPOSER,
    PANEL_MIN_SIDE_DEFAULT,
    TARGET_AUTO_FOV_MAX_DEGREES,
    TARGET_AUTO_FOV_MIN_DEGREES,
    applyComposerBodyAmbientLighting,
    applyComposerEarthshineGain,
    applyComposerExposureProfile,
    applyComposerMoonshineGain,
    applyPhotoModeBodyPresentation,
    clampFovDegrees,
    clearAuxiliaryPanelOverlay,
    composerRollDialKnobOffset,
    computeComposerAutoFovDegrees,
    computeCraftMoonVisibilityInfo,
    computeMoonPhaseInfo,
    computeOrbitPlaneHalfHeight,
    computePhotoModeLightingPresentation,
    configureBodyRenderLayers,
    configureCraftRenderLayers,
    configureSkyRenderLayers,
    createDefaultLunarFeatureViewState,
    createDefaultSurfacePointViewState,
    createOrbitPlaneProjector,
    drawOrbitPlaneCurve,
    drawOrbitPlaneCurvesFromSceneData,
    drawOrbitPlaneLineObject,
    drawOrbitPlaneMarker,
    isDomInstance,
    normalizeComposerRollRad,
    renderComposerBottomMetricsOverlay,
    renderComposerMoonOutlineOverlay,
    renderComposerRaDecGridOverlay,
    renderComposerSeeThroughOverlay,
    renderComposerSkyLabelOverlay,
    renderMoonFarSideOverlay,
    renderOrbitPlane2DOverlay,
    renderOrbitPlanePanel,
    renderWithLunarCraterView,
    renderWithSurfacePointView,
    resolveComposerBodyAmbientState,
    resolveComposerBodyDiscInView,
    resolveComposerEclipseCoronaVisualState,
    resolveComposerExposureState,
    resolveComposerSolarEclipseState,
    resolveComposerSunOpticsProfile,
    resolveComposerViewIntent,
    resolveMoonPhaseName,
    resolveOrbitPlaneCurveBodyIds,
    resolveOrbitPlaneCurveStroke,
    roundPercentParts,
    updateBodyNorthWorld,
} = shared;

export const composerCameraMethods = {
    getComposerLookDirection(panelState) {
        const cosPitch = Math.cos(panelState.composerPitchRad);
        this.composerLookWorld.set(
            Math.cos(panelState.composerYawRad) * cosPitch,
            Math.sin(panelState.composerYawRad) * cosPitch,
            Math.sin(panelState.composerPitchRad),
        );
        const len = this.composerLookWorld.length();
        if (len <= 1e-9) {
            this.composerLookWorld.set(1, 0, 0);
        } else {
            this.composerLookWorld.multiplyScalar(1 / len);
        }
        return this.composerLookWorld;
    },
    updateComposerRollUi(panelState) {
        const slider = panelState?.composerRollSlider;
        const valueNode = panelState?.composerRollValue;
        const dialKnob = panelState?.composerRollDialKnob;
        const dialValue = panelState?.composerRollDialValue;
        if (!slider && !valueNode && !dialKnob && !dialValue) {
            return;
        }
        const rawRoll = Number.isFinite(panelState.composerRollRad) ? panelState.composerRollRad : 0;
        const roll = normalizeComposerRollRad(rawRoll);
        panelState.composerRollRad = roll;
        const degrees = Math.round(this.THREE.MathUtils.radToDeg(roll)) % 360;
        if (slider) {
            slider.value = String(degrees);
        }
        const text = `${degrees}°`;
        if (valueNode) {
            valueNode.value = text;
            valueNode.textContent = text;
        }
        if (dialValue) {
            dialValue.textContent = text;
        }
        if (dialKnob) {
            const offset = composerRollDialKnobOffset(roll, 18);
            dialKnob.style.transform = `translate(calc(-50% + ${offset.x.toFixed(2)}px), calc(-50% + ${offset.y.toFixed(2)}px))`;
        }
    },
    getComposerReferenceUpVector(panelState) {
        const orientationReference = String(panelState?.composerOrientationReference || "world").trim().toLowerCase();
        if (orientationReference === "moon-north" && this.moonNorthWorld.lengthSq() > 1e-10) {
            return this.moonNorthWorld;
        }
        if (orientationReference === "earth-north" && this.earthNorthWorld.lengthSq() > 1e-10) {
            return this.earthNorthWorld;
        }
        return this.composerWorldUp;
    },
    getComposerCameraUp(panelState, lookDirWorld) {
        this.composerBaseUp.copy(this.getComposerReferenceUpVector(panelState));
        this.tmpVectorD.copy(lookDirWorld).multiplyScalar(this.composerBaseUp.dot(lookDirWorld));
        this.composerBaseUp.sub(this.tmpVectorD);
        if (this.composerBaseUp.lengthSq() <= 1e-10) {
            this.composerBaseUp.set(0, 1, 0);
            this.tmpVectorD.copy(lookDirWorld).multiplyScalar(this.composerBaseUp.dot(lookDirWorld));
            this.composerBaseUp.sub(this.tmpVectorD);
        }
        if (this.composerBaseUp.lengthSq() <= 1e-10) {
            this.composerBaseUp.set(1, 0, 0);
        } else {
            this.composerBaseUp.normalize();
        }
        const roll = Number.isFinite(panelState.composerRollRad) ? panelState.composerRollRad : 0;
        this.composerRotatedUp.copy(this.composerBaseUp).applyAxisAngle(lookDirWorld, roll).normalize();
        return this.composerRotatedUp;
    },
    setComposerOrientationReference(panelState, orientationReference, { preserveView = true } = {}) {
        if (!panelState || panelState.mode !== "composer") {
            return false;
        }
        const normalizedReference = String(orientationReference || "world").trim().toLowerCase() || "world";
        if (!preserveView) {
            panelState.composerOrientationReference = normalizedReference;
            return true;
        }
        const look = this.tmpVectorA.copy(this.getComposerLookDirection(panelState));
        const up = this.tmpVectorB.copy(this.getComposerCameraUp(panelState, look));
        panelState.composerOrientationReference = normalizedReference;
        this.setComposerOrientationFromLookUp(panelState, look, up);
        return true;
    },
    setComposerOrientationFromLookUp(panelState, lookDirWorld, upDirWorld) {
        const look = this.tmpVectorE.copy(lookDirWorld);
        if (!Number.isFinite(look.x) || !Number.isFinite(look.y) || !Number.isFinite(look.z) || look.lengthSq() <= 1e-12) {
            return false;
        }
        look.normalize();
        const planar = Math.hypot(look.x, look.y);
        panelState.composerYawRad = Math.atan2(look.y, look.x);
        panelState.composerPitchRad = Math.atan2(look.z, Math.max(planar, 1e-9));
        panelState.composerPitchRad = this.THREE.MathUtils.clamp(
            panelState.composerPitchRad,
            -COMPOSER_MAX_PITCH_RAD,
            COMPOSER_MAX_PITCH_RAD,
        );
        // If pitch was clamped, keep orientation stable by rebuilding look from yaw/pitch.
        const cosPitch = Math.cos(panelState.composerPitchRad);
        look.set(
            Math.cos(panelState.composerYawRad) * cosPitch,
            Math.sin(panelState.composerYawRad) * cosPitch,
            Math.sin(panelState.composerPitchRad),
        ).normalize();

        const targetUp = this.tmpVectorF.copy(upDirWorld);
        if (!Number.isFinite(targetUp.x) || !Number.isFinite(targetUp.y) || !Number.isFinite(targetUp.z) || targetUp.lengthSq() <= 1e-12) {
            targetUp.copy(this.composerWorldUp);
        }
        // Orthonormalize up against look.
        targetUp.sub(this.tmpVectorD.copy(look).multiplyScalar(targetUp.dot(look)));
        if (targetUp.lengthSq() <= 1e-12) {
            targetUp.copy(this.getComposerCameraUp(panelState, look));
        } else {
            targetUp.normalize();
        }

        this.composerBaseUp.copy(this.getComposerReferenceUpVector(panelState));
        this.tmpVectorD.copy(look).multiplyScalar(this.composerBaseUp.dot(look));
        this.composerBaseUp.sub(this.tmpVectorD);
        if (this.composerBaseUp.lengthSq() <= 1e-12) {
            this.composerBaseUp.set(0, 1, 0);
            this.tmpVectorD.copy(look).multiplyScalar(this.composerBaseUp.dot(look));
            this.composerBaseUp.sub(this.tmpVectorD);
        }
        if (this.composerBaseUp.lengthSq() <= 1e-12) {
            this.composerBaseUp.set(1, 0, 0);
        } else {
            this.composerBaseUp.normalize();
        }

        const sin = look.dot(this.tmpVectorD.copy(this.composerBaseUp).cross(targetUp));
        const cos = this.composerBaseUp.dot(targetUp);
        panelState.composerRollRad = Math.atan2(sin, cos);
        if (!Number.isFinite(panelState.composerRollRad)) {
            panelState.composerRollRad = 0;
        }
        return true;
    },
    applyComposerBodyAmbientLighting(...args) {
        return applyComposerBodyAmbientLighting.call(this, AUXILIARY_CAMERA_COMPOSER_LIGHTING_DEPENDENCIES, ...args);
    },
    resolveComposerBodyAmbientState(...args) {
        return resolveComposerBodyAmbientState.call(this, AUXILIARY_CAMERA_COMPOSER_LIGHTING_DEPENDENCIES, ...args);
    },
    applySharedComposerBodyAmbientLighting({
        earth = null,
        moon = null,
    } = {}) {
        return this.applyComposerBodyAmbientLighting({
            panelState: this.resolveComposerBodyAmbientState(),
            earth,
            moon,
        });
    },
    applyComposerBodyLightingPresentation({
        earth = null,
        moon = null,
        distanceToEarth = Number.NaN,
        earthRadius = Number.NaN,
        distanceToMoon = Number.NaN,
        moonRadius = Number.NaN,
        earthDayTexture = null,
        earthDayTextureBlend = null,
    }) {
        const presentation = computePhotoModeLightingPresentation({
            distanceToEarth,
            earthRadius,
            distanceToMoon,
            moonRadius,
        });
        return applyPhotoModeBodyPresentation({
            earth,
            moon,
            presentation,
            earthDayTexture,
            earthDayTextureBlend,
        });
    },
    applyComposerEarthshineGain(...args) {
        return applyComposerEarthshineGain.call(this, AUXILIARY_CAMERA_COMPOSER_LIGHTING_DEPENDENCIES, ...args);
    },
    applyComposerMoonshineGain(...args) {
        return applyComposerMoonshineGain.call(this, AUXILIARY_CAMERA_COMPOSER_LIGHTING_DEPENDENCIES, ...args);
    },
    updateBodyNorthWorld(...args) {
        return updateBodyNorthWorld.call(this, AUXILIARY_CAMERA_COMPOSER_LIGHTING_DEPENDENCIES, ...args);
    },
    computeComposerAutoFovDegrees(...args) {
        return computeComposerAutoFovDegrees.call(this, AUXILIARY_CAMERA_COMPOSER_LIGHTING_DEPENDENCIES, ...args);
    },
    setComposerLunarFeatureStackPosition(panelState, leftPx, topPx) {
        const stack = panelState?.composerLunarFeatureStack;
        const viewport = panelState?.viewport;
        if (!isDomInstance(stack, "HTMLElement") || !isDomInstance(viewport, "HTMLElement")) {
            return;
        }
        const viewportWidth = Math.max(1, viewport.clientWidth || 1);
        const viewportHeight = Math.max(1, viewport.clientHeight || 1);
        const stackWidth = Math.max(1, stack.offsetWidth || stack.getBoundingClientRect?.().width || 1);
        const stackHeight = Math.max(1, stack.offsetHeight || stack.getBoundingClientRect?.().height || 1);
        const maxLeft = Math.max(0, viewportWidth - stackWidth - 6);
        const maxTop = Math.max(6, viewportHeight - stackHeight - 6);
        const nextLeft = Math.min(maxLeft, Math.max(6, Number(leftPx)));
        const nextTop = Math.min(maxTop, Math.max(6, Number(topPx)));
        if (!Number.isFinite(nextLeft) || !Number.isFinite(nextTop)) {
            return;
        }
        panelState.composerLunarFeatureStackLeftPx = nextLeft;
        panelState.composerLunarFeatureStackTopPx = nextTop;
        stack.style.left = `${nextLeft}px`;
        stack.style.top = `${nextTop}px`;
        stack.style.right = "auto";
    },
    clampComposerLunarFeatureStackPosition(panelState) {
        if (
            !Number.isFinite(panelState?.composerLunarFeatureStackLeftPx) ||
            !Number.isFinite(panelState?.composerLunarFeatureStackTopPx)
        ) {
            return;
        }
        this.setComposerLunarFeatureStackPosition(
            panelState,
            panelState.composerLunarFeatureStackLeftPx,
            panelState.composerLunarFeatureStackTopPx,
        );
    },
    syncPanelSize(panelState) {
        // Keep target panels square; composer can use a wider rectangular layout.
        const isComposer = panelState.mode === "composer";
        const minSize = isComposer ? PANEL_MIN_SIDE_COMPOSER : PANEL_MIN_SIDE_DEFAULT;
        const panelWidth = Math.max(minSize, Math.floor(panelState.panel.clientWidth || 0));
        const panelHeight = Math.max(minSize, Math.floor(panelState.panel.clientHeight || 0));
        if (!isComposer) {
            const controlsDensity = (panelWidth >= 360 && panelHeight >= 280) ? "expanded" : "compact";
            if (panelState.panel.dataset.controlsDensity !== controlsDensity) panelState.panel.dataset.controlsDensity = controlsDensity;
        }
        if (!isComposer && panelWidth > 0 && Math.abs(panelWidth - panelHeight) > 1) {
            if (panelState.panel.style.height !== `${panelWidth}px`) panelState.panel.style.height = `${panelWidth}px`;
        }
        this.updateComposerControlsPopoverPosition(panelState);

        const width = Math.max(120, Math.floor(panelState.viewport.clientWidth));
        const height = Math.max(80, Math.floor(panelState.viewport.clientHeight));
        const changed = width !== panelState.width || height !== panelState.height;
        if (changed) {
            panelState.width = width;
            panelState.height = height;
            panelState.renderer.setSize(width, height, true);
            if (panelState.overlayCanvas) {
                panelState.overlayCanvas.width = width;
                panelState.overlayCanvas.height = height;
            }
            panelState.camera.aspect = width / height;
            if (panelState.camera.isOrthographicCamera) {
                const aspect = Math.max(width / Math.max(1, height), 1e-6);
                const halfHeight = Number.isFinite(panelState.orthographicHalfHeight) && panelState.orthographicHalfHeight > 0
                    ? panelState.orthographicHalfHeight
                    : 1;
                panelState.camera.left = -halfHeight * aspect;
                panelState.camera.right = halfHeight * aspect;
                panelState.camera.top = halfHeight;
                panelState.camera.bottom = -halfHeight;
            }
            panelState.camera.updateProjectionMatrix();
            panelState.overlayDirty = true;
        }
        if (isComposer) {
            this.clampComposerLunarFeatureStackPosition(panelState);
        }
        this.clampPanelPosition(panelState);
    },
    renderLayers(renderer, scene, camera, { renderSkyLayer = true } = {}) {
        if (renderSkyLayer) {
            renderer.autoClear = true;
            configureSkyRenderLayers(camera);
            renderer.render(scene, camera);

            renderer.autoClear = false;
            renderer.clearDepth();
        } else {
            renderer.autoClear = true;
        }

        configureBodyRenderLayers(camera);
        renderer.render(scene, camera);
        renderer.autoClear = false;
        configureCraftRenderLayers(camera);
        renderer.render(scene, camera);
    },
    renderLayersWithLunarCraterVisibility(renderer, scene, camera, options = {}) {
        const fallbackState = createDefaultLunarFeatureViewState({
            viewLunarCraters: options.lunarCratersVisible === true,
        });
        renderWithLunarCraterView({
            viewId: options.lunarCraterViewId,
            viewState: options.lunarCraterViewState || fallbackState,
            animationScene: options.animationScene || null,
            scene,
            camera,
            rendererDomElement: renderer?.domElement || null,
            pointer: options.lunarCraterPointer || null,
            freezeLabelScale: options.freezeLunarCraterLabelScale === true,
            render: () => {
                this.renderLayers(renderer, scene, camera, options);
            },
        });
    },
    renderComposerLayers(panelState, scene, options = {}) {
        const fallbackState = createDefaultLunarFeatureViewState({
            viewLunarCraters: panelState.composerLunarCratersEnabled === true,
        });
        const activeCatalogNames = panelState.composerLunarFeatureSyncedEnabled !== false &&
            Array.isArray(panelState.composerLunarFeatureMentionView?.activeCatalogNames)
            ? panelState.composerLunarFeatureMentionView.activeCatalogNames
            : [];
        const composerLunarCraterState = panelState.composerLunarCraterState || fallbackState;
        const injectedLunarFeatureState = activeCatalogNames.length > 0
            ? {
                ...composerLunarCraterState,
                viewLunarCraters: true,
                lunarFeaturePinnedNames: activeCatalogNames,
                lunarCraterHoverLabels: true,
            }
            : composerLunarCraterState;
        renderWithSurfacePointView({
            animationScene: options.animationScene || null,
            viewState: panelState.composerSurfacePointState || createDefaultSurfacePointViewState(),
            render: () => {
                this.renderLayersWithLunarCraterVisibility(panelState.renderer, scene, panelState.camera, {
                    ...options,
                    lunarCraterViewId: LUNAR_CRATER_VIEW_IDS.FRAME_AND_SHOOT,
                    lunarCraterViewState: injectedLunarFeatureState,
                    lunarCraterPointer: panelState.composerLunarCraterPointer,
                    freezeLunarCraterLabelScale: panelState.composerViewportPointer != null,
                });
            },
        });
    },
    renderAuxiliaryPanelLayers(panelState, scene, options = {}) {
        this.renderLayersWithLunarCraterVisibility(panelState.renderer, scene, panelState.camera, {
            ...options,
            lunarCraterViewId: panelState.lunarCraterViewId || null,
            lunarCraterViewState: panelState.lunarCraterViewState,
        });
    },
    requestComposerCoronaAnimationFrame() {
        if (this.composerCoronaAnimationRaf != null || !this.requestRender) {
            return;
        }
        this.composerCoronaAnimationRaf = requestAnimationFrame(() => {
            this.composerCoronaAnimationRaf = null;
            this.requestRender?.();
        });
    },
    resolveComposerSolarEclipseState(...args) {
        return resolveComposerSolarEclipseState.call(this, AUXILIARY_CAMERA_COMPOSER_LIGHTING_DEPENDENCIES, ...args);
    },
    resolveComposerEclipseCoronaVisualState(...args) {
        return resolveComposerEclipseCoronaVisualState.call(this, AUXILIARY_CAMERA_COMPOSER_LIGHTING_DEPENDENCIES, ...args);
    },
    resolveComposerSunOpticsProfile(...args) {
        return resolveComposerSunOpticsProfile.call(this, AUXILIARY_CAMERA_COMPOSER_LIGHTING_DEPENDENCIES, ...args);
    },
    resolveComposerExposureState(...args) {
        return resolveComposerExposureState.call(this, AUXILIARY_CAMERA_COMPOSER_LIGHTING_DEPENDENCIES, ...args);
    },
    resolveComposerBodyDiscInView(...args) {
        return resolveComposerBodyDiscInView.call(this, AUXILIARY_CAMERA_COMPOSER_LIGHTING_DEPENDENCIES, ...args);
    },
    shouldApplyComposerEclipseAutoExposure(panelState, {
        eclipseState,
        earthWorld,
        earthRadius,
        moonWorld,
        moonRadius,
    } = {}) {
        const occluder = eclipseState?.active === true
            ? String(eclipseState?.occluder || "").toLowerCase()
            : "";
        if (occluder === "earth") {
            return this.resolveComposerBodyDiscInView(panelState, {
                bodyWorld: earthWorld,
                bodyRadius: earthRadius,
            });
        }
        if (occluder !== "moon") {
            return false;
        }
        return this.resolveComposerBodyDiscInView(panelState, {
            bodyWorld: moonWorld,
            bodyRadius: moonRadius,
        });
    },
    applyComposerExposureProfile(...args) {
        return applyComposerExposureProfile.call(this, AUXILIARY_CAMERA_COMPOSER_LIGHTING_DEPENDENCIES, ...args);
    },
    clearPanelOverlay(panelState) {
        return clearAuxiliaryPanelOverlay.call(this, panelState, AUXILIARY_CAMERA_OVERLAY_DEPENDENCIES);
    },
    renderComposerRaDecGridOverlay(panelState) {
        return renderComposerRaDecGridOverlay.call(this, panelState, AUXILIARY_CAMERA_OVERLAY_DEPENDENCIES);
    },
    renderComposerSkyLabelOverlay(panelState, options = {}) {
        return renderComposerSkyLabelOverlay.call(this, panelState, options, AUXILIARY_CAMERA_OVERLAY_DEPENDENCIES);
    },
    renderMoonFarSideOverlay(panelState, options) {
        return renderMoonFarSideOverlay.call(this, panelState, options, AUXILIARY_CAMERA_OVERLAY_DEPENDENCIES);
    },
    renderComposerMoonOutlineOverlay(panelState, options) {
        return renderComposerMoonOutlineOverlay.call(this, panelState, options, AUXILIARY_CAMERA_OVERLAY_DEPENDENCIES);
    },
    renderComposerSeeThroughOverlay(panelState, options = {}) {
        return renderComposerSeeThroughOverlay.call(this, panelState, options, AUXILIARY_CAMERA_OVERLAY_DEPENDENCIES);
    },
    renderComposerBottomMetricsOverlay(panelState, options = {}) {
        return renderComposerBottomMetricsOverlay.call(this, panelState, options, AUXILIARY_CAMERA_OVERLAY_DEPENDENCIES);
    },
    suppressLinePrimitives(scene) {
        const hiddenEntries = [];
        scene?.traverse?.((object) => {
            if (!object?.visible) {
                return;
            }
            if (!object.isLine && !object.isLineLoop && !object.isLineSegments) {
                return;
            }
            hiddenEntries.push({
                object,
                visible: object.visible,
            });
            object.visible = false;
        });
        return hiddenEntries;
    },
    suppressCraftVisuals({ activeCraft, craftsById, dronesById } = {}) {
        const hiddenEntries = [];
        const seen = new Set();
        const hideObject = (object) => {
            if (!object || seen.has(object)) {
                return;
            }
            seen.add(object);
            if (!object.visible) {
                return;
            }
            hiddenEntries.push({ object, visible: object.visible });
            object.visible = false;
        };

        hideObject(activeCraft);
        for (const craft of Object.values(craftsById || {})) {
            hideObject(craft);
        }
        for (const drone of Object.values(dronesById || {})) {
            hideObject(drone);
        }

        return hiddenEntries;
    },
    restoreVisibility(entries) {
        for (const entry of entries || []) {
            entry.object.visible = entry.visible;
        }
    },
    estimateCraftRadius(activeCraft) {
        if (!activeCraft) {
            return 1;
        }

        this.boundingBox.setFromObject(activeCraft);
        if (this.boundingBox.isEmpty()) {
            return 1;
        }

        this.boundingBox.getBoundingSphere(this.boundingSphere);
        const radius = this.boundingSphere.radius;
        return Number.isFinite(radius) && radius > 0 ? radius : 1;
    },
    estimateObjectRadius(object, fallbackRadius = 1) {
        if (!object) {
            return fallbackRadius;
        }
        this.boundingBox.setFromObject(object);
        if (this.boundingBox.isEmpty()) {
            return fallbackRadius;
        }
        this.boundingBox.getBoundingSphere(this.boundingSphere);
        const radius = this.boundingSphere.radius;
        return Number.isFinite(radius) && radius > 0 ? radius : fallbackRadius;
    },
    computeAutoFovDegrees({ distanceToTarget, targetRadius, aspect }) {
        if (!Number.isFinite(distanceToTarget) || distanceToTarget <= 0) {
            return null;
        }

        const radius = Number.isFinite(targetRadius) && targetRadius > 0 ? targetRadius : 1;
        const fitRadius = radius * AUTO_FOV_MARGIN_SCALE;
        const safeDistance = Math.max(distanceToTarget, fitRadius + 1e-9);
        const ratio = Math.min(fitRadius / safeDistance, 0.999999);
        const angularRadius = Math.asin(ratio);
        const safeAspect = Math.max(aspect || 1, 1e-3);
        const verticalFromHeight = 2 * angularRadius;
        const verticalFromWidth = 2 * Math.atan(Math.tan(angularRadius) / safeAspect);
        const requiredVerticalRadians = Math.max(verticalFromHeight, verticalFromWidth);
        return this.THREE.MathUtils.radToDeg(requiredVerticalRadians);
    },
    clampAutoFovDegrees(panelState, requestedDegrees) {
        const isComposer = panelState?.mode === "composer";
        const isMoonTargetPanel = panelState?.targetKey === "moon" && panelState?.mode !== "composer";
        return clampFovDegrees(requestedDegrees, {
            minDegrees: isComposer
                ? COMPOSER_AUTO_FOV_MIN_DEGREES
                : (isMoonTargetPanel ? MOON_TARGET_AUTO_FOV_MIN_DEGREES : TARGET_AUTO_FOV_MIN_DEGREES),
            maxDegrees: isComposer ? COMPOSER_AUTO_FOV_MAX_DEGREES : TARGET_AUTO_FOV_MAX_DEGREES,
            fallbackDegrees: panelState?.camera?.fov || panelState?.orbitZoomFovDegrees || 45,
        });
    },
    applyEclipticNorthUp(camera, lookTarget) {
        if (!camera || !lookTarget) return;
        const worldNorth = this.viewDir.set(0, 0, 1);
        const cameraToTarget = this.cameraOffset.copy(lookTarget).sub(camera.position);
        if (cameraToTarget.lengthSq() < 1e-18) {
            camera.up.set(0, 0, 1);
            return;
        }
        cameraToTarget.normalize();
        this.projectedUp
            .copy(worldNorth)
            .addScaledVector(cameraToTarget, -worldNorth.dot(cameraToTarget));
        if (this.projectedUp.lengthSq() < 1e-8) {
            camera.up.set(1, 0, 0);
            return;
        }
        camera.up.copy(this.projectedUp.normalize());
    },
    createFibonacciSphereSamples(count = 720) {
        const sampleCount = Math.max(64, Math.floor(count));
        const points = new Float32Array(sampleCount * 3);
        const golden = Math.PI * (3 - Math.sqrt(5));
        for (let i = 0; i < sampleCount; i += 1) {
            const y = 1 - (2 * (i + 0.5)) / sampleCount;
            const radius = Math.sqrt(Math.max(0, 1 - y * y));
            const theta = golden * i;
            points[i * 3] = Math.cos(theta) * radius;
            points[i * 3 + 1] = y;
            points[i * 3 + 2] = Math.sin(theta) * radius;
        }
        return points;
    },
    getObjectWorldPosition(object, outVector) {
        if (!object || !outVector) return false;
        object.getWorldPosition(outVector);
        return Number.isFinite(outVector.x) && Number.isFinite(outVector.y) && Number.isFinite(outVector.z);
    },
    resolvePositionForKey(key, context, outVector) {
        if (!outVector) return false;
        if (key === "craft") {
            return this.getObjectWorldPosition(context.activeCraft, outVector);
        }
        if (key === "earth") {
            return this.getObjectWorldPosition(context.earth, outVector);
        }
        if (key === "moon") {
            return this.getObjectWorldPosition(context.moon, outVector);
        }
        if (key === "sun") {
            return this.getObjectWorldPosition(context.sun, outVector);
        }
        return false;
    },
    vectorFromSunDirection(outVector, mode = "earth") {
        const pickSource = () => {
            if (mode === "moon") {
                return this.sunDirectionMoonWorld;
            }
            if (mode === "craft") {
                return this.sunDirectionCraftWorld;
            }
            return this.sunDirectionEarthWorld;
        };
        const source = pickSource();
        if (
            Number.isFinite(source?.x) &&
            Number.isFinite(source?.y) &&
            Number.isFinite(source?.z)
        ) {
            const len = source.length();
            if (len > 1e-12) {
                outVector.copy(source).multiplyScalar(1 / len);
                return true;
            }
        }
        return false;
    },
    resolveSunDirectionForPanel(panelState) {
        if (!panelState) {
            return this.sunDirectionEarthWorld;
        }
        if (panelState.anchorKey === "craft" || panelState.mode === "composer") {
            return this.sunDirectionCraftWorld;
        }
        if (panelState.targetKey === "moon" || panelState.anchorKey === "moon") {
            return this.sunDirectionMoonWorld;
        }
        return this.sunDirectionEarthWorld;
    },
    computeOrbitPlaneHalfHeight(...args) {
        return computeOrbitPlaneHalfHeight.call(this, AUXILIARY_CAMERA_ORBIT_PLANE_DEPENDENCIES, ...args);
    },
    createOrbitPlaneProjector(...args) {
        return createOrbitPlaneProjector.call(this, AUXILIARY_CAMERA_ORBIT_PLANE_DEPENDENCIES, ...args);
    },
    drawOrbitPlaneMarker(...args) {
        return drawOrbitPlaneMarker.call(this, AUXILIARY_CAMERA_ORBIT_PLANE_DEPENDENCIES, ...args);
    },
    drawOrbitPlaneLineObject(...args) {
        return drawOrbitPlaneLineObject.call(this, AUXILIARY_CAMERA_ORBIT_PLANE_DEPENDENCIES, ...args);
    },
    resolveOrbitPlaneCurveBodyIds(...args) {
        return resolveOrbitPlaneCurveBodyIds.call(this, AUXILIARY_CAMERA_ORBIT_PLANE_DEPENDENCIES, ...args);
    },
    resolveOrbitPlaneCurveStroke(...args) {
        return resolveOrbitPlaneCurveStroke.call(this, AUXILIARY_CAMERA_ORBIT_PLANE_DEPENDENCIES, ...args);
    },
    drawOrbitPlaneCurve(...args) {
        return drawOrbitPlaneCurve.call(this, AUXILIARY_CAMERA_ORBIT_PLANE_DEPENDENCIES, ...args);
    },
    drawOrbitPlaneCurvesFromSceneData(...args) {
        return drawOrbitPlaneCurvesFromSceneData.call(this, AUXILIARY_CAMERA_ORBIT_PLANE_DEPENDENCIES, ...args);
    },
    renderOrbitPlane2DOverlay(...args) {
        return renderOrbitPlane2DOverlay.call(this, AUXILIARY_CAMERA_ORBIT_PLANE_DEPENDENCIES, ...args);
    },
    renderOrbitPlanePanel(...args) {
        return renderOrbitPlanePanel.call(this, AUXILIARY_CAMERA_ORBIT_PLANE_DEPENDENCIES, ...args);
    },
    computeMoonPhaseInfo(...args) {
        return computeMoonPhaseInfo.call(this, ...args);
    },
    resolveMoonPhaseName(...args) {
        return resolveMoonPhaseName.call(this, ...args);
    },
    roundPercentParts(...args) {
        return roundPercentParts.call(this, ...args);
    },
    computeCraftMoonVisibilityInfo(...args) {
        return computeCraftMoonVisibilityInfo.call(this, ...args);
    },
    setPanelFov(panelState, requestedDegrees) {
        if (panelState?.camera?.isOrthographicCamera) {
            const fovDegrees = clampFovDegrees(requestedDegrees, {
                minDegrees: panelState.fovMinDegrees ?? AUTO_FOV_MIN_DEGREES,
                maxDegrees: panelState.fovMaxDegrees ?? AUTO_FOV_MAX_DEGREES,
                fallbackDegrees: panelState.orbitZoomFovDegrees || panelState.camera.fov || 45,
            });
            panelState.orbitZoomFovDegrees = fovDegrees;
            panelState.fovControl?.setFovDegrees(fovDegrees, fovDegrees);
            return;
        }
        if (!Number.isFinite(requestedDegrees)) {
            return;
        }

        const minDegrees = Number.isFinite(panelState.fovMinDegrees)
            ? panelState.fovMinDegrees
            : AUTO_FOV_MIN_DEGREES;
        const defaultMaxDegrees = panelState.mode === "composer"
            ? COMPOSER_MANUAL_FOV_MAX_DEGREES
            : AUTO_FOV_MAX_DEGREES;
        const maxDegrees = Number.isFinite(panelState.fovMaxDegrees)
            ? panelState.fovMaxDegrees
            : defaultMaxDegrees;
        const fovDegrees = clampFovDegrees(requestedDegrees, {
            minDegrees,
            maxDegrees,
            fallbackDegrees: panelState.camera.fov,
        });

        if (Math.abs(panelState.camera.fov - fovDegrees) > 1e-4) {
            panelState.camera.fov = fovDegrees;
            panelState.camera.updateProjectionMatrix();
            panelState.overlayDirty = true;
        }

        panelState.fovControl?.setFovDegrees(fovDegrees, panelState.camera.fov);
    },
    applyOrbitPlaneAutoFit(panelState) {
        if (!panelState || panelState.mode !== "orbit-xy") {
            return false;
        }
        panelState.orbitPanOffsetX = 0;
        panelState.orbitPanOffsetY = 0;
        this.setPanelFov(panelState, ORBIT_XY_AUTO_FOV_DEGREES);
        return true;
    },
    setComposerLockTarget(panelState, target, {
        syncComposerLockUi = null,
        syncAutoToggleUi = null,
        forceAuto = false,
        activateIfDisabled = true,
        persist = true,
    } = {}) {
        if (!panelState || panelState.mode !== "composer") {
            return false;
        }
        const previousTarget = panelState.composerLockTarget || "none";
        if (activateIfDisabled && panelState.composerInteractionEnabled !== true) {
            this.activateComposerWindow(panelState, { finalize: true });
        }
        const result = resolveComposerViewIntent(this.readComposerViewState(panelState), {
            type: "lock-target",
            target,
            forceAuto,
        });
        const nextTarget = result.state.lockTarget;
        const targetChanged = nextTarget !== previousTarget;
        const shouldSyncAuto = nextTarget === "none"
            ? targetChanged
            : (targetChanged || forceAuto === true);
        return this.applyComposerViewState(panelState, result.state, {
            syncComposerLockUi,
            syncAutoToggleUi: shouldSyncAuto ? syncAutoToggleUi : null,
            persist,
        });
    },
};
