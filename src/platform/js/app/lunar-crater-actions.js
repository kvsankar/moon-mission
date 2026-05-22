import {
    LUNAR_CRATER_DEFAULT_MAX_DIAMETER_KM,
    LUNAR_CRATER_DEFAULT_MIN_DIAMETER_KM,
    LUNAR_CRATER_RANGE_MIN_DIAMETER_KM,
} from "../core/domain/lunar-crater-view.js";
import {
    getLoadedLunarFeatureCatalog,
    loadLunarFeatureCatalog,
} from "../data/lunar-feature-catalog.js";
import {
    countCraterDisplayFeatures as countCraterDisplayFeaturesForCatalog,
    getCraterBoundaryTone,
    getCraterHoverLabelScreenAnchor,
    getCratersToShow,
    getCraterDisplayFeatures as getCraterDisplayFeaturesForCatalog,
    getCraterLabelPlacement,
    normalizeCraterDisplayDiameterRange as normalizeCraterDisplayDiameterRangeForCatalog,
} from "../core/domain/lunar-crater-catalog.js";
import {
    normalizeLunarFeatureKeyList,
    normalizeLunarFeatureSearchQuery,
    normalizeLunarFeatureTypeFilters,
} from "../core/domain/lunar-feature-view.js";
import { getLunarFeatureBoundaryColor } from "../core/domain/lunar-feature-colors.js";

const CRATER_RING_SEGMENTS = 96;
const CRATER_RING_SURFACE_SCALE = 1.002;
const CRATER_HOVER_RING_SURFACE_SCALE = 1.004;
const CRATER_LABEL_SURFACE_SCALE = 1.11;
const CRATER_ALWAYS_LABEL_SURFACE_SCALE = 1.048;
const CRATER_LABEL_FILL_COLOR = "rgba(8, 13, 23, 0.72)";
const CRATER_LABEL_TEXT_COLOR = "#e8eef8";
const CRATER_SEARCH_LABEL_FILL_COLOR = "rgba(7, 13, 24, 0.72)";
const CRATER_SEARCH_LABEL_BORDER_COLOR = "rgba(155, 255, 196, 0.55)";
const CRATER_SEARCH_LABEL_TITLE_COLOR = "#eaf6ef";
const CRATER_SEARCH_LABEL_META_COLOR = "#aeeec4";
const CRATER_LABEL_FONT_FAMILY = '"IBM Plex Sans", "Segoe UI", "Helvetica Neue", Arial, sans-serif';
const CRATER_SEARCH_LABEL_FONT_FAMILY = '"IBM Plex Sans Condensed", "Arial Narrow", "Segoe UI", Arial, sans-serif';
const CRATER_HOVER_LABEL_EDGE_GAP = 0.002;
const CRATER_HOVER_LABEL_SCREEN_GAP_MIN_PX = 4;
const CRATER_HOVER_LABEL_SCREEN_GAP_MAX_PX = 10;
const CRATER_HOVER_LABEL_SCREEN_GAP_RATIO = 0.08;
const CRATER_HOVER_LABEL_FALLBACK_RADIUS_MULTIPLIER = 1.3;
const CRATER_HOVER_LABEL_MAX_ANGULAR_OFFSET = 0.35;
const CRATER_LABEL_MAX_SCREEN_HEIGHT_PX = 38;
const CRATER_HOVER_LABEL_MAX_SCREEN_HEIGHT_PX = 38;
const CRATER_DISPLAY_MODE_ALWAYS = "always";
const CRATER_DISPLAY_MODE_HOVER = "hover";
const CRATER_VISIBILITY_EDGE_PADDING = 0.01;
const CRATER_HOVER_PICK_PADDING_MIN_PX = 6;
const CRATER_HOVER_PICK_PADDING_MAX_PX = 16;
const CRATER_HOVER_PICK_PADDING_RATIO = 0.12;
const CRATER_ALWAYS_MIN_SCREEN_DIAMETER_PX = 9;
const CRATER_ALWAYS_RENDER_LIMIT = 900;
const CRATER_ALWAYS_RENDER_FALLBACK_LIMIT = 450;
const CRATER_ALWAYS_LABEL_MAX_COUNT = 28;
const CRATER_ALWAYS_LABEL_MIN_SCREEN_DIAMETER_PX = 36;
const CRATER_ALWAYS_LABEL_SCREEN_SPACING_PX = 120;
const CRATER_ALWAYS_LABEL_TARGET_SCREEN_HEIGHT_PX = CRATER_HOVER_LABEL_MAX_SCREEN_HEIGHT_PX;
const CRATER_SEARCH_ANNOTATION_LIMIT = 12;
const CRATER_SEARCH_LABEL_TARGET_SCREEN_HEIGHT_PX = 38;
const CRATER_SEARCH_MAX_DIAMETER_KM = 6000;
const CRATER_DENSE_SELECTION_COUNT = 1000;
const CRATER_RENDER_PLAN_CHECK_INTERVAL_MS = 180;
const DEG_TO_RAD = Math.PI / 180;
const EMPTY_LUNAR_CRATER_CATALOG = Object.freeze({
    display: Object.freeze({}),
    features: Object.freeze([]),
});

function createCanvas(width, height) {
    if (typeof document !== "undefined" && document.createElement) {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        return canvas;
    }
    if (typeof OffscreenCanvas !== "undefined") {
        return new OffscreenCanvas(width, height);
    }
    return null;
}

function normalizeCraterDisplayMode(value) {
    return value === CRATER_DISPLAY_MODE_ALWAYS
        ? CRATER_DISPLAY_MODE_ALWAYS
        : CRATER_DISPLAY_MODE_HOVER;
}

function shouldShowHoverLabelForDisplayMode(displayMode) {
    return displayMode === CRATER_DISPLAY_MODE_HOVER ||
        displayMode === CRATER_DISPLAY_MODE_ALWAYS;
}

function normalizeCraterDisplayDiameterRange(value = {}, catalog = EMPTY_LUNAR_CRATER_CATALOG) {
    return normalizeCraterDisplayDiameterRangeForCatalog(value, catalog || EMPTY_LUNAR_CRATER_CATALOG);
}

function getCraterDisplayFeatures(catalog = EMPTY_LUNAR_CRATER_CATALOG, options = {}) {
    return getCraterDisplayFeaturesForCatalog(catalog || EMPTY_LUNAR_CRATER_CATALOG, options);
}

function countCraterDisplayFeatures(catalog = EMPTY_LUNAR_CRATER_CATALOG, options = {}) {
    return countCraterDisplayFeaturesForCatalog(catalog || EMPTY_LUNAR_CRATER_CATALOG, options);
}

function formatCraterLabelText(crater) {
    return `${crater.name}  ${Math.round(crater.diameterKm)} km`;
}

function buildCraterCirclePositions({
    THREE,
    normal,
    angularRadius,
    radius,
    segments = CRATER_RING_SEGMENTS,
}) {
    const centerNormal = normal.clone().normalize();
    const referenceAxis = Math.abs(centerNormal.z) > 0.92
        ? new THREE.Vector3(0, 1, 0)
        : new THREE.Vector3(0, 0, 1);
    const tangentA = new THREE.Vector3()
        .crossVectors(referenceAxis, centerNormal)
        .normalize();
    const tangentB = new THREE.Vector3()
        .crossVectors(centerNormal, tangentA)
        .normalize();
    const cosAngularRadius = Math.cos(angularRadius);
    const sinAngularRadius = Math.sin(angularRadius);
    const positions = [];

    for (let index = 0; index < segments; index += 1) {
        const theta = (index / segments) * Math.PI * 2;
        const point = centerNormal.clone().multiplyScalar(cosAngularRadius)
            .add(tangentA.clone().multiplyScalar(Math.cos(theta) * sinAngularRadius))
            .add(tangentB.clone().multiplyScalar(Math.sin(theta) * sinAngularRadius))
            .normalize()
            .multiplyScalar(radius);
        positions.push(point.x, point.y, point.z);
    }

    return positions;
}

function getCraterAngularRadius(crater, lunarRadiusKm) {
    return Math.max(
        0.0001,
        (crater.diameterKm * 0.5) / lunarRadiusKm,
    );
}

function getCraterVisibilityThreshold(angularRadius = 0) {
    const craterAngularRadius = Math.max(0, Number(angularRadius) || 0);
    return -Math.sin(Math.min(Math.PI / 2, craterAngularRadius)) - CRATER_VISIBILITY_EDGE_PADDING;
}

function createCraterRing({
    THREE,
    crater,
    normal,
    moonRadius,
    material,
    lunarRadiusKm,
    surfaceScale = CRATER_RING_SURFACE_SCALE,
    renderOrder = 8,
    namePrefix = "lunar-crater-ring",
    hoverAnnotation = false,
}) {
    const angularRadius = getCraterAngularRadius(crater, lunarRadiusKm);
    const centerNormal = normal.clone().normalize();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(
            buildCraterCirclePositions({
                THREE,
                normal: centerNormal,
                angularRadius,
                radius: moonRadius * surfaceScale,
            }),
            3,
        ),
    );

    const ring = new THREE.LineLoop(geometry, material);
    ring.name = `${namePrefix}:${crater.cleanName || crater.name}`;
    ring.renderOrder = renderOrder;
    ring.frustumCulled = false;
    ring.userData = {
        lunarCrater: true,
        craterRing: true,
        name: crater.name,
        featureType: typeof crater.featureType === "string" ? crater.featureType : "",
        diameterKm: crater.diameterKm,
        centerNormal: centerNormal.toArray(),
        visibilityAngularRadius: angularRadius,
        hoverAnnotation,
    };
    return ring;
}

function drawRoundedRect(context, x, y, width, height, radius) {
    const right = x + width;
    const bottom = y + height;
    context.beginPath();
    context.moveTo(x + radius, y);
    context.lineTo(right - radius, y);
    context.quadraticCurveTo(right, y, right, y + radius);
    context.lineTo(right, bottom - radius);
    context.quadraticCurveTo(right, bottom, right - radius, bottom);
    context.lineTo(x + radius, bottom);
    context.quadraticCurveTo(x, bottom, x, bottom - radius);
    context.lineTo(x, y + radius);
    context.quadraticCurveTo(x, y, x + radius, y);
    context.closePath();
}

function vectorToPlain(vector) {
    if (!vector) return null;
    return {
        x: Number(vector.x),
        y: Number(vector.y),
        z: Number(vector.z),
    };
}

function vectorFromPlain(THREE, vector, fallback) {
    if (
        vector &&
        Number.isFinite(vector.x) &&
        Number.isFinite(vector.y) &&
        Number.isFinite(vector.z)
    ) {
        return new THREE.Vector3(vector.x, vector.y, vector.z);
    }
    return fallback?.clone?.() || new THREE.Vector3(1, 0, 0);
}

function resolveCraterLabelNormal({
    THREE,
    normal,
    offsetAngularRadius = 0,
    cameraUpNormal = null,
    cameraRightNormal = null,
}) {
    const centerNormal = normal.clone().normalize();
    const placement = getCraterLabelPlacement({
        centerNormal: vectorToPlain(centerNormal),
        offsetAngularRadius,
        cameraUpNormal: vectorToPlain(cameraUpNormal),
        cameraRightNormal: vectorToPlain(cameraRightNormal),
    });
    return vectorFromPlain(THREE, placement?.labelNormal, centerNormal).normalize();
}

function createCraterLabelTexture(THREE, crater, { searchAnnotation = false } = {}) {
    const canvas = createCanvas(searchAnnotation ? 448 : 448, searchAnnotation ? 126 : 112);
    if (!canvas) return null;
    const context = canvas.getContext("2d");
    if (!context) return null;
    const label = formatCraterLabelText(crater);

    context.clearRect(0, 0, canvas.width, canvas.height);
    if (searchAnnotation) {
        drawRoundedRect(context, 14, 20, canvas.width - 28, canvas.height - 40, 14);
        context.fillStyle = CRATER_SEARCH_LABEL_BORDER_COLOR;
        context.fill();
        drawRoundedRect(context, 17, 23, canvas.width - 34, canvas.height - 46, 11);
        context.fillStyle = CRATER_SEARCH_LABEL_FILL_COLOR;
        context.fill();

        context.textAlign = "center";
        context.textBaseline = "middle";
        const maxTextWidth = canvas.width - 74;
        let titleSize = 28;
        do {
            context.font = `600 ${titleSize}px ${CRATER_SEARCH_LABEL_FONT_FAMILY}`;
            titleSize -= 1;
        } while (titleSize > 16 && context.measureText(crater.name).width > maxTextWidth);
        context.fillStyle = CRATER_SEARCH_LABEL_TITLE_COLOR;
        context.fillText(crater.name, canvas.width / 2, 55);

        const meta = `${Math.round(crater.diameterKm)} km`;
        context.font = `500 18px ${CRATER_SEARCH_LABEL_FONT_FAMILY}`;
        context.fillStyle = CRATER_SEARCH_LABEL_META_COLOR;
        context.fillText(meta, canvas.width / 2, 80);
    } else {
        drawRoundedRect(context, 10, 14, canvas.width - 20, canvas.height - 28, 18);
        context.fillStyle = CRATER_LABEL_FILL_COLOR;
        context.fill();

        context.textAlign = "center";
        context.textBaseline = "middle";
        let fontSize = 34;
        const maxTextWidth = canvas.width - 48;
        do {
            context.font = `400 ${fontSize}px ${CRATER_LABEL_FONT_FAMILY}`;
            fontSize -= 1;
        } while (fontSize > 15 && context.measureText(label).width > maxTextWidth);

        context.fillStyle = CRATER_LABEL_TEXT_COLOR;
        context.fillText(label, canvas.width / 2, canvas.height / 2);
    }

    const texture = new THREE.CanvasTexture(canvas);
    if (THREE.SRGBColorSpace) {
        texture.colorSpace = THREE.SRGBColorSpace;
    } else if (THREE.sRGBEncoding) {
        texture.encoding = THREE.sRGBEncoding;
    }
    texture.needsUpdate = true;
    return texture;
}

function getCameraViewportHeight(camera, rendererDomElement) {
    const viewportHeight = Number(rendererDomElement?.clientHeight || rendererDomElement?.height);
    if (Number.isFinite(viewportHeight) && viewportHeight > 0) {
        return viewportHeight;
    }
    if (Number.isFinite(camera?.aspect) && camera.aspect > 0) {
        return 720;
    }
    return 1;
}

function getCameraViewportSize(camera, rendererDomElement) {
    const height = getCameraViewportHeight(camera, rendererDomElement);
    const viewportWidth = Number(rendererDomElement?.clientWidth || rendererDomElement?.width);
    if (Number.isFinite(viewportWidth) && viewportWidth > 0) {
        return { width: viewportWidth, height };
    }
    const aspect = Number(camera?.aspect);
    return {
        width: Number.isFinite(aspect) && aspect > 0 ? height * aspect : height,
        height,
    };
}

function calculateCraterLabelScaleRatio({
    camera,
    rendererDomElement = null,
    labelWorldHeight,
    labelWorldPosition,
    maxScreenHeightPx,
    targetScreenHeightPx = null,
}) {
    const maxHeight = Number(maxScreenHeightPx);
    const targetHeight = Number(targetScreenHeightPx);
    const baseHeight = Number(labelWorldHeight);
    if (!camera || !Number.isFinite(baseHeight) || baseHeight <= 0 || !Number.isFinite(maxHeight) || maxHeight <= 0) {
        return 1;
    }

    const viewportHeight = getCameraViewportHeight(camera, rendererDomElement);
    let pixelsPerWorldUnit = 0;

    if (camera.isPerspectiveCamera) {
        const distance = camera.position?.distanceTo?.(labelWorldPosition);
        if (!Number.isFinite(distance) || distance <= 0) {
            return 1;
        }
        const fovRadians = (Number(camera.fov) * Math.PI) / 180;
        const visibleHeight = 2 * distance * Math.tan(fovRadians / 2);
        pixelsPerWorldUnit = viewportHeight / visibleHeight;
    } else if (camera.isOrthographicCamera) {
        const top = Number(camera.top);
        const bottom = Number(camera.bottom);
        const zoom = Number(camera.zoom) || 1;
        const visibleHeight = (top - bottom) / zoom;
        pixelsPerWorldUnit = viewportHeight / visibleHeight;
    }

    if (!Number.isFinite(pixelsPerWorldUnit) || pixelsPerWorldUnit <= 0) {
        return 1;
    }

    const projectedHeight = baseHeight * pixelsPerWorldUnit;
    if (Number.isFinite(targetHeight) && targetHeight > 0) {
        return targetHeight / Math.max(projectedHeight, 1e-6);
    }
    if (!Number.isFinite(projectedHeight) || projectedHeight <= maxHeight) {
        return 1;
    }
    return maxHeight / projectedHeight;
}

function calculateCraterLabelDimensions({
    crater,
    moonRadius,
    labelWidthMin,
    labelWidthMax,
    labelWidthBase,
    labelWidthPerNameChar,
}) {
    const labelWidth = moonRadius * Math.min(
        labelWidthMax,
        Math.max(labelWidthMin, labelWidthBase + crater.name.length * labelWidthPerNameChar),
    );
    const labelHeight = labelWidth * 0.25;
    return { labelWidth, labelHeight };
}

function calculateCraterHoverLabelOffset({
    angularRadius = 0,
    projectedCraterRadiusPx = null,
    labelScreenHeightPx = CRATER_HOVER_LABEL_MAX_SCREEN_HEIGHT_PX,
}) {
    const craterAngularRadius = Math.max(0, Number(angularRadius) || 0);
    const craterScreenRadius = Number(projectedCraterRadiusPx);
    const labelScreenHeight = Number(labelScreenHeightPx);
    if (
        Number.isFinite(craterScreenRadius) &&
        craterScreenRadius > 0 &&
        Number.isFinite(labelScreenHeight) &&
        labelScreenHeight > 0
    ) {
        const screenGapPx = Math.min(
            CRATER_HOVER_LABEL_SCREEN_GAP_MAX_PX,
            Math.max(CRATER_HOVER_LABEL_SCREEN_GAP_MIN_PX, craterScreenRadius * CRATER_HOVER_LABEL_SCREEN_GAP_RATIO),
        );
        const labelClearanceAngular = craterAngularRadius *
            ((labelScreenHeight * 0.5 + screenGapPx) / craterScreenRadius);
        return Math.min(
            CRATER_HOVER_LABEL_MAX_ANGULAR_OFFSET,
            craterAngularRadius + labelClearanceAngular,
        );
    }

    return Math.min(
        CRATER_HOVER_LABEL_MAX_ANGULAR_OFFSET,
        craterAngularRadius * CRATER_HOVER_LABEL_FALLBACK_RADIUS_MULTIPLIER + CRATER_HOVER_LABEL_EDGE_GAP,
    );
}

function projectMoonLocalNormalToScreen({
    scene,
    camera,
    rendererDomElement,
    normal,
    radius,
}) {
    if (!scene?.moonContainer || !camera || !normal) {
        return null;
    }
    const numericRadius = Number(radius);
    if (!Number.isFinite(numericRadius) || numericRadius <= 0) {
        return null;
    }
    const { width, height } = getCameraViewportSize(camera, rendererDomElement);
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
        return null;
    }

    const point = normal.clone().normalize().multiplyScalar(numericRadius);
    scene.moonContainer.localToWorld(point);
    point.project(camera);
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        return null;
    }
    return {
        x: (point.x * 0.5 + 0.5) * width,
        y: (-point.y * 0.5 + 0.5) * height,
        ndcX: point.x,
        ndcY: point.y,
        ndcZ: point.z,
    };
}

function calculateCraterProjectedScreenBounds({
    THREE,
    scene,
    camera,
    rendererDomElement,
    normal,
    angularRadius,
    moonRadius,
}) {
    const craterAngularRadius = Number(angularRadius);
    const numericMoonRadius = Number(moonRadius);
    if (
        !THREE ||
        !Number.isFinite(craterAngularRadius) ||
        craterAngularRadius <= 0 ||
        !Number.isFinite(numericMoonRadius) ||
        numericMoonRadius <= 0
    ) {
        return null;
    }

    const center = projectMoonLocalNormalToScreen({
        scene,
        camera,
        rendererDomElement,
        normal,
        radius: numericMoonRadius * CRATER_HOVER_RING_SURFACE_SCALE,
    });
    if (!center) {
        return null;
    }
    const rimPositions = buildCraterCirclePositions({
        THREE,
        normal,
        angularRadius: craterAngularRadius,
        radius: 1,
        segments: 16,
    });
    let left = center.x;
    let right = center.x;
    let top = center.y;
    let bottom = center.y;
    let projectedRadius = 0;
    for (let index = 0; index < rimPositions.length; index += 3) {
        const rimNormal = new THREE.Vector3(
            rimPositions[index],
            rimPositions[index + 1],
            rimPositions[index + 2],
        ).normalize();
        const edge = projectMoonLocalNormalToScreen({
            scene,
            camera,
            rendererDomElement,
            normal: rimNormal,
            radius: numericMoonRadius * CRATER_HOVER_RING_SURFACE_SCALE,
        });
        if (!edge) continue;
        left = Math.min(left, edge.x);
        right = Math.max(right, edge.x);
        top = Math.min(top, edge.y);
        bottom = Math.max(bottom, edge.y);
        const distance = Math.hypot(edge.x - center.x, edge.y - center.y);
        if (Number.isFinite(distance)) {
            projectedRadius = Math.max(projectedRadius, distance);
        }
    }
    if (!Number.isFinite(projectedRadius) || projectedRadius <= 0) {
        return null;
    }
    return {
        centerX: center.x,
        centerY: center.y,
        centerNdcZ: center.ndcZ,
        left,
        right,
        top,
        bottom,
        radiusPx: projectedRadius,
        widthPx: right - left,
        heightPx: bottom - top,
    };
}

function calculateCraterProjectedRadiusPx(options = {}) {
    return calculateCraterProjectedScreenBounds(options)?.radiusPx ?? null;
}

function screenPointToMoonLocalAtNdcDepth({
    THREE,
    scene,
    camera,
    rendererDomElement,
    screenX,
    screenY,
    ndcZ,
}) {
    if (!THREE || !scene?.moonContainer || !camera) {
        return null;
    }
    const { width, height } = getCameraViewportSize(camera, rendererDomElement);
    if (
        !Number.isFinite(width) ||
        width <= 0 ||
        !Number.isFinite(height) ||
        height <= 0 ||
        !Number.isFinite(screenX) ||
        !Number.isFinite(screenY) ||
        !Number.isFinite(ndcZ)
    ) {
        return null;
    }
    const point = new THREE.Vector3(
        (screenX / width) * 2 - 1,
        -(screenY / height) * 2 + 1,
        ndcZ,
    );
    point.unproject(camera);
    scene.moonContainer.worldToLocal?.(point);
    return point;
}

function positionCraterHoverLabelFromScreenBounds({
    THREE,
    scene,
    camera,
    rendererDomElement,
    label,
    craterScreenBounds,
}) {
    if (!label || !craterScreenBounds) {
        return false;
    }
    const viewportSize = getCameraViewportSize(camera, rendererDomElement);
    const anchor = getCraterHoverLabelScreenAnchor({
        craterScreenBounds,
        viewportWidthPx: viewportSize.width,
        viewportHeightPx: viewportSize.height,
        labelScreenHeightPx: CRATER_HOVER_LABEL_MAX_SCREEN_HEIGHT_PX,
        gapPx: CRATER_HOVER_LABEL_SCREEN_GAP_MIN_PX,
    });
    if (!anchor) {
        return false;
    }
    const localPosition = screenPointToMoonLocalAtNdcDepth({
        THREE,
        scene,
        camera,
        rendererDomElement,
        screenX: anchor.screenX,
        screenY: anchor.screenY,
        ndcZ: craterScreenBounds.centerNdcZ,
    });
    if (!localPosition) {
        return false;
    }
    label.position.copy(localPosition);
    label.userData.screenAnchor = anchor;
    label.userData.labelNormal = localPosition.clone().normalize().toArray();
    return true;
}

function resolveCraterRimNormalTowardLabel({
    centerNormal,
    labelPosition,
    angularRadius,
}) {
    const center = centerNormal.clone().normalize();
    const labelNormal = labelPosition.clone().normalize();
    const tangent = labelNormal
        .sub(center.clone().multiplyScalar(labelNormal.dot(center)))
        .normalize();
    if (!Number.isFinite(tangent.x) || tangent.lengthSq() <= 1e-12) {
        return center;
    }
    const radius = Math.max(0, Number(angularRadius) || 0);
    return center
        .multiplyScalar(Math.cos(radius))
        .add(tangent.multiplyScalar(Math.sin(radius)))
        .normalize();
}

function createCraterSearchLeaderLine({
    THREE,
    crater,
    centerNormal,
    label,
    moonRadius,
    angularRadius,
}) {
    if (!label?.position || !centerNormal) {
        return null;
    }
    const rimNormal = resolveCraterRimNormalTowardLabel({
        centerNormal,
        labelPosition: label.position,
        angularRadius,
    });
    const start = rimNormal.multiplyScalar(moonRadius * CRATER_HOVER_RING_SURFACE_SCALE);
    const end = label.position.clone().multiplyScalar(0.98);
    const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
    const material = new THREE.LineBasicMaterial({
        color: 0x9bffc4,
        transparent: true,
        opacity: 0.82,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
    });
    const line = new THREE.Line(geometry, material);
    line.name = `lunar-feature-search-leader:${crater.cleanName || crater.name}`;
    line.renderOrder = 20;
    line.frustumCulled = false;
    line.userData = {
        lunarCrater: true,
        searchAnnotation: true,
        searchLeader: true,
        name: crater.name,
        diameterKm: crater.diameterKm,
        centerNormal: centerNormal.clone().normalize().toArray(),
        visibilityAngularRadius: angularRadius,
    };
    return line;
}

function createCraterLabelSprite({
    THREE,
    crater,
    normal,
    moonRadius,
    surfaceScale = CRATER_LABEL_SURFACE_SCALE,
    depthTest = false,
    renderOrder = 20,
    namePrefix = "lunar-crater-hover-label",
    hoverLabel = true,
    labelWidthMin = 0.28,
    labelWidthMax = 0.58,
    labelWidthBase = 0.2,
    labelWidthPerNameChar = 0.015,
    offsetAngularRadius = 0,
    visibilityAngularRadius = 0,
    targetScreenHeightPx = null,
    cameraUpNormal = null,
    cameraRightNormal = null,
    searchAnnotation = false,
}) {
    const texture = createCraterLabelTexture(THREE, crater, { searchAnnotation });
    if (!texture) return null;

    const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: searchAnnotation ? 0.86 : 0.98,
        depthTest,
        depthWrite: false,
        toneMapped: false,
    });
    const label = new THREE.Sprite(material);
    label.name = `${namePrefix}:${crater.cleanName || crater.name}`;
    const labelNormal = resolveCraterLabelNormal({
        THREE,
        normal,
        offsetAngularRadius,
        cameraUpNormal,
        cameraRightNormal,
    });
    label.position.copy(labelNormal).multiplyScalar(moonRadius * surfaceScale);
    const { labelWidth, labelHeight } = calculateCraterLabelDimensions({
        crater,
        moonRadius,
        labelWidthMin,
        labelWidthMax,
        labelWidthBase,
        labelWidthPerNameChar,
    });
    label.scale.set(labelWidth, labelHeight, 1);
    label.renderOrder = renderOrder;
    label.frustumCulled = false;
    label.userData = {
        lunarCrater: true,
        hoverLabel,
        searchAnnotation,
        offsetAngularRadius,
        baseScaleX: labelWidth,
        baseScaleY: labelHeight,
        centerNormal: normal.clone().normalize().toArray(),
        labelNormal: labelNormal.toArray(),
        visibilityAngularRadius,
        targetScreenHeightPx,
        name: crater.name,
        diameterKm: crater.diameterKm,
    };
    return label;
}

function resolveCraterHoverTarget(surfaceNormal, pickTargets = []) {
    if (!surfaceNormal || !Array.isArray(pickTargets)) {
        return null;
    }
    let bestTarget = null;
    let bestScore = Infinity;
    let bestAngle = Infinity;
    let bestRadius = Infinity;
    for (const target of pickTargets) {
        if (!target?.centerNormal) continue;
        const radius = Number(target.angularRadius);
        if (!Number.isFinite(radius) || radius <= 0) continue;
        const angle = surfaceNormal.angleTo(target.centerNormal);
        const pickPadding = Math.min(0.018, Math.max(0.002, radius * 0.12));
        if (angle > radius + pickPadding) {
            continue;
        }
        const score = angle / Math.max(radius, 1e-9);
        if (
            score < bestScore - 1e-8 ||
            (Math.abs(score - bestScore) <= 1e-8 && angle < bestAngle - 1e-8) ||
            (Math.abs(score - bestScore) <= 1e-8 && Math.abs(angle - bestAngle) <= 1e-8 && radius < bestRadius)
        ) {
            bestTarget = target;
            bestScore = score;
            bestAngle = angle;
            bestRadius = radius;
        }
    }
    return bestTarget;
}

function resolveCraterHoverTargetFromScreen({
    THREE,
    scene,
    camera,
    rendererDomElement,
    pointerX,
    pointerY,
    pickTargets = [],
    moonRadius,
    cameraMoonLocalNormal = null,
    surfaceNormal = null,
}) {
    if (!THREE || !scene || !camera || !Array.isArray(pickTargets) || !pickTargets.length) {
        return null;
    }
    const numericMoonRadius = Number(moonRadius);
    if (!Number.isFinite(numericMoonRadius) || numericMoonRadius <= 0) {
        return null;
    }

    let bestTarget = null;
    let bestScore = Infinity;
    let bestDistance = Infinity;
    for (const target of pickTargets) {
        if (!target?.centerNormal) continue;
        const angularRadius = Number(target.angularRadius);
        if (!Number.isFinite(angularRadius) || angularRadius <= 0) continue;
        if (surfaceNormal) {
            const surfaceAngle = surfaceNormal.angleTo(target.centerNormal);
            const angularPadding = Math.max(0.012, angularRadius * 0.8);
            if (surfaceAngle > angularRadius + angularPadding) {
                continue;
            }
        }
        if (
            cameraMoonLocalNormal &&
            target.centerNormal.dot(cameraMoonLocalNormal) <= getCraterVisibilityThreshold(angularRadius)
        ) {
            continue;
        }

        const center = projectMoonLocalNormalToScreen({
            scene,
            camera,
            rendererDomElement,
            normal: target.centerNormal,
            radius: numericMoonRadius * CRATER_HOVER_RING_SURFACE_SCALE,
        });
        const projectedRadius = calculateCraterProjectedRadiusPx({
            THREE,
            scene,
            camera,
            rendererDomElement,
            normal: target.centerNormal,
            angularRadius,
            moonRadius: numericMoonRadius,
        });
        if (!center || !Number.isFinite(projectedRadius) || projectedRadius <= 0) {
            continue;
        }

        const distance = Math.hypot(pointerX - center.x, pointerY - center.y);
        const pickPadding = Math.min(
            CRATER_HOVER_PICK_PADDING_MAX_PX,
            Math.max(CRATER_HOVER_PICK_PADDING_MIN_PX, projectedRadius * CRATER_HOVER_PICK_PADDING_RATIO),
        );
        if (distance > projectedRadius + pickPadding) {
            continue;
        }

        const score = distance / Math.max(projectedRadius, 1);
        if (
            score < bestScore - 1e-8 ||
            (Math.abs(score - bestScore) <= 1e-8 && distance < bestDistance)
        ) {
            bestTarget = target;
            bestScore = score;
            bestDistance = distance;
        }
    }
    return bestTarget;
}

function disposeObjectResources(object, disposedMaterials, disposedTextures) {
    object.geometry?.dispose?.();

    const materials = Array.isArray(object.material)
        ? object.material
        : [object.material].filter(Boolean);
    for (const material of materials) {
        if (!material || disposedMaterials.has(material)) continue;
        if (material.map && !disposedTextures.has(material.map)) {
            material.map.dispose?.();
            disposedTextures.add(material.map);
        }
        material.dispose?.();
        disposedMaterials.add(material);
    }
}

function resolveMoonSurfaceHitNormal({ scene, intersections, moonRadius }) {
    if (!scene?.moonContainer || !Array.isArray(intersections) || !intersections.length) {
        return null;
    }
    const numericMoonRadius = Number(moonRadius);
    if (!Number.isFinite(numericMoonRadius) || numericMoonRadius <= 0) {
        return null;
    }
    let bestNormal = null;
    let bestScore = Infinity;
    for (const intersection of intersections) {
        if (!intersection?.point?.clone) continue;
        const localPoint = intersection.point.clone();
        scene.moonContainer.worldToLocal(localPoint);
        const localRadius = localPoint.length();
        if (!Number.isFinite(localRadius) || localRadius <= 1e-12) {
            continue;
        }
        const score = Math.abs(localRadius - numericMoonRadius);
        if (score < bestScore) {
            bestScore = score;
            bestNormal = localPoint.normalize().clone();
        }
    }
    return bestNormal;
}

function createLunarCraterActions({
    THREE,
    sphericalToCartesian,
    degreesToRadians,
    PC,
    getMoonRadius,
    getGlobalConfig,
    getViewLunarCraters,
    getLunarCraterMinDiameterKm = () => LUNAR_CRATER_DEFAULT_MIN_DIAMETER_KM,
    getLunarCraterMaxDiameterKm = () => LUNAR_CRATER_DEFAULT_MAX_DIAMETER_KM,
    getLunarCraterHoverMinDiameterKm = () => 0,
    getLunarCraterHoverMaxDiameterKm = () => LUNAR_CRATER_DEFAULT_MAX_DIAMETER_KM,
    getLunarCraterDisplayMode = () => CRATER_DISPLAY_MODE_HOVER,
    getLunarFeatureTypeFilters = () => ({}),
    getLunarFeatureSearchQuery = () => "",
    getLunarFeatureExcludedKeys = () => [],
    getLunarFeatureHoverTypeFilters = () => getLunarFeatureTypeFilters(),
    getLunarFeatureHoverSearchQuery = () => getLunarFeatureSearchQuery(),
    getLunarFeatureHoverExcludedKeys = () => getLunarFeatureExcludedKeys(),
    craterCatalog = null,
    loadCraterCatalog = loadLunarFeatureCatalog,
    render = () => {},
}) {
    let activeCraterCatalog = craterCatalog || getLoadedLunarFeatureCatalog() || null;
    let craterCatalogLoadPromise = null;

    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    const surfaceNormal = new THREE.Vector3();
    const labelWorldPosition = new THREE.Vector3();
    const cameraWorldPosition = new THREE.Vector3();
    const cameraWorldDirection = new THREE.Vector3();
    const cameraWorldUp = new THREE.Vector3();
    const cameraWorldRight = new THREE.Vector3();
    const cameraWorldQuaternion = new THREE.Quaternion();
    const moonWorldQuaternion = new THREE.Quaternion();
    const inverseMoonWorldQuaternion = new THREE.Quaternion();
    const moonSunLocalDirection = new THREE.Vector3();
    const cameraMoonLocalPosition = new THREE.Vector3();
    const cameraMoonLocalForward = new THREE.Vector3();
    const cameraMoonLocalUp = new THREE.Vector3();
    const cameraMoonLocalRight = new THREE.Vector3();
    const craterLabelNormal = new THREE.Vector3();
    const craterWorldPosition = new THREE.Vector3();
    const craterNdcPosition = new THREE.Vector3();
    const craterTargetCache = new WeakMap();

    function getLunarRadiusKm() {
        return Number.isFinite(PC?.MOON_RADIUS_KM)
            ? PC.MOON_RADIUS_KM
            : 1737.4;
    }

    function getActiveCraterCatalog() {
        return activeCraterCatalog || EMPTY_LUNAR_CRATER_CATALOG;
    }

    function markCraterCatalogLoading(scene, loading, error = null) {
        if (!scene) return;
        scene.lunarCraterCatalogLoading = loading === true;
        scene.lunarCraterCatalogError = error || null;
    }

    function ensureCraterCatalogForScene({ scene, camera = null, rendererDomElement = null } = {}) {
        if (activeCraterCatalog) {
            return Promise.resolve(activeCraterCatalog);
        }
        if (!craterCatalogLoadPromise) {
            craterCatalogLoadPromise = Promise.resolve()
                .then(() => loadCraterCatalog())
                .then((catalog) => {
                    activeCraterCatalog = catalog || EMPTY_LUNAR_CRATER_CATALOG;
                    return activeCraterCatalog;
                })
                .finally(() => {
                    craterCatalogLoadPromise = null;
                });
        }
        markCraterCatalogLoading(scene, true);
        craterCatalogLoadPromise
            .then(() => {
                markCraterCatalogLoading(scene, false);
                if (scene?.moonContainer && getGlobalConfig()?.is_lunar) {
                    addLunarCraterAnnotations({ scene, camera, rendererDomElement });
                    render?.();
                }
            })
            .catch((error) => {
                console.error("Failed to load lunar feature catalog", error);
                markCraterCatalogLoading(scene, false, error);
            });
        return craterCatalogLoadPromise;
    }

    function resolveDisplayDiameterRange(scene) {
        return normalizeCraterDisplayDiameterRange({
            lunarCraterMinDiameterKm: Number.isFinite(Number(scene?.lunarCraterMinDiameterKm))
                ? Number(scene.lunarCraterMinDiameterKm)
                : getLunarCraterMinDiameterKm(),
            lunarCraterMaxDiameterKm: Number.isFinite(Number(scene?.lunarCraterMaxDiameterKm))
                ? Number(scene.lunarCraterMaxDiameterKm)
                : getLunarCraterMaxDiameterKm(),
        }, getActiveCraterCatalog());
    }

    function resolveHoverDiameterRange(scene) {
        return normalizeCraterDisplayDiameterRange({
            lunarCraterMinDiameterKm: Number.isFinite(Number(scene?.lunarCraterHoverMinDiameterKm))
                ? Number(scene.lunarCraterHoverMinDiameterKm)
                : getLunarCraterHoverMinDiameterKm(),
            lunarCraterMaxDiameterKm: Number.isFinite(Number(scene?.lunarCraterHoverMaxDiameterKm))
                ? Number(scene.lunarCraterHoverMaxDiameterKm)
                : getLunarCraterHoverMaxDiameterKm(),
        }, getActiveCraterCatalog());
    }

    function resolveDisplayMode(scene) {
        return normalizeCraterDisplayMode(scene?.lunarCraterDisplayMode ?? getLunarCraterDisplayMode());
    }

    function resolveShowAllEnabled(scene) {
        if (Object.prototype.hasOwnProperty.call(scene || {}, "lunarCraterShowAllEnabled")) {
            return scene.lunarCraterShowAllEnabled === true;
        }
        return getViewLunarCraters() === true && resolveDisplayMode(scene) === CRATER_DISPLAY_MODE_ALWAYS;
    }

    function resolveHoverEnabled(scene) {
        if (Object.prototype.hasOwnProperty.call(scene || {}, "lunarCraterHoverEnabled")) {
            return scene.lunarCraterHoverEnabled === true;
        }
        return getViewLunarCraters() === true && shouldShowHoverLabelForDisplayMode(resolveDisplayMode(scene));
    }

    function resolveTypeFilters(scene) {
        return normalizeLunarFeatureTypeFilters(
            scene?.lunarFeatureTypeFilters,
            getLunarFeatureTypeFilters(),
        );
    }

    function resolveSearchQuery(scene) {
        return normalizeLunarFeatureSearchQuery(
            scene?.lunarFeatureSearchQuery ?? getLunarFeatureSearchQuery(),
        );
    }

    function resolvePinnedNames(scene) {
        return Array.isArray(scene?.lunarFeaturePinnedNames)
            ? scene.lunarFeaturePinnedNames
                .map((entry) => String(entry || "").trim())
                .filter(Boolean)
            : [];
    }

    function resolveExcludedKeys(scene) {
        return normalizeLunarFeatureKeyList(
            scene?.lunarFeatureExcludedKeys ?? getLunarFeatureExcludedKeys(),
        );
    }

    function resolveHoverTypeFilters(scene) {
        return normalizeLunarFeatureTypeFilters(
            scene?.lunarFeatureHoverTypeFilters,
            getLunarFeatureHoverTypeFilters(),
        );
    }

    function resolveHoverSearchQuery(scene) {
        return normalizeLunarFeatureSearchQuery(
            scene?.lunarFeatureHoverSearchQuery ?? getLunarFeatureHoverSearchQuery(),
        );
    }

    function resolveHoverExcludedKeys(scene) {
        return normalizeLunarFeatureKeyList(
            scene?.lunarFeatureHoverExcludedKeys ?? getLunarFeatureHoverExcludedKeys(),
        );
    }

    function buildCraterPickTarget({ crater, moonRadius, lunarRadiusKm }) {
        const cached = craterTargetCache.get(crater);
        if (cached && cached.lunarRadiusKm === lunarRadiusKm) {
            return {
                crater,
                centerNormal: cached.centerNormal,
                angularRadius: cached.angularRadius,
            };
        }
        const position = sphericalToCartesian(
            moonRadius,
            degreesToRadians(crater.longitudeDeg),
            degreesToRadians(crater.latitudeDeg),
        );
        const centerNormal = new THREE.Vector3(position.x, position.y, position.z).normalize();
        const angularRadius = getCraterAngularRadius(crater, lunarRadiusKm);
        craterTargetCache.set(crater, {
            lunarRadiusKm,
            centerNormal,
            angularRadius,
        });
        return {
            crater,
            centerNormal,
            angularRadius,
        };
    }

    function resolveMoonSunLocalNormal(scene) {
        const candidate = scene?.stateSunDirections?.moonCentered ||
            scene?.stateSunDirections?.earthCentered ||
            scene?.stateSunDirection ||
            null;
        if (
            !candidate ||
            !Number.isFinite(candidate.x) ||
            !Number.isFinite(candidate.y) ||
            !Number.isFinite(candidate.z)
        ) {
            return null;
        }
        moonSunLocalDirection.set(candidate.x, candidate.y, candidate.z);
        if (moonSunLocalDirection.lengthSq() <= 1e-12) {
            return null;
        }
        moonSunLocalDirection.normalize();
        if (scene?.moonContainer?.getWorldQuaternion) {
            scene.moonContainer.getWorldQuaternion(moonWorldQuaternion);
            inverseMoonWorldQuaternion.copy(moonWorldQuaternion).invert();
            moonSunLocalDirection.applyQuaternion(inverseMoonWorldQuaternion).normalize();
        }
        return moonSunLocalDirection.clone();
    }

    function resolveCraterSunlit({ scene, centerNormal, sunNormal = null }) {
        const resolvedSunNormal = sunNormal || resolveMoonSunLocalNormal(scene);
        const tone = getCraterBoundaryTone({
            centerNormal: vectorToPlain(centerNormal),
            sunNormal: vectorToPlain(resolvedSunNormal),
        });
        return tone.sunlit;
    }

    function createCraterBoundaryMaterial({ featureType, sunlit, hover }) {
        return new THREE.LineBasicMaterial({
            color: getLunarFeatureBoundaryColor(featureType, { sunlit, hover }),
            transparent: true,
            opacity: hover ? 0.98 : (sunlit === false ? 0.9 : 0.94),
            depthTest: hover ? false : true,
            depthWrite: false,
            toneMapped: false,
        });
    }

    function ensureCraterBoundaryMaterials(group, featureType = "") {
        if (!group) return null;
        if (!group.userData.craterBoundaryMaterialsByType) {
            group.userData.craterBoundaryMaterialsByType = new Map();
        }
        const key = typeof featureType === "string" && featureType ? featureType : "__fallback";
        const existing = group.userData.craterBoundaryMaterialsByType.get(key);
        if (existing) return existing;
        const materials = {
            lit: createCraterBoundaryMaterial({ featureType, sunlit: true, hover: false }),
            unlit: createCraterBoundaryMaterial({ featureType, sunlit: false, hover: false }),
            hoverLit: createCraterBoundaryMaterial({ featureType, sunlit: true, hover: true }),
            hoverUnlit: createCraterBoundaryMaterial({ featureType, sunlit: false, hover: true }),
        };
        group.userData.craterBoundaryMaterialsByType.set(key, materials);
        group.userData.sharedMaterials.push(
            materials.lit,
            materials.unlit,
            materials.hoverLit,
            materials.hoverUnlit,
        );
        return materials;
    }

    function getCraterBoundaryMaterial({ group, featureType = "", sunlit, hover = false }) {
        const materials = ensureCraterBoundaryMaterials(group, featureType);
        if (!materials) return null;
        if (hover) {
            return sunlit === false ? materials.hoverUnlit : materials.hoverLit;
        }
        return sunlit === false ? materials.unlit : materials.lit;
    }

    function updateCraterBoundaryStyles({ scene }) {
        const group = scene?.lunarCraterGroup;
        if (!group) return false;
        let changed = false;
        const sunNormal = resolveMoonSunLocalNormal(scene);
        group.traverse((object) => {
            if (!object?.userData?.craterRing || !Array.isArray(object.userData.centerNormal)) {
                return;
            }
            craterLabelNormal.fromArray(object.userData.centerNormal).normalize();
            const sunlit = resolveCraterSunlit({ scene, centerNormal: craterLabelNormal, sunNormal });
            const nextMaterial = getCraterBoundaryMaterial({
                group,
                featureType: object.userData.featureType,
                sunlit,
                hover: object.userData.hoverAnnotation === true ||
                    object.userData.searchAnnotation === true,
            });
            if (nextMaterial && object.material !== nextMaterial) {
                object.material = nextMaterial;
                object.userData.sunlit = sunlit;
                changed = true;
            }
        });
        return changed;
    }

    function resolveCraterCameraContext({
        scene,
        camera,
        rendererDomElement,
        moonRadius,
    }) {
        if (!scene?.moonContainer || !camera || !Number.isFinite(moonRadius) || moonRadius <= 0) {
            return null;
        }
        camera.updateMatrixWorld?.();
        scene.moonContainer.updateWorldMatrix?.(true, true);

        let cameraDistance = null;
        let cameraMoonLocalNormal = null;
        let viewCenterNormal = null;
        if (scene.moonContainer.worldToLocal && camera.getWorldPosition) {
            camera.getWorldPosition(cameraWorldPosition);
            cameraMoonLocalPosition.copy(cameraWorldPosition);
            scene.moonContainer.worldToLocal(cameraMoonLocalPosition);
            cameraDistance = cameraMoonLocalPosition.length();
            if (cameraDistance > 1e-8) {
                cameraMoonLocalNormal = cameraMoonLocalPosition.clone().normalize();
            }
        }

        const viewportSize = getCameraViewportSize(camera, rendererDomElement);
        let cameraForwardNormal = null;
        let cameraUpNormal = null;
        let cameraRightNormal = null;
        if (camera.getWorldDirection) {
            camera.getWorldDirection(cameraWorldDirection);
            if (cameraWorldDirection.lengthSq() > 1e-12) {
                cameraMoonLocalForward.copy(cameraWorldDirection).normalize();
                if (scene.moonContainer.getWorldQuaternion) {
                    scene.moonContainer.getWorldQuaternion(moonWorldQuaternion);
                    inverseMoonWorldQuaternion.copy(moonWorldQuaternion).invert();
                    cameraMoonLocalForward.applyQuaternion(inverseMoonWorldQuaternion).normalize();
                }
                cameraForwardNormal = cameraMoonLocalForward.clone();
            }
        }
        if (camera.getWorldQuaternion) {
            camera.getWorldQuaternion(cameraWorldQuaternion);
            cameraWorldUp.set(0, 1, 0).applyQuaternion(cameraWorldQuaternion).normalize();
            cameraWorldRight.set(1, 0, 0).applyQuaternion(cameraWorldQuaternion).normalize();
            cameraMoonLocalUp.copy(cameraWorldUp);
            cameraMoonLocalRight.copy(cameraWorldRight);
            if (scene.moonContainer.getWorldQuaternion) {
                scene.moonContainer.getWorldQuaternion(moonWorldQuaternion);
                inverseMoonWorldQuaternion.copy(moonWorldQuaternion).invert();
                cameraMoonLocalUp.applyQuaternion(inverseMoonWorldQuaternion).normalize();
                cameraMoonLocalRight.applyQuaternion(inverseMoonWorldQuaternion).normalize();
            }
            if (cameraMoonLocalUp.lengthSq() > 1e-12) {
                cameraUpNormal = cameraMoonLocalUp.clone();
            }
            if (cameraMoonLocalRight.lengthSq() > 1e-12) {
                cameraRightNormal = cameraMoonLocalRight.clone();
            }
        }
        if (scene.moon && scene.moonContainer.worldToLocal) {
            pointerNdc.set(0, 0);
            raycaster.setFromCamera(pointerNdc, camera);
            const intersections = raycaster.intersectObject(scene.moon, true);
            const centerHitNormal = resolveMoonSurfaceHitNormal({
                scene,
                intersections,
                moonRadius,
            });
            if (centerHitNormal) {
                viewCenterNormal = centerHitNormal;
            }
        }
        if (!viewCenterNormal) {
            viewCenterNormal = cameraMoonLocalNormal;
        }

        const verticalFovDeg = Number.isFinite(camera.fov)
            ? Number(camera.fov)
            : (() => {
                if (
                    camera.isOrthographicCamera &&
                    Number.isFinite(camera.top) &&
                    Number.isFinite(camera.bottom)
                ) {
                    const viewHeight = Math.abs(camera.top - camera.bottom) / Math.max(0.0001, camera.zoom || 1);
                    return (2 * Math.atan((viewHeight * 0.5) / Math.max(0.0001, moonRadius))) / DEG_TO_RAD;
                }
                return 45;
            })();
        const horizontalFovDeg = Number.isFinite(verticalFovDeg)
            ? (2 * Math.atan(Math.tan(degreesToRadians(verticalFovDeg) * 0.5) *
                Math.max(0.0001, viewportSize.width / viewportSize.height))) / DEG_TO_RAD
            : null;

        const normalKey = cameraMoonLocalNormal
            ? [
                Math.round(cameraMoonLocalNormal.x * 48),
                Math.round(cameraMoonLocalNormal.y * 48),
                Math.round(cameraMoonLocalNormal.z * 48),
            ].join(":")
            : "none";
        const distanceKey = Number.isFinite(cameraDistance) && moonRadius > 0
            ? Math.round((cameraDistance / moonRadius) * 256)
            : "none";
        const viewCenterKey = viewCenterNormal
            ? [
                Math.round(viewCenterNormal.x * 48),
                Math.round(viewCenterNormal.y * 48),
                Math.round(viewCenterNormal.z * 48),
            ].join(":")
            : "none";
        const forwardKey = cameraForwardNormal
            ? [
                Math.round(cameraForwardNormal.x * 48),
                Math.round(cameraForwardNormal.y * 48),
                Math.round(cameraForwardNormal.z * 48),
            ].join(":")
            : "none";
        const viewportKey = [
            Math.round(viewportSize.width / 64),
            Math.round(viewportSize.height / 64),
        ].join(":");
        const fovKey = Number.isFinite(camera.fov) ? Math.round(camera.fov * 2) : "ortho";

        return {
            cameraMoonLocalNormal,
            cameraPositionMoonRadii:
                Number.isFinite(cameraDistance) && cameraDistance > 0 && Number.isFinite(moonRadius) && moonRadius > 0
                    ? cameraMoonLocalPosition.clone().divideScalar(moonRadius)
                    : null,
            cameraForwardNormal,
            cameraUpNormal,
            cameraRightNormal,
            viewCenterNormal,
            moonSunLocalNormal: resolveMoonSunLocalNormal(scene),
            verticalFovDeg,
            horizontalFovDeg,
            viewportSize,
            key: `${normalKey}|${distanceKey}|${viewCenterKey}|${forwardKey}|${viewportKey}|${fovKey}`,
        };
    }

    function isCraterTargetInCameraView({ scene, camera, target, moonRadius }) {
        if (!scene?.moonContainer || !camera || !target?.centerNormal) {
            return true;
        }
        craterWorldPosition.copy(target.centerNormal).multiplyScalar(moonRadius);
        scene.moonContainer.localToWorld?.(craterWorldPosition);
        craterNdcPosition.copy(craterWorldPosition).project(camera);
        return (
            Number.isFinite(craterNdcPosition.x) &&
            Number.isFinite(craterNdcPosition.y) &&
            Number.isFinite(craterNdcPosition.z) &&
            craterNdcPosition.x >= -1.18 &&
            craterNdcPosition.x <= 1.18 &&
            craterNdcPosition.y >= -1.18 &&
            craterNdcPosition.y <= 1.18 &&
            craterNdcPosition.z >= -1.05 &&
            craterNdcPosition.z <= 1.05
        );
    }

    function selectAlwaysRenderTargets({
        scene,
        camera,
        rendererDomElement,
        craterFeatures,
        moonRadius,
        lunarRadiusKm,
        displayDiameterRange,
        filterState = null,
    }) {
        const cameraContext = resolveCraterCameraContext({
            scene,
            camera,
            rendererDomElement,
            moonRadius,
        });
        if (!craterFeatures.length) {
            return {
                targets: [],
                key: "empty",
                smallestRenderedDiameterKm: null,
                filteredCount: 0,
                renderedCount: 0,
                dense: false,
            };
        }
        if (!cameraContext) {
            const targets = [];
            let smallestRenderedDiameterKm = null;
            for (const crater of craterFeatures.slice(0, CRATER_ALWAYS_RENDER_FALLBACK_LIMIT)) {
                const target = buildCraterPickTarget({ crater, moonRadius, lunarRadiusKm });
                target.showLabel = false;
                targets.push(target);
                smallestRenderedDiameterKm = crater.diameterKm;
            }
            return {
                targets,
                key: `fallback:${craterFeatures.length}`,
                smallestRenderedDiameterKm,
                filteredCount: craterFeatures.length,
                renderedCount: targets.length,
                dense: craterFeatures.length > CRATER_DENSE_SELECTION_COUNT,
            };
        }

        const craterPlan = getCratersToShow(getActiveCraterCatalog(), {
            ...displayDiameterRange,
            lunarFeatureTypeFilters: filterState?.lunarFeatureTypeFilters ?? resolveTypeFilters(scene),
            lunarFeatureSearchQuery: filterState?.lunarFeatureSearchQuery ?? resolveSearchQuery(scene),
            lunarFeaturePinnedNames: filterState?.lunarFeaturePinnedNames ?? resolvePinnedNames(scene),
            lunarFeatureExcludedKeys: filterState?.lunarFeatureExcludedKeys ?? resolveExcludedKeys(scene),
            viewCenterNormal: cameraContext.viewCenterNormal,
            observerNormal: cameraContext.cameraMoonLocalNormal,
            cameraPositionMoonRadii: cameraContext.cameraPositionMoonRadii,
            cameraForwardNormal: cameraContext.cameraForwardNormal,
            cameraUpNormal: cameraContext.cameraUpNormal,
            cameraRightNormal: cameraContext.cameraRightNormal,
            sunNormal: cameraContext.moonSunLocalNormal,
            verticalFovDeg: cameraContext.verticalFovDeg,
            horizontalFovDeg: cameraContext.horizontalFovDeg,
            viewportWidthPx: cameraContext.viewportSize.width,
            viewportHeightPx: cameraContext.viewportSize.height,
            lunarRadiusKm,
            maxCount: CRATER_ALWAYS_RENDER_LIMIT,
            minScreenDiameterPx: CRATER_ALWAYS_MIN_SCREEN_DIAMETER_PX,
            labelMaxCount: CRATER_ALWAYS_LABEL_MAX_COUNT,
            labelMinScreenDiameterPx: CRATER_ALWAYS_LABEL_MIN_SCREEN_DIAMETER_PX,
            labelSpacingPx: CRATER_ALWAYS_LABEL_SCREEN_SPACING_PX,
        });
        const featureSet = new Set(craterFeatures);
        const targets = craterPlan.craters
            .filter((entry) => featureSet.has(entry.crater))
            .map((entry) => {
                const target = buildCraterPickTarget({
                    crater: entry.crater,
                    moonRadius,
                    lunarRadiusKm,
                });
                target.projectedDiameterPx = entry.projectedDiameterPx;
                target.showLabel = entry.showLabel === true;
                target.sunlit = entry.sunlit;
                return target;
            });
        let smallestRenderedDiameterKm = null;
        for (const target of targets) {
            smallestRenderedDiameterKm = smallestRenderedDiameterKm == null
                ? target.crater.diameterKm
                : Math.min(smallestRenderedDiameterKm, target.crater.diameterKm);
        }

        return {
            targets,
            key: [
                cameraContext.key,
                craterFeatures.length,
                targets.length,
                smallestRenderedDiameterKm == null
                    ? "none"
                    : Math.round(smallestRenderedDiameterKm),
            ].join("|"),
            smallestRenderedDiameterKm,
            filteredCount: craterPlan.filteredCount,
            renderedCount: targets.length,
            dense: craterFeatures.length > CRATER_DENSE_SELECTION_COUNT,
        };
    }

    function selectSearchAnnotationTargets({
        scene,
        camera,
        rendererDomElement,
        craterFeatures,
        moonRadius,
        lunarRadiusKm,
        displayDiameterRange,
        filterState = null,
    }) {
        if (!craterFeatures.length) {
            return [];
        }
        if (Array.isArray(filterState?.lunarFeaturePinnedNames) && filterState.lunarFeaturePinnedNames.length > 0) {
            return craterFeatures.slice(0, CRATER_SEARCH_ANNOTATION_LIMIT)
                .map((crater) => {
                    const target = buildCraterPickTarget({ crater, moonRadius, lunarRadiusKm });
                    target.showLabel = true;
                    target.searchAnnotation = true;
                    target.sunlit = resolveCraterSunlit({ scene, centerNormal: target.centerNormal });
                    return target;
                });
        }
        const cameraContext = resolveCraterCameraContext({
            scene,
            camera,
            rendererDomElement,
            moonRadius,
        });
        if (!cameraContext) {
            return craterFeatures.slice(0, CRATER_SEARCH_ANNOTATION_LIMIT)
                .map((crater) => {
                    const target = buildCraterPickTarget({ crater, moonRadius, lunarRadiusKm });
                    target.showLabel = true;
                    target.searchAnnotation = true;
                    return target;
                });
        }
        const craterPlan = getCratersToShow(getActiveCraterCatalog(), {
            ...displayDiameterRange,
            lunarFeatureTypeFilters: filterState?.lunarFeatureTypeFilters ?? resolveTypeFilters(scene),
            lunarFeatureSearchQuery: filterState?.lunarFeatureSearchQuery ?? resolveSearchQuery(scene),
            lunarFeatureExcludedKeys: filterState?.lunarFeatureExcludedKeys ?? resolveExcludedKeys(scene),
            viewCenterNormal: cameraContext.viewCenterNormal,
            observerNormal: cameraContext.cameraMoonLocalNormal,
            cameraPositionMoonRadii: cameraContext.cameraPositionMoonRadii,
            cameraForwardNormal: cameraContext.cameraForwardNormal,
            cameraUpNormal: cameraContext.cameraUpNormal,
            cameraRightNormal: cameraContext.cameraRightNormal,
            sunNormal: cameraContext.moonSunLocalNormal,
            verticalFovDeg: cameraContext.verticalFovDeg,
            horizontalFovDeg: cameraContext.horizontalFovDeg,
            viewportWidthPx: cameraContext.viewportSize.width,
            viewportHeightPx: cameraContext.viewportSize.height,
            lunarRadiusKm,
            maxCount: CRATER_SEARCH_ANNOTATION_LIMIT,
            minScreenDiameterPx: 0,
            labelEveryRenderedCrater: true,
        });
        const featureSet = new Set(craterFeatures);
        return craterPlan.craters
            .filter((entry) => featureSet.has(entry.crater))
            .map((entry) => {
                const target = buildCraterPickTarget({
                    crater: entry.crater,
                    moonRadius,
                    lunarRadiusKm,
                });
                target.projectedDiameterPx = entry.projectedDiameterPx;
                target.showLabel = true;
                target.searchAnnotation = true;
                target.sunlit = entry.sunlit;
                return target;
            });
    }

    function createSearchAnnotation({
        group,
        scene,
        camera,
        rendererDomElement,
        target,
        moonRadius,
        lunarRadiusKm,
    }) {
        const craterScreenBounds = calculateCraterProjectedScreenBounds({
            THREE,
            scene,
            camera,
            rendererDomElement,
            normal: target.centerNormal,
            angularRadius: target.angularRadius,
            moonRadius,
        });
        const offsetAngularRadius = calculateCraterHoverLabelOffset({
            angularRadius: target.angularRadius,
            projectedCraterRadiusPx: craterScreenBounds?.radiusPx ?? target.projectedDiameterPx * 0.5,
            labelScreenHeightPx: CRATER_SEARCH_LABEL_TARGET_SCREEN_HEIGHT_PX,
        });
        const cameraContext = resolveCraterCameraContext({
            scene,
            camera,
            rendererDomElement,
            moonRadius,
        });
        const sunlit = resolveCraterSunlit({ scene, centerNormal: target.centerNormal });
        const ring = createCraterRing({
            THREE,
            crater: target.crater,
            normal: target.centerNormal,
            moonRadius,
            material: getCraterBoundaryMaterial({
                group,
                featureType: target.crater.featureType,
                sunlit,
                hover: true,
            }),
            lunarRadiusKm,
            surfaceScale: CRATER_HOVER_RING_SURFACE_SCALE,
            renderOrder: 18,
            namePrefix: "lunar-feature-search-ring",
            hoverAnnotation: true,
        });
        ring.userData.searchAnnotation = true;
        ring.userData.sunlit = sunlit;

        const label = createCraterLabelSprite({
            THREE,
            crater: target.crater,
            normal: target.centerNormal,
            moonRadius,
            surfaceScale: CRATER_LABEL_SURFACE_SCALE,
            depthTest: false,
            renderOrder: 21,
            namePrefix: "lunar-feature-search-label",
            hoverLabel: false,
            labelWidthMin: 0.24,
            labelWidthMax: 0.46,
            labelWidthBase: 0.17,
            labelWidthPerNameChar: 0.01,
            offsetAngularRadius,
            visibilityAngularRadius: target.angularRadius,
            targetScreenHeightPx: CRATER_SEARCH_LABEL_TARGET_SCREEN_HEIGHT_PX,
            cameraUpNormal: cameraContext?.cameraUpNormal ?? null,
            cameraRightNormal: cameraContext?.cameraRightNormal ?? null,
            searchAnnotation: true,
        });
        if (label) {
            positionCraterHoverLabelFromScreenBounds({
                THREE,
                scene,
                camera,
                rendererDomElement,
                label,
                craterScreenBounds,
            });
        }
        const leader = label
            ? createCraterSearchLeaderLine({
                THREE,
                crater: target.crater,
                centerNormal: target.centerNormal,
                label,
                moonRadius,
                angularRadius: target.angularRadius,
            })
            : null;
        return { ring, label, leader };
    }

    function ensureHoverLabel({
        scene,
        camera,
        rendererDomElement,
        crater,
        normal,
        moonRadius,
        angularRadius = 0,
        projectedCraterRadiusPx = null,
        craterScreenBounds = null,
        cameraUpNormal = null,
        cameraRightNormal = null,
    }) {
        const offsetAngularRadius = calculateCraterHoverLabelOffset({
            angularRadius,
            projectedCraterRadiusPx,
        });
        const needsNewLabel = !scene.lunarCraterHoverLabel ||
            scene.lunarCraterHoverLabel.userData?.name !== crater.name;
        if (needsNewLabel) {
            const previousLabel = scene.lunarCraterHoverLabel;
            if (previousLabel?.parent) {
                previousLabel.parent.remove(previousLabel);
            }
            if (previousLabel) {
                disposeObjectResources(previousLabel, new Set(), new Set());
            }
            scene.lunarCraterHoverLabel = createCraterLabelSprite({
                THREE,
                crater,
                normal,
                moonRadius,
                offsetAngularRadius,
                visibilityAngularRadius: angularRadius,
                targetScreenHeightPx: CRATER_HOVER_LABEL_MAX_SCREEN_HEIGHT_PX,
                cameraUpNormal,
                cameraRightNormal,
            });
            if (scene.lunarCraterHoverLabel) {
                scene.lunarCraterGroup.add(scene.lunarCraterHoverLabel);
            }
        }
        if (!scene.lunarCraterHoverLabel) return;
        const labelNormal = resolveCraterLabelNormal({
            THREE,
            normal,
            offsetAngularRadius,
            cameraUpNormal,
            cameraRightNormal,
        });
        scene.lunarCraterHoverLabel.userData.offsetAngularRadius = offsetAngularRadius;
        scene.lunarCraterHoverLabel.userData.centerNormal = normal.clone().normalize().toArray();
        scene.lunarCraterHoverLabel.userData.visibilityAngularRadius = angularRadius;
        const positionedFromScreenBounds = positionCraterHoverLabelFromScreenBounds({
            THREE,
            scene,
            camera,
            rendererDomElement,
            label: scene.lunarCraterHoverLabel,
            craterScreenBounds,
        });
        if (!positionedFromScreenBounds) {
            scene.lunarCraterHoverLabel.position.copy(labelNormal).multiplyScalar(
                moonRadius * CRATER_LABEL_SURFACE_SCALE,
            );
            scene.lunarCraterHoverLabel.userData.labelNormal = labelNormal.toArray();
            scene.lunarCraterHoverLabel.userData.screenAnchor = null;
        }
        scene.lunarCraterHoverLabel.visible = true;
    }

    function ensureHoverRing({ scene, target, moonRadius, lunarRadiusKm }) {
        const sunlit = resolveCraterSunlit({ scene, centerNormal: target.centerNormal });

        const nextRing = createCraterRing({
            THREE,
            crater: target.crater,
            normal: target.centerNormal,
            moonRadius,
            material: getCraterBoundaryMaterial({
                group: scene.lunarCraterGroup,
                featureType: target.crater.featureType,
                sunlit,
                hover: true,
            }),
            lunarRadiusKm,
            surfaceScale: CRATER_HOVER_RING_SURFACE_SCALE,
            renderOrder: 19,
            namePrefix: "lunar-crater-hover-ring",
            hoverAnnotation: true,
        });
        nextRing.userData.sunlit = sunlit;

        if (scene.lunarCraterHoverRing?.parent) {
            scene.lunarCraterHoverRing.parent.remove(scene.lunarCraterHoverRing);
        }
        scene.lunarCraterHoverRing?.geometry?.dispose?.();
        scene.lunarCraterHoverRing = nextRing;
        scene.lunarCraterGroup.add(nextRing);
    }

    function hideLunarCraterHover({ scene }) {
        let changed = false;
        if (scene?.lunarCraterHoverLabel?.visible) {
            scene.lunarCraterHoverLabel.visible = false;
            changed = true;
        }
        if (scene?.lunarCraterHoverRing?.visible) {
            scene.lunarCraterHoverRing.visible = false;
            changed = true;
        }
        if (scene?.lunarCraterHoveredRing) {
            scene.lunarCraterHoveredRing.userData.hoverAnnotation = false;
            scene.lunarCraterHoveredRing = null;
            changed = true;
        }
        if (scene?.lunarCraterHoveredLabel) {
            scene.lunarCraterHoveredLabel.userData.hoverScaleBoost = false;
            scene.lunarCraterHoveredLabel = null;
            changed = true;
        }
        if (scene && scene.lunarCraterHoveredName) {
            scene.lunarCraterHoveredName = null;
            scene.lunarCraterHoveredDiameterKm = null;
            changed = true;
        }
        return changed;
    }

    function findCraterTargetAtPointer({
        scene,
        camera,
        rendererDomElement,
        clientX,
        clientY,
    }) {
        if (!scene?.moon || !scene?.moonContainer || !camera || !rendererDomElement) {
            return null;
        }
        const rect = rendererDomElement.getBoundingClientRect?.();
        if (!rect || rect.width <= 0 || rect.height <= 0) {
            return null;
        }
        const pointerX = clientX - rect.left;
        const pointerY = clientY - rect.top;
        if (pointerX < 0 || pointerY < 0 || pointerX > rect.width || pointerY > rect.height) {
            return null;
        }

        pointerNdc.set(
            (pointerX / rect.width) * 2 - 1,
            -((pointerY / rect.height) * 2 - 1),
        );
        scene.moonContainer.updateWorldMatrix?.(true, true);
        scene.moon.updateWorldMatrix?.(true, true);
        camera.updateMatrixWorld?.();
        let cameraNormalAvailable = false;
        if (scene.moonContainer.worldToLocal && camera.getWorldPosition) {
            camera.getWorldPosition(cameraWorldPosition);
            cameraMoonLocalPosition.copy(cameraWorldPosition);
            scene.moonContainer.worldToLocal(cameraMoonLocalPosition);
            if (cameraMoonLocalPosition.lengthSq() > 1e-12) {
                cameraMoonLocalPosition.normalize();
                cameraNormalAvailable = true;
            }
        }
        raycaster.setFromCamera(pointerNdc, camera);

        const intersections = raycaster.intersectObject(scene.moon, true);
        const moonRadius = getMoonRadius();
        const hitNormal = resolveMoonSurfaceHitNormal({
            scene,
            intersections,
            moonRadius,
        });
        if (!hitNormal) {
            return resolveCraterHoverTargetFromScreen({
                THREE,
                scene,
                camera,
                rendererDomElement,
                pointerX,
                pointerY,
                pickTargets: scene.lunarCraterPickTargets || [],
                moonRadius,
                cameraMoonLocalNormal: cameraNormalAvailable ? cameraMoonLocalPosition : null,
            });
        }

        surfaceNormal.copy(hitNormal);

        const pickTargets = scene.lunarCraterPickTargets || [];
        const surfaceTarget = resolveCraterHoverTarget(surfaceNormal, pickTargets);
        if (surfaceTarget) {
            return surfaceTarget;
        }
        return resolveCraterHoverTargetFromScreen({
            THREE,
            scene,
            camera,
            rendererDomElement,
            pointerX,
            pointerY,
            pickTargets,
            moonRadius,
            cameraMoonLocalNormal: cameraNormalAvailable ? cameraMoonLocalPosition : null,
            surfaceNormal,
        }) || resolveCraterHoverTarget(surfaceNormal, pickTargets);
    }

    function addLunarCraterAnnotations({
        scene,
        camera = scene?.camera ?? null,
        rendererDomElement = scene?.cameraController?._rendererDomElement ??
            scene?.renderer?.domElement ??
            null,
    } = {}) {
        const globalConfig = getGlobalConfig();
        if (!scene || !globalConfig?.is_lunar || !scene.moonContainer) {
            return;
        }
        if (!activeCraterCatalog) {
            ensureCraterCatalogForScene({ scene, camera, rendererDomElement });
            return;
        }

        const hoverLabelsEnabled = scene.lunarCraterHoverLabelsEnabled !== false;
        disposeLunarCraterAnnotations({ scene });

        const moonRadius = getMoonRadius();
        if (!Number.isFinite(moonRadius) || moonRadius <= 0) {
            return;
        }

        const lunarRadiusKm = getLunarRadiusKm();
        const displayDiameterRange = resolveDisplayDiameterRange(scene);
        const hoverDiameterRange = resolveHoverDiameterRange(scene);
        const displayMode = resolveDisplayMode(scene);
        const shouldShowAlways = resolveShowAllEnabled(scene);
        const shouldHover = resolveHoverEnabled(scene);
        const showAllFilterState = {
            lunarFeatureTypeFilters: resolveTypeFilters(scene),
            lunarFeatureSearchQuery: "",
            lunarFeatureExcludedKeys: [],
        };
        const hoverFilterState = {
            lunarFeatureTypeFilters: resolveHoverTypeFilters(scene),
            lunarFeatureSearchQuery: "",
            lunarFeatureExcludedKeys: [],
        };
        const searchFilterState = {
            lunarFeatureSearchQuery: resolveSearchQuery(scene),
            lunarFeaturePinnedNames: resolvePinnedNames(scene),
            lunarFeatureExcludedKeys: resolveExcludedKeys(scene),
        };
        const hasSearchQuery = searchFilterState.lunarFeatureSearchQuery.length > 0 ||
            searchFilterState.lunarFeaturePinnedNames.length > 0;
        const group = new THREE.Group();
        group.name = "lunar-crater-annotations";
        group.visible = getViewLunarCraters() === true || shouldShowAlways || shouldHover || hasSearchQuery;
        group.userData.sharedMaterials = [];

        const annotations = [];
        const pickTargets = [];
        const craterFeatures = getCraterDisplayFeatures(getActiveCraterCatalog(), {
            ...displayDiameterRange,
            ...showAllFilterState,
        });
        const hoverCraterFeatures = shouldHover
            ? getCraterDisplayFeatures(getActiveCraterCatalog(), {
                ...hoverDiameterRange,
                ...hoverFilterState,
            })
            : [];
        const searchDiameterRange = normalizeCraterDisplayDiameterRange({
            lunarCraterMinDiameterKm: LUNAR_CRATER_RANGE_MIN_DIAMETER_KM,
            lunarCraterMaxDiameterKm: CRATER_SEARCH_MAX_DIAMETER_KM,
        }, getActiveCraterCatalog());
        const searchCraterFeatures = hasSearchQuery
            ? getCraterDisplayFeatures(getActiveCraterCatalog(), {
                ...searchDiameterRange,
                ...searchFilterState,
            })
            : [];
        const renderPlan = shouldShowAlways
            ? selectAlwaysRenderTargets({
                scene,
                camera,
                rendererDomElement,
                craterFeatures,
                moonRadius,
                lunarRadiusKm,
                displayDiameterRange,
                filterState: showAllFilterState,
            })
            : {
                targets: [],
                key: null,
                smallestRenderedDiameterKm: null,
                filteredCount: craterFeatures.length,
                renderedCount: 0,
                dense: craterFeatures.length > CRATER_DENSE_SELECTION_COUNT,
        };
        const renderTargets = shouldShowAlways ? renderPlan.targets : [];
        if (shouldShowAlways) {
            for (const target of renderTargets) {
                ensureCraterBoundaryMaterials(group, target.crater?.featureType);
            }
        }
        const searchTargets = hasSearchQuery
            ? selectSearchAnnotationTargets({
                scene,
                camera,
                rendererDomElement,
                craterFeatures: searchCraterFeatures,
                moonRadius,
                lunarRadiusKm,
                displayDiameterRange: searchDiameterRange,
                filterState: searchFilterState,
            })
            : [];
        const renderTargetsByName = new Map();
        for (const target of renderTargets) {
            const key = target.crater?.name || target.crater?.cleanName || "";
            if (key) renderTargetsByName.set(key, target);
        }
        const searchAnnotationTargets = [];
        for (const target of searchTargets) {
            const key = target.crater?.name || target.crater?.cleanName || "";
            const existingTarget = renderTargetsByName.get(key);
            if (existingTarget) {
                existingTarget.showLabel = true;
                existingTarget.searchAnnotation = true;
                existingTarget.sunlit = target.sunlit;
            } else {
                searchAnnotationTargets.push(target);
            }
        }
        for (const target of searchAnnotationTargets) {
            ensureCraterBoundaryMaterials(group, target.crater?.featureType);
        }

        const visualTargetsByName = new Map();
        for (const target of [...renderTargets, ...searchAnnotationTargets]) {
            const key = target.crater?.name || target.crater?.cleanName || "";
            if (key) {
                visualTargetsByName.set(key, target);
            }
        }
        if (shouldHover) {
            for (const crater of hoverCraterFeatures) {
                const target = buildCraterPickTarget({ crater, moonRadius, lunarRadiusKm });
                const visualTarget = visualTargetsByName.get(crater.name || crater.cleanName || "");
                if (visualTarget) {
                    target.showLabel = visualTarget.showLabel === true;
                    target.searchAnnotation = visualTarget.searchAnnotation === true;
                    target.sunlit = visualTarget.sunlit;
                    target.ring = visualTarget.ring || null;
                    target.label = visualTarget.label || null;
                }
                pickTargets.push(target);
            }
        } else if (shouldShowAlways) {
            pickTargets.push(...renderTargets);
        } else if (hasSearchQuery && searchAnnotationTargets.length) {
            pickTargets.push(...searchAnnotationTargets);
        }

        for (const target of renderTargets) {
            const crater = target.crater;

            const ring = createCraterRing({
                THREE,
                crater,
                normal: target.centerNormal,
                moonRadius,
                    material: getCraterBoundaryMaterial({
                        group,
                        featureType: crater.featureType,
                        sunlit: target.sunlit,
                        hover: target.searchAnnotation === true,
                    }),
                    lunarRadiusKm,
                    surfaceScale: target.searchAnnotation === true
                        ? CRATER_HOVER_RING_SURFACE_SCALE
                        : CRATER_RING_SURFACE_SCALE,
                    renderOrder: target.searchAnnotation === true ? 18 : 7,
                    hoverAnnotation: false,
                });
            ring.userData.sunlit = target.sunlit;
            ring.userData.searchAnnotation = target.searchAnnotation === true;
            const label = target.showLabel === true
                ? createCraterLabelSprite({
                    THREE,
                    crater,
                    normal: target.centerNormal,
                    moonRadius,
                    surfaceScale: CRATER_ALWAYS_LABEL_SURFACE_SCALE,
                    depthTest: false,
                    renderOrder: 9,
                    namePrefix: "lunar-crater-label",
                    hoverLabel: false,
                    labelWidthMin: 0.16,
                    labelWidthMax: 0.36,
                    labelWidthBase: 0.11,
                    labelWidthPerNameChar: 0.008,
                    visibilityAngularRadius: target.angularRadius,
                    targetScreenHeightPx: CRATER_ALWAYS_LABEL_TARGET_SCREEN_HEIGHT_PX,
                    searchAnnotation: target.searchAnnotation === true,
                })
                : null;
            target.ring = ring;
            target.label = label;
            group.add(ring);
            annotations.push(ring);
            if (label) {
                group.add(label);
                annotations.push(label);
            }
        }

        if (hasSearchQuery) {
            const existingSearchKeys = new Set();
            for (const target of searchAnnotationTargets) {
                const key = target.crater?.name || "";
                if (!key || existingSearchKeys.has(key)) {
                    continue;
                }
                existingSearchKeys.add(key);
                const { ring, label, leader } = createSearchAnnotation({
                    group,
                    scene,
                    camera,
                    rendererDomElement,
                    target,
                    moonRadius,
                    lunarRadiusKm,
                });
                target.ring = ring || null;
                target.label = label || null;
                if (ring) {
                    group.add(ring);
                    annotations.push(ring);
                }
                if (leader) {
                    group.add(leader);
                    annotations.push(leader);
                }
                if (label) {
                    group.add(label);
                    annotations.push(label);
                }
            }
        }
        for (const target of pickTargets) {
            const key = target.crater?.name || target.crater?.cleanName || "";
            const visualTarget = key ? visualTargetsByName.get(key) : null;
            if (!visualTarget) continue;
            target.ring = visualTarget.ring || target.ring || null;
            target.label = visualTarget.label || target.label || null;
        }

        scene.lunarCraterMinDiameterKm = displayDiameterRange.lunarCraterMinDiameterKm;
        scene.lunarCraterMaxDiameterKm = displayDiameterRange.lunarCraterMaxDiameterKm;
        scene.lunarCraterHoverMinDiameterKm = hoverDiameterRange.lunarCraterMinDiameterKm;
        scene.lunarCraterHoverMaxDiameterKm = hoverDiameterRange.lunarCraterMaxDiameterKm;
        scene.lunarCraterShowAllEnabled = shouldShowAlways;
        scene.lunarCraterHoverEnabled = shouldHover;
        scene.lunarCraterDisplayMode = displayMode;
        scene.lunarFeatureTypeFilters = showAllFilterState.lunarFeatureTypeFilters;
        scene.lunarFeatureSearchQuery = searchFilterState.lunarFeatureSearchQuery;
        scene.lunarFeaturePinnedNames = searchFilterState.lunarFeaturePinnedNames;
        scene.lunarFeatureExcludedKeys = searchFilterState.lunarFeatureExcludedKeys;
        scene.lunarFeatureHoverTypeFilters = hoverFilterState.lunarFeatureTypeFilters;
        scene.lunarFeatureHoverSearchQuery = "";
        scene.lunarFeatureHoverExcludedKeys = [];
        scene.lunarCraterFilteredCount = craterFeatures.length;
        scene.lunarCraterRenderedCount = renderPlan.renderedCount;
        scene.lunarCraterRenderOmittedCount = Math.max(0, craterFeatures.length - renderPlan.renderedCount);
        scene.lunarCraterRenderDense = renderPlan.dense;
        scene.lunarCraterRenderContextKey = renderPlan.key;
        scene.lunarCraterSmallestRenderedDiameterKm = renderPlan.smallestRenderedDiameterKm;
        scene.lunarCraterRenderPlanLastCheckMs = 0;
        scene.lunarCraterGroup = group;
        scene.lunarCraterAnnotations = annotations;
        scene.lunarCraterPickTargets = pickTargets;
        scene.lunarCraterHoverLabelsEnabled = hoverLabelsEnabled;
        scene.lunarCraterHoverLabel = null;
        scene.lunarCraterHoverRing = null;
        scene.lunarCraterHoverMaterial = null;
        scene.lunarCraterHoveredLabel = null;
        scene.lunarCraterHoveredRing = null;
        scene.lunarCraterHoveredName = null;
        scene.lunarCraterHoveredDiameterKm = null;
        scene.moonContainer.add(group);
    }

    function disposeLunarCraterAnnotations({ scene }) {
        const group = scene?.lunarCraterGroup;
        if (!group) {
            if (scene) {
                scene.lunarCraterAnnotations = [];
                scene.lunarCraterPickTargets = [];
                scene.lunarCraterHoverLabel = null;
                scene.lunarCraterHoverRing = null;
                scene.lunarCraterHoverMaterial = null;
                scene.lunarCraterHoveredLabel = null;
                scene.lunarCraterHoveredRing = null;
                scene.lunarCraterHoveredName = null;
                scene.lunarCraterHoveredDiameterKm = null;
                scene.lunarCraterFilteredCount = 0;
                scene.lunarCraterRenderedCount = 0;
                scene.lunarCraterRenderOmittedCount = 0;
                scene.lunarCraterRenderDense = false;
                scene.lunarCraterRenderContextKey = null;
                scene.lunarCraterSmallestRenderedDiameterKm = null;
                scene.lunarCraterRenderPlanLastCheckMs = 0;
            }
            return;
        }

        if (group.parent) {
            group.parent.remove(group);
        }

        const disposedMaterials = new Set();
        const disposedTextures = new Set();
        group.traverse((object) => {
            disposeObjectResources(object, disposedMaterials, disposedTextures);
        });
        for (const material of group.userData?.sharedMaterials || []) {
            if (!disposedMaterials.has(material)) {
                if (material.map && !disposedTextures.has(material.map)) {
                    material.map.dispose?.();
                    disposedTextures.add(material.map);
                }
                material.dispose?.();
                disposedMaterials.add(material);
            }
        }
        scene.lunarCraterGroup = null;
        scene.lunarCraterAnnotations = [];
        scene.lunarCraterPickTargets = [];
        scene.lunarCraterHoverLabel = null;
        scene.lunarCraterHoverRing = null;
        scene.lunarCraterHoverMaterial = null;
        scene.lunarCraterHoveredLabel = null;
        scene.lunarCraterHoveredRing = null;
        scene.lunarCraterHoveredName = null;
        scene.lunarCraterHoveredDiameterKm = null;
        scene.lunarCraterFilteredCount = 0;
        scene.lunarCraterRenderedCount = 0;
        scene.lunarCraterRenderOmittedCount = 0;
        scene.lunarCraterRenderDense = false;
        scene.lunarCraterRenderContextKey = null;
        scene.lunarCraterSmallestRenderedDiameterKm = null;
        scene.lunarCraterRenderPlanLastCheckMs = 0;
    }

    function setLunarCraterAnnotationsVisible({ scene, visible }) {
        if (scene?.lunarCraterGroup) {
            scene.lunarCraterGroup.visible = visible === true;
            if (visible !== true) {
                hideLunarCraterHover({ scene });
            }
            return true;
        }
        if (visible === true && scene?.moonContainer && getGlobalConfig()?.is_lunar) {
            addLunarCraterAnnotations({ scene });
            return true;
        }
        return false;
    }

    function setLunarCraterDiameterRange({
        scene,
        minDiameterKm,
        maxDiameterKm,
        camera = scene?.camera ?? null,
        rendererDomElement = scene?.cameraController?._rendererDomElement ??
            scene?.renderer?.domElement ??
            null,
    } = {}) {
        if (!scene) return false;
        const nextRange = normalizeCraterDisplayDiameterRange({
            lunarCraterMinDiameterKm: Number.isFinite(Number(minDiameterKm))
                ? Number(minDiameterKm)
                : scene.lunarCraterMinDiameterKm,
            lunarCraterMaxDiameterKm: Number.isFinite(Number(maxDiameterKm))
                ? Number(maxDiameterKm)
                : scene.lunarCraterMaxDiameterKm,
        }, getActiveCraterCatalog());
        if (
            scene.lunarCraterMinDiameterKm === nextRange.lunarCraterMinDiameterKm &&
            scene.lunarCraterMaxDiameterKm === nextRange.lunarCraterMaxDiameterKm
        ) {
            return false;
        }
        scene.lunarCraterMinDiameterKm = nextRange.lunarCraterMinDiameterKm;
        scene.lunarCraterMaxDiameterKm = nextRange.lunarCraterMaxDiameterKm;
        hideLunarCraterHover({ scene });
        if (scene.moonContainer && getGlobalConfig()?.is_lunar) {
            addLunarCraterAnnotations({ scene, camera, rendererDomElement });
            return true;
        }
        return false;
    }

    function setLunarCraterDisplayMode({
        scene,
        mode,
        camera = scene?.camera ?? null,
        rendererDomElement = scene?.cameraController?._rendererDomElement ??
            scene?.renderer?.domElement ??
            null,
    } = {}) {
        if (!scene) return false;
        const nextMode = normalizeCraterDisplayMode(mode);
        if (resolveDisplayMode(scene) === nextMode) {
            scene.lunarCraterDisplayMode = nextMode;
            return false;
        }
        scene.lunarCraterDisplayMode = nextMode;
        hideLunarCraterHover({ scene });
        if (scene.moonContainer && getGlobalConfig()?.is_lunar) {
            addLunarCraterAnnotations({ scene, camera, rendererDomElement });
            return true;
        }
        return true;
    }

    function setLunarCraterHoverLabelsEnabled({ scene, enabled }) {
        if (!scene) return false;
        const nextEnabled = enabled !== false;
        const changed = scene.lunarCraterHoverLabelsEnabled !== nextEnabled;
        scene.lunarCraterHoverLabelsEnabled = nextEnabled;
        if (!nextEnabled) {
            return hideLunarCraterHover({ scene }) || changed;
        }
        return changed;
    }

    function setLunarFeatureTypeFilters({
        scene,
        typeFilters,
        camera = scene?.camera ?? null,
        rendererDomElement = scene?.cameraController?._rendererDomElement ??
            scene?.renderer?.domElement ??
            null,
    } = {}) {
        if (!scene) return false;
        const nextFilters = normalizeLunarFeatureTypeFilters(
            typeFilters,
            resolveTypeFilters(scene),
        );
        const previous = normalizeLunarFeatureTypeFilters(scene.lunarFeatureTypeFilters, {});
        if (JSON.stringify(previous) === JSON.stringify(nextFilters)) {
            scene.lunarFeatureTypeFilters = nextFilters;
            return false;
        }
        scene.lunarFeatureTypeFilters = nextFilters;
        hideLunarCraterHover({ scene });
        if (scene.moonContainer && getGlobalConfig()?.is_lunar) {
            addLunarCraterAnnotations({ scene, camera, rendererDomElement });
            return true;
        }
        return true;
    }

    function setLunarFeatureSearchQuery({
        scene,
        searchQuery,
        camera = scene?.camera ?? null,
        rendererDomElement = scene?.cameraController?._rendererDomElement ??
            scene?.renderer?.domElement ??
            null,
    } = {}) {
        if (!scene) return false;
        const nextQuery = normalizeLunarFeatureSearchQuery(searchQuery);
        const previousQuery = normalizeLunarFeatureSearchQuery(scene.lunarFeatureSearchQuery);
        if (previousQuery === nextQuery) {
            scene.lunarFeatureSearchQuery = nextQuery;
            return false;
        }
        scene.lunarFeatureSearchQuery = nextQuery;
        hideLunarCraterHover({ scene });
        if (scene.moonContainer && getGlobalConfig()?.is_lunar) {
            addLunarCraterAnnotations({ scene, camera, rendererDomElement });
            return true;
        }
        return true;
    }

    function setLunarFeatureExcludedKeys({
        scene,
        excludedKeys,
        camera = scene?.camera ?? null,
        rendererDomElement = scene?.cameraController?._rendererDomElement ??
            scene?.renderer?.domElement ??
            null,
    } = {}) {
        if (!scene) return false;
        const nextKeys = normalizeLunarFeatureKeyList(excludedKeys);
        const previousKeys = normalizeLunarFeatureKeyList(scene.lunarFeatureExcludedKeys);
        const sameKeys = nextKeys.length === previousKeys.length &&
            nextKeys.every((key, index) => key === previousKeys[index]);
        if (sameKeys) {
            scene.lunarFeatureExcludedKeys = nextKeys;
            return false;
        }
        scene.lunarFeatureExcludedKeys = nextKeys;
        hideLunarCraterHover({ scene });
        if (scene.moonContainer && getGlobalConfig()?.is_lunar) {
            addLunarCraterAnnotations({ scene, camera, rendererDomElement });
            return true;
        }
        return true;
    }

    function updateLunarCraterLabelScales({ scene, camera, rendererDomElement = null, freezeScale = false }) {
        if (!scene?.lunarCraterGroup || !camera) {
            return false;
        }
        if (freezeScale === true) {
            return false;
        }
        if (resolveShowAllEnabled(scene)) {
            const nowMs = typeof performance !== "undefined" && typeof performance.now === "function"
                ? performance.now()
                : Date.now();
            const previousCheckMs = Number(scene.lunarCraterRenderPlanLastCheckMs) || 0;
            if (nowMs - previousCheckMs >= CRATER_RENDER_PLAN_CHECK_INTERVAL_MS) {
                scene.lunarCraterRenderPlanLastCheckMs = nowMs;
                const moonRadius = getMoonRadius();
                if (Number.isFinite(moonRadius) && moonRadius > 0) {
                    const craterFeatures = getCraterDisplayFeatures(getActiveCraterCatalog(), {
                        ...resolveDisplayDiameterRange(scene),
                        lunarFeatureTypeFilters: resolveTypeFilters(scene),
                        lunarFeatureSearchQuery: "",
                        lunarFeatureExcludedKeys: [],
                    });
                    const renderPlan = selectAlwaysRenderTargets({
                        scene,
                        camera,
                        rendererDomElement,
                        craterFeatures,
                        moonRadius,
                        lunarRadiusKm: getLunarRadiusKm(),
                        displayDiameterRange: resolveDisplayDiameterRange(scene),
                        filterState: {
                            lunarFeatureTypeFilters: resolveTypeFilters(scene),
                            lunarFeatureSearchQuery: "",
                            lunarFeatureExcludedKeys: [],
                        },
                    });
                    if (renderPlan.key !== scene.lunarCraterRenderContextKey) {
                        addLunarCraterAnnotations({ scene, camera, rendererDomElement });
                        return true;
                    }
                }
            }
        }
        let changed = updateCraterBoundaryStyles({ scene });
        let cameraNormalAvailable = false;
        if (scene.moonContainer?.worldToLocal && camera.getWorldPosition) {
            camera.getWorldPosition(cameraWorldPosition);
            cameraMoonLocalPosition.copy(cameraWorldPosition);
            scene.moonContainer.worldToLocal(cameraMoonLocalPosition);
            if (cameraMoonLocalPosition.lengthSq() > 1e-12) {
                cameraMoonLocalPosition.normalize();
                cameraNormalAvailable = true;
            }
        }
        scene.lunarCraterGroup.traverse((object) => {
            if (!object?.userData?.lunarCrater) {
                return;
            }
            if (cameraNormalAvailable && Array.isArray(object.userData.centerNormal)) {
                craterLabelNormal.fromArray(object.userData.centerNormal).normalize();
                const visibilityAngularRadius = Number(object.userData.visibilityAngularRadius);
                const visibilityThreshold = getCraterVisibilityThreshold(
                    Number.isFinite(visibilityAngularRadius) ? visibilityAngularRadius : 0,
                );
                const facingCamera = craterLabelNormal.dot(cameraMoonLocalPosition) > visibilityThreshold;
                if (object.userData.hoverLabel || object.userData.hoverAnnotation) {
                    if (object.visible && !facingCamera) {
                        object.visible = false;
                        changed = true;
                    }
                } else if (object.visible !== facingCamera) {
                    object.visible = facingCamera;
                    changed = true;
                }
                if (!facingCamera || !object.visible) {
                    return;
                }
            }
            if (!Number.isFinite(object.userData.baseScaleY)) {
                return;
            }
            const baseScaleX = object.userData.baseScaleX;
            const baseScaleY = object.userData.baseScaleY;
            object.getWorldPosition(labelWorldPosition);
            const ratio = calculateCraterLabelScaleRatio({
                camera,
                rendererDomElement,
                labelWorldHeight: baseScaleY,
                labelWorldPosition,
                maxScreenHeightPx: object.userData.hoverLabel
                    ? CRATER_HOVER_LABEL_MAX_SCREEN_HEIGHT_PX
                    : CRATER_LABEL_MAX_SCREEN_HEIGHT_PX,
                targetScreenHeightPx: object.userData.targetScreenHeightPx,
            });
            const hoverBoost = object.userData.hoverScaleBoost === true ? 1.12 : 1;
            const nextScaleX = baseScaleX * ratio * hoverBoost;
            const nextScaleY = baseScaleY * ratio * hoverBoost;
            if (object.scale.x !== nextScaleX || object.scale.y !== nextScaleY) {
                object.scale.set(nextScaleX, nextScaleY, 1);
                changed = true;
            }
        });
        return changed;
    }

    function updateLunarCraterHoverFromPointer({
        scene,
        camera,
        rendererDomElement,
        clientX,
        clientY,
    }) {
        const canInspectRenderedSearchTargets = resolveSearchQuery(scene).length > 0;
        if (
            !scene?.lunarCraterGroup?.visible ||
            (!resolveHoverEnabled(scene) && !canInspectRenderedSearchTargets) ||
            scene.lunarCraterHoverLabelsEnabled === false
        ) {
            return hideLunarCraterHover({ scene });
        }

        const target = findCraterTargetAtPointer({
            scene,
            camera,
            rendererDomElement,
            clientX,
            clientY,
        });
        if (!target) {
            return hideLunarCraterHover({ scene });
        }

        const moonRadius = getMoonRadius();
        if (!Number.isFinite(moonRadius) || moonRadius <= 0) {
            return hideLunarCraterHover({ scene });
        }

        const craterScreenBounds = calculateCraterProjectedScreenBounds({
            THREE,
            scene,
            camera,
            rendererDomElement,
            normal: target.centerNormal,
            angularRadius: target.angularRadius,
            moonRadius,
        });
        const projectedCraterRadiusPx = craterScreenBounds?.radiusPx ?? null;
        const cameraContext = resolveCraterCameraContext({
            scene,
            camera,
            rendererDomElement,
            moonRadius,
        });
        const alreadyHovered = scene.lunarCraterHoveredName === target.crater.name;
        let labelVisibilityChanged = false;
        if (scene.lunarCraterHoveredRing && scene.lunarCraterHoveredRing !== target.ring) {
            scene.lunarCraterHoveredRing.userData.hoverAnnotation = false;
            scene.lunarCraterHoveredRing = null;
            labelVisibilityChanged = true;
        }
        if (scene.lunarCraterHoveredLabel && scene.lunarCraterHoveredLabel !== target.label) {
            scene.lunarCraterHoveredLabel.userData.hoverScaleBoost = false;
            scene.lunarCraterHoveredLabel = null;
            labelVisibilityChanged = true;
        }
        if (target.showLabel === true) {
            if (scene.lunarCraterHoverLabel?.visible) {
                scene.lunarCraterHoverLabel.visible = false;
                labelVisibilityChanged = true;
            }
            if (target.ring) {
                target.ring.userData.hoverAnnotation = true;
                scene.lunarCraterHoveredRing = target.ring;
            }
            if (target.label) {
                target.label.userData.hoverScaleBoost = true;
                scene.lunarCraterHoveredLabel = target.label;
            }
        } else {
            ensureHoverLabel({
                scene,
                camera,
                rendererDomElement,
                crater: target.crater,
                normal: target.centerNormal,
                moonRadius,
                angularRadius: target.angularRadius,
                projectedCraterRadiusPx,
                craterScreenBounds,
                cameraUpNormal: cameraContext?.cameraUpNormal ?? null,
                cameraRightNormal: cameraContext?.cameraRightNormal ?? null,
            });
        }
        if (target.showLabel === true) {
            if (scene.lunarCraterHoverRing?.visible) {
                scene.lunarCraterHoverRing.visible = false;
                labelVisibilityChanged = true;
            }
        } else if (!alreadyHovered || !scene.lunarCraterHoverRing?.visible) {
            ensureHoverRing({
                scene,
                target,
                moonRadius,
                lunarRadiusKm: getLunarRadiusKm(),
            });
        }
        if (scene.lunarCraterHoverRing && target.showLabel !== true) {
            scene.lunarCraterHoverRing.visible = true;
        }
        scene.lunarCraterHoveredName = target.crater.name;
        scene.lunarCraterHoveredDiameterKm = target.crater.diameterKm;
        return !alreadyHovered || labelVisibilityChanged;
    }

    return {
        addLunarCraterAnnotations,
        disposeLunarCraterAnnotations,
        hideLunarCraterHover,
        setLunarCraterAnnotationsVisible,
        setLunarCraterDiameterRange,
        setLunarCraterDisplayMode,
        setLunarCraterHoverLabelsEnabled,
        setLunarFeatureTypeFilters,
        setLunarFeatureSearchQuery,
        setLunarFeatureExcludedKeys,
        updateLunarCraterLabelScales,
        updateLunarCraterHoverFromPointer,
    };
}

export {
    buildCraterCirclePositions,
    calculateCraterHoverLabelOffset,
    calculateCraterProjectedScreenBounds,
    calculateCraterLabelScaleRatio,
    calculateCraterProjectedRadiusPx,
    countCraterDisplayFeatures,
    createLunarCraterActions,
    formatCraterLabelText,
    getCraterDisplayFeatures,
    normalizeCraterDisplayDiameterRange,
    resolveCraterHoverTarget,
    resolveCraterHoverTargetFromScreen,
    resolveMoonSurfaceHitNormal,
};
