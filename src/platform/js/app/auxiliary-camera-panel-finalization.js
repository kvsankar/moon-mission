// Restores panel preferences and registers the mounted panel with the manager.
export function finalizeAuxiliaryCameraPanel(context, dependencies) {
    const {
        header,
        hasPersistedVisibilityState,
        index,
        infoPill,
        onFovInput,
        panel,
        panelState,
        persistedHeight,
        persistedState,
        persistedWidth,
        persistedX,
        persistedY,
        resizeGrip,
        spec,
        syncAutoToggleUi,
    } = context;
    const {
        AUTO_FOV_MAX_DEGREES,
        AUTO_FOV_MIN_DEGREES,
        COMPOSER_AUTO_FOV_PREFERENCE_VERSION,
        COMPOSER_CONTROLS_COLLAPSE_STATE_VERSION,
        COMPOSER_CONTROLS_PANEL_ID,
        COMPOSER_DEFAULT_EARTHSHINE_GAIN,
        COMPOSER_DEFAULT_EARTH_AMBIENT,
        COMPOSER_DEFAULT_MOONSHINE_GAIN,
        COMPOSER_DEFAULT_MOON_AMBIENT,
        COMPOSER_ECLIPSE_CORONA_DEFAULT,
        COMPOSER_ECLIPSE_CORONA_VARIATION_DEFAULT,
        COMPOSER_ECLIPSE_ZODIACAL_DUST_DEFAULT,
        COMPOSER_EXPOSURE_EV_DEFAULT,
        COMPOSER_EXPOSURE_EV_MAX,
        COMPOSER_EXPOSURE_EV_MIN,
        COMPOSER_OPTICS_ADVANCED_DEFAULT,
        COMPOSER_OPTICS_STRENGTH_DEFAULT,
        COMPOSER_STAR_MAGNITUDE_DEFAULT,
        createComposerDisclosure,
        hasCurrentAuxFovPreferenceVersion,
        registerMissionPanel,
        resolveComposerViewIntent,
    } = dependencies;
    const persisted = this.persistedPanelState?.[spec.id];
    if (persisted && typeof persisted === "object") {
        if (panelState.mode !== "composer") {
            if (hasCurrentAuxFovPreferenceVersion(persisted)) {
                const persistedFov = Number(persisted.fov);
                if (Number.isFinite(persistedFov)) {
                    const boundedFov = this.THREE.MathUtils.clamp(
                        persistedFov,
                        AUTO_FOV_MIN_DEGREES,
                        AUTO_FOV_MAX_DEGREES,
                    );
                    this.setPanelFov(panelState, boundedFov);
                }
            }
        } else if (
            typeof persisted.composerControlsCollapsed === "boolean" &&
            Number(persisted.composerControlsCollapseVersion) >=
                COMPOSER_CONTROLS_COLLAPSE_STATE_VERSION
        ) {
            panelState.composerControlsCollapsed = persisted.composerControlsCollapsed;
        }
    }
    if (panelState.mode === "composer") {
        panelState.autoFovEnabled = true;
        this.setPanelFov(panelState, spec.defaultFov);
        const hasCurrentComposerAutoFovPreference =
            Number(persisted?.composerAutoFovPreferenceVersion) >= COMPOSER_AUTO_FOV_PREFERENCE_VERSION;
        if (
            hasCurrentComposerAutoFovPreference &&
            persisted &&
            typeof persisted === "object" &&
            hasCurrentAuxFovPreferenceVersion(persisted)
        ) {
            const result = resolveComposerViewIntent(this.readComposerViewState(panelState), {
                type: "persisted",
                persisted,
            });
            if (Number.isFinite(result.state.manualFovDegrees)) {
                const boundedFov = this.THREE.MathUtils.clamp(
                    result.state.manualFovDegrees,
                    AUTO_FOV_MIN_DEGREES,
                    AUTO_FOV_MAX_DEGREES,
                );
                this.setPanelFov(panelState, boundedFov);
            }
        }
        panelState.composerEarthAmbient = COMPOSER_DEFAULT_EARTH_AMBIENT;
        panelState.composerMoonAmbient = COMPOSER_DEFAULT_MOON_AMBIENT;
        panelState.composerEarthshineGain = COMPOSER_DEFAULT_EARTHSHINE_GAIN;
        panelState.composerMoonshineGain = COMPOSER_DEFAULT_MOONSHINE_GAIN;
        panelState.composerMoonOutlineEnabled = false;
        panelState.composerSeeThroughEnabled = false;
        panelState.composerSunProfile = "camera";
        panelState.composerExposureEv = COMPOSER_EXPOSURE_EV_DEFAULT;
        panelState.composerAutoExposureEnabled = true;
        if (persisted && typeof persisted === "object") {
            const persistedExposureEv = Number(persisted.composerExposureEv);
            if (Number.isFinite(persistedExposureEv)) {
                panelState.composerExposureEv = this.THREE.MathUtils.clamp(
                    persistedExposureEv,
                    COMPOSER_EXPOSURE_EV_MIN,
                    COMPOSER_EXPOSURE_EV_MAX,
                );
            }
            if (typeof persisted.composerAutoExposureEnabled === "boolean") {
                panelState.composerAutoExposureEnabled = persisted.composerAutoExposureEnabled;
            }
        }
        panelState.composerSunStrength = COMPOSER_OPTICS_STRENGTH_DEFAULT;
        panelState.composerSunHaloGain = COMPOSER_OPTICS_ADVANCED_DEFAULT;
        panelState.composerSunStarburstGain = COMPOSER_OPTICS_ADVANCED_DEFAULT;
        panelState.composerSunFlareGain = COMPOSER_OPTICS_ADVANCED_DEFAULT;
        panelState.composerEclipseCoronaIntensity = COMPOSER_ECLIPSE_CORONA_DEFAULT;
        panelState.composerEclipseCoronaMotion = COMPOSER_ECLIPSE_CORONA_DEFAULT;
        panelState.composerEclipseCoronaStructure = COMPOSER_ECLIPSE_CORONA_VARIATION_DEFAULT;
        panelState.composerEclipseZodiacalDust = COMPOSER_ECLIPSE_ZODIACAL_DUST_DEFAULT;
        panelState.composerSolarEclipseActive = false;
        panelState.composerEclipseAutoExposureEligible = true;
        panelState.composerInfoOverlayEnabled = true;
        panelState.composerRaDecGridEnabled = false;
        panelState.composerSkyLabelsEnabled = false;
        panelState.composerConstellationLinesEnabled = false;
        panelState.composerConstellationLabelsEnabled = false;
        panelState.composerStarMagnitudeLimit = COMPOSER_STAR_MAGNITUDE_DEFAULT;
        panelState.composerEarthCloudsEnabled = this.getEarthCloudsEnabled() !== false;
        if (panelState.composerInfoOverlayCheckbox) {
            panelState.composerInfoOverlayCheckbox.checked = true;
        }
        if (panelState.composerEarthAmbientSlider && panelState.composerEarthAmbientValue) {
            panelState.composerEarthAmbientSlider.value = String(panelState.composerEarthAmbient);
            const ambientText = panelState.composerEarthAmbient.toFixed(2);
            panelState.composerEarthAmbientValue.value = ambientText;
            panelState.composerEarthAmbientValue.textContent = ambientText;
        }
        if (panelState.composerMoonAmbientSlider && panelState.composerMoonAmbientValue) {
            panelState.composerMoonAmbientSlider.value = String(panelState.composerMoonAmbient);
            const ambientText = panelState.composerMoonAmbient.toFixed(2);
            panelState.composerMoonAmbientValue.value = ambientText;
            panelState.composerMoonAmbientValue.textContent = ambientText;
        }
        if (panelState.composerEarthshineSlider && panelState.composerEarthshineValue) {
            panelState.composerEarthshineSlider.value = String(panelState.composerEarthshineGain);
            const gainText = panelState.composerEarthshineGain.toFixed(2);
            panelState.composerEarthshineValue.value = gainText;
            panelState.composerEarthshineValue.textContent = gainText;
        }
        if (panelState.composerMoonshineSlider && panelState.composerMoonshineValue) {
            panelState.composerMoonshineSlider.value = String(panelState.composerMoonshineGain);
            const gainText = panelState.composerMoonshineGain.toFixed(2);
            panelState.composerMoonshineValue.value = gainText;
            panelState.composerMoonshineValue.textContent = gainText;
        }
        if (panelState.composerMoonOutlineCheckbox) {
            panelState.composerMoonOutlineCheckbox.checked = panelState.composerMoonOutlineEnabled;
        }
        if (panelState.composerSeeThroughCheckbox) {
            panelState.composerSeeThroughCheckbox.checked = panelState.composerSeeThroughEnabled;
        }
        if (panelState.composerExposureSlider && panelState.composerExposureValue) {
            panelState.composerExposureSlider.value = panelState.composerExposureEv.toFixed(1);
            const exposureText = `${panelState.composerExposureEv >= 0 ? "+" : ""}${panelState.composerExposureEv.toFixed(1)} EV`;
            panelState.composerExposureValue.value = exposureText;
            panelState.composerExposureValue.textContent = panelState.composerExposureValue.value;
        }
        if (panelState.composerExposureTotalValue) {
            const exposureState = this.resolveComposerExposureState(panelState);
            const totalEv = exposureState.manualEv + exposureState.autoEv;
            const totalText = `Total ${totalEv >= 0 ? "+" : ""}${totalEv.toFixed(1)} EV`;
            panelState.composerExposureTotalValue.value = totalText;
            panelState.composerExposureTotalValue.textContent = totalText;
        }
        if (panelState.composerAutoExposureCheckbox) {
            panelState.composerAutoExposureCheckbox.checked = panelState.composerAutoExposureEnabled !== false;
        }
        panelState.composerAutoExposureWrap?.classList.toggle(
            "is-active",
            panelState.composerAutoExposureEnabled !== false,
        );
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
        if (panelState.composerStarMagnitudeSlider && panelState.composerStarMagnitudeValue) {
            const magnitudeText = panelState.composerStarMagnitudeLimit.toFixed(1);
            panelState.composerStarMagnitudeSlider.value = magnitudeText;
            panelState.composerStarMagnitudeValue.value = magnitudeText;
            panelState.composerStarMagnitudeValue.textContent = magnitudeText;
        }
        panelState.syncComposerCloudsUi?.();
    }
    syncAutoToggleUi();
    onFovInput();
    if (panelState.mode === "composer") {
        this.updateComposerChipPresentation(panelState);
    }

    if (panelState.infoMode === "moon-visibility" && infoPill) {
        const onInfoPillClick = () => {
            panelState.farSideTintEnabled = !panelState.farSideTintEnabled;
            panelState.overlayDirty = true;
            this.requestRender?.();
        };
        infoPill.addEventListener("click", onInfoPillClick);
        panelState.onInfoPillClick = onInfoPillClick;
    } else if (infoPill) {
        infoPill.disabled = true;
    }

    this.root.appendChild(panel);
    if (panelState.mode === "composer") {
        panelState.disclosure = createComposerDisclosure({ panel, viewport: panelState.viewport });
    }
    this.panels.push(panelState);
    this.bindPanelDragging(panelState, header);
    this.bindPanelResizing(panelState, resizeGrip);
    panelState.onPanelPointerDown = () => {
        this.bringPanelToFront(panelState);
    };
    panel.addEventListener("pointerdown", panelState.onPanelPointerDown);
    this.setComposerControlsCollapsed(panelState, panelState.composerControlsCollapsed === true, {
        persist: false,
        requestRender: false,
    });
    if (Number.isFinite(persistedWidth)) {
        panel.style.width = `${Math.round(persistedWidth)}px`;
    }
    if (Number.isFinite(persistedHeight)) {
        panel.style.height = `${Math.round(persistedHeight)}px`;
    }
    const defaultPosition = this.getDefaultPanelPosition(panel, index);
    this.applyPanelPosition(
        panelState,
        Number.isFinite(persistedX) ? persistedX : defaultPosition.x,
        Number.isFinite(persistedY) ? persistedY : defaultPosition.y,
    );
    this.bringPanelToFront(panelState);

    this.panelStateByElement.set(panel, panelState);
    const resizeObserver = this.getPanelResizeObserver();
    resizeObserver?.observe(panel);
    this.syncPanelSize(panelState);
    this.applyPanelVisibilityState(
        panelState,
        hasPersistedVisibilityState ? persistedState : panelState.fallbackDefaultState,
        {
            persist: false,
            requestRender: false,
        },
    );
    this.syncPanelExpandButton(panelState);
    if (panelState.maximized === true) {
        panelState.panel.classList.add("is-maximized");
        this.applyMaximizedPanelFrame(panelState);
        this.syncPanelSize(panelState);
    }
    this.setPanelMissionEnabled(panelState, panelState.missionEnabled);
    registerMissionPanel({
        id: panelState.panelRegistryId,
        title: panelState.title,
        kind: panelState.mode === "composer" ? "workflow" : "view",
        panelType: panelState.mode === "composer" ? "flyby-focus" : "aux-camera-view",
        builtIn: true,
        available: panelState.missionEnabled === true,
        state: this.getPanelRegistryState(panelState),
        sortOrder: panelState.sortOrder,
        actions: {},
    });
    if (panelState.mode === "composer") {
        registerMissionPanel({
            id: COMPOSER_CONTROLS_PANEL_ID,
            title: "Frame Controls",
            kind: "workflow",
            panelType: "flyby-controls",
            builtIn: true,
            available: panelState.missionEnabled === true,
            state: "closed",
            sortOrder: Number.isFinite(panelState.sortOrder) ? panelState.sortOrder + 1 : 0,
            actions: {},
        });
        this.syncComposerControlsPanelRegistry(panelState);
    }
    this.syncPanelRegistry(panelState);
}
