import {
    AUXILIARY_CAMERA_PANEL_DEPENDENCIES,
} from "./auxiliary-camera-dependencies.js";
import * as shared from "./auxiliary-camera-shared.js";

const {
    createAuxiliaryCameraPanel,
    getMissionPanelDefaultState,
    getMissionPanelLayoutPresetVersion,
    isDesktopViewport,
    isMissionPanelEnabled,
    shouldEnableAuxiliaryPanels,
    shouldEnableEarthriseComposer,
} = shared;

export const panelRuntimeMethods = {
    createPanel(spec, index) {
        return createAuxiliaryCameraPanel.call(this, spec, index, AUXILIARY_CAMERA_PANEL_DEPENDENCIES);
    },
    handlePanelResizeEntries(entries) {
        for (const entry of entries || []) {
            const panelState = this.panelStateByElement.get(entry.target);
            if (panelState) {
                this.pendingResizePanelStates.add(panelState);
            }
        }

        if (this.pendingResizeRaf != null) {
            return;
        }
        this.pendingResizeRaf = requestAnimationFrame(() => {
            this.pendingResizeRaf = null;
            for (const panelState of this.pendingResizePanelStates) {
                this.syncPanelSize(panelState);
            }
            this.pendingResizePanelStates.clear();
            this.queuePersistPanelState();
            this.requestRender?.();
        });
    },
    handleResize() {
        if (!this.root) {
            return;
        }
        const visible = this.panelsEnabled && isDesktopViewport();
        this.root.hidden = !visible;
        if (!visible) return;
        this.applyDefaultPanelLayout();
        for (const panelState of this.panels) {
            if (panelState.maximized === true) {
                this.applyMaximizedPanelFrame(panelState);
            }
            this.syncPanelSize(panelState);
        }
        this.queuePersistPanelState();
    },
    setPanelVisible(panelState, visible) {
        if (panelState?.missionEnabled === false) {
            panelState.panel.hidden = true;
            if (panelState.chipButton) {
                panelState.chipButton.hidden = true;
            }
            this.clearPanelOverlay(panelState);
            return;
        }
        const shouldShowPanel = visible &&
            panelState.minimized !== true &&
            panelState.closed !== true &&
            panelState.deleted !== true;
        if (shouldShowPanel && this.isDockviewAuxiliaryPanelEnabled()) {
            this.ensureAuxiliaryPanelDocked(panelState);
        } else if (!shouldShowPanel && panelState.mode === "composer") {
            this.closeComposerControlsPanel(panelState);
        }
        panelState.panel.hidden = !shouldShowPanel;
        if (panelState.chipButton) {
            panelState.chipButton.hidden = panelState.minimized !== true ||
                panelState.closed === true ||
                panelState.deleted === true;
        }
        if (!shouldShowPanel) {
            this.clearPanelOverlay(panelState);
        }
    },
    setPanelInfo(panelState, primary = "", secondary = "", options = {}) {
        if (!panelState?.info || !panelState?.infoPrimaryText || !panelState?.infoSecondary || !panelState?.infoPill) {
            return;
        }
        const hasInfoMode = panelState.infoMode && panelState.infoMode !== "none";
        if (!hasInfoMode) {
            panelState.info.hidden = true;
            return;
        }
        panelState.info.hidden = false;
        panelState.infoPrimaryText.textContent = primary || "";
        panelState.infoSecondary.textContent = secondary || "";
        panelState.infoSecondary.hidden = !secondary;

        const pillText = typeof options.pillText === "string" ? options.pillText.trim() : "";
        const pillVariant = typeof options.pillVariant === "string" ? options.pillVariant.trim() : "";
        panelState.infoPill.hidden = pillText.length === 0;
        panelState.infoPill.textContent = pillText;
        panelState.infoPill.className = "aux-camera-view__pill";
        if (pillText.length > 0 && pillVariant.length > 0) {
            panelState.infoPill.classList.add(`aux-camera-view__pill--${pillVariant}`);
        }

        const pillInteractive = options.pillInteractive === true;
        panelState.infoPill.disabled = !pillInteractive;
        if (pillInteractive) {
            panelState.infoPill.classList.add("aux-camera-view__pill--button");
            const pressed = options.pillOn === true;
            panelState.infoPill.setAttribute("aria-pressed", pressed ? "true" : "false");
            panelState.infoPill.classList.toggle("is-on", pressed);
            panelState.infoPill.classList.toggle("is-off", !pressed);
            panelState.infoPill.title = pressed ? "Disable far-side overlay" : "Enable far-side overlay";
        } else {
            panelState.infoPill.removeAttribute("aria-pressed");
            panelState.infoPill.classList.remove("aux-camera-view__pill--button", "is-on", "is-off");
            panelState.infoPill.title = "";
        }
    },
    setComposerControlsCollapsed(panelState, collapsed, { persist = true, requestRender = true } = {}) {
        if (!panelState || panelState.mode !== "composer" || !panelState.panel) {
            return;
        }
        const isCollapsed = collapsed === true;
        panelState.composerControlsCollapsed = isCollapsed;
        panelState.panel.classList.toggle("aux-camera-view--composer-controls-collapsed", isCollapsed);
        if (panelState.composerControlsToggleButton) {
            const toggleHost = this.isDockviewAuxiliaryPanelEnabled() || isCollapsed
                ? panelState.viewport
                : panelState.composerControlMatrix;
            if (toggleHost && panelState.composerControlsToggleButton.parentElement !== toggleHost) {
                if (isCollapsed) {
                    toggleHost.appendChild(panelState.composerControlsToggleButton);
                } else {
                    toggleHost.prepend(panelState.composerControlsToggleButton);
                }
            }
            panelState.composerControlsToggleButton.textContent = "";
            panelState.composerControlsToggleButton.setAttribute(
                "aria-label",
                isCollapsed ? "Expand Frame and Shoot controls" : "Collapse Frame and Shoot controls",
            );
            panelState.composerControlsToggleButton.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
            panelState.composerControlsToggleButton.title = isCollapsed
                ? "Expand controls"
                : "Collapse controls";
        }
        this.updateComposerControlsPopoverPosition(panelState);
        this.scheduleVisiblePanelRefresh(panelState);
        if (persist) {
            this.queuePersistPanelState();
        }
        if (requestRender) {
            this.requestRender?.();
        }
    },
    setComposerInteractionEnabled(panelState, enabled) {
        if (!panelState || panelState.mode !== "composer") {
            return;
        }
        const isEnabled = enabled === true;
        panelState.composerInteractionEnabled = isEnabled;
        panelState.panel.classList.toggle("aux-camera-view--composer-disabled", !isEnabled);

        const disableControls = !isEnabled;
        const isFreeComposer = (panelState.composerLockTarget || "none") === "none";
        panelState.fovControl?.setDisabledState({
            autoButtonDisabled: disableControls || isFreeComposer,
            sliderDisabled: disableControls || panelState.autoFovEnabled,
            valueDisabled: disableControls,
        });
        panelState.composerLookFreeButton && (panelState.composerLookFreeButton.disabled = false);
        panelState.composerLookEarthButton && (panelState.composerLookEarthButton.disabled = false);
        panelState.composerLookMoonButton && (panelState.composerLookMoonButton.disabled = false);
        panelState.composerResetButton && (panelState.composerResetButton.disabled = disableControls);
        panelState.composerEarthAmbientSlider && (panelState.composerEarthAmbientSlider.disabled = disableControls);
        panelState.composerMoonAmbientSlider && (panelState.composerMoonAmbientSlider.disabled = disableControls);
        panelState.composerEarthshineSlider && (panelState.composerEarthshineSlider.disabled = disableControls);
        panelState.composerMoonshineSlider && (panelState.composerMoonshineSlider.disabled = disableControls);
        panelState.composerMoonOutlineCheckbox && (panelState.composerMoonOutlineCheckbox.disabled = disableControls);
        panelState.composerSeeThroughCheckbox && (panelState.composerSeeThroughCheckbox.disabled = disableControls);
        panelState.composerCloudsCheckbox && (panelState.composerCloudsCheckbox.disabled = disableControls);
        if (panelState.composerLunarCraterControls) {
            panelState.composerLunarCraterControls.disabled = disableControls;
            panelState.syncComposerLunarCratersUi?.();
        }
        panelState.composerSurfacePointsPill && (panelState.composerSurfacePointsPill.disabled = disableControls);
        panelState.composerSurfacePointControls?.entries?.forEach?.(({ input }) => {
            if (input) input.disabled = disableControls;
        });
        panelState.composerOpticsToggleButton && (panelState.composerOpticsToggleButton.disabled = disableControls);
        panelState.composerOpticsPhysicalButton && (panelState.composerOpticsPhysicalButton.disabled = disableControls);
        panelState.composerOpticsCameraButton && (panelState.composerOpticsCameraButton.disabled = disableControls);
        panelState.composerExposureSlider && (panelState.composerExposureSlider.disabled = disableControls);
        panelState.composerAutoExposureCheckbox && (panelState.composerAutoExposureCheckbox.disabled = disableControls);
        panelState.composerOpticsStrengthSlider && (panelState.composerOpticsStrengthSlider.disabled = disableControls);
        panelState.composerOpticsHaloSlider && (panelState.composerOpticsHaloSlider.disabled = disableControls);
        panelState.composerOpticsStarburstSlider && (panelState.composerOpticsStarburstSlider.disabled = disableControls);
        panelState.composerOpticsFlareSlider && (panelState.composerOpticsFlareSlider.disabled = disableControls);
        panelState.composerEclipseCoronaIntensitySlider &&
            (panelState.composerEclipseCoronaIntensitySlider.disabled = disableControls);
        panelState.composerEclipseCoronaMotionSlider &&
            (panelState.composerEclipseCoronaMotionSlider.disabled = disableControls);
        panelState.composerEclipseCoronaStructureSlider &&
            (panelState.composerEclipseCoronaStructureSlider.disabled = disableControls);
        panelState.composerEclipseZodiacalDustSlider &&
            (panelState.composerEclipseZodiacalDustSlider.disabled = disableControls);
        panelState.composerStarMagnitudeSlider && (panelState.composerStarMagnitudeSlider.disabled = disableControls);
        panelState.composerRollSlider && (panelState.composerRollSlider.disabled = disableControls);
        panelState.composerRollDial && (panelState.composerRollDial.disabled = disableControls);
        panelState.composerRaDecGridCheckbox && (panelState.composerRaDecGridCheckbox.disabled = disableControls);
        panelState.composerSkyLabelsCheckbox && (panelState.composerSkyLabelsCheckbox.disabled = disableControls);
        panelState.composerConstellationLinesCheckbox &&
            (panelState.composerConstellationLinesCheckbox.disabled = disableControls);
        panelState.composerConstellationLabelsCheckbox &&
            (panelState.composerConstellationLabelsCheckbox.disabled = disableControls);
        if (panelState.composerTimelineSlider) {
            panelState.composerTimelineSlider.disabled = disableControls;
        }
        panelState.composerPhasePrevButton && (panelState.composerPhasePrevButton.disabled = disableControls);
        panelState.composerPhaseNextButton && (panelState.composerPhaseNextButton.disabled = disableControls);
        panelState.composerTransportMinusSecondButton && (panelState.composerTransportMinusSecondButton.disabled = disableControls);
        panelState.composerTransportMinusMinuteButton && (panelState.composerTransportMinusMinuteButton.disabled = disableControls);
        panelState.composerTransportPlusMinuteButton && (panelState.composerTransportPlusMinuteButton.disabled = disableControls);
        panelState.composerTransportPlusSecondButton && (panelState.composerTransportPlusSecondButton.disabled = disableControls);
        if (panelState.composerDisabledOverlay) {
            panelState.composerDisabledOverlay.hidden = isEnabled;
        }
    },
    setPanelMissionEnabled(panelState, enabled) {
        panelState.missionEnabled = enabled === true;
        if (panelState.missionEnabled) {
            if (panelState.deleted === true) {
                panelState.panel.hidden = true;
                if (panelState.chipButton) panelState.chipButton.hidden = true;
            } else if (panelState.closed === true) {
                panelState.panel.hidden = true;
                if (panelState.chipButton) panelState.chipButton.hidden = true;
            } else if (panelState.minimized === true) {
                panelState.panel.hidden = true;
                if (panelState.chipButton) panelState.chipButton.hidden = false;
            } else {
                panelState.panel.hidden = false;
                if (panelState.chipButton) panelState.chipButton.hidden = true;
            }
            this.syncPanelRegistry(panelState);
            return;
        }
        panelState.panel.hidden = true;
        if (panelState.chipButton) {
            panelState.chipButton.hidden = true;
        }
        this.clearPanelOverlay(panelState);
        this.syncPanelRegistry(panelState);
    },
    updateComposerControlsPopoverPosition(panelState) {
        if (
            !panelState ||
            panelState.mode !== "composer" ||
            panelState.composerControlsCollapsed === true ||
            !panelState.panel ||
            !panelState.composerControlMatrix
        ) {
            return;
        }

        const panelRect = panelState.panel.getBoundingClientRect?.();
        if (!panelRect || !Number.isFinite(panelRect.left) || !Number.isFinite(panelRect.top)) {
            return;
        }

        const windowRef = panelState.panel.ownerDocument?.defaultView ||
            (typeof window !== "undefined" ? window : null);
        const viewportWidth = Math.max(1, Number(windowRef?.innerWidth) || 1);
        const viewportHeight = Math.max(1, Number(windowRef?.innerHeight) || 1);
        const gap = 8;
        const edgePad = 8;
        const preferredWidth = Math.min(340, Math.max(286, Math.round(panelRect.width * 0.38)));
        const headerHeight = Math.max(
            0,
            Number(panelState.panel.querySelector?.(".aux-camera-view__header")?.getBoundingClientRect?.().height) || 0,
        );
        let left = panelRect.left - preferredWidth - gap;
        if (left < edgePad) {
            left = panelRect.right + gap;
        }
        left = Math.min(Math.max(edgePad, left), Math.max(edgePad, viewportWidth - preferredWidth - edgePad));

        const top = Math.min(
            Math.max(edgePad, panelRect.top + headerHeight + 6),
            Math.max(edgePad, viewportHeight - 180),
        );
        const maxHeight = Math.max(180, Math.min(viewportHeight - top - edgePad, 640));

        panelState.composerControlMatrix.style.setProperty("--aux-composer-controls-popout-left", `${Math.round(left)}px`);
        panelState.composerControlMatrix.style.setProperty("--aux-composer-controls-popout-top", `${Math.round(top)}px`);
        panelState.composerControlMatrix.style.setProperty("--aux-composer-controls-popout-width", `${Math.round(preferredWidth)}px`);
        panelState.composerControlMatrix.style.setProperty("--aux-composer-controls-popout-max-height", `${Math.round(maxHeight)}px`);
    },
    syncMissionPanelPolicy(missionConfig) {
        const nextPanelsEnabled = shouldEnableAuxiliaryPanels(missionConfig);
        const nextComposerEnabled = nextPanelsEnabled && shouldEnableEarthriseComposer(missionConfig);
        const policyChanged =
            this.missionPanelsEnabled !== nextPanelsEnabled ||
            this.composerEnabled !== nextComposerEnabled;
        const missionConfigChanged = this.lastMissionConfig !== missionConfig;
        const hasPendingDefaultState = !!(
            missionConfig &&
            typeof missionConfig === "object" &&
            this.panels.some((panelState) =>
                panelState.hasPersistedVisibilityState !== true &&
                panelState.defaultStateApplied !== true)
        );
        if (!policyChanged && !missionConfigChanged && !hasPendingDefaultState) {
            return;
        }
        this.missionPanelsEnabled = nextPanelsEnabled;
        this.composerEnabled = nextComposerEnabled;
        this.lastMissionConfig = missionConfig;
        for (const panelState of this.panels) {
            const configuredLayoutPresetVersion = getMissionPanelLayoutPresetVersion(
                missionConfig,
                panelState.panelRegistryId,
            );
            if (
                configuredLayoutPresetVersion &&
                configuredLayoutPresetVersion !== panelState.layoutPresetVersion
            ) {
                panelState.layoutPresetVersion = configuredLayoutPresetVersion;
                panelState.hasPersistedVisibilityState = false;
                panelState.defaultStateApplied = false;
                panelState.defaultLayoutManaged = true;
                panelState.restoreFrame = null;
                panelState.maximized = false;
                panelState.panel.classList.toggle("is-maximized", panelState.maximized === true);
                this.syncPanelExpandButton(panelState);
            }
            if (
                missionConfig &&
                typeof missionConfig === "object" &&
                panelState.hasPersistedVisibilityState !== true &&
                panelState.defaultStateApplied !== true
            ) {
                const defaultState = getMissionPanelDefaultState(
                    missionConfig,
                    panelState.panelRegistryId,
                    { fallbackState: panelState.fallbackDefaultState || "open" },
                );
                this.applyPanelVisibilityState(panelState, defaultState, {
                    persist: false,
                    requestRender: false,
                });
                panelState.defaultStateApplied = true;
            }
            const globallyEnabled = panelState.mode === "composer"
                ? this.composerEnabled
                : this.missionPanelsEnabled;
            const configuredEnabled = isMissionPanelEnabled(
                missionConfig,
                panelState.panelRegistryId,
                { fallbackEnabled: true },
            );
            this.setPanelMissionEnabled(panelState, globallyEnabled && configuredEnabled);
        }
        if (this.panels.some((panelState) => panelState.defaultLayoutManaged !== false)) {
            this.scheduleDefaultPanelLayout();
        }
    },
};
