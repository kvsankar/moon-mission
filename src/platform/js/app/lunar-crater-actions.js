import { LUNAR_CRATER_DEFAULT_MAX_DIAMETER_KM, LUNAR_CRATER_DEFAULT_MIN_DIAMETER_KM, LUNAR_CRATER_RANGE_MIN_DIAMETER_KM } from "../core/domain/lunar-crater-view.js";
import { getLoadedLunarFeatureCatalog, loadLunarFeatureCatalog } from "../data/lunar-feature-catalog.js";
import { getCraterBoundaryTone, getCratersToShow } from "../core/domain/lunar-crater-catalog.js";
import { normalizeLunarFeatureKeyList, normalizeLunarFeatureSearchQuery, normalizeLunarFeatureTypeFilters } from "../core/domain/lunar-feature-view.js";
import { getLunarFeatureBoundaryColor } from "../core/domain/lunar-feature-colors.js";
import { createLunarCraterAnnotationRuntime } from "./lunar-crater-annotation-runtime.js";
import { createLunarCraterHoverRuntime } from "./lunar-crater-hover-runtime.js";
import {
    CRATER_LABEL_MAX_SCREEN_HEIGHT_PX,
    CRATER_HOVER_LABEL_MAX_SCREEN_HEIGHT_PX,
    CRATER_DISPLAY_MODE_ALWAYS,
    CRATER_DISPLAY_MODE_HOVER,
    CRATER_RENDER_PLAN_CHECK_INTERVAL_MS,
    EMPTY_LUNAR_CRATER_CATALOG,
} from "./lunar-crater-render-config.js";
import {
    normalizeCraterDisplayMode,
    shouldShowHoverLabelForDisplayMode,
    normalizeCraterDisplayDiameterRange,
    getCraterDisplayFeatures,
    countCraterDisplayFeatures,
    formatCraterLabelText,
    buildCraterCirclePositions,
    getCraterAngularRadius,
    getCraterVisibilityThreshold,
    vectorToPlain,
    calculateCraterLabelScaleRatio,
    calculateCraterHoverLabelOffset,
    calculateCraterProjectedScreenBounds,
    calculateCraterProjectedRadiusPx,
} from "./lunar-crater-render-primitives.js";
import {
    resolveCraterHoverTarget,
    resolveCraterHoverTargetFromScreen,
    resolveMoonSurfaceHitNormal,
} from "./lunar-crater-hit-testing.js";

function createLunarCraterActions({
    THREE,
    sphericalToCartesian,
    degreesToRadians,
    PC,
    getMoonRadius,
    getGlobalConfig,
    getViewLunarCraters,
    getLunarCraterMinDiameterKm = () => LUNAR_CRATER_DEFAULT_MIN_DIAMETER_KM,
    getLunarCraterMaxDiameterKm = () => LUNAR_CRATER_DEFAULT_MAX_DIAMETER_KM,
    getLunarCraterHoverMinDiameterKm = () => 0,
    getLunarCraterHoverMaxDiameterKm = () => LUNAR_CRATER_DEFAULT_MAX_DIAMETER_KM,
    getLunarCraterDisplayMode = () => CRATER_DISPLAY_MODE_HOVER,
    getLunarFeatureTypeFilters = () => ({}),
    getLunarFeatureSearchQuery = () => "",
    getLunarFeatureExcludedKeys = () => [],
    getLunarFeatureHoverTypeFilters = () => getLunarFeatureTypeFilters(),
    getLunarFeatureHoverSearchQuery = () => getLunarFeatureSearchQuery(),
    getLunarFeatureHoverExcludedKeys = () => getLunarFeatureExcludedKeys(),
    craterCatalog = null,
    loadCraterCatalog = loadLunarFeatureCatalog,
    render = () => {},
}) {
    let activeCraterCatalog = craterCatalog || getLoadedLunarFeatureCatalog() || null;
    let craterCatalogLoadPromise = null;

    const labelWorldPosition = new THREE.Vector3();
    const cameraWorldPosition = new THREE.Vector3();
    const moonWorldQuaternion = new THREE.Quaternion();
    const inverseMoonWorldQuaternion = new THREE.Quaternion();
    const moonSunLocalDirection = new THREE.Vector3();
    const cameraMoonLocalPosition = new THREE.Vector3();
    const craterLabelNormal = new THREE.Vector3();
    const craterTargetCache = new WeakMap();

    const { resolveCraterCameraContext, selectAlwaysRenderTargets,
        addLunarCraterAnnotations, disposeLunarCraterAnnotations } = createLunarCraterAnnotationRuntime({
        THREE,
        degreesToRadians,
        getMoonRadius,
        getGlobalConfig,
        getViewLunarCraters,
        getLunarRadiusKm,
        getActiveCraterCatalog,
        ensureCraterCatalogForScene,
        resolveDisplayDiameterRange,
        resolveHoverDiameterRange,
        resolveDisplayMode,
        resolveShowAllEnabled,
        resolveHoverEnabled,
        resolveTypeFilters,
        resolveSearchQuery,
        resolvePinnedNames,
        resolveExcludedKeys,
        resolveHoverTypeFilters,
        buildCraterPickTarget,
        resolveMoonSunLocalNormal,
        resolveCraterSunlit,
        ensureCraterBoundaryMaterials,
        getCraterBoundaryMaterial,
        hasActiveCraterCatalog: () => !!activeCraterCatalog,
    });

    const { hideLunarCraterHover, updateLunarCraterHoverFromPointer } = createLunarCraterHoverRuntime({
        THREE,
        getMoonRadius,
        getLunarRadiusKm,
        resolveHoverEnabled,
        resolveSearchQuery,
        resolveCraterSunlit,
        getCraterBoundaryMaterial,
        resolveCraterCameraContext,
    });

    function getLunarRadiusKm() {
        return Number.isFinite(PC?.MOON_RADIUS_KM)
            ? PC.MOON_RADIUS_KM
            : 1737.4;
    }

    function getActiveCraterCatalog() {
        return activeCraterCatalog || EMPTY_LUNAR_CRATER_CATALOG;
    }

    function markCraterCatalogLoading(scene, loading, error = null) {
        if (!scene) return;
        scene.lunarCraterCatalogLoading = loading === true;
        scene.lunarCraterCatalogError = error || null;
    }

    function ensureCraterCatalogForScene({ scene, camera = null, rendererDomElement = null } = {}) {
        if (activeCraterCatalog) {
            return Promise.resolve(activeCraterCatalog);
        }
        if (!craterCatalogLoadPromise) {
            craterCatalogLoadPromise = Promise.resolve()
                .then(() => loadCraterCatalog())
                .then((catalog) => {
                    activeCraterCatalog = catalog || EMPTY_LUNAR_CRATER_CATALOG;
                    return activeCraterCatalog;
                })
                .finally(() => {
                    craterCatalogLoadPromise = null;
                });
        }
        markCraterCatalogLoading(scene, true);
        craterCatalogLoadPromise
            .then(() => {
                markCraterCatalogLoading(scene, false);
                if (scene?.moonContainer && getGlobalConfig()?.is_lunar) {
                    addLunarCraterAnnotations({ scene, camera, rendererDomElement });
                    render?.();
                }
            })
            .catch((error) => {
                console.error("Failed to load lunar feature catalog", error);
                markCraterCatalogLoading(scene, false, error);
            });
        return craterCatalogLoadPromise;
    }

    function resolveDisplayDiameterRange(scene) {
        return normalizeCraterDisplayDiameterRange({
            lunarCraterMinDiameterKm: Number.isFinite(Number(scene?.lunarCraterMinDiameterKm))
                ? Number(scene.lunarCraterMinDiameterKm)
                : getLunarCraterMinDiameterKm(),
            lunarCraterMaxDiameterKm: Number.isFinite(Number(scene?.lunarCraterMaxDiameterKm))
                ? Number(scene.lunarCraterMaxDiameterKm)
                : getLunarCraterMaxDiameterKm(),
        }, getActiveCraterCatalog());
    }

    function resolveHoverDiameterRange(scene) {
        return normalizeCraterDisplayDiameterRange({
            lunarCraterMinDiameterKm: Number.isFinite(Number(scene?.lunarCraterHoverMinDiameterKm))
                ? Number(scene.lunarCraterHoverMinDiameterKm)
                : getLunarCraterHoverMinDiameterKm(),
            lunarCraterMaxDiameterKm: Number.isFinite(Number(scene?.lunarCraterHoverMaxDiameterKm))
                ? Number(scene.lunarCraterHoverMaxDiameterKm)
                : getLunarCraterHoverMaxDiameterKm(),
        }, getActiveCraterCatalog());
    }

    function resolveDisplayMode(scene) {
        return normalizeCraterDisplayMode(scene?.lunarCraterDisplayMode ?? getLunarCraterDisplayMode());
    }

    function resolveShowAllEnabled(scene) {
        if (Object.prototype.hasOwnProperty.call(scene || {}, "lunarCraterShowAllEnabled")) {
            return scene.lunarCraterShowAllEnabled === true;
        }
        return getViewLunarCraters() === true && resolveDisplayMode(scene) === CRATER_DISPLAY_MODE_ALWAYS;
    }

    function resolveHoverEnabled(scene) {
        if (Object.prototype.hasOwnProperty.call(scene || {}, "lunarCraterHoverEnabled")) {
            return scene.lunarCraterHoverEnabled === true;
        }
        return getViewLunarCraters() === true && shouldShowHoverLabelForDisplayMode(resolveDisplayMode(scene));
    }

    function resolveTypeFilters(scene) {
        return normalizeLunarFeatureTypeFilters(
            scene?.lunarFeatureTypeFilters,
            getLunarFeatureTypeFilters(),
        );
    }

    function resolveSearchQuery(scene) {
        return normalizeLunarFeatureSearchQuery(
            scene?.lunarFeatureSearchQuery ?? getLunarFeatureSearchQuery(),
        );
    }

    function resolvePinnedNames(scene) {
        return Array.isArray(scene?.lunarFeaturePinnedNames)
            ? scene.lunarFeaturePinnedNames
                .map((entry) => String(entry || "").trim())
                .filter(Boolean)
            : [];
    }

    function resolveExcludedKeys(scene) {
        return normalizeLunarFeatureKeyList(
            scene?.lunarFeatureExcludedKeys ?? getLunarFeatureExcludedKeys(),
        );
    }

    function resolveHoverTypeFilters(scene) {
        return normalizeLunarFeatureTypeFilters(
            scene?.lunarFeatureHoverTypeFilters,
            getLunarFeatureHoverTypeFilters(),
        );
    }

    function resolveHoverSearchQuery(scene) {
        return normalizeLunarFeatureSearchQuery(
            scene?.lunarFeatureHoverSearchQuery ?? getLunarFeatureHoverSearchQuery(),
        );
    }

    function resolveHoverExcludedKeys(scene) {
        return normalizeLunarFeatureKeyList(
            scene?.lunarFeatureHoverExcludedKeys ?? getLunarFeatureHoverExcludedKeys(),
        );
    }

    function buildCraterPickTarget({ crater, moonRadius, lunarRadiusKm }) {
        const cached = craterTargetCache.get(crater);
        if (cached && cached.lunarRadiusKm === lunarRadiusKm) {
            return {
                crater,
                centerNormal: cached.centerNormal,
                angularRadius: cached.angularRadius,
            };
        }
        const position = sphericalToCartesian(
            moonRadius,
            degreesToRadians(crater.longitudeDeg),
            degreesToRadians(crater.latitudeDeg),
        );
        const centerNormal = new THREE.Vector3(position.x, position.y, position.z).normalize();
        const angularRadius = getCraterAngularRadius(crater, lunarRadiusKm);
        craterTargetCache.set(crater, {
            lunarRadiusKm,
            centerNormal,
            angularRadius,
        });
        return {
            crater,
            centerNormal,
            angularRadius,
        };
    }

    function resolveMoonSunLocalNormal(scene) {
        const candidate = scene?.stateSunDirections?.moonCentered ||
            scene?.stateSunDirections?.earthCentered ||
            scene?.stateSunDirection ||
            null;
        if (
            !candidate ||
            !Number.isFinite(candidate.x) ||
            !Number.isFinite(candidate.y) ||
            !Number.isFinite(candidate.z)
        ) {
            return null;
        }
        moonSunLocalDirection.set(candidate.x, candidate.y, candidate.z);
        if (moonSunLocalDirection.lengthSq() <= 1e-12) {
            return null;
        }
        moonSunLocalDirection.normalize();
        if (scene?.moonContainer?.getWorldQuaternion) {
            scene.moonContainer.getWorldQuaternion(moonWorldQuaternion);
            inverseMoonWorldQuaternion.copy(moonWorldQuaternion).invert();
            moonSunLocalDirection.applyQuaternion(inverseMoonWorldQuaternion).normalize();
        }
        return moonSunLocalDirection.clone();
    }

    function resolveCraterSunlit({ scene, centerNormal, sunNormal = null }) {
        const resolvedSunNormal = sunNormal || resolveMoonSunLocalNormal(scene);
        const tone = getCraterBoundaryTone({
            centerNormal: vectorToPlain(centerNormal),
            sunNormal: vectorToPlain(resolvedSunNormal),
        });
        return tone.sunlit;
    }

    function createCraterBoundaryMaterial({ featureType, sunlit, hover }) {
        return new THREE.LineBasicMaterial({
            color: getLunarFeatureBoundaryColor(featureType, { sunlit, hover }),
            transparent: true,
            opacity: hover ? 0.98 : (sunlit === false ? 0.9 : 0.94),
            depthTest: hover ? false : true,
            depthWrite: false,
            toneMapped: false,
        });
    }

    function ensureCraterBoundaryMaterials(group, featureType = "") {
        if (!group) return null;
        if (!group.userData.craterBoundaryMaterialsByType) {
            group.userData.craterBoundaryMaterialsByType = new Map();
        }
        const key = typeof featureType === "string" && featureType ? featureType : "__fallback";
        const existing = group.userData.craterBoundaryMaterialsByType.get(key);
        if (existing) return existing;
        const materials = {
            lit: createCraterBoundaryMaterial({ featureType, sunlit: true, hover: false }),
            unlit: createCraterBoundaryMaterial({ featureType, sunlit: false, hover: false }),
            hoverLit: createCraterBoundaryMaterial({ featureType, sunlit: true, hover: true }),
            hoverUnlit: createCraterBoundaryMaterial({ featureType, sunlit: false, hover: true }),
        };
        group.userData.craterBoundaryMaterialsByType.set(key, materials);
        group.userData.sharedMaterials.push(
            materials.lit,
            materials.unlit,
            materials.hoverLit,
            materials.hoverUnlit,
        );
        return materials;
    }

    function getCraterBoundaryMaterial({ group, featureType = "", sunlit, hover = false }) {
        const materials = ensureCraterBoundaryMaterials(group, featureType);
        if (!materials) return null;
        if (hover) {
            return sunlit === false ? materials.hoverUnlit : materials.hoverLit;
        }
        return sunlit === false ? materials.unlit : materials.lit;
    }

    function updateCraterBoundaryStyles({ scene }) {
        const group = scene?.lunarCraterGroup;
        if (!group) return false;
        let changed = false;
        const sunNormal = resolveMoonSunLocalNormal(scene);
        group.traverse((object) => {
            if (!object?.userData?.craterRing || !Array.isArray(object.userData.centerNormal)) {
                return;
            }
            craterLabelNormal.fromArray(object.userData.centerNormal).normalize();
            const sunlit = resolveCraterSunlit({ scene, centerNormal: craterLabelNormal, sunNormal });
            const nextMaterial = getCraterBoundaryMaterial({
                group,
                featureType: object.userData.featureType,
                sunlit,
                hover: object.userData.hoverAnnotation === true ||
                    object.userData.searchAnnotation === true,
            });
            if (nextMaterial && object.material !== nextMaterial) {
                object.material = nextMaterial;
                object.userData.sunlit = sunlit;
                changed = true;
            }
        });
        return changed;
    }

    function setLunarCraterAnnotationsVisible({ scene, visible }) {
        if (scene?.lunarCraterGroup) {
            scene.lunarCraterGroup.visible = visible === true;
            if (visible !== true) {
                hideLunarCraterHover({ scene });
            }
            return true;
        }
        if (visible === true && scene?.moonContainer && getGlobalConfig()?.is_lunar) {
            addLunarCraterAnnotations({ scene });
            return true;
        }
        return false;
    }

    function setLunarCraterDiameterRange({
        scene,
        minDiameterKm,
        maxDiameterKm,
        camera = scene?.camera ?? null,
        rendererDomElement = scene?.cameraController?._rendererDomElement ??
            scene?.renderer?.domElement ??
            null,
    } = {}) {
        if (!scene) return false;
        const nextRange = normalizeCraterDisplayDiameterRange({
            lunarCraterMinDiameterKm: Number.isFinite(Number(minDiameterKm))
                ? Number(minDiameterKm)
                : scene.lunarCraterMinDiameterKm,
            lunarCraterMaxDiameterKm: Number.isFinite(Number(maxDiameterKm))
                ? Number(maxDiameterKm)
                : scene.lunarCraterMaxDiameterKm,
        }, getActiveCraterCatalog());
        if (
            scene.lunarCraterMinDiameterKm === nextRange.lunarCraterMinDiameterKm &&
            scene.lunarCraterMaxDiameterKm === nextRange.lunarCraterMaxDiameterKm
        ) {
            return false;
        }
        scene.lunarCraterMinDiameterKm = nextRange.lunarCraterMinDiameterKm;
        scene.lunarCraterMaxDiameterKm = nextRange.lunarCraterMaxDiameterKm;
        hideLunarCraterHover({ scene });
        if (scene.moonContainer && getGlobalConfig()?.is_lunar) {
            addLunarCraterAnnotations({ scene, camera, rendererDomElement });
            return true;
        }
        return false;
    }

    function setLunarCraterDisplayMode({
        scene,
        mode,
        camera = scene?.camera ?? null,
        rendererDomElement = scene?.cameraController?._rendererDomElement ??
            scene?.renderer?.domElement ??
            null,
    } = {}) {
        if (!scene) return false;
        const nextMode = normalizeCraterDisplayMode(mode);
        if (resolveDisplayMode(scene) === nextMode) {
            scene.lunarCraterDisplayMode = nextMode;
            return false;
        }
        scene.lunarCraterDisplayMode = nextMode;
        hideLunarCraterHover({ scene });
        if (scene.moonContainer && getGlobalConfig()?.is_lunar) {
            addLunarCraterAnnotations({ scene, camera, rendererDomElement });
            return true;
        }
        return true;
    }

    function setLunarCraterHoverLabelsEnabled({ scene, enabled }) {
        if (!scene) return false;
        const nextEnabled = enabled !== false;
        const changed = scene.lunarCraterHoverLabelsEnabled !== nextEnabled;
        scene.lunarCraterHoverLabelsEnabled = nextEnabled;
        if (!nextEnabled) {
            return hideLunarCraterHover({ scene }) || changed;
        }
        return changed;
    }

    function setLunarFeatureTypeFilters({
        scene,
        typeFilters,
        camera = scene?.camera ?? null,
        rendererDomElement = scene?.cameraController?._rendererDomElement ??
            scene?.renderer?.domElement ??
            null,
    } = {}) {
        if (!scene) return false;
        const nextFilters = normalizeLunarFeatureTypeFilters(
            typeFilters,
            resolveTypeFilters(scene),
        );
        const previous = normalizeLunarFeatureTypeFilters(scene.lunarFeatureTypeFilters, {});
        if (JSON.stringify(previous) === JSON.stringify(nextFilters)) {
            scene.lunarFeatureTypeFilters = nextFilters;
            return false;
        }
        scene.lunarFeatureTypeFilters = nextFilters;
        hideLunarCraterHover({ scene });
        if (scene.moonContainer && getGlobalConfig()?.is_lunar) {
            addLunarCraterAnnotations({ scene, camera, rendererDomElement });
            return true;
        }
        return true;
    }

    function setLunarFeatureSearchQuery({
        scene,
        searchQuery,
        camera = scene?.camera ?? null,
        rendererDomElement = scene?.cameraController?._rendererDomElement ??
            scene?.renderer?.domElement ??
            null,
    } = {}) {
        if (!scene) return false;
        const nextQuery = normalizeLunarFeatureSearchQuery(searchQuery);
        const previousQuery = normalizeLunarFeatureSearchQuery(scene.lunarFeatureSearchQuery);
        if (previousQuery === nextQuery) {
            scene.lunarFeatureSearchQuery = nextQuery;
            return false;
        }
        scene.lunarFeatureSearchQuery = nextQuery;
        hideLunarCraterHover({ scene });
        if (scene.moonContainer && getGlobalConfig()?.is_lunar) {
            addLunarCraterAnnotations({ scene, camera, rendererDomElement });
            return true;
        }
        return true;
    }

    function setLunarFeatureExcludedKeys({
        scene,
        excludedKeys,
        camera = scene?.camera ?? null,
        rendererDomElement = scene?.cameraController?._rendererDomElement ??
            scene?.renderer?.domElement ??
            null,
    } = {}) {
        if (!scene) return false;
        const nextKeys = normalizeLunarFeatureKeyList(excludedKeys);
        const previousKeys = normalizeLunarFeatureKeyList(scene.lunarFeatureExcludedKeys);
        const sameKeys = nextKeys.length === previousKeys.length &&
            nextKeys.every((key, index) => key === previousKeys[index]);
        if (sameKeys) {
            scene.lunarFeatureExcludedKeys = nextKeys;
            return false;
        }
        scene.lunarFeatureExcludedKeys = nextKeys;
        hideLunarCraterHover({ scene });
        if (scene.moonContainer && getGlobalConfig()?.is_lunar) {
            addLunarCraterAnnotations({ scene, camera, rendererDomElement });
            return true;
        }
        return true;
    }

    function updateLunarCraterLabelScales({ scene, camera, rendererDomElement = null, freezeScale = false }) {
        if (!scene?.lunarCraterGroup || !camera) {
            return false;
        }
        if (freezeScale === true) {
            return false;
        }
        if (resolveShowAllEnabled(scene)) {
            const nowMs = typeof performance !== "undefined" && typeof performance.now === "function"
                ? performance.now()
                : Date.now();
            const previousCheckMs = Number(scene.lunarCraterRenderPlanLastCheckMs) || 0;
            if (nowMs - previousCheckMs >= CRATER_RENDER_PLAN_CHECK_INTERVAL_MS) {
                scene.lunarCraterRenderPlanLastCheckMs = nowMs;
                const moonRadius = getMoonRadius();
                if (Number.isFinite(moonRadius) && moonRadius > 0) {
                    const craterFeatures = getCraterDisplayFeatures(getActiveCraterCatalog(), {
                        ...resolveDisplayDiameterRange(scene),
                        lunarFeatureTypeFilters: resolveTypeFilters(scene),
                        lunarFeatureSearchQuery: "",
                        lunarFeatureExcludedKeys: [],
                    });
                    const renderPlan = selectAlwaysRenderTargets({
                        scene,
                        camera,
                        rendererDomElement,
                        craterFeatures,
                        moonRadius,
                        lunarRadiusKm: getLunarRadiusKm(),
                        displayDiameterRange: resolveDisplayDiameterRange(scene),
                        filterState: {
                            lunarFeatureTypeFilters: resolveTypeFilters(scene),
                            lunarFeatureSearchQuery: "",
                            lunarFeatureExcludedKeys: [],
                        },
                    });
                    if (renderPlan.key !== scene.lunarCraterRenderContextKey) {
                        addLunarCraterAnnotations({ scene, camera, rendererDomElement });
                        return true;
                    }
                }
            }
        }
        let changed = updateCraterBoundaryStyles({ scene });
        let cameraNormalAvailable = false;
        if (scene.moonContainer?.worldToLocal && camera.getWorldPosition) {
            camera.getWorldPosition(cameraWorldPosition);
            cameraMoonLocalPosition.copy(cameraWorldPosition);
            scene.moonContainer.worldToLocal(cameraMoonLocalPosition);
            if (cameraMoonLocalPosition.lengthSq() > 1e-12) {
                cameraMoonLocalPosition.normalize();
                cameraNormalAvailable = true;
            }
        }
        scene.lunarCraterGroup.traverse((object) => {
            if (!object?.userData?.lunarCrater) {
                return;
            }
            if (cameraNormalAvailable && Array.isArray(object.userData.centerNormal)) {
                craterLabelNormal.fromArray(object.userData.centerNormal).normalize();
                const visibilityAngularRadius = Number(object.userData.visibilityAngularRadius);
                const visibilityThreshold = getCraterVisibilityThreshold(
                    Number.isFinite(visibilityAngularRadius) ? visibilityAngularRadius : 0,
                );
                const facingCamera = craterLabelNormal.dot(cameraMoonLocalPosition) > visibilityThreshold;
                if (object.userData.hoverLabel || object.userData.hoverAnnotation) {
                    if (object.visible && !facingCamera) {
                        object.visible = false;
                        changed = true;
                    }
                } else if (object.visible !== facingCamera) {
                    object.visible = facingCamera;
                    changed = true;
                }
                if (!facingCamera || !object.visible) {
                    return;
                }
            }
            if (!Number.isFinite(object.userData.baseScaleY)) {
                return;
            }
            const baseScaleX = object.userData.baseScaleX;
            const baseScaleY = object.userData.baseScaleY;
            object.getWorldPosition(labelWorldPosition);
            const ratio = calculateCraterLabelScaleRatio({
                camera,
                rendererDomElement,
                labelWorldHeight: baseScaleY,
                labelWorldPosition,
                maxScreenHeightPx: object.userData.hoverLabel
                    ? CRATER_HOVER_LABEL_MAX_SCREEN_HEIGHT_PX
                    : CRATER_LABEL_MAX_SCREEN_HEIGHT_PX,
                targetScreenHeightPx: object.userData.targetScreenHeightPx,
            });
            const hoverBoost = object.userData.hoverScaleBoost === true ? 1.12 : 1;
            const nextScaleX = baseScaleX * ratio * hoverBoost;
            const nextScaleY = baseScaleY * ratio * hoverBoost;
            if (object.scale.x !== nextScaleX || object.scale.y !== nextScaleY) {
                object.scale.set(nextScaleX, nextScaleY, 1);
                changed = true;
            }
        });
        return changed;
    }

    return {
        addLunarCraterAnnotations,
        disposeLunarCraterAnnotations,
        hideLunarCraterHover,
        setLunarCraterAnnotationsVisible,
        setLunarCraterDiameterRange,
        setLunarCraterDisplayMode,
        setLunarCraterHoverLabelsEnabled,
        setLunarFeatureTypeFilters,
        setLunarFeatureSearchQuery,
        setLunarFeatureExcludedKeys,
        updateLunarCraterLabelScales,
        updateLunarCraterHoverFromPointer,
    };
}

export {
    buildCraterCirclePositions,
    calculateCraterHoverLabelOffset,
    calculateCraterProjectedScreenBounds,
    calculateCraterLabelScaleRatio,
    calculateCraterProjectedRadiusPx,
    countCraterDisplayFeatures,
    createLunarCraterActions,
    formatCraterLabelText,
    getCraterDisplayFeatures,
    normalizeCraterDisplayDiameterRange,
    resolveCraterHoverTarget,
    resolveCraterHoverTargetFromScreen,
    resolveMoonSurfaceHitNormal,
};
