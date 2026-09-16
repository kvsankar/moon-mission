import { detachSceneTextureFields, SCENE_TEXTURE_FIELDS } from "./scene-texture-actions.js";

import { applySkyLayerVisibility } from "./sky-visibility.js";

export function createSkyActions({ SkyRenderer, render }) {
    function readOptionalChecked(id) {
        const node = typeof document !== "undefined" ? document.getElementById(id) : null;
        if (!node) return undefined;
        return Boolean(node.checked);
    }

    function readOptionalNumeric(id) {
        const node = typeof document !== "undefined" ? document.getElementById(id) : null;
        if (!node) return undefined;
        const value = Number(node.value);
        return Number.isFinite(value) ? value : undefined;
    }

    function readInitialSkyParameters(scene) {
        const atmosphereEnabled = readOptionalChecked("sky-atmosphere-enabled") ??
            readOptionalChecked("atmosphere-enabled") ??
            readOptionalChecked("atmosphere_enabled");
        const bloomStrength = readOptionalNumeric("sky-bloom-strength") ??
            readOptionalNumeric("bloom-strength") ??
            readOptionalNumeric("bloom_strength");
        const starSizeScale = readOptionalNumeric("sky-star-size-scale") ??
            readOptionalNumeric("star-size-scale") ??
            readOptionalNumeric("star_size_scale");
        const extinctionStrength = readOptionalNumeric("sky-extinction-strength") ??
            readOptionalNumeric("extinction-strength") ??
            readOptionalNumeric("extinction_strength");
        const twinkleStrength = readOptionalNumeric("sky-twinkle-strength") ??
            readOptionalNumeric("twinkle-strength") ??
            readOptionalNumeric("twinkle_strength");
        const observerLat = readOptionalNumeric("sky-observer-lat") ??
            readOptionalNumeric("observer-lat") ??
            readOptionalNumeric("observer_lat");
        const observerLon = readOptionalNumeric("sky-observer-lon") ??
            readOptionalNumeric("observer-lon") ??
            readOptionalNumeric("observer_lon");
        const skyTimeSeconds = readOptionalNumeric("sky-time-seconds");
        const skyTimeMs = readOptionalNumeric("sky-time-ms") ??
            (Number.isFinite(skyTimeSeconds) ? skyTimeSeconds * 1000 : undefined);
        const planetCenterMode = scene?.name === "lunar" ? "moon" : "earth";

        return {
            atmosphere_enabled: atmosphereEnabled,
            procedural_stars_enabled: true,
            planet_center_mode: planetCenterMode,
            bloom_strength: bloomStrength,
            star_size_scale: starSizeScale,
            extinction_strength: extinctionStrength,
            twinkle_strength: twinkleStrength,
            observer_lat: observerLat,
            observer_lon: observerLon,
            sky_time_ms: skyTimeMs,
        };
    }
    function addSky(scene, { earthRadius, viewSky, viewConstellationLines }) {
        scene.skyRenderer = new SkyRenderer(scene.motherContainer, earthRadius);
        scene.skyRenderer.setTextures(scene.skyTexture, scene.skyConstellationTexture);
        scene.skyRenderer.create(viewSky || viewConstellationLines);

        scene.skyContainer = scene.skyRenderer.container;
        scene.sky = scene.skyRenderer.skyMesh;
        scene.skyConstellation = scene.skyRenderer.constellationMesh;
        scene.skyBaseQuaternion = scene.skyContainer?.quaternion?.clone?.() || null;
        scene.skyRenderer?.setParameters?.(readInitialSkyParameters(scene));
        applySkyLayerVisibility(scene, { viewSky, viewConstellationLines });

        render();
    }

    function disposeSky(scene) {
        const renderer = scene.skyRenderer;
        scene.skyRenderer = null;
        const releaseInputs = detachSceneTextureFields(scene, SCENE_TEXTURE_FIELDS.sky);

        scene.sky = null;
        scene.skyConstellation = null;
        scene.skyContainer = null;
        scene.skyBaseQuaternion = null;
        scene.skyTexture = null;
        scene.skyConstellationTexture = null;
        try { renderer?.dispose(); }
        finally { releaseInputs(); }
    }

    return { addSky, disposeSky };
}
