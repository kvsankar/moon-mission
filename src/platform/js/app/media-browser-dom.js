import {
    PANEL_EDGE_MARGIN_PX,
    PANEL_TRANSPORT_CLEARANCE_PX,
    PANEL_DEFAULT_LEFT_PX,
    PANEL_DEFAULT_HEIGHT_RATIO,
    PANEL_MIN_WIDTH_PX,
    PANEL_MIN_HEIGHT_PX,
    WORKFLOW_PANEL_STACK_TOP_FALLBACK_PX,
    WORKFLOW_PANEL_STACK_GAP_PX,
    WORKFLOW_BROADCAST_PANEL_WIDTH_PX,
    WORKFLOW_BROADCAST_PANEL_HEADER_HEIGHT_PX,
    WORKFLOW_BROADCAST_MEDIA_PANEL_HEIGHT_RESERVE_PX,
} from "./media-browser-config.js";
import { clamp } from "./media-browser-policy.js";

let hlsLibraryPromise = null;

function getDocumentRef() {
    return globalThis.document || null;
}

function getWindowRef() {
    return globalThis.window || null;
}

function shouldAllowMediaBrowserPanel() {
    // A desktop workspace resized into mobile owns temporary group hiding.
    // Keep media selection/playback and open state for its later restoration.
    if (getWindowRef()?.__moonMissionDockviewSpike?.progressiveWorkspace) return true;
    const mediaQuery = getWindowRef()?.matchMedia?.("(min-width: 601px)");
    return mediaQuery ? mediaQuery.matches === true : true;
}

function isObjectLike(value) {
    return value !== null && typeof value === "object";
}

function isElementLike(value) {
    return isObjectLike(value) && isObjectLike(value.classList);
}

function isImageLike(value) {
    return isElementLike(value) && ("src" in value || typeof value.removeAttribute === "function");
}

function isVideoLike(value) {
    return isElementLike(value) && ("src" in value || typeof value.removeAttribute === "function");
}

function callMediaMethod(mediaElement, methodName) {
    try {
        mediaElement?.[methodName]?.();
    } catch {
        // jsdom and some browsers can reject media operations before metadata is available.
    }
}

function isPictureInPictureSupported(video) {
    const documentRef = getDocumentRef();
    return !!video
        && typeof video.requestPictureInPicture === "function"
        && documentRef?.pictureInPictureEnabled !== false
        && video.disablePictureInPicture !== true;
}

function isLikelyHlsSource(url = "", sourceType = "") {
    const normalizedSourceType = String(sourceType || "").trim().toLowerCase();
    const normalizedUrl = String(url || "").trim().toLowerCase();
    return normalizedSourceType === "hls" || normalizedUrl.includes(".m3u8");
}

function canPlayHlsNatively(video) {
    if (typeof video?.canPlayType !== "function") return false;
    return Boolean(
        video.canPlayType("application/vnd.apple.mpegurl")
            || video.canPlayType("application/x-mpegURL"),
    );
}

function loadHlsLibrary() {
    if (!hlsLibraryPromise) {
        hlsLibraryPromise = import("hls.js")
            .then((module) => module.default || module.Hls || module)
            .catch(() => null);
    }
    return hlsLibraryPromise;
}

function createElement(tagName) {
    return getDocumentRef()?.createElement?.(tagName) || null;
}

function dispatchDocumentCustomEvent(type, detail) {
    const documentRef = getDocumentRef();
    if (!documentRef || typeof documentRef.dispatchEvent !== "function") return;
    if (typeof CustomEvent === "function") {
        documentRef.dispatchEvent(new CustomEvent(type, { detail }));
        return;
    }
    documentRef.dispatchEvent({ type, detail });
}

function createSvgElement(tagName) {
    return getDocumentRef()?.createElementNS?.("http://www.w3.org/2000/svg", tagName) || null;
}

function getViewportWidth() {
    const width = Number(getWindowRef()?.innerWidth);
    return Number.isFinite(width) && width > 0 ? width : 1440;
}

function getViewportHeight() {
    const height = Number(getWindowRef()?.innerHeight);
    return Number.isFinite(height) && height > 0 ? height : 900;
}

function getPanelDefaultHeightPx() {
    return Math.round(getViewportHeight() * PANEL_DEFAULT_HEIGHT_RATIO);
}

function getWorkflowPanelStackTopPx() {
    const headerBottom = [
        getVisibleElementBottomPx(".header"),
        getVisibleElementBottomPx(".mission-floating-collapse-btn"),
    ].filter(Number.isFinite).reduce((max, value) => Math.max(max, value), 0);
    if (Number.isFinite(headerBottom) && headerBottom > 0) {
        return Math.max(
            PANEL_EDGE_MARGIN_PX,
            Math.round(headerBottom + PANEL_EDGE_MARGIN_PX - getPanelWrapperTopPx("media-browser-panel-wrapper")),
        );
    }
    return WORKFLOW_PANEL_STACK_TOP_FALLBACK_PX;
}

function getPanelWrapperTopPx(id) {
    const rect = getDocumentRef()?.getElementById?.(id)?.getBoundingClientRect?.() || null;
    const top = Number(rect?.top);
    return Number.isFinite(top) && top > 0 ? top : 0;
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

function getVisibleElementTopPx(selector) {
    const node = getDocumentRef()?.querySelector?.(selector) || null;
    if (!node || node.hidden === true) return Number.NaN;
    const style = getWindowRef()?.getComputedStyle?.(node) || null;
    if (style?.display === "none" || style?.visibility === "hidden") return Number.NaN;
    const rect = node.getBoundingClientRect?.() || null;
    const top = Number(rect?.top);
    const height = Number(rect?.height);
    return Number.isFinite(top) && Number.isFinite(height) && height > 0 ? top : Number.NaN;
}

function getWorkflowBroadcastFallbackHeightPx() {
    const stackTop = getWorkflowPanelStackTopPx();
    const maxWidth = Math.max(
        PANEL_MIN_WIDTH_PX,
        getViewportWidth() - PANEL_DEFAULT_LEFT_PX - PANEL_EDGE_MARGIN_PX,
    );
    let width = Math.min(WORKFLOW_BROADCAST_PANEL_WIDTH_PX, maxWidth);
    const safeBottom = getTimelineSafeBottomPx();
    const availableHeight = Math.max(
        PANEL_MIN_HEIGHT_PX,
        safeBottom
            - stackTop
            - WORKFLOW_PANEL_STACK_GAP_PX
            - WORKFLOW_BROADCAST_MEDIA_PANEL_HEIGHT_RESERVE_PX,
    );
    const resolveHeight = (nextWidth) => Math.max(
        PANEL_MIN_HEIGHT_PX,
        WORKFLOW_BROADCAST_PANEL_HEADER_HEIGHT_PX + Math.round(nextWidth * 9 / 16),
    );
    if (resolveHeight(width) > availableHeight) {
        const widthForAvailableHeight = Math.floor(
            Math.max(0, availableHeight - WORKFLOW_BROADCAST_PANEL_HEADER_HEIGHT_PX) * 16 / 9,
        );
        width = clamp(widthForAvailableHeight, PANEL_MIN_WIDTH_PX, width);
    }
    return resolveHeight(width);
}

function getWorkflowMediaPanelTopPx() {
    const backgroundPanel = getDocumentRef()?.getElementById?.("background-media-panel") || null;
    if (
        backgroundPanel &&
        backgroundPanel.hidden !== true &&
        !backgroundPanel.classList?.contains?.("background-media-panel--hidden")
    ) {
        const backgroundRect = backgroundPanel.getBoundingClientRect?.() || null;
        const bottom = Number(backgroundRect?.bottom);
        if (Number.isFinite(bottom) && bottom > 0) {
            return Math.round(
                bottom
                + WORKFLOW_PANEL_STACK_GAP_PX
                - getPanelWrapperTopPx("media-browser-panel-wrapper"),
            );
        }
    }
    return getWorkflowPanelStackTopPx()
        + getWorkflowBroadcastFallbackHeightPx()
        + WORKFLOW_PANEL_STACK_GAP_PX;
}

function getTimelineSafeBottomPx() {
    const controlTop = getVisibleElementTopPx("#control-panel");
    const timelineTop = getVisibleElementTopPx(".timeline-dock");
    const boundaryTop = Math.min(
        Number.isFinite(controlTop) ? controlTop : Infinity,
        Number.isFinite(timelineTop) ? timelineTop : Infinity,
    );
    if (Number.isFinite(boundaryTop) && boundaryTop > PANEL_EDGE_MARGIN_PX) {
        return Math.round(
            boundaryTop
            - PANEL_TRANSPORT_CLEARANCE_PX
            - getPanelWrapperTopPx("media-browser-panel-wrapper"),
        );
    }
    return getViewportHeight() - PANEL_EDGE_MARGIN_PX;
}

function formatMediaElapsedTime(seconds) {
    const totalSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    if (hours > 0) {
        return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }
    return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}
export {
    getDocumentRef,
    getWindowRef,
    shouldAllowMediaBrowserPanel,
    isObjectLike,
    isElementLike,
    isImageLike,
    isVideoLike,
    callMediaMethod,
    isPictureInPictureSupported,
    isLikelyHlsSource,
    canPlayHlsNatively,
    loadHlsLibrary,
    createElement,
    dispatchDocumentCustomEvent,
    createSvgElement,
    getViewportWidth,
    getViewportHeight,
    getPanelDefaultHeightPx,
    getVisibleElementTopPx,
    getWorkflowMediaPanelTopPx,
    getTimelineSafeBottomPx,
    formatMediaElapsedTime,
};
