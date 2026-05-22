import { getRelativeFrameQuaternion } from "../data/relative-frame-provider.js";
import { resolveSecondaryBodyOrbitGravitationalParameter } from "./secondary-body-orbit-parameters.js";

function createAnimationSceneClass(deps) {
    const {
        THREE,
        PC,
        DEFAULT_VIEW_STATE,
        SceneHelpers,
        lunar_pole,
        sceneCreationActions,
        sceneCameraPositionActions,
        scene3dInitActions,
        dimensionsActions,
        skyActions,
        sunActions,
        earthActions,
        moonActions,
        lunarCraterActions,
        surfacePointMarkerActions,
        orbitMilestoneActions,
        locationActions,
        primarySecondaryBodiesActions,
        spacecraftCurveActions,
        spacecraftActions,
        lineOfSightActions,
        axesHelperActions,
        lightActions,
        sceneCameraControllerActions,
        spacecraftModelActions,
        sceneInitActions,
        orbitVectorProcessingActions,
        bodyRotationActions,
        sceneDisposeActions,
        ensureSceneViewState,
        computeSceneCameraParameters,
        adjustCameraProjectionMatrixAndSkyAngle,
        getDefaultCameraDistance,
        getBodyEphemerisState,
        resolveBodySource,
        getRuntimeState,
    } = deps;
    // Hotfix gate: keep craft locator halos disabled without removing renderer code paths.
    const CRAFT_LOCATOR_HALOS_ENABLED = false;

    function isArtemis2MissionContext(runtimeState) {
        const missionName = String(
            runtimeState?.globalConfig?.mission_name_short ||
            runtimeState?.globalConfig?.mission_name ||
            "",
        ).toLowerCase();
        if (missionName.includes("artemis 2") || missionName.includes("artemis ii")) {
            return true;
        }
        const dataPath = String(window?.missionConfig?.dataPath || "").toLowerCase();
        return dataPath.includes("/artemis2/") || dataPath.includes("\\artemis2\\");
    }

    function resolvePanelAnchoredLookTarget({ scene, baseLookTarget, runtimeState }) {
        if (typeof window === "undefined" || typeof document === "undefined") {
            return baseLookTarget;
        }
        if (window.innerWidth > 600) return baseLookTarget;
        if (scene?.name !== "geo") return baseLookTarget;
        if (!isArtemis2MissionContext(runtimeState)) return baseLookTarget;
        if (!scene?.camera || !scene?.cameraController?.controls) return baseLookTarget;

        const panel = document.getElementById("mobile-card-mission");
        if (!panel) return baseLookTarget;
        const panelBottom = panel.getBoundingClientRect?.().bottom;
        if (!Number.isFinite(panelBottom)) return baseLookTarget;

        const anchorObject = scene.earthContainer || scene.earth;
        if (!anchorObject) return baseLookTarget;

        const base = {
            x: Number.isFinite(baseLookTarget?.x) ? baseLookTarget.x : 0,
            y: Number.isFinite(baseLookTarget?.y) ? baseLookTarget.y : 0,
            z: Number.isFinite(baseLookTarget?.z) ? baseLookTarget.z : 0,
        };

        const PANEL_EDGE_PADDING_PX = 50;
        const desiredScreenY = Math.max(
            0,
            Math.min(window.innerHeight * 0.8, panelBottom + PANEL_EDGE_PADDING_PX),
        );

        const anchorWorld = new THREE.Vector3();
        const ndcPoint = new THREE.Vector3();
        const projectScreenY = (targetY) => {
            const target = scene.cameraController.controls.target;
            target.set(base.x, targetY, base.z);
            scene.camera.lookAt(target);
            scene.camera.updateProjectionMatrix?.();
            scene.camera.updateMatrixWorld?.(true);
            anchorObject.getWorldPosition?.(anchorWorld);
            ndcPoint.copy(anchorWorld).project(scene.camera);
            return (-ndcPoint.y * 0.5 + 0.5) * window.innerHeight;
        };

        const cameraDistance = Math.max(1, scene.camera.position.length?.() || 1);
        let low = -6 * cameraDistance;
        let high = 6 * cameraDistance;
        let lowY = projectScreenY(low);
        let highY = projectScreenY(high);
        if (!Number.isFinite(lowY) || !Number.isFinite(highY)) {
            return base;
        }
        if (lowY > highY) {
            const tmp = low;
            low = high;
            high = tmp;
            const t = lowY;
            lowY = highY;
            highY = t;
        }

        if (desiredScreenY <= lowY) {
            return { x: base.x, y: low, z: base.z };
        }
        if (desiredScreenY >= highY) {
            return { x: base.x, y: high, z: base.z };
        }

        for (let i = 0; i < 24; i += 1) {
            const mid = (low + high) * 0.5;
            const midY = projectScreenY(mid);
            if (!Number.isFinite(midY)) break;
            if (midY < desiredScreenY) {
                low = mid;
            } else {
                high = mid;
            }
        }
        return { x: base.x, y: (low + high) * 0.5, z: base.z };
    }

    return class AnimationScene {
        static SCENE_STATE_START = 0;
        static SCENE_STATE_INIT_CONFIG_DONE = 1;
        static SCENE_STATE_INIT_DONE = 2;
        static SCENE_STATE_ADD_CURVE_DONE = 3;

        constructor(name) {
            this.name = name;
            this.orbits = {};
            this.initialized3D = false;
            this.earth = null;
            this.earthContainer = null;
            this.motherContainer = null;
            this.earthAxis = null;
            this.earthGlow = null;
            this.moon = null;
            this.moonContainer = null;
            this.moonAxisRotationAngle = 0;
            this.moonLatLonGrid = null;
            this.moonLatLonLabels = null;
            this.moonLatLonHoverLabel = null;
            this.moonSOISphere = null;
            this.moonHillSphere = null;
            this.moonOsculatingOrbitLine = null;
            this.lunarCraterGroup = null;
            this.lunarCraterAnnotations = [];
            this.lunarCraterPickTargets = [];
            this.lunarCraterHoverLabel = null;
            this.lunarCraterHoverRing = null;
            this.lunarCraterHoverMaterial = null;
            this.lunarCraterMinDiameterKm = null;
            this.lunarCraterMaxDiameterKm = null;
            this.lunarCraterHoverMinDiameterKm = null;
            this.lunarCraterHoverMaxDiameterKm = null;
            this.lunarCraterShowAllEnabled = false;
            this.lunarCraterHoverEnabled = false;
            this.lunarCraterDisplayMode = null;
            this.lunarFeatureTypeFilters = null;
            this.lunarFeatureSearchQuery = "";
            this.lunarFeatureExcludedKeys = [];
            this.lunarFeatureHoverTypeFilters = null;
            this.lunarFeatureHoverSearchQuery = "";
            this.lunarFeatureHoverExcludedKeys = [];
            this.lunarCraterHoverLabelsEnabled = true;
            this.lunarCraterHoveredName = null;
            this.lunarCraterHoveredDiameterKm = null;
            this.lunarCraterFilteredCount = 0;
            this.lunarCraterRenderedCount = 0;
            this.lunarCraterRenderOmittedCount = 0;
            this.lunarCraterRenderDense = false;
            this.lunarCraterRenderContextKey = null;
            this.lunarCraterSmallestRenderedDiameterKm = null;
            this.lunarCraterRenderPlanLastCheckMs = 0;
            this.surfacePointMarkerGroup = null;
            this.surfacePointMarkers = {};
            this.surfacePointMarkerVisibility = {};
            this.orbitMilestoneGroup = null;
            this.orbitMilestonePickTargets = [];
            this.orbitMilestoneObjectsByBodyId = {};
            this.primaryBody3D = null;
            this.secondaryBody3D = null;
            this.primaryCraftId = "SC";
            this.activeCraftId = "SC";
            this.visibleCraftIds = null;
            this.viewAdditionalCrafts = false;
            this.craftsById = {};
            this.craftInnersById = {};
            this.craftEdgesById = {};
            this.craftAxesHelpersById = {};
            this.dronesById = {};
            this.spacecraftRenderersById = {};
            this.craft = null;
            this.craftInner = null;
            this.craftEdges = null;
            this.craftAxesHelper = null;
            this.drone = null;
            this.camera = null;
            this.cameraControlsEnabled = true;
            this.cameraControls = null;
            this.scene = null;
            this.renderer = null;
            this.curve = [];
            this.landingCurve = [];
            this.curveVelocities = [];
            this.landingCurveVelocities = [];
            this.curvesById = {};
            this.curveTimesById = {};
            this.curveVelocitiesById = {};
            this.orbitLinesByBodyId = {};
            this.orbitTrailLinesByBodyId = {};
            this.generatedOrbitLinesByBodyId = {};
            this.orbitSvgPointsByBodyId = {};
            this.orbitSvgGeneratedPointsByBodyId = {};
            this.orbitTimesByBodyId = {};
            this.supportOrbitsChebByBodyId = {};
            this.locations = [];
            this.sceneHelpers = null;
            this.skyRenderer = null;
            this.skyContainer = null;
            this.skyBaseQuaternion = null;
            this.sunRenderer = null;
            this.sun = null;
            this.lightManager = null;
            this.earthRenderer = null;
            this.moonRenderer = null;
            this.spacecraftRenderer = null;
            this.cameraController = null;
            this.stopCreationFlag = false;
            this.decorationsReady3D = false;
            this.deferred3DInitRunId = 0;
            this.state = AnimationScene.SCENE_STATE_START;

            this.planeSelection = DEFAULT_VIEW_STATE.planeSelection;
            this.plane = DEFAULT_VIEW_STATE.plane;
            this.xVariable = DEFAULT_VIEW_STATE.xVariable;
            this.yVariable = DEFAULT_VIEW_STATE.yVariable;
            this.zVariable = DEFAULT_VIEW_STATE.zVariable;
            this.vxVariable = DEFAULT_VIEW_STATE.vxVariable;
            this.vyVariable = DEFAULT_VIEW_STATE.vyVariable;
            this.vzVariable = DEFAULT_VIEW_STATE.vzVariable;
            this.xFactor = DEFAULT_VIEW_STATE.xFactor;
            this.yFactor = DEFAULT_VIEW_STATE.yFactor;
            this.zFactor = DEFAULT_VIEW_STATE.zFactor;
            this.zoomFactor = DEFAULT_VIEW_STATE.zoomFactor;
            this.panx = DEFAULT_VIEW_STATE.panx;
            this.pany = DEFAULT_VIEW_STATE.pany;
        }

        stopCreation() {
            sceneCreationActions.stopCreation(this);
        }

        setCameraPosition(x, y, z) {
            sceneCameraPositionActions.setCameraPosition(this, x, y, z);
        }

        init3d(callback) {
            scene3dInitActions.init3d(this, callback);
        }

        computeDimensions() {
            dimensionsActions.computeDimensions(this);
        }

        addSky() {
            const { earthRadius, viewSky, viewConstellationLines } = getRuntimeState();
            skyActions.addSky(this, { earthRadius, viewSky, viewConstellationLines });
        }

        disposeSky() {
            skyActions.disposeSky(this);
        }

        addSun() {
            const { earthRadius } = getRuntimeState();
            sunActions.addSun(this, { earthRadius });
        }

        disposeSun() {
            sunActions.disposeSun(this);
        }

        addEarth() {
            const {
                earthRadius,
                viewPolarAxes,
                viewPoles,
                viewEarthPolarAxes,
                viewEarthPoles,
                viewEarthLatLonGrid,
                viewEarthLatLonLabels,
                viewEarthLatLonHover,
            } = getRuntimeState();
            earthActions.addEarth(this, {
                earthRadius,
                viewPolarAxes: viewEarthPolarAxes ?? viewPolarAxes,
                viewPoles: viewEarthPoles ?? viewPoles,
                viewEarthLatLonGrid,
                viewEarthLatLonLabels,
                viewEarthLatLonHover,
            });
        }

        disposeEarth() {
            earthActions.disposeEarth(this);
        }

        addMoon() {
            moonActions.addMoon(this);
        }

        disposeMoon() {
            moonActions.disposeMoon(this);
        }

        addMoonSOI() {
            const { globalConfig, moonRadius, viewMoonSOI, viewMoonHillSphere } = getRuntimeState();
            if (!globalConfig || !globalConfig.is_lunar) {
                return;
            }

            if (!this.sceneHelpers) {
                this.sceneHelpers = new SceneHelpers(this.motherContainer);
            }

            this.sceneHelpers.createMoonSOI(this.moon, moonRadius, viewMoonSOI);
            this.moonSOISphere = this.sceneHelpers.moonSOISphere;
            this.sceneHelpers.createMoonHillSphere(this.moon, moonRadius, viewMoonHillSphere);
            this.moonHillSphere = this.sceneHelpers.moonHillSphere;
        }

        addBodyHalos() {
            const runtimeState = getRuntimeState();
            const earthTarget = this.earthContainer || this.earth || null;
            const moonTarget = this.moonContainer || this.moon || null;
            const craftTarget = CRAFT_LOCATOR_HALOS_ENABLED
                ? (this.craft || Object.values(this.craftsById || {})[0] || null)
                : null;
            if (!this.sceneHelpers) {
                this.sceneHelpers = new SceneHelpers(this.motherContainer);
            }
            this.sceneHelpers.createBodyHalos({
                earthTarget,
                earthRadius: runtimeState.earthRadius,
                moonTarget: runtimeState.globalConfig?.is_lunar ? moonTarget : null,
                moonRadius: runtimeState.moonRadius,
                craftTarget,
                craftRadius: 0,
                visible: runtimeState.viewBodyHalos,
            });
        }

        addMoonOsculatingOrbit() {
            const { globalConfig, viewMoonOsculatingOrbit, frameMode } = getRuntimeState();
            if (!globalConfig || !globalConfig.is_lunar || this.name === "relative") {
                return;
            }

            if (!this.sceneHelpers) {
                this.sceneHelpers = new SceneHelpers(this.motherContainer);
            }

            this.sceneHelpers.createMoonOsculatingOrbit(viewMoonOsculatingOrbit && frameMode !== "relative");
            this.moonOsculatingOrbitLine = this.sceneHelpers.moonOsculatingOrbitLine;
        }

        disposeMoonSOI() {
            const { globalConfig } = getRuntimeState();
            if (!globalConfig || !globalConfig.is_lunar) {
                return;
            }
            if (this.sceneHelpers) {
                this.sceneHelpers.disposeMoonSOI();
                this.sceneHelpers.disposeMoonHillSphere();
            }
            this.moonSOISphere = null;
            this.moonHillSphere = null;
        }

        disposeBodyHalos() {
            if (this.sceneHelpers) {
                this.sceneHelpers.disposeBodyHalos();
            }
        }

        disposeMoonOsculatingOrbit() {
            const { globalConfig } = getRuntimeState();
            if (!globalConfig || !globalConfig.is_lunar) {
                return;
            }
            if (this.sceneHelpers) {
                this.sceneHelpers.disposeMoonOsculatingOrbit();
            }
            this.moonOsculatingOrbitLine = null;
        }

        updateSecondaryBodyVisualAids(bodyId, bodyState, pixelsPerAU, timeMs) {
            const runtimeState = getRuntimeState();
            if (
                !runtimeState.globalConfig?.is_lunar ||
                !bodyState?.available ||
                !this.sceneHelpers
            ) {
                return;
            }

            const moonOrbitToggle = document.getElementById("view-moon-osculating-orbit");
            const relativeOriginToggle = document.getElementById("origin-relative");
            const secondaryBodyId = this.name === "lunar" ? "EARTH" : "MOON";
            const gravitationalParameter = resolveSecondaryBodyOrbitGravitationalParameter(
                PC,
                this.name,
            );
            const showMoonOrbit =
                bodyId === secondaryBodyId &&
                (moonOrbitToggle?.checked ?? runtimeState.viewMoonOsculatingOrbit) &&
                !(relativeOriginToggle?.checked ?? (runtimeState.frameMode === "relative"));
            if (bodyId === secondaryBodyId && this.moonOsculatingOrbitLine) {
                this.sceneHelpers.updateMoonOsculatingOrbit({
                    position: bodyState.position,
                    velocity: bodyState.velocity,
                    pixelsPerAU,
                    timeMs,
                    gravitationalParameter,
                    visible: showMoonOrbit,
                });
            }
        }

        refreshBodyHalos({ suppress = false } = {}) {
            const runtimeState = getRuntimeState();
            if (
                !this.sceneHelpers ||
                !this.camera
            ) {
                return;
            }
            const earthTarget = this.earthContainer || this.earth || null;
            const moonTarget = this.moonContainer || this.moon || null;
            const craftTarget = CRAFT_LOCATOR_HALOS_ENABLED
                ? (this.craft || Object.values(this.craftsById || {})[0] || null)
                : null;
            this.sceneHelpers.updateBodyHalos({
                camera: this.camera,
                rendererDomElement: this.cameraController?._rendererDomElement || this.renderer?.domElement || null,
                earthTarget,
                earthRadius: runtimeState.earthRadius,
                moonTarget: runtimeState.globalConfig?.is_lunar ? moonTarget : null,
                moonRadius: runtimeState.moonRadius,
                craftTarget,
                craftRadius: 0,
                visible: runtimeState.viewBodyHalos && !suppress,
            });
        }

        addEarthLocations() {
            locationActions.addEarthLocations({ scene: this });
        }

        disposeEarthLocations() {
            locationActions.disposeEarthLocations({ scene: this });
        }

        addMoonLocations() {
            locationActions.addMoonLocations({ scene: this });
        }

        disposeMoonLocations() {
            locationActions.disposeMoonLocations({ scene: this });
        }

        addLunarCraterAnnotations(input = {}) {
            lunarCraterActions.addLunarCraterAnnotations({
                scene: this,
                camera: input.camera || this.camera,
                rendererDomElement: input.rendererDomElement ||
                    this.cameraController?._rendererDomElement ||
                    this.renderer?.domElement ||
                    null,
            });
        }

        disposeLunarCraterAnnotations() {
            lunarCraterActions.disposeLunarCraterAnnotations({ scene: this });
        }

        setLunarCraterAnnotationsVisible(visible) {
            lunarCraterActions.setLunarCraterAnnotationsVisible({
                scene: this,
                visible,
            });
        }

        setLunarCraterDiameterRange(range = {}) {
            return lunarCraterActions.setLunarCraterDiameterRange({
                scene: this,
                minDiameterKm: range.lunarCraterMinDiameterKm ?? range.minDiameterKm,
                maxDiameterKm: range.lunarCraterMaxDiameterKm ?? range.maxDiameterKm,
                camera: range.camera || this.camera,
                rendererDomElement: range.rendererDomElement ||
                    this.cameraController?._rendererDomElement ||
                    this.renderer?.domElement ||
                    null,
            });
        }

        setLunarCraterDisplayMode(mode, input = {}) {
            return lunarCraterActions.setLunarCraterDisplayMode({
                scene: this,
                mode,
                camera: input.camera || this.camera,
                rendererDomElement: input.rendererDomElement ||
                    this.cameraController?._rendererDomElement ||
                    this.renderer?.domElement ||
                    null,
            });
        }

        setLunarCraterHoverLabelsEnabled(enabled) {
            return lunarCraterActions.setLunarCraterHoverLabelsEnabled({
                scene: this,
                enabled,
            });
        }

        setLunarFeatureTypeFilters(typeFilters, input = {}) {
            return lunarCraterActions.setLunarFeatureTypeFilters({
                scene: this,
                typeFilters,
                camera: input.camera || this.camera,
                rendererDomElement: input.rendererDomElement ||
                    this.cameraController?._rendererDomElement ||
                    this.renderer?.domElement ||
                    null,
            });
        }

        setLunarFeatureSearchQuery(searchQuery, input = {}) {
            return lunarCraterActions.setLunarFeatureSearchQuery({
                scene: this,
                searchQuery,
                camera: input.camera || this.camera,
                rendererDomElement: input.rendererDomElement ||
                    this.cameraController?._rendererDomElement ||
                    this.renderer?.domElement ||
                    null,
            });
        }

        setLunarFeatureExcludedKeys(excludedKeys, input = {}) {
            return lunarCraterActions.setLunarFeatureExcludedKeys({
                scene: this,
                excludedKeys,
                camera: input.camera || this.camera,
                rendererDomElement: input.rendererDomElement ||
                    this.cameraController?._rendererDomElement ||
                    this.renderer?.domElement ||
                    null,
            });
        }

        updateLunarCraterLabelScales(input) {
            return lunarCraterActions.updateLunarCraterLabelScales({
                scene: this,
                ...input,
            });
        }

        updateLunarCraterHoverFromPointer(input) {
            return lunarCraterActions.updateLunarCraterHoverFromPointer({
                scene: this,
                ...input,
            });
        }

        clearLunarCraterHover() {
            return lunarCraterActions.hideLunarCraterHover({ scene: this });
        }

        updateMoonLatLonGridForCamera(input) {
            return this.moonRenderer?.updateLatLonGridForCamera?.(input) === true;
        }

        updateEarthLatLonGridForCamera(input) {
            return this.earthRenderer?.updateLatLonGridForCamera?.(input) === true;
        }

        updateMoonLatLonHoverFromPointer(input) {
            return this.moonRenderer?.updateLatLonHoverFromPointer?.(input) === true;
        }

        updateEarthLatLonHoverFromPointer(input) {
            return this.earthRenderer?.updateLatLonHoverFromPointer?.(input) === true;
        }

        clearMoonLatLonHover() {
            return this.moonRenderer?.hideLatLonHover?.() === true;
        }

        clearEarthLatLonHover() {
            return this.earthRenderer?.hideLatLonHover?.() === true;
        }

        addSurfacePointMarkers() {
            surfacePointMarkerActions.addSurfacePointMarkers({ scene: this });
        }

        disposeSurfacePointMarkers() {
            surfacePointMarkerActions.disposeSurfacePointMarkers({ scene: this });
        }

        setSurfacePointMarkersVisible(view, options = {}) {
            surfacePointMarkerActions.setSurfacePointMarkersVisible({
                scene: this,
                view,
                ...options,
            });
        }

        updateSurfacePointMarkers(input = {}) {
            surfacePointMarkerActions.updateSurfacePointMarkers({
                scene: this,
                ...input,
            });
        }

        setPrimaryAndSecondaryBodies() {
            primarySecondaryBodiesActions.setPrimaryAndSecondaryBodies(this);
        }

        addSpacecraftCurve() {
            spacecraftCurveActions.addSpacecraftCurve(this);
        }

        disposeSpacecraftCurve() {
            spacecraftCurveActions.disposeSpacecraftCurve(this);
        }

        addOrbitMilestones3D() {
            orbitMilestoneActions.add3DMilestones({ scene: this });
        }

        disposeOrbitMilestones3D() {
            orbitMilestoneActions.dispose3DMilestones({ scene: this });
        }

        updateOrbitMilestoneVisibility() {
            orbitMilestoneActions.update3DVisibility({ scene: this });
        }

        updateOrbitMilestoneLabels() {
            orbitMilestoneActions.update3DLabels({ scene: this });
        }

        updateOrbitMilestoneHoverFromPointer(input = {}) {
            return orbitMilestoneActions.update3DHoverFromPointer({
                scene: this,
                ...input,
            });
        }

        clearOrbitMilestoneHover() {
            return orbitMilestoneActions.clear3DHover();
        }

        selectHoveredOrbitMilestone() {
            return orbitMilestoneActions.select3DHover();
        }

        addSpacecraft() {
            spacecraftActions.addSpacecraft(this);
        }

        disposeSpacecraft() {
            spacecraftActions.disposeSpacecraft(this);
        }

        addLineOfSight() {
            lineOfSightActions.addLineOfSight(this);
        }

        disposeLineOfSight() {
            lineOfSightActions.disposeLineOfSight(this);
        }

        addAxesHelper() {
            const {
                earthRadius,
                viewXYZAxes,
                viewEclipticPlane,
                viewEquatorialPlane,
            } = getRuntimeState();
            axesHelperActions.addAxesHelper(this, {
                earthRadius,
                viewXYZAxes,
                viewEclipticPlane,
                viewEquatorialPlane,
            });
        }

        disposeAxesHelper() {
            axesHelperActions.disposeAxesHelper(this);
        }

        addLight() {
            lightActions.addLight(this);
        }

        disposeLight() {
            lightActions.disposeLight(this);
        }

        addCamera() {
            sceneCameraControllerActions.addCamera(this);
        }

        disposeCamera() {
            sceneCameraControllerActions.disposeCamera(this);
        }

        async addSpacecraftModel() {
            await spacecraftModelActions.addSpacecraftModel(this);
        }

        disposeSpacecraftModel() {
            spacecraftModelActions.disposeSpacecraftModel(this);
        }

        init3dRest() {
            sceneInitActions.init3dRest(this);
        }

        setCameraParameters(isInitialization = false) {
            const sceneViewState = ensureSceneViewState(this);
            let controllerDistance = null;
            if (this.cameraControlsEnabled && this.cameraController) {
                controllerDistance = this.cameraController.getDistanceFromOrigin();
            }

            const relativeOriginChecked =
                typeof document !== "undefined" &&
                !!document.getElementById("origin-relative")?.checked;
            const runtimeState = getRuntimeState();
            const isRelativeMode =
                runtimeState.frameMode === "relative" || relativeOriginChecked;
            const relativeDefaultPlaneSelection =
                runtimeState.globalConfig?.ui?.viewDefaults?.relativeDefaultPlaneSelection || "XY";

            const params = computeSceneCameraParameters({
                planeSelection: sceneViewState?.planeSelection || DEFAULT_VIEW_STATE.planeSelection,
                missionConfig: this.name,
                globalConfig: runtimeState.globalConfig,
                isRelativeMode,
                relativeDefaultPlaneSelection,
                isInitialization,
                controllerDistance,
                defaultCameraDistance: getDefaultCameraDistance(),
            });

            if (this.cameraController) {
                this.cameraController.setFov(params.fov);
                if (params.up) {
                    this.cameraController.setUp(params.up.x, params.up.y, params.up.z);
                }
            }

            if (params.position) {
                this.setCameraPosition(params.position.x, params.position.y, params.position.z);
            }

            const resolvedLookTarget = params.pinEarthBelowPanel
                ? resolvePanelAnchoredLookTarget({
                    scene: this,
                    baseLookTarget: params.lookTarget,
                    runtimeState,
                })
                : params.lookTarget;

            this.defaultLookTarget = resolvedLookTarget || null;

            if (resolvedLookTarget && this.cameraController?.controls?.target && this.camera) {
                this.cameraController.controls.target.set(
                    resolvedLookTarget.x,
                    resolvedLookTarget.y,
                    resolvedLookTarget.z,
                );
                this.camera.lookAt(this.cameraController.controls.target);
                this.cameraController.controls.update?.();
            }

            this.craftVisible = params.craftVisible;
            adjustCameraProjectionMatrixAndSkyAngle();
        }

        processOrbitVectorsData3D() {
            orbitVectorProcessingActions.processOrbitVectorsData3D(this);
        }

        processLandingVectors() {
            orbitVectorProcessingActions.processLandingVectors(this);
        }

        cameraDisntance(position) {
            return sceneCameraPositionActions.cameraDisntance(position);
        }

        rotateMoon(timeMs = getRuntimeState().animTime) {
            const runtimeState = getRuntimeState();
            if (!runtimeState.globalConfig || !runtimeState.globalConfig.is_lunar) return;
            if (!this.moonContainer) return;

            if (runtimeState.frameMode === "relative" && runtimeState.config === "geo") {
                const frameQuat = getRelativeFrameQuaternion({
                    chebyshevData: runtimeState.chebyshevData,
                    config: runtimeState.config,
                    timeMs,
                });

                if (frameQuat) {
                    const qFrame = new THREE.Quaternion(
                        frameQuat.x,
                        frameQuat.y,
                        frameQuat.z,
                        frameQuat.w,
                    );

                    const date = new Date(timeMs);
                    const lp = lunar_pole(date);
                    const alpha = lp.alpha;
                    const delta = lp.delta;
                    const W = lp.W;

                    const qInertial = new THREE.Quaternion();
                    const qx1 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -1 * PC.EARTH_AXIS_INCLINATION_RADS);
                    const qz2 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2 + alpha);
                    const qx3 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2 - delta);
                    const qz4 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), W);
                    qInertial.multiply(qx1).multiply(qz2).multiply(qx3).multiply(qz4);

                    this.moonContainer.quaternion.copy(qFrame).multiply(qInertial);
                    return;
                }

                const moonState = getBodyEphemerisState({
                    bodyId: "MOON",
                    timeMs,
                    config: runtimeState.config,
                    npzData: runtimeState.npzData,
                    npzDataLoaded: runtimeState.npzDataLoaded,
                    chebyshevData: runtimeState.chebyshevData,
                    chebyshevDataLoaded: runtimeState.chebyshevDataLoaded,
                    resolvedSource: resolveBodySource({
                        bodyId: "MOON",
                        bodySources: runtimeState.bodyEphemerisSources,
                        defaultSpacecraftSource: runtimeState.ephemerisSource,
                    }),
                    defaultSpacecraftSource: runtimeState.ephemerisSource,
                });
                if (!moonState.available) return;
                const r = new THREE.Vector3(moonState.position.x, moonState.position.y, moonState.position.z);
                const v = new THREE.Vector3(moonState.velocity.vx, moonState.velocity.vy, moonState.velocity.vz);

                if (r.lengthSq() === 0) return;

                const xHat = r.clone().normalize();
                const zHat = new THREE.Vector3().crossVectors(r, v);
                if (zHat.lengthSq() === 0) return;
                zHat.normalize();
                const yHat = new THREE.Vector3().crossVectors(zHat, xHat);
                if (yHat.lengthSq() === 0) return;
                yHat.normalize();

                const relativeToInertial = new THREE.Matrix4().makeBasis(xHat, yHat, zHat);
                const inertialToRelative = relativeToInertial.clone().transpose();
                const qFrame = new THREE.Quaternion().setFromRotationMatrix(inertialToRelative);

                const date = new Date(timeMs);
                const lp = lunar_pole(date);
                const alpha = lp.alpha;
                const delta = lp.delta;
                const W = lp.W;

                const qInertial = new THREE.Quaternion();
                const qx1 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -1 * PC.EARTH_AXIS_INCLINATION_RADS);
                const qz2 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2 + alpha);
                const qx3 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2 - delta);
                const qz4 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), W);
                qInertial.multiply(qx1).multiply(qz2).multiply(qx3).multiply(qz4);

                this.moonContainer.quaternion.copy(qFrame).multiply(qInertial);
                return;
            }

            bodyRotationActions.rotateMoon({
                timeMs,
                globalConfig: runtimeState.globalConfig,
                moonContainer: this.moonContainer,
            });
        }

        rotateEarth(timeMs = getRuntimeState().animTime) {
            const runtimeState = getRuntimeState();
            const applySkyRelativeFrame = (frameQuat) => {
                if (!frameQuat || !this.skyContainer || !this.skyBaseQuaternion) return;
                const qFrame = new THREE.Quaternion(
                    frameQuat.x,
                    frameQuat.y,
                    frameQuat.z,
                    frameQuat.w,
                );
                this.skyContainer.quaternion.copy(qFrame).multiply(this.skyBaseQuaternion);
            };

            if (runtimeState.frameMode === "relative" && runtimeState.config === "geo" && this.earthContainer) {
                const inertialQuatData = bodyRotationActions.getEarthInertialQuaternion?.(timeMs);
                const qInertial = inertialQuatData
                    ? new THREE.Quaternion(
                        inertialQuatData.x,
                        inertialQuatData.y,
                        inertialQuatData.z,
                        inertialQuatData.w,
                    )
                    : null;
                const applyRelativeFrame = (frameQuat) => {
                    if (!frameQuat) return false;
                    const qFrame = new THREE.Quaternion(
                        frameQuat.x,
                        frameQuat.y,
                        frameQuat.z,
                        frameQuat.w,
                    );
                    if (qInertial) {
                        this.earthContainer.quaternion.copy(qFrame).multiply(qInertial);
                    } else {
                        this.earthContainer.quaternion.copy(qFrame);
                    }
                    return true;
                };

                const relativeFrameQuat = getRelativeFrameQuaternion({
                    chebyshevData: runtimeState.chebyshevData,
                    config: runtimeState.config,
                    timeMs,
                });

                if (applyRelativeFrame(relativeFrameQuat)) {
                    applySkyRelativeFrame(relativeFrameQuat);
                    return;
                }

                const moonState = getBodyEphemerisState({
                    bodyId: "MOON",
                    timeMs,
                    config: runtimeState.config,
                    npzData: runtimeState.npzData,
                    npzDataLoaded: runtimeState.npzDataLoaded,
                    chebyshevData: runtimeState.chebyshevData,
                    chebyshevDataLoaded: runtimeState.chebyshevDataLoaded,
                    resolvedSource: resolveBodySource({
                        bodyId: "MOON",
                        bodySources: runtimeState.bodyEphemerisSources,
                        defaultSpacecraftSource: runtimeState.ephemerisSource,
                    }),
                    defaultSpacecraftSource: runtimeState.ephemerisSource,
                });
                if (!moonState.available) return;

                const r = new THREE.Vector3(moonState.position.x, moonState.position.y, moonState.position.z);
                const v = new THREE.Vector3(moonState.velocity.vx, moonState.velocity.vy, moonState.velocity.vz);
                if (r.lengthSq() === 0) return;

                const xHat = r.clone().normalize();
                const zHat = new THREE.Vector3().crossVectors(r, v);
                if (zHat.lengthSq() === 0) return;
                zHat.normalize();
                const yHat = new THREE.Vector3().crossVectors(zHat, xHat);
                if (yHat.lengthSq() === 0) return;
                yHat.normalize();

                const relativeToInertial = new THREE.Matrix4().makeBasis(xHat, yHat, zHat);
                const inertialToRelative = relativeToInertial.clone().transpose();
                const qFrame = new THREE.Quaternion().setFromRotationMatrix(inertialToRelative);
                if (qInertial) {
                    this.earthContainer.quaternion.copy(qFrame).multiply(qInertial);
                } else {
                    this.earthContainer.quaternion.copy(qFrame);
                }

                applySkyRelativeFrame({
                    x: qFrame.x,
                    y: qFrame.y,
                    z: qFrame.z,
                    w: qFrame.w,
                });
                return;
            }

            bodyRotationActions.rotateEarth({
                timeMs,
                earthContainer: this.earthContainer,
            });

            // Keep inertial sky orientation when not in relative frame mode.
            if (this.skyContainer && this.skyBaseQuaternion) {
                this.skyContainer.quaternion.copy(this.skyBaseQuaternion);
            }
        }

        dispose() {
            sceneDisposeActions.dispose(this);
        }
    };
}

export { createAnimationSceneClass };

