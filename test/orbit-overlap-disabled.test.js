import { describe, expect, it, vi } from "vitest";
import { requestSceneOrbitOverlapRefinement } from "../src/platform/js/app/orbit-overlap-manager.js";

describe("disabled orbit overlap refinement", () => {
    it("constructs no Worker and schedules no refinement job", () => {
        const WorkerClass = vi.fn();
        vi.stubGlobal("Worker", WorkerClass);
        const timeout = vi.spyOn(globalThis, "setTimeout");
        const scene = { orbitLinesByBodyId: {}, orbitTrailLinesByBodyId: {} };
        requestSceneOrbitOverlapRefinement({ scene, dimension: "3D", orbitStyle: "trail", render: vi.fn() });
        expect(WorkerClass).not.toHaveBeenCalled();
        expect(timeout).not.toHaveBeenCalled();
        expect(scene.orbitOverlapDisabledApplied).toBe(true);
        vi.unstubAllGlobals(); timeout.mockRestore();
    });
});
