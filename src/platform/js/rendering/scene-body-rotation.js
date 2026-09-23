import { getRelativeFrameQuaternion } from "../data/relative-frame-provider.js";

// Applies inertial and relative Earth/Moon rotation to scene-owned objects.
export function createSceneBodyRotationEffects({
    THREE,
    PC,
    lunar_pole,
    bodyRotationActions,
    getBodyEphemerisState,
    resolveBodySource,
    getRuntimeState,
}) {
    function resolveRelativeFrame(runtimeState, timeMs) {
        const published = getRelativeFrameQuaternion({
            chebyshevData: runtimeState.chebyshevData,
            config: runtimeState.config,
            timeMs,
        });
        if (published) {
            return new THREE.Quaternion(published.x, published.y, published.z, published.w);
        }

        const moonState = getBodyEphemerisState({
            bodyId: "MOON",
            timeMs,
            config: runtimeState.config,
            npzData: runtimeState.npzData,
            npzDataLoaded: runtimeState.npzDataLoaded,
            chebyshevData: runtimeState.chebyshevData,
            chebyshevDataLoaded: runtimeState.chebyshevDataLoaded,
            resolvedSource: resolveBodySource({
                bodyId: "MOON",
                bodySources: runtimeState.bodyEphemerisSources,
                defaultSpacecraftSource: runtimeState.ephemerisSource,
            }),
            defaultSpacecraftSource: runtimeState.ephemerisSource,
        });
        if (!moonState.available) return null;

        const r = new THREE.Vector3(moonState.position.x, moonState.position.y, moonState.position.z);
        const v = new THREE.Vector3(moonState.velocity.vx, moonState.velocity.vy, moonState.velocity.vz);
        if (r.lengthSq() === 0) return null;

        const xHat = r.clone().normalize();
        const zHat = new THREE.Vector3().crossVectors(r, v);
        if (zHat.lengthSq() === 0) return null;
        zHat.normalize();
        const yHat = new THREE.Vector3().crossVectors(zHat, xHat);
        if (yHat.lengthSq() === 0) return null;
        yHat.normalize();

        const relativeToInertial = new THREE.Matrix4().makeBasis(xHat, yHat, zHat);
        return new THREE.Quaternion().setFromRotationMatrix(relativeToInertial.clone().transpose());
    }

    function lunarInertialQuaternion(timeMs) {
        const { alpha, delta, W } = lunar_pole(new Date(timeMs));
        const qx1 = new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(1, 0, 0), -PC.EARTH_AXIS_INCLINATION_RADS,
        );
        const qz2 = new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 0, 1), Math.PI / 2 + alpha,
        );
        const qx3 = new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(1, 0, 0), Math.PI / 2 - delta,
        );
        const qz4 = new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 0, 1), W,
        );
        return new THREE.Quaternion().multiply(qx1).multiply(qz2).multiply(qx3).multiply(qz4);
    }

    function rotateMoon(scene, timeMs = getRuntimeState().animTime) {
        const runtimeState = getRuntimeState();
        if (!runtimeState.globalConfig?.is_lunar || !scene.moonContainer) return;

        if (runtimeState.frameMode === "relative" && runtimeState.config === "geo") {
            const frame = resolveRelativeFrame(runtimeState, timeMs);
            if (!frame) return;
            scene.moonContainer.quaternion.copy(frame).multiply(lunarInertialQuaternion(timeMs));
            return;
        }

        bodyRotationActions.rotateMoon({
            timeMs,
            globalConfig: runtimeState.globalConfig,
            moonContainer: scene.moonContainer,
        });
    }

    function rotateEarth(scene, timeMs = getRuntimeState().animTime) {
        const runtimeState = getRuntimeState();
        if (runtimeState.frameMode === "relative" && runtimeState.config === "geo" && scene.earthContainer) {
            const frame = resolveRelativeFrame(runtimeState, timeMs);
            if (!frame) return;

            const inertial = bodyRotationActions.getEarthInertialQuaternion?.(timeMs);
            scene.earthContainer.quaternion.copy(frame);
            if (inertial) {
                scene.earthContainer.quaternion.multiply(new THREE.Quaternion(
                    inertial.x, inertial.y, inertial.z, inertial.w,
                ));
            }
            if (scene.skyContainer && scene.skyBaseQuaternion) {
                scene.skyContainer.quaternion.copy(frame).multiply(scene.skyBaseQuaternion);
            }
            return;
        }

        bodyRotationActions.rotateEarth({ timeMs, earthContainer: scene.earthContainer });
        if (scene.skyContainer && scene.skyBaseQuaternion) {
            scene.skyContainer.quaternion.copy(scene.skyBaseQuaternion);
        }
    }

    return { rotateMoon, rotateEarth };
}
