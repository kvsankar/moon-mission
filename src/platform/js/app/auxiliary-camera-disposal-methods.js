import * as shared from "./auxiliary-camera-shared.js";

const {
    unregisterMissionPanel,
} = shared;

export const disposalMethods = {
    dispose() {
        if (!this.root) {
            return;
        }

        window.removeEventListener("resize", this.handleResizeBound);
        document.removeEventListener("moon-mission:auxiliary-panels-layout-request", this.handleExternalLayoutRequestBound);
        document.removeEventListener("mission-media-item-select", this.handleMissionMediaItemSelectBound);
        if (this.panelResizeObserver) {
            this.panelResizeObserver.disconnect();
            this.panelResizeObserver = null;
        }
        if (this.pendingResizeRaf != null) {
            cancelAnimationFrame(this.pendingResizeRaf);
            this.pendingResizeRaf = null;
        }
        if (this.composerCoronaAnimationRaf != null) {
            cancelAnimationFrame(this.composerCoronaAnimationRaf);
            this.composerCoronaAnimationRaf = null;
        }
        if (this.defaultLayoutRaf != null) {
            cancelAnimationFrame(this.defaultLayoutRaf);
            this.defaultLayoutRaf = null;
        }
        if (this.visiblePanelsRefreshRaf != null) {
            cancelAnimationFrame(this.visiblePanelsRefreshRaf);
            this.visiblePanelsRefreshRaf = null;
        }
        if (this.persistStateTimeout != null) {
            clearTimeout(this.persistStateTimeout);
            this.persistStateTimeout = null;
        }
        this.pendingResizePanelStates.clear();
        this.dragState = null;
        for (const panelState of this.panels) {
            panelState.disclosure?.dispose();
            if (panelState.visibleRefreshRaf != null) {
                cancelAnimationFrame(panelState.visibleRefreshRaf);
                panelState.visibleRefreshRaf = null;
            }
            panelState.fovSlider.removeEventListener("input", panelState.onFovInput);
            panelState.autoToggle.removeEventListener("click", panelState.onAutoToggleClick);
            panelState.infoButton.removeEventListener("click", panelState.onInfoClick);
            panelState.minimizeButton?.removeEventListener?.("click", panelState.onMinimizeClick);
            panelState.expandButton.removeEventListener("click", panelState.onExpandClick);
            panelState.closeButton.removeEventListener("click", panelState.onCloseClick);
            panelState.deleteButton.removeEventListener("click", panelState.onDeleteClick);
            panelState.chipButton.removeEventListener("click", panelState.onChipClick);
            unregisterMissionPanel(panelState.panelRegistryId);
            if (panelState.onInfoPillClick) {
                panelState.infoPill.removeEventListener("click", panelState.onInfoPillClick);
            }
            if (panelState.onComposerLookFreeClick) {
                panelState.composerLookFreeButton?.removeEventListener("click", panelState.onComposerLookFreeClick);
            }
            if (panelState.onComposerLookEarthClick) {
                panelState.composerLookEarthButton?.removeEventListener("click", panelState.onComposerLookEarthClick);
            }
            if (panelState.onComposerLookMoonClick) {
                panelState.composerLookMoonButton?.removeEventListener("click", panelState.onComposerLookMoonClick);
            }
            if (panelState.onComposerResetClick) {
                panelState.composerResetButton?.removeEventListener("click", panelState.onComposerResetClick);
            }
            if (panelState.onComposerTimelineInput) {
                panelState.composerTimelineSlider?.removeEventListener("input", panelState.onComposerTimelineInput);
            }
            if (panelState.onComposerEarthAmbientInput) {
                panelState.composerEarthAmbientSlider?.removeEventListener("input", panelState.onComposerEarthAmbientInput);
            }
            if (panelState.onComposerMoonAmbientInput) {
                panelState.composerMoonAmbientSlider?.removeEventListener("input", panelState.onComposerMoonAmbientInput);
            }
            if (panelState.onComposerEarthshineInput) {
                panelState.composerEarthshineSlider?.removeEventListener("input", panelState.onComposerEarthshineInput);
            }
            if (panelState.onComposerMoonshineInput) {
                panelState.composerMoonshineSlider?.removeEventListener("input", panelState.onComposerMoonshineInput);
            }
            if (panelState.onComposerMoonOutlineToggle) {
                panelState.composerMoonOutlineCheckbox?.removeEventListener("change", panelState.onComposerMoonOutlineToggle);
            }
            if (panelState.onComposerSeeThroughToggle) {
                panelState.composerSeeThroughCheckbox?.removeEventListener("change", panelState.onComposerSeeThroughToggle);
            }
            if (panelState.onComposerControlsToggleClick) {
                panelState.composerControlsToggleButton?.removeEventListener("click", panelState.onComposerControlsToggleClick);
            }
            if (panelState.onComposerOpticsToggleClick) {
                panelState.composerOpticsToggleButton?.removeEventListener("click", panelState.onComposerOpticsToggleClick);
            }
            if (panelState.onComposerOpticsPhysicalClick) {
                panelState.composerOpticsPhysicalButton?.removeEventListener("click", panelState.onComposerOpticsPhysicalClick);
            }
            if (panelState.onComposerOpticsCameraClick) {
                panelState.composerOpticsCameraButton?.removeEventListener("click", panelState.onComposerOpticsCameraClick);
            }
            if (panelState.onComposerExposureInput) {
                panelState.composerExposureSlider?.removeEventListener("input", panelState.onComposerExposureInput);
            }
            if (panelState.onComposerAutoExposureChange) {
                panelState.composerAutoExposureCheckbox?.removeEventListener("change", panelState.onComposerAutoExposureChange);
            }
            if (panelState.onComposerOpticsStrengthInput) {
                panelState.composerOpticsStrengthSlider?.removeEventListener("input", panelState.onComposerOpticsStrengthInput);
            }
            if (panelState.onComposerOpticsHaloInput) {
                panelState.composerOpticsHaloSlider?.removeEventListener("input", panelState.onComposerOpticsHaloInput);
            }
            if (panelState.onComposerOpticsStarburstInput) {
                panelState.composerOpticsStarburstSlider?.removeEventListener("input", panelState.onComposerOpticsStarburstInput);
            }
            if (panelState.onComposerOpticsFlareInput) {
                panelState.composerOpticsFlareSlider?.removeEventListener("input", panelState.onComposerOpticsFlareInput);
            }
            if (panelState.onComposerEclipseCoronaIntensityInput) {
                panelState.composerEclipseCoronaIntensitySlider?.removeEventListener(
                    "input",
                    panelState.onComposerEclipseCoronaIntensityInput,
                );
            }
            if (panelState.onComposerEclipseCoronaMotionInput) {
                panelState.composerEclipseCoronaMotionSlider?.removeEventListener(
                    "input",
                    panelState.onComposerEclipseCoronaMotionInput,
                );
            }
            if (panelState.onComposerEclipseCoronaStructureInput) {
                panelState.composerEclipseCoronaStructureSlider?.removeEventListener(
                    "input",
                    panelState.onComposerEclipseCoronaStructureInput,
                );
            }
            if (panelState.onComposerEclipseZodiacalDustInput) {
                panelState.composerEclipseZodiacalDustSlider?.removeEventListener(
                    "input",
                    panelState.onComposerEclipseZodiacalDustInput,
                );
            }
            if (panelState.onComposerStarMagnitudeInput) {
                panelState.composerStarMagnitudeSlider?.removeEventListener("input", panelState.onComposerStarMagnitudeInput);
            }
            if (panelState.onComposerTranscriptSyncedChange) {
                panelState.composerTranscriptSyncedCheckbox?.removeEventListener(
                    "change",
                    panelState.onComposerTranscriptSyncedChange,
                );
            }
            if (panelState.onComposerTranscriptWindowInput) {
                panelState.composerTranscriptWindowSlider?.removeEventListener(
                    "input",
                    panelState.onComposerTranscriptWindowInput,
                );
            }
            if (panelState.onComposerTranscriptHoldInput) {
                panelState.composerTranscriptHoldSlider?.removeEventListener(
                    "input",
                    panelState.onComposerTranscriptHoldInput,
                );
            }
            if (panelState.onComposerTranscriptPrevClick) {
                panelState.composerTranscriptPrevButton?.removeEventListener("click", panelState.onComposerTranscriptPrevClick);
            }
            if (panelState.onComposerTranscriptNextClick) {
                panelState.composerTranscriptNextButton?.removeEventListener("click", panelState.onComposerTranscriptNextClick);
            }
            if (panelState.onComposerLunarFeatureStackCloseClick) {
                panelState.composerLunarFeatureStackCloseButton?.removeEventListener(
                    "click",
                    panelState.onComposerLunarFeatureStackCloseClick,
                );
            }
            if (panelState.onComposerLunarFeatureStackRestoreClick) {
                panelState.composerLunarFeatureStackRestoreButton?.removeEventListener(
                    "click",
                    panelState.onComposerLunarFeatureStackRestoreClick,
                );
            }
            if (panelState.onComposerLunarFeatureStackPointerDown) {
                panelState.composerLunarFeatureStackHeader?.removeEventListener(
                    "pointerdown",
                    panelState.onComposerLunarFeatureStackPointerDown,
                );
            }
            if (panelState.onComposerLunarFeatureStackPointerMove) {
                panelState.composerLunarFeatureStackHeader?.removeEventListener(
                    "pointermove",
                    panelState.onComposerLunarFeatureStackPointerMove,
                );
            }
            if (panelState.onComposerLunarFeatureStackPointerUp) {
                panelState.composerLunarFeatureStackHeader?.removeEventListener(
                    "pointerup",
                    panelState.onComposerLunarFeatureStackPointerUp,
                );
                panelState.composerLunarFeatureStackHeader?.removeEventListener(
                    "pointercancel",
                    panelState.onComposerLunarFeatureStackPointerUp,
                );
            }
            if (panelState.onComposerCloudsChange) {
                panelState.composerCloudsCheckbox?.removeEventListener("change", panelState.onComposerCloudsChange);
            }
            if (panelState.onComposerLunarCratersPillClick) {
                panelState.composerLunarCratersPill?.removeEventListener(
                    "click",
                    panelState.onComposerLunarCratersPillClick,
                );
            }
            if (panelState.onComposerSurfacePointsPillClick) {
                panelState.composerSurfacePointsPill?.removeEventListener(
                    "click",
                    panelState.onComposerSurfacePointsPillClick,
                );
            }
            if (panelState.onComposerSurfacePointsCloseClick) {
                panelState.composerSurfacePointControls?.close?.removeEventListener(
                    "click",
                    panelState.onComposerSurfacePointsCloseClick,
                );
            }
            if (panelState.onComposerSurfacePointToggle) {
                panelState.composerSurfacePointControls?.entries?.forEach?.(({ input }) => {
                    input?.removeEventListener?.("change", panelState.onComposerSurfacePointToggle);
                });
            }
            if (panelState.onComposerOverlayPanelEvent) {
                for (const panel of [
                    panelState.composerLunarCraterControls?.panel,
                    panelState.composerSurfacePointControls?.panel,
                ]) {
                    panel?.removeEventListener?.("pointerdown", panelState.onComposerOverlayPanelEvent);
                    panel?.removeEventListener?.("click", panelState.onComposerOverlayPanelEvent);
                    panel?.removeEventListener?.("wheel", panelState.onComposerOverlayPanelEvent);
                }
                panelState.onComposerOverlayPanelEvent = null;
            }
            if (panelState.unbindComposerLunarCraterControls) {
                panelState.unbindComposerLunarCraterControls();
                panelState.unbindComposerLunarCraterControls = null;
            }
            if (panelState.onComposerTimelinePointerDown) {
                panelState.composerTimelineSlider?.removeEventListener("pointerdown", panelState.onComposerTimelinePointerDown);
            }
            if (panelState.onComposerTimelinePointerUp) {
                panelState.composerTimelineSlider?.removeEventListener("pointerup", panelState.onComposerTimelinePointerUp);
                panelState.composerTimelineSlider?.removeEventListener("change", panelState.onComposerTimelinePointerUp);
            }
            if (panelState.onComposerPhasePrevClick) {
                panelState.composerPhasePrevButton?.removeEventListener("click", panelState.onComposerPhasePrevClick);
            }
            if (panelState.onComposerPhaseNextClick) {
                panelState.composerPhaseNextButton?.removeEventListener("click", panelState.onComposerPhaseNextClick);
            }
            if (panelState.onComposerTimelinePopupDocumentPointerDown) {
                document.removeEventListener(
                    "pointerdown",
                    panelState.onComposerTimelinePopupDocumentPointerDown,
                    true,
                );
            }
            if (panelState.onComposerTransportPlayClick) {
                panelState.composerTransportPlayButton?.removeEventListener("click", panelState.onComposerTransportPlayClick);
            }
            if (panelState.onComposerTransportMinusSecondClick) {
                panelState.composerTransportMinusSecondButton?.removeEventListener("click", panelState.onComposerTransportMinusSecondClick);
            }
            if (panelState.onComposerTransportMinusMinuteClick) {
                panelState.composerTransportMinusMinuteButton?.removeEventListener("click", panelState.onComposerTransportMinusMinuteClick);
            }
            if (panelState.onComposerTransportPlusMinuteClick) {
                panelState.composerTransportPlusMinuteButton?.removeEventListener("click", panelState.onComposerTransportPlusMinuteClick);
            }
            if (panelState.onComposerTransportPlusSecondClick) {
                panelState.composerTransportPlusSecondButton?.removeEventListener("click", panelState.onComposerTransportPlusSecondClick);
            }
            if (panelState.onComposerTransportSlowerClick) {
                panelState.composerTransportSlowerButton?.removeEventListener("click", panelState.onComposerTransportSlowerClick);
            }
            if (panelState.onComposerTransportSpeedClick) {
                panelState.composerTransportSpeedButton?.removeEventListener("click", panelState.onComposerTransportSpeedClick);
            }
            if (panelState.onComposerTransportFasterClick) {
                panelState.composerTransportFasterButton?.removeEventListener("click", panelState.onComposerTransportFasterClick);
            }
            if (panelState.onComposerInfoOverlayToggle) {
                panelState.composerInfoOverlayCheckbox?.removeEventListener("change", panelState.onComposerInfoOverlayToggle);
            }
            if (panelState.onComposerRollInput) {
                panelState.composerRollSlider?.removeEventListener("input", panelState.onComposerRollInput);
            }
            if (panelState.onComposerRollDialPointerDown) {
                panelState.composerRollDial?.removeEventListener("pointerdown", panelState.onComposerRollDialPointerDown);
            }
            if (panelState.onComposerRollDialPointerMove) {
                panelState.composerRollDial?.removeEventListener("pointermove", panelState.onComposerRollDialPointerMove);
            }
            if (panelState.onComposerRollDialPointerUp) {
                panelState.composerRollDial?.removeEventListener("pointerup", panelState.onComposerRollDialPointerUp);
                panelState.composerRollDial?.removeEventListener("pointercancel", panelState.onComposerRollDialPointerUp);
            }
            if (panelState.onComposerRaDecGridToggle) {
                panelState.composerRaDecGridCheckbox?.removeEventListener("change", panelState.onComposerRaDecGridToggle);
            }
            if (panelState.onComposerSkyLabelsToggle) {
                panelState.composerSkyLabelsCheckbox?.removeEventListener("change", panelState.onComposerSkyLabelsToggle);
            }
            if (panelState.onComposerConstellationLinesToggle) {
                panelState.composerConstellationLinesCheckbox?.removeEventListener(
                    "change",
                    panelState.onComposerConstellationLinesToggle,
                );
            }
            if (panelState.onComposerConstellationLabelsToggle) {
                panelState.composerConstellationLabelsCheckbox?.removeEventListener(
                    "change",
                    panelState.onComposerConstellationLabelsToggle,
                );
            }
            if (panelState.onComposerViewportPointerDown) {
                panelState.viewport.removeEventListener("pointerdown", panelState.onComposerViewportPointerDown);
            }
            if (panelState.onComposerViewportPointerMove) {
                panelState.viewport.removeEventListener("pointermove", panelState.onComposerViewportPointerMove);
            }
            if (panelState.onComposerViewportPointerLeave) {
                panelState.viewport.removeEventListener("pointerleave", panelState.onComposerViewportPointerLeave);
            }
            if (panelState.onComposerViewportPointerUp) {
                panelState.viewport.removeEventListener("pointerup", panelState.onComposerViewportPointerUp);
                panelState.viewport.removeEventListener("pointercancel", panelState.onComposerViewportPointerUp);
            }
            if (panelState.onComposerViewportWheel) {
                panelState.viewport.removeEventListener("wheel", panelState.onComposerViewportWheel);
            }
            if (panelState.onOrbitViewportPointerDown) {
                panelState.viewport.removeEventListener("pointerdown", panelState.onOrbitViewportPointerDown);
            }
            if (panelState.onOrbitViewportPointerMove) {
                panelState.viewport.removeEventListener("pointermove", panelState.onOrbitViewportPointerMove);
            }
            if (panelState.onOrbitViewportPointerUp) {
                panelState.viewport.removeEventListener("pointerup", panelState.onOrbitViewportPointerUp);
                panelState.viewport.removeEventListener("pointercancel", panelState.onOrbitViewportPointerUp);
            }
            if (panelState.onOrbitViewportWheel) {
                panelState.viewport.removeEventListener("wheel", panelState.onOrbitViewportWheel);
            }
            if (panelState.onAuxiliaryViewportWheel) {
                panelState.viewport.removeEventListener("wheel", panelState.onAuxiliaryViewportWheel);
            }
            if (panelState.onComposerPanelGatePointerDown) {
                panelState.panel.removeEventListener("pointerdown", panelState.onComposerPanelGatePointerDown, true);
            }
            if (panelState.composerHintTimer != null) {
                clearTimeout(panelState.composerHintTimer);
                panelState.composerHintTimer = null;
            }
            const header = panelState.panel.querySelector(".aux-camera-view__header");
            if (header) {
                if (panelState.onPointerDown) {
                    header.removeEventListener("pointerdown", panelState.onPointerDown);
                }
                if (panelState.onPointerMove) {
                    header.removeEventListener("pointermove", panelState.onPointerMove);
                }
                if (panelState.onPointerUp) {
                    header.removeEventListener("pointerup", panelState.onPointerUp);
                }
                if (panelState.onPointerCancel) {
                    header.removeEventListener("pointercancel", panelState.onPointerCancel);
                }
            }
            if (panelState.resizeGrip) {
                if (panelState.onPanelResizePointerDown) {
                    panelState.panel.removeEventListener("pointerdown", panelState.onPanelResizePointerDown, true);
                    panelState.panel.removeEventListener("pointermove", panelState.onResizePointerMove);
                    panelState.panel.removeEventListener("pointerup", panelState.onResizePointerUp);
                    panelState.panel.removeEventListener("pointercancel", panelState.onResizePointerCancel);
                }
                if (panelState.onResizePointerDown) {
                    panelState.resizeGrip.removeEventListener("pointerdown", panelState.onResizePointerDown);
                }
                if (panelState.onResizePointerMove) {
                    panelState.resizeGrip.removeEventListener("pointermove", panelState.onResizePointerMove);
                }
                if (panelState.onResizePointerUp) {
                    panelState.resizeGrip.removeEventListener("pointerup", panelState.onResizePointerUp);
                }
                if (panelState.onResizePointerCancel) {
                    panelState.resizeGrip.removeEventListener("pointercancel", panelState.onResizePointerCancel);
                }
            }
            if (panelState.onPanelPointerDown) {
                panelState.panel.removeEventListener("pointerdown", panelState.onPanelPointerDown);
            }
            this.lastAnimationScene?.moonRenderer?.unregisterShaderRenderer?.(panelState.renderer);
            panelState.renderer.dispose();
            panelState.chipButton.remove();
        }
        this.panels.length = 0;
        this.root.remove();
        this.root = null;
        this.chipDock = null;
        this.chipDockLeft = null;
        this.chipDockRight = null;
        this.lastAnimationScene = null;
    },
};
