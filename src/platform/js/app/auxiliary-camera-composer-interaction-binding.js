// Attaches Frame-and-Shoot listeners and publishes cleanup callbacks on panel state.
export function bindComposerPanelInteractions(panelState, actions, handlers) {
    const {
        syncAutoToggleUi,
        syncComposerLockUi,
        syncComposerCloudsUi,
        syncComposerLunarCratersUi,
        syncComposerStarMagnitudeUi,
        syncComposerTranscriptFeatureUi,
        syncComposerExposureUi,
        syncComposerSurfacePointsUi,
        syncComposerOpticsUi,
        onComposerOpticsToggleClick,
        setComposerAmbient,
        setComposerEarthshineGain,
        setComposerMoonshineGain,
        onComposerCloudsChange,
        onComposerLunarCratersPillClick,
        onComposerSurfacePointsPillClick,
        onComposerSurfacePointsCloseClick,
        onComposerSurfacePointToggle,
        syncComposerRollUi,
        onComposerRollInput,
        onComposerRollDialPointerDown,
        onComposerRollDialPointerMove,
        releaseComposerRollDial,
        onComposerRaDecGridToggle,
        onComposerSkyLabelsToggle,
        onComposerConstellationLinesToggle,
        onComposerConstellationLabelsToggle,
    } = actions;
    const {
        onComposerLookFreeClick,
        onComposerLookEarthClick,
        onComposerLookMoonClick,
        onComposerResetClick,
        onComposerEarthAmbientInput,
        onComposerMoonAmbientInput,
        onComposerEarthshineInput,
        onComposerMoonshineInput,
        onComposerMoonOutlineToggle,
        onComposerSeeThroughToggle,
        onComposerOpticsPhysicalClick,
        onComposerOpticsCameraClick,
        onComposerExposureInput,
        onComposerAutoExposureChange,
        onComposerOpticsStrengthInput,
        onComposerOpticsHaloInput,
        onComposerOpticsStarburstInput,
        onComposerOpticsFlareInput,
        onComposerEclipseCoronaIntensityInput,
        onComposerEclipseCoronaMotionInput,
        onComposerEclipseCoronaStructureInput,
        onComposerEclipseZodiacalDustInput,
        onComposerStarMagnitudeInput,
        onComposerTranscriptWindowInput,
        onComposerTranscriptHoldInput,
        onComposerTranscriptSyncedChange,
        onComposerTranscriptPrevClick,
        onComposerTranscriptNextClick,
        onComposerLunarFeatureStackCloseClick,
        onComposerLunarFeatureStackRestoreClick,
        onComposerLunarFeatureStackPointerDown,
        onComposerLunarFeatureStackPointerMove,
        releaseComposerLunarFeatureStack,
        onComposerInfoOverlayToggle,
        onComposerTimelineInput,
        onComposerTimelinePointerDown,
        onComposerTimelinePointerUp,
        onComposerPhasePrevClick,
        onComposerPhaseNextClick,
        onComposerTimelinePopupDocumentPointerDown,
        onComposerTransportPlayClick,
        onComposerTransportMinusSecondClick,
        onComposerTransportMinusMinuteClick,
        onComposerTransportPlusMinuteClick,
        onComposerTransportPlusSecondClick,
        onComposerTransportSlowerClick,
        onComposerTransportSpeedClick,
        onComposerTransportFasterClick,
        onComposerViewportWheel,
        onComposerViewportPointerDown,
        onComposerViewportPointerMove,
        onComposerViewportPointerLeave,
        releaseComposerViewport,
        onComposerPanelGatePointerDown,
        stopComposerOverlayPanelEvent,
    } = handlers;
    panelState.composerLookFreeButton?.addEventListener("click", onComposerLookFreeClick);

    panelState.composerLookEarthButton?.addEventListener("click", onComposerLookEarthClick);

    panelState.composerLookMoonButton?.addEventListener("click", onComposerLookMoonClick);

    panelState.composerResetButton?.addEventListener("click", onComposerResetClick);

    panelState.composerEarthAmbientSlider?.addEventListener("input", onComposerEarthAmbientInput, { passive: true });

    panelState.composerMoonAmbientSlider?.addEventListener("input", onComposerMoonAmbientInput, { passive: true });

    panelState.composerEarthshineSlider?.addEventListener("input", onComposerEarthshineInput, { passive: true });

    panelState.composerMoonshineSlider?.addEventListener("input", onComposerMoonshineInput, { passive: true });

    panelState.composerMoonOutlineCheckbox?.addEventListener("change", onComposerMoonOutlineToggle);

    panelState.composerSeeThroughCheckbox?.addEventListener("change", onComposerSeeThroughToggle);

    panelState.composerOpticsToggleButton?.addEventListener("click", onComposerOpticsToggleClick);

    panelState.composerOpticsPhysicalButton?.addEventListener("click", onComposerOpticsPhysicalClick);

    panelState.composerOpticsCameraButton?.addEventListener("click", onComposerOpticsCameraClick);

    panelState.composerExposureSlider?.addEventListener("input", onComposerExposureInput, { passive: true });

    panelState.composerAutoExposureCheckbox?.addEventListener("change", onComposerAutoExposureChange);

    panelState.composerOpticsStrengthSlider?.addEventListener("input", onComposerOpticsStrengthInput, { passive: true });

    panelState.composerOpticsHaloSlider?.addEventListener("input", onComposerOpticsHaloInput, { passive: true });

    panelState.composerOpticsStarburstSlider?.addEventListener("input", onComposerOpticsStarburstInput, { passive: true });

    panelState.composerOpticsFlareSlider?.addEventListener("input", onComposerOpticsFlareInput, { passive: true });

    panelState.composerEclipseCoronaIntensitySlider?.addEventListener("input", onComposerEclipseCoronaIntensityInput, { passive: true });

    panelState.composerEclipseCoronaMotionSlider?.addEventListener("input", onComposerEclipseCoronaMotionInput, { passive: true });

    panelState.composerEclipseCoronaStructureSlider?.addEventListener("input", onComposerEclipseCoronaStructureInput, { passive: true });

    panelState.composerEclipseZodiacalDustSlider?.addEventListener("input", onComposerEclipseZodiacalDustInput, { passive: true });

    panelState.composerStarMagnitudeSlider?.addEventListener("input", onComposerStarMagnitudeInput, { passive: true });

    panelState.composerTranscriptSyncedCheckbox?.addEventListener("change", onComposerTranscriptSyncedChange);

    panelState.composerTranscriptWindowSlider?.addEventListener("input", onComposerTranscriptWindowInput, { passive: true });

    panelState.composerTranscriptHoldSlider?.addEventListener("input", onComposerTranscriptHoldInput, { passive: true });

    panelState.composerTranscriptPrevButton?.addEventListener("click", onComposerTranscriptPrevClick);

    panelState.composerTranscriptNextButton?.addEventListener("click", onComposerTranscriptNextClick);

    panelState.composerLunarFeatureStackCloseButton?.addEventListener("click", onComposerLunarFeatureStackCloseClick);

    panelState.composerLunarFeatureStackRestoreButton?.addEventListener("click", onComposerLunarFeatureStackRestoreClick);

    panelState.composerLunarFeatureStackHeader?.addEventListener("pointerdown", onComposerLunarFeatureStackPointerDown);

    panelState.composerLunarFeatureStackHeader?.addEventListener("pointermove", onComposerLunarFeatureStackPointerMove);

    panelState.composerLunarFeatureStackHeader?.addEventListener("pointerup", releaseComposerLunarFeatureStack);

    panelState.composerLunarFeatureStackHeader?.addEventListener("pointercancel", releaseComposerLunarFeatureStack);

    panelState.composerCloudsCheckbox?.addEventListener("change", onComposerCloudsChange);

    panelState.composerLunarCratersPill?.addEventListener("click", onComposerLunarCratersPillClick);

    if (panelState.composerLunarCraterControls) {
        panelState.composerLunarCraterControls.panel?.addEventListener?.("pointerdown", stopComposerOverlayPanelEvent);
        panelState.composerLunarCraterControls.panel?.addEventListener?.("click", stopComposerOverlayPanelEvent);
        panelState.composerLunarCraterControls.panel?.addEventListener?.("wheel", stopComposerOverlayPanelEvent);
        panelState.unbindComposerLunarCraterControls =
            panelState.composerLunarFeatureAttachment?.bind?.() || null;
    }

    panelState.composerSurfacePointsPill?.addEventListener("click", onComposerSurfacePointsPillClick);

    panelState.composerSurfacePointControls?.panel?.addEventListener?.("pointerdown", stopComposerOverlayPanelEvent);

    panelState.composerSurfacePointControls?.panel?.addEventListener?.("click", stopComposerOverlayPanelEvent);

    panelState.composerSurfacePointControls?.panel?.addEventListener?.("wheel", stopComposerOverlayPanelEvent);

    panelState.composerSurfacePointControls?.close?.addEventListener("click", onComposerSurfacePointsCloseClick);

    panelState.composerSurfacePointControls?.entries?.forEach?.(({ input }) => {
        input?.addEventListener?.("change", onComposerSurfacePointToggle);
    });

    panelState.composerTimelineSlider?.addEventListener("input", onComposerTimelineInput, { passive: true });

    panelState.composerTimelineSlider?.addEventListener("pointerdown", onComposerTimelinePointerDown);

    panelState.composerTimelineSlider?.addEventListener("pointerup", onComposerTimelinePointerUp);

    panelState.composerTimelineSlider?.addEventListener("change", onComposerTimelinePointerUp);

    panelState.composerPhasePrevButton?.addEventListener("click", onComposerPhasePrevClick);

    panelState.composerPhaseNextButton?.addEventListener("click", onComposerPhaseNextClick);

    document.addEventListener("pointerdown", onComposerTimelinePopupDocumentPointerDown, true);

    panelState.composerTransportPlayButton?.addEventListener("click", onComposerTransportPlayClick);

    panelState.composerTransportMinusSecondButton?.addEventListener("click", onComposerTransportMinusSecondClick);

    panelState.composerTransportMinusMinuteButton?.addEventListener("click", onComposerTransportMinusMinuteClick);

    panelState.composerTransportPlusMinuteButton?.addEventListener("click", onComposerTransportPlusMinuteClick);

    panelState.composerTransportPlusSecondButton?.addEventListener("click", onComposerTransportPlusSecondClick);

    panelState.composerTransportSlowerButton?.addEventListener("click", onComposerTransportSlowerClick);

    panelState.composerTransportSpeedButton?.addEventListener("click", onComposerTransportSpeedClick);

    panelState.composerTransportFasterButton?.addEventListener("click", onComposerTransportFasterClick);

    panelState.composerInfoOverlayCheckbox?.addEventListener("change", onComposerInfoOverlayToggle);

    panelState.composerRollSlider?.addEventListener("input", onComposerRollInput, { passive: true });

    panelState.composerRollDial?.addEventListener("pointerdown", onComposerRollDialPointerDown);

    panelState.composerRollDial?.addEventListener("pointermove", onComposerRollDialPointerMove);

    panelState.composerRollDial?.addEventListener("pointerup", releaseComposerRollDial);

    panelState.composerRollDial?.addEventListener("pointercancel", releaseComposerRollDial);

    panelState.composerRaDecGridCheckbox?.addEventListener("change", onComposerRaDecGridToggle);

    panelState.composerSkyLabelsCheckbox?.addEventListener("change", onComposerSkyLabelsToggle);

    panelState.composerConstellationLinesCheckbox?.addEventListener("change", onComposerConstellationLinesToggle);

    panelState.composerConstellationLabelsCheckbox?.addEventListener("change", onComposerConstellationLabelsToggle);

    panelState.viewport.addEventListener("wheel", onComposerViewportWheel, { passive: false });

    panelState.viewport.addEventListener("pointerdown", onComposerViewportPointerDown);

    panelState.viewport.addEventListener("pointermove", onComposerViewportPointerMove);

    panelState.viewport.addEventListener("pointerleave", onComposerViewportPointerLeave);

    panelState.viewport.addEventListener("pointerup", releaseComposerViewport);

    panelState.viewport.addEventListener("pointercancel", releaseComposerViewport);

    panelState.panel.addEventListener("pointerdown", onComposerPanelGatePointerDown, true);

    panelState.onComposerLookFreeClick = onComposerLookFreeClick;

    panelState.onComposerLookEarthClick = onComposerLookEarthClick;

    panelState.onComposerLookMoonClick = onComposerLookMoonClick;

    panelState.onComposerResetClick = onComposerResetClick;

    panelState.onComposerEarthAmbientInput = onComposerEarthAmbientInput;

    panelState.onComposerMoonAmbientInput = onComposerMoonAmbientInput;

    panelState.onComposerEarthshineInput = onComposerEarthshineInput;

    panelState.onComposerMoonshineInput = onComposerMoonshineInput;

    panelState.onComposerMoonOutlineToggle = onComposerMoonOutlineToggle;

    panelState.onComposerSeeThroughToggle = onComposerSeeThroughToggle;

    panelState.onComposerOpticsToggleClick = onComposerOpticsToggleClick;

    panelState.onComposerOpticsPhysicalClick = onComposerOpticsPhysicalClick;

    panelState.onComposerOpticsCameraClick = onComposerOpticsCameraClick;

    panelState.onComposerExposureInput = onComposerExposureInput;

    panelState.onComposerAutoExposureChange = onComposerAutoExposureChange;

    panelState.onComposerOpticsStrengthInput = onComposerOpticsStrengthInput;

    panelState.onComposerOpticsHaloInput = onComposerOpticsHaloInput;

    panelState.onComposerOpticsStarburstInput = onComposerOpticsStarburstInput;

    panelState.onComposerOpticsFlareInput = onComposerOpticsFlareInput;

    panelState.onComposerEclipseCoronaIntensityInput = onComposerEclipseCoronaIntensityInput;

    panelState.onComposerEclipseCoronaMotionInput = onComposerEclipseCoronaMotionInput;

    panelState.onComposerEclipseCoronaStructureInput = onComposerEclipseCoronaStructureInput;

    panelState.onComposerEclipseZodiacalDustInput = onComposerEclipseZodiacalDustInput;

    panelState.onComposerStarMagnitudeInput = onComposerStarMagnitudeInput;

    panelState.onComposerTranscriptSyncedChange = onComposerTranscriptSyncedChange;

    panelState.onComposerTranscriptWindowInput = onComposerTranscriptWindowInput;

    panelState.onComposerTranscriptHoldInput = onComposerTranscriptHoldInput;

    panelState.onComposerTranscriptPrevClick = onComposerTranscriptPrevClick;

    panelState.onComposerTranscriptNextClick = onComposerTranscriptNextClick;

    panelState.onComposerLunarFeatureStackCloseClick = onComposerLunarFeatureStackCloseClick;

    panelState.onComposerLunarFeatureStackRestoreClick = onComposerLunarFeatureStackRestoreClick;

    panelState.onComposerLunarFeatureStackPointerDown = onComposerLunarFeatureStackPointerDown;

    panelState.onComposerLunarFeatureStackPointerMove = onComposerLunarFeatureStackPointerMove;

    panelState.onComposerLunarFeatureStackPointerUp = releaseComposerLunarFeatureStack;

    panelState.onComposerCloudsChange = onComposerCloudsChange;

    panelState.onComposerLunarCratersPillClick = onComposerLunarCratersPillClick;

    panelState.onComposerSurfacePointsPillClick = onComposerSurfacePointsPillClick;

    panelState.onComposerSurfacePointsCloseClick = onComposerSurfacePointsCloseClick;

    panelState.onComposerSurfacePointToggle = onComposerSurfacePointToggle;

    panelState.onComposerTimelineInput = onComposerTimelineInput;

    panelState.onComposerTimelinePointerDown = onComposerTimelinePointerDown;

    panelState.onComposerTimelinePointerUp = onComposerTimelinePointerUp;

    panelState.onComposerPhasePrevClick = onComposerPhasePrevClick;

    panelState.onComposerPhaseNextClick = onComposerPhaseNextClick;

    panelState.onComposerTimelinePopupDocumentPointerDown = onComposerTimelinePopupDocumentPointerDown;

    panelState.onComposerTransportPlayClick = onComposerTransportPlayClick;

    panelState.onComposerTransportMinusSecondClick = onComposerTransportMinusSecondClick;

    panelState.onComposerTransportMinusMinuteClick = onComposerTransportMinusMinuteClick;

    panelState.onComposerTransportPlusMinuteClick = onComposerTransportPlusMinuteClick;

    panelState.onComposerTransportPlusSecondClick = onComposerTransportPlusSecondClick;

    panelState.onComposerTransportSlowerClick = onComposerTransportSlowerClick;

    panelState.onComposerTransportSpeedClick = onComposerTransportSpeedClick;

    panelState.onComposerTransportFasterClick = onComposerTransportFasterClick;

    panelState.onComposerInfoOverlayToggle = onComposerInfoOverlayToggle;

    panelState.onComposerRollInput = onComposerRollInput;

    panelState.onComposerRollDialPointerDown = onComposerRollDialPointerDown;

    panelState.onComposerRollDialPointerMove = onComposerRollDialPointerMove;

    panelState.onComposerRollDialPointerUp = releaseComposerRollDial;

    panelState.onComposerRaDecGridToggle = onComposerRaDecGridToggle;

    panelState.onComposerSkyLabelsToggle = onComposerSkyLabelsToggle;

    panelState.onComposerConstellationLinesToggle = onComposerConstellationLinesToggle;

    panelState.onComposerConstellationLabelsToggle = onComposerConstellationLabelsToggle;

    panelState.onComposerViewportWheel = onComposerViewportWheel;

    panelState.onComposerViewportPointerDown = onComposerViewportPointerDown;

    panelState.onComposerViewportPointerMove = onComposerViewportPointerMove;

    panelState.onComposerViewportPointerLeave = onComposerViewportPointerLeave;

    panelState.onComposerViewportPointerUp = releaseComposerViewport;

    panelState.onComposerPanelGatePointerDown = onComposerPanelGatePointerDown;

    panelState.onComposerOverlayPanelEvent = stopComposerOverlayPanelEvent;

    panelState.syncComposerLockUi = syncComposerLockUi;

    panelState.syncComposerRollUi = syncComposerRollUi;

    panelState.syncComposerAutoToggleUi = syncAutoToggleUi;

    panelState.syncComposerExposureUi = syncComposerExposureUi;

    panelState.syncComposerCloudsUi = syncComposerCloudsUi;

    panelState.syncComposerLunarCratersUi = syncComposerLunarCratersUi;

    panelState.syncComposerSurfacePointsUi = syncComposerSurfacePointsUi;

    setComposerAmbient("composerEarthAmbient", panelState.composerEarthAmbient, { persist: false });

    setComposerAmbient("composerMoonAmbient", panelState.composerMoonAmbient, { persist: false });

    setComposerEarthshineGain(panelState.composerEarthshineGain, { persist: false });

    setComposerMoonshineGain(panelState.composerMoonshineGain, { persist: false });

    syncComposerLockUi();

    syncComposerOpticsUi();

    syncComposerStarMagnitudeUi();

    syncComposerTranscriptFeatureUi();

    syncComposerCloudsUi?.();

    syncComposerLunarCratersUi?.();

    syncComposerSurfacePointsUi?.();

    syncComposerRollUi();
}
