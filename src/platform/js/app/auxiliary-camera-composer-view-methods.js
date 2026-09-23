import * as shared from "./auxiliary-camera-shared.js";

const {
    inferMediaShotViewHint,
    resolveComposerViewIntent,
} = shared;

export const composerViewMethods = {
    readComposerViewState(panelState) {
        return {
            lockTarget: panelState?.composerLockTarget,
            autoFovEnabled: panelState?.autoFovEnabled === true,
            orientationReference: panelState?.composerOrientationReference,
            surfaceTarget: panelState?.composerSurfaceTarget || null,
            mediaDriven: panelState?.composerMediaDriven === true,
        };
    },
    applyComposerViewState(panelState, viewState, {
        syncComposerLockUi = null,
        syncAutoToggleUi = null,
        persist = true,
        requestRender = true,
    } = {}) {
        if (!panelState || panelState.mode !== "composer" || !viewState) {
            return false;
        }
        panelState.composerLockTarget = viewState.lockTarget || "none";
        panelState.autoFovEnabled = viewState.autoFovEnabled === true;
        this.setComposerOrientationReference(
            panelState,
            viewState.orientationReference || "world",
            { preserveView: false },
        );
        panelState.composerSurfaceTarget = viewState.surfaceTarget || null;
        panelState.composerMediaDriven = viewState.mediaDriven === true;
        if (Number.isFinite(viewState.manualFovDegrees)) {
            this.setPanelFov(panelState, viewState.manualFovDegrees);
        }
        if (typeof syncComposerLockUi === "function") {
            syncComposerLockUi();
        }
        if (typeof syncAutoToggleUi === "function") {
            syncAutoToggleUi();
        }
        if (requestRender) {
            this.requestRender?.();
        }
        if (persist) {
            this.queuePersistPanelState?.();
        }
        return true;
    },
    applyComposerViewIntent(panelState, intent, options = {}) {
        const result = resolveComposerViewIntent(this.readComposerViewState(panelState), intent);
        if (!result.applied) {
            return false;
        }
        return this.applyComposerViewState(panelState, result.state, options);
    },
    applyComposerGuidedViewState(panelState, options = {}) {
        return this.applyComposerViewIntent(panelState, { type: "guided" }, options);
    },
    restoreComposerGuidedPanel(panelState, { seekTimeMs = Number.NaN } = {}) {
        if (!panelState || panelState.mode !== "composer") {
            return false;
        }
        this.restorePanel(panelState);
        this.applyComposerGuidedViewState(panelState, {
            syncComposerLockUi: panelState.syncComposerLockUi,
            syncAutoToggleUi: panelState.syncComposerAutoToggleUi,
            persist: false,
        });
        if (Number.isFinite(seekTimeMs)) {
            this.seekMainTimelineTime(seekTimeMs, true);
        }
        this.requestRender?.();
        this.queuePersistPanelState?.();
        return true;
    },
    getComposerPanelState() {
        return this.panels.find((panelState) => panelState?.mode === "composer") || null;
    },
    handleMissionMediaItemSelect(event) {
        const item = event?.detail?.item;
        const hint = event?.detail?.shotViewHint || inferMediaShotViewHint(item);
        if (!hint) {
            return false;
        }
        const panelState = this.getComposerPanelState();
        if (!panelState || panelState.missionEnabled !== true) {
            return false;
        }
        this.restorePanel(panelState);
        return this.applyComposerMediaShotHint(panelState, hint);
    },
    applyComposerMediaShotHint(panelState, hint, { persist = true } = {}) {
        if (!panelState || panelState.mode !== "composer" || !hint) {
            return false;
        }
        const result = resolveComposerViewIntent(this.readComposerViewState(panelState), {
            type: "media-shot",
            hint,
        });
        if (!result.applied) {
            return false;
        }
        return this.applyComposerViewState(panelState, result.state, {
            syncComposerLockUi: panelState.syncComposerLockUi,
            syncAutoToggleUi: panelState.syncComposerAutoToggleUi,
            persist,
        });
    },
    updateComposerChipPresentation(panelState) {
        if (!panelState || panelState.mode !== "composer" || !panelState.chipButton) {
            return;
        }
        const chip = panelState.chipButton;
        chip.classList.remove("aux-camera-chip--composer-teaser");
        chip.classList.add("aux-camera-chip--composer-tab");
        chip.replaceChildren();
        chip.textContent = "Frame and Shoot";
        chip.setAttribute("aria-label", `Open ${panelState.title}`);
    },
    scheduleVisiblePanelRefresh(panelState) {
        if (!panelState?.panel || !panelState?.viewport || panelState.panel.hidden) {
            return;
        }
        if (panelState.visibleRefreshRaf != null) {
            cancelAnimationFrame(panelState.visibleRefreshRaf);
        }
        panelState.visibleRefreshRaf = requestAnimationFrame(() => {
            panelState.visibleRefreshRaf = null;
            if (!panelState?.panel || !panelState?.viewport || panelState.panel.hidden) {
                return;
            }
            this.syncPanelSize(panelState);
            this.requestRender?.();
        });
    },
    scheduleVisiblePanelsRefresh() {
        if (this.visiblePanelsRefreshRaf != null) {
            cancelAnimationFrame(this.visiblePanelsRefreshRaf);
        }
        this.visiblePanelsRefreshRaf = requestAnimationFrame(() => {
            this.visiblePanelsRefreshRaf = null;
            for (const panelState of this.panels) {
                if (!panelState?.panel || !panelState?.viewport || panelState.panel.hidden) {
                    continue;
                }
                this.syncPanelSize(panelState);
            }
            this.requestRender?.();
        });
    },
};
