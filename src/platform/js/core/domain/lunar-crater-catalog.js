import {
    LUNAR_CRATER_DEFAULT_MAX_DIAMETER_KM,
    LUNAR_CRATER_DEFAULT_MIN_DIAMETER_KM,
    LUNAR_CRATER_RANGE_MAX_DIAMETER_KM,
    LUNAR_CRATER_RANGE_MIN_DIAMETER_KM,
    normalizeLunarCraterDiameterRange,
} from "./lunar-crater-view.js";

const craterFeatureCache = new WeakMap();
const DEG_TO_RAD = Math.PI / 180;
const DEFAULT_LUNAR_RADIUS_KM = 1737.4;
const DEFAULT_VIEWPORT_WIDTH_PX = 1000;
const DEFAULT_VIEWPORT_HEIGHT_PX = 1000;
const DEFAULT_MIN_SCREEN_DIAMETER_PX = 4;
const DEFAULT_MAX_CRATERS_TO_RENDER = 900;
const DEFAULT_LABEL_MAX_COUNT = 14;
const DEFAULT_LABEL_MIN_SCREEN_DIAMETER_PX = 42;
const DEFAULT_LABEL_MIN_DIAMETER_KM = 0;
const DEFAULT_LABEL_SPACING_PX = 120;
const CRATER_VISIBILITY_EDGE_PADDING = 0.01;
const DEFAULT_LABEL_OFFSET_ANGULAR_RADIUS = 0;
const RIM_PROJECTION_SAMPLE_COUNT = 16;
const DEFAULT_HOVER_LABEL_SCREEN_HEIGHT_PX = 36;
const DEFAULT_HOVER_LABEL_SCREEN_GAP_PX = 6;
const DEFAULT_HOVER_LABEL_VIEWPORT_MARGIN_PX = 4;

function toRadians(degrees) {
    return Number(degrees) * DEG_TO_RAD;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function readFiniteNumber(value, fallback) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : fallback;
}

function readOptionalFiniteNumber(value, fallback) {
    if (value === null || value === undefined || value === "") {
        return fallback;
    }
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : fallback;
}

function normalizeSearchText(value) {
    return String(value || "").trim().toLowerCase();
}

function normalizeFeatureName(value) {
    return normalizeSearchText(value)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

function normalizeFeatureNameSet(value) {
    if (!Array.isArray(value)) return new Set();
    return new Set(value.map(normalizeFeatureName).filter(Boolean));
}

export function getLunarFeatureKey(feature) {
    const link = typeof feature?.link === "string" ? feature.link.trim() : "";
    if (link) return link;
    return [
        feature?.name,
        feature?.featureType,
        Number.isFinite(Number(feature?.latitudeDeg)) ? Number(feature.latitudeDeg).toFixed(4) : "",
        Number.isFinite(Number(feature?.longitudeDeg)) ? Number(feature.longitudeDeg).toFixed(4) : "",
    ].map((value) => String(value || "").trim()).join("|");
}

function featureMatchesSearch(feature, query) {
    if (!query) return true;
    return [
        feature?.name,
        feature?.cleanName,
        feature?.featureType,
    ].some((value) => normalizeSearchText(value).includes(query));
}

function normalizeVector3(vector) {
    if (!vector) return null;
    const x = Number(Array.isArray(vector) ? vector[0] : vector.x);
    const y = Number(Array.isArray(vector) ? vector[1] : vector.y);
    const z = Number(Array.isArray(vector) ? vector[2] : vector.z);
    const length = Math.hypot(x, y, z);
    if (!Number.isFinite(length) || length <= 1e-12) return null;
    return {
        x: x / length,
        y: y / length,
        z: z / length,
    };
}

function readVector3(vector) {
    if (!vector) return null;
    const x = Number(Array.isArray(vector) ? vector[0] : vector.x);
    const y = Number(Array.isArray(vector) ? vector[1] : vector.y);
    const z = Number(Array.isArray(vector) ? vector[2] : vector.z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        return null;
    }
    return { x, y, z };
}

function vectorLength(vector) {
    return Math.hypot(vector.x, vector.y, vector.z);
}

function addVector3(a, b) {
    return {
        x: a.x + b.x,
        y: a.y + b.y,
        z: a.z + b.z,
    };
}

function subtractVector3(a, b) {
    return {
        x: a.x - b.x,
        y: a.y - b.y,
        z: a.z - b.z,
    };
}

function scaleVector3(vector, scalar) {
    return {
        x: vector.x * scalar,
        y: vector.y * scalar,
        z: vector.z * scalar,
    };
}

function dotVector3(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}

function crossVector3(a, b) {
    return {
        x: a.y * b.z - a.z * b.y,
        y: a.z * b.x - a.x * b.z,
        z: a.x * b.y - a.y * b.x,
    };
}

function negateVector3(vector) {
    return {
        x: -vector.x,
        y: -vector.y,
        z: -vector.z,
    };
}

function projectVectorOntoPlane(vector, planeNormal) {
    const projected = subtractVector3(
        vector,
        scaleVector3(planeNormal, dotVector3(vector, planeNormal)),
    );
    return normalizeVector3(projected);
}

function chooseStableReferenceAxis(normal) {
    if (Math.abs(normal.z) <= 0.88) {
        return { x: 0, y: 0, z: 1 };
    }
    if (Math.abs(normal.y) <= 0.88) {
        return { x: 0, y: 1, z: 0 };
    }
    return { x: 1, y: 0, z: 0 };
}

function resolveTangentBasis(normal) {
    const referenceAxis = chooseStableReferenceAxis(normal);
    let tangentA = normalizeVector3(crossVector3(referenceAxis, normal));
    if (!tangentA) {
        tangentA = normalizeVector3(crossVector3({ x: 0, y: 1, z: 0 }, normal));
    }
    if (!tangentA) return null;
    const tangentB = normalizeVector3(crossVector3(normal, tangentA));
    if (!tangentB) return null;
    return { tangentA, tangentB };
}

function normalAtAngularOffset(centerNormal, tangent, angularOffset) {
    const offset = Math.max(0, Number(angularOffset) || 0);
    if (offset <= 0) return centerNormal;
    return normalizeVector3(addVector3(
        scaleVector3(centerNormal, Math.cos(offset)),
        scaleVector3(tangent, Math.sin(offset)),
    ));
}

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

export function getValidCraterFeatures(catalog = {}) {
    if (catalog && typeof catalog === "object" && craterFeatureCache.has(catalog)) {
        return craterFeatureCache.get(catalog);
    }
    const features = (catalog?.features || [])
        .filter((feature) =>
            Number.isFinite(feature?.latitudeDeg) &&
            Number.isFinite(feature?.longitudeDeg) &&
            Number.isFinite(feature?.diameterKm) &&
            typeof feature.name === "string" &&
            feature.name.trim(),
        )
        .sort((a, b) => b.diameterKm - a.diameterKm);
    if (catalog && typeof catalog === "object") {
        craterFeatureCache.set(catalog, features);
    }
    return features;
}

export function getCraterDiameterBounds(catalog = {}) {
    const configuredMin = Number(catalog?.display?.rangeMinDiameterKm);
    const configuredMax = Number(catalog?.display?.rangeMaxDiameterKm);
    const featureDiameters = (catalog?.features || [])
        .map((feature) => Number(feature?.diameterKm))
        .filter(Number.isFinite);
    const largestFeatureDiameter = featureDiameters.length
        ? Math.max(...featureDiameters)
        : LUNAR_CRATER_RANGE_MAX_DIAMETER_KM;
    const maxDiameterKm = Number.isFinite(configuredMax)
        ? configuredMax
        : Math.max(
            LUNAR_CRATER_RANGE_MAX_DIAMETER_KM,
            Math.ceil(largestFeatureDiameter / 10) * 10,
        );
    const minDiameterKm = Number.isFinite(configuredMin)
        ? configuredMin
        : LUNAR_CRATER_RANGE_MIN_DIAMETER_KM;

    return {
        minDiameterKm,
        maxDiameterKm: Math.max(minDiameterKm, maxDiameterKm),
    };
}

export function getCraterDiameterFallback(catalog = {}) {
    return {
        lunarCraterMinDiameterKm: Number.isFinite(Number(catalog?.display?.defaultMinDiameterKm))
            ? Number(catalog.display.defaultMinDiameterKm)
            : (Number.isFinite(Number(catalog?.display?.minDiameterKm))
                ? Number(catalog.display.minDiameterKm)
                : LUNAR_CRATER_DEFAULT_MIN_DIAMETER_KM),
        lunarCraterMaxDiameterKm: Number.isFinite(Number(catalog?.display?.defaultMaxDiameterKm))
            ? Number(catalog.display.defaultMaxDiameterKm)
            : LUNAR_CRATER_DEFAULT_MAX_DIAMETER_KM,
    };
}

export function normalizeCraterDisplayDiameterRange(value = {}, catalog = {}) {
    return normalizeLunarCraterDiameterRange(
        value,
        getCraterDiameterFallback(catalog),
        getCraterDiameterBounds(catalog),
    );
}

export function getCraterDisplayFeatures(catalog = {}, options = {}) {
    const features = getValidCraterFeatures(catalog);
    const typeFilters = options?.lunarFeatureTypeFilters && typeof options.lunarFeatureTypeFilters === "object"
        ? options.lunarFeatureTypeFilters
        : null;
    const searchQuery = normalizeSearchText(options.lunarFeatureSearchQuery ?? options.searchQuery);
    const pinnedNames = normalizeFeatureNameSet(options.lunarFeaturePinnedNames);
    const excludedKeys = new Set(Array.isArray(options.lunarFeatureExcludedKeys)
        ? options.lunarFeatureExcludedKeys.map((entry) => String(entry || "").trim()).filter(Boolean)
        : []);
    if (
        options.includeAll === true &&
        !Number.isFinite(Number(options.lunarCraterMinDiameterKm ?? options.minDiameterKm)) &&
        !Number.isFinite(Number(options.lunarCraterMaxDiameterKm ?? options.maxDiameterKm)) &&
        !typeFilters &&
        !searchQuery &&
        pinnedNames.size === 0 &&
        excludedKeys.size === 0
    ) {
        return features;
    }
    const diameterRange = normalizeCraterDisplayDiameterRange(options, catalog);
    const selectedFeatures = [];
    for (const feature of features) {
        const pinned = pinnedNames.has(normalizeFeatureName(feature.name)) ||
            pinnedNames.has(normalizeFeatureName(feature.cleanName));
        if (searchQuery && !featureMatchesSearch(feature, searchQuery) && !pinned) {
            continue;
        }
        if (!searchQuery && pinnedNames.size > 0 && !pinned) {
            continue;
        }
        if (excludedKeys.has(getLunarFeatureKey(feature))) {
            continue;
        }
        if (pinned) {
            selectedFeatures.push(feature);
            continue;
        }
        const typeFilter = typeFilters
            ? typeFilters[feature.featureType] || null
            : null;
        if (typeFilter?.enabled === false) {
            continue;
        }
        const minDiameterKm = readOptionalFiniteNumber(
            typeFilter?.minDiameterKm,
            diameterRange.lunarCraterMinDiameterKm,
        );
        const maxDiameterKm = readOptionalFiniteNumber(
            typeFilter?.maxDiameterKm,
            diameterRange.lunarCraterMaxDiameterKm,
        );
        if (feature.diameterKm > maxDiameterKm) {
            continue;
        }
        if (feature.diameterKm < minDiameterKm) {
            if (!typeFilters) {
                break;
            }
            continue;
        }
        selectedFeatures.push(feature);
    }
    return selectedFeatures;
}

export function countCraterDisplayFeatures(catalog = {}, options = {}) {
    return getCraterDisplayFeatures(catalog, options).length;
}

export function getCratersToShow(catalog = {}, options = {}) {
    const filteredFeatures = getCraterDisplayFeatures(catalog, options);
    const rawMaxCount = Number(options.maxCount ?? options.renderLimit);
    const maxCount = Math.max(
        0,
        Math.floor(Number.isFinite(rawMaxCount) ? rawMaxCount : DEFAULT_MAX_CRATERS_TO_RENDER),
    );
    if (maxCount <= 0) {
        return {
            craters: [],
            filteredCount: filteredFeatures.length,
            candidateCount: 0,
            renderedCount: 0,
            omittedCount: filteredFeatures.length,
            hasViewFrame: false,
        };
    }

    const minScreenDiameterPx = Math.max(
        0,
        readFiniteNumber(options.minScreenDiameterPx, DEFAULT_MIN_SCREEN_DIAMETER_PX),
    );
    const viewFrame = resolveViewFrame(options);
    const candidates = viewFrame
        ? filteredFeatures
            .map((feature) => projectCraterToView(feature, viewFrame, options))
            .filter(Boolean)
            .filter((entry) => entry.projectedDiameterPx >= minScreenDiameterPx)
        : filteredFeatures.map((feature) => ({
            feature,
            centerNormal: craterLatLonToUnitVector(feature.latitudeDeg, feature.longitudeDeg),
            angularRadiusRad: getCraterAngularRadius(feature, options.lunarRadiusKm || DEFAULT_LUNAR_RADIUS_KM),
            angularDistanceRad: 0,
            normalizedX: 0,
            normalizedY: 0,
            screenX: null,
            screenY: null,
            projectedDiameterPx: null,
            insideViewRect: true,
        })).filter((entry) => entry.centerNormal && entry.angularRadiusRad);

    candidates.sort((a, b) => {
        const aDistance = Math.hypot(a.normalizedX || 0, a.normalizedY || 0);
        const bDistance = Math.hypot(b.normalizedX || 0, b.normalizedY || 0);
        return aDistance - bDistance ||
            (b.projectedDiameterPx || 0) - (a.projectedDiameterPx || 0) ||
            b.feature.diameterKm - a.feature.diameterKm ||
            String(a.feature.name).localeCompare(String(b.feature.name));
    });

    const selected = candidates.slice(0, maxCount);
    const labelKeys = options.labelEveryRenderedCrater === true
        ? new Set(selected.map((entry) => entry.feature.name))
        : chooseLabelKeys(selected, options);
    const craters = selected.map((entry) => ({
        crater: entry.feature,
        feature: entry.feature,
        centerNormal: entry.centerNormal,
        angularRadiusRad: entry.angularRadiusRad,
        angularDistanceRad: entry.angularDistanceRad,
        normalizedX: entry.normalizedX,
        normalizedY: entry.normalizedY,
        screenX: entry.screenX,
        screenY: entry.screenY,
        projectedDiameterPx: entry.projectedDiameterPx,
        observerDepth: entry.observerDepth,
        sunlit: entry.sunlit,
        illumination: entry.illumination,
        boundaryTone: entry.boundaryTone,
        showLabel: labelKeys.has(entry.feature.name),
    }));

    return {
        craters,
        filteredCount: filteredFeatures.length,
        candidateCount: candidates.length,
        renderedCount: craters.length,
        omittedCount: Math.max(0, filteredFeatures.length - craters.length),
        hasViewFrame: !!viewFrame,
    };
}
