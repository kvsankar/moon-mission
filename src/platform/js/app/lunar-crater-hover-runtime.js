import { CRATER_HOVER_RING_SURFACE_SCALE, CRATER_LABEL_SURFACE_SCALE, CRATER_HOVER_LABEL_MAX_SCREEN_HEIGHT_PX } from "./lunar-crater-render-config.js";
import { createCraterRing, resolveCraterLabelNormal, calculateCraterHoverLabelOffset, calculateCraterProjectedScreenBounds, positionCraterHoverLabelFromScreenBounds, createCraterLabelSprite } from "./lunar-crater-render-primitives.js";
import { resolveCraterHoverTarget, resolveCraterHoverTargetFromScreen, disposeObjectResources, resolveMoonSurfaceHitNormal } from "./lunar-crater-hit-testing.js";

export function createLunarCraterHoverRuntime({
    THREE,
    getMoonRadius,
    getLunarRadiusKm,
    resolveHoverEnabled,
    resolveSearchQuery,
    resolveCraterSunlit,
    getCraterBoundaryMaterial,
    resolveCraterCameraContext,
}) {
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    const surfaceNormal = new THREE.Vector3();
    const cameraWorldPosition = new THREE.Vector3();
    const cameraMoonLocalPosition = new THREE.Vector3();

    function ensureHoverLabel({
        scene,
        camera,
        rendererDomElement,
        crater,
        normal,
        moonRadius,
        angularRadius = 0,
        projectedCraterRadiusPx = null,
        craterScreenBounds = null,
        cameraUpNormal = null,
        cameraRightNormal = null,
    }) {
        const offsetAngularRadius = calculateCraterHoverLabelOffset({
            angularRadius,
            projectedCraterRadiusPx,
        });
        const needsNewLabel = !scene.lunarCraterHoverLabel ||
            scene.lunarCraterHoverLabel.userData?.name !== crater.name;
        if (needsNewLabel) {
            const previousLabel = scene.lunarCraterHoverLabel;
            if (previousLabel?.parent) {
                previousLabel.parent.remove(previousLabel);
            }
            if (previousLabel) {
                disposeObjectResources(previousLabel, new Set(), new Set());
            }
            scene.lunarCraterHoverLabel = createCraterLabelSprite({
                THREE,
                crater,
                normal,
                moonRadius,
                offsetAngularRadius,
                visibilityAngularRadius: angularRadius,
                targetScreenHeightPx: CRATER_HOVER_LABEL_MAX_SCREEN_HEIGHT_PX,
                cameraUpNormal,
                cameraRightNormal,
            });
            if (scene.lunarCraterHoverLabel) {
                scene.lunarCraterGroup.add(scene.lunarCraterHoverLabel);
            }
        }
        if (!scene.lunarCraterHoverLabel) return;
        const labelNormal = resolveCraterLabelNormal({
            THREE,
            normal,
            offsetAngularRadius,
            cameraUpNormal,
            cameraRightNormal,
        });
        scene.lunarCraterHoverLabel.userData.offsetAngularRadius = offsetAngularRadius;
        scene.lunarCraterHoverLabel.userData.centerNormal = normal.clone().normalize().toArray();
        scene.lunarCraterHoverLabel.userData.visibilityAngularRadius = angularRadius;
        const positionedFromScreenBounds = positionCraterHoverLabelFromScreenBounds({
            THREE,
            scene,
            camera,
            rendererDomElement,
            label: scene.lunarCraterHoverLabel,
            craterScreenBounds,
        });
        if (!positionedFromScreenBounds) {
            scene.lunarCraterHoverLabel.position.copy(labelNormal).multiplyScalar(
                moonRadius * CRATER_LABEL_SURFACE_SCALE,
            );
            scene.lunarCraterHoverLabel.userData.labelNormal = labelNormal.toArray();
            scene.lunarCraterHoverLabel.userData.screenAnchor = null;
        }
        scene.lunarCraterHoverLabel.visible = true;
    }

    function ensureHoverRing({ scene, target, moonRadius, lunarRadiusKm }) {
        const sunlit = resolveCraterSunlit({ scene, centerNormal: target.centerNormal });

        const nextRing = createCraterRing({
            THREE,
            crater: target.crater,
            normal: target.centerNormal,
            moonRadius,
            material: getCraterBoundaryMaterial({
                group: scene.lunarCraterGroup,
                featureType: target.crater.featureType,
                sunlit,
                hover: true,
            }),
            lunarRadiusKm,
            surfaceScale: CRATER_HOVER_RING_SURFACE_SCALE,
            renderOrder: 19,
            namePrefix: "lunar-crater-hover-ring",
            hoverAnnotation: true,
        });
        nextRing.userData.sunlit = sunlit;

        if (scene.lunarCraterHoverRing?.parent) {
            scene.lunarCraterHoverRing.parent.remove(scene.lunarCraterHoverRing);
        }
        scene.lunarCraterHoverRing?.geometry?.dispose?.();
        scene.lunarCraterHoverRing = nextRing;
        scene.lunarCraterGroup.add(nextRing);
    }

    function hideLunarCraterHover({ scene }) {
        let changed = false;
        if (scene?.lunarCraterHoverLabel?.visible) {
            scene.lunarCraterHoverLabel.visible = false;
            changed = true;
        }
        if (scene?.lunarCraterHoverRing?.visible) {
            scene.lunarCraterHoverRing.visible = false;
            changed = true;
        }
        if (scene?.lunarCraterHoveredRing) {
            scene.lunarCraterHoveredRing.userData.hoverAnnotation = false;
            scene.lunarCraterHoveredRing = null;
            changed = true;
        }
        if (scene?.lunarCraterHoveredLabel) {
            scene.lunarCraterHoveredLabel.userData.hoverScaleBoost = false;
            scene.lunarCraterHoveredLabel = null;
            changed = true;
        }
        if (scene && scene.lunarCraterHoveredName) {
            scene.lunarCraterHoveredName = null;
            scene.lunarCraterHoveredDiameterKm = null;
            changed = true;
        }
        return changed;
    }

    function findCraterTargetAtPointer({
        scene,
        camera,
        rendererDomElement,
        clientX,
        clientY,
    }) {
        if (!scene?.moon || !scene?.moonContainer || !camera || !rendererDomElement) {
            return null;
        }
        const rect = rendererDomElement.getBoundingClientRect?.();
        if (!rect || rect.width <= 0 || rect.height <= 0) {
            return null;
        }
        const pointerX = clientX - rect.left;
        const pointerY = clientY - rect.top;
        if (pointerX < 0 || pointerY < 0 || pointerX > rect.width || pointerY > rect.height) {
            return null;
        }

        pointerNdc.set(
            (pointerX / rect.width) * 2 - 1,
            -((pointerY / rect.height) * 2 - 1),
        );
        scene.moonContainer.updateWorldMatrix?.(true, true);
        scene.moon.updateWorldMatrix?.(true, true);
        camera.updateMatrixWorld?.();
        let cameraNormalAvailable = false;
        if (scene.moonContainer.worldToLocal && camera.getWorldPosition) {
            camera.getWorldPosition(cameraWorldPosition);
            cameraMoonLocalPosition.copy(cameraWorldPosition);
            scene.moonContainer.worldToLocal(cameraMoonLocalPosition);
            if (cameraMoonLocalPosition.lengthSq() > 1e-12) {
                cameraMoonLocalPosition.normalize();
                cameraNormalAvailable = true;
            }
        }
        raycaster.setFromCamera(pointerNdc, camera);

        const intersections = raycaster.intersectObject(scene.moon, true);
        const moonRadius = getMoonRadius();
        const hitNormal = resolveMoonSurfaceHitNormal({
            scene,
            intersections,
            moonRadius,
        });
        if (!hitNormal) {
            return resolveCraterHoverTargetFromScreen({
                THREE,
                scene,
                camera,
                rendererDomElement,
                pointerX,
                pointerY,
                pickTargets: scene.lunarCraterPickTargets || [],
                moonRadius,
                cameraMoonLocalNormal: cameraNormalAvailable ? cameraMoonLocalPosition : null,
            });
        }

        surfaceNormal.copy(hitNormal);

        const pickTargets = scene.lunarCraterPickTargets || [];
        const surfaceTarget = resolveCraterHoverTarget(surfaceNormal, pickTargets);
        if (surfaceTarget) {
            return surfaceTarget;
        }
        return resolveCraterHoverTargetFromScreen({
            THREE,
            scene,
            camera,
            rendererDomElement,
            pointerX,
            pointerY,
            pickTargets,
            moonRadius,
            cameraMoonLocalNormal: cameraNormalAvailable ? cameraMoonLocalPosition : null,
            surfaceNormal,
        }) || resolveCraterHoverTarget(surfaceNormal, pickTargets);
    }

    function updateLunarCraterHoverFromPointer({
        scene,
        camera,
        rendererDomElement,
        clientX,
        clientY,
    }) {
        const canInspectRenderedSearchTargets = resolveSearchQuery(scene).length > 0;
        if (
            !scene?.lunarCraterGroup?.visible ||
            (!resolveHoverEnabled(scene) && !canInspectRenderedSearchTargets) ||
            scene.lunarCraterHoverLabelsEnabled === false
        ) {
            return hideLunarCraterHover({ scene });
        }

        const target = findCraterTargetAtPointer({
            scene,
            camera,
            rendererDomElement,
            clientX,
            clientY,
        });
        if (!target) {
            return hideLunarCraterHover({ scene });
        }

        const moonRadius = getMoonRadius();
        if (!Number.isFinite(moonRadius) || moonRadius <= 0) {
            return hideLunarCraterHover({ scene });
        }

        const craterScreenBounds = calculateCraterProjectedScreenBounds({
            THREE,
            scene,
            camera,
            rendererDomElement,
            normal: target.centerNormal,
            angularRadius: target.angularRadius,
            moonRadius,
        });
        const projectedCraterRadiusPx = craterScreenBounds?.radiusPx ?? null;
        const cameraContext = resolveCraterCameraContext({
            scene,
            camera,
            rendererDomElement,
            moonRadius,
        });
        const alreadyHovered = scene.lunarCraterHoveredName === target.crater.name;
        let labelVisibilityChanged = false;
        if (scene.lunarCraterHoveredRing && scene.lunarCraterHoveredRing !== target.ring) {
            scene.lunarCraterHoveredRing.userData.hoverAnnotation = false;
            scene.lunarCraterHoveredRing = null;
            labelVisibilityChanged = true;
        }
        if (scene.lunarCraterHoveredLabel && scene.lunarCraterHoveredLabel !== target.label) {
            scene.lunarCraterHoveredLabel.userData.hoverScaleBoost = false;
            scene.lunarCraterHoveredLabel = null;
            labelVisibilityChanged = true;
        }
        if (target.showLabel === true) {
            if (scene.lunarCraterHoverLabel?.visible) {
                scene.lunarCraterHoverLabel.visible = false;
                labelVisibilityChanged = true;
            }
            if (target.ring) {
                target.ring.userData.hoverAnnotation = true;
                scene.lunarCraterHoveredRing = target.ring;
            }
            if (target.label) {
                target.label.userData.hoverScaleBoost = true;
                scene.lunarCraterHoveredLabel = target.label;
            }
        } else {
            ensureHoverLabel({
                scene,
                camera,
                rendererDomElement,
                crater: target.crater,
                normal: target.centerNormal,
                moonRadius,
                angularRadius: target.angularRadius,
                projectedCraterRadiusPx,
                craterScreenBounds,
                cameraUpNormal: cameraContext?.cameraUpNormal ?? null,
                cameraRightNormal: cameraContext?.cameraRightNormal ?? null,
            });
        }
        if (target.showLabel === true) {
            if (scene.lunarCraterHoverRing?.visible) {
                scene.lunarCraterHoverRing.visible = false;
                labelVisibilityChanged = true;
            }
        } else if (!alreadyHovered || !scene.lunarCraterHoverRing?.visible) {
            ensureHoverRing({
                scene,
                target,
                moonRadius,
                lunarRadiusKm: getLunarRadiusKm(),
            });
        }
        if (scene.lunarCraterHoverRing && target.showLabel !== true) {
            scene.lunarCraterHoverRing.visible = true;
        }
        scene.lunarCraterHoveredName = target.crater.name;
        scene.lunarCraterHoveredDiameterKm = target.crater.diameterKm;
        return !alreadyHovered || labelVisibilityChanged;
    }

    return { hideLunarCraterHover, updateLunarCraterHoverFromPointer };
}
