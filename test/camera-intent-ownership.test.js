import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Vector3 } from "three";
import { createCameraActions } from "../src/platform/js/app/camera-actions.js";
import { createRuntimeCameraState } from "../src/platform/js/core/state/runtime-camera-state.js";
import { createDimensionActions } from "../src/platform/js/app/dimension-actions.js";

function harness(initial = { positionMode: "manual", lookMode: "manual" }) {
    const state = { config: "geo", transition: 0 };
    const cameraState = createRuntimeCameraState(initial);
    const scene = {
        initialized3D: false,
        setCameraParameters: vi.fn(),
        camera: { position: new Vector3(), up: new Vector3(), lookAt: vi.fn(), fov: 50 },
        cameraController: {
            controls: { target: new Vector3(), update: vi.fn(), addEventListener: vi.fn() },
            setFromToModes: vi.fn(), updateFromTo: vi.fn(),
            _mountWorld: new Vector3(), _lookWorld: new Vector3(), mountOffset: new Vector3(),
            _resolveTargetWorld: () => new Vector3(),
            setMountOffset: vi.fn(), setMountTargetOffset: vi.fn(),
        },
    };
    const scenes = { geo: scene };
    const readPosition = vi.fn(() => "manual");
    const readLook = vi.fn(() => "manual");
    const project = vi.fn();
    const actions = createCameraActions({
        cameraState,
        animationScenes: scenes,
        getConfig: () => state.config,
        getTransitionRevision: () => state.transition,
        readCameraPositionMode: readPosition,
        readCameraLookMode: readLook,
        applyCameraFromTo: project,
        applyViewForCurrentIdentity: () => state.onApplyView?.() || false,
        getViewSky: () => false,
        getViewConstellationLines: () => false,
        render: vi.fn(),
    });
    return { state, cameraState, scene, scenes, actions, readPosition, readLook, project };
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("document", { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("authoritative camera intent", () => {
    it("replays committed camera state without consulting controls", () => {
        const h = harness({ positionMode: "manual", lookMode: "moon" });
        h.scene.initialized3D = true;
        h.actions.changeCameraFromTo();
        expect(h.scene.cameraController.setFromToModes).toHaveBeenCalledWith("manual", "moon");
        expect(h.readPosition).not.toHaveBeenCalled();
        expect(h.readLook).not.toHaveBeenCalled();
    });

    it("does not let an old retry reset a newer pose-preserving release", () => {
        const h = harness();
        h.actions.changeCameraFromTo();
        h.scene.initialized3D = true;
        h.actions.changeCameraFromTo({ detail: { preserveManualRelease: true } });
        vi.advanceTimersByTime(600);
        expect(h.scene.setCameraParameters).not.toHaveBeenCalled();
    });

    it("retains release semantics while waiting for the scene", () => {
        const h = harness();
        h.actions.changeCameraFromTo({ detail: { preserveManualRelease: true } });
        h.scene.initialized3D = true;
        vi.advanceTimersByTime(200);
        expect(h.scene.setCameraParameters).not.toHaveBeenCalled();
        expect(h.scene.cameraController.setFromToModes).toHaveBeenCalledOnce();
    });

    it("makes repeated readiness projection idempotent after a release", () => {
        const h = harness();
        h.scene.initialized3D = true;
        h.actions.changeCameraFromTo({ detail: { preserveManualRelease: true } });
        h.actions.changeCameraFromTo();
        expect(h.scene.setCameraParameters).not.toHaveBeenCalled();
    });

    it("stops obsolete origin and ABA retries", () => {
        const h = harness();
        h.actions.changeCameraFromTo();
        h.state.transition += 2;
        h.scene.initialized3D = true;
        vi.advanceTimersByTime(200);
        expect(h.scene.cameraController.setFromToModes).not.toHaveBeenCalled();
    });

    it("does not apply pending work to a replacement scene", () => {
        const h = harness();
        h.actions.changeCameraFromTo();
        h.scenes.geo = { ...h.scene, initialized3D: true };
        vi.advanceTimersByTime(200);
        expect(h.scene.cameraController.setFromToModes).not.toHaveBeenCalled();
    });

    it("rejects an old generation and reapplies retained intent on fresh readiness", () => {
        const h = harness();
        h.actions.changeCameraFromTo({ detail: { preserveManualRelease: true } });
        h.scene.deferred3DInitRunId = 1;
        h.scene.initialized3D = true;
        vi.advanceTimersByTime(200);
        expect(h.scene.cameraController.setFromToModes).not.toHaveBeenCalled();
        h.actions.changeCameraFromTo();
        expect(h.scene.cameraController.setFromToModes).toHaveBeenCalledOnce();
        expect(h.scene.setCameraParameters).not.toHaveBeenCalled();
    });

    it("view-identity readiness does not recursively project or reapply the same pose", () => {
        const h = harness();
        h.scene.initialized3D = true;
        h.state.onApplyView = () => {
            h.actions.changeCameraFromTo(undefined, { projectControls: false, syncViewIdentity: false });
            return true;
        };
        h.actions.changeCameraFromTo({ target: { name: "camera-pair", value: "manual__manual" } });
        expect(h.project).toHaveBeenCalledOnce();
        expect(h.scene.cameraController.setFromToModes).toHaveBeenCalledOnce();
        expect(h.scene.setCameraParameters).toHaveBeenCalledOnce();
    });

    it("can retire camera work when the runtime is disposed", () => {
        const h = harness();
        h.actions.changeCameraFromTo();
        expect(h.actions.disposeCameraActions).toBeTypeOf("function");
        h.actions.disposeCameraActions();
        h.scene.initialized3D = true;
        vi.advanceTimersByTime(200);
        expect(h.scene.cameraController.setFromToModes).not.toHaveBeenCalled();
    });

    it("makes every captured public camera effect inert after disposal", () => {
        const h = harness({ positionMode: "earth", lookMode: "moon" });
        const get = vi.spyOn(h.cameraState, "get");
        h.actions.disposeCameraActions();
        h.actions.changeCameraFromTo();
        h.actions.changeDesktopMainFov({ target: { value: "10" } });
        h.actions.toggleDesktopMainFovAuto();
        h.actions.togglePlane();
        h.actions.recenterMountedCamera();
        expect(get).not.toHaveBeenCalled();
        expect(h.project).not.toHaveBeenCalled();
        expect(h.scene.cameraController.setFromToModes).not.toHaveBeenCalled();
    });

    it("does not reset the camera for an unknown pair event", () => {
        const h = harness();
        h.scene.initialized3D = true;
        h.actions.changeCameraFromTo({ target: { name: "camera-pair", value: "not-a-pair" } });
        expect(h.scene.cameraController.setFromToModes).not.toHaveBeenCalled();
        expect(h.scene.setCameraParameters).not.toHaveBeenCalled();
    });

    it("bounds readiness polling and can apply the retained intent later", () => {
        const h = harness();
        h.actions.changeCameraFromTo({ detail: { preserveManualRelease: true } });
        vi.advanceTimersByTime(10000);
        expect(vi.getTimerCount()).toBe(0);
        h.scene.initialized3D = true;
        h.actions.changeCameraFromTo();
        expect(h.scene.setCameraParameters).not.toHaveBeenCalled();
    });

    it("still honors an explicit same-pair Free reset", () => {
        const h = harness();
        h.scene.initialized3D = true;
        h.actions.changeCameraFromTo({ detail: { preserveManualRelease: true } });
        h.actions.changeCameraFromTo({ target: { name: "camera-pair", value: "manual__manual" } });
        expect(h.scene.setCameraParameters).toHaveBeenCalledOnce();
    });

    it("applies retained intent on actual cold 3D readiness after 2D exhausts polling", () => {
        const h = harness({ positionMode: "manual", lookMode: "moon" });
        h.actions.changeCameraFromTo();
        vi.advanceTimersByTime(10000);
        expect(vi.getTimerCount()).toBe(0);
        let dimension = "2D";
        document.querySelector = (selector) => selector.includes('name="dimension"') ? { value: "3D" } : null;
        h.scene.processOrbitVectorsData3D = vi.fn();
        h.scene.processLandingVectors = vi.fn();
        h.scene.init3d = (ready) => { h.scene.initialized3D = true; ready(); };
        const dimensions = createDimensionActions({
            d3: { select: () => ({ remove: vi.fn() }) }, getConfig: () => "geo", animationScenes: h.scenes,
            getCurrentDimension: () => dimension,
            setCurrentDimension: (next) => { dimension = next; h.state.transition += 1; },
            getPreviousDimension: () => "2D", setPreviousDimension: vi.fn(),
            setDimensionChanged: vi.fn(), getDimensionChanged: () => true,
            setSvgContainer: vi.fn(), handleDimensionSwitch: vi.fn(), handlePlaneChange: vi.fn(),
            setLocation: vi.fn(), getStartLandingFlag: () => false, updateProgressLabel: vi.fn(),
            applyViewForCurrentIdentity: () => h.actions.changeCameraFromTo(),
        });
        dimensions.setDimension();
        expect(h.scene.cameraController.setFromToModes).toHaveBeenCalledExactlyOnceWith("manual", "moon");
    });

    it("ignores events from an inactive scene's controls", () => {
        const h = harness();
        h.scene.initialized3D = true;
        h.actions.changeCameraFromTo();
        const listeners = h.scene.cameraController.controls.addEventListener.mock.calls;
        h.state.config = "lunar";
        h.scenes.lunar = { ...h.scene };
        const get = vi.spyOn(h.cameraState, "get");
        for (const [name, handler] of listeners) {
            if (name === "change" || name === "mounted-fov-input") handler();
        }
        expect(get).not.toHaveBeenCalled();
    });

    it("ignores a retired controller's events when the same scene is reinitialized", () => {
        const h = harness();
        h.scene.initialized3D = true;
        h.actions.changeCameraFromTo();
        const listeners = h.scene.cameraController.controls.addEventListener.mock.calls;
        h.scene.cameraController = { ...h.scene.cameraController };
        const get = vi.spyOn(h.cameraState, "get");
        for (const [name, handler] of listeners) {
            if (name === "change" || name === "mounted-fov-input") handler();
        }
        expect(get).not.toHaveBeenCalled();
    });

    it("re-centers a mounted camera after the same scene begins a new generation", () => {
        const h = harness({ positionMode: "earth", lookMode: "moon" });
        h.scene.initialized3D = true;
        h.actions.changeCameraFromTo();
        h.scene.cameraController.setMountOffset.mockClear();
        h.scene.deferred3DInitRunId = 1;
        h.actions.changeCameraFromTo();
        expect(h.scene.cameraController.setMountOffset).toHaveBeenCalledOnce();
    });

    it("retains queued release metadata when startup reapplies without an event", () => {
        const h = harness();
        h.actions.changeCameraFromTo({ detail: { preserveManualRelease: true } });
        h.scene.initialized3D = true;
        h.actions.changeCameraFromTo();
        expect(h.scene.setCameraParameters).not.toHaveBeenCalled();
    });

    it("re-centers a replacement scene even when origin and pair are unchanged", () => {
        const h = harness({ positionMode: "earth", lookMode: "moon" });
        h.scene.initialized3D = true;
        h.actions.changeCameraFromTo();
        h.scene.cameraController.setMountOffset.mockClear();
        h.scenes.geo = { ...h.scene };
        h.actions.changeCameraFromTo();
        expect(h.scene.cameraController.setMountOffset).toHaveBeenCalledOnce();
    });

    it("lets a re-entrant newer intent win over the projecting operation", () => {
        const h = harness();
        h.scene.initialized3D = true;
        h.project.mockImplementationOnce(() => {
            h.actions.changeCameraFromTo({ target: { name: "camera-pair", value: "manual__moon" } });
        });
        h.actions.changeCameraFromTo({ target: { name: "camera-pair", value: "manual__manual" } });
        expect(h.scene.cameraController.setFromToModes).toHaveBeenCalledExactlyOnceWith("manual", "moon");
    });
});
