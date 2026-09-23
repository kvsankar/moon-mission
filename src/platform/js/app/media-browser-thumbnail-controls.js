import {
    THUMBNAIL_STRIP_MIN_HEIGHT_PX,
    THUMBNAIL_STRIP_DEFAULT_HEIGHT_PX,
    THUMBNAIL_STRIP_MAX_HEIGHT_PX,
    THUMBNAIL_STRIP_MIN_SIDE_WIDTH_PX,
    THUMBNAIL_STRIP_DEFAULT_SIDE_WIDTH_PX,
    THUMBNAIL_STRIP_MAX_SIDE_WIDTH_PX,
    THUMBNAIL_STRIP_MIN_STAGE_HEIGHT_PX,
    THUMBNAIL_STRIP_MIN_STAGE_WIDTH_PX,
    THUMBNAIL_STRIP_KEYBOARD_STEP_PX,
    THUMBNAIL_STRIP_KEYBOARD_LARGE_STEP_PX,
    THUMBNAIL_SCROLLER_DRAG_THRESHOLD_PX,
    THUMBNAIL_STRIP_PLACEMENTS,
    THUMBNAIL_DISCLOSURE_LEVELS,
    THUMBNAIL_DISCLOSURE_LEVEL_CLASS_PREFIX,
} from "./media-browser-config.js";
import { clamp, normalizeThumbnailStripPlacement, isVerticalThumbnailStripPlacement, resolveThumbnailDisclosureLevel } from "./media-browser-policy.js";
import { getDocumentRef, getWindowRef, isElementLike, createElement } from "./media-browser-dom.js";

export function createMediaBrowserThumbnailControls({
    restoredPanelLayout,
    getNode,
    getWrapper,
    persistPanelLayoutState,
    applyImageViewState,
    getImageViewState,
    revealActiveThumbnail,
}) {
    let thumbnailResizeDragState = null;
    let thumbnailPlacementDragState = null;
    let thumbnailScrollerDragState = null;
    let thumbnailPagingTargetScrollLeft = null;
    let suppressThumbnailClick = false;
    let thumbnailStripHeight = Number.isFinite(Number(restoredPanelLayout?.thumbnailStripHeight))
        && Number(restoredPanelLayout.thumbnailStripHeight) > 0
        ? Math.round(Number(restoredPanelLayout.thumbnailStripHeight))
        : THUMBNAIL_STRIP_DEFAULT_HEIGHT_PX;
    let thumbnailStripPlacement = normalizeThumbnailStripPlacement(restoredPanelLayout?.thumbnailStripPlacement);
    let thumbnailStripCollapsed = restoredPanelLayout?.thumbnailStripCollapsed === true;

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
        applyImageViewState(getImageViewState(), { animate: false });
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
        applyImageViewState(getImageViewState(), { animate: false });
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
            applyImageViewState(getImageViewState(), { animate: false });
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

    return {
        isThumbnailStripVertical,
        applyThumbnailStripHeight,
        bindThumbnailStripResizer,
        bindThumbnailStripDragging,
        syncThumbnailPageButtons,
        bindThumbnailPageButtons,
        getStripHeight: () => thumbnailStripHeight,
        getPlacement: () => thumbnailStripPlacement,
        isCollapsed: () => thumbnailStripCollapsed === true,
        getPagingTargetScrollLeft: () => thumbnailPagingTargetScrollLeft,
        resetPagingTargetScrollLeft: () => { thumbnailPagingTargetScrollLeft = null; },
        isClickSuppressed: () => suppressThumbnailClick === true,
    };
}
