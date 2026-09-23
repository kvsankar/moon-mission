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

function getLunarFeatureKey(feature) {
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

export {
    craterFeatureCache,
    DEFAULT_LUNAR_RADIUS_KM,
    DEFAULT_VIEWPORT_WIDTH_PX,
    DEFAULT_VIEWPORT_HEIGHT_PX,
    DEFAULT_MIN_SCREEN_DIAMETER_PX,
    DEFAULT_MAX_CRATERS_TO_RENDER,
    DEFAULT_LABEL_MAX_COUNT,
    DEFAULT_LABEL_MIN_SCREEN_DIAMETER_PX,
    DEFAULT_LABEL_MIN_DIAMETER_KM,
    DEFAULT_LABEL_SPACING_PX,
    CRATER_VISIBILITY_EDGE_PADDING,
    DEFAULT_LABEL_OFFSET_ANGULAR_RADIUS,
    RIM_PROJECTION_SAMPLE_COUNT,
    DEFAULT_HOVER_LABEL_SCREEN_HEIGHT_PX,
    DEFAULT_HOVER_LABEL_SCREEN_GAP_PX,
    DEFAULT_HOVER_LABEL_VIEWPORT_MARGIN_PX,
    toRadians,
    clamp,
    readFiniteNumber,
    readOptionalFiniteNumber,
    normalizeSearchText,
    normalizeFeatureName,
    normalizeFeatureNameSet,
    getLunarFeatureKey,
    featureMatchesSearch,
    normalizeVector3,
    readVector3,
    vectorLength,
    addVector3,
    subtractVector3,
    scaleVector3,
    dotVector3,
    crossVector3,
    negateVector3,
    projectVectorOntoPlane,
    chooseStableReferenceAxis,
    resolveTangentBasis,
    normalAtAngularOffset,
};
