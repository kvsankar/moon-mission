import { getSceneCraftObject } from "./scene-craft-helpers.js";
import { AuxiliaryCameraViewsManager } from "./auxiliary-camera-views.js";
import { DesktopPanelManager } from "./panel-manager.js";
import {
    configureBodyRenderLayers,
    configureCraftRenderLayers,
    configureSkyRenderLayers,
} from "./scene-render-layers.js";
import {
    applyPhotoModeBodyPresentation,
    applyPhotoModeExposure,
    resolvePhotoModeLightingPresentation,
} from "./photo-mode-render-presentation.js";

function createSceneHandlerClass(deps) {
    const {
        THREE,
        d3,
        bindSettingsPanel,
        initSceneHandlerDom,
        computeSVGDimensions,
        getSvgWidth,
        getSvgHeight,
        isTestMode,
        onWindowResize,
        updateCraftScale,
        getRuntimeState,
        getViewEarthClouds = null,
        setViewEarthClouds = null,
    } = deps;

    return class SceneHandler {
        constructor() {
            this.scene = null;
            this.renderer = null;
            this.canvasNode = null;
            this.auxiliaryCameraViews = null;
            this.auxiliaryCameraViewsInitializing = false;
            this.desktopPanelManager = null;
            this.initialized = false;
            this.lastAnimationScene = null;
            this.auxiliaryCameraRenderRaf = null;
            this.lookAtWorldTarget = new THREE.Vector3();
            this.skyWorldPosition = new THREE.Vector3();
            this.sunWorldPosition = new THREE.Vector3();
            this.mainCameraWorldPosition = new THREE.Vector3();
            this.earthWorldPosition = new THREE.Vector3();
            this.moonWorldPosition = new THREE.Vector3();
            this.earthCloudsEnabled = true;
            this.lunarCraterHoverRenderRaf = null;
            this.lunarCraterLabelScaleFrozen = false;
            this.handleLunarCraterPointerMoveBound = this.handleLunarCraterPointerMove.bind(this);
            this.handleLunarCraterPointerLeaveBound = this.handleLunarCraterPointerLeave.bind(this);
            this.handleLunarCraterPointerDownBound = this.handleLunarCraterPointerDown.bind(this);
            this.handleLunarCraterPointerUpBound = this.handleLunarCraterPointerUp.bind(this);
            this.handleOrbitMilestonePointerClickBound = this.handleOrbitMilestonePointerClick.bind(this);

            this.init();
        }

        init() {
            if (this.initialized) {
                return;
            }

            const { renderer, canvasNode } = initSceneHandlerDom({
                d3,
                bindSettingsPanel,
                computeSVGDimensions,
                getSvgWidth,
                getSvgHeight,
                isTestMode,
                onWindowResize,
                THREE,
            });
            this.renderer = renderer;
            this.canvasNode = canvasNode;
            this.bindLunarCraterHoverEvents();

            if (!isTestMode && window.innerWidth > 600) {
                const overlayHost = document.getElementById("content-wrapper") ||
                    document.getElementById("wrapper") ||
                    document.body;
                this.desktopPanelManager = new DesktopPanelManager({
                    overlayHost,
                });
            }

            this.initialized = true;
        }

        getPointerEventTarget() {
            return this.renderer?.domElement || this.canvasNode || null;
        }

        scheduleLunarCraterHoverRender() {
            if (!this.lastAnimationScene || this.lunarCraterHoverRenderRaf != null) {
                return;
            }
            const scheduleFrame = typeof window !== "undefined" && typeof window.requestAnimationFrame === "function"
                ? window.requestAnimationFrame.bind(window)
                : (callback) => setTimeout(callback, 0);
            this.lunarCraterHoverRenderRaf = scheduleFrame(() => {
                this.lunarCraterHoverRenderRaf = null;
                if (this.lastAnimationScene) {
                    this.render(this.lastAnimationScene);
                }
            });
        }

        handleLunarCraterPointerMove(event) {
            const animationScene = this.lastAnimationScene;
            if (!animationScene?.camera) return;
            const pointerInput = {
                camera: animationScene.camera,
                rendererDomElement: this.getPointerEventTarget(),
                clientX: event?.clientX,
                clientY: event?.clientY,
            };
            const craterChanged = animationScene.updateLunarCraterHoverFromPointer?.(pointerInput) === true;
            const milestoneChanged = animationScene.updateOrbitMilestoneHoverFromPointer?.(pointerInput) === true;
            const earthCoordinateChanged = animationScene.updateEarthLatLonHoverFromPointer?.(pointerInput) === true;
            const moonCoordinateChanged = animationScene.updateMoonLatLonHoverFromPointer?.(pointerInput) === true;
            const changed = craterChanged || milestoneChanged || earthCoordinateChanged || moonCoordinateChanged;
            if (changed) {
                this.scheduleLunarCraterHoverRender();
            }
        }

        handleLunarCraterPointerLeave() {
            const animationScene = this.lastAnimationScene;
            const changed = (animationScene?.clearLunarCraterHover?.() === true)
                || (animationScene?.clearOrbitMilestoneHover?.() === true)
                || (animationScene?.clearEarthLatLonHover?.() === true)
                || (animationScene?.clearMoonLatLonHover?.() === true);
            if (changed) {
                this.scheduleLunarCraterHoverRender();
            }
        }

        handleOrbitMilestonePointerClick(event) {
            if (event?.button != null && event.button !== 0) {
                return;
            }
            if (this.lastAnimationScene?.selectHoveredOrbitMilestone?.() === true) {
                event?.preventDefault?.();
            }
        }

        handleLunarCraterPointerDown(event) {
            if (event?.button != null && event.button !== 0) {
                return;
            }
            this.lunarCraterLabelScaleFrozen = true;
        }

        handleLunarCraterPointerUp() {
            if (!this.lunarCraterLabelScaleFrozen) {
                return;
            }
            this.lunarCraterLabelScaleFrozen = false;
            this.scheduleLunarCraterHoverRender();
        }

        bindLunarCraterHoverEvents() {
            const target = this.getPointerEventTarget();
            if (!target?.addEventListener) {
                return;
            }
            target.addEventListener("pointermove", this.handleLunarCraterPointerMoveBound, {
                passive: true,
            });
            target.addEventListener("pointerleave", this.handleLunarCraterPointerLeaveBound);
            target.addEventListener("pointerdown", this.handleLunarCraterPointerDownBound, {
                passive: true,
            });
            target.addEventListener("click", this.handleOrbitMilestonePointerClickBound);
            const windowRef = typeof window !== "undefined" ? window : null;
            windowRef?.addEventListener?.("pointerup", this.handleLunarCraterPointerUpBound, {
                passive: true,
            });
            windowRef?.addEventListener?.("pointercancel", this.handleLunarCraterPointerUpBound, {
                passive: true,
            });
        }

        ensureAuxiliaryCameraViews() {
            if (this.auxiliaryCameraViews || this.auxiliaryCameraViewsInitializing || isTestMode || window.innerWidth <= 600) {
                return this.auxiliaryCameraViews;
            }

            const overlayHost = document.getElementById("content-wrapper") ||
                document.getElementById("wrapper") ||
                document.body;
            const pendingManager = {
                render() {},
                dispose() {},
            };
            this.auxiliaryCameraViewsInitializing = true;
            this.auxiliaryCameraViews = pendingManager;
            try {
                const manager = new AuxiliaryCameraViewsManager({
                    THREE,
                    overlayHost,
                    getEarthCloudsEnabled: () => {
                        if (typeof getViewEarthClouds === "function") {
                            return getViewEarthClouds();
                        }
                        const runtimeClouds = getRuntimeState?.().viewEarthClouds;
                        return runtimeClouds === false ? false : this.earthCloudsEnabled !== false;
                    },
                    setEarthCloudsEnabled: (value) => {
                        this.earthCloudsEnabled = value !== false;
                        if (typeof setViewEarthClouds === "function") {
                            return setViewEarthClouds(value);
                        }
                        if (this.lastAnimationScene) {
                            this.render(this.lastAnimationScene);
                        }
                        return this.earthCloudsEnabled;
                    },
                    requestRender: () => {
                        if (!this.lastAnimationScene || this.auxiliaryCameraRenderRaf != null) {
                            return;
                        }
                        const scheduleFrame = typeof window !== "undefined" && typeof window.requestAnimationFrame === "function"
                            ? window.requestAnimationFrame.bind(window)
                            : (callback) => setTimeout(callback, 0);
                        this.auxiliaryCameraRenderRaf = scheduleFrame(() => {
                            this.auxiliaryCameraRenderRaf = null;
                            if (this.lastAnimationScene) {
                                this.render(this.lastAnimationScene);
                            }
                        });
                    },
                });
                this.auxiliaryCameraViews = manager;
                return manager;
            } finally {
                this.auxiliaryCameraViewsInitializing = false;
                if (this.auxiliaryCameraViews === pendingManager) {
                    this.auxiliaryCameraViews = null;
                }
            }
        }

        render(animationScene) {
            if (!animationScene?.initialized3D) {
                return;
            }

            const renderWithCamera = (camera) => {
                if (!camera) return;
                camera.updateMatrixWorld?.();
                if (animationScene.skyContainer?.position) {
                    this.skyWorldPosition.setFromMatrixPosition(camera.matrixWorld);
                    if (animationScene.skyContainer.parent?.worldToLocal) {
                        animationScene.skyContainer.parent.worldToLocal(this.skyWorldPosition);
                    }
                    animationScene.skyContainer.position.copy(this.skyWorldPosition);
                }
                if (animationScene.sunRenderer?.setReferencePosition) {
                    this.sunWorldPosition.setFromMatrixPosition(camera.matrixWorld);
                    const sunParent = animationScene.sunRenderer.group?.parent;
                    if (sunParent?.worldToLocal) {
                        sunParent.worldToLocal(this.sunWorldPosition);
                    }
                    animationScene.sunRenderer.setReferencePosition(
                        this.sunWorldPosition.x,
                        this.sunWorldPosition.y,
                        this.sunWorldPosition.z,
                    );
                }
                animationScene.updateLunarCraterLabelScales?.({
                    camera,
                    rendererDomElement: this.renderer?.domElement || null,
                    freezeScale: this.lunarCraterLabelScaleFrozen === true,
                });
                animationScene.updateEarthLatLonGridForCamera?.({
                    camera,
                    rendererDomElement: this.renderer?.domElement || null,
                });
                animationScene.updateMoonLatLonGridForCamera?.({
                    camera,
                    rendererDomElement: this.renderer?.domElement || null,
                });
                // Render sky first on its dedicated layer, then clear depth so
                // foreground bodies fully occlude background stars.
                const renderSkyLayer = animationScene.skyContainer?.visible !== false;
                if (renderSkyLayer) {
                    this.renderer.autoClear = true;
                    configureSkyRenderLayers(camera);
                    this.renderer.render(animationScene.scene, camera);
                    this.renderer.autoClear = false;
                    this.renderer.clearDepth();
                } else {
                    this.renderer.autoClear = true;
                }

                configureBodyRenderLayers(camera);
                this.renderer.render(animationScene.scene, camera);

                this.renderer.autoClear = false;
                configureCraftRenderLayers(camera);
                this.renderer.render(animationScene.scene, camera);
            };
            const setSunDirectionForView = (mode = "earth") => {
                const sunRenderer = animationScene.sunRenderer;
                if (!sunRenderer?.setDirection) {
                    return;
                }
                const directions = animationScene.stateSunDirections || null;
                const chosen = mode === "craft"
                    ? (directions?.craftCenteredLightTime || directions?.craftCentered || directions?.earthCentered || animationScene.stateSunDirection)
                    : (directions?.earthCentered || animationScene.stateSunDirection);
                if (
                    chosen &&
                    Number.isFinite(chosen.x) &&
                    Number.isFinite(chosen.y) &&
                    Number.isFinite(chosen.z)
                ) {
                    sunRenderer.setDirection(chosen.x, chosen.y, chosen.z);
                }
            };

            const previousRenderedScene = this.lastAnimationScene;
            if (
                previousRenderedScene &&
                previousRenderedScene !== animationScene &&
                previousRenderedScene.sceneHelpers?.updateBodyHalos
            ) {
                previousRenderedScene.sceneHelpers.updateBodyHalos({ visible: false });
            }

            this.lastAnimationScene = animationScene;

            const {
                globalConfig,
                joyRideFlag,
                landingFlag,
                viewPhotoMode,
                viewEarthClouds,
                viewAuxiliaryPanels,
                earthRadius,
                moonRadius,
                timelineEventInfos,
            } = getRuntimeState();
            const auxiliaryCameraViews = viewAuxiliaryPanels
                ? this.ensureAuxiliaryCameraViews()
                : this.auxiliaryCameraViews;
            const effectiveEarthClouds = typeof getViewEarthClouds === "function"
                ? getViewEarthClouds() !== false
                : (viewEarthClouds === false ? false : this.earthCloudsEnabled !== false);
            const renderSceneCamera = (camera) => {
                if (!camera) {
                    return;
                }
                this.mainCameraWorldPosition.setFromMatrixPosition(camera.matrixWorld);
                animationScene.earthContainer?.getWorldPosition?.(this.earthWorldPosition);
                animationScene.moonContainer?.getWorldPosition?.(this.moonWorldPosition);
                const photoModePresentation = resolvePhotoModeLightingPresentation({
                    enabled: viewPhotoMode,
                    cameraPosition: this.mainCameraWorldPosition,
                    earthPosition: this.earthWorldPosition,
                    earthRadius,
                    moonPosition: this.moonWorldPosition,
                    moonRadius,
                });
                const restorePhotoModeBodyPresentation = applyPhotoModeBodyPresentation({
                    earth: animationScene.earthContainer,
                    moon: animationScene.moonContainer,
                    presentation: photoModePresentation,
                    earthDayTexture: animationScene.earthPhotoTexture || null,
                    earthDayTextureBlend: effectiveEarthClouds ? null : 0,
                });
                const restoreSharedBodyAmbient = auxiliaryCameraViews
                    ?.applySharedComposerBodyAmbientLighting
                    ?.({
                        earth: animationScene.earthContainer,
                        moon: animationScene.moonContainer,
                    }) || (() => {});
                const restorePhotoModeExposure = applyPhotoModeExposure({
                    renderer: this.renderer,
                    presentation: photoModePresentation,
                });
                try {
                    renderWithCamera(camera);
                } finally {
                    restorePhotoModeExposure();
                    restoreSharedBodyAmbient();
                    restorePhotoModeBodyPresentation();
                }
            };

            updateCraftScale();
            const activeCraft =
                getSceneCraftObject(animationScene, globalConfig) ||
                animationScene.craft ||
                Object.values(animationScene.craftsById || {})[0] ||
                null;
            if (!activeCraft) {
                animationScene.refreshBodyHalos?.({ suppress: false });
                setSunDirectionForView("earth");
                renderSceneCamera(animationScene.camera);
                if (viewAuxiliaryPanels) {
                    animationScene.refreshBodyHalos?.({ suppress: true });
                }
                auxiliaryCameraViews?.render({
                    animationScene,
                    scene: animationScene.scene,
                    skyRenderer: animationScene.skyRenderer,
                    latestSceneState: animationScene.latestSceneState || null,
                    activeCraft: null,
                    craftsById: animationScene.craftsById,
                    dronesById: animationScene.dronesById,
                    earth: animationScene.earthContainer,
                    moon: animationScene.moonContainer,
                    sun: animationScene.sun,
                    sunRenderer: animationScene.sunRenderer,
                    sunDirection: animationScene.stateSunDirection,
                    sunDirections: animationScene.stateSunDirections,
                    skyContainer: animationScene.skyContainer,
                    earthRadius,
                    moonRadius,
                    timelineEventInfos,
                    referenceCamera: animationScene.camera,
                    panelsVisible: viewAuxiliaryPanels,
                    missionConfig: globalConfig,
                    photoModeEnabled: viewPhotoMode,
                    earthCloudsEnabled: effectiveEarthClouds,
                    earthPhotoTexture: animationScene.earthPhotoTexture || null,
                });
                if (viewAuxiliaryPanels) {
                    animationScene.refreshBodyHalos?.({ suppress: false });
                }
                return;
            }

            if (animationScene.lockOnEarth || (globalConfig && globalConfig.is_lunar && animationScene.lockOnMoon)) {
                const x = animationScene.secondaryBody3D.position.x;
                const y = animationScene.secondaryBody3D.position.y;
                const z = animationScene.secondaryBody3D.position.z;
                animationScene.motherContainer.position.set(-x, -y, -z);
            } else if (animationScene.lockOnSC) {
                const x = activeCraft.position.x;
                const y = activeCraft.position.y;
                const z = activeCraft.position.z;
                animationScene.motherContainer.position.set(-x, -y, -z);
            } else {
                animationScene.motherContainer.position.set(0, 0, 0);
            }

            if (animationScene.cameraController?.updateFromTo) {
                animationScene.cameraController.updateFromTo({
                    earth: animationScene.earthContainer,
                    moon: animationScene.moonContainer,
                    spacecraft: activeCraft,
                });
            }

            const usingSpecialCamera = joyRideFlag || landingFlag;
            animationScene.refreshBodyHalos?.({ suppress: false });

            if (usingSpecialCamera) {
                const craftEarthDistance = activeCraft.position.distanceTo(animationScene.earthContainer.position);
                const craftMoonDistance = (globalConfig && globalConfig.is_lunar && animationScene.moonContainer)
                    ? activeCraft.position.distanceTo(animationScene.moonContainer.position)
                    : Infinity;
                const earthAngleRads = Math.asin(earthRadius / craftEarthDistance);
                const moonAngleRads = Math.asin(moonRadius / craftMoonDistance);

                let closerBody;
                let closerAngleRads;
                let radius;
                let distance;
                if (craftEarthDistance < craftMoonDistance) {
                    closerBody = animationScene.earthContainer;
                    closerAngleRads = earthAngleRads;
                    distance = craftEarthDistance;
                    radius = earthRadius;
                } else {
                    closerBody = animationScene.moonContainer;
                    closerAngleRads = moonAngleRads;
                    distance = craftMoonDistance;
                    radius = moonRadius;
                }

                // Keep mounted/special cameras north-up in J2000 ecliptic frame.
                animationScene.craftCamera.up.set(0, 0, 1);
                animationScene.droneCamera.up.set(0, 0, 1);

                animationScene.craftCamera.lookAt(closerBody.position);
                animationScene.droneCamera.lookAt(activeCraft.position);

                const specialCamera = joyRideFlag ? animationScene.craftCamera : animationScene.droneCamera;
                if (specialCamera) {
                    setSunDirectionForView(joyRideFlag ? "craft" : "earth");
                    renderSceneCamera(specialCamera);
                } else {
                    setSunDirectionForView("earth");
                    renderSceneCamera(animationScene.camera);
                }
            } else {
                setSunDirectionForView("earth");
                renderSceneCamera(animationScene.camera);
            }

            if (viewAuxiliaryPanels) {
                animationScene.refreshBodyHalos?.({ suppress: true });
            }
            auxiliaryCameraViews?.render({
                animationScene,
                scene: animationScene.scene,
                skyRenderer: animationScene.skyRenderer,
                latestSceneState: animationScene.latestSceneState || null,
                activeCraft,
                craftsById: animationScene.craftsById,
                dronesById: animationScene.dronesById,
                earth: animationScene.earthContainer,
                moon: animationScene.moonContainer,
                sun: animationScene.sun,
                sunRenderer: animationScene.sunRenderer,
                sunDirection: animationScene.stateSunDirection,
                sunDirections: animationScene.stateSunDirections,
                skyContainer: animationScene.skyContainer,
                earthRadius,
                moonRadius,
                timelineEventInfos,
                referenceCamera: animationScene.camera,
                panelsVisible: viewAuxiliaryPanels,
                missionConfig: globalConfig,
                photoModeEnabled: viewPhotoMode,
                earthCloudsEnabled: effectiveEarthClouds,
                earthPhotoTexture: animationScene.earthPhotoTexture || null,
            });
            if (viewAuxiliaryPanels) {
                animationScene.refreshBodyHalos?.({ suppress: false });
            }
        }
    };
}

export { createSceneHandlerClass };

