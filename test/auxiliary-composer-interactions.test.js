import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

import {
    AuxiliaryCameraViewsManager,
    computeComposerDragSensitivityScale,
    composerRollDialKnobOffset,
    normalizeComposerRollRad,
    rollRadFromDialPointer,
    shouldRenderComposerLunarCraterHover,
} from "../src/platform/js/app/auxiliary-camera-views.js";

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("Frame and Shoot roll dial math", () => {
    it("normalizes roll angles into one positive turn", () => {
        expect(normalizeComposerRollRad(0)).toBe(0);
        expect(normalizeComposerRollRad(Math.PI * 2)).toBe(0);
        expect(normalizeComposerRollRad(-Math.PI / 2)).toBeCloseTo(Math.PI * 1.5);
    });

    it("maps dial pointer positions with 0 degrees at the top and counterclockwise positive", () => {
        const center = { centerX: 100, centerY: 100 };

        expect(rollRadFromDialPointer({ ...center, pointerX: 100, pointerY: 80 })).toBeCloseTo(0);
        expect(rollRadFromDialPointer({ ...center, pointerX: 120, pointerY: 100 })).toBeCloseTo(Math.PI * 1.5);
        expect(rollRadFromDialPointer({ ...center, pointerX: 100, pointerY: 120 })).toBeCloseTo(Math.PI);
        expect(rollRadFromDialPointer({ ...center, pointerX: 80, pointerY: 100 })).toBeCloseTo(Math.PI / 2);
    });

    it("places the roll knob on the same polar convention", () => {
        expect(composerRollDialKnobOffset(0, 18).x).toBeCloseTo(0);
        expect(composerRollDialKnobOffset(0, 18).y).toBeCloseTo(-18);
        expect(composerRollDialKnobOffset(Math.PI / 2, 18).x).toBeCloseTo(-18);
        expect(composerRollDialKnobOffset(Math.PI / 2, 18).y).toBeCloseTo(0);
    });
});

describe("Frame and Shoot drag sensitivity math", () => {
    it("keeps default FoV drag at the existing sensitivity", () => {
        expect(computeComposerDragSensitivityScale(50)).toBeCloseTo(1, 8);
    });

    it("reduces drag sensitivity at narrow FoV values", () => {
        const scaleAtOneDegree = computeComposerDragSensitivityScale(1);
        const expectedScale = Math.tan((1 * Math.PI / 180) * 0.5) /
            Math.tan((50 * Math.PI / 180) * 0.5);

        expect(scaleAtOneDegree).toBeCloseTo(expectedScale, 8);
        expect(scaleAtOneDegree).toBeLessThan(0.02);
    });

    it("continues tapering drag sensitivity for crater-scale FoV values", () => {
        const scaleAtTenthDegree = computeComposerDragSensitivityScale(0.1);
        const expectedScale = Math.tan((0.1 * Math.PI / 180) * 0.5) /
            Math.tan((50 * Math.PI / 180) * 0.5);

        expect(scaleAtTenthDegree).toBeCloseTo(expectedScale, 8);
        expect(scaleAtTenthDegree).toBeLessThan(0.002);
    });

    it("does not increase drag sensitivity beyond the legacy wide-FoV feel", () => {
        expect(computeComposerDragSensitivityScale(120)).toBe(1);
        expect(computeComposerDragSensitivityScale(Number.NaN)).toBe(1);
    });
});

describe("Frame and Shoot FoV bounds", () => {
    it("requests lunar feature hover renders in Show Always and hover modes", () => {
        expect(shouldRenderComposerLunarCraterHover({
            viewLunarCraters: true,
            lunarCraterDisplayMode: "always",
            lunarCraterHoverLabels: true,
        })).toBe(true);
        expect(shouldRenderComposerLunarCraterHover({
            viewLunarCraters: true,
            lunarCraterDisplayMode: "hover",
            lunarCraterHoverLabels: true,
        })).toBe(true);
        expect(shouldRenderComposerLunarCraterHover({
            viewLunarCraters: true,
            lunarCraterDisplayMode: "always",
            lunarCraterHoverLabels: false,
        })).toBe(false);
        expect(shouldRenderComposerLunarCraterHover({
            viewLunarCraters: false,
            lunarCraterDisplayMode: "always",
            lunarCraterHoverLabels: true,
        })).toBe(false);
    });

    it("applies lunar crater visibility for a composer render without mutating the shared scene", () => {
        const manager = Object.create(AuxiliaryCameraViewsManager.prototype);
        const renderer = {};
        const camera = {};
        const craterGroup = { visible: false };
        const scene = {
            getObjectByName: vi.fn((name) =>
                name === "lunar-crater-annotations" ? craterGroup : null,
            ),
        };
        const renderedVisibility = [];
        manager.renderLayers = vi.fn(() => {
            renderedVisibility.push(craterGroup.visible);
        });

        manager.renderComposerLayers(
            {
                renderer,
                camera,
                composerLunarCratersEnabled: true,
            },
            scene,
            { renderSkyLayer: false },
        );

        expect(renderedVisibility).toEqual([true]);
        expect(craterGroup.visible).toBe(false);

        craterGroup.visible = true;
        manager.renderComposerLayers(
            {
                renderer,
                camera,
                composerLunarCratersEnabled: false,
            },
            scene,
            { renderSkyLayer: false },
        );

        expect(renderedVisibility).toEqual([true, false]);
        expect(craterGroup.visible).toBe(true);
    });

    it("freezes Frame and Shoot lunar label scaling during viewport drag", () => {
        const manager = Object.create(AuxiliaryCameraViewsManager.prototype);
        const renderer = {};
        const camera = {};
        const animationScene = {
            lunarCraterGroup: { name: "lunar-crater-annotations", visible: false },
            addLunarCraterAnnotations: vi.fn(function addLunarCraterAnnotations() {
                this.lunarCraterGroup = { name: "lunar-crater-annotations", visible: false };
            }),
            setLunarCraterHoverLabelsEnabled: vi.fn(),
            clearLunarCraterHover: vi.fn(),
            updateLunarCraterLabelScales: vi.fn(),
        };
        const scene = {
            getObjectByName: vi.fn((name) =>
                name === "lunar-crater-annotations" ? animationScene.lunarCraterGroup : null,
            ),
        };
        manager.renderLayers = vi.fn();

        manager.renderComposerLayers(
            {
                renderer,
                camera,
                composerLunarCratersEnabled: true,
                composerViewportPointer: { pointerId: 1 },
            },
            scene,
            { animationScene },
        );

        expect(animationScene.updateLunarCraterLabelScales).toHaveBeenCalledWith({
            camera,
            rendererDomElement: null,
            freezeScale: true,
        });
    });

    it("injects active transcript lunar feature names into the composer crater render", () => {
        const manager = Object.create(AuxiliaryCameraViewsManager.prototype);
        const renderer = {};
        const camera = {};
        const pinnedNameCalls = [];
        const animationScene = {
            lunarCraterGroup: { name: "lunar-crater-annotations", visible: false },
            addLunarCraterAnnotations: vi.fn(function addLunarCraterAnnotations() {
                pinnedNameCalls.push(this.lunarFeaturePinnedNames);
                this.lunarCraterGroup = { name: "lunar-crater-annotations", visible: false };
            }),
            setLunarCraterHoverLabelsEnabled: vi.fn(),
            clearLunarCraterHover: vi.fn(),
            updateLunarCraterLabelScales: vi.fn(),
            disposeLunarCraterAnnotations: vi.fn(),
        };
        const scene = {
            getObjectByName: vi.fn((name) =>
                name === "lunar-crater-annotations" ? animationScene.lunarCraterGroup : null,
            ),
        };
        manager.renderLayers = vi.fn();

        manager.renderComposerLayers(
            {
                renderer,
                camera,
                composerLunarCratersEnabled: false,
                composerLunarFeatureMentionView: {
                    activeCatalogNames: ["Grimaldi", "Ohm"],
                },
            },
            scene,
            { animationScene },
        );

        expect(pinnedNameCalls[0]).toEqual(["Grimaldi", "Ohm"]);
        expect(animationScene.setLunarCraterHoverLabelsEnabled).toHaveBeenCalledWith(true);
    });

    it("does not inject transcript lunar features when Frame and Shoot sync is disabled", () => {
        const manager = Object.create(AuxiliaryCameraViewsManager.prototype);
        const renderer = {};
        const camera = {};
        const pinnedNameCalls = [];
        const animationScene = {
            lunarCraterGroup: { name: "lunar-crater-annotations", visible: false },
            addLunarCraterAnnotations: vi.fn(function addLunarCraterAnnotations() {
                pinnedNameCalls.push(this.lunarFeaturePinnedNames);
                this.lunarCraterGroup = { name: "lunar-crater-annotations", visible: false };
            }),
            setLunarCraterHoverLabelsEnabled: vi.fn(),
            clearLunarCraterHover: vi.fn(),
            updateLunarCraterLabelScales: vi.fn(),
            disposeLunarCraterAnnotations: vi.fn(),
        };
        const scene = {
            getObjectByName: vi.fn((name) =>
                name === "lunar-crater-annotations" ? animationScene.lunarCraterGroup : null,
            ),
        };
        manager.renderLayers = vi.fn();

        manager.renderComposerLayers(
            {
                renderer,
                camera,
                composerLunarCratersEnabled: false,
                composerLunarFeatureSyncedEnabled: false,
                composerLunarFeatureMentionView: {
                    activeCatalogNames: ["Grimaldi"],
                },
            },
            scene,
            { animationScene },
        );

        expect(pinnedNameCalls).toEqual([]);
        expect(animationScene.setLunarCraterHoverLabelsEnabled).not.toHaveBeenCalled();
    });

    it("keeps ordinary auxiliary renders independent from fullscreen lunar crater visibility", () => {
        const manager = Object.create(AuxiliaryCameraViewsManager.prototype);
        const renderer = {};
        const camera = {};
        const craterGroup = { visible: true };
        const scene = {
            getObjectByName: vi.fn((name) =>
                name === "lunar-crater-annotations" ? craterGroup : null,
            ),
        };
        const renderedVisibility = [];
        manager.renderLayers = vi.fn(() => {
            renderedVisibility.push(craterGroup.visible);
        });

        manager.renderAuxiliaryPanelLayers(
            { renderer, camera },
            scene,
            { renderSkyLayer: false },
        );

        expect(renderedVisibility).toEqual([false]);
        expect(craterGroup.visible).toBe(true);
    });

    it("allows manual crater-scale FoV down to a tenth of a degree", () => {
        const updates = [];
        const position = { x: 12, y: 34, z: 56 };
        const manager = Object.create(AuxiliaryCameraViewsManager.prototype);
        const panelState = {
            camera: {
                fov: 50,
                position,
                updateProjectionMatrix: vi.fn(() => updates.push("projection")),
            },
            fovControl: {
                setFovDegrees: vi.fn(),
            },
            overlayDirty: false,
        };

        manager.setPanelFov(panelState, 0.1);

        expect(panelState.camera.fov).toBe(0.1);
        expect(panelState.camera.updateProjectionMatrix).toHaveBeenCalledTimes(1);
        expect(panelState.overlayDirty).toBe(true);
        expect(panelState.fovControl.setFovDegrees).toHaveBeenCalledWith(0.1, 0.1);
        expect(panelState.camera.position).toBe(position);
        expect(panelState.camera.position).toEqual({ x: 12, y: 34, z: 56 });
        expect(updates).toEqual(["projection"]);
    });

    it("clamps Frame and Shoot FoV below a tenth of a degree", () => {
        const manager = Object.create(AuxiliaryCameraViewsManager.prototype);
        const panelState = {
            camera: {
                fov: 50,
                updateProjectionMatrix: vi.fn(),
            },
            fovControl: {
                setFovDegrees: vi.fn(),
            },
            overlayDirty: false,
        };

        manager.setPanelFov(panelState, 0.01);

        expect(panelState.camera.fov).toBe(0.1);
        expect(panelState.fovControl.setFovDegrees).toHaveBeenCalledWith(0.1, 0.1);
    });

    it("keeps target-panel Auto FoV in presentation bounds", () => {
        const manager = Object.create(AuxiliaryCameraViewsManager.prototype);
        const panelState = {
            mode: "target",
            camera: { fov: 45 },
        };

        expect(manager.clampAutoFovDegrees(panelState, 0.5)).toBe(3);
        expect(manager.clampAutoFovDegrees(panelState, 174.5)).toBe(70);
        expect(manager.clampAutoFovDegrees(panelState, 12)).toBe(12);
    });

    it("allows Moon target panels to auto-fit below the generic target-panel floor", () => {
        const manager = Object.create(AuxiliaryCameraViewsManager.prototype);
        const panelState = {
            mode: "target",
            targetKey: "moon",
            camera: { fov: 45 },
        };

        expect(manager.clampAutoFovDegrees(panelState, 0.5)).toBe(1.5);
        expect(manager.clampAutoFovDegrees(panelState, 1.6)).toBe(1.6);
    });

    it("lets Frame and Shoot Auto FoV use a practical wide-angle range", () => {
        const manager = Object.create(AuxiliaryCameraViewsManager.prototype);
        const panelState = {
            mode: "composer",
            camera: { fov: 50 },
        };

        expect(manager.clampAutoFovDegrees(panelState, 0.5)).toBe(0.5);
        expect(manager.clampAutoFovDegrees(panelState, 174.5)).toBe(120);
        expect(manager.clampAutoFovDegrees(panelState, 119.5)).toBe(119.5);
        expect(manager.clampAutoFovDegrees(panelState, 12)).toBe(12);
    });

    it("does not pin far or near Frame and Shoot Auto FoV to the old composition bounds", () => {
        const manager = Object.assign(Object.create(AuxiliaryCameraViewsManager.prototype), {
            THREE,
            tmpVectorA: new THREE.Vector3(),
            tmpVectorB: new THREE.Vector3(),
        });
        const panelState = {
            mode: "composer",
            camera: {
                fov: 50,
                aspect: 16 / 9,
            },
        };

        const farTargetFov = manager.computeComposerAutoFovDegrees({
            panelState,
            craftWorld: new THREE.Vector3(0, 0, 0),
            moonWorld: new THREE.Vector3(1000, 0, 0),
            earthWorld: new THREE.Vector3(0, 0, 0),
            moonRadius: 1,
            earthRadius: 1,
            lockTarget: "moon",
        });
        const nearTargetFov = manager.computeComposerAutoFovDegrees({
            panelState,
            craftWorld: new THREE.Vector3(0, 0, 0),
            moonWorld: new THREE.Vector3(1.1, 0, 0),
            earthWorld: new THREE.Vector3(0, 0, 0),
            moonRadius: 1,
            earthRadius: 1,
            lockTarget: "moon",
        });

        expect(farTargetFov).toBeLessThan(2);
        expect(manager.clampAutoFovDegrees(panelState, farTargetFov)).toBeCloseTo(farTargetFov);
        expect(nearTargetFov).toBeGreaterThan(70);
        expect(manager.clampAutoFovDegrees(panelState, nearTargetFov)).toBeGreaterThan(70);
        expect(manager.clampAutoFovDegrees(panelState, nearTargetFov)).toBeLessThanOrEqual(120);
    });

    it("widens Moon-locked Auto FoV to include a close foreground Earth", () => {
        const manager = Object.assign(Object.create(AuxiliaryCameraViewsManager.prototype), {
            THREE,
            tmpVectorA: new THREE.Vector3(),
            tmpVectorB: new THREE.Vector3(),
        });
        const panelState = {
            mode: "composer",
            camera: {
                fov: 50,
                aspect: 16 / 9,
            },
        };

        const moonOnlyFov = manager.computeComposerAutoFovDegrees({
            panelState,
            craftWorld: new THREE.Vector3(0, 0, 0),
            moonWorld: new THREE.Vector3(1000, 0, 0),
            earthWorld: new THREE.Vector3(0, 1000, 0),
            moonRadius: 1,
            earthRadius: 40,
            lockTarget: "moon",
        });
        const foregroundEarthFov = manager.computeComposerAutoFovDegrees({
            panelState,
            craftWorld: new THREE.Vector3(0, 0, 0),
            moonWorld: new THREE.Vector3(1000, 0, 0),
            earthWorld: new THREE.Vector3(100, 2, 0),
            moonRadius: 1,
            earthRadius: 40,
            lockTarget: "moon",
        });

        expect(moonOnlyFov).toBeLessThan(2);
        expect(foregroundEarthFov).toBeGreaterThan(90);
        expect(manager.clampAutoFovDegrees(panelState, foregroundEarthFov)).toBe(foregroundEarthFov);
    });

    it("caps Earth-locked Auto FoV when the craft is extremely close to Earth", () => {
        const manager = Object.assign(Object.create(AuxiliaryCameraViewsManager.prototype), {
            THREE,
            tmpVectorA: new THREE.Vector3(),
            tmpVectorB: new THREE.Vector3(),
        });
        const panelState = {
            mode: "composer",
            camera: {
                fov: 50,
                aspect: 16 / 9,
            },
        };

        const autoFov = manager.computeComposerAutoFovDegrees({
            panelState,
            craftWorld: new THREE.Vector3(0, 0, 0),
            earthWorld: new THREE.Vector3(1, 0, 0),
            moonWorld: new THREE.Vector3(1000, 0, 0),
            earthRadius: 1,
            moonRadius: 1,
            lockTarget: "earth",
        });

        expect(autoFov).toBeGreaterThan(179);
        expect(manager.clampAutoFovDegrees(panelState, autoFov)).toBe(120);
    });

    it("allows manual Frame and Shoot FoV across the optical range", () => {
        const manager = Object.create(AuxiliaryCameraViewsManager.prototype);
        const panelState = {
            mode: "composer",
            camera: {
                fov: 50,
                updateProjectionMatrix: vi.fn(),
            },
            fovControl: {
                setFovDegrees: vi.fn(),
            },
        };

        manager.setPanelFov(panelState, 143.5);

        expect(panelState.camera.fov).toBe(143.5);
        expect(panelState.fovControl.setFovDegrees).toHaveBeenCalledWith(143.5, 143.5);
    });

    it("applies eclipse auto exposure only when the Frame and Shoot Moon target is eligible", () => {
        const manager = Object.assign(Object.create(AuxiliaryCameraViewsManager.prototype), {
            THREE,
        });
        const panelState = {
            mode: "composer",
            composerExposureEv: 0,
            composerAutoExposureEnabled: true,
            composerSolarEclipseActive: true,
            composerEclipseAutoExposureEligible: true,
        };

        expect(manager.resolveComposerExposureState(panelState).autoEv).toBe(5);

        panelState.composerEclipseAutoExposureEligible = false;
        const earthOnlyState = manager.resolveComposerExposureState(panelState);

        expect(earthOnlyState.autoEv).toBe(0);
        expect(earthOnlyState.multiplier).toBe(1);
    });

    it("applies eclipse auto exposure to the visible active occluder", () => {
        const manager = Object.assign(Object.create(AuxiliaryCameraViewsManager.prototype), {
            THREE,
            tmpVectorA: new THREE.Vector3(),
            tmpVectorB: new THREE.Vector3(),
        });
        const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 1000);
        const panelState = {
            mode: "composer",
            camera,
            renderer: {
                domElement: {
                    width: 1280,
                    height: 720,
                },
            },
        };

        camera.position.set(0, 0, 0);
        camera.lookAt(new THREE.Vector3(100, 0, 0));
        camera.updateMatrixWorld(true);
        camera.updateProjectionMatrix();

        expect(manager.shouldApplyComposerEclipseAutoExposure(panelState, {
            eclipseState: { active: true, occluder: "earth" },
            earthWorld: new THREE.Vector3(100, 0, 0),
            earthRadius: 10,
            moonWorld: new THREE.Vector3(0, 100, 0),
            moonRadius: 3,
        })).toBe(true);
        expect(manager.shouldApplyComposerEclipseAutoExposure(panelState, {
            eclipseState: { active: true, occluder: "moon" },
            earthWorld: new THREE.Vector3(100, 0, 0),
            earthRadius: 10,
            moonWorld: new THREE.Vector3(0, 100, 0),
            moonRadius: 3,
        })).toBe(false);

        camera.lookAt(new THREE.Vector3(0, 100, 0));
        camera.updateMatrixWorld(true);
        camera.updateProjectionMatrix();

        expect(manager.shouldApplyComposerEclipseAutoExposure(panelState, {
            eclipseState: { active: true, occluder: "moon" },
            earthWorld: new THREE.Vector3(100, 0, 0),
            earthRadius: 10,
            moonWorld: new THREE.Vector3(0, 100, 0),
            moonRadius: 3,
        })).toBe(true);
        expect(manager.shouldApplyComposerEclipseAutoExposure(panelState, {
            eclipseState: { active: true, occluder: "earth" },
            earthWorld: new THREE.Vector3(100, 0, 0),
            earthRadius: 10,
            moonWorld: new THREE.Vector3(0, 100, 0),
            moonRadius: 3,
        })).toBe(false);
    });

    it("clamps manual Frame and Shoot FoV at optical bounds", () => {
        const manager = Object.create(AuxiliaryCameraViewsManager.prototype);
        const panelState = {
            mode: "composer",
            camera: {
                fov: 50,
                updateProjectionMatrix: vi.fn(),
            },
            fovControl: {
                setFovDegrees: vi.fn(),
            },
        };

        manager.setPanelFov(panelState, 240);

        expect(panelState.camera.fov).toBe(179);
        expect(panelState.fovControl.setFovDegrees).toHaveBeenCalledWith(179, 179);
    });
});

describe("Frame and Shoot lock target FoV behavior", () => {
    function createLockTargetHarness({ lockTarget = "moon", autoFovEnabled = false } = {}) {
        const panelState = {
            mode: "composer",
            composerInteractionEnabled: true,
            composerLockTarget: lockTarget,
            autoFovEnabled,
        };
        const manager = Object.assign(Object.create(AuxiliaryCameraViewsManager.prototype), {
            activateComposerWindow: vi.fn(),
            queuePersistPanelState: vi.fn(),
            requestRender: vi.fn(),
        });
        const syncComposerLockUi = vi.fn();
        const syncAutoToggleUi = vi.fn();
        return {
            manager,
            panelState,
            syncComposerLockUi,
            syncAutoToggleUi,
        };
    }

    it("re-enables auto FoV when switching between Earth and Moon locks", () => {
        const {
            manager,
            panelState,
            syncComposerLockUi,
            syncAutoToggleUi,
        } = createLockTargetHarness({
            lockTarget: "moon",
            autoFovEnabled: false,
        });

        manager.setComposerLockTarget(panelState, "earth", {
            syncComposerLockUi,
            syncAutoToggleUi,
        });

        expect(panelState.composerLockTarget).toBe("earth");
        expect(panelState.autoFovEnabled).toBe(true);
        expect(syncAutoToggleUi).toHaveBeenCalledTimes(1);
        expect(syncComposerLockUi).toHaveBeenCalledTimes(1);
        expect(manager.requestRender).toHaveBeenCalledTimes(1);
    });

    it("does not discard a manual crater-scale FoV when re-clicking the same body lock", () => {
        const {
            manager,
            panelState,
            syncAutoToggleUi,
        } = createLockTargetHarness({
            lockTarget: "moon",
            autoFovEnabled: false,
        });

        manager.setComposerLockTarget(panelState, "moon", {
            syncAutoToggleUi,
        });

        expect(panelState.composerLockTarget).toBe("moon");
        expect(panelState.autoFovEnabled).toBe(false);
        expect(syncAutoToggleUi).not.toHaveBeenCalled();
    });

    it("can force auto FoV back on for guided composer restores", () => {
        const {
            manager,
            panelState,
            syncAutoToggleUi,
        } = createLockTargetHarness({
            lockTarget: "moon",
            autoFovEnabled: false,
        });

        manager.setComposerLockTarget(panelState, "moon", {
            syncAutoToggleUi,
            forceAuto: true,
        });

        expect(panelState.composerLockTarget).toBe("moon");
        expect(panelState.autoFovEnabled).toBe(true);
        expect(syncAutoToggleUi).toHaveBeenCalledTimes(1);
    });

    it("turns off auto FoV when switching to Free", () => {
        const {
            manager,
            panelState,
            syncComposerLockUi,
            syncAutoToggleUi,
        } = createLockTargetHarness({
            lockTarget: "moon",
            autoFovEnabled: true,
        });

        manager.setComposerLockTarget(panelState, "none", {
            syncComposerLockUi,
            syncAutoToggleUi,
        });

        expect(panelState.composerLockTarget).toBe("none");
        expect(panelState.autoFovEnabled).toBe(false);
        expect(syncAutoToggleUi).toHaveBeenCalledTimes(1);
        expect(syncComposerLockUi).toHaveBeenCalledTimes(1);
        expect(manager.requestRender).toHaveBeenCalledTimes(1);
    });

    it("clears stale media-shot state when a lock button is selected", () => {
        const {
            manager,
            panelState,
        } = createLockTargetHarness({
            lockTarget: "earth",
            autoFovEnabled: false,
        });
        panelState.composerMediaDriven = true;
        panelState.composerSurfaceTarget = { bodyId: "moon" };

        manager.setComposerLockTarget(panelState, "moon");

        expect(panelState.composerLockTarget).toBe("moon");
        expect(panelState.composerMediaDriven).toBe(false);
        expect(panelState.composerSurfaceTarget).toBe(null);
    });
});

describe("Frame and Shoot media shot hints", () => {
    it("applies Earth shot hints as locked manual-FoV composer views", () => {
        const panelState = {
            mode: "composer",
            composerInteractionEnabled: true,
            composerLockTarget: "moon",
            composerOrientationReference: "world",
            autoFovEnabled: true,
            camera: {
                fov: 50,
                updateProjectionMatrix: vi.fn(),
            },
            fovControl: {
                setFovDegrees: vi.fn(),
            },
            syncComposerLockUi: vi.fn(),
            syncComposerAutoToggleUi: vi.fn(),
        };
        const manager = Object.assign(Object.create(AuxiliaryCameraViewsManager.prototype), {
            activateComposerWindow: vi.fn(),
            queuePersistPanelState: vi.fn(),
            requestRender: vi.fn(),
        });

        const applied = manager.applyComposerMediaShotHint(panelState, {
            lockTarget: "earth",
            orientationReference: "moon-north",
            verticalFovDegrees: 12.5,
        });

        expect(applied).toBe(true);
        expect(panelState.composerLockTarget).toBe("earth");
        expect(panelState.composerOrientationReference).toBe("moon-north");
        expect(panelState.autoFovEnabled).toBe(false);
        expect(panelState.camera.fov).toBeCloseTo(12.5);
        expect(panelState.composerMediaDriven).toBe(true);
        expect(panelState.syncComposerLockUi).toHaveBeenCalled();
        expect(panelState.syncComposerAutoToggleUi).toHaveBeenCalled();
    });
});

describe("Frame and Shoot local event time formatting", () => {
    it("shows available event precision down to seconds", () => {
        const manager = Object.create(AuxiliaryCameraViewsManager.prototype);

        const formatted = manager.formatLocalDateTime(Date.UTC(2026, 3, 1, 12, 34, 56));

        expect(formatted).toMatch(/\d{2}:\d{2}:56/);
    });
});
