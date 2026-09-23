import { formatDateTimeLocal } from "../utils/time-utils.js";
import { resolveTimelineEventHoverText, resolveTimelineEventLabel } from "./comparison-timeline.js";
import { resolveTimelineEventHighlightState } from "../core/domain/timeline-event-highlight-state.js";
import { clamp, computePercent, buildEventSignature, buildMediaSignature } from "./timeline-dock-model.js";

const EVENT_MARKER_HOVERED_CLASS = "timeline-dock__marker--hovered";

export function createTimelineDockMarkers({
    markers,
    mediaMarkers,
    getViewMin,
    getViewMax,
    getCurrentTimeMs,
    getCurrentMode,
    onMarkerSelect,
    onMarkerHover,
    onMarkerLeave,
    syncHoveredVisibleEventRange,
    dispatchTimelineUserSeek,
    renderEventMarkersFromCache,
    renderMediaMarkersFromCache,
    getTimeAtClientX,
    getClientXAtTime,
    seekToTime,
    dispatchDocumentCustomEvent,
}) {
    let lastEventSignature = "";
    let lastEventInfos = [];
    let lastMediaSignature = "";
    let lastMediaMarkersData = [];
    let hoveredEventMarker = null;
    let hoveredVisibleEventRange = null;
    let mediaPreviewElement = null;
    let mediaPreviewImage = null;
    let mediaPreviewTitle = null;
    let activeMediaPreviewMarker = null;
    let pendingMediaPreviewSource = "";
    const failedMediaPreviewSources = new Set();

    function setElementClass(element, className, enabled) {
        if (!element?.classList) return;
        if (enabled) {
            element.classList.add(className);
        } else {
            element.classList.remove(className);
        }
    }

    function clearHoveredEventMarker() {
        if (hoveredEventMarker?.classList) {
            hoveredEventMarker.classList.remove(EVENT_MARKER_HOVERED_CLASS);
        }
        hoveredEventMarker = null;
    }

    function markerMatchesHoverDetail(marker, detail = {}) {
        if (!marker?.dataset) return false;
        const eventKey = String(detail.eventKey || "");
        const eventSourceKey = String(detail.eventSourceKey || "");
        if (eventKey && marker.dataset.eventKey === eventKey) return true;
        if (eventSourceKey && marker.dataset.eventSourceKey === eventSourceKey) return true;
        const eventTimeMs = Number(detail.eventTimeMs);
        const markerTimeMs = Number(marker.dataset.eventTimeMs);
        return Number.isFinite(eventTimeMs) &&
            Number.isFinite(markerTimeMs) &&
            Math.abs(eventTimeMs - markerTimeMs) <= 1;
    }

    function setHoveredEventMarker(detail = {}, hovered = true) {
        clearHoveredEventMarker();
        if (!hovered) return;
        const marker = Array.from(markers.children || [])
            .find((candidate) => markerMatchesHoverDetail(candidate, detail));
        if (!marker?.classList) return;
        marker.classList.add(EVENT_MARKER_HOVERED_CLASS);
        hoveredEventMarker = marker;
    }

    function setHoveredVisibleEventRange(detail = {}) {
        if (detail?.active !== true) {
            hoveredVisibleEventRange = null;
            syncHoveredVisibleEventRange();
            return;
        }
        const startTimeMs = Number(detail.startTimeMs);
        const endTimeMs = Number(detail.endTimeMs);
        if (!Number.isFinite(startTimeMs) || !Number.isFinite(endTimeMs)) {
            hoveredVisibleEventRange = null;
            syncHoveredVisibleEventRange();
            return;
        }
        hoveredVisibleEventRange = { startTimeMs, endTimeMs };
        syncHoveredVisibleEventRange();
    }

    function syncMarkerHighlights() {
        const markerNodes = Array.from(markers.children || []);
        if (markerNodes.length === 0) return;

        const highlightState = resolveTimelineEventHighlightState({
            events: markerNodes.map((marker) => ({
                timeMs: Number(marker?.dataset?.eventTimeMs),
            })),
            currentTimeMs: getCurrentTimeMs(),
        });
        const currentIndexes = new Set(highlightState.currentIndexes);
        const boundaryIndexes = new Set(highlightState.boundaryIndexes);
        for (let index = 0; index < markerNodes.length; index += 1) {
            const marker = markerNodes[index];
            const isCurrent = currentIndexes.has(index);
            setElementClass(marker, "timeline-dock__marker--current-event", isCurrent);
            setElementClass(
                marker,
                "timeline-dock__marker--time-boundary",
                !isCurrent && boundaryIndexes.has(index),
            );
        }
    }

    function renderMarker(eventInfo, index) {
        const eventTimeMs = eventInfo?.startTime instanceof Date
            ? eventInfo.startTime.getTime()
            : Number.NaN;
        if (!Number.isFinite(eventTimeMs)) return null;
        if (eventTimeMs < getViewMin() || eventTimeMs > getViewMax()) return null;

        const marker = document.createElement("button");
        marker.type = "button";
        const markerClasses = ["timeline-dock__marker"];
        if (eventInfo?.comparisonEvent || eventInfo?.timelineRole === "comparison") {
            markerClasses.push("timeline-dock__marker--comparison");
        }
        if (eventInfo?.burnFlag) {
            markerClasses.push("timeline-dock__marker--burn");
        }
        if (eventInfo?.generated) {
            markerClasses.push("timeline-dock__marker--generated");
        }
        if (eventInfo?.clickable === false) {
            markerClasses.push("timeline-dock__marker--inactive");
            marker.setAttribute("aria-disabled", "true");
        }
        marker.className = markerClasses.join(" ");
        marker.dataset.eventKey = eventInfo?.key || "";
        marker.dataset.eventSourceKey = eventInfo?.timelineSourceKey || eventInfo?.key || "";
        marker.dataset.eventIndex = String(index);
        marker.dataset.eventTimeMs = String(eventTimeMs);
        marker.style.left = `${computePercent(eventTimeMs, getViewMin(), getViewMax())}%`;
        const markerLabel = resolveTimelineEventLabel(eventInfo);
        const hoverText = resolveTimelineEventHoverText(eventInfo) || "Event";
        const generatedSuffix = eventInfo?.generatedLabel
            ? `\n${eventInfo.generatedLabel}`
            : "";
        marker.title = getCurrentMode().compareMode
            ? `${markerLabel}\n${hoverText}${generatedSuffix}`
            : `${markerLabel} - ${formatDateTimeLocal(eventTimeMs)}\n${hoverText}${generatedSuffix}`;
        marker.setAttribute("aria-label", marker.title);
        marker.addEventListener("mouseenter", () => {
            setHoveredEventMarker({
                eventKey: eventInfo?.key || "",
                eventSourceKey: eventInfo?.timelineSourceKey || eventInfo?.key || "",
                eventTimeMs,
            }, true);
            onMarkerHover?.(eventInfo, index);
        });
        marker.addEventListener("focus", () => {
            setHoveredEventMarker({
                eventKey: eventInfo?.key || "",
                eventSourceKey: eventInfo?.timelineSourceKey || eventInfo?.key || "",
                eventTimeMs,
            }, true);
            onMarkerHover?.(eventInfo, index);
        });
        marker.addEventListener("mouseleave", () => {
            setHoveredEventMarker({}, false);
            onMarkerLeave?.(eventInfo, index);
        });
        marker.addEventListener("blur", () => {
            setHoveredEventMarker({}, false);
            onMarkerLeave?.(eventInfo, index);
        });
        if (eventInfo?.clickable !== false) {
            marker.addEventListener("click", () => {
                seekToTime(eventTimeMs, true);
                dispatchTimelineUserSeek("commit", eventTimeMs, {
                    commit: true,
                    source: "timeline-event-marker",
                });
                onMarkerSelect?.(eventInfo, index);
            });
        }
        return marker;
    }

    function resolveMediaMarkerTargetTime(markerInfo, timeMs) {
        const markerTimeMs = markerInfo?.startTime instanceof Date
            ? markerInfo.startTime.getTime()
            : Number(markerInfo?.startTimeMs);
        if (!Number.isFinite(markerTimeMs)) return Number.NaN;
        const markerEndTimeMs = Number(markerInfo?.endTimeMs);
        const isSegment = markerInfo?.mediaDisplayMode === "segment"
            && Number.isFinite(markerEndTimeMs)
            && markerEndTimeMs > markerTimeMs;
        if (!isSegment) return markerTimeMs;
        return clamp(Number.isFinite(timeMs) ? timeMs : markerTimeMs, markerTimeMs, markerEndTimeMs);
    }

    function dispatchMediaMarkerSelection(markerInfo, index, targetTimeMs) {
        if (!markerInfo || markerInfo.clickable === false || !Number.isFinite(targetTimeMs)) return false;
        seekToTime(targetTimeMs, true);
        dispatchTimelineUserSeek("commit", targetTimeMs, {
            commit: true,
            source: "timeline-media-marker",
        });
        dispatchDocumentCustomEvent("mission-media-marker-select", {
            marker: markerInfo,
            index,
            timeMs: targetTimeMs,
        });
        return true;
    }

    function getMediaMarkerElementIndex(element) {
        const index = Number(element?.dataset?.mediaIndex);
        return Number.isInteger(index) && index >= 0 ? index : -1;
    }

    function findMediaMarkerElementTarget(target) {
        let node = target;
        while (node && node !== mediaMarkers) {
            const className = typeof node.className === "string" ? node.className : "";
            if (className.split(/\s+/).includes("timeline-dock__media-marker")) {
                return node;
            }
            node = node.parentElement;
        }
        return null;
    }

    function resolveMediaMarkerClickRank(markerInfo) {
        const mediaKind = String(markerInfo?.mediaKind || "").trim();
        if (mediaKind === "videoClip") return 0;
        if (mediaKind === "audioClip") return 1;
        return 2;
    }

    function resolveRenderedMediaMarkerIndexAtPointer(clientX, clientY, timeMs) {
        if (!mediaMarkers || !Number.isFinite(clientX)) return -1;
        const laneRect = mediaMarkers.getBoundingClientRect?.();
        if (Number.isFinite(clientY) && laneRect) {
            const laneTop = Number(laneRect.top);
            const laneHeight = Number(laneRect.height);
            if (
                Number.isFinite(laneTop) &&
                Number.isFinite(laneHeight) &&
                laneHeight > 0 &&
                (clientY < laneTop || clientY > laneTop + laneHeight)
            ) {
                return -1;
            }
        }

        const children = Array.from(mediaMarkers.children || []);
        let bestCandidate = null;
        for (let childIndex = children.length - 1; childIndex >= 0; childIndex -= 1) {
            const child = children[childIndex];
            if (child?.hidden === true) continue;
            const className = typeof child.className === "string" ? child.className : "";
            if (!className.split(/\s+/).includes("timeline-dock__media-marker")) continue;
            const rect = child.getBoundingClientRect?.();
            if (!rect || !Number.isFinite(rect.left) || !Number.isFinite(rect.width) || rect.width <= 0) continue;
            if (clientX >= rect.left && clientX <= rect.left + rect.width) {
                const index = getMediaMarkerElementIndex(child);
                const markerInfo = lastMediaMarkersData[index];
                if (!markerInfo || markerInfo.clickable === false) continue;
                const centerDistancePx = Math.abs(clientX - (rect.left + rect.width / 2));
                const startTimeMs = Number(markerInfo.startTimeMs);
                const timeDistanceMs = Number.isFinite(timeMs) && Number.isFinite(startTimeMs)
                    ? Math.abs(timeMs - startTimeMs)
                    : Number.POSITIVE_INFINITY;
                const candidate = {
                    index,
                    rank: resolveMediaMarkerClickRank(markerInfo),
                    centerDistancePx,
                    timeDistanceMs,
                    childIndex,
                };
                if (
                    !bestCandidate ||
                    candidate.rank < bestCandidate.rank ||
                    (candidate.rank === bestCandidate.rank && candidate.centerDistancePx < bestCandidate.centerDistancePx) ||
                    (
                        candidate.rank === bestCandidate.rank &&
                        candidate.centerDistancePx === bestCandidate.centerDistancePx &&
                        candidate.timeDistanceMs < bestCandidate.timeDistanceMs
                    ) ||
                    (
                        candidate.rank === bestCandidate.rank &&
                        candidate.centerDistancePx === bestCandidate.centerDistancePx &&
                        candidate.timeDistanceMs === bestCandidate.timeDistanceMs &&
                        candidate.childIndex > bestCandidate.childIndex
                    )
                ) {
                    bestCandidate = candidate;
                }
            }
        }
        return bestCandidate?.index ?? -1;
    }

    function selectMediaMarkerByIndex(index, timeMs) {
        if (!Array.isArray(lastMediaMarkersData) || index < 0 || index >= lastMediaMarkersData.length) return false;
        const markerInfo = lastMediaMarkersData[index];
        const targetTimeMs = resolveMediaMarkerTargetTime(markerInfo, timeMs);
        return dispatchMediaMarkerSelection(markerInfo, index, targetTimeMs);
    }

    function selectMediaMarkerAtTime(timeMs, event = null) {
        if (!Array.isArray(lastMediaMarkersData) || !Number.isFinite(timeMs)) return false;
        const renderedIndex = resolveRenderedMediaMarkerIndexAtPointer(
            Number(event?.clientX),
            Number(event?.clientY),
            timeMs,
        );
        if (selectMediaMarkerByIndex(renderedIndex, timeMs)) {
            return true;
        }
        const targetMarkerElement = findMediaMarkerElementTarget(event?.target);
        if (targetMarkerElement && selectMediaMarkerByIndex(getMediaMarkerElementIndex(targetMarkerElement), timeMs)) {
            return true;
        }
        for (let index = 0; index < lastMediaMarkersData.length; index += 1) {
            const markerInfo = lastMediaMarkersData[index];
            if (!markerInfo || markerInfo.clickable === false) continue;
            const markerTimeMs = markerInfo?.startTime instanceof Date
                ? markerInfo.startTime.getTime()
                : Number(markerInfo?.startTimeMs);
            if (!Number.isFinite(markerTimeMs)) continue;
            const markerEndTimeMs = Number(markerInfo?.endTimeMs);
            const isSegment = markerInfo?.mediaDisplayMode === "segment"
                && Number.isFinite(markerEndTimeMs)
                && markerEndTimeMs > markerTimeMs;
            if (isSegment) {
                if (timeMs >= markerTimeMs && timeMs <= markerEndTimeMs) {
                    return dispatchMediaMarkerSelection(markerInfo, index, timeMs);
                }
                continue;
            }
            const markerClientX = getClientXAtTime(markerTimeMs);
            const targetClientX = getClientXAtTime(timeMs);
            if (Number.isFinite(markerClientX) && Number.isFinite(targetClientX) && Math.abs(markerClientX - targetClientX) <= 8) {
                return dispatchMediaMarkerSelection(markerInfo, index, markerTimeMs);
            }
        }
        return false;
    }

    function ensureMediaMarkerPreview() {
        if (mediaPreviewElement) return mediaPreviewElement;
        if (!mediaMarkers) return null;

        mediaPreviewElement = document.createElement("span");
        mediaPreviewElement.className = "timeline-dock__media-preview";
        mediaPreviewElement.hidden = true;

        mediaPreviewImage = document.createElement("img");
        mediaPreviewImage.className = "timeline-dock__media-preview-image";
        mediaPreviewImage.alt = "";
        mediaPreviewImage.decoding = "async";
        mediaPreviewImage.addEventListener?.("load", () => {
            if (!mediaPreviewElement || !mediaPreviewImage) return;
            const imageSource = mediaPreviewImage.getAttribute?.("src") || mediaPreviewImage.src || "";
            if (!imageSource || imageSource !== pendingMediaPreviewSource || !activeMediaPreviewMarker) return;
            mediaPreviewImage.hidden = false;
            mediaPreviewElement.hidden = false;
            mediaPreviewElement.classList?.add?.("is-visible");
        });
        mediaPreviewImage.addEventListener?.("error", () => {
            const imageSource = mediaPreviewImage?.getAttribute?.("src") || mediaPreviewImage?.src || pendingMediaPreviewSource;
            if (imageSource) failedMediaPreviewSources.add(imageSource);
            if (mediaPreviewImage) {
                mediaPreviewImage.hidden = true;
                mediaPreviewImage.removeAttribute?.("src");
            }
            hideMediaMarkerPreview(activeMediaPreviewMarker);
        });
        mediaPreviewElement.appendChild(mediaPreviewImage);

        mediaPreviewTitle = document.createElement("span");
        mediaPreviewTitle.className = "timeline-dock__media-preview-title";
        mediaPreviewElement.appendChild(mediaPreviewTitle);
        mediaMarkers.appendChild(mediaPreviewElement);
        return mediaPreviewElement;
    }

    function setMediaPreviewEdgeClass(anchorPercent) {
        if (!mediaPreviewElement) return;
        mediaPreviewElement.classList?.toggle?.("timeline-dock__media-preview--start", anchorPercent < 8);
        mediaPreviewElement.classList?.toggle?.("timeline-dock__media-preview--end", anchorPercent > 92);
    }

    function showMediaMarkerPreview(marker, markerInfo, anchorPercent) {
        const thumbnailAssetUrl = String(markerInfo?.thumbnailAssetUrl || "").trim();
        if (!thumbnailAssetUrl || failedMediaPreviewSources.has(thumbnailAssetUrl)) {
            hideMediaMarkerPreview(marker);
            return;
        }
        const preview = ensureMediaMarkerPreview();
        if (!preview) return;
        activeMediaPreviewMarker = marker;
        pendingMediaPreviewSource = thumbnailAssetUrl;
        preview.hidden = false;
        preview.classList?.remove?.("is-visible");
        preview.style.left = `${clamp(Number(anchorPercent), 0, 100)}%`;
        setMediaPreviewEdgeClass(Number(anchorPercent));
        if (mediaPreviewTitle) {
            const previewTitle = String(markerInfo?.label || markerInfo?.hoverText || "Media item").trim();
            mediaPreviewTitle.textContent = previewTitle || "Media item";
        }
        if (mediaPreviewImage) {
            mediaPreviewImage.hidden = false;
            if (mediaPreviewImage.getAttribute?.("src") !== thumbnailAssetUrl) {
                mediaPreviewImage.src = thumbnailAssetUrl;
            }
            if (mediaPreviewImage.complete === true && Number(mediaPreviewImage.naturalWidth || 0) > 0) {
                preview.hidden = false;
                preview.classList?.add?.("is-visible");
            }
        }
    }

    function hideMediaMarkerPreview(marker) {
        if (marker && activeMediaPreviewMarker && marker !== activeMediaPreviewMarker) return;
        activeMediaPreviewMarker = null;
        pendingMediaPreviewSource = "";
        mediaPreviewElement?.classList?.remove?.("is-visible");
        if (mediaPreviewElement) {
            mediaPreviewElement.hidden = true;
        }
    }

    function bindMediaMarkerPreviewEvents(marker, markerInfo, anchorPercent) {
        if (!marker) return;
        marker.addEventListener("pointerenter", () => showMediaMarkerPreview(marker, markerInfo, anchorPercent));
        marker.addEventListener("pointerleave", () => hideMediaMarkerPreview(marker));
        marker.addEventListener("focus", () => showMediaMarkerPreview(marker, markerInfo, anchorPercent));
        marker.addEventListener("blur", () => hideMediaMarkerPreview(marker));
    }

    function handleDirectMediaMarkerClick(event, markerInfo, index, isSegment, markerTimeMs) {
        event?.stopPropagation?.();
        const clickTimeMs = isSegment && Number.isFinite(event?.clientX)
            ? getTimeAtClientX(event.clientX)
            : markerTimeMs;
        dispatchMediaMarkerSelection(
            markerInfo,
            index,
            resolveMediaMarkerTargetTime(markerInfo, clickTimeMs),
        );
    }

    function getDirectMediaMarkerTargetIndex(event) {
        const targetMarkerElement = findMediaMarkerElementTarget(event?.target);
        if (!targetMarkerElement) return -1;
        return getMediaMarkerElementIndex(targetMarkerElement);
    }

    function renderMediaMarker(markerInfo, index) {
        const markerTimeMs = markerInfo?.startTime instanceof Date
            ? markerInfo.startTime.getTime()
            : Number(markerInfo?.startTimeMs);
        if (!Number.isFinite(markerTimeMs)) return null;
        const markerEndTimeMs = Number(markerInfo?.endTimeMs);
        const isSegment = markerInfo?.mediaDisplayMode === "segment"
            && Number.isFinite(markerEndTimeMs)
            && markerEndTimeMs > markerTimeMs;
        if (isSegment) {
            if (markerEndTimeMs < getViewMin() || markerTimeMs > getViewMax()) return null;
        } else if (markerTimeMs < getViewMin() || markerTimeMs > getViewMax()) {
            return null;
        }

        const marker = document.createElement("button");
        marker.type = "button";
        const markerClasses = ["timeline-dock__media-marker"];
        let anchorPercent = computePercent(markerTimeMs, getViewMin(), getViewMax());
        if (isSegment) {
            markerClasses.push("timeline-dock__media-marker--segment");
            if (markerTimeMs < getViewMin()) {
                markerClasses.push("timeline-dock__media-marker--segment-clipped-start");
            }
            if (markerEndTimeMs > getViewMax()) {
                markerClasses.push("timeline-dock__media-marker--segment-clipped-end");
            }
            const visibleStartTimeMs = Math.max(markerTimeMs, getViewMin());
            const visibleEndTimeMs = Math.min(markerEndTimeMs, getViewMax());
            anchorPercent = computePercent((visibleStartTimeMs + visibleEndTimeMs) / 2, getViewMin(), getViewMax());
        }
        if (anchorPercent < 8) {
            markerClasses.push("timeline-dock__media-marker--preview-start");
        } else if (anchorPercent > 92) {
            markerClasses.push("timeline-dock__media-marker--preview-end");
        }
        if (markerInfo?.durationEstimated) {
            markerClasses.push("timeline-dock__media-marker--estimated");
        }
        if (markerInfo?.selected) {
            markerClasses.push("timeline-dock__media-marker--selected");
        }
        const mediaKind = String(markerInfo?.mediaKind || "").trim();
        if (mediaKind) {
            markerClasses.push(`timeline-dock__media-marker--${mediaKind}`);
        }
        if (markerInfo?.preEphemeris || markerInfo?.postEphemeris) {
            markerClasses.push("timeline-dock__media-marker--out-of-range");
        }
        if (markerInfo?.clickable === false) {
            markerClasses.push("timeline-dock__media-marker--inactive");
            marker.setAttribute("aria-disabled", "true");
        }
        marker.className = markerClasses.join(" ");
        marker.dataset.mediaIndex = String(index);
        if (markerInfo?.id) {
            marker.dataset.mediaId = String(markerInfo.id);
        }
        marker.dataset.mediaStartTimeMs = String(markerTimeMs);
        if (isSegment) {
            marker.dataset.mediaEndTimeMs = String(markerEndTimeMs);
            const visibleStartTimeMs = Math.max(markerTimeMs, getViewMin());
            const visibleEndTimeMs = Math.min(markerEndTimeMs, getViewMax());
            const leftPercent = computePercent(visibleStartTimeMs, getViewMin(), getViewMax());
            const rightPercent = computePercent(visibleEndTimeMs, getViewMin(), getViewMax());
            marker.style.left = `${leftPercent}%`;
            marker.style.width = `${Math.max(0, rightPercent - leftPercent)}%`;
        } else {
            marker.style.left = `${computePercent(markerTimeMs, getViewMin(), getViewMax())}%`;
        }
        const markerTitle = markerInfo?.hoverText || markerInfo?.label || "Media item";
        marker.title = markerTitle;
        marker.setAttribute("aria-label", markerTitle);
        bindMediaMarkerPreviewEvents(marker, markerInfo, anchorPercent);
        if (markerInfo?.clickable !== false) {
            marker.addEventListener("click", (event) => {
                handleDirectMediaMarkerClick(event, markerInfo, index, isSegment, markerTimeMs);
            });
        }
        return marker;
    }

    function setEvents(eventInfos) {
        const normalizedEvents = Array.isArray(eventInfos) ? eventInfos : [];
        const signature = buildEventSignature(normalizedEvents);
        lastEventInfos = normalizedEvents;
        if (signature === lastEventSignature) {
            return;
        }

        lastEventSignature = signature;
        renderEventMarkersFromCache();
    }

    function setMediaMarkersFn(nextMediaMarkers) {
        if (!mediaMarkers) return;
        const normalizedMediaMarkers = Array.isArray(nextMediaMarkers) ? nextMediaMarkers : [];
        const signature = buildMediaSignature(normalizedMediaMarkers);
        lastMediaMarkersData = normalizedMediaMarkers;
        if (signature === lastMediaSignature) {
            return;
        }

        lastMediaSignature = signature;
        renderMediaMarkersFromCache();
    }

    return {
        clearHoveredEventMarker,
        setHoveredEventMarker,
        setHoveredVisibleEventRange,
        syncMarkerHighlights,
        renderMarker,
        selectMediaMarkerByIndex,
        selectMediaMarkerAtTime,
        getDirectMediaMarkerTargetIndex,
        renderMediaMarker,
        setEvents,
        setMediaMarkersFn,
        getHoveredVisibleEventRange: () => hoveredVisibleEventRange,
        getEventInfos: () => lastEventInfos,
        getMediaMarkersData: () => lastMediaMarkersData,
        resetMediaPreview() {
            mediaPreviewElement = null;
            mediaPreviewImage = null;
            mediaPreviewTitle = null;
            activeMediaPreviewMarker = null;
            pendingMediaPreviewSource = "";
        },
    };
}
