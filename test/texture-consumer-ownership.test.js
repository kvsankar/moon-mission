import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { EarthRenderer } from "../src/platform/js/rendering/earth-renderer.js";
import { MoonRenderer } from "../src/platform/js/rendering/moon-renderer.js";
import { SkyRenderer } from "../src/platform/js/rendering/sky-renderer.js";
import { SkyController } from "../src/platform/js/rendering/SkyController.js";
import { createEarthActions } from "../src/platform/js/app/earth-actions.js";
import { createMoonActions } from "../src/platform/js/app/moon-actions.js";
import { applyAndRefreshSceneTextures } from "../src/platform/js/app/scene-texture-actions.js";
import { loadMoonRenderProfileTextures } from "../src/platform/js/app/texture-loader.js";
import { disposeUnclaimedTextures } from "../src/platform/js/rendering/texture-ownership.js";

function texture() {
    const value = new THREE.Texture();
    const disposed = vi.fn();
    value.addEventListener("dispose", disposed);
    return { value, disposed };
}

describe("scene and renderer texture ownership", () => {
    for (const [name, create] of [
        ["Moon", () => new MoonRenderer(1)],
        ["Earth", () => new EarthRenderer(1)],
        ["Sky", () => new SkyRenderer(new THREE.Group(), 1)],
        ["runtime SkyController", () => new SkyController(new THREE.Group(), 1)],
    ]) {
        it(`keeps shared ${name} inputs alive until the last renderer releases them`, () => {
            const map = texture(), secondary = texture();
            const first = create(), second = create();
            first.setTextures(map.value, secondary.value);
            second.setTextures(map.value, secondary.value);
            first.dispose();
            expect(map.disposed).not.toHaveBeenCalled();
            expect(secondary.disposed).not.toHaveBeenCalled();
            second.dispose();
            expect(map.disposed).toHaveBeenCalledOnce();
            expect(secondary.disposed).toHaveBeenCalledOnce();
        });
    }

    it("releases scene-only accepted Earth/photo aliases through the real body adapter", () => {
        const map = texture();
        const scene = {};
        const accepted = vi.fn();
        applyAndRefreshSceneTextures(scene, { earthTexture: map.value, earthPhotoTexture: map.value }, { onAccepted: accepted });
        expect(accepted).toHaveBeenCalledOnce();
        const actions = createEarthActions({});
        actions.disposeEarth(scene);
        actions.disposeEarth(scene);
        expect(map.disposed).toHaveBeenCalledOnce();
    });

    it("releases a photo-only input and preserves aliases still used by another body", () => {
        const photo = texture(), shared = texture();
        const scene = { disposeMoonSOI: vi.fn(), disposeBodyHalos: vi.fn(), disposeMoonOsculatingOrbit: vi.fn() };
        applyAndRefreshSceneTextures(scene, { earthPhotoTexture: photo.value, earthTexture: shared.value, moonMap: shared.value });
        createEarthActions({}).disposeEarth(scene);
        expect(photo.disposed).toHaveBeenCalledOnce();
        expect(shared.disposed).not.toHaveBeenCalled();
        createMoonActions({ getGlobalConfig: () => ({ is_lunar: true }) }).disposeMoon(scene);
        expect(shared.disposed).toHaveBeenCalledOnce();
    });

    it("keeps a real decoded DEM normal alive for an independent renderer after producer cleanup", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })));
        vi.stubGlobal("Worker", class {
            terminate() {}
            postMessage() {
                queueMicrotask(() => this.onmessage({ data: {
                    width: 2, height: 2, heightBuffer: new Float32Array(4).buffer,
                    normalBuffer: new Uint16Array(16).buffer,
                } }));
            }
        });
        let loaded;
        const observer = new MoonRenderer(1);
        try {
            loaded = await loadMoonRenderProfileTextures({
                THREE: { ...THREE, TextureLoader: class { load(_url, done) { done(new THREE.Texture()); } } },
                moonRenderProfile: "quality", globalObject: {},
            });
            const normal = loaded.moonDisplacementMap.userData.physicalNormalTexture;
            const disposed = vi.fn();
            normal.addEventListener("dispose", disposed);
            observer.setTextures(null, null, normal);
            disposeUnclaimedTextures([loaded.moonDisplacementMap]);
            expect(disposed).not.toHaveBeenCalled();
            observer.dispose();
            expect(disposed).toHaveBeenCalledOnce();
        } finally {
            observer.dispose();
            disposeUnclaimedTextures([loaded?.moonMap, loaded?.moonDisplacementMap]);
            vi.unstubAllGlobals();
        }
    });

    it("releases pending scene inputs and retained renderer inputs after adoption failure", () => {
        const old = texture(), next = texture(), photo = texture();
        const renderer = new EarthRenderer(1);
        renderer.setTextures(old.value, null);
        const scene = { earthRenderer: renderer, earthTexture: old.value };
        vi.spyOn(renderer, "updateTextures").mockImplementation(() => { throw new Error("adoption failed"); });
        expect(() => applyAndRefreshSceneTextures(scene,
            { earthTexture: next.value, earthPhotoTexture: photo.value }, { disposePrevious: true, onAccepted: vi.fn() }))
            .toThrow("adoption failed");
        expect(old.disposed).not.toHaveBeenCalled();
        expect(next.disposed).not.toHaveBeenCalled();
        createEarthActions({}).disposeEarth(scene);
        for (const item of [old, next, photo]) expect(item.disposed).toHaveBeenCalledOnce();
    });

    it("moves one Moon consumer to a new profile without invalidating the other's profile", () => {
        const old = texture(), next = texture();
        const first = new MoonRenderer(1), second = new MoonRenderer(1);
        first.setTextures(old.value, null);
        second.setTextures(old.value, null);
        first.updateTextures(next.value, null);
        expect(old.disposed).not.toHaveBeenCalled();
        first.dispose();
        expect(next.disposed).toHaveBeenCalledOnce();
        expect(old.disposed).not.toHaveBeenCalled();
        second.dispose();
        expect(old.disposed).toHaveBeenCalledOnce();
    });

    it("deduplicates renderer aliases and repeated installation of the same resources", () => {
        const shared = texture();
        const renderer = new MoonRenderer(1);
        renderer.setTextures(shared.value, shared.value, shared.value);
        renderer.updateTextures(shared.value, shared.value, shared.value);
        renderer.updateTextures(shared.value, shared.value, shared.value);
        renderer.dispose();
        renderer.dispose();
        expect(shared.disposed).toHaveBeenCalledOnce();
    });

    it("keeps an old generated normal alive while another renderer uses it", () => {
        const old = texture(), next = texture();
        const first = new MoonRenderer(1), second = new MoonRenderer(1);
        first._buildGeneratedNormalMap = () => old.value;
        first._refreshGeneratedNormalMap();
        second.setTextures(null, null, old.value);
        first._buildGeneratedNormalMap = () => next.value;
        first._refreshGeneratedNormalMap();
        expect(old.disposed).not.toHaveBeenCalled();
        first.dispose();
        expect(next.disposed).toHaveBeenCalledOnce();
        second.dispose();
        expect(old.disposed).toHaveBeenCalledOnce();
    });

    it("keeps disposePrevious:false as relinquishment without destroying caller-owned old input", () => {
        const old = texture(), next = texture();
        const renderer = new EarthRenderer(1);
        renderer.setTextures(old.value, null);
        renderer.updateTextures(next.value, null, null, { disposePrevious: false });
        renderer.dispose();
        expect(old.disposed).not.toHaveBeenCalled();
        expect(next.disposed).toHaveBeenCalledOnce();
        old.value.dispose(); // The caller retained destruction responsibility.
    });

    for (const [name, create, meshKey, failureKey] of [
        ["Earth", () => new EarthRenderer(1), "mesh", "geometry"],
        ["Moon", () => new MoonRenderer(1), "mesh", "geometry"],
        ["Sky", () => new SkyRenderer(new THREE.Group(), 1), "skyMesh", "material"],
        ["runtime SkyController", () => new SkyController(new THREE.Group(), 1), "skyMesh", "material"],
    ]) {
        it(`does not revive a disposed input from stale ${name} material maps on cleanup retry`, () => {
            const map = texture();
            const renderer = create();
            renderer.setTextures(map.value, null);
            const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ map: map.value }));
            renderer.container = new THREE.Group();
            renderer.container.add(mesh);
            renderer[meshKey] = mesh;
            if (meshKey === "skyMesh") renderer.geometry = mesh.geometry;
            vi.spyOn(mesh[failureKey], "dispose").mockImplementationOnce(() => { throw new Error("cleanup failed"); });
            expect(() => renderer.dispose()).toThrow("cleanup failed");
            expect(map.disposed).toHaveBeenCalledOnce();
            renderer.dispose();
            expect(map.disposed).toHaveBeenCalledOnce();
        });
    }
});
