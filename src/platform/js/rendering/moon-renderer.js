// @ts-nocheck
import { replaceTextureOwner, updateTextureOwner, detachTextureOwner } from "./texture-ownership.js";
import { MOON_RENDER_PIPELINE_SCHEMA_VERSION, normalizeMoonRenderPipelineState } from "../app/moon-render-pipeline.js";
import * as THREE from "three";
import { COLORS as COL, PHYSICS_CONSTANTS as PC } from "../core/constants.js";
import { lunar_pole } from "../astro.js";
import { resolveMoonLightingModelStages } from "../app/moon-lighting-models.js";
import { buildMoonNormalMapFromHeightTexture } from "./moon-normal-map.js";
import {
    createMoonLatLonGrid,
    createMoonLatLonHoverLabel,
    MOON_LAT_LON_GRID_DEFAULT_STEP_DEGREES,
    MOON_LAT_LON_GRID_LABEL_RADIUS_SCALE,
    MOON_LAT_LON_LABEL_MIN_SCREEN_RADIUS_PX,
    renderMoonLongitudeToDisplayLongitude,
    normalizeMoonLatLonGridStep,
    resolveMoonLatLonGridStepFromScreenRadius,
    resolveMoonHoverCoordinateDecimals,
    formatMoonHoverCoordinate,
    resolveLatitudeLabelAnchor,
    resolveLongitudeLabelAnchor,
    resolveHoverLabelOffsetPosition,
    replaceCanvasTextSpriteMaterial,
    disposeObjectMaterialAndGeometry,
} from "./moon-lat-lon-overlay.js";
import {
    DEFAULT_MOON_RENDER_SETTINGS,
    normalizeMoonRenderSettings,
    applyMoonRenderSettingsToMaterial,
    resolvePipelineRenderSettings,
    applyMoonPipelineStagesToMaterial,
    applyMoonPhotometricShader,
} from "./moon-material.js";

/** Moon sphere, texture lifetime, body orientation and overlay visibility. */
const MOON_GEOMETRY_WIDTH_SEGMENTS = 512;
const MOON_GEOMETRY_HEIGHT_SEGMENTS = 512;

export class MoonRenderer {
    /**
     * @param {number} radius - Moon radius in scene units
     */
    constructor(radius) {
        this.radius = radius;

        // Container and meshes
        this.container = null;
        this.mesh = null;
        this.axis = null;
        this.axisVector = null;  // Normalized axis direction
        this.northPoleSphere = null;
        this.southPoleSphere = null;
        this.latLonGrid = null;
        this.latLonLabels = null;
        this.latLonHoverLabel = null;
        this.latLonGridStepDegrees = MOON_LAT_LON_GRID_DEFAULT_STEP_DEGREES;
        this.latLonGridVisible = false;
        this.latLonLabelsVisible = true;
        this.latLonHoverEnabled = false;
        this.latLonRaycaster = new THREE.Raycaster();
        this.latLonPointerNdc = new THREE.Vector2();
        this.latLonHoverPoint = new THREE.Vector3();

        // Textures (set externally before create())
        this.texture = null;
        this.displacementMap = null;
        this.normalMap = null;
        this.generatedNormalMap = null;
        this.generatedNormalMapMode = null;
        this.generatedNormalMapRefreshGeneration = 0;
        this.generatedNormalMapIdleHandle = null;
        this.renderSettings = { ...DEFAULT_MOON_RENDER_SETTINGS };
        this.renderPipeline = normalizeMoonRenderPipelineState();
        this.requestRender = null;
    }

    _resolveGeneratedNormalMapMode() { return "physical-spherical"; }

    _resolveEffectivePipeline() {
        return resolveMoonLightingModelStages(this.renderPipeline);
    }

    _resolveDemTexture() { return this.displacementMap; }

    _buildGeneratedNormalMap() {
        const normalMode = this._resolveGeneratedNormalMapMode();
        const pipeline = this._resolveEffectivePipeline();
        const preparedPhysicalNormal = normalMode === "physical-spherical"
            ? this.displacementMap?.userData?.physicalNormalTexture
            : null;
        if (pipeline.generatedNormalMap && !this.normalMap && preparedPhysicalNormal) {
            return preparedPhysicalNormal;
        }
        return (pipeline.generatedNormalMap && !this.normalMap && this._hasUsableDem())
            ? buildMoonNormalMapFromHeightTexture(this._resolveDemTexture(), {
                ...this.renderSettings,
                physicalNormalHeightScale: normalMode === "physical-spherical"
                    ? this.renderSettings.physicalNormalHeightScale
                    : 0.0,
            })
            : null;
    }

    _hasUsableDem() {
        const width = Number(this.displacementMap?.image?.width);
        const height = Number(this.displacementMap?.image?.height);
        return Number.isFinite(width) && width > 1 && Number.isFinite(height) && height > 1;
    }

    _refreshGeneratedNormalMap({ disposePrevious = true } = {}) {
        return updateTextureOwner(this, () => this._textureInputs(), () => {
            this.generatedNormalMap = this._buildGeneratedNormalMap();
            this.generatedNormalMapMode = this.generatedNormalMap
                ? this._resolveGeneratedNormalMapMode()
                : null;

            return this._resolveNormalMap();
        }, { disposePrevious });
    }

    _cancelScheduledGeneratedNormalMapRefresh() {
        this.generatedNormalMapRefreshGeneration += 1;
        if (
            this.generatedNormalMapIdleHandle != null &&
            typeof globalThis.cancelIdleCallback === "function"
        ) {
            globalThis.cancelIdleCallback(this.generatedNormalMapIdleHandle);
        }
        this.generatedNormalMapIdleHandle = null;
    }

    _scheduleGeneratedNormalMapRefresh() {
        this._cancelScheduledGeneratedNormalMapRefresh();
        const generation = this.generatedNormalMapRefreshGeneration;
        const refresh = () => {
            this.generatedNormalMapIdleHandle = null;
            if (
                generation !== this.generatedNormalMapRefreshGeneration ||
                !this.mesh ||
                this.normalMap ||
                !this._hasUsableDem()
            ) {
                return;
            }
            const desiredMode = this._resolveGeneratedNormalMapMode();
            if (!this._resolveEffectivePipeline().generatedNormalMap) {
                return;
            }
            this._refreshGeneratedNormalMap({ disposePrevious: true });
            if (this.generatedNormalMapMode !== desiredMode) {
                return;
            }
            this._applyPipelineMapsToMaterial();
            this._applyRenderSettingsToMaterial();
            replaceTextureOwner(this, this._textureInputs());
            this.requestRender?.();
        };
        if (typeof globalThis.requestIdleCallback === "function") {
            this.generatedNormalMapIdleHandle = globalThis.requestIdleCallback(refresh, {
                timeout: 750,
            });
        } else {
            refresh();
        }
    }

    _resolveNormalMap() {
        if (!this._resolveEffectivePipeline().generatedNormalMap) {
            return null;
        }
        return this.normalMap || this.generatedNormalMap || null;
    }

    _resolveGeometrySegments() {
        const pipeline = this._resolveEffectivePipeline();
        const widthSegments = this.renderSettings.physicalGeometryWidthSegments;
        const heightSegments = this.renderSettings.physicalGeometryHeightSegments;
        return {
            width: THREE.MathUtils.clamp(
                Math.round(widthSegments),
                32,
                1024,
            ),
            height: THREE.MathUtils.clamp(
                Math.round(heightSegments),
                16,
                512,
            ),
        };
    }

    _createMoonGeometry() {
        const segments = this._resolveGeometrySegments();
        return new THREE.SphereGeometry(this.radius, segments.width, segments.height);
    }

    _refreshMoonGeometry() {
        const geometry = this.mesh?.geometry;
        if (!geometry) return false;
        const segments = this._resolveGeometrySegments();
        if (
            geometry.parameters?.widthSegments === segments.width &&
            geometry.parameters?.heightSegments === segments.height
        ) {
            return false;
        }
        this.mesh.geometry = this._createMoonGeometry();
        geometry.dispose?.();
        return true;
    }

    _applyPipelineMapsToMaterial() {
        const material = this.mesh?.material;
        if (!material) {
            return;
        }
        const pipeline = this._resolveEffectivePipeline();
        const resolvedNormalMap = this._resolveNormalMap();
        const demTexture = this._resolveDemTexture();
        const resolvedDisplacementMap = pipeline.displacement && this._hasUsableDem()
            ? (demTexture || null)
            : null;
        const resolvedBumpMap = pipeline.generatedNormalMap && !resolvedNormalMap && this._hasUsableDem()
            ? (demTexture || null)
            : null;

        material.map = pipeline.colorTexture ? (this.texture || null) : null;
        material.color?.setHex?.(pipeline.colorTexture ? 0xffffff : 0x8f969e);
        material.displacementMap = resolvedDisplacementMap;
        material.normalMap = resolvedNormalMap;
        material.bumpMap = resolvedBumpMap;
        material.bumpScale = resolvedBumpMap ? 0.0045 : 0.0;
        material.needsUpdate = true;
    }

    _applyRenderSettingsToMaterial() {
        const material = this.mesh?.material;
        if (!material) {
            return;
        }

        const pipeline = this._resolveEffectivePipeline();
        applyMoonRenderSettingsToMaterial(
            material,
            resolvePipelineRenderSettings(this.renderSettings, this.renderPipeline),
            { moonRadius: this.radius, physicalModel: pipeline.physicalModel },
        );
        applyMoonPipelineStagesToMaterial(material, this.renderSettings, this.renderPipeline);
        material.userData.moonEarthshineBlend = pipeline.earthshine ? 1.0 : 0.0;
        material.userData?.refreshMoonShaderUniforms?.();
        material.needsUpdate = true;
    }

    /**
     * Set textures before creating Moon
     * @param {THREE.Texture} texture - Moon surface texture
     * @param {THREE.Texture} displacementMap - Displacement/bump map
     * @param {THREE.Texture|null} normalMap - Optional normal map
     */
    _textureInputs() {
        const material = this.mesh?.material;
        return [this.texture, this.displacementMap, this.normalMap, this.generatedNormalMap,
            material?.map, material?.normalMap, material?.displacementMap, material?.bumpMap];
    }

    setTextures(texture, displacementMap, normalMap = null) {
        this.texture = texture;
        this.displacementMap = displacementMap;
        this.normalMap = normalMap;
        replaceTextureOwner(this, this._textureInputs(), { disposePrevious: false });
    }

    setRenderInvalidationCallback(callback = null) {
        this.requestRender = typeof callback === "function" ? callback : null;
    }

    setRenderSettings(renderSettings = null) {
        const previousSettings = this.renderSettings;
        this.renderSettings = normalizeMoonRenderSettings(renderSettings);
        const normalInputsChanged = [
            "normalMapMaxWidth",
            "physicalNormalHeightScale", "physicalNormalSlopeBoost", "physicalNormalSlopeBoostStart", "physicalNormalSlopeBoostEnd",
        ].some((key) => previousSettings?.[key] !== this.renderSettings[key]);
        // Skip the heavy generated-normal-map rebuild when there is no
        // material to apply it to yet. Before create() runs, the mesh is null,
        // and create() (or its caller) decides when to build the normal map —
        // either synchronously inside create(), or deferred through
        // refreshGeneratedNormalMap on idle. Calling _refreshGeneratedNormalMap
        // unconditionally here was defeating { deferGeneratedNormalMap: true }
        // on create(), so the expensive ~300-500ms build was still landing on
        // the first-frame path even with the defer flag set.
        const material = this.mesh?.material;
        if (!material) {
            return;
        }

        this._refreshMoonGeometry();
        if (normalInputsChanged) this._refreshGeneratedNormalMap({ disposePrevious: true });
        this._applyPipelineMapsToMaterial();
        this._applyRenderSettingsToMaterial();
        replaceTextureOwner(this, this._textureInputs());
    }

    setRenderPipeline(pipelineState = null) {
        return updateTextureOwner(this, () => this._textureInputs(), () => {
            this._cancelScheduledGeneratedNormalMapRefresh();
            this.renderPipeline = normalizeMoonRenderPipelineState({ schemaVersion: MOON_RENDER_PIPELINE_SCHEMA_VERSION, ...pipelineState });
            const pipeline = this._resolveEffectivePipeline();
            const nextNormalMode = this._resolveGeneratedNormalMapMode();
            const material = this.mesh?.material;
            if (
                material &&
                pipeline.generatedNormalMap &&
                !this.normalMap &&
                this._hasUsableDem() &&
                (!this.generatedNormalMap || this.generatedNormalMapMode !== nextNormalMode)
            ) {
                if (typeof globalThis.requestIdleCallback === "function") {
                    this.generatedNormalMap = null;
                    this.generatedNormalMapMode = null;
                    this._scheduleGeneratedNormalMapRefresh();
                } else {
                    this._refreshGeneratedNormalMap({ disposePrevious: true });
                }
            }
            this._refreshMoonGeometry();
            this._applyPipelineMapsToMaterial();
            this._applyRenderSettingsToMaterial();
        });
    }

    unregisterShaderRenderer(renderer) {
        const shaderMap = this.mesh?.material?.userData?.moonPhotometricShaders;
        return shaderMap instanceof Map ? shaderMap.delete(renderer) : false;
    }

    /**
     * Update Moon textures after creation.
     * @param {THREE.Texture} texture
     * @param {THREE.Texture} displacementMap
     * @param {THREE.Texture|null} normalMap
     * @param {{ disposePrevious?: boolean }} options
     */
    updateTextures(
        texture,
        displacementMap,
        normalMap = null,
        { disposePrevious = true, renderSettings = null, deferGeneratedNormalMap = false } = {},
    ) {
        return updateTextureOwner(this, () => this._textureInputs(), () => {
            this._cancelScheduledGeneratedNormalMapRefresh();

            if (renderSettings) {
                this.renderSettings = normalizeMoonRenderSettings(renderSettings);
            }

            this.texture = texture;
            this.displacementMap = displacementMap;
            this.normalMap = normalMap;

            if (!this._hasUsableDem() && !this.normalMap) {
                this.generatedNormalMap = null;
                this.generatedNormalMapMode = null;
            }

            const pipeline = this._resolveEffectivePipeline();
            if (pipeline.physicalModel && this.displacementMap?.userData?.physicalNormalTexture) deferGeneratedNormalMap = false;
            if (deferGeneratedNormalMap && pipeline.generatedNormalMap && !this.normalMap) {
                this.generatedNormalMap = null;
                this.generatedNormalMapMode = null;
            }
            if (pipeline.generatedNormalMap && this._hasUsableDem() && !deferGeneratedNormalMap) {
                this._refreshGeneratedNormalMap({ disposePrevious: false });
            }
            if (!pipeline.generatedNormalMap) {
                this.generatedNormalMap = null;
                this.generatedNormalMapMode = null;
            }
            const material = this.mesh?.material;
            if (material) {
                this._refreshMoonGeometry();
                this._applyPipelineMapsToMaterial();
                this._applyRenderSettingsToMaterial();
            }
        }, { disposePrevious });
    }

    refreshGeneratedNormalMap({ disposePrevious = true } = {}) {
        const resolvedNormalMap = this._refreshGeneratedNormalMap({ disposePrevious });
        const material = this.mesh?.material;
        if (!material) {
            return resolvedNormalMap;
        }
        this._applyPipelineMapsToMaterial();
        this._applyRenderSettingsToMaterial();
        replaceTextureOwner(this, this._textureInputs(), { disposePrevious });
        return resolvedNormalMap;
    }

    /**
     * Create Moon with axis and poles.
     *
     * @param {boolean} axisVisible - Initial visibility of polar axis
     * @param {boolean} polesVisible - Initial visibility of pole markers
     * @param {Object} [options]
     * @param {boolean} [options.deferGeneratedNormalMap=false]
     *        When true, skip the synchronous normal-map build at create() time
     *        and let the moon initially render with the runtime bumpMap
     *        fallback. The caller is responsible for invoking
     *        refreshGeneratedNormalMap() asynchronously (typically via
     *        requestIdleCallback) so the upgrade happens off the critical
     *        first-frame path. The normal-map build allocates and scans large
     *        canvas + Float32 buffers (~16M pixels at the 5760-wide quality
     *        profile), so deferring it can save ~300-500ms of main-thread
     *        time on initial mission load.
     */
    create(axisVisible = false, polesVisible = false, {
        deferGeneratedNormalMap = false,
        latLonGridVisible = false,
        latLonLabelsVisible = true,
        latLonHoverEnabled = false,
    } = {}) {
        // Create container (rotation handled separately by rotateMoon)
        this.container = new THREE.Group();

        // Moon sphere with displacement mapping
        const pipeline = this._resolveEffectivePipeline();
        if (this.displacementMap?.userData?.physicalNormalTexture) deferGeneratedNormalMap = false;
        if (pipeline.generatedNormalMap && !deferGeneratedNormalMap && !this.normalMap && this._hasUsableDem() && !this.generatedNormalMap) {
            this._refreshGeneratedNormalMap({ disposePrevious: true });
        }
        const resolvedNormalMap = this._resolveNormalMap();

        const geometry = this._createMoonGeometry();
        const material = new THREE.MeshStandardMaterial({
            map: pipeline.colorTexture ? this.texture : null,
            color: pipeline.colorTexture ? 0xffffff : 0x8f969e,
            bumpMap: pipeline.generatedNormalMap && !resolvedNormalMap && this._hasUsableDem() ? this._resolveDemTexture() : null,
            bumpScale: pipeline.generatedNormalMap && !resolvedNormalMap && this._hasUsableDem() ? 0.0045 : 0.0,
            displacementMap: pipeline.displacement && this._hasUsableDem() ? this._resolveDemTexture() : null,
            displacementScale: this.renderSettings.displacementScale,
            displacementBias: this.renderSettings.displacementBias,
            normalMap: resolvedNormalMap,
            normalScale: new THREE.Vector2(this.renderSettings.normalScale, this.renderSettings.normalScale),
            roughness: this.renderSettings.roughness,
            metalness: this.renderSettings.metalness,
            emissive: 0x000000,
            emissiveIntensity: 0.0
        });
        applyMoonRenderSettingsToMaterial(
            material,
            resolvePipelineRenderSettings(this.renderSettings, this.renderPipeline),
            { moonRadius: this.radius, physicalModel: pipeline.physicalModel },
        );
        applyMoonPipelineStagesToMaterial(material, this.renderSettings, this.renderPipeline);
        material.userData.moonEarthshineBlend = pipeline.earthshine ? 1.0 : 0.0;
        applyMoonPhotometricShader(material);

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.onBeforeRender = () => {
            material.userData?.refreshMoonShaderUniforms?.();
        };
        this.mesh.receiveShadow = true;
        this.mesh.castShadow = true;
        this.mesh.frustumCulled = false;
        this.mesh.rotateX(Math.PI / 2);
        this.container.add(this.mesh);
        this.latLonGridVisible = Boolean(latLonGridVisible);
        this.latLonLabelsVisible = latLonLabelsVisible !== false;
        this.latLonHoverEnabled = Boolean(latLonHoverEnabled);
        this._createLatLonGrid({
            visible: this.latLonGridVisible,
            labelsVisible: this.latLonLabelsVisible,
            stepDegrees: this.latLonGridStepDegrees,
        });
        if (this.latLonGrid) {
            this.container.add(this.latLonGrid);
        }
        if (this.latLonLabels) {
            this.container.add(this.latLonLabels);
        }
        if (this.latLonHoverEnabled) {
            this._createLatLonHoverLabel();
        }
        if (this.latLonHoverLabel) {
            this.container.add(this.latLonHoverLabel);
        }

        // Avoid culling the container to prevent pop-in at extreme viewpoints
        this.container.frustumCulled = false;

        // Create axis and poles (not added to container yet - done by parent)
        this._createAxis(axisVisible);
        this._createPoles(polesVisible);
    }

    /**
     * Create polar axis line
     * @private
     */
    _createAxis(visible) {
        const poleScaleOuter = 1.5;
        const poleScaleInner = 1.02; // leave a gap inside the sphere
        const northOuter = new THREE.Vector3(0, 0, this.radius * poleScaleOuter);
        const northInner = new THREE.Vector3(0, 0, this.radius * poleScaleInner);
        const southInner = new THREE.Vector3(0, 0, -this.radius * poleScaleInner);
        const southOuter = new THREE.Vector3(0, 0, -this.radius * poleScaleOuter);

        // Store normalized axis vector for reference
        this.axisVector = northOuter.clone().normalize();

        const geometry = new THREE.BufferGeometry();
        const vertices = [
            northOuter.x, northOuter.y, northOuter.z, northInner.x, northInner.y, northInner.z,
            southInner.x, southInner.y, southInner.z, southOuter.x, southOuter.y, southOuter.z
        ];
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));

        const material = new THREE.LineBasicMaterial({ color: COL.MOON_AXIS, depthTest: true, depthWrite: false });
        this.axis = new THREE.LineSegments(geometry, material);
        this.axis.visible = visible;
    }

    /**
     * Create north and south pole markers
     * @private
     */
    _createPoles(visible) {
        const poleRadius = this.radius / 50;
        const poleGeometry = new THREE.SphereGeometry(poleRadius, 100, 100);

        // North pole
        const northMaterial = new THREE.MeshPhysicalMaterial({
            color: COL.BLACK,
            emissive: COL.NORTH_POLE,
            reflectivity: 0.0
        });
        this.northPoleSphere = new THREE.Mesh(poleGeometry, northMaterial);
        this.northPoleSphere.castShadow = false;
        this.northPoleSphere.receiveShadow = false;
        this.northPoleSphere.position.set(0, 0, 0.985 * this.radius);
        this.northPoleSphere.visible = visible;

        // South pole
        const southMaterial = new THREE.MeshPhysicalMaterial({
            color: COL.BLACK,
            emissive: COL.SOUTH_POLE,
            reflectivity: 0.0
        });
        this.southPoleSphere = new THREE.Mesh(poleGeometry, southMaterial);
        this.southPoleSphere.castShadow = false;
        this.southPoleSphere.receiveShadow = false;
        this.southPoleSphere.position.set(0, 0, -0.985 * this.radius);
        this.southPoleSphere.visible = visible;
    }

    /**
     * Create a selenographic latitude/longitude grid as a surface overlay.
     * The grid uses the Moon container's local +Z axis as lunar north, so it
     * follows the same IAU pole rotation as the texture, axis, and pole marks.
     * @private
     */
    _createLatLonGrid(options = {}) {
        const { grid, labels, stepDegrees } = createMoonLatLonGrid({ radius: this.radius, ...options });
        this.latLonGridStepDegrees = stepDegrees;
        this.latLonGrid = grid;
        this.latLonLabels = labels;
    }

    _createLatLonHoverLabel() {
        this.latLonHoverLabel = createMoonLatLonHoverLabel();
    }

    /**
     * Add axis and poles to container
     * Called by parent after configuration is known
     */
    addAxisAndPolesToContainer() {
        if (this.container && this.axis) {
            this.container.add(this.axis);
        }
        if (this.container && this.northPoleSphere) {
            this.container.add(this.northPoleSphere);
        }
        if (this.container && this.southPoleSphere) {
            this.container.add(this.southPoleSphere);
        }
    }

    /**
     * Update Moon rotation based on current time
     * Uses IAU lunar pole model
     * @param {Date|number} time - Current animation time
     */
    updateRotation(time) {
        if (!this.container) return;

        const date = new Date(time);
        const lp = lunar_pole(date);
        const alpha = lp["alpha"];
        const delta = lp["delta"];
        const W = lp["W"];

        this.container.rotation.set(0, 0, 0);
        this.container.rotateX(-1 * PC.EARTH_AXIS_INCLINATION_RADS);
        this.container.rotateZ(+1 * (Math.PI / 2 + alpha));
        this.container.rotateX(+1 * (Math.PI / 2 - delta));
        this.container.rotateZ(+1 * W);
    }

    /**
     * Set visibility of polar axis
     * @param {boolean} visible
     */
    setAxisVisible(visible) {
        if (this.axis) {
            this.axis.visible = visible;
        }
    }

    /**
     * Set visibility of pole markers
     * @param {boolean} visible
     */
    setPolesVisible(visible) {
        if (this.northPoleSphere) {
            this.northPoleSphere.visible = visible;
        }
        if (this.southPoleSphere) {
            this.southPoleSphere.visible = visible;
        }
    }

    /**
     * Set visibility of the selenographic latitude/longitude grid.
     * @param {boolean} visible
     */
    setLatLonGridVisible(visible) {
        this.latLonGridVisible = Boolean(visible);
        this._syncLatLonOverlayVisibility();
    }

    setLatLonLabelsVisible(visible) {
        this.latLonLabelsVisible = Boolean(visible);
        this._syncLatLonOverlayVisibility();
    }

    setLatLonHoverEnabled(enabled) {
        this.latLonHoverEnabled = Boolean(enabled);
        if (this.latLonHoverEnabled && !this.latLonHoverLabel) {
            this._createLatLonHoverLabel();
            if (this.container && this.latLonHoverLabel) {
                this.container.add(this.latLonHoverLabel);
            }
        }
        if (!this.latLonHoverEnabled && this.latLonHoverLabel) {
            this.latLonHoverLabel.visible = false;
        }
    }

    _syncLatLonOverlayVisibility() {
        if (this.latLonGrid) {
            this.latLonGrid.visible = this.latLonGridVisible;
        }
        if (this.latLonGridVisible && this.latLonLabelsVisible && !this.latLonLabels) {
            this.rebuildLatLonGrid(this.latLonGridStepDegrees);
            return;
        }
        if (this.latLonLabels) {
            this.latLonLabels.visible = this.latLonGridVisible && this.latLonLabelsVisible;
        }
    }

    _disposeLatLonGridAndLabels() {
        if (this.latLonGrid) {
            this.latLonGrid.traverse((child) => {
                disposeObjectMaterialAndGeometry(child);
            });
            this.container?.remove?.(this.latLonGrid);
            this.latLonGrid = null;
        }
        if (this.latLonLabels) {
            this.latLonLabels.traverse((child) => {
                disposeObjectMaterialAndGeometry(child);
            });
            this.container?.remove?.(this.latLonLabels);
            this.latLonLabels = null;
        }
    }

    rebuildLatLonGrid(stepDegrees = MOON_LAT_LON_GRID_DEFAULT_STEP_DEGREES) {
        const normalizedStep = normalizeMoonLatLonGridStep(stepDegrees);
        if (
            normalizedStep === this.latLonGridStepDegrees &&
            this.latLonGrid &&
            (this.latLonLabels || !this.latLonGridVisible || !this.latLonLabelsVisible)
        ) {
            this._syncLatLonOverlayVisibility();
            return false;
        }
        this._disposeLatLonGridAndLabels();
        this._createLatLonGrid({
            visible: this.latLonGridVisible,
            labelsVisible: this.latLonLabelsVisible,
            stepDegrees: normalizedStep,
        });
        if (this.container && this.latLonGrid) {
            this.container.add(this.latLonGrid);
        }
        if (this.container && this.latLonLabels) {
            this.container.add(this.latLonLabels);
        }
        this._syncLatLonOverlayVisibility();
        return true;
    }

    updateLatLonGridForCamera({
        camera = null,
        rendererDomElement = null,
    } = {}) {
        if (!camera || !this.container) {
            return false;
        }
        if (!this.latLonGridVisible && !this.latLonHoverLabel?.visible) {
            if (this.latLonLabels) {
                this.latLonLabels.visible = false;
            }
            return false;
        }
        const moonWorldPosition = new THREE.Vector3();
        this.container.getWorldPosition(moonWorldPosition);
        const cameraWorldPosition = new THREE.Vector3();
        camera.getWorldPosition?.(cameraWorldPosition);
        const distance = cameraWorldPosition.distanceTo(moonWorldPosition);
        const viewportHeight = Math.max(1, Number(rendererDomElement?.clientHeight) || 720);
        const fov = Number(camera.fov);
        const visibleWorldHeight = Number.isFinite(fov)
            ? 2 * distance * Math.tan(THREE.MathUtils.degToRad(fov) / 2)
            : Math.max(1, camera.top - camera.bottom);
        const screenRadiusPx = visibleWorldHeight > 0
            ? (this.radius / visibleWorldHeight) * viewportHeight
            : 0;
        const nextStep = resolveMoonLatLonGridStepFromScreenRadius(screenRadiusPx);
        this.latLonScreenRadiusPx = screenRadiusPx;
        const rebuilt = this.rebuildLatLonGrid(nextStep);
        this._updateLatLonLabelScales({ camera, rendererDomElement });
        return rebuilt;
    }

    getLatLonScreenRadiusPx({
        camera = null,
        rendererDomElement = null,
    } = {}) {
        if (!camera || !this.container) {
            return Number(this.latLonScreenRadiusPx) || 0;
        }
        const moonWorldPosition = new THREE.Vector3();
        this.container.getWorldPosition(moonWorldPosition);
        const cameraWorldPosition = new THREE.Vector3();
        camera.getWorldPosition?.(cameraWorldPosition);
        const distance = cameraWorldPosition.distanceTo(moonWorldPosition);
        const viewportHeight = Math.max(1, Number(rendererDomElement?.clientHeight) || 720);
        const fov = Number(camera.fov);
        const visibleWorldHeight = Number.isFinite(fov)
            ? 2 * distance * Math.tan(THREE.MathUtils.degToRad(fov) / 2)
            : Math.max(1, camera.top - camera.bottom);
        return visibleWorldHeight > 0
            ? (this.radius / visibleWorldHeight) * viewportHeight
            : 0;
    }

    _updateLatLonLabelScales({
        camera = null,
        rendererDomElement = null,
    } = {}) {
        if (!camera) return;
        if (!this.latLonLabels && !this.latLonHoverLabel?.visible) return;
        const viewportHeight = Math.max(1, Number(rendererDomElement?.clientHeight) || 720);
        const fov = Number(camera.fov);
        const moonWorldPosition = new THREE.Vector3();
        const cameraWorld = new THREE.Vector3();
        this.container?.getWorldPosition?.(moonWorldPosition);
        camera.getWorldPosition?.(cameraWorld);
        const labelsReadable = (Number(this.latLonScreenRadiusPx) || 0) >= MOON_LAT_LON_LABEL_MIN_SCREEN_RADIUS_PX;
        if (this.latLonLabels) {
            this.latLonLabels.visible = this.latLonGridVisible && this.latLonLabelsVisible && labelsReadable;
            if (!this.latLonLabels.visible && !this.latLonHoverLabel?.visible) {
                return;
            }
        }
        const cameraDirectionFromMoon = cameraWorld.clone().sub(moonWorldPosition).normalize();
        const cameraLocalPosition = cameraWorld.clone();
        this.container?.worldToLocal?.(cameraLocalPosition);
        const cameraDirectionLocal = cameraLocalPosition.normalize();
        const labelRadius = this.radius * MOON_LAT_LON_GRID_LABEL_RADIUS_SCALE;
        const updateSpriteScale = (sprite, targetPixelHeight = 18) => {
            if (!sprite?.getWorldPosition) return;
            if (sprite.parent === this.latLonLabels) {
                const kind = sprite.userData.moonGridLabelKind;
                const anchor = kind === "latitude"
                    ? resolveLatitudeLabelAnchor(labelRadius, sprite.userData.latitudeDeg, cameraDirectionLocal)
                    : kind === "longitude"
                        ? resolveLongitudeLabelAnchor(labelRadius, sprite.userData.longitudeDeg, cameraDirectionLocal)
                        : null;
                if (anchor) {
                    sprite.position.copy(anchor.position);
                    sprite.visible = anchor.facing > -0.03;
                    if (!sprite.visible) return;
                }
            }
            const spriteWorld = new THREE.Vector3();
            sprite.getWorldPosition(spriteWorld);
            const spriteDirectionFromMoon = spriteWorld.clone().sub(moonWorldPosition).normalize();
            const isFrontSide = spriteDirectionFromMoon.dot(cameraDirectionFromMoon) > -0.03;
            if (sprite.parent === this.latLonLabels) {
                sprite.visible = sprite.visible !== false && isFrontSide;
                if (!isFrontSide) return;
            }
            const distance = Math.max(1e-6, cameraWorld.distanceTo(spriteWorld));
            const visibleWorldHeight = Number.isFinite(fov)
                ? 2 * distance * Math.tan(THREE.MathUtils.degToRad(fov) / 2)
                : Math.max(1, camera.top - camera.bottom);
            const worldHeight = visibleWorldHeight * (targetPixelHeight / viewportHeight);
            const aspect = Math.max(
                1,
                Number(sprite.userData.labelPixelWidth) / Math.max(1, Number(sprite.userData.labelPixelHeight)),
            );
            sprite.scale.set(worldHeight * aspect, worldHeight, 1);
        };

        this.latLonLabels?.children?.forEach?.((sprite) => {
            updateSpriteScale(sprite, 17);
        });
        if (this.latLonHoverLabel?.visible) {
            updateSpriteScale(this.latLonHoverLabel, 24);
        }
    }

    updateLatLonHoverFromPointer({
        camera = null,
        rendererDomElement = null,
        clientX = null,
        clientY = null,
    } = {}) {
        if (!this.latLonHoverEnabled || !this.mesh || !this.container || !camera || !rendererDomElement) {
            return this.hideLatLonHover();
        }
        const rect = rendererDomElement.getBoundingClientRect?.() || null;
        const width = Number(rect?.width) || Number(rendererDomElement.clientWidth) || 0;
        const height = Number(rect?.height) || Number(rendererDomElement.clientHeight) || 0;
        if (!width || !height || !Number.isFinite(Number(clientX)) || !Number.isFinite(Number(clientY))) {
            return this.hideLatLonHover();
        }

        this.latLonPointerNdc.set(
            ((Number(clientX) - (Number(rect?.left) || 0)) / width) * 2 - 1,
            -(((Number(clientY) - (Number(rect?.top) || 0)) / height) * 2 - 1),
        );
        this.latLonRaycaster.setFromCamera(this.latLonPointerNdc, camera);
        const [hit] = this.latLonRaycaster.intersectObject(this.mesh, false);
        if (!hit?.point) {
            return this.hideLatLonHover();
        }

        this.latLonHoverPoint.copy(hit.point);
        this.container.worldToLocal(this.latLonHoverPoint);
        const radius = Math.max(1e-6, this.latLonHoverPoint.length());
        const lat = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(this.latLonHoverPoint.z / radius, -1, 1)));
        const lon = renderMoonLongitudeToDisplayLongitude(THREE.MathUtils.radToDeg(Math.atan2(this.latLonHoverPoint.x, this.latLonHoverPoint.y)));
        const hoverPosition = resolveHoverLabelOffsetPosition({
            radius: this.radius,
            latitudeDeg: lat,
            longitudeDeg: lon,
            camera,
            container: this.container,
        });
        const screenRadiusPx = this.getLatLonScreenRadiusPx({ camera, rendererDomElement });
        const hoverDecimals = resolveMoonHoverCoordinateDecimals(screenRadiusPx);
        const label = `${formatMoonHoverCoordinate(lat, "N", "S", hoverDecimals)} ${formatMoonHoverCoordinate(lon, "E", "W", hoverDecimals)}`;
        if (this.latLonHoverLabel?.userData?.labelText !== label) {
            replaceCanvasTextSpriteMaterial(this.latLonHoverLabel, label, {
                color: "#f8fbff",
                background: "rgba(7, 12, 20, 0.82)",
                border: "rgba(230, 245, 255, 0.62)",
                fontSize: 24,
                paddingX: 12,
                paddingY: 6,
            });
        }
        if (this.latLonHoverLabel) {
            this.latLonHoverLabel.position.copy(hoverPosition);
            this.latLonHoverLabel.visible = true;
            this._updateLatLonLabelScales({ camera, rendererDomElement });
        }
        return true;
    }

    hideLatLonHover() {
        if (!this.latLonHoverLabel?.visible) {
            return false;
        }
        this.latLonHoverLabel.visible = false;
        return true;
    }

    /**
     * Dispose all Moon resources
     */
    dispose() {
        const releaseTextures = detachTextureOwner(this, [this.texture, this.displacementMap, this.normalMap, this.generatedNormalMap]);
        this.texture = null;
        this.displacementMap = null;
        this.normalMap = null;
        this.generatedNormalMap = null;
        this.generatedNormalMapMode = null;
        this.requestRender = null;
        try {
            this._cancelScheduledGeneratedNormalMapRefresh();
            if (this.container) {
                // Dispose mesh
                if (this.mesh) {
                    if (this.mesh.geometry) this.mesh.geometry.dispose();
                    if (this.mesh.material) this.mesh.material.dispose();
                    this.container.remove(this.mesh);
                    this.mesh = null;
                }

                // Dispose axis
                if (this.axis) {
                    if (this.axis.geometry) this.axis.geometry.dispose();
                    if (this.axis.material) this.axis.material.dispose();
                    this.container.remove(this.axis);
                    this.axis = null;
                }
                this.axisVector = null;

                // Dispose poles
                if (this.northPoleSphere) {
                    if (this.northPoleSphere.geometry) this.northPoleSphere.geometry.dispose();
                    if (this.northPoleSphere.material) this.northPoleSphere.material.dispose();
                    this.container.remove(this.northPoleSphere);
                    this.northPoleSphere = null;
                }
                if (this.southPoleSphere) {
                    if (this.southPoleSphere.geometry) this.southPoleSphere.geometry.dispose();
                    if (this.southPoleSphere.material) this.southPoleSphere.material.dispose();
                    this.container.remove(this.southPoleSphere);
                    this.southPoleSphere = null;
                }

                this._disposeLatLonGridAndLabels();
                if (this.latLonHoverLabel) {
                    disposeObjectMaterialAndGeometry(this.latLonHoverLabel);
                    this.container.remove(this.latLonHoverLabel);
                    this.latLonHoverLabel = null;
                }

                // Remove container from parent
                if (this.container.parent) {
                    this.container.parent.remove(this.container);
                }
                this.container = null;
            }
        } finally { releaseTextures(); }
    }
}
