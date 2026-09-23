import { createComposerOpticsContent } from "./auxiliary-camera-composer-optics-content.js";

// Builds the panel content tree. Event wiring and persisted state remain in the owning factory.
export function createAuxiliaryCameraPanelContent({
    THREE,
    spec,
    panel,
    panelMode,
    headerControls,
    fovControls,
    composerControlsToggleButton,
}, dependencies) {
    const {
        COMPOSER_CONTROLS_PANEL_ID,
        COMPOSER_DEFAULT_EARTHSHINE_GAIN,
        COMPOSER_DEFAULT_EARTH_AMBIENT,
        COMPOSER_DEFAULT_MOONSHINE_GAIN,
        COMPOSER_DEFAULT_MOON_AMBIENT,
        COMPOSER_DEFAULT_ROLL_RAD,
        COMPOSER_ECLIPSE_CORONA_DEFAULT,
        COMPOSER_ECLIPSE_CORONA_MAX,
        COMPOSER_ECLIPSE_CORONA_MIN,
        COMPOSER_ECLIPSE_CORONA_VARIATION_DEFAULT,
        COMPOSER_ECLIPSE_ZODIACAL_DUST_DEFAULT,
        COMPOSER_EXPOSURE_EV_DEFAULT,
        COMPOSER_EXPOSURE_EV_MAX,
        COMPOSER_EXPOSURE_EV_MIN,
        COMPOSER_LUNAR_FEATURE_STACK_ACTIVE_LEAD_SECONDS,
        COMPOSER_LUNAR_FEATURE_STACK_ACTIVE_TRAIL_SECONDS,
        COMPOSER_LUNAR_FEATURE_STACK_VISIBLE_WINDOW_SECONDS,
        COMPOSER_MAX_AMBIENT,
        COMPOSER_MAX_EARTHSHINE_GAIN,
        COMPOSER_MAX_MOONSHINE_GAIN,
        COMPOSER_MIN_AMBIENT,
        COMPOSER_MIN_EARTHSHINE_GAIN,
        COMPOSER_MIN_MOONSHINE_GAIN,
        COMPOSER_OPTICS_ADVANCED_DEFAULT,
        COMPOSER_OPTICS_ADVANCED_MAX,
        COMPOSER_OPTICS_ADVANCED_MIN,
        COMPOSER_OPTICS_STRENGTH_DEFAULT,
        COMPOSER_OPTICS_STRENGTH_MAX,
        COMPOSER_OPTICS_STRENGTH_MIN,
        COMPOSER_STAR_MAGNITUDE_DEFAULT,
        COMPOSER_STAR_MAGNITUDE_MAX,
        COMPOSER_STAR_MAGNITUDE_MIN,
        COMPOSER_TIMELINE_RESOLUTION,
        createComposerSurfacePointControls,
        createLunarCraterControlPanelElements,
    } = dependencies;
let info = null;
let infoPrimary = null;
let infoPrimaryText = null;
let infoPill = null;
let infoSecondary = null;
let composerPresetWrap = null;
let composerLookFreeButton = null;
let composerLookEarthButton = null;
let composerLookMoonButton = null;
let composerControlMatrix = null;
let composerSkyControlsWrap = null;
let composerSkyTimelineWrap = null;
let composerInfoRow = null;
let composerFovWrap = null;
let composerTimelineWrap = null;
let composerTransportRow = null;
let composerTransportPlayButton = null;
let composerTransportMinusSecondButton = null;
let composerTransportMinusMinuteButton = null;
let composerTransportPlusMinuteButton = null;
let composerTransportPlusSecondButton = null;
let composerTransportSlowerButton = null;
let composerTransportSpeedButton = null;
let composerTransportFasterButton = null;
let composerPhasePrevButton = null;
let composerPhaseDetails = null;
let composerPhaseSummary = null;
let composerPhaseOptionsWrap = null;
let composerPhaseNextButton = null;
let composerTimelineSlider = null;
let composerTimelineLabel = null;
let composerTimelineLocalValue = null;
let composerFlybyEventsDetails = null;
let composerFlybyEventsSummary = null;
let composerFlybyEventsWrap = null;
let composerControlsWrap = null;
let composerResetButton = null;
let composerEarthAmbientSlider = null;
let composerEarthAmbientValue = null;
let composerMoonAmbientSlider = null;
let composerMoonAmbientValue = null;
let composerEarthshineSlider = null;
let composerEarthshineValue = null;
let composerMoonshineSlider = null;
let composerMoonshineValue = null;
let composerMoonOutlineWrap = null;
let composerMoonOutlineCheckbox = null;
let composerSeeThroughWrap = null;
let composerSeeThroughCheckbox = null;
let composerOpticsWrap = null;
let composerOpticsBody = null;
let composerOpticsToggleButton = null;
let composerOpticsPhysicalButton = null;
let composerOpticsCameraButton = null;
let composerExposureSlider = null;
let composerExposureValue = null;
let composerExposureTotalValue = null;
let composerAutoExposureWrap = null;
let composerAutoExposureCheckbox = null;
let composerOpticsStrengthSlider = null;
let composerOpticsStrengthValue = null;
let composerOpticsAdvancedPanel = null;
let composerOpticsHaloSlider = null;
let composerOpticsHaloValue = null;
let composerOpticsStarburstSlider = null;
let composerOpticsStarburstValue = null;
let composerOpticsFlareSlider = null;
let composerOpticsFlareValue = null;
let composerEclipseCoronaPanel = null;
let composerEclipseCoronaIntensitySlider = null;
let composerEclipseCoronaIntensityValue = null;
let composerEclipseCoronaMotionSlider = null;
let composerEclipseCoronaMotionValue = null;
let composerEclipseCoronaStructureSlider = null;
let composerEclipseCoronaStructureValue = null;
let composerEclipseZodiacalDustSlider = null;
let composerEclipseZodiacalDustValue = null;
let composerRollWrap = null;
let composerRollSlider = null;
let composerRollValue = null;
let composerRollDial = null;
let composerRollDialKnob = null;
let composerRollDialValue = null;
let composerInfoOverlayWrap = null;
let composerInfoOverlayCheckbox = null;
let composerRaDecGridWrap = null;
let composerRaDecGridCheckbox = null;
let composerSkyLabelsWrap = null;
let composerSkyLabelsCheckbox = null;
let composerConstellationLinesWrap = null;
let composerConstellationLinesCheckbox = null;
let composerConstellationLabelsWrap = null;
let composerConstellationLabelsCheckbox = null;
let composerCloudsWrap = null;
let composerCloudsCheckbox = null;
let composerLunarCratersWrap = null;
let composerLunarCratersPill = null;
let composerLunarCraterControls = null;
let composerMoonRenderPill = null;
let composerSurfacePointsWrap = null;
let composerSurfacePointsPill = null;
let composerSurfacePointControls = null;
let composerTranscriptSyncedCheckbox = null;
let composerTranscriptWindowSlider = null;
let composerTranscriptWindowValue = null;
let composerTranscriptHoldSlider = null;
let composerTranscriptHoldValue = null;
let composerTranscriptPrevButton = null;
let composerTranscriptNextButton = null;
let composerStarMagnitudeSlider = null;
let composerStarMagnitudeValue = null;
let composerHint = null;
let composerMetricsStrip = null;
let composerLunarFeatureStack = null;
let composerLunarFeatureStackHeader = null;
let composerLunarFeatureStackList = null;
let composerLunarFeatureStackCloseButton = null;
let composerLunarFeatureStackRestoreButton = null;
let composerMetricFovHValue = null;
let composerMetricFovVValue = null;
let composerMetricDistanceMoonValue = null;
let composerMetricAngleValue = null;
let composerDisabledOverlay = null;
if (panelMode === "composer") {
    if (headerControls.contains(fovControls)) {
        headerControls.removeChild(fovControls);
    }
    composerControlMatrix = document.createElement("div");
    composerControlMatrix.className = "aux-camera-view__composer-control-matrix";
    composerControlMatrix.id = COMPOSER_CONTROLS_PANEL_ID;
    composerControlMatrix.dataset.panelId = COMPOSER_CONTROLS_PANEL_ID;
    if (composerControlsToggleButton) {
        composerControlMatrix.appendChild(composerControlsToggleButton);
    }

    composerSkyControlsWrap = document.createElement("div");
    composerSkyControlsWrap.className = "aux-camera-view__composer-sky-controls";
    composerSkyTimelineWrap = document.createElement("div");
    composerSkyTimelineWrap.className = "aux-camera-view__composer-sky-timeline";

    composerInfoRow = document.createElement("div");
    composerInfoRow.className = "aux-camera-view__composer-info-row";
    const composerInfoLabel = document.createElement("span");
    composerInfoLabel.className = "aux-camera-view__composer-label aux-camera-view__composer-row-label";
    composerInfoLabel.textContent = "Overlays";
    composerInfoRow.appendChild(composerInfoLabel);

    const composerInfoToggles = document.createElement("div");
    composerInfoToggles.className = "aux-camera-view__composer-lock-buttons";

    composerInfoOverlayWrap = document.createElement("label");
    composerInfoOverlayWrap.className = "aux-camera-view__composer-grid-toggle";
    composerInfoOverlayCheckbox = document.createElement("input");
    composerInfoOverlayCheckbox.type = "checkbox";
    composerInfoOverlayCheckbox.setAttribute("aria-label", "Toggle composer info overlay");
    const composerInfoOverlayText = document.createElement("span");
    composerInfoOverlayText.textContent = "Info";
    composerInfoOverlayWrap.appendChild(composerInfoOverlayCheckbox);
    composerInfoOverlayWrap.appendChild(composerInfoOverlayText);
    composerInfoToggles.appendChild(composerInfoOverlayWrap);

    composerSkyLabelsWrap = document.createElement("label");
    composerSkyLabelsWrap.className = "aux-camera-view__composer-grid-toggle";
    composerSkyLabelsCheckbox = document.createElement("input");
    composerSkyLabelsCheckbox.type = "checkbox";
    composerSkyLabelsCheckbox.setAttribute("aria-label", "Toggle composer sky labels");
    composerSkyLabelsCheckbox.dataset.proofId = "sky-labels-toggle";
    const composerSkyLabelsText = document.createElement("span");
    composerSkyLabelsText.textContent = "Labels";
    composerSkyLabelsWrap.appendChild(composerSkyLabelsCheckbox);
    composerSkyLabelsWrap.appendChild(composerSkyLabelsText);
    composerInfoToggles.appendChild(composerSkyLabelsWrap);

    composerConstellationLinesWrap = document.createElement("label");
    composerConstellationLinesWrap.className = "aux-camera-view__composer-grid-toggle";
    composerConstellationLinesCheckbox = document.createElement("input");
    composerConstellationLinesCheckbox.type = "checkbox";
    composerConstellationLinesCheckbox.setAttribute("aria-label", "Toggle composer constellation lines");
    composerConstellationLinesCheckbox.dataset.proofId = "constellation-lines-toggle";
    const composerConstellationLinesText = document.createElement("span");
    composerConstellationLinesText.textContent = "Constellations";
    composerConstellationLinesWrap.appendChild(composerConstellationLinesCheckbox);
    composerConstellationLinesWrap.appendChild(composerConstellationLinesText);
    composerInfoToggles.appendChild(composerConstellationLinesWrap);

    composerConstellationLabelsWrap = document.createElement("label");
    composerConstellationLabelsWrap.className = "aux-camera-view__composer-grid-toggle";
    composerConstellationLabelsCheckbox = document.createElement("input");
    composerConstellationLabelsCheckbox.type = "checkbox";
    composerConstellationLabelsCheckbox.setAttribute("aria-label", "Toggle composer constellation labels");
    composerConstellationLabelsCheckbox.dataset.proofId = "constellation-labels-toggle";
    const composerConstellationLabelsText = document.createElement("span");
    composerConstellationLabelsText.textContent = "Const Labels";
    composerConstellationLabelsWrap.appendChild(composerConstellationLabelsCheckbox);
    composerConstellationLabelsWrap.appendChild(composerConstellationLabelsText);
    composerInfoToggles.appendChild(composerConstellationLabelsWrap);

    composerCloudsWrap = document.createElement("label");
    composerCloudsWrap.className = "aux-camera-view__composer-grid-toggle";
    composerCloudsCheckbox = document.createElement("input");
    composerCloudsCheckbox.type = "checkbox";
    composerCloudsCheckbox.checked = true;
    composerCloudsCheckbox.setAttribute("aria-label", "Toggle Earth cloud cover");
    composerCloudsCheckbox.dataset.proofId = "clouds-toggle";
    const composerCloudsText = document.createElement("span");
    composerCloudsText.textContent = "Clouds";
    composerCloudsWrap.appendChild(composerCloudsCheckbox);
    composerCloudsWrap.appendChild(composerCloudsText);
    composerInfoToggles.appendChild(composerCloudsWrap);

    composerInfoRow.appendChild(composerInfoToggles);

    const composerCraterRow = document.createElement("div");
    composerCraterRow.className = "aux-camera-view__composer-crater-row";
    composerLunarCratersWrap = document.createElement("div");
    composerLunarCratersWrap.className = "aux-camera-view__composer-crater-control";
    composerLunarCratersPill = document.createElement("button");
    composerLunarCratersPill.type = "button";
    composerLunarCratersPill.className = "aux-camera-view__composer-pill";
    composerLunarCratersPill.setAttribute("aria-label", "Open Frame and Shoot lunar feature controls");
    composerLunarCratersPill.setAttribute("aria-haspopup", "dialog");
    composerLunarCratersPill.setAttribute("aria-expanded", "false");
    composerLunarCratersPill.setAttribute("aria-pressed", "false");
    composerLunarCratersPill.dataset.proofId = "lunar-craters-toggle";
    composerLunarCratersPill.textContent = "Lunar Features";
    composerLunarCraterControls = createLunarCraterControlPanelElements(document, {
        idPrefix: "composer-lunar-crater",
        enableSyncedScope: true,
        initialFilterScope: "synced",
    });
    composerLunarCraterControls.pill = composerLunarCratersPill;
    composerLunarCratersPill.setAttribute("aria-controls", composerLunarCraterControls.panel.id);
    composerLunarCratersWrap.appendChild(composerLunarCratersPill);
    composerLunarCratersWrap.appendChild(composerLunarCraterControls.panel);
    composerCraterRow.appendChild(composerLunarCratersWrap);

    composerMoonRenderPill = document.createElement("button");
    composerMoonRenderPill.type = "button";
    composerMoonRenderPill.className = "aux-camera-view__composer-pill";
    composerMoonRenderPill.setAttribute("aria-label", "Open Frame and Shoot Moon render controls");
    composerMoonRenderPill.setAttribute("aria-haspopup", "dialog");
    composerMoonRenderPill.setAttribute("aria-expanded", "false");
    composerMoonRenderPill.setAttribute("aria-controls", "moon-render-pipeline-panel");
    composerMoonRenderPill.dataset.moonRenderPanelTrigger = "true";
    composerMoonRenderPill.dataset.proofId = "moon-render-toggle";
    composerMoonRenderPill.textContent = "Moon Render";
    composerMoonRenderPill.addEventListener("click", (event) => {
        event.stopPropagation();
        document.dispatchEvent(new CustomEvent("moon-mission:moon-render-panel-request", {
            detail: { trigger: composerMoonRenderPill },
        }));
    });
    composerCraterRow.appendChild(composerMoonRenderPill);

    composerSurfacePointsWrap = document.createElement("div");
    composerSurfacePointsWrap.className = "aux-camera-view__composer-crater-control aux-camera-view__composer-surface-point-control";
    composerSurfacePointsPill = document.createElement("button");
    composerSurfacePointsPill.type = "button";
    composerSurfacePointsPill.className = "aux-camera-view__composer-pill";
    composerSurfacePointsPill.setAttribute("aria-label", "Open Frame and Shoot surface point controls");
    composerSurfacePointsPill.setAttribute("aria-haspopup", "dialog");
    composerSurfacePointsPill.setAttribute("aria-expanded", "false");
    composerSurfacePointsPill.setAttribute("aria-pressed", "false");
    composerSurfacePointsPill.dataset.proofId = "surface-points-toggle";
    composerSurfacePointsPill.textContent = "Surface Points";
    composerSurfacePointControls = createComposerSurfacePointControls(document);
    composerSurfacePointControls.pill = composerSurfacePointsPill;
    composerSurfacePointControls.panel.id = "composer-surface-points-controls-panel";
    composerSurfacePointsPill.setAttribute("aria-controls", composerSurfacePointControls.panel.id);
    composerSurfacePointsWrap.appendChild(composerSurfacePointsPill);
    composerSurfacePointsWrap.appendChild(composerSurfacePointControls.panel);
    composerCraterRow.appendChild(composerSurfacePointsWrap);

    composerLunarFeatureStackRestoreButton = document.createElement("button");
    composerLunarFeatureStackRestoreButton.type = "button";
    composerLunarFeatureStackRestoreButton.className = "aux-camera-view__composer-pill aux-camera-view__composer-feature-stack-restore";
    composerLunarFeatureStackRestoreButton.textContent = "Lunar Transcript";
    composerLunarFeatureStackRestoreButton.setAttribute("aria-label", "Show transcript lunar feature stack");
    composerLunarFeatureStackRestoreButton.hidden = true;
    composerCraterRow.appendChild(composerLunarFeatureStackRestoreButton);

    const composerTranscriptControls = composerLunarCraterControls.syncedControlsContainer;
    const composerTranscriptSyncedWrap = document.createElement("label");
    composerTranscriptSyncedWrap.className = "lunar-crater-controls-panel__synced-toggle";
    composerTranscriptSyncedCheckbox = document.createElement("input");
    composerTranscriptSyncedCheckbox.type = "checkbox";
    composerTranscriptSyncedCheckbox.id = "composer-lunar-crater-synced-enabled";
    composerTranscriptSyncedCheckbox.checked = true;
    composerTranscriptSyncedCheckbox.setAttribute("aria-label", "Enable transcript-synced lunar features");
    const composerTranscriptSyncedText = document.createElement("span");
    composerTranscriptSyncedText.textContent = "Transcript sync";
    composerTranscriptSyncedWrap.appendChild(composerTranscriptSyncedCheckbox);
    composerTranscriptSyncedWrap.appendChild(composerTranscriptSyncedText);
    composerTranscriptControls?.appendChild(composerTranscriptSyncedWrap);
    const createTranscriptSliderRow = ({ labelText, min, max, step, value }) => {
        const row = document.createElement("label");
        row.className = "lunar-crater-controls-panel__synced-row";
        const label = document.createElement("span");
        label.className = "lunar-crater-controls-panel__synced-label";
        label.textContent = labelText;
        const slider = document.createElement("input");
        slider.type = "range";
        slider.className = "lunar-crater-controls-panel__synced-slider";
        slider.min = String(min);
        slider.max = String(max);
        slider.step = String(step);
        slider.value = String(value);
        const output = document.createElement("output");
        output.className = "lunar-crater-controls-panel__synced-value";
        row.appendChild(label);
        row.appendChild(slider);
        row.appendChild(output);
        composerTranscriptControls?.appendChild(row);
        return { slider, output };
    };
    const stackWindowControls = createTranscriptSliderRow({
        labelText: "Stack",
        min: 60,
        max: 900,
        step: 30,
        value: COMPOSER_LUNAR_FEATURE_STACK_VISIBLE_WINDOW_SECONDS,
    });
    composerTranscriptWindowSlider = stackWindowControls.slider;
    composerTranscriptWindowValue = stackWindowControls.output;
    composerTranscriptWindowSlider.setAttribute("aria-label", "Transcript lunar feature stack window");
    const holdControls = createTranscriptSliderRow({
        labelText: "Hold",
        min: 5,
        max: 90,
        step: 5,
        value: COMPOSER_LUNAR_FEATURE_STACK_ACTIVE_LEAD_SECONDS + COMPOSER_LUNAR_FEATURE_STACK_ACTIVE_TRAIL_SECONDS,
    });
    composerTranscriptHoldSlider = holdControls.slider;
    composerTranscriptHoldValue = holdControls.output;
    composerTranscriptHoldSlider.setAttribute("aria-label", "Transcript lunar feature highlight hold");

    const composerStarMagnitudeRow = document.createElement("div");
    composerStarMagnitudeRow.className = "aux-camera-view__composer-optics-row aux-camera-view__composer-star-mag-row";
    const composerStarMagnitudeLabel = document.createElement("span");
    composerStarMagnitudeLabel.className = "aux-camera-view__composer-label";
    composerStarMagnitudeLabel.textContent = "Mag";
    composerStarMagnitudeRow.appendChild(composerStarMagnitudeLabel);
    composerStarMagnitudeSlider = document.createElement("input");
    composerStarMagnitudeSlider.type = "range";
    composerStarMagnitudeSlider.className = "aux-camera-view__composer-ambient-slider";
    composerStarMagnitudeSlider.min = String(COMPOSER_STAR_MAGNITUDE_MIN);
    composerStarMagnitudeSlider.max = String(COMPOSER_STAR_MAGNITUDE_MAX);
    composerStarMagnitudeSlider.step = "0.1";
    composerStarMagnitudeSlider.value = String(COMPOSER_STAR_MAGNITUDE_DEFAULT);
    composerStarMagnitudeSlider.setAttribute("aria-label", "Frame and Shoot limiting magnitude");
    composerStarMagnitudeSlider.dataset.proofId = "star-mag-slider";
    composerStarMagnitudeRow.appendChild(composerStarMagnitudeSlider);
    composerStarMagnitudeValue = document.createElement("output");
    composerStarMagnitudeValue.className = "aux-camera-view__composer-ambient-value";
    composerStarMagnitudeValue.value = COMPOSER_STAR_MAGNITUDE_DEFAULT.toFixed(1);
    composerStarMagnitudeValue.textContent = composerStarMagnitudeValue.value;
    composerStarMagnitudeRow.appendChild(composerStarMagnitudeValue);

    composerPresetWrap = document.createElement("div");
    composerPresetWrap.className = "aux-camera-view__composer-presets";
    const presetLabel = document.createElement("span");
    presetLabel.className = "aux-camera-view__composer-label aux-camera-view__composer-row-label";
    presetLabel.textContent = "Lock";
    composerPresetWrap.appendChild(presetLabel);

    const lockButtonStrip = document.createElement("div");
    lockButtonStrip.className = "aux-camera-view__composer-lock-buttons";

    composerLookFreeButton = document.createElement("button");
    composerLookFreeButton.type = "button";
    composerLookFreeButton.className = "aux-camera-view__composer-button";
    composerLookFreeButton.textContent = "Free";
    composerLookFreeButton.setAttribute("aria-label", "Flyby Planner unlock camera");
    lockButtonStrip.appendChild(composerLookFreeButton);

    composerLookEarthButton = document.createElement("button");
    composerLookEarthButton.type = "button";
    composerLookEarthButton.className = "aux-camera-view__composer-button";
    composerLookEarthButton.textContent = "Earth";
    composerLookEarthButton.setAttribute("aria-label", "Flyby Planner lock to Earth");
    composerLookEarthButton.dataset.proofId = "lock-earth";
    lockButtonStrip.appendChild(composerLookEarthButton);

    composerLookMoonButton = document.createElement("button");
    composerLookMoonButton.type = "button";
    composerLookMoonButton.className = "aux-camera-view__composer-button";
    composerLookMoonButton.textContent = "Moon";
    composerLookMoonButton.setAttribute("aria-label", "Flyby Planner lock to Moon");
    composerLookMoonButton.dataset.proofId = "lock-moon";
    lockButtonStrip.appendChild(composerLookMoonButton);
    composerPresetWrap.appendChild(lockButtonStrip);
    const composerSkyLockRow = document.createElement("div");
    composerSkyLockRow.className = "aux-camera-view__composer-sky-lock-row";
    composerSkyLockRow.appendChild(composerPresetWrap);
    composerSkyLockRow.appendChild(composerStarMagnitudeRow);

    composerFovWrap = document.createElement("div");
    composerFovWrap.className = "aux-camera-view__composer-fov";
    composerFovWrap.appendChild(fovControls);
    composerControlMatrix.appendChild(composerFovWrap);

    composerTimelineWrap = document.createElement("div");
    composerTimelineWrap.className = "aux-camera-view__composer-timeline";

    composerTransportRow = document.createElement("div");
    composerTransportRow.className = "aux-camera-view__composer-transport-row";

    const composerTransportCluster = document.createElement("div");
    composerTransportCluster.className = "controls-cluster controls-cluster--transport";

    composerTransportMinusMinuteButton = document.createElement("button");
    composerTransportMinusMinuteButton.type = "button";
    composerTransportMinusMinuteButton.className = "button";
    composerTransportMinusMinuteButton.textContent = "-1m";
    composerTransportMinusMinuteButton.setAttribute("aria-label", "Step timeline backward by one minute");
    composerTransportCluster.appendChild(composerTransportMinusMinuteButton);

    composerTransportMinusSecondButton = document.createElement("button");
    composerTransportMinusSecondButton.type = "button";
    composerTransportMinusSecondButton.className = "button";
    composerTransportMinusSecondButton.textContent = "-1s";
    composerTransportMinusSecondButton.setAttribute("aria-label", "Step phase timeline backward by one second");
    composerTransportCluster.appendChild(composerTransportMinusSecondButton);

    composerTransportPlusSecondButton = document.createElement("button");
    composerTransportPlusSecondButton.type = "button";
    composerTransportPlusSecondButton.className = "button";
    composerTransportPlusSecondButton.textContent = "+1s";
    composerTransportPlusSecondButton.setAttribute("aria-label", "Step phase timeline forward by one second");
    composerTransportCluster.appendChild(composerTransportPlusSecondButton);

    composerTransportPlusMinuteButton = document.createElement("button");
    composerTransportPlusMinuteButton.type = "button";
    composerTransportPlusMinuteButton.className = "button";
    composerTransportPlusMinuteButton.textContent = "+1m";
    composerTransportPlusMinuteButton.setAttribute("aria-label", "Step timeline forward by one minute");
    composerTransportCluster.appendChild(composerTransportPlusMinuteButton);

    composerTransportRow.appendChild(composerTransportCluster);

    const composerSpeedCluster = document.createElement("div");
    composerSpeedCluster.className = "controls-cluster controls-cluster--speed";

    composerTransportPlayButton = document.createElement("button");
    composerTransportPlayButton.type = "button";
    composerTransportPlayButton.className = "button button--primary";
    composerTransportPlayButton.textContent = "▶";
    composerTransportPlayButton.setAttribute("aria-label", "Play or pause animation");
    composerSpeedCluster.appendChild(composerTransportPlayButton);

    composerTransportSlowerButton = document.createElement("button");
    composerTransportSlowerButton.type = "button";
    composerTransportSlowerButton.className = "button button--icon";
    composerTransportSlowerButton.textContent = "−";
    composerTransportSlowerButton.setAttribute("aria-label", "Slower");
    composerSpeedCluster.appendChild(composerTransportSlowerButton);

    composerTransportSpeedButton = document.createElement("button");
    composerTransportSpeedButton.type = "button";
    composerTransportSpeedButton.className = "button button--realtime";
    composerTransportSpeedButton.textContent = "1 sec/sec";
    composerTransportSpeedButton.setAttribute("aria-label", "Current speed. Click to set realtime");
    composerSpeedCluster.appendChild(composerTransportSpeedButton);

    composerTransportFasterButton = document.createElement("button");
    composerTransportFasterButton.type = "button";
    composerTransportFasterButton.className = "button button--icon";
    composerTransportFasterButton.textContent = "+";
    composerTransportFasterButton.setAttribute("aria-label", "Faster");
    composerSpeedCluster.appendChild(composerTransportFasterButton);

    composerTransportRow.appendChild(composerSpeedCluster);
    composerTimelineWrap.appendChild(composerTransportRow);

    const composerPhaseLabel = document.createElement("span");
    composerPhaseLabel.className = "aux-camera-view__composer-label aux-camera-view__composer-row-label";
    composerPhaseLabel.textContent = "Phase";
    composerTimelineWrap.appendChild(composerPhaseLabel);

    const composerPhasePicker = document.createElement("div");
    composerPhasePicker.className = "aux-camera-view__composer-phase-picker";
    const composerPhaseControl = document.createElement("div");
    composerPhaseControl.className = "aux-camera-view__composer-phase-control";
    composerPhasePrevButton = document.createElement("button");
    composerPhasePrevButton.type = "button";
    composerPhasePrevButton.className = "aux-camera-view__composer-phase-step";
    composerPhasePrevButton.textContent = "◂";
    composerPhasePrevButton.setAttribute("aria-label", "Previous mission phase");
    composerPhaseControl.appendChild(composerPhasePrevButton);

    composerPhaseDetails = document.createElement("details");
    composerPhaseDetails.className = "aux-camera-view__composer-phase-pullup";
    composerPhaseSummary = document.createElement("summary");
    composerPhaseSummary.className = "aux-camera-view__composer-phase-pullup-summary";
    composerPhaseSummary.textContent = "Phase";
    composerPhaseDetails.appendChild(composerPhaseSummary);
    composerPhaseOptionsWrap = document.createElement("div");
    composerPhaseOptionsWrap.className = "aux-camera-view__composer-phase-options";
    composerPhaseDetails.appendChild(composerPhaseOptionsWrap);
    composerPhaseControl.appendChild(composerPhaseDetails);

    composerPhaseNextButton = document.createElement("button");
    composerPhaseNextButton.type = "button";
    composerPhaseNextButton.className = "aux-camera-view__composer-phase-step";
    composerPhaseNextButton.textContent = "▸";
    composerPhaseNextButton.setAttribute("aria-label", "Next mission phase");
    composerPhaseControl.appendChild(composerPhaseNextButton);
    composerPhasePicker.appendChild(composerPhaseControl);

    const composerFlybyEventPicker = document.createElement("div");
    composerFlybyEventPicker.className = "aux-camera-view__composer-event-picker";
    composerFlybyEventsDetails = document.createElement("details");
    composerFlybyEventsDetails.className = "aux-camera-view__composer-event-pullup";
    composerFlybyEventsSummary = document.createElement("summary");
    composerFlybyEventsSummary.className = "aux-camera-view__composer-event-pullup-summary";
    composerFlybyEventsSummary.textContent = "Events";
    composerFlybyEventsDetails.appendChild(composerFlybyEventsSummary);
    composerFlybyEventsWrap = document.createElement("div");
    composerFlybyEventsWrap.className = "aux-camera-view__composer-event-pills";
    composerFlybyEventsDetails.appendChild(composerFlybyEventsWrap);
    composerFlybyEventPicker.appendChild(composerFlybyEventsDetails);
    composerPhasePicker.appendChild(composerFlybyEventPicker);
    composerTimelineWrap.appendChild(composerPhasePicker);

    const composerPhaseValue = document.createElement("span");
    composerPhaseValue.className = "aux-camera-view__composer-value-slot";
    composerTimelineWrap.appendChild(composerPhaseValue);

    composerTimelineLabel = document.createElement("span");
    composerTimelineLabel.className = "aux-camera-view__composer-label aux-camera-view__composer-row-label";
    composerTimelineLabel.textContent = "Time";
    composerTimelineWrap.appendChild(composerTimelineLabel);
    composerTimelineSlider = document.createElement("input");
    composerTimelineSlider.type = "range";
    composerTimelineSlider.className = "aux-camera-view__composer-timeline-slider";
    composerTimelineSlider.min = "0";
    composerTimelineSlider.max = String(COMPOSER_TIMELINE_RESOLUTION);
    composerTimelineSlider.step = "1";
    composerTimelineSlider.value = String(Math.round(COMPOSER_TIMELINE_RESOLUTION * 0.5));
    composerTimelineSlider.setAttribute("aria-label", "Flyby Planner short timeline scrub");
    composerTimelineWrap.appendChild(composerTimelineSlider);
    const composerTimelineValue = document.createElement("span");
    composerTimelineValue.className = "aux-camera-view__composer-value-slot";
    composerTimelineWrap.appendChild(composerTimelineValue);
    composerTimelineLocalValue = document.createElement("span");
    composerTimelineLocalValue.className = "aux-camera-view__composer-timeline-local";
    composerTimelineLocalValue.textContent = "Local: --";
    composerTimelineWrap.appendChild(composerTimelineLocalValue);

    composerControlsWrap = document.createElement("div");
    composerControlsWrap.className = "aux-camera-view__composer-controls";

    const composerResetRow = document.createElement("div");
    composerResetRow.className = "aux-camera-view__composer-reset-row";
    const composerControlsLabel = document.createElement("span");
    composerControlsLabel.className = "aux-camera-view__composer-section-label";
    composerControlsLabel.textContent = "Controls";
    composerResetRow.appendChild(composerControlsLabel);
    composerResetButton = document.createElement("button");
    composerResetButton.type = "button";
    composerResetButton.className = "aux-camera-view__composer-button aux-camera-view__composer-reset-button";
    composerResetButton.textContent = "Reset";
    composerResetButton.setAttribute("aria-label", "Reset Frame and Shoot controls to defaults");
    composerResetButton.dataset.proofId = "composer-reset-button";
    composerResetRow.appendChild(composerResetButton);
    composerControlsWrap.appendChild(composerResetRow);

    const composerCreativeLabel = document.createElement("span");
    composerCreativeLabel.className = "aux-camera-view__composer-section-label";
    composerCreativeLabel.textContent = "Creative";
    composerControlsWrap.appendChild(composerCreativeLabel);

    const buildComposerSliderRow = (
        labelText,
        ariaLabel,
        defaultValue,
        {
            min = COMPOSER_MIN_AMBIENT,
            max = COMPOSER_MAX_AMBIENT,
            step = "0.01",
            proofId = "",
        } = {},
    ) => {
        const row = document.createElement("div");
        row.className = "aux-camera-view__composer-optics-row";

        const label = document.createElement("span");
        label.className = "aux-camera-view__composer-label";
        label.textContent = labelText;
        row.appendChild(label);

        const slider = document.createElement("input");
        slider.type = "range";
        slider.className = "aux-camera-view__composer-ambient-slider";
        slider.min = String(min);
        slider.max = String(max);
        slider.step = String(step);
        slider.value = String(defaultValue);
        slider.setAttribute("aria-label", ariaLabel);
        if (proofId) {
            slider.dataset.proofId = proofId;
        }
        row.appendChild(slider);

        const value = document.createElement("output");
        value.className = "aux-camera-view__composer-ambient-value";
        value.value = `${defaultValue.toFixed(2)}`;
        value.textContent = value.value;
        row.appendChild(value);

        composerControlsWrap.appendChild(row);
        return { slider, value };
    };

    ({
        slider: composerEarthAmbientSlider,
        value: composerEarthAmbientValue,
    } = buildComposerSliderRow(
        "Earth Fill",
        "Frame and Shoot creative Earth fill",
        COMPOSER_DEFAULT_EARTH_AMBIENT,
        { proofId: "earth-ambient-slider" },
    ));
    ({
        slider: composerMoonAmbientSlider,
        value: composerMoonAmbientValue,
    } = buildComposerSliderRow(
        "Moon Fill",
        "Frame and Shoot creative Moon fill",
        COMPOSER_DEFAULT_MOON_AMBIENT,
        { proofId: "moon-ambient-slider" },
    ));
    ({
        slider: composerEarthshineSlider,
        value: composerEarthshineValue,
    } = buildComposerSliderRow(
        "Earthshine Gain",
        "Flyby Planner Earthshine gain",
        COMPOSER_DEFAULT_EARTHSHINE_GAIN,
        {
            min: COMPOSER_MIN_EARTHSHINE_GAIN,
            max: COMPOSER_MAX_EARTHSHINE_GAIN,
            proofId: "earthshine-slider",
        },
    ));
    ({
        slider: composerMoonshineSlider,
        value: composerMoonshineValue,
    } = buildComposerSliderRow(
        "Moonshine Gain",
        "Flyby Planner Moonshine gain",
        COMPOSER_DEFAULT_MOONSHINE_GAIN,
        {
            min: COMPOSER_MIN_MOONSHINE_GAIN,
            max: COMPOSER_MAX_MOONSHINE_GAIN,
            proofId: "moonshine-slider",
        },
    ));

    composerMoonOutlineWrap = document.createElement("label");
    composerMoonOutlineWrap.className = "aux-camera-view__composer-grid-toggle";
    composerMoonOutlineCheckbox = document.createElement("input");
    composerMoonOutlineCheckbox.type = "checkbox";
    composerMoonOutlineCheckbox.checked = false;
    composerMoonOutlineCheckbox.setAttribute("aria-label", "Toggle Moon outline in Flyby Planner");
    const composerMoonOutlineText = document.createElement("span");
    composerMoonOutlineText.textContent = "Moon Outline";
    composerMoonOutlineWrap.appendChild(composerMoonOutlineCheckbox);
    composerMoonOutlineWrap.appendChild(composerMoonOutlineText);
    composerInfoToggles.appendChild(composerMoonOutlineWrap);

    composerSeeThroughWrap = document.createElement("label");
    composerSeeThroughWrap.className = "aux-camera-view__composer-grid-toggle";
    composerSeeThroughCheckbox = document.createElement("input");
    composerSeeThroughCheckbox.type = "checkbox";
    composerSeeThroughCheckbox.checked = false;
    composerSeeThroughCheckbox.setAttribute(
        "aria-label",
        "Toggle see-through dotted outlines for obscured Sun and planets",
    );
    composerSeeThroughCheckbox.dataset.proofId = "see-through-toggle";
    const composerSeeThroughText = document.createElement("span");
    composerSeeThroughText.textContent = "See Through";
    composerSeeThroughWrap.appendChild(composerSeeThroughCheckbox);
    composerSeeThroughWrap.appendChild(composerSeeThroughText);
    composerInfoToggles.appendChild(composerSeeThroughWrap);

    ({
        composerOpticsWrap,
        composerOpticsBody,
        composerExposureSlider,
        composerExposureValue,
        composerAutoExposureWrap,
        composerAutoExposureCheckbox,
        composerExposureTotalValue,
        composerOpticsPhysicalButton,
        composerOpticsCameraButton,
        composerOpticsStrengthSlider,
        composerOpticsStrengthValue,
        composerOpticsAdvancedPanel,
        composerOpticsHaloSlider,
        composerOpticsHaloValue,
        composerOpticsStarburstSlider,
        composerOpticsStarburstValue,
        composerOpticsFlareSlider,
        composerOpticsFlareValue,
        composerEclipseCoronaPanel,
        composerEclipseCoronaIntensitySlider,
        composerEclipseCoronaIntensityValue,
        composerEclipseCoronaMotionSlider,
        composerEclipseCoronaMotionValue,
        composerEclipseCoronaStructureSlider,
        composerEclipseCoronaStructureValue,
        composerEclipseZodiacalDustSlider,
        composerEclipseZodiacalDustValue,
    } = createComposerOpticsContent({ composerControlMatrix, composerControlsWrap }, dependencies));

    composerRollWrap = document.createElement("div");
    composerRollWrap.className = "aux-camera-view__composer-roll-wrap";
    const composerRollLabel = document.createElement("span");
    composerRollLabel.className = "aux-camera-view__composer-label aux-camera-view__composer-row-label";
    composerRollLabel.textContent = "Rotation";
    composerRollWrap.appendChild(composerRollLabel);
    composerRollSlider = document.createElement("input");
    composerRollSlider.type = "range";
    composerRollSlider.className = "aux-camera-view__composer-ambient-slider aux-camera-view__composer-roll-slider";
    composerRollSlider.min = "0";
    composerRollSlider.max = "359";
    composerRollSlider.step = "1";
    composerRollSlider.value = String(Math.round(THREE.MathUtils.radToDeg(COMPOSER_DEFAULT_ROLL_RAD)) % 360);
    composerRollSlider.setAttribute("aria-label", "Flyby Planner rotation");
    composerRollWrap.appendChild(composerRollSlider);
    composerRollValue = document.createElement("output");
    composerRollValue.className = "aux-camera-view__composer-roll-value";
    composerRollWrap.appendChild(composerRollValue);
    composerSkyControlsWrap.replaceChildren(
        composerSkyLockRow,
        composerInfoRow,
        composerCraterRow,
    );
    composerSkyTimelineWrap.replaceChildren(
        composerTimelineWrap,
    );
    composerControlMatrix.replaceChildren(
        ...(composerControlsToggleButton ? [composerControlsToggleButton] : []),
        composerFovWrap,
        composerOpticsWrap,
    );
    panel.appendChild(composerControlMatrix);
} else {
    info = document.createElement("div");
    info.className = "aux-camera-view__info";
    info.hidden = spec.infoMode === "none";
    infoPrimary = document.createElement("div");
    infoPrimary.className = "aux-camera-view__info-line aux-camera-view__info-line--primary";
    infoPrimaryText = document.createElement("span");
    infoPrimaryText.className = "aux-camera-view__info-primary-text";
    infoPill = document.createElement("button");
    infoPill.type = "button";
    infoPill.className = "aux-camera-view__pill";
    infoPill.hidden = true;
    infoPrimary.appendChild(infoPrimaryText);
    infoPrimary.appendChild(infoPill);
    infoSecondary = document.createElement("div");
    infoSecondary.className = "aux-camera-view__info-line aux-camera-view__info-line--secondary";
    info.appendChild(infoPrimary);
    info.appendChild(infoSecondary);
    panel.appendChild(info);
}

    return {
        info,
        infoPrimary,
        infoPrimaryText,
        infoPill,
        infoSecondary,
        composerPresetWrap,
        composerLookFreeButton,
        composerLookEarthButton,
        composerLookMoonButton,
        composerControlMatrix,
        composerSkyControlsWrap,
        composerSkyTimelineWrap,
        composerInfoRow,
        composerFovWrap,
        composerTimelineWrap,
        composerTransportRow,
        composerTransportPlayButton,
        composerTransportMinusSecondButton,
        composerTransportMinusMinuteButton,
        composerTransportPlusMinuteButton,
        composerTransportPlusSecondButton,
        composerTransportSlowerButton,
        composerTransportSpeedButton,
        composerTransportFasterButton,
        composerPhasePrevButton,
        composerPhaseDetails,
        composerPhaseSummary,
        composerPhaseOptionsWrap,
        composerPhaseNextButton,
        composerTimelineSlider,
        composerTimelineLabel,
        composerTimelineLocalValue,
        composerFlybyEventsDetails,
        composerFlybyEventsSummary,
        composerFlybyEventsWrap,
        composerControlsWrap,
        composerResetButton,
        composerEarthAmbientSlider,
        composerEarthAmbientValue,
        composerMoonAmbientSlider,
        composerMoonAmbientValue,
        composerEarthshineSlider,
        composerEarthshineValue,
        composerMoonshineSlider,
        composerMoonshineValue,
        composerMoonOutlineWrap,
        composerMoonOutlineCheckbox,
        composerSeeThroughWrap,
        composerSeeThroughCheckbox,
        composerOpticsWrap,
        composerOpticsBody,
        composerOpticsToggleButton,
        composerOpticsPhysicalButton,
        composerOpticsCameraButton,
        composerExposureSlider,
        composerExposureValue,
        composerExposureTotalValue,
        composerAutoExposureWrap,
        composerAutoExposureCheckbox,
        composerOpticsStrengthSlider,
        composerOpticsStrengthValue,
        composerOpticsAdvancedPanel,
        composerOpticsHaloSlider,
        composerOpticsHaloValue,
        composerOpticsStarburstSlider,
        composerOpticsStarburstValue,
        composerOpticsFlareSlider,
        composerOpticsFlareValue,
        composerEclipseCoronaPanel,
        composerEclipseCoronaIntensitySlider,
        composerEclipseCoronaIntensityValue,
        composerEclipseCoronaMotionSlider,
        composerEclipseCoronaMotionValue,
        composerEclipseCoronaStructureSlider,
        composerEclipseCoronaStructureValue,
        composerEclipseZodiacalDustSlider,
        composerEclipseZodiacalDustValue,
        composerRollWrap,
        composerRollSlider,
        composerRollValue,
        composerRollDial,
        composerRollDialKnob,
        composerRollDialValue,
        composerInfoOverlayWrap,
        composerInfoOverlayCheckbox,
        composerRaDecGridWrap,
        composerRaDecGridCheckbox,
        composerSkyLabelsWrap,
        composerSkyLabelsCheckbox,
        composerConstellationLinesWrap,
        composerConstellationLinesCheckbox,
        composerConstellationLabelsWrap,
        composerConstellationLabelsCheckbox,
        composerCloudsWrap,
        composerCloudsCheckbox,
        composerLunarCratersWrap,
        composerLunarCratersPill,
        composerLunarCraterControls,
        composerMoonRenderPill,
        composerSurfacePointsWrap,
        composerSurfacePointsPill,
        composerSurfacePointControls,
        composerTranscriptSyncedCheckbox,
        composerTranscriptWindowSlider,
        composerTranscriptWindowValue,
        composerTranscriptHoldSlider,
        composerTranscriptHoldValue,
        composerTranscriptPrevButton,
        composerTranscriptNextButton,
        composerStarMagnitudeSlider,
        composerStarMagnitudeValue,
        composerHint,
        composerMetricsStrip,
        composerLunarFeatureStack,
        composerLunarFeatureStackHeader,
        composerLunarFeatureStackList,
        composerLunarFeatureStackCloseButton,
        composerLunarFeatureStackRestoreButton,
        composerMetricFovHValue,
        composerMetricFovVValue,
        composerMetricDistanceMoonValue,
        composerMetricAngleValue,
        composerDisabledOverlay,
    };
}
