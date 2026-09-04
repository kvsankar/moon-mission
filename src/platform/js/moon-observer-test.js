import * as THREE from "three";

import {
    MOON_PHYSICAL_RENDER_CONTROLS,
    createMoonRenderPipelineState,
} from "./app/moon-render-pipeline.js";
import { loadMoonRenderProfileTextures } from "./app/texture-loader.js";
import { createMoonObserverProfileLoader } from "./app/moon-observer-profile-loader.js";
import {
    resolveBrightLimbAngleDegrees,
    resolveMoonObserverGeometry,
    rotateObserverScreenUp,
} from "./app/moon-observer-geometry.js";
import { MoonRenderer } from "./rendering/moon-renderer.js";

const DEFAULT_TIME_ISO = "2026-04-06T22:41:58.000Z";
const TIER_TO_PROFILE = Object.freeze({ low: "low", medium: "fast", high: "quality" });
const PROFILE_TO_TIER = Object.freeze({ low: "low", fast: "medium", quality: "high" });
const DEFAULT_STATE = Object.freeze({
    time: DEFAULT_TIME_ISO,
    observerMode: "geocenter",
    latitude: 12.9716,
    longitude: 77.5946,
    elevationMeters: 920,
    rollDegrees: 0,
    diskSizePercent: 82,
    lightingModel: "current",
    profile: "quality",
});

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("observer-canvas"));
const status = document.getElementById("observer-status");
const state = readStateFromUrl();
let moonRenderer = null;
let latestGeometry = null;

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
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
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
    const nextState = {
        ...DEFAULT_STATE,
        time: Number.isFinite(requestedTime.getTime()) ? requestedTime.toISOString() : DEFAULT_STATE.time,
        observerMode: params.get("observer") === "site" ? "site" : "geocenter",
        latitude: clamp(params.get("lat"), -90, 90, DEFAULT_STATE.latitude),
        longitude: clamp(params.get("lon"), -180, 180, DEFAULT_STATE.longitude),
        elevationMeters: clamp(params.get("elevation"), -500, 100000, DEFAULT_STATE.elevationMeters),
        rollDegrees: clamp(params.get("roll"), -180, 180, DEFAULT_STATE.rollDegrees),
        diskSizePercent: clamp(params.get("disk"), 45, 94, DEFAULT_STATE.diskSizePercent),
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
    if (state.observerMode === "site") {
        params.set("lat", String(state.latitude));
        params.set("lon", String(state.longitude));
        params.set("elevation", String(state.elevationMeters));
    }
    params.set("roll", String(state.rollDegrees));
    params.set("disk", String(state.diskSizePercent));
    params.set("model", state.lightingModel);
    params.set("tier", PROFILE_TO_TIER[state.profile]);
    for (const control of MOON_PHYSICAL_RENDER_CONTROLS) {
        params.set(control.key, String(state[control.key]));
    }
    window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
}

function syncControls() {
    document.getElementById("observer-time").value = toUtcInputValue(state.time);
    document.getElementById("observer-latitude").value = String(state.latitude);
    document.getElementById("observer-longitude").value = String(state.longitude);
    document.getElementById("observer-elevation").value = String(state.elevationMeters);
    document.getElementById("observer-roll").value = String(state.rollDegrees);
    document.getElementById("observer-disk-size").value = String(state.diskSizePercent);
    document.getElementById("observer-roll-value").textContent = `${state.rollDegrees} deg`;
    document.getElementById("observer-disk-size-value").textContent = `${state.diskSizePercent}%`;
    document.getElementById("observer-site-fields").disabled = state.observerMode !== "site";
    setPressed(document.getElementById("observer-mode-geocenter"), state.observerMode === "geocenter");
    setPressed(document.getElementById("observer-mode-site"), state.observerMode === "site");
    setPressed(document.getElementById("observer-model-current"), state.lightingModel === "current");
    setPressed(document.getElementById("observer-model-physical"), state.lightingModel === "physical-dem");
    for (const [tier, profile] of Object.entries(TIER_TO_PROFILE)) {
        setPressed(document.getElementById(`observer-tier-${tier}`), state.profile === profile);
    }
    document.querySelectorAll("[data-physical-control]").forEach((input) => {
        input.disabled = state.lightingModel !== "physical-dem";
    });
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
    document.getElementById("observer-altitude").textContent = Number.isFinite(geometry.altitudeDegrees) ? `${geometry.altitudeDegrees.toFixed(2)} deg` : "Geocenter";
    document.getElementById("observer-azimuth").textContent = Number.isFinite(geometry.azimuthDegrees) ? `${geometry.azimuthDegrees.toFixed(2)} deg` : "Geocenter";
    if (moonRenderer?.mesh) {
        const material = moonRenderer.mesh.material;
        const segments = moonRenderer.mesh.geometry?.parameters;
        const textureLabel = material?.map?.image?.width ? `${material.map.image.width}px` : "none";
        const demLabel = material?.displacementMap?.image?.width ? ` + DEM ${material.displacementMap.image.width}px` : "";
        document.getElementById("observer-resources").textContent = `${segments?.widthSegments || 0}x${segments?.heightSegments || 0} / ${textureLabel}${demLabel}`;
    }
}

function updateCameraProjection() {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    const aspect = width / height;
    const diskFraction = state.diskSizePercent / 100;
    const halfHeight = (1 / diskFraction) * (aspect < 1 ? 1 / aspect : 1);
    camera.left = -halfHeight * aspect;
    camera.right = halfHeight * aspect;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
}

function renderFrame() {
    updateCameraProjection();
    renderer.render(scene, camera);
}

function updateObservation() {
    try {
        latestGeometry = resolveMoonObserverGeometry({
            date: new Date(state.time),
            observerMode: state.observerMode,
            latitude: state.latitude,
            longitude: state.longitude,
            elevationMeters: state.elevationMeters,
        });
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
        camera.position.copy(observerDirection).multiplyScalar(10);
        camera.up.set(rolledUp.x, rolledUp.y, rolledUp.z);
        camera.lookAt(0, 0, 0);
        sunLight.position.copy(sunDirection).multiplyScalar(8);
        earthshineLight.position.copy(observerDirection).multiplyScalar(6);
        earthshineLight.intensity = 0.02 * Math.pow(1 - latestGeometry.illuminatedFraction, 1.8);
        sunLight.target.updateMatrixWorld();
        earthshineLight.target.updateMatrixWorld();
        moonRenderer?.updateRotation(state.time);
        updateReadout(latestGeometry);
        setStatus("");
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
    loadResources: (profile) => loadMoonRenderProfileTextures({
        THREE,
        minFilter: THREE.LinearFilter,
        moonRenderProfile: profile,
        globalObject: /** @type {any} */ ({}),
    }),
    applyResources: async ({ profile, resources: textures, isCurrent }) => {
        if (!moonRenderer) {
            moonRenderer = new MoonRenderer(1);
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
    state.profile = profile;
    syncControls();
    syncUrl();
    setStatus(`Loading ${PROFILE_TO_TIER[profile]} resources`);
    try {
        await profileLoader.load(profile);
    } catch (error) {
        console.error(error);
        setStatus(`Failed to load ${PROFILE_TO_TIER[profile]} resources`, { error: true });
    }
}

function bindControls() {
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
            if (state.profile !== profile) loadProfile(profile);
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
}

createPhysicalControls();
syncControls();
bindControls();
new ResizeObserver(renderFrame).observe(canvas.parentElement);
loadProfile(state.profile);
