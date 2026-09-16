import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { SpacecraftRenderer } from "../src/platform/js/rendering/spacecraft-renderer.js";
import { createSpacecraftModelActions } from "../src/platform/js/app/spacecraft-model-actions.js";

function model() {
    const geometry = new THREE.BufferGeometry(), material = new THREE.MeshBasicMaterial();
    vi.spyOn(geometry, "dispose"); vi.spyOn(material, "dispose");
    const scene = new THREE.Group(); scene.add(new THREE.Mesh(geometry, material));
    return { scene, geometry, material };
}
function rendererHarness() {
    const requests = [], parent = new THREE.Group();
    const renderer = new SpacecraftRenderer(parent, 1, 0xffffff, {
        gltfLoaderFactory: () => ({ load(_path, resolve, _progress, reject) { requests.push({ resolve, reject }); } }),
    });
    return { renderer, requests, parent };
}

describe("spacecraft model request ownership", () => {
    it("disposes a GLTF completion that arrives after renderer disposal", async () => {
        const h = rendererHarness(), pending = h.renderer.loadModel("late.glb"), late = model();
        h.renderer.disposeModel(); h.requests[0].resolve(late);
        await expect(pending).resolves.toMatchObject({ status: "superseded" });
        expect(h.parent.children).toHaveLength(0);
        expect(late.geometry.dispose).toHaveBeenCalledOnce();
        expect(late.material.dispose).toHaveBeenCalledOnce();
    });
    it("keeps only the newest out-of-order GLTF request", async () => {
        const h = rendererHarness();
        const first = h.renderer.loadModel("first.glb"), second = h.renderer.loadModel("second.glb");
        const latest = model(), stale = model();
        h.requests[1].resolve(latest); h.requests[0].resolve(stale);
        await expect(second).resolves.toMatchObject({ status: "ready" });
        await expect(first).resolves.toMatchObject({ status: "superseded" });
        expect(h.renderer.craftInner).toBe(latest.scene);
        expect(stale.geometry.dispose).toHaveBeenCalledOnce();
    });
    it("does not publish through a scene whose renderer was replaced while awaiting", async () => {
        let finish;
        class Renderer {
            constructor() { this.craft = {}; this.craftInner = {}; this.axesHelper = {}; this.visible = true; }
            loadModel() { return new Promise(resolve => { finish = resolve; }); }
            disposeModel = vi.fn();
        }
        const actions = createSpacecraftModelActions({ SpacecraftRenderer: Renderer,
            planetProperties: { SC: { color: 1 } }, getCraftSize: () => 1,
            getGlobalConfig: () => ({ spacecraftModel: { enabled: true, file: "x" } }), getModelPathPrefix: () => "" });
        const scene = { motherContainer: {}, deferred3DInitRunId: 1 };
        const pending = actions.addSpacecraftModel(scene), old = scene.spacecraftRenderer;
        scene.spacecraftRenderer = { replacement: true };
        finish({ status: "ready" }); await pending;
        expect(scene.craft).toBeUndefined();
        expect(old.disposeModel).toHaveBeenCalledOnce();
    });
});
