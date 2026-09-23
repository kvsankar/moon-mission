import { getDocumentRef, getWindowRef } from "./background-media-dom.js";
import { clamp } from "./background-media-policy.js";
import {
    PANEL_EDGE_MARGIN_PX,
    DEFAULT_PANEL_WIDTH_PX,
    MIN_PANEL_WIDTH_PX,
    MIN_PANEL_HEIGHT_PX,
    PANEL_RESIZE_HIT_PX,
    getDefaultPanelHeightForWidth,
    applyPanelRect,
} from "./background-media-layout.js";

export function createBackgroundPanelGeometry({
    getPanel,
    isBackgroundMediaPanelDocked,
    getExpanded,
    onPersistRect,
    onManualResize,
}) {
    let dragState = null;
    let panelResizeDragState = null;

    function capturePanelRect(panel = getPanel()) {
        if (!panel) return null;
        const rect = panel.getBoundingClientRect?.() || null;
        return {
            left: Math.round(Number(rect?.left) || panel.offsetLeft || PANEL_EDGE_MARGIN_PX),
            top: Math.round(Number(rect?.top) || panel.offsetTop || PANEL_EDGE_MARGIN_PX),
            width: Math.round(Number(rect?.width) || panel.offsetWidth || DEFAULT_PANEL_WIDTH_PX),
            height: Math.round(Number(rect?.height) || panel.offsetHeight || getDefaultPanelHeightForWidth(DEFAULT_PANEL_WIDTH_PX)),
        };
    }

    function persistPanelRect(panel = getPanel()) {
        const rect = capturePanelRect(panel);
        if (rect) onPersistRect(rect);
    }

    function shouldStartPanelDrag(event) {
        if (isBackgroundMediaPanelDocked()) return false;
        if (event.button !== 0 || getExpanded() === true) return false;
        const target = event?.target;
        if (!target || typeof target.closest !== "function") return true;
        return !target.closest("button, input, select, option, label, output, a");
    }

    function bindPanelDragging() {
        const panel = getPanel();
        const header = panel?.querySelector?.(".background-media-panel__header");
        if (!panel || !header) return;

        header.addEventListener?.("pointerdown", (event) => {
            if (!shouldStartPanelDrag(event)) return;
            const rect = capturePanelRect(panel);
            if (!rect) return;
            dragState = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                rect,
            };
            header.setPointerCapture?.(event.pointerId);
            event.preventDefault();
        });

        const handlePointerMove = (event) => {
            if (!dragState || dragState.pointerId !== event.pointerId) return;
            const dx = event.clientX - dragState.startX;
            const dy = event.clientY - dragState.startY;
            applyPanelRect(panel, {
                ...dragState.rect,
                left: dragState.rect.left + dx,
                top: dragState.rect.top + dy,
            });
            event.preventDefault();
        };

        const releaseDrag = (event) => {
            if (!dragState || dragState.pointerId !== event.pointerId) return;
            if (typeof header.hasPointerCapture !== "function" || header.hasPointerCapture(event.pointerId)) {
                header.releasePointerCapture?.(event.pointerId);
            }
            dragState = null;
            persistPanelRect(panel);
            event.preventDefault();
        };

        const documentRef = getDocumentRef();
        documentRef?.addEventListener?.("pointermove", handlePointerMove, true);
        documentRef?.addEventListener?.("pointerup", releaseDrag, true);
        documentRef?.addEventListener?.("pointercancel", releaseDrag, true);
        header.addEventListener?.("pointermove", handlePointerMove);
        header.addEventListener?.("pointerup", releaseDrag);
        header.addEventListener?.("pointercancel", releaseDrag);
        header.addEventListener?.("lostpointercapture", releaseDrag);
    }

    function ensurePanelResizeGrips(panel = getPanel()) {
        if (!panel) return;
        for (const corner of ["nw", "ne", "sw", "se"]) {
            if (panel.querySelector?.(`.background-media-panel__resize-grip--${corner}`)) {
                continue;
            }
            const grip = getDocumentRef()?.createElement?.("div");
            if (!grip) continue;
            grip.className = `background-media-panel__resize-grip background-media-panel__resize-grip--${corner}`;
            grip.dataset.resizeCorner = corner;
            grip.setAttribute?.("aria-hidden", "true");
            panel.appendChild?.(grip);
        }
    }

    function resolvePanelResizeCorner(panel, event) {
        const grip = event?.target?.closest?.(".background-media-panel__resize-grip") || null;
        const gripCorner = String(grip?.dataset?.resizeCorner || "").trim();
        if (gripCorner) return gripCorner;

        const rect = panel?.getBoundingClientRect?.() || null;
        if (!rect) return "";
        const nearLeft = event.clientX >= rect.left - 2 && event.clientX <= rect.left + PANEL_RESIZE_HIT_PX;
        const nearRight = event.clientX >= rect.right - PANEL_RESIZE_HIT_PX && event.clientX <= rect.right + 2;
        const nearTop = event.clientY >= rect.top - 2 && event.clientY <= rect.top + PANEL_RESIZE_HIT_PX;
        const nearBottom = event.clientY >= rect.bottom - PANEL_RESIZE_HIT_PX && event.clientY <= rect.bottom + 2;
        if (nearLeft && nearTop) return "nw";
        if (nearRight && nearTop) return "ne";
        if (nearLeft && nearBottom) return "sw";
        if (nearRight && nearBottom) return "se";
        return "";
    }

    function resolvePanelResizeRect(resizeState, event) {
        const dx = event.clientX - resizeState.startX;
        const dy = event.clientY - resizeState.startY;
        const corner = resizeState.corner || "se";
        let left = resizeState.left;
        let top = resizeState.top;
        let right = resizeState.left + resizeState.width;
        let bottom = resizeState.top + resizeState.height;
        const bounds = {
            left: PANEL_EDGE_MARGIN_PX,
            top: PANEL_EDGE_MARGIN_PX,
            right: (Number(getWindowRef()?.innerWidth) || 1024) - PANEL_EDGE_MARGIN_PX,
            bottom: (Number(getWindowRef()?.innerHeight) || 768) - PANEL_EDGE_MARGIN_PX,
        };

        if (corner.includes("w")) {
            left = clamp(left + dx, bounds.left, right - MIN_PANEL_WIDTH_PX);
        } else {
            right = clamp(right + dx, left + MIN_PANEL_WIDTH_PX, bounds.right);
        }

        if (corner.includes("n")) {
            top = clamp(top + dy, bounds.top, bottom - MIN_PANEL_HEIGHT_PX);
        } else {
            bottom = clamp(bottom + dy, top + MIN_PANEL_HEIGHT_PX, bounds.bottom);
        }

        return {
            left,
            top,
            width: right - left,
            height: bottom - top,
        };
    }

    function bindPanelResizing() {
        const panel = getPanel();
        if (!panel) return;
        ensurePanelResizeGrips(panel);

        const startResize = (event, corner) => {
            const rect = capturePanelRect(panel);
            if (!rect) return;
            panelResizeDragState = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                ...rect,
                corner,
            };
            panel.setPointerCapture?.(event.pointerId);
            event.preventDefault?.();
            event.stopPropagation?.();
        };

        panel.addEventListener?.("pointerdown", (event) => {
            if (isBackgroundMediaPanelDocked(panel)) return;
            if (event.button !== 0 || getExpanded() === true) return;
            if (event.target?.closest?.("input, button, select, option, label, output, a")) {
                return;
            }
            const corner = resolvePanelResizeCorner(panel, event);
            if (!corner) return;
            startResize(event, corner);
        }, true);

        panel.addEventListener?.("pointermove", (event) => {
            if (!panelResizeDragState || panelResizeDragState.pointerId !== event.pointerId) return;
            applyPanelRect(panel, resolvePanelResizeRect(panelResizeDragState, event));
            onManualResize();
            event.preventDefault?.();
        });

        const releaseResize = (event) => {
            if (!panelResizeDragState || panelResizeDragState.pointerId !== event.pointerId) return;
            if (typeof panel.hasPointerCapture !== "function" || panel.hasPointerCapture(event.pointerId)) {
                panel.releasePointerCapture?.(event.pointerId);
            }
            panelResizeDragState = null;
            persistPanelRect(panel);
            event.preventDefault?.();
        };

        panel.addEventListener?.("pointerup", releaseResize);
        panel.addEventListener?.("pointercancel", releaseResize);
        panel.addEventListener?.("lostpointercapture", releaseResize);
    }

    return {
        bindPanelDragging,
        bindPanelResizing,
        isDragging: () => dragState !== null,
    };
}
