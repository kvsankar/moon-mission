import { PANEL_EDGE_MARGIN_PX, PANEL_RESIZE_HIT_PX, PANEL_MIN_WIDTH_PX, PANEL_MIN_HEIGHT_PX } from "./media-browser-config.js";
import { clamp } from "./media-browser-policy.js";
import { isObjectLike, isElementLike, createElement, getViewportWidth, getViewportHeight } from "./media-browser-dom.js";

export function createMediaBrowserPanelGeometry({
    isMediaPanelDocked,
    getPanelExpanded,
    setDefaultLayoutManaged,
    applyPanelPosition,
    applyPanelFrame,
    persistPanelLayoutState,
}) {
    let dragState = null;
    let panelResizeDragState = null;

    function shouldStartDrag(event) {
        if (event.button !== 0) return false;
        if (!isObjectLike(event?.target)) return false;
        if (typeof event.target.closest !== "function") return true;
        return !event.target.closest("button, input, select, option, label, output, a");
    }

    function bindPanelDragging(panel, header) {
        if (!panel || !header) return;

        const onPointerDown = (event) => {
            if (isMediaPanelDocked(panel)) return;
            if (getPanelExpanded() === true) return;
            if (!shouldStartDrag(event)) return;
            setDefaultLayoutManaged(false, panel);
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

    function ensurePanelResizeGrips(panel) {
        if (!isElementLike(panel)) return;
        for (const corner of ["nw", "ne", "sw", "se"]) {
            if (panel.querySelector?.(`.media-browser-panel__resize-grip--${corner}`)) {
                continue;
            }
            const grip = createElement("div");
            if (!grip) continue;
            grip.className = `media-browser-panel__resize-grip media-browser-panel__resize-grip--${corner}`;
            grip.dataset.resizeCorner = corner;
            grip.setAttribute("aria-hidden", "true");
            panel.appendChild(grip);
        }
    }

    function resolvePanelResizeCorner(panel, event) {
        const grip = isObjectLike(event?.target) && typeof event.target.closest === "function"
            ? event.target.closest(".media-browser-panel__resize-grip")
            : null;
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

    function resolvePanelResizeFrame(resizeState, event) {
        const dx = event.clientX - resizeState.startX;
        const dy = event.clientY - resizeState.startY;
        const corner = resizeState.corner || "se";
        let left = resizeState.x;
        let top = resizeState.y;
        let right = resizeState.x + resizeState.width;
        let bottom = resizeState.y + resizeState.height;
        const bounds = {
            left: PANEL_EDGE_MARGIN_PX,
            top: PANEL_EDGE_MARGIN_PX,
            right: getViewportWidth() - PANEL_EDGE_MARGIN_PX,
            bottom: getViewportHeight() - PANEL_EDGE_MARGIN_PX,
        };

        if (corner.includes("w")) {
            left = clamp(left + dx, bounds.left, right - PANEL_MIN_WIDTH_PX);
        } else {
            right = clamp(right + dx, left + PANEL_MIN_WIDTH_PX, bounds.right);
        }

        if (corner.includes("n")) {
            top = clamp(top + dy, bounds.top, bottom - PANEL_MIN_HEIGHT_PX);
        } else {
            bottom = clamp(bottom + dy, top + PANEL_MIN_HEIGHT_PX, bounds.bottom);
        }

        return {
            x: left,
            y: top,
            width: right - left,
            height: bottom - top,
        };
    }

    function bindPanelResizing(panel) {
        if (!isElementLike(panel)) return;
        ensurePanelResizeGrips(panel);

        const startResize = (event, corner) => {
            if (isMediaPanelDocked(panel)) return;
            setDefaultLayoutManaged(false, panel);
            const rect = panel.getBoundingClientRect();
            panelResizeDragState = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                x: Math.round(rect.left),
                y: Math.round(rect.top),
                width: Math.round(rect.width),
                height: Math.round(rect.height),
                corner,
            };
            panel.setPointerCapture?.(event.pointerId);
            event.preventDefault();
            event.stopPropagation();
        };

        panel.addEventListener("pointerdown", (event) => {
            if (isMediaPanelDocked(panel)) return;
            if (event.button !== 0 || getPanelExpanded() === true) return;
            if (isObjectLike(event.target) && typeof event.target.closest === "function" &&
                event.target.closest("input, button, select, option, label, output, a")) {
                return;
            }
            const corner = resolvePanelResizeCorner(panel, event);
            if (!corner) return;
            startResize(event, corner);
        }, true);

        panel.addEventListener("pointermove", (event) => {
            if (!panelResizeDragState || panelResizeDragState.pointerId !== event.pointerId) return;
            applyPanelFrame(panel, resolvePanelResizeFrame(panelResizeDragState, event), {
                managed: false,
                persist: false,
            });
            event.preventDefault();
        });

        const releaseResize = (event) => {
            if (!panelResizeDragState || panelResizeDragState.pointerId !== event.pointerId) return;
            panel.releasePointerCapture?.(event.pointerId);
            panelResizeDragState = null;
            persistPanelLayoutState(panel);
            event.preventDefault();
        };

        panel.addEventListener("pointerup", releaseResize);
        panel.addEventListener("pointercancel", releaseResize);
    }

    return { bindPanelDragging, bindPanelResizing };
}
