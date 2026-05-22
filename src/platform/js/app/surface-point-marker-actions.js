const SURFACE_POINT_MARKER_DEFINITIONS = Object.freeze({
    subSolarEarth: {
        body: "earth",
        color: 0xffd34d,
        shadow: 0x151207,
        radiusScale: 0.038,
        maxRadiusScale: 0.030,
    },
    subSolarMoon: {
        body: "moon",
        color: 0xffdc62,
        shadow: 0x161408,
        radiusScale: 0.052,
        maxRadiusScale: 0.040,
    },
    subMoonEarth: {
        body: "earth",
        color: 0xd7dee8,
        shadow: 0x101318,
        radiusScale: 0.036,
        maxRadiusScale: 0.028,
    },
    subCraftEarth: {
        body: "earth",
        color: 0x2fe7ff,
        shadow: 0x061419,
        radiusScale: 0.034,
        maxRadiusScale: 0.027,
    },
    subCraftMoon: {
        body: "moon",
        color: 0x36eaff,
        shadow: 0x061419,
        radiusScale: 0.048,
        maxRadiusScale: 0.038,
    },
    solarGlintEarth: {
        body: "earth",
        color: 0xfff0a6,
        shadow: 0x161102,
        radiusScale: 0.15,
        maxRadiusScale: 0.050,
        glint: true,
    },
    lunarGlintEarth: {
        body: "earth",
        color: 0xe7ecf4,
        shadow: 0x11151d,
        radiusScale: 0.12,
        maxRadiusScale: 0.046,
        glint: true,
    },
    antiSolarEarth: {
        body: "earth",
        color: 0xffd34d,
        shadow: 0x151207,
        radiusScale: 0.038,
        maxRadiusScale: 0.030,
    },
    antiSolarMoon: {
        body: "moon",
        color: 0xffdc62,
        shadow: 0x161408,
        radiusScale: 0.052,
        maxRadiusScale: 0.040,
    },
    antiMoonEarth: {
        body: "earth",
        color: 0xd7dee8,
        shadow: 0x101318,
        radiusScale: 0.036,
        maxRadiusScale: 0.028,
    },
    antiCraftEarth: {
        body: "earth",
        color: 0x2fe7ff,
        shadow: 0x061419,
        radiusScale: 0.034,
        maxRadiusScale: 0.027,
    },
    antiCraftMoon: {
        body: "moon",
        color: 0x36eaff,
        shadow: 0x061419,
        radiusScale: 0.048,
        maxRadiusScale: 0.038,
    },
});

const SURFACE_POINT_VISIBILITY_KEYS = Object.freeze({
    subSolarEarth: "viewSubSolarEarth",
    subSolarMoon: "viewSubSolarMoon",
    subMoonEarth: "viewSubMoonEarth",
    subCraftEarth: "viewSubCraftEarth",
    subCraftMoon: "viewSubCraftMoon",
    solarGlintEarth: "viewSolarGlintEarth",
    lunarGlintEarth: "viewLunarGlintEarth",
});

const SURFACE_POINT_GROUP_NAME = "surface-point-markers";
const SURFACE_POINT_SURFACE_SCALE = 1.006;
const SURFACE_POINT_MIN_RADIUS = 0.012;
const SURFACE_POINT_DEFAULT_MAX_RADIUS_SCALE = 0.030;
const GLINT_MARKER_KEYS = Object.freeze(["solarGlintEarth", "lunarGlintEarth"]);
const GLINT_ANIMATION_PERIOD_MS = 1800;
const LOCAL_Z = Object.freeze({ x: 0, y: 0, z: 1 });
const GLINT_FLECKS = Object.freeze([
    { radius: 0.24, opacity: 0.16 },
    { radius: 0.18, opacity: 0.20 },
    { radius: 0.12, opacity: 0.24 },
]);

function disposeObjectTree(object) {
    const textures = new Set();
    object?.traverse?.((node) => {
        node.geometry?.dispose?.();
        if (Array.isArray(node.material)) {
            node.material.forEach((material) => {
                if (material?.map) textures.add(material.map);
                material?.dispose?.();
            });
        } else {
            if (node.material?.map) textures.add(node.material.map);
            node.material?.dispose?.();
        }
    });
    textures.forEach((texture) => texture?.dispose?.());
}

function colorToRgb(color) {
    return {
        r: (color >> 16) & 255,
        g: (color >> 8) & 255,
        b: color & 255,
    };
}

function colorToRgba(color, alpha) {
    const { r, g, b } = colorToRgb(color);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function createSoftGlintTexture(THREE, color, { fleck = false } = {}) {
    if (
        typeof document === "undefined" ||
        typeof document.createElement !== "function" ||
        typeof THREE?.CanvasTexture !== "function"
    ) {
        return null;
    }
    const size = 192;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext?.("2d");
    if (!context) return null;

    const center = size / 2;
    context.clearRect(0, 0, size, size);
    context.save();
    context.translate(center, center);
    const radius = fleck ? 74 : 88;
    const gradient = context.createRadialGradient(0, 0, 0, 0, 0, radius);
    gradient.addColorStop(0, colorToRgba(0xffffff, fleck ? 0.78 : 0.92));
    gradient.addColorStop(0.16, colorToRgba(0xffffff, fleck ? 0.42 : 0.62));
    gradient.addColorStop(0.40, colorToRgba(color, fleck ? 0.18 : 0.30));
    gradient.addColorStop(0.74, colorToRgba(color, fleck ? 0.05 : 0.09));
    gradient.addColorStop(1, colorToRgba(color, 0));
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(0, 0, radius, 0, Math.PI * 2);
    context.fill();
    context.restore();

    const texture = new THREE.CanvasTexture(canvas);
    if (THREE.SRGBColorSpace) {
        texture.colorSpace = THREE.SRGBColorSpace;
    }
    texture.needsUpdate = true;
    return texture;
}

function normalizeVector(THREE, candidate) {
    const vector = new THREE.Vector3(
        Number(candidate?.x),
        Number(candidate?.y),
        Number(candidate?.z),
    );
    if (!Number.isFinite(vector.x) || !Number.isFinite(vector.y) || !Number.isFinite(vector.z)) {
        return null;
    }
    if (vector.lengthSq() <= 1e-18) {
        return null;
    }
    return vector.normalize();
}

function directionBetween(THREE, from, to) {
    if (!from || !to) return null;
    return normalizeVector(THREE, {
        x: to.x - from.x,
        y: to.y - from.y,
        z: to.z - from.z,
    });
}

function glintDirection(THREE, lightDirection, observerDirection) {
    const light = normalizeVector(THREE, lightDirection);
    const observer = normalizeVector(THREE, observerDirection);
    if (!light || !observer) return null;
    const halfVector = light.clone().add(observer);
    return normalizeVector(THREE, halfVector);
}

function getWorldPosition(THREE, object) {
    if (!object?.getWorldPosition) return null;
    const vector = new THREE.Vector3();
    object.getWorldPosition(vector);
    return vector;
}

function getBodyTarget(scene, body) {
    return body === "moon" ? scene?.moonContainer : scene?.earthContainer;
}

function getBodyRadius(scene, body) {
    const radius = body === "moon"
        ? Number(scene?.moonRenderer?.radius)
        : Number(scene?.earthRenderer?.radius);
    if (Number.isFinite(radius) && radius > 0) {
        return radius;
    }
    const mesh = body === "moon" ? scene?.moon : scene?.earth;
    const geometry = mesh?.geometry;
    if (!geometry) return 1;
    if (!geometry.boundingSphere) {
        geometry.computeBoundingSphere?.();
    }
    const sphereRadius = Number(geometry.boundingSphere?.radius);
    return Number.isFinite(sphereRadius) && sphereRadius > 0 ? sphereRadius : 1;
}

function resolveMarkerRadius(bodyRadius, definition = {}) {
    const requestedRadius = bodyRadius * Number(definition.radiusScale);
    const maxRadiusScale = Number.isFinite(Number(definition.maxRadiusScale))
        ? Number(definition.maxRadiusScale)
        : SURFACE_POINT_DEFAULT_MAX_RADIUS_SCALE;
    const cappedRadius = bodyRadius * maxRadiusScale;
    return Math.max(
        SURFACE_POINT_MIN_RADIUS,
        Math.min(
            Number.isFinite(requestedRadius) && requestedRadius > 0 ? requestedRadius : SURFACE_POINT_MIN_RADIUS,
            Number.isFinite(cappedRadius) && cappedRadius > 0 ? cappedRadius : SURFACE_POINT_MIN_RADIUS,
        ),
    );
}

function createSurfacePointMarker(THREE, key, definition) {
    const root = new THREE.Group();
    root.name = `surface-point-marker-${key}`;
    root.visible = false;
    root.userData.surfacePointMarkerKey = key;

    const baseMaterialOptions = {
        transparent: true,
        depthTest: true,
        depthWrite: false,
        toneMapped: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
    };
    const glintMaterialOptions = {
        ...baseMaterialOptions,
        blending: THREE.AdditiveBlending,
    };

    if (definition.glint) {
        const softTexture = createSoftGlintTexture(THREE, definition.color);
        const fleckTexture = createSoftGlintTexture(THREE, definition.color, { fleck: true });
        const washMaterial = new THREE.MeshBasicMaterial({
            ...glintMaterialOptions,
            color: definition.color,
            map: softTexture,
            opacity: 0.10,
        });
        const glowMaterial = new THREE.MeshBasicMaterial({
            ...glintMaterialOptions,
            color: definition.color,
            map: softTexture,
            opacity: 0.18,
        });
        const coreMaterial = new THREE.MeshBasicMaterial({
            ...glintMaterialOptions,
            color: 0xffffff,
            map: softTexture,
            opacity: 0.32,
        });

        const wash = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 2.5), washMaterial);
        wash.name = `${key}-glint-wash`;
        wash.position.z = 0.0024;
        wash.scale.setScalar(1);
        wash.renderOrder = 34;

        const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.42, 1.42), glowMaterial);
        glow.name = `${key}-glint-soft-glow`;
        glow.position.z = 0.0032;
        glow.scale.setScalar(1);
        glow.renderOrder = 35;

        const core = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 0.76), coreMaterial);
        core.name = `${key}-glint-soft-core`;
        core.position.z = 0.004;
        core.scale.setScalar(1);
        core.renderOrder = 36;

        const fleckRoot = new THREE.Group();
        fleckRoot.name = `${key}-glint-flecks`;
        fleckRoot.position.z = 0.0048;
        const flecks = GLINT_FLECKS.map((fleck, index) => {
            const material = new THREE.MeshBasicMaterial({
                ...glintMaterialOptions,
                color: index === 3 ? 0xffffff : definition.color,
                map: fleckTexture,
                opacity: fleck.opacity,
            });
            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(fleck.radius * 2, fleck.radius * 2), material);
            mesh.name = `${key}-glint-fleck-${index}`;
            mesh.position.set(0, 0, 0);
            mesh.scale.setScalar(1);
            mesh.renderOrder = 37;
            fleckRoot.add(mesh);
            return mesh;
        });

        root.add(wash);
        root.add(glow);
        root.add(core);
        root.add(fleckRoot);
        root.userData.surfacePointGlintParts = {
            wash,
            glow,
            core,
            fleckRoot,
            flecks,
        };
        return root;
    }

    const shadowMaterial = new THREE.MeshBasicMaterial({
        ...baseMaterialOptions,
        color: definition.shadow,
        opacity: 0.68,
    });
    const colorMaterial = new THREE.MeshBasicMaterial({
        ...baseMaterialOptions,
        color: definition.color,
        opacity: 0.88,
    });
    const dotMaterial = new THREE.MeshBasicMaterial({
        ...baseMaterialOptions,
        color: definition.color,
        opacity: 0.92,
    });

    const shadowRing = new THREE.Mesh(new THREE.RingGeometry(0.64, 1.08, 48), shadowMaterial);
    shadowRing.name = `${key}-shadow-ring`;
    shadowRing.renderOrder = 31;
    const colorRing = new THREE.Mesh(new THREE.RingGeometry(0.72, 0.98, 48), colorMaterial);
    colorRing.name = `${key}-color-ring`;
    colorRing.position.z = 0.0008;
    colorRing.renderOrder = 32;
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.16, 32), dotMaterial);
    dot.name = `${key}-dot`;
    dot.position.z = 0.0016;
    dot.renderOrder = 33;

    root.add(shadowRing);
    root.add(colorRing);
    root.add(dot);
    return root;
}

function normalizeVisibility(view = {}) {
    const normalized = {};
    for (const [markerKey, viewKey] of Object.entries(SURFACE_POINT_VISIBILITY_KEYS)) {
        normalized[markerKey] = Boolean(view?.[viewKey]);
    }
    return normalized;
}

function anyVisible(visibility = {}) {
    return Object.values(visibility).some(Boolean);
}

function getTimeMs() {
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
        return performance.now();
    }
    return Date.now();
}

function hasVisibleGlintMarker(scene) {
    return GLINT_MARKER_KEYS.some((key) => scene?.surfacePointMarkers?.[key]?.visible === true);
}

function animateGlintMarkers(scene, timeMs = getTimeMs()) {
    const phase = (timeMs % GLINT_ANIMATION_PERIOD_MS) / GLINT_ANIMATION_PERIOD_MS;
    const wave = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);
    const counterWave = 0.5 + 0.5 * Math.sin((phase * Math.PI * 2) + Math.PI * 0.72);

    for (const key of GLINT_MARKER_KEYS) {
        const marker = scene?.surfacePointMarkers?.[key];
        const parts = marker?.userData?.surfacePointGlintParts;
        if (!marker?.visible || !parts) continue;

        parts.wash.rotation.z = Math.sin(phase * Math.PI * 2) * 0.08;
        parts.wash.scale.setScalar(0.96 + counterWave * 0.08);
        parts.wash.material.opacity = 0.06 + counterWave * 0.08;

        parts.glow.rotation.z = -0.16 + Math.sin((phase * Math.PI * 2) + 0.6) * 0.07;
        parts.glow.scale.setScalar(0.92 + wave * 0.14);
        parts.glow.material.opacity = 0.12 + wave * 0.14;

        parts.core.rotation.z = 0.22 + Math.sin((phase * Math.PI * 2) + 1.4) * 0.10;
        parts.core.scale.setScalar(0.90 + counterWave * 0.12);
        parts.core.material.opacity = 0.22 + wave * 0.20;

        parts.fleckRoot.rotation.z = Math.sin((phase * Math.PI * 2) + 0.35) * 0.12;
        parts.flecks.forEach((fleck, index) => {
            const fleckWave = 0.5 + 0.5 * Math.sin((phase * Math.PI * 2) + index * 0.83);
            fleck.material.opacity = GLINT_FLECKS[index].opacity * (0.42 + fleckWave * 0.9);
            fleck.scale.setScalar(0.82 + fleckWave * 0.18);
        });
    }
}

export function createSurfacePointMarkerActions({ THREE, render }) {
    const localZVector = new THREE.Vector3(LOCAL_Z.x, LOCAL_Z.y, LOCAL_Z.z);
    const worldQuaternion = new THREE.Quaternion();
    const inverseWorldQuaternion = new THREE.Quaternion();
    const markerNormal = new THREE.Vector3();

    function ensureSurfacePointMarkerLayer({ scene }) {
        if (!scene?.earthContainer && !scene?.moonContainer) return null;
        if (!scene.surfacePointMarkerGroup) {
            scene.surfacePointMarkerGroup = new THREE.Group();
            scene.surfacePointMarkerGroup.name = SURFACE_POINT_GROUP_NAME;
            scene.surfacePointMarkers = {};
        }

        for (const [key, definition] of Object.entries(SURFACE_POINT_MARKER_DEFINITIONS)) {
            if (scene.surfacePointMarkers?.[key]) continue;
            const target = getBodyTarget(scene, definition.body);
            if (!target) continue;
            const marker = createSurfacePointMarker(THREE, key, definition);
            scene.surfacePointMarkers[key] = marker;
            target.add(marker);
        }

        scene.surfacePointMarkerGroup.visible = anyVisible(scene.surfacePointMarkerVisibility);
        return scene.surfacePointMarkerGroup;
    }

    function addSurfacePointMarkers({ scene }) {
        ensureSurfacePointMarkerLayer({ scene });
    }

    function disposeSurfacePointMarkers({ scene }) {
        if (!scene) return;
        stopGlintAnimationLoop(scene);
        for (const marker of Object.values(scene.surfacePointMarkers || {})) {
            marker?.parent?.remove?.(marker);
            disposeObjectTree(marker);
        }
        scene.surfacePointMarkers = {};
        scene.surfacePointMarkerGroup = null;
    }

    function stopGlintAnimationLoop(scene) {
        const frameId = scene?.surfacePointMarkerAnimationFrame;
        if (frameId && typeof globalThis?.cancelAnimationFrame === "function") {
            globalThis.cancelAnimationFrame(frameId);
        }
        if (scene) {
            scene.surfacePointMarkerAnimationFrame = null;
        }
    }

    function syncGlintAnimationLoop(scene) {
        if (!scene) return;
        if (!hasVisibleGlintMarker(scene)) {
            stopGlintAnimationLoop(scene);
            return;
        }
        if (scene.surfacePointMarkerAnimationFrame) return;
        if (typeof globalThis?.requestAnimationFrame !== "function") return;

        const tick = (timeMs) => {
            scene.surfacePointMarkerAnimationFrame = null;
            if (!hasVisibleGlintMarker(scene)) {
                return;
            }
            animateGlintMarkers(scene, timeMs);
            render?.();
            syncGlintAnimationLoop(scene);
        };
        scene.surfacePointMarkerAnimationFrame = globalThis.requestAnimationFrame(tick);
    }

    function setSurfacePointMarkersVisible({ scene, view, renderNow = true }) {
        if (!scene) return;
        scene.surfacePointMarkerVisibility = normalizeVisibility(view);
        ensureSurfacePointMarkerLayer({ scene });
        for (const marker of Object.values(scene.surfacePointMarkers || {})) {
            marker.visible = false;
        }
        updateSurfacePointMarkers({
            scene,
            sunDirections: scene.stateSunDirections || scene.latestSceneState?.sunDirections || null,
            craftId: scene.activeCraftId || scene.primaryCraftId || "SC",
        });
        if (renderNow !== false) {
            render?.();
        }
    }

    function setMarkerFromDirection({ scene, key, direction }) {
        const marker = scene?.surfacePointMarkers?.[key];
        const definition = SURFACE_POINT_MARKER_DEFINITIONS[key];
        const target = getBodyTarget(scene, definition?.body);
        if (!marker || !definition || !target) return;
        if (!scene.surfacePointMarkerVisibility?.[key]) {
            marker.visible = false;
            return;
        }

        const worldDirection = normalizeVector(THREE, direction);
        if (!worldDirection) {
            marker.visible = false;
            return;
        }

        target.updateMatrixWorld?.(true);
        target.getWorldQuaternion(worldQuaternion);
        inverseWorldQuaternion.copy(worldQuaternion).invert();
        markerNormal.copy(worldDirection).applyQuaternion(inverseWorldQuaternion);
        if (markerNormal.lengthSq() <= 1e-18) {
            marker.visible = false;
            return;
        }
        markerNormal.normalize();

        const bodyRadius = getBodyRadius(scene, definition.body);
        const markerRadius = resolveMarkerRadius(bodyRadius, definition);
        marker.position.copy(markerNormal).multiplyScalar(bodyRadius * SURFACE_POINT_SURFACE_SCALE);
        marker.quaternion.setFromUnitVectors(localZVector, markerNormal);
        marker.scale.setScalar(markerRadius);
        marker.visible = true;
    }

    function updateSurfacePointMarkers({
        scene,
        sunDirections = null,
        craftId = "SC",
    } = {}) {
        if (!scene || !anyVisible(scene.surfacePointMarkerVisibility)) {
            for (const marker of Object.values(scene?.surfacePointMarkers || {})) {
                marker.visible = false;
            }
            stopGlintAnimationLoop(scene);
            return;
        }
        ensureSurfacePointMarkerLayer({ scene });

        const earthWorld = getWorldPosition(THREE, scene.earthContainer);
        const moonWorld = getWorldPosition(THREE, scene.moonContainer);
        const activeCraftId = craftId || scene.activeCraftId || scene.primaryCraftId || "SC";
        const craftObject = scene.craftsById?.[activeCraftId] || scene.craft || Object.values(scene.craftsById || {})[0] || null;
        const craftWorld = getWorldPosition(THREE, craftObject);
        const latestSunDirections = scene.latestSceneState?.sunDirections || null;
        const earthSunDirection = normalizeVector(
            THREE,
            sunDirections?.earthCentered
                || scene.stateSunDirections?.earthCentered
                || latestSunDirections?.earthCentered
                || scene.latestSceneState?.sunDirection
                || scene.stateSunDirection,
        );
        const moonSunDirection = normalizeVector(
            THREE,
            sunDirections?.moonCentered
                || scene.stateSunDirections?.moonCentered
                || latestSunDirections?.moonCentered
                || earthSunDirection,
        );
        const earthToMoonDirection = directionBetween(THREE, earthWorld, moonWorld);
        const earthToCraftDirection = directionBetween(THREE, earthWorld, craftWorld);
        const moonToCraftDirection = directionBetween(THREE, moonWorld, craftWorld);

        setMarkerFromDirection({
            scene,
            key: "subSolarEarth",
            direction: earthSunDirection,
        });
        setMarkerFromDirection({
            scene,
            key: "subSolarMoon",
            direction: moonSunDirection,
        });
        setMarkerFromDirection({
            scene,
            key: "subMoonEarth",
            direction: earthToMoonDirection,
        });
        setMarkerFromDirection({
            scene,
            key: "subCraftEarth",
            direction: earthToCraftDirection,
        });
        setMarkerFromDirection({
            scene,
            key: "subCraftMoon",
            direction: moonToCraftDirection,
        });
        setMarkerFromDirection({
            scene,
            key: "solarGlintEarth",
            direction: glintDirection(THREE, earthSunDirection, earthToCraftDirection),
        });
        setMarkerFromDirection({
            scene,
            key: "lunarGlintEarth",
            direction: glintDirection(THREE, earthToMoonDirection, earthToCraftDirection),
        });

        setMarkerFromDirection({
            scene,
            key: "antiSolarEarth",
            direction: earthSunDirection ? earthSunDirection.clone().multiplyScalar(-1) : null,
        });
        setMarkerFromDirection({
            scene,
            key: "antiSolarMoon",
            direction: moonSunDirection ? moonSunDirection.clone().multiplyScalar(-1) : null,
        });
        setMarkerFromDirection({
            scene,
            key: "antiMoonEarth",
            direction: earthToMoonDirection ? earthToMoonDirection.clone().multiplyScalar(-1) : null,
        });
        setMarkerFromDirection({
            scene,
            key: "antiCraftEarth",
            direction: earthToCraftDirection ? earthToCraftDirection.clone().multiplyScalar(-1) : null,
        });
        setMarkerFromDirection({
            scene,
            key: "antiCraftMoon",
            direction: moonToCraftDirection ? moonToCraftDirection.clone().multiplyScalar(-1) : null,
        });

        animateGlintMarkers(scene);
        syncGlintAnimationLoop(scene);
    }

    return {
        addSurfacePointMarkers,
        disposeSurfacePointMarkers,
        setSurfacePointMarkersVisible,
        updateSurfacePointMarkers,
    };
}
