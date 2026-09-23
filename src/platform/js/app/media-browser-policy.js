import {
    THUMBNAIL_STRIP_DEFAULT_HEIGHT_PX,
    THUMBNAIL_STRIP_DEFAULT_SIDE_WIDTH_PX,
    THUMBNAIL_STRIP_PLACEMENTS,
    MEDIA_IMAGE_MIN_ZOOM,
    MEDIA_IMAGE_MAX_ZOOM,
} from "./media-browser-config.js";

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
export {
    clamp,
    resolveRangeValueAtClientX,
    createDefaultMediaImageViewState,
    normalizeThumbnailStripPlacement,
    isVerticalThumbnailStripPlacement,
    resolveThumbnailPopoverPosition,
    resolveThumbnailDisclosureLevel,
    clampMediaImagePan,
    zoomMediaImageViewState,
};
