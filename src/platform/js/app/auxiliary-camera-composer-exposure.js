// Frame-and-Shoot eclipse, optics and exposure policies.

export function resolveComposerSolarEclipseState(
    dependencies,
    {
        craftWorld,
        earthWorld,
        moonWorld,
        earthRadius,
        moonRadius,
    } = {},
) {
    const {
        COMPOSER_AUTO_FOV_FOREGROUND_DIAMETER_FRACTION,
        COMPOSER_AUTO_FOV_TARGET_DIAMETER_FRACTION,
        COMPOSER_CAMERA_EXPOSURE,
        COMPOSER_CAMERA_SKY_CONSTELLATION_OPACITY_CAP,
        COMPOSER_CAMERA_SKY_STARMAP_OPACITY_CAP,
        COMPOSER_CONSTELLATION_LINES_OPACITY_CAP,
        COMPOSER_ECLIPSE_AUTO_EXPOSURE_EV,
        COMPOSER_ECLIPSE_CORONA_DEFAULT,
        COMPOSER_ECLIPSE_CORONA_MAX,
        COMPOSER_ECLIPSE_CORONA_MIN,
        COMPOSER_ECLIPSE_CORONA_VARIATION_DEFAULT,
        COMPOSER_ECLIPSE_ZODIACAL_DUST_DEFAULT,
        COMPOSER_EXPOSURE_EV_DEFAULT,
        COMPOSER_EXPOSURE_EV_MAX,
        COMPOSER_EXPOSURE_EV_MIN,
        COMPOSER_MAX_AMBIENT,
        COMPOSER_MAX_EARTHSHINE_GAIN,
        COMPOSER_MAX_MOONSHINE_GAIN,
        COMPOSER_MIN_AMBIENT,
        COMPOSER_MIN_EARTHSHINE_GAIN,
        COMPOSER_MIN_MOONSHINE_GAIN,
        COMPOSER_MOONSHINE_LIFT_SCALE,
        COMPOSER_MOON_SHADOW_LIFT_SCALE,
        COMPOSER_OPTICS_ADVANCED_MAX,
        COMPOSER_OPTICS_ADVANCED_MIN,
        COMPOSER_OPTICS_STRENGTH_MAX,
        COMPOSER_OPTICS_STRENGTH_MIN,
        COMPOSER_RENDER_EXPOSURE,
        COMPOSER_SKY_CONSTELLATION_OPACITY_CAP,
        COMPOSER_SKY_STARMAP_OPACITY_CAP,
        COMPOSER_SOLAR_ANGULAR_RADIUS_RAD,
        COMPOSER_STAR_MAGNITUDE_MAX,
        COMPOSER_STAR_MAGNITUDE_MIN,
        isComposerPlanetVisibleForMagnitudeLimit,
    } = dependencies;
    const sunDirection = this.sunDirectionCraftWorld;
    const sunLen = Number.isFinite(sunDirection?.length?.())
        ? sunDirection.length()
        : Math.hypot(
            Number(sunDirection?.x),
            Number(sunDirection?.y),
            Number(sunDirection?.z),
        );
    if (
        !craftWorld ||
        !Number.isFinite(craftWorld.x) ||
        !Number.isFinite(craftWorld.y) ||
        !Number.isFinite(craftWorld.z) ||
        !Number.isFinite(sunLen) ||
        sunLen <= 1e-12
    ) {
        return { active: false, occluder: null, coverage: 0 };
    }

    const clamp = this.THREE.MathUtils.clamp;
    const sunX = sunDirection.x / sunLen;
    const sunY = sunDirection.y / sunLen;
    const sunZ = sunDirection.z / sunLen;
    const evaluateBody = (id, bodyWorld, radius) => {
        const bodyRadius = Number(radius);
        if (
            !bodyWorld ||
            !Number.isFinite(bodyWorld.x) ||
            !Number.isFinite(bodyWorld.y) ||
            !Number.isFinite(bodyWorld.z) ||
            !Number.isFinite(bodyRadius) ||
            bodyRadius <= 0
        ) {
            return null;
        }
        const dx = bodyWorld.x - craftWorld.x;
        const dy = bodyWorld.y - craftWorld.y;
        const dz = bodyWorld.z - craftWorld.z;
        const distance = Math.hypot(dx, dy, dz);
        if (!Number.isFinite(distance) || distance <= bodyRadius) {
            return null;
        }
        const dot = clamp(((dx * sunX) + (dy * sunY) + (dz * sunZ)) / distance, -1, 1);
        if (dot <= 0) {
            return null;
        }
        const separationRad = Math.acos(dot);
        const bodyAngularRadiusRad = Math.asin(clamp(bodyRadius / distance, 0, 0.999999));
        const contactRad = bodyAngularRadiusRad + COMPOSER_SOLAR_ANGULAR_RADIUS_RAD;
        const fullCoverageRad = bodyAngularRadiusRad - COMPOSER_SOLAR_ANGULAR_RADIUS_RAD;
        const coverage = clamp(
            (contactRad - separationRad) / Math.max(COMPOSER_SOLAR_ANGULAR_RADIUS_RAD * 2, 1e-9),
            0,
            1,
        );
        const fullyObscured = fullCoverageRad >= 0 &&
            separationRad <= (fullCoverageRad + 1e-9);
        return {
            active: fullyObscured,
            occluder: id,
            coverage,
            fullyObscured,
            separationRad,
            bodyAngularRadiusRad,
        };
    };

    const moonOcclusion = evaluateBody("moon", moonWorld, moonRadius);
    const earthOcclusion = evaluateBody("earth", earthWorld, earthRadius);
    const best = [moonOcclusion, earthOcclusion]
        .filter(Boolean)
        .sort((a, b) => b.coverage - a.coverage)[0] || null;

    return best || { active: false, occluder: null, coverage: 0 };
}

export function resolveComposerEclipseCoronaVisualState(
    dependencies,
    panelState,
) {
    const {
        COMPOSER_AUTO_FOV_FOREGROUND_DIAMETER_FRACTION,
        COMPOSER_AUTO_FOV_TARGET_DIAMETER_FRACTION,
        COMPOSER_CAMERA_EXPOSURE,
        COMPOSER_CAMERA_SKY_CONSTELLATION_OPACITY_CAP,
        COMPOSER_CAMERA_SKY_STARMAP_OPACITY_CAP,
        COMPOSER_CONSTELLATION_LINES_OPACITY_CAP,
        COMPOSER_ECLIPSE_AUTO_EXPOSURE_EV,
        COMPOSER_ECLIPSE_CORONA_DEFAULT,
        COMPOSER_ECLIPSE_CORONA_MAX,
        COMPOSER_ECLIPSE_CORONA_MIN,
        COMPOSER_ECLIPSE_CORONA_VARIATION_DEFAULT,
        COMPOSER_ECLIPSE_ZODIACAL_DUST_DEFAULT,
        COMPOSER_EXPOSURE_EV_DEFAULT,
        COMPOSER_EXPOSURE_EV_MAX,
        COMPOSER_EXPOSURE_EV_MIN,
        COMPOSER_MAX_AMBIENT,
        COMPOSER_MAX_EARTHSHINE_GAIN,
        COMPOSER_MAX_MOONSHINE_GAIN,
        COMPOSER_MIN_AMBIENT,
        COMPOSER_MIN_EARTHSHINE_GAIN,
        COMPOSER_MIN_MOONSHINE_GAIN,
        COMPOSER_MOONSHINE_LIFT_SCALE,
        COMPOSER_MOON_SHADOW_LIFT_SCALE,
        COMPOSER_OPTICS_ADVANCED_MAX,
        COMPOSER_OPTICS_ADVANCED_MIN,
        COMPOSER_OPTICS_STRENGTH_MAX,
        COMPOSER_OPTICS_STRENGTH_MIN,
        COMPOSER_RENDER_EXPOSURE,
        COMPOSER_SKY_CONSTELLATION_OPACITY_CAP,
        COMPOSER_SKY_STARMAP_OPACITY_CAP,
        COMPOSER_SOLAR_ANGULAR_RADIUS_RAD,
        COMPOSER_STAR_MAGNITUDE_MAX,
        COMPOSER_STAR_MAGNITUDE_MIN,
        isComposerPlanetVisibleForMagnitudeLimit,
    } = dependencies;
    const clamp = this.THREE.MathUtils.clamp;
    const intensity = clamp(
        Number(panelState?.composerEclipseCoronaIntensity),
        COMPOSER_ECLIPSE_CORONA_MIN,
        COMPOSER_ECLIPSE_CORONA_MAX,
    );
    const motion = clamp(
        Number(panelState?.composerEclipseCoronaMotion),
        COMPOSER_ECLIPSE_CORONA_MIN,
        COMPOSER_ECLIPSE_CORONA_MAX,
    );
    const structure = clamp(
        Number(panelState?.composerEclipseCoronaStructure),
        COMPOSER_ECLIPSE_CORONA_MIN,
        COMPOSER_ECLIPSE_CORONA_MAX,
    );
    const dust = clamp(
        Number(panelState?.composerEclipseZodiacalDust),
        COMPOSER_ECLIPSE_CORONA_MIN,
        COMPOSER_ECLIPSE_CORONA_MAX,
    );
    const coronaIntensity = Number.isFinite(intensity)
        ? intensity
        : COMPOSER_ECLIPSE_CORONA_DEFAULT;
    const coronaMotion = Number.isFinite(motion)
        ? motion
        : COMPOSER_ECLIPSE_CORONA_DEFAULT;
    const coronaStructure = Number.isFinite(structure)
        ? structure
        : COMPOSER_ECLIPSE_CORONA_VARIATION_DEFAULT;
    const zodiacalDust = Number.isFinite(dust)
        ? dust
        : COMPOSER_ECLIPSE_ZODIACAL_DUST_DEFAULT;

    return {
        coreOpacity: 1.0,
        coreScaleMul: 1.0,
        haloOpacity: 0.0,
        haloScaleMul: 4.8,
        coronaOpacity: clamp(0.80 * coronaIntensity, 0, 1),
        coronaScaleMul: 90.0,
        coronaFlowOpacity: clamp(0.28 * coronaIntensity * coronaStructure, 0, 0.72),
        coronaFlowScaleMul: 84.0 + (4.0 * coronaIntensity),
        coronaMotionMul: coronaMotion,
        zodiacalOpacity: clamp(0.22 * coronaIntensity * zodiacalDust, 0, 0.55),
        zodiacalScaleXMul: 68.0,
        zodiacalScaleYMul: 30.0,
        zodiacalRotationRad: -0.08,
        starburstOpacity: 0.0,
        starburstScaleMul: 16.0,
        flareOpacity: 0.0,
        flareScaleXMul: 26.0,
        flareScaleYMul: 2.4,
    };
}

export function resolveComposerSunOpticsProfile(
    dependencies,
    panelState,
    { eclipseActive = panelState?.composerSolarEclipseActive === true } = {},
) {
    const {
        COMPOSER_AUTO_FOV_FOREGROUND_DIAMETER_FRACTION,
        COMPOSER_AUTO_FOV_TARGET_DIAMETER_FRACTION,
        COMPOSER_CAMERA_EXPOSURE,
        COMPOSER_CAMERA_SKY_CONSTELLATION_OPACITY_CAP,
        COMPOSER_CAMERA_SKY_STARMAP_OPACITY_CAP,
        COMPOSER_CONSTELLATION_LINES_OPACITY_CAP,
        COMPOSER_ECLIPSE_AUTO_EXPOSURE_EV,
        COMPOSER_ECLIPSE_CORONA_DEFAULT,
        COMPOSER_ECLIPSE_CORONA_MAX,
        COMPOSER_ECLIPSE_CORONA_MIN,
        COMPOSER_ECLIPSE_CORONA_VARIATION_DEFAULT,
        COMPOSER_ECLIPSE_ZODIACAL_DUST_DEFAULT,
        COMPOSER_EXPOSURE_EV_DEFAULT,
        COMPOSER_EXPOSURE_EV_MAX,
        COMPOSER_EXPOSURE_EV_MIN,
        COMPOSER_MAX_AMBIENT,
        COMPOSER_MAX_EARTHSHINE_GAIN,
        COMPOSER_MAX_MOONSHINE_GAIN,
        COMPOSER_MIN_AMBIENT,
        COMPOSER_MIN_EARTHSHINE_GAIN,
        COMPOSER_MIN_MOONSHINE_GAIN,
        COMPOSER_MOONSHINE_LIFT_SCALE,
        COMPOSER_MOON_SHADOW_LIFT_SCALE,
        COMPOSER_OPTICS_ADVANCED_MAX,
        COMPOSER_OPTICS_ADVANCED_MIN,
        COMPOSER_OPTICS_STRENGTH_MAX,
        COMPOSER_OPTICS_STRENGTH_MIN,
        COMPOSER_RENDER_EXPOSURE,
        COMPOSER_SKY_CONSTELLATION_OPACITY_CAP,
        COMPOSER_SKY_STARMAP_OPACITY_CAP,
        COMPOSER_SOLAR_ANGULAR_RADIUS_RAD,
        COMPOSER_STAR_MAGNITUDE_MAX,
        COMPOSER_STAR_MAGNITUDE_MIN,
        isComposerPlanetVisibleForMagnitudeLimit,
    } = dependencies;
    const profile = panelState?.composerSunProfile === "physical" ? "physical" : "camera";
    if (eclipseActive === true) {
        const isPhysical = profile === "physical";
        return {
            exposure: isPhysical ? COMPOSER_RENDER_EXPOSURE : COMPOSER_CAMERA_EXPOSURE,
            skyStarmapOpacityCap: isPhysical
                ? COMPOSER_SKY_STARMAP_OPACITY_CAP
                : COMPOSER_CAMERA_SKY_STARMAP_OPACITY_CAP,
            skyConstellationOpacityCap: isPhysical
                ? COMPOSER_SKY_CONSTELLATION_OPACITY_CAP
                : COMPOSER_CAMERA_SKY_CONSTELLATION_OPACITY_CAP,
            sunVisualState: this.resolveComposerEclipseCoronaVisualState(panelState),
        };
    }
    if (profile === "physical") {
        return {
            exposure: COMPOSER_RENDER_EXPOSURE,
            skyStarmapOpacityCap: COMPOSER_SKY_STARMAP_OPACITY_CAP,
            skyConstellationOpacityCap: COMPOSER_SKY_CONSTELLATION_OPACITY_CAP,
            sunVisualState: {
                coreOpacity: 1.0,
                coreScaleMul: 1.0,
                haloOpacity: 0.36,
                haloScaleMul: 4.8,
                coronaOpacity: 0.0,
                coronaScaleMul: 90.0,
                coronaFlowOpacity: 0.0,
                coronaFlowScaleMul: 84.0,
                coronaMotionMul: 0.0,
                zodiacalOpacity: 0.0,
                zodiacalScaleXMul: 68.0,
                zodiacalScaleYMul: 30.0,
                zodiacalRotationRad: -0.08,
                starburstOpacity: 0.0,
                starburstScaleMul: 16.0,
                flareOpacity: 0.0,
                flareScaleXMul: 26.0,
                flareScaleYMul: 2.4,
            },
        };
    }

    const clamp = this.THREE.MathUtils.clamp;
    const strength = clamp(
        Number(panelState?.composerSunStrength),
        COMPOSER_OPTICS_STRENGTH_MIN,
        COMPOSER_OPTICS_STRENGTH_MAX,
    );
    const haloGain = clamp(
        Number(panelState?.composerSunHaloGain),
        COMPOSER_OPTICS_ADVANCED_MIN,
        COMPOSER_OPTICS_ADVANCED_MAX,
    );
    const starburstGain = clamp(
        Number(panelState?.composerSunStarburstGain),
        COMPOSER_OPTICS_ADVANCED_MIN,
        COMPOSER_OPTICS_ADVANCED_MAX,
    );
    const flareGain = clamp(
        Number(panelState?.composerSunFlareGain),
        COMPOSER_OPTICS_ADVANCED_MIN,
        COMPOSER_OPTICS_ADVANCED_MAX,
    );

    const haloOpacity = clamp((0.20 + (0.20 * strength)) * haloGain, 0, 0.85);
    const haloScaleMul = 4.8 + (5.5 * strength);
    const starburstOpacity = clamp((0.12 + (0.14 * strength)) * starburstGain, 0, 0.92);
    const starburstScaleMul = 16.0 + (10.0 * strength);
    const flareOpacity = clamp((0.05 + (0.11 * strength)) * flareGain, 0, 0.78);
    const flareScaleXMul = 26.0 + (18.0 * strength);
    const flareScaleYMul = 2.4 + (1.1 * strength);

    return {
        exposure: COMPOSER_CAMERA_EXPOSURE,
        skyStarmapOpacityCap: COMPOSER_CAMERA_SKY_STARMAP_OPACITY_CAP,
        skyConstellationOpacityCap: COMPOSER_CAMERA_SKY_CONSTELLATION_OPACITY_CAP,
        sunVisualState: {
            coreOpacity: 1.0,
            coreScaleMul: 1.0,
            haloOpacity,
            haloScaleMul,
            coronaOpacity: 0.0,
            coronaScaleMul: 90.0,
            coronaFlowOpacity: 0.0,
            coronaFlowScaleMul: 84.0,
            coronaMotionMul: 0.0,
            zodiacalOpacity: 0.0,
            zodiacalScaleXMul: 68.0,
            zodiacalScaleYMul: 30.0,
            zodiacalRotationRad: -0.08,
            starburstOpacity,
            starburstScaleMul,
            flareOpacity,
            flareScaleXMul,
            flareScaleYMul,
        },
    };
}

export function resolveComposerExposureState(
    dependencies,
    panelState,
    { eclipseActive = panelState?.composerSolarEclipseActive === true } = {},
) {
    const {
        COMPOSER_AUTO_FOV_FOREGROUND_DIAMETER_FRACTION,
        COMPOSER_AUTO_FOV_TARGET_DIAMETER_FRACTION,
        COMPOSER_CAMERA_EXPOSURE,
        COMPOSER_CAMERA_SKY_CONSTELLATION_OPACITY_CAP,
        COMPOSER_CAMERA_SKY_STARMAP_OPACITY_CAP,
        COMPOSER_CONSTELLATION_LINES_OPACITY_CAP,
        COMPOSER_ECLIPSE_AUTO_EXPOSURE_EV,
        COMPOSER_ECLIPSE_CORONA_DEFAULT,
        COMPOSER_ECLIPSE_CORONA_MAX,
        COMPOSER_ECLIPSE_CORONA_MIN,
        COMPOSER_ECLIPSE_CORONA_VARIATION_DEFAULT,
        COMPOSER_ECLIPSE_ZODIACAL_DUST_DEFAULT,
        COMPOSER_EXPOSURE_EV_DEFAULT,
        COMPOSER_EXPOSURE_EV_MAX,
        COMPOSER_EXPOSURE_EV_MIN,
        COMPOSER_MAX_AMBIENT,
        COMPOSER_MAX_EARTHSHINE_GAIN,
        COMPOSER_MAX_MOONSHINE_GAIN,
        COMPOSER_MIN_AMBIENT,
        COMPOSER_MIN_EARTHSHINE_GAIN,
        COMPOSER_MIN_MOONSHINE_GAIN,
        COMPOSER_MOONSHINE_LIFT_SCALE,
        COMPOSER_MOON_SHADOW_LIFT_SCALE,
        COMPOSER_OPTICS_ADVANCED_MAX,
        COMPOSER_OPTICS_ADVANCED_MIN,
        COMPOSER_OPTICS_STRENGTH_MAX,
        COMPOSER_OPTICS_STRENGTH_MIN,
        COMPOSER_RENDER_EXPOSURE,
        COMPOSER_SKY_CONSTELLATION_OPACITY_CAP,
        COMPOSER_SKY_STARMAP_OPACITY_CAP,
        COMPOSER_SOLAR_ANGULAR_RADIUS_RAD,
        COMPOSER_STAR_MAGNITUDE_MAX,
        COMPOSER_STAR_MAGNITUDE_MIN,
        isComposerPlanetVisibleForMagnitudeLimit,
    } = dependencies;
    const manualEv = this.THREE.MathUtils.clamp(
        Number(panelState?.composerExposureEv),
        COMPOSER_EXPOSURE_EV_MIN,
        COMPOSER_EXPOSURE_EV_MAX,
    );
    const boundedManualEv = Number.isFinite(manualEv)
        ? manualEv
        : COMPOSER_EXPOSURE_EV_DEFAULT;
    const eclipseAutoExposureEligible = panelState?.composerEclipseAutoExposureEligible !== false;
    const autoEv = panelState?.composerAutoExposureEnabled !== false &&
        eclipseActive === true &&
        eclipseAutoExposureEligible
        ? COMPOSER_ECLIPSE_AUTO_EXPOSURE_EV
        : 0;
    return {
        manualEv: boundedManualEv,
        autoEv,
        multiplier: Math.pow(2, boundedManualEv + autoEv),
    };
}

export function resolveComposerBodyDiscInView(
    dependencies,
    panelState,
    { bodyWorld, bodyRadius } = {},
) {
    const {
        COMPOSER_AUTO_FOV_FOREGROUND_DIAMETER_FRACTION,
        COMPOSER_AUTO_FOV_TARGET_DIAMETER_FRACTION,
        COMPOSER_CAMERA_EXPOSURE,
        COMPOSER_CAMERA_SKY_CONSTELLATION_OPACITY_CAP,
        COMPOSER_CAMERA_SKY_STARMAP_OPACITY_CAP,
        COMPOSER_CONSTELLATION_LINES_OPACITY_CAP,
        COMPOSER_ECLIPSE_AUTO_EXPOSURE_EV,
        COMPOSER_ECLIPSE_CORONA_DEFAULT,
        COMPOSER_ECLIPSE_CORONA_MAX,
        COMPOSER_ECLIPSE_CORONA_MIN,
        COMPOSER_ECLIPSE_CORONA_VARIATION_DEFAULT,
        COMPOSER_ECLIPSE_ZODIACAL_DUST_DEFAULT,
        COMPOSER_EXPOSURE_EV_DEFAULT,
        COMPOSER_EXPOSURE_EV_MAX,
        COMPOSER_EXPOSURE_EV_MIN,
        COMPOSER_MAX_AMBIENT,
        COMPOSER_MAX_EARTHSHINE_GAIN,
        COMPOSER_MAX_MOONSHINE_GAIN,
        COMPOSER_MIN_AMBIENT,
        COMPOSER_MIN_EARTHSHINE_GAIN,
        COMPOSER_MIN_MOONSHINE_GAIN,
        COMPOSER_MOONSHINE_LIFT_SCALE,
        COMPOSER_MOON_SHADOW_LIFT_SCALE,
        COMPOSER_OPTICS_ADVANCED_MAX,
        COMPOSER_OPTICS_ADVANCED_MIN,
        COMPOSER_OPTICS_STRENGTH_MAX,
        COMPOSER_OPTICS_STRENGTH_MIN,
        COMPOSER_RENDER_EXPOSURE,
        COMPOSER_SKY_CONSTELLATION_OPACITY_CAP,
        COMPOSER_SKY_STARMAP_OPACITY_CAP,
        COMPOSER_SOLAR_ANGULAR_RADIUS_RAD,
        COMPOSER_STAR_MAGNITUDE_MAX,
        COMPOSER_STAR_MAGNITUDE_MIN,
        isComposerPlanetVisibleForMagnitudeLimit,
    } = dependencies;
    const camera = panelState?.camera;
    const radius = Number(bodyRadius);
    if (
        !camera?.isCamera ||
        !bodyWorld ||
        !Number.isFinite(radius) ||
        radius <= 0
    ) {
        return false;
    }

    const canvas = panelState.renderer?.domElement || panelState.overlayCanvas || null;
    const width = Math.max(
        1,
        Number(canvas?.width) ||
            Number(canvas?.clientWidth) ||
            Number(panelState.viewport?.clientWidth) ||
            1,
    );
    const height = Math.max(
        1,
        Number(canvas?.height) ||
            Number(canvas?.clientHeight) ||
            Number(panelState.viewport?.clientHeight) ||
            1,
    );
    const fovDeg = Number(camera.fov);
    if (!Number.isFinite(fovDeg) || fovDeg <= 0 || !Number.isFinite(width) || !Number.isFinite(height)) {
        return false;
    }

    const projected = this.tmpVectorA || new this.THREE.Vector3();
    projected.copy(bodyWorld).project(camera);
    if (
        !Number.isFinite(projected.x) ||
        !Number.isFinite(projected.y) ||
        !Number.isFinite(projected.z) ||
        projected.z < -1 ||
        projected.z > 1
    ) {
        return false;
    }

    const cameraWorld = this.tmpVectorB || new this.THREE.Vector3();
    if (typeof camera.getWorldPosition === "function") {
        camera.getWorldPosition(cameraWorld);
    } else if (camera.position) {
        cameraWorld.copy(camera.position);
    } else {
        return false;
    }
    const distance = cameraWorld.distanceTo(bodyWorld);
    if (!Number.isFinite(distance) || distance <= radius) {
        return false;
    }

    const angularRadius = Math.asin(this.THREE.MathUtils.clamp(radius / distance, 0, 0.999999));
    const tanHalfVerticalFov = Math.tan(this.THREE.MathUtils.degToRad(fovDeg) * 0.5);
    const radiusPx = (Math.tan(angularRadius) / Math.max(tanHalfVerticalFov, 1e-9)) * (height * 0.5);
    if (!Number.isFinite(radiusPx) || radiusPx <= 0) {
        return false;
    }

    const cx = ((projected.x * 0.5) + 0.5) * width;
    const cy = (1 - ((projected.y * 0.5) + 0.5)) * height;
    return (
        cx + radiusPx >= 0 &&
        cx - radiusPx <= width &&
        cy + radiusPx >= 0 &&
        cy - radiusPx <= height
    );
}

export function applyComposerExposureProfile(
    dependencies,
    scene,
    panelState,
    sunRenderer,
    { exposureBias = 1, skyRenderer = null, eclipseActive = panelState?.composerSolarEclipseActive === true } = {},
) {
    const {
        COMPOSER_AUTO_FOV_FOREGROUND_DIAMETER_FRACTION,
        COMPOSER_AUTO_FOV_TARGET_DIAMETER_FRACTION,
        COMPOSER_CAMERA_EXPOSURE,
        COMPOSER_CAMERA_SKY_CONSTELLATION_OPACITY_CAP,
        COMPOSER_CAMERA_SKY_STARMAP_OPACITY_CAP,
        COMPOSER_CONSTELLATION_LINES_OPACITY_CAP,
        COMPOSER_ECLIPSE_AUTO_EXPOSURE_EV,
        COMPOSER_ECLIPSE_CORONA_DEFAULT,
        COMPOSER_ECLIPSE_CORONA_MAX,
        COMPOSER_ECLIPSE_CORONA_MIN,
        COMPOSER_ECLIPSE_CORONA_VARIATION_DEFAULT,
        COMPOSER_ECLIPSE_ZODIACAL_DUST_DEFAULT,
        COMPOSER_EXPOSURE_EV_DEFAULT,
        COMPOSER_EXPOSURE_EV_MAX,
        COMPOSER_EXPOSURE_EV_MIN,
        COMPOSER_MAX_AMBIENT,
        COMPOSER_MAX_EARTHSHINE_GAIN,
        COMPOSER_MAX_MOONSHINE_GAIN,
        COMPOSER_MIN_AMBIENT,
        COMPOSER_MIN_EARTHSHINE_GAIN,
        COMPOSER_MIN_MOONSHINE_GAIN,
        COMPOSER_MOONSHINE_LIFT_SCALE,
        COMPOSER_MOON_SHADOW_LIFT_SCALE,
        COMPOSER_OPTICS_ADVANCED_MAX,
        COMPOSER_OPTICS_ADVANCED_MIN,
        COMPOSER_OPTICS_STRENGTH_MAX,
        COMPOSER_OPTICS_STRENGTH_MIN,
        COMPOSER_RENDER_EXPOSURE,
        COMPOSER_SKY_CONSTELLATION_OPACITY_CAP,
        COMPOSER_SKY_STARMAP_OPACITY_CAP,
        COMPOSER_SOLAR_ANGULAR_RADIUS_RAD,
        COMPOSER_STAR_MAGNITUDE_MAX,
        COMPOSER_STAR_MAGNITUDE_MIN,
        isComposerPlanetVisibleForMagnitudeLimit,
    } = dependencies;
    if (panelState?.mode !== "composer") {
        return () => {};
    }

    const profile = this.resolveComposerSunOpticsProfile(panelState, { eclipseActive });
    const renderer = panelState.renderer;
    const originalExposure = renderer.toneMappingExposure;
    const boundedExposureBias = this.THREE.MathUtils.clamp(
        Number(exposureBias),
        0.5,
        1.5,
    );
    const exposureState = this.resolveComposerExposureState(panelState, { eclipseActive });
    renderer.toneMappingExposure = profile.exposure *
        (Number.isFinite(boundedExposureBias) ? boundedExposureBias : 1) *
        exposureState.multiplier;

    const activeSkyRenderer = skyRenderer || scene?.skyRenderer || null;
    const skyMesh = activeSkyRenderer?.skyMesh || null;
    const skyMaterial = skyMesh?.material || null;
    const constellationMesh = activeSkyRenderer?.constellationMesh || null;
    const constellationMaterial = constellationMesh?.material || null;
    const skyContainer = activeSkyRenderer?.container || null;
    const starContainer = activeSkyRenderer?.starRenderer?.container ||
        activeSkyRenderer?.starRenderer?.object3D ||
        null;
    const starUniforms = activeSkyRenderer?.starRenderer?.uniforms || null;
    const planetRenderer = activeSkyRenderer?.planetRenderer || null;
    const planetAlphaAttr = planetRenderer?.geometry?.getAttribute?.("aAlpha") || null;
    const planetAlphaArray = planetAlphaAttr?.array || null;
    const planetBodySlots = Array.isArray(planetRenderer?.bodySlots) ? planetRenderer.bodySlots : [];
    const originalSunVisualState = sunRenderer?.getVisualState?.() || null;
    const constellationLinesEnabled = panelState?.composerConstellationLinesEnabled === true;

    const originalSkyMeshVisible = typeof skyMesh?.visible === "boolean"
        ? skyMesh.visible
        : null;
    const originalSkyOpacity = Number.isFinite(skyMaterial?.opacity)
        ? skyMaterial.opacity
        : null;
    const originalConstellationOpacity = Number.isFinite(constellationMaterial?.opacity)
        ? constellationMaterial.opacity
        : null;
    const originalConstellationVisible = typeof constellationMesh?.visible === "boolean"
        ? constellationMesh.visible
        : null;
    const originalSkyContainerVisible = typeof skyContainer?.visible === "boolean"
        ? skyContainer.visible
        : null;
    const originalStarContainerVisible = typeof starContainer?.visible === "boolean"
        ? starContainer.visible
        : null;
    const originalStarPhotometricScale = Number.isFinite(starUniforms?.uPhotometricScale?.value)
        ? starUniforms.uPhotometricScale.value
        : null;
    const originalStarSizeScale = Number.isFinite(starUniforms?.uStarSizeScale?.value)
        ? starUniforms.uStarSizeScale.value
        : null;
    const originalStarMinPointSize = Number.isFinite(starUniforms?.uMinPointSize?.value)
        ? starUniforms.uMinPointSize.value
        : null;
    const originalStarMaxPointSize = Number.isFinite(starUniforms?.uMaxPointSize?.value)
        ? starUniforms.uMaxPointSize.value
        : null;
    const originalStarMagnitudeLimit = Number.isFinite(starUniforms?.uMagnitudeLimit?.value)
        ? starUniforms.uMagnitudeLimit.value
        : null;
    const originalPlanetAlphas = planetAlphaArray && planetBodySlots.length > 0
        ? new Float32Array(planetAlphaArray)
        : null;
    const starMagnitudeLimit = this.THREE.MathUtils.clamp(
        Number(panelState?.composerStarMagnitudeLimit),
        COMPOSER_STAR_MAGNITUDE_MIN,
        COMPOSER_STAR_MAGNITUDE_MAX,
    );

    if (originalSkyOpacity != null) {
        skyMaterial.opacity = Math.min(originalSkyOpacity, profile.skyStarmapOpacityCap);
    }
    if (originalSkyMeshVisible != null) {
        skyMesh.visible = true;
    }
    if (originalConstellationOpacity != null) {
        constellationMaterial.opacity = Math.min(
            originalConstellationOpacity,
            constellationLinesEnabled
                ? COMPOSER_CONSTELLATION_LINES_OPACITY_CAP
                : profile.skyConstellationOpacityCap,
        );
    }
    if (originalConstellationVisible != null) {
        constellationMesh.visible = constellationLinesEnabled;
    }
    if (originalSkyContainerVisible != null) {
        skyContainer.visible = true;
    }
    if (originalStarContainerVisible != null) {
        starContainer.visible = true;
    }
    if (sunRenderer?.setVisualState) {
        sunRenderer.setVisualState(profile.sunVisualState);
        sunRenderer.updateAppearance?.();
    }
    if (starUniforms && Number.isFinite(starMagnitudeLimit)) {
        const lift = Math.max(0, starMagnitudeLimit - 3);
        const visibilityGain = Math.pow(2.512, lift * 0.7);
        if (originalStarPhotometricScale != null && starUniforms.uPhotometricScale) {
            starUniforms.uPhotometricScale.value = originalStarPhotometricScale * visibilityGain;
        }
        if (originalStarSizeScale != null && starUniforms.uStarSizeScale) {
            starUniforms.uStarSizeScale.value = originalStarSizeScale * (0.8 + (0.08 * starMagnitudeLimit));
        }
        if (originalStarMinPointSize != null && starUniforms.uMinPointSize) {
            starUniforms.uMinPointSize.value = Math.max(originalStarMinPointSize, 0.85 + (0.08 * starMagnitudeLimit));
        }
        if (originalStarMaxPointSize != null && starUniforms.uMaxPointSize) {
            starUniforms.uMaxPointSize.value = Math.max(originalStarMaxPointSize, 5.5 + (0.7 * starMagnitudeLimit));
        }
        if (starUniforms.uMagnitudeLimit) {
            starUniforms.uMagnitudeLimit.value = starMagnitudeLimit;
        }
    }
    if (originalPlanetAlphas && Number.isFinite(starMagnitudeLimit)) {
        const count = Math.min(originalPlanetAlphas.length, planetBodySlots.length);
        for (let i = 0; i < count; i += 1) {
            planetAlphaArray[i] = isComposerPlanetVisibleForMagnitudeLimit(planetBodySlots[i], starMagnitudeLimit)
                ? originalPlanetAlphas[i]
                : 0;
        }
        if (planetAlphaAttr) {
            planetAlphaAttr.needsUpdate = true;
        }
    }

    return () => {
        renderer.toneMappingExposure = originalExposure;
        if (originalSkyOpacity != null && skyMaterial) {
            skyMaterial.opacity = originalSkyOpacity;
        }
        if (originalSkyMeshVisible != null && skyMesh) {
            skyMesh.visible = originalSkyMeshVisible;
        }
        if (originalConstellationOpacity != null && constellationMaterial) {
            constellationMaterial.opacity = originalConstellationOpacity;
        }
        if (originalConstellationVisible != null && constellationMesh) {
            constellationMesh.visible = originalConstellationVisible;
        }
        if (originalSkyContainerVisible != null && skyContainer) {
            skyContainer.visible = originalSkyContainerVisible;
        }
        if (originalStarContainerVisible != null && starContainer) {
            starContainer.visible = originalStarContainerVisible;
        }
        if (sunRenderer?.setVisualState && originalSunVisualState) {
            sunRenderer.setVisualState(originalSunVisualState);
        }
        if (starUniforms) {
            if (originalStarPhotometricScale != null && starUniforms.uPhotometricScale) {
                starUniforms.uPhotometricScale.value = originalStarPhotometricScale;
            }
            if (originalStarSizeScale != null && starUniforms.uStarSizeScale) {
                starUniforms.uStarSizeScale.value = originalStarSizeScale;
            }
            if (originalStarMinPointSize != null && starUniforms.uMinPointSize) {
                starUniforms.uMinPointSize.value = originalStarMinPointSize;
            }
            if (originalStarMaxPointSize != null && starUniforms.uMaxPointSize) {
                starUniforms.uMaxPointSize.value = originalStarMaxPointSize;
            }
            if (originalStarMagnitudeLimit != null && starUniforms.uMagnitudeLimit) {
                starUniforms.uMagnitudeLimit.value = originalStarMagnitudeLimit;
            }
        }
        if (originalPlanetAlphas && planetAlphaArray) {
            planetAlphaArray.set(originalPlanetAlphas);
            if (planetAlphaAttr) {
                planetAlphaAttr.needsUpdate = true;
            }
        }
    };
}
