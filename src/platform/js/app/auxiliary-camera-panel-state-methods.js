import * as shared from "./auxiliary-camera-shared.js";

const {
    bringPanelElementToFront,
    getDockviewSpikeLayoutHost,
} = shared;

export const panelStateMethods = {
    applyPanelPosition(panelState, x, y) {
        const width = Math.max(120, Math.round(panelState.panel.offsetWidth || panelState.width || 280));
        const height = Math.max(80, Math.round(panelState.panel.offsetHeight || panelState.height || 192));
        const clamped = this.clampPanelRect({ x, y, width, height });
        panelState.x = clamped.x;
        panelState.y = clamped.y;
        panelState.panel.style.left = `${panelState.x}px`;
        panelState.panel.style.top = `${panelState.y}px`;
        this.updateComposerControlsPopoverPosition(panelState);
    },
    clampPanelPosition(panelState) {
        const currentX = Number.isFinite(panelState.x) ? panelState.x : panelState.panel.offsetLeft;
        const currentY = Number.isFinite(panelState.y) ? panelState.y : panelState.panel.offsetTop;
        this.applyPanelPosition(panelState, currentX, currentY);
    },
    bringPanelToFront(panelState) {
        bringPanelElementToFront(this.root);
        this.zIndexCounter += 1;
        panelState.panel.style.zIndex = String(this.zIndexCounter);
    },
    dismissMoonRenderPanelFor(panelState) {
        if (panelState?.composerMoonRenderPill?.getAttribute?.("aria-expanded") !== "true") {
            return;
        }
        document.dispatchEvent(new CustomEvent("moon-mission:moon-render-panel-dismiss"));
    },
    setPanelMinimized(panelState, minimized, { persist = true, requestRender = true } = {}) {
        const nextMinimized = minimized === true;
        if (nextMinimized) {
            this.dismissMoonRenderPanelFor(panelState);
        }
        if (nextMinimized) {
            panelState.closed = false;
            panelState.deleted = false;
        }
        panelState.minimized = nextMinimized;
        panelState.panel.classList.toggle("is-minimized", nextMinimized);
        panelState.panel.hidden = nextMinimized;
        if (panelState.chipButton) {
            panelState.chipButton.hidden = !nextMinimized || panelState.closed === true;
            panelState.chipButton.setAttribute("aria-pressed", nextMinimized ? "true" : "false");
            panelState.chipButton.title = nextMinimized
                ? `Restore ${panelState.title}`
                : `Show ${panelState.title}`;
        }
        if (nextMinimized) {
            this.clearPanelOverlay(panelState);
        } else {
            this.scheduleVisiblePanelRefresh(panelState);
        }
        if (persist) {
            this.queuePersistPanelState();
        }
        if (requestRender) {
            this.requestRender?.();
        }
        this.syncPanelRegistry(panelState);
    },
    setPanelMaximized(panelState, maximized, { persist = true, requestRender = true } = {}) {
        if (!panelState?.panel) {
            return;
        }
        const nextMaximized = maximized === true;
        if (nextMaximized === (panelState.maximized === true)) {
            this.syncPanelExpandButton(panelState);
            return;
        }

        if (nextMaximized) {
            panelState.restoreFrame = this.capturePanelFrame(panelState);
            panelState.deleted = false;
            panelState.closed = false;
            panelState.minimized = false;
            panelState.maximized = true;
            panelState.panel.classList.add("is-maximized");
            this.applyMaximizedPanelFrame(panelState);
            this.bringPanelToFront(panelState);
        } else {
            panelState.maximized = false;
            panelState.panel.classList.remove("is-maximized");
            const restoreFrame = this.normalizePanelRestoreFrame(
                panelState.restoreFrame,
                this.capturePanelFrame(panelState),
            );
            if (restoreFrame) {
                panelState.panel.style.width = `${restoreFrame.width}px`;
                panelState.panel.style.height = `${restoreFrame.height}px`;
                this.applyPanelPosition(panelState, restoreFrame.x, restoreFrame.y);
            } else {
                this.clampPanelPosition(panelState);
            }
        }

        this.syncPanelExpandButton(panelState);
        this.syncPanelSize(panelState);
        if (persist) {
            this.queuePersistPanelState();
        }
        if (requestRender) {
            this.requestRender?.();
        }
        this.syncPanelRegistry(panelState);
    },
    setPanelClosed(panelState, closed, { persist = true, requestRender = true } = {}) {
        const nextClosed = closed === true;
        if (nextClosed) {
            this.dismissMoonRenderPanelFor(panelState);
        }
        panelState.closed = nextClosed;
        if (nextClosed) {
            panelState.minimized = false;
            panelState.deleted = false;
        }
        if (nextClosed && this.isAuxiliaryPanelDocked(panelState)) {
            this.closeDockedAuxiliaryPanel(panelState);
        }
        panelState.panel.hidden = nextClosed || panelState.minimized === true;
        if (panelState.chipButton) {
            panelState.chipButton.hidden = nextClosed || panelState.minimized !== true;
        }
        if (nextClosed) {
            this.clearPanelOverlay(panelState);
        }
        if (persist) {
            this.queuePersistPanelState();
        }
        if (requestRender) {
            this.requestRender?.();
        }
        this.syncPanelRegistry(panelState);
    },
    setPanelDeleted(panelState, deleted, { persist = true, requestRender = true } = {}) {
        const nextDeleted = deleted === true;
        if (nextDeleted) {
            this.dismissMoonRenderPanelFor(panelState);
        }
        if (nextDeleted && panelState.maximized === true) {
            this.setPanelMaximized(panelState, false, {
                persist: false,
                requestRender: false,
            });
        }
        panelState.deleted = nextDeleted;
        if (nextDeleted) {
            panelState.minimized = false;
            panelState.closed = false;
            panelState.panel.hidden = true;
            if (panelState.chipButton) {
                panelState.chipButton.hidden = true;
            }
            this.clearPanelOverlay(panelState);
        }
        this.syncPanelExpandButton(panelState);
        if (persist) {
            this.queuePersistPanelState();
        }
        if (requestRender) {
            this.requestRender?.();
        }
        this.syncPanelRegistry(panelState);
    },
    restorePanel(panelState) {
        if (!panelState) {
            return;
        }
        const wasHidden = panelState.minimized === true || panelState.closed === true || panelState.deleted === true;
        panelState.deleted = false;
        panelState.closed = false;
        this.setPanelMinimized(panelState, false, {
            persist: true,
            requestRender: false,
        });
        if (this.isDockviewAuxiliaryPanelEnabled()) {
            this.ensureAuxiliaryPanelDocked(panelState);
        }
        if (wasHidden && panelState.defaultLayoutManaged !== false) {
            this.scheduleDefaultPanelLayout();
        }
        if (this.isAuxiliaryPanelDocked(panelState)) {
            getDockviewSpikeLayoutHost()?.focusPanel?.(panelState.panelRegistryId);
        } else {
            this.bringPanelToFront(panelState);
        }
        this.requestRender?.();
        this.syncPanelRegistry(panelState);
    },
};
