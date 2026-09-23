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
    focusDockviewWorkflowPanel,
    resolveDockedWorkflowPanelPosition,
} from "./dockview-workflow-panels.js";
import { bringPanelElementToFront } from "./panel-z-order.js";
import {
    MEDIA_BROWSER_PANEL_ID,
    MEDIA_BROWSER_LAYOUT_PRESET_VERSION,
    PANEL_EDGE_MARGIN_PX,
    PANEL_TRANSPORT_CLEARANCE_PX,
    PANEL_DEFAULT_LEFT_PX,
    PANEL_DEFAULT_WIDTH_PX,
    PANEL_MIN_WIDTH_PX,
    PANEL_MIN_HEIGHT_PX,
    WORKFLOW_MEDIA_PANEL_WIDTH_PX,
} from "./media-browser-config.js";
import {
    clamp,
    resolveRangeValueAtClientX,
    createDefaultMediaImageViewState,
    resolveThumbnailPopoverPosition,
    resolveThumbnailDisclosureLevel,
    clampMediaImagePan,
    zoomMediaImageViewState,
} from "./media-browser-policy.js";
import { createMediaBrowserVideoSource } from "./media-browser-video-source.js";
import { createMediaBrowserPanelGeometry } from "./media-browser-panel-geometry.js";
import { createMediaBrowserThumbnailRenderer } from "./media-browser-thumbnail-renderer.js";
import { createMediaBrowserThumbnailControls } from "./media-browser-thumbnail-controls.js";
import { createMediaBrowserControls } from "./media-browser-controls.js";
import { createMediaBrowserFilterDrawer } from "./media-browser-filter-drawer.js";
import { createMediaBrowserImageView } from "./media-browser-image-view.js";
import { bindMediaBrowserPlayerEvents } from "./media-browser-player-events.js";
import { createMediaBrowserStageOverlay } from "./media-browser-stage-overlay.js";
import { prepareMediaBrowserShell } from "./media-browser-shell.js";
import { buildPanelStructuralRenderSignature, resolveCompactTimeLabel,
    formatMediaDetailList, formatCompositionHintLabel } from "./media-browser-view-model.js";
import {
    getDocumentRef,
    getWindowRef,
    shouldAllowMediaBrowserPanel,
    isElementLike,
    isImageLike,
    isVideoLike,
    dispatchDocumentCustomEvent,
    getViewportWidth,
    getViewportHeight,
    getPanelDefaultHeightPx,
    getVisibleElementTopPx,
    getWorkflowMediaPanelTopPx,
    getTimelineSafeBottomPx,
} from "./media-browser-dom.js";

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
    let panelStructuralRenderSignature = "";
    let restoredPanelLayout = readMissionPanelState(MEDIA_BROWSER_PANEL_ID) || null;
    if (String(restoredPanelLayout?.layoutPresetVersion || "").trim() !== MEDIA_BROWSER_LAYOUT_PRESET_VERSION) {
        restoredPanelLayout = null;
    }
    let defaultLayoutManaged = restoredPanelLayout?.defaultLayoutManaged !== false;
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

    const { configureVideoSource, clearVideoSource } = createMediaBrowserVideoSource({ onIntent });

    const { bindPanelDragging, bindPanelResizing } = createMediaBrowserPanelGeometry({
        isMediaPanelDocked,
        getPanelExpanded: () => panelExpanded,
        setDefaultLayoutManaged,
        applyPanelPosition,
        applyPanelFrame,
        persistPanelLayoutState,
    });

    const imageView = createMediaBrowserImageView({ getNode, getImageStageSize });
    const { applyImageViewState, resetImageView, bindImageViewControls } = imageView;

    let thumbnailRenderer;
    const thumbnailControls = createMediaBrowserThumbnailControls({
        restoredPanelLayout,
        getNode,
        getWrapper,
        persistPanelLayoutState,
        applyImageViewState,
        getImageViewState: imageView.getState,
        revealActiveThumbnail: () => thumbnailRenderer?.revealActiveThumbnail(),
    });
    const { isThumbnailStripVertical, applyThumbnailStripHeight, bindThumbnailStripResizer,
        bindThumbnailStripDragging, syncThumbnailPageButtons, bindThumbnailPageButtons } = thumbnailControls;
    thumbnailRenderer = createMediaBrowserThumbnailRenderer({
        getNode,
        isThumbnailStripVertical,
        syncThumbnailPageButtons,
        getThumbnailPagingTargetScrollLeft: thumbnailControls.getPagingTargetScrollLeft,
        resetThumbnailPagingTargetScrollLeft: thumbnailControls.resetPagingTargetScrollLeft,
        isThumbnailClickSuppressed: thumbnailControls.isClickSuppressed,
        onIntent,
    });
    const { renderThumbnailItems, revealActiveThumbnail, scheduleActiveThumbnailReveal } = thumbnailRenderer;

    const { renderMediaFilterControls, syncMediaSearchControl, syncVideoPopoutButton,
        toggleVideoPopout, syncMediaControls, syncFilterNavigation } = createMediaBrowserControls({ getNode, onIntent });

    const filterDrawer = createMediaBrowserFilterDrawer({ getNode });
    const { formatMediaFilterSummary, syncMediaFilterToggle, syncFilterDrawerPlacement,
        setFilterDrawerOpen, syncDrilldownFlyoutPlacement } = filterDrawer;

    const { revealStageOverlays, revealStageOverlaysForSignature, bindStageEvents } =
        createMediaBrowserStageOverlay({ getNode });

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
            applyThumbnailStripHeight(thumbnailControls.getStripHeight());
            applyImageViewState(imageView.getState(), { animate: false });
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
        applyThumbnailStripHeight(thumbnailControls.getStripHeight());
        applyImageViewState(imageView.getState(), { animate: false });
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
                thumbnailStripHeight: Math.round(thumbnailControls.getStripHeight()),
                thumbnailStripPlacement: thumbnailControls.getPlacement(),
                thumbnailStripCollapsed: thumbnailControls.isCollapsed(),
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
            thumbnailStripHeight: Math.round(thumbnailControls.getStripHeight()),
            thumbnailStripPlacement: thumbnailControls.getPlacement(),
            thumbnailStripCollapsed: thumbnailControls.isCollapsed(),
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
                    ? () => { setPanelState("open"); focusDockviewWorkflowPanel(MEDIA_BROWSER_PANEL_ID); }
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
        applyThumbnailStripHeight(thumbnailControls.getStripHeight());
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
            applyThumbnailStripHeight(thumbnailControls.getStripHeight());
            applyImageViewState(imageView.getState(), { animate: false });
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
        applyThumbnailStripHeight(thumbnailControls.getStripHeight());
        scheduleActiveThumbnailReveal();
        persistPanelLayoutState(panel);
    }

    function renderStructuralViewModel(viewModel = {}) {
        ensurePanelEventsBound();
        panelTitle = viewModel.panelTitle || panelTitle;
        mediaCountLabel = viewModel.mediaCountLabel || mediaCountLabel;
        const statusText = String(viewModel.statusText || "").trim();
        setText("media-browser-status", statusText);
        setHidden("media-browser-status", !statusText);
        const manifestRetry = getNode("media-browser-manifest-retry");
        if (manifestRetry) {
            manifestRetry.hidden = viewModel.manifestRetryAvailable !== true;
            manifestRetry.disabled = viewModel.manifestRetryAvailable !== true;
        }
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
                if (imageView.getAssetUrl() !== nextAssetUrl) {
                    imageView.setAssetUrl(nextAssetUrl);
                    resetImageView({ animate: false });
                } else {
                    applyImageViewState(imageView.getState(), { animate: false });
                }
            } else {
                imageView.setAssetUrl("");
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

        filterDrawer.setModel(viewModel.filterModel || {});
        renderMediaFilterControls(filterDrawer.getModel());
        syncMediaSearchControl(filterDrawer.getModel());
        setText("media-browser-filter-summary", viewModel.filterSummaryLabel || formatMediaFilterSummary(filterDrawer.getModel()));
        syncMediaFilterToggle(filterDrawer.getModel());
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
        const structuralSignature = buildPanelStructuralRenderSignature(viewModel, { panelTitle, mediaCountLabel });
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

        const shell = prepareMediaBrowserShell({ getNode, restoredPanelLayout, panelExpanded,
            defaultLayoutManaged, setDefaultLayoutManaged, bringPanelToFront });
        if (!shell) return;
        const { panel, header, closeButton, expandButton, infoButton, deleteButton } = shell;
        if (shell.restoredPosition) panelPosition = shell.restoredPosition;
        if (shell.restoredVisibilityState) {
            panelVisibilityState = shell.restoredVisibilityState;
            hasRestoredPanelVisibilityState = true;
            defaultPanelStateApplied = true;
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
        bindStageEvents();
        if (panelExpanded === true) {
            applyExpandedPanelRect(panel);
        } else {
            ensurePanelPosition(panel);
        }
        applyThumbnailStripHeight(thumbnailControls.getStripHeight());
        panel?.classList.toggle("media-browser-panel--hidden", panelVisibilityState !== "open");
        syncExpandButton(expandButton);

        documentRef.addEventListener?.("media-browser-panel-open", () => {
            setPanelState("open");
        });
        documentRef.addEventListener?.("moon-mission:workflow-panel-stack-layout", () => {
            applyManagedDefaultPanelFrame(panel);
        });
        getNode("media-browser-filter-toggle")?.addEventListener?.("click", () => {
            setFilterDrawerOpen(!filterDrawer.isOpen());
        });
        documentRef.addEventListener?.("keydown", (event) => {
            if (event?.key === "Escape" && filterDrawer.isOpen()) {
                setFilterDrawerOpen(false);
            }
        });
        documentRef.addEventListener?.("pointerdown", (event) => {
            if (!filterDrawer.isOpen()) return;
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

        bindMediaBrowserPlayerEvents({ getNode, onIntent, toggleVideoPopout, syncVideoPopoutButton });

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
                applyThumbnailStripHeight(thumbnailControls.getStripHeight());
                syncThumbnailPageButtons();
                applyImageViewState(imageView.getState(), { animate: false });
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
                applyThumbnailStripHeight(thumbnailControls.getStripHeight());
                syncThumbnailPageButtons();
                applyImageViewState(imageView.getState(), { animate: false });
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
