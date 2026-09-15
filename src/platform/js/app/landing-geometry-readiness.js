// Late landing data updates only the descent geometry. Main mission orbits and
// scene readiness are owned by their existing initialization path.
export function refreshLandingGeometry(scene, data = null) {
    if (!scene || scene.name !== "lunar" || !scene.initialized3D ||
        scene.stopCreationFlag || !scene.motherContainer) {
        return false;
    }
    if (scene.landingOrbitLine && scene.landingOrbitData === data) {
        return false;
    }
    if (scene.landingOrbitLine) scene.disposeLandingCurve();
    scene.landingCurve = [];
    scene.landingCurveVelocities = [];
    scene.processLandingVectors();
    return scene.addLandingCurve();
}
