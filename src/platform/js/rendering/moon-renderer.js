// @ts-nocheck
import { replaceTextureOwner, updateTextureOwner, detachTextureOwner } from "./texture-ownership.js";
import { DEFAULT_MOON_RENDER_PROFILE_SETTINGS } from "../app/moon-render-asset-profiles.js";
import { MOON_RENDER_PIPELINE_SCHEMA_VERSION } from "../app/moon-render-pipeline.js";

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
const DEFAULT_MOON_RENDER_SETTINGS = DEFAULT_MOON_RENDER_PROFILE_SETTINGS.fast;

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
    // Preserve the old generic geometry override names as input aliases.
    if (renderSettings.geometryWidthSegments != null && renderSettings.physicalGeometryWidthSegments == null) normalized.physicalGeometryWidthSegments = normalized.geometryWidthSegments;
    if (renderSettings.geometryHeightSegments != null && renderSettings.physicalGeometryHeightSegments == null) normalized.physicalGeometryHeightSegments = normalized.geometryHeightSegments;
    return normalized;
}

function applyMoonRenderSettingsToMaterial(material, renderSettings = DEFAULT_MOON_RENDER_SETTINGS, { moonRadius = 1 } = {}) {
    const settings = normalizeMoonRenderSettings(renderSettings);
    const image = material.displacementMap?.image;
    Object.assign(material.userData, {
        moonLsBlend: settings.lommelSeeligerBlend,
        moonShadowLift: settings.shadowLift,
        moonShadowWeightExponent: settings.shadowWeightExponent,
        moonTerrainShadowStrength: material.displacementMap ? settings.terrainShadowStrength : 0,
        moonTerrainShadowTexelStride: settings.terrainShadowTexelStride,
        moonTerrainShadowSamples: settings.terrainShadowSamples,
        moonHeightTexelSize: new THREE.Vector2(1 / Math.max(1, image?.width || settings.normalMapMaxWidth), 1 / Math.max(1, image?.height || settings.normalMapMaxWidth / 2)),
        moonPhysicalHeightScale: settings.physicalNormalHeightScale > 0 ? settings.displacementScale : 0,
        moonPhysicalHeightBias: settings.physicalNormalHeightScale > 0 ? settings.displacementBias : 0,
    });
    material.displacementScale = settings.displacementScale * Math.max(0, Number(moonRadius) || 0);
    material.displacementBias = settings.displacementBias * Math.max(0, Number(moonRadius) || 0);
    material.roughness = settings.roughness;
    material.metalness = settings.metalness;
    material.normalScale?.set?.(settings.normalScale, settings.normalScale);
}

function resolvePipelineRenderSettings(renderSettings, pipelineState) {
    const settings = normalizeMoonRenderSettings(renderSettings);
    const pipeline = normalizeMoonRenderPipelineState(pipelineState);
    return {
        ...settings,
        normalScale: pipeline.physicalNormalScale * settings.physicalNormalResolutionCompensation,
        displacementScale: settings.physicalDisplacementScale * pipeline.physicalReliefScale,
        displacementBias: settings.physicalDisplacementBias * pipeline.physicalReliefScale,
        lommelSeeligerBlend: pipeline.physicalBrdfBlend,
        terrainShadowStrength: pipeline.terrainShadows ? pipeline.physicalShadowStrength : 0,
        terrainShadowTexelStride: settings.physicalTerrainShadowTexelStride,
        terrainShadowSamples: settings.physicalTerrainShadowSamples,
    };
}

function applyMoonPipelineStagesToMaterial(material, renderSettings, pipelineState) {
    const pipeline = normalizeMoonRenderPipelineState(pipelineState);
    Object.assign(material.userData, {
        moonGeometricMask: pipeline.geometricMask ? 1 : 0,
        moonPhysicalExposure: pipeline.physicalExposure,
        moonPhysicalToneGamma: pipeline.physicalToneGamma,
    });
    material.shadowSide = THREE.FrontSide;
}

function applyMoonPhotometricShader(material) {
    material.userData = material.userData || {};
    if (!Number.isFinite(material.userData.moonLsBlend)) {
        material.userData.moonLsBlend = DEFAULT_MOON_RENDER_SETTINGS.lommelSeeligerBlend;
    }

    if (!Number.isFinite(material.userData.moonShadowLift)) {
        material.userData.moonShadowLift = DEFAULT_MOON_RENDER_SETTINGS.shadowLift;
    }

    if (!Number.isFinite(material.userData.moonShadowWeightExponent)) {
        material.userData.moonShadowWeightExponent = DEFAULT_MOON_RENDER_SETTINGS.shadowWeightExponent;
    }

    if (!Number.isFinite(material.userData.moonTerrainShadowStrength)) {
        material.userData.moonTerrainShadowStrength = DEFAULT_MOON_RENDER_SETTINGS.terrainShadowStrength;
    }

    if (!Number.isFinite(material.userData.moonTerrainShadowTexelStride)) {
        material.userData.moonTerrainShadowTexelStride = DEFAULT_MOON_RENDER_SETTINGS.terrainShadowTexelStride;
    }

    if (!Number.isFinite(material.userData.moonTerrainShadowSamples)) {
        material.userData.moonTerrainShadowSamples = DEFAULT_MOON_RENDER_SETTINGS.terrainShadowSamples;
    }
    if (!Number.isFinite(material.userData.moonEarthshineBlend)) {
        material.userData.moonEarthshineBlend = 1.0;
    }

    if (!Number.isFinite(material.userData.moonGeometricMask)) {
        material.userData.moonGeometricMask = 0.0;
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
        // Three.js emits USE_DISPLACEMENTMAP only in its vertex prefix.
        // Physical's fragment horizon test therefore needs its own define/UV.
        const moonPhysicalDisplacement = !!material.displacementMap;
        const moonTerrainSampleLimit = Math.max(0, Math.min(20, Math.round(material.displacementMap ? material.userData.moonTerrainShadowSamples || 0 : 0)));
        shader.uniforms.uMoonLsBlend = { value: material.userData.moonLsBlend };
        shader.uniforms.uMoonShadowLift = { value: material.userData.moonShadowLift };
        shader.uniforms.uMoonShadowWeightExponent = { value: material.userData.moonShadowWeightExponent };
        shader.uniforms.uMoonHeightMap = { value: material.displacementMap || null };
        shader.uniforms.uMoonHeightTexelSize = { value: material.userData.moonHeightTexelSize };
        shader.uniforms.uMoonTerrainShadowStrength = { value: material.userData.moonTerrainShadowStrength };
        shader.uniforms.uMoonTerrainShadowTexelStride = { value: material.userData.moonTerrainShadowTexelStride };
        shader.uniforms.uMoonTerrainShadowSamples = { value: material.userData.moonTerrainShadowSamples };
        shader.uniforms.uMoonPhysicalHeightScale = { value: material.userData.moonPhysicalHeightScale };
        shader.uniforms.uMoonPhysicalHeightBias = { value: material.userData.moonPhysicalHeightBias };
        shader.uniforms.uMoonEarthshineBlend = { value: material.userData.moonEarthshineBlend };
        shader.uniforms.uMoonGeometricMask = { value: material.userData.moonGeometricMask };
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
varying float vMoonBaseRadiusView;
varying vec2 vMoonHeightUv;`,
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
vMoonBaseRadiusView = length( mat3( modelViewMatrix ) * position );
#ifdef USE_DISPLACEMENTMAP
    vMoonHeightUv = vDisplacementMapUv;
#else
    vMoonHeightUv = vec2( 0.0 );
#endif`,
            );

        shader.fragmentShader = shader.fragmentShader
            .replace(
                "#include <common>",
                `#include <common>
${moonPhysicalDisplacement ? "#define MOON_PHYSICAL_DISPLACEMENT" : ""}
uniform float uMoonLsBlend;
uniform float uMoonShadowLift;
uniform float uMoonShadowWeightExponent;
uniform sampler2D uMoonHeightMap;
uniform vec2 uMoonHeightTexelSize;
uniform float uMoonTerrainShadowStrength;
uniform float uMoonTerrainShadowTexelStride;
uniform float uMoonTerrainShadowSamples;
uniform float uMoonPhysicalHeightScale;
uniform float uMoonPhysicalHeightBias;
uniform float uMoonEarthshineBlend;
uniform float uMoonGeometricMask;
uniform float uMoonPhysicalExposure;
uniform float uMoonPhysicalToneGamma;
varying vec3 vMoonGeometricNormalView;
varying vec3 vMoonDisplacedFromCenterView;
varying float vMoonBaseRadiusView;
varying vec2 vMoonHeightUv;

// Sun's angular half-radius as seen from the lunar surface (~0.267 deg).
// sin(alpha) ~ 0.00466 — sets the width of the macroscopic terminator
// penumbra band. Ahead-of-the-field detail; sub-pixel at typical zoom.
const float MOON_SUN_SIN_ALPHA = 0.00466;
const float MOON_INV_PI        = 0.31830988618;

// Fraction of the Sun's disk above the local geometric horizon, in [0, 1].
// Closed-form integral of the visible disk-area fraction. Drives the
// macroscopic-terminator soft transition.
//
// Use the smooth sphere or displaced surface near the terminator. Per-pixel
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
    // Three's stock GGX highlight is accumulated separately from diffuse.
    // Isolate only the Sun's part so the same horizon/terrain visibility can
    // suppress it without suppressing earthshine or explicit shot fill lights.
    // Match the stock direct-light operation order, including its shadow factor.
    vec3 moonSunSpecularContribution = moonNdotL
        * ( directionalLights[0].color * moonSunShadowFactor )
        * BRDF_GGX( moonLightDir, moonViewDir, moonNormal, material );
    vec3 moonOtherDirectSpecular = max(
        reflectedLight.directSpecular - moonSunSpecularContribution,
        vec3( 0.0 )
    );
    float moonSunShadowFactorForDiffuse = moonSunShadowFactor;

        moonSunShadowFactorForDiffuse = mix(
            1.0,
            moonSunShadowFactor,
            clamp( uMoonTerrainShadowStrength, 0.0, 1.0 )
        );

    vec3 moonSunDiffuseUnit = directionalLights[0].color * moonSunShadowFactorForDiffuse
                           * RECIPROCAL_PI * material.diffuseColor;

    // Start from smooth-sphere visibility. Terrain may
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
    // A raised point just behind the smooth terminator can see the Sun only
    // when its outgoing ray clears the base lunar sphere. This position-based
    // horizon test admits real high terrain without allowing a merely
    // sun-facing normal to see through the Moon.
    float moonMacroscopicRawNdotLForVis = moonSmoothRawNdotLForVis;
#if defined( MOON_PHYSICAL_DISPLACEMENT )

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

#endif
#if defined( MOON_PHYSICAL_DISPLACEMENT ) || defined( USE_NORMALMAP )
    #if defined( MOON_PHYSICAL_DISPLACEMENT )
        vec2 moonHeightUv = vMoonHeightUv;
    #else
        vec2 moonHeightUv = vNormalMapUv;
    #endif
#endif
    float moonEffectiveRawNdotLForVis = moonMacroscopicRawNdotLForVis;
    float moonSunVisibility = moonSunDiskVisibleFraction( moonEffectiveRawNdotLForVis );

    // Separate reflected directional light before replacing solar reflectance.
    // Restore it after Sun visibility/shadows so it can light the night side.
    moonEarthshineDirectKept = max( reflectedLight.directDiffuse - moonSunDirectContribution, vec3(0.0) );
    reflectedLight.directDiffuse = moonSunDirectContribution * moonSunVisibility;

        // USGS lunar-Lambert: (1-L)*mu0 + 2*L*mu0/(mu0+mu).
        // Evaluate the reflectance directly so the single-scattering term can
        // preserve real low-incidence terrain without a divergent scale ratio.
        float moonPhysicalLsResponse = 2.0 * moonNdotL
            / max( moonNdotL + moonNdotV, 1e-4 );
        float moonPhysicalDiffuseResponse = mix(
            moonNdotL,
            moonPhysicalLsResponse,
            clamp( uMoonLsBlend, 0.0, 1.0 )
        );
        // DEM normals can face the Sun even at grazing radial incidence.
        // Their resolved BRDF otherwise stays bright until the spherical
        // visibility gate closes, leaving a cut-out edge. Fade that response
        // over the last ~5 degrees of horizon clearance. This is a terrain
        // shading approximation, not an enlargement of the solar disk.
        // Raised terrain retains its position-based horizon clearance; a
        // smooth surface (normal scale zero) keeps its original response.
        float moonPhysicalGrazingWeight = mix(
            1.0,
            smoothstep( -MOON_SUN_SIN_ALPHA, 0.085, moonMacroscopicRawNdotLForVis ),
            clamp( length( normal - normalize( nonPerturbedNormal ) ) * 4.0, 0.0, 1.0 )
        );
        reflectedLight.directDiffuse = moonSunDiffuseUnit
            * moonPhysicalDiffuseResponse
            * moonSunVisibility
            * moonPhysicalGrazingWeight;

    float moonSolarSpecularVisibility = moonSunVisibility * moonPhysicalGrazingWeight;
    moonShadowWeight = pow( 1.0 - moonNdotL, max(0.2, uMoonShadowWeightExponent) );
    reflectedLight.directDiffuse *= mix(1.0, 1.0 + uMoonShadowLift, moonShadowWeight);

#if defined( USE_NORMALMAP_TANGENTSPACE )
    vec3 moonLightTangent = vec3(
        dot( moonLightDir, tbn[0] ),
        dot( moonLightDir, tbn[1] ),
        dot( moonLightDir, tbn[2] )
    );
    float moonLightTangentPlanarLength = length( moonLightTangent.xy );
    float moonTerrainSelfShadow = 0.0;
    if (
        uMoonTerrainShadowStrength > 0.0 &&
        uMoonPhysicalHeightScale > 0.0 &&
        moonLightTangentPlanarLength > 1e-4
    ) {
        // Trace the physical DEM along the Sun azimuth. Heights are decoded
        // in lunar-radius units; the blocker angle includes sphere curvature.
        vec2 moonLightTangentDirection = moonLightTangent.xy / moonLightTangentPlanarLength;
        float moonStartLatitude = ( moonHeightUv.y - 0.5 ) * 3.141592653589793;
        float moonStartLatitudeSin = sin( moonStartLatitude );
        float moonStartLatitudeCos = cos( moonStartLatitude );
        float moonAngularStep = 3.141592653589793
            * uMoonHeightTexelSize.y
            * max( 0.5, uMoonTerrainShadowTexelStride );
        float moonPhysicalBaseHeight = texture2D( uMoonHeightMap, moonHeightUv ).r
            * uMoonPhysicalHeightScale
            + uMoonPhysicalHeightBias;
        float moonPhysicalBaseRadius = 1.0 + moonPhysicalBaseHeight;
        // Elevated terrain can see a Sun below the radial horizon. Trace its
        // signed altitude too, or nearby hills cannot shadow those lit peaks.
        float moonSunAltitude = atan(
            moonLightTangent.z,
            moonLightTangentPlanarLength
        );
        float moonPhysicalHorizonShadow = 0.0;
        for ( int moonSampleIndex = 1; moonSampleIndex <= ${moonTerrainSampleLimit}; moonSampleIndex += 1 ) {
            if ( float( moonSampleIndex ) > uMoonTerrainShadowSamples ) {
                break;
            }
            float moonSampleDistance = float( moonSampleIndex );
            float moonSampleAngle = moonAngularStep * moonSampleDistance;
            float moonSampleAngleSin = sin( moonSampleAngle );
            float moonSampleAngleCos = cos( moonSampleAngle );
            float moonSampleLatitudeSin = clamp(
                moonStartLatitudeSin * moonSampleAngleCos
                    + moonStartLatitudeCos * moonSampleAngleSin * moonLightTangentDirection.y,
                -1.0,
                1.0
            );
            float moonSampleLatitude = asin( moonSampleLatitudeSin );
            float moonSampleLongitudeOffset = atan(
                moonLightTangentDirection.x * moonSampleAngleSin * moonStartLatitudeCos,
                moonSampleAngleCos - moonStartLatitudeSin * moonSampleLatitudeSin
            );
            vec2 moonSampleUv = vec2(
                fract( moonHeightUv.x + moonSampleLongitudeOffset / 6.283185307179586 + 1.0 ),
                clamp( moonSampleLatitude / 3.141592653589793 + 0.5, 0.0, 1.0 )
            );
            float moonSampleHeight = texture2D(
                uMoonHeightMap,
                moonSampleUv
            ).r * uMoonPhysicalHeightScale + uMoonPhysicalHeightBias;
            float moonSampleRadius = 1.0 + moonSampleHeight;
            float moonSampleRadialRise = moonSampleRadius * cos( moonSampleAngle )
                - moonPhysicalBaseRadius;
            float moonSampleTangentDistance = max(
                moonSampleRadius * sin( moonSampleAngle ),
                1e-6
            );
            float moonBlockerAltitude = atan(
                moonSampleRadialRise,
                moonSampleTangentDistance
            );
            float moonSampleShadow = smoothstep(
                moonSunAltitude - MOON_SUN_SIN_ALPHA,
                moonSunAltitude + MOON_SUN_SIN_ALPHA,
                moonBlockerAltitude
            );
            moonPhysicalHorizonShadow = max(
                moonPhysicalHorizonShadow,
                moonSampleShadow
            );
        }
        moonTerrainSelfShadow = moonPhysicalHorizonShadow;
    }
    float moonTerrainShadowWeight = 1.0;
    float moonTerrainShadowMaximum = 0.96;
    float moonTerrainShadow = clamp(
        moonTerrainSelfShadow * moonTerrainShadowWeight * uMoonTerrainShadowStrength,
        0.0,
        moonTerrainShadowMaximum
    );
    reflectedLight.directDiffuse *= 1.0 - moonTerrainShadow;
    moonSolarSpecularVisibility *= 1.0 - moonTerrainShadow;
#endif
    reflectedLight.directSpecular = moonOtherDirectSpecular
        + moonSunSpecularContribution * moonSolarSpecularVisibility;
#endif
    reflectedLight.indirectDiffuse += diffuseColor.rgb * ( uMoonShadowLift * moonShadowWeight * 0.72 );`,
            )
            .replace(
                "vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;",
                `vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
#if NUM_DIR_LIGHTS > 0
    outgoingLight += moonEarthshineDirectKept * clamp( uMoonEarthshineBlend, 0.0, 1.0 );
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

    outgoingLight = mix(
        outgoingLight,
        vec3( step( 0.0001, dot( normalize( vMoonGeometricNormalView ), moonLightDir ) ) ),
        clamp( uMoonGeometricMask, 0.0, 1.0 )
    );
#endif`,
            );
    };

    material.customProgramCacheKey = () => {
        // Numeric lighting controls are uniforms. Only generated shader source
        // belongs in the program key; otherwise each slider value recompiles it.
        const physicalDisplacement = !!material.displacementMap;
        return `moon-physical-v41-solar-specular-${Number(physicalDisplacement)}-${Math.max(0, Math.min(20, Math.round(material.displacementMap ? material.userData.moonTerrainShadowSamples || 0 : 0)))}`;
    };

    material.userData.refreshMoonShaderUniforms = () => {
        const shaders = material.userData.moonPhotometricShaders?.values?.() || [material.userData.moonPhotometricShader].filter(Boolean);
        for (const shader of shaders) {
            for (const [key, uniform] of Object.entries(shader.uniforms)) {
                if (!key.startsWith("uMoon")) continue;
                const property = "moon" + key.slice(5);
                if (key === "uMoonHeightMap") uniform.value = material.displacementMap || null;
                else if (material.userData[property] !== undefined) uniform.value = material.userData[property];
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
        this.generatedNormalMapMode = null;
        this.generatedNormalMapRefreshGeneration = 0;
        this.generatedNormalMapIdleHandle = null;
        this.renderSettings = { ...DEFAULT_MOON_RENDER_SETTINGS };
        this.renderPipeline = normalizeMoonRenderPipelineState();
        this.requestRender = null;
    }

    _resolveGeneratedNormalMapMode() { return "physical-spherical"; }

    _resolveEffectivePipeline() {
        return resolveMoonLightingModelStages(this.renderPipeline);
    }

    _resolveDemTexture() { return this.displacementMap; }

    _buildGeneratedNormalMap() {
        const normalMode = this._resolveGeneratedNormalMapMode();
        const pipeline = this._resolveEffectivePipeline();
        const preparedPhysicalNormal = normalMode === "physical-spherical"
            ? this.displacementMap?.userData?.physicalNormalTexture
            : null;
        if (pipeline.generatedNormalMap && !this.normalMap && preparedPhysicalNormal) {
            return preparedPhysicalNormal;
        }
        return (pipeline.generatedNormalMap && !this.normalMap && this._hasUsableDem())
            ? buildMoonNormalMapFromHeightTexture(this._resolveDemTexture(), {
                ...this.renderSettings,
                physicalNormalHeightScale: normalMode === "physical-spherical"
                    ? this.renderSettings.physicalNormalHeightScale
                    : 0.0,
            })
            : null;
    }

    _hasUsableDem() {
        const width = Number(this.displacementMap?.image?.width);
        const height = Number(this.displacementMap?.image?.height);
        return Number.isFinite(width) && width > 1 && Number.isFinite(height) && height > 1;
    }

    _refreshGeneratedNormalMap({ disposePrevious = true } = {}) {
        return updateTextureOwner(this, () => this._textureInputs(), () => {
            this.generatedNormalMap = this._buildGeneratedNormalMap();
            this.generatedNormalMapMode = this.generatedNormalMap
                ? this._resolveGeneratedNormalMapMode()
                : null;

            return this._resolveNormalMap();
        }, { disposePrevious });
    }

    _cancelScheduledGeneratedNormalMapRefresh() {
        this.generatedNormalMapRefreshGeneration += 1;
        if (
            this.generatedNormalMapIdleHandle != null &&
            typeof globalThis.cancelIdleCallback === "function"
        ) {
            globalThis.cancelIdleCallback(this.generatedNormalMapIdleHandle);
        }
        this.generatedNormalMapIdleHandle = null;
    }

    _scheduleGeneratedNormalMapRefresh() {
        this._cancelScheduledGeneratedNormalMapRefresh();
        const generation = this.generatedNormalMapRefreshGeneration;
        const refresh = () => {
            this.generatedNormalMapIdleHandle = null;
            if (
                generation !== this.generatedNormalMapRefreshGeneration ||
                !this.mesh ||
                this.normalMap ||
                !this._hasUsableDem()
            ) {
                return;
            }
            const desiredMode = this._resolveGeneratedNormalMapMode();
            if (!this._resolveEffectivePipeline().generatedNormalMap) {
                return;
            }
            this._refreshGeneratedNormalMap({ disposePrevious: true });
            if (this.generatedNormalMapMode !== desiredMode) {
                return;
            }
            this._applyPipelineMapsToMaterial();
            this._applyRenderSettingsToMaterial();
            replaceTextureOwner(this, this._textureInputs());
            this.requestRender?.();
        };
        if (typeof globalThis.requestIdleCallback === "function") {
            this.generatedNormalMapIdleHandle = globalThis.requestIdleCallback(refresh, {
                timeout: 750,
            });
        } else {
            refresh();
        }
    }

    _resolveNormalMap() {
        if (!this._resolveEffectivePipeline().generatedNormalMap) {
            return null;
        }
        return this.normalMap || this.generatedNormalMap || null;
    }

    _resolveGeometrySegments() {
        const pipeline = this._resolveEffectivePipeline();
        const widthSegments = this.renderSettings.physicalGeometryWidthSegments;
        const heightSegments = this.renderSettings.physicalGeometryHeightSegments;
        return {
            width: THREE.MathUtils.clamp(
                Math.round(widthSegments),
                32,
                1024,
            ),
            height: THREE.MathUtils.clamp(
                Math.round(heightSegments),
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
        const pipeline = this._resolveEffectivePipeline();
        const resolvedNormalMap = this._resolveNormalMap();
        const demTexture = this._resolveDemTexture();
        const resolvedDisplacementMap = pipeline.displacement && this._hasUsableDem()
            ? (demTexture || null)
            : null;
        const resolvedBumpMap = pipeline.generatedNormalMap && !resolvedNormalMap && this._hasUsableDem()
            ? (demTexture || null)
            : null;

        material.map = pipeline.colorTexture ? (this.texture || null) : null;
        material.color?.setHex?.(pipeline.colorTexture ? 0xffffff : 0x8f969e);
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

        const pipeline = this._resolveEffectivePipeline();
        applyMoonRenderSettingsToMaterial(
            material,
            resolvePipelineRenderSettings(this.renderSettings, this.renderPipeline),
            { moonRadius: this.radius, physicalModel: pipeline.physicalModel },
        );
        applyMoonPipelineStagesToMaterial(material, this.renderSettings, this.renderPipeline);
        material.userData.moonEarthshineBlend = pipeline.earthshine ? 1.0 : 0.0;
        material.userData?.refreshMoonShaderUniforms?.();
        material.needsUpdate = true;
    }

    /**
     * Set textures before creating Moon
     * @param {THREE.Texture} texture - Moon surface texture
     * @param {THREE.Texture} displacementMap - Displacement/bump map
     * @param {THREE.Texture|null} normalMap - Optional normal map
     */
    _textureInputs() {
        const material = this.mesh?.material;
        return [this.texture, this.displacementMap, this.normalMap, this.generatedNormalMap,
            material?.map, material?.normalMap, material?.displacementMap, material?.bumpMap];
    }

    setTextures(texture, displacementMap, normalMap = null) {
        this.texture = texture;
        this.displacementMap = displacementMap;
        this.normalMap = normalMap;
        replaceTextureOwner(this, this._textureInputs(), { disposePrevious: false });
    }

    setRenderInvalidationCallback(callback = null) {
        this.requestRender = typeof callback === "function" ? callback : null;
    }

    setRenderSettings(renderSettings = null) {
        const previousSettings = this.renderSettings;
        this.renderSettings = normalizeMoonRenderSettings(renderSettings);
        const normalInputsChanged = [
            "normalMapMaxWidth",
            "physicalNormalHeightScale", "physicalNormalSlopeBoost", "physicalNormalSlopeBoostStart", "physicalNormalSlopeBoostEnd",
        ].some((key) => previousSettings?.[key] !== this.renderSettings[key]);
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
        if (normalInputsChanged) this._refreshGeneratedNormalMap({ disposePrevious: true });
        this._applyPipelineMapsToMaterial();
        this._applyRenderSettingsToMaterial();
        replaceTextureOwner(this, this._textureInputs());
    }

    setRenderPipeline(pipelineState = null) {
        return updateTextureOwner(this, () => this._textureInputs(), () => {
            this._cancelScheduledGeneratedNormalMapRefresh();
            this.renderPipeline = normalizeMoonRenderPipelineState({ schemaVersion: MOON_RENDER_PIPELINE_SCHEMA_VERSION, ...pipelineState });
            const pipeline = this._resolveEffectivePipeline();
            const nextNormalMode = this._resolveGeneratedNormalMapMode();
            const material = this.mesh?.material;
            if (
                material &&
                pipeline.generatedNormalMap &&
                !this.normalMap &&
                this._hasUsableDem() &&
                (!this.generatedNormalMap || this.generatedNormalMapMode !== nextNormalMode)
            ) {
                if (typeof globalThis.requestIdleCallback === "function") {
                    this.generatedNormalMap = null;
                    this.generatedNormalMapMode = null;
                    this._scheduleGeneratedNormalMapRefresh();
                } else {
                    this._refreshGeneratedNormalMap({ disposePrevious: true });
                }
            }
            this._refreshMoonGeometry();
            this._applyPipelineMapsToMaterial();
            this._applyRenderSettingsToMaterial();
        });
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
        return updateTextureOwner(this, () => this._textureInputs(), () => {
            this._cancelScheduledGeneratedNormalMapRefresh();

            if (renderSettings) {
                this.renderSettings = normalizeMoonRenderSettings(renderSettings);
            }

            this.texture = texture;
            this.displacementMap = displacementMap;
            this.normalMap = normalMap;

            if (!this._hasUsableDem() && !this.normalMap) {
                this.generatedNormalMap = null;
                this.generatedNormalMapMode = null;
            }

            const pipeline = this._resolveEffectivePipeline();
            if (pipeline.physicalModel && this.displacementMap?.userData?.physicalNormalTexture) deferGeneratedNormalMap = false;
            if (deferGeneratedNormalMap && pipeline.generatedNormalMap && !this.normalMap) {
                this.generatedNormalMap = null;
                this.generatedNormalMapMode = null;
            }
            if (pipeline.generatedNormalMap && this._hasUsableDem() && !deferGeneratedNormalMap) {
                this._refreshGeneratedNormalMap({ disposePrevious: false });
            }
            if (!pipeline.generatedNormalMap) {
                this.generatedNormalMap = null;
                this.generatedNormalMapMode = null;
            }
            const material = this.mesh?.material;
            if (material) {
                this._refreshMoonGeometry();
                this._applyPipelineMapsToMaterial();
                this._applyRenderSettingsToMaterial();
            }
        }, { disposePrevious });
    }

    refreshGeneratedNormalMap({ disposePrevious = true } = {}) {
        const resolvedNormalMap = this._refreshGeneratedNormalMap({ disposePrevious });
        const material = this.mesh?.material;
        if (!material) {
            return resolvedNormalMap;
        }
        this._applyPipelineMapsToMaterial();
        this._applyRenderSettingsToMaterial();
        replaceTextureOwner(this, this._textureInputs(), { disposePrevious });
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
        const pipeline = this._resolveEffectivePipeline();
        if (this.displacementMap?.userData?.physicalNormalTexture) deferGeneratedNormalMap = false;
        if (pipeline.generatedNormalMap && !deferGeneratedNormalMap && !this.normalMap && this._hasUsableDem() && !this.generatedNormalMap) {
            this._refreshGeneratedNormalMap({ disposePrevious: true });
        }
        const resolvedNormalMap = this._resolveNormalMap();

        const geometry = this._createMoonGeometry();
        const material = new THREE.MeshStandardMaterial({
            map: pipeline.colorTexture ? this.texture : null,
            color: pipeline.colorTexture ? 0xffffff : 0x8f969e,
            bumpMap: pipeline.generatedNormalMap && !resolvedNormalMap && this._hasUsableDem() ? this._resolveDemTexture() : null,
            bumpScale: pipeline.generatedNormalMap && !resolvedNormalMap && this._hasUsableDem() ? 0.0045 : 0.0,
            displacementMap: pipeline.displacement && this._hasUsableDem() ? this._resolveDemTexture() : null,
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
            { moonRadius: this.radius, physicalModel: pipeline.physicalModel },
        );
        applyMoonPipelineStagesToMaterial(material, this.renderSettings, this.renderPipeline);
        material.userData.moonEarthshineBlend = pipeline.earthshine ? 1.0 : 0.0;
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
        const releaseTextures = detachTextureOwner(this, [this.texture, this.displacementMap, this.normalMap, this.generatedNormalMap]);
        this.texture = null;
        this.displacementMap = null;
        this.normalMap = null;
        this.generatedNormalMap = null;
        this.generatedNormalMapMode = null;
        this.requestRender = null;
        try {
            this._cancelScheduledGeneratedNormalMapRefresh();
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
        } finally { releaseTextures(); }
    }
}
