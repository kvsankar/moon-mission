import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { resolveRuntimeAssetUrl } from "../core/domain/runtime-asset-url.js";
import { MAP_TILE_URL, MAP_TILE_ATTRIBUTION, LEAFLET_CSS_URL, EARTH_TEXTURE_URL, DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM, GROUND_TRACK_COLOR, GROUND_TRACK_GENERATED_COLOR, GLOBE_RADIUS, GLOBE_TRACK_ALTITUDE, GLOBE_MARKER_ALTITUDE, GLOBE_MIN_DISTANCE, GLOBE_MAX_DISTANCE, GLOBE_FOV_DEGREES, GLOBE_VIEW_UP } from "./ground-track-config.js";
import { clamp, duplicateWrappedSegments, wrapLongitudeNearReference } from "./ground-track-geometry.js";
import { latLonToVector3, resolveNorthUpTrackQuaternion, disposeObject3D } from "./ground-track-primitives.js";

export function createGroundTrackSurface({ getNode }) {
    let map = null;
    let tileLayer = null;
    let marker = null;
    let trackLayerGroup = null;
    let shadowRoot = null;
    let shadowShell = null;
    let mapHost = null;
    let globeHost = null;
    let hasMapUserView = false;
    let hasGlobeUserView = false;
    let isProgrammaticMapViewChange = false;
    let isProgrammaticGlobeViewChange = false;
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

    return {
        ensureShadowSurface,
        ensureMap,
        ensureGlobe,
        resizeGlobe,
        clearMapTrack,
        renderMapTrack,
        fitMapOverviewIfNeeded,
        centerMapOnLocation,
        updateMapMarker,
        clearGlobeTrack,
        renderGlobeTrack,
        updateGlobeMarker,
        orientGlobeToTrack,
        zoomGlobe,
        getMap: () => map,
        getMapHost: () => mapHost,
        getGlobeHost: () => globeHost,
        setMapUserView: (value) => { hasMapUserView = value === true; },
        setGlobeUserView: (value) => { hasGlobeUserView = value === true; },
    };
}
