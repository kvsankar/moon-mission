import {
    formatDateOnlyLocal,
    formatDateTimeLocal,
    formatTimeOnlyLocal,
} from "../utils/time-utils.js";
import { buildTimelineTimeScale } from "../core/domain/timeline-time-labels.js";
import { createTimelineDockMarkers } from "./timeline-dock-markers.js";
import { createTimelineDockPointer } from "./timeline-dock-pointer.js";
import {
    clamp,
    computePercent,
    formatComparisonElapsedLabel,
    formatMissionElapsedLabel,
    formatUtcYearElapsedLabel,
} from "./timeline-dock-model.js";

function dispatchDocumentCustomEvent(type, detail) {
    if (typeof document === "undefined" || typeof document.dispatchEvent !== "function") {
        return;
    }
    if (typeof CustomEvent === "function") {
        document.dispatchEvent(new CustomEvent(type, { detail }));
        return;
    }
    const event = { type, detail };
    document.dispatchEvent(event);
}

function createTimelineDockController({
    onSeekTime,
    onMarkerSelect,
    onMarkerHover,
    onMarkerLeave,
    onCraftSelect,
}) {
    const dockRoot = document.getElementById("timeline-dock");
    const slider = document.getElementById("timeline-slider");
    const markers = document.getElementById("timeline-markers");
    const mediaMarkers = document.getElementById("timeline-media-markers");
    const playhead = document.getElementById("timeline-playhead");
    const timeLabels = document.getElementById("timeline-time-labels");
    const timeClickLane = document.getElementById("timeline-time-click-lane");
    const scrubLane = document.getElementById("timeline-scrub-lane");
    const eventVisibleRange = document.getElementById("timeline-event-visible-range");
    const overview = document.getElementById("timeline-overview");
    const overviewWindow = overview?.querySelector?.(".timeline-dock__overview-window") || null;
    const overviewCurrent = overview?.querySelector?.(".timeline-dock__overview-current") || null;
    const panLeftButton = document.getElementById("timeline-pan-left");
    const scaleContractButton = document.getElementById("timeline-scale-contract");
    const scaleResetButton = document.getElementById("timeline-scale-reset");
    const scaleExpandButton = document.getElementById("timeline-scale-expand");
    const panRightButton = document.getElementById("timeline-pan-right");
    const startLabel = document.getElementById("timeline-start-label");
    const endLabel = document.getElementById("timeline-end-label");
    const modeLabel = document.getElementById("timeline-mode-label");
    const currentLabel = document.getElementById("timeline-current-label");
    const utcYearElapsedLabel = document.getElementById("timeline-utc-year-elapsed-label");
    const missionElapsedLabel = document.getElementById("timeline-mission-elapsed-label");
    const currentRow = document.getElementById("timeline-current-row") || currentLabel?.parentElement || null;
    const craftStrip = document.getElementById("timeline-craft-strip");
    const TIME_READOUT_MODES = ["local", "utc", "met"];

    if (!slider || !markers || !startLabel || !endLabel || !currentLabel || !craftStrip) {
        return {
            bind: () => {},
            setMode: () => {},
            setRange: () => {},
            setCurrentTime: () => {},
            setEvents: () => {},
            setMediaMarkers: () => {},
            setCrafts: () => {},
        };
    }

    let rangeMin = 0;
    let rangeMax = 0;
    let viewMin = 0;
    let viewMax = 0;
    let lastRangeSignature = "";
    let currentTimeMs = Number.NaN;
    let isBound = false;
    let currentMode = {
        compareMode: false,
        label: "",
        detail: "",
        title: "",
    };
    let compactTimeReadoutModeIndex = 0;
    let timeReadoutPointerStart = null;
    let suppressNextTimeReadoutClick = false;

    const timelinePointer = createTimelineDockPointer({
        dockRoot,
        slider,
        playhead,
        onSeekTime,
        syncMarkerHighlights: (...args) => dockMarkers.syncMarkerHighlights(...args),
        getDirectMediaMarkerTargetIndex: (...args) => dockMarkers.getDirectMediaMarkerTargetIndex(...args),
        selectMediaMarkerByIndex: (...args) => dockMarkers.selectMediaMarkerByIndex(...args),
        selectMediaMarkerAtTime: (...args) => dockMarkers.selectMediaMarkerAtTime(...args),
        getRangeMin: () => rangeMin,
        getRangeMax: () => rangeMax,
        getViewMin: () => viewMin,
        getViewMax: () => viewMax,
        getCurrentTimeMs: () => currentTimeMs,
        setCurrentTimeMs: (value) => { currentTimeMs = value; },
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
    });
    const {
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
    } = timelinePointer;

    const dockMarkers = createTimelineDockMarkers({
        markers,
        mediaMarkers,
        getViewMin: () => viewMin,
        getViewMax: () => viewMax,
        getCurrentTimeMs: () => currentTimeMs,
        getCurrentMode: () => currentMode,
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
    });
    const {
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
    } = dockMarkers;

    function isCompactTimelineLayout() {
        if (typeof window === "undefined") return false;
        if (document?.body?.classList?.contains?.("mobile-shell-enabled")) return true;
        return window.matchMedia?.("(max-width: 600px)")?.matches === true;
    }

    function getCompactTimeReadoutMode() {
        return TIME_READOUT_MODES[
            ((compactTimeReadoutModeIndex % TIME_READOUT_MODES.length) + TIME_READOUT_MODES.length) %
                TIME_READOUT_MODES.length
        ];
    }

    function setCompactTimeReadoutMode(nextModeIndex) {
        compactTimeReadoutModeIndex = Number.isFinite(nextModeIndex)
            ? Math.round(nextModeIndex)
            : compactTimeReadoutModeIndex + 1;
        syncTimeReadoutVisibility();
    }

    function syncTimeReadoutVisibility() {
        const compact = isCompactTimelineLayout();
        const mode = compact ? getCompactTimeReadoutMode() : "all";
        dockRoot?.setAttribute?.("data-time-readout", mode);

        if (currentMode.compareMode) {
            currentLabel.hidden = false;
            if (utcYearElapsedLabel) utcYearElapsedLabel.hidden = true;
            if (missionElapsedLabel) missionElapsedLabel.hidden = true;
            currentRow?.removeAttribute?.("role");
            currentRow?.removeAttribute?.("tabindex");
            currentRow?.removeAttribute?.("title");
            return;
        }

        if (!compact) {
            currentLabel.hidden = false;
            if (utcYearElapsedLabel) utcYearElapsedLabel.hidden = !utcYearElapsedLabel.textContent;
            if (missionElapsedLabel) missionElapsedLabel.hidden = !missionElapsedLabel.textContent;
            currentRow?.removeAttribute?.("role");
            currentRow?.removeAttribute?.("tabindex");
            currentRow?.removeAttribute?.("title");
            return;
        }

        currentLabel.hidden = mode !== "local";
        if (utcYearElapsedLabel) {
            utcYearElapsedLabel.hidden = mode !== "utc" || !utcYearElapsedLabel.textContent;
        }
        if (missionElapsedLabel) {
            missionElapsedLabel.hidden = mode !== "met" || !missionElapsedLabel.textContent;
        }
        currentRow?.setAttribute?.("role", "button");
        currentRow?.setAttribute?.("tabindex", "0");
        currentRow?.setAttribute?.("title", "Tap or swipe to switch local, UTC, and MET time");
    }

    function updateCurrentLabel(timeMs) {
        if (currentMode.compareMode) {
            const elapsedLabel = formatComparisonElapsedLabel(timeMs, rangeMin);
            const label = `Comparison Elapsed • ${elapsedLabel}`;
            currentLabel.textContent = label;
            if (missionElapsedLabel) {
                missionElapsedLabel.textContent = "";
                missionElapsedLabel.title = "";
                missionElapsedLabel.hidden = true;
            }
            if (utcYearElapsedLabel) {
                utcYearElapsedLabel.textContent = "";
                utcYearElapsedLabel.title = "";
                utcYearElapsedLabel.hidden = true;
            }
            slider.setAttribute(
                "aria-valuetext",
                `Comparison elapsed time ${elapsedLabel}`,
            );
            syncTimeReadoutVisibility();
            return;
        }

        const label = formatDateTimeLocal(timeMs, { includeOffset: false });
        currentLabel.textContent = label;
        const utcYearElapsedText = formatUtcYearElapsedLabel(timeMs);
        if (utcYearElapsedLabel) {
            utcYearElapsedLabel.textContent = utcYearElapsedText;
            utcYearElapsedLabel.title = utcYearElapsedText
                ? "UTC year elapsed time"
                : "";
            utcYearElapsedLabel.hidden = utcYearElapsedText.length === 0;
        }
        const missionElapsedText = formatMissionElapsedLabel(timeMs, rangeMin);
        if (missionElapsedLabel) {
            missionElapsedLabel.textContent = missionElapsedText;
            missionElapsedLabel.title = missionElapsedText
                ? "Mission elapsed time"
                : "";
            missionElapsedLabel.hidden = missionElapsedText.length === 0;
        }
        slider.setAttribute(
            "aria-valuetext",
            [
                label,
                utcYearElapsedText ? `UTC year elapsed time ${utcYearElapsedText}` : "",
                missionElapsedText ? `mission elapsed time ${missionElapsedText}` : "",
            ].filter(Boolean).join(", "),
        );
        syncTimeReadoutVisibility();
    }

    function getTrackWidthPx() {
        const measuredWidth =
            timeLabels?.parentElement?.getBoundingClientRect?.()?.width ||
            timeClickLane?.getBoundingClientRect?.()?.width ||
            slider?.parentElement?.getBoundingClientRect?.()?.width ||
            slider?.getBoundingClientRect?.()?.width ||
            0;
        return Number.isFinite(measuredWidth) && measuredWidth > 0 ? measuredWidth : 720;
    }

    function getTimelineInteractionSurface() {
        return scrubLane || slider.parentElement || slider;
    }

    function getTimelinePointerSurface() {
        const interactionSurface = getTimelineInteractionSurface();
        return interactionSurface?.parentElement || interactionSurface;
    }

    function isNodeWithin(root, node) {
        if (!root || !node) return false;
        let current = node;
        while (current) {
            if (current === root) return true;
            current = current.parentElement;
        }
        return false;
    }

    function isPointInsideElement(element, clientX, clientY) {
        if (!element || element.hidden === true) return false;
        if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return false;
        const rect = element.getBoundingClientRect?.();
        if (!rect || !Number.isFinite(rect.left) || !Number.isFinite(rect.width) || rect.width <= 0) {
            return false;
        }
        const top = Number.isFinite(rect.top) ? rect.top : 0;
        const height = Number.isFinite(rect.height) && rect.height > 0 ? rect.height : 0;
        if (height <= 0) return false;
        return clientX >= rect.left &&
            clientX <= rect.left + rect.width &&
            clientY >= top &&
            clientY <= top + height;
    }

    function resolvePointerZone(event, clientX, clientY) {
        if (isPlayheadPointerTarget(event?.target)) return "playhead";

        if (Number.isFinite(clientY)) {
            if (isPointInsideElement(scrubLane, clientX, clientY)) return "scrub";
            if (isPointInsideElement(mediaMarkers, clientX, clientY)) return "media-click-lane";
            if (isPointInsideElement(timeClickLane, clientX, clientY)) return "click-lane";
            if (isPointInsideElement(markers, clientX, clientY)) return "click-lane";
            return "";
        }

        if (isNodeWithin(scrubLane, event.target)) return "scrub";
        if (isNodeWithin(mediaMarkers, event.target)) return "media-click-lane";
        if (isNodeWithin(timeClickLane, event.target)) return "click-lane";
        if (isNodeWithin(markers, event.target)) return "click-lane";
        return "";
    }

    function getTimelineRect() {
        const rect = getTimelineInteractionSurface()?.getBoundingClientRect?.() ||
            timeClickLane?.getBoundingClientRect?.() ||
            slider?.getBoundingClientRect?.();
        if (!rect || !Number.isFinite(rect.width) || rect.width <= 0) {
            return {
                left: 0,
                width: getTrackWidthPx(),
            };
        }
        return rect;
    }

    function getFullSpanMs() {
        syncRangeStateFromSliderIfNeeded();
        const spanMs = rangeMax - rangeMin;
        return Number.isFinite(spanMs) && spanMs > 0 ? spanMs : 0;
    }

    function getViewSpanMs() {
        const spanMs = viewMax - viewMin;
        return Number.isFinite(spanMs) && spanMs > 0 ? spanMs : getFullSpanMs();
    }

    function getMinViewSpanMs() {
        const fullSpanMs = getFullSpanMs();
        const stepMs = Number(slider.step);
        return Math.max(
            Number.isFinite(stepMs) && stepMs > 0 ? stepMs * 8 : 1,
            fullSpanMs / 96,
        );
    }

    function isTimelineZoomed() {
        return viewMin > rangeMin || viewMax < rangeMax;
    }

    function syncRangeStateFromSliderIfNeeded() {
        if (rangeMax > rangeMin && viewMax > viewMin) return;
        const sliderMin = Number(slider.min);
        const sliderMax = Number(slider.max);
        if (!Number.isFinite(sliderMin) || !Number.isFinite(sliderMax) || sliderMax <= sliderMin) return;
        if (!(rangeMax > rangeMin)) {
            rangeMin = sliderMin;
            rangeMax = sliderMax;
        }
        if (!(viewMax > viewMin)) {
            viewMin = sliderMin;
            viewMax = sliderMax;
        }
        if (!Number.isFinite(currentTimeMs)) {
            const sliderValue = Number(slider.value);
            currentTimeMs = Number.isFinite(sliderValue)
                ? clamp(sliderValue, rangeMin, rangeMax)
                : rangeMin;
        }
    }

    function clampViewWindow(nextMin, nextMax) {
        const fullSpanMs = getFullSpanMs();
        if (fullSpanMs <= 0) {
            return { min: rangeMin, max: rangeMax };
        }

        const minSpanMs = getMinViewSpanMs();
        const rawSpanMs = Math.max(minSpanMs, Math.min(fullSpanMs, nextMax - nextMin));
        let min = Number.isFinite(nextMin) ? nextMin : rangeMin;
        let max = min + rawSpanMs;

        if (min < rangeMin) {
            min = rangeMin;
            max = min + rawSpanMs;
        }
        if (max > rangeMax) {
            max = rangeMax;
            min = max - rawSpanMs;
        }

        return {
            min: clamp(min, rangeMin, rangeMax),
            max: clamp(max, rangeMin, rangeMax),
        };
    }

    function setScaleButtonDisabled(button, disabled) {
        if (!button) return;
        const isDisabled = disabled === true;
        button.disabled = isDisabled;
        if (isDisabled) {
            button.setAttribute?.("disabled", "");
        } else {
            button.removeAttribute?.("disabled");
        }
        button.setAttribute?.("aria-disabled", isDisabled ? "true" : "false");
    }

    function syncScaleButtons() {
        const fullSpanMs = getFullSpanMs();
        const viewSpanMs = getViewSpanMs();
        const minSpanMs = getMinViewSpanMs();
        const zoomed = isTimelineZoomed();
        setScaleButtonDisabled(panLeftButton, !zoomed || viewMin <= rangeMin);
        setScaleButtonDisabled(scaleContractButton, !zoomed);
        setScaleButtonDisabled(scaleResetButton, !zoomed);
        setScaleButtonDisabled(scaleExpandButton, fullSpanMs <= 0 || viewSpanMs <= minSpanMs * 1.01);
        setScaleButtonDisabled(panRightButton, !zoomed || viewMax >= rangeMax);
    }

    function syncTimelineOverview() {
        if (!overview || !overviewWindow) return;
        const fullSpanMs = getFullSpanMs();
        const zoomed = isTimelineZoomed() && fullSpanMs > 0;
        overview.hidden = !zoomed;
        if (!zoomed) return;

        const leftPercent = clamp(computePercent(viewMin, rangeMin, rangeMax), 0, 100);
        const rightPercent = clamp(computePercent(viewMax, rangeMin, rangeMax), 0, 100);
        overviewWindow.style.left = `${leftPercent}%`;
        overviewWindow.style.width = `${Math.max(0, rightPercent - leftPercent)}%`;

        if (!overviewCurrent) return;
        const currentPercent = clamp(computePercent(currentTimeMs, rangeMin, rangeMax), 0, 100);
        const showCurrent = Number.isFinite(currentTimeMs)
            && currentTimeMs >= rangeMin
            && currentTimeMs <= rangeMax;
        overviewCurrent.hidden = !showCurrent;
        if (showCurrent) {
            overviewCurrent.style.left = `${currentPercent}%`;
        }
    }

    function syncHoveredVisibleEventRange() {
        if (!eventVisibleRange) return;
        if (!dockMarkers.getHoveredVisibleEventRange()) {
            eventVisibleRange.hidden = true;
            return;
        }
        const { startTimeMs, endTimeMs } = dockMarkers.getHoveredVisibleEventRange();
        if (
            !Number.isFinite(startTimeMs) ||
            !Number.isFinite(endTimeMs) ||
            !(viewMax > viewMin)
        ) {
            eventVisibleRange.hidden = true;
            return;
        }
        if (Math.max(startTimeMs, endTimeMs) < viewMin || Math.min(startTimeMs, endTimeMs) > viewMax) {
            eventVisibleRange.hidden = true;
            return;
        }
        const visibleStartTimeMs = clamp(Math.min(startTimeMs, endTimeMs), viewMin, viewMax);
        const visibleEndTimeMs = clamp(Math.max(startTimeMs, endTimeMs), viewMin, viewMax);
        const leftPercent = clamp(computePercent(visibleStartTimeMs, viewMin, viewMax), 0, 100);
        const rightPercent = clamp(computePercent(visibleEndTimeMs, viewMin, viewMax), 0, 100);
        eventVisibleRange.style.left = `${leftPercent}%`;
        eventVisibleRange.style.width = `${Math.max(0.25, rightPercent - leftPercent)}%`;
        eventVisibleRange.hidden = false;
    }

    function renderTimeLabels() {
        if (!timeLabels) {
            syncScaleButtons();
            syncTimelineOverview();
            syncHoveredVisibleEventRange();
            return;
        }
        const timeScale = buildTimelineTimeScale({
            startTimeMs: viewMin,
            endTimeMs: viewMax,
            widthPx: getTrackWidthPx(),
            compareMode: currentMode.compareMode,
        });

        timeLabels.innerHTML = "";
        for (const labelInfo of timeScale.labels) {
            const label = document.createElement("span");
            label.className = "timeline-dock__time-label";
            label.style.left = `${labelInfo.percent}%`;
            label.textContent = labelInfo.label;
            label.title = labelInfo.label;
            label.dataset.timeMs = String(labelInfo.timeMs);
            timeLabels.appendChild(label);
        }
        for (const tickInfo of timeScale.minorTicks) {
            const tick = document.createElement("span");
            tick.className = "timeline-dock__time-tick timeline-dock__time-tick--minor";
            tick.style.left = `${tickInfo.percent}%`;
            tick.setAttribute?.("aria-hidden", "true");
            tick.dataset.timeMs = String(tickInfo.timeMs);
            timeLabels.appendChild(tick);
        }
        syncScaleButtons();
        syncTimelineOverview();
        syncHoveredVisibleEventRange();
    }

    function updateEdgeLabels() {
        startLabel.innerHTML = formatEdgeLabel(viewMin, "start");
        endLabel.innerHTML = formatEdgeLabel(viewMax, "end");
    }

    function syncSliderRangeToView() {
        slider.min = String(viewMin);
        slider.max = String(viewMax);
        const valueMs = Number.isFinite(currentTimeMs)
            ? currentTimeMs
            : Number(slider.value);
        slider.value = String(clamp(valueMs, viewMin, viewMax));
        syncSliderTimelineDataset();
        syncPlayhead();
    }

    function syncSliderTimelineDataset() {
        if (!slider?.dataset) return;
        slider.dataset.rangeMinMs = String(rangeMin);
        slider.dataset.rangeMaxMs = String(rangeMax);
        slider.dataset.viewMinMs = String(viewMin);
        slider.dataset.viewMaxMs = String(viewMax);
        if (Number.isFinite(currentTimeMs)) {
            slider.dataset.currentTimeMs = String(currentTimeMs);
        }
    }

    function syncPlayhead() {
        if (!playhead) return;
        const inView = Number.isFinite(currentTimeMs)
            && Number.isFinite(viewMin)
            && Number.isFinite(viewMax)
            && viewMax > viewMin
            && currentTimeMs >= viewMin
            && currentTimeMs <= viewMax;
        playhead.hidden = !inView;
        if (!inView) return;
        const leftPercent = clamp(computePercent(currentTimeMs, viewMin, viewMax), 0, 100);
        playhead.style.left = `${leftPercent}%`;
    }

    function dispatchTimelineUserSeek(phase, timeMs, {
        commit = false,
        source = "timeline",
    } = {}) {
        if (!Number.isFinite(timeMs)) return;
        dispatchDocumentCustomEvent("mission-timeline-user-seek", {
            phase,
            source,
            commit: commit === true,
            timeMs,
        });
    }

    function renderEventMarkersFromCache() {
        clearHoveredEventMarker();
        markers.innerHTML = "";
        for (let i = 0; i < dockMarkers.getEventInfos().length; i += 1) {
            const marker = renderMarker(dockMarkers.getEventInfos()[i], i);
            if (marker) markers.appendChild(marker);
        }
        syncMarkerHighlights();
    }

    function renderMediaMarkersFromCache() {
        if (!mediaMarkers) return;
        mediaMarkers.innerHTML = "";
        dockMarkers.resetMediaPreview();
        for (let i = 0; i < dockMarkers.getMediaMarkersData().length; i += 1) {
            const marker = renderMediaMarker(dockMarkers.getMediaMarkersData()[i], i);
            if (marker) mediaMarkers.appendChild(marker);
        }
    }

    function renderVisualTimeline() {
        updateEdgeLabels();
        syncSliderRangeToView();
        if (Number.isFinite(currentTimeMs)) {
            updateCurrentLabel(currentTimeMs);
        } else {
            syncTimeReadoutVisibility();
        }
        renderTimeLabels();
        renderEventMarkersFromCache();
        renderMediaMarkersFromCache();
        dockRoot?.classList?.toggle?.("timeline-dock--zoomed", isTimelineZoomed());
        syncPlayhead();
        syncTimelineOverview();
        syncHoveredVisibleEventRange();
    }

    function setViewWindow(nextMin, nextMax) {
        const nextView = clampViewWindow(nextMin, nextMax);
        const changed = nextView.min !== viewMin || nextView.max !== viewMax;
        viewMin = nextView.min;
        viewMax = nextView.max;
        if (changed) {
            renderVisualTimeline();
        } else {
            syncScaleButtons();
        }
    }

    function resetViewWindow() {
        setViewWindow(rangeMin, rangeMax);
    }

    function resolveZoomAnchor() {
        if (Number.isFinite(currentTimeMs) && currentTimeMs >= viewMin && currentTimeMs <= viewMax) {
            return currentTimeMs;
        }
        return viewMin + getViewSpanMs() / 2;
    }

    function zoomView(factor, anchorMs = resolveZoomAnchor()) {
        const spanMs = getViewSpanMs();
        if (spanMs <= 0) return;
        const nextSpanMs = spanMs * factor;
        const anchorRatio = spanMs > 0
            ? clamp((anchorMs - viewMin) / spanMs, 0, 1)
            : 0.5;
        const nextMin = anchorMs - nextSpanMs * anchorRatio;
        setViewWindow(nextMin, nextMin + nextSpanMs);
    }

    function panView(deltaMs) {
        if (!isTimelineZoomed() || !Number.isFinite(deltaMs) || deltaMs === 0) return;
        setViewWindow(viewMin + deltaMs, viewMax + deltaMs);
    }

    function panViewFromDrag(startViewMin, startViewMax, startClientX, clientX) {
        if (!isTimelineZoomed()) return;
        const deltaMs = getDragDeltaTimeMs(startClientX, clientX);
        if (!Number.isFinite(deltaMs) || deltaMs === 0) return;
        setViewWindow(startViewMin - deltaMs, startViewMax - deltaMs);
    }

    function isScaleButtonDisabled(button) {
        return button?.disabled === true || button?.getAttribute?.("aria-disabled") === "true";
    }

    function formatEdgeLabel(timeMs, edge) {
        if (currentMode.compareMode) {
            const edgeLabel = edge === "end" ? "End" : "Start";
            const edgeElapsed = formatComparisonElapsedLabel(timeMs, rangeMin);
            return `<span class="timeline-dock__edge-date">${edgeLabel}</span><span class="timeline-dock__edge-time">${edgeElapsed}</span>`;
        }
        const includeOffset = typeof window === "undefined" ? true : window.innerWidth > 600;
        return `<span class="timeline-dock__edge-date">${formatDateOnlyLocal(timeMs)}</span><span class="timeline-dock__edge-time">${formatTimeOnlyLocal(timeMs, { includeOffset })}</span>`;
    }

    function setMode(modeState = {}) {
        currentMode = {
            compareMode: modeState.compareMode === true,
            label: modeState.label || "",
            detail: modeState.detail || "",
            title: modeState.title || "",
        };

        dockRoot?.classList?.toggle?.("timeline-dock--compare", currentMode.compareMode);

        if (modeLabel) {
            const hidden = !currentMode.compareMode;
            modeLabel.textContent = hidden
                ? ""
                : [currentMode.label, currentMode.detail].filter(Boolean).join(" • ");
            modeLabel.title = hidden ? "" : currentMode.title;
            modeLabel.hidden = hidden;
            modeLabel.classList?.toggle?.("timeline-dock__mode--hidden", hidden);
        }

        if (lastRangeSignature) {
            renderVisualTimeline();
        }
        const labelTimeMs = Number.isFinite(currentTimeMs)
            ? currentTimeMs
            : Number(slider.dataset?.currentTimeMs);
        updateCurrentLabel(Number.isFinite(labelTimeMs) ? labelTimeMs : Number(slider.value));
    }

    function setRange({ startTimeMs, endTimeMs, stepMs }) {
        const safeStart = Number.isFinite(startTimeMs) ? startTimeMs : 0;
        const safeEnd = Number.isFinite(endTimeMs) ? endTimeMs : safeStart;
        const normalizedMin = Math.min(safeStart, safeEnd);
        const normalizedMax = Math.max(safeStart, safeEnd);
        const safeStep = Math.max(1, Math.round(Number.isFinite(stepMs) ? stepMs : 1));
        const rangeSignature = `${normalizedMin}:${normalizedMax}:${safeStep}`;

        rangeMin = normalizedMin;
        rangeMax = normalizedMax;

        if (rangeSignature === lastRangeSignature) {
            return;
        }

        lastRangeSignature = rangeSignature;
        slider.min = String(normalizedMin);
        slider.max = String(normalizedMax);
        slider.step = String(safeStep);
        viewMin = normalizedMin;
        viewMax = normalizedMax;
        slider.value = String(clamp(Number(slider.value), normalizedMin, normalizedMax));
        renderVisualTimeline();
    }

    function setCurrentTime(timeMs) {
        if (!Number.isFinite(rangeMin) || !Number.isFinite(rangeMax)) return;
        const clamped = clamp(timeMs, rangeMin, rangeMax);
        currentTimeMs = clamped;
        slider.value = String(clamp(clamped, viewMin, viewMax));
        syncSliderTimelineDataset();
        updateCurrentLabel(clamped);
        syncMarkerHighlights();
        syncPlayhead();
        syncTimelineOverview();
    }

    function setCrafts(craftInfos) {
        const normalizedCraftInfos = Array.isArray(craftInfos)
            ? craftInfos.filter((craftInfo) => craftInfo && craftInfo.id && craftInfo.label)
            : [];
        if (normalizedCraftInfos.length <= 1) {
            craftStrip.innerHTML = "";
            craftStrip.classList.add("timeline-dock__craft-strip--hidden");
            return;
        }

        craftStrip.classList.remove("timeline-dock__craft-strip--hidden");
        craftStrip.innerHTML = "";
        for (const craftInfo of normalizedCraftInfos) {
            const chip = document.createElement("button");
            chip.type = "button";
            chip.className = craftInfo.active
                ? "timeline-dock__craft-chip timeline-dock__craft-chip--active"
                : "timeline-dock__craft-chip";
            if (craftInfo.color) {
                const swatch = document.createElement("span");
                swatch.className = "timeline-dock__craft-swatch";
                swatch.style.backgroundColor = craftInfo.color;
                chip.appendChild(swatch);
            }
            const label = document.createElement("span");
            label.className = "timeline-dock__craft-chip-label";
            label.textContent = craftInfo.label;
            chip.appendChild(label);
            if (craftInfo.roleLabel) {
                const role = document.createElement("span");
                role.className = "timeline-dock__craft-chip-role";
                role.textContent = craftInfo.roleLabel;
                chip.appendChild(role);
            }
            chip.title = craftInfo.label;
            chip.setAttribute("aria-label", `Track ${craftInfo.label}`);
            chip.addEventListener("click", () => {
                onCraftSelect?.(craftInfo.id);
            });
            craftStrip.appendChild(chip);
        }
    }

    function bind() {
        if (isBound) return;
        isBound = true;

        const readSliderEventPayload = () => {
            const programmaticTimeMs = Number(slider.dataset.programmaticSeekTimeMs);
            const programmaticSource = String(slider.dataset.programmaticSeekSource || "").trim();
            delete slider.dataset.programmaticSeekTimeMs;
            delete slider.dataset.programmaticSeekSource;
            if (Number.isFinite(programmaticTimeMs)) {
                return {
                    timeMs: programmaticTimeMs,
                    programmatic: true,
                    source: programmaticSource || "programmatic",
                };
            }
            return {
                timeMs: Number(slider.value),
                programmatic: false,
                source: "timeline-slider",
            };
        };

        const cycleCompactTimeReadout = (direction = 1) => {
            if (!isCompactTimelineLayout() || currentMode.compareMode) return;
            setCompactTimeReadoutMode(compactTimeReadoutModeIndex + direction);
        };

        slider.addEventListener("input", () => {
            const payload = readSliderEventPayload();
            const timeMs = payload.timeMs;
            if (!Number.isFinite(timeMs)) return;
            currentTimeMs = clamp(timeMs, rangeMin, rangeMax);
            syncSliderTimelineDataset();
            updateCurrentLabel(currentTimeMs);
            syncMarkerHighlights();
            syncPlayhead();
            onSeekTime?.(currentTimeMs, false);
            dispatchTimelineUserSeek("update", currentTimeMs, {
                commit: false,
                source: payload.source,
            });
        });

        slider.addEventListener("change", () => {
            const payload = readSliderEventPayload();
            const timeMs = payload.timeMs;
            if (!Number.isFinite(timeMs)) return;
            currentTimeMs = clamp(timeMs, rangeMin, rangeMax);
            syncSliderTimelineDataset();
            updateCurrentLabel(currentTimeMs);
            syncMarkerHighlights();
            syncPlayhead();
            onSeekTime?.(currentTimeMs, true);
            dispatchTimelineUserSeek("commit", currentTimeMs, {
                commit: true,
                source: payload.source,
            });
        });

        document.addEventListener?.("mission-timeline-event-hover", (event) => {
            setHoveredEventMarker(event?.detail || {}, event?.detail?.active === true);
        });
        document.addEventListener?.("mission-timeline-visible-event-range-hover", (event) => {
            setHoveredVisibleEventRange(event?.detail || {});
        });

        panLeftButton?.addEventListener?.("click", () => {
            if (isScaleButtonDisabled(panLeftButton)) return;
            panView(getViewSpanMs() * -0.4);
        });
        scaleContractButton?.addEventListener?.("click", () => {
            if (isScaleButtonDisabled(scaleContractButton)) return;
            zoomView(2);
        });
        scaleResetButton?.addEventListener?.("click", () => {
            if (isScaleButtonDisabled(scaleResetButton)) return;
            resetViewWindow();
        });
        scaleExpandButton?.addEventListener?.("click", () => {
            if (isScaleButtonDisabled(scaleExpandButton)) return;
            zoomView(0.5);
        });
        panRightButton?.addEventListener?.("click", () => {
            if (isScaleButtonDisabled(panRightButton)) return;
            panView(getViewSpanMs() * 0.4);
        });

        const interactionSurface = getTimelineInteractionSurface();
        const pointerSurface = getTimelinePointerSurface();
        pointerSurface?.addEventListener?.("wheel", handleTimelineWheel, { passive: false });
        pointerSurface?.addEventListener?.("pointerdown", beginTimelineDrag, { passive: false, capture: true });
        pointerSurface?.addEventListener?.("pointermove", updateTimelineDrag);
        pointerSurface?.addEventListener?.("pointerup", (event) => {
            endTimelineDrag(event, false);
        });
        pointerSurface?.addEventListener?.("pointercancel", (event) => {
            endTimelineDrag(event, true);
        });
        pointerSurface?.addEventListener?.("lostpointercapture", (event) => {
            endTimelineDrag(event, true);
        });
        pointerSurface?.addEventListener?.("dblclick", handleTimelineDoubleClick);

        currentRow?.addEventListener?.("click", () => {
            if (suppressNextTimeReadoutClick) {
                suppressNextTimeReadoutClick = false;
                return;
            }
            cycleCompactTimeReadout(1);
        });
        currentRow?.addEventListener?.("keydown", (event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault?.();
            cycleCompactTimeReadout(1);
        });
        currentRow?.addEventListener?.("pointerdown", (event) => {
            if (!isCompactTimelineLayout()) return;
            timeReadoutPointerStart = {
                pointerId: event.pointerId,
                clientX: Number(event.clientX),
            };
        });
        currentRow?.addEventListener?.("pointerup", (event) => {
            if (!timeReadoutPointerStart || event.pointerId !== timeReadoutPointerStart.pointerId) return;
            const deltaX = Number(event.clientX) - Number(timeReadoutPointerStart.clientX);
            timeReadoutPointerStart = null;
            if (Math.abs(deltaX) < 28) return;
            event.preventDefault?.();
            suppressNextTimeReadoutClick = true;
            cycleCompactTimeReadout(deltaX < 0 ? 1 : -1);
        });

        if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
            window.addEventListener("resize", renderVisualTimeline);
        }
        syncScaleButtons();
    }

    return {
        bind,
        setMode,
        setRange,
        setCurrentTime,
        setEvents,
        setMediaMarkers: setMediaMarkersFn,
        setCrafts,
    };
}

export { createTimelineDockController };
