import { describe, expect, it, vi } from "vitest";
vi.mock("../src/platform/js/ui/ui-state.js", () => ({
    applyCameraFromTo: vi.fn(), applyDimensionSelection: vi.fn(), applyOriginMode: vi.fn(),
    applyPlaneSelection: vi.fn(), applyViewSettings: vi.fn(), readViewSettings: vi.fn(),
}));
import { applyCameraFromTo } from "../src/platform/js/ui/ui-state.js";
import { createSharedControlBackend } from "../src/platform/js/ui/shared-control-backend.js";

describe("shared camera input boundary", () => {
    it("sends intent before any projection rather than publishing partial DOM state", () => {
        const changeCameraFromTo = vi.fn();
        const getCameraState = () => ({ positionMode: "manual", lookMode: "moon" });
        const backend = createSharedControlBackend({ changeCameraFromTo, getCameraState });
        backend.commitCameraPositionMode("earth");
        backend.commitCameraLookMode("spacecraft");
        expect(changeCameraFromTo.mock.calls.map(([event]) => [event.target.id, event.target.value])).toEqual([
            ["camera-position", "earth"], ["camera-look", "spacecraft"],
        ]);
        expect(applyCameraFromTo).not.toHaveBeenCalled();
        expect(backend.getCameraState).toBe(getCameraState);
    });
});
