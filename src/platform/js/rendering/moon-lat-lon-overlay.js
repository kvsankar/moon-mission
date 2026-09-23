// @ts-nocheck
import * as THREE from "three";

const MOON_LAT_LON_GRID_DEFAULT_STEP_DEGREES = 10;
const MOON_LAT_LON_GRID_SEGMENTS = 144;
const MOON_LAT_LON_GRID_RADIUS_SCALE = 1.0025;
const MOON_LAT_LON_GRID_LABEL_RADIUS_SCALE = 1.035;
const MOON_LAT_LON_GRID_HOVER_RADIUS_SCALE = 1.018;
const MOON_LAT_LON_GRID_HOVER_TANGENT_OFFSET_SCALE = 0.055;
const MOON_LAT_LON_GRID_LABEL_MIN_INTERVAL_DEGREES = 10;
const MOON_LAT_LON_LABEL_MIN_SCREEN_RADIUS_PX = 160;
const MOON_LAT_LON_GRID_STEPS_BY_SCREEN_RADIUS = Object.freeze([
    { minScreenRadiusPx: 620, stepDegrees: 5 },
    { minScreenRadiusPx: 280, stepDegrees: 10 },
    { minScreenRadiusPx: 130, stepDegrees: 20 },
    { minScreenRadiusPx: 0, stepDegrees: 30 },
]);
function moonLatLonPoint(radius, latitudeDeg, longitudeDeg) {
    const lat = THREE.MathUtils.degToRad(latitudeDeg);
    const lon = THREE.MathUtils.degToRad(displayMoonLongitudeToRenderLongitude(longitudeDeg));
    const cosLat = Math.cos(lat);
    return new THREE.Vector3(
        radius * cosLat * Math.sin(lon),
        radius * cosLat * Math.cos(lon),
        radius * Math.sin(lat),
    );
}

function displayMoonLongitudeToRenderLongitude(longitudeDeg) {
    return 90 - Number(longitudeDeg);
}

function renderMoonLongitudeToDisplayLongitude(longitudeDeg) {
    const normalized = 90 - Number(longitudeDeg);
    if (!Number.isFinite(normalized)) return 0;
    return THREE.MathUtils.euclideanModulo(normalized + 180, 360) - 180;
}

function pushLineVertexPair(vertices, start, end) {
    vertices.push(start.x, start.y, start.z, end.x, end.y, end.z);
}

function buildMoonLatitudeLineVertices(radius, latitudeDeg, segments = MOON_LAT_LON_GRID_SEGMENTS) {
    const vertices = [];
    for (let i = 0; i < segments; i += 1) {
        const lon0 = -180 + (360 * i / segments);
        const lon1 = -180 + (360 * (i + 1) / segments);
        pushLineVertexPair(
            vertices,
            moonLatLonPoint(radius, latitudeDeg, lon0),
            moonLatLonPoint(radius, latitudeDeg, lon1),
        );
    }
    return vertices;
}

function buildMoonLongitudeLineVertices(radius, longitudeDeg, segments = MOON_LAT_LON_GRID_SEGMENTS) {
    const vertices = [];
    for (let i = 0; i < segments; i += 1) {
        const lat0 = -90 + (180 * i / segments);
        const lat1 = -90 + (180 * (i + 1) / segments);
        pushLineVertexPair(
            vertices,
            moonLatLonPoint(radius, lat0, longitudeDeg),
            moonLatLonPoint(radius, lat1, longitudeDeg),
        );
    }
    return vertices;
}

function createLineSegmentsFromVertices(vertices, material) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    return new THREE.LineSegments(geometry, material);
}

function normalizeMoonLatLonGridStep(stepDegrees) {
    const candidate = Number(stepDegrees);
    if ([5, 10, 20, 30].includes(candidate)) {
        return candidate;
    }
    return MOON_LAT_LON_GRID_DEFAULT_STEP_DEGREES;
}

function resolveMoonLatLonGridStepFromScreenRadius(screenRadiusPx) {
    const radiusPx = Number(screenRadiusPx);
    if (!Number.isFinite(radiusPx)) {
        return MOON_LAT_LON_GRID_DEFAULT_STEP_DEGREES;
    }
    const match = MOON_LAT_LON_GRID_STEPS_BY_SCREEN_RADIUS.find(
        (entry) => radiusPx >= entry.minScreenRadiusPx,
    );
    return match?.stepDegrees ?? MOON_LAT_LON_GRID_DEFAULT_STEP_DEGREES;
}

function resolveMoonHoverCoordinateDecimals(screenRadiusPx) {
    const radiusPx = Number(screenRadiusPx);
    if (!Number.isFinite(radiusPx)) {
        return 0;
    }
    if (radiusPx >= 780) return 2;
    if (radiusPx >= 420) return 1;
    return 0;
}

function formatMoonCoordinate(value, positiveSuffix, negativeSuffix, zeroLabel = "0") {
    const degrees = Math.round(Number(value));
    if (!Number.isFinite(degrees) || degrees === 0) {
        return zeroLabel;
    }
    return `${Math.abs(degrees)}°${degrees > 0 ? positiveSuffix : negativeSuffix}`;
}

function formatMoonHoverCoordinate(value, positiveSuffix, negativeSuffix, decimals = 0) {
    const candidate = Number(value);
    if (!Number.isFinite(candidate)) {
        return `0°`;
    }
    const precision = Math.max(0, Math.min(2, Number(decimals) || 0));
    const rounded = precision > 0
        ? Number(candidate.toFixed(precision))
        : Math.round(candidate);
    if (Object.is(rounded, -0) || rounded === 0) {
        return precision > 0 ? `${(0).toFixed(precision)}°` : "0°";
    }
    const magnitude = precision > 0 ? Math.abs(rounded).toFixed(precision) : String(Math.abs(rounded));
    return `${magnitude}°${rounded > 0 ? positiveSuffix : negativeSuffix}`;
}

function clampMoonLabelLatitude(latitudeDeg) {
    return THREE.MathUtils.clamp(Number(latitudeDeg) || 0, -84, 84);
}

function resolveLatitudeLabelAnchor(radius, latitudeDeg, cameraDirectionLocal) {
    const lat = clampMoonLabelLatitude(latitudeDeg);
    const xyLength = Math.hypot(cameraDirectionLocal.x, cameraDirectionLocal.y);
    const longitudeDeg = xyLength > 1e-5
        ? renderMoonLongitudeToDisplayLongitude(THREE.MathUtils.radToDeg(Math.atan2(cameraDirectionLocal.x, cameraDirectionLocal.y)))
        : 0;
    const normal = moonLatLonPoint(1, lat, longitudeDeg).normalize();
    return {
        position: moonLatLonPoint(radius, lat, longitudeDeg),
        facing: normal.dot(cameraDirectionLocal),
    };
}

function resolveLongitudeLabelAnchor(radius, longitudeDeg, cameraDirectionLocal) {
    const lonRad = THREE.MathUtils.degToRad(displayMoonLongitudeToRenderLongitude(longitudeDeg));
    const horizontalDirection = new THREE.Vector3(Math.sin(lonRad), Math.cos(lonRad), 0);
    const horizontalDot = horizontalDirection.dot(cameraDirectionLocal);
    const latitudeDeg = clampMoonLabelLatitude(
        THREE.MathUtils.radToDeg(Math.atan2(cameraDirectionLocal.z, horizontalDot)),
    );
    const normal = moonLatLonPoint(1, latitudeDeg, longitudeDeg).normalize();
    return {
        position: moonLatLonPoint(radius, latitudeDeg, longitudeDeg),
        facing: normal.dot(cameraDirectionLocal),
    };
}

function resolveHoverLabelOffsetPosition({
    radius,
    latitudeDeg,
    longitudeDeg,
    camera,
    container,
}) {
    const normal = moonLatLonPoint(1, latitudeDeg, longitudeDeg).normalize();
    const position = moonLatLonPoint(radius * MOON_LAT_LON_GRID_HOVER_RADIUS_SCALE, latitudeDeg, longitudeDeg);
    const cameraQuaternion = new THREE.Quaternion();
    const containerQuaternion = new THREE.Quaternion();
    const inverseContainerQuaternion = new THREE.Quaternion();
    camera?.getWorldQuaternion?.(cameraQuaternion);
    container?.getWorldQuaternion?.(containerQuaternion);
    inverseContainerQuaternion.copy(containerQuaternion).invert();

    const screenUpLocal = new THREE.Vector3(0, 1, 0)
        .applyQuaternion(cameraQuaternion)
        .applyQuaternion(inverseContainerQuaternion)
        .normalize();
    let tangent = screenUpLocal.sub(normal.clone().multiplyScalar(screenUpLocal.dot(normal)));
    if (tangent.lengthSq() < 1e-6) {
        tangent = new THREE.Vector3(1, 0, 0).sub(normal.clone().multiplyScalar(normal.x));
    }
    if (tangent.lengthSq() < 1e-6) {
        tangent = new THREE.Vector3(0, 1, 0).sub(normal.clone().multiplyScalar(normal.y));
    }
    tangent.normalize();
    return position.add(tangent.multiplyScalar(radius * MOON_LAT_LON_GRID_HOVER_TANGENT_OFFSET_SCALE));
}

function createCanvasTextSprite(THREEImpl, text, {
    color = "#eef5ff",
    background = "rgba(5, 9, 16, 0.68)",
    border = "rgba(190, 215, 255, 0.46)",
    fontSize = 22,
    paddingX = 10,
    paddingY = 5,
} = {}) {
    const documentRef = globalThis?.document || null;
    const canvas = documentRef?.createElement?.("canvas") || null;
    const context = canvas?.getContext?.("2d") || null;
    if (!canvas || !context || typeof context.measureText !== "function") {
        return null;
    }

    context.font = `700 ${fontSize}px system-ui, -apple-system, Segoe UI, sans-serif`;
    const metrics = context.measureText(text);
    const width = Math.ceil(metrics.width + paddingX * 2);
    const height = Math.ceil(fontSize + paddingY * 2);
    canvas.width = Math.max(2, width);
    canvas.height = Math.max(2, height);

    context.font = `700 ${fontSize}px system-ui, -apple-system, Segoe UI, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = background;
    context.strokeStyle = border;
    context.lineWidth = 2;
    const radius = 6;
    const right = canvas.width - 1;
    const bottom = canvas.height - 1;
    context.beginPath();
    context.moveTo(radius, 1);
    context.lineTo(right - radius, 1);
    context.quadraticCurveTo(right, 1, right, radius);
    context.lineTo(right, bottom - radius);
    context.quadraticCurveTo(right, bottom, right - radius, bottom);
    context.lineTo(radius, bottom);
    context.quadraticCurveTo(1, bottom, 1, bottom - radius);
    context.lineTo(1, radius);
    context.quadraticCurveTo(1, 1, radius, 1);
    context.closePath();
    context.fill();
    context.stroke();
    context.fillStyle = color;
    context.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREEImpl.CanvasTexture(canvas);
    texture.colorSpace = THREEImpl.SRGBColorSpace;
    const material = new THREEImpl.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
    });
    const sprite = new THREEImpl.Sprite(material);
    sprite.userData.labelPixelWidth = canvas.width;
    sprite.userData.labelPixelHeight = canvas.height;
    sprite.userData.labelText = text;
    sprite.renderOrder = 4;
    return sprite;
}

function replaceCanvasTextSpriteMaterial(sprite, text, options = {}) {
    if (!sprite) return false;
    const nextSprite = createCanvasTextSprite(THREE, text, options);
    if (!nextSprite) return false;
    const previousMaterial = sprite.material;
    sprite.material = nextSprite.material;
    sprite.userData.labelPixelWidth = nextSprite.userData.labelPixelWidth;
    sprite.userData.labelPixelHeight = nextSprite.userData.labelPixelHeight;
    sprite.userData.labelText = text;
    previousMaterial?.map?.dispose?.();
    previousMaterial?.dispose?.();
    return true;
}

function disposeObjectMaterialAndGeometry(object) {
    object?.geometry?.dispose?.();
    const material = object?.material;
    if (Array.isArray(material)) {
        material.forEach((entry) => {
            entry?.map?.dispose?.();
            entry?.dispose?.();
        });
        return;
    }
    material?.map?.dispose?.();
    material?.dispose?.();
}
function createMoonLatLonGrid({
    radius,
    visible = false,
    labelsVisible = true,
    stepDegrees = MOON_LAT_LON_GRID_DEFAULT_STEP_DEGREES,
} = {}) {
    const normalizedStep = normalizeMoonLatLonGridStep(stepDegrees);
    const gridRadius = radius * MOON_LAT_LON_GRID_RADIUS_SCALE;
    const minorVertices = [];
    const equatorVertices = [];
    const primeMeridianVertices = [];

    for (let lat = -90 + normalizedStep; lat < 90; lat += normalizedStep) {
        const vertices = buildMoonLatitudeLineVertices(gridRadius, lat);
        if (lat === 0) {
            equatorVertices.push(...vertices);
        } else {
            minorVertices.push(...vertices);
        }
    }

    for (let lon = -180; lon < 180; lon += normalizedStep) {
        const vertices = buildMoonLongitudeLineVertices(gridRadius, lon);
        if (lon === 0) {
            primeMeridianVertices.push(...vertices);
        } else {
            minorVertices.push(...vertices);
        }
    }

    const gridGroup = new THREE.Group();
    gridGroup.name = "moon-lat-lon-grid";
    gridGroup.visible = visible;
    gridGroup.renderOrder = 3;

    const minorMaterial = new THREE.LineBasicMaterial({
        color: 0xd9e2f2,
        transparent: true,
        opacity: 0.34,
        depthTest: true,
        depthWrite: false,
    });
    const equatorMaterial = new THREE.LineBasicMaterial({
        color: 0xff4d5f,
        transparent: true,
        opacity: 0.74,
        depthTest: true,
        depthWrite: false,
    });
    const primeMeridianMaterial = new THREE.LineBasicMaterial({
        color: 0x5977ff,
        transparent: true,
        opacity: 0.82,
        depthTest: true,
        depthWrite: false,
    });

    gridGroup.add(createLineSegmentsFromVertices(minorVertices, minorMaterial));
    gridGroup.add(createLineSegmentsFromVertices(equatorVertices, equatorMaterial));
    gridGroup.add(createLineSegmentsFromVertices(primeMeridianVertices, primeMeridianMaterial));
    const labels = visible && labelsVisible
        ? createMoonLatLonLabels({
            radius,
            visible: true,
            stepDegrees: normalizedStep,
        })
        : null;
    return { grid: gridGroup, labels, stepDegrees: normalizedStep };
}
function createMoonLatLonLabels({
    radius,
    visible = false,
    stepDegrees = MOON_LAT_LON_GRID_DEFAULT_STEP_DEGREES,
} = {}) {
    const labelGroup = new THREE.Group();
    labelGroup.name = "moon-lat-lon-labels";
    labelGroup.visible = visible;
    labelGroup.renderOrder = 4;

    const labelRadius = radius * MOON_LAT_LON_GRID_LABEL_RADIUS_SCALE;
    const labelInterval = Math.max(
        MOON_LAT_LON_GRID_LABEL_MIN_INTERVAL_DEGREES,
        normalizeMoonLatLonGridStep(stepDegrees),
    );
    const labelSpecs = [];

    for (let lat = -90 + labelInterval; lat < 90; lat += labelInterval) {
        if (lat === 0) {
            labelSpecs.push({
                text: "Equator",
                position: moonLatLonPoint(labelRadius, 0, -12),
                color: "#ffd7dc",
                kind: "latitude",
                latitudeDeg: 0,
            });
            continue;
        }
        labelSpecs.push({
            text: formatMoonCoordinate(lat, "N", "S"),
            position: moonLatLonPoint(labelRadius, lat, 0),
            kind: "latitude",
            latitudeDeg: lat,
        });
    }

    for (let lon = -180 + labelInterval; lon < 180; lon += labelInterval) {
        if (lon === 0) {
            labelSpecs.push({
                text: "Prime",
                position: moonLatLonPoint(labelRadius, 10, 0),
                color: "#dbe4ff",
                kind: "longitude",
                longitudeDeg: 0,
            });
            continue;
        }
        labelSpecs.push({
            text: formatMoonCoordinate(lon, "E", "W"),
            position: moonLatLonPoint(labelRadius, 0, lon),
            kind: "longitude",
            longitudeDeg: lon,
        });
    }

    labelSpecs.forEach((spec) => {
        const sprite = createCanvasTextSprite(THREE, spec.text, {
            color: spec.color || "#eef5ff",
        });
        if (!sprite) return;
        sprite.position.copy(spec.position);
        sprite.userData.moonGridLabelKind = spec.kind;
        sprite.userData.latitudeDeg = spec.latitudeDeg;
        sprite.userData.longitudeDeg = spec.longitudeDeg;
        labelGroup.add(sprite);
    });

    return labelGroup;
}

function createMoonLatLonHoverLabel() {
    const sprite = createCanvasTextSprite(THREE, "0°N 0°E", {
        color: "#f8fbff",
        background: "rgba(7, 12, 20, 0.82)",
        border: "rgba(230, 245, 255, 0.62)",
        fontSize: 24,
        paddingX: 12,
        paddingY: 6,
    });
    if (!sprite) {
        return null;
    }
    sprite.name = "moon-lat-lon-hover-label";
    sprite.visible = false;
    sprite.userData.basePixelHeight = 24;
    return sprite;
}

export {
    createMoonLatLonGrid,
    createMoonLatLonHoverLabel,
    MOON_LAT_LON_GRID_DEFAULT_STEP_DEGREES,
    MOON_LAT_LON_GRID_LABEL_RADIUS_SCALE,
    MOON_LAT_LON_LABEL_MIN_SCREEN_RADIUS_PX,
    renderMoonLongitudeToDisplayLongitude,
    normalizeMoonLatLonGridStep,
    resolveMoonLatLonGridStepFromScreenRadius,
    resolveMoonHoverCoordinateDecimals,
    formatMoonHoverCoordinate,
    resolveLatitudeLabelAnchor,
    resolveLongitudeLabelAnchor,
    resolveHoverLabelOffsetPosition,
    replaceCanvasTextSpriteMaterial,
    disposeObjectMaterialAndGeometry,
};
