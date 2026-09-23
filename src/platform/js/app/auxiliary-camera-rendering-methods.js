import * as shared from "./auxiliary-camera-shared.js";

const {
    applyPhotoModeBodyPresentation,
    applyPhotoModeExposure,
    buildTimelinePhases,
    computePhotoModeLightingPresentation,
    getDockviewSpikeLayoutHost,
    isDesktopViewport,
    resolveFlybyPlannerEvents,
    resolveLunarFlybyWindowMs,
    resolvePhotoModeLightingPresentation,
} = shared;

export const renderingMethods = {
    showComposerHint(panelState, message, durationMs = 1800) {
        if (!panelState?.composerHint) {
            return;
        }

        if (panelState.composerHintTimer != null) {
            clearTimeout(panelState.composerHintTimer);
            panelState.composerHintTimer = null;
        }

        panelState.composerHint.textContent = message;
        panelState.composerHint.hidden = false;
        panelState.composerHint.dataset.visible = "true";
        panelState.composerHintTimer = setTimeout(() => {
            panelState.composerHint.dataset.visible = "false";
            panelState.composerHint.hidden = true;
            panelState.composerHintTimer = null;
        }, Math.max(0, durationMs));
    },
    renderComposerPanel(panelState, {
        animationScene = null,
        scene,
        latestSceneState = null,
        activeCraft,
        earth,
        moon,
        sun = null,
        sunRenderer,
        skyRenderer = null,
        earthRadius,
        moonRadius,
        missionConfig = null,
        referenceCamera,
        hasSkyContainer,
        skyContainer,
        earthCloudsEnabled = true,
        earthDayTexture = null,
    }) {
        if (!activeCraft || !earth || !moon) {
            this.setPanelVisible(panelState, false);
            return false;
        }
        if (!this.getObjectWorldPosition(activeCraft, this.craftWorld)) {
            this.setPanelVisible(panelState, false);
            return false;
        }
        if (!this.getObjectWorldPosition(earth, this.earthWorld) || !this.getObjectWorldPosition(moon, this.moonWorld)) {
            this.setPanelVisible(panelState, false);
            return false;
        }
        const composerEarthRadius = (Number.isFinite(earthRadius) && earthRadius > 0)
            ? earthRadius
            : this.estimateObjectRadius(earth, 1);
        const composerMoonRadius = (Number.isFinite(moonRadius) && moonRadius > 0)
            ? moonRadius
            : this.estimateObjectRadius(moon, 1);
        this.updateBodyNorthWorld(earth, this.earthNorthWorld);
        this.updateBodyNorthWorld(moon, this.moonNorthWorld);

        this.setPanelVisible(panelState, true);
        this.ensureLunarFeatureMentionTimeline(missionConfig);
        panelState.composerEarthCloudsEnabled = earthCloudsEnabled !== false;
        panelState.syncComposerCloudsUi?.();
        panelState.syncComposerLunarCratersUi?.();
        this.syncPanelSize(panelState);
        this.setPanelFov(panelState, panelState.camera.fov);
        this.syncComposerTimelineUi(panelState);
        panelState.composerLunarFeatureMentionView = this.resolveComposerLunarFeatureMentionView(panelState);
        this.renderComposerLunarFeatureStack(panelState, panelState.composerLunarFeatureMentionView);

        if (referenceCamera) {
            if (
                Math.abs(panelState.camera.near - referenceCamera.near) > 1e-9 ||
                Math.abs(panelState.camera.far - referenceCamera.far) > 1e-9
            ) {
                panelState.camera.near = referenceCamera.near;
                panelState.camera.far = referenceCamera.far;
                panelState.camera.updateProjectionMatrix();
            }
        }

        const lockTarget = panelState.composerLockTarget || "none";
        if (lockTarget === "earth" || lockTarget === "moon") {
            this.applyComposerPreset(panelState, lockTarget, {
                craftWorld: this.craftWorld,
                earthWorld: this.earthWorld,
                moonWorld: this.moonWorld,
            });
        } else if (!Number.isFinite(panelState.composerYawRad) || !Number.isFinite(panelState.composerPitchRad)) {
            this.applyComposerPreset(panelState, "earth", {
                craftWorld: this.craftWorld,
                earthWorld: this.earthWorld,
                moonWorld: this.moonWorld,
            });
        }
        this.updateComposerRollUi(panelState);

        panelState.camera.position.copy(this.craftWorld);
        let distanceForFov = Number.NaN;
        let radiusForFov = Number.NaN;
        const disabledAsCraftToEarth = panelState.composerInteractionEnabled !== true;
        if (disabledAsCraftToEarth) {
            this.composerLookAtWorld.copy(this.earthWorld);
            this.viewDir.subVectors(this.earthWorld, this.craftWorld).normalize();
            this.targetUp.set(0, 0, 1);
            earth.getWorldQuaternion(this.targetQuat);
            this.targetUp.applyQuaternion(this.targetQuat).normalize();
            if (Math.abs(this.targetUp.dot(this.viewDir)) > 0.98) {
                panelState.camera.up.set(0, 0, 1);
            } else {
                panelState.camera.up.copy(this.targetUp);
            }
            panelState.camera.lookAt(this.composerLookAtWorld);
            distanceForFov = panelState.camera.position.distanceTo(this.earthWorld);
            radiusForFov = composerEarthRadius;
        } else {
            const lookDir = this.getComposerLookDirection(panelState);
            panelState.camera.up.copy(this.getComposerCameraUp(panelState, lookDir));
            this.composerLookAtWorld.copy(this.craftWorld).add(lookDir);
            panelState.camera.lookAt(this.composerLookAtWorld);
            // Keep previous auto-FoV behavior when enabled.
            if (lockTarget === "earth") {
                distanceForFov = panelState.camera.position.distanceTo(this.earthWorld);
                radiusForFov = composerEarthRadius;
            } else if (lockTarget === "moon") {
                distanceForFov = panelState.camera.position.distanceTo(this.moonWorld);
                radiusForFov = composerMoonRadius;
            }
        }

        if (!disabledAsCraftToEarth && panelState.autoFovEnabled && lockTarget !== "none") {
            const autoFov = this.computeComposerAutoFovDegrees({
                panelState,
                craftWorld: this.craftWorld,
                earthWorld: this.earthWorld,
                moonWorld: this.moonWorld,
                earthRadius: composerEarthRadius,
                moonRadius: composerMoonRadius,
                lockTarget,
            });
            this.setPanelFov(panelState, this.clampAutoFovDegrees(panelState, autoFov));
        }

        if (hasSkyContainer) {
            panelState.camera.getWorldPosition(this.panelCameraWorldPosition);
            if (skyContainer.parent?.worldToLocal) {
                this.panelSkyLocalPosition.copy(this.panelCameraWorldPosition);
                skyContainer.parent.worldToLocal(this.panelSkyLocalPosition);
                skyContainer.position.copy(this.panelSkyLocalPosition);
            } else {
                skyContainer.position.copy(this.panelCameraWorldPosition);
            }
        }
        if (sunRenderer?.setReferencePosition) {
            panelState.camera.getWorldPosition(this.panelCameraWorldPosition);
            const sunParent = sunRenderer.group?.parent;
            if (sunParent?.worldToLocal) {
                this.panelSunLocalPosition.copy(this.panelCameraWorldPosition);
                sunParent.worldToLocal(this.panelSunLocalPosition);
                sunRenderer.setReferencePosition(
                    this.panelSunLocalPosition.x,
                    this.panelSunLocalPosition.y,
                    this.panelSunLocalPosition.z,
                );
            } else {
                sunRenderer.setReferencePosition(
                    this.panelCameraWorldPosition.x,
                    this.panelCameraWorldPosition.y,
                    this.panelCameraWorldPosition.z,
                );
            }
        }
        const composerLightingPresentation = computePhotoModeLightingPresentation({
            distanceToEarth: panelState.camera.position.distanceTo(this.earthWorld),
            earthRadius: composerEarthRadius,
            distanceToMoon: panelState.camera.position.distanceTo(this.moonWorld),
            moonRadius: composerMoonRadius,
        });
        const restoreComposerBodyPresentation = this.applyComposerBodyLightingPresentation({
            earth,
            moon,
            distanceToEarth: panelState.camera.position.distanceTo(this.earthWorld),
            earthRadius: composerEarthRadius,
            distanceToMoon: panelState.camera.position.distanceTo(this.moonWorld),
            moonRadius: composerMoonRadius,
            earthDayTexture: earthCloudsEnabled !== false ? earthDayTexture : null,
            earthDayTextureBlend: earthCloudsEnabled !== false ? null : 0,
        });
        const restoreComposerBodyAmbient = this.applyComposerBodyAmbientLighting({
            panelState,
            earth,
            moon,
        });
        const restoreComposerEarthshineGain = this.applyComposerEarthshineGain(panelState, scene);
        const restoreComposerMoonshineGain = this.applyComposerMoonshineGain(panelState, scene);
        const composerSolarEclipseState = this.resolveComposerSolarEclipseState({
            craftWorld: this.craftWorld,
            earthWorld: this.earthWorld,
            moonWorld: this.moonWorld,
            earthRadius: composerEarthRadius,
            moonRadius: composerMoonRadius,
        });
        const previousSolarEclipseActive = panelState.composerSolarEclipseActive === true;
        panelState.composerSolarEclipseActive = composerSolarEclipseState.active === true;
        const previousEclipseAutoExposureEligible = panelState.composerEclipseAutoExposureEligible !== false;
        panelState.composerEclipseAutoExposureEligible = this.shouldApplyComposerEclipseAutoExposure(panelState, {
            eclipseState: composerSolarEclipseState,
            earthWorld: this.earthWorld,
            earthRadius: composerEarthRadius,
            moonWorld: this.moonWorld,
            moonRadius: composerMoonRadius,
        });
        if (
            panelState.composerSolarEclipseActive !== previousSolarEclipseActive ||
            panelState.composerEclipseAutoExposureEligible !== previousEclipseAutoExposureEligible
        ) {
            panelState.syncComposerExposureUi?.();
        }
        const restoreComposerExposureProfile = this.applyComposerExposureProfile(scene, panelState, sunRenderer, {
            exposureBias: composerLightingPresentation?.exposureBias ?? 1,
            skyRenderer,
            eclipseActive: panelState.composerSolarEclipseActive,
        });
        try {
            this.renderComposerLayers(panelState, scene, {
                animationScene,
                renderSkyLayer: hasSkyContainer && skyContainer?.visible !== false,
            });
        } finally {
            restoreComposerExposureProfile();
            restoreComposerMoonshineGain();
            restoreComposerEarthshineGain();
            restoreComposerBodyAmbient();
            restoreComposerBodyPresentation();
        }
        this.clearPanelOverlay(panelState);
        this.renderComposerSkyLabelOverlay(panelState, {
            scene,
            skyContainer,
            skyRenderer,
            earthWorld: this.earthWorld,
            moonWorld: this.moonWorld,
            earthRadius: composerEarthRadius,
            moonRadius: composerMoonRadius,
        });
        this.renderComposerMoonOutlineOverlay(panelState, {
            moonWorld: this.moonWorld,
            moonRadius: composerMoonRadius,
        });
        this.renderComposerSeeThroughOverlay(panelState, {
            scene,
            skyContainer,
            skyRenderer,
            earthWorld: this.earthWorld,
            moonWorld: this.moonWorld,
            earthRadius: composerEarthRadius,
            moonRadius: composerMoonRadius,
        });
        this.renderComposerBottomMetricsOverlay(panelState, {
            craftWorld: this.craftWorld,
            moonWorld: this.moonWorld,
            earthWorld: this.earthWorld,
            telemetry: latestSceneState?.telemetry || null,
        });
        return true;
    },
    render({
        animationScene = null,
        scene,
        skyRenderer = null,
        latestSceneState = null,
        activeCraft,
        craftsById = null,
        dronesById = null,
        earth,
        moon,
        sun = null,
        sunRenderer = null,
        sunDirection = null,
        sunDirections = null,
        skyContainer = null,
        earthRadius = null,
        moonRadius = null,
        timelineEventInfos = null,
        referenceCamera,
        panelsVisible = true,
        missionConfig = null,
        photoModeEnabled = false,
        earthCloudsEnabled = true,
        earthPhotoTexture = null,
    }) {
        if (!this.root) {
            return;
        }

        this.lastAnimationScene = animationScene;
        this.syncMissionPanelPolicy(missionConfig);
        this.panelsEnabled = panelsVisible !== false;
        if (!this.panelsEnabled || !isDesktopViewport()) {
            this.root.hidden = true;
            return;
        }

        if (!scene || !activeCraft) {
            this.root.hidden = true;
            return;
        }

        this.root.hidden = false;
        this.composerFlybyTimeMs = this.resolveLunarFlybyTimeMs(timelineEventInfos);
        const flybyWindow = resolveLunarFlybyWindowMs(timelineEventInfos);
        this.composerFlybyWindowStartMs = flybyWindow.startMs;
        this.composerFlybyWindowEndMs = flybyWindow.endMs;
        this.composerTimelinePhases = buildTimelinePhases({
            phaseConfig: missionConfig?.timelinePhases || null,
            eventInfos: timelineEventInfos,
        });
        this.composerFlybyEvents = resolveFlybyPlannerEvents(timelineEventInfos);
        activeCraft.getWorldPosition(this.craftWorld);
        const normalizeSunDirection = (target, candidate) => {
            if (candidate && Number.isFinite(candidate.x) && Number.isFinite(candidate.y) && Number.isFinite(candidate.z)) {
                target.set(candidate.x, candidate.y, candidate.z);
            }
            const len = target.length();
            if (Number.isFinite(len) && len > 1e-12) {
                target.multiplyScalar(1 / len);
                return true;
            }
            target.set(1, 0, 0);
            return false;
        };

        const fallbackSun = (
            sunDirection &&
            Number.isFinite(sunDirection.x) &&
            Number.isFinite(sunDirection.y) &&
            Number.isFinite(sunDirection.z)
        )
            ? sunDirection
            : { x: 1, y: 0, z: 0 };
        this.sunDirectionWorld.set(fallbackSun.x, fallbackSun.y, fallbackSun.z);
        normalizeSunDirection(this.sunDirectionEarthWorld, sunDirections?.earthCentered || fallbackSun);
        normalizeSunDirection(this.sunDirectionMoonWorld, sunDirections?.moonCentered || sunDirections?.earthCentered || fallbackSun);
        normalizeSunDirection(this.sunDirectionCraftWorld, sunDirections?.craftCenteredLightTime || sunDirections?.craftCentered || sunDirections?.earthCentered || fallbackSun);
        const nowMs = performance.now();
        const refreshAnalytics = !Number.isFinite(this.analyticsLastUpdateMs) || (nowMs - this.analyticsLastUpdateMs) >= 120;
        if (refreshAnalytics) {
            this.cachedMoonPhaseInfo = this.computeMoonPhaseInfo({ earth, moon, sun });
            this.cachedMoonVisibilityInfo = this.computeCraftMoonVisibilityInfo({ activeCraft, earth, moon, sun });
            this.analyticsLastUpdateMs = nowMs;
        }
        // Keep auxiliary craft views physically faithful: camera sits at the
        // craft origin (no artificial standoff), so body occultations such as
        // Earth-rise behind the Moon remain geometrically correct.
        const standoffDistance = 0;

        let visiblePanels = 0;
        let animatedComposerCoronaPanels = 0;
        let suppressedLines = null;
        const ensureLinesSuppressed = () => {
            if (!suppressedLines) {
                suppressedLines = this.suppressLinePrimitives(scene);
            }
        };
        const ensureLinesVisible = () => {
            if (suppressedLines) {
                this.restoreVisibility(suppressedLines);
                suppressedLines = null;
            }
        };
        ensureLinesSuppressed();
        let suppressedCrafts = null;
        const ensureCraftsSuppressed = () => {
            if (!suppressedCrafts) {
                suppressedCrafts = this.suppressCraftVisuals({ activeCraft, craftsById, dronesById });
            }
        };
        const ensureCraftsVisible = () => {
            if (suppressedCrafts) {
                this.restoreVisibility(suppressedCrafts);
                suppressedCrafts = null;
            }
        };
        ensureCraftsSuppressed();
        const hasSkyContainer = !!skyContainer?.position;
        if (hasSkyContainer) {
            this.originalSkyPosition.copy(skyContainer.position);
        }
        const hasSunRenderer = !!(sunRenderer?.setReferencePosition);
        if (hasSunRenderer) {
            sunRenderer.getReferencePosition?.(this.originalSunReference);
        }
        const restoreSharedBodyAmbient = this.applySharedComposerBodyAmbientLighting({
            earth,
            moon,
        });

        try {
            for (const panelState of this.panels) {
                if (panelState.missionEnabled !== true) {
                    this.setPanelMissionEnabled(panelState, false);
                    continue;
                }
                const dockedPanel = getDockviewSpikeLayoutHost()?.api?.getPanel?.(panelState.panelRegistryId);
                if (dockedPanel && !dockedPanel.api.isVisible) continue;
                const context = { activeCraft, earth, moon, sun };
                if (panelState.mode === "orbit-xy") {
                    if (panelState.deleted === true || panelState.closed === true) {
                        this.setPanelVisible(panelState, false);
                        continue;
                    }
                    if (panelState.minimized === true) {
                        this.setPanelVisible(panelState, false);
                        continue;
                    }
                    ensureLinesVisible();
                    ensureCraftsVisible();
                    const rendered = this.renderOrbitPlanePanel(panelState, {
                        scene,
                        activeCraft,
                        earth,
                        moon,
                        earthRadius,
                        moonRadius,
                        missionConfig,
                    });
                    if (rendered) {
                        visiblePanels += 1;
                    }
                    ensureLinesSuppressed();
                    ensureCraftsSuppressed();
                    continue;
                }
                if (panelState.mode === "composer") {
                    ensureLinesSuppressed();
                    ensureCraftsSuppressed();
                    if (panelState.deleted === true || panelState.closed === true) {
                        this.setPanelVisible(panelState, false);
                        continue;
                    }
                    if (panelState.minimized === true) {
                        this.setPanelVisible(panelState, false);
                        continue;
                    }
                    if (sunRenderer?.setDirection) {
                        const panelSunDirection = this.resolveSunDirectionForPanel(panelState);
                        sunRenderer.setDirection(panelSunDirection.x, panelSunDirection.y, panelSunDirection.z);
                    }
                    const rendered = this.renderComposerPanel(panelState, {
                        animationScene,
                        scene,
                        skyRenderer,
                        latestSceneState,
                        activeCraft,
                        earth,
                        moon,
                        sun,
                        sunRenderer,
                        earthRadius,
                        moonRadius,
                        missionConfig,
                        referenceCamera,
                        hasSkyContainer,
                        skyContainer,
                        earthCloudsEnabled,
                        earthDayTexture: earthPhotoTexture,
                    });
                    if (rendered) {
                        visiblePanels += 1;
                        if (panelState.composerSolarEclipseActive === true) {
                            animatedComposerCoronaPanels += 1;
                        }
                    }
                    continue;
                }
                ensureLinesSuppressed();
                ensureCraftsSuppressed();
                const hasAnchor = this.resolvePositionForKey(panelState.anchorKey, context, this.anchorWorld);
                const targetObject = panelState.targetKey === "earth"
                    ? earth
                    : (panelState.targetKey === "moon" ? moon : null);
                const hasTarget = this.resolvePositionForKey(panelState.targetKey, context, this.targetWorld);
                if (!hasAnchor || !targetObject || !hasTarget) {
                    this.setPanelVisible(panelState, false);
                    continue;
                }
                if (panelState.deleted === true || panelState.closed === true) {
                    this.setPanelVisible(panelState, false);
                    continue;
                }
                if (panelState.minimized === true) {
                    this.setPanelVisible(panelState, false);
                    continue;
                }

                const distanceSq = this.anchorWorld.distanceToSquared(this.targetWorld);
                if (!Number.isFinite(distanceSq) || distanceSq <= 1e-14) {
                    this.setPanelVisible(panelState, false);
                    continue;
                }

                this.setPanelVisible(panelState, true);
                visiblePanels += 1;
                this.syncPanelSize(panelState);

                if (referenceCamera) {
                    if (
                        Math.abs(panelState.camera.near - referenceCamera.near) > 1e-9 ||
                        Math.abs(panelState.camera.far - referenceCamera.far) > 1e-9
                    ) {
                        panelState.camera.near = referenceCamera.near;
                        panelState.camera.far = referenceCamera.far;
                        panelState.camera.updateProjectionMatrix();
                    }
                }

                this.viewDir.subVectors(this.targetWorld, this.anchorWorld).normalize();
                panelState.camera.position.copy(this.anchorWorld);
                if (standoffDistance > 0) {
                    this.cameraOffset.copy(this.viewDir).multiplyScalar(-standoffDistance);
                    panelState.camera.position.add(this.cameraOffset);
                }

                this.applyEclipticNorthUp(panelState.camera, this.targetWorld);

                const radiusHint = panelState.targetKey === "earth" ? earthRadius : moonRadius;
                const targetRadius = Number.isFinite(radiusHint) && radiusHint > 0
                    ? radiusHint
                    : this.estimateObjectRadius(targetObject, 1);
                const distanceToTarget = panelState.camera.position.distanceTo(this.targetWorld);

                if (panelState.autoFovEnabled) {
                    const autoFovDegrees = this.computeAutoFovDegrees({
                        distanceToTarget,
                        targetRadius,
                        aspect: panelState.camera.aspect,
                    });
                    this.setPanelFov(panelState, this.clampAutoFovDegrees(panelState, autoFovDegrees));
                }
                panelState.camera.lookAt(this.targetWorld);

                if (hasSkyContainer) {
                    panelState.camera.getWorldPosition(this.panelCameraWorldPosition);
                    if (skyContainer.parent?.worldToLocal) {
                        this.panelSkyLocalPosition.copy(this.panelCameraWorldPosition);
                        skyContainer.parent.worldToLocal(this.panelSkyLocalPosition);
                        skyContainer.position.copy(this.panelSkyLocalPosition);
                    } else {
                        skyContainer.position.copy(this.panelCameraWorldPosition);
                    }
                }
                if (hasSunRenderer) {
                    panelState.camera.getWorldPosition(this.panelCameraWorldPosition);
                    const sunParent = sunRenderer.group?.parent;
                    if (sunParent?.worldToLocal) {
                        this.panelSunLocalPosition.copy(this.panelCameraWorldPosition);
                        sunParent.worldToLocal(this.panelSunLocalPosition);
                        sunRenderer.setReferencePosition(
                            this.panelSunLocalPosition.x,
                            this.panelSunLocalPosition.y,
                            this.panelSunLocalPosition.z,
                        );
                    } else {
                        sunRenderer.setReferencePosition(
                            this.panelCameraWorldPosition.x,
                            this.panelCameraWorldPosition.y,
                            this.panelCameraWorldPosition.z,
                        );
                    }
                }
                if (sunRenderer?.setDirection) {
                    const panelSunDirection = this.resolveSunDirectionForPanel(panelState);
                    sunRenderer.setDirection(panelSunDirection.x, panelSunDirection.y, panelSunDirection.z);
                }
                const photoModePresentation = resolvePhotoModeLightingPresentation({
                    enabled: photoModeEnabled,
                    cameraPosition: panelState.camera.position,
                    earthPosition: this.earthWorld,
                    earthRadius,
                    moonPosition: this.moonWorld,
                    moonRadius,
                });
                const restorePhotoModeBodyPresentation = applyPhotoModeBodyPresentation({
                    earth,
                    moon,
                    presentation: photoModePresentation,
                    earthDayTexture: earthPhotoTexture,
                    earthDayTextureBlend: earthCloudsEnabled === false ? 0 : null,
                });
                const restorePhotoModeExposure = applyPhotoModeExposure({
                    renderer: panelState.renderer,
                    presentation: photoModePresentation,
                });
                try {
                    this.renderAuxiliaryPanelLayers(panelState, scene, {
                        animationScene,
                        renderSkyLayer: hasSkyContainer && skyContainer?.visible !== false,
                    });
                } finally {
                    restorePhotoModeExposure();
                    restorePhotoModeBodyPresentation();
                }

                if (panelState.infoMode === "moon-phase") {
                    const phase = this.cachedMoonPhaseInfo;
                    if (phase) {
                        this.setPanelInfo(
                            panelState,
                            `Phase: ${phase.phaseName}`,
                            `Sun separation: ${phase.elongationDeg.toFixed(1)}°`,
                        );
                    } else {
                        this.setPanelInfo(panelState, "Phase: --", "Sun separation: --");
                    }
                } else if (panelState.infoMode === "moon-visibility") {
                    const visibility = this.cachedMoonVisibilityInfo;
                    if (visibility) {
                        const hasEarthWorld = this.getObjectWorldPosition(earth, this.earthWorld);
                        if (!hasEarthWorld) {
                            this.clearPanelOverlay(panelState);
                        }
                        if (hasEarthWorld) {
                            this.tmpVectorC.subVectors(this.earthWorld, this.targetWorld);
                            if (this.tmpVectorC.lengthSq() > 1e-18) {
                                this.tmpVectorC.normalize();
                            } else {
                                this.tmpVectorC.set(1, 0, 0);
                            }
                        } else {
                            this.tmpVectorC.set(1, 0, 0);
                        }
                        this.renderMoonFarSideOverlay(panelState, {
                            distanceToTarget,
                            targetRadius,
                            earthDirectionWorld: this.tmpVectorC,
                        });
                        this.setPanelInfo(
                            panelState,
                            "Visible lunar surface",
                            `${visibility.nearPct}% near (${visibility.nearDayPct}% day; ${visibility.nearNightPct}% night) ${visibility.farPct}% far (${visibility.farDayPct}% day; ${visibility.farNightPct}% night)`,
                            {
                                pillText: panelState.farSideTintEnabled ? "Far Side: ON" : "Far Side: OFF",
                                pillVariant: "far",
                                pillInteractive: true,
                                pillOn: panelState.farSideTintEnabled === true,
                            },
                        );
                    } else {
                        this.clearPanelOverlay(panelState);
                        this.setPanelInfo(panelState, "Visible lunar surface", "No visibility data");
                    }
                } else {
                    this.clearPanelOverlay(panelState);
                    this.setPanelInfo(panelState, "", "");
                }
            }
        } finally {
            restoreSharedBodyAmbient();
            if (hasSkyContainer) {
                skyContainer.position.copy(this.originalSkyPosition);
            }
            if (hasSunRenderer) {
                sunRenderer.setReferencePosition(
                    this.originalSunReference.x,
                    this.originalSunReference.y,
                    this.originalSunReference.z,
                );
                sunRenderer.setDirection(
                    this.sunDirectionEarthWorld.x,
                    this.sunDirectionEarthWorld.y,
                    this.sunDirectionEarthWorld.z,
                );
            }
            if (suppressedCrafts) {
                this.restoreVisibility(suppressedCrafts);
            }
            if (suppressedLines) {
                this.restoreVisibility(suppressedLines);
            }
        }

        this.root.hidden = visiblePanels === 0;
        if (animatedComposerCoronaPanels > 0) {
            this.requestComposerCoronaAnimationFrame();
        }
    },
};
