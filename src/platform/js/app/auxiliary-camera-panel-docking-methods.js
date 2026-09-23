import * as shared from "./auxiliary-camera-shared.js";

const {
    COMPOSER_CONTROLS_PANEL_ID,
    PANEL_MIN_SIDE_COMPOSER,
    PANEL_MIN_SIDE_DEFAULT,
    asTrimmedString,
    getDockviewSpikeLayoutHost,
    isDomElement,
    resolveDockedWorkflowPanelPosition,
    updateMissionPanel,
} = shared;

export const panelDockingMethods = {
    shouldStartDrag(event) {
        if (event.button !== 0) return false;
        if (!isDomElement(event.target)) return false;
        return !event.target.closest("input, button, select, option, label, output");
    },
    isDockviewAuxiliaryPanelEnabled() {
        return !!getDockviewSpikeLayoutHost();
    },
    isAuxiliaryPanelDocked(panelState) {
        return !!panelState?.panel?.classList?.contains?.("aux-camera-view--dockview");
    },
    ensureAuxiliaryPanelDocked(panelState) {
        if (!panelState?.panel || !panelState.panelRegistryId) {
            return false;
        }
        const layoutHost = getDockviewSpikeLayoutHost();
        if (!layoutHost) {
            return false;
        }
        if (layoutHost.api?.getPanel?.(panelState.panelRegistryId)) {
            return true;
        }
        layoutHost.addPanel({
            id: panelState.panelRegistryId,
            component: "mounted-element",
            title: panelState.title,
            position: resolveDockedWorkflowPanelPosition(layoutHost, panelState.panelRegistryId),
            params: {
                mountElementId: panelState.panel.id,
                mountClassName: "aux-camera-view--dockview",
                fallbackParentId: "aux-camera-views",
            },
            initialWidth: panelState.mode === "composer" ? 320 : 200,
            initialHeight: panelState.mode === "composer" ? 360 : 260,
            minimumWidth: panelState.mode === "composer" ? 280 : 170,
            minimumHeight: panelState.mode === "composer" ? 260 : 180,
        });
        layoutHost.focusPanel(panelState.panelRegistryId);
        return true;
    },
    openComposerControlsPanel(panelState) {
        if (!panelState || panelState.mode !== "composer" || !panelState.composerControlMatrix) {
            return false;
        }
        const layoutHost = getDockviewSpikeLayoutHost();
        if (!layoutHost) {
            return false;
        }
        this.ensureAuxiliaryPanelDocked(panelState);
        if (!layoutHost.api?.getPanel?.(COMPOSER_CONTROLS_PANEL_ID)) {
            layoutHost.addPanel({
                id: COMPOSER_CONTROLS_PANEL_ID,
                component: "mounted-element",
                title: "Frame Controls",
                floating: this.resolveComposerControlsFloatingFrame(panelState),
                params: {
                    mountElementId: COMPOSER_CONTROLS_PANEL_ID,
                    mountClassName: "aux-camera-view__composer-control-matrix--dockview",
                    fallbackParentId: panelState.panel.id,
                },
                initialWidth: 320,
                minimumWidth: 280,
                minimumHeight: 260,
            });
        }
        panelState.composerControlsDockviewOpen = true;
        this.syncComposerControlsPanelRegistry(panelState);
        this.syncComposerControlsToggleUi(panelState);
        layoutHost.focusPanel(COMPOSER_CONTROLS_PANEL_ID);
        return true;
    },
    resolveComposerControlsFloatingFrame(panelState) {
        const frameRect = panelState?.panel?.getBoundingClientRect?.() || {};
        const workspaceRect = getDockviewSpikeLayoutHost()?.root?.getBoundingClientRect?.() || {};
        const viewportWidth = Math.max(1, Number(globalThis?.innerWidth) || 1440);
        const viewportHeight = Math.max(1, Number(globalThis?.innerHeight) || 900);
        const edgePad = 8;
        const gap = 8;
        const width = Math.min(
            340,
            Math.max(300, Math.round((Number(frameRect.width) || 320) * 0.7)),
        );
        const top = Math.max(
            edgePad,
            Math.round(Number(workspaceRect.top) || edgePad),
        );
        const height = Math.max(
            260,
            Math.min(
                viewportHeight - top - edgePad,
                Math.round(Number(workspaceRect.height) || (viewportHeight - top - edgePad)),
            ),
        );
        let x = Math.round((Number(frameRect.left) || (viewportWidth - width - edgePad)) - width - gap);
        if (x < edgePad) {
            x = Math.round((Number(frameRect.right) || edgePad) + gap);
        }
        x = Math.min(Math.max(edgePad, x), Math.max(edgePad, viewportWidth - width - edgePad));
        return { x, y: top, width, height };
    },
    closeComposerControlsPanel(panelState) {
        const layoutHost = getDockviewSpikeLayoutHost();
        if (layoutHost) {
            layoutHost.closePanel(COMPOSER_CONTROLS_PANEL_ID);
        }
        if (panelState) {
            panelState.composerControlsDockviewOpen = false;
            this.syncComposerControlsPanelRegistry(panelState);
            this.syncComposerControlsToggleUi(panelState);
        }
        return true;
    },
    toggleComposerControlsPanel(panelState) {
        if (!panelState) {
            return false;
        }
        const layoutHost = getDockviewSpikeLayoutHost();
        if (!layoutHost) {
            return false;
        }
        if (layoutHost.api?.getPanel?.(COMPOSER_CONTROLS_PANEL_ID)) {
            return this.closeComposerControlsPanel(panelState);
        }
        return this.openComposerControlsPanel(panelState);
    },
    syncComposerControlsToggleUi(panelState) {
        const toggle = panelState?.composerControlsToggleButton;
        if (!toggle) return;
        const dockviewEnabled = this.isDockviewAuxiliaryPanelEnabled();
        const expanded = dockviewEnabled
            ? !!getDockviewSpikeLayoutHost()?.api?.getPanel?.(COMPOSER_CONTROLS_PANEL_ID)
            : panelState.composerControlsCollapsed !== true;
        toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
        toggle.setAttribute(
            "aria-label",
            expanded ? "Close Frame and Shoot controls" : "Open Frame and Shoot controls",
        );
        toggle.title = expanded ? "Close controls" : "Open controls";
    },
    syncComposerControlsPanelRegistry(panelState) {
        if (!panelState || panelState.mode !== "composer") {
            return;
        }
        const layoutHost = getDockviewSpikeLayoutHost();
        const isOpen = !!layoutHost?.api?.getPanel?.(COMPOSER_CONTROLS_PANEL_ID);
        panelState.composerControlsDockviewOpen = isOpen;
        updateMissionPanel(COMPOSER_CONTROLS_PANEL_ID, {
            id: COMPOSER_CONTROLS_PANEL_ID,
            title: "Frame Controls",
            kind: "workflow",
            panelType: "flyby-controls",
            builtIn: true,
            available: panelState.missionEnabled === true,
            state: isOpen ? "open" : "closed",
            sortOrder: Number.isFinite(panelState.sortOrder) ? panelState.sortOrder + 1 : 0,
            infoItems: [
                { label: "Panel Kind", value: "controls" },
                { label: "For", value: "Frame and Shoot" },
            ],
            actions: {
                open: panelState.missionEnabled === true
                    ? () => this.openComposerControlsPanel(panelState)
                    : undefined,
                restore: panelState.missionEnabled === true
                    ? () => this.openComposerControlsPanel(panelState)
                    : undefined,
                focus: isOpen
                    ? () => layoutHost?.focusPanel?.(COMPOSER_CONTROLS_PANEL_ID)
                    : undefined,
                close: () => this.closeComposerControlsPanel(panelState),
            },
        });
        this.syncComposerControlsToggleUi(panelState);
    },
    closeDockedAuxiliaryPanel(panelState) {
        const layoutHost = getDockviewSpikeLayoutHost();
        if (!layoutHost || !panelState?.panelRegistryId) {
            return false;
        }
        return layoutHost.closePanel(panelState.panelRegistryId);
    },
    bindPanelDragging(panelState, header) {
        const onPointerDown = (event) => {
            if (this.isAuxiliaryPanelDocked(panelState)) {
                return;
            }
            if (panelState?.maximized === true) {
                return;
            }
            if (!this.shouldStartDrag(event)) return;
            panelState.defaultLayoutManaged = false;
            this.bringPanelToFront(panelState);
            this.dragState = {
                panelState,
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                panelX: Number.isFinite(panelState.x) ? panelState.x : panelState.panel.offsetLeft,
                panelY: Number.isFinite(panelState.y) ? panelState.y : panelState.panel.offsetTop,
            };
            header.setPointerCapture(event.pointerId);
            event.preventDefault();
        };

        const onPointerMove = (event) => {
            if (!this.dragState || this.dragState.pointerId !== event.pointerId) return;
            const dx = event.clientX - this.dragState.startX;
            const dy = event.clientY - this.dragState.startY;
            this.applyPanelPosition(
                this.dragState.panelState,
                this.dragState.panelX + dx,
                this.dragState.panelY + dy,
            );
        };

        const releaseDrag = (event) => {
            if (!this.dragState || this.dragState.pointerId !== event.pointerId) return;
            if (header.hasPointerCapture(event.pointerId)) {
                header.releasePointerCapture(event.pointerId);
            }
            this.dragState = null;
            this.queuePersistPanelState();
        };

        header.addEventListener("pointerdown", onPointerDown);
        header.addEventListener("pointermove", onPointerMove);
        header.addEventListener("pointerup", releaseDrag);
        header.addEventListener("pointercancel", releaseDrag);
        panelState.onPointerDown = onPointerDown;
        panelState.onPointerMove = onPointerMove;
        panelState.onPointerUp = releaseDrag;
        panelState.onPointerCancel = releaseDrag;
    },
    applyPanelFrame(panelState, { x, y, width, height }) {
        if (!panelState?.panel) {
            return;
        }
        const isComposer = panelState.mode === "composer";
        const minSize = isComposer ? PANEL_MIN_SIDE_COMPOSER : PANEL_MIN_SIDE_DEFAULT;
        const nextWidth = Math.round(Math.max(minSize, Number(width) || minSize));
        const nextHeight = Math.round(Math.max(minSize, Number(height) || minSize));
        panelState.x = Math.round(Number(x) || 0);
        panelState.y = Math.round(Number(y) || 0);
        panelState.panel.style.left = `${panelState.x}px`;
        panelState.panel.style.top = `${panelState.y}px`;
        panelState.panel.style.width = `${nextWidth}px`;
        panelState.panel.style.height = `${isComposer ? nextHeight : nextWidth}px`;
        this.syncPanelSize(panelState);
    },
    bindPanelResizing(panelState, resizeGrip) {
        if (!panelState?.panel || !resizeGrip) {
            return;
        }
        const RESIZE_HIT_PX = 28;
        const RESIZE_EDGE_FUZZ_PX = 2;

        const resolveCornerFromEvent = (event) => {
            const grip = isDomElement(event.target)
                ? event.target.closest(".aux-camera-view__resize-grip")
                : null;
            const gripCorner = asTrimmedString(grip?.dataset?.resizeCorner);
            if (gripCorner) {
                return gripCorner;
            }

            const rect = panelState.panel.getBoundingClientRect();
            const nearLeft = event.clientX >= rect.left - RESIZE_EDGE_FUZZ_PX &&
                event.clientX <= rect.left + RESIZE_HIT_PX;
            const nearRight = event.clientX >= rect.right - RESIZE_HIT_PX &&
                event.clientX <= rect.right + RESIZE_EDGE_FUZZ_PX;
            const nearTop = event.clientY >= rect.top - RESIZE_EDGE_FUZZ_PX &&
                event.clientY <= rect.top + RESIZE_HIT_PX;
            const nearBottom = event.clientY >= rect.bottom - RESIZE_HIT_PX &&
                event.clientY <= rect.bottom + RESIZE_EDGE_FUZZ_PX;
            if (nearLeft && nearTop) return "nw";
            if (nearRight && nearTop) return "ne";
            if (nearLeft && nearBottom) return "sw";
            if (nearRight && nearBottom) return "se";
            return "";
        };

        const resolveResizeFrame = (resizeState, event) => {
            const bounds = this.resolvePanelViewportBounds();
            const isComposer = resizeState.panelState.mode === "composer";
            const minSize = isComposer ? PANEL_MIN_SIDE_COMPOSER : PANEL_MIN_SIDE_DEFAULT;
            const dx = event.clientX - resizeState.startX;
            const dy = event.clientY - resizeState.startY;
            const corner = resizeState.corner || "se";
            let left = resizeState.x;
            let top = resizeState.y;
            let right = resizeState.x + resizeState.width;
            let bottom = resizeState.y + resizeState.height;

            if (corner.includes("w")) {
                left += dx;
                left = this.THREE.MathUtils.clamp(left, bounds.left, right - minSize);
            } else {
                right += dx;
                right = this.THREE.MathUtils.clamp(right, left + minSize, bounds.right);
            }

            if (corner.includes("n")) {
                top += dy;
                top = this.THREE.MathUtils.clamp(top, bounds.top, bottom - minSize);
            } else {
                bottom += dy;
                bottom = this.THREE.MathUtils.clamp(bottom, top + minSize, bounds.bottom);
            }

            if (!isComposer) {
                const maxWidth = corner.includes("w") ? right - bounds.left : bounds.right - left;
                const maxHeight = corner.includes("n") ? bottom - bounds.top : bounds.bottom - top;
                const side = Math.round(this.THREE.MathUtils.clamp(
                    Math.max(right - left, bottom - top),
                    minSize,
                    Math.max(minSize, Math.min(maxWidth, maxHeight)),
                ));
                if (corner.includes("w")) {
                    left = right - side;
                } else {
                    right = left + side;
                }
                if (corner.includes("n")) {
                    top = bottom - side;
                } else {
                    bottom = top + side;
                }
            }

            return {
                x: Math.round(left),
                y: Math.round(top),
                width: Math.round(right - left),
                height: Math.round(bottom - top),
            };
        };

        const startResize = (event, captureTarget, corner) => {
            if (this.isAuxiliaryPanelDocked(panelState)) {
                return;
            }
            if (panelState.maximized === true) {
                panelState.maximized = false;
                panelState.restoreFrame = null;
                panelState.panel.classList.remove("is-maximized");
                this.syncPanelExpandButton(panelState);
            }
            panelState.defaultLayoutManaged = false;
            this.bringPanelToFront(panelState);
            this.resizeState = {
                panelState,
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                x: Number.isFinite(panelState.x) ? panelState.x : panelState.panel.offsetLeft,
                y: Number.isFinite(panelState.y) ? panelState.y : panelState.panel.offsetTop,
                width: panelState.panel.offsetWidth || panelState.width || 0,
                height: panelState.panel.offsetHeight || panelState.height || 0,
                corner,
                captureTarget,
            };
            captureTarget.setPointerCapture(event.pointerId);
            event.preventDefault();
            event.stopPropagation();
        };

        const onPointerDown = (event) => {
            if (event.button !== 0) {
                return;
            }
            const corner = resolveCornerFromEvent(event) || "se";
            startResize(event, resizeGrip, corner);
        };

        const onPanelPointerDown = (event) => {
            if (isDomElement(event.target) && event.target.closest("input, button, select, option, label, output, a")) {
                return;
            }
            const corner = resolveCornerFromEvent(event);
            if (event.button !== 0 || !corner) {
                return;
            }
            startResize(event, panelState.panel, corner);
        };

        const onPointerMove = (event) => {
            if (!this.resizeState || this.resizeState.pointerId !== event.pointerId) {
                return;
            }
            this.applyPanelFrame(this.resizeState.panelState, resolveResizeFrame(this.resizeState, event));
            this.requestRender?.();
            event.preventDefault();
        };

        const releaseResize = (event) => {
            if (!this.resizeState || this.resizeState.pointerId !== event.pointerId) {
                return;
            }
            const captureTarget = this.resizeState.captureTarget || resizeGrip;
            if (captureTarget.hasPointerCapture(event.pointerId)) {
                captureTarget.releasePointerCapture(event.pointerId);
            }
            this.resizeState = null;
            this.queuePersistPanelState();
            event.preventDefault();
        };

        panelState.panel.addEventListener("pointerdown", onPanelPointerDown, true);
        panelState.panel.addEventListener("pointermove", onPointerMove);
        panelState.panel.addEventListener("pointerup", releaseResize);
        panelState.panel.addEventListener("pointercancel", releaseResize);
        resizeGrip.addEventListener("pointerdown", onPointerDown);
        resizeGrip.addEventListener("pointermove", onPointerMove);
        resizeGrip.addEventListener("pointerup", releaseResize);
        resizeGrip.addEventListener("pointercancel", releaseResize);
        panelState.resizeGrip = resizeGrip;
        panelState.onResizePointerDown = onPointerDown;
        panelState.onPanelResizePointerDown = onPanelPointerDown;
        panelState.onResizePointerMove = onPointerMove;
        panelState.onResizePointerUp = releaseResize;
        panelState.onResizePointerCancel = releaseResize;
    },
};
