import { describe, expect, it, vi } from "vitest";
import { createMissionViewIdentityController } from "../src/platform/js/app/mission-view-identity-controller.js";

describe("mission view identity controller", () => {
    it("publishes the changed identity before applying view and camera intent", () => {
        const calls = [];
        const applyViewSettings = vi.fn(() => calls.push("flags"));
        const setView = vi.fn(() => calls.push("view"));
        const changeCameraFromTo = vi.fn(() => calls.push("camera"));
        const documentRef = { dispatchEvent: vi.fn(() => calls.push("event")) };
        class FakeEvent {
            constructor(type, options) { this.type = type; this.detail = options.detail; }
        }
        const runtimeViewState = {
            getConfig: () => "geo",
            getCurrentDimension: () => "3D",
            getCurrentViewIdentity: () => ({ originMode: "geo" }),
            getCurrentViewIdentityKey: () => "geo|3D",
            setCurrentViewIdentity: vi.fn(() => ({ changed: true, viewFlags: { viewOrbit: true } })),
        };
        const controller = createMissionViewIdentityController({
            documentRef,
            CustomEventClass: FakeEvent,
            runtimeViewState,
            cameraState: { get: () => ({ positionMode: "spacecraft", lookMode: "moon" }) },
            sceneViewStateActions: { getPlaneSelectionState: () => "XY" },
            readPlaneSelection: () => "YZ",
            readDimensionSelection: () => "2D",
            readViewSettings: () => ({ viewOrbit: false }),
            applyViewSettings,
            getSetView: () => setView,
            getRuntimeWireup: () => ({ runtimeBootstrapActions: { changeCameraFromTo } }),
        });

        expect(controller.applyViewForCurrentIdentity()).toBe(true);
        expect(runtimeViewState.setCurrentViewIdentity).toHaveBeenCalledWith({
            originMode: "geo", cameraPositionMode: "spacecraft", cameraLookMode: "moon",
            planeSelection: "XY", dimension: "3D",
        }, { previousViewFlags: { viewOrbit: false } });
        expect(documentRef.dispatchEvent.mock.calls[0][0].detail.viewIdentityKey).toBe("geo|3D");
        expect(changeCameraFromTo).toHaveBeenCalledWith(undefined, {
            projectControls: false, syncViewIdentity: false,
        });
        expect(calls).toEqual(["flags", "event", "view", "camera"]);
    });
});
