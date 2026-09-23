import { LUNAR_CRATER_RANGE_MIN_DIAMETER_KM } from "../core/domain/lunar-crater-view.js";
import { getCratersToShow } from "../core/domain/lunar-crater-catalog.js";
import { CRATER_RING_SURFACE_SCALE, CRATER_HOVER_RING_SURFACE_SCALE, CRATER_LABEL_SURFACE_SCALE, CRATER_ALWAYS_LABEL_SURFACE_SCALE, CRATER_ALWAYS_MIN_SCREEN_DIAMETER_PX, CRATER_ALWAYS_RENDER_LIMIT, CRATER_ALWAYS_RENDER_FALLBACK_LIMIT, CRATER_ALWAYS_LABEL_MAX_COUNT, CRATER_ALWAYS_LABEL_MIN_SCREEN_DIAMETER_PX, CRATER_ALWAYS_LABEL_SCREEN_SPACING_PX, CRATER_ALWAYS_LABEL_TARGET_SCREEN_HEIGHT_PX, CRATER_SEARCH_ANNOTATION_LIMIT, CRATER_SEARCH_LABEL_TARGET_SCREEN_HEIGHT_PX, CRATER_SEARCH_MAX_DIAMETER_KM, CRATER_DENSE_SELECTION_COUNT, DEG_TO_RAD } from "./lunar-crater-render-config.js";
import { normalizeCraterDisplayDiameterRange, getCraterDisplayFeatures, createCraterRing, getCameraViewportSize, calculateCraterHoverLabelOffset, calculateCraterProjectedScreenBounds, positionCraterHoverLabelFromScreenBounds, createCraterSearchLeaderLine, createCraterLabelSprite } from "./lunar-crater-render-primitives.js";
import { disposeObjectResources, resolveMoonSurfaceHitNormal } from "./lunar-crater-hit-testing.js";

export function createLunarCraterAnnotationRuntime({
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
    hasActiveCraterCatalog,
}) {
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    const cameraWorldPosition = new THREE.Vector3();
    const cameraWorldDirection = new THREE.Vector3();
    const cameraWorldUp = new THREE.Vector3();
    const cameraWorldRight = new THREE.Vector3();
    const cameraWorldQuaternion = new THREE.Quaternion();
    const moonWorldQuaternion = new THREE.Quaternion();
    const inverseMoonWorldQuaternion = new THREE.Quaternion();
    const cameraMoonLocalPosition = new THREE.Vector3();
    const cameraMoonLocalForward = new THREE.Vector3();
    const cameraMoonLocalUp = new THREE.Vector3();
    const cameraMoonLocalRight = new THREE.Vector3();
    const craterWorldPosition = new THREE.Vector3();
    const craterNdcPosition = new THREE.Vector3();

    function resolveCraterCameraContext({
        scene,
        camera,
        rendererDomElement,
        moonRadius,
    }) {
        if (!scene?.moonContainer || !camera || !Number.isFinite(moonRadius) || moonRadius <= 0) {
            return null;
        }
        camera.updateMatrixWorld?.();
        scene.moonContainer.updateWorldMatrix?.(true, true);

        let cameraDistance = null;
        let cameraMoonLocalNormal = null;
        let viewCenterNormal = null;
        if (scene.moonContainer.worldToLocal && camera.getWorldPosition) {
            camera.getWorldPosition(cameraWorldPosition);
            cameraMoonLocalPosition.copy(cameraWorldPosition);
            scene.moonContainer.worldToLocal(cameraMoonLocalPosition);
            cameraDistance = cameraMoonLocalPosition.length();
            if (cameraDistance > 1e-8) {
                cameraMoonLocalNormal = cameraMoonLocalPosition.clone().normalize();
            }
        }

        const viewportSize = getCameraViewportSize(camera, rendererDomElement);
        let cameraForwardNormal = null;
        let cameraUpNormal = null;
        let cameraRightNormal = null;
        if (camera.getWorldDirection) {
            camera.getWorldDirection(cameraWorldDirection);
            if (cameraWorldDirection.lengthSq() > 1e-12) {
                cameraMoonLocalForward.copy(cameraWorldDirection).normalize();
                if (scene.moonContainer.getWorldQuaternion) {
                    scene.moonContainer.getWorldQuaternion(moonWorldQuaternion);
                    inverseMoonWorldQuaternion.copy(moonWorldQuaternion).invert();
                    cameraMoonLocalForward.applyQuaternion(inverseMoonWorldQuaternion).normalize();
                }
                cameraForwardNormal = cameraMoonLocalForward.clone();
            }
        }
        if (camera.getWorldQuaternion) {
            camera.getWorldQuaternion(cameraWorldQuaternion);
            cameraWorldUp.set(0, 1, 0).applyQuaternion(cameraWorldQuaternion).normalize();
            cameraWorldRight.set(1, 0, 0).applyQuaternion(cameraWorldQuaternion).normalize();
            cameraMoonLocalUp.copy(cameraWorldUp);
            cameraMoonLocalRight.copy(cameraWorldRight);
            if (scene.moonContainer.getWorldQuaternion) {
                scene.moonContainer.getWorldQuaternion(moonWorldQuaternion);
                inverseMoonWorldQuaternion.copy(moonWorldQuaternion).invert();
                cameraMoonLocalUp.applyQuaternion(inverseMoonWorldQuaternion).normalize();
                cameraMoonLocalRight.applyQuaternion(inverseMoonWorldQuaternion).normalize();
            }
            if (cameraMoonLocalUp.lengthSq() > 1e-12) {
                cameraUpNormal = cameraMoonLocalUp.clone();
            }
            if (cameraMoonLocalRight.lengthSq() > 1e-12) {
                cameraRightNormal = cameraMoonLocalRight.clone();
            }
        }
        if (scene.moon && scene.moonContainer.worldToLocal) {
            pointerNdc.set(0, 0);
            raycaster.setFromCamera(pointerNdc, camera);
            const intersections = raycaster.intersectObject(scene.moon, true);
            const centerHitNormal = resolveMoonSurfaceHitNormal({
                scene,
                intersections,
                moonRadius,
            });
            if (centerHitNormal) {
                viewCenterNormal = centerHitNormal;
            }
        }
        if (!viewCenterNormal) {
            viewCenterNormal = cameraMoonLocalNormal;
        }

        const verticalFovDeg = Number.isFinite(camera.fov)
            ? Number(camera.fov)
            : (() => {
                if (
                    camera.isOrthographicCamera &&
                    Number.isFinite(camera.top) &&
                    Number.isFinite(camera.bottom)
                ) {
                    const viewHeight = Math.abs(camera.top - camera.bottom) / Math.max(0.0001, camera.zoom || 1);
                    return (2 * Math.atan((viewHeight * 0.5) / Math.max(0.0001, moonRadius))) / DEG_TO_RAD;
                }
                return 45;
            })();
        const horizontalFovDeg = Number.isFinite(verticalFovDeg)
            ? (2 * Math.atan(Math.tan(degreesToRadians(verticalFovDeg) * 0.5) *
                Math.max(0.0001, viewportSize.width / viewportSize.height))) / DEG_TO_RAD
            : null;

        const normalKey = cameraMoonLocalNormal
            ? [
                Math.round(cameraMoonLocalNormal.x * 48),
                Math.round(cameraMoonLocalNormal.y * 48),
                Math.round(cameraMoonLocalNormal.z * 48),
            ].join(":")
            : "none";
        const distanceKey = Number.isFinite(cameraDistance) && moonRadius > 0
            ? Math.round((cameraDistance / moonRadius) * 256)
            : "none";
        const viewCenterKey = viewCenterNormal
            ? [
                Math.round(viewCenterNormal.x * 48),
                Math.round(viewCenterNormal.y * 48),
                Math.round(viewCenterNormal.z * 48),
            ].join(":")
            : "none";
        const forwardKey = cameraForwardNormal
            ? [
                Math.round(cameraForwardNormal.x * 48),
                Math.round(cameraForwardNormal.y * 48),
                Math.round(cameraForwardNormal.z * 48),
            ].join(":")
            : "none";
        const viewportKey = [
            Math.round(viewportSize.width / 64),
            Math.round(viewportSize.height / 64),
        ].join(":");
        const fovKey = Number.isFinite(camera.fov) ? Math.round(camera.fov * 2) : "ortho";

        return {
            cameraMoonLocalNormal,
            cameraPositionMoonRadii:
                Number.isFinite(cameraDistance) && cameraDistance > 0 && Number.isFinite(moonRadius) && moonRadius > 0
                    ? cameraMoonLocalPosition.clone().divideScalar(moonRadius)
                    : null,
            cameraForwardNormal,
            cameraUpNormal,
            cameraRightNormal,
            viewCenterNormal,
            moonSunLocalNormal: resolveMoonSunLocalNormal(scene),
            verticalFovDeg,
            horizontalFovDeg,
            viewportSize,
            key: `${normalKey}|${distanceKey}|${viewCenterKey}|${forwardKey}|${viewportKey}|${fovKey}`,
        };
    }

    function isCraterTargetInCameraView({ scene, camera, target, moonRadius }) {
        if (!scene?.moonContainer || !camera || !target?.centerNormal) {
            return true;
        }
        craterWorldPosition.copy(target.centerNormal).multiplyScalar(moonRadius);
        scene.moonContainer.localToWorld?.(craterWorldPosition);
        craterNdcPosition.copy(craterWorldPosition).project(camera);
        return (
            Number.isFinite(craterNdcPosition.x) &&
            Number.isFinite(craterNdcPosition.y) &&
            Number.isFinite(craterNdcPosition.z) &&
            craterNdcPosition.x >= -1.18 &&
            craterNdcPosition.x <= 1.18 &&
            craterNdcPosition.y >= -1.18 &&
            craterNdcPosition.y <= 1.18 &&
            craterNdcPosition.z >= -1.05 &&
            craterNdcPosition.z <= 1.05
        );
    }

    function selectAlwaysRenderTargets({
        scene,
        camera,
        rendererDomElement,
        craterFeatures,
        moonRadius,
        lunarRadiusKm,
        displayDiameterRange,
        filterState = null,
    }) {
        const cameraContext = resolveCraterCameraContext({
            scene,
            camera,
            rendererDomElement,
            moonRadius,
        });
        if (!craterFeatures.length) {
            return {
                targets: [],
                key: "empty",
                smallestRenderedDiameterKm: null,
                filteredCount: 0,
                renderedCount: 0,
                dense: false,
            };
        }
        if (!cameraContext) {
            const targets = [];
            let smallestRenderedDiameterKm = null;
            for (const crater of craterFeatures.slice(0, CRATER_ALWAYS_RENDER_FALLBACK_LIMIT)) {
                const target = buildCraterPickTarget({ crater, moonRadius, lunarRadiusKm });
                target.showLabel = false;
                targets.push(target);
                smallestRenderedDiameterKm = crater.diameterKm;
            }
            return {
                targets,
                key: `fallback:${craterFeatures.length}`,
                smallestRenderedDiameterKm,
                filteredCount: craterFeatures.length,
                renderedCount: targets.length,
                dense: craterFeatures.length > CRATER_DENSE_SELECTION_COUNT,
            };
        }

        const craterPlan = getCratersToShow(getActiveCraterCatalog(), {
            ...displayDiameterRange,
            lunarFeatureTypeFilters: filterState?.lunarFeatureTypeFilters ?? resolveTypeFilters(scene),
            lunarFeatureSearchQuery: filterState?.lunarFeatureSearchQuery ?? resolveSearchQuery(scene),
            lunarFeaturePinnedNames: filterState?.lunarFeaturePinnedNames ?? resolvePinnedNames(scene),
            lunarFeatureExcludedKeys: filterState?.lunarFeatureExcludedKeys ?? resolveExcludedKeys(scene),
            viewCenterNormal: cameraContext.viewCenterNormal,
            observerNormal: cameraContext.cameraMoonLocalNormal,
            cameraPositionMoonRadii: cameraContext.cameraPositionMoonRadii,
            cameraForwardNormal: cameraContext.cameraForwardNormal,
            cameraUpNormal: cameraContext.cameraUpNormal,
            cameraRightNormal: cameraContext.cameraRightNormal,
            sunNormal: cameraContext.moonSunLocalNormal,
            verticalFovDeg: cameraContext.verticalFovDeg,
            horizontalFovDeg: cameraContext.horizontalFovDeg,
            viewportWidthPx: cameraContext.viewportSize.width,
            viewportHeightPx: cameraContext.viewportSize.height,
            lunarRadiusKm,
            maxCount: CRATER_ALWAYS_RENDER_LIMIT,
            minScreenDiameterPx: CRATER_ALWAYS_MIN_SCREEN_DIAMETER_PX,
            labelMaxCount: CRATER_ALWAYS_LABEL_MAX_COUNT,
            labelMinScreenDiameterPx: CRATER_ALWAYS_LABEL_MIN_SCREEN_DIAMETER_PX,
            labelSpacingPx: CRATER_ALWAYS_LABEL_SCREEN_SPACING_PX,
        });
        const featureSet = new Set(craterFeatures);
        const targets = craterPlan.craters
            .filter((entry) => featureSet.has(entry.crater))
            .map((entry) => {
                const target = buildCraterPickTarget({
                    crater: entry.crater,
                    moonRadius,
                    lunarRadiusKm,
                });
                target.projectedDiameterPx = entry.projectedDiameterPx;
                target.showLabel = entry.showLabel === true;
                target.sunlit = entry.sunlit;
                return target;
            });
        let smallestRenderedDiameterKm = null;
        for (const target of targets) {
            smallestRenderedDiameterKm = smallestRenderedDiameterKm == null
                ? target.crater.diameterKm
                : Math.min(smallestRenderedDiameterKm, target.crater.diameterKm);
        }

        return {
            targets,
            key: [
                cameraContext.key,
                craterFeatures.length,
                targets.length,
                smallestRenderedDiameterKm == null
                    ? "none"
                    : Math.round(smallestRenderedDiameterKm),
            ].join("|"),
            smallestRenderedDiameterKm,
            filteredCount: craterPlan.filteredCount,
            renderedCount: targets.length,
            dense: craterFeatures.length > CRATER_DENSE_SELECTION_COUNT,
        };
    }

    function selectSearchAnnotationTargets({
        scene,
        camera,
        rendererDomElement,
        craterFeatures,
        moonRadius,
        lunarRadiusKm,
        displayDiameterRange,
        filterState = null,
    }) {
        if (!craterFeatures.length) {
            return [];
        }
        if (Array.isArray(filterState?.lunarFeaturePinnedNames) && filterState.lunarFeaturePinnedNames.length > 0) {
            return craterFeatures.slice(0, CRATER_SEARCH_ANNOTATION_LIMIT)
                .map((crater) => {
                    const target = buildCraterPickTarget({ crater, moonRadius, lunarRadiusKm });
                    target.showLabel = true;
                    target.searchAnnotation = true;
                    target.sunlit = resolveCraterSunlit({ scene, centerNormal: target.centerNormal });
                    return target;
                });
        }
        const cameraContext = resolveCraterCameraContext({
            scene,
            camera,
            rendererDomElement,
            moonRadius,
        });
        if (!cameraContext) {
            return craterFeatures.slice(0, CRATER_SEARCH_ANNOTATION_LIMIT)
                .map((crater) => {
                    const target = buildCraterPickTarget({ crater, moonRadius, lunarRadiusKm });
                    target.showLabel = true;
                    target.searchAnnotation = true;
                    return target;
                });
        }
        const craterPlan = getCratersToShow(getActiveCraterCatalog(), {
            ...displayDiameterRange,
            lunarFeatureTypeFilters: filterState?.lunarFeatureTypeFilters ?? resolveTypeFilters(scene),
            lunarFeatureSearchQuery: filterState?.lunarFeatureSearchQuery ?? resolveSearchQuery(scene),
            lunarFeatureExcludedKeys: filterState?.lunarFeatureExcludedKeys ?? resolveExcludedKeys(scene),
            viewCenterNormal: cameraContext.viewCenterNormal,
            observerNormal: cameraContext.cameraMoonLocalNormal,
            cameraPositionMoonRadii: cameraContext.cameraPositionMoonRadii,
            cameraForwardNormal: cameraContext.cameraForwardNormal,
            cameraUpNormal: cameraContext.cameraUpNormal,
            cameraRightNormal: cameraContext.cameraRightNormal,
            sunNormal: cameraContext.moonSunLocalNormal,
            verticalFovDeg: cameraContext.verticalFovDeg,
            horizontalFovDeg: cameraContext.horizontalFovDeg,
            viewportWidthPx: cameraContext.viewportSize.width,
            viewportHeightPx: cameraContext.viewportSize.height,
            lunarRadiusKm,
            maxCount: CRATER_SEARCH_ANNOTATION_LIMIT,
            minScreenDiameterPx: 0,
            labelEveryRenderedCrater: true,
        });
        const featureSet = new Set(craterFeatures);
        return craterPlan.craters
            .filter((entry) => featureSet.has(entry.crater))
            .map((entry) => {
                const target = buildCraterPickTarget({
                    crater: entry.crater,
                    moonRadius,
                    lunarRadiusKm,
                });
                target.projectedDiameterPx = entry.projectedDiameterPx;
                target.showLabel = true;
                target.searchAnnotation = true;
                target.sunlit = entry.sunlit;
                return target;
            });
    }

    function createSearchAnnotation({
        group,
        scene,
        camera,
        rendererDomElement,
        target,
        moonRadius,
        lunarRadiusKm,
    }) {
        const craterScreenBounds = calculateCraterProjectedScreenBounds({
            THREE,
            scene,
            camera,
            rendererDomElement,
            normal: target.centerNormal,
            angularRadius: target.angularRadius,
            moonRadius,
        });
        const offsetAngularRadius = calculateCraterHoverLabelOffset({
            angularRadius: target.angularRadius,
            projectedCraterRadiusPx: craterScreenBounds?.radiusPx ?? target.projectedDiameterPx * 0.5,
            labelScreenHeightPx: CRATER_SEARCH_LABEL_TARGET_SCREEN_HEIGHT_PX,
        });
        const cameraContext = resolveCraterCameraContext({
            scene,
            camera,
            rendererDomElement,
            moonRadius,
        });
        const sunlit = resolveCraterSunlit({ scene, centerNormal: target.centerNormal });
        const ring = createCraterRing({
            THREE,
            crater: target.crater,
            normal: target.centerNormal,
            moonRadius,
            material: getCraterBoundaryMaterial({
                group,
                featureType: target.crater.featureType,
                sunlit,
                hover: true,
            }),
            lunarRadiusKm,
            surfaceScale: CRATER_HOVER_RING_SURFACE_SCALE,
            renderOrder: 18,
            namePrefix: "lunar-feature-search-ring",
            hoverAnnotation: true,
        });
        ring.userData.searchAnnotation = true;
        ring.userData.sunlit = sunlit;

        const label = createCraterLabelSprite({
            THREE,
            crater: target.crater,
            normal: target.centerNormal,
            moonRadius,
            surfaceScale: CRATER_LABEL_SURFACE_SCALE,
            depthTest: false,
            renderOrder: 21,
            namePrefix: "lunar-feature-search-label",
            hoverLabel: false,
            labelWidthMin: 0.24,
            labelWidthMax: 0.46,
            labelWidthBase: 0.17,
            labelWidthPerNameChar: 0.01,
            offsetAngularRadius,
            visibilityAngularRadius: target.angularRadius,
            targetScreenHeightPx: CRATER_SEARCH_LABEL_TARGET_SCREEN_HEIGHT_PX,
            cameraUpNormal: cameraContext?.cameraUpNormal ?? null,
            cameraRightNormal: cameraContext?.cameraRightNormal ?? null,
            searchAnnotation: true,
        });
        if (label) {
            positionCraterHoverLabelFromScreenBounds({
                THREE,
                scene,
                camera,
                rendererDomElement,
                label,
                craterScreenBounds,
            });
        }
        const leader = label
            ? createCraterSearchLeaderLine({
                THREE,
                crater: target.crater,
                centerNormal: target.centerNormal,
                label,
                moonRadius,
                angularRadius: target.angularRadius,
            })
            : null;
        return { ring, label, leader };
    }

    function addLunarCraterAnnotations({
        scene,
        camera = scene?.camera ?? null,
        rendererDomElement = scene?.cameraController?._rendererDomElement ??
            scene?.renderer?.domElement ??
            null,
    } = {}) {
        const globalConfig = getGlobalConfig();
        if (!scene || !globalConfig?.is_lunar || !scene.moonContainer) {
            return;
        }
        if (!hasActiveCraterCatalog()) {
            ensureCraterCatalogForScene({ scene, camera, rendererDomElement });
            return;
        }

        const hoverLabelsEnabled = scene.lunarCraterHoverLabelsEnabled !== false;
        disposeLunarCraterAnnotations({ scene });

        const moonRadius = getMoonRadius();
        if (!Number.isFinite(moonRadius) || moonRadius <= 0) {
            return;
        }

        const lunarRadiusKm = getLunarRadiusKm();
        const displayDiameterRange = resolveDisplayDiameterRange(scene);
        const hoverDiameterRange = resolveHoverDiameterRange(scene);
        const displayMode = resolveDisplayMode(scene);
        const shouldShowAlways = resolveShowAllEnabled(scene);
        const shouldHover = resolveHoverEnabled(scene);
        const showAllFilterState = {
            lunarFeatureTypeFilters: resolveTypeFilters(scene),
            lunarFeatureSearchQuery: "",
            lunarFeatureExcludedKeys: [],
        };
        const hoverFilterState = {
            lunarFeatureTypeFilters: resolveHoverTypeFilters(scene),
            lunarFeatureSearchQuery: "",
            lunarFeatureExcludedKeys: [],
        };
        const searchFilterState = {
            lunarFeatureSearchQuery: resolveSearchQuery(scene),
            lunarFeaturePinnedNames: resolvePinnedNames(scene),
            lunarFeatureExcludedKeys: resolveExcludedKeys(scene),
        };
        const hasSearchQuery = searchFilterState.lunarFeatureSearchQuery.length > 0 ||
            searchFilterState.lunarFeaturePinnedNames.length > 0;
        const group = new THREE.Group();
        group.name = "lunar-crater-annotations";
        group.visible = getViewLunarCraters() === true || shouldShowAlways || shouldHover || hasSearchQuery;
        group.userData.sharedMaterials = [];

        const annotations = [];
        const pickTargets = [];
        const craterFeatures = getCraterDisplayFeatures(getActiveCraterCatalog(), {
            ...displayDiameterRange,
            ...showAllFilterState,
        });
        const hoverCraterFeatures = shouldHover
            ? getCraterDisplayFeatures(getActiveCraterCatalog(), {
                ...hoverDiameterRange,
                ...hoverFilterState,
            })
            : [];
        const searchDiameterRange = normalizeCraterDisplayDiameterRange({
            lunarCraterMinDiameterKm: LUNAR_CRATER_RANGE_MIN_DIAMETER_KM,
            lunarCraterMaxDiameterKm: CRATER_SEARCH_MAX_DIAMETER_KM,
        }, getActiveCraterCatalog());
        const searchCraterFeatures = hasSearchQuery
            ? getCraterDisplayFeatures(getActiveCraterCatalog(), {
                ...searchDiameterRange,
                ...searchFilterState,
            })
            : [];
        const renderPlan = shouldShowAlways
            ? selectAlwaysRenderTargets({
                scene,
                camera,
                rendererDomElement,
                craterFeatures,
                moonRadius,
                lunarRadiusKm,
                displayDiameterRange,
                filterState: showAllFilterState,
            })
            : {
                targets: [],
                key: null,
                smallestRenderedDiameterKm: null,
                filteredCount: craterFeatures.length,
                renderedCount: 0,
                dense: craterFeatures.length > CRATER_DENSE_SELECTION_COUNT,
        };
        const renderTargets = shouldShowAlways ? renderPlan.targets : [];
        if (shouldShowAlways) {
            for (const target of renderTargets) {
                ensureCraterBoundaryMaterials(group, target.crater?.featureType);
            }
        }
        const searchTargets = hasSearchQuery
            ? selectSearchAnnotationTargets({
                scene,
                camera,
                rendererDomElement,
                craterFeatures: searchCraterFeatures,
                moonRadius,
                lunarRadiusKm,
                displayDiameterRange: searchDiameterRange,
                filterState: searchFilterState,
            })
            : [];
        const renderTargetsByName = new Map();
        for (const target of renderTargets) {
            const key = target.crater?.name || target.crater?.cleanName || "";
            if (key) renderTargetsByName.set(key, target);
        }
        const searchAnnotationTargets = [];
        for (const target of searchTargets) {
            const key = target.crater?.name || target.crater?.cleanName || "";
            const existingTarget = renderTargetsByName.get(key);
            if (existingTarget) {
                existingTarget.showLabel = true;
                existingTarget.searchAnnotation = true;
                existingTarget.sunlit = target.sunlit;
            } else {
                searchAnnotationTargets.push(target);
            }
        }
        for (const target of searchAnnotationTargets) {
            ensureCraterBoundaryMaterials(group, target.crater?.featureType);
        }

        const visualTargetsByName = new Map();
        for (const target of [...renderTargets, ...searchAnnotationTargets]) {
            const key = target.crater?.name || target.crater?.cleanName || "";
            if (key) {
                visualTargetsByName.set(key, target);
            }
        }
        if (shouldHover) {
            for (const crater of hoverCraterFeatures) {
                const target = buildCraterPickTarget({ crater, moonRadius, lunarRadiusKm });
                const visualTarget = visualTargetsByName.get(crater.name || crater.cleanName || "");
                if (visualTarget) {
                    target.showLabel = visualTarget.showLabel === true;
                    target.searchAnnotation = visualTarget.searchAnnotation === true;
                    target.sunlit = visualTarget.sunlit;
                    target.ring = visualTarget.ring || null;
                    target.label = visualTarget.label || null;
                }
                pickTargets.push(target);
            }
        } else if (shouldShowAlways) {
            pickTargets.push(...renderTargets);
        } else if (hasSearchQuery && searchAnnotationTargets.length) {
            pickTargets.push(...searchAnnotationTargets);
        }

        for (const target of renderTargets) {
            const crater = target.crater;

            const ring = createCraterRing({
                THREE,
                crater,
                normal: target.centerNormal,
                moonRadius,
                    material: getCraterBoundaryMaterial({
                        group,
                        featureType: crater.featureType,
                        sunlit: target.sunlit,
                        hover: target.searchAnnotation === true,
                    }),
                    lunarRadiusKm,
                    surfaceScale: target.searchAnnotation === true
                        ? CRATER_HOVER_RING_SURFACE_SCALE
                        : CRATER_RING_SURFACE_SCALE,
                    renderOrder: target.searchAnnotation === true ? 18 : 7,
                    hoverAnnotation: false,
                });
            ring.userData.sunlit = target.sunlit;
            ring.userData.searchAnnotation = target.searchAnnotation === true;
            const label = target.showLabel === true
                ? createCraterLabelSprite({
                    THREE,
                    crater,
                    normal: target.centerNormal,
                    moonRadius,
                    surfaceScale: CRATER_ALWAYS_LABEL_SURFACE_SCALE,
                    depthTest: false,
                    renderOrder: 9,
                    namePrefix: "lunar-crater-label",
                    hoverLabel: false,
                    labelWidthMin: 0.16,
                    labelWidthMax: 0.36,
                    labelWidthBase: 0.11,
                    labelWidthPerNameChar: 0.008,
                    visibilityAngularRadius: target.angularRadius,
                    targetScreenHeightPx: CRATER_ALWAYS_LABEL_TARGET_SCREEN_HEIGHT_PX,
                    searchAnnotation: target.searchAnnotation === true,
                })
                : null;
            target.ring = ring;
            target.label = label;
            group.add(ring);
            annotations.push(ring);
            if (label) {
                group.add(label);
                annotations.push(label);
            }
        }

        if (hasSearchQuery) {
            const existingSearchKeys = new Set();
            for (const target of searchAnnotationTargets) {
                const key = target.crater?.name || "";
                if (!key || existingSearchKeys.has(key)) {
                    continue;
                }
                existingSearchKeys.add(key);
                const { ring, label, leader } = createSearchAnnotation({
                    group,
                    scene,
                    camera,
                    rendererDomElement,
                    target,
                    moonRadius,
                    lunarRadiusKm,
                });
                target.ring = ring || null;
                target.label = label || null;
                if (ring) {
                    group.add(ring);
                    annotations.push(ring);
                }
                if (leader) {
                    group.add(leader);
                    annotations.push(leader);
                }
                if (label) {
                    group.add(label);
                    annotations.push(label);
                }
            }
        }
        for (const target of pickTargets) {
            const key = target.crater?.name || target.crater?.cleanName || "";
            const visualTarget = key ? visualTargetsByName.get(key) : null;
            if (!visualTarget) continue;
            target.ring = visualTarget.ring || target.ring || null;
            target.label = visualTarget.label || target.label || null;
        }

        scene.lunarCraterMinDiameterKm = displayDiameterRange.lunarCraterMinDiameterKm;
        scene.lunarCraterMaxDiameterKm = displayDiameterRange.lunarCraterMaxDiameterKm;
        scene.lunarCraterHoverMinDiameterKm = hoverDiameterRange.lunarCraterMinDiameterKm;
        scene.lunarCraterHoverMaxDiameterKm = hoverDiameterRange.lunarCraterMaxDiameterKm;
        scene.lunarCraterShowAllEnabled = shouldShowAlways;
        scene.lunarCraterHoverEnabled = shouldHover;
        scene.lunarCraterDisplayMode = displayMode;
        scene.lunarFeatureTypeFilters = showAllFilterState.lunarFeatureTypeFilters;
        scene.lunarFeatureSearchQuery = searchFilterState.lunarFeatureSearchQuery;
        scene.lunarFeaturePinnedNames = searchFilterState.lunarFeaturePinnedNames;
        scene.lunarFeatureExcludedKeys = searchFilterState.lunarFeatureExcludedKeys;
        scene.lunarFeatureHoverTypeFilters = hoverFilterState.lunarFeatureTypeFilters;
        scene.lunarFeatureHoverSearchQuery = "";
        scene.lunarFeatureHoverExcludedKeys = [];
        scene.lunarCraterFilteredCount = craterFeatures.length;
        scene.lunarCraterRenderedCount = renderPlan.renderedCount;
        scene.lunarCraterRenderOmittedCount = Math.max(0, craterFeatures.length - renderPlan.renderedCount);
        scene.lunarCraterRenderDense = renderPlan.dense;
        scene.lunarCraterRenderContextKey = renderPlan.key;
        scene.lunarCraterSmallestRenderedDiameterKm = renderPlan.smallestRenderedDiameterKm;
        scene.lunarCraterRenderPlanLastCheckMs = 0;
        scene.lunarCraterGroup = group;
        scene.lunarCraterAnnotations = annotations;
        scene.lunarCraterPickTargets = pickTargets;
        scene.lunarCraterHoverLabelsEnabled = hoverLabelsEnabled;
        scene.lunarCraterHoverLabel = null;
        scene.lunarCraterHoverRing = null;
        scene.lunarCraterHoverMaterial = null;
        scene.lunarCraterHoveredLabel = null;
        scene.lunarCraterHoveredRing = null;
        scene.lunarCraterHoveredName = null;
        scene.lunarCraterHoveredDiameterKm = null;
        scene.moonContainer.add(group);
    }

    function disposeLunarCraterAnnotations({ scene }) {
        const group = scene?.lunarCraterGroup;
        if (!group) {
            if (scene) {
                scene.lunarCraterAnnotations = [];
                scene.lunarCraterPickTargets = [];
                scene.lunarCraterHoverLabel = null;
                scene.lunarCraterHoverRing = null;
                scene.lunarCraterHoverMaterial = null;
                scene.lunarCraterHoveredLabel = null;
                scene.lunarCraterHoveredRing = null;
                scene.lunarCraterHoveredName = null;
                scene.lunarCraterHoveredDiameterKm = null;
                scene.lunarCraterFilteredCount = 0;
                scene.lunarCraterRenderedCount = 0;
                scene.lunarCraterRenderOmittedCount = 0;
                scene.lunarCraterRenderDense = false;
                scene.lunarCraterRenderContextKey = null;
                scene.lunarCraterSmallestRenderedDiameterKm = null;
                scene.lunarCraterRenderPlanLastCheckMs = 0;
            }
            return;
        }

        if (group.parent) {
            group.parent.remove(group);
        }

        const disposedMaterials = new Set();
        const disposedTextures = new Set();
        group.traverse((object) => {
            disposeObjectResources(object, disposedMaterials, disposedTextures);
        });
        for (const material of group.userData?.sharedMaterials || []) {
            if (!disposedMaterials.has(material)) {
                if (material.map && !disposedTextures.has(material.map)) {
                    material.map.dispose?.();
                    disposedTextures.add(material.map);
                }
                material.dispose?.();
                disposedMaterials.add(material);
            }
        }
        scene.lunarCraterGroup = null;
        scene.lunarCraterAnnotations = [];
        scene.lunarCraterPickTargets = [];
        scene.lunarCraterHoverLabel = null;
        scene.lunarCraterHoverRing = null;
        scene.lunarCraterHoverMaterial = null;
        scene.lunarCraterHoveredLabel = null;
        scene.lunarCraterHoveredRing = null;
        scene.lunarCraterHoveredName = null;
        scene.lunarCraterHoveredDiameterKm = null;
        scene.lunarCraterFilteredCount = 0;
        scene.lunarCraterRenderedCount = 0;
        scene.lunarCraterRenderOmittedCount = 0;
        scene.lunarCraterRenderDense = false;
        scene.lunarCraterRenderContextKey = null;
        scene.lunarCraterSmallestRenderedDiameterKm = null;
        scene.lunarCraterRenderPlanLastCheckMs = 0;
    }

    return { resolveCraterCameraContext, selectAlwaysRenderTargets,
        addLunarCraterAnnotations, disposeLunarCraterAnnotations };
}
