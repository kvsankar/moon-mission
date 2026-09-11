// @ts-nocheck
import { constrainMoonRenderProfile, registerRenderDeviceCapabilities, resolveInteractivePixelRatio } from "./core/domain/render-device-policy.js";

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
import { persistMoonRenderAssetProfile } from "./app/moon-render-profile-actions.js";
import { MoonRenderer } from "./rendering/moon-renderer.js";
import { loadMoonRenderProfileTextures } from "./app/texture-loader.js";
import { createMoonObserverProfileLoader } from "./app/moon-observer-profile-loader.js";
import { MOON_PHYSICAL_RENDER_CONTROLS, createMoonRenderPipelineState, resolveMoonRenderPipelineState } from "./app/moon-render-pipeline.js";

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
        roughness: normalized.roughness, metalness: normalized.metalness,
        ...Object.fromEntries(MOON_PHYSICAL_RENDER_CONTROLS.map(control => [control.key, createMoonRenderPipelineState()[control.key]])),
        lightingModel: "physical-dem", ...TUNER_VIEW_DEFAULTS,

    };
}

const CONTROL_GROUPS = [
    { title: "Physical DEM", controls: MOON_PHYSICAL_RENDER_CONTROLS },
    { title: "Surface", controls: [
        { key: "roughness", label: "Roughness", min: 0, max: 1, step: 0.01 },
        { key: "metalness", label: "Metalness", min: 0, max: 1, step: 0.01 },
    ] },
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
let sharedMoonRenderer = null;
let installedRenderSettings = null;
let showingPreview = false;
let lastRenderSettings = "";
let loadSequence = 0;
let cameraYaw = -0.35;
let cameraPitch = 0.22;
let isDragging = false;
let dragLastX = 0;
let dragLastY = 0;
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
registerRenderDeviceCapabilities(renderer, window);
activeAssetProfile = constrainMoonRenderProfile(activeAssetProfile, window);
defaultsState = createTunerStateFromRenderSettings(renderSettingsByProfile[activeAssetProfile]);
Object.assign(state, defaultsState);
renderer.setPixelRatio(resolveInteractivePixelRatio(window));
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
    activeAssetProfile = persistMoonRenderAssetProfile(window, activeAssetProfile);

    const storage = getStorage();
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

function tunerRenderSettings() {
    const base = installedRenderSettings || renderSettingsByProfile[activeAssetProfile];
    if (showingPreview) return base;
    return {
        ...base,
        ...state,
    };
}

function syncTunerControlAvailability() {
    for (const option of assetProfileSelect.options) {
        option.disabled = constrainMoonRenderProfile(option.value, window) !== option.value;
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
    if (!sharedMoonRenderer) return;
    const settings = tunerRenderSettings();
    const signature = JSON.stringify(settings);
    if (signature !== lastRenderSettings) {
        sharedMoonRenderer.setRenderSettings(settings);
        lastRenderSettings = signature;
    }
    sharedMoonRenderer.setRenderPipeline(createMoonRenderPipelineState({
        lightingModel: state.lightingModel,
        ...Object.fromEntries(MOON_PHYSICAL_RENDER_CONTROLS.map(control => [control.key, state[control.key]])),
    }));
    moonMesh = sharedMoonRenderer.mesh;
    moonMaterial = moonMesh.material;
    canvas.dataset.renderer = "MoonRenderer";
    canvas.dataset.model = state.lightingModel;
    canvas.dataset.preview = String(showingPreview);
    syncTunerControlAvailability();
}

function applyRendererSettings() {
    renderer.toneMappingExposure = state.toneExposure;
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
    controlsByKey.clear();
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
            sliderEl.dataset.tunerControl = control.key;
            sliderEl.setAttribute("aria-label", control.label);
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
    state.lightingModel = "physical-dem";
    if (!values || typeof values !== "object") return;

    CONTROL_GROUPS.forEach((group) => {
        group.controls.forEach((control) => {
            if (Object.prototype.hasOwnProperty.call(values, control.key)) {
                applyControlValue(control, values[control.key], null);
            }
        });
    });
    updateMaterialSettings();
    syncTunerControlAvailability();
    updateJsonBox();
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
        activeAssetProfile = constrainMoonRenderProfile(normalizeAssetProfile(assetProfileSelect.value), window);
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

function applyTunerResources({ resources, profile, isCurrent }) {
    installedRenderSettings = resources.moonRenderSettings;
    showingPreview = resources.moonPreview === true;
    baseTexture = resources.moonMap;
    heightTexture = resources.moonDisplacementMap;
    if (!sharedMoonRenderer) {
        sharedMoonRenderer = new MoonRenderer(1);
        sharedMoonRenderer.setTextures(baseTexture, heightTexture);
        sharedMoonRenderer.setRenderSettings(tunerRenderSettings());
        sharedMoonRenderer.setRenderPipeline(createMoonRenderPipelineState({ lightingModel: state.lightingModel }));
        sharedMoonRenderer.create(false, false, { deferGeneratedNormalMap: profile !== "low" });
        moonContainer.add(sharedMoonRenderer.container);
    } else {
        sharedMoonRenderer.updateTextures(baseTexture, heightTexture, null, {
            disposePrevious: true,
            renderSettings: tunerRenderSettings(),
            deferGeneratedNormalMap: profile !== "low",
        });
    }
    lastRenderSettings = JSON.stringify(tunerRenderSettings());
    updateMaterialSettings();
    applyRendererSettings();
    updateLightSettings();
    updateCamera();
    resize();
    renderer.render(scene, camera);
    if (profile !== "low") {
        window.setTimeout(() => {
            if (!isCurrent()) return;
            sharedMoonRenderer.refreshGeneratedNormalMap({ disposePrevious: true });
            updateMaterialSettings();
        }, 0);
    }
    setAssetStatusMessage(showingPreview
        ? `Moon preview ready. Loading ${describeAssetProfile(activeAssetProfile)} detail...`
        : `Loaded ${describeAssetProfile(profile)} with the shared MoonRenderer.`);
}

const profileLoader = createMoonObserverProfileLoader({
    loadResources: (profile, { signal, onPreview }) => loadMoonRenderProfileTextures({
        THREE,
        moonRenderProfile: profile,
        signal,
        onPreview: sharedMoonRenderer ? null : onPreview,
    }),
    applyResources: applyTunerResources,
});

async function reloadMoonAssets() {
    persistAssetControls();
    const sequence = ++loadSequence;
    reloadAssetsButton.disabled = true;
    resetAssetsButton.disabled = true;
    setAssetStatusMessage(`Loading ${describeAssetProfile(activeAssetProfile)} Moon surface assets...`);
    try {
        await profileLoader.load(activeAssetProfile);
    } catch (error) {
        if (sequence !== loadSequence) return;
        console.error(error);
        setAssetStatusMessage("Unable to load the requested detail. The existing view is retained.", { isError: true });
    } finally {
        if (sequence === loadSequence) {
            reloadAssetsButton.disabled = false;
            resetAssetsButton.disabled = false;
            syncAssetControlsFromState();
        }
    }
}

async function initScene() {
    await reloadMoonAssets();
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

syncTunerControlAvailability();
animate();
initScene().catch((error) => setFatalMessage(error));
