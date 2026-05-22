import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";

import {
    CAMERA_LOOK_MODE,
    CAMERA_POSITION_MODE,
    CameraController,
} from "../src/platform/js/rendering/camera-controller.js";

function createController() {
    const controller = new CameraController(1280, 720, 10);
    controller.createMainCamera(60);
    controller.controls = {
        target: new THREE.Vector3(),
        dispatchEvent: vi.fn(),
        enabled: true,
        noPan: false,
        noRotate: false,
        noZoom: false,
    };
    return controller;
}

function createWheelEvent(deltaY = 120) {
    return {
        deltaY,
        preventDefault: vi.fn(),
    };
}

describe("CameraController mounted wheel FoV behavior", () => {
    it("does not remap mounted wheel input to FoV by default", () => {
        const controller = createController();
        const spacecraft = new THREE.Object3D();
        spacecraft.position.set(12, -4, 7);
        spacecraft.updateMatrixWorld(true);

        controller.setFromToModes(CAMERA_POSITION_MODE.SPACECRAFT, CAMERA_LOOK_MODE.MANUAL);
        controller.updateFromTo({ spacecraft });
        const initialPosition = controller.camera.position.clone();
        const initialFov = controller.camera.fov;
        const wheelEvent = createWheelEvent(120);

        controller._handleMountedWheelAsFov(wheelEvent);

        expect(wheelEvent.preventDefault).not.toHaveBeenCalled();
        expect(controller.camera.position.distanceTo(initialPosition)).toBeLessThan(1e-12);
        expect(controller.camera.fov).toBe(initialFov);
        expect(controller.controls.dispatchEvent).not.toHaveBeenCalled();
    });

    it("does nothing in manual position mode", () => {
        const controller = createController();
        const initialFov = controller.camera.fov;
        const initialPosition = controller.camera.position.clone();
        const wheelEvent = createWheelEvent(-240);

        controller.setFromToModes(CAMERA_POSITION_MODE.MANUAL, CAMERA_LOOK_MODE.MANUAL);
        controller._handleMountedWheelAsFov(wheelEvent);

        expect(wheelEvent.preventDefault).not.toHaveBeenCalled();
        expect(controller.camera.fov).toBe(initialFov);
        expect(controller.camera.position.distanceTo(initialPosition)).toBeLessThan(1e-12);
    });

    it("preserves mounted offset distance as the followed body moves", () => {
        const controller = createController();
        const spacecraft = new THREE.Object3D();
        spacecraft.position.set(3, 2, 1);
        spacecraft.updateMatrixWorld(true);

        controller.setFromToModes(CAMERA_POSITION_MODE.SPACECRAFT, CAMERA_LOOK_MODE.MANUAL);
        controller.setMountOffset(new THREE.Vector3(0, 0, 5));
        controller.updateFromTo({ spacecraft });

        spacecraft.position.set(-8, 5, 13);
        spacecraft.updateMatrixWorld(true);
        controller.updateFromTo({ spacecraft });

        expect(controller.camera.position.distanceTo(spacecraft.position)).toBeCloseTo(5, 8);
    });

    it("re-centers spacecraft-to-moon views when a stale mounted offset is present", () => {
        const controller = createController();
        const spacecraft = new THREE.Object3D();
        const moon = new THREE.Object3D();
        spacecraft.position.set(3, 2, 1);
        moon.position.set(100, -20, 15);
        spacecraft.updateMatrixWorld(true);
        moon.updateMatrixWorld(true);

        controller.setFromToModes(CAMERA_POSITION_MODE.SPACECRAFT, CAMERA_LOOK_MODE.MOON);
        controller.setMountOffset(new THREE.Vector3(9, -4, 2));
        controller.updateFromTo({ spacecraft, moon });

        expect(controller.mountOffset.toArray()).toEqual([0, 0, 0]);
        expect(controller.camera.position.toArray()).toEqual(spacecraft.position.toArray());
        expect(controller.controls.target.toArray()).toEqual(moon.position.toArray());
    });

    it("re-centers earth-to-moon views when entering from an offset camera", () => {
        const controller = createController();
        const earth = new THREE.Object3D();
        const moon = new THREE.Object3D();
        earth.position.set(-12, 8, 4);
        moon.position.set(380, 40, 22);
        earth.updateMatrixWorld(true);
        moon.updateMatrixWorld(true);
        controller.camera.position.set(40, 16, 9);

        controller.setFromToModes(CAMERA_POSITION_MODE.EARTH, CAMERA_LOOK_MODE.MOON);
        controller.updateFromTo({ earth, moon });

        expect(controller.mountOffset.toArray()).toEqual([0, 0, 0]);
        expect(controller.camera.position.toArray()).toEqual(earth.position.toArray());
        expect(controller.controls.target.toArray()).toEqual(moon.position.toArray());
    });

    it("preserves full camera offset in follow mode as the target moves", () => {
        const controller = createController();
        const moon = new THREE.Object3D();
        moon.position.set(100, 200, 300);
        moon.updateMatrixWorld(true);

        controller.camera.position.set(150, 210, 320);
        controller.setFromToModes(CAMERA_POSITION_MODE.MANUAL, CAMERA_LOOK_MODE.MOON);
        controller.updateFromTo({ moon });

        expect(controller.camera.position.x).toBeCloseTo(150, 8);
        expect(controller.camera.position.y).toBeCloseTo(210, 8);
        expect(controller.camera.position.z).toBeCloseTo(320, 8);

        moon.position.set(110, 220, 330);
        moon.updateMatrixWorld(true);
        controller.updateFromTo({ moon });

        expect(controller.camera.position.x).toBeCloseTo(160, 8);
        expect(controller.camera.position.y).toBeCloseTo(230, 8);
        expect(controller.camera.position.z).toBeCloseTo(350, 8);
    });

    it("keeps manual follow drags north-up while allowing orbit around the target", () => {
        const controller = createController();
        const moon = new THREE.Object3D();
        moon.position.set(100, 200, 300);
        moon.updateMatrixWorld(true);

        controller.camera.position.set(150, 210, 320);
        controller.setFromToModes(CAMERA_POSITION_MODE.MANUAL, CAMERA_LOOK_MODE.MOON);
        controller.updateFromTo({ moon });

        const userOrbitPosition = new THREE.Vector3(144, 235, 318);
        const userOrbitUp = new THREE.Vector3(0.17, 0.52, 0.84).normalize();
        controller.camera.position.copy(userOrbitPosition);
        controller.camera.up.copy(userOrbitUp);
        controller.followOffset.copy(controller.camera.position).sub(moon.position);

        controller.updateFromTo({ moon });

        const viewDir = moon.position.clone().sub(userOrbitPosition).normalize();
        const expectedUp = new THREE.Vector3(0, 0, 1)
            .addScaledVector(viewDir, -viewDir.z)
            .normalize();

        expect(controller.camera.position.distanceTo(userOrbitPosition)).toBeLessThan(1e-12);
        expect(controller.camera.up.distanceTo(expectedUp)).toBeLessThan(1e-12);
        expect(controller.controls.target.toArray()).toEqual(moon.position.toArray());
        expect(controller.controls.noRotate).toBe(false);
        expect(controller.controls.noPan).toBe(false);
    });

    it("preserves manual follow pan offsets relative to the followed target", () => {
        const controller = createController();
        const moon = new THREE.Object3D();
        moon.position.set(100, 200, 300);
        moon.updateMatrixWorld(true);

        controller.camera.position.set(150, 210, 320);
        controller.setFromToModes(CAMERA_POSITION_MODE.MANUAL, CAMERA_LOOK_MODE.MOON);
        controller.updateFromTo({ moon });

        controller.followOffset.set(50, 10, 20);
        controller.followTargetOffset.set(6, -4, 2);
        moon.position.set(110, 220, 330);
        moon.updateMatrixWorld(true);
        controller.updateFromTo({ moon });

        expect(controller.camera.position.toArray()).toEqual([160, 230, 350]);
        expect(controller.controls.target.toArray()).toEqual([116, 216, 332]);
        expect(controller.controls.noPan).toBe(false);
    });

    it("allows panning when mounted to a body with manual aim", () => {
        const controller = createController();
        const earth = new THREE.Object3D();
        earth.position.set(4, -8, 2);
        earth.updateMatrixWorld(true);

        controller.setFromToModes(CAMERA_POSITION_MODE.EARTH, CAMERA_LOOK_MODE.MANUAL);
        controller.setMountOffset(new THREE.Vector3(0, 0, 5));
        controller.setMountTargetOffset(new THREE.Vector3(3, 1, 0));
        controller.updateFromTo({ earth });

        expect(controller.camera.position.toArray()).toEqual([4, -8, 7]);
        expect(controller.controls.target.toArray()).toEqual([7, -7, 2]);
        expect(controller.controls.noRotate).toBe(true);
        expect(controller.controls.noPan).toBe(false);
    });

    it("can still opt into mounted FoV wheel behavior explicitly", () => {
        const controller = createController();
        const spacecraft = new THREE.Object3D();
        spacecraft.position.set(12, -4, 7);
        spacecraft.updateMatrixWorld(true);

        controller.setMountedWheelFovEnabled(true);
        controller.setFromToModes(CAMERA_POSITION_MODE.SPACECRAFT, CAMERA_LOOK_MODE.MANUAL);
        controller.updateFromTo({ spacecraft });
        const initialPosition = controller.camera.position.clone();
        const initialFov = controller.camera.fov;
        const wheelEvent = createWheelEvent(120);

        controller._handleMountedWheelAsFov(wheelEvent);

        expect(wheelEvent.preventDefault).toHaveBeenCalledTimes(1);
        expect(controller.camera.position.distanceTo(initialPosition)).toBeLessThan(1e-12);
        expect(controller.camera.fov).toBeCloseTo(initialFov + 0.2, 8);
        expect(controller.controls.dispatchEvent).toHaveBeenCalledWith({
            type: "mounted-fov-input",
            currentFov: initialFov,
            nextFov: initialFov + 0.2,
            deltaY: 120,
        });
        expect(controller.controls.dispatchEvent).toHaveBeenCalledWith({ type: "change" });
    });
});
