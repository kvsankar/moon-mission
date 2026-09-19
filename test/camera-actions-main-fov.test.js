import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Mesh, MeshBasicMaterial, PerspectiveCamera, SphereGeometry, Vector3 } from "three";

import { FakeEvent, installFakeDom } from "./helpers/fake-dom.js";
import { createCameraActions } from "../src/platform/js/app/camera-actions.js";

const PAGE_ELEMENTS = [
    { id: "desktop-main-fov", tag: "div" },
    { id: "header", tag: "header" },
    { id: "timeline-dock", tag: "div" },
];

let dom = null;
let actions = null;
let render = null;

function node(id) {
    return dom.document.getElementById(id);
}

function bodyAt(x, y, z, radius) {
    return {
        radius,
        getWorldPosition(out = new Vector3()) {
            return out.set(x, y, z);
        },
    };
}

/** The auto fit measures the target from its mesh bounding sphere. */
function bodyMesh(radius) {
    return new Mesh(new SphereGeometry(radius, 8, 6), new MeshBasicMaterial());
}

/** A scene with the two bodies the from-to camera can mount and aim at. */
function makeScene({ fov = 50, withController = true, moonDistance = 384400 } = {}) {
    const camera = new PerspectiveCamera(fov, 16 / 9, 0.1, 1000);
    const scene = {
        camera,
        earthContainer: bodyAt(0, 0, 0, 6371),
        moonContainer: bodyAt(moonDistance, 0, 0, 1737),
        earth: bodyMesh(6371),
        moon: bodyMesh(1737),
    };
    if (withController) {
        scene.cameraController = {
            camera,
            controls: { update: vi.fn(), dispatchEvent: vi.fn() },
            setFov: vi.fn((next) => { camera.fov = next; }),
            setMountedWheelFovEnabled: vi.fn(),
            setMountedDollyEnabled: vi.fn(),
        };
    }
    return scene;
}

function makeActions({ scene = makeScene(), positionMode = "manual", lookMode = "manual" } = {}) {
    render = vi.fn();
    const modes = { positionMode, lookMode };
    const cameraState = {
        get: () => ({ ...modes, revision: 1 }),
        set: (next) => Object.assign(modes, next),
    };
    actions = createCameraActions({
        animationScenes: { geo: scene },
        getConfig: () => "geo",
        cameraState,
        applyCameraFromTo: vi.fn(),
        readPlaneSelection: () => "XY",
        setPlaneSelection: vi.fn(),
        handlePlaneChange: vi.fn(),
        render,
        getViewSky: () => true,
        getViewConstellationLines: () => false,
    });
    return { actions, scene, modes };
}

function fovControl() {
    return {
        container: node("desktop-main-fov"),
        autoButton: node("desktop-main-fov-auto"),
        slider: node("desktop-main-fov-slider"),
        value: node("desktop-main-fov-value"),
    };
}

function inputEvent(target, value) {
    const event = new FakeEvent("input", { bubbles: true });
    target.value = String(value);
    event.target = target;
    return event;
}

beforeEach(() => {
    dom = installFakeDom(PAGE_ELEMENTS, { innerWidth: 1600, innerHeight: 900 });
    node("header").setBoundingClientRect({ left: 0, top: 0, width: 1600, height: 60 });
    node("timeline-dock").setBoundingClientRect({ left: 0, top: 800, width: 1600, height: 100 });
});

afterEach(() => {
    actions?.disposeCameraActions?.();
    actions = null;
    render = null;
    dom?.restore();
    dom = null;
    vi.restoreAllMocks();
});

describe("mounting the main field of view control", () => {
    it("builds the slider, auto button and readout", () => {
        makeActions();

        const control = fovControl();
        expect(control.autoButton).toBeTruthy();
        expect(control.slider).toBeTruthy();
        expect(control.value).toBeTruthy();
    });

    it("starts in automatic mode with the manual inputs disabled", () => {
        makeActions();

        expect(fovControl().slider.disabled).toBe(true);
        // The readout is a text node, so it announces its state with aria.
        expect(fovControl().value.getAttribute("aria-disabled")).toBe("true");
    });
});

describe("which views offer a main field of view", () => {
    it.each([
        ["spacecraft", "moon", true],
        ["spacecraft", "earth", true],
        ["earth", "moon", true],
        ["moon", "earth", true],
        ["manual", "moon", false],
        ["spacecraft", "manual", false],
        ["moon", "moon", false],
        ["spacecraft", "spacecraft", false],
    ])("from %s to %s offers the control: %s", (positionMode, lookMode, offered) => {
        const { actions: cameraActions } = makeActions({ positionMode, lookMode });

        cameraActions.toggleDesktopMainFovAuto();

        expect(fovControl().container.hidden).toBe(!offered);
    });
});

describe("the automatic field of view", () => {
    it("frames the target body when automatic mode is on", () => {
        const { scene } = makeActions({ positionMode: "earth", lookMode: "moon" });

        actions.toggleDesktopMainFovAuto();
        actions.toggleDesktopMainFovAuto();

        expect(scene.cameraController.setFov).toHaveBeenCalled();
        const applied = scene.cameraController.setFov.mock.calls.at(-1)[0];
        expect(applied).toBeGreaterThan(0.1);
        expect(applied).toBeLessThan(179);
    });

    it("turns automatic mode off and leaves the lens where it is", () => {
        const { scene } = makeActions({ positionMode: "earth", lookMode: "moon" });
        actions.toggleDesktopMainFovAuto();
        const fovAfterManual = scene.camera.fov;

        expect(fovControl().slider.disabled).toBe(false);
        expect(scene.camera.fov).toBe(fovAfterManual);
        expect(render).toHaveBeenCalled();
    });

    it("refuses automatic mode in a view that does not support it", () => {
        makeActions({ positionMode: "manual", lookMode: "manual" });

        actions.toggleDesktopMainFovAuto();

        expect(fovControl().autoButton.disabled).toBe(true);
        expect(render).not.toHaveBeenCalled();
    });

    it("gives a nearer target a wider lens than a distant one", () => {
        // The auto fit solves for the target disc, so a closer body needs more
        // field of view to stay inside the frame.
        const near = makeScene({ moonDistance: 20000 });
        const { actions: nearActions, scene: nearScene } = makeActions({
            scene: near,
            positionMode: "earth",
            lookMode: "moon",
        });
        nearActions.toggleDesktopMainFovAuto();
        nearActions.toggleDesktopMainFovAuto();
        const nearFov = nearScene.camera.fov;
        nearActions.disposeCameraActions();
        dom.restore();

        dom = installFakeDom(PAGE_ELEMENTS, { innerWidth: 1600, innerHeight: 900 });
        const { actions: farActions, scene: farScene } = makeActions({
            positionMode: "earth",
            lookMode: "moon",
        });
        farActions.toggleDesktopMainFovAuto();
        farActions.toggleDesktopMainFovAuto();

        expect(nearFov).toBeGreaterThan(farScene.camera.fov);
    });

    it("leaves the lens alone with no camera controller to drive", () => {
        const scene = makeScene({ withController: false });
        makeActions({ scene, positionMode: "earth", lookMode: "moon" });

        expect(() => actions.toggleDesktopMainFovAuto()).not.toThrow();
    });
});

describe("the manual field of view", () => {
    it("adopts a typed value and redraws", () => {
        const { scene } = makeActions({ positionMode: "spacecraft", lookMode: "moon" });
        actions.toggleDesktopMainFovAuto();
        render.mockClear();

        actions.changeDesktopMainFov(inputEvent(fovControl().value, 12));

        expect(scene.camera.fov).toBeCloseTo(12, 6);
        expect(render).toHaveBeenCalled();
    });

    it("clamps a value beyond the published lens range", () => {
        const { scene } = makeActions({ positionMode: "spacecraft", lookMode: "moon" });
        actions.toggleDesktopMainFovAuto();

        actions.changeDesktopMainFov(inputEvent(fovControl().value, 500));
        expect(scene.camera.fov).toBeCloseTo(179, 6);

        actions.changeDesktopMainFov(inputEvent(fovControl().value, -20));
        expect(scene.camera.fov).toBeCloseTo(0.1, 6);
    });

    it("keeps the current lens for a value that is not a number", () => {
        const { scene } = makeActions({ positionMode: "spacecraft", lookMode: "moon" });
        actions.toggleDesktopMainFovAuto();
        actions.changeDesktopMainFov(inputEvent(fovControl().value, 20));

        actions.changeDesktopMainFov(inputEvent(fovControl().value, "wide"));

        expect(scene.camera.fov).toBeCloseTo(20, 6);
    });

    it("leaves automatic mode as soon as the user drives the lens", () => {
        makeActions({ positionMode: "spacecraft", lookMode: "moon" });
        actions.toggleDesktopMainFovAuto();
        actions.toggleDesktopMainFovAuto();
        expect(fovControl().slider.disabled).toBe(true);

        actions.changeDesktopMainFov(inputEvent(fovControl().value, 30));

        expect(fovControl().slider.disabled).toBe(false);
    });

    it("reads the slider on its own logarithmic scale", () => {
        const { scene } = makeActions({ positionMode: "spacecraft", lookMode: "moon" });
        actions.toggleDesktopMainFovAuto();
        const slider = fovControl().slider;

        actions.changeDesktopMainFov(inputEvent(slider, slider.min));
        const atMin = scene.camera.fov;
        actions.changeDesktopMainFov(inputEvent(slider, slider.max));

        expect(atMin).not.toBeCloseTo(scene.camera.fov, 3);
        expect(scene.camera.fov).toBeGreaterThan(0.1);
        expect(scene.camera.fov).toBeLessThanOrEqual(179);
    });

    it("only resyncs the control in a view with no main lens", () => {
        const { scene } = makeActions({ positionMode: "manual", lookMode: "manual" });

        actions.changeDesktopMainFov(inputEvent(fovControl().value, 30));

        expect(scene.cameraController.setFov).not.toHaveBeenCalled();
        expect(fovControl().container.hidden).toBe(true);
    });

    it("updates the readout with no scene to drive", () => {
        render = vi.fn();
        actions = createCameraActions({
            animationScenes: {},
            getConfig: () => "geo",
            cameraState: { get: () => ({ positionMode: "spacecraft", lookMode: "moon", revision: 1 }), set: () => {} },
            applyCameraFromTo: vi.fn(),
            readPlaneSelection: () => "XY",
            setPlaneSelection: vi.fn(),
            handlePlaneChange: vi.fn(),
            render,
            getViewSky: () => true,
            getViewConstellationLines: () => false,
        });

        expect(() => actions.changeDesktopMainFov(inputEvent(fovControl().value, 33))).not.toThrow();
        expect(render).not.toHaveBeenCalled();
    });

    it("stops responding after disposal", () => {
        const { scene } = makeActions({ positionMode: "spacecraft", lookMode: "moon" });
        actions.toggleDesktopMainFovAuto();
        actions.disposeCameraActions();
        const before = scene.camera.fov;

        actions.changeDesktopMainFov(inputEvent(fovControl().value, 5));
        actions.toggleDesktopMainFovAuto();

        expect(scene.camera.fov).toBe(before);
    });
});

describe("the mounted wheel policy", () => {
    it("remaps the wheel to lens zoom in a from-to view", () => {
        const { scene } = makeActions({ positionMode: "spacecraft", lookMode: "moon" });

        actions.toggleDesktopMainFovAuto();

        expect(scene.cameraController.setMountedWheelFovEnabled).toHaveBeenCalledWith(true);
        expect(scene.cameraController.setMountedDollyEnabled).toHaveBeenCalledWith(false);
    });

    it("leaves the wheel as a dolly outside a from-to view", () => {
        const { scene } = makeActions({ positionMode: "manual", lookMode: "manual" });

        actions.toggleDesktopMainFovAuto();

        expect(scene.cameraController.setMountedWheelFovEnabled).toHaveBeenCalledWith(false);
        expect(scene.cameraController.setMountedDollyEnabled).toHaveBeenCalledWith(true);
    });
});
