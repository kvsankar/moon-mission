import { resolveMediaSelectionState } from "../core/domain/media-selection-state.js";
import { findMediaItemById, buildNearbyMediaItems } from "./media-timeline-items.js";

function buildExplicitMediaFocusState({
    items,
    activeItemId,
    timeMs,
    nearbyRadius = 3,
    focusSource = "user-selection",
} = {}) {
    const normalizedItems = Array.isArray(items) ? items : [];
    const activeItem = findMediaItemById(normalizedItems, activeItemId);
    const activeIndex = activeItem
        ? normalizedItems.findIndex((item) => item?.id === activeItem.id)
        : -1;

    if (!activeItem || activeIndex < 0) {
        const nearestSelection = resolveMediaSelectionState({
            items: normalizedItems,
            timeMs,
            nearbyRadius,
        });
        return {
            hasItems: normalizedItems.length > 0,
            activeIndex: -1,
            activeItem: null,
            previousItem: null,
            nextItem: null,
            nearbyItems: nearestSelection.nearbyItems,
            activeDeltaMs: Number.NaN,
            focusSource: "none",
            explicit: false,
        };
    }

    return {
        hasItems: normalizedItems.length > 0,
        activeIndex,
        activeItem,
        previousItem: activeIndex > 0 ? normalizedItems[activeIndex - 1] : null,
        nextItem: activeIndex < (normalizedItems.length - 1) ? normalizedItems[activeIndex + 1] : null,
        nearbyItems: buildNearbyMediaItems(normalizedItems, activeIndex, nearbyRadius),
        activeDeltaMs: Number.isFinite(timeMs) ? timeMs - activeItem.startTimeMs : Number.NaN,
        focusSource,
        explicit: focusSource !== "time-proximity",
    };
}

function buildTimeProximityMediaFocusState({
    items,
    timeMs,
    nearbyRadius = 3,
} = {}) {
    const focusState = resolveMediaSelectionState({
        items,
        timeMs,
        nearbyRadius,
    });
    return {
        ...focusState,
        focusSource: focusState.activeItem ? "time-proximity" : "none",
        explicit: false,
    };
}

function clampIndex(index, maxIndex) {
    return Math.max(0, Math.min(maxIndex, index));
}

function buildMediaNavigationModel(items, selection = {}) {
    const count = Array.isArray(items) ? items.length : 0;
    const activeIndex = Number(selection.activeIndex);
    if (count <= 0) {
        return {
            available: false,
            previousEnabled: false,
            nextEnabled: false,
            positionLabel: "No media focused",
        };
    }
    if (!Number.isInteger(activeIndex) || activeIndex < 0) {
        return {
            available: true,
            previousEnabled: false,
            nextEnabled: true,
            positionLabel: `${count} filtered - none focused`,
            previousTitle: "Focus a filtered media item first",
            nextTitle: "Focus nearest filtered media",
        };
    }
    return {
        available: true,
        previousEnabled: activeIndex > 0,
        nextEnabled: activeIndex < (count - 1),
        positionLabel: `${activeIndex + 1} of ${count}`,
        previousTitle: "Previous filtered media",
        nextTitle: "Next filtered media",
    };
}
export {
    buildExplicitMediaFocusState,
    buildTimeProximityMediaFocusState,
    clampIndex,
    buildMediaNavigationModel,
};
