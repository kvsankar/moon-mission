import { countCraterDisplayFeatures as countCraterDisplayFeaturesForCatalog, getCraterHoverLabelScreenAnchor, getCraterDisplayFeatures as getCraterDisplayFeaturesForCatalog, getCraterLabelPlacement, normalizeCraterDisplayDiameterRange as normalizeCraterDisplayDiameterRangeForCatalog } from "../core/domain/lunar-crater-catalog.js";
import {
    CRATER_RING_SEGMENTS,
    CRATER_RING_SURFACE_SCALE,
    CRATER_HOVER_RING_SURFACE_SCALE,
    CRATER_LABEL_SURFACE_SCALE,
    CRATER_LABEL_FILL_COLOR,
    CRATER_LABEL_TEXT_COLOR,
    CRATER_SEARCH_LABEL_FILL_COLOR,
    CRATER_SEARCH_LABEL_BORDER_COLOR,
    CRATER_SEARCH_LABEL_TITLE_COLOR,
    CRATER_SEARCH_LABEL_META_COLOR,
    CRATER_LABEL_FONT_FAMILY,
    CRATER_SEARCH_LABEL_FONT_FAMILY,
    CRATER_HOVER_LABEL_EDGE_GAP,
    CRATER_HOVER_LABEL_SCREEN_GAP_MIN_PX,
    CRATER_HOVER_LABEL_SCREEN_GAP_MAX_PX,
    CRATER_HOVER_LABEL_SCREEN_GAP_RATIO,
    CRATER_HOVER_LABEL_FALLBACK_RADIUS_MULTIPLIER,
    CRATER_HOVER_LABEL_MAX_ANGULAR_OFFSET,
    CRATER_HOVER_LABEL_MAX_SCREEN_HEIGHT_PX,
    CRATER_DISPLAY_MODE_ALWAYS,
    CRATER_DISPLAY_MODE_HOVER,
    CRATER_VISIBILITY_EDGE_PADDING,
    EMPTY_LUNAR_CRATER_CATALOG,
} from "./lunar-crater-render-config.js";

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
export {
    normalizeCraterDisplayMode,
    shouldShowHoverLabelForDisplayMode,
    normalizeCraterDisplayDiameterRange,
    getCraterDisplayFeatures,
    countCraterDisplayFeatures,
    formatCraterLabelText,
    buildCraterCirclePositions,
    getCraterAngularRadius,
    getCraterVisibilityThreshold,
    createCraterRing,
    vectorToPlain,
    resolveCraterLabelNormal,
    getCameraViewportSize,
    calculateCraterLabelScaleRatio,
    calculateCraterHoverLabelOffset,
    projectMoonLocalNormalToScreen,
    calculateCraterProjectedScreenBounds,
    calculateCraterProjectedRadiusPx,
    positionCraterHoverLabelFromScreenBounds,
    createCraterSearchLeaderLine,
    createCraterLabelSprite,
};
