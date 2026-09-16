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
    getLandingChebyshevData = () => null,
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
    const builds = new WeakMap();
    const entries = new WeakMap();
    const SUPERSEDED = Symbol("superseded curve build");

    function isCurrent(job) {
        return builds.get(job.scene) === job && entries.get(job.scene) === job.entry && !job.retired &&
            job.scene.stopCreationFlag !== true &&
            job.scene.motherContainer === job.container &&
            Number(job.scene.deferred3DInitRunId || 0) === job.sceneGeneration;
    }

    function assertCurrent(job) {
        if (!isCurrent(job)) throw SUPERSEDED;
    }

    function ownResource(job, resource) {
        if (!job) return resource;
        // Register before any subsequent attribute/material/line operation can fail.
        job.resources.add(resource);
        if (!isCurrent(job)) {
            job.resources.delete(resource);
            resource.dispose?.();
            throw SUPERSEDED;
        }
        return resource;
    }

    function createOwnedLineMaterial(job, ...args) {
        return ownResource(job, createLineMaterial(...args));
    }

    function releaseBuild(job) {
        const cleanupErrors = [];
        const attempt = (release) => {
            try { release(); } catch (error) { cleanupErrors.push(error); }
        };
        // Replacement builds own different collection objects. An old cleanup
        // must never erase a newer build's published output. Unpublish first:
        // synchronous disposal callbacks must not rediscover this retired output.
        for (const [key, value] of Object.entries(job.outputs)) {
            if (job.scene[key] === value) job.scene[key] = Array.isArray(value) ? [] : {};
            if (Array.isArray(value)) value.length = 0;
            else {
                for (const child of Object.values(value)) {
                    if (Array.isArray(child)) child.length = 0;
                }
                for (const childKey of Object.keys(value)) delete value[childKey];
            }
        }
        for (const line of job.lines) attempt(() => line.parent?.remove(line));
        job.lines.clear();
        for (const resource of job.resources) attempt(() => resource.dispose?.());
        job.resources.clear();
        return cleanupErrors;
    }

    function lowerReadiness(scene) {
        if (scene.disposed === true) return;
        const initDone = scene.constructor?.SCENE_STATE_INIT_DONE;
        if (Number.isFinite(initDone)) scene.state = initDone;
    }

    function retireBuild(job, status = "superseded", error = null) {
        if (!job || job.retired) return;
        const retiringEntry = entries.get(job.scene);
        job.retired = true;
        // Revoke readiness before event-emitting cleanup. A listener can cancel
        // the entering replacement without creating a new job to publish state.
        if (builds.get(job.scene) === job) {
            lowerReadiness(job.scene);
            job.scene.orbitBuildState = status;
            job.scene.orbitBuildError = error;
        }
        const cleanupErrors = releaseBuild(job);
        if (builds.get(job.scene) === job) {
            builds.delete(job.scene);
            if (entries.get(job.scene) === retiringEntry) {
                job.scene.orbitBuildError = error || cleanupErrors[0] || null;
            }
        }
        job.resolve({ status, ...(error ? { error } : {}), ...(cleanupErrors.length ? { cleanupErrors } : {}) });
    }

    function cancelSpacecraftCurveBuild(scene) {
        entries.delete(scene);
        retireBuild(builds.get(scene));
    }

    function applyCraftOrbitVisibility(scene, globalConfig) {
        applySceneOrbitVisibility(
            scene,
            globalConfig,
            getViewOrbit(),
            getOrbitStyle(),
            getTrailTrackBrightness3D(),
            getTrailTailBrightness3D(),
        );
    }

    function isValidVector3(point) {
        return !!point &&
            Number.isFinite(point.x) &&
            Number.isFinite(point.y) &&
            Number.isFinite(point.z);
    }

    function createLineGeometryFromPoints(points, job = null) {
        const vertices = new Float32Array(points.length * 3);
        let offset = 0;
        for (const point of points) {
            vertices[offset++] = point.x;
            vertices[offset++] = point.y;
            vertices[offset++] = point.z;
        }
        const geometry = ownResource(job, new THREE.BufferGeometry());
        try {
            geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
        } catch (error) {
            if (!job) geometry.dispose?.();
            throw error;
        }
        return geometry;
    }

    function createDynamicLineGeometry(maxPoints, job) {
        const capacity = Math.max(2, maxPoints);
        const geometry = ownResource(job, new THREE.BufferGeometry());
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

    function createOrbitTrailBundle({ bodyId, curve, baseColor, job }) {
        const normalizedBaseColor = normalizeHexColor(baseColor);
        const tailStyle = resolveTailVisualStyle({
            dimension: "3D",
            prominence: getTrailTailBrightness3D(),
        });
        const tailGeometry = createDynamicLineGeometry(curve.length, job);
        const midGeometry = createDynamicLineGeometry(curve.length, job);
        const headGlowGeometry = createDynamicLineGeometry(curve.length, job);
        const headGeometry = createDynamicLineGeometry(curve.length, job);
        const tailLine = new THREE.Line(
            tailGeometry,
            createOwnedLineMaterial(job, normalizedBaseColor, {
                transparent: true,
                opacity: tailStyle.tailOpacity,
                depthWrite: false,
            }),
        );
        const midLine = new THREE.Line(
            midGeometry,
            createOwnedLineMaterial(job, mixColors(normalizedBaseColor, "#ffffff", 0.22), {
                transparent: true,
                opacity: tailStyle.midOpacity,
                depthWrite: false,
            }),
        );
        const headGlowLine = new THREE.Line(
            headGlowGeometry,
            createOwnedLineMaterial(job, mixColors(normalizedBaseColor, "#ffffff", 0.58), {
                transparent: true,
                opacity: tailStyle.headGlowOpacity,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
            }),
        );
        const headLine = new THREE.Line(
            headGeometry,
            createOwnedLineMaterial(job, mixColors(normalizedBaseColor, "#ffffff", 0.42), {
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
        for (const line of [tailLine, midLine, headGlowLine, headLine]) job.lines.add(line);

        return {
            tailLine,
            midLine,
            headGlowLine,
            headLine,
        };
    }

    async function addCurve(job, { bodyId, curve, curveTimes, baseColor, baseOpacity }) {
        const { scene, globalConfig } = job;
        const validCurve = curve.filter(isValidVector3);
        let startingIndex = validCurve.length;
        const orbitLines = [], orbitChunks = [], orbitBaseOpacities = [];
        assertCurrent(job);
        job.outputs.orbitLinesByBodyId[bodyId] = orbitLines;
        job.outputs.orbitBackgroundChunksByBodyId[bodyId] = orbitChunks;
        job.outputs.orbitBackgroundBaseOpacitiesByBodyId[bodyId] = orbitBaseOpacities;
        while (startingIndex > 0) {
            assertCurrent(job);
            const points = Math.min(startingIndex, 400);
            startingIndex -= points;
            const arr = validCurve.slice(startingIndex, startingIndex + points + 1);
            if (arr.length < 2) continue;
            const orbitLine = new THREE.Line(
                createLineGeometryFromPoints(arr, job),
                createOwnedLineMaterial(job, baseColor, { transparent: true, opacity: baseOpacity, depthWrite: false }),
            );
            job.lines.add(orbitLine);
            orbitLine.userData = { ...orbitLine.userData, bodyId, baseOpacity, lineWidthClassic: orbitLine.material?.linewidth };
            orbitLine.visible = false;
            orbitLines.push(orbitLine);
            orbitChunks.push({ points: arr, startIndex: startingIndex, endIndex: startingIndex + arr.length - 1 });
            orbitBaseOpacities.push(baseOpacity);
            job.outputs.orbitLines.push(orbitLine);
            assertCurrent(job);
            job.container.add(orbitLine);
            assertCurrent(job);
            applyCraftOrbitVisibility(scene, globalConfig);
            render();
            assertCurrent(job);
            await wait10();
            assertCurrent(job);
        }
        const generatedCurve = resolveGeneratedCurvePoints(validCurve, curveTimes, job.extension?.sourceEndMs);
        assertCurrent(job);
        if (generatedCurve.length >= 2) {
            const line = new THREE.Line(
                createLineGeometryFromPoints(generatedCurve, job),
                createOwnedLineMaterial(job, GENERATED_ORBIT_SEGMENT_COLOR, {
                    transparent: true, opacity: 0.98, depthWrite: false, linewidth: 0.4,
                }),
            );
            job.lines.add(line);
            line.userData = { ...line.userData, bodyId, generatedSegment: true };
            line.renderOrder = 16;
            line.visible = false;
            assertCurrent(job);
            job.outputs.generatedOrbitLinesByBodyId[bodyId] = line;
            job.container.add(line);
            assertCurrent(job);
            applyCraftOrbitVisibility(scene, globalConfig);
            render();
            assertCurrent(job);
        } else {
            job.outputs.generatedOrbitLinesByBodyId[bodyId] = null;
        }
    }

    function addSpacecraftCurve(scene) {
        if (!scene?.motherContainer || scene.stopCreationFlag) {
            return Promise.resolve({ status: "superseded" });
        }
        const entry = {};
        const container = scene.motherContainer;
        const sceneGeneration = Number(scene.deferred3DInitRunId || 0);
        entries.set(scene, entry);
        // Retiring resources emits synchronous Three.js events. A newer entry
        // or explicit cancel during cleanup must win before this call publishes.
        retireBuild(builds.get(scene));
        const ownsEntry = () => entries.get(scene) === entry && !scene.stopCreationFlag &&
            scene.motherContainer === container && Number(scene.deferred3DInitRunId || 0) === sceneGeneration;
        if (!ownsEntry()) return Promise.resolve({ status: "superseded" });
        invalidateSceneOrbitOverlap(scene);
        const globalConfig = getGlobalConfig();
        const craftIds = getSceneOrbitBuildOrder(scene, globalConfig);
        // Vector-processing replaces arrays instead of mutating their points.
        // Snapshot the arrays/times once, including crafts built after a yield.
        const inputs = craftIds.map(bodyId => ({
            bodyId, curve: [...(scene.curvesById?.[bodyId] || [])],
            curveTimes: [...(scene.curveTimesById?.[bodyId] || [])],
            baseColor: resolveCraftOrbitColor(globalConfig, bodyId),
            baseOpacity: Number.isFinite(scene.trailContextOpacity3D)
                ? scene.trailContextOpacity3D : resolveTrackOpacity3D(getTrailTrackBrightness3D()),
        }));
        const outputs = {
            orbitLines: [], orbitLinesByBodyId: {}, generatedOrbitLinesByBodyId: {},
            orbitBackgroundChunksByBodyId: {}, orbitBackgroundBaseOpacitiesByBodyId: {},
            orbitMaterialsByBodyId: {}, orbitTrailLinesByBodyId: {},
        };
        if (!ownsEntry()) return Promise.resolve({ status: "superseded" });
        const job = {
            scene, globalConfig, outputs, container, sceneGeneration, entry,
            extension: resolvePostHorizonExtension(globalConfig, scene.name || "geo"),
            resources: new Set(), lines: new Set(), retired: false, resolve: null,
        };
        const promise = new Promise(resolve => { job.resolve = resolve; });
        builds.set(scene, job);
        Object.assign(scene, outputs);
        scene.primaryCraftId = getScenePrimaryCraftId(scene, globalConfig);
        scene.pointsPerSlice = 400;
        scene.startingIndex = 0;
        scene.leftOrbitPoints = 0;
        lowerReadiness(scene);
        scene.orbitBuildState = "building";
        scene.orbitBuildError = null;
        scene.orbitBuildPromise = promise;

        const build = async () => {
            // Landing readiness stays independent and synchronous at startup.
            addLandingCurve(scene);
            for (const input of inputs) {
                assertCurrent(job);
                if (input.curve.filter(isValidVector3).length < 2) {
                    outputs.orbitLinesByBodyId[input.bodyId] = [];
                    outputs.orbitBackgroundChunksByBodyId[input.bodyId] = [];
                    outputs.orbitBackgroundBaseOpacitiesByBodyId[input.bodyId] = [];
                    continue;
                }
                await addCurve(job, input);
                assertCurrent(job);
                const bundle = createOrbitTrailBundle({ ...input, job });
                assertCurrent(job);
                outputs.orbitTrailLinesByBodyId[input.bodyId] = bundle;
                for (const line of Object.values(bundle)) {
                    assertCurrent(job);
                    job.container.add(line);
                    assertCurrent(job);
                }
                applyCraftOrbitVisibility(scene, globalConfig);
            }
            assertCurrent(job);
            applyCraftOrbitVisibility(scene, globalConfig);
            assertCurrent(job);
            scene.state = scene.constructor.SCENE_STATE_ADD_CURVE_DONE;
            scene.orbitBuildState = "ready";
            job.resolve({ status: "ready" });
        };
        // The owned outcome never rejects: existing startup callers intentionally
        // launch rendering progressively without awaiting the whole curve.
        void build().catch(error => {
            retireBuild(job, error === SUPERSEDED || !isCurrent(job) ? "superseded" : "failed",
                error === SUPERSEDED ? null : error);
        });
        return promise;
    }

    function addLandingCurve(scene) {
        if (!scene || scene.stopCreationFlag || !scene.motherContainer || scene.landingOrbitLine) {
            return false;
        }
        const globalConfig = getGlobalConfig();
        if (
            scene.name == "lunar" &&
            globalConfig &&
            globalConfig.landing &&
            globalConfig.landing.enabled &&
            scene.landingCurve.length > 0
        ) {
            const validLandingCurve = scene.landingCurve.filter(isValidVector3);
            if (validLandingCurve.length < 2) {
                return false;
            }

            let landingOrbitGeometry, landingOrbitMaterial, landingOrbitLine, landingOrbitData;
            try {
                landingOrbitGeometry = createLineGeometryFromPoints(validLandingCurve);
                landingOrbitMaterial = createLineMaterial("#FFFFE0"); // Light yellow.
                landingOrbitLine = new THREE.Line(landingOrbitGeometry, landingOrbitMaterial);
                landingOrbitLine.visible = getViewOrbitDescent();
                landingOrbitData = getLandingChebyshevData(scene.name);
            } catch (error) {
                // These allocations have not yet transferred to the independent
                // landing owner, so main-build failure must not strand them.
                try { landingOrbitGeometry?.dispose?.(); }
                finally { landingOrbitMaterial?.dispose?.(); }
                throw error;
            }
            scene.landingOrbitLine = landingOrbitLine;
            scene.landingOrbitData = landingOrbitData;
            scene.motherContainer.add(scene.landingOrbitLine);
            render();
            return true;
        }
        return false;
    }

    function disposeSpacecraftCurve(scene) {
        if (!scene) return;
        const disposalEntry = {};
        entries.set(scene, disposalEntry);
        const ownsDisposal = () => entries.get(scene) === disposalEntry;
        retireBuild(builds.get(scene));
        // Resource-disposal events may synchronously install a newer component
        // owner. Full scene retirement is a separate caller-owned contract.
        if (!ownsDisposal()) return;
        invalidateSceneOrbitOverlap(scene);
        if (scene.orbitLines) {
            scene.orbitLines.forEach((line) => {
                if (line.geometry) {
                    line.geometry.dispose();
                }
                if (line.material) {
                    line.material.dispose();
                }
                line.parent?.remove(line);
            });
            if (!ownsDisposal()) return;
            scene.orbitLines = [];
        }

        for (const material of Object.values(scene.orbitMaterialsByBodyId || {})) {
            material?.dispose?.();
        }
        if (!ownsDisposal()) return;
        scene.orbitMaterialsByBodyId = {};
        scene.orbitLinesByBodyId = {};
        scene.orbitBackgroundChunksByBodyId = {};
        scene.orbitBackgroundBaseOpacitiesByBodyId = {};

        for (const line of Object.values(scene.generatedOrbitLinesByBodyId || {})) {
            if (!line) continue;
            line.geometry?.dispose?.();
            line.material?.dispose?.();
            line.parent?.remove(line);
        }
        if (!ownsDisposal()) return;
        scene.generatedOrbitLinesByBodyId = {};

        for (const bundle of Object.values(scene.orbitTrailLinesByBodyId || {})) {
            for (const line of [bundle?.tailLine, bundle?.midLine, bundle?.headGlowLine, bundle?.headLine]) {
                if (!line) continue;
                line.geometry?.dispose?.();
                line.material?.dispose?.();
                line.parent?.remove(line);
            }
        }
        if (!ownsDisposal()) return;
        scene.orbitTrailLinesByBodyId = {};

        disposeLandingCurve(scene);
        if (!ownsDisposal()) return;

        scene.curvesById = {};
        scene.curveVelocitiesById = {};
        scene.curveTimesById = {};
        scene.landingCurve = [];

        scene.pointsPerSlice = 0;
        scene.startingIndex = 0;
        scene.leftOrbitPoints = 0;
        lowerReadiness(scene);
        scene.orbitBuildState = "disposed";
    }

    function disposeLandingCurve(scene) {
        const line = scene.landingOrbitLine;
        // Unpublish the old resource before any event-emitting cleanup. A
        // re-entrant landing build can then own its own line without being erased.
        scene.landingOrbitLine = null;
        scene.landingOrbitData = null;
        if (line) {
            line.parent?.remove(line);
            line.geometry?.dispose?.();
            line.material?.dispose?.();
        }
    }

    return { addSpacecraftCurve, cancelSpacecraftCurveBuild, addLandingCurve, disposeLandingCurve, disposeSpacecraftCurve };
}
