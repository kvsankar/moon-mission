import {
    applySceneOrbitVisibility,
    getSceneOrbitBuildOrder,
    getScenePrimaryCraftId,
} from "./scene-craft-helpers.js";
import { resolveMissionCraft } from "../core/domain/mission-config.js";
import {
    mixColors,
    normalizeHexColor,
    ORBIT_TRAIL_STYLE,
    resolveTrackOpacity3D,
    resolveTailVisualStyle,
} from "./orbit-trail-style.js";
import { invalidateSceneOrbitOverlap } from "./orbit-overlap-manager.js";
import {
    resolveGeneratedCurvePoints,
    resolvePostHorizonExtension,
} from "./post-horizons-extension.js";

const GENERATED_ORBIT_SEGMENT_COLOR = "#ffb347";

export function createSpacecraftCurveActions({
    THREE,
    getGlobalConfig,
    planetProperties,
    getViewOrbitDescent,
    getViewOrbit,
    getOrbitStyle = () => "classic",
    getTrailTrackBrightness3D = () => 1,
    getTrailTailBrightness3D = () => 1,
    render,
    wait10,
    createLineMaterial,
}) {
    function applyCraftOrbitVisibility(scene, globalConfig) {
        applySceneOrbitVisibility(
            scene,
            globalConfig,
            getViewOrbit(),
            getOrbitStyle(),
            getTrailTrackBrightness3D(),
            getTrailTailBrightness3D(),
        );
        scene?.updateOrbitMilestoneVisibility?.();
    }

    function isValidVector3(point) {
        return !!point &&
            Number.isFinite(point.x) &&
            Number.isFinite(point.y) &&
            Number.isFinite(point.z);
    }

    function createLineGeometryFromPoints(points) {
        const vertices = new Float32Array(points.length * 3);
        let offset = 0;
        for (const point of points) {
            vertices[offset++] = point.x;
            vertices[offset++] = point.y;
            vertices[offset++] = point.z;
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
            "position",
            new THREE.Float32BufferAttribute(vertices, 3),
        );
        return geometry;
    }

    function createDynamicLineGeometry(maxPoints) {
        const capacity = Math.max(2, maxPoints);
        const geometry = new THREE.BufferGeometry();
        const attribute = new THREE.Float32BufferAttribute(
            new Float32Array(capacity * 3),
            3,
        );
        attribute.setUsage?.(THREE.DynamicDrawUsage);
        geometry.setAttribute("position", attribute);
        geometry.setDrawRange(0, 0);
        return geometry;
    }

    function resolveCraftOrbitColor(globalConfig, craftId) {
        const missionCraft = resolveMissionCraft(globalConfig, craftId);
        const explicitProps =
            planetProperties[missionCraft?.id] ||
            planetProperties[missionCraft?.mnemonic] ||
            planetProperties[craftId];
        if (explicitProps?.orbitcolor || explicitProps?.color) {
            return explicitProps.orbitcolor || explicitProps.color;
        }

        const fallbackProps = planetProperties.SC;
        return (
            missionCraft?.orbitcolor ||
            missionCraft?.color ||
            fallbackProps?.orbitcolor ||
            fallbackProps?.color ||
            "#6ccfff"
        );
    }

    function createOrbitTrailBundle({ bodyId, curve, baseColor }) {
        const normalizedBaseColor = normalizeHexColor(baseColor);
        const tailStyle = resolveTailVisualStyle({
            dimension: "3D",
            prominence: getTrailTailBrightness3D(),
        });
        const tailGeometry = createDynamicLineGeometry(curve.length);
        const midGeometry = createDynamicLineGeometry(curve.length);
        const headGlowGeometry = createDynamicLineGeometry(curve.length);
        const headGeometry = createDynamicLineGeometry(curve.length);
        const tailLine = new THREE.Line(
            tailGeometry,
            createLineMaterial(normalizedBaseColor, {
                transparent: true,
                opacity: tailStyle.tailOpacity,
                depthWrite: false,
            }),
        );
        const midLine = new THREE.Line(
            midGeometry,
            createLineMaterial(mixColors(normalizedBaseColor, "#ffffff", 0.22), {
                transparent: true,
                opacity: tailStyle.midOpacity,
                depthWrite: false,
            }),
        );
        const headGlowLine = new THREE.Line(
            headGlowGeometry,
            createLineMaterial(mixColors(normalizedBaseColor, "#ffffff", 0.58), {
                transparent: true,
                opacity: tailStyle.headGlowOpacity,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
            }),
        );
        const headLine = new THREE.Line(
            headGeometry,
            createLineMaterial(mixColors(normalizedBaseColor, "#ffffff", 0.42), {
                transparent: true,
                opacity: tailStyle.headOpacity,
                depthWrite: false,
            }),
        );

        tailLine.userData = { ...(tailLine.userData || {}), bodyId };
        midLine.userData = { ...(midLine.userData || {}), bodyId };
        headGlowLine.userData = { ...(headGlowLine.userData || {}), bodyId };
        headLine.userData = { ...(headLine.userData || {}), bodyId };
        tailLine.renderOrder = 12;
        midLine.renderOrder = 13;
        headGlowLine.renderOrder = 14;
        headLine.renderOrder = 15;
        tailLine.visible = false;
        midLine.visible = false;
        headGlowLine.visible = false;
        headLine.visible = false;

        return {
            tailLine,
            midLine,
            headGlowLine,
            headLine,
        };
    }

    async function addCurve(scene, { bodyId, curve, baseColor, baseOpacity, globalConfig }) {
        const validCurve = curve.filter(isValidVector3);
        let startingIndex = validCurve.length;
        let leftOrbitPoints = startingIndex;
        const orbitLines = [];
        const orbitChunks = [];
        const orbitBaseOpacities = [];
        scene.orbitLinesByBodyId[bodyId] = orbitLines;
        scene.orbitBackgroundChunksByBodyId[bodyId] = orbitChunks;
        scene.orbitBackgroundBaseOpacitiesByBodyId[bodyId] = orbitBaseOpacities;
        scene.generatedOrbitLinesByBodyId ||= {};

        do {
            const points = Math.min(leftOrbitPoints, scene.pointsPerSlice);
            if (points <= 0) {
                break;
            }

            startingIndex -= points;
            leftOrbitPoints -= points;

            const arr = validCurve.slice(startingIndex, startingIndex + points + 1);
            if (arr.length < 2) {
                continue;
            }

            const orbitGeometry = createLineGeometryFromPoints(arr);
            const orbitLine = new THREE.Line(
                orbitGeometry,
                createLineMaterial(baseColor, {
                    transparent: true,
                    opacity: baseOpacity,
                    depthWrite: false,
                }),
            );
            orbitLine.userData = {
                ...(orbitLine.userData || {}),
                bodyId,
                baseOpacity,
                lineWidthClassic: orbitLine?.material?.linewidth,
            };
            orbitLine.visible = false;
            orbitLines.push(orbitLine);
            orbitChunks.push({
                points: arr,
                startIndex: Math.max(0, startingIndex),
                endIndex: Math.max(0, startingIndex + arr.length - 1),
            });
            orbitBaseOpacities.push(baseOpacity);
            scene.orbitLines.push(orbitLine);
            scene.motherContainer.add(orbitLine);
            applyCraftOrbitVisibility(scene, globalConfig);
            render();
            await wait10();
            if (scene.stopCreationFlag) {
                break;
            }
        } while (true);

        const curveTimes = Array.isArray(scene.curveTimesById?.[bodyId])
            ? scene.curveTimesById[bodyId]
            : [];
        const postHorizonExtension = resolvePostHorizonExtension(globalConfig, scene?.name || "geo");
        const generatedCurve = resolveGeneratedCurvePoints(
            validCurve,
            curveTimes,
            postHorizonExtension?.sourceEndMs,
        );
        if (generatedCurve.length >= 2) {
            const generatedOrbitLine = new THREE.Line(
                createLineGeometryFromPoints(generatedCurve),
                createLineMaterial(GENERATED_ORBIT_SEGMENT_COLOR, {
                    transparent: true,
                    opacity: 0.98,
                    depthWrite: false,
                    linewidth: 0.4,
                }),
            );
            generatedOrbitLine.userData = {
                ...(generatedOrbitLine.userData || {}),
                bodyId,
                generatedSegment: true,
            };
            generatedOrbitLine.renderOrder = 16;
            generatedOrbitLine.visible = false;
            scene.generatedOrbitLinesByBodyId[bodyId] = generatedOrbitLine;
            scene.motherContainer.add(generatedOrbitLine);
            applyCraftOrbitVisibility(scene, globalConfig);
            render();
        } else {
            scene.generatedOrbitLinesByBodyId[bodyId] = null;
        }
    }

    function addSpacecraftCurve(scene) {
        invalidateSceneOrbitOverlap(scene);
        scene.orbitLines = [];
        scene.orbitLinesByBodyId = {};
        scene.generatedOrbitLinesByBodyId = {};
        scene.orbitBackgroundChunksByBodyId = {};
        scene.orbitBackgroundBaseOpacitiesByBodyId = {};
        scene.orbitMaterialsByBodyId = {};
        scene.orbitTrailLinesByBodyId = {};
        scene.pointsPerSlice = 400;
        scene.startingIndex = 0;
        scene.leftOrbitPoints = 0;

        const globalConfig = getGlobalConfig();
        const craftIds = getSceneOrbitBuildOrder(scene, globalConfig);
        const primaryCraftId = getScenePrimaryCraftId(scene, globalConfig);
        scene.primaryCraftId = primaryCraftId;

        const addAllCurves = async () => {
            for (const craftId of craftIds) {
                const curve = scene.curvesById?.[craftId] || [];
                if (curve.filter(isValidVector3).length < 2) {
                    scene.orbitLinesByBodyId[craftId] = [];
                    scene.orbitBackgroundChunksByBodyId[craftId] = [];
                    scene.orbitBackgroundBaseOpacitiesByBodyId[craftId] = [];
                    continue;
                }
                const craftOrbitColor = resolveCraftOrbitColor(globalConfig, craftId);
                await addCurve(scene, {
                    bodyId: craftId,
                    curve,
                    baseColor: craftOrbitColor,
                    baseOpacity: Number.isFinite(scene?.trailContextOpacity3D)
                        ? scene.trailContextOpacity3D
                        : resolveTrackOpacity3D(getTrailTrackBrightness3D()),
                    globalConfig,
                });
                if (scene.stopCreationFlag) {
                    break;
                }
                const trailBundle = createOrbitTrailBundle({
                    bodyId: craftId,
                    curve,
                    baseColor: craftOrbitColor,
                });
                scene.orbitTrailLinesByBodyId[craftId] = trailBundle;
                scene.motherContainer.add(trailBundle.tailLine);
                scene.motherContainer.add(trailBundle.midLine);
                scene.motherContainer.add(trailBundle.headGlowLine);
                scene.motherContainer.add(trailBundle.headLine);
                applyCraftOrbitVisibility(scene, globalConfig);
                if (scene.stopCreationFlag) {
                    break;
                }
            }
            applyCraftOrbitVisibility(scene, globalConfig);
            scene.state = scene.constructor.SCENE_STATE_ADD_CURVE_DONE;
        };

        addAllCurves();

        if (
            scene.name == "lunar" &&
            globalConfig &&
            globalConfig.landing &&
            globalConfig.landing.enabled &&
            scene.landingCurve.length > 0
        ) {
            const validLandingCurve = scene.landingCurve.filter(isValidVector3);
            if (validLandingCurve.length < 2) {
                return;
            }

            const landingOrbitGeometry = createLineGeometryFromPoints(validLandingCurve);
            const landingOrbitColor = "#FFFFE0"; // Light yellow for landing orbit
            const landingOrbitMaterial = createLineMaterial(landingOrbitColor);
            scene.landingOrbitLine = new THREE.Line(
                landingOrbitGeometry,
                landingOrbitMaterial,
            );
            scene.landingOrbitLine.visible = getViewOrbitDescent();
            scene.motherContainer.add(scene.landingOrbitLine);
            render();
        }
    }

    function disposeSpacecraftCurve(scene) {
        invalidateSceneOrbitOverlap(scene);
        scene.disposeOrbitMilestones3D?.();
        if (scene.orbitLines) {
            scene.orbitLines.forEach((line) => {
                if (line.geometry) {
                    line.geometry.dispose();
                }
                if (line.material) {
                    line.material.dispose();
                }
                scene.motherContainer.remove(line);
            });
            scene.orbitLines = [];
        }

        for (const material of Object.values(scene.orbitMaterialsByBodyId || {})) {
            material?.dispose?.();
        }
        scene.orbitMaterialsByBodyId = {};
        scene.orbitLinesByBodyId = {};
        scene.orbitBackgroundChunksByBodyId = {};
        scene.orbitBackgroundBaseOpacitiesByBodyId = {};

        for (const line of Object.values(scene.generatedOrbitLinesByBodyId || {})) {
            if (!line) continue;
            line.geometry?.dispose?.();
            line.material?.dispose?.();
            scene.motherContainer.remove(line);
        }
        scene.generatedOrbitLinesByBodyId = {};

        for (const bundle of Object.values(scene.orbitTrailLinesByBodyId || {})) {
            for (const line of [bundle?.tailLine, bundle?.midLine, bundle?.headGlowLine, bundle?.headLine]) {
                if (!line) continue;
                line.geometry?.dispose?.();
                line.material?.dispose?.();
                scene.motherContainer.remove(line);
            }
        }
        scene.orbitTrailLinesByBodyId = {};

        if (scene.landingOrbitLine) {
            if (scene.landingOrbitLine.geometry) {
                scene.landingOrbitLine.geometry.dispose();
            }
            if (scene.landingOrbitLine.material) {
                scene.landingOrbitLine.material.dispose();
            }
            scene.motherContainer.remove(scene.landingOrbitLine);
            scene.landingOrbitLine = null;
        }

        scene.curvesById = {};
        scene.curveVelocitiesById = {};
        scene.curveTimesById = {};
        scene.landingCurve = [];

        scene.pointsPerSlice = 0;
        scene.startingIndex = 0;
        scene.leftOrbitPoints = 0;
    }

    return { addSpacecraftCurve, disposeSpacecraftCurve };
}
