import { describe, expect, it, vi } from "vitest";
import { createOrbitVectorsActions } from "../src/platform/js/app/orbit-vectors-actions.js";

function deferred() {
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    return { promise, resolve };
}

function createHarness({ pauseAt = 1 } = {}) {
    const writes = [];
    function selection(name) {
        const chain = {};
        for (const method of ["append", "attr", "style", "text", "select"]) {
            chain[method] = (...args) => {
                writes.push({ name, method, args });
                return chain;
            };
        }
        return chain;
    }
    const scene = {
        planetsForLocations: ["SC"],
        stepDurationInMilliSeconds: 1000,
        primaryBody: "EARTH",
        primaryBodyRadius: 1,
        orbitSvgPointsByBodyId: { previous: true },
    };
    const scenes = { geo: scene };
    const state = { config: "geo", dimension: "2D", svg: selection("original"), current: true };
    const paused = deferred();
    const resume = deferred();
    let sleepCount = 0;
    const setEpochDisplay = vi.fn();
    const actions = createOrbitVectorsActions({
        d3: { select: () => selection("global") },
        sleep: async () => {
            if (++sleepCount === pauseAt) {
                paused.resolve();
                await resume.promise;
            }
        },
        getSvgContainer: () => state.svg,
        getCurrentDimension: () => state.dimension,
        getConfig: () => state.config,
        animationScenes: scenes,
        planetProperties: {
            EARTH: { color: "blue", name: "Earth" },
            SC: { color: "white", name: "Craft", r: 1 },
        },
        shouldDrawOrbit: () => false,
        getStartTime: () => 0,
        getZoomFactor: () => 1,
        getGlobalConfig: () => null,
        planetStartTime: () => 0,
        PC: { KM_PER_AU: 1 },
        UC: { CENTER_LABEL_OFFSET_X: 0, CENTER_LABEL_OFFSET_Y: 0 },
        getEpochJD: () => 2451545,
        getEpochDate: () => "epoch",
        setEpochDisplay,
    });
    return {
        actions, scene, scenes, state, writes, paused, resume, selection, setEpochDisplay,
        context: { config: "geo", isCurrent: () => state.current },
    };
}

describe("2D orbit publication ownership", () => {
    it("does not clear scene state or write SVG for an already superseded request", async () => {
        const harness = createHarness();
        harness.state.current = false;
        harness.resume.resolve();
        await harness.actions.processOrbitVectorsData(harness.context);
        expect(harness.scene.orbitSvgPointsByBodyId).toEqual({ previous: true });
        expect(harness.writes).toEqual([]);
        expect(harness.setEpochDisplay).not.toHaveBeenCalled();
    });

    const invalidations = {
        "origin changed": (h) => { h.state.config = "lunar"; },
        "scene replaced": (h) => { h.scenes.geo = { ...h.scene }; },
        "SVG replaced in the same origin": (h) => { h.state.svg = h.selection("replacement"); },
        "dimension changed": (h) => { h.state.dimension = "3D"; },
        "transition superseded": (h) => { h.state.current = false; },
    };
    for (const [name, invalidate] of Object.entries(invalidations)) {
        it.each([1, 2, 3, 4, 5, 6, 7, 8])(`stops all publication when ${name} at yield %i`, async (pauseAt) => {
            const harness = createHarness({ pauseAt });
            const pending = harness.actions.processOrbitVectorsData(harness.context);
            await harness.paused.promise;
            const writesBeforeSupersession = harness.writes.slice();
            invalidate(harness);
            harness.resume.resolve();
            await pending;
            expect(harness.writes).toEqual(writesBeforeSupersession);
            expect(harness.setEpochDisplay).not.toHaveBeenCalled();
        });
    }

    it("keeps no-argument calls compatible when their identity remains current", async () => {
        const harness = createHarness();
        harness.resume.resolve();
        await harness.actions.processOrbitVectorsData();
        expect(harness.writes.some(({ args }) => args.includes("Greenwich"))).toBe(true);
        expect(harness.setEpochDisplay).toHaveBeenCalledWith({ epochJD: 2451545, epochDate: "epoch" });
    });
});
