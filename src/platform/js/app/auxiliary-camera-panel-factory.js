import { finalizeAuxiliaryCameraPanel } from "./auxiliary-camera-panel-finalization.js";
import { createComposerControlActions } from "./auxiliary-camera-composer-control-actions.js";
import { createComposerEventHandlers } from "./auxiliary-camera-composer-event-handlers.js";
import { bindComposerPanelInteractions } from "./auxiliary-camera-composer-interaction-binding.js";
import { createAuxiliaryCameraPanelContent } from "./auxiliary-camera-panel-content.js";
import { createAuxiliaryCameraPanelShell } from "./auxiliary-camera-panel-shell.js";
import { createAuxiliaryPanelRenderSurface } from "./auxiliary-camera-panel-render-surface.js";
import { createAuxiliaryPanelInitialState } from "./auxiliary-camera-panel-initial-state.js";

// Panel construction is isolated from the manager so its DOM and event wiring can evolve independently.
// The function retains the manager as its `this` context to preserve the existing lifecycle contract.

export function createAuxiliaryCameraPanel(spec, index, dependencies) {
    const {
        AUTO_FOV_MAX_DEGREES,
        AUTO_FOV_MIN_DEGREES,
        AUXILIARY_WHEEL_ZOOM_SENSITIVITY,
        ORBIT_XY_WHEEL_ZOOM_SENSITIVITY,
        isDomEventInstance,
        showMissionPanelInfo,
    } = dependencies;
    const shell = createAuxiliaryCameraPanelShell(spec, dependencies);
    const {
        panel,
        header,
        headerControls,
        panelControls,
        panelMode,
        panelSide,
        maxFovDegrees,
        fovControls,
        fovControl,
        autoToggle,
        fovSlider,
        fovValue,
        expandButton,
        infoButton,
        closeButton,
        deleteButton,
        composerControlsToggleButton,
    } = shell;

    const content = createAuxiliaryCameraPanelContent({
        THREE: this.THREE,
        spec,
        panel,
        panelMode,
        headerControls,
        fovControls,
        composerControlsToggleButton,
    }, dependencies);
    const { infoPill, composerSkyControlsWrap, composerSkyTimelineWrap } = content;

    const surface = createAuxiliaryPanelRenderSurface({
        THREE: this.THREE,
        panel,
        spec,
        panelMode,
        panelSide,
        chipDockLeft: this.chipDockLeft,
        chipDockRight: this.chipDockRight,
        composerSkyControlsWrap,
        composerSkyTimelineWrap,
    }, dependencies);
    if (!surface) return;
    const { viewport, renderer, overlayCanvas, overlayCtx, resizeGrip, chipButton, camera } = surface;
    const panelRegistryId = `aux:${spec.id}`;
    panel.id = `aux-camera-panel-${spec.id}`;
    panel.dataset.panelId = panelRegistryId;
    const {
        panelState,
        persistedState,
        hasPersistedVisibilityState,
        persistedX,
        persistedY,
        persistedWidth,
        persistedHeight,
    } = createAuxiliaryPanelInitialState({
        spec,
        index,
        panelRegistryId,
        shell,
        content,
        surface,
        composerEnabled: this.composerEnabled,
        missionPanelsEnabled: this.missionPanelsEnabled,
        normalizeRestoreFrame: (frame, fallback) => this.normalizePanelRestoreFrame(frame, fallback),
    }, dependencies);

    const syncAutoToggleUi = () => {
        const isFreeComposer = panelState.mode === "composer" &&
            (panelState.composerLockTarget || "none") === "none";
        if (isFreeComposer && panelState.autoFovEnabled === true) {
            panelState.autoFovEnabled = false;
        }
        const enabled = panelState.autoFovEnabled === true;
        panelState.fovControl?.setAutoEnabled(enabled);
        panelState.fovControl?.setDisabledState({
            autoButtonDisabled: autoToggle.disabled || isFreeComposer,
            sliderDisabled: enabled,
            valueDisabled: false,
        });
    };

    const onFovInput = () => {
        const fallbackFov = panelState.camera?.isOrthographicCamera
            ? (panelState.orbitZoomFovDegrees || 45)
            : panelState.camera.fov;
        const fov = panelState.fovControl?.readSliderFovDegrees(fallbackFov)
            ?? fallbackFov;
        this.setPanelFov(panelState, fov);
        this.requestRender?.();
        this.queuePersistPanelState();
    };
    const onAutoToggleClick = () => {
        if (panelState.mode === "orbit-xy") {
            panelState.autoFovEnabled = !panelState.autoFovEnabled;
            if (panelState.autoFovEnabled) {
                this.applyOrbitPlaneAutoFit(panelState);
            }
            syncAutoToggleUi();
            this.requestRender?.();
            this.queuePersistPanelState();
            return;
        }
        if (panelState.mode === "composer" && (panelState.composerLockTarget || "none") === "none") {
            return;
        }
        panelState.autoFovEnabled = !panelState.autoFovEnabled;
        syncAutoToggleUi();
        if (panelState.autoFovEnabled) {
            this.requestRender?.();
        } else {
            onFovInput();
        }
        this.queuePersistPanelState();
    };
    const onInfoClick = () => {
        showMissionPanelInfo(panelState.panelRegistryId, infoButton);
    };
    const onExpandClick = () => {
        this.setPanelMaximized(panelState, panelState.maximized !== true);
    };
    const onCloseClick = () => {
        this.setPanelClosed(panelState, true);
    };
    const onDeleteClick = () => {
        this.confirmAndDeletePanel(panelState);
    };
        const onChipClick = () => {
            if (panelState.mode === "composer") {
                this.restoreComposerGuidedPanel(panelState);
                return;
            }
            this.setPanelMinimized(panelState, false);
            this.bringPanelToFront(panelState);
        if (panelState.mode === "composer" && panelState.composerInteractionEnabled !== true) {
            this.activateComposerWindow(panelState, { finalize: true });
        }
    };
    fovSlider.addEventListener("input", onFovInput, { passive: true });
    autoToggle.addEventListener("click", onAutoToggleClick);
    infoButton.addEventListener("click", onInfoClick);
    expandButton.addEventListener("click", onExpandClick);
    closeButton.addEventListener("click", onCloseClick);
    deleteButton.addEventListener("click", onDeleteClick);
    chipButton.addEventListener("click", onChipClick);
    if (composerControlsToggleButton) {
        const onComposerControlsToggleClick = () => {
            if (this.isDockviewAuxiliaryPanelEnabled()) {
                this.toggleComposerControlsPanel(panelState);
                return;
            }
            this.setComposerControlsCollapsed(
                panelState,
                panelState.composerControlsCollapsed !== true,
            );
        };
        composerControlsToggleButton.addEventListener("click", onComposerControlsToggleClick);
        panelState.onComposerControlsToggleClick = onComposerControlsToggleClick;
    }
    panelState.onAutoToggleClick = onAutoToggleClick;
    panelState.onFovInput = onFovInput;
    panelState.onInfoClick = onInfoClick;
    panelState.onExpandClick = onExpandClick;
    panelState.onCloseClick = onCloseClick;
    panelState.onDeleteClick = onDeleteClick;
    panelState.onChipClick = onChipClick;

    if (panelState.mode === "composer") {
        const composerActions = createComposerControlActions.call(this, panelState, syncAutoToggleUi, dependencies);
        const composerHandlers = createComposerEventHandlers.call(this, panelState, composerActions, dependencies);
        bindComposerPanelInteractions.call(this, panelState, composerActions, composerHandlers);
    }
    if (panelState.mode === "orbit-xy") {
        const zoomOrbitPanelBy = (deltaY) => {
            if (panelState.autoFovEnabled) {
                panelState.autoFovEnabled = false;
                syncAutoToggleUi();
            }
            const currentFov = Number.isFinite(panelState.orbitZoomFovDegrees)
                ? panelState.orbitZoomFovDegrees
                : spec.defaultFov;
            const nextFov = this.THREE.MathUtils.clamp(
                currentFov * Math.exp(deltaY * ORBIT_XY_WHEEL_ZOOM_SENSITIVITY),
                AUTO_FOV_MIN_DEGREES,
                AUTO_FOV_MAX_DEGREES,
            );
            this.setPanelFov(panelState, nextFov);
            this.requestRender?.();
            this.queuePersistPanelState();
        };
        const onOrbitViewportWheel = (event) => {
            if (!isDomEventInstance(event, "WheelEvent")) {
                return;
            }
            event.preventDefault();
            zoomOrbitPanelBy(event.deltaY);
        };
        const onOrbitViewportPointerDown = (event) => {
            if (event.button !== 0) {
                return;
            }
            panelState.orbitViewportPointer = {
                pointerId: event.pointerId,
                clientX: event.clientX,
                clientY: event.clientY,
            };
            panelState.viewport.setPointerCapture(event.pointerId);
            event.preventDefault();
        };
        const onOrbitViewportPointerMove = (event) => {
            const drag = panelState.orbitViewportPointer;
            if (!drag || drag.pointerId !== event.pointerId) {
                return;
            }
            const dx = event.clientX - drag.clientX;
            const dy = event.clientY - drag.clientY;
            drag.clientX = event.clientX;
            drag.clientY = event.clientY;
            if (panelState.autoFovEnabled) {
                panelState.autoFovEnabled = false;
                syncAutoToggleUi();
            }
            const width = Math.max(1, panelState.overlayCanvas?.width || panelState.width || 1);
            const height = Math.max(1, panelState.overlayCanvas?.height || panelState.height || 1);
            const project = this.createOrbitPlaneProjector({
                width,
                height,
                earthWorld: this.earthWorld,
                halfHeight: panelState.orthographicHalfHeight,
                panOffsetX: panelState.orbitPanOffsetX,
                panOffsetY: panelState.orbitPanOffsetY,
            });
            panelState.orbitPanOffsetX -= dx / Math.max(project.scaleX || 1, 1e-9);
            panelState.orbitPanOffsetY += dy / Math.max(project.scaleY || 1, 1e-9);
            this.requestRender?.();
            event.preventDefault();
        };
        const releaseOrbitViewport = (event) => {
            const drag = panelState.orbitViewportPointer;
            if (!drag || drag.pointerId !== event.pointerId) {
                return;
            }
            if (panelState.viewport.hasPointerCapture(event.pointerId)) {
                panelState.viewport.releasePointerCapture(event.pointerId);
            }
            panelState.orbitViewportPointer = null;
            this.queuePersistPanelState();
        };
        panelState.viewport.addEventListener("wheel", onOrbitViewportWheel, { passive: false });
        panelState.viewport.addEventListener("pointerdown", onOrbitViewportPointerDown);
        panelState.viewport.addEventListener("pointermove", onOrbitViewportPointerMove);
        panelState.viewport.addEventListener("pointerup", releaseOrbitViewport);
        panelState.viewport.addEventListener("pointercancel", releaseOrbitViewport);
        panelState.onOrbitViewportWheel = onOrbitViewportWheel;
        panelState.onOrbitViewportPointerDown = onOrbitViewportPointerDown;
        panelState.onOrbitViewportPointerMove = onOrbitViewportPointerMove;
        panelState.onOrbitViewportPointerUp = releaseOrbitViewport;
    }
    if (panelState.mode !== "composer" && panelState.mode !== "orbit-xy") {
        const onAuxiliaryViewportWheel = (event) => {
            if (!isDomEventInstance(event, "WheelEvent")) {
                return;
            }
            event.preventDefault();
            if (panelState.autoFovEnabled) {
                panelState.autoFovEnabled = false;
                syncAutoToggleUi();
            }
            const currentFov = Number.isFinite(panelState.camera?.fov)
                ? panelState.camera.fov
                : spec.defaultFov;
            const nextFov = this.THREE.MathUtils.clamp(
                currentFov * Math.exp(event.deltaY * AUXILIARY_WHEEL_ZOOM_SENSITIVITY),
                panelState.fovMinDegrees ?? AUTO_FOV_MIN_DEGREES,
                panelState.fovMaxDegrees ?? AUTO_FOV_MAX_DEGREES,
            );
            this.setPanelFov(panelState, nextFov);
            this.requestRender?.();
            this.queuePersistPanelState();
        };
        panelState.viewport.addEventListener("wheel", onAuxiliaryViewportWheel, { passive: false });
        panelState.onAuxiliaryViewportWheel = onAuxiliaryViewportWheel;
    }

    finalizeAuxiliaryCameraPanel.call(this, {
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
    }, dependencies);
}
