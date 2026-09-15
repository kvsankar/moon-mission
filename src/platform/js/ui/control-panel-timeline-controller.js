import {
    computeControlPanelVisualHeight,
    computeTimelineDockVisualHeight,
    resolveTimelineEventCarouselPresentation,
    resolveUpcomingTimelineEventIndex,
} from "../core/domain/control-panel-timeline-state.js";
import { readTimelineSliderMissionState } from "../core/domain/timeline-slider-state.js";
import { invokeMissionPanelAction } from "../app/panel-registry.js";

const TIMELINE_CAROUSEL_WIGGLE_CLASS = "timeline-dock__event-carousel--wiggle";

function createControlPanelTimelineController(deps = {}) {
    const {
        documentRef = globalThis?.document,
        windowRef = globalThis?.window || globalThis,
        requestAnimationFrameImpl = (callback) => {
            if (typeof windowRef?.requestAnimationFrame === "function") {
                return windowRef.requestAnimationFrame(callback);
            }
            return callback();
        },
        setTimeoutImpl = (callback, delayMs) => windowRef?.setTimeout?.(callback, delayMs),
        clearTimeoutImpl = (timeoutId) => windowRef?.clearTimeout?.(timeoutId),
        ResizeObserverClass = globalThis?.ResizeObserver,
        MutationObserverClass = globalThis?.MutationObserver,
        matchMediaImpl = (query) => windowRef?.matchMedia?.(query) || null,
        invokeMissionPanelActionImpl = invokeMissionPanelAction,
        nowImpl = () => Date.now(),
    } = deps;

    let controlPanelResizeBound = false;
    let timelineDockHeightSyncBound = false;
    let timelineCarouselDragBound = false;
    let timelineDockResizeObserver = null;
    let timelineDockMutationObserver = null;
    let timelineCarouselWiggleTimeoutId = null;
    let timelineMediaTrackVisible = false;

    function getControlPanel() {
        return documentRef?.getElementById?.("control-panel") || null;
    }

    function getTimelineDock() {
        return documentRef?.getElementById?.("timeline-dock") || null;
    }

    function getControlPanelToggleButton() {
        return documentRef?.getElementById?.("control-panel-toggle") || null;
    }

    function getTimelineMediaToggleButton() {
        return documentRef?.getElementById?.("timeline-media-toggle") || null;
    }

    function isDockviewPanelsEnabled() {
        return documentRef?.body?.classList?.contains?.("dockview-panels-enabled") === true;
    }

    function getTimelineMarkers() {
        return documentRef?.getElementById?.("timeline-markers") || null;
    }

    function getTimelineMediaMarkers() {
        return documentRef?.getElementById?.("timeline-media-markers") || null;
    }

    function getTimelineMediaRail() {
        return documentRef?.getElementById?.("timeline-media-rail")
            || documentRef?.querySelector?.("#timeline-dock .timeline-dock__media-rail")
            || null;
    }

    function isMissionMediaPanelOpen() {
        const panel = documentRef?.getElementById?.("media-browser-panel") || null;
        return !!panel && !panel.classList?.contains?.("media-browser-panel--hidden");
    }

    function getRootStyle() {
        return documentRef?.documentElement?.style || null;
    }

    function shouldAllowMediaMarkersVisible() {
        const mediaQuery = matchMediaImpl("(min-width: 601px)");
        return mediaQuery?.matches === true;
    }

    function closeMobileOnlyMediaPanelIfNeeded() {
        if (shouldAllowMediaMarkersVisible()) return;
        if (windowRef?.__moonMissionDockviewSpike?.progressiveWorkspace) return;
        invokeMissionPanelActionImpl("workflow:media-browser", "close");
    }

    function syncMediaToggleButton(button = getTimelineMediaToggleButton()) {
        if (!button) return;
        const mediaAvailable = shouldAllowMediaMarkersVisible();
        const pressed = mediaAvailable && timelineMediaTrackVisible;
        button.disabled = !mediaAvailable;
        button.setAttribute?.("aria-disabled", mediaAvailable ? "false" : "true");
        button.setAttribute?.("aria-pressed", pressed ? "true" : "false");
        button.setAttribute?.(
            "aria-label",
            mediaAvailable
                ? (timelineMediaTrackVisible ? "Hide media track" : "Show media track")
                : "Media track is desktop-only for now",
        );
        button.title = mediaAvailable
            ? (timelineMediaTrackVisible ? "Hide media track" : "Show media track")
            : "Media track is desktop-only for now";
    }

    function setTimelineMediaTrackVisibleState(visible) {
        timelineMediaTrackVisible = !!visible;
        const timelineDock = getTimelineDock();
        const mediaRail = getTimelineMediaRail();
        const mediaMarkers = getTimelineMediaMarkers();
        const shouldShowMediaTrack = timelineMediaTrackVisible && shouldAllowMediaMarkersVisible();
        if (!shouldShowMediaTrack) {
            closeMobileOnlyMediaPanelIfNeeded();
        }
        timelineDock?.classList?.toggle?.("timeline-dock--media-track-visible", shouldShowMediaTrack);
        if (mediaRail) {
            mediaRail.hidden = !shouldShowMediaTrack;
        }
        if (mediaMarkers) {
            mediaMarkers.hidden = !shouldShowMediaTrack;
        }
        syncMediaToggleButton();
    }

    function handleMissionMediaPanelState(event) {
        const isOpen = event?.detail?.isOpen === true
            || String(event?.detail?.state || "").trim().toLowerCase() === "open";
        setTimelineMediaTrackVisibleState(isOpen);
        requestAnimationFrameImpl(() => syncTimelineDockHeight());
    }

    function syncControlPanelInfoOffset(panel = getControlPanel()) {
        if (!panel) return;
        const rootStyle = getRootStyle();
        if (!rootStyle) return;
        const panelHeight = panel.getBoundingClientRect?.()?.height;
        const collapsed = panel.classList?.contains?.("control-panel--collapsed");
        rootStyle.setProperty(
            "--control-panel-visual-height",
            `${computeControlPanelVisualHeight({ collapsed, panelHeight })}px`,
        );
    }

    function syncTimelineDockHeight(timelineDock = getTimelineDock()) {
        if (!timelineDock) return;
        const rootStyle = getRootStyle();
        if (!rootStyle) return;
        const dockHeight = timelineDock.getBoundingClientRect?.()?.height;
        rootStyle.setProperty(
            "--timeline-dock-height",
            `${computeTimelineDockVisualHeight(dockHeight)}px`,
        );
    }

    function setControlPanelCollapsedState(collapsed) {
        const panel = getControlPanel();
        if (!panel) return;
        const nextCollapsed = isDockviewPanelsEnabled() ? false : !!collapsed;
        if (panel.classList?.contains?.("control-panel--collapsed") === nextCollapsed) return;
        panel.classList?.toggle?.("control-panel--collapsed", nextCollapsed);
        requestAnimationFrameImpl(() => syncControlPanelInfoOffset(panel));
    }

    function getTimelineCurrentTimeMs() {
        const slider = documentRef?.getElementById?.("timeline-slider");
        const timelineState = readTimelineSliderMissionState(slider);
        return Number.isFinite(timelineState?.value) ? timelineState.value : Number.NaN;
    }

    function resolveUpcomingTimelineEventButton() {
        const buttons = Array.from(
            documentRef?.querySelectorAll?.("#burnbuttons button[data-event-index]") || [],
        );
        if (!buttons.length) return null;

        const nextIndex = resolveUpcomingTimelineEventIndex(
            buttons.map((button) => Number(button?.dataset?.eventTimeMs)),
            getTimelineCurrentTimeMs(),
        );

        if (nextIndex < 0) {
            return buttons[0] || null;
        }
        return buttons[nextIndex] || null;
    }

    function scrollTimelineEventButtonIntoView(button) {
        if (!button || typeof button.scrollIntoView !== "function") return;
        button.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
            inline: "center",
        });
    }

    function focusUpcomingTimelineEventButton() {
        scrollTimelineEventButtonIntoView(resolveUpcomingTimelineEventButton());
    }

    function triggerTimelineCarouselWiggle() {
        if (matchMediaImpl("(prefers-reduced-motion: reduce)")?.matches) return;
        const carousel = documentRef?.querySelector?.("#timeline-dock .timeline-dock__event-carousel");
        if (!carousel) return;
        carousel.classList?.remove?.(TIMELINE_CAROUSEL_WIGGLE_CLASS);
        void carousel.offsetWidth;
        carousel.classList?.add?.(TIMELINE_CAROUSEL_WIGGLE_CLASS);
        if (timelineCarouselWiggleTimeoutId !== null) {
            clearTimeoutImpl(timelineCarouselWiggleTimeoutId);
        }
        timelineCarouselWiggleTimeoutId = setTimeoutImpl(() => {
            carousel.classList?.remove?.(TIMELINE_CAROUSEL_WIGGLE_CLASS);
            timelineCarouselWiggleTimeoutId = null;
        }, 480);
    }

    function setTimelineEventCarouselExpandedState(expanded, options = {}) {
        const timelineDock = getTimelineDock();
        const button = getControlPanelToggleButton();
        const markers = getTimelineMarkers();
        const mediaMarkers = getTimelineMediaMarkers();
        if (!timelineDock || !button) return;
        const nextExpanded = !!expanded;
        const wasExpanded = !timelineDock.classList?.contains?.("timeline-dock--events-collapsed");
        timelineDock.classList?.toggle?.("timeline-dock--events-collapsed", !nextExpanded);
        if (markers) {
            markers.hidden = !nextExpanded;
        }
        const mediaRail = getTimelineMediaRail();
        const shouldShowMediaTrack = timelineMediaTrackVisible && shouldAllowMediaMarkersVisible();
        timelineDock.classList?.toggle?.("timeline-dock--media-track-visible", shouldShowMediaTrack);
        if (mediaMarkers) {
            mediaMarkers.hidden = !shouldShowMediaTrack;
        }
        if (mediaRail) {
            mediaRail.hidden = !shouldShowMediaTrack;
        }
        requestAnimationFrameImpl(() => syncTimelineDockHeight(timelineDock));

        const uiState = resolveTimelineEventCarouselPresentation(nextExpanded);
        button.setAttribute?.("aria-expanded", uiState.ariaExpanded);
        button.setAttribute?.("aria-pressed", nextExpanded ? "true" : "false");
        button.setAttribute?.("aria-label", uiState.ariaLabel);
        button.title = uiState.title;

        if (!nextExpanded || wasExpanded) return;

        const { focusUpcoming = true, wiggleCue = true } = options;
        requestAnimationFrameImpl(() => {
            if (focusUpcoming) {
                focusUpcomingTimelineEventButton();
            }
            if (wiggleCue) {
                triggerTimelineCarouselWiggle();
            }
        });
    }

    function bindTimelineDockHeightSync(timelineDock = getTimelineDock()) {
        if (!timelineDock || timelineDockHeightSyncBound) return;
        timelineDockHeightSyncBound = true;

        const scheduleSync = () => requestAnimationFrameImpl(() => syncTimelineDockHeight(timelineDock));
        scheduleSync();

        [80, 180, 320, 520, 900].forEach((delayMs) => {
            setTimeoutImpl(scheduleSync, delayMs);
        });

        if (typeof ResizeObserverClass === "function") {
            timelineDockResizeObserver = new ResizeObserverClass(() => {
                scheduleSync();
            });
            timelineDockResizeObserver.observe?.(timelineDock);
        }

        const burnButtons = documentRef?.getElementById?.("burnbuttons");
        if (burnButtons && typeof MutationObserverClass === "function") {
            timelineDockMutationObserver = new MutationObserverClass(() => {
                scheduleSync();
            });
            timelineDockMutationObserver.observe?.(burnButtons, {
                childList: true,
                subtree: true,
                attributes: true,
            });
        }
    }

    function bindTimelineCarouselDragGesture() {
        if (timelineCarouselDragBound) return;
        const carousel = documentRef?.querySelector?.("#timeline-dock .timeline-dock__event-carousel");
        if (!carousel) return;
        timelineCarouselDragBound = true;

        const dragState = {
            pointerId: null,
            startX: 0,
            startScrollLeft: 0,
            dragging: false,
            suppressClickUntilMs: 0,
        };
        const DRAG_THRESHOLD_PX = 4;
        const CLICK_SUPPRESS_MS = 220;

        const clearDragState = () => {
            dragState.pointerId = null;
            dragState.dragging = false;
            carousel.classList?.remove?.("is-dragging");
        };

        const onPointerMoveWindow = (event) => {
            if (dragState.pointerId == null || event.pointerId !== dragState.pointerId) return;
            const deltaX = event.clientX - dragState.startX;
            if (!dragState.dragging && Math.abs(deltaX) >= DRAG_THRESHOLD_PX) {
                dragState.dragging = true;
                carousel.classList?.add?.("is-dragging");
            }
            if (!dragState.dragging) return;
            carousel.scrollLeft = dragState.startScrollLeft - deltaX;
            event.preventDefault?.();
        };

        const endDragWindow = (event) => {
            if (dragState.pointerId == null || event.pointerId !== dragState.pointerId) return;
            if (dragState.dragging) {
                dragState.suppressClickUntilMs = nowImpl() + CLICK_SUPPRESS_MS;
            }
            clearDragState();
        };

        const onPointerDown = (event) => {
            if (event.button !== 0) return;
            if (event.pointerType !== "mouse") return;
            dragState.pointerId = event.pointerId;
            dragState.startX = event.clientX;
            dragState.startScrollLeft = carousel.scrollLeft;
            dragState.dragging = false;
            carousel.classList?.remove?.("is-dragging");
        };

        carousel.addEventListener?.("pointerdown", onPointerDown, true);
        windowRef?.addEventListener?.("pointermove", onPointerMoveWindow, true);
        windowRef?.addEventListener?.("pointerup", endDragWindow, true);
        windowRef?.addEventListener?.("pointercancel", endDragWindow, true);
        windowRef?.addEventListener?.("blur", clearDragState);

        carousel.addEventListener?.("click", (event) => {
            if (nowImpl() > dragState.suppressClickUntilMs) return;
            event.preventDefault?.();
            event.stopPropagation?.();
        }, true);
    }

    function bind() {
        const panel = getControlPanel();
        const timelineDock = getTimelineDock();
        const button = getControlPanelToggleButton();
        const mediaButton = getTimelineMediaToggleButton();
        if (!panel || !timelineDock || !button) return;
        if (button.dataset?.bound === "true") return;

        button.dataset.bound = "true";
        if (mediaButton?.dataset) {
            mediaButton.dataset.bound = "true";
        }
        bindTimelineCarouselDragGesture();
        bindTimelineDockHeightSync(timelineDock);
        setControlPanelCollapsedState(false);
        setTimelineEventCarouselExpandedState(false, { focusUpcoming: false, wiggleCue: false });
        setTimelineMediaTrackVisibleState(isMissionMediaPanelOpen());
        documentRef?.addEventListener?.("mission-media-panel-state", handleMissionMediaPanelState);
        requestAnimationFrameImpl(() => {
            syncControlPanelInfoOffset(panel);
            syncTimelineDockHeight(timelineDock);
        });
        button.addEventListener?.("click", () => {
            const shouldExpand = timelineDock.classList?.contains?.("timeline-dock--events-collapsed");
            setTimelineEventCarouselExpandedState(shouldExpand);
        });
        mediaButton?.addEventListener?.("click", () => {
            if (mediaButton.disabled) return;
            const nextVisible = !timelineMediaTrackVisible;
            setTimelineMediaTrackVisibleState(nextVisible);
            if (nextVisible) {
                invokeMissionPanelActionImpl("workflow:media-browser", "open");
            } else {
                invokeMissionPanelActionImpl("workflow:media-browser", "close");
            }
            requestAnimationFrameImpl(() => syncTimelineDockHeight(timelineDock));
        });

        if (!controlPanelResizeBound) {
            controlPanelResizeBound = true;
            windowRef?.addEventListener?.("resize", () => {
                syncControlPanelInfoOffset();
                syncTimelineDockHeight();
                closeMobileOnlyMediaPanelIfNeeded();
                setTimelineMediaTrackVisibleState(timelineMediaTrackVisible);
            });
        }
    }

    return {
        bind,
        setControlPanelCollapsedState,
        setTimelineEventCarouselExpandedState,
        setTimelineMediaTrackVisibleState,
        syncControlPanelInfoOffset,
        syncTimelineDockHeight,
    };
}

export { createControlPanelTimelineController };
