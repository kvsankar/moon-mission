// @ts-nocheck

import * as THREE from "three";
import {
    DEFAULT_MOON_RENDER_ASSET_PROFILES,
    DEFAULT_MOON_RENDER_PROFILE_SETTINGS,
    MOON_RENDER_ASSET_PATHS_STORAGE_KEY,
    MOON_RENDER_ASSET_PROFILE_STORAGE_KEY,
    resolveMoonRenderAssetProfiles,
    resolveMoonRenderAssetSelection,
    resolveMoonRenderProfileSettings,
} from "./app/moon-render-asset-profiles.js";
import { buildMoonNormalMapFromHeightTexture } from "./rendering/moon-normal-map.js";

/** @type {Record<string, number>} */
const TUNER_VIEW_DEFAULTS = Object.freeze({
    primaryIntensity: 3.1,
    ambientIntensity: 0.015,
    earthshineIntensity: 0.03,
    primaryAzimuthDeg: 135,
    primaryElevationDeg: 28,
    earthshineAzimuthDeg: -18,
    earthshineElevationDeg: 5,
    toneExposure: 1.14,
    cameraFovDeg: 28,
    cameraDistance: 3.1,
});

function createTunerStateFromRenderSettings(renderSettings) {
    const normalized = renderSettings || DEFAULT_MOON_RENDER_PROFILE_SETTINGS.fast;
    return {
        geometryWidthSegments: normalized.geometryWidthSegments,
        geometryHeightSegments: normalized.geometryHeightSegments,
        normalMapMaxWidth: normalized.normalMapMaxWidth,
        normalMapStrength: normalized.normalMapStrength,
        normalDetailBoost: normalized.normalDetailBoost,
        normalDetailRadius: normalized.normalDetailRadius,
        normalScaleX: normalized.normalScale,
        normalScaleY: normalized.normalScale,
        displacementScale: normalized.displacementScale,
        displacementBias: normalized.displacementBias,
        roughness: normalized.roughness,
        metalness: normalized.metalness,
        lommelSeeligerBlend: normalized.lommelSeeligerBlend,
        lsClampMin: normalized.lsClampMin,
        lsClampMax: normalized.lsClampMax,
        oppositionStrength: normalized.oppositionStrength,
        shadowLift: normalized.shadowLift,
        highlightBoost: normalized.highlightBoost,
        shadowWeightExponent: normalized.shadowWeightExponent,
        highlightWeightExponent: normalized.highlightWeightExponent,
        terminatorContrast: normalized.terminatorContrast,
        terminatorReliefStrength: normalized.terminatorReliefStrength,
        terminatorShadowFloor: normalized.terminatorShadowFloor,
        terminatorIndirectOcclusion: normalized.terminatorIndirectOcclusion,
        terrainReliefStrength: normalized.terrainReliefStrength,
        terrainShadowStrength: normalized.terrainShadowStrength,
        terrainShadowTexelStride: normalized.terrainShadowTexelStride,
        terrainShadowSlopeBias: normalized.terrainShadowSlopeBias,
        ...TUNER_VIEW_DEFAULTS,
    };
}

const CONTROL_GROUPS = [
    {
        title: "Surface",
        controls: [
            { key: "normalMapMaxWidth", label: "Normal Map Max Width", min: 512, max: 8192, step: 128 },
            { key: "normalMapStrength", label: "Normal Map Strength", min: 0.0, max: 6.0, step: 0.01 },
            { key: "normalDetailBoost", label: "Normal Detail Boost", min: 0.0, max: 4.0, step: 0.01 },
            { key: "normalDetailRadius", label: "Normal Detail Radius", min: 1, max: 8, step: 1 },
            { key: "normalScaleX", label: "Normal Scale X", min: 0.0, max: 3.0, step: 0.01 },
            { key: "normalScaleY", label: "Normal Scale Y", min: 0.0, max: 3.0, step: 0.01 },
            { key: "displacementScale", label: "Displacement Scale", min: 0.0, max: 0.02, step: 0.0001 },
            { key: "displacementBias", label: "Displacement Bias", min: -0.02, max: 0.02, step: 0.0001 },
            { key: "roughness", label: "Roughness", min: 0.0, max: 1.0, step: 0.01 },
            { key: "metalness", label: "Metalness", min: 0.0, max: 1.0, step: 0.01 },
        ],
    },
    {
        title: "Photometric",
        controls: [
            { key: "lommelSeeligerBlend", label: "LS Blend", min: 0.0, max: 1.0, step: 0.01 },
            { key: "lsClampMin", label: "LS Clamp Min", min: 0.5, max: 1.3, step: 0.005 },
            { key: "lsClampMax", label: "LS Clamp Max", min: 0.7, max: 1.6, step: 0.005 },
            { key: "oppositionStrength", label: "Opposition Strength", min: 0.0, max: 0.04, step: 0.0005 },
            { key: "shadowLift", label: "Shadow Lift", min: 0.0, max: 0.2, step: 0.001 },
            { key: "highlightBoost", label: "Highlight Boost", min: 1.0, max: 1.5, step: 0.005 },
            { key: "shadowWeightExponent", label: "Shadow Exponent", min: 0.2, max: 3.0, step: 0.01 },
            { key: "highlightWeightExponent", label: "Highlight Exponent", min: 0.2, max: 3.0, step: 0.01 },
            { key: "terminatorContrast", label: "Terminator Contrast", min: 1.0, max: 3.0, step: 0.01 },
            { key: "terrainReliefStrength", label: "Terrain Relief", min: 0.0, max: 7.0, step: 0.01 },
            { key: "terrainShadowStrength", label: "Terrain Shadow", min: 0.0, max: 7.0, step: 0.01 },
            { key: "terrainShadowTexelStride", label: "Shadow Step", min: 0.5, max: 10.0, step: 0.1 },
            { key: "terrainShadowSlopeBias", label: "Shadow Slope Bias", min: 0.0, max: 0.02, step: 0.0001 },
        ],
    },
    {
        title: "Lighting",
        controls: [
            { key: "primaryIntensity", label: "Primary Light", min: 0.1, max: 6.0, step: 0.05 },
            { key: "ambientIntensity", label: "Ambient", min: 0.0, max: 0.3, step: 0.005 },
            { key: "earthshineIntensity", label: "Earthshine", min: 0.0, max: 0.4, step: 0.005 },
            { key: "primaryAzimuthDeg", label: "Primary Azimuth", min: -180, max: 180, step: 1 },
            { key: "primaryElevationDeg", label: "Primary Elevation", min: -10, max: 89, step: 1 },
            { key: "earthshineAzimuthDeg", label: "Earthshine Azimuth", min: -180, max: 180, step: 1 },
            { key: "earthshineElevationDeg", label: "Earthshine Elevation", min: -30, max: 89, step: 1 },
            { key: "toneExposure", label: "Tone Exposure", min: 0.5, max: 2.5, step: 0.01 },
        ],
    },
    {
        title: "Camera",
        controls: [
            { key: "cameraFovDeg", label: "Camera FoV", min: 5, max: 80, step: 1 },
            { key: "cameraDistance", label: "Camera Distance", min: 1.7, max: 8.0, step: 0.01 },
        ],
    },
];

const controlsByKey = new Map();

const canvas = document.getElementById("tuner-canvas");
const controlsRoot = document.getElementById("tuner-controls-root");
const jsonBox = document.getElementById("tuner-json");
const presetMainButton = document.getElementById("tuner-preset-main");
const resetButton = document.getElementById("tuner-reset");
const copyButton = document.getElementById("tuner-copy");
const applyButton = document.getElementById("tuner-apply");
const openMissionLink = document.getElementById("tuner-open-mission-link");
const assetProfileSelect = document.getElementById("tuner-asset-profile");
const fastMoonMapInput = document.getElementById("tuner-fast-moon-map");
const fastMoonDisplacementInput = document.getElementById("tuner-fast-moon-displacement");
const qualityMoonMapInput = document.getElementById("tuner-quality-moon-map");
const qualityMoonDisplacementInput = document.getElementById("tuner-quality-moon-displacement");
const reloadAssetsButton = document.getElementById("tuner-reload-assets");
const resetAssetsButton = document.getElementById("tuner-reset-assets");
const assetStatus = document.getElementById("tuner-asset-status");

let moonMaterial = null;
let moonMesh = null;
let baseTexture = null;
let heightTexture = null;
let generatedNormalMap = null;
let shaderRef = null;
let cameraYaw = -0.35;
let cameraPitch = 0.22;
let isDragging = false;
let dragLastX = 0;
let dragLastY = 0;
let normalMapRegenTimer = null;
let assetProfiles = resolveMoonRenderAssetProfiles();
let activeAssetProfile = resolveMoonRenderAssetSelection().profile;
let renderSettingsByProfile = resolveMoonRenderProfileSettings();
let defaultsState = createTunerStateFromRenderSettings(renderSettingsByProfile[activeAssetProfile]);
const state = { ...defaultsState };

function describeAssetProfile(profileName) {
    if (profileName === "low") return "Low";
    if (profileName === "quality") return "High";
    return "Medium";
}

function normalizeAssetProfile(profileName) {
    if (profileName === "low" || profileName === "quality") return profileName;
    return "fast";
}

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x03070f);

const camera = new THREE.PerspectiveCamera(state.cameraFovDeg, 1, 0.01, 50);
scene.add(camera);

const primaryLight = new THREE.DirectionalLight(0xffffff, state.primaryIntensity);
const earthshineLight = new THREE.DirectionalLight(0x9fb2d8, state.earthshineIntensity);
const ambientLight = new THREE.AmbientLight(0x222222, state.ambientIntensity);
scene.add(primaryLight);
scene.add(primaryLight.target);
scene.add(earthshineLight);
scene.add(earthshineLight.target);
scene.add(ambientLight);

const moonContainer = new THREE.Group();
scene.add(moonContainer);

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function getStorage() {
    try {
        return window.localStorage;
    } catch {
        return null;
    }
}

function cloneDefaultAssetProfiles() {
    return {
        fast: { ...DEFAULT_MOON_RENDER_ASSET_PROFILES.fast },
        quality: { ...DEFAULT_MOON_RENDER_ASSET_PROFILES.quality },
    };
}

function normalizeAssetPath(value, fallbackValue) {
    const normalized = String(value || "").trim();
    return normalized || fallbackValue;
}

function setAssetStatusMessage(message, { isError = false } = {}) {
    if (!assetStatus) {
        return;
    }
    assetStatus.textContent = message;
    assetStatus.style.color = isError ? "#ffd2d2" : "";
}

function updateOpenMissionLink() {
    if (!openMissionLink) {
        return;
    }
    openMissionLink.href = `chandrayaan3/?moonRenderProfile=${encodeURIComponent(activeAssetProfile)}`;
}

function syncDefaultsStateFromActiveProfile() {
    defaultsState = createTunerStateFromRenderSettings(renderSettingsByProfile[activeAssetProfile]);
}

function applyActiveProfilePreset() {
    syncDefaultsStateFromActiveProfile();
    state.geometryWidthSegments = defaultsState.geometryWidthSegments;
    state.geometryHeightSegments = defaultsState.geometryHeightSegments;
    state.terminatorReliefStrength = defaultsState.terminatorReliefStrength;
    state.terminatorShadowFloor = defaultsState.terminatorShadowFloor;
    state.terminatorIndirectOcclusion = defaultsState.terminatorIndirectOcclusion;
    state.terrainReliefStrength = defaultsState.terrainReliefStrength;
    state.terrainShadowStrength = defaultsState.terrainShadowStrength;
    state.terrainShadowTexelStride = defaultsState.terrainShadowTexelStride;
    state.terrainShadowSlopeBias = defaultsState.terrainShadowSlopeBias;
    applyPreset(defaultsState);
}

function syncAssetControlsFromState() {
    if (assetProfileSelect) {
        assetProfileSelect.value = activeAssetProfile;
    }
    if (fastMoonMapInput) {
        fastMoonMapInput.value = assetProfiles.fast.moonMap;
    }
    if (fastMoonDisplacementInput) {
        fastMoonDisplacementInput.value = assetProfiles.fast.moonDisplacementMap;
    }
    if (qualityMoonMapInput) {
        qualityMoonMapInput.value = assetProfiles.quality.moonMap;
    }
    if (qualityMoonDisplacementInput) {
        qualityMoonDisplacementInput.value = assetProfiles.quality.moonDisplacementMap;
    }
    updateOpenMissionLink();
}

function getAssetProfilesFromControls() {
    return {
        fast: {
            moonMap: normalizeAssetPath(
                fastMoonMapInput?.value,
                DEFAULT_MOON_RENDER_ASSET_PROFILES.fast.moonMap,
            ),
            moonDisplacementMap: normalizeAssetPath(
                fastMoonDisplacementInput?.value,
                DEFAULT_MOON_RENDER_ASSET_PROFILES.fast.moonDisplacementMap,
            ),
        },
        quality: {
            moonMap: normalizeAssetPath(
                qualityMoonMapInput?.value,
                DEFAULT_MOON_RENDER_ASSET_PROFILES.quality.moonMap,
            ),
            moonDisplacementMap: normalizeAssetPath(
                qualityMoonDisplacementInput?.value,
                DEFAULT_MOON_RENDER_ASSET_PROFILES.quality.moonDisplacementMap,
            ),
        },
    };
}

function persistAssetControls() {
    assetProfiles = getAssetProfilesFromControls();
    activeAssetProfile = normalizeAssetProfile(assetProfileSelect?.value);
    window.MOON_RENDER_ASSET_PATHS = assetProfiles;
    window.MOON_RENDER_ASSET_PROFILE = activeAssetProfile;

    const storage = getStorage();
    storage?.setItem?.(MOON_RENDER_ASSET_PROFILE_STORAGE_KEY, activeAssetProfile);
    storage?.setItem?.(MOON_RENDER_ASSET_PATHS_STORAGE_KEY, JSON.stringify(assetProfiles));
    updateOpenMissionLink();
}

function resetPersistedAssetControls() {
    const storage = getStorage();
    storage?.removeItem?.(MOON_RENDER_ASSET_PROFILE_STORAGE_KEY);
    storage?.removeItem?.(MOON_RENDER_ASSET_PATHS_STORAGE_KEY);
    delete window.MOON_RENDER_ASSET_PATHS;
    delete window.MOON_RENDER_ASSET_PROFILE;
    assetProfiles = cloneDefaultAssetProfiles();
    activeAssetProfile = "fast";
    syncAssetControlsFromState();
}

function degreesToRadians(value) {
    return (Number(value) || 0) * Math.PI / 180;
}

function directionFromAzEl(azimuthDeg, elevationDeg) {
    const az = degreesToRadians(azimuthDeg);
    const el = degreesToRadians(elevationDeg);
    const cosEl = Math.cos(el);
    return new THREE.Vector3(
        cosEl * Math.cos(az),
        Math.sin(el),
        cosEl * Math.sin(az),
    ).normalize();
}

function updateCamera() {
    camera.fov = state.cameraFovDeg;
    camera.updateProjectionMatrix();
    const radius = state.cameraDistance;
    const cosPitch = Math.cos(cameraPitch);
    camera.position.set(
        radius * cosPitch * Math.cos(cameraYaw),
        radius * Math.sin(cameraPitch),
        radius * cosPitch * Math.sin(cameraYaw),
    );
    camera.lookAt(0, 0, 0);
}

function buildTunerNormalMap(heightTex) {
    if (!heightTex?.image || Number(heightTex.image.width) <= 1 || Number(heightTex.image.height) <= 1) {
        return null;
    }
    return buildMoonNormalMapFromHeightTexture(heightTex, {
        normalMapStrength: state.normalMapStrength,
        normalMapMaxWidth: Math.max(512, Math.round(state.normalMapMaxWidth)),
        normalDetailBoost: state.normalDetailBoost,
        normalDetailRadius: state.normalDetailRadius,
    });
}

function resolveHeightTexelSize() {
    const width = Number(heightTexture?.image?.width);
    const height = Number(heightTexture?.image?.height);
    return new THREE.Vector2(
        1 / Math.max(1, Number.isFinite(width) ? width : state.normalMapMaxWidth),
        1 / Math.max(1, Number.isFinite(height) ? height : Math.round(state.normalMapMaxWidth / 2)),
    );
}

function applyPhotometricShader(material) {
    material.onBeforeCompile = (shader) => {
        shaderRef = shader;
        shader.uniforms.uMoonLsBlend = { value: state.lommelSeeligerBlend };
        shader.uniforms.uMoonLsClampMin = { value: state.lsClampMin };
        shader.uniforms.uMoonLsClampMax = { value: state.lsClampMax };
        shader.uniforms.uMoonOppositionStrength = { value: state.oppositionStrength };
        shader.uniforms.uMoonShadowLift = { value: state.shadowLift };
        shader.uniforms.uMoonHighlightBoost = { value: state.highlightBoost };
        shader.uniforms.uMoonShadowWeightExponent = { value: state.shadowWeightExponent };
        shader.uniforms.uMoonHighlightWeightExponent = { value: state.highlightWeightExponent };
        shader.uniforms.uMoonTerminatorContrast = { value: state.terminatorContrast };
        shader.uniforms.uMoonTerminatorReliefStrength = { value: state.terminatorReliefStrength };
        shader.uniforms.uMoonTerminatorShadowFloor = { value: state.terminatorShadowFloor };
        shader.uniforms.uMoonTerminatorIndirectOcclusion = { value: state.terminatorIndirectOcclusion };
        shader.uniforms.uMoonHeightMap = { value: heightTexture || material.displacementMap || null };
        shader.uniforms.uMoonHeightTexelSize = { value: resolveHeightTexelSize() };
        shader.uniforms.uMoonTerrainReliefStrength = { value: state.terrainReliefStrength };
        shader.uniforms.uMoonTerrainShadowStrength = { value: state.terrainShadowStrength };
        shader.uniforms.uMoonTerrainShadowTexelStride = { value: state.terrainShadowTexelStride };
        shader.uniforms.uMoonTerrainShadowSlopeBias = { value: state.terrainShadowSlopeBias };

        shader.fragmentShader = shader.fragmentShader
            .replace(
                "#include <common>",
                `#include <common>
uniform float uMoonLsBlend;
uniform float uMoonLsClampMin;
uniform float uMoonLsClampMax;
uniform float uMoonOppositionStrength;
uniform float uMoonShadowLift;
uniform float uMoonHighlightBoost;
uniform float uMoonShadowWeightExponent;
uniform float uMoonHighlightWeightExponent;
uniform float uMoonTerminatorContrast;
uniform float uMoonTerminatorReliefStrength;
uniform float uMoonTerminatorShadowFloor;
uniform float uMoonTerminatorIndirectOcclusion;
uniform sampler2D uMoonHeightMap;
uniform vec2 uMoonHeightTexelSize;
uniform float uMoonTerrainReliefStrength;
uniform float uMoonTerrainShadowStrength;
uniform float uMoonTerrainShadowTexelStride;
uniform float uMoonTerrainShadowSlopeBias;

const float MOON_SUN_SIN_ALPHA = 0.00466;
const float MOON_INV_PI        = 0.31830988618;

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
float moonFinalCavityDarken = 0.0;
vec3 moonEarthshineDirectKept = vec3( 0.0 );
#if NUM_DIR_LIGHTS > 0
    vec3 moonNormal = normalize( geometryNormal );
    vec3 moonViewDir = normalize( geometryViewDir );
    vec3 moonLightDir = normalize( directionalLights[0].direction );
    float moonNdotL = clamp( dot( moonNormal, moonLightDir ), 0.0, 1.0 );
    float moonNdotV = clamp( dot( moonNormal, moonViewDir ), 0.0, 1.0 );

    // Sun-disk visibility on the SMOOTH normal, applied only to the Sun's
    // contribution. Earthshine on directionalLights[1] is held aside and
    // restored after dark-side multipliers. See moon-renderer.js for full
    // physics-scope rationale.
    float moonSunShadowFactor = 1.0;
    #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
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
    float moonSmoothRawNdotLForVis = dot( normalize( nonPerturbedNormal ), moonLightDir );
    float moonSmoothNdotL = clamp( moonSmoothRawNdotLForVis, 0.0, 1.0 );
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
    moonTerrainHorizonLift = clamp(
        moonTerrainProminence * moonTerrainProminenceWeight * moonTerminatorVisibilityBand * moonSunwardFacetWeight * 4.8,
        0.0,
        0.038
    ) * step( 0.0001, uMoonTerrainReliefStrength );

    float moonCavityBand = smoothstep( 0.018, 0.10, moonSmoothNdotL )
        * ( 1.0 - smoothstep( 0.24, 0.42, moonSmoothNdotL ) );
    float moonTerrainCavity = max( 0.0, moonNeighborHeightAverage - moonCenterHeight );
    float moonCavityOcclusion = smoothstep( 0.0015, 0.0085, moonTerrainCavity )
        * moonCavityBand
        * uMoonTerrainReliefStrength;
    moonFinalCavityDarkenFromHeight = clamp( moonCavityOcclusion * 0.10, 0.0, 0.18 );
#endif

    float moonEffectiveRawNdotLForVis = moonSmoothRawNdotLForVis + moonTerrainHorizonLift;
    float moonSunVisibility = moonSunDiskVisibleFraction( moonEffectiveRawNdotLForVis );
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

    float moonTerminatorScaleRaw = pow( max( moonNdotL, 1e-4 ), max(1.0, uMoonTerminatorContrast) - 1.0 );
    float moonTerminatorScale = mix( 1.0, moonTerminatorScaleRaw, 0.42 );
    reflectedLight.directDiffuse *= moonTerminatorScale;

    float moonTerminatorReliefBoost = max( 0.0, uMoonTerminatorContrast - 1.0 ) * max( 0.0, uMoonTerminatorReliefStrength );
    float moonReliefBandT = clamp( ( uMoonTerminatorReliefStrength - 1.0 ) / 6.5, 0.0, 1.0 );
    float moonTerminatorOuter = mix( 0.42, 0.28, moonReliefBandT );
    float moonTerminatorBand = 1.0 - smoothstep( 0.06, moonTerminatorOuter, moonNdotL );
    float moonTerrainReliefBand = 1.0 - smoothstep( 0.025, max( moonTerminatorOuter, 0.20 ), moonSmoothNdotL );
    float moonShadowWeight = pow( 1.0 - moonNdotL, max(0.2, uMoonShadowWeightExponent) );
    float moonHighlightWeight = pow( moonNdotL, max(0.2, uMoonHighlightWeightExponent) );
    float moonShadowCrush = mix( 0.18, 0.24, moonReliefBandT ) * moonTerminatorReliefBoost * moonTerminatorBand;
    float moonHighlightLift = mix( 0.04, 0.055, moonReliefBandT ) * moonTerminatorReliefBoost * moonTerminatorBand;
    float moonShadowTarget = max( clamp( uMoonTerminatorShadowFloor, 0.0, 1.0 ), 1.0 + uMoonShadowLift - moonShadowCrush );
    float moonHighlightTarget = uMoonHighlightBoost + moonHighlightLift;
    float moonShadowTone = mix(1.0, moonShadowTarget, moonShadowWeight);
    float moonHighlightTone = mix(1.0, moonHighlightTarget, moonHighlightWeight);
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
            float moonSampleDistance = float( moonSampleIndex );
            float moonSampleHeight = texture2D( uMoonHeightMap, moonHeightUv + moonLightUvStep * moonSampleDistance ).r;
            float moonRequiredRise = moonSunSlope * moonSlopeScale * moonSampleDistance * 7.0;
            float moonBlockerRise = moonSampleHeight - moonBaseHeight - moonRequiredRise;
            float moonSampleShadow = smoothstep(
                0.0012,
                0.0065,
                moonBlockerRise
            );
            moonHorizonShadow = max( moonHorizonShadow, moonSampleShadow );
        }
        moonTerrainSelfShadow = moonHorizonShadow;
    }
    float moonTerrainShadowBand = moonTerrainReliefBand
        * pow( 1.0 - moonSmoothNdotL, 1.4 );
    float moonTerrainShadow = clamp(
        moonTerrainSelfShadow * moonTerrainShadowBand * uMoonTerrainShadowStrength,
        0.0,
        0.78
    );
    reflectedLight.directDiffuse *= 1.0 - moonTerrainShadow;
#endif
#endif`,
            )
            .replace(
                "vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;",
                `vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
#if NUM_DIR_LIGHTS > 0
    float moonFinalTerrainTone = clamp( 1.0 - moonFinalCavityDarken * 0.40, 0.55, 1.0 );
    float moonFinalShadowCrush = mix(
        0.18,
        1.0,
        smoothstep( -MOON_SUN_SIN_ALPHA, 0.025, moonEffectiveRawNdotLForVis )
    );
    outgoingLight *= moonFinalTerrainTone * moonFinalShadowCrush;
    // Restore earthshine after dark-side crush. Cavity AO applies; shadow
    // crush does not (earthshine is the reason the dark side isn't black).
    outgoingLight += moonEarthshineDirectKept * moonFinalTerrainTone;
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
    material.customProgramCacheKey = () => "moon-render-tuner-v10-split-terrain-relief";
}

function updateShaderUniforms() {
    if (!shaderRef || !shaderRef.uniforms) return;
    shaderRef.uniforms.uMoonLsBlend.value = state.lommelSeeligerBlend;
    shaderRef.uniforms.uMoonLsClampMin.value = state.lsClampMin;
    shaderRef.uniforms.uMoonLsClampMax.value = state.lsClampMax;
    shaderRef.uniforms.uMoonOppositionStrength.value = state.oppositionStrength;
    shaderRef.uniforms.uMoonShadowLift.value = state.shadowLift;
    shaderRef.uniforms.uMoonHighlightBoost.value = state.highlightBoost;
    shaderRef.uniforms.uMoonShadowWeightExponent.value = state.shadowWeightExponent;
    shaderRef.uniforms.uMoonHighlightWeightExponent.value = state.highlightWeightExponent;
    shaderRef.uniforms.uMoonTerminatorContrast.value = state.terminatorContrast;
    if (shaderRef.uniforms.uMoonTerminatorReliefStrength) {
        shaderRef.uniforms.uMoonTerminatorReliefStrength.value = state.terminatorReliefStrength;
    }
    if (shaderRef.uniforms.uMoonTerminatorShadowFloor) {
        shaderRef.uniforms.uMoonTerminatorShadowFloor.value = state.terminatorShadowFloor;
    }
    if (shaderRef.uniforms.uMoonTerminatorIndirectOcclusion) {
        shaderRef.uniforms.uMoonTerminatorIndirectOcclusion.value = state.terminatorIndirectOcclusion;
    }
    if (shaderRef.uniforms.uMoonHeightMap) {
        shaderRef.uniforms.uMoonHeightMap.value = heightTexture || moonMaterial?.displacementMap || null;
    }
    if (shaderRef.uniforms.uMoonHeightTexelSize) {
        shaderRef.uniforms.uMoonHeightTexelSize.value.copy(resolveHeightTexelSize());
    }
    if (shaderRef.uniforms.uMoonTerrainReliefStrength) {
        shaderRef.uniforms.uMoonTerrainReliefStrength.value = state.terrainReliefStrength;
    }
    if (shaderRef.uniforms.uMoonTerrainShadowStrength) {
        shaderRef.uniforms.uMoonTerrainShadowStrength.value = state.terrainShadowStrength;
    }
    if (shaderRef.uniforms.uMoonTerrainShadowTexelStride) {
        shaderRef.uniforms.uMoonTerrainShadowTexelStride.value = state.terrainShadowTexelStride;
    }
    if (shaderRef.uniforms.uMoonTerrainShadowSlopeBias) {
        shaderRef.uniforms.uMoonTerrainShadowSlopeBias.value = state.terrainShadowSlopeBias;
    }
}

function updateLightSettings() {
    primaryLight.intensity = state.primaryIntensity;
    ambientLight.intensity = state.ambientIntensity;
    earthshineLight.intensity = state.earthshineIntensity;
    primaryLight.position.copy(directionFromAzEl(state.primaryAzimuthDeg, state.primaryElevationDeg).multiplyScalar(8));
    earthshineLight.position.copy(directionFromAzEl(state.earthshineAzimuthDeg, state.earthshineElevationDeg).multiplyScalar(6));
}

function updateMaterialSettings() {
    if (!moonMaterial) return;
    moonMaterial.normalScale.set(state.normalScaleX, state.normalScaleY);
    moonMaterial.displacementScale = state.displacementScale;
    moonMaterial.displacementBias = state.displacementBias;
    moonMaterial.roughness = state.roughness;
    moonMaterial.metalness = state.metalness;
    moonMaterial.needsUpdate = true;
    updateShaderUniforms();
}

function applyRendererSettings() {
    renderer.toneMappingExposure = state.toneExposure;
}

function scheduleNormalMapRebuild() {
    if (!heightTexture || !moonMaterial) return;
    if (normalMapRegenTimer) {
        window.clearTimeout(normalMapRegenTimer);
        normalMapRegenTimer = null;
    }
    normalMapRegenTimer = window.setTimeout(() => {
        normalMapRegenTimer = null;
        const rebuilt = buildTunerNormalMap(heightTexture);
        if (!rebuilt) return;
        if (generatedNormalMap) generatedNormalMap.dispose();
        generatedNormalMap = rebuilt;
        moonMaterial.normalMap = generatedNormalMap;
        moonMaterial.needsUpdate = true;
    }, 140);
}

function serializeState() {
    return {
        version: 1,
        target: "moon-render",
        values: { ...state },
    };
}

function updateJsonBox() {
    jsonBox.value = JSON.stringify(serializeState(), null, 2);
}

function clampControlValue(control, rawValue) {
    const numeric = Number(rawValue);
    const safe = Number.isFinite(numeric) ? numeric : defaultsState[control.key];
    return clamp(safe, control.min, control.max);
}

function applyControlValue(control, nextValue, source = null) {
    const value = clampControlValue(control, nextValue);
    state[control.key] = value;
    const controlRefs = controlsByKey.get(control.key);
    if (controlRefs) {
        if (source !== controlRefs.slider) controlRefs.slider.value = String(value);
        if (source !== controlRefs.number) controlRefs.number.value = String(value);
    }

    if (control.key === "cameraFovDeg" || control.key === "cameraDistance") {
        updateCamera();
    } else if (
        control.key === "normalMapStrength" ||
        control.key === "normalMapMaxWidth" ||
        control.key === "normalDetailBoost" ||
        control.key === "normalDetailRadius"
    ) {
        scheduleNormalMapRebuild();
    } else if (
        control.key === "primaryIntensity"
        || control.key === "ambientIntensity"
        || control.key === "earthshineIntensity"
        || control.key === "primaryAzimuthDeg"
        || control.key === "primaryElevationDeg"
        || control.key === "earthshineAzimuthDeg"
        || control.key === "earthshineElevationDeg"
    ) {
        updateLightSettings();
    } else if (control.key === "toneExposure") {
        applyRendererSettings();
    } else {
        updateMaterialSettings();
    }

    updateJsonBox();
}

function createControls() {
    controlsRoot.innerHTML = "";
    CONTROL_GROUPS.forEach((group) => {
        const groupEl = document.createElement("section");
        groupEl.className = "tuner-group";

        const titleEl = document.createElement("h2");
        titleEl.className = "tuner-group-title";
        titleEl.textContent = group.title;
        groupEl.appendChild(titleEl);

        group.controls.forEach((control) => {
            const rowEl = document.createElement("div");
            rowEl.className = "tuner-row";

            const sliderWrap = document.createElement("div");
            const labelEl = document.createElement("label");
            labelEl.className = "tuner-label";
            labelEl.textContent = control.label;
            sliderWrap.appendChild(labelEl);

            const sliderEl = document.createElement("input");
            sliderEl.className = "tuner-slider";
            sliderEl.type = "range";
            sliderEl.min = String(control.min);
            sliderEl.max = String(control.max);
            sliderEl.step = String(control.step);
            sliderEl.value = String(state[control.key]);
            sliderWrap.appendChild(sliderEl);

            const numberEl = document.createElement("input");
            numberEl.className = "tuner-number";
            numberEl.type = "number";
            numberEl.min = String(control.min);
            numberEl.max = String(control.max);
            numberEl.step = String(control.step);
            numberEl.value = String(state[control.key]);

            sliderEl.addEventListener("input", (event) => {
                applyControlValue(control, event.target.value, sliderEl);
            });
            numberEl.addEventListener("input", (event) => {
                applyControlValue(control, event.target.value, numberEl);
            });

            controlsByKey.set(control.key, { slider: sliderEl, number: numberEl, meta: control });
            rowEl.appendChild(sliderWrap);
            rowEl.appendChild(numberEl);
            groupEl.appendChild(rowEl);
        });

        controlsRoot.appendChild(groupEl);
    });
}

function parseAndApplyJson(text) {
    const parsed = JSON.parse(text);
    const values = parsed && typeof parsed === "object" && parsed.values ? parsed.values : parsed;
    if (!values || typeof values !== "object") return;

    CONTROL_GROUPS.forEach((group) => {
        group.controls.forEach((control) => {
            if (Object.prototype.hasOwnProperty.call(values, control.key)) {
                applyControlValue(control, values[control.key], null);
            }
        });
    });
}

function applyPreset(presetValues) {
    if (!presetValues || typeof presetValues !== "object") return;
    CONTROL_GROUPS.forEach((group) => {
        group.controls.forEach((control) => {
            if (Object.prototype.hasOwnProperty.call(presetValues, control.key)) {
                applyControlValue(control, presetValues[control.key], null);
            }
        });
    });
}

function attachButtons() {
    presetMainButton.addEventListener("click", () => {
        applyActiveProfilePreset();
        presetMainButton.textContent = "Main Preset Applied";
        window.setTimeout(() => { presetMainButton.textContent = "Main App Preset"; }, 1400);
    });

    resetButton.addEventListener("click", () => {
        applyActiveProfilePreset();
        cameraYaw = -0.35;
        cameraPitch = 0.22;
        updateCamera();
    });

    copyButton.addEventListener("click", async () => {
        updateJsonBox();
        const text = jsonBox.value;
        try {
            await navigator.clipboard.writeText(text);
            copyButton.textContent = "Copied";
            window.setTimeout(() => { copyButton.textContent = "Copy JSON"; }, 1200);
        } catch {
            jsonBox.focus();
            jsonBox.select();
            copyButton.textContent = "Select + Ctrl+C";
            window.setTimeout(() => { copyButton.textContent = "Copy JSON"; }, 1500);
        }
    });

    applyButton.addEventListener("click", () => {
        try {
            parseAndApplyJson(jsonBox.value);
            applyButton.textContent = "Applied";
            window.setTimeout(() => { applyButton.textContent = "Apply JSON"; }, 1200);
        } catch (error) {
            applyButton.textContent = "Invalid JSON";
            window.setTimeout(() => { applyButton.textContent = "Apply JSON"; }, 1500);
            console.error(error);
        }
    });

    assetProfileSelect?.addEventListener("change", () => {
        activeAssetProfile = normalizeAssetProfile(assetProfileSelect.value);
        applyActiveProfilePreset();
        updateOpenMissionLink();
        setAssetStatusMessage(
            `Selected ${describeAssetProfile(activeAssetProfile)} profile. Reload assets to apply textures.`,
        );
    });

    reloadAssetsButton?.addEventListener("click", () => {
        reloadMoonAssets().catch((error) => {
            console.error(error);
            setAssetStatusMessage("Failed to reload Moon assets. Check console for details.", { isError: true });
            reloadAssetsButton.disabled = false;
            resetAssetsButton.disabled = false;
        });
    });

    resetAssetsButton?.addEventListener("click", () => {
        resetPersistedAssetControls();
        setAssetStatusMessage("Reset Moon asset paths to defaults. Reload assets to apply.");
    });
}

function attachPointerControls() {
    canvas.addEventListener("pointerdown", (event) => {
        isDragging = true;
        dragLastX = event.clientX;
        dragLastY = event.clientY;
        canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointermove", (event) => {
        if (!isDragging) return;
        const dx = event.clientX - dragLastX;
        const dy = event.clientY - dragLastY;
        dragLastX = event.clientX;
        dragLastY = event.clientY;
        cameraYaw -= dx * 0.0045;
        cameraPitch = clamp(cameraPitch - dy * 0.0038, -1.45, 1.45);
        updateCamera();
    });
    const endDrag = () => { isDragging = false; };
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);

    canvas.addEventListener("wheel", (event) => {
        event.preventDefault();
        state.cameraDistance = clamp(state.cameraDistance * (event.deltaY > 0 ? 1.055 : 0.945), 1.7, 8.0);
        const refs = controlsByKey.get("cameraDistance");
        if (refs) {
            refs.slider.value = String(state.cameraDistance);
            refs.number.value = String(state.cameraDistance);
        }
        updateCamera();
        updateJsonBox();
    }, { passive: false });

    canvas.addEventListener("dblclick", () => {
        cameraYaw = -0.35;
        cameraPitch = 0.22;
        updateCamera();
    });
}

function resize() {
    const width = canvas.clientWidth || 1;
    const height = canvas.clientHeight || 1;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
}

function configureLoadedMoonTextures(nextBaseTexture, nextHeightTexture) {
    nextBaseTexture.colorSpace = THREE.SRGBColorSpace;
    nextBaseTexture.wrapS = THREE.ClampToEdgeWrapping;
    nextBaseTexture.wrapT = THREE.ClampToEdgeWrapping;
    if (nextHeightTexture) {
        nextHeightTexture.wrapS = THREE.ClampToEdgeWrapping;
        nextHeightTexture.wrapT = THREE.ClampToEdgeWrapping;
    }
}

function disposeIfDifferent(previousTexture, nextTexture) {
    if (previousTexture && previousTexture !== nextTexture) {
        previousTexture.dispose();
    }
}

function createMoon() {
    const geometry = new THREE.SphereGeometry(
        1,
        state.geometryWidthSegments,
        state.geometryHeightSegments,
    );
    moonMaterial = new THREE.MeshStandardMaterial({
        map: baseTexture,
        displacementMap: heightTexture,
        displacementScale: state.displacementScale,
        displacementBias: state.displacementBias,
        normalMap: generatedNormalMap,
        normalScale: new THREE.Vector2(state.normalScaleX, state.normalScaleY),
        roughness: state.roughness,
        metalness: state.metalness,
    });
    applyPhotometricShader(moonMaterial);
    moonMesh = new THREE.Mesh(geometry, moonMaterial);
    moonMesh.castShadow = false;
    moonMesh.receiveShadow = false;
    moonMesh.rotateX(Math.PI / 2);
    moonContainer.add(moonMesh);
}

function refreshMoonGeometry() {
    if (!moonMesh) return;
    const previousGeometry = moonMesh.geometry;
    moonMesh.geometry = new THREE.SphereGeometry(
        1,
        state.geometryWidthSegments,
        state.geometryHeightSegments,
    );
    previousGeometry?.dispose?.();
}

function loadTexture(url) {
    return new Promise((resolve, reject) => {
        const loader = new THREE.TextureLoader();
        loader.load(url, (tex) => resolve(tex), undefined, (err) => reject(err));
    });
}

async function loadTextureWithFallback(primaryUrl, fallbackUrl, label) {
    if (!primaryUrl) {
        return null;
    }
    try {
        return await loadTexture(primaryUrl);
    } catch (primaryError) {
        if (!fallbackUrl || fallbackUrl === primaryUrl) {
            throw primaryError;
        }
        console.warn(
            `[moon-render-tuner] Failed to load ${label} from ${primaryUrl}; falling back to ${fallbackUrl}.`,
            primaryError,
        );
        return loadTexture(fallbackUrl);
    }
}

async function reloadMoonAssets() {
    persistAssetControls();
    const selection = resolveMoonRenderAssetSelection();
    const previousBaseTexture = baseTexture;
    const previousHeightTexture = heightTexture;
    const previousNormalTexture = generatedNormalMap;

    if (reloadAssetsButton) {
        reloadAssetsButton.disabled = true;
    }
    if (resetAssetsButton) {
        resetAssetsButton.disabled = true;
    }
    setAssetStatusMessage(`Loading ${describeAssetProfile(selection.profile)} Moon surface assets...`);

    try {
        const [nextBaseTexture, nextHeightTexture] = await Promise.all([
            loadTextureWithFallback(
                selection.active.moonMap,
                selection.fallback.moonMap,
                `${selection.profile}.moonMap`,
            ),
            loadTextureWithFallback(
                selection.active.moonDisplacementMap,
                selection.fallback.moonDisplacementMap,
                `${selection.profile}.moonDisplacementMap`,
            ),
        ]);
        configureLoadedMoonTextures(nextBaseTexture, nextHeightTexture);

        const nextNormalTexture = buildTunerNormalMap(nextHeightTexture);

        baseTexture = nextBaseTexture;
        heightTexture = nextHeightTexture;
        generatedNormalMap = nextNormalTexture;
        refreshMoonGeometry();

        if (moonMaterial) {
            moonMaterial.map = baseTexture;
            moonMaterial.displacementMap = heightTexture;
            moonMaterial.normalMap = generatedNormalMap;
            moonMaterial.needsUpdate = true;
            updateMaterialSettings();
        }

        disposeIfDifferent(previousBaseTexture, baseTexture);
        disposeIfDifferent(previousHeightTexture, heightTexture);
        disposeIfDifferent(previousNormalTexture, generatedNormalMap);
        setAssetStatusMessage(`Loaded ${describeAssetProfile(selection.profile)} Moon surface assets.`);
    } catch (error) {
        console.error(error);
        setAssetStatusMessage("Failed to reload Moon assets. Check console for the failing path.", { isError: true });
    } finally {
        if (reloadAssetsButton) {
            reloadAssetsButton.disabled = false;
        }
        if (resetAssetsButton) {
            resetAssetsButton.disabled = false;
        }
        syncAssetControlsFromState();
    }
}

async function initScene() {
    const moonAssets = resolveMoonRenderAssetSelection();
    [baseTexture, heightTexture] = await Promise.all([
        loadTextureWithFallback(
            moonAssets.active.moonMap,
            moonAssets.fallback.moonMap,
            `${moonAssets.profile}.moonMap`,
        ),
        loadTextureWithFallback(
            moonAssets.active.moonDisplacementMap,
            moonAssets.fallback.moonDisplacementMap,
            `${moonAssets.profile}.moonDisplacementMap`,
        ),
    ]);
    configureLoadedMoonTextures(baseTexture, heightTexture);

    generatedNormalMap = buildTunerNormalMap(heightTexture);
    createMoon();
    applyRendererSettings();
    updateLightSettings();
    updateMaterialSettings();
    updateCamera();
    resize();
}

function animate() {
    requestAnimationFrame(animate);
    moonContainer.rotation.y += 0.00035;
    renderer.render(scene, camera);
}

function setFatalMessage(error) {
    console.error(error);
    controlsRoot.innerHTML =
        '<div class="tuner-group"><h2 class="tuner-group-title">Error</h2><p style="margin:0;color:#ffd2d2;font-size:12px;">Failed to initialize tuner. Check console for details.</p></div>';
}

createControls();
syncAssetControlsFromState();
attachButtons();
attachPointerControls();
updateJsonBox();
window.addEventListener("resize", resize);

initScene()
    .then(() => animate())
    .catch((error) => setFatalMessage(error));
