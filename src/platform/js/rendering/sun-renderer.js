import * as THREE from "three";

const SKY_RADIUS_MULTIPLIER = 200;
const SUN_ANGULAR_DIAMETER_DEGREES = 0.533;
const SUN_CORONA_TEXTURE_SIZE = 1024;
const SUN_CORONA_MODEL_EXTENT_SOLAR_RADII = 90;
const SUN_HALO_SCALE = 4.8;
const SUN_HALO_OPACITY = 0.36;
const SUN_CORONA_SCALE = SUN_CORONA_MODEL_EXTENT_SOLAR_RADII;
const SUN_CORONA_OPACITY = 0.0;
const SUN_CORONA_FLOW_SCALE = 84;
const SUN_CORONA_FLOW_OPACITY = 0.0;
const SUN_CORONA_BASE_ROTATION_AMPLITUDE = 0.026;
const SUN_CORONA_FLOW_ROTATION_SPEED = 0.055;
const SUN_ZODIACAL_SCALE_X = 68.0;
const SUN_ZODIACAL_SCALE_Y = 30.0;
const SUN_ZODIACAL_OPACITY = 0.0;
const SUN_STARBURST_SCALE = 16.0;
const SUN_STARBURST_OPACITY = 0.0;
const SUN_FLARE_SCALE_X = 26.0;
const SUN_FLARE_SCALE_Y = 2.4;
const SUN_FLARE_OPACITY = 0.0;
const SUN_SAFE_DISTANCE_FACTOR = 0.985;
const SUN_FALLBACK_DISTANCE_MULTIPLIER = 180;

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function clamp01(value) {
    return clamp(value, 0, 1);
}

function smoothstep(edge0, edge1, value) {
    const t = clamp01((value - edge0) / Math.max(edge1 - edge0, 1e-9));
    return t * t * (3 - (2 * t));
}

function angularDistance(a, b) {
    const twoPi = Math.PI * 2;
    let delta = ((a - b + Math.PI) % twoPi + twoPi) % twoPi - Math.PI;
    if (delta < -Math.PI) {
        delta += twoPi;
    }
    return Math.abs(delta);
}

function gaussianAngle(theta, center, width) {
    const distance = angularDistance(theta, center);
    const safeWidth = Math.max(width, 1e-5);
    return Math.exp(-0.5 * (distance / safeWidth) ** 2);
}

function baumbachAllenDensityTerm(radiusSolar) {
    const r = Math.max(Number(radiusSolar), 1.05);
    return (
        (2.99 * (r ** -16)) +
        (1.55 * (r ** -6)) +
        (0.036 * (r ** -1.5))
    );
}

function deterministicCoronaGrain(x, y) {
    const value = Math.sin((x * 12.9898) + (y * 78.233)) * 43758.5453;
    return value - Math.floor(value);
}

function coronaStreamerReach(theta, eclipticTiltRad) {
    const streamerCenters = [
        eclipticTiltRad - 0.08,
        eclipticTiltRad + Math.PI + 0.10,
        eclipticTiltRad + 0.42,
        eclipticTiltRad + Math.PI - 0.48,
        eclipticTiltRad - 0.72,
        eclipticTiltRad + Math.PI + 0.68,
    ];
    let reach = 0;
    for (let i = 0; i < streamerCenters.length; i += 1) {
        const width = 0.19 + (0.035 * (i % 3));
        const strength = 1.0 - (0.055 * i);
        reach = Math.max(reach, strength * gaussianAngle(theta, streamerCenters[i], width));
    }
    return clamp01(reach);
}

export function sampleSolarCoronaOuterFade(radialNorm, thetaRad, {
    eclipticTiltRad = -0.16,
    angularVariation = 1,
} = {}) {
    const radial = Math.max(Number(radialNorm), 0);
    const theta = Number.isFinite(thetaRad) ? thetaRad : 0;
    const variation = clamp01(Number.isFinite(Number(angularVariation)) ? Number(angularVariation) : 1);
    if (variation <= 1e-5) {
        return 1 - smoothstep(0.79, 0.93, radial);
    }
    const eclipticAngle = theta - eclipticTiltRad;
    const equatorial = Math.abs(Math.cos(eclipticAngle));
    const streamerReach = coronaStreamerReach(theta, eclipticTiltRad);
    const broadWave =
        (0.024 * Math.sin((theta * 3.0) + 0.7)) +
        (0.018 * Math.sin((theta * 7.0) - 1.3)) +
        (0.012 * Math.sin((theta * 13.0) + 2.1));
    const outerRadius = clamp(
        0.805 +
            variation * (
                (0.070 * (equatorial ** 1.65)) +
                (0.105 * streamerReach) +
                broadWave
            ),
        0.74,
        0.99,
    );
    const feather = clamp(0.105 + (0.035 * variation * (1 - streamerReach)), 0.09, 0.15);
    return 1 - smoothstep(outerRadius - feather, outerRadius, radial);
}

export function sampleSolarCoronaModel(radiusSolar, thetaRad, {
    eclipticTiltRad = -0.16,
    fCoronaPower = 1.28,
    fCoronaFlattening = 0.56,
    kCoronaStrength = 1,
    fCoronaStrength = 1,
    streamerPhaseRad = 0,
    streamerStrengthMul = 1,
    streamerWidthMul = 1,
    polarStrengthMul = 1,
    weavePhaseRad = 0,
    angularVariation = 1,
} = {}) {
    const radius = Math.max(Number(radiusSolar), 0);
    const r = Math.max(radius, 1.0);
    const theta = Number.isFinite(thetaRad) ? thetaRad : 0;
    const variation = clamp01(Number.isFinite(Number(angularVariation)) ? Number(angularVariation) : 1);
    const eclipticAngle = theta - eclipticTiltRad;
    const equatorial = Math.abs(Math.cos(eclipticAngle));
    const polar = Math.abs(Math.sin(eclipticAngle));

    // K-corona: electron-scattered photospheric light. The density term uses
    // the classic Baumbach-Allen radial family, normalized near the limb.
    const baumbachNormalized = baumbachAllenDensityTerm(r) / baumbachAllenDensityTerm(1.05);
    const kCorona = kCoronaStrength *
        (baumbachNormalized ** 0.72) *
        (0.93 + (variation * 0.09 * (equatorial ** 1.6)));

    // F-corona: dust-scattered inner zodiacal light, broader and flatter along
    // the ecliptic, with a shallower falloff to match wide-field lunar-flyby imagery.
    const fFlatten = (1 - (variation * fCoronaFlattening * 0.38)) +
        (variation * fCoronaFlattening * 0.92 * (equatorial ** 2.2));
    const fCorona = 0.115 * fCoronaStrength * (Math.max(r, 1.0) ** -fCoronaPower) * fFlatten;

    const streamerCenters = [
        eclipticTiltRad - 0.08,
        eclipticTiltRad + Math.PI + 0.10,
        eclipticTiltRad + 0.42,
        eclipticTiltRad + Math.PI - 0.48,
        eclipticTiltRad - 0.72,
        eclipticTiltRad + Math.PI + 0.68,
    ];
    const streamerEnvelope = smoothstep(0.92, 1.28, r) * (1 - smoothstep(42, 86, r));
    let streamers = 0;
    for (let i = 0; i < streamerCenters.length; i += 1) {
        const width = (0.13 + (0.038 * (i % 3))) * Math.max(0.2, streamerWidthMul);
        const length = 11 + (6 * (i % 2)) + (i === 1 ? 12 : 0);
        const strength = 0.16 - (0.014 * i);
        streamers += strength *
            gaussianAngle(theta, streamerCenters[i] + streamerPhaseRad, width) *
            Math.exp(-(Math.max(r, 1.0) - 1) / length);
    }
    streamers *= streamerEnvelope * Math.max(0, streamerStrengthMul) * variation;

    const plumeComb = 0.5 + (0.5 * Math.cos((theta - eclipticTiltRad) * 24));
    const polarPlumes = 0.10 *
        Math.max(0, polarStrengthMul) *
        variation *
        (polar ** 5.5) *
        (0.65 + (0.35 * plumeComb)) *
        Math.exp(-(Math.max(r, 1.0) - 1) / 9) *
        smoothstep(0.96, 1.15, r);

    const rawSignal = kCorona + fCorona + streamers + polarPlumes;
    const angularWeave = 1 +
        variation * (
            (0.045 * Math.sin((theta * 5.0) + (r * 0.12) + weavePhaseRad)) +
            (0.030 * Math.sin((theta * 9.0) - (r * 0.055) - (weavePhaseRad * 1.7)))
        );
    const radialWeave = 1 + (variation * 0.026 * Math.sin((r * 0.62) + (theta * 3.0) + (weavePhaseRad * 0.8)));
    const signal = Math.max(0, rawSignal * clamp(angularWeave * radialWeave, 0.88, 1.14));
    const alpha = clamp01(0.88 * (signal ** 0.58));
    const fFraction = rawSignal > 1e-9 ? clamp01(fCorona / rawSignal) : 0;
    const kFraction = rawSignal > 1e-9 ? clamp01((kCorona + streamers + polarPlumes) / rawSignal) : 0;

    return {
        alpha,
        signal,
        kCorona,
        fCorona,
        streamers,
        polarPlumes,
        fFraction,
        color: {
            r: clamp01(1.0 - (0.025 * kFraction) + (0.018 * fFraction)),
            g: clamp01(0.965 + (0.02 * kFraction) + (0.018 * fFraction)),
            b: clamp01(0.91 + (0.07 * kFraction) + (0.035 * fFraction)),
        },
    };
}

/**
 * Sun Renderer - Physically constrained visual Sun disk.
 *
 * This renderer keeps the Sun at a far, camera-anchored reference position so
 * it behaves like a distant source while preserving the ephemeris light
 * direction used by scene lighting.
 */
export const SUN_CORONA_PRESETS = Object.freeze({
    base: Object.freeze({ angularVariation: 0 }),
    flow: Object.freeze({ kCoronaStrength: 0.72, fCoronaStrength: 0.72, streamerPhaseRad: 0.63, streamerStrengthMul: 0.65, streamerWidthMul: 2.8, polarStrengthMul: 0.85, weavePhaseRad: 1.9, angularVariation: 1 }),
});

// Used at asset-preparation time, not during scene startup.
export function buildSolarCoronaPixels(modelOptions, size = SUN_CORONA_TEXTURE_SIZE) {
    const data = new Uint8ClampedArray(size * size * 4);
        const center = (size - 1) * 0.5;
        const invCenter = 1 / Math.max(center, 1);
        const angularVariation = clamp01(
            Number.isFinite(Number(modelOptions.angularVariation))
                ? Number(modelOptions.angularVariation)
                : 1,
        );

        for (let y = 0; y < size; y += 1) {
            const ny = (y - center) * invCenter;
            for (let x = 0; x < size; x += 1) {
                const nx = (x - center) * invCenter;
                const radial = Math.hypot(nx, ny);
                if (radial >= 1) {
                    continue;
                }
                const radiusSolar = radial * SUN_CORONA_MODEL_EXTENT_SOLAR_RADII;
                const theta = Math.atan2(ny, nx);
                const sample = sampleSolarCoronaModel(radiusSolar, theta, modelOptions);
                const edgeFade = sampleSolarCoronaOuterFade(radial, theta, modelOptions);
                const centerFade = smoothstep(0.002, 0.02, radial);
                const grain = angularVariation > 1e-5
                    ? 0.965 + (0.07 * deterministicCoronaGrain(x, y))
                    : 1;
                const alpha = clamp01(sample.alpha * edgeFade * centerFade * grain);
                if (alpha <= 0.0005) {
                    continue;
                }

                const idx = ((y * size) + x) * 4;
                data[idx] = Math.round(sample.color.r * 255);
                data[idx + 1] = Math.round(sample.color.g * 255);
                data[idx + 2] = Math.round(sample.color.b * 255);
                data[idx + 3] = Math.round(alpha * 255);
            }
        }
    return { width: size, height: size, data };
}

export class SunRenderer {
    /**
     * @param {THREE.Object3D} parentContainer
     * @param {number} baseRadius
     */
    constructor(parentContainer, baseRadius) {
        this.parentContainer = parentContainer;
        this.baseRadius = Number.isFinite(baseRadius) && baseRadius > 0 ? baseRadius : 1;

        this.distance = this.computeSafeDistance();
        this.radius = this.computeAngularRadius(this.distance);

        this.group = null;
        this.coreSprite = null;
        this.haloSprite = null;
        this.coronaSprite = null;
        this.coronaFlowSprite = null;
        this.zodiacalSprite = null;
        this.starburstSprite = null;
        this.flareSprite = null;
        this._dynamicTextures = [];

        this._direction = new THREE.Vector3(1, 0, 0);
        this._referencePosition = new THREE.Vector3();
        this._position = new THREE.Vector3();
        this._visualState = {
            coreOpacity: 1.0,
            coreScaleMul: 1.0,
            haloOpacity: SUN_HALO_OPACITY,
            haloScaleMul: SUN_HALO_SCALE,
            coronaOpacity: SUN_CORONA_OPACITY,
            coronaScaleMul: SUN_CORONA_SCALE,
            coronaFlowOpacity: SUN_CORONA_FLOW_OPACITY,
            coronaFlowScaleMul: SUN_CORONA_FLOW_SCALE,
            coronaMotionMul: 1.0,
            zodiacalOpacity: SUN_ZODIACAL_OPACITY,
            zodiacalScaleXMul: SUN_ZODIACAL_SCALE_X,
            zodiacalScaleYMul: SUN_ZODIACAL_SCALE_Y,
            zodiacalRotationRad: -0.08,
            starburstOpacity: SUN_STARBURST_OPACITY,
            starburstScaleMul: SUN_STARBURST_SCALE,
            flareOpacity: SUN_FLARE_OPACITY,
            flareScaleXMul: SUN_FLARE_SCALE_X,
            flareScaleYMul: SUN_FLARE_SCALE_Y,
        };
    }

    setRenderInvalidationCallback(callback) { this.requestRender = callback; }

    computeSafeDistance() {
        const skyRadius = SKY_RADIUS_MULTIPLIER * this.baseRadius;
        const nominalDistance = skyRadius * SUN_SAFE_DISTANCE_FACTOR;
        const fallbackDistance = this.baseRadius * SUN_FALLBACK_DISTANCE_MULTIPLIER;
        return Math.max(fallbackDistance, nominalDistance);
    }

    computeAngularRadius(distance) {
        const halfAngleRad = THREE.MathUtils.degToRad(SUN_ANGULAR_DIAMETER_DEGREES * 0.5);
        const angularRadius = Math.tan(halfAngleRad) * distance;
        return Math.max(angularRadius, this.baseRadius * 0.01);
    }

    /**
     * Create visible sun sprites.
     * @param {boolean} visible
     */
    create(visible = true) {
        this._disposed = false;
        this.group = new THREE.Group();
        this.group.frustumCulled = false;

        const discTexture = this._createSunDiscTexture();
        const haloTexture = this._createHaloTexture();
        const coronaTexture = this._createCoronaTexture("base");
        const coronaFlowTexture = this._createCoronaTexture("flow");
        const zodiacalTexture = this._createZodiacalLightTexture();
        const starburstTexture = this._createStarburstTexture();
        const flareTexture = this._createFlareTexture();

        this.coreSprite = new THREE.Sprite(
            new THREE.SpriteMaterial({
                map: discTexture,
                color: 0xffffff,
                transparent: true,
                opacity: 1.0,
                depthWrite: false,
                depthTest: true,
                toneMapped: false,
                blending: THREE.NormalBlending,
            }),
        );
        this.coreSprite.scale.setScalar(this.radius * 2);
        this.coreSprite.renderOrder = -18;
        this.group.add(this.coreSprite);

        this.haloSprite = new THREE.Sprite(
            new THREE.SpriteMaterial({
                map: haloTexture,
                color: 0xffffff,
                transparent: true,
                opacity: 1.0,
                depthWrite: false,
                depthTest: true,
                toneMapped: false,
                blending: THREE.AdditiveBlending,
            }),
        );
        this.haloSprite.renderOrder = -19;
        this.group.add(this.haloSprite);

        this.coronaSprite = new THREE.Sprite(
            new THREE.SpriteMaterial({
                map: coronaTexture,
                color: 0xffffff,
                transparent: true,
                opacity: 1.0,
                depthWrite: false,
                depthTest: true,
                toneMapped: false,
                blending: THREE.AdditiveBlending,
            }),
        );
        this.coronaSprite.renderOrder = -18.95;
        this.group.add(this.coronaSprite);

        this.coronaFlowSprite = new THREE.Sprite(
            new THREE.SpriteMaterial({
                map: coronaFlowTexture,
                color: 0xffffff,
                transparent: true,
                opacity: 1.0,
                depthWrite: false,
                depthTest: true,
                toneMapped: false,
                blending: THREE.AdditiveBlending,
            }),
        );
        this.coronaFlowSprite.renderOrder = -18.9;
        this.group.add(this.coronaFlowSprite);

        this.zodiacalSprite = new THREE.Sprite(
            new THREE.SpriteMaterial({
                map: zodiacalTexture,
                color: 0xffffff,
                transparent: true,
                opacity: 1.0,
                depthWrite: false,
                depthTest: true,
                toneMapped: false,
                blending: THREE.AdditiveBlending,
            }),
        );
        this.zodiacalSprite.renderOrder = -18.98;
        this.group.add(this.zodiacalSprite);

        this.starburstSprite = new THREE.Sprite(
            new THREE.SpriteMaterial({
                map: starburstTexture,
                color: 0xffffff,
                transparent: true,
                opacity: 1.0,
                depthWrite: false,
                depthTest: true,
                toneMapped: false,
                blending: THREE.AdditiveBlending,
            }),
        );
        this.starburstSprite.renderOrder = -20;
        this.group.add(this.starburstSprite);

        this.flareSprite = new THREE.Sprite(
            new THREE.SpriteMaterial({
                map: flareTexture,
                color: 0xffe1b8,
                transparent: true,
                opacity: 1.0,
                depthWrite: false,
                depthTest: true,
                toneMapped: false,
                blending: THREE.AdditiveBlending,
            }),
        );
        this.flareSprite.renderOrder = -21;
        this.group.add(this.flareSprite);

        this._applyVisualState();

        this.group.visible = visible;
        this.parentContainer.add(this.group);

        this.setDirection(1, 0, 0);
    }

    /**
     * Set sun direction in scene coordinates.
     * @param {number} x
     * @param {number} y
     * @param {number} z
     */
    setDirection(x, y, z) {
        if (!this.group) {
            return;
        }
        const dx = Number(x);
        const dy = Number(y);
        const dz = Number(z);
        if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(dz)) {
            return;
        }

        this._direction.set(dx, dy, dz);
        const norm = this._direction.length();
        if (!Number.isFinite(norm) || norm <= 1e-12) {
            return;
        }
        this._direction.multiplyScalar(1 / norm);

        this._position
            .copy(this._referencePosition)
            .addScaledVector(this._direction, this.distance);
        this.group.position.copy(this._position);
    }

    /**
     * Set a camera-relative anchor position in scene coordinates.
     * @param {number} x
     * @param {number} y
     * @param {number} z
     */
    setReferencePosition(x, y, z) {
        if (!this.group) {
            return;
        }
        const rx = Number(x);
        const ry = Number(y);
        const rz = Number(z);
        if (!Number.isFinite(rx) || !Number.isFinite(ry) || !Number.isFinite(rz)) {
            return;
        }
        this._referencePosition.set(rx, ry, rz);
        this._position
            .copy(this._referencePosition)
            .addScaledVector(this._direction, this.distance);
        this.group.position.copy(this._position);
    }

    /**
     * Copy current reference position into outVector.
     * @param {THREE.Vector3} outVector
     * @returns {boolean}
     */
    getReferencePosition(outVector) {
        if (!outVector || !this.group) {
            return false;
        }
        outVector.copy(this._referencePosition);
        return true;
    }

    /**
     * Animate the corona slowly with layered, deterministic drift.
     * @param {number} timeMs
     */
    updateAppearance(timeMs) {
        const browserClockMs = typeof window !== "undefined" && typeof window.performance?.now === "function"
            ? window.performance.now()
            : null;
        const animationMs = Number.isFinite(browserClockMs)
            ? browserClockMs
            : (Number.isFinite(Number(timeMs)) ? Number(timeMs) : 0);
        const seconds = animationMs / 1000;
        const motionMul = THREE.MathUtils.clamp(Number(this._visualState.coronaMotionMul), 0, 2.5);
        const baseRotation =
            (SUN_CORONA_BASE_ROTATION_AMPLITUDE * Math.sin(seconds * 0.035 * motionMul)) +
            (0.010 * Math.sin(1.7 + (seconds * 0.052 * motionMul)));

        if (this.coronaSprite?.material) {
            this.coronaSprite.material.rotation = baseRotation;
        }

        if (this.coronaFlowSprite?.material) {
            const flowOpacity = THREE.MathUtils.clamp(Number(this._visualState.coronaFlowOpacity), 0, 1);
            const slowPulse =
                0.78 +
                (0.18 * Math.sin(0.8 + (seconds * 0.40 * motionMul))) +
                (0.10 * Math.sin(2.4 + (seconds * 0.63 * motionMul)));
            this.coronaFlowSprite.material.rotation =
                0.38 + (seconds * SUN_CORONA_FLOW_ROTATION_SPEED * motionMul) +
                (0.080 * Math.sin(1.1 + (seconds * 0.24 * motionMul)));
            this.coronaFlowSprite.material.opacity = THREE.MathUtils.clamp(flowOpacity * slowPulse, 0, 1);
            const scaleMul = Number(this._visualState.coronaFlowScaleMul);
            if (Number.isFinite(scaleMul) && scaleMul > 0) {
                const scalePulse = 1 + (0.050 * Math.sin(0.35 + (seconds * 0.32 * motionMul)));
                this.coronaFlowSprite.scale.setScalar(this.radius * 2 * scaleMul * scalePulse);
            }
            this.coronaFlowSprite.visible = flowOpacity > 1e-4;
        }

        if (this.zodiacalSprite?.material) {
            const rotation = Number(this._visualState.zodiacalRotationRad);
            this.zodiacalSprite.material.rotation = Number.isFinite(rotation) ? rotation : -0.08;
        }
    }

    /**
     * Get current visual state used by sprite optics.
     * @returns {Object}
     */
    getVisualState() {
        return { ...this._visualState };
    }

    /**
     * Apply partial visual overrides to the Sun sprite optics.
     * @param {Object} nextState
     */
    setVisualState(nextState = {}) {
        if (!nextState || typeof nextState !== "object") {
            return;
        }
        this._visualState = {
            ...this._visualState,
            ...nextState,
        };
        this._applyVisualState();
    }

    _applyVisualState() {
        const base = this.radius * 2;
        const clampOpacity = (value) => THREE.MathUtils.clamp(Number(value), 0, 1);
        const safeScale = (value, fallback) => {
            const n = Number(value);
            if (!Number.isFinite(n) || n <= 0) return fallback;
            return n;
        };

        if (this.coreSprite?.material) {
            const opacity = clampOpacity(this._visualState.coreOpacity);
            this.coreSprite.material.opacity = opacity;
            const scaleMul = safeScale(this._visualState.coreScaleMul, 1.0);
            this.coreSprite.scale.setScalar(base * scaleMul);
            this.coreSprite.visible = opacity > 1e-4;
        }
        if (this.haloSprite?.material) {
            const opacity = clampOpacity(this._visualState.haloOpacity);
            this.haloSprite.material.opacity = opacity;
            const scaleMul = safeScale(this._visualState.haloScaleMul, SUN_HALO_SCALE);
            this.haloSprite.scale.setScalar(base * scaleMul);
            this.haloSprite.visible = opacity > 1e-4;
        }
        if (this.coronaSprite?.material) {
            const opacity = clampOpacity(this._visualState.coronaOpacity);
            this.coronaSprite.material.opacity = opacity;
            const scaleMul = safeScale(this._visualState.coronaScaleMul, SUN_CORONA_SCALE);
            this.coronaSprite.scale.setScalar(base * scaleMul);
            this.coronaSprite.visible = opacity > 1e-4;
        }
        if (this.coronaFlowSprite?.material) {
            const opacity = clampOpacity(this._visualState.coronaFlowOpacity);
            this.coronaFlowSprite.material.opacity = opacity;
            const scaleMul = safeScale(this._visualState.coronaFlowScaleMul, SUN_CORONA_FLOW_SCALE);
            this.coronaFlowSprite.scale.setScalar(base * scaleMul);
            this.coronaFlowSprite.visible = opacity > 1e-4;
        }
        if (this.zodiacalSprite?.material) {
            const opacity = clampOpacity(this._visualState.zodiacalOpacity);
            this.zodiacalSprite.material.opacity = opacity;
            const scaleXMul = safeScale(this._visualState.zodiacalScaleXMul, SUN_ZODIACAL_SCALE_X);
            const scaleYMul = safeScale(this._visualState.zodiacalScaleYMul, SUN_ZODIACAL_SCALE_Y);
            this.zodiacalSprite.scale.set(base * scaleXMul, base * scaleYMul, 1);
            const rotation = Number(this._visualState.zodiacalRotationRad);
            this.zodiacalSprite.material.rotation = Number.isFinite(rotation) ? rotation : -0.08;
            this.zodiacalSprite.visible = opacity > 1e-4;
        }
        if (this.starburstSprite?.material) {
            const opacity = clampOpacity(this._visualState.starburstOpacity);
            this.starburstSprite.material.opacity = opacity;
            const scaleMul = safeScale(this._visualState.starburstScaleMul, SUN_STARBURST_SCALE);
            this.starburstSprite.scale.setScalar(base * scaleMul);
            this.starburstSprite.visible = opacity > 1e-4;
        }
        if (this.flareSprite?.material) {
            const opacity = clampOpacity(this._visualState.flareOpacity);
            this.flareSprite.material.opacity = opacity;
            const scaleXMul = safeScale(this._visualState.flareScaleXMul, SUN_FLARE_SCALE_X);
            const scaleYMul = safeScale(this._visualState.flareScaleYMul, SUN_FLARE_SCALE_Y);
            this.flareSprite.scale.set(base * scaleXMul, base * scaleYMul, 1);
            this.flareSprite.visible = opacity > 1e-4;
        }
    }

    /**
     * @param {boolean} visible
     */
    setVisible(visible) {
        if (this.group) {
            this.group.visible = visible;
        }
    }

    /**
     * Dispose meshes and materials.
     */
    dispose() {
        this._disposed = true;
        this.requestRender = null;
        if (!this.group) {
            return;
        }

        const disposeSprite = (sprite) => {
            if (!sprite) return;
            this.group.remove(sprite);
            if (sprite.material?.map) {
                sprite.material.map.dispose?.();
            }
            sprite.material?.dispose?.();
        };

        disposeSprite(this.coreSprite);
        this.coreSprite = null;

        disposeSprite(this.haloSprite);
        this.haloSprite = null;

        disposeSprite(this.coronaSprite);
        this.coronaSprite = null;

        disposeSprite(this.coronaFlowSprite);
        this.coronaFlowSprite = null;

        disposeSprite(this.zodiacalSprite);
        this.zodiacalSprite = null;

        disposeSprite(this.starburstSprite);
        this.starburstSprite = null;

        if (this.flareSprite) {
            disposeSprite(this.flareSprite);
            this.flareSprite = null;
        }

        for (const texture of this._dynamicTextures) {
            texture?.dispose?.();
        }
        this._dynamicTextures = [];

        this.parentContainer.remove(this.group);
        this.group = null;
    }

    _createSunDiscTexture() {
        const size = 512;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            return null;
        }

        ctx.clearRect(0, 0, size, size);

        const gradient = ctx.createRadialGradient(
            size * 0.5,
            size * 0.5,
            size * 0.04,
            size * 0.5,
            size * 0.5,
            size * 0.5,
        );
        gradient.addColorStop(0.00, "rgba(255,255,250,1.0)");
        gradient.addColorStop(0.58, "rgba(255,250,238,1.0)");
        gradient.addColorStop(0.86, "rgba(255,243,218,0.95)");
        gradient.addColorStop(0.96, "rgba(255,228,190,0.50)");
        gradient.addColorStop(1.00, "rgba(255,228,190,0.00)");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        this._dynamicTextures.push(texture);
        return texture;
    }

    _createHaloTexture() {
        const size = 512;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            return null;
        }

        ctx.clearRect(0, 0, size, size);

        const gradient = ctx.createRadialGradient(
            size * 0.5,
            size * 0.5,
            size * 0.04,
            size * 0.5,
            size * 0.5,
            size * 0.5,
        );
        gradient.addColorStop(0.00, "rgba(255,245,220,0.26)");
        gradient.addColorStop(0.30, "rgba(255,222,176,0.22)");
        gradient.addColorStop(0.58, "rgba(255,210,150,0.10)");
        gradient.addColorStop(1.00, "rgba(255,180,120,0.00)");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        this._dynamicTextures.push(texture);
        return texture;
    }

    _createCoronaTexture(variant) {
        const url = variant === "base"
            ? new URL("../../assets/sun-corona-base.png", import.meta.url).href
            : new URL("../../assets/sun-corona-flow.png", import.meta.url).href;
        const texture = new THREE.TextureLoader().load(url, loaded => {
            if (this._disposed) { loaded.dispose(); return; }
            this.requestRender?.();
        }, undefined, error => console.warn("Sun corona texture unavailable.", error));
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        this._dynamicTextures.push(texture);
        return texture;
    }

    _createZodiacalLightTexture() {
        const width = 1024;
        const height = 512;
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            return null;
        }

        ctx.clearRect(0, 0, width, height);
        const imageData = ctx.createImageData(width, height);
        const data = imageData.data;
        const cx = (width - 1) * 0.5;
        const cy = (height - 1) * 0.5;
        const invX = 1 / Math.max(cx, 1);
        const invY = 1 / Math.max(cy, 1);

        for (let y = 0; y < height; y += 1) {
            const ny = (y - cy) * invY;
            for (let x = 0; x < width; x += 1) {
                const nx = (x - cx) * invX;
                const axial = Math.abs(nx);
                const vertical = Math.abs(ny);
                const longFalloff = Math.exp(-1.95 * (axial ** 1.45));
                const planeFalloff = Math.exp(-5.6 * (vertical ** 1.75));
                const shoulder = 0.78 + (0.22 * Math.exp(-7.5 * (axial ** 2)));
                const horizontalEdgeFade = 1 - smoothstep(0.76, 1.0, axial);
                const verticalEdgeFade = 1 - smoothstep(0.70, 1.0, vertical);
                const alpha = clamp01(
                    0.72 *
                    longFalloff *
                    planeFalloff *
                    shoulder *
                    horizontalEdgeFade *
                    verticalEdgeFade,
                );
                if (alpha <= 0.0005) {
                    continue;
                }
                const idx = ((y * width) + x) * 4;
                data[idx] = 255;
                data[idx + 1] = 238;
                data[idx + 2] = 205;
                data[idx + 3] = Math.round(alpha * 255);
            }
        }
        ctx.putImageData(imageData, 0, 0);

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        this._dynamicTextures.push(texture);
        return texture;
    }

    _createStarburstTexture() {
        const size = 1024;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            return null;
        }

        ctx.clearRect(0, 0, size, size);
        ctx.translate(size * 0.5, size * 0.5);

        const drawRay = (angleDeg, widthPx, innerAlpha, outerAlpha) => {
            const angle = THREE.MathUtils.degToRad(angleDeg);
            const len = size * 0.48;
            const halfW = widthPx * 0.5;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            const nx = -sin;
            const ny = cos;

            const x1 = nx * halfW;
            const y1 = ny * halfW;
            const x2 = cos * len + nx * halfW;
            const y2 = sin * len + ny * halfW;
            const x3 = cos * len - nx * halfW;
            const y3 = sin * len - ny * halfW;
            const x4 = -nx * halfW;
            const y4 = -ny * halfW;

            const grad = ctx.createLinearGradient(0, 0, cos * len, sin * len);
            grad.addColorStop(0.0, `rgba(255,248,234,${innerAlpha})`);
            grad.addColorStop(1.0, `rgba(255,220,170,${outerAlpha})`);
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.lineTo(x3, y3);
            ctx.lineTo(x4, y4);
            ctx.closePath();
            ctx.fill();
        };

        const primary = [0, 45, 90, 135];
        const secondary = [22.5, 67.5, 112.5, 157.5];
        primary.forEach((deg) => {
            drawRay(deg, size * 0.018, 0.95, 0.02);
            drawRay(deg + 180, size * 0.018, 0.95, 0.02);
        });
        secondary.forEach((deg) => {
            drawRay(deg, size * 0.010, 0.55, 0.01);
            drawRay(deg + 180, size * 0.010, 0.55, 0.01);
        });

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const core = ctx.createRadialGradient(
            size * 0.5,
            size * 0.5,
            size * 0.02,
            size * 0.5,
            size * 0.5,
            size * 0.13,
        );
        core.addColorStop(0.0, "rgba(255,255,252,0.95)");
        core.addColorStop(0.7, "rgba(255,245,220,0.35)");
        core.addColorStop(1.0, "rgba(255,230,190,0.0)");
        ctx.fillStyle = core;
        ctx.fillRect(0, 0, size, size);

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        this._dynamicTextures.push(texture);
        return texture;
    }

    _createFlareTexture() {
        const width = 1024;
        const height = 160;
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            return null;
        }

        const horizontal = ctx.createLinearGradient(0, height * 0.5, width, height * 0.5);
        horizontal.addColorStop(0.0, "rgba(255, 186, 106, 0.00)");
        horizontal.addColorStop(0.15, "rgba(255, 186, 106, 0.10)");
        horizontal.addColorStop(0.5, "rgba(255, 235, 184, 0.85)");
        horizontal.addColorStop(0.85, "rgba(255, 186, 106, 0.10)");
        horizontal.addColorStop(1.0, "rgba(255, 186, 106, 0.00)");
        ctx.fillStyle = horizontal;
        ctx.fillRect(0, 0, width, height);

        const verticalFalloff = ctx.createLinearGradient(width * 0.5, 0, width * 0.5, height);
        verticalFalloff.addColorStop(0.0, "rgba(0,0,0,0.0)");
        verticalFalloff.addColorStop(0.5, "rgba(0,0,0,0.86)");
        verticalFalloff.addColorStop(1.0, "rgba(0,0,0,0.0)");
        ctx.globalCompositeOperation = "destination-in";
        ctx.fillStyle = verticalFalloff;
        ctx.fillRect(0, 0, width, height);
        ctx.globalCompositeOperation = "source-over";

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        this._dynamicTextures.push(texture);
        return texture;
    }
}
