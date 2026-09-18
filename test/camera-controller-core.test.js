import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

import { FakeEvent, installFakeDom } from "./helpers/fake-dom.js";
import {
    CAMERA_LOOK_MODE,
    CAMERA_POSITION_MODE,
    CameraController,
} from "../src/platform/js/rendering/camera-controller.js";

let dom = null;
let domElement = null;

beforeEach(() => {
    dom = installFakeDom();
    domElement = dom.document.createElement("canvas");
    domElement.setBoundingClientRect({ left: 0, top: 0, width: 1280, height: 720 });
});

afterEach(() => {
    dom?.restore();
    dom = null;
    domElement = null;
    vi.restoreAllMocks();
});

function makeController({ withCamera = true, fov = 50 } = {}) {
    const controller = new CameraController(1280, 720, 42);
    if (withCamera) controller.createMainCamera(fov);
    return controller;
}

function wheelEvent(deltaY) {
    const event = new FakeEvent("wheel", { cancelable: true });
    event.deltaY = deltaY;
    return event;
}

function placed(x, y, z) {
    const object = new THREE.Object3D();
    object.position.set(x, y, z);
    object.updateMatrixWorld(true);
    return object;
}

describe("camera construction", () => {
    it("builds the main camera on the viewport aspect with ecliptic north up", () => {
        const controller = makeController({ withCamera: false });

        const camera = controller.createMainCamera(35);

        expect(camera).toBe(controller.camera);
        expect(camera.fov).toBe(35);
        expect(camera.aspect).toBeCloseTo(1280 / 720, 12);
        expect(camera.near).toBe(controller.defaultNear);
        expect(camera.far).toBe(controller.defaultFar);
        expect(camera.up.toArray()).toEqual([0, 0, 1]);
    });

    it("defaults the main camera to a 50 degree lens", () => {
        expect(makeController().camera.fov).toBe(50);
    });

    it("parents the craft camera to the spacecraft and keeps it north up", () => {
        const controller = makeController();
        const craft = placed(3, 4, 5);

        const camera = controller.createCraftCamera(craft);

        expect(camera).toBe(controller.craftCamera);
        expect(craft.children).toContain(camera);
        expect(camera.fov).toBe(50);
        expect(camera.up.toArray()).toEqual([0, 0, 1]);
    });

    it("parents the drone camera and leaves its up vector at the three.js default", () => {
        // The drone view is a free-floating chase camera, so it deliberately
        // keeps the library default rather than the ecliptic north the mission
        // cameras use.
        const controller = makeController();
        const drone = placed(0, 0, 0);

        const camera = controller.createDroneCamera(drone);

        expect(drone.children).toContain(camera);
        expect(camera.fov).toBe(100);
        expect(camera.up.toArray()).toEqual([0, 1, 0]);
    });

    it("honors an explicit field of view for the attached cameras", () => {
        const controller = makeController();

        expect(controller.createCraftCamera(placed(0, 0, 0), 12).fov).toBe(12);
        expect(controller.createDroneCamera(placed(0, 0, 0), 77).fov).toBe(77);
    });
});

describe("control creation", () => {
    it("refuses to build controls before a camera exists", () => {
        const controller = makeController({ withCamera: false });

        expect(controller.createControls(domElement, () => {}, () => {})).toBeNull();
        expect(controller.controls).toBeNull();
    });

    it("refuses to build controls when interaction is switched off", () => {
        const controller = makeController();
        controller.controlsEnabled = false;

        expect(controller.createControls(domElement, () => {}, () => {})).toBeNull();
        expect(controller.controls).toBeNull();
    });

    it("configures trackball controls for static mission navigation", () => {
        const controller = makeController();

        const controls = controller.createControls(domElement, () => {}, () => {});

        expect(controls).toBe(controller.controls);
        expect(controls.staticMoving).toBe(true);
        expect(controls.dynamicDampingFactor).toBe(0.3);
        expect(controls.noZoom).toBe(false);
        expect(controls.noPan).toBe(false);
        expect(controls.keys).toEqual(["KeyA", "KeyS", "KeyD"]);
        expect(controller._rendererDomElement).toBe(domElement);
    });

    it("subscribes the wheel handler to the renderer element", () => {
        const controller = makeController();

        controller.createControls(domElement, () => {}, () => {});

        expect(domElement.listeners.get("wheel")).toContain(controller._mountedWheelHandler);
    });

    it("keeps a single free-fly controller across control rebuilds", () => {
        const controller = makeController();

        controller.createControls(domElement, () => {}, () => {});
        const firstFreeFly = controller.freeFlyControls;
        const firstWheelHandler = controller._mountedWheelHandler;
        controller.createControls(domElement, () => {}, () => {});

        expect(controller.freeFlyControls).toBe(firstFreeFly);
        expect(controller._mountedWheelHandler).toBe(firstWheelHandler);
    });

    it("runs the render callback whenever the controls report a change", () => {
        const controller = makeController();
        const renderCallback = vi.fn();

        const controls = controller.createControls(domElement, () => {}, renderCallback);
        controls.dispatchEvent({ type: "change" });

        expect(renderCallback).toHaveBeenCalledTimes(1);
    });

    it("works without a render callback", () => {
        const controller = makeController();

        const controls = controller.createControls(domElement, () => {});

        expect(() => controls.dispatchEvent({ type: "change" })).not.toThrow();
    });

    it("routes a wheel event on the renderer element into the mounted lens zoom", () => {
        const controller = makeController();
        const controls = controller.createControls(domElement, () => {}, () => {});
        const spacecraft = placed(0, 0, 0);
        controller.setMountedWheelFovEnabled(true);
        controller.setFromToModes(CAMERA_POSITION_MODE.SPACECRAFT, CAMERA_LOOK_MODE.MANUAL);
        controller.updateFromTo({ spacecraft });
        const before = controller.camera.fov;

        domElement.dispatchEvent(wheelEvent(120));

        expect(controller.camera.fov).toBeGreaterThan(before);
        expect(controls.target).toBeDefined();
    });
});

describe("offsets captured from user interaction", () => {
    function mounted({ lookMode = CAMERA_LOOK_MODE.MANUAL } = {}) {
        const controller = makeController();
        controller.camera.position.set(0, 0, 10);
        const controls = controller.createControls(domElement, () => {}, () => {});
        const spacecraft = placed(5, 5, 5);
        const moon = placed(100, 0, 0);
        controller.setFromToModes(CAMERA_POSITION_MODE.SPACECRAFT, lookMode);
        controller.updateFromTo({ spacecraft, moon });
        return { controller, controls, spacecraft, moon };
    }

    it("re-reads the mount standoff after the user drags the camera", () => {
        const { controller, controls } = mounted();

        controller.camera.position.set(20, 0, 0);
        controls.target.set(6, 5, 5);
        controls.dispatchEvent({ type: "change" });

        expect(controller.mountOffset.toArray()).toEqual([15, -5, -5]);
        expect(controller.mountTargetOffset.toArray()).toEqual([1, 0, 0]);
    });

    it("leaves the mount target offset alone when the aim is already forced", () => {
        // With a forced look target there is no user-owned pan to remember.
        const { controller, controls } = mounted({ lookMode: CAMERA_LOOK_MODE.MOON });

        controller.mountTargetOffset.set(9, 9, 9);
        controller.camera.position.set(20, 0, 0);
        controls.target.set(6, 5, 5);
        controls.dispatchEvent({ type: "change" });

        expect(controller.mountOffset.toArray()).toEqual([15, -5, -5]);
        expect(controller.mountTargetOffset.toArray()).toEqual([9, 9, 9]);
    });

    it("re-reads the follow standoff after the user orbits a followed body", () => {
        const controller = makeController();
        controller.camera.position.set(0, 0, 10);
        const controls = controller.createControls(domElement, () => {}, () => {});
        const moon = placed(100, 0, 0);
        controller.setFromToModes(CAMERA_POSITION_MODE.MANUAL, CAMERA_LOOK_MODE.MOON);
        controller.updateFromTo({ moon });

        controller.camera.position.set(130, 0, 0);
        controls.target.set(101, 2, 0);
        controls.dispatchEvent({ type: "change" });

        expect(controller.followOffset.toArray()).toEqual([30, 0, 0]);
        expect(controller.followTargetOffset.toArray()).toEqual([1, 2, 0]);
    });

    it("captures nothing in fully manual mode", () => {
        const controller = makeController();
        const controls = controller.createControls(domElement, () => {}, () => {});
        controller.updateFromTo({ moon: placed(100, 0, 0) });

        controller.camera.position.set(7, 7, 7);
        controls.dispatchEvent({ type: "change" });

        expect(controller.mountOffset.toArray()).toEqual([0, 0, 0]);
        expect(controller.followOffset.toArray()).toEqual([0, 0, 0]);
    });

    it("captures nothing while the free-fly controls own the camera", () => {
        const { controller, controls } = mounted();
        const captured = controller.mountOffset.toArray();

        controller._setFreeFlyEnabled(true);
        controller.camera.position.set(20, 0, 0);
        controls.dispatchEvent({ type: "change" });

        expect(controller.mountOffset.toArray()).toEqual(captured);
    });

    it("captures nothing when the mount body is missing from the frame", () => {
        const controller = makeController();
        const controls = controller.createControls(domElement, () => {}, () => {});
        controller.setFromToModes(CAMERA_POSITION_MODE.SPACECRAFT, CAMERA_LOOK_MODE.MANUAL);
        controller.updateFromTo({});

        controller.camera.position.set(20, 0, 0);
        controls.dispatchEvent({ type: "change" });

        expect(controller.mountOffset.toArray()).toEqual([0, 0, 0]);
    });

    it("captures nothing when the followed body is missing from the frame", () => {
        const controller = makeController();
        const controls = controller.createControls(domElement, () => {}, () => {});
        controller.setFromToModes(CAMERA_POSITION_MODE.MANUAL, CAMERA_LOOK_MODE.MOON);
        controller.updateFromTo({});

        controller.camera.position.set(20, 0, 0);
        controls.dispatchEvent({ type: "change" });

        expect(controller.followOffset.toArray()).toEqual([0, 0, 0]);
    });
});

describe("explicit offset entry points", () => {
    it("adopts a vector mount offset and cancels the lazy capture", () => {
        const controller = makeController();
        controller.setFromToModes(CAMERA_POSITION_MODE.MOON, CAMERA_LOOK_MODE.MANUAL);
        expect(controller._pendingMountOffsetInit).toBe(true);

        controller.setMountOffset(new THREE.Vector3(1, 2, 3));

        expect(controller.mountOffset.toArray()).toEqual([1, 2, 3]);
        expect(controller._pendingMountOffsetInit).toBe(false);
    });

    it("accepts a plain object mount offset and fills in missing axes", () => {
        const controller = makeController();

        controller.setMountOffset({ x: 4 });

        expect(controller.mountOffset.toArray()).toEqual([4, 0, 0]);
    });

    it("ignores a missing mount offset", () => {
        const controller = makeController();
        controller.setFromToModes(CAMERA_POSITION_MODE.MOON, CAMERA_LOOK_MODE.MANUAL);

        controller.setMountOffset(null);

        expect(controller.mountOffset.toArray()).toEqual([0, 0, 0]);
        expect(controller._pendingMountOffsetInit).toBe(true);
    });

    it("adopts a vector or object mount target offset", () => {
        const controller = makeController();

        controller.setMountTargetOffset(new THREE.Vector3(1, 2, 3));
        expect(controller.mountTargetOffset.toArray()).toEqual([1, 2, 3]);

        controller.setMountTargetOffset({ y: 5 });
        expect(controller.mountTargetOffset.toArray()).toEqual([0, 5, 0]);

        controller.setMountTargetOffset(undefined);
        expect(controller.mountTargetOffset.toArray()).toEqual([0, 5, 0]);
    });
});

describe("mode selection", () => {
    it("ignores modes that are not part of the published enums", () => {
        const controller = makeController();

        controller.setFromToModes("orbiter", "starfield");

        expect(controller.positionMode).toBe(CAMERA_POSITION_MODE.MANUAL);
        expect(controller.lookMode).toBe(CAMERA_LOOK_MODE.MANUAL);
        expect(controller._pendingMountOffsetInit).toBe(false);
    });

    it("schedules a standoff capture when switching between two mounts", () => {
        const controller = makeController();

        controller.setFromToModes(CAMERA_POSITION_MODE.EARTH, CAMERA_LOOK_MODE.MANUAL);
        controller.setMountOffset({ x: 1, y: 1, z: 1 });
        controller.setFromToModes(CAMERA_POSITION_MODE.MOON, CAMERA_LOOK_MODE.MANUAL);

        expect(controller._pendingMountOffsetInit).toBe(true);
    });

    it("does not reschedule a standoff capture when the mount is unchanged", () => {
        const controller = makeController();

        controller.setFromToModes(CAMERA_POSITION_MODE.MOON, CAMERA_LOOK_MODE.MANUAL);
        controller.setMountOffset({ x: 1, y: 1, z: 1 });
        controller.setFromToModes(CAMERA_POSITION_MODE.MOON, CAMERA_LOOK_MODE.EARTH);

        expect(controller._pendingMountOffsetInit).toBe(false);
    });

    it("clears a stale pan when a mounted view adopts a forced look target", () => {
        const controller = makeController();
        controller.setFromToModes(CAMERA_POSITION_MODE.MOON, CAMERA_LOOK_MODE.MANUAL);
        controller.followTargetOffset.set(3, 3, 3);

        controller.setFromToModes(CAMERA_POSITION_MODE.MOON, CAMERA_LOOK_MODE.EARTH);

        expect(controller.followTargetOffset.toArray()).toEqual([0, 0, 0]);
        expect(controller._pendingFollowOffsetInit).toBe(false);
    });

    it("schedules a follow capture when a manual camera starts following a body", () => {
        const controller = makeController();
        controller.followTargetOffset.set(3, 3, 3);

        controller.setFromToModes(CAMERA_POSITION_MODE.MANUAL, CAMERA_LOOK_MODE.EARTH);

        expect(controller._pendingFollowOffsetInit).toBe(true);
        expect(controller.followTargetOffset.toArray()).toEqual([0, 0, 0]);
    });

    it("leaves the capture flags alone when nothing actually changed", () => {
        const controller = makeController();
        controller.setFromToModes(CAMERA_POSITION_MODE.MANUAL, CAMERA_LOOK_MODE.EARTH);
        controller._pendingFollowOffsetInit = false;

        controller.setFromToModes(CAMERA_POSITION_MODE.MANUAL, CAMERA_LOOK_MODE.EARTH);

        expect(controller._pendingFollowOffsetInit).toBe(false);
    });
});

describe("manual roll on a mounted view", () => {
    it("normalizes a negative roll into a single turn", () => {
        const controller = makeController();

        controller.setMountedManualRollRad(-Math.PI / 2);

        expect(controller.mountedManualRollRad).toBeCloseTo((3 * Math.PI) / 2, 12);
    });

    it("folds a roll larger than a full turn back into range", () => {
        const controller = makeController();

        controller.setMountedManualRollRad(Math.PI * 2 + 0.25);

        expect(controller.mountedManualRollRad).toBeCloseTo(0.25, 12);
    });

    it("keeps the previous roll when handed a value that is not a number", () => {
        const controller = makeController();
        controller.setMountedManualRollRad(1);

        controller.setMountedManualRollRad("sideways");

        expect(controller.mountedManualRollRad).toBe(1);
    });

    it("accepts a numeric string", () => {
        const controller = makeController();

        controller.setMountedManualRollRad("0.5");

        expect(controller.mountedManualRollRad).toBe(0.5);
    });

    it("rolls the mounted camera about its view direction", () => {
        const controller = makeController();
        controller.camera.position.set(10, 0, 0);
        controller.createControls(domElement, () => {}, () => {});
        const moon = placed(0, 0, 0);
        controller.setFromToModes(CAMERA_POSITION_MODE.MOON, CAMERA_LOOK_MODE.MANUAL);

        controller.updateFromTo({ moon });
        expect(controller.camera.up.toArray().map((v) => Math.round(v))).toEqual([0, 0, 1]);

        controller.setMountedManualRollRad(Math.PI / 2);
        controller.updateFromTo({ moon });

        expect(controller.camera.up.x).toBeCloseTo(0, 10);
        expect(controller.camera.up.y).toBeCloseTo(1, 10);
        expect(controller.camera.up.z).toBeCloseTo(0, 10);
    });

    it("falls back to a stable up vector on a pole-on mounted view", () => {
        // Looking straight down the ecliptic north axis leaves no projection of
        // north onto the image plane, so the controller picks a fixed axis
        // instead of producing a degenerate orientation.
        const controller = makeController();
        controller.camera.position.set(0, 0, 10);
        controller.createControls(domElement, () => {}, () => {});
        const moon = placed(0, 0, 0);
        controller.setFromToModes(CAMERA_POSITION_MODE.MOON, CAMERA_LOOK_MODE.MANUAL);

        controller.updateFromTo({ moon });

        expect(controller.camera.up.toArray()).toEqual([1, 0, 0]);
    });

    it("keeps ecliptic north up when the camera sits on the look target", () => {
        const controller = makeController();
        controller.camera.position.set(0, 0, 0);
        controller.camera.up.set(0, 1, 0);

        controller._applyEclipticNorthUp(new THREE.Vector3(0, 0, 0));

        expect(controller.camera.up.toArray()).toEqual([0, 0, 1]);
    });

    it("does nothing without a camera or a look target", () => {
        const controller = makeController({ withCamera: false });
        expect(() => controller._applyEclipticNorthUp(new THREE.Vector3(1, 0, 0))).not.toThrow();

        const withCamera = makeController();
        withCamera.camera.up.set(0, 1, 0);
        withCamera._applyEclipticNorthUp(null);
        expect(withCamera.camera.up.toArray()).toEqual([0, 1, 0]);
    });
});

describe("clipping and dolly policy", () => {
    it("restores the deterministic clip planes whenever the view updates", () => {
        // Dynamic clip tuning produced sky-sphere artifacts, so the controller
        // keeps the planes pinned to their defaults.
        const controller = makeController();
        controller.createControls(domElement, () => {}, () => {});
        controller.camera.near = 5;
        controller.camera.far = 50;

        controller.updateFromTo({});

        expect(controller.camera.near).toBe(controller.defaultNear);
        expect(controller.camera.far).toBe(controller.defaultFar);
    });

    it("re-enables every trackball axis when both modes return to manual", () => {
        const controller = makeController();
        const controls = controller.createControls(domElement, () => {}, () => {});
        controls.enabled = false;
        controls.noRotate = true;
        controls.noPan = true;
        controls.noZoom = true;

        controller.updateFromTo({});

        expect(controls.enabled).toBe(true);
        expect(controls.noRotate).toBe(false);
        expect(controls.noPan).toBe(false);
        expect(controls.noZoom).toBe(false);
    });

    it("suppresses the mounted dolly when the policy switches it off", () => {
        const controller = makeController();
        const controls = controller.createControls(domElement, () => {}, () => {});
        controller.setFromToModes(CAMERA_POSITION_MODE.MOON, CAMERA_LOOK_MODE.MANUAL);

        controller.setMountedDollyEnabled(false);
        controller.updateFromTo({ moon: placed(0, 0, 0) });
        expect(controls.noZoom).toBe(true);

        controller.setMountedDollyEnabled(true);
        controller.updateFromTo({ moon: placed(0, 0, 0) });
        expect(controls.noZoom).toBe(false);
    });

    it("coerces the wheel and dolly switches to booleans", () => {
        const controller = makeController();

        controller.setMountedWheelFovEnabled("yes");
        controller.setMountedDollyEnabled(0);

        expect(controller._mountedWheelFovEnabled).toBe(true);
        expect(controller._mountedDollyEnabled).toBe(false);
    });

    it("toggles the free-fly controls only when the state actually changes", () => {
        const controller = makeController();
        controller.createControls(domElement, () => {}, () => {});
        const setEnabled = vi.spyOn(controller.freeFlyControls, "setEnabled");

        controller._setFreeFlyEnabled(false);
        expect(setEnabled).not.toHaveBeenCalled();

        controller._setFreeFlyEnabled(true);
        controller._setFreeFlyEnabled(true);
        expect(setEnabled).toHaveBeenCalledTimes(1);
        expect(setEnabled).toHaveBeenCalledWith(true);
    });
});

describe("direct camera manipulation", () => {
    it("moves, aims and re-lenses the main camera", () => {
        const controller = makeController();

        controller.setPosition(1, 2, 3);
        controller.setFov(11);
        controller.setUp(0, 1, 0);

        expect(controller.camera.position.toArray()).toEqual([1, 2, 3]);
        expect(controller.camera.fov).toBe(11);
        expect(controller.camera.up.toArray()).toEqual([0, 1, 0]);
    });

    it("is inert before a camera exists", () => {
        const controller = makeController({ withCamera: false });

        expect(() => {
            controller.setPosition(1, 2, 3);
            controller.setFov(11);
            controller.setUp(0, 1, 0);
            controller.updateAspect(640, 480);
            controller.update();
            controller.updateFromTo({});
        }).not.toThrow();
        expect(controller.width).toBe(640);
    });

    it("reports the trackball camera distance from the origin", () => {
        const controller = makeController();
        controller.createControls(domElement, () => {}, () => {});
        controller.setPosition(0, 3, 4);

        expect(controller.getDistanceFromOrigin()).toBeCloseTo(5, 12);
    });

    it("falls back to the configured default distance without controls", () => {
        expect(makeController().getDistanceFromOrigin()).toBe(42);
    });

    it("drives the trackball update from the animation loop", () => {
        const controller = makeController();
        controller.createControls(domElement, () => {}, () => {});
        const update = vi.spyOn(controller.controls, "update");

        controller.update();

        expect(update).toHaveBeenCalledTimes(1);
    });

    it("re-aspects every camera on resize", () => {
        const controller = makeController();
        controller.createCraftCamera(placed(0, 0, 0));
        controller.createDroneCamera(placed(0, 0, 0));

        controller.updateAspect(800, 400);

        expect(controller.width).toBe(800);
        expect(controller.height).toBe(400);
        expect(controller.camera.aspect).toBe(2);
        expect(controller.craftCamera.aspect).toBe(2);
        expect(controller.droneCamera.aspect).toBe(2);
    });
});

describe("disposal", () => {
    it("detaches every camera, listener and control from the scene", () => {
        const controller = makeController();
        const craft = placed(0, 0, 0);
        const drone = placed(0, 0, 0);
        controller.createCraftCamera(craft);
        controller.createDroneCamera(drone);
        const controls = controller.createControls(domElement, () => {}, () => {});
        const controlsDispose = vi.spyOn(controls, "dispose");
        const freeFlyDispose = vi.spyOn(controller.freeFlyControls, "dispose");

        controller.dispose(craft, drone);

        expect(controller.camera).toBeNull();
        expect(controller.craftCamera).toBeNull();
        expect(controller.droneCamera).toBeNull();
        expect(controller.controls).toBeNull();
        expect(controller.freeFlyControls).toBeNull();
        expect(craft.children).toEqual([]);
        expect(drone.children).toEqual([]);
        expect(controlsDispose).toHaveBeenCalledTimes(1);
        expect(freeFlyDispose).toHaveBeenCalledTimes(1);
        expect(domElement.listeners.get("wheel")?.size ?? 0).toBe(0);
        expect(controller._fromToChangeHandler).toBeNull();
        expect(controller._mountedWheelHandler).toBeNull();
    });

    it("drops the attached cameras even when the parents are not supplied", () => {
        const controller = makeController();
        const craft = placed(0, 0, 0);
        const drone = placed(0, 0, 0);
        controller.createCraftCamera(craft);
        controller.createDroneCamera(drone);

        controller.dispose();

        expect(controller.craftCamera).toBeNull();
        expect(controller.droneCamera).toBeNull();
    });

    it("is safe to call on a controller that never built anything", () => {
        const controller = makeController({ withCamera: false });

        expect(() => controller.dispose()).not.toThrow();
    });

    it("stops routing wheel input after disposal", () => {
        const controller = makeController();
        controller.createControls(domElement, () => {}, () => {});
        controller.setMountedWheelFovEnabled(true);
        controller.setFromToModes(CAMERA_POSITION_MODE.MOON, CAMERA_LOOK_MODE.MANUAL);
        controller.updateFromTo({ moon: placed(0, 0, 0) });

        controller.dispose();

        expect(() => domElement.dispatchEvent(wheelEvent(120))).not.toThrow();
    });
});
