import { getDocumentRef, getWindowRef } from "./background-media-dom.js";
import { clamp } from "./background-media-policy.js";

const PANEL_EDGE_MARGIN_PX = 8;
const PANEL_TRANSPORT_CLEARANCE_PX = 14;
const PANEL_STACK_LEFT_PX = 32;
const PANEL_STACK_TOP_FALLBACK_PX = 36;
const PANEL_STACK_GAP_PX = 8;
const DEFAULT_PANEL_WIDTH_PX = 546;
const DEFAULT_PANEL_HEADER_HEIGHT_PX = 31;
const DEFAULT_PANEL_CONTROLS_HEIGHT_PX = 46;
const DEFAULT_TRANSCRIPT_PANEL_HEIGHT_PX = 176;
const DEFAULT_MEDIA_PANEL_HEIGHT_RESERVE_PX = 260;
const MIN_PANEL_WIDTH_PX = 300;
const MIN_PANEL_HEIGHT_PX = 360;
const PANEL_RESIZE_HIT_PX = 28;
function getDefaultPanelRect() {
    const stackTop = getWorkflowPanelStackTopPx();
    const maxWidth = Math.max(
        MIN_PANEL_WIDTH_PX,
        (getWindowRef()?.innerWidth || 1024) - PANEL_STACK_LEFT_PX - PANEL_EDGE_MARGIN_PX,
    );
    let width = Math.min(DEFAULT_PANEL_WIDTH_PX, maxWidth);
    const timelineSafeBottom = getTimelineSafeBottomPx();
    const availableHeight = Math.max(
        MIN_PANEL_HEIGHT_PX,
        timelineSafeBottom
            - stackTop
            - PANEL_STACK_GAP_PX
            - DEFAULT_MEDIA_PANEL_HEIGHT_RESERVE_PX,
    );
    if (getDefaultPanelHeightForWidth(width) > availableHeight) {
        const fixedPanelHeight = DEFAULT_PANEL_HEADER_HEIGHT_PX
            + DEFAULT_TRANSCRIPT_PANEL_HEIGHT_PX
            + DEFAULT_PANEL_CONTROLS_HEIGHT_PX;
        const widthForAvailableHeight = Math.floor(
            Math.max(0, availableHeight - fixedPanelHeight) * 16 / 9,
        );
        width = clamp(widthForAvailableHeight, MIN_PANEL_WIDTH_PX, width);
    }
    const height = getDefaultPanelHeightForWidth(width);
    return {
        left: PANEL_STACK_LEFT_PX,
        top: stackTop,
        width,
        height,
    };
}

function getDefaultPanelHeightForWidth(width) {
    const stageHeight = Math.round((Number(width) || DEFAULT_PANEL_WIDTH_PX) * 9 / 16);
    return Math.max(
        MIN_PANEL_HEIGHT_PX,
        DEFAULT_PANEL_HEADER_HEIGHT_PX
            + stageHeight
            + DEFAULT_TRANSCRIPT_PANEL_HEIGHT_PX
            + DEFAULT_PANEL_CONTROLS_HEIGHT_PX,
    );
}

function getVisibleElementBottomPx(selector) {
    const node = getDocumentRef()?.querySelector?.(selector) || null;
    if (!node || node.hidden === true) return Number.NaN;
    const style = getWindowRef()?.getComputedStyle?.(node) || null;
    if (style?.display === "none" || style?.visibility === "hidden") return Number.NaN;
    const rect = node.getBoundingClientRect?.() || null;
    const bottom = Number(rect?.bottom);
    return Number.isFinite(bottom) && bottom > 0 ? bottom : Number.NaN;
}

function getWorkflowPanelStackTopPx() {
    const headerBottom = [
        getVisibleElementBottomPx(".header"),
        getVisibleElementBottomPx(".mission-floating-collapse-btn"),
    ].filter(Number.isFinite).reduce((max, value) => Math.max(max, value), 0);
    if (Number.isFinite(headerBottom) && headerBottom > 0) {
        return Math.max(
            PANEL_EDGE_MARGIN_PX,
            Math.round(headerBottom + PANEL_EDGE_MARGIN_PX - getPanelWrapperTopPx("background-media-panel-wrapper")),
        );
    }
    return PANEL_STACK_TOP_FALLBACK_PX;
}

function getPanelWrapperTopPx(id) {
    const rect = getDocumentRef()?.getElementById?.(id)?.getBoundingClientRect?.() || null;
    const top = Number(rect?.top);
    return Number.isFinite(top) && top > 0 ? top : 0;
}

function getTimelineSafeBottomPx() {
    const resolveVisibleTop = (selector) => {
        const node = getDocumentRef()?.querySelector?.(selector) || null;
        if (!node || node.hidden === true) return Number.NaN;
        const style = getWindowRef()?.getComputedStyle?.(node) || null;
        if (style?.display === "none" || style?.visibility === "hidden") return Number.NaN;
        const rect = node.getBoundingClientRect?.() || null;
        const top = Number(rect?.top);
        const height = Number(rect?.height);
        return Number.isFinite(top) && Number.isFinite(height) && height > 0 ? top : Number.NaN;
    };
    const controlTop = resolveVisibleTop("#control-panel");
    const timelineTop = resolveVisibleTop(".timeline-dock");
    const boundaryTop = Math.min(
        Number.isFinite(controlTop) ? controlTop : Infinity,
        Number.isFinite(timelineTop) ? timelineTop : Infinity,
    );
    if (Number.isFinite(boundaryTop) && boundaryTop > PANEL_EDGE_MARGIN_PX) {
        return Math.round(
            boundaryTop
            - PANEL_TRANSPORT_CLEARANCE_PX
            - getPanelWrapperTopPx("background-media-panel-wrapper"),
        );
    }
    return (Number(getWindowRef()?.innerHeight) || 768) - PANEL_EDGE_MARGIN_PX;
}

function clampPanelRect(rect = {}) {
    const windowRef = getWindowRef();
    const viewportWidth = Number(windowRef?.innerWidth) || 1024;
    const viewportHeight = Number(windowRef?.innerHeight) || 768;
    const width = clamp(
        Number(rect.width) || DEFAULT_PANEL_WIDTH_PX,
        MIN_PANEL_WIDTH_PX,
        Math.max(MIN_PANEL_WIDTH_PX, viewportWidth - PANEL_EDGE_MARGIN_PX * 2),
    );
    const height = clamp(
        Number(rect.height) || getDefaultPanelHeightForWidth(width),
        MIN_PANEL_HEIGHT_PX,
        Math.max(MIN_PANEL_HEIGHT_PX, viewportHeight - PANEL_EDGE_MARGIN_PX * 2),
    );
    return {
        left: clamp(Number(rect.left) || PANEL_EDGE_MARGIN_PX, PANEL_EDGE_MARGIN_PX, viewportWidth - width - PANEL_EDGE_MARGIN_PX),
        top: clamp(Number(rect.top) || PANEL_EDGE_MARGIN_PX, PANEL_EDGE_MARGIN_PX, viewportHeight - height - PANEL_EDGE_MARGIN_PX),
        width,
        height,
    };
}

function applyPanelRect(panel, rect) {
    const nextRect = clampPanelRect(rect);
    panel.style.left = `${Math.round(nextRect.left)}px`;
    panel.style.top = `${Math.round(nextRect.top)}px`;
    panel.style.width = `${Math.round(nextRect.width)}px`;
    panel.style.height = `${Math.round(nextRect.height)}px`;
    return nextRect;
}
export {
    PANEL_EDGE_MARGIN_PX,
    PANEL_TRANSPORT_CLEARANCE_PX,
    PANEL_STACK_LEFT_PX,
    PANEL_STACK_TOP_FALLBACK_PX,
    PANEL_STACK_GAP_PX,
    DEFAULT_PANEL_WIDTH_PX,
    DEFAULT_PANEL_HEADER_HEIGHT_PX,
    DEFAULT_PANEL_CONTROLS_HEIGHT_PX,
    DEFAULT_TRANSCRIPT_PANEL_HEIGHT_PX,
    DEFAULT_MEDIA_PANEL_HEIGHT_RESERVE_PX,
    MIN_PANEL_WIDTH_PX,
    MIN_PANEL_HEIGHT_PX,
    PANEL_RESIZE_HIT_PX,
    getDefaultPanelRect,
    getDefaultPanelHeightForWidth,
    getVisibleElementBottomPx,
    getWorkflowPanelStackTopPx,
    getPanelWrapperTopPx,
    getTimelineSafeBottomPx,
    clampPanelRect,
    applyPanelRect,
};
