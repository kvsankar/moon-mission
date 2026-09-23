// Stateful Frame-and-Shoot control actions and UI synchronization.
export function createComposerControlActions(panelState, syncAutoToggleUi, dependencies) {
    let syncComposerLockUi = null;
    let syncComposerCloudsUi = null;
    let syncComposerLunarCratersUi = null;
    const {
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
        composerRollDialKnobOffset,
        createDefaultLunarFeatureViewState,
        createDefaultSurfacePointViewState,
        createLunarFeatureViewAttachment,
        hasSurfacePointViewEnabled,
        normalizeComposerRollRad,
        patchSurfacePointViewState,
        rollRadFromDialPointer,
    } = dependencies;
    const activateComposerForControl = () => {
        if (panelState.composerInteractionEnabled === true) {
            return false;
        }
        this.activateComposerWindow(panelState, { finalize: true });
        return true;
    };

    const requestComposerControlRender = () => {
        this.requestRender?.();
        this.scheduleVisiblePanelsRefresh();
    };

    panelState.composerLunarFeatureAttachment = createLunarFeatureViewAttachment({
        controls: panelState.composerLunarCraterControls,
        initialState: panelState.composerLunarCraterState,
        activate: activateComposerForControl,
        requestRender: requestComposerControlRender,
        persist: () => this.queuePersistPanelState(),
        onStateChange: (state, { enabled } = {}) => {
            panelState.composerLunarCraterState = state;
            panelState.composerLunarCratersEnabled = enabled === true;
        },
    });

    syncComposerLockUi = () => {
        const lockTarget = panelState.composerLockTarget || "none";
        panelState.composerLookFreeButton?.classList.toggle("is-active", lockTarget === "none");
        panelState.composerLookEarthButton?.classList.toggle("is-active", lockTarget === "earth");
        panelState.composerLookMoonButton?.classList.toggle("is-active", lockTarget === "moon");
    };

    const syncComposerAmbientUi = () => {
        const syncOne = (slider, valueNode, ambientValue) => {
            if (!slider || !valueNode) {
                return;
            }
            slider.value = String(ambientValue);
            const ambientText = ambientValue.toFixed(2);
            valueNode.value = ambientText;
            valueNode.textContent = ambientText;
        };
        syncOne(
            panelState.composerEarthAmbientSlider,
            panelState.composerEarthAmbientValue,
            panelState.composerEarthAmbient,
        );
        syncOne(
            panelState.composerMoonAmbientSlider,
            panelState.composerMoonAmbientValue,
            panelState.composerMoonAmbient,
        );
        syncOne(
            panelState.composerEarthshineSlider,
            panelState.composerEarthshineValue,
            panelState.composerEarthshineGain,
        );
        syncOne(
            panelState.composerMoonshineSlider,
            panelState.composerMoonshineValue,
            panelState.composerMoonshineGain,
        );
        if (panelState.composerMoonOutlineCheckbox) {
            panelState.composerMoonOutlineCheckbox.checked = panelState.composerMoonOutlineEnabled === true;
        }
        if (panelState.composerSeeThroughCheckbox) {
            panelState.composerSeeThroughCheckbox.checked = panelState.composerSeeThroughEnabled === true;
        }
    };

    const syncComposerStarMagnitudeUi = () => {
        if (!panelState.composerStarMagnitudeSlider || !panelState.composerStarMagnitudeValue) {
            return;
        }
        const magnitude = this.THREE.MathUtils.clamp(
            Number(panelState.composerStarMagnitudeLimit),
            COMPOSER_STAR_MAGNITUDE_MIN,
            COMPOSER_STAR_MAGNITUDE_MAX,
        );
        panelState.composerStarMagnitudeLimit = Number.isFinite(magnitude)
            ? magnitude
            : COMPOSER_STAR_MAGNITUDE_DEFAULT;
        const text = panelState.composerStarMagnitudeLimit.toFixed(1);
        panelState.composerStarMagnitudeSlider.value = text;
        panelState.composerStarMagnitudeValue.value = text;
        panelState.composerStarMagnitudeValue.textContent = text;
    };

    const syncComposerTranscriptFeatureUi = () => {
        if (panelState.composerTranscriptSyncedCheckbox) {
            panelState.composerTranscriptSyncedCheckbox.checked =
                panelState.composerLunarFeatureSyncedEnabled !== false;
        }
        const windowSeconds = this.THREE.MathUtils.clamp(
            Number(panelState.composerLunarFeatureMentionWindowSeconds),
            60,
            900,
        );
        panelState.composerLunarFeatureMentionWindowSeconds = Number.isFinite(windowSeconds)
            ? windowSeconds
            : COMPOSER_LUNAR_FEATURE_STACK_VISIBLE_WINDOW_SECONDS;
        if (panelState.composerTranscriptWindowSlider) {
            panelState.composerTranscriptWindowSlider.value =
                String(panelState.composerLunarFeatureMentionWindowSeconds);
        }
        if (panelState.composerTranscriptWindowValue) {
            const minutes = Math.round(panelState.composerLunarFeatureMentionWindowSeconds / 60);
            panelState.composerTranscriptWindowValue.value = `${minutes}m`;
            panelState.composerTranscriptWindowValue.textContent = `${minutes}m`;
        }

        const holdSeconds = this.THREE.MathUtils.clamp(
            Number(panelState.composerLunarFeatureMentionLeadSeconds) +
                Number(panelState.composerLunarFeatureMentionTrailSeconds),
            5,
            90,
        );
        const safeHoldSeconds = Number.isFinite(holdSeconds)
            ? holdSeconds
            : COMPOSER_LUNAR_FEATURE_STACK_ACTIVE_LEAD_SECONDS + COMPOSER_LUNAR_FEATURE_STACK_ACTIVE_TRAIL_SECONDS;
        panelState.composerLunarFeatureMentionLeadSeconds = Math.round(safeHoldSeconds / 3);
        panelState.composerLunarFeatureMentionTrailSeconds =
            safeHoldSeconds - panelState.composerLunarFeatureMentionLeadSeconds;
        if (panelState.composerTranscriptHoldSlider) {
            panelState.composerTranscriptHoldSlider.value = String(safeHoldSeconds);
        }
        if (panelState.composerTranscriptHoldValue) {
            panelState.composerTranscriptHoldValue.value = `${safeHoldSeconds}s`;
            panelState.composerTranscriptHoldValue.textContent = `${safeHoldSeconds}s`;
        }
    };

    const syncComposerExposureUi = () => {
        const exposureEv = this.THREE.MathUtils.clamp(
            Number(panelState.composerExposureEv),
            COMPOSER_EXPOSURE_EV_MIN,
            COMPOSER_EXPOSURE_EV_MAX,
        );
        panelState.composerExposureEv = Number.isFinite(exposureEv)
            ? exposureEv
            : COMPOSER_EXPOSURE_EV_DEFAULT;
        const exposureText = `${panelState.composerExposureEv >= 0 ? "+" : ""}${panelState.composerExposureEv.toFixed(1)} EV`;
        if (panelState.composerExposureSlider) {
            panelState.composerExposureSlider.value = panelState.composerExposureEv.toFixed(1);
        }
        if (panelState.composerExposureValue) {
            panelState.composerExposureValue.value = exposureText;
            panelState.composerExposureValue.textContent = exposureText;
        }
        if (panelState.composerExposureTotalValue) {
            const exposureState = this.resolveComposerExposureState(panelState);
            const totalEv = exposureState.manualEv + exposureState.autoEv;
            const totalText = `Total ${totalEv >= 0 ? "+" : ""}${totalEv.toFixed(1)} EV`;
            panelState.composerExposureTotalValue.value = totalText;
            panelState.composerExposureTotalValue.textContent = totalText;
            panelState.composerExposureTotalValue.title = exposureState.autoEv !== 0
                ? `Manual ${exposureState.manualEv >= 0 ? "+" : ""}${exposureState.manualEv.toFixed(1)} EV + auto ${exposureState.autoEv >= 0 ? "+" : ""}${exposureState.autoEv.toFixed(1)} EV`
                : `Manual ${exposureState.manualEv >= 0 ? "+" : ""}${exposureState.manualEv.toFixed(1)} EV`;
        }
        if (panelState.composerAutoExposureCheckbox) {
            panelState.composerAutoExposureCheckbox.checked = panelState.composerAutoExposureEnabled !== false;
        }
        panelState.composerAutoExposureWrap?.classList.toggle(
            "is-active",
            panelState.composerAutoExposureEnabled !== false,
        );
    };

    syncComposerCloudsUi = () => {
        if (!panelState.composerCloudsCheckbox) {
            return;
        }
        const enabled = this.getEarthCloudsEnabled() !== false;
        panelState.composerEarthCloudsEnabled = enabled;
        panelState.composerCloudsCheckbox.checked = enabled;
        const title = enabled
            ? "Hide Earth cloud cover in all Earth renders"
            : "Show Earth cloud cover in all Earth renders";
        panelState.composerCloudsWrap?.classList.toggle("is-active", enabled);
        panelState.composerCloudsWrap?.setAttribute("title", title);
    };

    syncComposerLunarCratersUi = () => {
        const attachment = panelState.composerLunarFeatureAttachment;
        if (!attachment) {
            return;
        }
        panelState.composerLunarCraterState = attachment.setState(panelState.composerLunarCraterState);
        panelState.composerLunarCratersEnabled = attachment.enabled;
        panelState.composerLunarCratersWrap?.setAttribute("title", "Open lunar feature controls");
    };

    const syncComposerSurfacePointsUi = () => {
        const controls = panelState.composerSurfacePointControls;
        if (!controls) return;
        panelState.composerSurfacePointState = patchSurfacePointViewState(
            createDefaultSurfacePointViewState(),
            panelState.composerSurfacePointState,
        );
        const anyActive = hasSurfacePointViewEnabled(panelState.composerSurfacePointState);
        controls.entries?.forEach?.(({ key, input }) => {
            if (input) input.checked = panelState.composerSurfacePointState?.[key] === true;
        });
        panelState.composerSurfacePointsPill?.classList.toggle("is-active", anyActive);
        panelState.composerSurfacePointsPill?.setAttribute("aria-pressed", anyActive ? "true" : "false");
        panelState.composerSurfacePointsPill?.setAttribute(
            "aria-expanded",
            controls.panel?.hidden === false ? "true" : "false",
        );
        panelState.composerSurfacePointsWrap?.setAttribute("title", "Open surface point controls");
    };

    const syncComposerOpticsUi = () => {
        if (panelState.composerOpticsBody) {
            panelState.composerOpticsBody.hidden = false;
        }
        if (panelState.composerOpticsToggleButton) {
            panelState.composerOpticsToggleButton.setAttribute("aria-expanded", "true");
            panelState.composerOpticsToggleButton.setAttribute(
                "aria-label",
                "Advanced controls",
            );
            const icon = panelState.composerOpticsToggleButton.querySelector(".aux-camera-view__composer-disclosure-icon");
            if (icon) {
                icon.textContent = "\u25be";
            }
        }
        const profile = panelState.composerSunProfile === "physical" ? "physical" : "camera";
        panelState.composerOpticsPhysicalButton?.classList.toggle("is-active", profile === "physical");
        panelState.composerOpticsCameraButton?.classList.toggle("is-active", profile === "camera");
        syncComposerExposureUi();
        if (panelState.composerOpticsStrengthSlider && panelState.composerOpticsStrengthValue) {
            panelState.composerOpticsStrengthSlider.value = String(panelState.composerSunStrength);
            const text = panelState.composerSunStrength.toFixed(2);
            panelState.composerOpticsStrengthValue.value = text;
            panelState.composerOpticsStrengthValue.textContent = text;
        }
        if (panelState.composerOpticsAdvancedPanel) {
            panelState.composerOpticsAdvancedPanel.hidden = false;
        }
        const syncGain = (slider, valueNode, gain) => {
            if (!slider || !valueNode) return;
            slider.value = String(gain);
            const text = gain.toFixed(2);
            valueNode.value = text;
            valueNode.textContent = text;
        };
        syncGain(panelState.composerOpticsHaloSlider, panelState.composerOpticsHaloValue, panelState.composerSunHaloGain);
        syncGain(panelState.composerOpticsStarburstSlider, panelState.composerOpticsStarburstValue, panelState.composerSunStarburstGain);
        syncGain(panelState.composerOpticsFlareSlider, panelState.composerOpticsFlareValue, panelState.composerSunFlareGain);
        syncGain(
            panelState.composerEclipseCoronaIntensitySlider,
            panelState.composerEclipseCoronaIntensityValue,
            panelState.composerEclipseCoronaIntensity,
        );
        syncGain(
            panelState.composerEclipseCoronaMotionSlider,
            panelState.composerEclipseCoronaMotionValue,
            panelState.composerEclipseCoronaMotion,
        );
        syncGain(
            panelState.composerEclipseCoronaStructureSlider,
            panelState.composerEclipseCoronaStructureValue,
            panelState.composerEclipseCoronaStructure,
        );
        syncGain(
            panelState.composerEclipseZodiacalDustSlider,
            panelState.composerEclipseZodiacalDustValue,
            panelState.composerEclipseZodiacalDust,
        );
    };

    const setComposerOpticsProfile = (nextProfile) => {
        panelState.composerSunProfile = nextProfile === "physical" ? "physical" : "camera";
        syncComposerOpticsUi();
        requestComposerControlRender();
    };

    const setComposerExposureEv = (nextExposureEv, { persist = false } = {}) => {
        const bounded = this.THREE.MathUtils.clamp(
            Number(nextExposureEv),
            COMPOSER_EXPOSURE_EV_MIN,
            COMPOSER_EXPOSURE_EV_MAX,
        );
        if (!Number.isFinite(bounded)) {
            return;
        }
        panelState.composerExposureEv = bounded;
        syncComposerExposureUi();
        if (persist) {
            this.queuePersistPanelState();
        }
        requestComposerControlRender();
    };

    const setComposerAutoExposureEnabled = (enabled, { persist = false } = {}) => {
        panelState.composerAutoExposureEnabled = enabled !== false;
        syncComposerExposureUi();
        if (persist) {
            this.queuePersistPanelState();
        }
        requestComposerControlRender();
    };

    const onComposerOpticsToggleClick = () => {
        panelState.composerOpticsExpanded = panelState.composerOpticsExpanded !== true;
        syncComposerOpticsUi();
        requestComposerControlRender();
    };

    const setComposerOpticsStrength = (nextStrength) => {
        const bounded = this.THREE.MathUtils.clamp(
            Number(nextStrength),
            COMPOSER_OPTICS_STRENGTH_MIN,
            COMPOSER_OPTICS_STRENGTH_MAX,
        );
        if (!Number.isFinite(bounded)) {
            return;
        }
        panelState.composerSunStrength = bounded;
        syncComposerOpticsUi();
        requestComposerControlRender();
    };

    const setComposerOpticsGain = (key, nextValue) => {
        const bounded = this.THREE.MathUtils.clamp(
            Number(nextValue),
            COMPOSER_OPTICS_ADVANCED_MIN,
            COMPOSER_OPTICS_ADVANCED_MAX,
        );
        if (!Number.isFinite(bounded)) {
            return;
        }
        panelState[key] = bounded;
        syncComposerOpticsUi();
        requestComposerControlRender();
    };

    const setComposerEclipseCoronaGain = (key, nextValue) => {
        const bounded = this.THREE.MathUtils.clamp(
            Number(nextValue),
            COMPOSER_ECLIPSE_CORONA_MIN,
            COMPOSER_ECLIPSE_CORONA_MAX,
        );
        if (!Number.isFinite(bounded)) {
            return;
        }
        panelState[key] = bounded;
        syncComposerOpticsUi();
        requestComposerControlRender();
    };

    const setComposerAmbient = (ambientKey, nextAmbient, { persist = false } = {}) => {
        const bounded = this.THREE.MathUtils.clamp(
            Number(nextAmbient),
            COMPOSER_MIN_AMBIENT,
            COMPOSER_MAX_AMBIENT,
        );
        if (!Number.isFinite(bounded)) {
            return;
        }
        panelState[ambientKey] = bounded;
        syncComposerAmbientUi();
        if (persist) {
            this.queuePersistPanelState();
        }
        requestComposerControlRender();
    };

    const setComposerEarthshineGain = (nextGain, { persist = false } = {}) => {
        const bounded = this.THREE.MathUtils.clamp(
            Number(nextGain),
            COMPOSER_MIN_EARTHSHINE_GAIN,
            COMPOSER_MAX_EARTHSHINE_GAIN,
        );
        if (!Number.isFinite(bounded)) {
            return;
        }
        panelState.composerEarthshineGain = bounded;
        syncComposerAmbientUi();
        if (persist) {
            this.queuePersistPanelState();
        }
        requestComposerControlRender();
    };

    const setComposerMoonshineGain = (nextGain, { persist = false } = {}) => {
        const bounded = this.THREE.MathUtils.clamp(
            Number(nextGain),
            COMPOSER_MIN_MOONSHINE_GAIN,
            COMPOSER_MAX_MOONSHINE_GAIN,
        );
        if (!Number.isFinite(bounded)) {
            return;
        }
        panelState.composerMoonshineGain = bounded;
        syncComposerAmbientUi();
        if (persist) {
            this.queuePersistPanelState();
        }
        requestComposerControlRender();
    };

    const setComposerStarMagnitudeLimit = (nextMagnitude, { persist = false } = {}) => {
        const bounded = this.THREE.MathUtils.clamp(
            Number(nextMagnitude),
            COMPOSER_STAR_MAGNITUDE_MIN,
            COMPOSER_STAR_MAGNITUDE_MAX,
        );
        if (!Number.isFinite(bounded)) {
            return;
        }
        panelState.composerStarMagnitudeLimit = bounded;
        syncComposerStarMagnitudeUi();
        if (persist) {
            this.queuePersistPanelState();
        }
        requestComposerControlRender();
    };

    const resetComposerControlsToDefaults = ({ persist = false } = {}) => {
        panelState.composerEarthAmbient = COMPOSER_DEFAULT_EARTH_AMBIENT;
        panelState.composerMoonAmbient = COMPOSER_DEFAULT_MOON_AMBIENT;
        panelState.composerEarthshineGain = COMPOSER_DEFAULT_EARTHSHINE_GAIN;
        panelState.composerMoonshineGain = COMPOSER_DEFAULT_MOONSHINE_GAIN;
        panelState.composerMoonOutlineEnabled = false;
        panelState.composerSeeThroughEnabled = false;
        panelState.composerInfoOverlayEnabled = true;
        panelState.composerRaDecGridEnabled = false;
        panelState.composerSkyLabelsEnabled = false;
        panelState.composerConstellationLinesEnabled = false;
        panelState.composerConstellationLabelsEnabled = false;
        panelState.composerStarMagnitudeLimit = COMPOSER_STAR_MAGNITUDE_DEFAULT;
        panelState.composerEarthCloudsEnabled = true;
        panelState.composerSurfacePointState = createDefaultSurfacePointViewState();
        panelState.composerLunarCraterState = createDefaultLunarFeatureViewState();
        panelState.composerLunarFeatureAttachment?.setState(panelState.composerLunarCraterState);
        panelState.composerSunProfile = "camera";
        panelState.composerExposureEv = COMPOSER_EXPOSURE_EV_DEFAULT;
        panelState.composerAutoExposureEnabled = true;
        panelState.composerSunStrength = COMPOSER_OPTICS_STRENGTH_DEFAULT;
        panelState.composerSunHaloGain = COMPOSER_OPTICS_ADVANCED_DEFAULT;
        panelState.composerSunStarburstGain = COMPOSER_OPTICS_ADVANCED_DEFAULT;
        panelState.composerSunFlareGain = COMPOSER_OPTICS_ADVANCED_DEFAULT;
        panelState.composerEclipseCoronaIntensity = COMPOSER_ECLIPSE_CORONA_DEFAULT;
        panelState.composerEclipseCoronaMotion = COMPOSER_ECLIPSE_CORONA_DEFAULT;
        panelState.composerEclipseCoronaStructure = COMPOSER_ECLIPSE_CORONA_VARIATION_DEFAULT;
        panelState.composerEclipseZodiacalDust = COMPOSER_ECLIPSE_ZODIACAL_DUST_DEFAULT;
        panelState.composerRollRad = COMPOSER_DEFAULT_ROLL_RAD;

        this.setEarthCloudsEnabled?.(true);
        if (panelState.composerInfoOverlayCheckbox) {
            panelState.composerInfoOverlayCheckbox.checked = true;
        }
        if (panelState.composerRaDecGridCheckbox) {
            panelState.composerRaDecGridCheckbox.checked = false;
        }
        if (panelState.composerSkyLabelsCheckbox) {
            panelState.composerSkyLabelsCheckbox.checked = false;
        }
        if (panelState.composerConstellationLinesCheckbox) {
            panelState.composerConstellationLinesCheckbox.checked = false;
        }
        if (panelState.composerConstellationLabelsCheckbox) {
            panelState.composerConstellationLabelsCheckbox.checked = false;
        }
        syncComposerAmbientUi();
        syncComposerStarMagnitudeUi();
        syncComposerCloudsUi?.();
        syncComposerLunarCratersUi?.();
        syncComposerSurfacePointsUi();
        syncComposerOpticsUi();
        syncComposerRollUi();
        panelState.overlayDirty = true;
        if (persist) {
            this.queuePersistPanelState();
        }
        requestComposerControlRender();
    };

    const onComposerCloudsChange = () => {
        activateComposerForControl();
        const nextEnabled = panelState.composerCloudsCheckbox?.checked !== false;
        panelState.composerEarthCloudsEnabled = nextEnabled;
        this.setEarthCloudsEnabled?.(nextEnabled);
        syncComposerCloudsUi();
        requestComposerControlRender();
        this.queuePersistPanelState();
    };

    const commitComposerSurfacePointPatch = (patch = {}) => {
        activateComposerForControl();
        panelState.composerSurfacePointState = patchSurfacePointViewState(
            panelState.composerSurfacePointState,
            patch,
        );
        syncComposerSurfacePointsUi();
        requestComposerControlRender();
    };

    const onComposerLunarCratersPillClick = (event) => {
        activateComposerForControl();
        event?.stopPropagation?.();
        const panel = panelState.composerLunarCraterControls?.panel;
        if (!panel) return;
        panel.hidden = panel.hidden === false;
        syncComposerLunarCratersUi();
    };

    const onComposerSurfacePointsPillClick = (event) => {
        activateComposerForControl();
        event?.stopPropagation?.();
        const panel = panelState.composerSurfacePointControls?.panel;
        if (!panel) return;
        panel.hidden = panel.hidden === false;
        syncComposerSurfacePointsUi();
    };

    const onComposerSurfacePointsCloseClick = () => {
        const panel = panelState.composerSurfacePointControls?.panel;
        if (panel) panel.hidden = true;
        syncComposerSurfacePointsUi();
    };

    const onComposerSurfacePointToggle = (event) => {
        const key = event?.target?.dataset?.surfacePointKey;
        if (!key) return;
        commitComposerSurfacePointPatch({ [key]: event.target.checked === true });
    };

    const syncComposerRollUi = () => {
        const normalizedRoll = normalizeComposerRollRad(panelState.composerRollRad);
        panelState.composerRollRad = normalizedRoll;
        const degrees = Math.round(this.THREE.MathUtils.radToDeg(normalizedRoll)) % 360;
        const text = `${degrees}°`;
        if (panelState.composerRollSlider) {
            panelState.composerRollSlider.value = String(degrees);
        }
        if (panelState.composerRollValue) {
            panelState.composerRollValue.value = text;
            panelState.composerRollValue.textContent = text;
        }
        if (panelState.composerRollDialValue) {
            panelState.composerRollDialValue.textContent = text;
        }
        if (panelState.composerRollDialKnob) {
            const offset = composerRollDialKnobOffset(normalizedRoll, 18);
            panelState.composerRollDialKnob.style.transform = `translate(calc(-50% + ${offset.x.toFixed(2)}px), calc(-50% + ${offset.y.toFixed(2)}px))`;
        }
    };

    const onComposerRollInput = () => {
        activateComposerForControl();
        if (!panelState.composerRollSlider) {
            return;
        }
        const degrees = Number(panelState.composerRollSlider.value);
        if (!Number.isFinite(degrees)) {
            return;
        }
        panelState.composerRollRad = this.THREE.MathUtils.degToRad(degrees);
        syncComposerRollUi();
        this.requestRender?.();
    };

    const setComposerRollFromDialPointer = (event) => {
        if (!panelState.composerRollDial) {
            return;
        }
        const rect = panelState.composerRollDial.getBoundingClientRect();
        panelState.composerRollRad = rollRadFromDialPointer({
            pointerX: event.clientX,
            pointerY: event.clientY,
            centerX: rect.left + rect.width * 0.5,
            centerY: rect.top + rect.height * 0.5,
        });
        syncComposerRollUi();
        this.requestRender?.();
    };

    const onComposerRollDialPointerDown = (event) => {
        if (event.button !== 0) {
            return;
        }
        activateComposerForControl();
        panelState.composerRollDialPointerId = event.pointerId;
        panelState.composerRollDial?.classList.add("is-active");
        panelState.composerRollDial?.setPointerCapture(event.pointerId);
        setComposerRollFromDialPointer(event);
        event.preventDefault();
        event.stopPropagation();
    };

    const onComposerRollDialPointerMove = (event) => {
        if (panelState.composerRollDialPointerId !== event.pointerId) {
            return;
        }
        setComposerRollFromDialPointer(event);
        event.preventDefault();
        event.stopPropagation();
    };

    const releaseComposerRollDial = (event) => {
        if (panelState.composerRollDialPointerId !== event.pointerId) {
            return;
        }
        if (panelState.composerRollDial?.hasPointerCapture(event.pointerId)) {
            panelState.composerRollDial.releasePointerCapture(event.pointerId);
        }
        panelState.composerRollDialPointerId = null;
        panelState.composerRollDial?.classList.remove("is-active");
        this.queuePersistPanelState();
    };

    const onComposerRaDecGridToggle = () => {
        activateComposerForControl();
        panelState.composerRaDecGridEnabled = !!panelState.composerRaDecGridCheckbox?.checked;
        panelState.overlayDirty = true;
        this.requestRender?.();
    };

    const onComposerSkyLabelsToggle = () => {
        activateComposerForControl();
        panelState.composerSkyLabelsEnabled = !!panelState.composerSkyLabelsCheckbox?.checked;
        panelState.overlayDirty = true;
        this.requestRender?.();
    };

    const onComposerConstellationLinesToggle = () => {
        activateComposerForControl();
        panelState.composerConstellationLinesEnabled =
            !!panelState.composerConstellationLinesCheckbox?.checked;
        this.requestRender?.();
        this.queuePersistPanelState();
    };

    const onComposerConstellationLabelsToggle = () => {
        activateComposerForControl();
        panelState.composerConstellationLabelsEnabled =
            !!panelState.composerConstellationLabelsCheckbox?.checked;
        panelState.overlayDirty = true;
        this.requestRender?.();
        this.queuePersistPanelState();
    };

    const setComposerLockTarget = (target) => {
        this.setComposerLockTarget(panelState, target, {
            syncComposerLockUi,
            syncAutoToggleUi,
        });
    };

    return {
        syncAutoToggleUi,
        activateComposerForControl,
        syncComposerLockUi,
        syncComposerCloudsUi,
        syncComposerLunarCratersUi,
        syncComposerStarMagnitudeUi,
        syncComposerTranscriptFeatureUi,
        syncComposerExposureUi,
        syncComposerSurfacePointsUi,
        syncComposerOpticsUi,
        setComposerOpticsProfile,
        setComposerExposureEv,
        setComposerAutoExposureEnabled,
        onComposerOpticsToggleClick,
        setComposerOpticsStrength,
        setComposerOpticsGain,
        setComposerEclipseCoronaGain,
        setComposerAmbient,
        setComposerEarthshineGain,
        setComposerMoonshineGain,
        setComposerStarMagnitudeLimit,
        resetComposerControlsToDefaults,
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
        setComposerLockTarget,
    };
}
