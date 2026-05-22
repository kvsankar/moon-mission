import {
    registerMissionPanel,
    updateMissionPanel,
} from "./panel-registry.js";
import { showMissionPanelInfo } from "./panel-info-popover.js";
import {
    readMissionPanelState,
    writeMissionPanelState,
} from "./panel-layout-store.js";
import {
    getMissionPanelDefaultState,
    isMissionPanelEnabled,
} from "./panel-defaults.js";
import {
    getDockviewSpikeLayoutHost,
    resolveDockedWorkflowPanelPosition,
} from "./dockview-workflow-panels.js";
import { bringPanelElementToFront } from "./panel-z-order.js";

const MEDIA_BROWSER_PANEL_ID = "workflow:media-browser";
const MEDIA_BROWSER_LAYOUT_PRESET_VERSION = "media-browser-v17-thumbnail-placement";
const PANEL_EDGE_MARGIN_PX = 8;
const PANEL_TRANSPORT_CLEARANCE_PX = 14;
const PANEL_DEFAULT_LEFT_PX = 32;
const PANEL_DEFAULT_WIDTH_PX = 672;
const PANEL_DEFAULT_HEIGHT_RATIO = 0.6;
const PANEL_MIN_WIDTH_PX = 360;
const PANEL_MIN_HEIGHT_PX = 240;
const WORKFLOW_PANEL_STACK_TOP_FALLBACK_PX = 36;
const WORKFLOW_PANEL_STACK_GAP_PX = 8;
const WORKFLOW_BROADCAST_PANEL_WIDTH_PX = 546;
const WORKFLOW_BROADCAST_PANEL_HEADER_HEIGHT_PX = 31;
const WORKFLOW_BROADCAST_MEDIA_PANEL_HEIGHT_RESERVE_PX = 260;
const WORKFLOW_MEDIA_PANEL_WIDTH_PX = 592;
const PANEL_RESIZE_HIT_PX = 28;
const DRILLDOWN_DRAWER_WIDTH_PX = 320;
const DRILLDOWN_DRAWER_MIN_WIDTH_PX = 260;
const DRILLDOWN_DRAWER_MIN_HEIGHT_PX = 180;
const THUMBNAIL_STRIP_MIN_HEIGHT_PX = 86;
const THUMBNAIL_STRIP_DEFAULT_HEIGHT_PX = THUMBNAIL_STRIP_MIN_HEIGHT_PX;
const THUMBNAIL_STRIP_MAX_HEIGHT_PX = 240;
const THUMBNAIL_STRIP_MIN_SIDE_WIDTH_PX = 126;
const THUMBNAIL_STRIP_DEFAULT_SIDE_WIDTH_PX = 152;
const THUMBNAIL_STRIP_MAX_SIDE_WIDTH_PX = 260;
const THUMBNAIL_STRIP_MIN_STAGE_HEIGHT_PX = 96;
const THUMBNAIL_STRIP_MIN_STAGE_WIDTH_PX = 180;
const THUMBNAIL_STRIP_KEYBOARD_STEP_PX = 12;
const THUMBNAIL_STRIP_KEYBOARD_LARGE_STEP_PX = 36;
const THUMBNAIL_SCROLLER_DRAG_THRESHOLD_PX = 5;
const THUMBNAIL_STRIP_PLACEMENTS = new Set(["left", "right", "top", "bottom"]);
const THUMBNAIL_DISCLOSURE_LEVELS = ["full", "compact", "minimal", "media-only"];
const THUMBNAIL_DISCLOSURE_LEVEL_CLASS_PREFIX = "media-browser-panel__thumbnail-strip--level-";
const MEDIA_IMAGE_MIN_ZOOM = 1;
const MEDIA_IMAGE_MAX_ZOOM = 6;
const MEDIA_IMAGE_ZOOM_STEP = 1.25;
const STAGE_OVERLAY_REVEAL_MS = 3000;

let hlsLibraryPromise = null;

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function snapRangeValue(value, min, max, step) {
    const safeValue = clamp(value, min, max);
    const safeStep = Number(step);
    if (!Number.isFinite(safeStep) || safeStep <= 0) {
        return safeValue;
    }
    const snapped = min + Math.round((safeValue - min) / safeStep) * safeStep;
    return clamp(snapped, min, max);
}

function resolveRangeValueAtClientX(rangeInput, clientX) {
    if (!rangeInput || !Number.isFinite(clientX)) return Number.NaN;
    const min = Number(rangeInput.min);
    const max = Number(rangeInput.max);
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
        return Number.NaN;
    }
    const rect = rangeInput.getBoundingClientRect?.();
    const width = Number(rect?.width);
    if (!Number.isFinite(width) || width <= 0) return Number.NaN;
    const left = Number(rect?.left) || 0;
    const ratio = clamp((clientX - left) / width, 0, 1);
    return snapRangeValue(min + ratio * (max - min), min, max, rangeInput.step);
}

function createDefaultMediaImageViewState() {
    return {
        zoom: MEDIA_IMAGE_MIN_ZOOM,
        panX: 0,
        panY: 0,
    };
}

function normalizeThumbnailStripPlacement(value) {
    const normalized = String(value || "").trim().toLowerCase();
    return THUMBNAIL_STRIP_PLACEMENTS.has(normalized) ? normalized : "bottom";
}

function isVerticalThumbnailStripPlacement(value) {
    const placement = normalizeThumbnailStripPlacement(value);
    return placement === "left" || placement === "right";
}

function rectsOverlap(leftRect = {}, rightRect = {}, gap = 0) {
    return (
        Number(leftRect.left) < Number(rightRect.right) + gap &&
        Number(leftRect.right) + gap > Number(rightRect.left) &&
        Number(leftRect.top) < Number(rightRect.bottom) + gap &&
        Number(leftRect.bottom) + gap > Number(rightRect.top)
    );
}

function resolveThumbnailPopoverPosition({
    panelWidth = 0,
    panelHeight = 0,
    anchorLeft = 0,
    anchorTop = 0,
    anchorRight = 0,
    anchorBottom = 0,
    popoverWidth = 280,
    popoverHeight = 152,
    gap = 8,
    margin = 8,
} = {}) {
    const safeMargin = Math.max(Number(margin) || 0, 0);
    const safePanelWidth = Math.max(Number(panelWidth) || 0, (Number(popoverWidth) || 0) + safeMargin * 2);
    const safePanelHeight = Math.max(Number(panelHeight) || 0, (Number(popoverHeight) || 0) + safeMargin * 2);
    const safePopoverWidth = Math.min(Math.max(Number(popoverWidth) || 280, 1), Math.max(1, safePanelWidth - safeMargin * 2));
    const safePopoverHeight = Math.min(Math.max(Number(popoverHeight) || 152, 1), Math.max(1, safePanelHeight - safeMargin * 2));
    const safeGap = Math.max(Number(gap) || 0, 0);
    const anchor = {
        left: Number(anchorLeft) || 0,
        top: Number(anchorTop) || 0,
        right: Number(anchorRight) || 0,
        bottom: Number(anchorBottom) || 0,
    };
    const anchorCenterX = (anchor.left + anchor.right) / 2;
    const anchorCenterY = (anchor.top + anchor.bottom) / 2;
    const maxLeft = safePanelWidth - safePopoverWidth - safeMargin;
    const maxTop = safePanelHeight - safePopoverHeight - safeMargin;
    const clampLeft = (value) => clamp(value, safeMargin, Math.max(safeMargin, maxLeft));
    const clampTop = (value) => clamp(value, safeMargin, Math.max(safeMargin, maxTop));
    const makeCandidate = (placement, left, top) => {
        const rect = {
            left: clampLeft(left),
            top: clampTop(top),
        };
        rect.right = rect.left + safePopoverWidth;
        rect.bottom = rect.top + safePopoverHeight;
        const overlapWidth = Math.max(0, Math.min(rect.right, anchor.right) - Math.max(rect.left, anchor.left));
        const overlapHeight = Math.max(0, Math.min(rect.bottom, anchor.bottom) - Math.max(rect.top, anchor.top));
        return {
            placement,
            left: rect.left,
            top: rect.top,
            overlapArea: overlapWidth * overlapHeight,
            rect,
        };
    };
    const candidates = [
        makeCandidate("above", anchorCenterX - safePopoverWidth / 2, anchor.top - safePopoverHeight - safeGap),
        makeCandidate("below", anchorCenterX - safePopoverWidth / 2, anchor.bottom + safeGap),
        makeCandidate("right", anchor.right + safeGap, anchorCenterY - safePopoverHeight / 2),
        makeCandidate("left", anchor.left - safePopoverWidth - safeGap, anchorCenterY - safePopoverHeight / 2),
    ];
    const best = candidates.find((candidate) => !rectsOverlap(candidate.rect, anchor, 1)) ||
        candidates.slice().sort((left, right) => left.overlapArea - right.overlapArea)[0];
    return {
        placement: best?.placement || "above",
        left: Math.round(best?.left || safeMargin),
        top: Math.round(best?.top || safeMargin),
    };
}

function resolveThumbnailDisclosureLevel({
    placement = "bottom",
    stripSize = 0,
    panelWidth = 0,
    panelHeight = 0,
} = {}) {
    const vertical = isVerticalThumbnailStripPlacement(placement);
    const size = Number(stripSize);
    const safeSize = Number.isFinite(size) && size > 0
        ? size
        : (vertical ? THUMBNAIL_STRIP_DEFAULT_SIDE_WIDTH_PX : THUMBNAIL_STRIP_DEFAULT_HEIGHT_PX);

    let level = "media-only";
    if (vertical) {
        if (safeSize >= 210) level = "full";
        else if (safeSize >= 170) level = "compact";
        else if (safeSize >= 136) level = "minimal";
    } else if (safeSize >= 150) {
        level = "full";
    } else if (safeSize >= 118) {
        level = "compact";
    } else if (safeSize >= 96) {
        level = "minimal";
    }

    const width = Number(panelWidth);
    const height = Number(panelHeight);
    if (!vertical && Number.isFinite(width) && width > 0 && width < 420 && level === "full") {
        level = "compact";
    }
    if (vertical && Number.isFinite(height) && height > 0 && height < 340 && level === "full") {
        level = "compact";
    }

    return level;
}

function normalizeMediaImageViewState(state = {}) {
    const zoom = clamp(
        Number.isFinite(Number(state.zoom)) ? Number(state.zoom) : MEDIA_IMAGE_MIN_ZOOM,
        MEDIA_IMAGE_MIN_ZOOM,
        MEDIA_IMAGE_MAX_ZOOM,
    );
    return {
        zoom,
        panX: Number.isFinite(Number(state.panX)) ? Number(state.panX) : 0,
        panY: Number.isFinite(Number(state.panY)) ? Number(state.panY) : 0,
    };
}

function clampMediaImagePan(state = {}, stageSize = {}) {
    const normalized = normalizeMediaImageViewState(state);
    if (normalized.zoom <= MEDIA_IMAGE_MIN_ZOOM) {
        return createDefaultMediaImageViewState();
    }

    const width = Number(stageSize.width);
    const height = Number(stageSize.height);
    const maxPanX = Number.isFinite(width) && width > 0
        ? (width * (normalized.zoom - 1)) / 2
        : 0;
    const maxPanY = Number.isFinite(height) && height > 0
        ? (height * (normalized.zoom - 1)) / 2
        : 0;
    return {
        zoom: normalized.zoom,
        panX: clamp(normalized.panX, -maxPanX, maxPanX),
        panY: clamp(normalized.panY, -maxPanY, maxPanY),
    };
}

function zoomMediaImageViewState(state = {}, zoomMultiplier = 1, stageSize = {}) {
    const normalized = normalizeMediaImageViewState(state);
    const multiplier = Number.isFinite(Number(zoomMultiplier)) && Number(zoomMultiplier) > 0
        ? Number(zoomMultiplier)
        : 1;
    return clampMediaImagePan({
        ...normalized,
        zoom: normalized.zoom * multiplier,
    }, stageSize);
}

function getDocumentRef() {
    return globalThis.document || null;
}

function getWindowRef() {
    return globalThis.window || null;
}

function shouldAllowMediaBrowserPanel() {
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

function createMediaBrowserPanelActions({
    onIntent,
} = {}) {
    let initialized = false;
    let missionConfigData = null;
    let missionLabel = "Current mission";
    let panelAvailable = false;
    let panelAvailableForMission = false;
    let panelTitle = "Mission Media";
    let mediaCountLabel = "--";
    let panelVisibilityState = "closed";
    let panelPosition = null;
    let dragState = null;
    let panelResizeDragState = null;
    let thumbnailResizeDragState = null;
    let thumbnailPlacementDragState = null;
    let thumbnailScrollerDragState = null;
    let thumbnailPagingTargetScrollLeft = null;
    let suppressThumbnailClick = false;
    let imageViewState = createDefaultMediaImageViewState();
    let imagePanDragState = null;
    let imageViewAssetUrl = "";
    let videoViewAssetUrl = "";
    let hlsInstance = null;
    let hlsSourceUrl = "";
    let hlsAttachToken = 0;
    let hlsUnsupportedSourceUrl = "";
    let filterSignature = "";
    let filterDrawerOpen = false;
    let currentFilterModel = {};
    let thumbnailStructureSignature = "";
    let thumbnailActiveSignature = "";
    let panelStructuralRenderSignature = "";
    let restoredPanelLayout = readMissionPanelState(MEDIA_BROWSER_PANEL_ID) || null;
    if (String(restoredPanelLayout?.layoutPresetVersion || "").trim() !== MEDIA_BROWSER_LAYOUT_PRESET_VERSION) {
        restoredPanelLayout = null;
    }
    let defaultLayoutManaged = restoredPanelLayout?.defaultLayoutManaged !== false;
    let thumbnailStripHeight = Number.isFinite(Number(restoredPanelLayout?.thumbnailStripHeight))
        && Number(restoredPanelLayout.thumbnailStripHeight) > 0
        ? Math.round(Number(restoredPanelLayout.thumbnailStripHeight))
        : THUMBNAIL_STRIP_DEFAULT_HEIGHT_PX;
    let thumbnailStripPlacement = normalizeThumbnailStripPlacement(restoredPanelLayout?.thumbnailStripPlacement);
    let thumbnailStripCollapsed = restoredPanelLayout?.thumbnailStripCollapsed === true;
    let panelExpanded = restoredPanelLayout?.maximized === true;
    let restorePanelFrame = restoredPanelLayout?.restoreFrame && typeof restoredPanelLayout.restoreFrame === "object"
        ? {
            x: Math.round(Number(restoredPanelLayout.restoreFrame.x) || 0),
            y: Math.round(Number(restoredPanelLayout.restoreFrame.y) || 0),
            width: Math.round(Number(restoredPanelLayout.restoreFrame.width) || 0),
            height: Math.round(Number(restoredPanelLayout.restoreFrame.height) || 0),
        }
        : null;
    let hasRestoredPanelVisibilityState = false;
    let defaultPanelStateApplied = false;
    let suppressNativeMediaSeekEvents = 0;
    let stageOverlayRevealTimer = 0;
    let stageOverlayRevealSignature = null;
    let stageOverlayHovering = false;
    let stageOverlayFocusWithin = false;

    function getNode(id) {
        return getDocumentRef()?.getElementById?.(id) || null;
    }

    function getWrapper() {
        return getNode("media-browser-panel-wrapper");
    }

    function isDockviewMediaPanelEnabled() {
        return !!getDockviewSpikeLayoutHost();
    }

    function isMediaPanelDocked(panel = getNode("media-browser-panel")) {
        return !!panel?.classList?.contains?.("media-browser-panel--dockview");
    }

    function ensureMediaPanelDocked(panel = getNode("media-browser-panel")) {
        if (!isElementLike(panel)) return false;
        const layoutHost = getDockviewSpikeLayoutHost();
        if (!layoutHost) return false;
        if (layoutHost.focusPanel(MEDIA_BROWSER_PANEL_ID)) {
            return true;
        }
        const position = resolveDockedWorkflowPanelPosition(layoutHost, MEDIA_BROWSER_PANEL_ID);
        layoutHost.addPanel({
            id: MEDIA_BROWSER_PANEL_ID,
            component: "mounted-element",
            title: panelTitle || "Mission Media",
            position,
            params: {
                mountElementId: "media-browser-panel",
                mountClassName: "media-browser-panel--dockview",
                fallbackParentId: "media-browser-panel-wrapper",
            },
            initialWidth: 300,
            minimumWidth: 260,
            minimumHeight: PANEL_MIN_HEIGHT_PX,
        });
        layoutHost.focusPanel(MEDIA_BROWSER_PANEL_ID);
        return true;
    }

    function closeDockedMediaPanel() {
        const layoutHost = getDockviewSpikeLayoutHost();
        if (!layoutHost) return false;
        return layoutHost.closePanel(MEDIA_BROWSER_PANEL_ID);
    }

    function bringPanelToFront() {
        if (isMediaPanelDocked()) return;
        bringPanelElementToFront(getWrapper());
    }

    function getImageStageSize() {
        const stage = getNode("media-browser-stage");
        const rect = stage?.getBoundingClientRect?.() || null;
        return {
            width: Number(rect?.width) || stage?.clientWidth || 0,
            height: Number(rect?.height) || stage?.clientHeight || 0,
        };
    }

    function getPanelRegistryState() {
        if (!panelAvailable) return "unavailable";
        return panelVisibilityState;
    }

    function setText(id, value) {
        const node = getNode(id);
        if (!node) return;
        const nextValue = String(value ?? "");
        if (node.textContent !== nextValue) {
            node.textContent = nextValue;
        }
    }

    function setHidden(id, hidden) {
        const node = getNode(id);
        if (!node) return;
        const nextHidden = !!hidden;
        if (node.hidden !== nextHidden) {
            node.hidden = nextHidden;
        }
    }

    function buildPanelStructuralRenderSignature(viewModel = {}) {
        return JSON.stringify({
            panelTitle: viewModel.panelTitle || panelTitle,
            mediaCountLabel: viewModel.mediaCountLabel || mediaCountLabel,
            statusText: String(viewModel.statusText || "").trim(),
            activeItem: viewModel.activeItem || null,
            descriptionEmptyText: viewModel.descriptionEmptyText || "",
            emptyText: viewModel.emptyText || "",
            stageEmptyText: viewModel.stageEmptyText || "",
            seedNote: viewModel.seedNote || "",
            filterSummaryLabel: viewModel.filterSummaryLabel || "",
            filterModel: viewModel.filterModel || null,
            navigationModel: viewModel.navigationModel || null,
            thumbnailItems: viewModel.thumbnailItems || [],
        });
    }

    function resolveCompactTimeLabel(timeLabel) {
        const text = String(timeLabel || "").trim();
        if (!text) return "--";
        return text.split(" • ")[0]?.trim() || text;
    }

    function formatThumbnailKindLabel(kind) {
        switch (kind) {
        case "audioClip":
            return "Audio";
        case "videoClip":
            return "Video";
        case "image":
            return "Image";
        default:
            return String(kind || "Media").trim() || "Media";
        }
    }

    function buildThumbnailAriaLabel(item = {}) {
        return [
            item.title,
            item.metaFull || item.meta || item.thumbnailLabel,
            item.localTimeLabel ? `Local ${item.localTimeLabel}` : "",
            item.utcTimeLabel ? `UTC ${item.utcTimeLabel}` : "",
            item.cameraLabel,
            item.metadataLabel,
        ].filter(Boolean).join(" - ") || "Mission media item";
    }

    function appendThumbnailPopoverRow(list, label, value) {
        const text = String(value || "").trim();
        if (!isElementLike(list) || !text) return;
        const key = createElement("dt");
        const detail = createElement("dd");
        if (!key || !detail) return;
        key.className = "media-browser-panel__thumbnail-popover-key";
        key.textContent = label;
        detail.className = "media-browser-panel__thumbnail-popover-value";
        detail.textContent = text;
        list.appendChild(key);
        list.appendChild(detail);
    }

    function ensureThumbnailPopover() {
        let popover = getNode("media-browser-thumbnail-popover");
        if (isElementLike(popover)) return popover;
        const panel = getNode("media-browser-panel");
        if (!isElementLike(panel)) return null;
        popover = createElement("div");
        if (!popover) return null;
        popover.id = "media-browser-thumbnail-popover";
        popover.className = "media-browser-panel__thumbnail-popover";
        popover.hidden = true;
        popover.setAttribute?.("role", "status");
        panel.appendChild?.(popover);
        return popover;
    }

    function positionThumbnailPopover(popover, anchor) {
        const panel = getNode("media-browser-panel");
        if (!isElementLike(popover) || !isElementLike(anchor) || !isElementLike(panel)) return;
        const panelRect = panel.getBoundingClientRect?.() || {};
        const anchorRect = anchor.getBoundingClientRect?.() || {};
        const popoverRect = popover.getBoundingClientRect?.() || {};
        const panelWidth = Number(panelRect.width) || panel.offsetWidth || 0;
        const panelHeight = Number(panelRect.height) || panel.offsetHeight || 0;
        const popoverWidth = Number(popoverRect.width) || 280;
        const popoverHeight = Number(popoverRect.height) || 152;
        const anchorLeft = Number(anchorRect.left) - (Number(panelRect.left) || 0);
        const anchorRight = Number(anchorRect.right) - (Number(panelRect.left) || 0);
        const anchorTop = Number(anchorRect.top) - (Number(panelRect.top) || 0);
        const anchorBottom = Number(anchorRect.bottom) - (Number(panelRect.top) || 0);
        const position = resolveThumbnailPopoverPosition({
            panelWidth,
            panelHeight,
            anchorLeft,
            anchorTop,
            anchorRight,
            anchorBottom,
            popoverWidth,
            popoverHeight,
        });
        popover.dataset.placement = position.placement;
        popover.style.left = `${position.left}px`;
        popover.style.top = `${position.top}px`;
    }

    function showThumbnailPopover(item, anchor) {
        const popover = ensureThumbnailPopover();
        if (!isElementLike(popover)) return;
        const title = createElement("div");
        const subtitle = createElement("div");
        const details = createElement("dl");
        if (!title || !subtitle || !details) return;
        title.className = "media-browser-panel__thumbnail-popover-title";
        title.textContent = item.title || "Mission media item";
        subtitle.className = "media-browser-panel__thumbnail-popover-subtitle";
        subtitle.textContent = [formatThumbnailKindLabel(item.kind), item.stageBadge]
            .filter(Boolean)
            .join(" • ");
        details.className = "media-browser-panel__thumbnail-popover-details";
        appendThumbnailPopoverRow(details, "MET", item.metaFull || item.meta);
        appendThumbnailPopoverRow(details, "Local", item.localTimeLabel);
        appendThumbnailPopoverRow(details, "UTC", item.utcTimeLabel);
        appendThumbnailPopoverRow(details, "Camera", item.cameraLabel);
        appendThumbnailPopoverRow(details, "Photographer", item.photographer);
        appendThumbnailPopoverRow(details, "Location", item.location);
        appendThumbnailPopoverRow(details, "Source", item.sourceLabel);
        appendThumbnailPopoverRow(details, "AI", String(item.metadataLabel || "").replace(/^AI:\s*/i, ""));
        if (typeof popover.replaceChildren === "function") {
            popover.replaceChildren(title, subtitle, details);
        } else {
            popover.innerHTML = "";
            popover.appendChild(title);
            popover.appendChild(subtitle);
            popover.appendChild(details);
        }
        popover.hidden = false;
        positionThumbnailPopover(popover, anchor);
    }

    function hideThumbnailPopover() {
        const popover = getNode("media-browser-thumbnail-popover");
        if (!isElementLike(popover)) return;
        popover.hidden = true;
    }

    function appendResponsiveThumbnailMetLabel(host, item = {}) {
        if (!isElementLike(host)) return;
        const fullLabel = String(item.metaFull || item.thumbnailLabel || item.meta || "MET --").trim();
        const shortLabel = String(item.thumbnailLabel || item.meta || fullLabel).trim();
        if (fullLabel && shortLabel && fullLabel !== shortLabel) {
            const full = createElement("span");
            const short = createElement("span");
            if (full && short) {
                full.className = "media-browser-panel__thumbnail-meta-full";
                full.textContent = fullLabel;
                short.className = "media-browser-panel__thumbnail-meta-short";
                short.textContent = shortLabel;
                host.appendChild(full);
                host.appendChild(short);
                host.setAttribute?.("aria-label", fullLabel);
                return;
            }
        }
        host.textContent = shortLabel || fullLabel || "MET --";
    }

    function formatCountLabel(count, singular, plural = `${singular}s`) {
        const normalizedCount = Number(count);
        if (!Number.isFinite(normalizedCount)) return "";
        return `${normalizedCount} ${normalizedCount === 1 ? singular : plural}`;
    }

    function formatMediaFilterSummary(filterModel = {}) {
        const matchCount = Number(filterModel.matchCount);
        const totalCount = Number(filterModel.totalCount);
        if (!Number.isFinite(matchCount) || !Number.isFinite(totalCount)) {
            return "";
        }
        const kindCounts = filterModel.matchKindCounts || {};
        const breakdown = [
            formatCountLabel(kindCounts.image, "image"),
            formatCountLabel(kindCounts.audioClip, "audio", "audio"),
            formatCountLabel(kindCounts.videoClip, "video"),
        ].filter((part) => part && !part.startsWith("0 "));
        const base = `${matchCount} of ${formatCountLabel(totalCount, "media file")} filtered in`;
        return breakdown.length > 0 ? `${base} (${breakdown.join(", ")}).` : `${base}.`;
    }

    function countActiveMediaFilters(filterModel = {}) {
        const groups = [
            filterModel?.kindPillOptions || [],
            filterModel?.subjectOptions || filterModel?.quickOptions || [],
            filterModel?.cameraButtonOptions || [],
        ];
        const facetCount = groups.reduce((total, options) => total + (Array.isArray(options)
            ? options.filter((option) => option?.active === true && option?.id !== "all").length
            : 0), 0);
        const query = String(filterModel?.query || "").trim();
        return facetCount + (query ? 1 : 0);
    }

    function syncMediaFilterToggle(filterModel = currentFilterModel) {
        const button = getNode("media-browser-filter-toggle");
        if (!button) return;
        const activeCount = countActiveMediaFilters(filterModel);
        const label = activeCount > 0 ? `Filters ${activeCount}` : "Filter...";
        button.textContent = label;
        button.title = filterDrawerOpen ? "Hide media filters" : "Show media filters";
        button.setAttribute("aria-label", button.title);
        button.setAttribute("aria-expanded", filterDrawerOpen ? "true" : "false");
        button.classList?.toggle?.("is-active", filterDrawerOpen || activeCount > 0);
    }

    function setStageOverlayRevealed(revealed) {
        const stage = getNode("media-browser-stage");
        stage?.classList?.toggle?.("is-overlay-revealed", revealed === true);
    }

    function revealStageOverlays({
        durationMs = STAGE_OVERLAY_REVEAL_MS,
    } = {}) {
        const windowRef = getWindowRef();
        if (stageOverlayRevealTimer) {
            windowRef?.clearTimeout?.(stageOverlayRevealTimer);
            stageOverlayRevealTimer = 0;
        }
        setStageOverlayRevealed(true);
        const delay = Number(durationMs);
        if (!Number.isFinite(delay) || delay <= 0) return;
        stageOverlayRevealTimer = windowRef?.setTimeout?.(() => {
            stageOverlayRevealTimer = 0;
            if (stageOverlayHovering === true || stageOverlayFocusWithin === true) return;
            setStageOverlayRevealed(false);
        }, delay) || 0;
    }

    function revealStageOverlaysForSignature(signature) {
        const normalizedSignature = String(signature || "").trim();
        if (normalizedSignature === stageOverlayRevealSignature) return;
        stageOverlayRevealSignature = normalizedSignature;
        revealStageOverlays();
    }

    function formatMediaDetailList(values) {
        const parts = (Array.isArray(values) ? values : [])
            .map((value) => String(value || "").trim())
            .filter(Boolean);
        return parts.length ? parts.join(", ") : "--";
    }

    function formatCompositionHintLabel(hint = {}) {
        const target = String(hint?.suggestedLockTarget || hint?.lockTarget || "").trim();
        const confidence = Number(hint?.confidence);
        const reason = String(hint?.reason || "").trim();
        const targetLabel = target ? `Lock ${target}` : "";
        const confidenceLabel = Number.isFinite(confidence) ? `${Math.round(confidence * 100)}%` : "";
        return [
            targetLabel,
            confidenceLabel,
            reason,
        ].filter(Boolean).join(" - ") || "--";
    }

    function resolveDefaultPanelPosition(panel) {
        const width = Math.max(panel.offsetWidth || PANEL_DEFAULT_WIDTH_PX, PANEL_MIN_WIDTH_PX);
        const height = Math.max(panel.offsetHeight || getPanelDefaultHeightPx(), PANEL_MIN_HEIGHT_PX);
        const x = PANEL_DEFAULT_LEFT_PX;
        const y = getWorkflowMediaPanelTopPx();
        return clampPanelRect({ x, y, width, height });
    }

    function resolveDefaultPanelFrame() {
        const y = getWorkflowMediaPanelTopPx();
        const width = Math.min(
            WORKFLOW_MEDIA_PANEL_WIDTH_PX,
            Math.max(PANEL_MIN_WIDTH_PX, getViewportWidth() - PANEL_DEFAULT_LEFT_PX - PANEL_EDGE_MARGIN_PX),
        );
        const safeBottom = getTimelineSafeBottomPx();
        const availableHeight = Math.max(0, safeBottom - y);
        const height = Math.min(
            getPanelDefaultHeightPx(),
            Math.max(PANEL_MIN_HEIGHT_PX, availableHeight),
        );
        return {
            x: PANEL_DEFAULT_LEFT_PX,
            y,
            width,
            height,
        };
    }

    function clampPanelRect({ x, y, width, height }) {
        const maxX = Math.max(PANEL_EDGE_MARGIN_PX, getViewportWidth() - width - PANEL_EDGE_MARGIN_PX);
        const maxY = Math.max(PANEL_EDGE_MARGIN_PX, getViewportHeight() - height - PANEL_EDGE_MARGIN_PX);
        return {
            x: clamp(Math.round(x), PANEL_EDGE_MARGIN_PX, maxX),
            y: clamp(Math.round(y), PANEL_EDGE_MARGIN_PX, maxY),
        };
    }

    function applyPanelPosition(panel, x, y) {
        if (!panel) return;
        if (isMediaPanelDocked(panel)) return;
        const width = Math.max(panel.offsetWidth || PANEL_DEFAULT_WIDTH_PX, PANEL_MIN_WIDTH_PX);
        const height = Math.max(panel.offsetHeight || getPanelDefaultHeightPx(), PANEL_MIN_HEIGHT_PX);
        const clamped = clampPanelRect({ x, y, width, height });
        panelPosition = clamped;
        panel.style.left = `${clamped.x}px`;
        panel.style.top = `${clamped.y}px`;
        syncFilterDrawerPlacement();
        syncDrilldownFlyoutPlacement();
    }

    function setDefaultLayoutManaged(managed, panel = getNode("media-browser-panel")) {
        defaultLayoutManaged = managed !== false;
        if (isElementLike(panel) && panel.dataset) {
            panel.dataset.defaultLayoutManaged = defaultLayoutManaged ? "true" : "false";
        }
    }

    function clampPanelFrame({ x, y, width, height }) {
        const nextWidth = clamp(
            Math.round(Number(width) || PANEL_DEFAULT_WIDTH_PX),
            PANEL_MIN_WIDTH_PX,
            Math.max(PANEL_MIN_WIDTH_PX, getViewportWidth() - (2 * PANEL_EDGE_MARGIN_PX)),
        );
        const nextHeight = clamp(
            Math.round(Number(height) || getPanelDefaultHeightPx()),
            PANEL_MIN_HEIGHT_PX,
            Math.max(PANEL_MIN_HEIGHT_PX, getViewportHeight() - (2 * PANEL_EDGE_MARGIN_PX)),
        );
        const maxX = Math.max(PANEL_EDGE_MARGIN_PX, getViewportWidth() - nextWidth - PANEL_EDGE_MARGIN_PX);
        const maxY = Math.max(PANEL_EDGE_MARGIN_PX, getViewportHeight() - nextHeight - PANEL_EDGE_MARGIN_PX);
        return {
            x: clamp(Math.round(Number(x) || PANEL_EDGE_MARGIN_PX), PANEL_EDGE_MARGIN_PX, maxX),
            y: clamp(Math.round(Number(y) || PANEL_EDGE_MARGIN_PX), PANEL_EDGE_MARGIN_PX, maxY),
            width: nextWidth,
            height: nextHeight,
        };
    }

    function applyPanelFrame(panel, frame, { managed = defaultLayoutManaged, persist = true } = {}) {
        if (!isElementLike(panel) || !frame) return;
        if (isMediaPanelDocked(panel)) {
            applyThumbnailStripHeight(thumbnailStripHeight);
            applyImageViewState(imageViewState, { animate: false });
            return;
        }
        const clamped = clampPanelFrame(frame);
        panel.style.width = `${clamped.width}px`;
        panel.style.height = `${clamped.height}px`;
        panelPosition = { x: clamped.x, y: clamped.y };
        panel.style.left = `${clamped.x}px`;
        panel.style.top = `${clamped.y}px`;
        setDefaultLayoutManaged(managed, panel);
        syncFilterDrawerPlacement();
        syncDrilldownFlyoutPlacement();
        applyThumbnailStripHeight(thumbnailStripHeight);
        applyImageViewState(imageViewState, { animate: false });
        if (persist) {
            persistPanelLayoutState(panel);
        }
    }

    function requestAuxiliaryPanelLayout() {
        const documentRef = getDocumentRef();
        if (!documentRef?.dispatchEvent || typeof CustomEvent !== "function") {
            return;
        }
        documentRef.dispatchEvent(new CustomEvent("moon-mission:auxiliary-panels-layout-request"));
    }

    function applyManagedDefaultPanelFrame(panel = getNode("media-browser-panel"), { persist = true } = {}) {
        if (
            defaultLayoutManaged === false ||
            panelVisibilityState !== "open" ||
            panelExpanded === true ||
            !isElementLike(panel)
        ) {
            return false;
        }
        applyPanelFrame(panel, resolveDefaultPanelFrame(), {
            managed: true,
            persist,
        });
        return true;
    }

    function clampPanelPosition(panel) {
        if (!panelPosition) {
            const initial = resolveDefaultPanelPosition(panel);
            applyPanelPosition(panel, initial.x, initial.y);
            return;
        }
        applyPanelPosition(panel, panelPosition.x, panelPosition.y);
    }

    function ensurePanelPosition(panel) {
        if (!panel) return;
        if (isMediaPanelDocked(panel)) return;
        if (!panelPosition) {
            applyPanelFrame(panel, resolveDefaultPanelFrame(), {
                managed: defaultLayoutManaged,
                persist: false,
            });
            return;
        }
        clampPanelPosition(panel);
    }

    function capturePanelFrame(panel = getNode("media-browser-panel")) {
        if (!isElementLike(panel)) return null;
        return {
            x: Math.round(panelPosition?.x ?? panel.offsetLeft ?? 0),
            y: Math.round(panelPosition?.y ?? panel.offsetTop ?? 0),
            width: Math.round(panel.offsetWidth || 0),
            height: Math.round(panel.offsetHeight || 0),
        };
    }

    function persistPanelLayoutState(panel = getNode("media-browser-panel")) {
        if (!isElementLike(panel)) return;
        if (isMediaPanelDocked(panel)) {
            writeMissionPanelState(MEDIA_BROWSER_PANEL_ID, {
                state: panelVisibilityState,
                layoutPresetVersion: MEDIA_BROWSER_LAYOUT_PRESET_VERSION,
                thumbnailStripHeight: Math.round(thumbnailStripHeight),
                thumbnailStripPlacement,
                thumbnailStripCollapsed: thumbnailStripCollapsed === true,
            });
            return;
        }
        writeMissionPanelState(MEDIA_BROWSER_PANEL_ID, {
            x: Math.round(panelPosition?.x ?? panel.offsetLeft ?? 0),
            y: Math.round(panelPosition?.y ?? panel.offsetTop ?? 0),
            width: Math.round(panel.offsetWidth || 0),
            height: Math.round(panel.offsetHeight || 0),
            state: panelVisibilityState,
            maximized: panelExpanded === true,
            layoutPresetVersion: MEDIA_BROWSER_LAYOUT_PRESET_VERSION,
            defaultLayoutManaged: defaultLayoutManaged !== false,
            thumbnailStripHeight: Math.round(thumbnailStripHeight),
            thumbnailStripPlacement,
            thumbnailStripCollapsed: thumbnailStripCollapsed === true,
            restoreFrame: restorePanelFrame && typeof restorePanelFrame === "object"
                ? {
                    x: Math.round(Number(restorePanelFrame.x) || 0),
                    y: Math.round(Number(restorePanelFrame.y) || 0),
                    width: Math.round(Number(restorePanelFrame.width) || 0),
                    height: Math.round(Number(restorePanelFrame.height) || 0),
                }
                : null,
        });
    }

    function getElementHeight(node) {
        const rect = node?.getBoundingClientRect?.() || null;
        const rectHeight = Number(rect?.height);
        if (Number.isFinite(rectHeight) && rectHeight > 0) return rectHeight;
        const offsetHeight = Number(node?.offsetHeight);
        return Number.isFinite(offsetHeight) ? offsetHeight : 0;
    }

    function getElementWidth(node) {
        const rect = node?.getBoundingClientRect?.() || null;
        const rectWidth = Number(rect?.width);
        if (Number.isFinite(rectWidth) && rectWidth > 0) return rectWidth;
        const offsetWidth = Number(node?.offsetWidth);
        return Number.isFinite(offsetWidth) ? offsetWidth : 0;
    }

    function isThumbnailStripVertical() {
        return isVerticalThumbnailStripPlacement(thumbnailStripPlacement);
    }

    function getThumbnailCollapseButtons(panel = getNode("media-browser-panel")) {
        const buttons = Array.from(panel?.querySelectorAll?.(".media-browser-panel__thumbnail-collapse") || []);
        const primaryButton = getNode("media-browser-thumbnail-collapse");
        if (primaryButton && !buttons.includes(primaryButton)) {
            buttons.unshift(primaryButton);
        }
        return buttons;
    }

    function resolveThumbnailStripConstraints(panel = getNode("media-browser-panel")) {
        const vertical = isThumbnailStripVertical();
        if (vertical) {
            const panelWidth = getElementWidth(panel);
            if (!panelWidth) {
                return {
                    min: THUMBNAIL_STRIP_MIN_SIDE_WIDTH_PX,
                    max: THUMBNAIL_STRIP_MAX_SIDE_WIDTH_PX,
                };
            }
            const resizerWidth = getElementWidth(getNode("media-browser-thumbnail-resizer")) || 8;
            const availableWidth = panelWidth
                - resizerWidth
                - THUMBNAIL_STRIP_MIN_STAGE_WIDTH_PX;
            return {
                min: THUMBNAIL_STRIP_MIN_SIDE_WIDTH_PX,
                max: Math.max(
                    THUMBNAIL_STRIP_MIN_SIDE_WIDTH_PX,
                    Math.min(THUMBNAIL_STRIP_MAX_SIDE_WIDTH_PX, Math.round(availableWidth)),
                ),
            };
        }

        const panelHeight = getElementHeight(panel);
        if (!panelHeight) {
            return {
                min: THUMBNAIL_STRIP_MIN_HEIGHT_PX,
                max: THUMBNAIL_STRIP_MAX_HEIGHT_PX,
            };
        }

        const headerHeight = getElementHeight(panel?.querySelector?.(".media-browser-panel__header"));
        const mediaControlsHeight = getElementHeight(getNode("media-browser-media-controls"));
        const statusHeight = getElementHeight(getNode("media-browser-status"));
        const resizerHeight = getElementHeight(getNode("media-browser-thumbnail-resizer")) || 8;
        const availableHeight = panelHeight
            - headerHeight
            - mediaControlsHeight
            - statusHeight
            - resizerHeight
            - THUMBNAIL_STRIP_MIN_STAGE_HEIGHT_PX;
        return {
            min: THUMBNAIL_STRIP_MIN_HEIGHT_PX,
            max: Math.max(
                THUMBNAIL_STRIP_MIN_HEIGHT_PX,
                Math.min(THUMBNAIL_STRIP_MAX_HEIGHT_PX, Math.round(availableHeight)),
            ),
        };
    }

    function syncThumbnailStripDisclosure(panel = getNode("media-browser-panel")) {
        if (!isElementLike(panel)) return;
        const collapsed = thumbnailStripCollapsed === true;
        panel.classList.toggle("media-browser-panel--thumbnails-collapsed", collapsed);
        getWrapper()?.classList?.toggle?.("media-browser-panel-wrapper--thumbnail-disclosure-active", collapsed);

        const strip = panel.querySelector?.(".media-browser-panel__thumbnail-strip");
        if (strip) {
            strip.hidden = collapsed;
            strip.setAttribute?.("aria-hidden", collapsed ? "true" : "false");
        }

        const buttons = getThumbnailCollapseButtons(panel);
        for (const button of buttons) {
            if (!isElementLike(button)) continue;
            const expandedIcons = {
                top: "▾",
                bottom: "▴",
                left: "▸",
                right: "◂",
            };
            const collapsedIcons = {
                top: "▴",
                bottom: "▾",
                left: "◂",
                right: "▸",
            };
            button.textContent = collapsed
                ? collapsedIcons[thumbnailStripPlacement]
                : expandedIcons[thumbnailStripPlacement];
            button.title = collapsed ? "Show thumbnail strip" : "Collapse thumbnail strip";
            button.setAttribute("aria-label", button.title);
            button.setAttribute("aria-expanded", collapsed ? "false" : "true");
        }

        const resizer = getNode("media-browser-thumbnail-resizer");
        if (resizer?.setAttribute) {
            resizer.setAttribute("aria-orientation", isThumbnailStripVertical() ? "vertical" : "horizontal");
            resizer.setAttribute(
                "aria-label",
                collapsed ? "Thumbnail strip collapsed" : "Resize thumbnail strip",
            );
        }
    }

    function syncThumbnailStripPlacement(panel = getNode("media-browser-panel")) {
        if (!isElementLike(panel)) return;
        const placement = normalizeThumbnailStripPlacement(thumbnailStripPlacement);
        thumbnailStripPlacement = placement;
        panel.dataset.thumbnailStripPlacement = placement;
        for (const side of THUMBNAIL_STRIP_PLACEMENTS) {
            panel.classList.toggle(`media-browser-panel--thumbnail-strip-${side}`, side === placement);
        }
        const vertical = isThumbnailStripVertical();
        const strip = panel.querySelector?.(".media-browser-panel__thumbnail-strip");
        strip?.classList?.toggle("is-vertical", vertical);
        strip?.classList?.toggle("is-horizontal", !vertical);
        const host = getNode("media-browser-thumbnail-list");
        host?.classList?.toggle("is-vertical", vertical);
        host?.classList?.toggle("is-horizontal", !vertical);
        const previousButton = getNode("media-browser-thumbnail-prev");
        const nextButton = getNode("media-browser-thumbnail-next");
        if (previousButton?.setAttribute) {
            previousButton.textContent = vertical ? "⌃" : "<";
            previousButton.title = vertical ? "Scroll thumbnails up" : "Scroll thumbnails left";
            previousButton.setAttribute("aria-label", previousButton.title);
        }
        if (nextButton?.setAttribute) {
            nextButton.textContent = vertical ? "⌄" : ">";
            nextButton.title = vertical ? "Scroll thumbnails down" : "Scroll thumbnails right";
            nextButton.setAttribute("aria-label", nextButton.title);
        }
        syncThumbnailStripDisclosure(panel);
    }

    function setThumbnailStripPlacement(nextPlacement, {
        persist = false,
    } = {}) {
        const normalized = normalizeThumbnailStripPlacement(nextPlacement);
        const changed = normalized !== thumbnailStripPlacement;
        thumbnailStripPlacement = normalized;
        const panel = getNode("media-browser-panel");
        syncThumbnailStripPlacement(panel);
        if (isThumbnailStripVertical() && thumbnailStripHeight < THUMBNAIL_STRIP_MIN_SIDE_WIDTH_PX) {
            thumbnailStripHeight = THUMBNAIL_STRIP_DEFAULT_SIDE_WIDTH_PX;
        }
        applyThumbnailStripHeight(thumbnailStripHeight, { persist: false });
        thumbnailPagingTargetScrollLeft = null;
        revealActiveThumbnail();
        syncThumbnailPageButtons();
        applyImageViewState(imageViewState, { animate: false });
        if (persist || changed) {
            persistPanelLayoutState(panel);
        }
    }

    function setThumbnailStripCollapsed(collapsed, {
        persist = false,
    } = {}) {
        const nextCollapsed = collapsed === true;
        if (thumbnailStripCollapsed === nextCollapsed) {
            syncThumbnailStripDisclosure();
            return;
        }
        thumbnailStripCollapsed = nextCollapsed;
        const panel = getNode("media-browser-panel");
        syncThumbnailStripDisclosure(panel);
        syncThumbnailPageButtons();
        applyImageViewState(imageViewState, { animate: false });
        if (!nextCollapsed) {
            revealActiveThumbnail();
        }
        if (persist) {
            persistPanelLayoutState(panel);
        }
    }

    function syncThumbnailDisclosureLevel(strip, panel = getNode("media-browser-panel")) {
        if (!isElementLike(strip)) return;
        const panelRect = panel?.getBoundingClientRect?.() || null;
        const level = resolveThumbnailDisclosureLevel({
            placement: thumbnailStripPlacement,
            stripSize: thumbnailStripHeight,
            panelWidth: Number(panelRect?.width) || getElementWidth(panel),
            panelHeight: Number(panelRect?.height) || getElementHeight(panel),
        });
        for (const candidate of THUMBNAIL_DISCLOSURE_LEVELS) {
            strip.classList?.toggle(
                `${THUMBNAIL_DISCLOSURE_LEVEL_CLASS_PREFIX}${candidate}`,
                candidate === level,
            );
        }
        strip.classList?.toggle("is-compact", level === "compact" || level === "minimal" || level === "media-only");
        strip.classList?.toggle("is-minimal", level === "minimal" || level === "media-only");
        if (strip.dataset) {
            strip.dataset.thumbnailDisclosureLevel = level;
        }
    }

    function applyThumbnailStripHeight(nextHeight = thumbnailStripHeight, {
        persist = false,
    } = {}) {
        const panel = getNode("media-browser-panel");
        if (!isElementLike(panel)) return;
        const constraints = resolveThumbnailStripConstraints(panel);
        const normalizedHeight = Number(nextHeight);
        thumbnailStripHeight = clamp(
            Math.round(Number.isFinite(normalizedHeight) ? normalizedHeight : THUMBNAIL_STRIP_DEFAULT_HEIGHT_PX),
            constraints.min,
            constraints.max,
        );
        const cssValue = `${thumbnailStripHeight}px`;
        const heightChanged = panel.style.getPropertyValue("--media-browser-thumbnail-strip-height") !== cssValue;
        const widthChanged = panel.style.getPropertyValue("--media-browser-thumbnail-strip-width") !== cssValue;
        if (heightChanged) {
            panel.style.setProperty("--media-browser-thumbnail-strip-height", cssValue);
        }
        if (widthChanged) {
            panel.style.setProperty("--media-browser-thumbnail-strip-width", cssValue);
        }

        const strip = panel.querySelector?.(".media-browser-panel__thumbnail-strip");
        syncThumbnailDisclosureLevel(strip, panel);
        syncThumbnailStripDisclosure(panel);

        const resizer = getNode("media-browser-thumbnail-resizer");
        if (resizer?.setAttribute) {
            resizer.setAttribute("aria-valuemin", String(Math.round(constraints.min)));
            resizer.setAttribute("aria-valuemax", String(Math.round(constraints.max)));
            resizer.setAttribute("aria-valuenow", String(Math.round(thumbnailStripHeight)));
        }
        if (persist) {
            persistPanelLayoutState(panel);
        }
        if (heightChanged || widthChanged) {
            applyImageViewState(imageViewState, { animate: false });
            revealActiveThumbnail();
        }
    }

    function stopThumbnailStripResize(event, panel, resizer) {
        if (
            !thumbnailResizeDragState
            || (event?.pointerId != null && thumbnailResizeDragState.pointerId !== event.pointerId)
        ) {
            return;
        }
        const pointerId = thumbnailResizeDragState.pointerId;
        thumbnailResizeDragState = null;
        panel?.classList?.remove("is-resizing-thumbnails");
        if (typeof resizer?.hasPointerCapture !== "function" || resizer.hasPointerCapture(pointerId)) {
            resizer?.releasePointerCapture?.(pointerId);
        }
        applyThumbnailStripHeight(thumbnailStripHeight, { persist: true });
    }

    function isThumbnailDisclosureTarget(target, resizer) {
        let node = target || null;
        while (node && node !== resizer) {
            if (node.id === "media-browser-thumbnail-collapse" || node.dataset?.thumbnailCollapse === "true") {
                return true;
            }
            node = node.parentNode || null;
        }
        return false;
    }

    function isThumbnailPlacementGrabTarget(target, resizer) {
        let node = target || null;
        while (node && node !== resizer) {
            if (node.id === "media-browser-thumbnail-placement-grab"
                || node.classList?.contains?.("media-browser-panel__thumbnail-placement-grab")) {
                return true;
            }
            node = node.parentNode || null;
        }
        return false;
    }

    function isThumbnailResizerControlTarget(target, resizer) {
        return isThumbnailDisclosureTarget(target, resizer) || isThumbnailPlacementGrabTarget(target, resizer);
    }

    function resolveThumbnailPlacementAtPoint(panel, clientX, clientY) {
        const rect = panel?.getBoundingClientRect?.() || null;
        if (!rect) return thumbnailStripPlacement;
        const distances = [
            ["left", Math.abs(clientX - rect.left)],
            ["right", Math.abs(clientX - rect.right)],
            ["top", Math.abs(clientY - rect.top)],
            ["bottom", Math.abs(clientY - rect.bottom)],
        ];
        distances.sort((a, b) => a[1] - b[1]);
        return distances[0]?.[0] || thumbnailStripPlacement;
    }

    function ensureThumbnailPlacementDropZones(panel = getNode("media-browser-panel")) {
        if (!isElementLike(panel)) return;
        for (const side of THUMBNAIL_STRIP_PLACEMENTS) {
            if (panel.querySelector?.(`.media-browser-panel__thumbnail-drop-zone--${side}`)) continue;
            const zone = createElement("div");
            if (!zone) continue;
            zone.className = [
                "media-browser-panel__thumbnail-drop-zone",
                `media-browser-panel__thumbnail-drop-zone--${side}`,
            ].join(" ");
            zone.dataset.thumbnailDropSide = side;
            zone.setAttribute("aria-hidden", "true");
            panel.appendChild(zone);
        }
    }

    function syncThumbnailPlacementDropTarget(panel, targetPlacement = "") {
        if (!isElementLike(panel)) return;
        const placement = normalizeThumbnailStripPlacement(targetPlacement || thumbnailStripPlacement);
        panel.dataset.thumbnailDropTarget = placement;
        const zones = panel.querySelectorAll?.(".media-browser-panel__thumbnail-drop-zone") || [];
        zones.forEach?.((zone) => {
            zone.classList?.toggle("is-target", zone.dataset?.thumbnailDropSide === placement);
        });
    }

    function finishThumbnailPlacementDrag(event, panel, grab) {
        if (
            !thumbnailPlacementDragState
            || (event?.pointerId != null && thumbnailPlacementDragState.pointerId !== event.pointerId)
        ) {
            return;
        }
        const nextPlacement = thumbnailPlacementDragState.targetPlacement || thumbnailStripPlacement;
        const pointerId = thumbnailPlacementDragState.pointerId;
        thumbnailPlacementDragState = null;
        panel?.classList?.remove("is-placing-thumbnails");
        panel?.querySelectorAll?.(".media-browser-panel__thumbnail-placement-grab")?.forEach?.((node) => {
            node?.setAttribute?.("aria-grabbed", "false");
        });
        if (typeof grab?.hasPointerCapture !== "function" || grab.hasPointerCapture(pointerId)) {
            grab?.releasePointerCapture?.(pointerId);
        }
        setThumbnailStripPlacement(nextPlacement, { persist: true });
        event?.preventDefault?.();
    }

    function bindThumbnailStripResizer() {
        const panel = getNode("media-browser-panel");
        const resizer = getNode("media-browser-thumbnail-resizer");
        if (!isElementLike(panel) || !isElementLike(resizer)) return;
        ensureThumbnailPlacementDropZones(panel);
        syncThumbnailStripPlacement(panel);

        const collapseButtons = getThumbnailCollapseButtons(panel);
        const placementGrabs = Array.from(panel.querySelectorAll?.(".media-browser-panel__thumbnail-placement-grab") || []);
        collapseButtons.forEach((collapseButton) => collapseButton?.addEventListener?.("click", (event) => {
            event?.preventDefault?.();
            event?.stopPropagation?.();
            setThumbnailStripCollapsed(thumbnailStripCollapsed !== true, { persist: true });
        }));

        resizer.addEventListener("click", (event) => {
            if (thumbnailStripCollapsed !== true || isThumbnailResizerControlTarget(event.target, resizer)) return;
            event?.preventDefault?.();
            setThumbnailStripCollapsed(false, { persist: true });
        });

        resizer.addEventListener("pointerdown", (event) => {
            if (event.button !== 0) return;
            if (thumbnailStripCollapsed === true || isThumbnailResizerControlTarget(event.target, resizer)) return;
            thumbnailResizeDragState = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                startHeight: thumbnailStripHeight,
                placement: thumbnailStripPlacement,
            };
            panel.classList.add("is-resizing-thumbnails");
            resizer.setPointerCapture?.(event.pointerId);
            event.preventDefault();
        });

        resizer.addEventListener("pointermove", (event) => {
            if (!thumbnailResizeDragState || thumbnailResizeDragState.pointerId !== event.pointerId) return;
            const placement = normalizeThumbnailStripPlacement(thumbnailResizeDragState.placement);
            let delta = 0;
            if (placement === "top") {
                delta = event.clientY - thumbnailResizeDragState.startY;
            } else if (placement === "bottom") {
                delta = thumbnailResizeDragState.startY - event.clientY;
            } else if (placement === "left") {
                delta = event.clientX - thumbnailResizeDragState.startX;
            } else {
                delta = thumbnailResizeDragState.startX - event.clientX;
            }
            applyThumbnailStripHeight(thumbnailResizeDragState.startHeight + delta, { persist: false });
        });

        resizer.addEventListener("pointerup", (event) => stopThumbnailStripResize(event, panel, resizer));
        resizer.addEventListener("pointercancel", (event) => stopThumbnailStripResize(event, panel, resizer));

        const handlePlacementPointerDown = (event) => {
            if (event.button !== 0 || thumbnailStripCollapsed === true) return;
            thumbnailPlacementDragState = {
                pointerId: event.pointerId,
                targetPlacement: thumbnailStripPlacement,
            };
            panel.classList.add("is-placing-thumbnails");
            syncThumbnailPlacementDropTarget(panel, thumbnailStripPlacement);
            placementGrabs.forEach((grab) => grab?.setAttribute?.("aria-grabbed", "true"));
            event.currentTarget?.setPointerCapture?.(event.pointerId);
            event.preventDefault();
            event.stopPropagation();
        };

        const handlePlacementPointerMove = (event) => {
            if (!thumbnailPlacementDragState || thumbnailPlacementDragState.pointerId !== event.pointerId) return;
            const targetPlacement = resolveThumbnailPlacementAtPoint(panel, event.clientX, event.clientY);
            thumbnailPlacementDragState.targetPlacement = targetPlacement;
            syncThumbnailPlacementDropTarget(panel, targetPlacement);
            event.preventDefault();
        };

        const handlePlacementKeydown = (event) => {
            const keyPlacements = {
                ArrowLeft: "left",
                ArrowRight: "right",
                ArrowUp: "top",
                ArrowDown: "bottom",
            };
            const nextPlacement = keyPlacements[event.key];
            if (!nextPlacement) return;
            event.preventDefault();
            setThumbnailStripPlacement(nextPlacement, { persist: true });
        };

        placementGrabs.forEach((placementGrab) => {
            placementGrab?.addEventListener?.("pointerdown", handlePlacementPointerDown);
            placementGrab?.addEventListener?.("pointermove", handlePlacementPointerMove);
            placementGrab?.addEventListener?.(
                "pointerup",
                (event) => finishThumbnailPlacementDrag(event, panel, event.currentTarget),
            );
            placementGrab?.addEventListener?.(
                "pointercancel",
                (event) => finishThumbnailPlacementDrag(event, panel, event.currentTarget),
            );
            placementGrab?.addEventListener?.("keydown", handlePlacementKeydown);
        });

        resizer.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setThumbnailStripCollapsed(thumbnailStripCollapsed !== true, { persist: true });
                return;
            }
            if (thumbnailStripCollapsed === true) return;
            const constraints = resolveThumbnailStripConstraints(panel);
            const step = event.shiftKey ? THUMBNAIL_STRIP_KEYBOARD_LARGE_STEP_PX : THUMBNAIL_STRIP_KEYBOARD_STEP_PX;
            let nextHeight = null;
            const placement = thumbnailStripPlacement;
            if ((placement === "bottom" && event.key === "ArrowDown")
                || (placement === "top" && event.key === "ArrowUp")
                || (placement === "left" && event.key === "ArrowLeft")
                || (placement === "right" && event.key === "ArrowRight")) {
                nextHeight = thumbnailStripHeight - step;
            } else if ((placement === "bottom" && event.key === "ArrowUp")
                || (placement === "top" && event.key === "ArrowDown")
                || (placement === "left" && event.key === "ArrowRight")
                || (placement === "right" && event.key === "ArrowLeft")) {
                nextHeight = thumbnailStripHeight + step;
            } else if (event.key === "PageDown") {
                nextHeight = thumbnailStripHeight - THUMBNAIL_STRIP_KEYBOARD_LARGE_STEP_PX;
            } else if (event.key === "PageUp") {
                nextHeight = thumbnailStripHeight + THUMBNAIL_STRIP_KEYBOARD_LARGE_STEP_PX;
            } else if (event.key === "Home") {
                nextHeight = constraints.min;
            } else if (event.key === "End") {
                nextHeight = constraints.max;
            }
            if (nextHeight == null) return;
            event.preventDefault();
            applyThumbnailStripHeight(nextHeight, { persist: true });
        });

        applyThumbnailStripHeight(thumbnailStripHeight);
    }

    function stopThumbnailScrollerDrag(event, host) {
        if (
            !thumbnailScrollerDragState
            || (event?.pointerId != null && thumbnailScrollerDragState.pointerId !== event.pointerId)
        ) {
            return;
        }
        const didDrag = thumbnailScrollerDragState.didDrag === true;
        const pointerId = thumbnailScrollerDragState.pointerId;
        thumbnailScrollerDragState = null;
        host?.classList?.remove("is-drag-ready", "is-dragging");
        if (typeof host?.hasPointerCapture !== "function" || host.hasPointerCapture(pointerId)) {
            host?.releasePointerCapture?.(pointerId);
        }
        if (didDrag) {
            suppressThumbnailClick = true;
            event?.preventDefault?.();
            getWindowRef()?.setTimeout?.(() => {
                suppressThumbnailClick = false;
            }, 120);
        }
    }

    function bindThumbnailStripDragging() {
        const host = getNode("media-browser-thumbnail-list");
        if (!isElementLike(host)) return;
        const documentRef = getDocumentRef();

        host.addEventListener("pointerdown", (event) => {
            if (event.button !== 0) return;
            const vertical = isThumbnailStripVertical();
            const canScroll = vertical
                ? Number(host.scrollHeight) > Number(host.clientHeight)
                : Number(host.scrollWidth) > Number(host.clientWidth);
            if (!canScroll) return;
            thumbnailScrollerDragState = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                scrollLeft: Number(host.scrollLeft) || 0,
                scrollTop: Number(host.scrollTop) || 0,
                vertical,
                didDrag: false,
            };
            host.classList.add("is-drag-ready");
        });

        const handlePointerMove = (event) => {
            if (!thumbnailScrollerDragState || thumbnailScrollerDragState.pointerId !== event.pointerId) return;
            const deltaX = event.clientX - thumbnailScrollerDragState.startX;
            const deltaY = event.clientY - thumbnailScrollerDragState.startY;
            if (
                thumbnailScrollerDragState.didDrag !== true
                && Math.hypot(deltaX, deltaY) < THUMBNAIL_SCROLLER_DRAG_THRESHOLD_PX
            ) {
                return;
            }
            if (thumbnailScrollerDragState.didDrag !== true) {
                thumbnailScrollerDragState.didDrag = true;
                thumbnailPagingTargetScrollLeft = null;
                host.classList.add("is-dragging");
                host.setPointerCapture?.(event.pointerId);
            }
            if (thumbnailScrollerDragState.vertical === true) {
                host.scrollTop = thumbnailScrollerDragState.scrollTop - deltaY;
            } else {
                host.scrollLeft = thumbnailScrollerDragState.scrollLeft - deltaX;
            }
            event.preventDefault();
        };

        documentRef?.addEventListener?.("pointermove", handlePointerMove, true);
        documentRef?.addEventListener?.("pointerup", (event) => stopThumbnailScrollerDrag(event, host), true);
        documentRef?.addEventListener?.("pointercancel", (event) => stopThumbnailScrollerDrag(event, host), true);
        host.addEventListener("lostpointercapture", (event) => stopThumbnailScrollerDrag(event, host));
        host.addEventListener("click", (event) => {
            if (suppressThumbnailClick !== true) return;
            suppressThumbnailClick = false;
            event.preventDefault();
            event.stopPropagation();
        }, true);
    }

    function getThumbnailPageStep(host) {
        const size = isThumbnailStripVertical()
            ? Number(host?.clientHeight)
            : Number(host?.clientWidth);
        if (!Number.isFinite(size) || size <= 0) return 0;
        return Math.max(1, Math.floor(size - 32));
    }

    function getThumbnailMaxScroll(host) {
        if (!host) return 0;
        const vertical = isThumbnailStripVertical();
        const clientSize = vertical ? Number(host.clientHeight) : Number(host.clientWidth);
        const scrollSize = vertical ? Number(host.scrollHeight) : Number(host.scrollWidth);
        let maxScroll = Number.isFinite(scrollSize) && Number.isFinite(clientSize)
            ? scrollSize - clientSize
            : 0;
        const children = Array.from(host.children || []);
        const lastChild = children.at(-1);
        const lastChildEnd = vertical
            ? Number(lastChild?.offsetTop) + Number(lastChild?.offsetHeight)
            : Number(lastChild?.offsetLeft) + Number(lastChild?.offsetWidth);
        if (Number.isFinite(lastChildEnd) && Number.isFinite(clientSize)) {
            maxScroll = Math.max(maxScroll, lastChildEnd - clientSize);
        }
        return Math.max(0, maxScroll);
    }

    function getEffectiveThumbnailScroll(host) {
        if (thumbnailPagingTargetScrollLeft != null) {
            const target = Number(thumbnailPagingTargetScrollLeft);
            if (Number.isFinite(target)) return target;
        }
        return isThumbnailStripVertical()
            ? Number(host?.scrollTop) || 0
            : Number(host?.scrollLeft) || 0;
    }

    function syncThumbnailPageButtons() {
        const host = getNode("media-browser-thumbnail-list");
        const previousButton = getNode("media-browser-thumbnail-prev");
        const nextButton = getNode("media-browser-thumbnail-next");
        const maxScroll = getThumbnailMaxScroll(host);
        const scrollPosition = clamp(getEffectiveThumbnailScroll(host), 0, maxScroll);
        const canScroll = maxScroll > 1;
        if (previousButton) {
            previousButton.disabled = !canScroll || scrollPosition <= 1;
        }
        if (nextButton) {
            nextButton.disabled = !canScroll || scrollPosition >= maxScroll - 1;
        }
    }

    function scrollThumbnailPage(direction) {
        const host = getNode("media-browser-thumbnail-list");
        if (!host) return;
        const step = getThumbnailPageStep(host);
        if (step <= 0) return;
        const vertical = isThumbnailStripVertical();
        const maxScroll = getThumbnailMaxScroll(host);
        const currentScroll = clamp(getEffectiveThumbnailScroll(host), 0, maxScroll);
        const nextScroll = clamp(currentScroll + (direction < 0 ? -step : step), 0, maxScroll);
        thumbnailPagingTargetScrollLeft = nextScroll;
        try {
            if (typeof host.scrollTo === "function") {
                host.scrollTo({
                    left: vertical ? Number(host.scrollLeft) || 0 : nextScroll,
                    top: vertical ? nextScroll : Number(host.scrollTop) || 0,
                    behavior: "smooth",
                });
            } else {
                if (vertical) host.scrollTop = nextScroll;
                else host.scrollLeft = nextScroll;
            }
        } catch {
            if (vertical) host.scrollTop = nextScroll;
            else host.scrollLeft = nextScroll;
        }
        getWindowRef()?.requestAnimationFrame?.(syncThumbnailPageButtons);
        getWindowRef()?.setTimeout?.(syncThumbnailPageButtons, 160);
    }

    function handleThumbnailScroll() {
        const host = getNode("media-browser-thumbnail-list");
        const target = thumbnailPagingTargetScrollLeft == null
            ? Number.NaN
            : Number(thumbnailPagingTargetScrollLeft);
        const currentScroll = isThumbnailStripVertical()
            ? Number(host?.scrollTop) || 0
            : Number(host?.scrollLeft) || 0;
        if (host && Number.isFinite(target) && Math.abs(currentScroll - target) <= 1) {
            thumbnailPagingTargetScrollLeft = null;
        }
        syncThumbnailPageButtons();
    }

    function bindThumbnailPageButtons() {
        const host = getNode("media-browser-thumbnail-list");
        const previousButton = getNode("media-browser-thumbnail-prev");
        const nextButton = getNode("media-browser-thumbnail-next");
        previousButton?.addEventListener?.("click", () => scrollThumbnailPage(-1));
        nextButton?.addEventListener?.("click", () => scrollThumbnailPage(1));
        host?.addEventListener?.("scroll", handleThumbnailScroll, { passive: true });
        syncThumbnailPageButtons();
    }

    function resolveExpandedPanelRect() {
        const documentRef = getDocumentRef();
        const headerRect = documentRef?.querySelector?.(".header")?.getBoundingClientRect?.() || null;
        const controlTop = getVisibleElementTopPx("#control-panel");
        const timelineTop = getVisibleElementTopPx(".timeline-dock");
        const boundaryTop = Math.min(
            Number.isFinite(controlTop) ? controlTop : Infinity,
            Number.isFinite(timelineTop) ? timelineTop : Infinity,
        );
        const left = PANEL_EDGE_MARGIN_PX;
        const top = Number.isFinite(headerRect?.bottom)
            ? Math.round(headerRect.bottom + PANEL_EDGE_MARGIN_PX)
            : PANEL_EDGE_MARGIN_PX;
        const right = getViewportWidth() - PANEL_EDGE_MARGIN_PX;
        const bottom = Number.isFinite(boundaryTop)
            ? Math.round(boundaryTop - PANEL_TRANSPORT_CLEARANCE_PX)
            : (getViewportHeight() - PANEL_EDGE_MARGIN_PX);
        return {
            x: left,
            y: top,
            width: Math.max(360, right - left),
            height: Math.max(280, bottom - top),
        };
    }

    function applyExpandedPanelRect(panel = getNode("media-browser-panel")) {
        if (!isElementLike(panel)) return;
        const rect = resolveExpandedPanelRect();
        panel.style.width = `${rect.width}px`;
        panel.style.height = `${rect.height}px`;
        applyPanelPosition(panel, rect.x, rect.y);
    }

    function syncExpandButton(button = getNode("media-browser-panel-expand")) {
        if (!isElementLike(button)) return;
        button.dataset.icon = panelExpanded === true ? "restore" : "expand";
        button.textContent = "";
        button.title = panelExpanded === true ? "Restore" : "Expand";
        button.setAttribute("aria-label", button.title);
        button.setAttribute("aria-pressed", panelExpanded === true ? "true" : "false");
    }

    function isImageViewAvailable() {
        const image = getNode("media-browser-image");
        return isImageLike(image) && image.hidden !== true && !!imageViewAssetUrl;
    }

    function syncImageViewControls() {
        const stage = getNode("media-browser-stage");
        const controls = getNode("media-browser-image-controls");
        const zoomOutButton = getNode("media-browser-image-zoom-out");
        const zoomInButton = getNode("media-browser-image-zoom-in");
        const resetButton = getNode("media-browser-image-reset");
        const zoomLabel = getNode("media-browser-image-zoom-label");
        const available = isImageViewAvailable();
        const isZoomed = imageViewState.zoom > MEDIA_IMAGE_MIN_ZOOM;

        if (controls) {
            controls.hidden = !available;
        }
        if (zoomLabel) {
            zoomLabel.textContent = `${Math.round(imageViewState.zoom * 100)}%`;
        }
        if (zoomOutButton) {
            zoomOutButton.disabled = !available || imageViewState.zoom <= MEDIA_IMAGE_MIN_ZOOM;
        }
        if (zoomInButton) {
            zoomInButton.disabled = !available || imageViewState.zoom >= MEDIA_IMAGE_MAX_ZOOM;
        }
        if (resetButton) {
            resetButton.disabled = !available || (
                !isZoomed
                && imageViewState.panX === 0
                && imageViewState.panY === 0
            );
        }
        if (isElementLike(stage)) {
            stage.classList.toggle("is-pan-enabled", available && isZoomed);
            stage.classList.toggle("is-panning", imagePanDragState != null);
        }
    }

    function applyImageViewState(nextState, {
        animate = true,
    } = {}) {
        imageViewState = clampMediaImagePan(nextState, getImageStageSize());
        const image = getNode("media-browser-image");
        if (isImageLike(image)) {
            image.style.transition = animate ? "" : "none";
            image.style.transform = `translate3d(${imageViewState.panX}px, ${imageViewState.panY}px, 0) scale(${imageViewState.zoom})`;
            if (!animate && imagePanDragState == null) {
                getWindowRef()?.requestAnimationFrame?.(() => {
                    image.style.transition = "";
                });
            }
        }
        syncImageViewControls();
    }

    function resetImageView(options = {}) {
        imagePanDragState = null;
        applyImageViewState(createDefaultMediaImageViewState(), options);
    }

    function zoomImageView(zoomMultiplier) {
        if (!isImageViewAvailable()) return;
        applyImageViewState(zoomMediaImageViewState(
            imageViewState,
            zoomMultiplier,
            getImageStageSize(),
        ));
    }

    function shouldIgnoreImageGesture(event) {
        if (!isObjectLike(event?.target)) return false;
        if (typeof event.target.closest !== "function") return false;
        return !!event.target.closest("button, input, select, option, label, output, a, summary, details");
    }

    function bindImageViewControls() {
        const stage = getNode("media-browser-stage");
        const zoomOutButton = getNode("media-browser-image-zoom-out");
        const zoomInButton = getNode("media-browser-image-zoom-in");
        const resetButton = getNode("media-browser-image-reset");

        zoomOutButton?.addEventListener?.("click", () => zoomImageView(1 / MEDIA_IMAGE_ZOOM_STEP));
        zoomInButton?.addEventListener?.("click", () => zoomImageView(MEDIA_IMAGE_ZOOM_STEP));
        resetButton?.addEventListener?.("click", () => resetImageView());

        stage?.addEventListener?.("wheel", (event) => {
            if (!isImageViewAvailable()) return;
            const deltaY = Number(event.deltaY);
            if (!Number.isFinite(deltaY) || deltaY === 0) return;
            event.preventDefault();
            zoomImageView(deltaY < 0 ? MEDIA_IMAGE_ZOOM_STEP : 1 / MEDIA_IMAGE_ZOOM_STEP);
        }, { passive: false });

        stage?.addEventListener?.("pointerdown", (event) => {
            if (!isImageViewAvailable() || imageViewState.zoom <= MEDIA_IMAGE_MIN_ZOOM) return;
            if (event.button !== 0 || shouldIgnoreImageGesture(event)) return;
            imagePanDragState = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                panX: imageViewState.panX,
                panY: imageViewState.panY,
            };
            stage.setPointerCapture?.(event.pointerId);
            syncImageViewControls();
            event.preventDefault();
        });

        stage?.addEventListener?.("pointermove", (event) => {
            if (!imagePanDragState || imagePanDragState.pointerId !== event.pointerId) return;
            applyImageViewState({
                zoom: imageViewState.zoom,
                panX: imagePanDragState.panX + (event.clientX - imagePanDragState.startX),
                panY: imagePanDragState.panY + (event.clientY - imagePanDragState.startY),
            }, { animate: false });
        });

        const releasePan = (event) => {
            if (!imagePanDragState || imagePanDragState.pointerId !== event.pointerId) return;
            stage.releasePointerCapture?.(event.pointerId);
            imagePanDragState = null;
            applyImageViewState(imageViewState, { animate: false });
        };

        stage?.addEventListener?.("pointerup", releasePan);
        stage?.addEventListener?.("pointercancel", releasePan);
        syncImageViewControls();
    }

    function syncFilterDrawerPlacement() {
        const panel = getNode("media-browser-panel");
        const drawer = getNode("media-browser-filter-drawer");
        if (!isElementLike(drawer)) return;
        if (
            filterDrawerOpen !== true ||
            !isElementLike(panel) ||
            panel.classList.contains("media-browser-panel--hidden")
        ) {
            drawer.hidden = true;
            panel?.classList?.remove?.("media-browser-panel--filters-open");
            return;
        }

        const panelRect = panel.getBoundingClientRect?.();
        if (!panelRect || !Number.isFinite(panelRect.width) || panelRect.width <= 0) {
            drawer.hidden = true;
            panel.classList.remove("media-browser-panel--filters-open");
            return;
        }

        const viewportWidth = getViewportWidth();
        const viewportHeight = getViewportHeight();
        const width = Math.min(
            Math.round(panelRect.width),
            Math.max(PANEL_MIN_WIDTH_PX, viewportWidth - (PANEL_EDGE_MARGIN_PX * 2)),
        );
        const left = clamp(
            Math.round(panelRect.left),
            PANEL_EDGE_MARGIN_PX,
            Math.max(PANEL_EDGE_MARGIN_PX, viewportWidth - width - PANEL_EDGE_MARGIN_PX),
        );
        const preferredMaxHeight = Math.min(260, Math.max(120, viewportHeight - (PANEL_EDGE_MARGIN_PX * 2)));
        const availableAbove = Math.max(0, Math.round(panelRect.top) - PANEL_EDGE_MARGIN_PX + 1);
        const maxHeight = availableAbove >= 112
            ? Math.min(preferredMaxHeight, availableAbove)
            : Math.min(preferredMaxHeight, Math.max(160, Math.round((panelRect.height || 360) * 0.45)));

        drawer.hidden = false;
        panel.classList.add("media-browser-panel--filters-open");
        drawer.style.left = `${left}px`;
        drawer.style.width = `${width}px`;
        drawer.style.maxHeight = `${Math.round(maxHeight)}px`;

        const measuredHeight = Math.min(
            Math.round(drawer.getBoundingClientRect?.().height || drawer.offsetHeight || maxHeight),
            maxHeight,
        );
        const opensAbove = availableAbove >= 112;
        const top = opensAbove
            ? Math.round(panelRect.top - measuredHeight + 1)
            : Math.round(Math.min(
                viewportHeight - measuredHeight - PANEL_EDGE_MARGIN_PX,
                panelRect.top + 34,
            ));
        drawer.style.top = `${clamp(
            top,
            PANEL_EDGE_MARGIN_PX,
            Math.max(PANEL_EDGE_MARGIN_PX, viewportHeight - measuredHeight - PANEL_EDGE_MARGIN_PX),
        )}px`;
    }

    function setFilterDrawerOpen(open) {
        const nextOpen = open === true;
        if (filterDrawerOpen === nextOpen) {
            syncMediaFilterToggle();
            syncFilterDrawerPlacement();
            return;
        }
        filterDrawerOpen = nextOpen;
        syncMediaFilterToggle();
        syncFilterDrawerPlacement();
    }

    function syncDrilldownFlyoutPlacement() {
        const panel = getNode("media-browser-panel");
        const drilldown = getNode("media-browser-drilldown");
        const flyout = getNode("media-browser-drilldown-body");
        if (!isElementLike(flyout)) return;
        if (
            !isElementLike(panel)
            || !isElementLike(drilldown)
            || drilldown.open !== true
            || panel.classList.contains("media-browser-panel--hidden")
        ) {
            flyout.hidden = true;
            panel?.classList?.remove("media-browser-panel--drilldown-open");
            return;
        }

        const panelRect = panel.getBoundingClientRect();
        if (!Number.isFinite(panelRect.width) || panelRect.width <= 0 || panelRect.height <= 0) {
            flyout.hidden = true;
            panel.classList.remove("media-browser-panel--drilldown-open");
            return;
        }

        const viewportWidth = getViewportWidth();
        const viewportHeight = getViewportHeight();
        const maxWidth = Math.max(DRILLDOWN_DRAWER_MIN_WIDTH_PX, viewportWidth - (PANEL_EDGE_MARGIN_PX * 2));
        const availableRight = Math.max(DRILLDOWN_DRAWER_MIN_WIDTH_PX, viewportWidth - panelRect.right - PANEL_EDGE_MARGIN_PX);
        const flyoutWidth = Math.min(DRILLDOWN_DRAWER_WIDTH_PX, maxWidth, availableRight);
        const maxLeft = Math.max(PANEL_EDGE_MARGIN_PX, viewportWidth - flyoutWidth - PANEL_EDGE_MARGIN_PX);
        const desiredLeft = Math.round(panelRect.right) - 1;
        const top = clamp(
            Math.round(panelRect.top),
            PANEL_EDGE_MARGIN_PX,
            Math.max(PANEL_EDGE_MARGIN_PX, viewportHeight - DRILLDOWN_DRAWER_MIN_HEIGHT_PX),
        );
        const height = clamp(
            Math.round(panelRect.height || getPanelDefaultHeightPx()),
            DRILLDOWN_DRAWER_MIN_HEIGHT_PX,
            Math.max(DRILLDOWN_DRAWER_MIN_HEIGHT_PX, viewportHeight - top - PANEL_EDGE_MARGIN_PX),
        );

        flyout.hidden = false;
        panel.classList.add("media-browser-panel--drilldown-open");
        flyout.style.left = `${Math.round(clamp(desiredLeft, PANEL_EDGE_MARGIN_PX, maxLeft))}px`;
        flyout.style.top = `${Math.round(top)}px`;
        flyout.style.width = `${Math.round(flyoutWidth)}px`;
        flyout.style.height = `${Math.round(height)}px`;
    }

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
            if (panelExpanded === true) return;
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
            if (event.button !== 0 || panelExpanded === true) return;
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

    function confirmDeletePanel() {
        const confirmFn = globalThis?.confirm;
        if (typeof confirmFn === "function") {
            const accepted = confirmFn(
                'Delete "Mission Media" from this mission layout? You can add it back from the Panels menu.',
            );
            if (!accepted) return false;
        }
        setPanelState("deleted");
        return true;
    }

    function syncPanelRegistry() {
        const panelStateName = getPanelRegistryState();
        updateMissionPanel(MEDIA_BROWSER_PANEL_ID, {
            id: MEDIA_BROWSER_PANEL_ID,
            title: panelTitle,
            kind: "workflow",
            panelType: "media-browser",
            builtIn: true,
            available: panelAvailable,
            state: panelStateName,
            sortOrder: 45,
            infoItems: [
                { label: "Panel Kind", value: "Media browser workflow" },
                { label: "Mission", value: missionLabel || "Current mission" },
                { label: "Visible Items", value: mediaCountLabel },
            ],
            actions: {
                open: () => setPanelState("open"),
                restore: () => setPanelState("open"),
                focus: panelStateName === "open"
                    ? () => setPanelState("open")
                    : undefined,
                close: panelStateName === "open"
                    ? () => setPanelState("closed")
                    : undefined,
                delete: panelStateName !== "deleted"
                    ? () => confirmDeletePanel()
                    : undefined,
            },
        });
    }

    function syncPanelAvailability() {
        panelAvailable = panelAvailableForMission && shouldAllowMediaBrowserPanel();
        const wrapper = getNode("media-browser-panel-wrapper");
        if (isElementLike(wrapper)) {
            wrapper.hidden = !panelAvailable;
        }
        const panel = getNode("media-browser-panel");
        if (!isElementLike(panel) || panelAvailable) {
            syncPanelRegistry();
            return;
        }
        panelVisibilityState = "closed";
        panel.classList.add("media-browser-panel--hidden");
        setFilterDrawerOpen(false);
        syncDrilldownFlyoutPlacement();
        syncPanelRegistry();
    }

    function applyConfiguredDefaultPanelState() {
        if (
            !missionConfigData ||
            hasRestoredPanelVisibilityState === true ||
            defaultPanelStateApplied === true
        ) {
            return;
        }
        const defaultState = getMissionPanelDefaultState(
            missionConfigData,
            MEDIA_BROWSER_PANEL_ID,
            { fallbackState: "closed" },
        );
        defaultPanelStateApplied = true;
        setPanelState(defaultState);
    }

    function setPanelExpanded(expanded, panel = getNode("media-browser-panel")) {
        if (!isElementLike(panel)) return;
        if (isMediaPanelDocked(panel)) {
            panelExpanded = false;
            panel.classList.remove("is-maximized");
            syncExpandButton();
            return;
        }
        const nextExpanded = expanded === true;
        if (nextExpanded === panelExpanded) {
            syncExpandButton();
            return;
        }
        if (nextExpanded) {
            restorePanelFrame = capturePanelFrame(panel);
            panelExpanded = true;
            panel.classList.add("is-maximized");
            applyExpandedPanelRect(panel);
        } else {
            panelExpanded = false;
            panel.classList.remove("is-maximized");
            if (restorePanelFrame && restorePanelFrame.width > 0 && restorePanelFrame.height > 0) {
                panel.style.width = `${restorePanelFrame.width}px`;
                panel.style.height = `${restorePanelFrame.height}px`;
                applyPanelPosition(panel, restorePanelFrame.x, restorePanelFrame.y);
            } else {
                ensurePanelPosition(panel);
            }
        }
        syncFilterDrawerPlacement();
        syncDrilldownFlyoutPlacement();
        syncExpandButton();
        applyThumbnailStripHeight(thumbnailStripHeight);
        scheduleActiveThumbnailReveal();
        persistPanelLayoutState(panel);
    }

    function setPanelState(nextState) {
        const resolvedState = nextState === "minimized"
            ? "closed"
            : (nextState === "deleted"
                ? "deleted"
                : (nextState === "open" ? "open" : "closed"));
        if (resolvedState === "open" && (!panelAvailable || !shouldAllowMediaBrowserPanel())) {
            syncPanelAvailability();
            return;
        }
        panelVisibilityState = resolvedState;
        dispatchDocumentCustomEvent("mission-media-panel-state", {
            state: resolvedState,
            isOpen: resolvedState === "open",
        });
        const panel = getNode("media-browser-panel");
        if (!isElementLike(panel)) return;
        const isVisible = resolvedState === "open";
        if (isDockviewMediaPanelEnabled()) {
            if (isVisible) {
                ensureMediaPanelDocked(panel);
            } else if (isMediaPanelDocked(panel)) {
                closeDockedMediaPanel();
            }
        }
        panel.classList.toggle("media-browser-panel--hidden", !isVisible);
        syncPanelRegistry();
        if (!isVisible) {
            setFilterDrawerOpen(false);
            syncDrilldownFlyoutPlacement();
            persistPanelLayoutState(panel);
            return;
        }
        if (isMediaPanelDocked(panel)) {
            panelExpanded = false;
            panel.classList.remove("is-maximized");
            syncFilterDrawerPlacement();
            syncDrilldownFlyoutPlacement();
            applyThumbnailStripHeight(thumbnailStripHeight);
            applyImageViewState(imageViewState, { animate: false });
            scheduleActiveThumbnailReveal();
            persistPanelLayoutState(panel);
            return;
        }
        bringPanelToFront();
        if (panelExpanded === true) {
            panel.classList.add("is-maximized");
            applyExpandedPanelRect(panel);
        } else {
            panel.classList.remove("is-maximized");
            ensurePanelPosition(panel);
            if (defaultLayoutManaged !== false) {
                requestAuxiliaryPanelLayout();
            }
        }
        syncFilterDrawerPlacement();
        syncDrilldownFlyoutPlacement();
        syncExpandButton();
        applyThumbnailStripHeight(thumbnailStripHeight);
        scheduleActiveThumbnailReveal();
        persistPanelLayoutState(panel);
    }

    function appendFilterButton(host, option, intentType, variant = "") {
        const button = createElement("button");
        if (!button) return;
        const count = Number(option?.count);
        button.type = "button";
        button.className = [
            "media-browser-panel__filter-button",
            variant ? `media-browser-panel__filter-button--${variant}` : "",
            option?.active ? "is-active" : "",
        ].filter(Boolean).join(" ");
        if (button.dataset) {
            button.dataset.filterId = option?.id || "";
        }
        button.textContent = option?.label || option?.id || "Filter";
        button.disabled = Number.isFinite(count) && count <= 0 && option?.active !== true && option?.id !== "all";
        button.setAttribute("aria-pressed", option?.active ? "true" : "false");
        button.title = [
            option?.title,
            Number.isFinite(count) ? `${count} matching items` : "",
        ].filter(Boolean).join(" - ");
        button.addEventListener("click", () => {
            onIntent?.({ type: intentType, value: option?.id });
        });
        host.appendChild(button);
    }

    function appendFilterFacetGroup(host, label, options, intentType, variant = "") {
        const filteredOptions = (Array.isArray(options) ? options : []).filter(Boolean);
        if (!filteredOptions.length) return;
        const group = createElement("div");
        const groupLabel = createElement("span");
        const buttons = createElement("div");
        if (!group || !groupLabel || !buttons) return;
        group.className = [
            "media-browser-panel__filter-facet",
            variant ? `media-browser-panel__filter-facet--${variant}` : "",
        ].filter(Boolean).join(" ");
        group.setAttribute("role", "group");
        group.setAttribute("aria-label", label);
        groupLabel.className = "media-browser-panel__filter-facet-label";
        groupLabel.textContent = label;
        buttons.className = "media-browser-panel__filter-facet-buttons";
        group.appendChild(groupLabel);
        group.appendChild(buttons);
        filteredOptions.forEach((option) => appendFilterButton(buttons, option, intentType, variant));
        host.appendChild(group);
    }

    function renderMediaFilterControls(filterModel) {
        const host = getNode("media-browser-filter-bar");
        if (!host) return;
        const nextSignature = JSON.stringify({
            kindPillOptions: filterModel?.kindPillOptions || [],
            subjectOptions: filterModel?.subjectOptions || filterModel?.quickOptions || [],
            cameraButtonOptions: filterModel?.cameraButtonOptions || [],
        });
        if (nextSignature === filterSignature) {
            return;
        }
        filterSignature = nextSignature;
        if (typeof host.replaceChildren === "function") {
            host.replaceChildren();
        } else {
            host.innerHTML = "";
        }

        const kindPillOptions = filterModel?.kindPillOptions || [];
        appendFilterFacetGroup(host, "Type", kindPillOptions, "toggleMediaKind", "kind-pill");

        const subjectOptions = filterModel?.subjectOptions || filterModel?.quickOptions || [];
        appendFilterFacetGroup(host, "Subject", subjectOptions, "toggleSubject", "subject");

        const cameraOptions = filterModel?.cameraButtonOptions || [];
        appendFilterFacetGroup(host, "Camera", cameraOptions, "toggleCameraFilter", "camera");
    }

    function syncMediaSearchControl(filterModel = {}) {
        const input = getNode("media-browser-search");
        if (!input) return;
        const query = String(filterModel.query || "").trim();
        if (input.value !== query) {
            input.value = query;
        }
        input.title = query ? `Searching media metadata for "${query}"` : "Search media metadata";
    }

    function syncVideoPopoutButton({ hasVideo = false } = {}) {
        const button = getNode("media-browser-media-popout");
        const video = getNode("media-browser-video");
        if (!button) return;
        const supported = hasVideo === true && isPictureInPictureSupported(video);
        button.hidden = !supported;
        button.disabled = !supported;
        const poppedOut = supported && getDocumentRef()?.pictureInPictureElement === video;
        button.textContent = poppedOut ? "Dock" : "Pop Out";
        button.title = poppedOut ? "Return video to panel" : "Pop out video";
        button.setAttribute("aria-label", button.title);
        button.setAttribute("aria-pressed", poppedOut ? "true" : "false");
    }

    async function toggleVideoPopout() {
        const video = getNode("media-browser-video");
        if (!isPictureInPictureSupported(video)) {
            syncVideoPopoutButton({ hasVideo: false });
            return;
        }
        const documentRef = getDocumentRef();
        try {
            if (documentRef?.pictureInPictureElement === video) {
                await documentRef.exitPictureInPicture?.();
            } else {
                await video.requestPictureInPicture();
            }
        } catch {
            // Browsers can reject Picture-in-Picture until metadata is ready or after a rapid source swap.
        }
        syncVideoPopoutButton({ hasVideo: video?.hidden !== true && !!video?.dataset?.mediaSourceUrl });
    }

    function syncMediaControls(playbackModel = {}) {
        const controls = getNode("media-browser-media-controls");
        const playButton = getNode("media-browser-media-play");
        const muteButton = getNode("media-browser-media-mute");
        const restartButton = getNode("media-browser-media-restart");
        const resyncButton = getNode("media-browser-media-resync");
        const elapsed = getNode("media-browser-media-elapsed");
        const slider = getNode("media-browser-media-timeline");
        const status = getNode("media-browser-media-status");
        const show = playbackModel.showControls === true;
        const isBusy = playbackModel.playing === true || playbackModel.buffering === true;
        const elapsedSeconds = Number(playbackModel.elapsedSeconds);
        const durationSeconds = Number(playbackModel.durationSeconds);
        const hasDuration = Number.isFinite(durationSeconds) && durationSeconds > 0;
        const safeElapsedSeconds = Number.isFinite(elapsedSeconds) && elapsedSeconds >= 0
            ? elapsedSeconds
            : 0;
        const clampedElapsedSeconds = hasDuration
            ? Math.min(safeElapsedSeconds, durationSeconds)
            : safeElapsedSeconds;
        if (controls) {
            controls.hidden = !show;
        }
        if (playButton) {
            playButton.disabled = !show;
            playButton.textContent = isBusy ? "⏸" : "▶";
            playButton.title = playbackModel.playTitle || (isBusy
                ? "Pause media playback"
                : "Play media from the current mission time");
            playButton.setAttribute("aria-label", playButton.title);
        }
        if (muteButton) {
            const muted = playbackModel.muted === true;
            muteButton.disabled = !show;
            muteButton.textContent = "";
            muteButton.dataset.icon = muted ? "speaker-muted" : "speaker";
            muteButton.title = muted ? "Unmute Mission Media" : "Mute Mission Media";
            muteButton.setAttribute("aria-label", muteButton.title);
            muteButton.setAttribute("aria-pressed", muted ? "true" : "false");
        }
        if (restartButton) {
            restartButton.disabled = !show;
            restartButton.title = playbackModel.restartTitle || "Play media from beginning";
            restartButton.setAttribute("aria-label", restartButton.title);
        }
        if (resyncButton) {
            resyncButton.disabled = !show;
            resyncButton.title = playbackModel.resyncTitle || "Force resync media with animation";
            resyncButton.setAttribute("aria-label", resyncButton.title);
        }
        if (elapsed) {
            const elapsedLabel = hasDuration
                ? `${formatMediaElapsedTime(clampedElapsedSeconds)} / ${formatMediaElapsedTime(durationSeconds)}`
                : `${formatMediaElapsedTime(clampedElapsedSeconds)} / --:--`;
            elapsed.textContent = show ? elapsedLabel : "";
            elapsed.title = elapsedLabel;
        }
        if (slider) {
            const seekEnabled = show && playbackModel.seekEnabled !== false && hasDuration;
            slider.hidden = !show;
            slider.disabled = !seekEnabled;
            slider.min = "0";
            slider.max = hasDuration ? String(durationSeconds) : "0";
            slider.step = "0.25";
            slider.value = String(hasDuration ? clampedElapsedSeconds : 0);
            slider.setAttribute(
                "aria-label",
                playbackModel.sliderTitle || "Selected media timeline",
            );
            slider.title = seekEnabled
                ? (playbackModel.sliderTitle || "Seek selected media")
                : "Media timeline unavailable";
        }
        if (status) {
            status.textContent = show ? String(playbackModel.statusLabel || "") : "";
            status.title = status.textContent;
        }
    }

    function syncFilterNavigation(navigationModel = {}) {
        const scroller = getNode("media-browser-filter-scroller");
        const previousButton = getNode("media-browser-filter-prev");
        const nextButton = getNode("media-browser-filter-next");
        const position = getNode("media-browser-filter-position");
        const available = navigationModel.available === true;
        if (scroller) {
            scroller.hidden = !available;
        }
        if (previousButton) {
            previousButton.disabled = !available || navigationModel.previousEnabled !== true;
            previousButton.title = navigationModel.previousTitle || "Previous filtered media";
            previousButton.setAttribute(
                "aria-label",
                navigationModel.previousTitle || "Previous filtered media",
            );
        }
        if (nextButton) {
            nextButton.disabled = !available || navigationModel.nextEnabled !== true;
            nextButton.title = navigationModel.nextTitle || "Next filtered media";
            nextButton.setAttribute(
                "aria-label",
                navigationModel.nextTitle || "Next filtered media",
            );
        }
        if (position) {
            position.textContent = navigationModel.positionLabel || "No media focused";
            position.title = position.textContent;
        }
    }

    function createAudioWaveformThumbnail() {
        const svg = createSvgElement("svg");
        const glow = createSvgElement("path");
        const line = createSvgElement("path");
        if (!svg || !glow || !line) return null;
        const path = "M12 36 C24 18 38 18 52 36 S78 54 92 36 S118 12 134 36 S166 60 182 36 S210 20 226 36 S252 52 268 36";
        svg.classList.add("media-browser-panel__thumbnail-waveform");
        svg.setAttribute("viewBox", "0 0 280 72");
        svg.setAttribute("focusable", "false");
        svg.setAttribute("aria-hidden", "true");
        svg.addEventListener("dragstart", (event) => event.preventDefault());
        glow.classList.add("media-browser-panel__thumbnail-waveform-glow");
        glow.setAttribute("d", path);
        line.classList.add("media-browser-panel__thumbnail-waveform-line");
        line.setAttribute("d", path);
        svg.appendChild(glow);
        svg.appendChild(line);
        return svg;
    }

    function createThumbnailFallback(kind) {
        if (kind === "audioClip") {
            return createAudioWaveformThumbnail();
        }
        const fallback = createElement("span");
        if (!fallback) return null;
        fallback.className = "media-browser-panel__thumbnail-fallback";
        fallback.textContent = kind === "videoClip" ? "Video" : "Image";
        fallback.addEventListener("dragstart", (event) => event.preventDefault());
        return fallback;
    }

    function revealActiveThumbnail() {
        const host = getNode("media-browser-thumbnail-list");
        if (!host) return;
        const activeButton = host.querySelector?.(".media-browser-panel__thumbnail-card.is-active");
        if (!activeButton || typeof activeButton.getBoundingClientRect !== "function") return;
        if (typeof host.getBoundingClientRect !== "function") return;
        const hostRect = host.getBoundingClientRect();
        const activeRect = activeButton.getBoundingClientRect();
        const vertical = isThumbnailStripVertical();
        const hostSize = vertical ? hostRect.height : hostRect.width;
        const activeStart = vertical ? activeRect.top : activeRect.left;
        const activeEnd = vertical ? activeRect.bottom : activeRect.right;
        const hostStart = vertical ? hostRect.top : hostRect.left;
        const hostEnd = vertical ? hostRect.bottom : hostRect.right;
        const activeSize = vertical ? activeRect.height : activeRect.width;
        const edgePadding = Math.min(120, Math.max(48, hostSize * 0.18));
        const isNearEdge = activeStart < (hostStart + edgePadding)
            || activeEnd > (hostEnd - edgePadding);
        if (!isNearEdge) return;
        const currentScroll = vertical ? Number(host.scrollTop) || 0 : Number(host.scrollLeft) || 0;
        const targetScroll = Math.max(
            0,
            currentScroll
                + (activeStart - hostStart)
                - ((hostSize - activeSize) / 2),
        );
        try {
            if (typeof host.scrollTo === "function") {
                host.scrollTo({
                    left: vertical ? Number(host.scrollLeft) || 0 : targetScroll,
                    top: vertical ? targetScroll : Number(host.scrollTop) || 0,
                    behavior: "auto",
                });
            } else {
                if (vertical) host.scrollTop = targetScroll;
                else host.scrollLeft = targetScroll;
            }
        } catch {
            if (vertical) host.scrollTop = targetScroll;
            else host.scrollLeft = targetScroll;
        }
        syncThumbnailPageButtons();
    }

    function scheduleActiveThumbnailReveal() {
        revealActiveThumbnail();
        const windowRef = getWindowRef();
        windowRef?.requestAnimationFrame?.(revealActiveThumbnail);
        windowRef?.setTimeout?.(revealActiveThumbnail, 80);
    }

    function buildThumbnailStructureSignature(thumbnailItems) {
        return JSON.stringify((thumbnailItems || []).map((item) => ({
            id: item.id,
            kind: item.kind,
            title: item.title,
            thumbnailAssetUrl: item.thumbnailAssetUrl,
            fallbackAssetUrl: item.fallbackAssetUrl,
            meta: item.meta,
            metaFull: item.metaFull,
            localTimeLabel: item.localTimeLabel,
            utcTimeLabel: item.utcTimeLabel,
            cameraLabel: item.cameraLabel,
            photographer: item.photographer,
            location: item.location,
            sourceLabel: item.sourceLabel,
            stageBadge: item.stageBadge,
            thumbnailLabel: item.thumbnailLabel,
            metadataLabel: item.metadataLabel,
        })));
    }

    function buildThumbnailActiveSignature(thumbnailItems) {
        return JSON.stringify((thumbnailItems || []).map((item) => [
            item.id,
            Boolean(item.active),
        ]));
    }

    function setThumbnailCardActive(button, active) {
        if (!button) return;
        const nextActive = Boolean(active);
        button.classList?.toggle?.("is-active", nextActive);
        if (typeof button.className === "string") {
            const classes = new Set(String(button.className || "").split(/\s+/).filter(Boolean));
            if (nextActive) classes.add("is-active");
            else classes.delete("is-active");
            button.className = Array.from(classes).join(" ");
        }
        if (nextActive) {
            button.setAttribute?.("aria-current", "true");
        } else {
            button.removeAttribute?.("aria-current");
        }
    }

    function updateThumbnailActiveStates(host, thumbnailItems) {
        const children = Array.from(host?.children || []);
        (thumbnailItems || []).forEach((item, index) => {
            const button = children[index];
            if (!button || button.dataset?.thumbnailItemId !== String(item.id || "")) return;
            setThumbnailCardActive(button, item.active);
        });
    }

    function thumbnailDomMatchesItems(host, thumbnailItems) {
        const children = Array.from(host?.children || []);
        const items = Array.isArray(thumbnailItems) ? thumbnailItems : [];
        if (children.length !== items.length) return false;
        return items.every((item, index) => (
            children[index]?.dataset?.thumbnailItemId === String(item.id || "")
        ));
    }

    function renderThumbnailItems(thumbnailItems) {
        const host = getNode("media-browser-thumbnail-list");
        if (!host) return;
        const nextStructureSignature = buildThumbnailStructureSignature(thumbnailItems);
        const nextActiveSignature = buildThumbnailActiveSignature(thumbnailItems);
        if (
            nextStructureSignature === thumbnailStructureSignature
            && thumbnailDomMatchesItems(host, thumbnailItems)
        ) {
            if (nextActiveSignature !== thumbnailActiveSignature) {
                thumbnailActiveSignature = nextActiveSignature;
                updateThumbnailActiveStates(host, thumbnailItems);
                scheduleActiveThumbnailReveal();
            }
            if (thumbnailPagingTargetScrollLeft != null) {
                syncThumbnailPageButtons();
            }
            return;
        }
        thumbnailStructureSignature = nextStructureSignature;
        thumbnailActiveSignature = nextActiveSignature;
        thumbnailPagingTargetScrollLeft = null;
        if (typeof host.replaceChildren === "function") {
            host.replaceChildren();
        } else {
            host.innerHTML = "";
        }

        for (const item of thumbnailItems || []) {
            const button = createElement("button");
            const media = createElement("span");
            const image = createElement("img");
            const fallback = createThumbnailFallback(item.kind);
            const title = createElement("span");
            const meta = createElement("span");
            const metadata = createElement("span");
            if (!button || !media || !title || !meta || !metadata) return;
            button.type = "button";
            if (button.dataset) {
                button.dataset.thumbnailItemId = String(item.id || "");
            }
            button.className = [
                "media-browser-panel__thumbnail-card",
                item.kind ? `media-browser-panel__thumbnail-card--${item.kind}` : "",
                item.active ? "is-active" : "",
            ].filter(Boolean).join(" ");
            if (item.active) {
                button.setAttribute("aria-current", "true");
            }
            button.draggable = false;
            button.removeAttribute?.("title");
            button.setAttribute("aria-label", buildThumbnailAriaLabel(item));
            media.className = "media-browser-panel__thumbnail-media";
            media.addEventListener("dragstart", (event) => event.preventDefault());
            if (image && item.thumbnailAssetUrl) {
                image.alt = "";
                image.loading = "lazy";
                image.decoding = "async";
                image.draggable = false;
                image.src = item.thumbnailAssetUrl;
                image.addEventListener("dragstart", (event) => event.preventDefault());
                if (item.fallbackAssetUrl && item.fallbackAssetUrl !== item.thumbnailAssetUrl) {
                    image.dataset.fallbackSrc = item.fallbackAssetUrl;
                }
                image.addEventListener("error", () => {
                    const fallbackSrc = image.dataset?.fallbackSrc || "";
                    if (fallbackSrc && image.src !== fallbackSrc) {
                        image.removeAttribute("data-fallback-src");
                        image.src = fallbackSrc;
                        return;
                    }
                    image.hidden = true;
                    fallback?.removeAttribute?.("hidden");
                });
                media.appendChild(image);
                if (fallback) {
                    fallback.setAttribute("hidden", "");
                    media.appendChild(fallback);
                }
            } else if (fallback) {
                media.appendChild(fallback);
            }
            if (item.kind === "videoClip") {
                const videoIcon = createElement("span");
                if (videoIcon) {
                    videoIcon.className = "media-browser-panel__thumbnail-video-icon";
                    videoIcon.setAttribute("aria-hidden", "true");
                    media.appendChild(videoIcon);
                }
            }
            title.className = "media-browser-panel__thumbnail-title";
            appendResponsiveThumbnailMetLabel(title, item);
            meta.className = "media-browser-panel__thumbnail-meta";
            if (item.metaFull && item.meta && item.metaFull !== item.meta) {
                const metaFull = createElement("span");
                const metaShort = createElement("span");
                if (metaFull && metaShort) {
                    metaFull.className = "media-browser-panel__thumbnail-meta-full";
                    metaFull.textContent = item.metaFull;
                    metaShort.className = "media-browser-panel__thumbnail-meta-short";
                    metaShort.textContent = item.meta;
                    meta.appendChild(metaFull);
                    meta.appendChild(metaShort);
                    meta.setAttribute?.("aria-label", item.metaFull);
                } else {
                    meta.textContent = item.metaFull || item.meta;
                }
            } else {
                meta.textContent = item.metaFull || item.meta || "";
            }
            metadata.className = "media-browser-panel__thumbnail-metadata";
            metadata.textContent = item.metadataLabel || "";
            meta.hidden = true;
            metadata.hidden = true;
            button.appendChild(media);
            button.appendChild(title);
            button.appendChild(meta);
            button.appendChild(metadata);
            button.addEventListener("click", () => {
                if (suppressThumbnailClick === true) return;
                onIntent?.({ type: "previewItem", value: item.id });
            });
            button.addEventListener("pointerenter", () => showThumbnailPopover(item, button));
            button.addEventListener("pointerleave", hideThumbnailPopover);
            button.addEventListener("focus", () => showThumbnailPopover(item, button));
            button.addEventListener("blur", hideThumbnailPopover);
            host.appendChild(button);
        }

        scheduleActiveThumbnailReveal();
        syncThumbnailPageButtons();
    }

    function destroyHlsInstance() {
        if (!hlsInstance) return;
        try {
            hlsInstance.destroy?.();
        } catch {
            // hls.js can throw while tearing down a partially attached stream.
        }
        hlsInstance = null;
        hlsSourceUrl = "";
    }

    function setVideoPoster(video, posterAssetUrl = "") {
        if (posterAssetUrl) {
            video.poster = posterAssetUrl;
        } else {
            video.removeAttribute?.("poster");
        }
    }

    function setNativeVideoSource(video, activeItem, nextVideoUrl) {
        destroyHlsInstance();
        hlsUnsupportedSourceUrl = "";
        if (video.getAttribute?.("src") === nextVideoUrl) {
            videoViewAssetUrl = nextVideoUrl;
        } else {
            videoViewAssetUrl = nextVideoUrl;
            video.src = nextVideoUrl;
            callMediaMethod(video, "load");
        }
        setVideoPoster(video, activeItem.posterAssetUrl || "");
    }

    function attachHlsVideoSource(video, activeItem, nextVideoUrl) {
        if (hlsUnsupportedSourceUrl === nextVideoUrl) {
            setVideoPoster(video, activeItem.posterAssetUrl || "");
            return;
        }
        if (hlsInstance && hlsSourceUrl === nextVideoUrl && videoViewAssetUrl === nextVideoUrl) {
            setVideoPoster(video, activeItem.posterAssetUrl || "");
            return;
        }
        hlsAttachToken += 1;
        const attachToken = hlsAttachToken;
        destroyHlsInstance();
        videoViewAssetUrl = nextVideoUrl;
        video.removeAttribute?.("src");
        setVideoPoster(video, activeItem.posterAssetUrl || "");
        callMediaMethod(video, "load");

        loadHlsLibrary().then((Hls) => {
            if (attachToken !== hlsAttachToken || videoViewAssetUrl !== nextVideoUrl) return;
            if (!Hls || typeof Hls.isSupported !== "function" || !Hls.isSupported()) {
                if (canPlayHlsNatively(video)) {
                    setNativeVideoSource(video, activeItem, nextVideoUrl);
                    return;
                }
                hlsUnsupportedSourceUrl = nextVideoUrl;
                video.removeAttribute?.("src");
                callMediaMethod(video, "load");
                onIntent?.({
                    type: "mediaPlaybackFailed",
                    value: activeItem.id || "",
                    mediaKind: "videoClip",
                });
                return;
            }

            hlsUnsupportedSourceUrl = "";
            const instance = new Hls({
                enableWorker: true,
                lowLatencyMode: false,
            });
            hlsInstance = instance;
            hlsSourceUrl = nextVideoUrl;
            instance.on(Hls.Events.MEDIA_ATTACHED, () => {
                if (attachToken !== hlsAttachToken || hlsInstance !== instance) return;
                instance.loadSource(nextVideoUrl);
                instance.startLoad?.(0);
            });
            instance.on(Hls.Events.MANIFEST_PARSED, () => {
                if (attachToken !== hlsAttachToken || hlsInstance !== instance) return;
                onIntent?.({
                    type: "mediaVideoSourceReady",
                    value: activeItem.id || "",
                    mediaKind: "videoClip",
                    currentTime: Number(video?.currentTime),
                });
            });
            instance.on(Hls.Events.ERROR, (_event, data = {}) => {
                if (hlsInstance !== instance || data.fatal !== true) return;
                if (data.details === "manifestIncompatibleCodecsError") {
                    destroyHlsInstance();
                    onIntent?.({
                        type: "mediaPlaybackFailed",
                        value: activeItem.id || "",
                        mediaKind: "videoClip",
                    });
                    return;
                }
                if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                    instance.startLoad();
                    return;
                }
                if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                    instance.recoverMediaError();
                    return;
                }
                destroyHlsInstance();
            });
            instance.attachMedia(video);
        });
    }

    function configureVideoSource(video, activeItem) {
        const nextVideoUrl = activeItem.videoAssetUrl;
        const sourceType = activeItem.sourceType || "";
        const isHlsSource = isLikelyHlsSource(nextVideoUrl, sourceType);

        if (video.dataset) {
            video.dataset.mediaItemId = activeItem.id || "";
            video.dataset.mediaSourceUrl = nextVideoUrl || "";
            video.dataset.sourceType = sourceType;
        }

        if (isHlsSource) {
            attachHlsVideoSource(video, activeItem, nextVideoUrl);
            return;
        }

        hlsAttachToken += 1;
        setNativeVideoSource(video, activeItem, nextVideoUrl);
    }

    function clearVideoSource(video) {
        hlsAttachToken += 1;
        destroyHlsInstance();
        hlsUnsupportedSourceUrl = "";
        if (videoViewAssetUrl) {
            callMediaMethod(video, "pause");
            video.removeAttribute?.("src");
            video.removeAttribute?.("poster");
            callMediaMethod(video, "load");
        }
        videoViewAssetUrl = "";
        if (video.dataset) {
            video.dataset.mediaItemId = "";
            video.dataset.mediaSourceUrl = "";
            video.dataset.sourceType = "";
        }
    }

    function renderStructuralViewModel(viewModel = {}) {
        ensurePanelEventsBound();
        panelTitle = viewModel.panelTitle || panelTitle;
        mediaCountLabel = viewModel.mediaCountLabel || mediaCountLabel;
        const statusText = String(viewModel.statusText || "").trim();
        setText("media-browser-status", statusText);
        setHidden("media-browser-status", !statusText);
        const fullTimeLabel = viewModel.activeItem?.timeLabel || "--";
        setText("media-browser-time", resolveCompactTimeLabel(fullTimeLabel));
        setText("media-browser-full-time", fullTimeLabel);
        const timeNode = getNode("media-browser-time");
        if (timeNode) {
            timeNode.title = fullTimeLabel;
        }
        setText("media-browser-item-title", viewModel.activeItem?.title || panelTitle);
        setText("media-browser-camera", viewModel.activeItem?.cameraLabel || "--");
        setHidden("media-browser-camera", !viewModel.activeItem?.cameraLabel);
        setText("media-browser-photographer", viewModel.activeItem?.photographer || "--");
        setText("media-browser-location", viewModel.activeItem?.location || "--");
        setText("media-browser-source", viewModel.activeItem?.sourceLabel || "--");
        setText("media-browser-ai-summary", viewModel.activeItem?.shortDescription || "--");
        setText("media-browser-scene-type", viewModel.activeItem?.sceneType || "--");
        setText("media-browser-bodies", formatMediaDetailList(viewModel.activeItem?.bodies));
        setText("media-browser-main-body", viewModel.activeItem?.mainBody || "--");
        setText("media-browser-tags", formatMediaDetailList(viewModel.activeItem?.tags));
        setText("media-browser-subjects", formatMediaDetailList(viewModel.activeItem?.subjects));
        setText("media-browser-composition-hint", formatCompositionHintLabel(viewModel.activeItem?.compositionHints));
        setText("media-browser-quality-notes", viewModel.activeItem?.qualityNotes || "--");
        setText("media-browser-exif-detail", viewModel.activeItem?.exifLabel || "--");
        setText("media-browser-exif", viewModel.activeItem?.exifLabel || "");
        setHidden("media-browser-exif", !viewModel.activeItem?.exifLabel);
        setText(
            "media-browser-description",
            viewModel.activeItem?.description
                || viewModel.descriptionEmptyText
                || viewModel.emptyText
                || "--",
        );
        setText("media-browser-timing-note", viewModel.activeItem?.timingNote || "");
        setHidden("media-browser-timing-note", !viewModel.activeItem?.timingNote);
        setText("media-browser-seed-note", "");
        setHidden("media-browser-seed-note", true);
        setText("media-browser-stage-badge", viewModel.activeItem?.stageBadge || "");
        setHidden("media-browser-stage-badge", !viewModel.activeItem?.stageBadge);

        const stageEmpty = getNode("media-browser-stage-empty");
        const video = getNode("media-browser-video");
        const image = getNode("media-browser-image");
        const audioPlaceholder = getNode("media-browser-audio-placeholder");
        const activeItem = viewModel.activeItem || null;
        const hasVideo = activeItem?.kind === "videoClip" && !!activeItem.videoAssetUrl;
        const hasAudio = activeItem?.kind === "audioClip";
        const hasImage = !hasVideo && !hasAudio && !!activeItem?.assetUrl;

        if (isVideoLike(video)) {
            if (hasVideo) {
                configureVideoSource(video, activeItem);
                video.hidden = false;
            } else {
                clearVideoSource(video);
                video.hidden = true;
            }
        }
        syncVideoPopoutButton({ hasVideo });

        if (isImageLike(image)) {
            if (hasImage) {
                const nextAssetUrl = activeItem.assetUrl;
                if (image.getAttribute?.("src") !== nextAssetUrl) {
                    image.src = nextAssetUrl;
                }
                image.alt = activeItem.title || "Mission media";
                image.hidden = false;
                if (imageViewAssetUrl !== nextAssetUrl) {
                    imageViewAssetUrl = nextAssetUrl;
                    resetImageView({ animate: false });
                } else {
                    applyImageViewState(imageViewState, { animate: false });
                }
            } else {
                imageViewAssetUrl = "";
                image.removeAttribute("src");
                image.alt = "";
                image.hidden = true;
                resetImageView({ animate: false });
            }
        }

        if (audioPlaceholder) {
            audioPlaceholder.hidden = !hasAudio;
        }

        if (stageEmpty) {
            if (hasVideo || hasImage || hasAudio) {
                stageEmpty.textContent = "";
                stageEmpty.hidden = true;
            } else {
                stageEmpty.textContent =
                    viewModel.stageEmptyText
                    || viewModel.emptyText
                    || "No media preview available.";
                stageEmpty.hidden = false;
            }
        }

        currentFilterModel = viewModel.filterModel || {};
        renderMediaFilterControls(currentFilterModel);
        syncMediaSearchControl(currentFilterModel);
        setText("media-browser-filter-summary", viewModel.filterSummaryLabel || formatMediaFilterSummary(currentFilterModel));
        syncMediaFilterToggle(currentFilterModel);
        syncFilterDrawerPlacement();
        syncFilterNavigation(viewModel.navigationModel || {});
        renderThumbnailItems(viewModel.thumbnailItems || []);
        revealStageOverlaysForSignature([
            viewModel.activeItem?.id || "",
            viewModel.navigationModel?.positionLabel || "",
            viewModel.activeItem?.stageBadge || "",
        ].join("|"));
        syncDrilldownFlyoutPlacement();
        syncPanelRegistry();
    }

    function render(viewModel = {}) {
        ensurePanelEventsBound();
        const structuralSignature = buildPanelStructuralRenderSignature(viewModel);
        if (structuralSignature !== panelStructuralRenderSignature) {
            panelStructuralRenderSignature = structuralSignature;
            renderStructuralViewModel(viewModel);
        }
        syncMediaControls(viewModel.playbackModel || {});
    }

    function ensurePanelEventsBound() {
        if (initialized) return;
        const documentRef = getDocumentRef();
        if (!documentRef?.getElementById) return;
        initialized = true;

        const panel = getNode("media-browser-panel");
        const header = panel?.querySelector(".media-browser-panel__header");
        const headerControls = panel?.querySelector(".media-browser-panel__header-controls");
        let closeButton = getNode("media-browser-panel-close");
        const minimizeButton = getNode("media-browser-panel-minimize");
        let expandButton = getNode("media-browser-panel-expand");
        let infoButton = getNode("media-browser-panel-info");
        let deleteButton = getNode("media-browser-panel-delete");

        if (isElementLike(panel)) {
            const persistedWidth = Number(restoredPanelLayout?.width);
            const persistedHeight = Number(restoredPanelLayout?.height);
            if (Number.isFinite(persistedWidth) && persistedWidth > 0) {
                panel.style.width = `${Math.round(persistedWidth)}px`;
            }
            if (Number.isFinite(persistedHeight) && persistedHeight > 0) {
                panel.style.height = `${Math.round(persistedHeight)}px`;
            }
            const persistedX = Number(restoredPanelLayout?.x);
            const persistedY = Number(restoredPanelLayout?.y);
            if (Number.isFinite(persistedX) && Number.isFinite(persistedY)) {
                panelPosition = {
                    x: Math.round(persistedX),
                    y: Math.round(persistedY),
                };
            }
            const persistedState = String(restoredPanelLayout?.state || "").trim().toLowerCase();
            if (persistedState === "open" || persistedState === "minimized" || persistedState === "closed" || persistedState === "deleted") {
                panelVisibilityState = persistedState === "minimized" ? "closed" : persistedState;
                hasRestoredPanelVisibilityState = true;
                defaultPanelStateApplied = true;
            }
            panel.classList.toggle("is-maximized", panelExpanded === true);
            setDefaultLayoutManaged(defaultLayoutManaged, panel);
            panel.addEventListener?.("pointerdown", bringPanelToFront, true);
        }

        if (!infoButton && isElementLike(headerControls) && typeof headerControls.insertBefore === "function") {
            infoButton = createElement("button");
            if (!infoButton) return;
            infoButton.id = "media-browser-panel-info";
            infoButton.className = "media-browser-panel__icon-button mission-panel-shell__button mission-panel-shell__button--icon";
            infoButton.type = "button";
            infoButton.title = "Info";
            infoButton.setAttribute("aria-label", "Show panel info");
            infoButton.dataset.icon = "info";
            infoButton.textContent = "";
            infoButton.dataset.panelInfoTrigger = "true";
            headerControls.insertBefore(infoButton, closeButton || null);
        }

        if (minimizeButton && typeof minimizeButton.remove === "function") {
            minimizeButton.remove();
        }

        if (!deleteButton && isElementLike(headerControls) && typeof headerControls.appendChild === "function") {
            deleteButton = createElement("button");
            if (!deleteButton) return;
            deleteButton.id = "media-browser-panel-delete";
            deleteButton.className = "media-browser-panel__icon-button mission-panel-shell__button mission-panel-shell__button--icon mission-panel-shell__button--danger";
            deleteButton.type = "button";
            deleteButton.title = "Delete";
            deleteButton.setAttribute("aria-label", "Delete");
            deleteButton.dataset.icon = "delete";
            deleteButton.textContent = "";
            headerControls.appendChild(deleteButton);
        }

        bindPanelDragging(panel, header);
        bindPanelResizing(panel);
        panel?.addEventListener?.("moon-mission:media-browser-default-frame", (event) => {
            if (
                defaultLayoutManaged === false ||
                panelVisibilityState !== "open" ||
                panelExpanded === true ||
                !isElementLike(panel)
            ) {
                return;
            }
            applyPanelFrame(panel, event.detail || {}, {
                managed: true,
                persist: true,
            });
        });
        bindImageViewControls();
        bindThumbnailStripResizer();
        bindThumbnailStripDragging();
        bindThumbnailPageButtons();
        const stage = getNode("media-browser-stage");
        stage?.addEventListener?.("pointerenter", () => {
            stageOverlayHovering = true;
            revealStageOverlays({ durationMs: 0 });
        });
        stage?.addEventListener?.("pointerleave", () => {
            stageOverlayHovering = false;
            if (stageOverlayFocusWithin !== true) setStageOverlayRevealed(false);
        });
        stage?.addEventListener?.("pointerdown", () => revealStageOverlays());
        stage?.addEventListener?.("focusin", () => {
            stageOverlayFocusWithin = true;
            revealStageOverlays({ durationMs: 0 });
        });
        stage?.addEventListener?.("focusout", () => {
            stageOverlayFocusWithin = !!stage?.matches?.(":focus-within");
            if (stageOverlayFocusWithin !== true && stageOverlayHovering !== true) setStageOverlayRevealed(false);
        });
        if (panelExpanded === true) {
            applyExpandedPanelRect(panel);
        } else {
            ensurePanelPosition(panel);
        }
        applyThumbnailStripHeight(thumbnailStripHeight);
        panel?.classList.toggle("media-browser-panel--hidden", panelVisibilityState !== "open");
        syncExpandButton(expandButton);

        documentRef.addEventListener?.("media-browser-panel-open", () => {
            setPanelState("open");
        });
        documentRef.addEventListener?.("moon-mission:workflow-panel-stack-layout", () => {
            applyManagedDefaultPanelFrame(panel);
        });
        getNode("media-browser-filter-toggle")?.addEventListener?.("click", () => {
            setFilterDrawerOpen(filterDrawerOpen !== true);
        });
        documentRef.addEventListener?.("keydown", (event) => {
            if (event?.key === "Escape" && filterDrawerOpen === true) {
                setFilterDrawerOpen(false);
            }
        });
        documentRef.addEventListener?.("pointerdown", (event) => {
            if (filterDrawerOpen !== true) return;
            const target = event?.target;
            const drawer = getNode("media-browser-filter-drawer");
            const toggle = getNode("media-browser-filter-toggle");
            if (
                (drawer && typeof drawer.contains === "function" && drawer.contains(target)) ||
                (toggle && typeof toggle.contains === "function" && toggle.contains(target))
            ) {
                return;
            }
            setFilterDrawerOpen(false);
        });
        infoButton?.addEventListener("click", () => showMissionPanelInfo(MEDIA_BROWSER_PANEL_ID, infoButton));
        expandButton?.addEventListener("click", () => setPanelExpanded(panelExpanded !== true, panel));
        closeButton?.addEventListener("click", () => setPanelState("closed"));
        deleteButton?.addEventListener("click", () => confirmDeletePanel());

        getNode("media-browser-filter-prev")?.addEventListener?.("click", () => {
            onIntent?.({ type: "selectAdjacentItem", value: "previous" });
        });

        getNode("media-browser-filter-next")?.addEventListener?.("click", () => {
            onIntent?.({ type: "selectAdjacentItem", value: "next" });
        });

        getNode("media-browser-media-play")?.addEventListener?.("click", () => {
            onIntent?.({ type: "toggleActiveMediaPlayback" });
        });
        getNode("media-browser-media-mute")?.addEventListener?.("click", () => {
            onIntent?.({ type: "toggleMediaMuted" });
        });

        getNode("media-browser-media-restart")?.addEventListener?.("click", () => {
            onIntent?.({ type: "startActiveMediaFromBeginning" });
        });
        getNode("media-browser-media-resync")?.addEventListener?.("click", () => {
            onIntent?.({ type: "forceResyncActiveMedia" });
        });
        getNode("media-browser-media-popout")?.addEventListener?.("click", () => {
            toggleVideoPopout();
        });
        const mediaTimelineSlider = getNode("media-browser-media-timeline");
        let mediaTimelinePointerState = null;
        const seekMediaTimelineFromPointer = (event, finalize = false) => {
            const value = resolveRangeValueAtClientX(mediaTimelineSlider, Number(event?.clientX));
            if (!Number.isFinite(value)) return false;
            mediaTimelineSlider.value = String(value);
            suppressNativeMediaSeekEvents = Math.max(suppressNativeMediaSeekEvents, finalize === true ? 2 : 1);
            onIntent?.({
                type: "mediaSeekTime",
                value,
                finalize: finalize === true,
            });
            return true;
        };
        mediaTimelineSlider?.addEventListener?.("pointerdown", (event) => {
            if (mediaTimelineSlider.disabled === true || mediaTimelineSlider.hidden === true) return;
            if (event?.isPrimary === false) return;
            if (event?.pointerType === "mouse" && event?.button !== 0) return;
            if (!seekMediaTimelineFromPointer(event, false)) return;
            event?.preventDefault?.();
            mediaTimelinePointerState = {
                pointerId: Number(event?.pointerId),
            };
            if (Number.isFinite(mediaTimelinePointerState.pointerId)) {
                mediaTimelineSlider.setPointerCapture?.(mediaTimelinePointerState.pointerId);
            }
        });
        mediaTimelineSlider?.addEventListener?.("pointermove", (event) => {
            if (!mediaTimelinePointerState) return;
            const pointerId = Number(event?.pointerId);
            if (
                Number.isFinite(mediaTimelinePointerState.pointerId)
                && Number.isFinite(pointerId)
                && pointerId !== mediaTimelinePointerState.pointerId
            ) {
                return;
            }
            if (seekMediaTimelineFromPointer(event, false)) {
                event?.preventDefault?.();
            }
        });
        mediaTimelineSlider?.addEventListener?.("pointerup", (event) => {
            if (!mediaTimelinePointerState) return;
            const pointerId = Number(event?.pointerId);
            if (
                Number.isFinite(mediaTimelinePointerState.pointerId)
                && Number.isFinite(pointerId)
                && pointerId !== mediaTimelinePointerState.pointerId
            ) {
                return;
            }
            seekMediaTimelineFromPointer(event, true);
            if (Number.isFinite(mediaTimelinePointerState.pointerId)) {
                mediaTimelineSlider.releasePointerCapture?.(mediaTimelinePointerState.pointerId);
            }
            mediaTimelinePointerState = null;
            event?.preventDefault?.();
        });
        mediaTimelineSlider?.addEventListener?.("pointercancel", () => {
            if (
                mediaTimelinePointerState
                && Number.isFinite(mediaTimelinePointerState.pointerId)
            ) {
                mediaTimelineSlider.releasePointerCapture?.(mediaTimelinePointerState.pointerId);
            }
            mediaTimelinePointerState = null;
        });
        mediaTimelineSlider?.addEventListener?.("input", () => {
            if (suppressNativeMediaSeekEvents > 0) {
                suppressNativeMediaSeekEvents -= 1;
                return;
            }
            onIntent?.({
                type: "mediaSeekTime",
                value: Number(mediaTimelineSlider?.value),
                finalize: false,
            });
        });
        mediaTimelineSlider?.addEventListener?.("change", () => {
            if (suppressNativeMediaSeekEvents > 0) {
                suppressNativeMediaSeekEvents -= 1;
                return;
            }
            onIntent?.({
                type: "mediaSeekTime",
                value: Number(mediaTimelineSlider?.value),
                finalize: true,
            });
        });

        const mediaSearchInput = getNode("media-browser-search");
        mediaSearchInput?.addEventListener?.("input", () => {
            onIntent?.({
                type: "setSearchQuery",
                value: mediaSearchInput?.value || "",
            });
        });

        const video = getNode("media-browser-video");
        const getVideoItemId = () => String(video?.dataset?.mediaItemId || "").trim();
        video?.addEventListener?.("playing", () => {
            onIntent?.({
                type: "mediaPlaybackStarted",
                value: getVideoItemId(),
                mediaKind: "videoClip",
                currentTime: Number(video?.currentTime),
            });
        });
        for (const eventName of ["waiting", "stalled"]) {
            video?.addEventListener?.(eventName, () => {
                onIntent?.({
                    type: "mediaPlaybackBuffering",
                    value: getVideoItemId(),
                    mediaKind: "videoClip",
                    currentTime: Number(video?.currentTime),
                });
            });
        }
        video?.addEventListener?.("pause", () => {
            if (video?.ended === true) return;
            onIntent?.({
                type: "mediaPlaybackPaused",
                value: getVideoItemId(),
                mediaKind: "videoClip",
                currentTime: Number(video?.currentTime),
                mediaElement: video,
            });
        });
        video?.addEventListener?.("ended", () => {
            onIntent?.({ type: "mediaPlaybackEnded", value: getVideoItemId(), mediaKind: "videoClip" });
        });
        for (const eventName of ["abort", "error"]) {
            video?.addEventListener?.(eventName, () => {
                onIntent?.({
                    type: "mediaPlaybackFailed",
                    value: getVideoItemId(),
                    mediaKind: "videoClip",
                });
            });
        }
        video?.addEventListener?.("timeupdate", () => {
            onIntent?.({
                type: "mediaPlaybackTimeUpdate",
                value: getVideoItemId(),
                mediaKind: "videoClip",
                currentTime: Number(video?.currentTime),
            });
        });
        for (const eventName of ["loadedmetadata", "durationchange"]) {
            video?.addEventListener?.(eventName, () => {
                onIntent?.({
                    type: "mediaDurationKnown",
                    value: getVideoItemId(),
                    mediaKind: "videoClip",
                    duration: Number(video?.duration),
                });
            });
        }
        for (const eventName of ["enterpictureinpicture", "leavepictureinpicture", "loadedmetadata", "emptied"]) {
            video?.addEventListener?.(eventName, () => {
                syncVideoPopoutButton({
                    hasVideo: video?.hidden !== true && !!video?.dataset?.mediaSourceUrl,
                });
            });
        }
        video?.addEventListener?.("canplay", () => {
            onIntent?.({
                type: "mediaVideoSourceReady",
                value: getVideoItemId(),
                mediaKind: "videoClip",
                currentTime: Number(video?.currentTime),
            });
        });

        const drilldown = getNode("media-browser-drilldown");
        drilldown?.addEventListener?.("toggle", () => {
            const windowRef = getWindowRef();
            syncDrilldownFlyoutPlacement();
            windowRef?.requestAnimationFrame?.(syncDrilldownFlyoutPlacement);
            windowRef?.setTimeout?.(syncDrilldownFlyoutPlacement, 80);
        });

        if (panel && typeof ResizeObserver !== "undefined") {
            const resizeObserver = new ResizeObserver(() => {
                if (panel.classList.contains("media-browser-panel--hidden")) return;
                if (panelExpanded === true) {
                    applyExpandedPanelRect(panel);
                } else if (defaultLayoutManaged !== false) {
                    applyManagedDefaultPanelFrame(panel, { persist: false });
                } else {
                    clampPanelPosition(panel);
                }
                syncFilterDrawerPlacement();
                syncDrilldownFlyoutPlacement();
                applyThumbnailStripHeight(thumbnailStripHeight);
                syncThumbnailPageButtons();
                applyImageViewState(imageViewState, { animate: false });
                persistPanelLayoutState(panel);
            });
            resizeObserver.observe(panel);

            const timelineDock = getNode("timeline-dock");
            if (timelineDock) {
                const timelineResizeObserver = new ResizeObserver(() => {
                    applyManagedDefaultPanelFrame(panel);
                });
                timelineResizeObserver.observe(timelineDock);
            }
        }

        getWindowRef()?.addEventListener?.("resize", () => {
            syncPanelAvailability();
            if (!shouldAllowMediaBrowserPanel()) {
                setPanelState("closed");
                return;
            }
            if (!isElementLike(panel)) return;
            if (!panel.classList.contains("media-browser-panel--hidden")) {
                if (panelExpanded === true) {
                    applyExpandedPanelRect(panel);
                } else if (defaultLayoutManaged !== false) {
                    applyManagedDefaultPanelFrame(panel);
                } else {
                    clampPanelPosition(panel);
                }
                syncFilterDrawerPlacement();
                syncDrilldownFlyoutPlacement();
                applyThumbnailStripHeight(thumbnailStripHeight);
                syncThumbnailPageButtons();
                applyImageViewState(imageViewState, { animate: false });
                persistPanelLayoutState(panel);
            }
        });
    }

    function setMissionContext({
        configData,
        available,
        title,
        nextMissionLabel,
        mediaCount,
    } = {}) {
        missionConfigData = configData || missionConfigData;
        missionLabel = String(nextMissionLabel || missionLabel).trim() || "Current mission";
        panelTitle = String(title || panelTitle).trim() || "Mission Media";
        mediaCountLabel = Number.isFinite(mediaCount) ? String(mediaCount) : mediaCountLabel;
        const enabledByMission = missionConfigData
            ? isMissionPanelEnabled(missionConfigData, MEDIA_BROWSER_PANEL_ID, { fallbackEnabled: false })
            : false;
        panelAvailableForMission = available === true && enabledByMission;
        ensurePanelEventsBound();
        syncPanelAvailability();
        applyConfiguredDefaultPanelState();
    }

    registerMissionPanel({
        id: MEDIA_BROWSER_PANEL_ID,
        title: panelTitle,
        kind: "workflow",
        panelType: "media-browser",
        builtIn: true,
        available: panelAvailable,
        state: getPanelRegistryState(),
        sortOrder: 45,
        actions: {},
    });
    syncPanelRegistry();

    return {
        render,
        setMissionContext,
        setPanelState,
    };
}

export {
    MEDIA_BROWSER_PANEL_ID,
    createMediaBrowserPanelActions,
    clampMediaImagePan,
    createDefaultMediaImageViewState,
    resolveRangeValueAtClientX,
    resolveThumbnailDisclosureLevel,
    resolveThumbnailPopoverPosition,
    zoomMediaImageViewState,
};
