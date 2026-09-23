import { isDomElement, isDomInstance } from "../ui/dom-helpers.js";
import { PANEL_EDGE_MARGIN_PX, PANEL_DEFAULT_LEFT_PX, PANEL_DEFAULT_BOTTOM_GAP_PX, COMPOSER_PANEL_ASPECT_RATIO } from "./ground-track-config.js";
import { clamp } from "./ground-track-geometry.js";
import { readCssPx } from "./ground-track-policy.js";

export function createGroundTrackPanelGeometry({
    getNode,
    isGroundTrackPanelDocked,
    persistPanelLayoutState,
    getPanelPosition,
    setPanelPosition,
    getPanelExpanded,
    setPanelExpandedState,
    getRestorePanelFrame,
}) {
    let dragState = null;

    function capturePanelFrame(panel = getNode("ground-track-panel")) {
        if (!isDomInstance(panel, "HTMLElement")) {
            return null;
        }
        return {
            x: Math.round(getPanelPosition()?.x ?? panel.offsetLeft ?? 0),
            y: Math.round(getPanelPosition()?.y ?? panel.offsetTop ?? 0),
            width: Math.round(panel.offsetWidth || 0),
            height: Math.round(panel.offsetHeight || 0),
        };
    }

    function resolveExpandedPanelRect() {
        const headerRect = document.querySelector(".header")?.getBoundingClientRect?.() || null;
        const timelineRect = document.querySelector(".timeline-dock")?.getBoundingClientRect?.() || null;
        const left = PANEL_EDGE_MARGIN_PX;
        const top = Number.isFinite(headerRect?.bottom)
            ? Math.round(headerRect.bottom + PANEL_EDGE_MARGIN_PX)
            : PANEL_EDGE_MARGIN_PX;
        const right = window.innerWidth - PANEL_EDGE_MARGIN_PX;
        const bottom = Number.isFinite(timelineRect?.top)
            ? Math.round(timelineRect.top - PANEL_EDGE_MARGIN_PX)
            : (window.innerHeight - PANEL_EDGE_MARGIN_PX);
        const maxWidth = Math.max(320, right - left);
        const maxHeight = Math.max(220, bottom - top);
        return {
            x: left,
            y: top,
            width: maxWidth,
            height: maxHeight,
        };
    }

    function applyExpandedPanelRect(panel = getNode("ground-track-panel")) {
        if (!isDomInstance(panel, "HTMLElement")) {
            return;
        }
        const rect = resolveExpandedPanelRect();
        panel.style.width = `${rect.width}px`;
        panel.style.height = `${rect.height}px`;
        applyPanelPosition(panel, rect.x, rect.y);
    }

    function syncExpandButton(button = getNode("ground-track-panel-expand")) {
        if (!isDomInstance(button, "HTMLElement")) {
            return;
        }
        button.dataset.icon = getPanelExpanded() === true ? "restore" : "expand";
        button.textContent = "";
        button.title = getPanelExpanded() === true ? "Restore" : "Expand";
        button.setAttribute("aria-label", button.title);
        button.setAttribute("aria-pressed", getPanelExpanded() === true ? "true" : "false");
    }

    function resetExpandedPanelForDelete(panel = getNode("ground-track-panel")) {
        if (!isDomInstance(panel, "HTMLElement") || getPanelExpanded() !== true) {
            return;
        }
        setPanelExpandedState(false);
        panel.classList.remove("is-maximized");
        if (getRestorePanelFrame() && getRestorePanelFrame().width > 0 && getRestorePanelFrame().height > 0) {
            panel.style.width = `${getRestorePanelFrame().width}px`;
            panel.style.height = `${getRestorePanelFrame().height}px`;
            applyPanelPosition(panel, getRestorePanelFrame().x, getRestorePanelFrame().y);
        } else {
            ensurePanelPosition(panel);
        }
        syncExpandButton();
    }

    function resolveDefaultPanelPosition(panel) {
        if (!panel) {
            return clampPanelRect({
                x: PANEL_DEFAULT_LEFT_PX,
                y: PANEL_EDGE_MARGIN_PX,
                width: 400,
                height: 320,
            });
        }
        const width = Math.max(panel.offsetWidth || 400, 280);
        const height = Math.max(panel.offsetHeight || 320, 220);
        const timelineHeight = readCssPx("--timeline-dock-height", 88);
        const timelineOffset = readCssPx("--timeline-dock-offset", 10);
        const x = PANEL_DEFAULT_LEFT_PX;
        const y = window.innerHeight - height - timelineHeight - timelineOffset - PANEL_DEFAULT_BOTTOM_GAP_PX;
        return clampPanelRect({ x, y, width, height });
    }

    function resolveComposerPanelRect() {
        const composerPanel = document.querySelector(".aux-camera-view--composer");
        if (!isDomInstance(composerPanel, "HTMLElement")) return null;
        const rect = composerPanel.getBoundingClientRect();
        if (!Number.isFinite(rect.left) || !Number.isFinite(rect.top) || rect.width <= 0 || rect.height <= 0) {
            return null;
        }
        return {
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height,
        };
    }

    function resolveComposerFallbackRect() {
        const maxWidth = Math.max(320, window.innerWidth - (PANEL_EDGE_MARGIN_PX * 2));
        const maxHeight = Math.max(220, window.innerHeight - (PANEL_EDGE_MARGIN_PX * 2));
        let width = Math.min(Math.round(window.innerWidth * 0.52), maxWidth);
        let height = Math.round(width / COMPOSER_PANEL_ASPECT_RATIO);
        if (height > maxHeight) {
            height = maxHeight;
            width = Math.min(maxWidth, Math.round(height * COMPOSER_PANEL_ASPECT_RATIO));
        }
        return {
            x: Math.round((window.innerWidth - width) * 0.5),
            y: Math.round((window.innerHeight - height) * 0.5),
            width,
            height,
        };
    }

    function applyComposerPanelPlacement(panel) {
        if (!panel) return false;
        if (isGroundTrackPanelDocked(panel)) return false;
        const rect = resolveComposerPanelRect() || resolveComposerFallbackRect();
        if (!rect) return false;
        panel.style.width = `${Math.round(rect.width)}px`;
        panel.style.height = `${Math.round(rect.height)}px`;
        applyPanelPosition(panel, rect.x, rect.y);
        return true;
    }

    function clampPanelRect({ x, y, width, height }) {
        const maxX = Math.max(PANEL_EDGE_MARGIN_PX, window.innerWidth - width - PANEL_EDGE_MARGIN_PX);
        const maxY = Math.max(PANEL_EDGE_MARGIN_PX, window.innerHeight - height - PANEL_EDGE_MARGIN_PX);
        return {
            x: clamp(Math.round(x), PANEL_EDGE_MARGIN_PX, maxX),
            y: clamp(Math.round(y), PANEL_EDGE_MARGIN_PX, maxY),
        };
    }

    function applyPanelPosition(panel, x, y) {
        if (!panel) return;
        if (isGroundTrackPanelDocked(panel)) return;
        const width = Math.max(panel.offsetWidth || 400, 280);
        const height = Math.max(panel.offsetHeight || 320, 220);
        const clamped = clampPanelRect({ x, y, width, height });
        setPanelPosition(clamped);
        panel.style.left = `${clamped.x}px`;
        panel.style.top = `${clamped.y}px`;
    }

    function clampPanelPosition(panel) {
        if (!panel) return;
        if (!getPanelPosition()) {
            const initial = resolveDefaultPanelPosition(panel);
            applyPanelPosition(panel, initial.x, initial.y);
            return;
        }
        applyPanelPosition(panel, getPanelPosition().x, getPanelPosition().y);
    }

    function ensurePanelPosition(panel) {
        if (!panel) return;
        if (isGroundTrackPanelDocked(panel)) return;
        if (!getPanelPosition()) {
            const initial = resolveDefaultPanelPosition(panel);
            applyPanelPosition(panel, initial.x, initial.y);
            return;
        }
        clampPanelPosition(panel);
    }

    function shouldStartDrag(event) {
        if (event.button !== 0) return false;
        if (!isDomElement(event.target)) return false;
        return !event.target.closest("button, input, select, option, label, output, a");
    }

    function bindPanelDragging(panel, header) {
        if (!panel || !header) return;

        const onPointerDown = (event) => {
            if (isGroundTrackPanelDocked(panel)) return;
            if (getPanelExpanded() === true) return;
            if (!shouldStartDrag(event)) return;
            const rect = panel.getBoundingClientRect();
            dragState = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                panelX: rect.left,
                panelY: rect.top,
            };
            header.setPointerCapture(event.pointerId);
            event.preventDefault();
        };

        const onPointerMove = (event) => {
            if (!dragState || dragState.pointerId !== event.pointerId) return;
            const dx = event.clientX - dragState.startX;
            const dy = event.clientY - dragState.startY;
            applyPanelPosition(panel, dragState.panelX + dx, dragState.panelY + dy);
        };

        const releaseDrag = (event) => {
            if (!dragState || dragState.pointerId !== event.pointerId) return;
            if (header.hasPointerCapture(event.pointerId)) {
                header.releasePointerCapture(event.pointerId);
            }
            dragState = null;
            persistPanelLayoutState(panel);
        };

        header.addEventListener("pointerdown", onPointerDown);
        header.addEventListener("pointermove", onPointerMove);
        header.addEventListener("pointerup", releaseDrag);
        header.addEventListener("pointercancel", releaseDrag);
    }

    return {
        capturePanelFrame,
        applyExpandedPanelRect,
        syncExpandButton,
        resetExpandedPanelForDelete,
        applyComposerPanelPlacement,
        applyPanelPosition,
        clampPanelPosition,
        ensurePanelPosition,
        bindPanelDragging,
    };
}
