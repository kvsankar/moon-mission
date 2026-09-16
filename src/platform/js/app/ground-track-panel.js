import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { loadMissionConfig, loadChebyshev } from "../data/mission-data.js";
import { getBodyEphemerisState } from "../data/ephemeris-provider.js";
import {
    registerMissionPanel,
    updateMissionPanel,
} from "./panel-registry.js";
import { showMissionPanelInfo } from "./panel-info-popover.js";
import {
    readMissionPanelState,
    writeMissionPanelState,
} from "./panel-layout-store.js";
import {
    getMissionPanelDefaultState,
    isMissionPanelEnabled,
    shouldMissionPanelAutoOpenBeforeEvent,
} from "./panel-defaults.js";
import {
    getDockviewSpikeLayoutHost,
    focusDockviewWorkflowPanel,
    resolveDockedWorkflowPanelPosition,
} from "./dockview-workflow-panels.js";
import { bringPanelElementToFront } from "./panel-z-order.js";
import { resolveCurrentMissionKey } from "../core/domain/current-mission.js";
import { resolveRuntimeAssetUrl } from "../core/domain/runtime-asset-url.js";
import {
    applyTimelineSliderMissionSeek,
    readTimelineSliderMissionState,
} from "../core/domain/timeline-slider-state.js";
import { isDomElement, isDomInstance } from "../ui/dom-helpers.js";

const VIEW_MODE_2D = "map2d";
const VIEW_MODE_3D = "globe3d";
const MAP_TILE_URL = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
const MAP_TILE_ATTRIBUTION =
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';
const LEAFLET_CSS_URL = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const EARTH_TEXTURE_URL = "images/earth/2_no_clouds_8k.jpg";
const DEFAULT_MAP_CENTER = [12, 0];
const DEFAULT_MAP_ZOOM = 2;
const TRACK_WRAP_OFFSETS = [-360, 0, 360];
const GROUND_TRACK_START_EVENT_KEY = "returnCorrection3";
const GROUND_TRACK_PANEL_EVENT_KEYS = [
    "returnCorrection3",
    "serviceModuleSeparation",
    "crewModuleRaiseBurn",
    "entryInterface",
    "splashdown",
];
const J2000_OBLIQUITY_RADIANS = THREE.MathUtils.degToRad(23.439291111);
const EARTH_REFERENCE_RADIUS_KM = 6378.1363;
const KM_TO_MILES = 0.621371192237334;
const KMPS_TO_MPH = 2236.9362920544;
const GROUND_TRACK_EVENT_WINDOW_EPSILON_MS = 1000;
const GROUND_TRACK_COLOR = "#2b84c6";
const GROUND_TRACK_GENERATED_COLOR = "#ffb347";
const PANEL_EDGE_MARGIN_PX = 8;
const PANEL_DEFAULT_LEFT_PX = 10;
const PANEL_DEFAULT_BOTTOM_GAP_PX = 12;
const GLOBE_RADIUS = 1.0;
const GLOBE_TRACK_ALTITUDE = 1.014;
const GLOBE_MARKER_ALTITUDE = 1.035;
const GLOBE_MIN_DISTANCE = 1.9;
const GLOBE_MAX_DISTANCE = 5.2;
const GLOBE_FOV_DEGREES = 32;
const GLOBE_WORLD_NORTH = new THREE.Vector3(0, 1, 0);
const GLOBE_VIEW_UP = new THREE.Vector3(0, 1, 0);
const GLOBE_VIEW_FRONT = new THREE.Vector3(0, 0, 1);
const COMPOSER_PANEL_ASPECT_RATIO = 16 / 9;
const GROUND_TRACK_PANEL_REGISTRY_ID = "workflow:splashdown";

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function dateToJulianDate(ms) {
    return (ms / 86400000) + 2440587.5;
}

function julianDateToGmstRadians(julianDate) {
    const t = (julianDate - 2451545.0) / 36525.0;
    const gmstDegrees = 280.46061837 +
        (360.98564736629 * (julianDate - 2451545.0)) +
        (0.000387933 * t * t) -
        ((t * t * t) / 38710000.0);
    const radians = (gmstDegrees * Math.PI) / 180;
    const twoPi = Math.PI * 2;
    let normalized = radians % twoPi;
    if (normalized < 0) normalized += twoPi;
    return normalized;
}

function normalizeBodyId(bodyId) {
    return String(bodyId || "").trim().toUpperCase();
}

function resolveTelemetryBodyId(sceneState) {
    const requested = normalizeBodyId(sceneState?.telemetryBodyId);
    if (requested) return requested;
    if (sceneState?.bodies?.SC) return "SC";
    for (const [bodyId, state] of Object.entries(sceneState?.bodies || {})) {
        const id = normalizeBodyId(bodyId);
        if (id === "EARTH" || id === "MOON" || id === "SUN") continue;
        if (state?.position) return id;
    }
    return "SC";
}

function hasVector(vector) {
    return !!vector &&
        Number.isFinite(vector.x) &&
        Number.isFinite(vector.y) &&
        Number.isFinite(vector.z);
}

function normalizeVelocityVector(vector) {
    if (hasVector(vector)) {
        return vector;
    }
    if (
        vector &&
        Number.isFinite(vector.vx) &&
        Number.isFinite(vector.vy) &&
        Number.isFinite(vector.vz)
    ) {
        return {
            x: vector.vx,
            y: vector.vy,
            z: vector.vz,
        };
    }
    return null;
}

function subtractVectors(a, b) {
    return {
        x: a.x - b.x,
        y: a.y - b.y,
        z: a.z - b.z,
    };
}

function negateVector(vector) {
    if (!hasVector(vector)) return null;
    return {
        x: -vector.x,
        y: -vector.y,
        z: -vector.z,
    };
}

function magnitude(vector) {
    if (!hasVector(vector)) return Number.NaN;
    return Math.hypot(vector.x, vector.y, vector.z);
}

function rotateEclipticToEquatorial(vector) {
    if (!hasVector(vector)) return null;
    const cosEps = Math.cos(J2000_OBLIQUITY_RADIANS);
    const sinEps = Math.sin(J2000_OBLIQUITY_RADIANS);
    return {
        x: vector.x,
        y: (vector.y * cosEps) - (vector.z * sinEps),
        z: (vector.y * sinEps) + (vector.z * cosEps),
    };
}

function eciToLatLonDegrees(vectorEci, timeMs) {
    if (!hasVector(vectorEci) || !Number.isFinite(timeMs)) return null;
    const equatorialVector = rotateEclipticToEquatorial(vectorEci);
    if (!hasVector(equatorialVector)) return null;
    const gmst = julianDateToGmstRadians(dateToJulianDate(timeMs));
    const cosG = Math.cos(gmst);
    const sinG = Math.sin(gmst);
    const x = (equatorialVector.x * cosG) + (equatorialVector.y * sinG);
    const y = (-equatorialVector.x * sinG) + (equatorialVector.y * cosG);
    const z = equatorialVector.z;
    const r = Math.hypot(x, y, z);
    if (!Number.isFinite(r) || r <= 1e-9) return null;
    const lat = Math.asin(clamp(z / r, -1, 1)) * (180 / Math.PI);
    const lon = Math.atan2(y, x) * (180 / Math.PI);
    return [lat, lon];
}

function unwrapTrackPoints(points) {
    const unwrapped = [];
    let previousLon = null;
    for (const point of points) {
        if (!Array.isArray(point) || point.length !== 2) continue;
        const lat = point[0];
        let lon = point[1];
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        if (Number.isFinite(previousLon)) {
            while ((lon - previousLon) > 180) lon -= 360;
            while ((lon - previousLon) < -180) lon += 360;
        }
        unwrapped.push([lat, lon]);
        previousLon = lon;
    }
    return unwrapped.length >= 2 ? [unwrapped] : [];
}

function duplicateWrappedSegments(segments, wrapOffsets = TRACK_WRAP_OFFSETS) {
    const repeated = [];
    for (const segment of segments) {
        if (!Array.isArray(segment) || segment.length < 2) continue;
        for (const offset of wrapOffsets) {
            repeated.push(segment.map(([lat, lon]) => [lat, lon + offset]));
        }
    }
    return repeated;
}

function wrapLongitudeNearReference(lon, referenceLon = 0) {
    if (!Number.isFinite(lon)) return lon;
    let wrapped = lon;
    while ((wrapped - referenceLon) > 180) wrapped -= 360;
    while ((wrapped - referenceLon) < -180) wrapped += 360;
    return wrapped;
}

function readCssPx(name, fallback = 0) {
    const value = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
    return Number.isFinite(value) ? value : fallback;
}

function parseMissionTimeMs(value) {
    if (typeof value !== "string" || value.length === 0) return Number.NaN;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function deriveGeoOrbitChebUrl(url) {
    if (typeof url !== "string" || url.length === 0) return "";
    return url.replace(/(^|[\\/])(geo|lunar|relative)-/i, "$1geo-");
}

function isLegacySplashdownMissionMatch(configData = null) {
    const currentMissionKey = resolveCurrentMissionKey(
        typeof window !== "undefined" ? window : null,
    );
    if (currentMissionKey) {
        return currentMissionKey === "artemis2";
    }
    const missionName = String(configData?.mission_name || configData?.mission_name_short || "")
        .trim()
        .toLowerCase();
    return missionName === "artemis 2" || missionName === "artemis ii";
}

function isSplashdownPanelMissionEnabled(configData = null) {
    return isMissionPanelEnabled(
        configData,
        GROUND_TRACK_PANEL_REGISTRY_ID,
        { fallbackEnabled: isLegacySplashdownMissionMatch(configData) },
    );
}

function shouldAutoOpenSplashdownPanel(configData, nowMs = Date.now()) {
    if (!isSplashdownPanelMissionEnabled(configData)) {
        return false;
    }
    const autoOpenEnabled = shouldMissionPanelAutoOpenBeforeEvent(
        configData,
        GROUND_TRACK_PANEL_REGISTRY_ID,
        { fallback: isLegacySplashdownMissionMatch(configData) },
    );
    if (!autoOpenEnabled) {
        return false;
    }
    const splashdownMs = parseMissionTimeMs(configData?.events?.splashdown?.startTime);
    if (!Number.isFinite(splashdownMs) || !Number.isFinite(nowMs)) {
        return false;
    }
    return nowMs < splashdownMs;
}

function resolveGroundTrackWindowMs(configData, phaseKey = "geo") {
    const phaseConfig = phaseKey === "lunar"
        ? (configData?.lunar || configData?.geo)
        : (configData?.geo || configData?.lunar);
    return {
        startMs: parseMissionTimeMs(configData?.events?.[GROUND_TRACK_START_EVENT_KEY]?.startTime),
        endMs: parseMissionTimeMs(phaseConfig?.endTime),
    };
}

function resolvePostHorizonExtension(configData, phaseKey = "geo") {
    if (phaseKey !== "geo" && phaseKey !== "lunar") return null;
    const extension = configData?.postHorizonExtension;
    if (!extension || typeof extension !== "object" || extension.enabled === false) {
        return null;
    }
    const sourceEndMs = parseMissionTimeMs(extension?.sourceEndTime);
    if (!Number.isFinite(sourceEndMs)) return null;
    const phaseConfig = phaseKey === "lunar"
        ? (configData?.lunar || configData?.geo)
        : (configData?.geo || configData?.lunar);
    const phaseEndMs = parseMissionTimeMs(phaseConfig?.endTime);
    if (!Number.isFinite(phaseEndMs) || phaseEndMs <= sourceEndMs) {
        return null;
    }
    const provenance = extension?.provenance && typeof extension.provenance === "object"
        ? extension.provenance
        : {};
    return {
        sourceEndMs,
        segmentLabel: String(provenance?.segmentLabel || "Ballistic splashdown continuation").trim(),
        shortLabel: String(provenance?.shortLabel || "Generated final descent").trim(),
        summary: String(provenance?.summary || "").trim(),
        uiNote: String(provenance?.uiNote || "").trim(),
    };
}

function formatUtcDateTime(timeMs) {
    if (!Number.isFinite(timeMs)) return "--";
    try {
        return new Intl.DateTimeFormat("en-GB", {
            timeZone: "UTC",
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
        }).format(timeMs).replace(",", "") + " UTC";
    } catch {
        return `${new Date(timeMs).toISOString().replace("T", " ").replace("Z", " UTC")}`;
    }
}

function buildGeneratedSegmentNote(provenance) {
    if (!provenance) return "";
    if (provenance.uiNote) return provenance.uiNote;
    return `After ${formatUtcDateTime(provenance.sourceEndMs)}, the final descent to splashdown is app-generated ballistic continuation data and not JPL HORIZONS vector data.`;
}

function unwrapTimedTrackPoints(points) {
    const unwrapped = [];
    let previousLon = null;
    for (const point of points) {
        const lat = point?.lat;
        let lon = point?.lon;
        const timeMs = point?.timeMs;
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(timeMs)) continue;
        if (Number.isFinite(previousLon)) {
            while ((lon - previousLon) > 180) lon -= 360;
            while ((lon - previousLon) < -180) lon += 360;
        }
        unwrapped.push({ lat, lon, timeMs });
        previousLon = lon;
    }
    return unwrapped;
}

function timedPointsToSegments(points) {
    if (!Array.isArray(points) || points.length < 2) return [];
    return [[...points.map((point) => [point.lat, point.lon])]];
}

function resolveGeneratedTrackSegments(points, sourceEndMs) {
    if (!Array.isArray(points) || points.length < 2 || !Number.isFinite(sourceEndMs)) return [];
    const firstGeneratedIndex = points.findIndex((point) => point.timeMs > sourceEndMs);
    if (firstGeneratedIndex < 0) return [];
    const startIndex = Math.max(0, firstGeneratedIndex - 1);
    return timedPointsToSegments(points.slice(startIndex));
}

function latLonToVector3(latDeg, lonDeg, radius = GLOBE_RADIUS) {
    const lat = THREE.MathUtils.degToRad(latDeg);
    const lon = THREE.MathUtils.degToRad(lonDeg);
    const cosLat = Math.cos(lat);
    return new THREE.Vector3(
        radius * cosLat * Math.cos(lon),
        radius * Math.sin(lat),
        -radius * cosLat * Math.sin(lon),
    );
}

function resolveNorthUpTrackQuaternion(targetVector) {
    if (!(targetVector instanceof THREE.Vector3)) {
        return new THREE.Quaternion();
    }
    const front = GLOBE_VIEW_FRONT.clone();
    const north = GLOBE_WORLD_NORTH.clone();
    const qFaceTarget = new THREE.Quaternion().setFromUnitVectors(targetVector.clone().normalize(), front);
    const rotatedNorth = north.applyQuaternion(qFaceTarget);
    const projectedNorth = rotatedNorth.sub(front.clone().multiplyScalar(rotatedNorth.dot(front)));
    if (projectedNorth.lengthSq() <= 1e-10) {
        return qFaceTarget;
    }
    projectedNorth.normalize();
    const signedAngle = Math.atan2(
        front.dot(new THREE.Vector3().crossVectors(projectedNorth, GLOBE_VIEW_UP)),
        projectedNorth.dot(GLOBE_VIEW_UP),
    );
    const qNorthUp = new THREE.Quaternion().setFromAxisAngle(front, signedAngle);
    return qNorthUp.multiply(qFaceTarget);
}

function disposeObject3D(object) {
    if (!object) return;
    if (object.geometry?.dispose) object.geometry.dispose();
    const material = object.material;
    if (Array.isArray(material)) {
        material.forEach((entry) => entry?.dispose?.());
    } else {
        material?.dispose?.();
    }
}

function createGroundTrackPanelActions(options = {}) {
    const formatMetric = typeof options?.formatMetric === "function"
        ? options.formatMetric
        : ((value) => {
            if (!Number.isFinite(value)) return "--";
            const abs = Math.abs(value);
            if (abs >= 100) return value.toFixed(0);
            if (abs >= 10) return value.toFixed(1);
            return value.toFixed(2);
        });
    let initialized = false;
    let map = null;
    let tileLayer = null;
    let marker = null;
    let trackLayerGroup = null;
    let currentTrackKey = "";
    let currentSegments = [];
    let currentGeneratedSegments = [];
    let currentLocation = null;
    let shadowRoot = null;
    let shadowShell = null;
    let mapHost = null;
    let globeHost = null;
    let resizeObserver = null;
    let latestPayload = null;
    let panelMode = VIEW_MODE_2D;
    let hasMapUserView = false;
    let hasGlobeUserView = false;
    let isProgrammaticMapViewChange = false;
    let isProgrammaticGlobeViewChange = false;
    let missionConfigData = null;
    let missionConfigReady = false;
    let missionConfigPromise = null;
    let panelPosition = null;
    let dragState = null;
    let groundTrackEventSignature = "";
    let groundTrackEventNodes = [];
    let selectedGroundTrackEventTimeMs = Number.NaN;
    let autoOpenScheduled = false;
    let panelVisibilityState = "closed";
    let dockedLayoutResizeFrame = 0;
    let restoredPanelLayout = readMissionPanelState(GROUND_TRACK_PANEL_REGISTRY_ID) || null;
    let hasRestoredPanelLayout = !!restoredPanelLayout;
    let panelExpanded = restoredPanelLayout?.maximized === true || hasRestoredPanelLayout !== true;
    let restorePanelFrame = restoredPanelLayout?.restoreFrame && typeof restoredPanelLayout.restoreFrame === "object"
        ? {
            x: Math.round(Number(restoredPanelLayout.restoreFrame.x) || 0),
            y: Math.round(Number(restoredPanelLayout.restoreFrame.y) || 0),
            width: Math.round(Number(restoredPanelLayout.restoreFrame.width) || 0),
            height: Math.round(Number(restoredPanelLayout.restoreFrame.height) || 0),
        }
        : null;
    let hasRestoredPanelVisibilityState = false;
    let defaultPanelStateApplied = false;
    const cacheByKey = new Map();
    const trackChebyshevDataByUrl = new Map();
    const trackChebyshevLoadPromisesByUrl = new Map();
    const globeState = {
        renderer: null,
        scene: null,
        camera: null,
        controls: null,
        globeRoot: null,
        earthMesh: null,
        trackGroup: null,
        markerMesh: null,
        texturePromise: null,
    };

    const getNode = (id) => document.getElementById(id);

    function isDockviewGroundTrackPanelEnabled() {
        return !!getDockviewSpikeLayoutHost();
    }

    function isGroundTrackPanelDocked(panel = getNode("ground-track-panel")) {
        return !!panel?.classList?.contains?.("ground-track-panel--dockview");
    }

    function ensureGroundTrackPanelDocked(panel = getNode("ground-track-panel")) {
        if (!isDomInstance(panel, "HTMLElement")) return false;
        const layoutHost = getDockviewSpikeLayoutHost();
        if (!layoutHost) return false;
        if (layoutHost.focusPanel(GROUND_TRACK_PANEL_REGISTRY_ID)) {
            return true;
        }
        const position = resolveDockedWorkflowPanelPosition(layoutHost, GROUND_TRACK_PANEL_REGISTRY_ID);
        layoutHost.addPanel({
            id: GROUND_TRACK_PANEL_REGISTRY_ID,
            component: "mounted-element",
            title: "Splashdown in Spotlight",
            position,
            params: {
                mountElementId: "ground-track-panel",
                mountClassName: "ground-track-panel--dockview",
                fallbackParentId: "ground-track-panel-wrapper",
            },
            initialHeight: 300,
            minimumWidth: 300,
            minimumHeight: 220,
        });
        layoutHost.focusPanel(GROUND_TRACK_PANEL_REGISTRY_ID);
        return true;
    }

    function closeDockedGroundTrackPanel() {
        const layoutHost = getDockviewSpikeLayoutHost();
        if (!layoutHost) return false;
        return layoutHost.closePanel(GROUND_TRACK_PANEL_REGISTRY_ID);
    }

    function isRelativeFrameActive(config) {
        if (config === "relative") return true;
        if (config !== "geo") return false;
        return !!document.getElementById("origin-relative")?.checked;
    }

    function resolveSpacecraftMnemonic() {
        return String(missionConfigData?.spacecraft_mnemonic || "SC").trim().toUpperCase();
    }

    function resolveGroundTrackCraftId(config) {
        const scene = window.animationScenes?.[config];
        return scene?.activeCraftId || scene?.primaryCraftId || "SC";
    }

    function resolveGroundTrackChebyshevDescriptor(config, relativeFrameActive = isRelativeFrameActive(config)) {
        const scene = window.animationScenes?.[config];
        const geoScene = window.animationScenes?.geo;
        if (config === "geo" && relativeFrameActive) {
            const craftUrl =
                scene?.relativeSupportOrbitsCheb ||
                scene?.supportOrbitsChebByBodyId?.MOON ||
                geoScene?.relativeSupportOrbitsCheb ||
                geoScene?.supportOrbitsChebByBodyId?.MOON ||
                deriveGeoOrbitChebUrl(scene?.orbitsCheb) ||
                deriveGeoOrbitChebUrl(geoScene?.orbitsCheb) ||
                geoScene?.orbitsCheb ||
                "";
            if (!craftUrl) return null;
            return {
                key: `geo-relative:${craftUrl}`,
                mode: "geo-relative",
                craftUrl,
                geoSupportUrl: craftUrl,
            };
        }
        if (config === "lunar") {
            const craftUrl = scene?.orbitsCheb || "";
            const geoSupportUrl =
                geoScene?.relativeSupportOrbitsCheb ||
                geoScene?.orbitsCheb ||
                deriveGeoOrbitChebUrl(craftUrl);
            if (!craftUrl || !geoSupportUrl) return null;
            return {
                key: `lunar-earth:${craftUrl}:${geoSupportUrl}`,
                mode: "lunar-earth",
                craftUrl,
                geoSupportUrl,
            };
        }
        return null;
    }

    async function ensureTrackChebyshevLoaded(url) {
        if (typeof url !== "string" || url.length === 0) {
            return null;
        }
        if (trackChebyshevDataByUrl.has(url)) {
            return trackChebyshevDataByUrl.get(url);
        }
        if (trackChebyshevLoadPromisesByUrl.has(url)) {
            return trackChebyshevLoadPromisesByUrl.get(url);
        }
        const promise = loadChebyshev(url)
            .then((data) => {
                trackChebyshevDataByUrl.set(url, data);
                trackChebyshevLoadPromisesByUrl.delete(url);
                return data;
            })
            .catch((error) => {
                trackChebyshevLoadPromisesByUrl.delete(url);
                throw error;
            });
        trackChebyshevLoadPromisesByUrl.set(url, promise);
        return promise;
    }

    function getLoadedTrackChebyshevData(url) {
        if (typeof url !== "string" || url.length === 0) return null;
        return trackChebyshevDataByUrl.get(url) || null;
    }

    function ensureTrackDescriptorLoaded(descriptor) {
        if (!descriptor) return;
        const urls = [
            descriptor.craftUrl,
            descriptor.geoSupportUrl,
        ].filter((url, index, array) => typeof url === "string" && url.length > 0 && array.indexOf(url) === index);
        if (urls.length === 0) return;
        Promise.all(urls.map((url) => ensureTrackChebyshevLoaded(url)))
            .then(() => {
                if (latestPayload) {
                    queueMicrotask(() => {
                        if (latestPayload) {
                            renderPayload(latestPayload);
                        }
                    });
                }
            })
            .catch((error) => {
                console.error("Failed to load ground track ephemeris support", error);
            });
    }

    function buildTrackEphemerisInput(config, chebyshevDataMap) {
        const chebyshevDataLoaded = {};
        Object.keys(chebyshevDataMap || {}).forEach((key) => {
            chebyshevDataLoaded[key] = !!chebyshevDataMap[key];
        });
        return {
            config,
            npzData: null,
            npzDataLoaded: {},
            chebyshevData: chebyshevDataMap,
            chebyshevDataLoaded,
            landingNpzData: null,
            landingNpzLoaded: false,
            landingChebyshevData: null,
            landingChebyshevLoaded: false,
            globalConfig: missionConfigData,
            startLandingTime: Number.NaN,
            endLandingTime: Number.NaN,
            bodySources: {},
            defaultSpacecraftSource: "chebyshev",
            spacecraftMnemonic: resolveSpacecraftMnemonic(),
            resolvedSource: "chebyshev",
        };
    }

    function sampleChebyshevState({ bodyId, timeMs, config, chebyshevDataMap }) {
        return getBodyEphemerisState({
            bodyId,
            timeMs,
            ...buildTrackEphemerisInput(config, chebyshevDataMap),
        });
    }

    function resolveEphemerisEarthCenteredSample({ descriptor, timeMs, craftId }) {
        if (!descriptor || !Number.isFinite(timeMs)) return null;
        if (descriptor.mode === "geo-relative") {
            const craftData = getLoadedTrackChebyshevData(descriptor.craftUrl);
            if (!craftData) return null;
            const craftState = sampleChebyshevState({
                bodyId: craftId,
                timeMs,
                config: "geo",
                chebyshevDataMap: { geo: craftData },
            });
            if (!craftState?.available || !hasVector(craftState.position)) return null;
            return {
                vector: craftState.position,
                velocity: normalizeVelocityVector(craftState.velocity),
            };
        }
        if (descriptor.mode === "lunar-earth") {
            const lunarData = getLoadedTrackChebyshevData(descriptor.craftUrl);
            const geoData = getLoadedTrackChebyshevData(descriptor.geoSupportUrl);
            if (!lunarData || !geoData) return null;
            const craftState = sampleChebyshevState({
                bodyId: craftId,
                timeMs,
                config: "lunar",
                chebyshevDataMap: { lunar: lunarData },
            });
            const moonState = sampleChebyshevState({
                bodyId: "MOON",
                timeMs,
                config: "geo",
                chebyshevDataMap: { geo: geoData },
            });
            const craftVelocity = normalizeVelocityVector(craftState?.velocity || null);
            const moonVelocity = normalizeVelocityVector(moonState?.velocity || null);
            const earthPositionInLunar = negateVector(moonState?.position || null);
            const earthVelocityInLunar = negateVector(moonVelocity);
            if (!craftState?.available || !hasVector(craftState.position) || !hasVector(earthPositionInLunar)) {
                return null;
            }
            return {
                vector: subtractVectors(craftState.position, earthPositionInLunar),
                velocity: hasVector(craftVelocity) && hasVector(earthVelocityInLunar)
                    ? subtractVectors(craftVelocity, earthVelocityInLunar)
                    : null,
            };
        }
        return null;
    }

    function getPanelRegistryState() {
        if (!isSplashdownPanelMissionEnabled(missionConfigData)) {
            return "unavailable";
        }
        return panelVisibilityState;
    }

    function persistPanelLayoutState(panel = getNode("ground-track-panel")) {
        if (!isDomInstance(panel, "HTMLElement")) {
            return;
        }
        if (isGroundTrackPanelDocked(panel)) {
            writeMissionPanelState(GROUND_TRACK_PANEL_REGISTRY_ID, {
                state: panelVisibilityState,
                maximized: false,
            });
            return;
        }
        writeMissionPanelState(GROUND_TRACK_PANEL_REGISTRY_ID, {
            x: Math.round(panelPosition?.x ?? panel.offsetLeft ?? 0),
            y: Math.round(panelPosition?.y ?? panel.offsetTop ?? 0),
            width: Math.round(panel.offsetWidth || 0),
            height: Math.round(panel.offsetHeight || 0),
            state: panelVisibilityState,
            maximized: panelExpanded === true,
            restoreFrame: restorePanelFrame && typeof restorePanelFrame === "object"
                ? {
                    x: Math.round(Number(restorePanelFrame.x) || 0),
                    y: Math.round(Number(restorePanelFrame.y) || 0),
                    width: Math.round(Number(restorePanelFrame.width) || 0),
                    height: Math.round(Number(restorePanelFrame.height) || 0),
                }
                : null,
        });
    }

    function capturePanelFrame(panel = getNode("ground-track-panel")) {
        if (!isDomInstance(panel, "HTMLElement")) {
            return null;
        }
        return {
            x: Math.round(panelPosition?.x ?? panel.offsetLeft ?? 0),
            y: Math.round(panelPosition?.y ?? panel.offsetTop ?? 0),
            width: Math.round(panel.offsetWidth || 0),
            height: Math.round(panel.offsetHeight || 0),
        };
    }

    function resolveExpandedPanelRect() {
        const headerRect = document.querySelector(".header")?.getBoundingClientRect?.() || null;
        const timelineRect = document.querySelector(".timeline-dock")?.getBoundingClientRect?.() || null;
        const left = PANEL_EDGE_MARGIN_PX;
        const top = Number.isFinite(headerRect?.bottom)
            ? Math.round(headerRect.bottom + PANEL_EDGE_MARGIN_PX)
            : PANEL_EDGE_MARGIN_PX;
        const right = window.innerWidth - PANEL_EDGE_MARGIN_PX;
        const bottom = Number.isFinite(timelineRect?.top)
            ? Math.round(timelineRect.top - PANEL_EDGE_MARGIN_PX)
            : (window.innerHeight - PANEL_EDGE_MARGIN_PX);
        const maxWidth = Math.max(320, right - left);
        const maxHeight = Math.max(220, bottom - top);
        return {
            x: left,
            y: top,
            width: maxWidth,
            height: maxHeight,
        };
    }

    function applyExpandedPanelRect(panel = getNode("ground-track-panel")) {
        if (!isDomInstance(panel, "HTMLElement")) {
            return;
        }
        const rect = resolveExpandedPanelRect();
        panel.style.width = `${rect.width}px`;
        panel.style.height = `${rect.height}px`;
        applyPanelPosition(panel, rect.x, rect.y);
    }

    function syncExpandButton(button = getNode("ground-track-panel-expand")) {
        if (!isDomInstance(button, "HTMLElement")) {
            return;
        }
        button.dataset.icon = panelExpanded === true ? "restore" : "expand";
        button.textContent = "";
        button.title = panelExpanded === true ? "Restore" : "Expand";
        button.setAttribute("aria-label", button.title);
        button.setAttribute("aria-pressed", panelExpanded === true ? "true" : "false");
    }

    function resetExpandedPanelForDelete(panel = getNode("ground-track-panel")) {
        if (!isDomInstance(panel, "HTMLElement") || panelExpanded !== true) {
            return;
        }
        panelExpanded = false;
        panel.classList.remove("is-maximized");
        if (restorePanelFrame && restorePanelFrame.width > 0 && restorePanelFrame.height > 0) {
            panel.style.width = `${restorePanelFrame.width}px`;
            panel.style.height = `${restorePanelFrame.height}px`;
            applyPanelPosition(panel, restorePanelFrame.x, restorePanelFrame.y);
        } else {
            ensurePanelPosition(panel);
        }
        syncExpandButton();
    }

    function confirmDeletePanel() {
        const confirmFn = globalThis?.confirm;
        if (typeof confirmFn === "function") {
            const accepted = confirmFn(
                'Delete "Splashdown in Spotlight" from this mission layout? You can add it back from the Panels menu.',
            );
            if (!accepted) {
                return false;
            }
        }
        resetExpandedPanelForDelete();
        setPanelState("deleted");
        return true;
    }

    function syncPanelRegistry() {
        const panelStateName = getPanelRegistryState();
        const missionLabel = String(
            missionConfigData?.mission_name_short ||
            missionConfigData?.mission_name ||
            "Current mission",
        ).trim();
        updateMissionPanel(GROUND_TRACK_PANEL_REGISTRY_ID, {
            id: GROUND_TRACK_PANEL_REGISTRY_ID,
            title: "Splashdown in Spotlight",
            kind: "workflow",
            panelType: "splashdown",
            builtIn: true,
            available: isSplashdownPanelMissionEnabled(missionConfigData),
            state: panelStateName,
            sortOrder: 50,
            infoItems: [
                { label: "Panel Kind", value: "Splashdown workflow" },
                { label: "Mission", value: missionLabel || "Current mission" },
            ],
            actions: {
                open: () => setPanelState("open"),
                restore: () => setPanelState("open"),
                focus: panelStateName === "open"
                    ? () => { setPanelState("open"); focusDockviewWorkflowPanel(GROUND_TRACK_PANEL_REGISTRY_ID); }
                    : undefined,
                close: panelStateName === "open"
                    ? () => setPanelState("closed")
                    : undefined,
                delete: panelStateName !== "deleted"
                    ? () => confirmDeletePanel()
                    : undefined,
            },
        });
    }

    function applyConfiguredDefaultPanelState() {
        if (
            !missionConfigData ||
            hasRestoredPanelVisibilityState === true ||
            defaultPanelStateApplied === true
        ) {
            return;
        }
        const defaultState = getMissionPanelDefaultState(
            missionConfigData,
            GROUND_TRACK_PANEL_REGISTRY_ID,
            { fallbackState: "closed" },
        );
        defaultPanelStateApplied = true;
        setPanelState(defaultState);
    }

    function ensureMissionConfigData() {
        if (missionConfigReady) return Promise.resolve(missionConfigData);
        if (missionConfigPromise) return missionConfigPromise;
        missionConfigPromise = loadMissionConfig()
            .then((configData) => {
                missionConfigData = configData || null;
                missionConfigReady = true;
                applyConfiguredDefaultPanelState();
                syncPanelRegistry();
                return missionConfigData;
            })
            .catch(() => {
                missionConfigData = null;
                missionConfigReady = true;
                syncPanelRegistry();
                return null;
            })
            .finally(() => {
                missionConfigPromise = null;
            });
        return missionConfigPromise;
    }

    function setStatus(text) {
        const node = getNode("ground-track-status");
        if (node) node.textContent = text;
    }

    function setProvenanceNote({ visible, badgeText, text, active = false }) {
        const note = getNode("ground-track-provenance-note");
        if (!isDomInstance(note, "HTMLElement")) return;
        note.hidden = !visible;
        note.classList.toggle("is-active", !!active);
        const badge = getNode("ground-track-provenance-badge");
        if (badge) badge.textContent = badgeText || "Generated final descent";
        const label = getNode("ground-track-provenance-text");
        if (label) label.textContent = text || "";
    }

    function setCoords(text) {
        const node = getNode("ground-track-coords");
        if (node) node.textContent = text;
    }

    function setMetricValue(id, text) {
        const node = getNode(id);
        if (node) node.textContent = text;
    }

    function setTimelineLocalText(text) {
        const node = getNode("ground-track-timeline-local");
        if (node) node.textContent = text;
    }

    function syncPanelAvailability(enabled) {
        const wrapper = getNode("ground-track-panel-wrapper");
        if (isDomInstance(wrapper, "HTMLElement")) {
            wrapper.hidden = !enabled;
        }
        const panel = getNode("ground-track-panel");
        if (!isDomInstance(panel, "HTMLElement") || enabled) return;
        panelVisibilityState = "closed";
        if (!panel.classList.contains("ground-track-panel--hidden")) {
            panel.classList.add("ground-track-panel--hidden");
            document.dispatchEvent(new CustomEvent("ground-track-panel-visibilitychange", {
                detail: { visible: false, state: panelVisibilityState },
            }));
        }
        syncPanelRegistry();
    }

    function formatDistanceKmText(valueKm) {
        if (!Number.isFinite(valueKm)) return "--";
        return `${formatMetric(valueKm)} km`;
    }

    function formatDistanceMilesText(valueKm) {
        if (!Number.isFinite(valueKm)) return "--";
        return `${formatMetric(valueKm * KM_TO_MILES)} miles`;
    }

    function formatVelocityKmpsText(valueKmPerSec) {
        if (!Number.isFinite(valueKmPerSec)) return "--";
        return `${formatMetric(valueKmPerSec)} km/s`;
    }

    function formatVelocityMphText(valueKmPerSec) {
        if (!Number.isFinite(valueKmPerSec)) return "--";
        return `${formatMetric(valueKmPerSec * KMPS_TO_MPH)} miles/h`;
    }

    function normalizeLongitudeDegrees(lon) {
        if (!Number.isFinite(lon)) return Number.NaN;
        let normalized = lon;
        while (normalized > 180) normalized -= 360;
        while (normalized <= -180) normalized += 360;
        return normalized;
    }

    function formatLatitudeText(lat) {
        if (!Number.isFinite(lat)) return "--";
        const hemisphere = lat > 0 ? "N" : (lat < 0 ? "S" : "");
        const value = `${Math.abs(lat).toFixed(2)}°`;
        return hemisphere ? `${value} ${hemisphere}` : value;
    }

    function formatLongitudeText(lon) {
        const normalized = normalizeLongitudeDegrees(lon);
        if (!Number.isFinite(normalized)) return "--";
        const hemisphere = normalized > 0 ? "E" : (normalized < 0 ? "W" : "");
        const value = `${Math.abs(normalized).toFixed(2)}°`;
        return hemisphere ? `${value} ${hemisphere}` : value;
    }

    function formatLatLonPair(location) {
        if (!Array.isArray(location) || location.length !== 2) return "--";
        return `${formatLatitudeText(location[0])}, ${formatLongitudeText(location[1])}`;
    }

    function formatLocalDateTime(timeMs, { includeSeconds = true } = {}) {
        if (!Number.isFinite(timeMs)) return "--";
        try {
            return new Intl.DateTimeFormat(undefined, {
                month: "short",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                second: includeSeconds ? "2-digit" : undefined,
                hour12: false,
                timeZoneName: "short",
            }).format(timeMs);
        } catch {
            return new Date(timeMs).toLocaleString();
        }
    }

    function updateInfoStrip({ earthDistanceKm, earthSpeedKmPerSec, earthAltitudeKm, location }) {
        setMetricValue("ground-track-metric-earth-distance-km", formatDistanceKmText(earthDistanceKm));
        setMetricValue("ground-track-metric-earth-distance-miles", formatDistanceMilesText(earthDistanceKm));
        setMetricValue("ground-track-metric-velocity-kmps", formatVelocityKmpsText(earthSpeedKmPerSec));
        setMetricValue("ground-track-metric-velocity-mph", formatVelocityMphText(earthSpeedKmPerSec));
        setMetricValue("ground-track-metric-altitude-km", formatDistanceKmText(earthAltitudeKm));
        setMetricValue("ground-track-metric-altitude-miles", formatDistanceMilesText(earthAltitudeKm));
        setMetricValue("ground-track-metric-latitude", formatLatitudeText(location?.[0]));
        setMetricValue("ground-track-metric-longitude", formatLongitudeText(location?.[1]));
    }

    function readMainTimelineState() {
        const slider = document.getElementById("timeline-slider");
        if (!(slider instanceof HTMLInputElement)) return null;
        return readTimelineSliderMissionState(slider);
    }

    function seekMainTimelineTime(timeMs, finalize = false) {
        const timelineState = readMainTimelineState();
        if (!timelineState) return;
        const seekResult = applyTimelineSliderMissionSeek(timelineState.slider, timeMs, {
            source: "ground-track",
        });
        if (!seekResult) return;
        const dataset = timelineState.slider.dataset || (timelineState.slider.dataset = {});
        timelineState.slider.dispatchEvent(new Event("input", { bubbles: true }));
        if (finalize) {
            dataset.programmaticSeekSource = "ground-track";
            dataset.programmaticSeekTimeMs = String(seekResult.timeMs);
            timelineState.slider.dispatchEvent(new Event("change", { bubbles: true }));
        }
    }

    const REPEAT_PRESS_BUTTON_IDS = new Set(["slower", "faster", "realtime"]);

    function dispatchSyntheticPress(target) {
        if (!(target instanceof HTMLButtonElement) || target.disabled) {
            return false;
        }
        if (typeof window !== "undefined" && typeof window.PointerEvent === "function") {
            target.dispatchEvent(new PointerEvent("pointerdown", {
                bubbles: true,
                cancelable: true,
                pointerId: 1,
                pointerType: "mouse",
                isPrimary: true,
                button: 0,
            }));
            target.dispatchEvent(new PointerEvent("pointerup", {
                bubbles: true,
                cancelable: true,
                pointerId: 1,
                pointerType: "mouse",
                isPrimary: true,
                button: 0,
            }));
            return true;
        }
        target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
        target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
        return true;
    }

    function clickMainControlButton(id) {
        const button = document.getElementById(id);
        if (!(button instanceof HTMLButtonElement)) {
            return false;
        }
        if (button.disabled || button.getAttribute("aria-disabled") === "true") {
            return false;
        }
        if (REPEAT_PRESS_BUTTON_IDS.has(id)) {
            return dispatchSyntheticPress(button);
        }
        button.click();
        return true;
    }

    function resolveGroundTrackEvents(config, startMs, endMs) {
        const eventMap = missionConfigData?.events || {};
        const provenance = resolvePostHorizonExtension(missionConfigData, config);
        const sourceEndMs = provenance?.sourceEndMs;
        const events = [];

        for (const eventKey of GROUND_TRACK_PANEL_EVENT_KEYS) {
            const key = String(eventKey || "").trim();
            if (!key || key === "now") continue;
            const eventInfo = eventMap[key];
            if (!eventInfo || typeof eventInfo !== "object") continue;
            const eventTimeMs = parseMissionTimeMs(eventInfo?.startTime);
            if (!Number.isFinite(eventTimeMs)) continue;
            if (Number.isFinite(startMs) && eventTimeMs < (startMs - GROUND_TRACK_EVENT_WINDOW_EPSILON_MS)) continue;
            if (Number.isFinite(endMs) && eventTimeMs > (endMs + GROUND_TRACK_EVENT_WINDOW_EPSILON_MS)) continue;
            const title = String(eventInfo?.label || key || "Event").trim();
            if (!title) continue;
            events.push({
                id: key,
                title,
                timeMs: eventTimeMs,
                generated: Number.isFinite(sourceEndMs) && eventTimeMs > sourceEndMs,
            });
        }

        events.sort((a, b) => a.timeMs - b.timeMs);
        return events;
    }

    function syncGroundTrackEventList(config, currentTimeMs, startMs, endMs) {
        const wrap = getNode("ground-track-event-list");
        if (!wrap) return;
        const events = resolveGroundTrackEvents(config, startMs, endMs);
        const signature = events.map((eventInfo) => `${eventInfo.id}:${eventInfo.timeMs}:${eventInfo.generated ? 1 : 0}`).join("|");
        if (groundTrackEventSignature !== signature) {
            wrap.replaceChildren();
            groundTrackEventSignature = signature;
            groundTrackEventNodes = [];
            selectedGroundTrackEventTimeMs = Number.NaN;
            for (const eventInfo of events) {
                const pill = document.createElement("button");
                pill.type = "button";
                pill.className = "ground-track-panel__event-pill";
                pill.setAttribute("aria-label", `Jump timeline to ${eventInfo.title}`);
                const titleWrap = document.createElement("span");
                titleWrap.className = "ground-track-panel__event-pill-title-wrap";
                const title = document.createElement("span");
                title.className = "ground-track-panel__event-pill-title";
                title.textContent = eventInfo.title;
                titleWrap.appendChild(title);
                if (eventInfo.generated) {
                    const badge = document.createElement("span");
                    badge.className = "ground-track-panel__event-pill-badge";
                    badge.textContent = "Generated";
                    titleWrap.appendChild(badge);
                }
                const time = document.createElement("span");
                time.className = "ground-track-panel__event-pill-time";
                time.textContent = formatLocalDateTime(eventInfo.timeMs);
                pill.appendChild(titleWrap);
                pill.appendChild(time);
                pill.addEventListener("click", () => {
                    selectedGroundTrackEventTimeMs = eventInfo.timeMs;
                    seekMainTimelineTime(eventInfo.timeMs, true);
                    syncGroundTrackEventList(config, eventInfo.timeMs, startMs, endMs);
                });
                wrap.appendChild(pill);
                groundTrackEventNodes.push({
                    element: pill,
                    id: eventInfo.id,
                    timeMs: eventInfo.timeMs,
                });
            }
        }

        if (groundTrackEventNodes.length === 0) {
            return;
        }

        let activeIndex = -1;
        const selectedEventIndex = Number.isFinite(selectedGroundTrackEventTimeMs)
            ? groundTrackEventNodes.findIndex((eventNode) => eventNode.timeMs === selectedGroundTrackEventTimeMs)
            : -1;
        if (selectedEventIndex >= 0 && Number.isFinite(currentTimeMs)) {
            if (Math.abs(currentTimeMs - selectedGroundTrackEventTimeMs) <= 1000) {
                activeIndex = selectedEventIndex;
            } else {
                selectedGroundTrackEventTimeMs = Number.NaN;
            }
        }
        if (Number.isFinite(currentTimeMs) && activeIndex < 0) {
            for (let i = 0; i < groundTrackEventNodes.length; i += 1) {
                if (currentTimeMs >= groundTrackEventNodes[i].timeMs) {
                    activeIndex = i;
                } else {
                    break;
                }
            }
            if (activeIndex < 0) {
                activeIndex = 0;
            }
        }
        for (let i = 0; i < groundTrackEventNodes.length; i += 1) {
            groundTrackEventNodes[i].element.classList.toggle("is-active", i === activeIndex);
        }
    }

    function syncTimelineCardUi(config, animTime, startMs, endMs) {
        const playButton = getNode("ground-track-play");
        const stepBackSecondButton = getNode("ground-track-step-back-second");
        const stepForwardSecondButton = getNode("ground-track-step-forward-second");
        const stepBackMinuteButton = getNode("ground-track-step-back-minute");
        const stepForwardMinuteButton = getNode("ground-track-step-forward-minute");
        const slowerButton = getNode("ground-track-slower");
        const speedButton = getNode("ground-track-speed");
        const fasterButton = getNode("ground-track-faster");
        const slider = getNode("ground-track-timeline-slider");
        const mainTimeline = readMainTimelineState();

        if (playButton instanceof HTMLButtonElement) {
            const mainPlay = document.getElementById("animate");
            if (mainPlay instanceof HTMLButtonElement) {
                playButton.textContent = (mainPlay.textContent || "▶").trim() || "▶";
                playButton.disabled = mainPlay.disabled || mainPlay.getAttribute("aria-disabled") === "true";
                playButton.title = mainPlay.title || "Play or pause animation";
            } else {
                playButton.textContent = "▶";
                playButton.disabled = true;
            }
        }

        if (speedButton instanceof HTMLButtonElement) {
            const mainSpeed = document.getElementById("realtime");
            if (mainSpeed instanceof HTMLButtonElement) {
                speedButton.textContent = (mainSpeed.textContent || "1 sec/sec").trim() || "1 sec/sec";
                speedButton.disabled = mainSpeed.disabled || mainSpeed.getAttribute("aria-disabled") === "true";
                speedButton.title = mainSpeed.title || "Set speed to realtime (1 sec/sec)";
            } else {
                speedButton.textContent = "1 sec/sec";
                speedButton.disabled = true;
            }
        }

        const mainSlower = document.getElementById("slower");
        if (slowerButton instanceof HTMLButtonElement) {
            slowerButton.disabled = !(mainSlower instanceof HTMLButtonElement) ||
                mainSlower.disabled ||
                mainSlower.getAttribute("aria-disabled") === "true";
        }

        const mainFaster = document.getElementById("faster");
        if (fasterButton instanceof HTMLButtonElement) {
            fasterButton.disabled = !(mainFaster instanceof HTMLButtonElement) ||
                mainFaster.disabled ||
                mainFaster.getAttribute("aria-disabled") === "true";
        }

        const rangeStart = Number.isFinite(startMs) ? startMs : mainTimeline?.min;
        const rangeEnd = Number.isFinite(endMs) ? endMs : mainTimeline?.max;
        const configuredWindow = resolveGroundTrackWindowMs(missionConfigData, config);
        const eventRangeEnd = Number.isFinite(configuredWindow?.endMs)
            ? configuredWindow.endMs
            : rangeEnd;
        const activeTime = clamp(animTime, rangeStart, rangeEnd);

        if (slider instanceof HTMLInputElement && Number.isFinite(rangeStart) && Number.isFinite(rangeEnd)) {
            slider.min = String(rangeStart);
            slider.max = String(Math.max(rangeStart + 1000, rangeEnd));
            slider.step = "1000";
            slider.value = String(activeTime);
            slider.disabled = false;
        } else if (slider instanceof HTMLInputElement) {
            slider.disabled = true;
        }

        if (stepBackSecondButton instanceof HTMLButtonElement) {
            stepBackSecondButton.disabled = !Number.isFinite(rangeStart) || activeTime <= rangeStart;
        }
        if (stepForwardSecondButton instanceof HTMLButtonElement) {
            stepForwardSecondButton.disabled = !Number.isFinite(rangeEnd) || activeTime >= rangeEnd;
        }
        if (stepBackMinuteButton instanceof HTMLButtonElement) {
            stepBackMinuteButton.disabled = !Number.isFinite(rangeStart) || activeTime <= rangeStart;
        }
        if (stepForwardMinuteButton instanceof HTMLButtonElement) {
            stepForwardMinuteButton.disabled = !Number.isFinite(rangeEnd) || activeTime >= rangeEnd;
        }

        setTimelineLocalText(`Local: ${formatLocalDateTime(activeTime)}`);
        syncGroundTrackEventList(config, activeTime, rangeStart, eventRangeEnd);
    }

    function updateModeButtons() {
        const button2d = getNode("ground-track-style-2d");
        const button3d = getNode("ground-track-style-3d");
        const is2D = panelMode === VIEW_MODE_2D;
        button2d?.classList.toggle("is-active", is2D);
        button3d?.classList.toggle("is-active", !is2D);
        button2d?.setAttribute("aria-pressed", is2D ? "true" : "false");
        button3d?.setAttribute("aria-pressed", is2D ? "false" : "true");
    }

    function ensureShadowSurface(container) {
        if (!container) return null;
        shadowRoot = container.shadowRoot || container.attachShadow({ mode: "open" });

        let stylesheet = shadowRoot.querySelector("link[data-ground-track-leaflet]");
        if (!stylesheet) {
            stylesheet = document.createElement("link");
            stylesheet.rel = "stylesheet";
            stylesheet.href = LEAFLET_CSS_URL;
            stylesheet.setAttribute("data-ground-track-leaflet", "true");
            shadowRoot.appendChild(stylesheet);
        }

        let style = shadowRoot.querySelector("style[data-ground-track-surface-style]");
        if (!style) {
            style = document.createElement("style");
            style.setAttribute("data-ground-track-surface-style", "true");
            style.textContent = `
                :host {
                    display: block;
                    width: 100%;
                    height: 100%;
                }
                [hidden] {
                    display: none !important;
                }
                .ground-track-shadow-shell {
                    position: relative;
                    width: 100%;
                    height: 100%;
                    overflow: hidden;
                    background: #07101d;
                }
                .ground-track-shadow-view {
                    position: absolute;
                    inset: 0;
                    width: 100%;
                    height: 100%;
                }
                .ground-track-shadow-map.leaflet-container {
                    width: 100%;
                    height: 100%;
                    background: #cfe6ef;
                    font-family: var(--font-ui, sans-serif);
                }
                .ground-track-shadow-map .leaflet-control-attribution {
                    font-size: 9px;
                    background: rgba(248, 252, 255, 0.88);
                    color: #37516f;
                }
                .ground-track-shadow-map .leaflet-control-attribution a {
                    color: #264f7d;
                }
                .ground-track-shadow-map img,
                .ground-track-shadow-map .leaflet-tile {
                    max-width: none !important;
                    max-height: none !important;
                    mix-blend-mode: normal !important;
                }
                .ground-track-shadow-globe {
                    background: radial-gradient(circle at 50% 40%, #15345c 0%, #0a1525 68%, #060d17 100%);
                }
                .ground-track-shadow-globe canvas {
                    display: block;
                    width: 100% !important;
                    height: 100% !important;
                }
            `;
            shadowRoot.appendChild(style);
        }

        shadowShell = shadowRoot.querySelector(".ground-track-shadow-shell");
        if (!shadowShell) {
            shadowShell = document.createElement("div");
            shadowShell.className = "ground-track-shadow-shell";
            shadowRoot.appendChild(shadowShell);
        }

        mapHost = shadowShell.querySelector(".ground-track-shadow-map");
        if (!mapHost) {
            mapHost = document.createElement("div");
            mapHost.className = "ground-track-shadow-view ground-track-shadow-map";
            shadowShell.appendChild(mapHost);
        }

        globeHost = shadowShell.querySelector(".ground-track-shadow-globe");
        if (!globeHost) {
            globeHost = document.createElement("div");
            globeHost.className = "ground-track-shadow-view ground-track-shadow-globe";
            shadowShell.appendChild(globeHost);
        }

        return shadowShell;
    }

    function ensureMap() {
        if (map) return map;
        const L = window["L"];
        const container = getNode("ground-track-map");
        ensureShadowSurface(container);
        if (!mapHost || !L) return null;

        map = L.map(mapHost, {
            center: DEFAULT_MAP_CENTER,
            zoom: DEFAULT_MAP_ZOOM,
            zoomControl: true,
            attributionControl: true,
            worldCopyJump: true,
            preferCanvas: true,
        });
        tileLayer = L.tileLayer(MAP_TILE_URL, {
            attribution: MAP_TILE_ATTRIBUTION,
            maxZoom: 19,
            minZoom: 1,
            detectRetina: true,
            subdomains: "abcd",
        }).addTo(map);
        trackLayerGroup = L.layerGroup().addTo(map);
        marker = L.circleMarker([0, 0], {
            radius: 5,
            color: "#fff0ba",
            weight: 2,
            fillColor: "#ff9f1a",
            fillOpacity: 0.96,
        }).addTo(map);
        map.on("movestart zoomstart", () => {
            if (isProgrammaticMapViewChange) return;
            hasMapUserView = true;
        });
        return map;
    }

    function ensureGlobe() {
        if (globeState.renderer) return globeState;
        const container = getNode("ground-track-map");
        ensureShadowSurface(container);
        if (!globeHost) return null;

        const width = Math.max(globeHost.clientWidth, 2);
        const height = Math.max(globeHost.clientHeight, 2);
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(width, height, false);
        renderer.domElement.style.width = "100%";
        renderer.domElement.style.height = "100%";
        renderer.domElement.style.display = "block";
        globeHost.replaceChildren(renderer.domElement);

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x08172a);

        const camera = new THREE.PerspectiveCamera(GLOBE_FOV_DEGREES, width / height, 0.1, 100);
        camera.up.copy(GLOBE_VIEW_UP);
        camera.position.set(0, 0, 3.15);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enablePan = false;
        controls.enableDamping = false;
        controls.rotateSpeed = 0.8;
        controls.zoomSpeed = 0.9;
        controls.minDistance = GLOBE_MIN_DISTANCE;
        controls.maxDistance = GLOBE_MAX_DISTANCE;
        controls.minPolarAngle = 0.08;
        controls.maxPolarAngle = Math.PI - 0.08;
        controls.addEventListener("change", () => {
            if (!isProgrammaticGlobeViewChange) {
                hasGlobeUserView = true;
            }
            renderGlobeNow();
        });

        const globeRoot = new THREE.Group();
        scene.add(globeRoot);

        const earthMaterial = new THREE.MeshPhongMaterial({
            color: 0xffffff,
            emissive: 0x081322,
            specular: 0x24364c,
            shininess: 10,
        });
        const earthMesh = new THREE.Mesh(
            new THREE.SphereGeometry(GLOBE_RADIUS, 96, 64),
            earthMaterial,
        );
        globeRoot.add(earthMesh);

        const trackGroup = new THREE.Group();
        globeRoot.add(trackGroup);

        const markerMesh = new THREE.Mesh(
            new THREE.SphereGeometry(0.034, 20, 16),
            new THREE.MeshBasicMaterial({ color: 0xff9f1a }),
        );
        markerMesh.visible = false;
        globeRoot.add(markerMesh);

        const ambient = new THREE.AmbientLight(0xb7d0ef, 0.72);
        scene.add(ambient);
        const keyLight = new THREE.DirectionalLight(0xffffff, 1.08);
        keyLight.position.set(2.4, 1.7, 3.2);
        scene.add(keyLight);
        const fillLight = new THREE.DirectionalLight(0x58779a, 0.42);
        fillLight.position.set(-2.8, -0.8, -1.5);
        scene.add(fillLight);

        globeState.renderer = renderer;
        globeState.scene = scene;
        globeState.camera = camera;
        globeState.controls = controls;
        globeState.globeRoot = globeRoot;
        globeState.earthMesh = earthMesh;
        globeState.trackGroup = trackGroup;
        globeState.markerMesh = markerMesh;

        if (!globeState.texturePromise) {
            globeState.texturePromise = new Promise((resolve) => {
                const loader = new THREE.TextureLoader();
                loader.load(
                    resolveRuntimeAssetUrl(EARTH_TEXTURE_URL),
                    (texture) => {
                        if ("colorSpace" in texture && THREE.SRGBColorSpace) {
                            texture.colorSpace = THREE.SRGBColorSpace;
                        }
                        earthMaterial.map = texture;
                        earthMaterial.needsUpdate = true;
                        renderGlobeNow();
                        resolve(texture);
                    },
                    undefined,
                    () => resolve(null),
                );
            });
        }

        renderGlobeNow();
        return globeState;
    }

    function renderGlobeNow() {
        if (!globeState.renderer || !globeState.scene || !globeState.camera) return;
        globeState.renderer.render(globeState.scene, globeState.camera);
    }

    function resizeGlobe() {
        if (!globeState.renderer || !globeState.camera || !globeHost) return;
        const width = Math.max(globeHost.clientWidth, 2);
        const height = Math.max(globeHost.clientHeight, 2);
        globeState.camera.aspect = width / height;
        globeState.camera.updateProjectionMatrix();
        globeState.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        globeState.renderer.setSize(width, height, false);
        renderGlobeNow();
    }

    function clearMapTrack() {
        trackLayerGroup?.clearLayers();
        if (marker) marker.setStyle({ opacity: 0, fillOpacity: 0 });
    }

    function renderMapTrack(segments, generatedSegments = []) {
        if (!trackLayerGroup || !window["L"]) return;
        trackLayerGroup.clearLayers();
        duplicateWrappedSegments(segments).forEach((segment) => {
            window["L"].polyline(segment, {
                color: GROUND_TRACK_COLOR,
                weight: 2.2,
                opacity: 0.92,
                lineCap: "round",
                lineJoin: "round",
                noClip: true,
            }).addTo(trackLayerGroup);
        });
        duplicateWrappedSegments(generatedSegments).forEach((segment) => {
            window["L"].polyline(segment, {
                color: GROUND_TRACK_GENERATED_COLOR,
                weight: 2.8,
                opacity: 0.98,
                dashArray: "8 6",
                lineCap: "round",
                lineJoin: "round",
                noClip: true,
            }).addTo(trackLayerGroup);
        });
    }

    function fitMapOverviewIfNeeded() {
        if (!map) return;
        isProgrammaticMapViewChange = true;
        map.setView(DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM, { animate: false });
        isProgrammaticMapViewChange = false;
    }

    function centerMapOnLocation(location) {
        if (!map || !location) return;
        const currentCenter = map.getCenter?.();
        const referenceLon = Number.isFinite(currentCenter?.lng) ? currentCenter.lng : 0;
        const centeredLon = wrapLongitudeNearReference(location[1], referenceLon);
        const currentZoom = Number.isFinite(map.getZoom?.()) ? map.getZoom() : DEFAULT_MAP_ZOOM;
        isProgrammaticMapViewChange = true;
        map.setView([location[0], centeredLon], currentZoom, { animate: false });
        isProgrammaticMapViewChange = false;
    }

    function updateMapMarker(location) {
        if (!marker) return;
        if (!location) {
            marker.setStyle({ opacity: 0, fillOpacity: 0 });
            return;
        }
        const referenceLon = map?.getCenter?.().lng ?? 0;
        marker.setLatLng([location[0], wrapLongitudeNearReference(location[1], referenceLon)]);
        marker.setStyle({ opacity: 1, fillOpacity: 0.96 });
    }

    function clearGlobeTrack() {
        if (!globeState.trackGroup) return;
        while (globeState.trackGroup.children.length > 0) {
            const child = globeState.trackGroup.children.pop();
            disposeObject3D(child);
            child?.removeFromParent();
        }
        if (globeState.markerMesh) {
            globeState.markerMesh.visible = false;
        }
        renderGlobeNow();
    }

    function renderGlobeTrack(segments, generatedSegments = []) {
        if (!globeState.trackGroup) return;
        clearGlobeTrack();
        segments.forEach((segment) => {
            if (!Array.isArray(segment) || segment.length < 2) return;
            const points = segment.map(([lat, lon]) => latLonToVector3(lat, lon, GLOBE_TRACK_ALTITUDE));
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const material = new THREE.LineBasicMaterial({
                color: 0x4ec3ff,
                transparent: true,
                opacity: 0.95,
            });
            const line = new THREE.Line(geometry, material);
            globeState.trackGroup.add(line);
        });
        generatedSegments.forEach((segment) => {
            if (!Array.isArray(segment) || segment.length < 2) return;
            const points = segment.map(([lat, lon]) => latLonToVector3(lat, lon, GLOBE_TRACK_ALTITUDE * 1.0008));
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const material = new THREE.LineBasicMaterial({
                color: 0xffb347,
                transparent: true,
                opacity: 1.0,
            });
            const line = new THREE.Line(geometry, material);
            globeState.trackGroup.add(line);
        });
        renderGlobeNow();
    }

    function updateGlobeMarker(location) {
        if (!globeState.markerMesh) return;
        if (!location) {
            globeState.markerMesh.visible = false;
            renderGlobeNow();
            return;
        }
        globeState.markerMesh.position.copy(latLonToVector3(location[0], location[1], GLOBE_MARKER_ALTITUDE));
        globeState.markerMesh.visible = true;
        renderGlobeNow();
    }

    function orientGlobeToTrack(location, segments) {
        if (!globeState.globeRoot) return;
        const points = segments.flat();
        const focusPoint = Array.isArray(location) && location.length === 2
            ? location
            : points[Math.floor(points.length * 0.5)];
        if (!focusPoint) {
            isProgrammaticGlobeViewChange = true;
            globeState.globeRoot.quaternion.identity();
            globeState.camera?.up?.copy?.(GLOBE_VIEW_UP);
            const defaultDistance = Number.isFinite(globeState.camera?.position?.length?.())
                ? clamp(globeState.camera.position.length(), GLOBE_MIN_DISTANCE, GLOBE_MAX_DISTANCE)
                : 3.15;
            globeState.camera.position.set(0, 0, defaultDistance);
            globeState.controls?.update();
            isProgrammaticGlobeViewChange = false;
            renderGlobeNow();
            return;
        }
        const vector = latLonToVector3(focusPoint[0], focusPoint[1]).normalize();
        const quaternion = resolveNorthUpTrackQuaternion(vector);
        const distance = Number.isFinite(globeState.camera?.position?.length?.())
            ? clamp(globeState.camera.position.length(), GLOBE_MIN_DISTANCE, GLOBE_MAX_DISTANCE)
            : 3.15;
        isProgrammaticGlobeViewChange = true;
        globeState.globeRoot.quaternion.copy(quaternion);
        globeState.camera?.up?.copy?.(GLOBE_VIEW_UP);
        globeState.camera.position.set(0, 0, distance);
        globeState.controls?.target.set(0, 0, 0);
        globeState.controls?.update();
        isProgrammaticGlobeViewChange = false;
        renderGlobeNow();
    }

    function zoomGlobe(multiplier) {
        if (!globeState.camera || !globeState.controls) return;
        const offset = globeState.camera.position.clone().sub(globeState.controls.target);
        const nextLength = clamp(offset.length() * multiplier, GLOBE_MIN_DISTANCE, GLOBE_MAX_DISTANCE);
        offset.setLength(nextLength);
        globeState.camera.position.copy(globeState.controls.target.clone().add(offset));
        hasGlobeUserView = true;
        globeState.camera.updateProjectionMatrix();
        globeState.controls.update();
        renderGlobeNow();
    }

    function resolveDefaultPanelPosition(panel) {
        if (!panel) {
            return clampPanelRect({
                x: PANEL_DEFAULT_LEFT_PX,
                y: PANEL_EDGE_MARGIN_PX,
                width: 400,
                height: 320,
            });
        }
        const width = Math.max(panel.offsetWidth || 400, 280);
        const height = Math.max(panel.offsetHeight || 320, 220);
        const timelineHeight = readCssPx("--timeline-dock-height", 88);
        const timelineOffset = readCssPx("--timeline-dock-offset", 10);
        const x = PANEL_DEFAULT_LEFT_PX;
        const y = window.innerHeight - height - timelineHeight - timelineOffset - PANEL_DEFAULT_BOTTOM_GAP_PX;
        return clampPanelRect({ x, y, width, height });
    }

    function resolveComposerPanelRect() {
        const composerPanel = document.querySelector(".aux-camera-view--composer");
        if (!isDomInstance(composerPanel, "HTMLElement")) return null;
        const rect = composerPanel.getBoundingClientRect();
        if (!Number.isFinite(rect.left) || !Number.isFinite(rect.top) || rect.width <= 0 || rect.height <= 0) {
            return null;
        }
        return {
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height,
        };
    }

    function resolveComposerFallbackRect() {
        const maxWidth = Math.max(320, window.innerWidth - (PANEL_EDGE_MARGIN_PX * 2));
        const maxHeight = Math.max(220, window.innerHeight - (PANEL_EDGE_MARGIN_PX * 2));
        let width = Math.min(Math.round(window.innerWidth * 0.52), maxWidth);
        let height = Math.round(width / COMPOSER_PANEL_ASPECT_RATIO);
        if (height > maxHeight) {
            height = maxHeight;
            width = Math.min(maxWidth, Math.round(height * COMPOSER_PANEL_ASPECT_RATIO));
        }
        return {
            x: Math.round((window.innerWidth - width) * 0.5),
            y: Math.round((window.innerHeight - height) * 0.5),
            width,
            height,
        };
    }

    function applyComposerPanelPlacement(panel) {
        if (!panel) return false;
        if (isGroundTrackPanelDocked(panel)) return false;
        const rect = resolveComposerPanelRect() || resolveComposerFallbackRect();
        if (!rect) return false;
        panel.style.width = `${Math.round(rect.width)}px`;
        panel.style.height = `${Math.round(rect.height)}px`;
        applyPanelPosition(panel, rect.x, rect.y);
        return true;
    }

    function clampPanelRect({ x, y, width, height }) {
        const maxX = Math.max(PANEL_EDGE_MARGIN_PX, window.innerWidth - width - PANEL_EDGE_MARGIN_PX);
        const maxY = Math.max(PANEL_EDGE_MARGIN_PX, window.innerHeight - height - PANEL_EDGE_MARGIN_PX);
        return {
            x: clamp(Math.round(x), PANEL_EDGE_MARGIN_PX, maxX),
            y: clamp(Math.round(y), PANEL_EDGE_MARGIN_PX, maxY),
        };
    }

    function applyPanelPosition(panel, x, y) {
        if (!panel) return;
        if (isGroundTrackPanelDocked(panel)) return;
        const width = Math.max(panel.offsetWidth || 400, 280);
        const height = Math.max(panel.offsetHeight || 320, 220);
        const clamped = clampPanelRect({ x, y, width, height });
        panelPosition = clamped;
        panel.style.left = `${clamped.x}px`;
        panel.style.top = `${clamped.y}px`;
    }

    function clampPanelPosition(panel) {
        if (!panel) return;
        if (!panelPosition) {
            const initial = resolveDefaultPanelPosition(panel);
            applyPanelPosition(panel, initial.x, initial.y);
            return;
        }
        applyPanelPosition(panel, panelPosition.x, panelPosition.y);
    }

    function ensurePanelPosition(panel) {
        if (!panel) return;
        if (isGroundTrackPanelDocked(panel)) return;
        if (!panelPosition) {
            const initial = resolveDefaultPanelPosition(panel);
            applyPanelPosition(panel, initial.x, initial.y);
            return;
        }
        clampPanelPosition(panel);
    }

    function shouldStartDrag(event) {
        if (event.button !== 0) return false;
        if (!isDomElement(event.target)) return false;
        return !event.target.closest("button, input, select, option, label, output, a");
    }

    function bindPanelDragging(panel, header) {
        if (!panel || !header) return;

        const onPointerDown = (event) => {
            if (isGroundTrackPanelDocked(panel)) return;
            if (panelExpanded === true) return;
            if (!shouldStartDrag(event)) return;
            const rect = panel.getBoundingClientRect();
            dragState = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                panelX: rect.left,
                panelY: rect.top,
            };
            header.setPointerCapture(event.pointerId);
            event.preventDefault();
        };

        const onPointerMove = (event) => {
            if (!dragState || dragState.pointerId !== event.pointerId) return;
            const dx = event.clientX - dragState.startX;
            const dy = event.clientY - dragState.startY;
            applyPanelPosition(panel, dragState.panelX + dx, dragState.panelY + dy);
        };

        const releaseDrag = (event) => {
            if (!dragState || dragState.pointerId !== event.pointerId) return;
            if (header.hasPointerCapture(event.pointerId)) {
                header.releasePointerCapture(event.pointerId);
            }
            dragState = null;
            persistPanelLayoutState(panel);
        };

        header.addEventListener("pointerdown", onPointerDown);
        header.addEventListener("pointermove", onPointerMove);
        header.addEventListener("pointerup", releaseDrag);
        header.addEventListener("pointercancel", releaseDrag);
    }

    function syncVisibleView() {
        const panel = getNode("ground-track-panel");
        if (!panel || panel.classList.contains("ground-track-panel--hidden")) return;
        const container = getNode("ground-track-map");
        ensureShadowSurface(container);
        updateModeButtons();
        const show2D = panelMode === VIEW_MODE_2D;
        if (mapHost) mapHost.hidden = !show2D;
        if (globeHost) globeHost.hidden = show2D;

        if (show2D) {
            const activeMap = ensureMap();
            if (!activeMap) return;
            activeMap.invalidateSize(false);
            renderMapTrack(currentSegments, currentGeneratedSegments);
            updateMapMarker(currentLocation);
            if (currentLocation) {
                centerMapOnLocation(currentLocation);
            } else {
                fitMapOverviewIfNeeded();
            }
            return;
        }

        ensureGlobe();
        resizeGlobe();
        renderGlobeTrack(currentSegments, currentGeneratedSegments);
        updateGlobeMarker(currentLocation);
        orientGlobeToTrack(currentLocation, currentSegments);
    }

    function scheduleDockedSurfaceResize() {
        if (dockedLayoutResizeFrame) {
            return;
        }
        const schedule = typeof requestAnimationFrame === "function"
            ? requestAnimationFrame
            : (callback) => setTimeout(callback, 0);
        dockedLayoutResizeFrame = schedule(() => {
            dockedLayoutResizeFrame = 0;
            map?.invalidateSize(false);
            resizeGlobe();
        });
    }

    function setViewMode(mode) {
        panelMode = mode === VIEW_MODE_3D ? VIEW_MODE_3D : VIEW_MODE_2D;
        syncVisibleView();
    }

    function setPanelExpanded(expanded, panel = getNode("ground-track-panel")) {
        if (!isDomInstance(panel, "HTMLElement")) {
            return;
        }
        if (isGroundTrackPanelDocked(panel)) {
            panelExpanded = false;
            panel.classList.remove("is-maximized");
            syncExpandButton();
            persistPanelLayoutState(panel);
            syncVisibleView();
            return;
        }
        const nextExpanded = expanded === true;
        if (nextExpanded === panelExpanded) {
            syncExpandButton();
            return;
        }
        if (nextExpanded) {
            restorePanelFrame = capturePanelFrame(panel);
            panelExpanded = true;
            panel.classList.add("is-maximized");
            applyExpandedPanelRect(panel);
        } else {
            panelExpanded = false;
            panel.classList.remove("is-maximized");
            if (restorePanelFrame && restorePanelFrame.width > 0 && restorePanelFrame.height > 0) {
                panel.style.width = `${restorePanelFrame.width}px`;
                panel.style.height = `${restorePanelFrame.height}px`;
                applyPanelPosition(panel, restorePanelFrame.x, restorePanelFrame.y);
            } else {
                ensurePanelPosition(panel);
            }
        }
        syncExpandButton();
        persistPanelLayoutState(panel);
        if (!panel.classList.contains("ground-track-panel--hidden")) {
            map?.invalidateSize(false);
            resizeGlobe();
            syncVisibleView();
        }
    }

    function bringPanelToFront() {
        if (isGroundTrackPanelDocked()) return;
        bringPanelElementToFront(getNode("ground-track-panel-wrapper"));
    }

    function setPanelState(nextState) {
        const previousState = panelVisibilityState;
        const resolvedState = nextState === "minimized"
            ? "closed"
            : (nextState === "deleted"
                ? "deleted"
                : (nextState === "open" ? "open" : "closed"));
        if (resolvedState === "open" && !isSplashdownPanelMissionEnabled(missionConfigData)) {
            syncPanelAvailability(false);
            return;
        }
        panelVisibilityState = resolvedState;
        const panel = getNode("ground-track-panel");
        if (!panel) return;
        const isVisible = resolvedState === "open";
        const shouldMaximizeOnOpen = isVisible && previousState !== "open";
        if (isDockviewGroundTrackPanelEnabled()) {
            if (isVisible) {
                ensureGroundTrackPanelDocked(panel);
            } else if (isGroundTrackPanelDocked(panel)) {
                closeDockedGroundTrackPanel();
            }
        }
        panel.classList.toggle("ground-track-panel--hidden", !isVisible);
        document.dispatchEvent(new CustomEvent("ground-track-panel-visibilitychange", {
            detail: {
                visible: isVisible,
                state: panelVisibilityState,
            },
        }));
        syncPanelRegistry();
        if (!isVisible) {
            persistPanelLayoutState(panel);
            return;
        }
        if (isGroundTrackPanelDocked(panel)) {
            panelExpanded = false;
            panel.classList.remove("is-maximized");
            syncExpandButton();
            persistPanelLayoutState(panel);
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    syncVisibleView();
                });
            });
            return;
        }
        bringPanelToFront();
        if (shouldMaximizeOnOpen && panelExpanded !== true) {
            setPanelExpanded(true, panel);
            return;
        }
        if (panelExpanded === true) {
            panel.classList.add("is-maximized");
            applyExpandedPanelRect(panel);
        } else {
            ensurePanelPosition(panel);
        }
        syncExpandButton();
        persistPanelLayoutState(panel);
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                syncVisibleView();
            });
        });
    }

    function setPanelVisible(visible) {
        setPanelState(visible ? "open" : "closed");
    }

    function scheduleAutoOpenIfNeeded(config) {
        if (autoOpenScheduled || config === "relative" || !shouldAutoOpenSplashdownPanel(missionConfigData)) return;
        if (hasRestoredPanelLayout) return;
        const panel = getNode("ground-track-panel");
        if (!panel) return;
        autoOpenScheduled = true;
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                setPanelVisible(true);
                requestAnimationFrame(() => {
                    applyComposerPanelPlacement(panel);
                    syncVisibleView();
                });
            });
        });
    }

    function ensurePanelEventsBound() {
        if (initialized) return;

        const toggleButton = getNode("ground-track-button");
        const zoomInButton = getNode("ground-track-zoom-in");
        const zoomOutButton = getNode("ground-track-zoom-out");
        const style2dButton = getNode("ground-track-style-2d");
        const style3dButton = getNode("ground-track-style-3d");
        const playButton = getNode("ground-track-play");
        const stepBackSecondButton = getNode("ground-track-step-back-second");
        const stepForwardSecondButton = getNode("ground-track-step-forward-second");
        const stepBackMinuteButton = getNode("ground-track-step-back-minute");
        const stepForwardMinuteButton = getNode("ground-track-step-forward-minute");
        const slowerButton = getNode("ground-track-slower");
        const speedButton = getNode("ground-track-speed");
        const fasterButton = getNode("ground-track-faster");
        const timelineSlider = getNode("ground-track-timeline-slider");
        const panel = getNode("ground-track-panel");
        const header = panel?.querySelector(".ground-track-panel__header");
        const headerControls = panel?.querySelector(".ground-track-panel__header-controls");
        let closeButton = getNode("ground-track-panel-close");
        const minimizeButton = getNode("ground-track-panel-minimize");
        let expandButton = getNode("ground-track-panel-expand");
        let infoButton = getNode("ground-track-panel-info");
        let deleteButton = getNode("ground-track-panel-delete");

        if (!isDomInstance(panel, "HTMLElement")) {
            return;
        }
        initialized = true;

        if (isDomInstance(panel, "HTMLElement")) {
            const persistedWidth = Number(restoredPanelLayout?.width);
            const persistedHeight = Number(restoredPanelLayout?.height);
            if (Number.isFinite(persistedWidth) && persistedWidth > 0) {
                panel.style.width = `${Math.round(persistedWidth)}px`;
            }
            if (Number.isFinite(persistedHeight) && persistedHeight > 0) {
                panel.style.height = `${Math.round(persistedHeight)}px`;
            }
            const persistedX = Number(restoredPanelLayout?.x);
            const persistedY = Number(restoredPanelLayout?.y);
            if (Number.isFinite(persistedX) && Number.isFinite(persistedY)) {
                panelPosition = {
                    x: Math.round(persistedX),
                    y: Math.round(persistedY),
                };
            }
            const persistedState = String(restoredPanelLayout?.state || "").trim().toLowerCase();
            if (persistedState === "open" || persistedState === "minimized" || persistedState === "closed" || persistedState === "deleted") {
                panelVisibilityState = persistedState === "minimized" ? "closed" : persistedState;
                hasRestoredPanelVisibilityState = true;
                defaultPanelStateApplied = true;
            }
            panel.classList.toggle("is-maximized", panelExpanded === true);
        }

        if (!infoButton && isDomInstance(headerControls, "HTMLElement")) {
            infoButton = document.createElement("button");
            infoButton.id = "ground-track-panel-info";
            infoButton.className = "ground-track-panel__icon-button ground-track-panel__info mission-panel-shell__button mission-panel-shell__button--icon";
            infoButton.type = "button";
            infoButton.title = "Info";
            infoButton.setAttribute("aria-label", "Show panel info");
            infoButton.dataset.icon = "info";
            infoButton.textContent = "";
            infoButton.dataset.panelInfoTrigger = "true";
            headerControls.insertBefore(infoButton, closeButton || null);
        }

        if (minimizeButton && typeof minimizeButton.remove === "function") {
            minimizeButton.remove();
        }

        if (!expandButton && isDomInstance(headerControls, "HTMLElement")) {
            expandButton = document.createElement("button");
            expandButton.id = "ground-track-panel-expand";
            expandButton.className = "ground-track-panel__icon-button ground-track-panel__expand mission-panel-shell__button mission-panel-shell__button--icon";
            expandButton.type = "button";
            expandButton.dataset.icon = "expand";
            expandButton.textContent = "";
            if (isDomInstance(closeButton, "HTMLElement")) {
                headerControls.insertBefore(expandButton, closeButton);
            } else {
                headerControls.appendChild(expandButton);
            }
        }

        if (!deleteButton && isDomInstance(headerControls, "HTMLElement")) {
            deleteButton = document.createElement("button");
            deleteButton.id = "ground-track-panel-delete";
            deleteButton.className = "ground-track-panel__delete mission-panel-shell__button mission-panel-shell__button--icon mission-panel-shell__button--danger";
            deleteButton.type = "button";
            deleteButton.title = "Delete";
            deleteButton.setAttribute("aria-label", "Delete");
            deleteButton.dataset.icon = "delete";
            deleteButton.textContent = "";
            headerControls.appendChild(deleteButton);
        }

        bindPanelDragging(panel, header);
        panel?.addEventListener?.("pointerdown", bringPanelToFront, true);
        if (panelVisibilityState === "open" && isDockviewGroundTrackPanelEnabled()) {
            ensureGroundTrackPanelDocked(panel);
        }
        if (isGroundTrackPanelDocked(panel)) {
            panelExpanded = false;
            panel.classList.remove("is-maximized");
        } else if (panelExpanded === true) {
            applyExpandedPanelRect(panel);
        } else {
            clampPanelPosition(panel);
        }
        panel?.classList.toggle("ground-track-panel--hidden", panelVisibilityState !== "open");
        syncExpandButton(expandButton);
        panel?.addEventListener?.("moon-mission:dockview-panel-layout", () => {
            if (panel.classList.contains("ground-track-panel--hidden")) return;
            scheduleDockedSurfaceResize();
        });

        if (toggleButton && panel) {
            toggleButton.addEventListener("click", () => {
                const hidden = panel.classList.contains("ground-track-panel--hidden");
                setPanelVisible(hidden);
            });
        }
        document.addEventListener("ground-track-panel-open", () => {
            setPanelVisible(true);
        });
        infoButton?.addEventListener("click", () => showMissionPanelInfo(GROUND_TRACK_PANEL_REGISTRY_ID, infoButton));
        expandButton?.addEventListener("click", () => setPanelExpanded(panelExpanded !== true, panel));
        closeButton?.addEventListener("click", () => setPanelVisible(false));
        deleteButton?.addEventListener("click", () => confirmDeletePanel());
        playButton?.addEventListener("click", () => {
            clickMainControlButton("animate");
        });
        stepBackSecondButton?.addEventListener("click", () => {
            const slider = getNode("ground-track-timeline-slider");
            const min = Number(slider?.min);
            const value = Number(slider?.value);
            if (!Number.isFinite(min) || !Number.isFinite(value)) return;
            seekMainTimelineTime(Math.max(min, value - 1000), true);
        });
        stepForwardSecondButton?.addEventListener("click", () => {
            const slider = getNode("ground-track-timeline-slider");
            const max = Number(slider?.max);
            const value = Number(slider?.value);
            if (!Number.isFinite(max) || !Number.isFinite(value)) return;
            seekMainTimelineTime(Math.min(max, value + 1000), true);
        });
        stepBackMinuteButton?.addEventListener("click", () => {
            const slider = getNode("ground-track-timeline-slider");
            const min = Number(slider?.min);
            const value = Number(slider?.value);
            if (!Number.isFinite(min) || !Number.isFinite(value)) return;
            seekMainTimelineTime(Math.max(min, value - 60000), true);
        });
        stepForwardMinuteButton?.addEventListener("click", () => {
            const slider = getNode("ground-track-timeline-slider");
            const max = Number(slider?.max);
            const value = Number(slider?.value);
            if (!Number.isFinite(max) || !Number.isFinite(value)) return;
            seekMainTimelineTime(Math.min(max, value + 60000), true);
        });
        slowerButton?.addEventListener("click", () => {
            clickMainControlButton("slower");
        });
        speedButton?.addEventListener("click", () => {
            clickMainControlButton("realtime");
        });
        fasterButton?.addEventListener("click", () => {
            clickMainControlButton("faster");
        });
        if (timelineSlider instanceof HTMLInputElement) {
            timelineSlider.addEventListener("input", () => {
                const value = Number(timelineSlider.value);
                if (!Number.isFinite(value)) return;
                seekMainTimelineTime(value, false);
            });
            timelineSlider.addEventListener("change", () => {
                const value = Number(timelineSlider.value);
                if (!Number.isFinite(value)) return;
                seekMainTimelineTime(value, true);
            });
        }
        zoomInButton?.addEventListener("click", () => {
            if (panelMode === VIEW_MODE_2D) {
                map?.zoomIn();
                hasMapUserView = true;
            } else {
                zoomGlobe(0.86);
            }
        });
        zoomOutButton?.addEventListener("click", () => {
            if (panelMode === VIEW_MODE_2D) {
                map?.zoomOut();
                hasMapUserView = true;
            } else {
                zoomGlobe(1.16);
            }
        });
        style2dButton?.addEventListener("click", () => setViewMode(VIEW_MODE_2D));
        style3dButton?.addEventListener("click", () => setViewMode(VIEW_MODE_3D));

        if (panel && typeof ResizeObserver !== "undefined") {
            resizeObserver = new ResizeObserver(() => {
                if (panel.classList.contains("ground-track-panel--hidden")) return;
                if (isGroundTrackPanelDocked(panel)) {
                    persistPanelLayoutState(panel);
                    scheduleDockedSurfaceResize();
                    return;
                }
                if (panelExpanded === true) {
                    applyExpandedPanelRect(panel);
                } else {
                    clampPanelPosition(panel);
                }
                persistPanelLayoutState(panel);
                map?.invalidateSize(false);
                resizeGlobe();
            });
            resizeObserver.observe(panel);
        }

        window.addEventListener("resize", () => {
            if (!panel) return;
            if (!panel.classList.contains("ground-track-panel--hidden")) {
                if (isGroundTrackPanelDocked(panel)) {
                    persistPanelLayoutState(panel);
                    scheduleDockedSurfaceResize();
                    return;
                }
                if (panelExpanded === true) {
                    applyExpandedPanelRect(panel);
                } else {
                    clampPanelPosition(panel);
                }
                persistPanelLayoutState(panel);
            }
            map?.invalidateSize(false);
            resizeGlobe();
        });

        updateModeButtons();
    }

    function resolveCurrentEarthCenteredVector(sceneState, config, animTime, descriptor = null) {
        const craftId = resolveTelemetryBodyId(sceneState) || resolveGroundTrackCraftId(config);
        const ephemerisSample = resolveEphemerisEarthCenteredSample({
            descriptor,
            timeMs: animTime,
            craftId,
        });
        if (hasVector(ephemerisSample?.vector)) {
            return ephemerisSample.vector;
        }
        const bodies = sceneState?.bodies || {};
        const craftPos = bodies?.[craftId]?.position || null;
        if (!hasVector(craftPos)) return null;
        if (config === "lunar") {
            const earthPos = bodies?.EARTH?.position || null;
            if (!hasVector(earthPos)) return null;
            return subtractVectors(craftPos, earthPos);
        }
        return craftPos;
    }

    function resolveCurrentEarthCenteredVelocity(sceneState, config, animTime, descriptor = null) {
        const craftId = resolveTelemetryBodyId(sceneState) || resolveGroundTrackCraftId(config);
        const ephemerisSample = resolveEphemerisEarthCenteredSample({
            descriptor,
            timeMs: animTime,
            craftId,
        });
        if (hasVector(ephemerisSample?.velocity)) {
            return ephemerisSample.velocity;
        }
        const bodies = sceneState?.bodies || {};
        const craftVel = normalizeVelocityVector(bodies?.[craftId]?.velocity || null);
        if (!hasVector(craftVel)) return null;
        if (config === "lunar") {
            const earthVel = normalizeVelocityVector(bodies?.EARTH?.velocity || null);
            if (!hasVector(earthVel)) return null;
            return subtractVectors(craftVel, earthVel);
        }
        return craftVel;
    }

    function resolveEarthDistanceKm(sceneState, config, earthCenteredVector) {
        const telemetry = sceneState?.telemetry || null;
        if (Number.isFinite(telemetry?.distanceEarth)) {
            return telemetry.distanceEarth;
        }
        if (config === "geo" && Number.isFinite(telemetry?.distancePrimary)) {
            return telemetry.distancePrimary;
        }
        return magnitude(earthCenteredVector);
    }

    function resolveEarthVelocityKmPerSec(sceneState, config, earthCenteredVelocity) {
        const telemetry = sceneState?.telemetry || null;
        if (Number.isFinite(telemetry?.velocityEarth)) {
            return telemetry.velocityEarth;
        }
        if (config === "geo" && Number.isFinite(telemetry?.velocityPrimary)) {
            return telemetry.velocityPrimary;
        }
        return magnitude(earthCenteredVelocity);
    }

    function resolveEarthAltitudeKm(sceneState, config, earthDistanceKm) {
        const telemetry = sceneState?.telemetry || null;
        if (Number.isFinite(earthDistanceKm)) {
            return earthDistanceKm - EARTH_REFERENCE_RADIUS_KM;
        }
        if (Number.isFinite(telemetry?.altitudeEarth)) {
            return telemetry.altitudeEarth;
        }
        if (config === "geo" && Number.isFinite(telemetry?.altitudePrimary)) {
            return telemetry.altitudePrimary;
        }
        return Number.NaN;
    }

    function resolveTrackSegments(config, relativeFrameActive = isRelativeFrameActive(config)) {
        if (config !== "geo" && config !== "lunar") {
            return {
                key: `${config}:none`,
                segments: [],
                generatedSegments: [],
                sourceEndMs: Number.NaN,
            };
        }
        const scene = window.animationScenes?.[config];
        if (!scene) {
            return {
                key: `${config}:none`,
                segments: [],
                generatedSegments: [],
                sourceEndMs: Number.NaN,
            };
        }
        const craftId = scene.activeCraftId || scene.primaryCraftId || "SC";
        const craftCurve = scene.curvesById?.[craftId] || [];
        const craftTimes = scene.curveTimesById?.[craftId] || [];
        if (!Array.isArray(craftTimes) || craftTimes.length < 2) {
            return {
                key: `${config}:${craftId}:empty`,
                segments: [],
                generatedSegments: [],
                sourceEndMs: Number.NaN,
            };
        }
        const descriptor = resolveGroundTrackChebyshevDescriptor(config, relativeFrameActive);
        if ((relativeFrameActive || config === "lunar") && !descriptor) {
            return {
                key: `${config}:${relativeFrameActive ? "relative" : "inertial"}:${craftId}:pending`,
                segments: [],
                generatedSegments: [],
                sourceEndMs: Number.NaN,
                loading: true,
            };
        }
        const useEphemerisTrackData = !!descriptor;
        if (!useEphemerisTrackData && (!Array.isArray(craftCurve) || craftCurve.length < 2)) {
            return {
                key: `${config}:${craftId}:empty`,
                segments: [],
                generatedSegments: [],
                sourceEndMs: Number.NaN,
            };
        }
        if (useEphemerisTrackData) {
            const craftData = getLoadedTrackChebyshevData(descriptor.craftUrl);
            const geoSupportData = getLoadedTrackChebyshevData(descriptor.geoSupportUrl);
            if (!craftData || !geoSupportData) {
                ensureTrackDescriptorLoaded(descriptor);
                return {
                    key: `${descriptor.key}:loading`,
                    segments: [],
                    generatedSegments: [],
                    sourceEndMs: Number.NaN,
                    loading: true,
                };
            }
        }
        const count = Math.min(craftTimes.length, useEphemerisTrackData ? craftTimes.length : craftCurve.length);
        const windowBounds = resolveGroundTrackWindowMs(missionConfigData, config);
        const provenance = resolvePostHorizonExtension(missionConfigData, config);
        const sourceEndMs = provenance?.sourceEndMs;
        const startMs = windowBounds.startMs;
        const endMs = Number.isFinite(craftTimes[count - 1]) ? craftTimes[count - 1] : windowBounds.endMs;
        const key = `${config}:${relativeFrameActive ? "relative" : "inertial"}:${craftId}:${count}:${descriptor?.key || "scene"}:${Number.isFinite(startMs) ? startMs : "na"}:${Number.isFinite(endMs) ? endMs : "na"}:${Number.isFinite(sourceEndMs) ? sourceEndMs : "na"}`;
        if (cacheByKey.has(key)) return { key, ...cacheByKey.get(key) };

        const points = [];
        let lastLocation = null;
        for (let i = 0; i < count; i += 1) {
            const timeMs = craftTimes[i];
            if (!Number.isFinite(timeMs)) continue;
            if (Number.isFinite(startMs) && timeMs < startMs) continue;
            if (Number.isFinite(endMs) && timeMs > endMs) continue;
            let earthCentered = null;
            if (useEphemerisTrackData) {
                earthCentered = resolveEphemerisEarthCenteredSample({
                    descriptor,
                    timeMs,
                    craftId,
                })?.vector || null;
            } else {
                const craft = craftCurve[i];
                if (!hasVector(craft)) continue;
                earthCentered = craft;
            }
            if (!hasVector(earthCentered)) continue;
            const latLon = eciToLatLonDegrees(earthCentered, timeMs);
            if (!latLon) continue;
            points.push({
                lat: latLon[0],
                lon: latLon[1],
                timeMs,
            });
            lastLocation = latLon;
        }
        const unwrappedPoints = unwrapTimedTrackPoints(points);
        const segments = timedPointsToSegments(unwrappedPoints);
        const generatedSegments = resolveGeneratedTrackSegments(unwrappedPoints, sourceEndMs);
        const result = {
            segments,
            generatedSegments,
            lastLocation,
            startMs,
            endMs,
            sourceEndMs,
        };
        cacheByKey.set(key, result);
        return { key, ...result };
    }

    function clearTrackVisuals() {
        currentSegments = [];
        currentGeneratedSegments = [];
        currentLocation = null;
        currentTrackKey = "";
        clearMapTrack();
        clearGlobeTrack();
    }

    function renderPayload({ sceneState, config, animTime }) {
        if (!sceneState || !Number.isFinite(animTime) || !config) return;

        const relativeFrameActive = isRelativeFrameActive(config);

        const {
            key,
            segments,
            generatedSegments,
            lastLocation,
            startMs,
            endMs,
            sourceEndMs,
            loading = false,
        } = resolveTrackSegments(config, relativeFrameActive);
        if (key !== currentTrackKey) {
            currentTrackKey = key;
            currentSegments = segments;
            currentGeneratedSegments = generatedSegments;
            hasMapUserView = false;
            hasGlobeUserView = false;
        }
        if (loading === true) {
            clearTrackVisuals();
            setStatus("Loading ground track trajectory...");
            setProvenanceNote({ visible: false, badgeText: "", text: "", active: false });
            setCoords("--");
            syncTimelineCardUi(config, animTime, Number.NaN, Number.NaN);
            updateInfoStrip({
                earthDistanceKm: Number.NaN,
                earthSpeedKmPerSec: Number.NaN,
                earthAltitudeKm: Number.NaN,
                location: null,
            });
            syncVisibleView();
            return;
        }
        const provenance = resolvePostHorizonExtension(missionConfigData, config);
        const generatedSegmentActive = Number.isFinite(sourceEndMs) && animTime > sourceEndMs;
        setProvenanceNote({
            visible: !!provenance,
            badgeText: provenance?.shortLabel || "Generated final descent",
            text: buildGeneratedSegmentNote(provenance),
            active: generatedSegmentActive,
        });

        const descriptor = resolveGroundTrackChebyshevDescriptor(config, relativeFrameActive);
        const vector = resolveCurrentEarthCenteredVector(sceneState, config, animTime, descriptor);
        const velocity = resolveCurrentEarthCenteredVelocity(sceneState, config, animTime, descriptor);
        const earthDistanceKm = resolveEarthDistanceKm(sceneState, config, vector);
        const earthSpeedKmPerSec = resolveEarthVelocityKmPerSec(sceneState, config, velocity);
        const earthAltitudeKm = resolveEarthAltitudeKm(sceneState, config, earthDistanceKm);
        const liveLocation = eciToLatLonDegrees(vector, animTime);
        if (Number.isFinite(startMs) && animTime < startMs) {
            currentLocation = null;
            setStatus("Ground track window starts at RTC-3.");
            setCoords("--");
        } else if (Number.isFinite(endMs) && animTime > endMs) {
            currentLocation = lastLocation || null;
            setStatus("Ground track window ends after the modeled splashdown continuation.");
            setCoords(formatLatLonPair(currentLocation));
        } else if (!liveLocation) {
            currentLocation = null;
            setStatus("Current ground location unavailable.");
            setCoords("--");
        } else {
            currentLocation = liveLocation;
            setStatus(generatedSegmentActive
                ? "Current marker is on the modeled post-HORIZONS splashdown continuation."
                : "Ground track window: RTC-3 to splashdown.");
            setCoords(formatLatLonPair(currentLocation));
        }

        updateInfoStrip({
            earthDistanceKm,
            earthSpeedKmPerSec,
            earthAltitudeKm,
            location: currentLocation,
        });
        syncTimelineCardUi(config, animTime, startMs, endMs);
        syncVisibleView();
    }

    function update({ sceneState, config, animTime }) {
        const panelEnabled = isSplashdownPanelMissionEnabled(missionConfigData);
        syncPanelAvailability(panelEnabled);
        if (!panelEnabled) {
            latestPayload = null;
            clearTrackVisuals();
            return;
        }
        ensurePanelEventsBound();
        scheduleAutoOpenIfNeeded(config);
        latestPayload = { sceneState, config, animTime };
        if (!missionConfigReady && !missionConfigPromise) {
            ensureMissionConfigData().then(() => {
                cacheByKey.clear();
                currentTrackKey = "";
                if (latestPayload) {
                    scheduleAutoOpenIfNeeded(latestPayload.config);
                }
                if (latestPayload) {
                    renderPayload(latestPayload);
                }
            });
        }
        if (missionConfigReady) {
            scheduleAutoOpenIfNeeded(config);
        }
        renderPayload(latestPayload);
    }

    registerMissionPanel({
        id: GROUND_TRACK_PANEL_REGISTRY_ID,
        title: "Splashdown in Spotlight",
        kind: "workflow",
        panelType: "splashdown",
        builtIn: true,
        available: isSplashdownPanelMissionEnabled(missionConfigData),
        state: getPanelRegistryState(),
        sortOrder: 50,
        actions: {},
    });
    syncPanelRegistry();

    return { update, setPanelVisible };
}

export { createGroundTrackPanelActions, shouldAutoOpenSplashdownPanel };
