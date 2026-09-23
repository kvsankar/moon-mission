import {
    DEFAULT_LUNAR_RADIUS_KM,
    DEFAULT_VIEWPORT_WIDTH_PX,
    DEFAULT_VIEWPORT_HEIGHT_PX,
    CRATER_VISIBILITY_EDGE_PADDING,
    RIM_PROJECTION_SAMPLE_COUNT,
    toRadians,
    clamp,
    readFiniteNumber,
    normalizeVector3,
    readVector3,
    vectorLength,
    addVector3,
    subtractVector3,
    scaleVector3,
    dotVector3,
    crossVector3,
    projectVectorOntoPlane,
    chooseStableReferenceAxis,
    resolveTangentBasis,
    normalAtAngularOffset,
} from "./lunar-crater-common.js";

function resolveCameraPositionMoonRadii(options = {}) {
    const directPosition = readVector3(
        options.cameraPositionMoonRadii ??
        options.cameraMoonLocalPositionMoonRadii ??
        options.cameraPositionInMoonRadii,
    );
    if (directPosition && vectorLength(directPosition) > 1e-8) {
        return directPosition;
    }

    const moonRadius = Number(options.moonRadiusWorld ?? options.moonRadius);
    const localPosition = readVector3(options.cameraMoonLocalPosition ?? options.cameraPosition);
    if (localPosition && Number.isFinite(moonRadius) && moonRadius > 0) {
        const scaled = scaleVector3(localPosition, 1 / moonRadius);
        return vectorLength(scaled) > 1e-8 ? scaled : null;
    }

    const distance = Number(options.cameraDistanceMoonRadii ?? options.observerDistanceMoonRadii);
    const normal = normalizeVector3(
        options.cameraPositionNormal ??
        options.cameraMoonLocalNormal ??
        options.observerNormal,
    );
    if (normal && Number.isFinite(distance) && distance > 0) {
        return scaleVector3(normal, distance);
    }
    return null;
}

function resolveCameraOrientation({ options, centerNormal, cameraPosition }) {
    let forwardNormal = normalizeVector3(
        options.cameraForwardNormal ??
        options.cameraForward ??
        options.viewForwardNormal,
    );
    if (!forwardNormal && cameraPosition) {
        forwardNormal = normalizeVector3(subtractVector3(centerNormal, cameraPosition));
    }
    if (!forwardNormal) return null;

    const configuredRight = normalizeVector3(options.cameraRightNormal ?? options.cameraRight);
    const configuredUp = normalizeVector3(options.cameraUpNormal ?? options.cameraUp);
    let rightNormal = configuredRight;
    let upNormal = configuredUp;

    if (!rightNormal && upNormal) {
        rightNormal = normalizeVector3(crossVector3(forwardNormal, upNormal));
    }
    if (!upNormal && rightNormal) {
        upNormal = normalizeVector3(crossVector3(rightNormal, forwardNormal));
    }
    if (!rightNormal || !upNormal) {
        const referenceUp = projectVectorOntoPlane(chooseStableReferenceAxis(forwardNormal), forwardNormal) ||
            { x: 0, y: 0, z: 1 };
        upNormal = projectVectorOntoPlane(referenceUp, forwardNormal);
        rightNormal = upNormal ? normalizeVector3(crossVector3(forwardNormal, upNormal)) : null;
    }
    if (!rightNormal || !upNormal) return null;

    upNormal = normalizeVector3(crossVector3(rightNormal, forwardNormal));
    if (!upNormal) return null;

    return {
        forwardNormal,
        rightNormal,
        upNormal,
    };
}

export function craterLatLonToUnitVector(latitudeDeg, longitudeDeg) {
    const latitudeRad = toRadians(latitudeDeg);
    const longitudeRad = toRadians(longitudeDeg);
    const cosLatitude = Math.cos(latitudeRad);
    return normalizeVector3({
        x: cosLatitude * Math.cos(longitudeRad),
        y: cosLatitude * Math.sin(longitudeRad),
        z: Math.sin(latitudeRad),
    });
}

function resolveViewCenterNormal(options = {}) {
    const explicitNormal = normalizeVector3(options.viewCenterNormal ?? options.centerNormal);
    if (explicitNormal) return explicitNormal;
    const latitudeDeg = Number(options.viewCenterLatitudeDeg ?? options.centerLatitudeDeg);
    const longitudeDeg = Number(options.viewCenterLongitudeDeg ?? options.centerLongitudeDeg);
    if (!Number.isFinite(latitudeDeg) || !Number.isFinite(longitudeDeg)) {
        return null;
    }
    return craterLatLonToUnitVector(latitudeDeg, longitudeDeg);
}

function resolveViewFrame(options = {}) {
    const centerNormal = resolveViewCenterNormal(options);
    if (!centerNormal) return null;

    const viewportWidthPx = Math.max(
        1,
        Number(options.viewportWidthPx ?? options.viewportWidth ?? DEFAULT_VIEWPORT_WIDTH_PX) ||
            DEFAULT_VIEWPORT_WIDTH_PX,
    );
    const viewportHeightPx = Math.max(
        1,
        Number(options.viewportHeightPx ?? options.viewportHeight ?? DEFAULT_VIEWPORT_HEIGHT_PX) ||
            DEFAULT_VIEWPORT_HEIGHT_PX,
    );
    const aspect = Number.isFinite(Number(options.aspect))
        ? Math.max(0.0001, Number(options.aspect))
        : viewportWidthPx / viewportHeightPx;
    const verticalFovDeg = Number(options.verticalFovDeg ?? options.fovDeg);
    let verticalFovRad = Number.isFinite(verticalFovDeg)
        ? toRadians(verticalFovDeg)
        : Math.PI / 4;
    verticalFovRad = clamp(verticalFovRad, 0.0001, Math.PI - 0.0001);

    const configuredHorizontalFovDeg = Number(options.horizontalFovDeg);
    const horizontalFovRad = Number.isFinite(configuredHorizontalFovDeg)
        ? clamp(toRadians(configuredHorizontalFovDeg), 0.0001, Math.PI - 0.0001)
        : clamp(
            2 * Math.atan(Math.tan(verticalFovRad * 0.5) * aspect),
            0.0001,
            Math.PI - 0.0001,
        );

    const northPole = { x: 0, y: 0, z: 1 };
    let eastNormal = normalizeVector3(crossVector3(northPole, centerNormal));
    if (!eastNormal) {
        eastNormal = normalizeVector3(crossVector3({ x: 0, y: 1, z: 0 }, centerNormal));
    }
    if (!eastNormal) return null;
    const northNormal = normalizeVector3(crossVector3(centerNormal, eastNormal));
    if (!northNormal) return null;

    const rect = options.viewRectPx ?? options.viewRectanglePx ?? null;
    const viewRectPx = rect
        ? {
            left: clamp(Number(rect.left ?? rect.x ?? 0) || 0, 0, viewportWidthPx),
            top: clamp(Number(rect.top ?? rect.y ?? 0) || 0, 0, viewportHeightPx),
            right: clamp(
                Number(rect.right ?? ((rect.left ?? rect.x ?? 0) + (rect.width ?? viewportWidthPx))) ||
                    viewportWidthPx,
                0,
                viewportWidthPx,
            ),
            bottom: clamp(
                Number(rect.bottom ?? ((rect.top ?? rect.y ?? 0) + (rect.height ?? viewportHeightPx))) ||
                    viewportHeightPx,
                0,
                viewportHeightPx,
            ),
        }
        : {
            left: 0,
            top: 0,
            right: viewportWidthPx,
            bottom: viewportHeightPx,
        };

    const cameraPositionMoonRadii = resolveCameraPositionMoonRadii(options);
    const cameraOrientation = cameraPositionMoonRadii
        ? resolveCameraOrientation({ options, centerNormal, cameraPosition: cameraPositionMoonRadii })
        : null;
    const observerNormal = normalizeVector3(
        options.observerNormal ??
        options.cameraPositionNormal ??
        options.cameraMoonLocalNormal ??
        cameraPositionMoonRadii,
    ) || centerNormal;
    const sunNormal = normalizeVector3(
        options.sunNormal ??
        options.sunDirectionLocal ??
        options.moonSunLocalNormal ??
        options.moonSunDirection,
    );

    return {
        centerNormal,
        eastNormal,
        northNormal,
        observerNormal,
        sunNormal,
        cameraPositionMoonRadii,
        cameraForwardNormal: cameraOrientation?.forwardNormal ?? null,
        cameraRightNormal: cameraOrientation?.rightNormal ?? null,
        cameraUpNormal: cameraOrientation?.upNormal ?? null,
        horizontalHalfFovRad: horizontalFovRad * 0.5,
        verticalHalfFovRad: verticalFovRad * 0.5,
        viewportWidthPx,
        viewportHeightPx,
        viewRectPx,
    };
}

function getCraterAngularRadius(feature, lunarRadiusKm) {
    const diameterKm = Number(feature?.diameterKm);
    const radiusKm = Number(lunarRadiusKm);
    if (!Number.isFinite(diameterKm) || diameterKm <= 0 || !Number.isFinite(radiusKm) || radiusKm <= 0) {
        return null;
    }
    return Math.max(0.0001, (diameterKm * 0.5) / radiusKm);
}

function getCraterVisibilityThreshold(angularRadiusRad) {
    return -Math.sin(Math.min(Math.PI / 2, angularRadiusRad)) -
        CRATER_VISIBILITY_EDGE_PADDING;
}

export function getCraterBoundaryTone(options = {}) {
    const centerNormal = normalizeVector3(options.centerNormal ?? options.normal);
    const sunNormal = normalizeVector3(
        options.sunNormal ??
        options.sunDirectionLocal ??
        options.moonSunLocalNormal ??
        options.moonSunDirection,
    );
    if (!centerNormal || !sunNormal) {
        return {
            sunlit: null,
            illumination: null,
            tone: "unknown",
        };
    }
    const illumination = dotVector3(centerNormal, sunNormal);
    const litThreshold = readFiniteNumber(options.litThreshold, 0);
    return {
        sunlit: illumination >= litThreshold,
        illumination,
        tone: illumination >= litThreshold ? "lit" : "unlit",
    };
}

function projectUnitNormalToCameraFrame(normal, viewFrame, radius = 1) {
    if (
        !normal ||
        !viewFrame?.cameraPositionMoonRadii ||
        !viewFrame.cameraForwardNormal ||
        !viewFrame.cameraRightNormal ||
        !viewFrame.cameraUpNormal
    ) {
        return null;
    }
    const point = scaleVector3(normal, radius);
    const toPoint = subtractVector3(point, viewFrame.cameraPositionMoonRadii);
    const depth = dotVector3(toPoint, viewFrame.cameraForwardNormal);
    if (!Number.isFinite(depth) || depth <= 1e-9) {
        return null;
    }
    const horizontalScale = depth * Math.tan(viewFrame.horizontalHalfFovRad);
    const verticalScale = depth * Math.tan(viewFrame.verticalHalfFovRad);
    if (Math.abs(horizontalScale) <= 1e-12 || Math.abs(verticalScale) <= 1e-12) {
        return null;
    }
    const normalizedX = dotVector3(toPoint, viewFrame.cameraRightNormal) / horizontalScale;
    const normalizedY = dotVector3(toPoint, viewFrame.cameraUpNormal) / verticalScale;
    const screenX = ((normalizedX + 1) * 0.5) * viewFrame.viewportWidthPx;
    const screenY = ((1 - normalizedY) * 0.5) * viewFrame.viewportHeightPx;
    if (
        !Number.isFinite(normalizedX) ||
        !Number.isFinite(normalizedY) ||
        !Number.isFinite(screenX) ||
        !Number.isFinite(screenY)
    ) {
        return null;
    }
    return {
        depth,
        normalizedX,
        normalizedY,
        screenX,
        screenY,
    };
}

function calculateProjectedCraterDiameterPx({ centerNormal, angularRadiusRad, centerProjection, viewFrame }) {
    const basis = resolveTangentBasis(centerNormal);
    if (!basis || !centerProjection) return null;

    let projectedRadiusPx = 0;
    for (let index = 0; index < RIM_PROJECTION_SAMPLE_COUNT; index += 1) {
        const theta = (index / RIM_PROJECTION_SAMPLE_COUNT) * Math.PI * 2;
        const tangent = normalizeVector3(addVector3(
            scaleVector3(basis.tangentA, Math.cos(theta)),
            scaleVector3(basis.tangentB, Math.sin(theta)),
        ));
        const rimNormal = tangent
            ? normalAtAngularOffset(centerNormal, tangent, angularRadiusRad)
            : null;
        const rimProjection = rimNormal
            ? projectUnitNormalToCameraFrame(rimNormal, viewFrame)
            : null;
        if (!rimProjection) continue;
        const distancePx = Math.hypot(
            rimProjection.screenX - centerProjection.screenX,
            rimProjection.screenY - centerProjection.screenY,
        );
        if (Number.isFinite(distancePx)) {
            projectedRadiusPx = Math.max(projectedRadiusPx, distancePx);
        }
    }
    if (projectedRadiusPx > 0) {
        return projectedRadiusPx * 2;
    }
    return null;
}

function projectCraterWithCameraFrame({ feature, centerNormal, angularRadiusRad, viewFrame }) {
    const observerDepth = dotVector3(centerNormal, viewFrame.observerNormal);
    if (observerDepth <= getCraterVisibilityThreshold(angularRadiusRad)) {
        return null;
    }

    const centerProjection = projectUnitNormalToCameraFrame(centerNormal, viewFrame);
    if (!centerProjection) {
        return null;
    }

    const measuredProjectedDiameterPx = calculateProjectedCraterDiameterPx({
        centerNormal,
        angularRadiusRad,
        centerProjection,
        viewFrame,
    });
    const fallbackPxPerRad = Math.min(
        viewFrame.viewportWidthPx / (2 * viewFrame.horizontalHalfFovRad),
        viewFrame.viewportHeightPx / (2 * viewFrame.verticalHalfFovRad),
    );
    const fallbackProjectedDiameterPx = angularRadiusRad * 2 * fallbackPxPerRad /
        Math.max(0.001, centerProjection.depth);
    const projectedDiameterPx = Number.isFinite(measuredProjectedDiameterPx) && measuredProjectedDiameterPx > 0
        ? measuredProjectedDiameterPx
        : fallbackProjectedDiameterPx;
    const rect = viewFrame.viewRectPx;
    const screenMarginPx = Math.max(2, projectedDiameterPx * 0.5);
    if (
        centerProjection.screenX < rect.left - screenMarginPx ||
        centerProjection.screenX > rect.right + screenMarginPx ||
        centerProjection.screenY < rect.top - screenMarginPx ||
        centerProjection.screenY > rect.bottom + screenMarginPx
    ) {
        return null;
    }

    const centerDepth = dotVector3(centerNormal, viewFrame.centerNormal);
    const angularDistanceRad = Math.acos(clamp(centerDepth, -1, 1));
    const boundaryTone = getCraterBoundaryTone({
        centerNormal,
        sunNormal: viewFrame.sunNormal,
    });
    return {
        feature,
        centerNormal,
        angularRadiusRad,
        angularDistanceRad,
        normalizedX: centerProjection.normalizedX,
        normalizedY: centerProjection.normalizedY,
        screenX: centerProjection.screenX,
        screenY: centerProjection.screenY,
        projectedDiameterPx,
        observerDepth,
        sunlit: boundaryTone.sunlit,
        illumination: boundaryTone.illumination,
        boundaryTone: boundaryTone.tone,
        insideViewRect:
            centerProjection.screenX >= rect.left &&
            centerProjection.screenX <= rect.right &&
            centerProjection.screenY >= rect.top &&
            centerProjection.screenY <= rect.bottom,
    };
}

function projectCraterWithSurfaceFrame({ feature, centerNormal, angularRadiusRad, viewFrame }) {
    const visibilityDepth = dotVector3(centerNormal, viewFrame.observerNormal || viewFrame.centerNormal);
    if (visibilityDepth <= getCraterVisibilityThreshold(angularRadiusRad)) {
        return null;
    }

    const depth = dotVector3(centerNormal, viewFrame.centerNormal);

    const xRad = Math.atan2(dotVector3(centerNormal, viewFrame.eastNormal), Math.max(1e-9, depth));
    const yRad = Math.atan2(dotVector3(centerNormal, viewFrame.northNormal), Math.max(1e-9, depth));
    const normalizedX = xRad / viewFrame.horizontalHalfFovRad;
    const normalizedY = yRad / viewFrame.verticalHalfFovRad;
    const screenX = ((normalizedX + 1) * 0.5) * viewFrame.viewportWidthPx;
    const screenY = ((1 - normalizedY) * 0.5) * viewFrame.viewportHeightPx;
    const pxPerRad = Math.min(
        viewFrame.viewportWidthPx / (2 * viewFrame.horizontalHalfFovRad),
        viewFrame.viewportHeightPx / (2 * viewFrame.verticalHalfFovRad),
    );
    const edgeScale = 1 / Math.max(0.35, depth);
    const projectedDiameterPx = angularRadiusRad * 2 * pxPerRad * edgeScale;
    const rect = viewFrame.viewRectPx;
    const screenMarginPx = Math.max(2, projectedDiameterPx * 0.5);
    if (
        screenX < rect.left - screenMarginPx ||
        screenX > rect.right + screenMarginPx ||
        screenY < rect.top - screenMarginPx ||
        screenY > rect.bottom + screenMarginPx
    ) {
        return null;
    }

    const angularDistanceRad = Math.acos(clamp(depth, -1, 1));
    const boundaryTone = getCraterBoundaryTone({
        centerNormal,
        sunNormal: viewFrame.sunNormal,
    });
    return {
        feature,
        centerNormal,
        angularRadiusRad,
        angularDistanceRad,
        normalizedX,
        normalizedY,
        screenX,
        screenY,
        projectedDiameterPx,
        observerDepth: visibilityDepth,
        sunlit: boundaryTone.sunlit,
        illumination: boundaryTone.illumination,
        boundaryTone: boundaryTone.tone,
        insideViewRect:
            screenX >= rect.left &&
            screenX <= rect.right &&
            screenY >= rect.top &&
            screenY <= rect.bottom,
    };
}

function projectCraterToView(feature, viewFrame, options = {}) {
    const centerNormal = craterLatLonToUnitVector(feature.latitudeDeg, feature.longitudeDeg);
    if (!centerNormal || !viewFrame) return null;

    const lunarRadiusKm = Number(options.lunarRadiusKm) > 0
        ? Number(options.lunarRadiusKm)
        : DEFAULT_LUNAR_RADIUS_KM;
    const angularRadiusRad = getCraterAngularRadius(feature, lunarRadiusKm);
    if (!angularRadiusRad) return null;

    if (viewFrame.cameraPositionMoonRadii && viewFrame.cameraForwardNormal) {
        return projectCraterWithCameraFrame({
            feature,
            centerNormal,
            angularRadiusRad,
            viewFrame,
        });
    }
    return projectCraterWithSurfaceFrame({
        feature,
        centerNormal,
        angularRadiusRad,
        viewFrame,
    });
}

export {
    resolveViewFrame,
    projectUnitNormalToCameraFrame,
    getCraterAngularRadius,
    projectCraterToView,
};
