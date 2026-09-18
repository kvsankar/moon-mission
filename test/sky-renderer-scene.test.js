import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

import { SkyRenderer } from "../src/platform/js/rendering/sky-renderer.js";
import { PHYSICS_CONSTANTS as PC } from "../src/platform/js/core/constants.js";

const BASE_RADIUS = 6371;
const SKY_LAYER = 2;

let renderers = [];

afterEach(() => {
    for (const renderer of renderers) {
        try {
            renderer.dispose();
        } catch {
            // Already disposed by the test.
        }
    }
    renderers = [];
    vi.restoreAllMocks();
});

function makeRenderer({ create = false, visible = true, textures = false } = {}) {
    const parent = new THREE.Group();
    const renderer = new SkyRenderer(parent, BASE_RADIUS);
    renderers.push(renderer);
    if (textures) {
        renderer.setTextures(new THREE.Texture(), new THREE.Texture());
    }
    if (create) renderer.create(visible);
    return { parent, renderer };
}

describe("construction", () => {
    it("sizes the sky sphere far outside the mission volume", () => {
        const { renderer } = makeRenderer();

        expect(renderer.radius).toBe(200 * BASE_RADIUS);
        expect(renderer.container).toBeNull();
        expect(renderer.isVisible()).toBe(false);
    });

    it("mounts three shells on the sky layer behind everything else", () => {
        const { parent, renderer } = makeRenderer({ create: true });

        expect(parent.children).toEqual([renderer.container]);
        expect(renderer.container.children).toEqual([
            renderer.skyMesh,
            renderer.constellationMesh,
            renderer.lowerShadeMesh,
        ]);
        expect(renderer.skyMesh.renderOrder).toBe(-30);
        expect(renderer.constellationMesh.renderOrder).toBe(-29);
        expect(renderer.lowerShadeMesh.renderOrder).toBe(-28);
        for (const mesh of [renderer.skyMesh, renderer.constellationMesh, renderer.lowerShadeMesh]) {
            expect(mesh.layers.mask).toBe(1 << SKY_LAYER);
            expect(mesh.castShadow).toBe(false);
            expect(mesh.receiveShadow).toBe(false);
            expect(mesh.geometry).toBe(renderer.geometry);
            expect(mesh.material.side).toBe(THREE.BackSide);
            expect(mesh.material.depthWrite).toBe(false);
            expect(mesh.material.toneMapped).toBe(false);
        }
    });

    it("mirrors the container so the texture reads from inside the sphere", () => {
        const { renderer } = makeRenderer({ create: true });

        expect(renderer.container.scale.toArray()).toEqual([-1, 1, 1]);
    });

    it("tilts the sky to the ecliptic obliquity", () => {
        const { renderer } = makeRenderer({ create: true });
        const expected = new THREE.Group();
        expected.lookAt(
            0,
            Math.sin(PC.EARTH_AXIS_INCLINATION_RADS),
            Math.cos(PC.EARTH_AXIS_INCLINATION_RADS),
        );
        expected.rotateZ(Math.PI);

        expect(renderer.container.quaternion.angleTo(expected.quaternion)).toBeLessThan(1e-6);
    });

    it("blends the star map and constellations additively at their tuned opacities", () => {
        const { renderer } = makeRenderer({ create: true, textures: true });

        expect(renderer.skyMesh.material.blending).toBe(THREE.AdditiveBlending);
        expect(renderer.skyMesh.material.opacity).toBeCloseTo(0.28, 6);
        expect(renderer.skyMesh.material.map).toBe(renderer.skyTexture);
        expect(renderer.constellationMesh.material.blending).toBe(THREE.AdditiveBlending);
        expect(renderer.constellationMesh.material.opacity).toBeCloseTo(0.04, 6);
        expect(renderer.constellationMesh.material.map).toBe(renderer.constellationTexture);
    });

    it("shades the lower hemisphere with a dark, mostly opaque wash", () => {
        const { renderer } = makeRenderer({ create: true });
        const { uniforms } = renderer.lowerShadeMesh.material;

        expect(uniforms.uMaxAlpha.value).toBeCloseTo(0.48, 6);
        expect(uniforms.uShadeColor.value.getHex()).toBe(0x02050c);
    });

    it("can be built hidden", () => {
        const { renderer } = makeRenderer({ create: true, visible: false });

        expect(renderer.container.visible).toBe(false);
        expect(renderer.isVisible()).toBe(false);
    });
});

describe("textures", () => {
    it("builds without textures and paints them in later", () => {
        const { renderer } = makeRenderer({ create: true });
        expect(renderer.skyMesh.material.map).toBeNull();

        const starmap = new THREE.Texture();
        renderer.updateTextures(starmap, null);

        expect(renderer.skyMesh.material.map).toBe(starmap);
        expect(renderer.constellationMesh.material.map).toBeNull();
    });

    it("requests a material recompile when the map changes", () => {
        const { renderer } = makeRenderer({ create: true, textures: true });
        const version = renderer.skyMesh.material.version;

        renderer.updateTextures(new THREE.Texture(), new THREE.Texture());

        // `needsUpdate` is write-only on three materials; the recompile request
        // shows up as a version bump.
        expect(renderer.skyMesh.material.version).toBeGreaterThan(version);
    });

    it("accepts textures before the scene exists", () => {
        const { renderer } = makeRenderer();
        const starmap = new THREE.Texture();

        renderer.updateTextures(starmap, null);
        renderer.create(true);

        expect(renderer.skyMesh.material.map).toBe(starmap);
    });

    it("keeps a replaced texture alive when another consumer still holds it", () => {
        const { renderer } = makeRenderer({ create: true, textures: true });
        const shared = renderer.skyTexture;
        const disposed = vi.spyOn(shared, "dispose");

        renderer.updateTextures(new THREE.Texture(), null, { disposePrevious: false });

        expect(disposed).not.toHaveBeenCalled();
    });
});

describe("per-frame updates", () => {
    it("pins the sky to the camera so it never moves relative to the viewer", () => {
        const { renderer } = makeRenderer({ create: true });
        const camera = new THREE.PerspectiveCamera();
        camera.position.set(-4, 8, 16);
        camera.updateMatrixWorld(true);

        renderer.updatePosition(camera);

        expect(renderer.container.position.toArray()).toEqual([-4, 8, 16]);
    });

    it("ignores a frame before the sky is built", () => {
        const { renderer } = makeRenderer();

        expect(() => renderer.updatePosition(new THREE.PerspectiveCamera())).not.toThrow();
    });

    it("toggles visibility only once the sky is built", () => {
        const { renderer } = makeRenderer();

        renderer.setVisible(true);
        expect(renderer.isVisible()).toBe(false);

        renderer.create(true);
        renderer.setVisible(false);
        expect(renderer.isVisible()).toBe(false);

        renderer.setVisible(true);
        expect(renderer.isVisible()).toBe(true);
    });
});

describe("disposal", () => {
    it("releases every mesh, material, geometry and texture reference", () => {
        const { parent, renderer } = makeRenderer({ create: true, textures: true });
        const geometry = renderer.geometry;
        const materials = [
            renderer.skyMesh.material,
            renderer.constellationMesh.material,
            renderer.lowerShadeMesh.material,
        ];
        const disposed = new Set();
        geometry.addEventListener("dispose", () => disposed.add("geometry"));
        for (const [index, material] of materials.entries()) {
            material.addEventListener("dispose", () => disposed.add(`material-${index}`));
        }

        renderer.dispose();

        expect(disposed).toEqual(new Set(["geometry", "material-0", "material-1", "material-2"]));
        expect(parent.children).toEqual([]);
        expect(renderer.container).toBeNull();
        expect(renderer.skyMesh).toBeNull();
        expect(renderer.constellationMesh).toBeNull();
        expect(renderer.lowerShadeMesh).toBeNull();
        expect(renderer.geometry).toBeNull();
        expect(renderer.skyTexture).toBeNull();
        expect(renderer.constellationTexture).toBeNull();
    });

    it("is safe before the scene is built and after it is torn down", () => {
        const { renderer } = makeRenderer({ textures: true });

        expect(() => renderer.dispose()).not.toThrow();
        expect(renderer.skyTexture).toBeNull();

        renderer.create(true);
        renderer.dispose();
        expect(() => renderer.dispose()).not.toThrow();
    });

    it("can be rebuilt after disposal", () => {
        const { parent, renderer } = makeRenderer({ create: true });

        renderer.dispose();
        renderer.create(true);

        expect(parent.children).toEqual([renderer.container]);
        expect(renderer.container.children).toHaveLength(3);
    });
});
