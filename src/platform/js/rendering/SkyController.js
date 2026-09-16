// @ts-nocheck
import { replaceTextureOwner, updateTextureOwner, detachTextureOwner } from "./texture-ownership.js";

import * as THREE from "three";
import { PHYSICS_CONSTANTS as PC } from "../core/constants.js";
import { AtmosphereModel } from "./AtmosphereModel.js";
import { PlanetRenderer } from "./PlanetRenderer.js";
import { StarRenderer } from "./StarRenderer.js";
import { STAR_CATALOG_BRIGHT } from "./star-catalog-hipparcos.js";

const SKY_LAYER = 2;
const SKY_STARMAP_OPACITY = 0.18;
const SKY_CONSTELLATION_OPACITY = 0.06;
const SKY_MIN_LIMITING_MAGNITUDE = -3.0;
const SKY_MAX_LIMITING_MAGNITUDE = 8.0;

const ATMOSPHERE_VERTEX_SHADER = `
    varying vec3 vViewDir;

    void main() {
        vec4 viewPos = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(viewPos.xyz);
        gl_Position = projectionMatrix * viewPos;
    }
`;

const ATMOSPHERE_FRAGMENT_SHADER = `
    uniform float uEnabled;
    uniform float uHaze;
    uniform vec3 uZenithColor;
    uniform vec3 uHorizonColor;
    uniform vec3 uGroundColor;
    varying vec3 vViewDir;

    void main() {
        float skyY = clamp(vViewDir.y * 0.5 + 0.5, 0.0, 1.0);
        float horizonBand = exp(-pow(abs(vViewDir.y) * 5.5, 1.2));

        vec3 baseSky = mix(uHorizonColor, uZenithColor, smoothstep(0.0, 1.0, skyY));
        vec3 belowHorizon = mix(uGroundColor, uHorizonColor * 0.35, smoothstep(-0.2, 0.0, vViewDir.y));
        vec3 color = mix(baseSky, belowHorizon, step(vViewDir.y, 0.0));

        float alphaSky = mix(0.12, 0.88, (1.0 - skyY)) * uHaze;
        float alphaGround = 0.92;
        float alpha = mix(alphaSky, alphaGround, step(vViewDir.y, 0.0));

        alpha += horizonBand * 0.08 * uHaze;
        alpha *= uEnabled;

        gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
    }
`;

const DEFAULT_SKY_PARAMETERS = Object.freeze({
    atmosphere_enabled: false,
    procedural_stars_enabled: true,
    planet_center_mode: "earth",
    bloom_strength: 0.65,
    star_size_scale: 0.92,
    star_intensity_scale: 120.0,
    magnitude_limit: SKY_MAX_LIMITING_MAGNITUDE,
    extinction_strength: 0.18,
    twinkle_strength: 0.45,
    observer_lat: 28.6139,
    observer_lon: 77.2090,
    sky_time_ms: Date.now(),
});

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function toFiniteNumber(value, fallback) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function toBoolean(value, fallback = false) {
    if (typeof value === "boolean") return value;
    if (value === "true") return true;
    if (value === "false") return false;
    return fallback;
}

function resolvePlanetCenterMode(value, fallback = "earth") {
    if (value === "moon" || value === "earth") {
        return value;
    }
    return fallback;
}


function resolveSkyParameters(current, patch) {
    const next = {
        ...current,
    };
    if (!patch || typeof patch !== "object") {
        return next;
    }

    if (Object.prototype.hasOwnProperty.call(patch, "atmosphere_enabled")) {
        next.atmosphere_enabled = toBoolean(patch.atmosphere_enabled, next.atmosphere_enabled);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "bloom_strength")) {
        next.bloom_strength = clamp(
            toFiniteNumber(patch.bloom_strength, next.bloom_strength),
            0,
            3,
        );
    }
    if (Object.prototype.hasOwnProperty.call(patch, "star_size_scale")) {
        next.star_size_scale = clamp(
            toFiniteNumber(patch.star_size_scale, next.star_size_scale),
            0.1,
            6,
        );
    }
    if (Object.prototype.hasOwnProperty.call(patch, "star_intensity_scale")) {
        next.star_intensity_scale = clamp(
            toFiniteNumber(patch.star_intensity_scale, next.star_intensity_scale),
            0.5,
            4000,
        );
    }
    if (Object.prototype.hasOwnProperty.call(patch, "magnitude_limit")) {
        next.magnitude_limit = clamp(
            toFiniteNumber(patch.magnitude_limit, next.magnitude_limit),
            SKY_MIN_LIMITING_MAGNITUDE,
            SKY_MAX_LIMITING_MAGNITUDE,
        );
    }
    if (Object.prototype.hasOwnProperty.call(patch, "magnitudeLimit")) {
        next.magnitude_limit = clamp(
            toFiniteNumber(patch.magnitudeLimit, next.magnitude_limit),
            SKY_MIN_LIMITING_MAGNITUDE,
            SKY_MAX_LIMITING_MAGNITUDE,
        );
    }
    if (Object.prototype.hasOwnProperty.call(patch, "extinction_strength")) {
        next.extinction_strength = clamp(
            toFiniteNumber(patch.extinction_strength, next.extinction_strength),
            0,
            1.2,
        );
    }
    if (Object.prototype.hasOwnProperty.call(patch, "twinkle_strength")) {
        next.twinkle_strength = clamp(
            toFiniteNumber(patch.twinkle_strength, next.twinkle_strength),
            0,
            2,
        );
    }
    if (Object.prototype.hasOwnProperty.call(patch, "observer_lat")) {
        next.observer_lat = clamp(
            toFiniteNumber(patch.observer_lat, next.observer_lat),
            -89.9,
            89.9,
        );
    }
    if (Object.prototype.hasOwnProperty.call(patch, "observer_lon")) {
        next.observer_lon = clamp(
            toFiniteNumber(patch.observer_lon, next.observer_lon),
            -180,
            180,
        );
    }
    if (Object.prototype.hasOwnProperty.call(patch, "sky_time_ms")) {
        next.sky_time_ms = toFiniteNumber(patch.sky_time_ms, next.sky_time_ms);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "time")) {
        next.sky_time_ms = toFiniteNumber(patch.time, next.sky_time_ms);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "timeSeconds")) {
        next.sky_time_ms = toFiniteNumber(patch.timeSeconds, next.sky_time_ms) * 1000;
    }
    if (Object.prototype.hasOwnProperty.call(patch, "timeMs")) {
        next.sky_time_ms = toFiniteNumber(patch.timeMs, next.sky_time_ms);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "planet_center_mode")) {
        next.planet_center_mode = resolvePlanetCenterMode(
            patch.planet_center_mode,
            next.planet_center_mode,
        );
    }
    if (Object.prototype.hasOwnProperty.call(patch, "planetCenterMode")) {
        next.planet_center_mode = resolvePlanetCenterMode(
            patch.planetCenterMode,
            next.planet_center_mode,
        );
    }

    // Procedural stars are always enabled; visibility is controlled by view-sky.
    next.procedural_stars_enabled = true;

    return next;
}

function createStarRendererCompat({
    container,
    radius,
    layer,
    parameters,
}) {
    return new StarRenderer(container, {
        radius,
        layer,
        catalog: STAR_CATALOG_BRIGHT,
        atmosphereEnabled: parameters.atmosphere_enabled,
        starSizeScale: parameters.star_size_scale,
        starIntensityScale: parameters.star_intensity_scale,
        magnitudeLimit: parameters.magnitude_limit,
        extinctionStrength: parameters.extinction_strength,
        twinkleStrength: parameters.twinkle_strength,
        haloStrength: 0.10 + (parameters.bloom_strength * 0.18),
    });
}

export class SkyController {
    constructor(parentContainer, baseRadius) {
        this.parentContainer = parentContainer;
        this.baseRadius = baseRadius;
        this.radius = 200 * baseRadius;

        this.container = null;
        this.geometry = null;
        this.skyMesh = null;
        this.constellationMesh = null;
        this.atmosphereMesh = null;
        this.starRenderer = null;
        this.planetRenderer = null;

        this.skyTexture = null;
        this.constellationTexture = null;

        this.parameters = { ...DEFAULT_SKY_PARAMETERS };
        this.atmosphereModel = new AtmosphereModel({
            extinctionCoefficient: this.parameters.extinction_strength,
            twinkleStrength: this.parameters.twinkle_strength,
            clarity: clamp(1 - (this.parameters.extinction_strength * 2.0), 0.15, 0.95),
        });
        this.visible = true;
        this.viewSky = true;
        this.viewConstellationLines = false;
    }

    _textureInputs() {
        return [this.skyTexture, this.constellationTexture,
            this.skyMesh?.material?.map, this.constellationMesh?.material?.map];
    }

    setTextures(skyTexture, constellationTexture) {
        this.skyTexture = skyTexture;
        this.constellationTexture = constellationTexture;
        replaceTextureOwner(this, this._textureInputs(), { disposePrevious: false });
    }

    updateTextures(skyTexture, constellationTexture, { disposePrevious = true } = {}) {
        return updateTextureOwner(this, () => this._textureInputs(), () => {
            this.skyTexture = skyTexture;
            this.constellationTexture = constellationTexture;

            if (this.skyMesh?.material) {
                this.skyMesh.material.map = this.skyTexture || null;
                this.skyMesh.material.needsUpdate = true;
            }
            if (this.constellationMesh?.material) {
                this.constellationMesh.material.map = this.constellationTexture || null;
                this.constellationMesh.material.needsUpdate = true;
            }
        }, { disposePrevious });
    }

    setParameters(patch = {}) {
        this.parameters = resolveSkyParameters(this.parameters, patch);
        this.#applyParameters();
    }

    setTime(timeMs, { realtimeFrame = false } = {}) {
        const safeTime = toFiniteNumber(timeMs, this.parameters.sky_time_ms);
        this.parameters.sky_time_ms = safeTime;
        if (this.starRenderer?.setTime) {
            this.starRenderer.setTime(safeTime);
        } else if (this.starRenderer?.setParameters) {
            this.starRenderer.setParameters({ sky_time_ms: safeTime, timeMs: safeTime });
        }
        this.planetRenderer?.setTime?.(safeTime, { force: !realtimeFrame });
    }

    setLayerVisibility({ viewSky = false, viewConstellationLines = false } = {}) {
        this.viewSky = Boolean(viewSky);
        this.viewConstellationLines = Boolean(viewConstellationLines);
        this.#syncVisibility();
    }

    create(visible = true) {
        this.visible = visible;

        this.container = new THREE.Group();
        this.container.lookAt(
            0,
            Math.sin(PC.EARTH_AXIS_INCLINATION_RADS),
            Math.cos(PC.EARTH_AXIS_INCLINATION_RADS),
        );
        this.geometry = new THREE.SphereGeometry(this.radius);

        const milkyWayMaterial = new THREE.MeshBasicMaterial({
            blending: THREE.AdditiveBlending,
            map: this.skyTexture,
            opacity: this.skyTexture ? SKY_STARMAP_OPACITY : 0,
            transparent: true,
            depthWrite: false,
            toneMapped: false,
        });
        milkyWayMaterial.side = THREE.BackSide;

        this.skyMesh = new THREE.Mesh(this.geometry, milkyWayMaterial);
        this.skyMesh.layers.set(SKY_LAYER);
        this.skyMesh.receiveShadow = false;
        this.skyMesh.castShadow = false;
        this.skyMesh.rotateX(Math.PI / 2);
        this.skyMesh.renderOrder = -30;
        this.container.add(this.skyMesh);

        const constellationMaterial = new THREE.MeshBasicMaterial({
            blending: THREE.AdditiveBlending,
            map: this.constellationTexture,
            opacity: this.constellationTexture ? SKY_CONSTELLATION_OPACITY : 0,
            transparent: true,
            depthWrite: false,
            toneMapped: false,
        });
        constellationMaterial.side = THREE.BackSide;

        this.constellationMesh = new THREE.Mesh(this.geometry, constellationMaterial);
        this.constellationMesh.layers.set(SKY_LAYER);
        this.constellationMesh.receiveShadow = false;
        this.constellationMesh.castShadow = false;
        this.constellationMesh.rotateX(Math.PI / 2);
        this.constellationMesh.renderOrder = -29;
        this.container.add(this.constellationMesh);

        const atmosphereMaterial = new THREE.ShaderMaterial({
            vertexShader: ATMOSPHERE_VERTEX_SHADER,
            fragmentShader: ATMOSPHERE_FRAGMENT_SHADER,
            uniforms: {
                uEnabled: { value: 0 },
                uHaze: { value: 1 },
                uZenithColor: { value: new THREE.Color(0x1a3f8f) },
                uHorizonColor: { value: new THREE.Color(0xd08645) },
                uGroundColor: { value: new THREE.Color(0x020306) },
            },
            side: THREE.BackSide,
            transparent: true,
            depthWrite: false,
            depthTest: true,
            toneMapped: false,
        });

        this.atmosphereMesh = new THREE.Mesh(this.geometry, atmosphereMaterial);
        this.atmosphereMesh.layers.set(SKY_LAYER);
        this.atmosphereMesh.receiveShadow = false;
        this.atmosphereMesh.castShadow = false;
        this.atmosphereMesh.renderOrder = -28;
        this.container.add(this.atmosphereMesh);

        this.starRenderer = createStarRendererCompat({
            container: this.container,
            radius: this.radius,
            layer: SKY_LAYER,
            parameters: this.parameters,
        });
        if (this.starRenderer?.create) {
            this.starRenderer.create(visible);
        } else if (this.starRenderer?.points && this.starRenderer.points.parent !== this.container) {
            this.container.add(this.starRenderer.points);
        }

        this.planetRenderer = new PlanetRenderer(this.container, {
            radius: this.radius,
            layer: SKY_LAYER,
            centerMode: this.parameters.planet_center_mode,
            atmosphereEnabled: this.parameters.atmosphere_enabled,
        });
        this.planetRenderer.create(visible);

        this.container.scale.set(-1, 1, 1);
        this.container.rotateZ(Math.PI);
        this.parentContainer.add(this.container);

        this.#applyParameters();
        this.#syncVisibility();
    }

    updatePosition(camera) {
        if (this.container && camera?.matrixWorld) {
            this.container.position.setFromMatrixPosition(camera.matrixWorld);
        }
    }

    setVisible(visible) {
        this.visible = Boolean(visible);
        this.#syncVisibility();
    }

    isVisible() {
        return this.container ? this.container.visible : false;
    }

    dispose() {
        const releaseTextures = detachTextureOwner(this, [this.skyTexture, this.constellationTexture]);
        this.skyTexture = null;
        this.constellationTexture = null;
        try {
            this.starRenderer?.dispose?.();
            this.starRenderer = null;
            this.planetRenderer?.dispose?.();
            this.planetRenderer = null;

            if (this.skyMesh) {
                this.skyMesh.material?.dispose?.();
                this.container?.remove(this.skyMesh);
                this.skyMesh = null;
            }
            if (this.constellationMesh) {
                this.constellationMesh.material?.dispose?.();
                this.container?.remove(this.constellationMesh);
                this.constellationMesh = null;
            }
            if (this.atmosphereMesh) {
                this.atmosphereMesh.material?.dispose?.();
                this.container?.remove(this.atmosphereMesh);
                this.atmosphereMesh = null;
            }
            if (this.geometry) {
                this.geometry.dispose?.();
                this.geometry = null;
            }
            if (this.container) {
                this.parentContainer.remove(this.container);
                this.container = null;
            }
        } finally { releaseTextures(); }
    }

    #applyParameters() {
        if (this.atmosphereMesh?.material?.uniforms) {
            this.atmosphereModel.setParams({
                extinctionCoefficient: this.parameters.extinction_strength,
                twinkleStrength: this.parameters.twinkle_strength,
                clarity: clamp(1 - (this.parameters.extinction_strength * 2.0), 0.15, 0.95),
            });
            const gradient = this.atmosphereModel.skyGradient({
                sunAltitudeDeg: this.parameters.atmosphere_enabled ? -6 : -18,
            });
            const haze = clamp(
                this.parameters.extinction_strength * 3.0 +
                (this.parameters.twinkle_strength * 0.25) +
                0.25,
                0,
                1.35,
            );
            this.atmosphereMesh.material.uniforms.uEnabled.value = this.parameters.atmosphere_enabled ? 1 : 0;
            this.atmosphereMesh.material.uniforms.uHaze.value = haze;
            this.atmosphereMesh.material.uniforms.uZenithColor.value.setRGB(
                gradient.zenith[0],
                gradient.zenith[1],
                gradient.zenith[2],
            );
            this.atmosphereMesh.material.uniforms.uHorizonColor.value.setRGB(
                gradient.horizon[0],
                gradient.horizon[1],
                gradient.horizon[2],
            );
            this.atmosphereMesh.material.uniforms.uGroundColor.value.setRGB(
                gradient.nadir[0],
                gradient.nadir[1],
                gradient.nadir[2],
            );
        }

        /** @type {any} */
        const starParameters = { ...this.parameters };
        if (this.parameters.procedural_stars_enabled) {
            // Keep procedural stars clearly visible without flattening the full
            // magnitude range into uniformly large/bright points.
            starParameters.star_intensity_scale *= 64.0;
            starParameters.star_size_scale *= 1.24;
            starParameters.minPointSize = 1.08;
            starParameters.maxPointSize = 9.5;
            starParameters.bloom_strength = Math.max(starParameters.bloom_strength, 0.95);
        }

        if (this.starRenderer?.setParameters) {
            this.starRenderer.setParameters(starParameters);
        } else if (this.starRenderer?.setConfig) {
            this.starRenderer.setConfig(starParameters);
        }
        if (this.starRenderer?.setTime) {
            this.starRenderer.setTime(this.parameters.sky_time_ms);
        }

        this.planetRenderer?.setCenterMode?.(this.parameters.planet_center_mode);
        this.planetRenderer?.setAtmosphereEnabled?.(this.parameters.atmosphere_enabled);
        this.planetRenderer?.setTime?.(this.parameters.sky_time_ms, { force: true });

        let skyOpacity = this.parameters.atmosphere_enabled
            ? SKY_STARMAP_OPACITY * 0.58
            : SKY_STARMAP_OPACITY;
        if (this.skyMesh?.material) {
            this.skyMesh.material.opacity = this.skyTexture ? skyOpacity : 0;
            this.skyMesh.material.needsUpdate = true;
        }

        const constellationOpacity = this.parameters.atmosphere_enabled
            ? SKY_CONSTELLATION_OPACITY * 0.8
            : SKY_CONSTELLATION_OPACITY;
        if (this.constellationMesh?.material) {
            this.constellationMesh.material.opacity = this.constellationTexture ? constellationOpacity : 0;
            this.constellationMesh.material.needsUpdate = true;
        }

        this.#syncVisibility();
    }

    #syncVisibility() {
        const showSkyLayer = this.visible && this.viewSky;
        const showConstellations = this.visible && this.viewConstellationLines;

        if (this.skyMesh) {
            this.skyMesh.visible = showSkyLayer;
        }
        if (this.constellationMesh) {
            this.constellationMesh.visible = showConstellations;
        }
        if (this.atmosphereMesh) {
            this.atmosphereMesh.visible = showSkyLayer && this.parameters.atmosphere_enabled;
        }

        const showProceduralStars = showSkyLayer;
        if (this.starRenderer?.setVisible) {
            this.starRenderer.setVisible(showProceduralStars);
        } else if (this.starRenderer?.points) {
            this.starRenderer.points.visible = showProceduralStars;
        } else if (this.starRenderer?.object3D) {
            this.starRenderer.object3D.visible = showProceduralStars;
        }
        this.planetRenderer?.setVisible?.(showSkyLayer);

        if (this.container) {
            this.container.visible = showSkyLayer || showConstellations;
        }
    }
}
