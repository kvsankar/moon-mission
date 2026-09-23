import { clamp, normalizeWheelDelta, resolveWheelZoomFactor } from "./timeline-dock-model.js";

export function createTimelineDockPointer({
    dockRoot,
    slider,
    playhead,
    onSeekTime,
    syncMarkerHighlights,
    getDirectMediaMarkerTargetIndex,
    selectMediaMarkerByIndex,
    selectMediaMarkerAtTime,
    getRangeMin,
    getRangeMax,
    getViewMin,
    getViewMax,
    getCurrentTimeMs,
    setCurrentTimeMs,
    updateCurrentLabel,
    getTrackWidthPx,
    getTimelinePointerSurface,
    isNodeWithin,
    resolvePointerZone,
    getTimelineRect,
    getFullSpanMs,
    getViewSpanMs,
    isTimelineZoomed,
    syncTimelineOverview,
    syncSliderTimelineDataset,
    syncPlayhead,
    dispatchTimelineUserSeek,
    resolveZoomAnchor,
    zoomView,
    panView,
    panViewFromDrag,
}) {
    let timelineDragState = null;
    const timelineDragThresholdPx = 3;

    function getTimeAtClientX(clientX) {
        const rect = getTimelineRect();
        if (!rect || !Number.isFinite(rect.width) || rect.width <= 0) {
            return resolveZoomAnchor();
        }
        const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
        return getViewMin() + getViewSpanMs() * ratio;
    }

    function getDragDeltaTimeMs(startClientX, clientX) {
        const rect = getTimelineRect();
        if (!rect || !Number.isFinite(rect.width) || rect.width <= 0) return 0;
        const deltaRatio = (clientX - startClientX) / rect.width;
        return getViewSpanMs() * deltaRatio;
    }

    function getThumbClientX() {
        const rect = getTimelineRect();
        const spanMs = getViewSpanMs();
        if (!rect || !Number.isFinite(rect.width) || rect.width <= 0 || spanMs <= 0) {
            return Number.NaN;
        }
        const valueMs = clamp(Number(slider.value), getViewMin(), getViewMax());
        const ratio = clamp((valueMs - getViewMin()) / spanMs, 0, 1);
        return rect.left + rect.width * ratio;
    }

    function getClientXAtTime(timeMs) {
        const rect = getTimelineRect();
        const spanMs = getViewSpanMs();
        if (!Number.isFinite(timeMs) || !rect || !Number.isFinite(rect.width) || rect.width <= 0 || spanMs <= 0) {
            return Number.NaN;
        }
        const clampedTimeMs = clamp(timeMs, getViewMin(), getViewMax());
        const ratio = clamp((clampedTimeMs - getViewMin()) / spanMs, 0, 1);
        return rect.left + rect.width * ratio;
    }

    function isNearSliderThumb(clientX) {
        const thumbClientX = getThumbClientX();
        return Number.isFinite(thumbClientX) && Math.abs(clientX - thumbClientX) <= 24;
    }

    function isPlayheadPointerTarget(target) {
        if (!playhead || playhead.hidden === true) return false;
        return isNodeWithin(playhead, target);
    }

    function resolveTimelinePointTarget(target) {
        const surface = getTimelinePointerSurface();
        let node = target;
        while (node && node !== surface) {
            const className = typeof node.className === "string" ? node.className : "";
            if (
                className.split(/\s+/).some((name) => (
                    name === "timeline-dock__marker" ||
                    name === "timeline-dock__media-marker"
                ))
            ) {
                return node;
            }
            node = node.parentElement;
        }
        return null;
    }

    function isNearTimelinePointGlyph(pointTarget, clientX) {
        if (!pointTarget || !Number.isFinite(clientX)) {
            return false;
        }

        const className = typeof pointTarget.className === "string" ? pointTarget.className : "";
        const classSet = new Set(className.split(/\s+/).filter(Boolean));
        const isMediaMarker = classSet.has("timeline-dock__media-marker");
        const isSegmentMarker = classSet.has("timeline-dock__media-marker--segment");
        if (isSegmentMarker) {
            const startTimeMs = Number(pointTarget?.dataset?.mediaStartTimeMs);
            const endTimeMs = Number(pointTarget?.dataset?.mediaEndTimeMs);
            const startClientX = getClientXAtTime(startTimeMs);
            const endClientX = getClientXAtTime(endTimeMs);
            if (Number.isFinite(startClientX) && Number.isFinite(endClientX) && endClientX > startClientX) {
                const insetPx = Math.min(8, (endClientX - startClientX) * 0.2);
                return clientX >= (startClientX + insetPx) && clientX <= (endClientX - insetPx);
            }
        }

        const centerTimeMs = Number.isFinite(Number(pointTarget?.dataset?.eventTimeMs))
            ? Number(pointTarget.dataset.eventTimeMs)
            : Number(pointTarget?.dataset?.mediaStartTimeMs);
        const markerCenterClientX = getClientXAtTime(centerTimeMs);
        if (Number.isFinite(markerCenterClientX)) {
            const glyphRadiusPx = isMediaMarker ? 6 : 5;
            return Math.abs(clientX - markerCenterClientX) <= glyphRadiusPx;
        }

        return true;
    }

    function isMediaSegmentPointTarget(pointTarget) {
        if (!pointTarget) return false;
        const className = typeof pointTarget.className === "string" ? pointTarget.className : "";
        const classSet = new Set(className.split(/\s+/).filter(Boolean));
        return classSet.has("timeline-dock__media-marker") &&
            classSet.has("timeline-dock__media-marker--segment");
    }

    function isMediaMarkerPointTarget(pointTarget) {
        if (!pointTarget) return false;
        const className = typeof pointTarget.className === "string" ? pointTarget.className : "";
        return className.split(/\s+/).includes("timeline-dock__media-marker");
    }

    function seekToTime(timeMs, commit) {
        if (!Number.isFinite(timeMs)) return;
        setCurrentTimeMs(clamp(timeMs, getRangeMin(), getRangeMax()));
        slider.value = String(clamp(getCurrentTimeMs(), getViewMin(), getViewMax()));
        syncSliderTimelineDataset();
        updateCurrentLabel(getCurrentTimeMs());
        syncMarkerHighlights();
        syncPlayhead();
        syncTimelineOverview();
        onSeekTime?.(getCurrentTimeMs(), commit === true);
    }

    function endTimelineDrag(event, cancelled = false) {
        if (!timelineDragState) return;
        const state = timelineDragState;
        timelineDragState = null;
        dockRoot?.classList?.remove?.("timeline-dock--timeline-dragging");
        if (Number.isFinite(state.pointerId)) {
            state.captureTarget?.releasePointerCapture?.(state.pointerId);
        }

        if (cancelled) {
            dispatchTimelineUserSeek("cancel", state.lastTimeMs, {
                commit: false,
                source: "timeline-drag",
            });
            return;
        }

        if ((state.mode === "click-lane" || state.mode === "media-click-lane") && state.moved) {
            dispatchTimelineUserSeek("cancel", state.lastTimeMs, {
                commit: false,
                source: "timeline-click",
            });
            return;
        }

        if (state.mode === "scrub") {
            return;
        }

        const finalTimeMs = Number.isFinite(event?.clientX)
            ? getTimeAtClientX(event.clientX)
            : state.lastTimeMs;
        if (state.mode === "playhead") {
            seekToTime(finalTimeMs, true);
            dispatchTimelineUserSeek(state.moved ? "end" : "commit", finalTimeMs, {
                commit: true,
                source: "timeline-playhead",
            });
            return;
        }
        if (state.mode === "media-click-lane" && selectMediaMarkerByIndex(Number(state.mediaMarkerIndex), finalTimeMs)) {
            return;
        }
        if (state.mode === "media-click-lane" && selectMediaMarkerAtTime(finalTimeMs, event)) {
            return;
        }
        seekToTime(finalTimeMs, true);
        dispatchTimelineUserSeek(state.moved ? "end" : "commit", finalTimeMs, {
            commit: true,
            source: "timeline-click",
        });
    }

    function beginTimelineDrag(event) {
        if (!event || event.isPrimary === false) return;
        if (event.pointerType === "mouse" && event.button !== 0) return;
        const clientX = Number(event.clientX);
        const clientY = Number(event.clientY);
        if (!Number.isFinite(clientX) || getFullSpanMs() <= 0) return;
        const pointTarget = resolveTimelinePointTarget(event.target);
        if (
            pointTarget &&
            !isMediaMarkerPointTarget(pointTarget) &&
            isNearTimelinePointGlyph(pointTarget, clientX)
        ) {
            return;
        }
        const pointerSurface = getTimelinePointerSurface();
        const pointerZone = resolvePointerZone(event, clientX, clientY);
        if (!pointerZone) return;

        event.preventDefault?.();
        pointerSurface?.setPointerCapture?.(event.pointerId);
        const initialTimeMs = getTimeAtClientX(clientX);
        timelineDragState = {
            pointerId: event.pointerId,
            startClientX: clientX,
            startTimeMs: Number.isFinite(getCurrentTimeMs())
                ? getCurrentTimeMs()
                : clamp(Number(slider.value), getViewMin(), getViewMax()),
            startViewMin: getViewMin(),
            startViewMax: getViewMax(),
            moved: false,
            lastTimeMs: initialTimeMs,
            mode: pointerZone,
            captureTarget: pointerSurface,
            mediaMarkerIndex: pointerZone === "media-click-lane"
                ? getDirectMediaMarkerTargetIndex(event)
                : -1,
        };
        if (pointerZone === "scrub" || pointerZone === "playhead") {
            dockRoot?.classList?.add?.("timeline-dock--timeline-dragging");
        }
    }

    function updateTimelineDrag(event) {
        if (!timelineDragState) return;
        if (
            Number.isFinite(timelineDragState.pointerId) &&
            Number.isFinite(event?.pointerId) &&
            event.pointerId !== timelineDragState.pointerId
        ) {
            return;
        }

        const clientX = Number(event?.clientX);
        if (!Number.isFinite(clientX)) return;
        const moveDeltaPx = Math.abs(clientX - Number(timelineDragState.startClientX));
        if (!timelineDragState.moved && moveDeltaPx < timelineDragThresholdPx) {
            return;
        }
        event.preventDefault?.();
        timelineDragState.moved = true;
        if (timelineDragState.mode === "playhead") {
            const nextTimeMs = getTimeAtClientX(clientX);
            timelineDragState.lastTimeMs = nextTimeMs;
            seekToTime(nextTimeMs, false);
            dispatchTimelineUserSeek("update", nextTimeMs, {
                commit: false,
                source: "timeline-playhead",
            });
            return;
        }
        if (timelineDragState.mode !== "scrub") {
            timelineDragState.lastTimeMs = getTimeAtClientX(clientX);
            return;
        }
        panViewFromDrag(
            Number(timelineDragState.startViewMin),
            Number(timelineDragState.startViewMax),
            Number(timelineDragState.startClientX),
            clientX,
        );
        timelineDragState.lastTimeMs = getCurrentTimeMs();
    }

    function handleTimelineWheel(event) {
        if (getFullSpanMs() <= 0) return;
        const widthPx = getTrackWidthPx();
        const deltaMode = Number(event.deltaMode || 0);
        const deltaX = normalizeWheelDelta(Number(event.deltaX || 0), deltaMode, widthPx);
        const deltaY = normalizeWheelDelta(Number(event.deltaY || 0), deltaMode, widthPx);
        const horizontalDelta = Math.abs(deltaX) > Math.abs(deltaY)
            ? deltaX
            : (event.shiftKey ? deltaY : 0);

        if (horizontalDelta !== 0 && isTimelineZoomed()) {
            event.preventDefault?.();
            panView(getViewSpanMs() * horizontalDelta * 0.0012);
            return;
        }

        if (deltaY === 0) return;
        event.preventDefault?.();
        zoomView(resolveWheelZoomFactor(deltaY), getTimeAtClientX(event.clientX));
    }

    function handleTimelineDoubleClick(event) {
        if (!event || getFullSpanMs() <= 0) return;
        const clientX = Number(event.clientX);
        const pointTarget = resolveTimelinePointTarget(event.target);
        if (pointTarget && isNearTimelinePointGlyph(pointTarget, clientX)) return;
        event.preventDefault?.();
        zoomView(0.5, getTimeAtClientX(event.clientX));
    }

    return {
        getTimeAtClientX,
        getDragDeltaTimeMs,
        getClientXAtTime,
        isPlayheadPointerTarget,
        seekToTime,
        endTimelineDrag,
        beginTimelineDrag,
        updateTimelineDrag,
        handleTimelineWheel,
        handleTimelineDoubleClick,
    };
}
