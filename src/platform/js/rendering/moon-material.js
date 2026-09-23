// @ts-nocheck
import * as THREE from "three";
import { DEFAULT_MOON_RENDER_PROFILE_SETTINGS } from "../app/moon-render-asset-profiles.js";
import { normalizeMoonRenderPipelineState } from "../app/moon-render-pipeline.js";

const DEFAULT_MOON_RENDER_SETTINGS = DEFAULT_MOON_RENDER_PROFILE_SETTINGS.fast;

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
export {
    DEFAULT_MOON_RENDER_SETTINGS,
    normalizeMoonRenderSettings,
    applyMoonRenderSettingsToMaterial,
    resolvePipelineRenderSettings,
    applyMoonPipelineStagesToMaterial,
    applyMoonPhotometricShader,
};
