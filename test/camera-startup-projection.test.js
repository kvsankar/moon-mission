import { describe, expect, it, vi } from "vitest";
import { bindCameraStartupProjection } from "../src/platform/js/ui/camera-startup-projection.js";
import { createRuntimeCameraState } from "../src/platform/js/core/state/runtime-camera-state.js";

function harness() {
    const listeners = new Map(), frames = new Map(), timers = new Map();
    let id = 0;
    const state = createRuntimeCameraState();
    const project = vi.fn(() => state.get());
    const dispose = vi.fn();
    const retire = bindCameraStartupProjection({
        windowRef: { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name) => listeners.delete(name) },
        project, dispose,
        requestFrame: (fn) => { frames.set(++id, fn); return id; }, cancelFrame: (key) => frames.delete(key),
        schedule: (fn) => { timers.set(++id, fn); return id; }, cancel: (key) => timers.delete(key),
    });
    const flush = () => { for (const fn of [...frames.values(), ...timers.values()]) fn(); };
    return { listeners, frames, timers, state, project, dispose, retire, flush };
}

describe("camera startup projection", () => {
    it("delayed callbacks project the latest user choice without committing defaults", () => {
        const h = harness();
        const expected = h.state.commit({ positionMode: "spacecraft", lookMode: "moon" });
        h.flush();
        expect(h.project).toHaveBeenCalledTimes(3);
        expect(h.project.mock.results.every(({ value }) => value.revision === expected.revision && value.lookMode === "moon")).toBe(true);
        expect(h.state.get()).toEqual(expected);
    });
    it("preserves the owner across BFCache and reprojects on pageshow", () => {
        const h = harness();
        h.listeners.get("pagehide")({ persisted: true });
        expect(h.dispose).not.toHaveBeenCalled();
        h.listeners.get("pageshow")();
        h.flush();
        expect(h.project).toHaveBeenCalledTimes(6);
        expect(h.listeners.has("beforeunload")).toBe(false);
    });
    it("cancels queued projections and retires camera work only on terminal pagehide", () => {
        const h = harness();
        const queued = [...h.frames.values(), ...h.timers.values()];
        h.listeners.get("pagehide")({ persisted: false });
        queued.forEach(fn => fn());
        h.retire();
        expect(h.project).not.toHaveBeenCalled();
        expect(h.dispose).toHaveBeenCalledOnce();
        expect(h.frames.size + h.timers.size).toBe(0);
    });
});
