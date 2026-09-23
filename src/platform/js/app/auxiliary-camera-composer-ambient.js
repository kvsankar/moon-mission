// Frame-and-Shoot ambient lighting and automatic framing.

// Frame-and-Shoot lighting, eclipse, optics and exposure policies.
// Functions retain the manager as `this` while public methods remain compatibility wrappers.

export function applyComposerBodyAmbientLighting(
    dependencies,
    {
        panelState,
        earth = null,
        moon = null,
    },
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
    const earthAmbient = this.THREE.MathUtils.clamp(
        Number(panelState?.composerEarthAmbient),
        COMPOSER_MIN_AMBIENT,
        COMPOSER_MAX_AMBIENT,
    );
    const moonAmbient = this.THREE.MathUtils.clamp(
        Number(panelState?.composerMoonAmbient),
        COMPOSER_MIN_AMBIENT,
        COMPOSER_MAX_AMBIENT,
    );
    const moonshineGain = this.THREE.MathUtils.clamp(
        Number(panelState?.composerMoonshineGain),
        COMPOSER_MIN_MOONSHINE_GAIN,
        COMPOSER_MAX_MOONSHINE_GAIN,
    );
    const earthNightsideLift = Number.isFinite(earthAmbient) ? earthAmbient : 0;
    const earthMoonshineLift = Number.isFinite(moonshineGain)
        ? moonshineGain * COMPOSER_MOONSHINE_LIFT_SCALE
        : 0;
    const moonShadowLift = this.THREE.MathUtils.clamp(
        (Number.isFinite(moonAmbient) ? moonAmbient : 0) * COMPOSER_MOON_SHADOW_LIFT_SCALE,
        0,
        0.95,
    );
    const touchedMaterials = new Set();
    const restoreRecords = [];
    const refreshBodyMaterialUniforms = (material) => {
        material?.userData?.refreshEarthShaderUniforms?.();
        material?.userData?.refreshMoonShaderUniforms?.();
    };
    const applyToBodyEmissive = (bodyObject, intensity, emissiveHex) => {
        if (!bodyObject || !Number.isFinite(intensity) || intensity <= 1e-6) {
            return;
        }
        bodyObject.traverse((node) => {
            if (!node?.isMesh) {
                return;
            }
            const materials = Array.isArray(node.material) ? node.material : [node.material];
            for (const material of materials) {
                if (!material || touchedMaterials.has(material)) {
                    continue;
                }
                if (!material.map || !material.emissive || !Number.isFinite(material.emissiveIntensity)) {
                    continue;
                }
                touchedMaterials.add(material);
                restoreRecords.push({
                    material,
                    emissiveIntensity: material.emissiveIntensity,
                    emissiveHex: material.emissive.getHex(),
                });
                material.emissive.setHex(emissiveHex);
                material.emissiveIntensity = intensity;
                refreshBodyMaterialUniforms(material);
            }
        });
    };
    const applyEarthNightsideControls = (bodyObject, liftValue, moonshineLiftValue) => {
        if (!bodyObject || (!Number.isFinite(liftValue) && !Number.isFinite(moonshineLiftValue))) {
            return false;
        }
        let applied = false;
        bodyObject.traverse((node) => {
            if (!node?.isMesh) {
                return;
            }
            const materials = Array.isArray(node.material) ? node.material : [node.material];
            for (const material of materials) {
                if (!material || touchedMaterials.has(material) || !material.map) {
                    continue;
                }
                if (!material.userData) {
                    continue;
                }
                const hasNightsideLift = Object.prototype.hasOwnProperty.call(material.userData, "earthNightsideLift");
                const hasMoonshineLift = Object.prototype.hasOwnProperty.call(material.userData, "earthMoonshineLift");
                if (!hasNightsideLift && !hasMoonshineLift) {
                    continue;
                }
                const record = { material };
                if (hasNightsideLift) {
                    record.earthNightsideLift = material.userData.earthNightsideLift;
                }
                if (hasMoonshineLift) {
                    record.earthMoonshineLift = material.userData.earthMoonshineLift;
                }
                touchedMaterials.add(material);
                restoreRecords.push(record);
                if (hasNightsideLift && Number.isFinite(liftValue)) {
                    material.userData.earthNightsideLift = liftValue;
                }
                if (hasMoonshineLift && Number.isFinite(moonshineLiftValue)) {
                    material.userData.earthMoonshineLift = moonshineLiftValue;
                }
                refreshBodyMaterialUniforms(material);
                applied = true;
            }
        });
        return applied;
    };
    const applyMoonShadowLift = (bodyObject, shadowLiftValue) => {
        if (!bodyObject || !Number.isFinite(shadowLiftValue)) {
            return false;
        }
        let applied = false;
        bodyObject.traverse((node) => {
            if (!node?.isMesh) {
                return;
            }
            const materials = Array.isArray(node.material) ? node.material : [node.material];
            for (const material of materials) {
                if (!material || touchedMaterials.has(material) || !material.map) {
                    continue;
                }
                if (!material.userData || !Object.prototype.hasOwnProperty.call(material.userData, "moonShadowLift")) {
                    continue;
                }
                touchedMaterials.add(material);
                restoreRecords.push({
                    material,
                    moonShadowLift: material.userData.moonShadowLift,
                    emissiveIntensity: material.emissive && Number.isFinite(material.emissiveIntensity)
                        ? material.emissiveIntensity
                        : null,
                    emissiveHex: material.emissive?.getHex ? material.emissive.getHex() : null,
                });
                material.userData.moonShadowLift = shadowLiftValue;
                refreshBodyMaterialUniforms(material);
                applied = true;
            }
        });
        return applied;
    };

    // Earth Fill is an explicit creative lift for Earth's night side.
    // Moonshine uses a separate Earth shader lift so it remains visible on the night side.
    const earthLiftApplied = applyEarthNightsideControls(earth, earthNightsideLift, earthMoonshineLift);
    if (!earthLiftApplied) {
        applyToBodyEmissive(earth, earthNightsideLift + (earthMoonshineLift * 0.35), 0x6c86a6);
    }
    // Moon Fill is independent of Earthshine; zero must mean no artificial Moon fill.
    const moonLiftApplied = applyMoonShadowLift(moon, moonShadowLift);
    if (!moonLiftApplied) {
        const fallbackMoonEmissive = Number.isFinite(moonAmbient) ? (moonAmbient * 0.2) : 0;
        applyToBodyEmissive(moon, fallbackMoonEmissive, 0x9aa8bf);
    }

    return () => {
        for (const record of restoreRecords) {
            if (Object.prototype.hasOwnProperty.call(record, "earthNightsideLift")) {
                record.material.userData.earthNightsideLift = record.earthNightsideLift;
            }
            if (Object.prototype.hasOwnProperty.call(record, "earthMoonshineLift")) {
                record.material.userData.earthMoonshineLift = record.earthMoonshineLift;
            }
            if (
                Object.prototype.hasOwnProperty.call(record, "earthNightsideLift") ||
                Object.prototype.hasOwnProperty.call(record, "earthMoonshineLift")
            ) {
                refreshBodyMaterialUniforms(record.material);
                continue;
            }
            if (Object.prototype.hasOwnProperty.call(record, "moonShadowLift")) {
                record.material.userData.moonShadowLift = record.moonShadowLift;
                if (record.emissiveIntensity !== null && record.material.emissive) {
                    record.material.emissiveIntensity = record.emissiveIntensity;
                    record.material.emissive.setHex(record.emissiveHex);
                }
                refreshBodyMaterialUniforms(record.material);
                continue;
            }
            record.material.emissiveIntensity = record.emissiveIntensity;
            record.material.emissive.setHex(record.emissiveHex);
            refreshBodyMaterialUniforms(record.material);
        }
    };
}

export function resolveComposerBodyAmbientState(
    dependencies,
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
    const composerPanel = Array.isArray(this.panels)
        ? this.panels.find((panelState) => panelState?.mode === "composer")
        : null;
    if (!composerPanel) {
        return null;
    }
    return {
        composerEarthAmbient: composerPanel.composerEarthAmbient,
        composerMoonAmbient: composerPanel.composerMoonAmbient,
        composerMoonshineGain: composerPanel.composerMoonshineGain,
    };
}

export function applyComposerEarthshineGain(
    dependencies,
    panelState,
    scene,
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
    const lightFill = scene?.lightFill || null;
    if (!lightFill) {
        return () => {};
    }
    const previousIntensity = Number(lightFill.intensity);
    const gain = this.THREE.MathUtils.clamp(
        Number(panelState?.composerEarthshineGain),
        COMPOSER_MIN_EARTHSHINE_GAIN,
        COMPOSER_MAX_EARTHSHINE_GAIN,
    );
    if (!Number.isFinite(previousIntensity) || !Number.isFinite(gain)) {
        return () => {};
    }
    lightFill.intensity = Math.max(0, previousIntensity) * gain;
    return () => {
        lightFill.intensity = previousIntensity;
    };
}

export function applyComposerMoonshineGain(
    dependencies,
    panelState,
    scene,
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
    const lightMoonshine = scene?.lightMoonshine || null;
    if (!lightMoonshine) {
        return () => {};
    }
    const previousIntensity = Number(lightMoonshine.intensity);
    const gain = this.THREE.MathUtils.clamp(
        Number(panelState?.composerMoonshineGain),
        COMPOSER_MIN_MOONSHINE_GAIN,
        COMPOSER_MAX_MOONSHINE_GAIN,
    );
    if (!Number.isFinite(previousIntensity) || !Number.isFinite(gain)) {
        return () => {};
    }
    lightMoonshine.intensity = Math.max(0, previousIntensity) * gain;
    return () => {
        lightMoonshine.intensity = previousIntensity;
    };
}

export function updateBodyNorthWorld(
    dependencies,
    bodyObject,
    targetVector,
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
    if (!bodyObject?.getWorldQuaternion || !targetVector?.set) {
        return false;
    }
    bodyObject.getWorldQuaternion(this.targetQuat);
    targetVector.set(0, 0, 1).applyQuaternion(this.targetQuat);
    const len = targetVector.length();
    if (!Number.isFinite(len) || len <= 1e-12) {
        targetVector.set(0, 0, 1);
        return false;
    }
    targetVector.multiplyScalar(1 / len);
    return true;
}

export function computeComposerAutoFovDegrees(
    dependencies,
    {
        panelState,
        craftWorld,
        earthWorld,
        moonWorld,
        earthRadius,
        moonRadius,
        lockTarget = "none",
    },
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
    if (lockTarget !== "earth" && lockTarget !== "moon") {
        return panelState.camera.fov;
    }
    const targetKind = lockTarget;
    const targetWorld = targetKind === "moon" ? moonWorld : earthWorld;
    if (!targetWorld || !craftWorld) {
        return panelState.camera.fov;
    }

    this.tmpVectorA.subVectors(targetWorld, craftWorld);
    const distance = this.tmpVectorA.length();
    if (!Number.isFinite(distance) || distance <= 1e-6) {
        return panelState.camera.fov;
    }

    const targetRadius = targetKind === "moon"
        ? (Number.isFinite(moonRadius) && moonRadius > 0 ? moonRadius : 1)
        : (Number.isFinite(earthRadius) && earthRadius > 0 ? earthRadius : 1);
    const safeAspect = Math.max(panelState.camera.aspect || 1, 1e-3);
    const computeBodyFov = ({ bodyDistance, bodyRadius, diameterFraction }) => {
        const safeDistance = Math.max(bodyDistance, bodyRadius + 1e-9);
        const ratio = this.THREE.MathUtils.clamp(bodyRadius / safeDistance, 0, 0.999999);
        const angularRadius = Math.asin(ratio);
        const halfFrameFraction = Math.max(diameterFraction, 1e-3);
        const tanAngularRadius = Math.tan(angularRadius);
        const verticalHalfFromHeight = Math.atan(tanAngularRadius / halfFrameFraction);
        const verticalHalfFromWidth = Math.atan(tanAngularRadius / (halfFrameFraction * safeAspect));
        const requiredHalfVertical = Math.max(verticalHalfFromHeight, verticalHalfFromWidth);
        return {
            angularRadius,
            fovDegrees: this.THREE.MathUtils.radToDeg(requiredHalfVertical * 2),
        };
    };
    const targetFov = computeBodyFov({
        bodyDistance: distance,
        bodyRadius: targetRadius,
        diameterFraction: COMPOSER_AUTO_FOV_TARGET_DIAMETER_FRACTION,
    });
    let autoFovDegrees = targetFov.fovDegrees;

    const foregroundWorld = targetKind === "moon" ? earthWorld : moonWorld;
    const foregroundRadius = targetKind === "moon"
        ? (Number.isFinite(earthRadius) && earthRadius > 0 ? earthRadius : 1)
        : (Number.isFinite(moonRadius) && moonRadius > 0 ? moonRadius : 1);
    if (foregroundWorld) {
        const foregroundVector = this.tmpVectorB || new this.THREE.Vector3();
        foregroundVector.subVectors(foregroundWorld, craftWorld);
        const foregroundDistance = foregroundVector.length();
        if (
            Number.isFinite(foregroundDistance) &&
            foregroundDistance > 1e-6 &&
            foregroundDistance < distance
        ) {
            const foregroundFov = computeBodyFov({
                bodyDistance: foregroundDistance,
                bodyRadius: foregroundRadius,
                diameterFraction: COMPOSER_AUTO_FOV_FOREGROUND_DIAMETER_FRACTION,
            });
            const targetDirection = this.tmpVectorA.clone().multiplyScalar(1 / distance);
            const foregroundDirection = foregroundVector.multiplyScalar(1 / foregroundDistance);
            const centerSeparation = Math.acos(this.THREE.MathUtils.clamp(
                targetDirection.dot(foregroundDirection),
                -1,
                1,
            ));
            const targetHalfVertical = this.THREE.MathUtils.degToRad(autoFovDegrees * 0.5);
            const targetHalfHorizontal = Math.atan(Math.tan(targetHalfVertical) * safeAspect);
            const targetHalfDiagonal = Math.hypot(targetHalfVertical, targetHalfHorizontal);
            if (centerSeparation <= targetHalfDiagonal + foregroundFov.angularRadius) {
                autoFovDegrees = Math.max(autoFovDegrees, foregroundFov.fovDegrees);
            }
        }
    }
    return autoFovDegrees;
}
