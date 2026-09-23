import { resolvePanelAnchoredLookTarget } from "../ui/scene-mobile-camera-framing.js";
import { createSceneVisualAidEffects } from "../rendering/scene-visual-aids.js";
import { createSceneBodyRotationEffects } from "../rendering/scene-body-rotation.js";

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
    const visualAidEffects = createSceneVisualAidEffects({ SceneHelpers, PC, getRuntimeState });
    const rotationEffects = createSceneBodyRotationEffects({
        THREE,
        PC,
        lunar_pole,
        bodyRotationActions,
        getBodyEphemerisState,
        resolveBodySource,
        getRuntimeState,
    });


    return class AnimationScene {
        static SCENE_STATE_START = 0;
        static SCENE_STATE_INIT_CONFIG_DONE = 1;
        static SCENE_STATE_INIT_DONE = 2;
        static SCENE_STATE_ADD_CURVE_DONE = 3;

        constructor(name) {
            this.name = name;
            this.disposed = false;
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
            spacecraftCurveActions.cancelSpacecraftCurveBuild?.(this);
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
            return visualAidEffects.addMoonSOI(this);
        }

        addBodyHalos() {
            return visualAidEffects.addBodyHalos(this);
        }

        addMoonOsculatingOrbit() {
            return visualAidEffects.addMoonOsculatingOrbit(this);
        }

        disposeMoonSOI() {
            return visualAidEffects.disposeMoonSOI(this);
        }

        disposeBodyHalos() {
            return visualAidEffects.disposeBodyHalos(this);
        }

        disposeMoonOsculatingOrbit() {
            return visualAidEffects.disposeMoonOsculatingOrbit(this);
        }

        updateSecondaryBodyVisualAids(bodyId, bodyState, pixelsPerAU, timeMs) {
            return visualAidEffects.updateSecondaryBodyVisualAids(this, bodyId, bodyState, pixelsPerAU, timeMs);
        }

        refreshBodyHalos({ suppress = false } = {}) {
            return visualAidEffects.refreshBodyHalos(this, { suppress });
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
            return spacecraftCurveActions.addSpacecraftCurve(this);
        }

        addLandingCurve() {
            return spacecraftCurveActions.addLandingCurve(this);
        }

        disposeLandingCurve() {
            spacecraftCurveActions.disposeLandingCurve(this);
        }

        disposeSpacecraftCurve() {
            spacecraftCurveActions.disposeSpacecraftCurve(this);
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
                }, { THREE })
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
            return rotationEffects.rotateMoon(this, timeMs);
        }

        rotateEarth(timeMs = getRuntimeState().animTime) {
            return rotationEffects.rotateEarth(this, timeMs);
        }

        dispose() {
            sceneDisposeActions.dispose(this);
        }
    };
}

export { createAnimationSceneClass };

