import {
    DEFAULT_VIEWPORT_WIDTH_PX,
    DEFAULT_VIEWPORT_HEIGHT_PX,
    DEFAULT_LABEL_MAX_COUNT,
    DEFAULT_LABEL_MIN_SCREEN_DIAMETER_PX,
    DEFAULT_LABEL_MIN_DIAMETER_KM,
    DEFAULT_LABEL_SPACING_PX,
    DEFAULT_LABEL_OFFSET_ANGULAR_RADIUS,
    DEFAULT_HOVER_LABEL_SCREEN_HEIGHT_PX,
    DEFAULT_HOVER_LABEL_SCREEN_GAP_PX,
    DEFAULT_HOVER_LABEL_VIEWPORT_MARGIN_PX,
    clamp,
    readFiniteNumber,
    normalizeVector3,
    negateVector3,
    projectVectorOntoPlane,
    chooseStableReferenceAxis,
    normalAtAngularOffset,
} from "./lunar-crater-common.js";
import { resolveViewFrame, projectUnitNormalToCameraFrame } from "./lunar-crater-projection.js";

export function getCraterLabelPlacement(options = {}) {
    const centerNormal = normalizeVector3(options.centerNormal ?? options.normal);
    if (!centerNormal) return null;

    const offsetAngularRadius = Math.max(
        0,
        readFiniteNumber(options.offsetAngularRadius, DEFAULT_LABEL_OFFSET_ANGULAR_RADIUS),
    );
    if (offsetAngularRadius <= 0) {
        return {
            centerNormal,
            labelNormal: centerNormal,
            offsetAngularRadius: 0,
            screenX: null,
            screenY: null,
        };
    }

    const preferredDirection = String(options.preferredScreenDirection || "up").toLowerCase();
    const cameraUpNormal = normalizeVector3(options.cameraUpNormal ?? options.cameraUp);
    const cameraRightNormal = normalizeVector3(options.cameraRightNormal ?? options.cameraRight);
    let tangentSource = null;
    if (preferredDirection === "down" && cameraUpNormal) {
        tangentSource = negateVector3(cameraUpNormal);
    } else if (preferredDirection === "right" && cameraRightNormal) {
        tangentSource = cameraRightNormal;
    } else if (preferredDirection === "left" && cameraRightNormal) {
        tangentSource = negateVector3(cameraRightNormal);
    } else if (cameraUpNormal) {
        tangentSource = cameraUpNormal;
    }

    let tangent = tangentSource ? projectVectorOntoPlane(tangentSource, centerNormal) : null;
    if (!tangent) {
        tangent = projectVectorOntoPlane(chooseStableReferenceAxis(centerNormal), centerNormal);
    }
    if (!tangent) {
        return {
            centerNormal,
            labelNormal: centerNormal,
            offsetAngularRadius: 0,
            screenX: null,
            screenY: null,
        };
    }

    const labelNormal = normalAtAngularOffset(centerNormal, tangent, offsetAngularRadius);
    let projection = null;
    const viewFrame = resolveViewFrame({
        ...options,
        viewCenterNormal: options.viewCenterNormal ?? centerNormal,
    });
    if (viewFrame?.cameraPositionMoonRadii && labelNormal) {
        projection = projectUnitNormalToCameraFrame(
            labelNormal,
            viewFrame,
            readFiniteNumber(options.surfaceScale, 1),
        );
    }

    return {
        centerNormal,
        labelNormal,
        offsetAngularRadius,
        screenX: projection?.screenX ?? null,
        screenY: projection?.screenY ?? null,
        normalizedX: projection?.normalizedX ?? null,
        normalizedY: projection?.normalizedY ?? null,
    };
}

function chooseLabelKeys(craters, options = {}) {
    const maxLabels = Math.max(
        0,
        Math.floor(readFiniteNumber(options.labelMaxCount, DEFAULT_LABEL_MAX_COUNT)),
    );
    if (maxLabels <= 0) return new Set();

    const minDiameterKm = Math.max(
        0,
        readFiniteNumber(options.labelMinDiameterKm, DEFAULT_LABEL_MIN_DIAMETER_KM),
    );
    const minScreenDiameterPx = Math.max(
        0,
        readFiniteNumber(options.labelMinScreenDiameterPx, DEFAULT_LABEL_MIN_SCREEN_DIAMETER_PX),
    );
    const labelSpacingPx = Math.max(
        0,
        readFiniteNumber(options.labelSpacingPx, DEFAULT_LABEL_SPACING_PX),
    );
    const chosen = [];
    const keys = new Set();
    const candidates = craters
        .filter((entry) =>
            entry.feature.diameterKm >= minDiameterKm &&
            entry.projectedDiameterPx >= minScreenDiameterPx,
        )
        .sort((a, b) =>
            b.projectedDiameterPx - a.projectedDiameterPx ||
            a.angularDistanceRad - b.angularDistanceRad ||
            String(a.feature.name).localeCompare(String(b.feature.name)),
        );

    for (const candidate of candidates) {
        if (chosen.length >= maxLabels) break;
        const overlaps = chosen.some((entry) =>
            Math.abs(entry.screenX - candidate.screenX) < labelSpacingPx &&
            Math.abs(entry.screenY - candidate.screenY) < labelSpacingPx,
        );
        if (overlaps) continue;
        chosen.push(candidate);
        keys.add(candidate.feature.name);
    }
    return keys;
}

export function getCraterHoverLabelScreenAnchor(options = {}) {
    const bounds = options.craterScreenBounds ?? options.bounds;
    if (!bounds) return null;

    const viewportWidthPx = Math.max(
        1,
        readFiniteNumber(options.viewportWidthPx ?? options.viewportWidth, DEFAULT_VIEWPORT_WIDTH_PX),
    );
    const viewportHeightPx = Math.max(
        1,
        readFiniteNumber(options.viewportHeightPx ?? options.viewportHeight, DEFAULT_VIEWPORT_HEIGHT_PX),
    );
    const labelScreenHeightPx = Math.max(
        1,
        readFiniteNumber(options.labelScreenHeightPx, DEFAULT_HOVER_LABEL_SCREEN_HEIGHT_PX),
    );
    const labelScreenWidthPx = Math.max(
        0,
        readFiniteNumber(options.labelScreenWidthPx, 0),
    );
    const gapPx = Math.max(
        0,
        readFiniteNumber(options.gapPx ?? options.screenGapPx, DEFAULT_HOVER_LABEL_SCREEN_GAP_PX),
    );
    const marginPx = Math.max(
        0,
        readFiniteNumber(options.marginPx ?? options.viewportMarginPx, DEFAULT_HOVER_LABEL_VIEWPORT_MARGIN_PX),
    );

    const left = readFiniteNumber(bounds.left, Number.NaN);
    const right = readFiniteNumber(bounds.right, Number.NaN);
    const top = readFiniteNumber(bounds.top, Number.NaN);
    const bottom = readFiniteNumber(bounds.bottom, Number.NaN);
    const centerX = readFiniteNumber(bounds.centerX ?? bounds.x, (left + right) * 0.5);
    if (
        !Number.isFinite(left) ||
        !Number.isFinite(right) ||
        !Number.isFinite(top) ||
        !Number.isFinite(bottom) ||
        !Number.isFinite(centerX)
    ) {
        return null;
    }

    const halfHeight = labelScreenHeightPx * 0.5;
    const halfWidth = labelScreenWidthPx * 0.5;
    const minX = marginPx + halfWidth;
    const maxX = Math.max(minX, viewportWidthPx - marginPx - halfWidth);
    const minY = marginPx + halfHeight;
    const maxY = Math.max(minY, viewportHeightPx - marginPx - halfHeight);
    const aboveY = top - gapPx - halfHeight;
    const belowY = bottom + gapPx + halfHeight;
    const canPlaceAbove = aboveY >= minY;
    const canPlaceBelow = belowY <= maxY;
    const placement = canPlaceAbove || !canPlaceBelow ? "above" : "below";
    const unclampedY = placement === "above" ? aboveY : belowY;

    return {
        screenX: clamp(centerX, minX, maxX),
        screenY: clamp(unclampedY, minY, maxY),
        placement,
        gapPx,
        labelScreenHeightPx,
    };
}

export { chooseLabelKeys };
