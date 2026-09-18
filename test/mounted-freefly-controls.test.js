import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

import { FakeEvent, installFakeDom } from "./helpers/fake-dom.js";
import { MountedFreeFlyControls } from "../src/platform/js/rendering/mounted-freefly-controls.js";

let dom = null;
let domElement = null;
let controller = null;
let controls = null;
let onChange = null;

function makeController() {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    camera.position.set(0, 0, 0);
    camera.lookAt(new THREE.Vector3(1, 0, 0));
    camera.updateMatrixWorld(true);
    return {
        camera,
        positionMode: "CRAFT",
        mountOffset: new THREE.Vector3(0, 0, 0),
        _mountWorld: new THREE.Vector3(),
        _resolveTargetWorld: vi.fn(() => new THREE.Vector3(10, 20, 30)),
        controls: { dispatchEvent: vi.fn() },
    };
}

function pointerEvent(type, overrides = {}) {
    const event = new FakeEvent(type);
    return Object.assign(event, {
        pointerType: "mouse",
        pointerId: 1,
        button: 0,
        shiftKey: false,
        clientX: 0,
        clientY: 0,
    }, overrides);
}

function wheelEvent(deltaY) {
    return Object.assign(new FakeEvent("wheel"), { deltaY });
}

beforeEach(() => {
    dom = installFakeDom();
    domElement = dom.document.createElement("canvas");
    domElement.setPointerCapture = vi.fn();
    domElement.releasePointerCapture = vi.fn();
    domElement.hasPointerCapture = vi.fn(() => true);
    controller = makeController();
    onChange = vi.fn();
    controls = new MountedFreeFlyControls({ domElement, controller, onChange });
});

afterEach(() => {
    controls?.dispose();
    controls = null;
    dom?.restore();
    dom = null;
});

function drag(from, to, overrides = {}) {
    domElement.dispatchEvent(pointerEvent("pointerdown", {
        clientX: from[0],
        clientY: from[1],
        ...overrides,
    }));
    domElement.dispatchEvent(pointerEvent("pointermove", { clientX: to[0], clientY: to[1] }));
}

describe("event wiring", () => {
    it("starts disabled and ignores input", () => {
        expect(controls.enabled).toBe(false);

        drag([0, 0], [50, 0]);

        expect(onChange).not.toHaveBeenCalled();
        expect(domElement.setPointerCapture).not.toHaveBeenCalled();
    });

    it("detaches every listener on disposal", () => {
        controls.setEnabled(true);

        controls.dispose();
        drag([0, 0], [50, 0]);
        domElement.dispatchEvent(wheelEvent(-100));

        expect(onChange).not.toHaveBeenCalled();
        controls = null;
    });

    it("ignores a repeated enable", () => {
        controls.setEnabled(true);
        controls._yaw = 1.234;

        controls.setEnabled(true);

        expect(controls._yaw).toBe(1.234);
    });

    it("drops an in-flight drag when disabled", () => {
        controls.setEnabled(true);
        domElement.dispatchEvent(pointerEvent("pointerdown"));
        expect(controls._pointerId).toBe(1);

        controls.setEnabled(false);

        expect(controls._pointerId).toBeNull();
        expect(controls._dragMode).toBeNull();
    });

    it("suppresses the context menu only while enabled", () => {
        const ignored = new FakeEvent("contextmenu", { cancelable: true });
        domElement.dispatchEvent(ignored);
        expect(ignored.defaultPrevented).toBe(false);

        controls.setEnabled(true);
        const suppressed = new FakeEvent("contextmenu", { cancelable: true });
        domElement.dispatchEvent(suppressed);
        expect(suppressed.defaultPrevented).toBe(true);
    });
});

describe("pointer gestures", () => {
    beforeEach(() => {
        controls.setEnabled(true);
    });

    it("adopts the camera's current heading when a drag starts", () => {
        controller.camera.lookAt(new THREE.Vector3(0, 1, 0));
        controller.camera.updateMatrixWorld(true);

        domElement.dispatchEvent(pointerEvent("pointerdown"));

        expect(controls._yaw).toBeCloseTo(Math.PI / 2, 3);
        expect(controls._pitch).toBeCloseTo(0, 3);
        expect(domElement.setPointerCapture).toHaveBeenCalledWith(1);
    });

    it("turns the view right when the pointer drags right", () => {
        drag([0, 0], [50, 0]);

        expect(controls._yaw).toBeCloseTo(50 * controls.rotateSpeed, 9);
        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("clamps the pitch just short of the poles", () => {
        drag([0, 0], [0, 100000]);

        expect(controls._pitch).toBeCloseTo((Math.PI / 2) - 0.01, 9);
    });

    it("ignores a move that does not change position", () => {
        drag([10, 10], [10, 10]);

        expect(onChange).not.toHaveBeenCalled();
    });

    it("ignores moves from a different pointer", () => {
        domElement.dispatchEvent(pointerEvent("pointerdown", { pointerId: 1 }));

        domElement.dispatchEvent(pointerEvent("pointermove", { pointerId: 2, clientX: 80 }));

        expect(onChange).not.toHaveBeenCalled();
    });

    it("ignores a second pointer while one is already dragging", () => {
        domElement.dispatchEvent(pointerEvent("pointerdown", { pointerId: 1 }));

        domElement.dispatchEvent(pointerEvent("pointerdown", { pointerId: 7 }));

        expect(controls._pointerId).toBe(1);
    });

    it("ignores touch and pen input", () => {
        domElement.dispatchEvent(pointerEvent("pointerdown", { pointerType: "touch" }));

        expect(controls._pointerId).toBeNull();
    });

    it("ignores the middle mouse button", () => {
        domElement.dispatchEvent(pointerEvent("pointerdown", { button: 1 }));

        expect(controls._dragMode).toBeNull();
    });

    it("strafes with the right button", () => {
        drag([0, 0], [100, 0], { button: 2 });

        expect(controls._dragMode).toBe("strafe");
        expect(controller.mountOffset.length()).toBeGreaterThan(0);
    });

    it("strafes with shift and the left button", () => {
        drag([0, 0], [100, 0], { shiftKey: true });

        expect(controls._dragMode).toBe("strafe");
    });

    it("moves the mount up when a strafe drag goes up the screen", () => {
        drag([0, 0], [0, -100], { button: 2 });

        expect(controller.mountOffset.z).toBeGreaterThan(0);
        expect(controller.mountOffset.x).toBeCloseTo(0, 9);
    });

    it("scales the strafe step with the current mount distance", () => {
        drag([0, 0], [100, 0], { button: 2 });
        const nearOffset = controller.mountOffset.length();

        domElement.dispatchEvent(pointerEvent("pointerup"));
        controller.mountOffset.set(0, 0, 500);
        drag([0, 0], [100, 0], { button: 2 });

        expect(controller.mountOffset.clone().sub(new THREE.Vector3(0, 0, 500)).length())
            .toBeGreaterThan(nearOffset);
    });

    it("releases the pointer on pointer up", () => {
        domElement.dispatchEvent(pointerEvent("pointerdown"));

        domElement.dispatchEvent(pointerEvent("pointerup"));

        expect(controls._pointerId).toBeNull();
        expect(controls._dragMode).toBeNull();
        expect(domElement.releasePointerCapture).toHaveBeenCalledWith(1);
    });

    it("skips the release when the capture is already gone", () => {
        domElement.dispatchEvent(pointerEvent("pointerdown"));
        domElement.hasPointerCapture.mockReturnValue(false);

        domElement.dispatchEvent(pointerEvent("pointerup"));

        expect(domElement.releasePointerCapture).not.toHaveBeenCalled();
    });

    it("survives a capture query that throws", () => {
        domElement.dispatchEvent(pointerEvent("pointerdown"));
        domElement.hasPointerCapture.mockImplementation(() => {
            throw new Error("stale pointer id");
        });

        expect(() => domElement.dispatchEvent(pointerEvent("pointerup"))).not.toThrow();
        expect(controls._pointerId).toBeNull();
    });

    it("survives a release that throws", () => {
        domElement.dispatchEvent(pointerEvent("pointerdown"));
        domElement.releasePointerCapture.mockImplementation(() => {
            throw new Error("stale pointer id");
        });

        expect(() => domElement.dispatchEvent(pointerEvent("pointerup"))).not.toThrow();
    });

    it("ignores an unmatched pointer up", () => {
        domElement.dispatchEvent(pointerEvent("pointerup", { pointerId: 9 }));

        expect(domElement.releasePointerCapture).not.toHaveBeenCalled();
    });
});

describe("wheel dolly", () => {
    beforeEach(() => {
        controls.setEnabled(true);
    });

    it("moves forward on a wheel-up and back on a wheel-down", () => {
        domElement.dispatchEvent(wheelEvent(-100));
        const forwardOffset = controller.mountOffset.clone();
        expect(forwardOffset.x).toBeGreaterThan(0);

        domElement.dispatchEvent(wheelEvent(100));

        expect(controller.mountOffset.x).toBeLessThan(forwardOffset.x);
    });

    it("prevents the page from scrolling", () => {
        const event = wheelEvent(-100);

        domElement.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
    });

    it("ignores the wheel while disabled", () => {
        controls.setEnabled(false);

        domElement.dispatchEvent(wheelEvent(-100));

        expect(controller.mountOffset.length()).toBe(0);
    });

    it("does nothing without a mounted camera", () => {
        controller.camera = null;

        domElement.dispatchEvent(wheelEvent(-100));

        expect(onChange).not.toHaveBeenCalled();
    });
});

describe("change publication", () => {
    beforeEach(() => {
        controls.setEnabled(true);
    });

    it("keeps the camera position on the mount plus its offset", () => {
        domElement.dispatchEvent(wheelEvent(-100));

        const expected = new THREE.Vector3(10, 20, 30).add(controller.mountOffset);
        expect(controller.camera.position.distanceTo(expected)).toBeCloseTo(0, 9);
        expect(controller._resolveTargetWorld)
            .toHaveBeenCalledWith("CRAFT", controller._mountWorld);
    });

    it("notifies the trackball listeners and the caller's hook", () => {
        domElement.dispatchEvent(wheelEvent(-100));

        expect(controller.controls.dispatchEvent).toHaveBeenCalledWith({ type: "change" });
        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("works without an onChange hook", () => {
        controls.dispose();
        controls = new MountedFreeFlyControls({ domElement, controller });
        controls.setEnabled(true);

        expect(() => domElement.dispatchEvent(wheelEvent(-100))).not.toThrow();
    });

    it("leaves the camera alone when the mount target cannot be resolved", () => {
        controller._resolveTargetWorld.mockReturnValue(null);
        const before = controller.camera.position.clone();

        domElement.dispatchEvent(wheelEvent(-100));

        expect(controller.camera.position.equals(before)).toBe(true);
        expect(onChange).toHaveBeenCalledTimes(1);
    });
});
