// @ts-nocheck

/**
 * Moon Renderer - Moon sphere with texture, displacement, axis, and poles
 *
 * Manages Moon visualization:
 * - Textured sphere with bump and displacement maps
 * - Polar axis line
 * - North/South pole markers
 * - Rotation based on lunar pole orientation
 */

import * as THREE from 'three';
import { COLORS as COL, PHYSICS_CONSTANTS as PC } from '../core/constants.js';
import { lunar_pole } from '../astro.js';
import { normalizeMoonRenderPipelineState } from "../app/moon-render-pipeline.js";
import { resolveMoonLightingModelStages } from "../app/moon-lighting-models.js";
import { buildMoonNormalMapFromHeightTexture } from "./moon-normal-map.js";

const MOON_GEOMETRY_WIDTH_SEGMENTS = 512;
const MOON_GEOMETRY_HEIGHT_SEGMENTS = 512;
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
const DEFAULT_MOON_RENDER_SETTINGS = Object.freeze({
    geometryWidthSegments: MOON_GEOMETRY_WIDTH_SEGMENTS,
    geometryHeightSegments: MOON_GEOMETRY_HEIGHT_SEGMENTS,
    normalMapMaxWidth: 5760,
    normalMapStrength: 2.4,
    normalDetailBoost: 2.0,
    normalDetailRadius: 4,
    normalScale: 2.2,
    displacementScale: 0.013,
    displacementBias: -0.0048,
    roughness: 0.955,
    metalness: 0.0,
    lommelSeeligerBlend: 0.20,
    lsClampMin: 0.74,
    lsClampMax: 1.0,
    oppositionStrength: 0.0023,
    shadowLift: 0.0,
    highlightBoost: 1.20,
    shadowWeightExponent: 1.92,
    highlightWeightExponent: 1.2,
    terminatorContrast: 1.8,
    terminatorReliefStrength: 7.5,
    terminatorShadowFloor: 0.0,
    terminatorIndirectOcclusion: 1.0,
    terrainReliefStrength: 2.2,
    terrainShadowStrength: 1.2,
    terrainShadowTexelStride: 7.0,
    terrainShadowSlopeBias: 0.0014,
    terrainShadowSamples: 12,
    shadowNormalBias: 0.00018,
    shadowBias: -0.000003,
});

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

function normalizeMoonRenderSettings(renderSettings = null) {
    if (!renderSettings || typeof renderSettings !== "object") {
        return { ...DEFAULT_MOON_RENDER_SETTINGS };
    }

    const normalized = {};
    Object.entries(DEFAULT_MOON_RENDER_SETTINGS).forEach(([key, fallbackValue]) => {
        const candidateValue = Number(renderSettings[key]);
        normalized[key] = Number.isFinite(candidateValue) ? candidateValue : fallbackValue;
    });
    return normalized;
}

function applyMoonRenderSettingsToMaterial(material, renderSettings = DEFAULT_MOON_RENDER_SETTINGS) {
    const normalized = normalizeMoonRenderSettings(renderSettings);
    const displacementImage = material.displacementMap?.image;
    const displacementWidth = Number(displacementImage?.width);
    const displacementHeight = Number(displacementImage?.height);
    const heightTexelSize = new THREE.Vector2(
        1 / Math.max(1, Number.isFinite(displacementWidth) ? displacementWidth : normalized.normalMapMaxWidth),
        1 / Math.max(1, Number.isFinite(displacementHeight) ? displacementHeight : Math.round(normalized.normalMapMaxWidth / 2)),
    );
    material.userData = material.userData || {};
    material.userData.moonLsBlend = normalized.lommelSeeligerBlend;
    material.userData.moonOppositionStrength = normalized.oppositionStrength;
    material.userData.moonLsClampMin = normalized.lsClampMin;
    material.userData.moonLsClampMax = normalized.lsClampMax;
    material.userData.moonShadowLift = normalized.shadowLift;
    material.userData.moonHighlightBoost = normalized.highlightBoost;
    material.userData.moonShadowWeightExponent = normalized.shadowWeightExponent;
    material.userData.moonHighlightWeightExponent = normalized.highlightWeightExponent;
    material.userData.moonTerminatorContrast = normalized.terminatorContrast;
    material.userData.moonTerminatorReliefStrength = normalized.terminatorReliefStrength;
    material.userData.moonTerminatorShadowFloor = normalized.terminatorShadowFloor;
    material.userData.moonTerminatorIndirectOcclusion = normalized.terminatorIndirectOcclusion;
    material.userData.moonTerrainShadowStrength = material.displacementMap
        ? normalized.terrainShadowStrength
        : 0.0;
    material.userData.moonTerrainShadowTexelStride = normalized.terrainShadowTexelStride;
    material.userData.moonTerrainShadowSlopeBias = normalized.terrainShadowSlopeBias;
    material.userData.moonTerrainShadowSamples = normalized.terrainShadowSamples;
    material.userData.moonHeightTexelSize = heightTexelSize;

    material.displacementScale = normalized.displacementScale;
    material.displacementBias = normalized.displacementBias;
    material.roughness = normalized.roughness;
    material.metalness = normalized.metalness;
    material.normalScale?.set?.(normalized.normalScale, normalized.normalScale);
}

function resolvePipelineRenderSettings(renderSettings, pipelineState) {
    const normalizedSettings = normalizeMoonRenderSettings(renderSettings);
    const pipeline = resolveMoonLightingModelStages(
        normalizeMoonRenderPipelineState(pipelineState),
    );
    return {
        ...normalizedSettings,
        normalScale: pipeline.physicalModel
            ? normalizedSettings.normalScale * pipeline.physicalNormalScale
            : normalizedSettings.normalScale,
        displacementScale: pipeline.physicalModel
            ? normalizedSettings.displacementScale * pipeline.physicalReliefScale
            : normalizedSettings.displacementScale,
        displacementBias: pipeline.physicalModel
            ? normalizedSettings.displacementBias * pipeline.physicalReliefScale
            : normalizedSettings.displacementBias,
        lommelSeeligerBlend: pipeline.physicalModel
            ? pipeline.physicalBrdfBlend
            : (pipeline.photometric ? normalizedSettings.lommelSeeligerBlend : 0.0),
        oppositionStrength: pipeline.photometric && !pipeline.physicalModel
            ? normalizedSettings.oppositionStrength
            : 0.0,
        highlightBoost: pipeline.photometric && !pipeline.physicalModel
            ? normalizedSettings.highlightBoost
            : 1.0,
        terminatorContrast: pipeline.terminatorContrast || pipeline.terminatorRelief
            ? normalizedSettings.terminatorContrast
            : 1.0,
        terminatorReliefStrength: pipeline.terminatorRelief ? normalizedSettings.terminatorReliefStrength : 0.0,
        terminatorShadowFloor: pipeline.terminatorRelief ? normalizedSettings.terminatorShadowFloor : 0.0,
        terminatorIndirectOcclusion: pipeline.indirectOcclusion ? normalizedSettings.terminatorIndirectOcclusion : 0.0,
        terrainShadowStrength: pipeline.terrainShadows
            ? (pipeline.physicalModel ? pipeline.physicalShadowStrength : normalizedSettings.terrainShadowStrength)
            : 0.0,
    };
}

function applyMoonPipelineStagesToMaterial(material, renderSettings, pipelineState) {
    const normalizedSettings = normalizeMoonRenderSettings(renderSettings);
    const pipeline = resolveMoonLightingModelStages(
        normalizeMoonRenderPipelineState(pipelineState),
    );
    material.userData = material.userData || {};
    material.userData.moonTerrainReliefStrength = material.displacementMap && pipeline.terrainRelief
        ? normalizedSettings.terrainReliefStrength
        : 0.0;
    material.userData.moonTerminatorContrastBlend = pipeline.terminatorContrast ? 1.0 : 0.0;
    material.userData.moonShadowCrushBlend = pipeline.shadowCrush ? 1.0 : 0.0;
    material.userData.moonGeometricMask = pipeline.geometricMask ? 1.0 : 0.0;
    material.userData.moonPhysicalModelBlend = pipeline.physicalModel ? 1.0 : 0.0;
    material.userData.moonPhysicalExposure = pipeline.physicalExposure;
    material.userData.moonPhysicalToneGamma = pipeline.physicalToneGamma;
}

function applyMoonPhotometricShader(material) {
    material.userData = material.userData || {};
    if (!Number.isFinite(material.userData.moonLsBlend)) {
        material.userData.moonLsBlend = DEFAULT_MOON_RENDER_SETTINGS.lommelSeeligerBlend;
    }
    if (!Number.isFinite(material.userData.moonOppositionStrength)) {
        material.userData.moonOppositionStrength = DEFAULT_MOON_RENDER_SETTINGS.oppositionStrength;
    }
    if (!Number.isFinite(material.userData.moonLsClampMin)) {
        material.userData.moonLsClampMin = DEFAULT_MOON_RENDER_SETTINGS.lsClampMin;
    }
    if (!Number.isFinite(material.userData.moonLsClampMax)) {
        material.userData.moonLsClampMax = DEFAULT_MOON_RENDER_SETTINGS.lsClampMax;
    }
    if (!Number.isFinite(material.userData.moonShadowLift)) {
        material.userData.moonShadowLift = DEFAULT_MOON_RENDER_SETTINGS.shadowLift;
    }
    if (!Number.isFinite(material.userData.moonHighlightBoost)) {
        material.userData.moonHighlightBoost = DEFAULT_MOON_RENDER_SETTINGS.highlightBoost;
    }
    if (!Number.isFinite(material.userData.moonShadowWeightExponent)) {
        material.userData.moonShadowWeightExponent = DEFAULT_MOON_RENDER_SETTINGS.shadowWeightExponent;
    }
    if (!Number.isFinite(material.userData.moonHighlightWeightExponent)) {
        material.userData.moonHighlightWeightExponent = DEFAULT_MOON_RENDER_SETTINGS.highlightWeightExponent;
    }
    if (!Number.isFinite(material.userData.moonTerminatorContrast)) {
        material.userData.moonTerminatorContrast = DEFAULT_MOON_RENDER_SETTINGS.terminatorContrast;
    }
    if (!Number.isFinite(material.userData.moonTerminatorContrastBlend)) {
        material.userData.moonTerminatorContrastBlend = 1.0;
    }
    if (!Number.isFinite(material.userData.moonTerminatorReliefStrength)) {
        material.userData.moonTerminatorReliefStrength = DEFAULT_MOON_RENDER_SETTINGS.terminatorReliefStrength;
    }
    if (!Number.isFinite(material.userData.moonTerminatorShadowFloor)) {
        material.userData.moonTerminatorShadowFloor = DEFAULT_MOON_RENDER_SETTINGS.terminatorShadowFloor;
    }
    if (!Number.isFinite(material.userData.moonTerminatorIndirectOcclusion)) {
        material.userData.moonTerminatorIndirectOcclusion = DEFAULT_MOON_RENDER_SETTINGS.terminatorIndirectOcclusion;
    }
    if (!Number.isFinite(material.userData.moonTerrainShadowStrength)) {
        material.userData.moonTerrainShadowStrength = DEFAULT_MOON_RENDER_SETTINGS.terrainShadowStrength;
    }
    if (!Number.isFinite(material.userData.moonTerrainReliefStrength)) {
        material.userData.moonTerrainReliefStrength = DEFAULT_MOON_RENDER_SETTINGS.terrainReliefStrength;
    }
    if (!Number.isFinite(material.userData.moonTerrainShadowTexelStride)) {
        material.userData.moonTerrainShadowTexelStride = DEFAULT_MOON_RENDER_SETTINGS.terrainShadowTexelStride;
    }
    if (!Number.isFinite(material.userData.moonTerrainShadowSlopeBias)) {
        material.userData.moonTerrainShadowSlopeBias = DEFAULT_MOON_RENDER_SETTINGS.terrainShadowSlopeBias;
    }
    if (!Number.isFinite(material.userData.moonTerrainShadowSamples)) {
        material.userData.moonTerrainShadowSamples = DEFAULT_MOON_RENDER_SETTINGS.terrainShadowSamples;
    }
    if (!Number.isFinite(material.userData.moonEarthshineBlend)) {
        material.userData.moonEarthshineBlend = 1.0;
    }
    if (!Number.isFinite(material.userData.moonShadowCrushBlend)) {
        material.userData.moonShadowCrushBlend = 1.0;
    }
    if (!Number.isFinite(material.userData.moonGeometricMask)) {
        material.userData.moonGeometricMask = 0.0;
    }
    if (!Number.isFinite(material.userData.moonPhysicalModelBlend)) {
        material.userData.moonPhysicalModelBlend = 0.0;
    }
    if (!Number.isFinite(material.userData.moonPhysicalExposure)) {
        material.userData.moonPhysicalExposure = 0.60;
    }
    if (!Number.isFinite(material.userData.moonPhysicalToneGamma)) {
        material.userData.moonPhysicalToneGamma = 1.00;
    }
    if (!material.userData.moonHeightTexelSize) {
        material.userData.moonHeightTexelSize = new THREE.Vector2(
            1 / DEFAULT_MOON_RENDER_SETTINGS.normalMapMaxWidth,
            2 / DEFAULT_MOON_RENDER_SETTINGS.normalMapMaxWidth,
        );
    }

    material.onBeforeCompile = (shader, renderer = null) => {
        shader.uniforms.uMoonLsBlend = { value: material.userData.moonLsBlend };
        shader.uniforms.uMoonOppositionStrength = { value: material.userData.moonOppositionStrength };
        shader.uniforms.uMoonLsClampMin = { value: material.userData.moonLsClampMin };
        shader.uniforms.uMoonLsClampMax = { value: material.userData.moonLsClampMax };
        shader.uniforms.uMoonShadowLift = { value: material.userData.moonShadowLift };
        shader.uniforms.uMoonHighlightBoost = { value: material.userData.moonHighlightBoost };
        shader.uniforms.uMoonShadowWeightExponent = { value: material.userData.moonShadowWeightExponent };
        shader.uniforms.uMoonHighlightWeightExponent = { value: material.userData.moonHighlightWeightExponent };
        shader.uniforms.uMoonTerminatorContrast = { value: material.userData.moonTerminatorContrast };
        shader.uniforms.uMoonTerminatorContrastBlend = { value: material.userData.moonTerminatorContrastBlend };
        shader.uniforms.uMoonTerminatorReliefStrength = { value: material.userData.moonTerminatorReliefStrength };
        shader.uniforms.uMoonTerminatorShadowFloor = { value: material.userData.moonTerminatorShadowFloor };
        shader.uniforms.uMoonTerminatorIndirectOcclusion = { value: material.userData.moonTerminatorIndirectOcclusion };
        shader.uniforms.uMoonHeightMap = { value: material.displacementMap || null };
        shader.uniforms.uMoonHeightTexelSize = { value: material.userData.moonHeightTexelSize };
        shader.uniforms.uMoonTerrainShadowStrength = { value: material.userData.moonTerrainShadowStrength };
        shader.uniforms.uMoonTerrainReliefStrength = { value: material.userData.moonTerrainReliefStrength };
        shader.uniforms.uMoonTerrainShadowTexelStride = { value: material.userData.moonTerrainShadowTexelStride };
        shader.uniforms.uMoonTerrainShadowSlopeBias = { value: material.userData.moonTerrainShadowSlopeBias };
        shader.uniforms.uMoonTerrainShadowSamples = { value: material.userData.moonTerrainShadowSamples };
        shader.uniforms.uMoonEarthshineBlend = { value: material.userData.moonEarthshineBlend };
        shader.uniforms.uMoonShadowCrushBlend = { value: material.userData.moonShadowCrushBlend };
        shader.uniforms.uMoonGeometricMask = { value: material.userData.moonGeometricMask };
        shader.uniforms.uMoonPhysicalModelBlend = { value: material.userData.moonPhysicalModelBlend };
        shader.uniforms.uMoonPhysicalExposure = { value: material.userData.moonPhysicalExposure };
        shader.uniforms.uMoonPhysicalToneGamma = { value: material.userData.moonPhysicalToneGamma };
        material.userData.moonPhotometricShader = shader;
        if (!(material.userData.moonPhotometricShaders instanceof Map)) {
            material.userData.moonPhotometricShaders = new Map();
        }
        material.userData.moonPhotometricShaders.set(renderer || shader, shader);

        shader.vertexShader = shader.vertexShader
            .replace(
                "#include <common>",
                `#include <common>
varying vec3 vMoonGeometricNormalView;
varying vec3 vMoonDisplacedFromCenterView;
varying float vMoonBaseRadiusView;`,
            )
            .replace(
                "#include <beginnormal_vertex>",
                `#include <beginnormal_vertex>
vMoonGeometricNormalView = normalize( normalMatrix * objectNormal );`,
            )
            .replace(
                "#include <displacementmap_vertex>",
                `#include <displacementmap_vertex>
vMoonDisplacedFromCenterView = mat3( modelViewMatrix ) * transformed;
vMoonBaseRadiusView = length( mat3( modelViewMatrix ) * position );`,
            );

        shader.fragmentShader = shader.fragmentShader
            .replace(
                "#include <common>",
                `#include <common>
uniform float uMoonLsBlend;
uniform float uMoonOppositionStrength;
uniform float uMoonLsClampMin;
uniform float uMoonLsClampMax;
uniform float uMoonShadowLift;
uniform float uMoonHighlightBoost;
uniform float uMoonShadowWeightExponent;
uniform float uMoonHighlightWeightExponent;
uniform float uMoonTerminatorContrast;
uniform float uMoonTerminatorContrastBlend;
uniform float uMoonTerminatorReliefStrength;
uniform float uMoonTerminatorShadowFloor;
uniform float uMoonTerminatorIndirectOcclusion;
uniform sampler2D uMoonHeightMap;
uniform vec2 uMoonHeightTexelSize;
uniform float uMoonTerrainShadowStrength;
uniform float uMoonTerrainReliefStrength;
uniform float uMoonTerrainShadowTexelStride;
uniform float uMoonTerrainShadowSlopeBias;
uniform float uMoonTerrainShadowSamples;
uniform float uMoonEarthshineBlend;
uniform float uMoonShadowCrushBlend;
uniform float uMoonGeometricMask;
uniform float uMoonPhysicalModelBlend;
uniform float uMoonPhysicalExposure;
uniform float uMoonPhysicalToneGamma;
varying vec3 vMoonGeometricNormalView;
varying vec3 vMoonDisplacedFromCenterView;
varying float vMoonBaseRadiusView;

// Sun's angular half-radius as seen from the lunar surface (~0.267 deg).
// sin(alpha) ~ 0.00466 — sets the width of the macroscopic terminator
// penumbra band. Ahead-of-the-field detail; sub-pixel at typical zoom.
const float MOON_SUN_SIN_ALPHA = 0.00466;
const float MOON_INV_PI        = 0.31830988618;

// Fraction of the Sun's disk above the local geometric horizon, in [0, 1].
// Closed-form integral of the visible disk-area fraction. Drives the
// macroscopic-terminator soft transition.
//
// Use a macroscopic normal here: the smooth sphere in Current and the
// displaced geometric surface near the Physical terminator. Per-pixel
// normal-map perturbations are deliberately excluded because they produce
// white halos and a uniform glow band just past the terminator.
float moonSunDiskVisibleFraction(float rawNdotL) {
    float h = rawNdotL / MOON_SUN_SIN_ALPHA;
    if (h >=  1.0) return 1.0;
    if (h <= -1.0) return 0.0;
    float s = sqrt(max(1.0 - h * h, 0.0));
    return MOON_INV_PI * (1.5707963267948966 + asin(h) + h * s);
}`,
            )
            .replace(
                "#include <lights_fragment_begin>",
                `#include <lights_fragment_begin>
float moonShadowWeight = 1.0;
float moonFinalCavityDarken = 0.0;
vec3 moonEarthshineDirectKept = vec3( 0.0 );
#if NUM_DIR_LIGHTS > 0
    vec3 moonNormal = normalize( geometryNormal );
    vec3 moonViewDir = normalize( geometryViewDir );
    vec3 moonLightDir = normalize( directionalLights[0].direction );
    float moonNdotL = clamp( dot( moonNormal, moonLightDir ), 0.0, 1.0 );
    float moonNdotV = clamp( dot( moonNormal, moonViewDir ), 0.0, 1.0 );

    // Reconstruct the Sun's contribution to directDiffuse using the same
    // form three.js used internally (Lambert * lightColor * diffuseColor / pi),
    // INCLUDING the shadow factor that three.js applied inside the directional-
    // light loop. Without the shadow factor, the subtraction below would
    // over-remove light on shadowed pixels and could push directDiffuse
    // negative (eclipses, occultations).
    float moonSunShadowFactor = 1.0;
    #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
        // Match three.js's own call signature in <lights_fragment_begin>:
        // getShadow takes 6 args including shadowIntensity (3rd arg).
        moonSunShadowFactor = receiveShadow ? getShadow(
            directionalShadowMap[ 0 ],
            directionalLightShadows[ 0 ].shadowMapSize,
            directionalLightShadows[ 0 ].shadowIntensity,
            directionalLightShadows[ 0 ].shadowBias,
            directionalLightShadows[ 0 ].shadowRadius,
            vDirectionalShadowCoord[ 0 ]
        ) : 1.0;
    #endif
    vec3 moonSunDirectContribution = moonNdotL * directionalLights[0].color * moonSunShadowFactor
                                   * RECIPROCAL_PI * material.diffuseColor;

    // Start from the smooth-sphere visibility used by Current. Physical may
    // replace it with the displaced geometric normal in the narrow
    // terminator neighbourhood below. The Sun's angular half-radius
    // (~0.267 deg) supplies the final soft-step bandwidth.
    //
    // Physics scope: this is a multiplier on Lambert (irradiance times
    // visible-disk-area-fraction). The full disk-source irradiance is
    //   S(t) = t * f_geom(t) + (2/(3 pi)) * (1 - t^2)^(3/2)
    // The symmetric (2/(3 pi)) * (1 - t^2)^(3/2) disk-glow term in S(t)
    // lifts the dark side just past the terminator and is purely additive
    // on Lambert (Lambert is 0 there). It cannot be expressed as a
    // multiplier; an earlier add-back attempt produced cement-band
    // artifacts and is omitted. See docs/research/moon-rendering/
    // 01-solar-disk-physics.md sections 2.6 and Appendix B.
    float moonSmoothRawNdotLForVis = dot( normalize( nonPerturbedNormal ), moonLightDir );
    float moonSmoothNdotL = clamp( moonSmoothRawNdotLForVis, 0.0, 1.0 );
    bool moonPhysicalModelActive = uMoonPhysicalModelBlend > 0.5;
    // A raised point just behind the smooth terminator can see the Sun only
    // when its outgoing ray clears the base lunar sphere. This position-based
    // horizon test admits real high terrain without allowing a merely
    // sun-facing normal to see through the Moon.
    float moonMacroscopicRawNdotLForVis = moonSmoothRawNdotLForVis;
#if defined( USE_DISPLACEMENTMAP )
    if ( moonPhysicalModelActive ) {
        float moonDisplacedRadiusView = max(
            length( vMoonDisplacedFromCenterView ),
            max( vMoonBaseRadiusView, 1e-6 )
        );
        float moonBaseToDisplacedRatio = clamp(
            vMoonBaseRadiusView / moonDisplacedRadiusView,
            0.0,
            1.0
        );
        float moonSunFromRadialAngle = acos( clamp(
            dot( normalize( vMoonDisplacedFromCenterView ), moonLightDir ),
            -1.0,
            1.0
        ) );
        float moonRaisedHorizonAngle = 3.141592653589793
            - asin( moonBaseToDisplacedRatio );
        moonMacroscopicRawNdotLForVis = sin(
            moonRaisedHorizonAngle - moonSunFromRadialAngle
        );
    }
#endif
    float moonTerrainHorizonLift = 0.0;
    float moonFinalCavityDarkenFromHeight = 0.0;

#if defined( USE_DISPLACEMENTMAP ) || defined( USE_NORMALMAP )
    #if defined( USE_DISPLACEMENTMAP )
        vec2 moonHeightUv = vDisplacementMapUv;
    #else
        vec2 moonHeightUv = vNormalMapUv;
    #endif
    vec2 moonCavityStep = uMoonHeightTexelSize * max( 1.0, uMoonTerrainShadowTexelStride * 1.6 );
    float moonCenterHeight = texture2D( uMoonHeightMap, moonHeightUv ).r;
    float moonAxisHeightAverage = (
        texture2D( uMoonHeightMap, moonHeightUv + vec2( moonCavityStep.x, 0.0 ) ).r +
        texture2D( uMoonHeightMap, moonHeightUv - vec2( moonCavityStep.x, 0.0 ) ).r +
        texture2D( uMoonHeightMap, moonHeightUv + vec2( 0.0, moonCavityStep.y ) ).r +
        texture2D( uMoonHeightMap, moonHeightUv - vec2( 0.0, moonCavityStep.y ) ).r
    ) * 0.25;
    float moonDiagonalHeightAverage = (
        texture2D( uMoonHeightMap, moonHeightUv + moonCavityStep ).r +
        texture2D( uMoonHeightMap, moonHeightUv - moonCavityStep ).r +
        texture2D( uMoonHeightMap, moonHeightUv + vec2( moonCavityStep.x, -moonCavityStep.y ) ).r +
        texture2D( uMoonHeightMap, moonHeightUv + vec2( -moonCavityStep.x, moonCavityStep.y ) ).r
    ) * 0.25;
    float moonNeighborHeightAverage = mix( moonAxisHeightAverage, moonDiagonalHeightAverage, 0.45 );
    float moonTerrainProminence = max( 0.0, moonCenterHeight - moonNeighborHeightAverage );
    float moonTerrainProminenceWeight = smoothstep( 0.0022, 0.012, moonTerrainProminence );
    float moonTerminatorVisibilityBand = 1.0 - smoothstep( 0.015, 0.13, moonSmoothRawNdotLForVis );
    float moonSunwardFacetWeight = smoothstep( 0.0, 0.045, moonNdotL );
    // Raised coherent terrain can see over the smooth spherical horizon near
    // the terminator. Using prominence against an 8-neighbour average avoids
    // letting normal-map grain create a uniform glow band.
    moonTerrainHorizonLift = clamp(
        moonTerrainProminence * moonTerrainProminenceWeight * moonTerminatorVisibilityBand * moonSunwardFacetWeight * 4.8,
        0.0,
        0.038
    ) * step( 0.0001, uMoonTerrainReliefStrength );

    float moonCavityBand = smoothstep( 0.018, 0.10, moonSmoothNdotL )
        * ( 1.0 - smoothstep( 0.24, 0.42, moonSmoothNdotL ) );
    float moonTerrainCavity = max( 0.0, moonNeighborHeightAverage - moonCenterHeight );
    // Threshold above the LDEM noise floor (~0.0005 normalized) so micro-bumps
    // don't read as shadows. Real crater bowls show up above 0.0015.
    float moonCavityOcclusion = smoothstep( 0.0015, 0.0085, moonTerrainCavity )
        * moonCavityBand
        * uMoonTerrainReliefStrength;
    // Soft basin shading only — the sun-direction-aware march carries the drama.
    moonFinalCavityDarkenFromHeight = clamp( moonCavityOcclusion * 0.10, 0.0, 0.18 );
#endif

    float moonCurrentRawNdotLForVis = moonSmoothRawNdotLForVis + moonTerrainHorizonLift;
    float moonEffectiveRawNdotLForVis = mix(
        moonCurrentRawNdotLForVis,
        moonMacroscopicRawNdotLForVis,
        clamp( uMoonPhysicalModelBlend, 0.0, 1.0 )
    );
    float moonSunVisibility = moonSunDiskVisibleFraction( moonEffectiveRawNdotLForVis );

    // Isolate earthshine. directDiffuse currently holds the Sun's
    // shadow-attenuated contribution PLUS earthshine from directionalLights[1]
    // (MOON_REFLECTED_LIGHT_LAYER). Save earthshine separately so the entire
    // chain of Sun-side terminator multipliers below (LS blend, terminatorContrast,
    // shadowTone * highlightTone, localReliefTone, cavity AO, terrainShadow,
    // moonFinalShadowCrush) operates ONLY on the Sun's contribution and does
    // not crush earthshine on the dark side — earthshine peaks on crescent
    // phases, exactly where the Sun is being suppressed. max(...,0.0) guards
    // floating-point precision in the reconstruction.
    moonEarthshineDirectKept = max( reflectedLight.directDiffuse - moonSunDirectContribution, vec3(0.0) );
    reflectedLight.directDiffuse = moonSunDirectContribution * moonSunVisibility;

    float moonLsScale = 1.0;
    if ( moonNdotL > 1e-4 ) {
        float moonLs = moonNdotL / max( moonNdotL + moonNdotV, 1e-4 );
        moonLsScale = moonLs / moonNdotL;
    } else {
        moonLsScale = 0.0;
    }
    moonLsScale = clamp( moonLsScale, min(uMoonLsClampMin, uMoonLsClampMax), max(uMoonLsClampMin, uMoonLsClampMax) );
    reflectedLight.directDiffuse *= mix( 1.0, moonLsScale, uMoonLsBlend );

    float moonPhaseAlignment = clamp( dot( moonLightDir, moonViewDir ), 0.0, 1.0 );
    float moonOpposition = pow( moonPhaseAlignment, 18.0 ) * uMoonOppositionStrength;
    diffuseColor.rgb *= ( 1.0 + moonOpposition );

    // Keep terminator contrast as a light touch only. Lambert already supplies
    // the physical falloff; a full NdotL^contrast multiplier made basins like
    // Hertzsprung drop into darkness several degrees before the real photo.
    float moonTerminatorScaleRaw = pow( max( moonNdotL, 1e-4 ), max( 1.0, uMoonTerminatorContrast ) - 1.0 );
    float moonTerminatorScale = mix( 1.0, moonTerminatorScaleRaw, 0.42 );
    moonTerminatorScale = mix( 1.0, moonTerminatorScale, clamp( uMoonTerminatorContrastBlend, 0.0, 1.0 ) );
    reflectedLight.directDiffuse *= moonTerminatorScale;

    float moonTerminatorReliefBoost = max( 0.0, uMoonTerminatorContrast - 1.0 ) * max( 0.0, uMoonTerminatorReliefStrength );
    float moonReliefBandT = clamp( ( uMoonTerminatorReliefStrength - 1.0 ) / 6.5, 0.0, 1.0 );
    float moonTerminatorOuter = mix( 0.42, 0.28, moonReliefBandT );
    float moonTerminatorBand = 1.0 - smoothstep( 0.06, moonTerminatorOuter, moonNdotL );
    float moonTerrainReliefBand = 1.0 - smoothstep( 0.025, max( moonTerminatorOuter, 0.20 ), moonSmoothNdotL );
    moonShadowWeight = pow( 1.0 - moonNdotL, max(0.2, uMoonShadowWeightExponent) );
    float moonHighlightWeight = pow( moonNdotL, max(0.2, uMoonHighlightWeightExponent) );
    float moonShadowCrush = mix( 0.18, 0.24, moonReliefBandT ) * moonTerminatorReliefBoost * moonTerminatorBand;
    float moonHighlightLift = mix( 0.04, 0.055, moonReliefBandT ) * moonTerminatorReliefBoost * moonTerminatorBand;
    float moonShadowTarget = max( clamp( uMoonTerminatorShadowFloor, 0.0, 1.0 ), 1.0 + uMoonShadowLift - moonShadowCrush );
    float moonHighlightTarget = uMoonHighlightBoost + moonHighlightLift;
    float moonShadowTone = mix( 1.0, moonShadowTarget, moonShadowWeight );
    float moonHighlightTone = mix( 1.0, moonHighlightTarget, moonHighlightWeight );
    vec3 moonToneMultiplier = vec3( moonShadowTone * moonHighlightTone );
    reflectedLight.directDiffuse *= moonToneMultiplier;

    float moonLocalReliefDelta = moonNdotL - moonSmoothNdotL;
    float moonLocalReliefTone = 1.0 + moonTerrainReliefBand
        * uMoonTerrainReliefStrength
        * clamp( moonLocalReliefDelta * 3.6, -0.34, 0.0 );
    reflectedLight.directDiffuse *= clamp( moonLocalReliefTone, 0.48, 1.0 );

    moonFinalCavityDarken = moonFinalCavityDarkenFromHeight;
    reflectedLight.directDiffuse *= 1.0 - moonFinalCavityDarkenFromHeight;
    reflectedLight.indirectDiffuse *= 1.0 - moonFinalCavityDarkenFromHeight * 0.50;

#if defined( USE_NORMALMAP_TANGENTSPACE )
    vec3 moonLightTangent = vec3(
        dot( moonLightDir, tbn[0] ),
        dot( moonLightDir, tbn[1] ),
        dot( moonLightDir, tbn[2] )
    );
    float moonLightTangentPlanarLength = length( moonLightTangent.xy );
    float moonTerrainSelfShadow = 0.0;
    if ( uMoonTerrainShadowStrength > 0.0 && moonLightTangentPlanarLength > 1e-4 && moonLightTangent.z > 0.0 ) {
        vec2 moonLightUvStep = ( moonLightTangent.xy / moonLightTangentPlanarLength )
            * uMoonHeightTexelSize
            * max( 0.5, uMoonTerrainShadowTexelStride );
        float moonBaseHeight = texture2D( uMoonHeightMap, moonHeightUv ).r;
        float moonSunSlope = max( moonLightTangent.z, 0.0 ) / max( moonLightTangentPlanarLength, 1e-4 );
        float moonSlopeScale = max( 0.0002, uMoonTerrainShadowSlopeBias );
        float moonHorizonShadow = 0.0;
        for ( int moonSampleIndex = 1; moonSampleIndex <= 12; moonSampleIndex += 1 ) {
            if ( float( moonSampleIndex ) > uMoonTerrainShadowSamples ) {
                break;
            }
            float moonSampleDistance = float( moonSampleIndex );
            float moonSampleHeight = texture2D( uMoonHeightMap, moonHeightUv + moonLightUvStep * moonSampleDistance ).r;
            float moonRequiredRise = moonSunSlope * moonSlopeScale * moonSampleDistance * 7.0;
            float moonBlockerRise = moonSampleHeight - moonBaseHeight - moonRequiredRise;
            float moonShadowRiseStart = moonPhysicalModelActive ? 0.0007 : 0.0012;
            float moonShadowRiseFull = moonPhysicalModelActive ? 0.0045 : 0.0065;
            float moonSampleShadow = smoothstep(
                moonShadowRiseStart,
                moonShadowRiseFull,
                moonBlockerRise
            );
            moonHorizonShadow = max( moonHorizonShadow, moonSampleShadow );
        }
        // Compare blocker height against the Sun's local slope instead of a
        // tiny absolute height threshold. This keeps random height-map specks
        // from becoming lit/dark pinholes while preserving long low-Sun
        // crater-rim shadows near the terminator.
        moonTerrainSelfShadow = moonHorizonShadow;
    }
    // Confine the self-shadow strictly to the terminator-adjacent band:
    // moonTerrainReliefBand = 1 at terminator, 0 by NdotL > 0.20, so noise on
    // the lit side cannot produce phantom shadows. Inside the band, give it more
    // headroom (pow 1.4 vs 2.0) so cast-shadow plumes extend visibly inward.
    float moonTerrainShadowBandCurrent = moonTerrainReliefBand
        * pow( 1.0 - moonSmoothNdotL, 1.4 );
    // Cast shadows are a low-Sun phenomenon. The raw height march is noisy
    // at high incidence angles, where tiny DEM variations should not read as
    // broad dark patches. Fade the physical path continuously with solar
    // elevation instead of applying the horizon mask across the full disc.
    float moonTerrainShadowBand = moonTerrainShadowBandCurrent;
    if ( moonPhysicalModelActive ) {
        moonTerrainShadowBand = pow(
            clamp( 1.0 - moonSmoothNdotL, 0.0, 1.0 ),
            8.0
        );
    }
    float moonTerrainShadow = clamp(
        moonTerrainSelfShadow * moonTerrainShadowBand * uMoonTerrainShadowStrength,
        0.0,
        0.78
    );
    reflectedLight.directDiffuse *= 1.0 - moonTerrainShadow;
#endif
#endif
    reflectedLight.indirectDiffuse += diffuseColor.rgb * ( uMoonShadowLift * moonShadowWeight * 0.72 );`,
            )
            .replace(
                "vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;",
                `vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
#if NUM_DIR_LIGHTS > 0
    float moonFinalTerrainTone = clamp( 1.0 - moonFinalCavityDarken * 0.40, 0.55, 1.0 );
    // Dark-side base crush for residual indirect light. Keep this narrow:
    // the previous 0.22 upper edge reached about 13 degrees into the sunlit
    // hemisphere and erased the faint but visible terrain beside the terminator.
    float moonFinalShadowCrush = mix(
        0.18,
        1.0,
        smoothstep( -MOON_SUN_SIN_ALPHA, 0.025, moonEffectiveRawNdotLForVis )
    );
    moonFinalShadowCrush = mix( 1.0, moonFinalShadowCrush, clamp( uMoonShadowCrushBlend, 0.0, 1.0 ) );
    outgoingLight *= moonFinalTerrainTone * moonFinalShadowCrush;

    // Restore earthshine, held separately so it bypasses the Sun-side
    // terminator multipliers and the dark-side shadow crush. Cavity AO
    // (moonFinalTerrainTone) DOES apply because crater bowls darken any
    // direct light source; moonFinalShadowCrush does NOT — that crush is a
    // Sun-side darkness baseline, and earthshine is the explicit reason the
    // dark side isn't entirely black on crescent phases.
    outgoingLight += moonEarthshineDirectKept * moonFinalTerrainTone * clamp( uMoonEarthshineBlend, 0.0, 1.0 );
    if ( moonPhysicalModelActive ) {
        vec3 moonPhysicalExposedRadiance = max(
            outgoingLight * max( 0.0, uMoonPhysicalExposure ),
            vec3( 0.0 )
        );
        vec3 moonPhysicalCompressedRadiance = pow(
            moonPhysicalExposedRadiance,
            vec3( max( 0.01, uMoonPhysicalToneGamma ) )
        );
        float moonPhysicalToneWeight = pow(
            clamp( 1.0 - moonSmoothNdotL, 0.0, 1.0 ),
            1.6
        );
        outgoingLight = mix(
            moonPhysicalExposedRadiance,
            moonPhysicalCompressedRadiance,
            moonPhysicalToneWeight
        );
    }
    outgoingLight = mix(
        outgoingLight,
        vec3( step( 0.0001, dot( normalize( vMoonGeometricNormalView ), moonLightDir ) ) ),
        clamp( uMoonGeometricMask, 0.0, 1.0 )
    );
#endif`,
            )
            .replace(
                "#include <lights_fragment_end>",
                `#include <lights_fragment_end>
#if NUM_DIR_LIGHTS > 0
    vec3 moonOcclusionNormal = normalize( geometryNormal );
    vec3 moonOcclusionLightDir = normalize( directionalLights[0].direction );
    float moonOcclusionNdotL = clamp( dot( moonOcclusionNormal, moonOcclusionLightDir ), 0.0, 1.0 );
    float moonOcclusionBand = 1.0 - smoothstep( 0.08, 0.42, moonOcclusionNdotL );
    float moonOcclusionWeight = pow( 1.0 - moonOcclusionNdotL, max(0.2, uMoonShadowWeightExponent) ) * moonOcclusionBand;
    float moonIndirectOcclusion = 1.0 - clamp( uMoonTerminatorIndirectOcclusion, 0.0, 1.0 ) * moonOcclusionWeight;
    reflectedLight.indirectDiffuse *= moonIndirectOcclusion;
#endif`,
            );
    };

    material.customProgramCacheKey = () => {
        const data = material.userData || {};
        return [
            "moon-photometric-v34-physical-blocker-threshold",
            data.moonLsBlend,
            data.moonOppositionStrength,
            data.moonLsClampMin,
            data.moonLsClampMax,
            data.moonShadowLift,
            data.moonHighlightBoost,
            data.moonShadowWeightExponent,
            data.moonHighlightWeightExponent,
            data.moonTerminatorContrast,
            data.moonTerminatorContrastBlend,
            data.moonTerminatorReliefStrength,
            data.moonTerminatorShadowFloor,
            data.moonTerminatorIndirectOcclusion,
            data.moonTerrainShadowStrength,
            data.moonTerrainReliefStrength,
            data.moonTerrainShadowTexelStride,
            data.moonTerrainShadowSlopeBias,
            data.moonTerrainShadowSamples,
            data.moonEarthshineBlend,
            data.moonShadowCrushBlend,
            data.moonGeometricMask,
            data.moonPhysicalModelBlend,
            data.moonPhysicalExposure,
            data.moonPhysicalToneGamma,
        ].join("-");
    };

    material.userData.refreshMoonShaderUniforms = () => {
        const shaderMap = material.userData?.moonPhotometricShaders;
        const shaders = shaderMap instanceof Map
            ? Array.from(shaderMap.values())
            : [material.userData?.moonPhotometricShader].filter(Boolean);
        if (shaders.length === 0) {
            return;
        }
        const lsBlend = Number(material.userData.moonLsBlend);
        const opposition = Number(material.userData.moonOppositionStrength);
        const lsClampMin = Number(material.userData.moonLsClampMin);
        const lsClampMax = Number(material.userData.moonLsClampMax);
        const shadowLift = Number(material.userData.moonShadowLift);
        const highlightBoost = Number(material.userData.moonHighlightBoost);
        const shadowWeightExponent = Number(material.userData.moonShadowWeightExponent);
        const highlightWeightExponent = Number(material.userData.moonHighlightWeightExponent);
        const terminatorContrast = Number(material.userData.moonTerminatorContrast);
        const terminatorContrastBlend = Number(material.userData.moonTerminatorContrastBlend);
        const terminatorReliefStrength = Number(material.userData.moonTerminatorReliefStrength);
        const terminatorShadowFloor = Number(material.userData.moonTerminatorShadowFloor);
        const terminatorIndirectOcclusion = Number(material.userData.moonTerminatorIndirectOcclusion);
        const terrainShadowStrength = material.displacementMap
            ? Number(material.userData.moonTerrainShadowStrength)
            : 0.0;
        const terrainReliefStrength = material.displacementMap
            ? Number(material.userData.moonTerrainReliefStrength)
            : 0.0;
        const terrainShadowTexelStride = Number(material.userData.moonTerrainShadowTexelStride);
        const terrainShadowSlopeBias = Number(material.userData.moonTerrainShadowSlopeBias);
        const terrainShadowSamples = Number(material.userData.moonTerrainShadowSamples);
        const earthshineBlend = Number(material.userData.moonEarthshineBlend);
        const shadowCrushBlend = Number(material.userData.moonShadowCrushBlend);
        const geometricMask = Number(material.userData.moonGeometricMask);
        const physicalModelBlend = Number(material.userData.moonPhysicalModelBlend);
        const physicalExposure = Number(material.userData.moonPhysicalExposure);
        const physicalToneGamma = Number(material.userData.moonPhysicalToneGamma);
        for (const shader of shaders) {
            if (!shader?.uniforms) continue;
            if (Number.isFinite(lsBlend) && shader.uniforms.uMoonLsBlend) {
                shader.uniforms.uMoonLsBlend.value = lsBlend;
            }
            if (Number.isFinite(opposition) && shader.uniforms.uMoonOppositionStrength) {
                shader.uniforms.uMoonOppositionStrength.value = opposition;
            }
            if (Number.isFinite(lsClampMin) && shader.uniforms.uMoonLsClampMin) {
                shader.uniforms.uMoonLsClampMin.value = lsClampMin;
            }
            if (Number.isFinite(lsClampMax) && shader.uniforms.uMoonLsClampMax) {
                shader.uniforms.uMoonLsClampMax.value = lsClampMax;
            }
            if (Number.isFinite(shadowLift) && shader.uniforms.uMoonShadowLift) {
                shader.uniforms.uMoonShadowLift.value = shadowLift;
            }
            if (Number.isFinite(highlightBoost) && shader.uniforms.uMoonHighlightBoost) {
                shader.uniforms.uMoonHighlightBoost.value = highlightBoost;
            }
            if (Number.isFinite(shadowWeightExponent) && shader.uniforms.uMoonShadowWeightExponent) {
                shader.uniforms.uMoonShadowWeightExponent.value = shadowWeightExponent;
            }
            if (Number.isFinite(highlightWeightExponent) && shader.uniforms.uMoonHighlightWeightExponent) {
                shader.uniforms.uMoonHighlightWeightExponent.value = highlightWeightExponent;
            }
            if (Number.isFinite(terminatorContrast) && shader.uniforms.uMoonTerminatorContrast) {
                shader.uniforms.uMoonTerminatorContrast.value = terminatorContrast;
            }
            if (Number.isFinite(terminatorContrastBlend) && shader.uniforms.uMoonTerminatorContrastBlend) {
                shader.uniforms.uMoonTerminatorContrastBlend.value = terminatorContrastBlend;
            }
            if (Number.isFinite(terminatorReliefStrength) && shader.uniforms.uMoonTerminatorReliefStrength) {
                shader.uniforms.uMoonTerminatorReliefStrength.value = terminatorReliefStrength;
            }
            if (Number.isFinite(terminatorShadowFloor) && shader.uniforms.uMoonTerminatorShadowFloor) {
                shader.uniforms.uMoonTerminatorShadowFloor.value = terminatorShadowFloor;
            }
            if (Number.isFinite(terminatorIndirectOcclusion) && shader.uniforms.uMoonTerminatorIndirectOcclusion) {
                shader.uniforms.uMoonTerminatorIndirectOcclusion.value = terminatorIndirectOcclusion;
            }
            if (shader.uniforms.uMoonHeightMap) {
                shader.uniforms.uMoonHeightMap.value = material.displacementMap || null;
            }
            if (shader.uniforms.uMoonHeightTexelSize && material.userData.moonHeightTexelSize) {
                shader.uniforms.uMoonHeightTexelSize.value.copy?.(material.userData.moonHeightTexelSize);
            }
            if (Number.isFinite(terrainShadowStrength) && shader.uniforms.uMoonTerrainShadowStrength) {
                shader.uniforms.uMoonTerrainShadowStrength.value = terrainShadowStrength;
            }
            if (Number.isFinite(terrainReliefStrength) && shader.uniforms.uMoonTerrainReliefStrength) {
                shader.uniforms.uMoonTerrainReliefStrength.value = terrainReliefStrength;
            }
            if (Number.isFinite(terrainShadowTexelStride) && shader.uniforms.uMoonTerrainShadowTexelStride) {
                shader.uniforms.uMoonTerrainShadowTexelStride.value = terrainShadowTexelStride;
            }
            if (Number.isFinite(terrainShadowSlopeBias) && shader.uniforms.uMoonTerrainShadowSlopeBias) {
                shader.uniforms.uMoonTerrainShadowSlopeBias.value = terrainShadowSlopeBias;
            }
            if (Number.isFinite(terrainShadowSamples) && shader.uniforms.uMoonTerrainShadowSamples) {
                shader.uniforms.uMoonTerrainShadowSamples.value = terrainShadowSamples;
            }
            if (Number.isFinite(earthshineBlend) && shader.uniforms.uMoonEarthshineBlend) {
                shader.uniforms.uMoonEarthshineBlend.value = earthshineBlend;
            }
            if (Number.isFinite(shadowCrushBlend) && shader.uniforms.uMoonShadowCrushBlend) {
                shader.uniforms.uMoonShadowCrushBlend.value = shadowCrushBlend;
            }
            if (Number.isFinite(geometricMask) && shader.uniforms.uMoonGeometricMask) {
                shader.uniforms.uMoonGeometricMask.value = geometricMask;
            }
            if (Number.isFinite(physicalModelBlend) && shader.uniforms.uMoonPhysicalModelBlend) {
                shader.uniforms.uMoonPhysicalModelBlend.value = physicalModelBlend;
            }
            if (Number.isFinite(physicalExposure) && shader.uniforms.uMoonPhysicalExposure) {
                shader.uniforms.uMoonPhysicalExposure.value = physicalExposure;
            }
            if (Number.isFinite(physicalToneGamma) && shader.uniforms.uMoonPhysicalToneGamma) {
                shader.uniforms.uMoonPhysicalToneGamma.value = physicalToneGamma;
            }
        }
    };
}

export class MoonRenderer {
    /**
     * @param {number} radius - Moon radius in scene units
     */
    constructor(radius) {
        this.radius = radius;

        // Container and meshes
        this.container = null;
        this.mesh = null;
        this.axis = null;
        this.axisVector = null;  // Normalized axis direction
        this.northPoleSphere = null;
        this.southPoleSphere = null;
        this.latLonGrid = null;
        this.latLonLabels = null;
        this.latLonHoverLabel = null;
        this.latLonGridStepDegrees = MOON_LAT_LON_GRID_DEFAULT_STEP_DEGREES;
        this.latLonGridVisible = false;
        this.latLonLabelsVisible = true;
        this.latLonHoverEnabled = false;
        this.latLonRaycaster = new THREE.Raycaster();
        this.latLonPointerNdc = new THREE.Vector2();
        this.latLonHoverPoint = new THREE.Vector3();

        // Textures (set externally before create())
        this.texture = null;
        this.displacementMap = null;
        this.normalMap = null;
        this.generatedNormalMap = null;
        this.renderSettings = { ...DEFAULT_MOON_RENDER_SETTINGS };
        this.renderPipeline = normalizeMoonRenderPipelineState();
    }

    _buildGeneratedNormalMap() {
        return (this.renderPipeline.generatedNormalMap && !this.normalMap && this._hasUsableDem())
            ? buildMoonNormalMapFromHeightTexture(this.displacementMap, this.renderSettings)
            : null;
    }

    _hasUsableDem() {
        const width = Number(this.displacementMap?.image?.width);
        const height = Number(this.displacementMap?.image?.height);
        return Number.isFinite(width) && width > 1 && Number.isFinite(height) && height > 1;
    }

    _refreshGeneratedNormalMap({ disposePrevious = true } = {}) {
        const previousGeneratedNormalMap = this.generatedNormalMap;
        this.generatedNormalMap = this._buildGeneratedNormalMap();

        if (
            disposePrevious &&
            previousGeneratedNormalMap &&
            previousGeneratedNormalMap !== this.generatedNormalMap &&
            previousGeneratedNormalMap !== this.normalMap &&
            previousGeneratedNormalMap !== this.displacementMap &&
            previousGeneratedNormalMap !== this.texture
        ) {
            previousGeneratedNormalMap.dispose?.();
        }

        return this._resolveNormalMap();
    }

    _resolveNormalMap() {
        if (!this.renderPipeline.generatedNormalMap) {
            return null;
        }
        return this.normalMap || this.generatedNormalMap || null;
    }

    _resolveGeometrySegments() {
        return {
            width: THREE.MathUtils.clamp(
                Math.round(this.renderSettings.geometryWidthSegments),
                32,
                1024,
            ),
            height: THREE.MathUtils.clamp(
                Math.round(this.renderSettings.geometryHeightSegments),
                16,
                512,
            ),
        };
    }

    _createMoonGeometry() {
        const segments = this._resolveGeometrySegments();
        return new THREE.SphereGeometry(this.radius, segments.width, segments.height);
    }

    _refreshMoonGeometry() {
        const geometry = this.mesh?.geometry;
        if (!geometry) return false;
        const segments = this._resolveGeometrySegments();
        if (
            geometry.parameters?.widthSegments === segments.width &&
            geometry.parameters?.heightSegments === segments.height
        ) {
            return false;
        }
        this.mesh.geometry = this._createMoonGeometry();
        geometry.dispose?.();
        return true;
    }

    _applyPipelineMapsToMaterial() {
        const material = this.mesh?.material;
        if (!material) {
            return;
        }
        const resolvedNormalMap = this._resolveNormalMap();
        const resolvedDisplacementMap = this.renderPipeline.displacement && this._hasUsableDem()
            ? (this.displacementMap || null)
            : null;
        const resolvedBumpMap = this.renderPipeline.generatedNormalMap && !resolvedNormalMap && this._hasUsableDem()
            ? (this.displacementMap || null)
            : null;

        material.map = this.renderPipeline.colorTexture ? (this.texture || null) : null;
        material.color?.setHex?.(this.renderPipeline.colorTexture ? 0xffffff : 0x8f969e);
        material.displacementMap = resolvedDisplacementMap;
        material.normalMap = resolvedNormalMap;
        material.bumpMap = resolvedBumpMap;
        material.bumpScale = resolvedBumpMap ? 0.0045 : 0.0;
        material.needsUpdate = true;
    }

    _applyRenderSettingsToMaterial() {
        const material = this.mesh?.material;
        if (!material) {
            return;
        }

        applyMoonRenderSettingsToMaterial(
            material,
            resolvePipelineRenderSettings(this.renderSettings, this.renderPipeline),
        );
        applyMoonPipelineStagesToMaterial(material, this.renderSettings, this.renderPipeline);
        material.userData.moonEarthshineBlend = this.renderPipeline.earthshine ? 1.0 : 0.0;
        material.userData?.refreshMoonShaderUniforms?.();
        material.needsUpdate = true;
    }

    /**
     * Set textures before creating Moon
     * @param {THREE.Texture} texture - Moon surface texture
     * @param {THREE.Texture} displacementMap - Displacement/bump map
     * @param {THREE.Texture|null} normalMap - Optional normal map
     */
    setTextures(texture, displacementMap, normalMap = null) {
        this.texture = texture;
        this.displacementMap = displacementMap;
        this.normalMap = normalMap;
    }

    setRenderSettings(renderSettings = null) {
        this.renderSettings = normalizeMoonRenderSettings(renderSettings);
        // Skip the heavy generated-normal-map rebuild when there is no
        // material to apply it to yet. Before create() runs, the mesh is null,
        // and create() (or its caller) decides when to build the normal map —
        // either synchronously inside create(), or deferred through
        // refreshGeneratedNormalMap on idle. Calling _refreshGeneratedNormalMap
        // unconditionally here was defeating { deferGeneratedNormalMap: true }
        // on create(), so the expensive ~300-500ms build was still landing on
        // the first-frame path even with the defer flag set.
        const material = this.mesh?.material;
        if (!material) {
            return;
        }

        this._refreshMoonGeometry();
        this._refreshGeneratedNormalMap({ disposePrevious: true });
        this._applyPipelineMapsToMaterial();
        this._applyRenderSettingsToMaterial();
    }

    setRenderPipeline(pipelineState = null) {
        this.renderPipeline = normalizeMoonRenderPipelineState(pipelineState);
        const material = this.mesh?.material;
        if (material && this.renderPipeline.generatedNormalMap && !this.generatedNormalMap && !this.normalMap && this._hasUsableDem()) {
            this._refreshGeneratedNormalMap({ disposePrevious: true });
        }
        this._applyPipelineMapsToMaterial();
        this._applyRenderSettingsToMaterial();
    }

    unregisterShaderRenderer(renderer) {
        const shaderMap = this.mesh?.material?.userData?.moonPhotometricShaders;
        return shaderMap instanceof Map ? shaderMap.delete(renderer) : false;
    }

    /**
     * Update Moon textures after creation.
     * @param {THREE.Texture} texture
     * @param {THREE.Texture} displacementMap
     * @param {THREE.Texture|null} normalMap
     * @param {{ disposePrevious?: boolean }} options
     */
    updateTextures(
        texture,
        displacementMap,
        normalMap = null,
        { disposePrevious = true, renderSettings = null, deferGeneratedNormalMap = false } = {},
    ) {
        const previousTexture = this.texture;
        const previousDisplacementMap = this.displacementMap;
        const previousNormalMap = this.normalMap;
        const previousGeneratedNormalMap = this.generatedNormalMap;

        if (renderSettings) {
            this.renderSettings = normalizeMoonRenderSettings(renderSettings);
        }

        this.texture = texture;
        this.displacementMap = displacementMap;
        this.normalMap = normalMap;

        if (!this._hasUsableDem() && !this.normalMap) {
            this.generatedNormalMap = null;
        }

        if (this.renderPipeline.generatedNormalMap && this._hasUsableDem() && !deferGeneratedNormalMap) {
            this._refreshGeneratedNormalMap({ disposePrevious: false });
        }
        if (!this.renderPipeline.generatedNormalMap) {
            this.generatedNormalMap = null;
        }
        const material = this.mesh?.material;
        if (material) {
            this._refreshMoonGeometry();
            this._applyPipelineMapsToMaterial();
            this._applyRenderSettingsToMaterial();
        }

        if (disposePrevious) {
            if (previousTexture && previousTexture !== this.texture) {
                previousTexture.dispose?.();
            }
            if (
                previousDisplacementMap &&
                previousDisplacementMap !== this.displacementMap &&
                previousDisplacementMap !== this.texture
            ) {
                previousDisplacementMap.dispose?.();
            }
            if (
                previousNormalMap &&
                previousNormalMap !== this.normalMap &&
                previousNormalMap !== this.displacementMap &&
                previousNormalMap !== this.texture &&
                previousNormalMap !== this.generatedNormalMap
            ) {
                previousNormalMap.dispose?.();
            }
            if (
                previousGeneratedNormalMap &&
                previousGeneratedNormalMap !== this.generatedNormalMap &&
                previousGeneratedNormalMap !== this.normalMap &&
                previousGeneratedNormalMap !== this.displacementMap &&
                previousGeneratedNormalMap !== this.texture
            ) {
                previousGeneratedNormalMap.dispose?.();
            }
        }
    }

    refreshGeneratedNormalMap({ disposePrevious = true } = {}) {
        const resolvedNormalMap = this._refreshGeneratedNormalMap({ disposePrevious });
        const material = this.mesh?.material;
        if (!material) {
            return resolvedNormalMap;
        }
        this._applyPipelineMapsToMaterial();
        this._applyRenderSettingsToMaterial();
        return resolvedNormalMap;
    }

    /**
     * Create Moon with axis and poles.
     *
     * @param {boolean} axisVisible - Initial visibility of polar axis
     * @param {boolean} polesVisible - Initial visibility of pole markers
     * @param {Object} [options]
     * @param {boolean} [options.deferGeneratedNormalMap=false]
     *        When true, skip the synchronous normal-map build at create() time
     *        and let the moon initially render with the runtime bumpMap
     *        fallback. The caller is responsible for invoking
     *        refreshGeneratedNormalMap() asynchronously (typically via
     *        requestIdleCallback) so the upgrade happens off the critical
     *        first-frame path. The normal-map build allocates and scans large
     *        canvas + Float32 buffers (~16M pixels at the 5760-wide quality
     *        profile), so deferring it can save ~300-500ms of main-thread
     *        time on initial mission load.
     */
    create(axisVisible = false, polesVisible = false, {
        deferGeneratedNormalMap = false,
        latLonGridVisible = false,
        latLonLabelsVisible = true,
        latLonHoverEnabled = false,
    } = {}) {
        // Create container (rotation handled separately by rotateMoon)
        this.container = new THREE.Group();

        // Moon sphere with displacement mapping
        if (this.renderPipeline.generatedNormalMap && !deferGeneratedNormalMap && !this.normalMap && this._hasUsableDem() && !this.generatedNormalMap) {
            this.generatedNormalMap = buildMoonNormalMapFromHeightTexture(this.displacementMap, this.renderSettings);
        }
        const resolvedNormalMap = this._resolveNormalMap();

        const geometry = this._createMoonGeometry();
        const material = new THREE.MeshStandardMaterial({
            map: this.renderPipeline.colorTexture ? this.texture : null,
            color: this.renderPipeline.colorTexture ? 0xffffff : 0x8f969e,
            bumpMap: this.renderPipeline.generatedNormalMap && !resolvedNormalMap && this._hasUsableDem() ? this.displacementMap : null,
            bumpScale: this.renderPipeline.generatedNormalMap && !resolvedNormalMap && this._hasUsableDem() ? 0.0045 : 0.0,
            displacementMap: this.renderPipeline.displacement && this._hasUsableDem() ? this.displacementMap : null,
            displacementScale: this.renderSettings.displacementScale,
            displacementBias: this.renderSettings.displacementBias,
            normalMap: resolvedNormalMap,
            normalScale: new THREE.Vector2(this.renderSettings.normalScale, this.renderSettings.normalScale),
            roughness: this.renderSettings.roughness,
            metalness: this.renderSettings.metalness,
            emissive: 0x000000,
            emissiveIntensity: 0.0
        });
        applyMoonRenderSettingsToMaterial(
            material,
            resolvePipelineRenderSettings(this.renderSettings, this.renderPipeline),
        );
        applyMoonPipelineStagesToMaterial(material, this.renderSettings, this.renderPipeline);
        material.userData.moonEarthshineBlend = this.renderPipeline.earthshine ? 1.0 : 0.0;
        applyMoonPhotometricShader(material);

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.onBeforeRender = () => {
            material.userData?.refreshMoonShaderUniforms?.();
        };
        this.mesh.receiveShadow = true;
        this.mesh.castShadow = true;
        this.mesh.frustumCulled = false;
        this.mesh.rotateX(Math.PI / 2);
        this.container.add(this.mesh);
        this.latLonGridVisible = Boolean(latLonGridVisible);
        this.latLonLabelsVisible = latLonLabelsVisible !== false;
        this.latLonHoverEnabled = Boolean(latLonHoverEnabled);
        this._createLatLonGrid({
            visible: this.latLonGridVisible,
            labelsVisible: this.latLonLabelsVisible,
            stepDegrees: this.latLonGridStepDegrees,
        });
        if (this.latLonGrid) {
            this.container.add(this.latLonGrid);
        }
        if (this.latLonLabels) {
            this.container.add(this.latLonLabels);
        }
        if (this.latLonHoverEnabled) {
            this._createLatLonHoverLabel();
        }
        if (this.latLonHoverLabel) {
            this.container.add(this.latLonHoverLabel);
        }

        // Avoid culling the container to prevent pop-in at extreme viewpoints
        this.container.frustumCulled = false;

        // Create axis and poles (not added to container yet - done by parent)
        this._createAxis(axisVisible);
        this._createPoles(polesVisible);
    }

    /**
     * Create polar axis line
     * @private
     */
    _createAxis(visible) {
        const poleScaleOuter = 1.5;
        const poleScaleInner = 1.02; // leave a gap inside the sphere
        const northOuter = new THREE.Vector3(0, 0, this.radius * poleScaleOuter);
        const northInner = new THREE.Vector3(0, 0, this.radius * poleScaleInner);
        const southInner = new THREE.Vector3(0, 0, -this.radius * poleScaleInner);
        const southOuter = new THREE.Vector3(0, 0, -this.radius * poleScaleOuter);

        // Store normalized axis vector for reference
        this.axisVector = northOuter.clone().normalize();

        const geometry = new THREE.BufferGeometry();
        const vertices = [
            northOuter.x, northOuter.y, northOuter.z, northInner.x, northInner.y, northInner.z,
            southInner.x, southInner.y, southInner.z, southOuter.x, southOuter.y, southOuter.z
        ];
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));

        const material = new THREE.LineBasicMaterial({ color: COL.MOON_AXIS, depthTest: true, depthWrite: false });
        this.axis = new THREE.LineSegments(geometry, material);
        this.axis.visible = visible;
    }

    /**
     * Create north and south pole markers
     * @private
     */
    _createPoles(visible) {
        const poleRadius = this.radius / 50;
        const poleGeometry = new THREE.SphereGeometry(poleRadius, 100, 100);

        // North pole
        const northMaterial = new THREE.MeshPhysicalMaterial({
            color: COL.BLACK,
            emissive: COL.NORTH_POLE,
            reflectivity: 0.0
        });
        this.northPoleSphere = new THREE.Mesh(poleGeometry, northMaterial);
        this.northPoleSphere.castShadow = false;
        this.northPoleSphere.receiveShadow = false;
        this.northPoleSphere.position.set(0, 0, 0.985 * this.radius);
        this.northPoleSphere.visible = visible;

        // South pole
        const southMaterial = new THREE.MeshPhysicalMaterial({
            color: COL.BLACK,
            emissive: COL.SOUTH_POLE,
            reflectivity: 0.0
        });
        this.southPoleSphere = new THREE.Mesh(poleGeometry, southMaterial);
        this.southPoleSphere.castShadow = false;
        this.southPoleSphere.receiveShadow = false;
        this.southPoleSphere.position.set(0, 0, -0.985 * this.radius);
        this.southPoleSphere.visible = visible;
    }

    /**
     * Create a selenographic latitude/longitude grid as a surface overlay.
     * The grid uses the Moon container's local +Z axis as lunar north, so it
     * follows the same IAU pole rotation as the texture, axis, and pole marks.
     * @private
     */
    _createLatLonGrid({
        visible = false,
        labelsVisible = true,
        stepDegrees = MOON_LAT_LON_GRID_DEFAULT_STEP_DEGREES,
    } = {}) {
        const normalizedStep = normalizeMoonLatLonGridStep(stepDegrees);
        this.latLonGridStepDegrees = normalizedStep;
        const gridRadius = this.radius * MOON_LAT_LON_GRID_RADIUS_SCALE;
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
        this.latLonGrid = gridGroup;
        this.latLonLabels = visible && labelsVisible
            ? this._createLatLonLabels({
                visible: true,
                stepDegrees: normalizedStep,
            })
            : null;
    }

    _createLatLonLabels({
        visible = false,
        stepDegrees = MOON_LAT_LON_GRID_DEFAULT_STEP_DEGREES,
    } = {}) {
        const labelGroup = new THREE.Group();
        labelGroup.name = "moon-lat-lon-labels";
        labelGroup.visible = visible;
        labelGroup.renderOrder = 4;

        const labelRadius = this.radius * MOON_LAT_LON_GRID_LABEL_RADIUS_SCALE;
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

    _createLatLonHoverLabel() {
        const sprite = createCanvasTextSprite(THREE, "0°N 0°E", {
            color: "#f8fbff",
            background: "rgba(7, 12, 20, 0.82)",
            border: "rgba(230, 245, 255, 0.62)",
            fontSize: 24,
            paddingX: 12,
            paddingY: 6,
        });
        if (!sprite) {
            this.latLonHoverLabel = null;
            return;
        }
        sprite.name = "moon-lat-lon-hover-label";
        sprite.visible = false;
        sprite.userData.basePixelHeight = 24;
        this.latLonHoverLabel = sprite;
    }

    /**
     * Add axis and poles to container
     * Called by parent after configuration is known
     */
    addAxisAndPolesToContainer() {
        if (this.container && this.axis) {
            this.container.add(this.axis);
        }
        if (this.container && this.northPoleSphere) {
            this.container.add(this.northPoleSphere);
        }
        if (this.container && this.southPoleSphere) {
            this.container.add(this.southPoleSphere);
        }
    }

    /**
     * Update Moon rotation based on current time
     * Uses IAU lunar pole model
     * @param {Date|number} time - Current animation time
     */
    updateRotation(time) {
        if (!this.container) return;

        const date = new Date(time);
        const lp = lunar_pole(date);
        const alpha = lp["alpha"];
        const delta = lp["delta"];
        const W = lp["W"];

        this.container.rotation.set(0, 0, 0);
        this.container.rotateX(-1 * PC.EARTH_AXIS_INCLINATION_RADS);
        this.container.rotateZ(+1 * (Math.PI / 2 + alpha));
        this.container.rotateX(+1 * (Math.PI / 2 - delta));
        this.container.rotateZ(+1 * W);
    }

    /**
     * Set visibility of polar axis
     * @param {boolean} visible
     */
    setAxisVisible(visible) {
        if (this.axis) {
            this.axis.visible = visible;
        }
    }

    /**
     * Set visibility of pole markers
     * @param {boolean} visible
     */
    setPolesVisible(visible) {
        if (this.northPoleSphere) {
            this.northPoleSphere.visible = visible;
        }
        if (this.southPoleSphere) {
            this.southPoleSphere.visible = visible;
        }
    }

    /**
     * Set visibility of the selenographic latitude/longitude grid.
     * @param {boolean} visible
     */
    setLatLonGridVisible(visible) {
        this.latLonGridVisible = Boolean(visible);
        this._syncLatLonOverlayVisibility();
    }

    setLatLonLabelsVisible(visible) {
        this.latLonLabelsVisible = Boolean(visible);
        this._syncLatLonOverlayVisibility();
    }

    setLatLonHoverEnabled(enabled) {
        this.latLonHoverEnabled = Boolean(enabled);
        if (this.latLonHoverEnabled && !this.latLonHoverLabel) {
            this._createLatLonHoverLabel();
            if (this.container && this.latLonHoverLabel) {
                this.container.add(this.latLonHoverLabel);
            }
        }
        if (!this.latLonHoverEnabled && this.latLonHoverLabel) {
            this.latLonHoverLabel.visible = false;
        }
    }

    _syncLatLonOverlayVisibility() {
        if (this.latLonGrid) {
            this.latLonGrid.visible = this.latLonGridVisible;
        }
        if (this.latLonGridVisible && this.latLonLabelsVisible && !this.latLonLabels) {
            this.rebuildLatLonGrid(this.latLonGridStepDegrees);
            return;
        }
        if (this.latLonLabels) {
            this.latLonLabels.visible = this.latLonGridVisible && this.latLonLabelsVisible;
        }
    }

    _disposeLatLonGridAndLabels() {
        if (this.latLonGrid) {
            this.latLonGrid.traverse((child) => {
                disposeObjectMaterialAndGeometry(child);
            });
            this.container?.remove?.(this.latLonGrid);
            this.latLonGrid = null;
        }
        if (this.latLonLabels) {
            this.latLonLabels.traverse((child) => {
                disposeObjectMaterialAndGeometry(child);
            });
            this.container?.remove?.(this.latLonLabels);
            this.latLonLabels = null;
        }
    }

    rebuildLatLonGrid(stepDegrees = MOON_LAT_LON_GRID_DEFAULT_STEP_DEGREES) {
        const normalizedStep = normalizeMoonLatLonGridStep(stepDegrees);
        if (
            normalizedStep === this.latLonGridStepDegrees &&
            this.latLonGrid &&
            (this.latLonLabels || !this.latLonGridVisible || !this.latLonLabelsVisible)
        ) {
            this._syncLatLonOverlayVisibility();
            return false;
        }
        this._disposeLatLonGridAndLabels();
        this._createLatLonGrid({
            visible: this.latLonGridVisible,
            labelsVisible: this.latLonLabelsVisible,
            stepDegrees: normalizedStep,
        });
        if (this.container && this.latLonGrid) {
            this.container.add(this.latLonGrid);
        }
        if (this.container && this.latLonLabels) {
            this.container.add(this.latLonLabels);
        }
        this._syncLatLonOverlayVisibility();
        return true;
    }

    updateLatLonGridForCamera({
        camera = null,
        rendererDomElement = null,
    } = {}) {
        if (!camera || !this.container) {
            return false;
        }
        if (!this.latLonGridVisible && !this.latLonHoverLabel?.visible) {
            if (this.latLonLabels) {
                this.latLonLabels.visible = false;
            }
            return false;
        }
        const moonWorldPosition = new THREE.Vector3();
        this.container.getWorldPosition(moonWorldPosition);
        const cameraWorldPosition = new THREE.Vector3();
        camera.getWorldPosition?.(cameraWorldPosition);
        const distance = cameraWorldPosition.distanceTo(moonWorldPosition);
        const viewportHeight = Math.max(1, Number(rendererDomElement?.clientHeight) || 720);
        const fov = Number(camera.fov);
        const visibleWorldHeight = Number.isFinite(fov)
            ? 2 * distance * Math.tan(THREE.MathUtils.degToRad(fov) / 2)
            : Math.max(1, camera.top - camera.bottom);
        const screenRadiusPx = visibleWorldHeight > 0
            ? (this.radius / visibleWorldHeight) * viewportHeight
            : 0;
        const nextStep = resolveMoonLatLonGridStepFromScreenRadius(screenRadiusPx);
        this.latLonScreenRadiusPx = screenRadiusPx;
        const rebuilt = this.rebuildLatLonGrid(nextStep);
        this._updateLatLonLabelScales({ camera, rendererDomElement });
        return rebuilt;
    }

    getLatLonScreenRadiusPx({
        camera = null,
        rendererDomElement = null,
    } = {}) {
        if (!camera || !this.container) {
            return Number(this.latLonScreenRadiusPx) || 0;
        }
        const moonWorldPosition = new THREE.Vector3();
        this.container.getWorldPosition(moonWorldPosition);
        const cameraWorldPosition = new THREE.Vector3();
        camera.getWorldPosition?.(cameraWorldPosition);
        const distance = cameraWorldPosition.distanceTo(moonWorldPosition);
        const viewportHeight = Math.max(1, Number(rendererDomElement?.clientHeight) || 720);
        const fov = Number(camera.fov);
        const visibleWorldHeight = Number.isFinite(fov)
            ? 2 * distance * Math.tan(THREE.MathUtils.degToRad(fov) / 2)
            : Math.max(1, camera.top - camera.bottom);
        return visibleWorldHeight > 0
            ? (this.radius / visibleWorldHeight) * viewportHeight
            : 0;
    }

    _updateLatLonLabelScales({
        camera = null,
        rendererDomElement = null,
    } = {}) {
        if (!camera) return;
        if (!this.latLonLabels && !this.latLonHoverLabel?.visible) return;
        const viewportHeight = Math.max(1, Number(rendererDomElement?.clientHeight) || 720);
        const fov = Number(camera.fov);
        const moonWorldPosition = new THREE.Vector3();
        const cameraWorld = new THREE.Vector3();
        this.container?.getWorldPosition?.(moonWorldPosition);
        camera.getWorldPosition?.(cameraWorld);
        const labelsReadable = (Number(this.latLonScreenRadiusPx) || 0) >= MOON_LAT_LON_LABEL_MIN_SCREEN_RADIUS_PX;
        if (this.latLonLabels) {
            this.latLonLabels.visible = this.latLonGridVisible && this.latLonLabelsVisible && labelsReadable;
            if (!this.latLonLabels.visible && !this.latLonHoverLabel?.visible) {
                return;
            }
        }
        const cameraDirectionFromMoon = cameraWorld.clone().sub(moonWorldPosition).normalize();
        const cameraLocalPosition = cameraWorld.clone();
        this.container?.worldToLocal?.(cameraLocalPosition);
        const cameraDirectionLocal = cameraLocalPosition.normalize();
        const labelRadius = this.radius * MOON_LAT_LON_GRID_LABEL_RADIUS_SCALE;
        const updateSpriteScale = (sprite, targetPixelHeight = 18) => {
            if (!sprite?.getWorldPosition) return;
            if (sprite.parent === this.latLonLabels) {
                const kind = sprite.userData.moonGridLabelKind;
                const anchor = kind === "latitude"
                    ? resolveLatitudeLabelAnchor(labelRadius, sprite.userData.latitudeDeg, cameraDirectionLocal)
                    : kind === "longitude"
                        ? resolveLongitudeLabelAnchor(labelRadius, sprite.userData.longitudeDeg, cameraDirectionLocal)
                        : null;
                if (anchor) {
                    sprite.position.copy(anchor.position);
                    sprite.visible = anchor.facing > -0.03;
                    if (!sprite.visible) return;
                }
            }
            const spriteWorld = new THREE.Vector3();
            sprite.getWorldPosition(spriteWorld);
            const spriteDirectionFromMoon = spriteWorld.clone().sub(moonWorldPosition).normalize();
            const isFrontSide = spriteDirectionFromMoon.dot(cameraDirectionFromMoon) > -0.03;
            if (sprite.parent === this.latLonLabels) {
                sprite.visible = sprite.visible !== false && isFrontSide;
                if (!isFrontSide) return;
            }
            const distance = Math.max(1e-6, cameraWorld.distanceTo(spriteWorld));
            const visibleWorldHeight = Number.isFinite(fov)
                ? 2 * distance * Math.tan(THREE.MathUtils.degToRad(fov) / 2)
                : Math.max(1, camera.top - camera.bottom);
            const worldHeight = visibleWorldHeight * (targetPixelHeight / viewportHeight);
            const aspect = Math.max(
                1,
                Number(sprite.userData.labelPixelWidth) / Math.max(1, Number(sprite.userData.labelPixelHeight)),
            );
            sprite.scale.set(worldHeight * aspect, worldHeight, 1);
        };

        this.latLonLabels?.children?.forEach?.((sprite) => {
            updateSpriteScale(sprite, 17);
        });
        if (this.latLonHoverLabel?.visible) {
            updateSpriteScale(this.latLonHoverLabel, 24);
        }
    }

    updateLatLonHoverFromPointer({
        camera = null,
        rendererDomElement = null,
        clientX = null,
        clientY = null,
    } = {}) {
        if (!this.latLonHoverEnabled || !this.mesh || !this.container || !camera || !rendererDomElement) {
            return this.hideLatLonHover();
        }
        const rect = rendererDomElement.getBoundingClientRect?.() || null;
        const width = Number(rect?.width) || Number(rendererDomElement.clientWidth) || 0;
        const height = Number(rect?.height) || Number(rendererDomElement.clientHeight) || 0;
        if (!width || !height || !Number.isFinite(Number(clientX)) || !Number.isFinite(Number(clientY))) {
            return this.hideLatLonHover();
        }

        this.latLonPointerNdc.set(
            ((Number(clientX) - (Number(rect?.left) || 0)) / width) * 2 - 1,
            -(((Number(clientY) - (Number(rect?.top) || 0)) / height) * 2 - 1),
        );
        this.latLonRaycaster.setFromCamera(this.latLonPointerNdc, camera);
        const [hit] = this.latLonRaycaster.intersectObject(this.mesh, false);
        if (!hit?.point) {
            return this.hideLatLonHover();
        }

        this.latLonHoverPoint.copy(hit.point);
        this.container.worldToLocal(this.latLonHoverPoint);
        const radius = Math.max(1e-6, this.latLonHoverPoint.length());
        const lat = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(this.latLonHoverPoint.z / radius, -1, 1)));
        const lon = renderMoonLongitudeToDisplayLongitude(THREE.MathUtils.radToDeg(Math.atan2(this.latLonHoverPoint.x, this.latLonHoverPoint.y)));
        const hoverPosition = resolveHoverLabelOffsetPosition({
            radius: this.radius,
            latitudeDeg: lat,
            longitudeDeg: lon,
            camera,
            container: this.container,
        });
        const screenRadiusPx = this.getLatLonScreenRadiusPx({ camera, rendererDomElement });
        const hoverDecimals = resolveMoonHoverCoordinateDecimals(screenRadiusPx);
        const label = `${formatMoonHoverCoordinate(lat, "N", "S", hoverDecimals)} ${formatMoonHoverCoordinate(lon, "E", "W", hoverDecimals)}`;
        if (this.latLonHoverLabel?.userData?.labelText !== label) {
            replaceCanvasTextSpriteMaterial(this.latLonHoverLabel, label, {
                color: "#f8fbff",
                background: "rgba(7, 12, 20, 0.82)",
                border: "rgba(230, 245, 255, 0.62)",
                fontSize: 24,
                paddingX: 12,
                paddingY: 6,
            });
        }
        if (this.latLonHoverLabel) {
            this.latLonHoverLabel.position.copy(hoverPosition);
            this.latLonHoverLabel.visible = true;
            this._updateLatLonLabelScales({ camera, rendererDomElement });
        }
        return true;
    }

    hideLatLonHover() {
        if (!this.latLonHoverLabel?.visible) {
            return false;
        }
        this.latLonHoverLabel.visible = false;
        return true;
    }

    /**
     * Dispose all Moon resources
     */
    dispose() {
        if (this.container) {
            // Dispose mesh
            if (this.mesh) {
                if (this.mesh.geometry) this.mesh.geometry.dispose();
                if (this.mesh.material) this.mesh.material.dispose();
                this.container.remove(this.mesh);
                this.mesh = null;
            }

            // Dispose axis
            if (this.axis) {
                if (this.axis.geometry) this.axis.geometry.dispose();
                if (this.axis.material) this.axis.material.dispose();
                this.container.remove(this.axis);
                this.axis = null;
            }
            this.axisVector = null;

            // Dispose poles
            if (this.northPoleSphere) {
                if (this.northPoleSphere.geometry) this.northPoleSphere.geometry.dispose();
                if (this.northPoleSphere.material) this.northPoleSphere.material.dispose();
                this.container.remove(this.northPoleSphere);
                this.northPoleSphere = null;
            }
            if (this.southPoleSphere) {
                if (this.southPoleSphere.geometry) this.southPoleSphere.geometry.dispose();
                if (this.southPoleSphere.material) this.southPoleSphere.material.dispose();
                this.container.remove(this.southPoleSphere);
                this.southPoleSphere = null;
            }

            this._disposeLatLonGridAndLabels();
            if (this.latLonHoverLabel) {
                disposeObjectMaterialAndGeometry(this.latLonHoverLabel);
                this.container.remove(this.latLonHoverLabel);
                this.latLonHoverLabel = null;
            }

            // Remove container from parent
            if (this.container.parent) {
                this.container.parent.remove(this.container);
            }
            this.container = null;
        }

        // Dispose textures
        const texture = this.texture;
        const displacementMap = this.displacementMap;
        const normalMap = this.normalMap;
        const generatedNormalMap = this.generatedNormalMap;
        this.texture = null;
        this.displacementMap = null;
        this.normalMap = null;
        this.generatedNormalMap = null;

        texture?.dispose?.();
        displacementMap?.dispose?.();
        if (normalMap && normalMap !== displacementMap && normalMap !== generatedNormalMap) {
            normalMap.dispose();
        }
        if (generatedNormalMap && generatedNormalMap !== normalMap) {
            generatedNormalMap.dispose();
        }
    }
}
