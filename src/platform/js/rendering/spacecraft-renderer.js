/**
 * Spacecraft Renderer - Spacecraft and drone visualization
 *
 * Manages spacecraft visualization with two modes:
 * - Simple geometric representation (truncated pyramid with edges)
 * - GLTF model loading for detailed spacecraft models
 *
 * Also manages a drone camera target (simple cube)
 * All spacecraft objects use layer 1 for separate lighting
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { LIGHT_SETTINGS as LT } from '../core/constants.js';

const SPACECRAFT_MODEL_PLUGIN_BUILDERS = Object.freeze({
    "orion": "createProceduralOrion",
    "orion-procedural": "createProceduralOrion",
});

// Hotfix gate: keep craft locator edge overlay disabled without removing implementation.
const SPACECRAFT_EDGE_LOCATOR_ENABLED = false;

export class SpacecraftRenderer {
    /**
     * @param {THREE.Object3D} parentContainer - Container to add spacecraft to
     * @param {number} size - Base size for spacecraft geometry
     * @param {number} color - Spacecraft color
     */
    constructor(parentContainer, size, color, options = {}) {
        this.parentContainer = parentContainer;
        this.size = size;
        this.color = color;
        this.edgeColor = Number.isFinite(options?.edgeColor)
            ? options.edgeColor
            : 0xFF8000;
        this.droneColor = Number.isFinite(options?.droneColor)
            ? options.droneColor
            : 0xffffff;

        // Main spacecraft group
        this.craft = null;
        this.craftInner = null;
        this.craftEdges = null;
        this.axesHelper = null;
        this.visible = true;

        // Drone (camera target)
        this.drone = null;

        // Model lights (for GLTF mode)
        this.modelLights = [];

        // Orion solar-array tracking state
        this.solarArrayTrackers = [];
        this.solarArrayAutoTrack = false;
        this._solarTrackSunWorld = new THREE.Vector3();
        this._solarTrackSunCraft = new THREE.Vector3();
        this._solarTrackSunBase = new THREE.Vector3();
        this._solarTrackCraftWorldQuat = new THREE.Quaternion();
        this._solarTrackCraftInvWorldQuat = new THREE.Quaternion();

        // Optional body-attitude correction applied after lookAt.
        // Needed when model forward axis != Three.js default forward (-Z).
        this.attitudeOffsetQuaternion = new THREE.Quaternion();
        this.hasAttitudeOffset = false;
        this.gltfLoaderFactory = typeof options?.gltfLoaderFactory === "function"
            ? options.gltfLoaderFactory
            : () => new GLTFLoader();
        this.modelLoadGeneration = 0;
    }

    /**
     * Create simple geometric spacecraft
     */
    createSimple() {
        this.solarArrayTrackers = [];
        this.solarArrayAutoTrack = false;
        this.attitudeOffsetQuaternion.identity();
        this.hasAttitudeOffset = false;

        // Truncated pyramid geometry
        const geometry = new THREE.CylinderGeometry(
            this.size * 0.8 / Math.sqrt(2),
            this.size * 1.0 / Math.sqrt(2),
            this.size * 0.8,
            4, 1
        );
        const material = new THREE.MeshPhongMaterial({
            color: this.color,
            transparent: false,
            opacity: 1.0
        });

        this.craftInner = new THREE.Mesh(geometry, material);

        // Add edge wireframe
        const edgesGeometry = new THREE.EdgesGeometry(geometry);
        this.craftEdges = new THREE.LineSegments(
            edgesGeometry,
            new THREE.LineBasicMaterial({ color: this.edgeColor })
        );
        this.craftEdges.visible = SPACECRAFT_EDGE_LOCATOR_ENABLED;
        this.craftInner.add(this.craftEdges);

        // Orient correctly
        this.craftInner.rotateX(Math.PI / 2);  // Top points to Z
        this.craftInner.rotateY(Math.PI / 4);  // Correct side orientation
        this.craftInner.layers.set(1);

        // Create craft group
        this.craft = new THREE.Group();
        this.craft.add(this.craftInner);

        // Add axes helper
        this.axesHelper = new THREE.AxesHelper(10);
        this.axesHelper.position.copy(this.craftInner.position);
        this.axesHelper.visible = false;
        this.craft.add(this.axesHelper);

        this.craft.layers.set(1);
        this.craft.visible = this.visible;

        this.parentContainer.add(this.craft);

        // Create drone
        this._createDrone();
    }

    /**
     * Create drone (simple cube for camera target)
     * @private
     */
    _createDrone() {
        const geometry = new THREE.BoxGeometry(this.size, this.size, this.size);
        const material = new THREE.MeshLambertMaterial({ color: this.droneColor });

        this.drone = new THREE.Mesh(geometry, material);
        this.drone.layers.set(1);
        this.drone.visible = false;

        this.parentContainer.add(this.drone);
    }

    /**
     * Create a craft from a named plugin model.
     * Falls back to createSimple() if plugin is unknown.
     * @param {string} pluginName
     * @param {Object} pluginOptions
     */
    createFromPlugin(pluginName, pluginOptions = {}) {
        const normalizedName = typeof pluginName === "string"
            ? pluginName.trim().toLowerCase()
            : "";
        const methodName = SPACECRAFT_MODEL_PLUGIN_BUILDERS[normalizedName];
        if (!methodName || typeof this[methodName] !== "function") {
            if (normalizedName) {
                console.warn(`Unknown spacecraft model plugin '${pluginName}', falling back to simple craft.`);
            }
            this.createSimple();
            return;
        }
        this[methodName](pluginOptions);
    }

    /**
     * Procedural Orion silhouette model (capsule + service module + solar arrays).
     * @param {Object} pluginOptions
     */
    createProceduralOrion(pluginOptions = {}) {
        const scale = Number.isFinite(pluginOptions?.scale) && pluginOptions.scale > 0
            ? pluginOptions.scale
            : 1;
        const size = this.size * scale;
        this.solarArrayTrackers = [];
        this.solarArrayAutoTrack = pluginOptions?.autoTrackSun !== false;
        this.attitudeOffsetQuaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI * 0.5);
        this.hasAttitudeOffset = true;

        const capsuleColor = Number.isFinite(pluginOptions?.capsuleColor)
            ? pluginOptions.capsuleColor
            : 0x667a98;
        const adapterColor = Number.isFinite(pluginOptions?.adapterColor)
            ? pluginOptions.adapterColor
            : 0xe7eaee;
        const serviceColor = Number.isFinite(pluginOptions?.serviceColor)
            ? pluginOptions.serviceColor
            : 0xd8dde5;
        const nozzleColor = Number.isFinite(pluginOptions?.nozzleColor)
            ? pluginOptions.nozzleColor
            : 0x6f7887;
        const windowColor = Number.isFinite(pluginOptions?.windowColor)
            ? pluginOptions.windowColor
            : 0x1e2f4a;
        const panelColor = Number.isFinite(pluginOptions?.panelColor)
            ? pluginOptions.panelColor
            : 0xcfd6df;
        const panelFrameColor = Number.isFinite(pluginOptions?.panelFrameColor)
            ? pluginOptions.panelFrameColor
            : 0x8a93a1;

        const craftInner = new THREE.Group();

        // Crew module frustum (Orion capsule)
        const capsuleLength = 2.18 * size;
        const capsuleBaseRadius = 0.94 * size;
        const capsuleNoseRadius = 0.36 * size;
        const capsuleGeometry = new THREE.CylinderGeometry(
            capsuleNoseRadius,
            capsuleBaseRadius,
            capsuleLength,
            56,
            1,
            false,
        );
        const capsuleMaterial = new THREE.MeshStandardMaterial({
            color: capsuleColor,
            roughness: 0.36,
            metalness: 0.56,
        });
        const capsuleMesh = new THREE.Mesh(capsuleGeometry, capsuleMaterial);
        capsuleMesh.rotation.z = -Math.PI / 2;
        capsuleMesh.position.x = 1.27 * size;
        craftInner.add(capsuleMesh);

        // White crew module adapter ring
        const adapterGeometry = new THREE.CylinderGeometry(
            1.08 * size,
            1.08 * size,
            0.60 * size,
            56,
            1,
            false,
        );
        const adapterMaterial = new THREE.MeshStandardMaterial({
            color: adapterColor,
            roughness: 0.64,
            metalness: 0.1,
        });
        const adapterMesh = new THREE.Mesh(adapterGeometry, adapterMaterial);
        adapterMesh.rotation.z = -Math.PI / 2;
        adapterMesh.position.x = 0.16 * size;
        craftInner.add(adapterMesh);

        // Docking hatch / forward ring
        const hatchOuter = new THREE.Mesh(
            new THREE.TorusGeometry(0.33 * size, 0.045 * size, 20, 48),
            new THREE.MeshStandardMaterial({
                color: 0xd6dbe2,
                roughness: 0.44,
                metalness: 0.5,
            }),
        );
        hatchOuter.rotation.y = Math.PI / 2;
        hatchOuter.position.x = 2.36 * size;
        craftInner.add(hatchOuter);

        const hatchInner = new THREE.Mesh(
            new THREE.CircleGeometry(0.29 * size, 36),
            new THREE.MeshStandardMaterial({
                color: 0x4d5868,
                roughness: 0.4,
                metalness: 0.45,
            }),
        );
        hatchInner.rotation.y = Math.PI / 2;
        hatchInner.position.x = 2.36 * size;
        craftInner.add(hatchInner);

        // Side windows / sensor ports
        const windowMaterial = new THREE.MeshStandardMaterial({
            color: windowColor,
            roughness: 0.2,
            metalness: 0.72,
        });
        for (let i = 0; i < 6; i += 1) {
            const angle = (i * Math.PI) / 3 + Math.PI / 6;
            const windowMesh = new THREE.Mesh(
                new THREE.SphereGeometry(0.12 * size, 16, 12),
                windowMaterial,
            );
            windowMesh.position.set(
                1.82 * size,
                Math.cos(angle) * 0.42 * size,
                Math.sin(angle) * 0.42 * size,
            );
            craftInner.add(windowMesh);
        }

        // European service module
        const serviceLength = 1.92 * size;
        const serviceRadius = 0.84 * size;
        const serviceGeometry = new THREE.CylinderGeometry(
            serviceRadius,
            serviceRadius,
            serviceLength,
            44,
            1,
            false,
        );
        const serviceMaterial = new THREE.MeshStandardMaterial({
            color: serviceColor,
            roughness: 0.58,
            metalness: 0.26,
        });
        const serviceMesh = new THREE.Mesh(serviceGeometry, serviceMaterial);
        serviceMesh.rotation.z = -Math.PI / 2;
        serviceMesh.position.x = -1.10 * size;
        craftInner.add(serviceMesh);

        // Subtle service-module panel banding
        const bandMaterial = new THREE.MeshStandardMaterial({
            color: 0xc4cad3,
            roughness: 0.66,
            metalness: 0.2,
        });
        for (let i = 0; i < 7; i += 1) {
            const band = new THREE.Mesh(
                new THREE.TorusGeometry(serviceRadius * 1.005, 0.010 * size, 10, 48),
                bandMaterial,
            );
            band.rotation.y = Math.PI / 2;
            band.position.x = (-1.88 + i * 0.26) * size;
            craftInner.add(band);
        }

        // Aft skirt and main engine nozzle
        const aftSkirtMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(0.72 * size, 0.72 * size, 0.24 * size, 30, 1, false),
            new THREE.MeshStandardMaterial({
                color: 0xc1c7d1,
                roughness: 0.64,
                metalness: 0.24,
            }),
        );
        aftSkirtMesh.rotation.z = -Math.PI / 2;
        aftSkirtMesh.position.x = -2.18 * size;
        craftInner.add(aftSkirtMesh);

        const nozzleMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(0.32 * size, 0.20 * size, 0.62 * size, 32, 1, true),
            new THREE.MeshStandardMaterial({
                color: nozzleColor,
                roughness: 0.35,
                metalness: 0.62,
                side: THREE.DoubleSide,
            }),
        );
        nozzleMesh.rotation.z = -Math.PI / 2;
        nozzleMesh.position.x = -2.58 * size;
        craftInner.add(nozzleMesh);

        // Four articulated solar wings (90° apart, rotated by 45°)
        const arrayHubX = -1.26 * size;
        const panelSegmentLength = 1.16 * size;
        const panelWidth = 0.56 * size;
        const panelThickness = 0.035 * size;
        const hingeGap = 0.055 * size;
        const panelGeometry = new THREE.BoxGeometry(panelSegmentLength, panelWidth, panelThickness);
        const panelMaterial = new THREE.MeshStandardMaterial({
            color: panelColor,
            roughness: 0.72,
            metalness: 0.1,
        });
        const panelInsetMaterial = new THREE.MeshStandardMaterial({
            color: 0xe4e9ef,
            roughness: 0.66,
            metalness: 0.08,
        });
        const hingeMaterial = new THREE.MeshStandardMaterial({
            color: panelFrameColor,
            roughness: 0.56,
            metalness: 0.34,
        });
        const strutGeometry = new THREE.CylinderGeometry(
            0.026 * size,
            0.026 * size,
            1,
            12,
            1,
            false,
        );
        const strutMaterial = new THREE.MeshStandardMaterial({
            color: 0x757e8e,
            roughness: 0.52,
            metalness: 0.34,
        });
        const xAxis = new THREE.Vector3(1, 0, 0);
        for (let i = 0; i < 4; i += 1) {
            const angle = Math.PI / 4 + i * Math.PI * 0.5;
            const radial = new THREE.Vector3(0, Math.cos(angle), Math.sin(angle));
            const arrayBase = new THREE.Group();
            arrayBase.position.set(
                arrayHubX,
                radial.y * (serviceRadius * 0.98),
                radial.z * (serviceRadius * 0.98),
            );
            arrayBase.quaternion.setFromUnitVectors(xAxis, radial);
            craftInner.add(arrayBase);

            const arrayTilt = new THREE.Group();
            arrayBase.add(arrayTilt);

            const rootHub = new THREE.Mesh(
                new THREE.CylinderGeometry(0.07 * size, 0.07 * size, 0.18 * size, 16),
                hingeMaterial,
            );
            rootHub.rotation.z = -Math.PI / 2;
            arrayTilt.add(rootHub);

            const strutLength = 0.30 * size;
            const strut = new THREE.Mesh(strutGeometry, strutMaterial);
            strut.scale.y = strutLength;
            strut.rotation.z = -Math.PI / 2;
            strut.position.x = strutLength * 0.5;
            arrayTilt.add(strut);

            for (let segment = 0; segment < 3; segment += 1) {
                const segmentOffset = serviceRadius + 0.12 * size
                    + panelSegmentLength * (segment + 0.5)
                    + hingeGap * segment;

                const panel = new THREE.Mesh(panelGeometry, panelMaterial);
                panel.position.x = segmentOffset;
                arrayTilt.add(panel);

                const panelInset = new THREE.Mesh(
                    new THREE.BoxGeometry(
                        panelSegmentLength * 0.9,
                        panelWidth * 0.8,
                        panelThickness * 0.52,
                    ),
                    panelInsetMaterial,
                );
                panelInset.position.x = segmentOffset;
                panelInset.position.z = 0.002 * size;
                arrayTilt.add(panelInset);

                if (segment < 2) {
                    const hinge = new THREE.Mesh(
                        new THREE.BoxGeometry(0.06 * size, panelWidth * 0.88, 0.055 * size),
                        hingeMaterial,
                    );
                    const hingeOffset = serviceRadius + 0.12 * size
                        + panelSegmentLength * (segment + 1)
                        + hingeGap * (segment + 0.5);
                    hinge.position.x = hingeOffset;
                    arrayTilt.add(hinge);
                }
            }

            this.solarArrayTrackers.push({
                baseInvQuaternion: arrayBase.quaternion.clone().invert(),
                tiltGroup: arrayTilt,
                currentTilt: 0,
            });
        }

        this.craft = new THREE.Group();
        this.craftInner = craftInner;
        this.craft.add(this.craftInner);

        this.axesHelper = new THREE.AxesHelper(10);
        this.axesHelper.position.copy(this.craftInner.position);
        this.axesHelper.visible = false;
        this.craft.add(this.axesHelper);

        this._setLayerRecursive(this.craftInner, 1);
        this.craft.layers.set(1);
        this.craft.visible = this.visible;
        this.parentContainer.add(this.craft);

        this._createDrone();
    }

    /**
     * Rotate Orion solar arrays so their panel normals face the sun.
     * @param {{x:number,y:number,z:number}} sunDirection - Direction from craft toward sun
     */
    updateSolarArrayTracking(sunDirection) {
        if (!this.solarArrayAutoTrack || !this.solarArrayTrackers.length) {
            return;
        }
        const x = Number(sunDirection?.x);
        const y = Number(sunDirection?.y);
        const z = Number(sunDirection?.z);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
            return;
        }

        const sunWorld = this._solarTrackSunWorld.set(x, y, z);
        const sunNorm = sunWorld.length();
        if (!Number.isFinite(sunNorm) || sunNorm <= 1e-10) {
            return;
        }
        sunWorld.multiplyScalar(1 / sunNorm);

        const craft = this.craft;
        if (!craft) {
            return;
        }

        craft.getWorldQuaternion(this._solarTrackCraftWorldQuat);
        this._solarTrackCraftInvWorldQuat
            .copy(this._solarTrackCraftWorldQuat)
            .invert();
        const sunCraft = this._solarTrackSunCraft
            .copy(sunWorld)
            .applyQuaternion(this._solarTrackCraftInvWorldQuat);

        for (const tracker of this.solarArrayTrackers) {
            const tiltGroup = tracker?.tiltGroup;
            const baseInvQuaternion = tracker?.baseInvQuaternion;
            if (!tiltGroup || !baseInvQuaternion) {
                continue;
            }

            // Compute sun in static wing-base local coordinates. This avoids
            // frame-dependent drift from using the already-tilted frame.
            const localSun = this._solarTrackSunBase
                .copy(sunCraft)
                .applyQuaternion(baseInvQuaternion);
            const yzNorm = Math.hypot(localSun.y, localSun.z);
            if (yzNorm > 1e-8) {
                tracker.currentTilt = Math.atan2(-localSun.y, localSun.z);
            }
            // Enforce a strict 1-DOF hinge rotation for solar tracking.
            tiltGroup.rotation.set(tracker.currentTilt || 0, 0, 0);
        }
    }

    /**
     * Load GLTF spacecraft model
     * @param {string} modelPath - Path to GLTF/GLB file
     * @returns {Promise} Resolves when model is loaded
     */
    async loadModel(modelPath) {
        const generation = ++this.modelLoadGeneration;
        this.solarArrayTrackers = [];
        this.solarArrayAutoTrack = false;
        this.attitudeOffsetQuaternion.identity();
        this.hasAttitudeOffset = false;
        return new Promise((resolve, reject) => {
            const loader = this.gltfLoaderFactory();

            loader.load(
                modelPath,
                (gltf) => {
                    if (generation !== this.modelLoadGeneration) {
                        this._disposeLoadedModelGraph(gltf?.scene);
                        resolve({ status: "superseded" });
                        return;
                    }
                    this.craft = new THREE.Group();
                    this.craftInner = gltf.scene;
                    this.craftInner.rotateX(Math.PI / 2);  // Top points to Z

                    // Calculate bounding box for light positioning
                    const bbox = new THREE.Box3().setFromObject(this.craftInner);
                    const maxSide = Math.max(
                        bbox.max.x - bbox.min.x,
                        bbox.max.y - bbox.min.y,
                        bbox.max.z - bbox.min.z
                    );

                    // Set all children to layer 1
                    this._setLayerRecursive(this.craftInner, 1);

                    this.craft.add(this.craftInner);

                    // Add axes helper
                    this.axesHelper = new THREE.AxesHelper(10);
                    this.axesHelper.position.copy(this.craftInner.position);
                    this.axesHelper.visible = true;
                    this.craft.add(this.axesHelper);

                    this.craft.layers.set(1);
                    this.craft.visible = this.visible;

                    // Add 6 directional lights around the model
                    this._addModelLights(maxSide);

                    this.parentContainer.add(this.craft);

                    resolve({ status: "ready" });
                },
                undefined,
                (error) => {
                    console.error('Failed to load spacecraft model:', error);
                    reject(error);
                }
            );
        });
    }

    _disposeLoadedModelGraph(root) {
        root?.traverse?.((child) => {
            const node = /** @type {any} */ (child);
            node.geometry?.dispose?.();
            if (Array.isArray(node.material)) node.material.forEach(material => material?.dispose?.());
            else node.material?.dispose?.();
        });
    }

    /**
     * Recursively set layer for object and all children
     * @private
     */
    _setLayerRecursive(object, layer) {
        object.layers.set(layer);
        object.children.forEach(child => this._setLayerRecursive(child, layer));
    }

    /**
     * Add 6 directional lights around the model for illumination
     * @private
     */
    _addModelLights(bboxSize) {
        const intensity = 2;
        const scale = 0.6;
        const distance = scale * bboxSize;

        const positions = [
            [+distance, 0, 0],
            [0, +distance, 0],
            [0, 0, +distance],
            [-distance, 0, 0],
            [0, -distance, 0],
            [0, 0, -distance]
        ];

        for (const pos of positions) {
            const light = new THREE.DirectionalLight(LT.PRIMARY_COLOR, intensity);
            light.layers.set(1);
            light.position.set(pos[0], pos[1], pos[2]);
            this.craft.add(light);
            this.modelLights.push(light);
        }
    }

    /**
     * Set visibility of spacecraft
     * @param {boolean} visible
     */
    setVisible(visible) {
        this.visible = visible;
        if (this.craft) {
            this.craft.visible = visible;
        }
    }

    /**
     * Set visibility of axes helper
     * @param {boolean} visible
     */
    setAxesVisible(visible) {
        if (this.axesHelper) {
            this.axesHelper.visible = visible;
        }
    }

    /**
     * Set visibility of drone
     * @param {boolean} visible
     */
    setDroneVisible(visible) {
        if (this.drone) {
            this.drone.visible = visible;
        }
    }

    /**
     * Dispose simple spacecraft
     */
    dispose() {
        this.modelLoadGeneration += 1;
        if (this.craft) {
            // Dispose craft inner geometry and material
            if (this.craftInner) {
                const craftInner = /** @type {any} */ (this.craftInner);
                if (craftInner.geometry) {
                    craftInner.geometry.dispose();
                }
                if (craftInner.material) {
                    craftInner.material.dispose();
                }
            }

            // Dispose edges
            if (this.craftEdges) {
                const craftEdges = /** @type {any} */ (this.craftEdges);
                if (craftEdges.geometry) {
                    craftEdges.geometry.dispose();
                }
                if (craftEdges.material) {
                    craftEdges.material.dispose();
                }
            }

            // Dispose axes helper
            if (this.axesHelper) {
                this.axesHelper.dispose();
            }

            this.parentContainer.remove(this.craft);
            this.craft = null;
            this.craftInner = null;
            this.craftEdges = null;
            this.axesHelper = null;
        }

        // Dispose drone
        if (this.drone) {
            const drone = /** @type {any} */ (this.drone);
            if (drone.geometry) {
                drone.geometry.dispose();
            }
            if (drone.material) {
                drone.material.dispose();
            }
            this.parentContainer.remove(this.drone);
            this.drone = null;
        }

        this.visible = false;
        this.solarArrayTrackers = [];
        this.solarArrayAutoTrack = false;
    }

    getAttitudeOffsetQuaternion() {
        return this.hasAttitudeOffset ? this.attitudeOffsetQuaternion : null;
    }

    /**
     * Dispose GLTF model spacecraft
     */
    disposeModel() {
        this.modelLoadGeneration += 1;
        if (this.craft) {
            // Dispose model lights
            for (const light of this.modelLights) {
                light.dispose();
                this.craft.remove(light);
            }
            this.modelLights = [];

            // Dispose geometry and materials recursively
            this.craft.traverse((child) => {
                const node = /** @type {any} */ (child);
                if (node.geometry) {
                    node.geometry.dispose();
                }
                if (node.material) {
                    if (Array.isArray(node.material)) {
                        node.material.forEach((material) => material.dispose());
                    } else {
                        node.material.dispose();
                    }
                }
            });

            // Dispose axes helper
            if (this.axesHelper) {
                this.axesHelper.dispose();
                this.axesHelper = null;
            }

            // Remove from parent
            if (this.craft.parent) {
                this.craft.parent.remove(this.craft);
            }

            this.craft = null;
            this.craftInner = null;
        }

        this.visible = false;
        this.solarArrayTrackers = [];
        this.solarArrayAutoTrack = false;
    }
}
