
import {
    CRATER_HOVER_RING_SURFACE_SCALE,
    CRATER_HOVER_PICK_PADDING_MIN_PX,
    CRATER_HOVER_PICK_PADDING_MAX_PX,
    CRATER_HOVER_PICK_PADDING_RATIO,
} from "./lunar-crater-render-config.js";
import {
    getCraterVisibilityThreshold,
    projectMoonLocalNormalToScreen,
    calculateCraterProjectedRadiusPx,
} from "./lunar-crater-render-primitives.js";

function resolveCraterHoverTarget(surfaceNormal, pickTargets = []) {
    if (!surfaceNormal || !Array.isArray(pickTargets)) {
        return null;
    }
    let bestTarget = null;
    let bestScore = Infinity;
    let bestAngle = Infinity;
    let bestRadius = Infinity;
    for (const target of pickTargets) {
        if (!target?.centerNormal) continue;
        const radius = Number(target.angularRadius);
        if (!Number.isFinite(radius) || radius <= 0) continue;
        const angle = surfaceNormal.angleTo(target.centerNormal);
        const pickPadding = Math.min(0.018, Math.max(0.002, radius * 0.12));
        if (angle > radius + pickPadding) {
            continue;
        }
        const score = angle / Math.max(radius, 1e-9);
        if (
            score < bestScore - 1e-8 ||
            (Math.abs(score - bestScore) <= 1e-8 && angle < bestAngle - 1e-8) ||
            (Math.abs(score - bestScore) <= 1e-8 && Math.abs(angle - bestAngle) <= 1e-8 && radius < bestRadius)
        ) {
            bestTarget = target;
            bestScore = score;
            bestAngle = angle;
            bestRadius = radius;
        }
    }
    return bestTarget;
}

function resolveCraterHoverTargetFromScreen({
    THREE,
    scene,
    camera,
    rendererDomElement,
    pointerX,
    pointerY,
    pickTargets = [],
    moonRadius,
    cameraMoonLocalNormal = null,
    surfaceNormal = null,
}) {
    if (!THREE || !scene || !camera || !Array.isArray(pickTargets) || !pickTargets.length) {
        return null;
    }
    const numericMoonRadius = Number(moonRadius);
    if (!Number.isFinite(numericMoonRadius) || numericMoonRadius <= 0) {
        return null;
    }

    let bestTarget = null;
    let bestScore = Infinity;
    let bestDistance = Infinity;
    for (const target of pickTargets) {
        if (!target?.centerNormal) continue;
        const angularRadius = Number(target.angularRadius);
        if (!Number.isFinite(angularRadius) || angularRadius <= 0) continue;
        if (surfaceNormal) {
            const surfaceAngle = surfaceNormal.angleTo(target.centerNormal);
            const angularPadding = Math.max(0.012, angularRadius * 0.8);
            if (surfaceAngle > angularRadius + angularPadding) {
                continue;
            }
        }
        if (
            cameraMoonLocalNormal &&
            target.centerNormal.dot(cameraMoonLocalNormal) <= getCraterVisibilityThreshold(angularRadius)
        ) {
            continue;
        }

        const center = projectMoonLocalNormalToScreen({
            scene,
            camera,
            rendererDomElement,
            normal: target.centerNormal,
            radius: numericMoonRadius * CRATER_HOVER_RING_SURFACE_SCALE,
        });
        const projectedRadius = calculateCraterProjectedRadiusPx({
            THREE,
            scene,
            camera,
            rendererDomElement,
            normal: target.centerNormal,
            angularRadius,
            moonRadius: numericMoonRadius,
        });
        if (!center || !Number.isFinite(projectedRadius) || projectedRadius <= 0) {
            continue;
        }

        const distance = Math.hypot(pointerX - center.x, pointerY - center.y);
        const pickPadding = Math.min(
            CRATER_HOVER_PICK_PADDING_MAX_PX,
            Math.max(CRATER_HOVER_PICK_PADDING_MIN_PX, projectedRadius * CRATER_HOVER_PICK_PADDING_RATIO),
        );
        if (distance > projectedRadius + pickPadding) {
            continue;
        }

        const score = distance / Math.max(projectedRadius, 1);
        if (
            score < bestScore - 1e-8 ||
            (Math.abs(score - bestScore) <= 1e-8 && distance < bestDistance)
        ) {
            bestTarget = target;
            bestScore = score;
            bestDistance = distance;
        }
    }
    return bestTarget;
}

function disposeObjectResources(object, disposedMaterials, disposedTextures) {
    object.geometry?.dispose?.();

    const materials = Array.isArray(object.material)
        ? object.material
        : [object.material].filter(Boolean);
    for (const material of materials) {
        if (!material || disposedMaterials.has(material)) continue;
        if (material.map && !disposedTextures.has(material.map)) {
            material.map.dispose?.();
            disposedTextures.add(material.map);
        }
        material.dispose?.();
        disposedMaterials.add(material);
    }
}

function resolveMoonSurfaceHitNormal({ scene, intersections, moonRadius }) {
    if (!scene?.moonContainer || !Array.isArray(intersections) || !intersections.length) {
        return null;
    }
    const numericMoonRadius = Number(moonRadius);
    if (!Number.isFinite(numericMoonRadius) || numericMoonRadius <= 0) {
        return null;
    }
    let bestNormal = null;
    let bestScore = Infinity;
    for (const intersection of intersections) {
        if (!intersection?.point?.clone) continue;
        const localPoint = intersection.point.clone();
        scene.moonContainer.worldToLocal(localPoint);
        const localRadius = localPoint.length();
        if (!Number.isFinite(localRadius) || localRadius <= 1e-12) {
            continue;
        }
        const score = Math.abs(localRadius - numericMoonRadius);
        if (score < bestScore) {
            bestScore = score;
            bestNormal = localPoint.normalize().clone();
        }
    }
    return bestNormal;
}
export {
    resolveCraterHoverTarget,
    resolveCraterHoverTargetFromScreen,
    disposeObjectResources,
    resolveMoonSurfaceHitNormal,
};
