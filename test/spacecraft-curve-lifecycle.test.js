import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { createSpacecraftCurveActions } from "../src/platform/js/app/spacecraft-curve-actions.js";
import { createAnimationSceneClass } from "../src/platform/js/app/animation-scene-class.js";

function deferred() {
    let resolve, reject;
    const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
    return { promise, resolve, reject };
}
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

function harness({ count = 3, generated = true } = {}) {
    const waits = [], resources = [];
    const state = { materialCount: 0, failMaterialAt: 0, failAttribute: false };
    function track(resource) {
        resources.push({ resource, disposed: vi.fn() });
        resource.addEventListener("dispose", resources.at(-1).disposed);
        return resource;
    }
    class BufferGeometry extends THREE.BufferGeometry {
        constructor() { super(); track(this); }
        setAttribute(...args) {
            if (state.failAttribute) throw new Error("attribute failed");
            return super.setAttribute(...args);
        }
    }
    const config = {
        crafts: [{ id: "SC", primary: true }],
        ...(generated ? { postHorizonExtension: { sourceEndTime: "1970-01-01T00:00:00Z" },
            geo: { endTime: "1970-01-01T00:10:00Z" } } : {}),
    };
    const points = Array.from({ length: count }, (_, i) => new THREE.Vector3(i, i, i));
    const scene = {
        name: "geo", motherContainer: new THREE.Group(), initialized3D: true,
        deferred3DInitRunId: 1, stopCreationFlag: false, state: 2,
        curvesById: { SC: points }, curveTimesById: { SC: points.map((_, i) => i * 1000) },
        landingCurve: [],
        constructor: { SCENE_STATE_INIT_DONE: 2, SCENE_STATE_ADD_CURVE_DONE: 3 },
    };
    const render = vi.fn();
    const actions = createSpacecraftCurveActions({
        THREE: { ...THREE, BufferGeometry }, getGlobalConfig: () => config,
        planetProperties: { SC: { orbitcolor: "white" } },
        getViewOrbit: () => true, getViewOrbitDescent: () => true, render,
        wait10: () => { const wait = deferred(); waits.push(wait); return wait.promise; },
        createLineMaterial: (color, options) => {
            if (++state.materialCount === state.failMaterialAt) throw new Error("material failed");
            return track(new THREE.LineBasicMaterial({ color, ...options }));
        },
    });
    const drain = async () => {
        while (waits.length) { waits.shift().resolve(); await flush(); }
        await flush();
    };
    return { scene, config, actions, resources, state, waits, render, drain };
}

describe("3D curve build ownership", () => {
    it("revokes ready state before a cleanup listener cancels an entering replacement", async () => {
        const h = harness();
        const old = h.actions.addSpacecraftCurve(h.scene);
        await h.drain();
        expect((await old).status).toBe("ready");
        h.resources[0].resource.addEventListener("dispose", () => h.actions.cancelSpacecraftCurveBuild(h.scene));
        expect((await h.actions.addSpacecraftCurve(h.scene)).status).toBe("superseded");
        expect(h.scene.motherContainer.children).toHaveLength(0);
        expect(h.scene.state).not.toBe(3);
        expect(h.scene.orbitBuildState).toBe("superseded");
        h.resources.forEach(({ disposed }) => expect(disposed).toHaveBeenCalledOnce());
    });

    it("returns a ready outcome only after the current build completes", async () => {
        const h = harness();
        h.scene.state = 3;
        const pending = h.actions.addSpacecraftCurve(h.scene);
        expect(h.scene.state).toBe(2);
        await h.drain();
        expect(await pending).toEqual(expect.objectContaining({ status: "ready" }));
        expect(h.scene.state).toBe(3);
        expect(h.scene.generatedOrbitLinesByBodyId.SC).toBeInstanceOf(THREE.Line);
        expect(h.scene.orbitTrailLinesByBodyId.SC).toBeTruthy();
        h.actions.disposeSpacecraftCurve(h.scene);
    });

    for (const cause of ["stop", "dispose", "generation", "container"]) {
        it(`does not publish after ${cause} at a chunk boundary`, async () => {
            const h = harness();
            const originalContainer = h.scene.motherContainer;
            const pending = h.actions.addSpacecraftCurve(h.scene);
            const allocated = h.resources.length;
            const renders = h.render.mock.calls.length;
            if (cause === "stop") h.scene.stopCreationFlag = true;
            if (cause === "dispose") h.actions.disposeSpacecraftCurve(h.scene);
            if (cause === "generation") h.scene.deferred3DInitRunId += 1;
            if (cause === "container") h.scene.motherContainer = new THREE.Group();
            await h.drain();
            expect(h.scene.state).not.toBe(3);
            expect(h.scene.orbitBuildState).toBe(cause === "dispose" ? "disposed" : "superseded");
            expect(h.resources).toHaveLength(allocated);
            expect(h.render).toHaveBeenCalledTimes(renders);
            expect(originalContainer.children).toHaveLength(0);
            expect(await pending).toEqual(expect.objectContaining({ status: "superseded" }));
            h.resources.forEach(({ disposed }) => expect(disposed).toHaveBeenCalledOnce());
        });
    }

    it("isolates a same-scene replacement from an old completion and preserves prepared input", async () => {
        const h = harness({ count: 402 });
        const old = h.actions.addSpacecraftCurve(h.scene);
        const oldWait = h.waits.shift();
        const replacementPoints = [new THREE.Vector3(1000, 0, 0), new THREE.Vector3(1001, 0, 0)];
        h.scene.curvesById = { SC: replacementPoints };
        h.scene.curveTimesById = { SC: [0, 1000] };
        const fresh = h.actions.addSpacecraftCurve(h.scene);
        await h.drain();
        expect(await fresh).toEqual(expect.objectContaining({ status: "ready" }));
        const children = h.scene.motherContainer.children.slice();
        const maps = h.scene.orbitLinesByBodyId;
        const renderCount = h.render.mock.calls.length;
        oldWait.resolve();
        await flush();
        expect(await old).toEqual(expect.objectContaining({ status: "superseded" }));
        expect(h.scene.motherContainer.children).toEqual(children);
        expect(h.scene.orbitLinesByBodyId).toBe(maps);
        expect(h.scene.curvesById.SC).toBe(replacementPoints);
        expect(h.render).toHaveBeenCalledTimes(renderCount);
        h.actions.disposeSpacecraftCurve(h.scene);
        h.resources.forEach(({ disposed }) => expect(disposed).toHaveBeenCalledOnce());
    });

    it("finishes captured input arrays and times even if scene input maps are replaced", async () => {
        const h = harness();
        const pending = h.actions.addSpacecraftCurve(h.scene);
        h.scene.curvesById = { SC: [new THREE.Vector3(99, 99, 99), new THREE.Vector3(100, 100, 100)] };
        h.scene.curveTimesById = { SC: [0, 0] };
        await h.drain();
        expect(await pending).toEqual(expect.objectContaining({ status: "ready" }));
        expect([...h.scene.generatedOrbitLinesByBodyId.SC.geometry.getAttribute("position").array])
            .toEqual([0, 0, 0, 1, 1, 1, 2, 2, 2]);
        h.actions.disposeSpacecraftCurve(h.scene);
    });

    it("does not attach retired trail lines after a child-added listener starts a replacement", async () => {
        const h = harness({ generated: false });
        let fresh = null;
        h.scene.motherContainer.addEventListener("childadded", ({ child }) => {
            if (fresh || child.renderOrder !== 12) return;
            // Set a sentinel before synchronous replacement can emit another event.
            fresh = true;
            h.scene.curvesById = { SC: [new THREE.Vector3(90, 0, 0), new THREE.Vector3(91, 0, 0)] };
            fresh = h.actions.addSpacecraftCurve(h.scene);
        });
        const old = h.actions.addSpacecraftCurve(h.scene);
        await h.drain();
        expect(await old).toEqual(expect.objectContaining({ status: "superseded" }));
        expect(await fresh).toEqual(expect.objectContaining({ status: "ready" }));
        const currentLines = new Set([...h.scene.orbitLines, ...Object.values(h.scene.orbitTrailLinesByBodyId.SC)]);
        expect(h.scene.motherContainer.children.every(child => currentLines.has(child))).toBe(true);
        expect(h.scene.motherContainer.children).toHaveLength(currentLines.size);
        h.actions.disposeSpacecraftCurve(h.scene);
        h.resources.forEach(({ disposed }) => expect(disposed).toHaveBeenCalledOnce());
    });

    it.each(["replacement", "cancel"])("lets a cleanup listener's newer %s supersede the entering build", async (action) => {
        const h = harness({ generated: false });
        const first = h.actions.addSpacecraftCurve(h.scene);
        let nested;
        h.resources[0].resource.addEventListener("dispose", () => {
            if (action === "cancel") h.actions.cancelSpacecraftCurveBuild(h.scene);
            else {
                h.scene.curvesById = { SC: [new THREE.Vector3(90, 0, 0), new THREE.Vector3(91, 0, 0)] };
                nested = h.actions.addSpacecraftCurve(h.scene);
            }
        });
        const entering = h.actions.addSpacecraftCurve(h.scene);
        await h.drain();
        expect(await first).toEqual(expect.objectContaining({ status: "superseded" }));
        expect(await entering).toEqual(expect.objectContaining({ status: "superseded" }));
        if (action === "replacement") {
            expect(await nested).toEqual({ status: "ready" });
            const currentLines = new Set([...h.scene.orbitLines, ...Object.values(h.scene.orbitTrailLinesByBodyId.SC)]);
            expect(h.scene.motherContainer.children.every(child => currentLines.has(child))).toBe(true);
        } else expect(h.scene.motherContainer.children).toHaveLength(0);
        h.actions.disposeSpacecraftCurve(h.scene);
        h.resources.forEach(({ disposed }) => expect(disposed).toHaveBeenCalledOnce());
    });

    it("does not sweep a replacement started by a resource listener during explicit disposal", async () => {
        const h = harness({ generated: false });
        const first = h.actions.addSpacecraftCurve(h.scene);
        const inputCurves = h.scene.curvesById;
        let fresh;
        h.resources[0].resource.addEventListener("dispose", () => {
            fresh = h.actions.addSpacecraftCurve(h.scene);
        });
        h.actions.disposeSpacecraftCurve(h.scene);
        await h.drain();
        expect(await first).toEqual(expect.objectContaining({ status: "superseded" }));
        expect(await fresh).toEqual({ status: "ready" });
        expect(h.scene.orbitLines).toHaveLength(1);
        expect(h.scene.curvesById).toBe(inputCurves);
        expect(h.scene.orbitBuildState).toBe("ready");
        expect(h.scene.motherContainer.children).toHaveLength(5);
        h.actions.disposeSpacecraftCurve(h.scene);
        h.resources.forEach(({ disposed }) => expect(disposed).toHaveBeenCalledOnce());
    });

    it("preserves a newer landing owner created during landing resource disposal", async () => {
        const h = harness({ generated: false });
        h.scene.name = "lunar";
        h.config.landing = { enabled: true };
        h.scene.landingCurve = [new THREE.Vector3(), new THREE.Vector3(1, 1, 1)];
        const first = h.actions.addSpacecraftCurve(h.scene);
        const oldLanding = h.scene.landingOrbitLine;
        const inputCurves = h.scene.curvesById;
        let fresh;
        oldLanding.geometry.addEventListener("dispose", () => { fresh = h.actions.addSpacecraftCurve(h.scene); });
        h.actions.disposeSpacecraftCurve(h.scene);
        await h.drain();
        expect(await first).toEqual(expect.objectContaining({ status: "superseded" }));
        expect(await fresh).toEqual({ status: "ready" });
        expect(h.scene.landingOrbitLine).toBeInstanceOf(THREE.Line);
        expect(h.scene.landingOrbitLine).not.toBe(oldLanding);
        expect(h.scene.landingOrbitLine.parent).toBe(h.scene.motherContainer);
        expect(h.scene.curvesById).toBe(inputCurves);
        expect(h.scene.orbitLines).toHaveLength(1);
        h.actions.disposeSpacecraftCurve(h.scene);
        h.resources.forEach(({ disposed }) => expect(disposed).toHaveBeenCalledOnce());
    });

    it("does not re-dispose published resources or overwrite a re-entrant disposal outcome", async () => {
        const h = harness({ generated: false });
        const pending = h.actions.addSpacecraftCurve(h.scene);
        let reentered = false;
        h.resources[0].resource.addEventListener("dispose", () => {
            if (reentered) return;
            reentered = true;
            h.actions.disposeSpacecraftCurve(h.scene);
        });
        h.actions.disposeSpacecraftCurve(h.scene);
        await h.drain();
        expect(await pending).toEqual(expect.objectContaining({ status: "superseded" }));
        h.resources.forEach(({ disposed }) => expect(disposed).toHaveBeenCalledOnce());
        expect(h.scene.orbitBuildState).toBe("disposed");
    });

    it("releases a landing allocation if its synchronous construction fails during startup", async () => {
        const h = harness();
        h.scene.name = "lunar";
        h.config.landing = { enabled: true };
        h.scene.curvesById = {};
        h.scene.landingCurve = [new THREE.Vector3(), new THREE.Vector3(1, 1, 1)];
        h.state.failMaterialAt = 1;
        const result = await h.actions.addSpacecraftCurve(h.scene);
        expect(result).toEqual(expect.objectContaining({ status: "failed" }));
        h.resources.forEach(({ disposed }) => expect(disposed).toHaveBeenCalledOnce());
        expect(h.scene.motherContainer.children).toHaveLength(0);
    });

    it("settles cancellation and releases other resources even if a disposal listener throws", async () => {
        const h = harness();
        const pending = h.actions.addSpacecraftCurve(h.scene);
        const cleanupError = new Error("cleanup listener failed");
        h.resources[0].resource.addEventListener("dispose", () => { throw cleanupError; });
        expect(() => h.actions.cancelSpacecraftCurveBuild(h.scene)).not.toThrow();
        expect(await pending).toEqual(expect.objectContaining({ status: "superseded", cleanupErrors: [cleanupError] }));
        h.resources.forEach(({ disposed }) => expect(disposed).toHaveBeenCalledOnce());
        await h.drain();
        h.resources.forEach(({ disposed }) => expect(disposed).toHaveBeenCalledOnce());
    });

    for (const failure of ["wait", "material", "trail-material", "attribute"]) {
        it(`owns ${failure} failure, releases partial allocations, and allows retry`, async () => {
            const h = harness({ generated: false });
            // The promise contract prevents legacy fire-and-forget exceptions
            // from escaping before this fault-injection assertion can observe them.
            const probeScene = { ...h.scene, curvesById: {}, motherContainer: new THREE.Group() };
            const probe = h.actions.addSpacecraftCurve(probeScene);
            expect(probe).toBeInstanceOf(Promise);
            await probe;
            if (failure === "material") h.state.failMaterialAt = 1;
            if (failure === "trail-material") h.state.failMaterialAt = 3;
            if (failure === "attribute") h.state.failAttribute = true;
            const pending = h.actions.addSpacecraftCurve(h.scene);
            if (failure === "wait") { h.waits.shift().reject(new Error("wait failed")); await flush(); }
            else await h.drain();
            expect(await pending).toEqual(expect.objectContaining({ status: "failed", error: expect.any(Error) }));
            expect(h.scene.state).toBe(2);
            expect(h.scene.motherContainer.children).toHaveLength(0);
            h.resources.forEach(({ disposed }) => expect(disposed).toHaveBeenCalledOnce());
            h.state.failMaterialAt = 0;
            h.state.failAttribute = false;
            const retry = h.actions.addSpacecraftCurve(h.scene);
            await h.drain();
            expect(await retry).toEqual(expect.objectContaining({ status: "ready" }));
            h.actions.disposeSpacecraftCurve(h.scene);
            h.resources.forEach(({ disposed }) => expect(disposed).toHaveBeenCalledOnce());
        });
    }

    it("keeps a separately installed landing line during main replacement", async () => {
        const h = harness({ generated: false });
        const landing = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial());
        h.scene.landingOrbitLine = landing;
        h.scene.motherContainer.add(landing);
        h.actions.addSpacecraftCurve(h.scene);
        const fresh = h.actions.addSpacecraftCurve(h.scene);
        await h.drain();
        expect(await fresh).toEqual(expect.objectContaining({ status: "ready" }));
        expect(h.scene.landingOrbitLine).toBe(landing);
        expect(landing.parent).toBe(h.scene.motherContainer);
        h.actions.disposeSpacecraftCurve(h.scene);
    });

    it("disposes current allocations once even if disposal precedes queued completion", async () => {
        const h = harness();
        const pending = h.actions.addSpacecraftCurve(h.scene);
        h.actions.disposeSpacecraftCurve(h.scene);
        h.actions.disposeSpacecraftCurve(h.scene);
        await h.drain();
        expect(await pending).toEqual(expect.objectContaining({ status: "superseded" }));
        h.resources.forEach(({ disposed }) => expect(disposed).toHaveBeenCalledOnce());
    });

    it("forwards the owned promise through AnimationScene", () => {
        const promise = Promise.resolve({ status: "ready" });
        const Scene = createAnimationSceneClass({ spacecraftCurveActions: { addSpacecraftCurve: () => promise } });
        expect(Scene.prototype.addSpacecraftCurve.call({})).toBe(promise);
    });

    it("stops and releases a build through AnimationScene without waiting for another chunk", async () => {
        const h = harness();
        const Scene = createAnimationSceneClass({
            spacecraftCurveActions: h.actions,
            sceneCreationActions: { stopCreation: (scene) => { scene.stopCreationFlag = true; scene.deferred3DInitRunId += 1; } },
        });
        const pending = h.actions.addSpacecraftCurve(h.scene);
        Scene.prototype.stopCreation.call(h.scene);
        expect(h.scene.motherContainer.children).toHaveLength(0);
        expect(h.scene.orbitBuildState).toBe("superseded");
        expect(await pending).toEqual(expect.objectContaining({ status: "superseded" }));
        await h.drain();
    });

    it("revokes a completed build's readiness when its scene stops", async () => {
        const h = harness();
        const completed = h.actions.addSpacecraftCurve(h.scene);
        await h.drain();
        expect(await completed).toEqual({ status: "ready" });
        h.scene.stopCreationFlag = true;
        h.scene.deferred3DInitRunId += 1;
        h.actions.cancelSpacecraftCurveBuild(h.scene);
        expect(h.scene.orbitBuildState).toBe("superseded");
        expect(h.scene.state).toBe(2);
        expect(h.scene.motherContainer.children).toHaveLength(0);
        // A promise describes its completed attempt; scene status describes
        // current readiness and must not keep that historical success alive.
        expect(await completed).toEqual({ status: "ready" });
    });
});
