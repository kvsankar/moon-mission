import { afterEach, describe, expect, it, vi } from "vitest";
import { Vector3 } from "three";

import { createCameraActions } from "../src/platform/js/app/camera-actions.js";
import { fovDegreesToZoomSliderValue } from "../src/platform/js/app/fov-slider-scale.js";

function createVectorTarget(x, y, z) {
    return {
        getWorldPosition(out = new Vector3()) {
            return out.set(x, y, z);
        },
    };
}

function createDocumentStub() {
    return {
        getElementById() {
            return null;
        },
        querySelector() {
            return null;
        },
        querySelectorAll() {
            return [];
        },
    };
}

function createFovControlDocumentStub() {
    const elementsById = new Map();

    class FakeElement {
        constructor(tagName = "div") {
            this.tagName = tagName;
            this.children = [];
            this.attributes = {};
            this.textContent = "";
            this.value = "";
            this.disabled = false;
            this.hidden = false;
            this.type = "";
            this.classNames = new Set();
            this.classList = {
                add: (...names) => {
                    names.forEach((name) => this.classNames.add(name));
                },
                toggle: (name, enabled) => {
                    if (enabled) {
                        this.classNames.add(name);
                        return true;
                    }
                    this.classNames.delete(name);
                    return false;
                },
            };
        }

        set id(value) {
            this._id = String(value);
            elementsById.set(this._id, this);
        }

        get id() {
            return this._id || "";
        }

        appendChild(child) {
            this.children.push(child);
            return child;
        }

        replaceChildren(...children) {
            this.children = children;
        }

        setAttribute(name, value) {
            this.attributes[name] = String(value);
        }

        getAttribute(name) {
            return this.attributes[name] ?? null;
        }
    }

    const container = new FakeElement("div");
    container.id = "desktop-main-fov";

    return {
        createElement(tagName) {
            return new FakeElement(tagName);
        },
        getElementById(id) {
            return elementsById.get(id) || null;
        },
        querySelector() {
            return null;
        },
        querySelectorAll() {
            return [];
        },
    };
}

describe("createCameraActions", () => {
    const originalDocument = globalThis.document;

    afterEach(() => {
        globalThis.document = originalDocument;
    });

    it("re-centers semantic mounted views on the source body", () => {
        globalThis.document = createDocumentStub();

        let positionMode = "earth";
        let lookMode = "moon";

        const camera = {
            position: new Vector3(25, -10, 4),
            fov: 50,
            up: new Vector3(0, 0, 1),
            lookAt: vi.fn(),
            updateProjectionMatrix: vi.fn(),
        };

        const controller = {
            camera,
            controls: {
                target: new Vector3(),
                update: vi.fn(),
                addEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            },
            _freeFlyActive: false,
            _mountWorld: new Vector3(),
            _lookWorld: new Vector3(),
            mountOffset: new Vector3(25, -10, 4),
            updateFromTo: vi.fn(),
            setFromToModes(nextPositionMode, nextLookMode) {
                this.positionMode = nextPositionMode;
                this.lookMode = nextLookMode;
            },
            _resolveTargetWorld(mode, out = new Vector3()) {
                if (mode === "earth") return out.set(0, 0, 0);
                if (mode === "moon") return out.set(100, 0, 0);
                if (mode === "spacecraft") return out.set(50, 0, 0);
                return null;
            },
            setMountOffset(offset) {
                this.mountOffset.set(offset.x ?? 0, offset.y ?? 0, offset.z ?? 0);
            },
            setMountTargetOffset: vi.fn(),
        };

        const scene = {
            initialized3D: true,
            camera,
            cameraController: controller,
            earthContainer: createVectorTarget(0, 0, 0),
            moonContainer: createVectorTarget(100, 0, 0),
            craft: createVectorTarget(50, 0, 0),
        };

        const actions = createCameraActions({
            animationScenes: { geo: scene },
            getConfig: () => "geo",
            readCameraPositionMode: () => positionMode,
            readCameraLookMode: () => lookMode,
            applyCameraFromTo: (next) => {
                if (typeof next?.positionMode === "string") {
                    positionMode = next.positionMode;
                }
                if (typeof next?.lookMode === "string") {
                    lookMode = next.lookMode;
                }
            },
            readPlaneSelection: () => "default",
            setPlaneSelection: vi.fn(),
            handlePlaneChange: vi.fn(),
            render: vi.fn(),
            getViewSky: () => false,
            getViewConstellationLines: () => false,
        });

        actions.changeCameraFromTo({ target: { id: "camera-look" } });

        expect(scene.camera.position.toArray()).toEqual([0, 0, 0]);
        expect(scene.cameraController.mountOffset.length()).toBe(0);
    });

    it("re-centers semantic mounted views on the source body in relative mode too", () => {
        globalThis.document = createDocumentStub();

        let positionMode = "earth";
        let lookMode = "moon";

        const initialCameraPosition = new Vector3(25, -10, 4);
        const camera = {
            position: initialCameraPosition.clone(),
            fov: 50,
            up: new Vector3(0, 0, 1),
            lookAt: vi.fn(),
            updateProjectionMatrix: vi.fn(),
        };

        const controller = {
            camera,
            controls: {
                target: new Vector3(),
                update: vi.fn(),
                addEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            },
            _freeFlyActive: false,
            _mountWorld: new Vector3(),
            _lookWorld: new Vector3(),
            mountOffset: new Vector3(0, 0, 0),
            updateFromTo: vi.fn(),
            setFromToModes(nextPositionMode, nextLookMode) {
                this.positionMode = nextPositionMode;
                this.lookMode = nextLookMode;
            },
            _resolveTargetWorld(mode, out = new Vector3()) {
                if (mode === "earth") return out.set(0, 0, 0);
                if (mode === "moon") return out.set(100, 0, 0);
                if (mode === "spacecraft") return out.set(50, 0, 0);
                return null;
            },
            setMountOffset(offset) {
                this.mountOffset.set(offset.x ?? 0, offset.y ?? 0, offset.z ?? 0);
            },
            setMountTargetOffset: vi.fn(),
        };

        const scene = {
            initialized3D: true,
            camera,
            cameraController: controller,
            earthContainer: createVectorTarget(0, 0, 0),
            moonContainer: createVectorTarget(100, 0, 0),
            craft: createVectorTarget(50, 0, 0),
        };

        const actions = createCameraActions({
            animationScenes: { relative: scene },
            getConfig: () => "relative",
            readCameraPositionMode: () => positionMode,
            readCameraLookMode: () => lookMode,
            applyCameraFromTo: (next) => {
                if (typeof next?.positionMode === "string") {
                    positionMode = next.positionMode;
                }
                if (typeof next?.lookMode === "string") {
                    lookMode = next.lookMode;
                }
            },
            readPlaneSelection: () => "default",
            setPlaneSelection: vi.fn(),
            handlePlaneChange: vi.fn(),
            render: vi.fn(),
            getViewSky: () => false,
            getViewConstellationLines: () => false,
        });

        actions.changeCameraFromTo({ target: { id: "camera-look" } });

        expect(scene.camera.position.toArray()).toEqual([0, 0, 0]);
        expect(scene.cameraController.mountOffset.length()).toBe(0);
    });

    it("resets the Trackball pivot when releasing manual follow without snapping the camera", () => {
        globalThis.document = createDocumentStub();

        let positionMode = "manual";
        let lookMode = "manual";

        const camera = {
            position: new Vector3(25, -10, 4),
            fov: 50,
            up: new Vector3(0.1, 0.4, 0.9),
            lookAt: vi.fn(),
            updateProjectionMatrix: vi.fn(),
        };

        const controls = {
            target: new Vector3(100, 0, 0),
            enabled: true,
            noRotate: true,
            noPan: true,
            noZoom: true,
            update: vi.fn(),
            addEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        };

        const controller = {
            camera,
            controls,
            _freeFlyActive: false,
            _setFreeFlyEnabled: vi.fn(),
            updateFromTo: vi.fn(),
            setFromToModes(nextPositionMode, nextLookMode) {
                this.positionMode = nextPositionMode;
                this.lookMode = nextLookMode;
            },
        };

        const scene = {
            initialized3D: true,
            camera,
            cameraController: controller,
            defaultLookTarget: { x: 1, y: 2, z: 3 },
            setCameraParameters: vi.fn(),
        };

        const actions = createCameraActions({
            animationScenes: { geo: scene },
            getConfig: () => "geo",
            readCameraPositionMode: () => positionMode,
            readCameraLookMode: () => lookMode,
            applyCameraFromTo: (next) => {
                if (typeof next?.positionMode === "string") {
                    positionMode = next.positionMode;
                }
                if (typeof next?.lookMode === "string") {
                    lookMode = next.lookMode;
                }
            },
            readPlaneSelection: () => "default",
            setPlaneSelection: vi.fn(),
            handlePlaneChange: vi.fn(),
            render: vi.fn(),
            getViewSky: () => false,
            getViewConstellationLines: () => false,
        });

        actions.changeCameraFromTo({
            detail: { preserveManualRelease: true },
            target: { id: "camera-pair", name: "camera-pair" },
        });

        expect(scene.setCameraParameters).not.toHaveBeenCalled();
        expect(camera.position.toArray()).toEqual([25, -10, 4]);
        expect(controls.target.toArray()).toEqual([1, 2, 3]);
        expect(camera.up.toArray()).toEqual([0, 0, 1]);
        expect(camera.lookAt).toHaveBeenCalledWith(controls.target);
        expect(controls.noRotate).toBe(false);
        expect(controls.noPan).toBe(false);
        expect(controls.noZoom).toBe(false);
        expect(controller._setFreeFlyEnabled).toHaveBeenCalledWith(false);
    });

    it("preserves plane camera up vector when resetting pivot after a plane switch", () => {
        globalThis.document = createDocumentStub();

        const camera = {
            position: new Vector3(0, 0, 10),
            fov: 50,
            up: new Vector3(0, 0, 1),
            lookAt: vi.fn(),
            updateProjectionMatrix: vi.fn(),
        };
        const controls = {
            target: new Vector3(4, 5, 6),
            enabled: true,
            noRotate: false,
            noPan: false,
            noZoom: false,
            update: vi.fn(),
        };
        const scene = {
            initialized3D: true,
            camera,
            cameraController: {
                controls,
                _setFreeFlyEnabled: vi.fn(),
            },
            defaultLookTarget: { x: 0, y: 0, z: 0 },
        };
        const render = vi.fn();

        const actions = createCameraActions({
            animationScenes: { geo: scene },
            getConfig: () => "geo",
            readCameraPositionMode: () => "manual",
            readCameraLookMode: () => "manual",
            applyCameraFromTo: vi.fn(),
            readPlaneSelection: () => "XY",
            setPlaneSelection: vi.fn(),
            handlePlaneChange: vi.fn(() => {
                camera.up.set(0, 1, 0);
            }),
            render,
            getViewSky: () => false,
            getViewConstellationLines: () => false,
        });

        actions.togglePlane();

        expect(camera.up.toArray()).toEqual([0, 1, 0]);
        expect(controls.target.toArray()).toEqual([0, 0, 0]);
        expect(camera.lookAt).toHaveBeenCalledWith(controls.target);
        expect(render).toHaveBeenCalled();
    });

    it("ignores desktop FoV input outside semantic source-to-target views", () => {
        globalThis.document = createDocumentStub();

        let positionMode = "manual";
        let lookMode = "manual";

        const camera = {
            position: new Vector3(0, 0, 0),
            fov: 50,
            up: new Vector3(0, 0, 1),
            lookAt: vi.fn(),
            updateProjectionMatrix: vi.fn(),
        };

        const controller = {
            camera,
            controls: {
                target: new Vector3(),
                update: vi.fn(),
                addEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            },
            _freeFlyActive: false,
            setFov: vi.fn((fov) => {
                camera.fov = fov;
            }),
        };

        const scene = {
            initialized3D: true,
            camera,
            cameraController: controller,
        };

        const actions = createCameraActions({
            animationScenes: { geo: scene },
            getConfig: () => "geo",
            readCameraPositionMode: () => positionMode,
            readCameraLookMode: () => lookMode,
            applyCameraFromTo: vi.fn(),
            readPlaneSelection: () => "default",
            setPlaneSelection: vi.fn(),
            handlePlaneChange: vi.fn(),
            render: vi.fn(),
            getViewSky: () => false,
            getViewConstellationLines: () => false,
        });

        actions.changeDesktopMainFov({ target: { value: "27" } });

        expect(controller.setFov).not.toHaveBeenCalled();
        expect(camera.fov).toBe(50);
    });

    it("allows semantic view FoV values below one degree", () => {
        globalThis.document = createDocumentStub();

        let positionMode = "spacecraft";
        let lookMode = "earth";

        const camera = {
            position: new Vector3(0, 0, 0),
            fov: 50,
            up: new Vector3(0, 0, 1),
            lookAt: vi.fn(),
            updateProjectionMatrix: vi.fn(),
        };

        const controller = {
            camera,
            controls: {
                target: new Vector3(),
                update: vi.fn(),
                addEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            },
            _freeFlyActive: false,
            setFov: vi.fn((fov) => {
                camera.fov = fov;
            }),
        };

        const scene = {
            initialized3D: true,
            camera,
            cameraController: controller,
        };

        const actions = createCameraActions({
            animationScenes: { geo: scene },
            getConfig: () => "geo",
            readCameraPositionMode: () => positionMode,
            readCameraLookMode: () => lookMode,
            applyCameraFromTo: vi.fn(),
            readPlaneSelection: () => "default",
            setPlaneSelection: vi.fn(),
            handlePlaneChange: vi.fn(),
            render: vi.fn(),
            getViewSky: () => false,
            getViewConstellationLines: () => false,
        });

        actions.changeDesktopMainFov({ target: { value: "0.4" } });

        expect(controller.setFov).toHaveBeenCalledWith(0.4);
        expect(camera.fov).toBe(0.4);
    });

    it("starts semantic desktop views with Auto FoV enabled", () => {
        globalThis.document = createFovControlDocumentStub();

        let positionMode = "spacecraft";
        let lookMode = "moon";

        const camera = {
            position: new Vector3(0, 0, 0),
            fov: 50,
            aspect: 1,
            up: new Vector3(0, 0, 1),
            lookAt: vi.fn(),
            updateProjectionMatrix: vi.fn(),
        };

        const controller = {
            camera,
            controls: {
                target: new Vector3(),
                update: vi.fn(),
                addEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            },
            _freeFlyActive: false,
            _mountWorld: new Vector3(),
            _lookWorld: new Vector3(),
            mountOffset: new Vector3(),
            updateFromTo: vi.fn(),
            setFromToModes(nextPositionMode, nextLookMode) {
                this.positionMode = nextPositionMode;
                this.lookMode = nextLookMode;
            },
            _resolveTargetWorld(mode, out = new Vector3()) {
                if (mode === "moon") return out.set(100, 0, 0);
                if (mode === "spacecraft") return out.set(0, 0, 0);
                return null;
            },
            setMountOffset(offset) {
                this.mountOffset.set(offset.x ?? 0, offset.y ?? 0, offset.z ?? 0);
            },
            setMountTargetOffset: vi.fn(),
            setFov: vi.fn((fov) => {
                camera.fov = fov;
            }),
        };

        const scene = {
            initialized3D: true,
            camera,
            cameraController: controller,
            moonContainer: createVectorTarget(100, 0, 0),
            craft: createVectorTarget(0, 0, 0),
            moon: {
                geometry: {
                    boundingSphere: { radius: 10 },
                },
            },
        };

        const actions = createCameraActions({
            animationScenes: { geo: scene },
            getConfig: () => "geo",
            readCameraPositionMode: () => positionMode,
            readCameraLookMode: () => lookMode,
            applyCameraFromTo: (next) => {
                if (typeof next?.positionMode === "string") {
                    positionMode = next.positionMode;
                }
                if (typeof next?.lookMode === "string") {
                    lookMode = next.lookMode;
                }
            },
            readPlaneSelection: () => "default",
            setPlaneSelection: vi.fn(),
            handlePlaneChange: vi.fn(),
            render: vi.fn(),
            getViewSky: () => false,
            getViewConstellationLines: () => false,
        });

        actions.changeCameraFromTo();

        expect(controller.setFov).toHaveBeenCalledWith(expect.closeTo(11.8239, 4));
        expect(camera.fov).toBeCloseTo(11.8239, 4);
    });

    it("maps the desktop zoom slider back to the requested FoV", () => {
        globalThis.document = createDocumentStub();

        let positionMode = "spacecraft";
        let lookMode = "moon";

        const camera = {
            position: new Vector3(0, 0, 0),
            fov: 50,
            up: new Vector3(0, 0, 1),
            lookAt: vi.fn(),
            updateProjectionMatrix: vi.fn(),
        };

        const controller = {
            camera,
            controls: {
                target: new Vector3(),
                update: vi.fn(),
                addEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            },
            _freeFlyActive: false,
            setFov: vi.fn((fov) => {
                camera.fov = fov;
            }),
        };

        const scene = {
            initialized3D: true,
            camera,
            cameraController: controller,
        };

        const actions = createCameraActions({
            animationScenes: { geo: scene },
            getConfig: () => "geo",
            readCameraPositionMode: () => positionMode,
            readCameraLookMode: () => lookMode,
            applyCameraFromTo: vi.fn(),
            readPlaneSelection: () => "default",
            setPlaneSelection: vi.fn(),
            handlePlaneChange: vi.fn(),
            render: vi.fn(),
            getViewSky: () => false,
            getViewConstellationLines: () => false,
        });

        actions.changeDesktopMainFov({
            target: {
                id: "desktop-main-fov-slider",
                value: String(Math.round(fovDegreesToZoomSliderValue(12.5, {
                    minDegrees: 0.1,
                    maxDegrees: 179,
                    fallbackDegrees: 50,
                }))),
            },
        });

        expect(controller.setFov).toHaveBeenCalledWith(expect.closeTo(12.5, 0.15));
        expect(camera.fov).toBeCloseTo(12.5, 1);
    });
});
