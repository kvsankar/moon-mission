import { replaceTextureOwner, updateTextureOwner, detachTextureOwner } from "./texture-ownership.js";
/**
 * Earth Renderer - Earth sphere with texture, axis, and poles
 *
 * Manages Earth visualization:
 * - Textured sphere with specular map
 * - Polar axis line
 * - North/South pole markers
 * - Tilted to match Earth's axial inclination
 */

import * as THREE from 'three';
import { COLORS as COL, PHYSICS_CONSTANTS as PC } from '../core/constants.js';
import { BodyLatLonOverlay } from "./body-lat-lon-overlay.js";

const EARTH_NIGHTSIDE_LIFT = 0.0;
const EARTH_MOONSHINE_LIFT = 0.0;
const EARTH_NIGHTSIDE_EXPONENT = 1.45;
const EARTH_NIGHTSIDE_DIFFUSE_SCALE = 0.085;
const EARTH_NIGHTSIDE_EMISSIVE_SCALE = 0.018;
const EARTH_MOONSHINE_DIFFUSE_SCALE = 0.115;
const EARTH_MOONSHINE_EMISSIVE_SCALE = 0.010;
const EARTH_NIGHT_CLOUD_DIFFUSE_SCALE = 0.140;
const EARTH_NIGHT_CLOUD_EMISSIVE_SCALE = 0.026;
const EARTH_DAY_GAIN = 1.0;
const EARTH_DAY_SATURATION = 1.0;
const EARTH_ATMOSPHERE_RIM_STRENGTH = 0.0;
const EARTH_TWILIGHT_REFRACTION_STRENGTH = 0.42;
const EARTH_TWILIGHT_REFRACTION_WIDTH = 0.34;
const EARTH_NIGHT_MAP_INTENSITY = 0.08;
const EARTH_NIGHT_MAP_EXPONENT = 2.25;
const EARTH_PHOTO_BLEND = 0.0;

function applyEarthNightsideLiftShader(material) {
    material.userData = material.userData || {};
    if (!Number.isFinite(material.userData.earthNightsideLift)) {
        material.userData.earthNightsideLift = EARTH_NIGHTSIDE_LIFT;
    }
    if (!Number.isFinite(material.userData.earthMoonshineLift)) {
        material.userData.earthMoonshineLift = EARTH_MOONSHINE_LIFT;
    }
    if (!Number.isFinite(material.userData.earthNightsideExponent)) {
        material.userData.earthNightsideExponent = EARTH_NIGHTSIDE_EXPONENT;
    }
    if (!Number.isFinite(material.userData.earthDayGain)) {
        material.userData.earthDayGain = EARTH_DAY_GAIN;
    }
    if (!Number.isFinite(material.userData.earthDaySaturation)) {
        material.userData.earthDaySaturation = EARTH_DAY_SATURATION;
    }
    if (!Number.isFinite(material.userData.earthAtmosphereRimStrength)) {
        material.userData.earthAtmosphereRimStrength = EARTH_ATMOSPHERE_RIM_STRENGTH;
    }
    if (!Number.isFinite(material.userData.earthTwilightRefractionStrength)) {
        material.userData.earthTwilightRefractionStrength = EARTH_TWILIGHT_REFRACTION_STRENGTH;
    }
    if (!Number.isFinite(material.userData.earthTwilightRefractionWidth)) {
        material.userData.earthTwilightRefractionWidth = EARTH_TWILIGHT_REFRACTION_WIDTH;
    }
    if (!Number.isFinite(material.userData.earthNightMapIntensity)) {
        material.userData.earthNightMapIntensity = EARTH_NIGHT_MAP_INTENSITY;
    }
    if (!Number.isFinite(material.userData.earthNightMapExponent)) {
        material.userData.earthNightMapExponent = EARTH_NIGHT_MAP_EXPONENT;
    }
    if (!Number.isFinite(material.userData.earthPhotoBlend)) {
        material.userData.earthPhotoBlend = EARTH_PHOTO_BLEND;
    }
    if (!material.userData.earthPhotoTexture) {
        material.userData.earthPhotoTexture = material.map || null;
    }
    if (!(material.userData.earthNightsideShaders instanceof Set)) {
        material.userData.earthNightsideShaders = new Set();
    }
    material.onBeforeCompile = (shader) => {
        shader.uniforms.uEarthNightsideLift = { value: material.userData.earthNightsideLift };
        shader.uniforms.uEarthMoonshineLift = { value: material.userData.earthMoonshineLift };
        shader.uniforms.uEarthNightsideExponent = { value: material.userData.earthNightsideExponent };
        shader.uniforms.uEarthDayGain = { value: material.userData.earthDayGain };
        shader.uniforms.uEarthDaySaturation = { value: material.userData.earthDaySaturation };
        shader.uniforms.uEarthAtmosphereRimStrength = { value: material.userData.earthAtmosphereRimStrength };
        shader.uniforms.uEarthTwilightRefractionStrength = { value: material.userData.earthTwilightRefractionStrength };
        shader.uniforms.uEarthTwilightRefractionWidth = { value: material.userData.earthTwilightRefractionWidth };
        shader.uniforms.uEarthNightMapIntensity = { value: material.userData.earthNightMapIntensity };
        shader.uniforms.uEarthNightMapExponent = { value: material.userData.earthNightMapExponent };
        shader.uniforms.uEarthPhotoBlend = { value: material.userData.earthPhotoBlend };
        shader.uniforms.uEarthPhotoMap = { value: material.userData.earthPhotoTexture || material.map || null };
        material.userData.earthNightsideShader = shader;
        material.userData.earthNightsideShaders.add(shader);

        shader.fragmentShader = shader.fragmentShader
            .replace(
                "#include <common>",
                `#include <common>
uniform float uEarthNightsideLift;
uniform float uEarthMoonshineLift;
uniform float uEarthNightsideExponent;
uniform float uEarthDayGain;
uniform float uEarthDaySaturation;
uniform float uEarthAtmosphereRimStrength;
uniform float uEarthTwilightRefractionStrength;
uniform float uEarthTwilightRefractionWidth;
uniform float uEarthNightMapIntensity;
uniform float uEarthNightMapExponent;
uniform float uEarthPhotoBlend;
uniform sampler2D uEarthPhotoMap;`,
            )
            .replace(
                "#include <map_fragment>",
                `#include <map_fragment>
vec3 earthAmbientSurfaceColor = diffuseColor.rgb;
vec3 earthCloudSurfaceColor = earthAmbientSurfaceColor;
float earthCloudBlend = 0.0;
float earthNightCloudMask = 0.0;
#ifdef USE_MAP
    float earthPhotoBlend = clamp( uEarthPhotoBlend, 0.0, 1.0 );
    earthCloudBlend = earthPhotoBlend;
    if ( earthPhotoBlend > 0.0 ) {
        vec4 earthPhotoTexel = texture2D( uEarthPhotoMap, vMapUv );
        earthCloudSurfaceColor = mix( diffuseColor.rgb, earthPhotoTexel.rgb, earthPhotoBlend );
        diffuseColor.rgb = earthCloudSurfaceColor;
        float earthCloudBaseLuma = dot( earthAmbientSurfaceColor, vec3(0.2126, 0.7152, 0.0722) );
        float earthCloudPhotoLuma = dot( earthCloudSurfaceColor, vec3(0.2126, 0.7152, 0.0722) );
        float earthCloudDelta = max( earthCloudPhotoLuma - (earthCloudBaseLuma * 1.05), 0.0 );
        float earthCloudChroma = max(
            max( earthCloudSurfaceColor.r, earthCloudSurfaceColor.g ),
            earthCloudSurfaceColor.b
        ) - min(
            min( earthCloudSurfaceColor.r, earthCloudSurfaceColor.g ),
            earthCloudSurfaceColor.b
        );
        float earthCloudNeutrality = 1.0 - smoothstep( 0.08, 0.32, earthCloudChroma );
        earthNightCloudMask = earthCloudBlend *
            smoothstep( 0.012, 0.145, earthCloudDelta ) *
            mix( 0.45, 1.0, earthCloudNeutrality );
    }
#endif`,
            )
            .replace(
                "#include <lights_fragment_begin>",
                `#include <lights_fragment_begin>
    float earthLuma = dot( diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722) );
    diffuseColor.rgb = mix( vec3(earthLuma), diffuseColor.rgb, clamp(uEarthDaySaturation, 0.0, 1.0) );
    float earthNightWeight = 1.0;
#if NUM_DIR_LIGHTS > 0
    reflectedLight.directDiffuse *= uEarthDayGain;
    vec3 earthNormal = normalize( geometryNormal );
    vec3 earthViewDir = normalize( vViewPosition );
    vec3 earthLightDir = normalize( directionalLights[0].direction );
    float earthSignedNdotL = dot( earthNormal, earthLightDir );
    float earthNdotL = clamp( earthSignedNdotL, 0.0, 1.0 );
    float earthNdotV = clamp( dot( earthNormal, earthViewDir ), 0.0, 1.0 );
    float earthRimWeight = pow( clamp( 1.0 - max( dot( earthNormal, earthViewDir ), 0.0 ), 0.0, 1.0 ), 2.2 );
    float earthSunlitRim = earthRimWeight * pow( max( earthNdotL, 0.0 ), 0.35 );
    reflectedLight.directDiffuse += vec3(0.62, 0.78, 1.0) * (uEarthAtmosphereRimStrength * earthSunlitRim);
    float earthTwilightWidth = max( 0.02, uEarthTwilightRefractionWidth );
    float earthNightTerminator = (1.0 - smoothstep( 0.0, 0.08, earthSignedNdotL )) *
        smoothstep( -earthTwilightWidth, 0.02, earthSignedNdotL );
    float earthLimbScatter = pow( clamp( 1.0 - earthNdotV, 0.0, 1.0 ), 1.35 );
    float earthTwilightRefraction = uEarthTwilightRefractionStrength *
        earthNightTerminator *
        (0.35 + (0.65 * earthLimbScatter));
    vec3 earthTwilightColor = mix(
        vec3(0.95, 0.46, 0.24),
        vec3(0.36, 0.56, 1.0),
        clamp( earthLimbScatter * 1.25, 0.0, 1.0 )
    );
    reflectedLight.indirectDiffuse += earthTwilightColor * (earthTwilightRefraction * 0.075);
    totalEmissiveRadiance += earthTwilightColor * (earthTwilightRefraction * 0.026);
    earthNightWeight = pow( 1.0 - earthNdotL, max(0.2, uEarthNightsideExponent) );
    float earthNightCloudGlow = earthNightCloudMask * earthNightWeight * (
        (uEarthNightsideLift * 0.45) +
        (uEarthMoonshineLift * 0.75) +
        (earthTwilightRefraction * 0.60)
    );
    vec3 earthNightCloudColor = mix(
        earthCloudSurfaceColor,
        vec3(0.68, 0.74, 0.84),
        clamp( earthLimbScatter * 0.65, 0.0, 0.65 )
    );
    reflectedLight.indirectDiffuse += earthNightCloudColor * (earthNightCloudGlow * ${EARTH_NIGHT_CLOUD_DIFFUSE_SCALE.toFixed(3)});
    totalEmissiveRadiance += earthNightCloudColor * (earthNightCloudGlow * ${EARTH_NIGHT_CLOUD_EMISSIVE_SCALE.toFixed(3)});
    float earthNightMapWeight = pow( clamp( 1.0 - earthNdotL, 0.0, 1.0 ), max(0.2, uEarthNightMapExponent) );
    totalEmissiveRadiance *= (uEarthNightMapIntensity * earthNightMapWeight);
#else
    totalEmissiveRadiance *= uEarthNightMapIntensity;
#endif
    vec3 earthNightsideFillColor = max(
        earthAmbientSurfaceColor * vec3(0.72, 0.84, 1.0),
        vec3(0.006, 0.010, 0.018)
    );
    float earthNightsideLift = uEarthNightsideLift * earthNightWeight;
    reflectedLight.indirectDiffuse += earthNightsideFillColor * (earthNightsideLift * ${EARTH_NIGHTSIDE_DIFFUSE_SCALE.toFixed(3)});
    totalEmissiveRadiance += earthNightsideFillColor * (earthNightsideLift * ${EARTH_NIGHTSIDE_EMISSIVE_SCALE.toFixed(3)});
    vec3 earthMoonshineFillColor = max(
        earthAmbientSurfaceColor * vec3(0.58, 0.64, 0.74),
        vec3(0.005, 0.006, 0.008)
    );
    float earthMoonshineLift = uEarthMoonshineLift * earthNightWeight;
    reflectedLight.indirectDiffuse += earthMoonshineFillColor * (earthMoonshineLift * ${EARTH_MOONSHINE_DIFFUSE_SCALE.toFixed(3)});
    totalEmissiveRadiance += earthMoonshineFillColor * (earthMoonshineLift * ${EARTH_MOONSHINE_EMISSIVE_SCALE.toFixed(3)});
`,
            );
    };
    material.userData.refreshEarthShaderUniforms = () => {
        const shaderSet = material.userData?.earthNightsideShaders;
        const shaders = new Set();
        if (shaderSet instanceof Set) {
            for (const shader of shaderSet) {
                shaders.add(shader);
            }
        }
        if (material.userData?.earthNightsideShader) {
            shaders.add(material.userData.earthNightsideShader);
        }
        if (shaders.size === 0) {
            return;
        }
        const lift = Number(material.userData.earthNightsideLift);
        const moonshineLift = Number(material.userData.earthMoonshineLift);
        const exponent = Number(material.userData.earthNightsideExponent);
        const dayGain = Number(material.userData.earthDayGain);
        const daySaturation = Number(material.userData.earthDaySaturation);
        const atmosphereRimStrength = Number(material.userData.earthAtmosphereRimStrength);
        const twilightRefractionStrength = Number(material.userData.earthTwilightRefractionStrength);
        const twilightRefractionWidth = Number(material.userData.earthTwilightRefractionWidth);
        const nightMapIntensity = Number(material.userData.earthNightMapIntensity);
        const nightMapExponent = Number(material.userData.earthNightMapExponent);
        const photoBlend = Number(material.userData.earthPhotoBlend);
        const photoTexture = material.userData.earthPhotoTexture || material.map || null;
        for (const shader of shaders) {
            if (!shader?.uniforms) {
                continue;
            }
            if (Number.isFinite(lift) && shader.uniforms.uEarthNightsideLift) {
                shader.uniforms.uEarthNightsideLift.value = lift;
            }
            if (Number.isFinite(moonshineLift) && shader.uniforms.uEarthMoonshineLift) {
                shader.uniforms.uEarthMoonshineLift.value = moonshineLift;
            }
            if (Number.isFinite(exponent) && shader.uniforms.uEarthNightsideExponent) {
                shader.uniforms.uEarthNightsideExponent.value = exponent;
            }
            if (Number.isFinite(dayGain) && shader.uniforms.uEarthDayGain) {
                shader.uniforms.uEarthDayGain.value = dayGain;
            }
            if (Number.isFinite(daySaturation) && shader.uniforms.uEarthDaySaturation) {
                shader.uniforms.uEarthDaySaturation.value = daySaturation;
            }
            if (Number.isFinite(atmosphereRimStrength) && shader.uniforms.uEarthAtmosphereRimStrength) {
                shader.uniforms.uEarthAtmosphereRimStrength.value = atmosphereRimStrength;
            }
            if (Number.isFinite(twilightRefractionStrength) && shader.uniforms.uEarthTwilightRefractionStrength) {
                shader.uniforms.uEarthTwilightRefractionStrength.value = twilightRefractionStrength;
            }
            if (Number.isFinite(twilightRefractionWidth) && shader.uniforms.uEarthTwilightRefractionWidth) {
                shader.uniforms.uEarthTwilightRefractionWidth.value = twilightRefractionWidth;
            }
            if (Number.isFinite(nightMapIntensity) && shader.uniforms.uEarthNightMapIntensity) {
                shader.uniforms.uEarthNightMapIntensity.value = nightMapIntensity;
            }
            if (Number.isFinite(nightMapExponent) && shader.uniforms.uEarthNightMapExponent) {
                shader.uniforms.uEarthNightMapExponent.value = nightMapExponent;
            }
            if (Number.isFinite(photoBlend) && shader.uniforms.uEarthPhotoBlend) {
                shader.uniforms.uEarthPhotoBlend.value = photoBlend;
            }
            if (shader.uniforms.uEarthPhotoMap) {
                shader.uniforms.uEarthPhotoMap.value = photoTexture;
            }
        }
    };
    material.customProgramCacheKey = () =>
        `earth-day-night-v13-${EARTH_NIGHTSIDE_EXPONENT}-${EARTH_NIGHTSIDE_DIFFUSE_SCALE}-${EARTH_NIGHTSIDE_EMISSIVE_SCALE}-${EARTH_MOONSHINE_DIFFUSE_SCALE}-${EARTH_MOONSHINE_EMISSIVE_SCALE}-${EARTH_NIGHT_CLOUD_DIFFUSE_SCALE}-${EARTH_NIGHT_CLOUD_EMISSIVE_SCALE}-${EARTH_DAY_GAIN}-${EARTH_DAY_SATURATION}-${EARTH_ATMOSPHERE_RIM_STRENGTH}-${EARTH_TWILIGHT_REFRACTION_STRENGTH}-${EARTH_TWILIGHT_REFRACTION_WIDTH}-${EARTH_NIGHT_MAP_INTENSITY}-${EARTH_NIGHT_MAP_EXPONENT}-${EARTH_PHOTO_BLEND}`;
}

export class EarthRenderer {
    /**
     * @param {number} radius - Earth radius in scene units
     */
    constructor(radius) {
        this.radius = radius;

        // Container and meshes
        this.container = null;
        this.mesh = null;
        this.axis = null;
        this.northPoleSphere = null;
        this.southPoleSphere = null;
        this.latLonOverlay = null;
        this.latLonGrid = null;
        this.latLonLabels = null;
        this.latLonHoverLabel = null;

        // Textures (set externally before create())
        this.texture = null;
        this.specularTexture = null;
        this.nightTexture = null;
    }

    /**
     * Set textures before creating Earth
     * @param {THREE.Texture} texture - Earth surface texture
     * @param {THREE.Texture} specularTexture - Specular map for oceans
     * @param {THREE.Texture} nightTexture - Night lights map
     */
    _textureInputs() {
        const material = this.mesh?.material;
        return [this.texture, this.specularTexture, this.nightTexture,
            material?.map, material?.specularMap, material?.emissiveMap];
    }

    setTextures(texture, specularTexture, nightTexture = null) {
        this.texture = texture;
        this.specularTexture = specularTexture;
        this.nightTexture = nightTexture;
        replaceTextureOwner(this, this._textureInputs(), { disposePrevious: false });
    }

    /**
     * Update Earth textures after creation.
     * @param {THREE.Texture} texture
     * @param {THREE.Texture} specularTexture
     * @param {THREE.Texture} nightTexture
     * @param {{ disposePrevious?: boolean }} options
     */
    updateTextures(texture, specularTexture, nightTexture, { disposePrevious = true } = {}) {
        return updateTextureOwner(this, () => this._textureInputs(), () => {
            const previousTexture = this.texture;
            this.texture = texture;
            this.specularTexture = specularTexture;
            this.nightTexture = nightTexture;

            const material = this.mesh?.material;
            if (material) {
                material.map = this.texture || null;
                material.specularMap = this.specularTexture || null;
                material.emissiveMap = this.nightTexture || null;
                material.emissiveIntensity = this.nightTexture ? 1.0 : 0.0;
                if (
                    !material.userData.earthPhotoTexture ||
                    material.userData.earthPhotoTexture === previousTexture
                ) {
                    material.userData.earthPhotoTexture = this.texture || null;
                }
                material.needsUpdate = true;
            }
        }, { disposePrevious });
    }

    /**
     * Create Earth with axis and poles
     * @param {boolean} axisVisible - Initial visibility of polar axis
     * @param {boolean} polesVisible - Initial visibility of pole markers
     */
    create(axisVisible = false, polesVisible = false, {
        latLonGridVisible = false,
        latLonLabelsVisible = true,
        latLonHoverEnabled = false,
    } = {}) {
        // Create container tilted to Earth's axis
        this.container = new THREE.Group();
        this.container.lookAt(
            0,
            Math.sin(PC.EARTH_AXIS_INCLINATION_RADS),
            Math.cos(PC.EARTH_AXIS_INCLINATION_RADS)
        );

        // Earth sphere
        const geometry = new THREE.SphereGeometry(this.radius, 100, 100);
        const material = new THREE.MeshPhongMaterial({
            map: this.texture,
            specularMap: this.specularTexture,
            emissiveMap: this.nightTexture,
            emissive: 0xffffff,
            emissiveIntensity: this.nightTexture ? 1.0 : 0.0,
            specular: 0x101010
        });
        applyEarthNightsideLiftShader(material);

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.onBeforeRender = () => {
            material.userData?.refreshEarthShaderUniforms?.();
        };
        this.mesh.receiveShadow = false;
        this.mesh.castShadow = false;
        this.mesh.frustumCulled = false;
        this.mesh.rotateX(Math.PI / 2);  // Orient texture correctly
        this.container.add(this.mesh);

        // Avoid culling the container to prevent pop-in at extreme viewpoints
        this.container.frustumCulled = false;

        // Create axis and poles (not added to container yet - done by parent)
        this._createAxis(axisVisible);
        this._createPoles(polesVisible);
        this.latLonOverlay = new BodyLatLonOverlay({
            bodyName: "earth",
            radius: this.radius,
            mesh: this.mesh,
            container: this.container,
        });
        this.latLonOverlay.create({
            gridVisible: latLonGridVisible,
            labelsVisible: latLonLabelsVisible,
            hoverEnabled: latLonHoverEnabled,
        });
        this.latLonGrid = this.latLonOverlay.grid;
        this.latLonLabels = this.latLonOverlay.labels;
        this.latLonHoverLabel = this.latLonOverlay.hoverLabel;
    }

    /**
     * Create polar axis line
     * @private
     */
    _createAxis(visible) {
        const poleScaleOuter = 1.2;
        const poleScaleInner = 1.02; // leave a gap inside the sphere

        const northOuter = new THREE.Vector3(0, 0, this.radius * poleScaleOuter);
        const northInner = new THREE.Vector3(0, 0, this.radius * poleScaleInner);
        const southInner = new THREE.Vector3(0, 0, -this.radius * poleScaleInner);
        const southOuter = new THREE.Vector3(0, 0, -this.radius * poleScaleOuter);

        const geometry = new THREE.BufferGeometry();
        const vertices = [
            northOuter.x, northOuter.y, northOuter.z, northInner.x, northInner.y, northInner.z,
            southInner.x, southInner.y, southInner.z, southOuter.x, southOuter.y, southOuter.z
        ];
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));

        const material = new THREE.LineBasicMaterial({ color: COL.EARTH_AXIS, depthTest: true, depthWrite: false });
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
     * Set rotation around Z axis (for Earth rotation animation)
     * @param {number} angle - Rotation angle in radians
     */
    setRotation(angle) {
        if (this.container) {
            this.container.rotation.z = angle;
        }
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

    setLatLonGridVisible(visible) {
        this.latLonOverlay?.setGridVisible?.(visible);
        this.latLonGrid = this.latLonOverlay?.grid || null;
        this.latLonLabels = this.latLonOverlay?.labels || null;
    }

    setLatLonLabelsVisible(visible) {
        this.latLonOverlay?.setLabelsVisible?.(visible);
        this.latLonLabels = this.latLonOverlay?.labels || null;
    }

    setLatLonHoverEnabled(enabled) {
        this.latLonOverlay?.setHoverEnabled?.(enabled);
        this.latLonHoverLabel = this.latLonOverlay?.hoverLabel || null;
    }

    updateLatLonGridForCamera(input) {
        const changed = this.latLonOverlay?.updateForCamera?.(input) === true;
        this.latLonGrid = this.latLonOverlay?.grid || null;
        this.latLonLabels = this.latLonOverlay?.labels || null;
        return changed;
    }

    updateLatLonHoverFromPointer(input) {
        const changed = this.latLonOverlay?.updateHoverFromPointer?.(input) === true;
        this.latLonHoverLabel = this.latLonOverlay?.hoverLabel || null;
        return changed;
    }

    hideLatLonHover() {
        return this.latLonOverlay?.hideHover?.() === true;
    }

    /**
     * Dispose all Earth resources
     */
    dispose() {
        const releaseTextures = detachTextureOwner(this, [this.texture, this.specularTexture, this.nightTexture]);
        this.texture = null;
        this.specularTexture = null;
        this.nightTexture = null;
        try {
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

                if (this.latLonOverlay) {
                    this.latLonOverlay.dispose();
                    this.latLonOverlay = null;
                    this.latLonGrid = null;
                    this.latLonLabels = null;
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
