import * as THREE from "three";

import {
    MOON_PHYSICAL_RENDER_CONTROLS,
    createMoonRenderPipelineState,
} from "./app/moon-render-pipeline.js";
import { loadMoonRenderProfileTextures } from "./app/texture-loader.js";
import { createMoonObserverProfileLoader } from "./app/moon-observer-profile-loader.js";
import {
    loadArtemis2MoonReferencePresets,
    mergeArtemisReferenceRegistration,
} from "./app/moon-observer-artemis2.js";
import {
    resolveBrightLimbAngleDegrees,
    resolveMoonObserverGeometry,
    resolveMoonSpacecraftObserverGeometry,
    rotateObserverScreenUp,
} from "./app/moon-observer-geometry.js";
import { MoonRenderer } from "./rendering/moon-renderer.js";

const DEFAULT_TIME_ISO = "2026-04-06T22:41:58.000Z";
const DEFAULT_ARTEMIS_REFERENCE_ID = "art002e009289";
const MOON_RADIUS_KM = 1737.4;
const initialUrlParams = new URLSearchParams(window.location.search);
const TIER_TO_PROFILE = Object.freeze({ low: "low", medium: "fast", high: "quality" });
const PROFILE_TO_TIER = Object.freeze({ low: "low", fast: "medium", quality: "high" });
const DEFAULT_STATE = Object.freeze({
    time: DEFAULT_TIME_ISO,
    observerMode: "geocenter",
    referenceId: "",
    latitude: 12.9716,
    longitude: 77.5946,
    elevationMeters: 920,
    rollDegrees: 0,
    diskSizePercent: 82,
    cameraFovDegrees: 6.2,
    targetMode: "center",
    targetLatitude: 15.0742,
    targetLongitude: -125.516,
    compareMode: "split",
    referenceOpacity: 0.5,
    lightingModel: "current",
    profile: "quality",
});

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("observer-canvas"));
const status = document.getElementById("observer-status");
const state = readStateFromUrl();
let moonRenderer = null;
let latestGeometry = null;
let artemisReferences = [];
let activeReference = null;
let installedProfile = null;
let profileLoadError = "";
let referenceLoadError = "";
let fixtureLoadError = "";
let profileLoadSequence = 0;
let profileLoading = false;

const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.setClearColor(0x000000, 1);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const earthCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
const spacecraftCamera = new THREE.PerspectiveCamera(6.2, 1.5, 0.01, 100);
const sunLight = new THREE.DirectionalLight(0xffffff, 3.1);
const earthshineLight = new THREE.DirectionalLight(0x9fb2d8, 0.02);
sunLight.target.position.set(0, 0, 0);
earthshineLight.target.position.set(0, 0, 0);
scene.add(sunLight, sunLight.target, earthshineLight, earthshineLight.target);

function clamp(value, min, max, fallback) {
    if (value == null || String(value).trim() === "") {
        return fallback;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.min(max, Math.max(min, numeric)) : fallback;
}

function readStateFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const requestedTime = new Date(params.get("time") || DEFAULT_STATE.time);
    const tier = String(params.get("tier") || "high").toLowerCase();
    const model = String(params.get("model") || DEFAULT_STATE.lightingModel).toLowerCase();
    const requestedObserver = String(params.get("observer") || DEFAULT_STATE.observerMode).toLowerCase();
    const requestedCompareMode = String(params.get("compare") || DEFAULT_STATE.compareMode).toLowerCase();
    const requestedTargetMode = String(params.get("target") || DEFAULT_STATE.targetMode).toLowerCase();
    const nextState = {
        ...DEFAULT_STATE,
        time: Number.isFinite(requestedTime.getTime()) ? requestedTime.toISOString() : DEFAULT_STATE.time,
        observerMode: ["site", "artemis2"].includes(requestedObserver) ? requestedObserver : "geocenter",
        referenceId: String(params.get("reference") || "").toLowerCase(),
        latitude: clamp(params.get("lat"), -90, 90, DEFAULT_STATE.latitude),
        longitude: clamp(params.get("lon"), -180, 180, DEFAULT_STATE.longitude),
        elevationMeters: clamp(params.get("elevation"), -500, 100000, DEFAULT_STATE.elevationMeters),
        rollDegrees: clamp(params.get("roll"), -180, 180, DEFAULT_STATE.rollDegrees),
        diskSizePercent: clamp(params.get("disk"), 45, 94, DEFAULT_STATE.diskSizePercent),
        cameraFovDegrees: clamp(params.get("fov"), 1, 70, DEFAULT_STATE.cameraFovDegrees),
        targetMode: requestedTargetMode === "surface" ? "surface" : "center",
        targetLatitude: clamp(params.get("targetLat"), -90, 90, DEFAULT_STATE.targetLatitude),
        targetLongitude: clamp(params.get("targetLon"), -180, 180, DEFAULT_STATE.targetLongitude),
        compareMode: ["overlay", "render"].includes(requestedCompareMode) ? requestedCompareMode : "split",
        referenceOpacity: clamp(params.get("referenceOpacity"), 0, 1, DEFAULT_STATE.referenceOpacity),
        lightingModel: model === "physical-dem" ? "physical-dem" : "current",
        profile: TIER_TO_PROFILE[tier] || DEFAULT_STATE.profile,
    };
    for (const control of MOON_PHYSICAL_RENDER_CONTROLS) {
        nextState[control.key] = clamp(
            params.get(control.key),
            control.min,
            control.max,
            createMoonRenderPipelineState()[control.key],
        );
    }
    return nextState;
}

function toUtcInputValue(isoText) {
    return new Date(isoText).toISOString().slice(0, 19);
}

function parseUtcInputValue(value) {
    const date = new Date(`${String(value || "").replace(/Z$/i, "")}Z`);
    return Number.isFinite(date.getTime()) ? date : null;
}

function setPressed(button, pressed) {
    button?.setAttribute("aria-pressed", pressed ? "true" : "false");
}

function setStatus(message, { error = false } = {}) {
    status.textContent = message;
    status.dataset.error = error ? "true" : "false";
}

function syncRuntimeStatus() {
    if (profileLoadError) {
        setStatus(profileLoadError, { error: true });
    } else if (profileLoading) {
        setStatus(`Loading ${PROFILE_TO_TIER[state.profile]} resources`);
    } else if (referenceLoadError) {
        setStatus(referenceLoadError, { error: true });
    } else if (fixtureLoadError) {
        setStatus(fixtureLoadError, { error: true });
    } else {
        setStatus("");
    }
}

function buildPipelineState() {
    const values = { lightingModel: state.lightingModel };
    for (const control of MOON_PHYSICAL_RENDER_CONTROLS) {
        values[control.key] = state[control.key];
    }
    return createMoonRenderPipelineState(values);
}

function syncUrl() {
    const params = new URLSearchParams();
    params.set("time", state.time);
    params.set("observer", state.observerMode);
    if (state.referenceId) params.set("reference", state.referenceId);
    if (state.observerMode === "site") {
        params.set("lat", String(state.latitude));
        params.set("lon", String(state.longitude));
        params.set("elevation", String(state.elevationMeters));
    }
    params.set("roll", String(state.rollDegrees));
    params.set("disk", String(state.diskSizePercent));
    params.set("fov", String(state.cameraFovDegrees));
    params.set("target", state.targetMode);
    params.set("targetLat", String(state.targetLatitude));
    params.set("targetLon", String(state.targetLongitude));
    params.set("compare", state.compareMode);
    params.set("referenceOpacity", String(state.referenceOpacity));
    params.set("model", state.lightingModel);
    params.set("tier", PROFILE_TO_TIER[state.profile]);
    for (const control of MOON_PHYSICAL_RENDER_CONTROLS) {
        params.set(control.key, String(state[control.key]));
    }
    window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
}

function findArtemisReference(referenceId) {
    return artemisReferences.find((reference) => reference.id === referenceId) || null;
}

function updateReferenceDisplay() {
    const visuals = document.getElementById("observer-visuals");
    const frame = document.getElementById("observer-reference-frame");
    const image = /** @type {HTMLImageElement} */ (document.getElementById("observer-reference-image"));
    const caption = document.getElementById("observer-reference-caption");
    const meta = document.getElementById("observer-reference-meta");
    const hasReference = !!activeReference;
    visuals.dataset.mode = state.compareMode;
    visuals.dataset.hasReference = hasReference ? "true" : "false";
    frame.hidden = !hasReference;
    image.style.opacity = String(state.compareMode === "overlay" ? state.referenceOpacity : 1);
    if (!activeReference) {
        image.removeAttribute("src");
        delete image.dataset.referenceId;
        referenceLoadError = "";
        meta.hidden = true;
        meta.textContent = "";
        syncRuntimeStatus();
        return;
    }
    const nextSource = activeReference.assetUrl;
    if (image.dataset.referenceId !== activeReference.id) {
        referenceLoadError = "";
        image.dataset.referenceId = activeReference.id;
        image.src = nextSource;
    }
    caption.textContent = `${activeReference.id} · ${activeReference.title}`;
    meta.hidden = false;
    meta.textContent = [
        activeReference.location,
        `${activeReference.localTime} ${activeReference.timezoneOffset}`,
        activeReference.settings,
        activeReference.registrationStatus === "registered"
            ? "Registered camera"
            : "Unregistered camera · Split comparison only",
    ].filter(Boolean).join(" · ");
}

function populateReferenceSelect() {
    const select = /** @type {HTMLSelectElement} */ (document.getElementById("observer-reference"));
    select.replaceChildren(new Option("None", ""));
    artemisReferences.forEach((reference) => {
        const suffix = reference.registrationStatus === "registered" ? "" : " · Unregistered";
        select.add(new Option(`${reference.id} · ${reference.title}${suffix}`, reference.id));
    });
    select.value = state.referenceId;
}

function activateArtemisReference(reference, { applyRegistration = true } = {}) {
    if (!reference) return;
    activeReference = reference;
    state.referenceId = reference.id;
    state.observerMode = "artemis2";
    state.time = reference.timeIso;
    if (applyRegistration) {
        Object.assign(state, mergeArtemisReferenceRegistration(reference, state));
    }
    if (reference.registrationStatus !== "registered" && state.compareMode === "overlay") {
        state.compareMode = "split";
    }
    updateReferenceDisplay();
    updateObservation();
}

function syncControls() {
    document.getElementById("observer-time").value = toUtcInputValue(state.time);
    document.getElementById("observer-latitude").value = String(state.latitude);
    document.getElementById("observer-longitude").value = String(state.longitude);
    document.getElementById("observer-elevation").value = String(state.elevationMeters);
    document.getElementById("observer-roll").value = String(state.rollDegrees);
    document.getElementById("observer-disk-size").value = String(state.diskSizePercent);
    document.getElementById("observer-camera-fov").value = String(state.cameraFovDegrees);
    document.getElementById("observer-target-latitude").value = String(state.targetLatitude);
    document.getElementById("observer-target-longitude").value = String(state.targetLongitude);
    document.getElementById("observer-reference-opacity").value = String(state.referenceOpacity);
    document.getElementById("observer-roll-value").textContent = `${state.rollDegrees} deg`;
    document.getElementById("observer-disk-size-value").textContent = `${state.diskSizePercent}%`;
    document.getElementById("observer-camera-fov-value").textContent = `${state.cameraFovDegrees.toFixed(1)} deg`;
    document.getElementById("observer-reference-opacity-value").textContent = `${Math.round(state.referenceOpacity * 100)}%`;
    document.getElementById("observer-time").disabled = state.observerMode === "artemis2";
    document.getElementById("observer-disk-size").disabled = state.observerMode === "artemis2";
    document.getElementById("observer-camera-fov").disabled = state.observerMode !== "artemis2";
    document.getElementById("observer-site-fields").disabled = state.observerMode !== "site";
    document.getElementById("observer-target-fields").disabled = !(
        state.observerMode === "artemis2" && state.targetMode === "surface"
    );
    document.getElementById("observer-reference-opacity").disabled = !activeReference || state.compareMode !== "overlay";
    document.getElementById("observer-compare-overlay").disabled = !activeReference || activeReference.registrationStatus !== "registered";
    document.getElementById("observer-reference").value = state.referenceId;
    setPressed(document.getElementById("observer-mode-geocenter"), state.observerMode === "geocenter");
    setPressed(document.getElementById("observer-mode-site"), state.observerMode === "site");
    setPressed(document.getElementById("observer-mode-artemis2"), state.observerMode === "artemis2");
    setPressed(document.getElementById("observer-target-center"), state.targetMode === "center");
    setPressed(document.getElementById("observer-target-surface"), state.targetMode === "surface");
    ["split", "overlay", "render"].forEach((mode) => {
        setPressed(document.getElementById(`observer-compare-${mode}`), state.compareMode === mode);
    });
    setPressed(document.getElementById("observer-model-current"), state.lightingModel === "current");
    setPressed(document.getElementById("observer-model-physical"), state.lightingModel === "physical-dem");
    for (const [tier, profile] of Object.entries(TIER_TO_PROFILE)) {
        const button = document.getElementById(`observer-tier-${tier}`);
        setPressed(button, state.profile === profile);
        button.disabled = profileLoading && !installedProfile;
    }
    document.querySelectorAll("[data-physical-control]").forEach((input) => {
        input.disabled = state.lightingModel !== "physical-dem";
    });
    updateReferenceDisplay();
}

function createPhysicalControls() {
    const root = document.getElementById("observer-physical-controls");
    for (const control of MOON_PHYSICAL_RENDER_CONTROLS) {
        const label = document.createElement("label");
        label.className = "observer-range";
        const caption = document.createElement("span");
        caption.textContent = control.label;
        const input = document.createElement("input");
        input.type = "range";
        input.min = String(control.min);
        input.max = String(control.max);
        input.step = String(control.step);
        input.value = String(state[control.key]);
        input.dataset.physicalControl = control.key;
        input.setAttribute("aria-label", control.label);
        const output = document.createElement("output");
        output.textContent = Number(state[control.key]).toFixed(2);
        input.addEventListener("input", () => {
            state[control.key] = Number(input.value);
            output.textContent = state[control.key].toFixed(2);
            applyPipeline();
        });
        label.append(caption, input, output);
        root.append(label);
    }
}

function updateReadout(geometry) {
    const rolledUp = rotateObserverScreenUp(
        geometry.screenUp,
        geometry.observerDirection,
        state.rollDegrees,
    );
    const brightLimb = resolveBrightLimbAngleDegrees({
        observerDirection: geometry.observerDirection,
        sunDirection: geometry.sunDirection,
        screenUp: rolledUp,
    });
    document.getElementById("observer-illuminated").textContent = `${(geometry.illuminatedFraction * 100).toFixed(2)}%`;
    document.getElementById("observer-phase-angle").textContent = `${geometry.phaseAngleDegrees.toFixed(2)} deg`;
    document.getElementById("observer-bright-limb").textContent = Number.isFinite(brightLimb) ? `${brightLimb.toFixed(1)} deg` : "Centered";
    document.getElementById("observer-distance").textContent = `${Math.round(geometry.observerDistanceKm).toLocaleString()} km`;
    document.getElementById("observer-angular-diameter").textContent = `${geometry.angularDiameterDegrees.toFixed(3)} deg`;
    const observerLabel = state.observerMode === "artemis2"
        ? (activeReference?.location || "Orion")
        : "Geocenter";
    document.getElementById("observer-altitude").textContent = Number.isFinite(geometry.altitudeDegrees) ? `${geometry.altitudeDegrees.toFixed(2)} deg` : observerLabel;
    document.getElementById("observer-azimuth").textContent = Number.isFinite(geometry.azimuthDegrees) ? `${geometry.azimuthDegrees.toFixed(2)} deg` : observerLabel;
    if (moonRenderer?.mesh) {
        const material = moonRenderer.mesh.material;
        const segments = moonRenderer.mesh.geometry?.parameters;
        const textureLabel = material?.map?.image?.width ? `${material.map.image.width}px` : "none";
        const demEncoding = material?.displacementMap?.userData?.moonDemEncoding === "nasa-uint16-float"
            ? " uint16"
            : "";
        const decodeMs = Number(material?.displacementMap?.userData?.decodeMilliseconds);
        const fetchMs = Number(material?.displacementMap?.userData?.fetchMilliseconds);
        const normalMs = Number(material?.normalMap?.userData?.buildMilliseconds);
        const timingLabel = Number.isFinite(fetchMs) || Number.isFinite(decodeMs) || Number.isFinite(normalMs)
            ? ` (${Number.isFinite(fetchMs) ? Math.round(fetchMs) : "-"}/${Number.isFinite(decodeMs) ? Math.round(decodeMs) : "-"}/${Number.isFinite(normalMs) ? Math.round(normalMs) : "-"} ms)`
            : "";
        const demLabel = material?.displacementMap?.image?.width
            ? ` + DEM ${material.displacementMap.image.width}px${demEncoding}${timingLabel}`
            : "";
        document.getElementById("observer-resources").textContent = `${segments?.widthSegments || 0}x${segments?.heightSegments || 0} / ${textureLabel}${demLabel}`;
    }
}

function updateCameraProjection() {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    const aspect = width / height;
    if (state.observerMode === "artemis2") {
        spacecraftCamera.aspect = aspect;
        spacecraftCamera.fov = state.cameraFovDegrees;
        spacecraftCamera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
        return spacecraftCamera;
    }
    const diskFraction = state.diskSizePercent / 100;
    const halfHeight = (1 / diskFraction) * (aspect < 1 ? 1 / aspect : 1);
    earthCamera.left = -halfHeight * aspect;
    earthCamera.right = halfHeight * aspect;
    earthCamera.top = halfHeight;
    earthCamera.bottom = -halfHeight;
    earthCamera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    return earthCamera;
}

function renderFrame() {
    renderer.render(scene, updateCameraProjection());
}

function moonSurfacePoint(latitudeDegrees, longitudeDegrees) {
    const latitude = THREE.MathUtils.degToRad(latitudeDegrees);
    const longitude = THREE.MathUtils.degToRad(longitudeDegrees);
    const cosLatitude = Math.cos(latitude);
    return new THREE.Vector3(
        cosLatitude * Math.cos(longitude),
        cosLatitude * Math.sin(longitude),
        Math.sin(latitude),
    );
}

function updateObservation() {
    try {
        if (state.observerMode === "artemis2") {
            if (!activeReference) {
                setStatus("Select an Artemis II reference image.");
                return;
            }
            latestGeometry = resolveMoonSpacecraftObserverGeometry({
                date: new Date(activeReference.timeIso),
                spacecraftPositionKm: activeReference.spacecraftPositionKm,
                sunPositionKm: activeReference.sunPositionKm,
                earthPositionKm: activeReference.earthPositionKm,
            });
        } else {
            latestGeometry = resolveMoonObserverGeometry({
                date: new Date(state.time),
                observerMode: state.observerMode,
                latitude: state.latitude,
                longitude: state.longitude,
                elevationMeters: state.elevationMeters,
            });
        }
        const observerDirection = new THREE.Vector3(
            latestGeometry.observerDirection.x,
            latestGeometry.observerDirection.y,
            latestGeometry.observerDirection.z,
        );
        const sunDirection = new THREE.Vector3(
            latestGeometry.sunDirection.x,
            latestGeometry.sunDirection.y,
            latestGeometry.sunDirection.z,
        );
        const rolledUp = rotateObserverScreenUp(
            latestGeometry.screenUp,
            latestGeometry.observerDirection,
            state.rollDegrees,
        );
        moonRenderer?.updateRotation(state.time);
        if (state.observerMode === "artemis2") {
            spacecraftCamera.position.set(
                latestGeometry.observerPositionKm.x / MOON_RADIUS_KM,
                latestGeometry.observerPositionKm.y / MOON_RADIUS_KM,
                latestGeometry.observerPositionKm.z / MOON_RADIUS_KM,
            );
            spacecraftCamera.up.set(rolledUp.x, rolledUp.y, rolledUp.z);
            const target = state.targetMode === "surface" && moonRenderer?.container
                ? moonSurfacePoint(state.targetLatitude, state.targetLongitude)
                    .applyQuaternion(moonRenderer.container.quaternion)
                : new THREE.Vector3(0, 0, 0);
            spacecraftCamera.lookAt(target);
        } else {
            earthCamera.position.copy(observerDirection).multiplyScalar(10);
            earthCamera.up.set(rolledUp.x, rolledUp.y, rolledUp.z);
            earthCamera.lookAt(0, 0, 0);
        }
        sunLight.position.copy(sunDirection).multiplyScalar(8);
        const earthshineDirection = latestGeometry.earthDirection || latestGeometry.observerDirection;
        earthshineLight.position.set(
            earthshineDirection.x,
            earthshineDirection.y,
            earthshineDirection.z,
        ).multiplyScalar(6);
        earthshineLight.intensity = 0.02 * Math.pow(1 - latestGeometry.illuminatedFraction, 1.8);
        sunLight.target.updateMatrixWorld();
        earthshineLight.target.updateMatrixWorld();
        updateReadout(latestGeometry);
        syncRuntimeStatus();
        syncControls();
        syncUrl();
        renderFrame();
    } catch (error) {
        console.error(error);
        setStatus(error?.message || "Unable to resolve observation geometry.", { error: true });
    }
}

function applyPipeline() {
    moonRenderer?.setRenderPipeline(buildPipelineState());
    syncControls();
    syncUrl();
    renderFrame();
}

function scheduleNormalMapUpgrade(profile, isCurrent) {
    if (profile === "low") return;
    window.setTimeout(() => {
        if (!isCurrent() || !moonRenderer) return;
        moonRenderer.refreshGeneratedNormalMap({ disposePrevious: true });
        updateReadout(latestGeometry);
        renderFrame();
    }, 0);
}

const profileLoader = createMoonObserverProfileLoader({
    loadResources: (profile, { signal } = {}) => loadMoonRenderProfileTextures({
        THREE,
        minFilter: THREE.LinearFilter,
        moonRenderProfile: profile,
        globalObject: /** @type {any} */ ({}),
        signal,
    }),
    applyResources: async ({ profile, resources: textures, isCurrent }) => {
        if (!moonRenderer) {
            moonRenderer = new MoonRenderer(1);
            moonRenderer.setRenderInvalidationCallback(renderFrame);
            moonRenderer.setTextures(textures.moonMap, textures.moonDisplacementMap, null);
            moonRenderer.setRenderSettings(textures.moonRenderSettings);
            moonRenderer.setRenderPipeline(buildPipelineState());
            moonRenderer.create(false, false, {
                deferGeneratedNormalMap: profile !== "low",
            });
            scene.add(moonRenderer.container);
        } else {
            moonRenderer.updateTextures(
                textures.moonMap,
                textures.moonDisplacementMap,
                null,
                {
                    disposePrevious: true,
                    renderSettings: textures.moonRenderSettings,
                    deferGeneratedNormalMap: profile !== "low",
                },
            );
        }
        scheduleNormalMapUpgrade(profile, isCurrent);
        updateObservation();
    },
});

async function loadProfile(profile) {
    const previousProfile = installedProfile || state.profile;
    const loadSequence = ++profileLoadSequence;
    state.profile = profile;
    profileLoadError = "";
    profileLoading = true;
    syncControls();
    syncUrl();
    syncRuntimeStatus();
    try {
        const applied = await profileLoader.load(profile);
        if (!applied) return false;
        installedProfile = profile;
        return true;
    } catch (error) {
        if (state.profile !== profile || error?.name === "AbortError") return false;
        state.profile = installedProfile || previousProfile;
        syncControls();
        syncUrl();
        console.error(error);
        profileLoadError = `Failed to load ${PROFILE_TO_TIER[profile]} resources`;
        syncRuntimeStatus();
        return false;
    } finally {
        if (loadSequence === profileLoadSequence) {
            profileLoading = false;
            syncControls();
            syncRuntimeStatus();
        }
    }
}

function bindControls() {
    document.getElementById("observer-reference").addEventListener("change", (event) => {
        const reference = findArtemisReference(event.target.value);
        if (reference) {
            activateArtemisReference(reference);
            return;
        }
        activeReference = null;
        state.referenceId = "";
        if (state.observerMode === "artemis2") state.observerMode = "geocenter";
        updateReferenceDisplay();
        updateObservation();
    });
    document.getElementById("observer-time").addEventListener("change", (event) => {
        const date = parseUtcInputValue(event.target.value);
        if (!date) return;
        state.time = date.toISOString();
        updateObservation();
    });
    document.getElementById("observer-mode-geocenter").addEventListener("click", () => {
        state.observerMode = "geocenter";
        updateObservation();
    });
    document.getElementById("observer-mode-site").addEventListener("click", () => {
        state.observerMode = "site";
        updateObservation();
    });
    document.getElementById("observer-mode-artemis2").addEventListener("click", () => {
        const preserveRegistration = !!activeReference;
        const reference = activeReference
            || findArtemisReference(state.referenceId)
            || findArtemisReference(DEFAULT_ARTEMIS_REFERENCE_ID);
        if (reference) activateArtemisReference(reference, {
            applyRegistration: !preserveRegistration,
        });
    });
    const siteInputs = [
        ["observer-latitude", "latitude"],
        ["observer-longitude", "longitude"],
        ["observer-elevation", "elevationMeters"],
    ];
    for (const [id, key] of siteInputs) {
        document.getElementById(id).addEventListener("change", (event) => {
            state[key] = Number(event.target.value);
            updateObservation();
        });
    }
    document.getElementById("observer-roll").addEventListener("input", (event) => {
        state.rollDegrees = Number(event.target.value);
        updateObservation();
    });
    document.getElementById("observer-disk-size").addEventListener("input", (event) => {
        state.diskSizePercent = Number(event.target.value);
        updateObservation();
    });
    document.getElementById("observer-camera-fov").addEventListener("input", (event) => {
        state.cameraFovDegrees = Number(event.target.value);
        updateObservation();
    });
    document.getElementById("observer-target-center").addEventListener("click", () => {
        state.targetMode = "center";
        updateObservation();
    });
    document.getElementById("observer-target-surface").addEventListener("click", () => {
        state.targetMode = "surface";
        updateObservation();
    });
    [
        ["observer-target-latitude", "targetLatitude"],
        ["observer-target-longitude", "targetLongitude"],
    ].forEach(([id, key]) => {
        document.getElementById(id).addEventListener("change", (event) => {
            state[key] = Number(event.target.value);
            updateObservation();
        });
    });
    ["split", "overlay", "render"].forEach((mode) => {
        document.getElementById(`observer-compare-${mode}`).addEventListener("click", () => {
            state.compareMode = mode;
            syncControls();
            syncUrl();
            renderFrame();
        });
    });
    document.getElementById("observer-reference-opacity").addEventListener("input", (event) => {
        state.referenceOpacity = Number(event.target.value);
        syncControls();
        syncUrl();
    });
    document.getElementById("observer-model-current").addEventListener("click", () => {
        state.lightingModel = "current";
        applyPipeline();
    });
    document.getElementById("observer-model-physical").addEventListener("click", () => {
        state.lightingModel = "physical-dem";
        applyPipeline();
    });
    for (const [tier, profile] of Object.entries(TIER_TO_PROFILE)) {
        document.getElementById(`observer-tier-${tier}`).addEventListener("click", () => {
            if (installedProfile !== profile || state.profile !== profile) loadProfile(profile);
        });
    }
    document.getElementById("observer-copy-link").addEventListener("click", async (event) => {
        syncUrl();
        await navigator.clipboard.writeText(window.location.href);
        const button = /** @type {HTMLButtonElement} */ (event.currentTarget);
        button.textContent = "Copied";
        window.setTimeout(() => { button.textContent = "Copy Link"; }, 1000);
    });
    document.getElementById("observer-download").addEventListener("click", () => {
        renderFrame();
        const link = document.createElement("a");
        const compactTime = state.time.replace(/[:.]/g, "-");
        link.download = `moon-${state.observerMode}-${compactTime}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
    });
    document.getElementById("observer-reference-image").addEventListener("error", (event) => {
        const image = /** @type {HTMLImageElement} */ (event.currentTarget);
        if (!activeReference || image.dataset.referenceId !== activeReference.id) return;
        referenceLoadError = `Unable to load NASA reference ${activeReference.id}.`;
        syncRuntimeStatus();
    });
    document.getElementById("observer-reference-image").addEventListener("load", () => {
        referenceLoadError = "";
        syncRuntimeStatus();
    });
}

async function initialize() {
    createPhysicalControls();
    syncControls();
    bindControls();
    new ResizeObserver(renderFrame).observe(canvas.parentElement);
    const profileLoadPromise = loadProfile(state.profile);
    try {
        artemisReferences = await loadArtemis2MoonReferencePresets();
        populateReferenceSelect();
        const requestedReference = findArtemisReference(state.referenceId);
        if (requestedReference) {
            activeReference = requestedReference;
            state.time = requestedReference.timeIso;
            if (state.observerMode === "artemis2") {
                Object.assign(state, mergeArtemisReferenceRegistration(
                    requestedReference,
                    state,
                    new Set(initialUrlParams.keys()),
                ));
            }
            if (requestedReference.registrationStatus !== "registered" && state.compareMode === "overlay") {
                state.compareMode = "split";
            }
            updateReferenceDisplay();
        } else if (state.observerMode === "artemis2") {
            const defaultReference = findArtemisReference(DEFAULT_ARTEMIS_REFERENCE_ID);
            if (defaultReference) {
                activeReference = defaultReference;
                state.referenceId = defaultReference.id;
                state.time = defaultReference.timeIso;
                Object.assign(state, mergeArtemisReferenceRegistration(defaultReference, state));
            }
        }
    } catch (error) {
        console.error(error);
        fixtureLoadError = "Unable to load Artemis II references.";
        syncRuntimeStatus();
    }
    syncControls();
    const profileApplied = await profileLoadPromise;
    if (profileApplied && state.observerMode === "artemis2" && activeReference) updateObservation();
}

initialize();
