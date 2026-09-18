import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

import { SpacecraftRenderer } from "../src/platform/js/rendering/spacecraft-renderer.js";

let parent = null;
let renderer = null;
let warn = null;

function make(options = {}) {
    return new SpacecraftRenderer(parent, 4, 0x00ff00, options);
}

beforeEach(() => {
    parent = new THREE.Group();
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
    renderer?.dispose();
    renderer = null;
    parent = null;
    warn?.mockRestore();
    warn = null;
});

describe("simple craft", () => {
    it("builds a craft group with an inner body and a drone", () => {
        renderer = make();

        renderer.createSimple();

        expect(renderer.craft).toBeInstanceOf(THREE.Group);
        expect(renderer.craftInner).toBeInstanceOf(THREE.Mesh);
        expect(renderer.drone).toBeInstanceOf(THREE.Mesh);
        expect(parent.children).toContain(renderer.craft);
        expect(parent.children).toContain(renderer.drone);
    });

    it("puts the craft and drone on the dedicated craft lighting layer", () => {
        renderer = make();

        renderer.createSimple();

        expect(renderer.craft.layers.isEnabled(1)).toBe(true);
        expect(renderer.craftInner.layers.isEnabled(1)).toBe(true);
        expect(renderer.drone.layers.isEnabled(1)).toBe(true);
    });

    it("keeps the edge locator switched off behind its hotfix flag", () => {
        renderer = make();

        renderer.createSimple();

        expect(renderer.craftEdges).toBeInstanceOf(THREE.LineSegments);
        expect(renderer.craftEdges.visible).toBe(false);
    });

    it("hides the axes helper and the drone by default", () => {
        renderer = make();

        renderer.createSimple();

        expect(renderer.axesHelper.visible).toBe(false);
        expect(renderer.drone.visible).toBe(false);
    });

    it("uses the requested edge and drone colours", () => {
        renderer = make({ edgeColor: 0x123456, droneColor: 0x654321 });

        renderer.createSimple();

        expect(renderer.craftEdges.material.color.getHex()).toBe(0x123456);
        expect(renderer.drone.material.color.getHex()).toBe(0x654321);
    });

    it("falls back to the authored colours for bad options", () => {
        renderer = make({ edgeColor: "orange", droneColor: null });

        renderer.createSimple();

        expect(renderer.craftEdges.material.color.getHex()).toBe(0xff8000);
        expect(renderer.drone.material.color.getHex()).toBe(0xffffff);
    });

    it("scales the body from the configured craft size", () => {
        renderer = make();

        renderer.createSimple();

        expect(renderer.craftInner.geometry.parameters.height).toBeCloseTo(4 * 0.8, 9);
        expect(renderer.drone.geometry.parameters.width).toBe(4);
    });

    it("publishes no attitude offset for the simple craft", () => {
        renderer = make();

        renderer.createSimple();

        expect(renderer.getAttitudeOffsetQuaternion()).toBeNull();
    });
});

describe("model plugins", () => {
    it("builds the procedural Orion model by name", () => {
        renderer = make();

        renderer.createFromPlugin("Orion");

        expect(renderer.craft).toBeInstanceOf(THREE.Group);
        expect(renderer.solarArrayTrackers.length).toBeGreaterThan(0);
        expect(warn).not.toHaveBeenCalled();
    });

    it("accepts the explicit procedural spelling", () => {
        renderer = make();

        renderer.createFromPlugin("orion-procedural");

        expect(renderer.solarArrayTrackers.length).toBeGreaterThan(0);
    });

    it("warns and falls back to the simple craft for an unknown plugin", () => {
        renderer = make();

        renderer.createFromPlugin("starship");

        expect(warn).toHaveBeenCalledWith(expect.stringContaining("starship"));
        expect(renderer.solarArrayTrackers).toEqual([]);
        expect(renderer.craftInner).toBeInstanceOf(THREE.Mesh);
    });

    it("falls back quietly when no plugin is named", () => {
        renderer = make();

        renderer.createFromPlugin(null);

        expect(warn).not.toHaveBeenCalled();
        expect(renderer.craft).toBeInstanceOf(THREE.Group);
    });

    it("scales the procedural model by the requested factor", () => {
        const small = make();
        small.createProceduralOrion({ scale: 1 });
        const smallBox = new THREE.Box3().setFromObject(small.craft);

        renderer = make();
        renderer.createProceduralOrion({ scale: 3 });
        const largeBox = new THREE.Box3().setFromObject(renderer.craft);

        expect(largeBox.getSize(new THREE.Vector3()).length())
            .toBeGreaterThan(smallBox.getSize(new THREE.Vector3()).length());
        small.dispose();
    });

    it("publishes an attitude offset for the procedural model", () => {
        renderer = make();

        renderer.createProceduralOrion();

        expect(renderer.hasAttitudeOffset).toBe(true);
        expect(renderer.getAttitudeOffsetQuaternion()).toBe(renderer.attitudeOffsetQuaternion);
    });
});

describe("solar array tracking", () => {
    beforeEach(() => {
        renderer = make();
        renderer.createProceduralOrion();
    });

    it("does nothing while automatic tracking is off", () => {
        renderer.solarArrayAutoTrack = false;
        const tracker = renderer.solarArrayTrackers[0];
        const before = tracker.tiltGroup.rotation.x;

        renderer.updateSolarArrayTracking({ x: 0, y: 1, z: 0 });

        expect(tracker.tiltGroup.rotation.x).toBe(before);
    });

    it("ignores a non-finite or zero Sun direction", () => {
        renderer.solarArrayAutoTrack = true;
        const tracker = renderer.solarArrayTrackers[0];
        const before = tracker.tiltGroup.rotation.x;

        renderer.updateSolarArrayTracking({ x: Number.NaN, y: 1, z: 0 });
        renderer.updateSolarArrayTracking({ x: 0, y: 0, z: 0 });
        renderer.updateSolarArrayTracking(null);

        expect(tracker.tiltGroup.rotation.x).toBe(before);
    });

    it("rotates the wings to face the Sun", () => {
        renderer.solarArrayAutoTrack = true;

        renderer.updateSolarArrayTracking({ x: 0, y: 1, z: 0 });
        const first = renderer.solarArrayTrackers[0].tiltGroup.rotation.x;
        renderer.updateSolarArrayTracking({ x: 0, y: 0, z: 1 });

        expect(renderer.solarArrayTrackers[0].tiltGroup.rotation.x).not.toBe(first);
    });

    it("keeps the hinge to a single degree of freedom", () => {
        renderer.solarArrayAutoTrack = true;

        renderer.updateSolarArrayTracking({ x: 0.3, y: 0.6, z: 0.7 });

        const { rotation } = renderer.solarArrayTrackers[0].tiltGroup;
        expect(rotation.y).toBe(0);
        expect(rotation.z).toBe(0);
    });

    it("normalizes the incoming direction", () => {
        renderer.solarArrayAutoTrack = true;

        renderer.updateSolarArrayTracking({ x: 0, y: 5, z: 0 });
        const scaled = renderer.solarArrayTrackers[0].tiltGroup.rotation.x;
        renderer.updateSolarArrayTracking({ x: 0, y: 1, z: 0 });

        expect(renderer.solarArrayTrackers[0].tiltGroup.rotation.x).toBeCloseTo(scaled, 12);
    });

    it("stops tracking once the craft is disposed", () => {
        renderer.solarArrayAutoTrack = true;
        renderer.dispose();

        expect(() => renderer.updateSolarArrayTracking({ x: 0, y: 1, z: 0 })).not.toThrow();
        renderer = null;
    });
});

describe("model loading", () => {
    function makeLoader(behaviour) {
        return () => ({ load: behaviour });
    }

    function gltfScene() {
        const scene = new THREE.Group();
        scene.add(new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial()));
        return scene;
    }

    it("mounts a loaded model with lights and an axes helper", async () => {
        renderer = make({
            gltfLoaderFactory: makeLoader((path, onLoad) => onLoad({ scene: gltfScene() })),
        });

        const result = await renderer.loadModel("/models/orion.glb");

        expect(result).toEqual({ status: "ready" });
        expect(renderer.craft).toBeInstanceOf(THREE.Group);
        expect(renderer.modelLights.length).toBeGreaterThan(0);
        expect(renderer.axesHelper.visible).toBe(true);
        expect(parent.children).toContain(renderer.craft);
    });

    it("puts every loaded node on the craft lighting layer", async () => {
        renderer = make({
            gltfLoaderFactory: makeLoader((path, onLoad) => onLoad({ scene: gltfScene() })),
        });

        await renderer.loadModel("/models/orion.glb");

        renderer.craftInner.traverse((node) => {
            expect(node.layers.isEnabled(1)).toBe(true);
        });
    });

    it("discards a load that a newer request superseded", async () => {
        let resolveFirst = null;
        renderer = make({
            gltfLoaderFactory: makeLoader((path, onLoad) => {
                if (!resolveFirst) {
                    resolveFirst = () => onLoad({ scene: gltfScene() });
                    return;
                }
                onLoad({ scene: gltfScene() });
            }),
        });

        const first = renderer.loadModel("/models/a.glb");
        await renderer.loadModel("/models/b.glb");
        resolveFirst();

        expect(await first).toEqual({ status: "superseded" });
    });

    it("rejects and reports a load failure", async () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        renderer = make({
            gltfLoaderFactory: makeLoader((path, onLoad, onProgress, onError) => {
                onError(new Error("404"));
            }),
        });

        await expect(renderer.loadModel("/models/missing.glb")).rejects.toThrow("404");
        expect(error).toHaveBeenCalled();
        error.mockRestore();
    });

    it("clears any previous procedural tracking state", async () => {
        renderer = make({
            gltfLoaderFactory: makeLoader((path, onLoad) => onLoad({ scene: gltfScene() })),
        });
        renderer.createProceduralOrion();

        await renderer.loadModel("/models/orion.glb");

        expect(renderer.solarArrayTrackers).toEqual([]);
        expect(renderer.hasAttitudeOffset).toBe(false);
    });

    it("releases the loaded graph and its lights", async () => {
        renderer = make({
            gltfLoaderFactory: makeLoader((path, onLoad) => onLoad({ scene: gltfScene() })),
        });
        await renderer.loadModel("/models/orion.glb");
        const craft = renderer.craft;

        renderer.disposeModel();

        expect(renderer.modelLights).toEqual([]);
        expect(parent.children).not.toContain(craft);
        renderer = null;
    });
});

describe("visibility and disposal", () => {
    beforeEach(() => {
        renderer = make();
        renderer.createSimple();
    });

    it("toggles craft, axes and drone visibility independently", () => {
        renderer.setVisible(false);
        renderer.setAxesVisible(true);
        renderer.setDroneVisible(true);

        expect(renderer.craft.visible).toBe(false);
        expect(renderer.axesHelper.visible).toBe(true);
        expect(renderer.drone.visible).toBe(true);
    });

    it("remembers the requested visibility for a later build", () => {
        renderer.setVisible(false);
        renderer.dispose();

        renderer.createSimple();

        expect(renderer.craft.visible).toBe(false);
    });

    it("tolerates visibility changes before anything is built", () => {
        const bare = make();

        expect(() => {
            bare.setVisible(true);
            bare.setAxesVisible(true);
            bare.setDroneVisible(true);
        }).not.toThrow();
    });

    it("disposes every craft resource and detaches the group", () => {
        const craft = renderer.craft;
        const drone = renderer.drone;
        const geometrySpy = vi.spyOn(renderer.craftInner.geometry, "dispose");
        const edgeSpy = vi.spyOn(renderer.craftEdges.geometry, "dispose");
        const droneSpy = vi.spyOn(renderer.drone.geometry, "dispose");

        renderer.dispose();

        expect(geometrySpy).toHaveBeenCalled();
        expect(edgeSpy).toHaveBeenCalled();
        expect(droneSpy).toHaveBeenCalled();
        expect(renderer.craft).toBeNull();
        expect(renderer.drone).toBeNull();
        expect(parent.children).not.toContain(craft);
        expect(parent.children).not.toContain(drone);
    });

    it("is safe to dispose twice", () => {
        renderer.dispose();

        expect(() => renderer.dispose()).not.toThrow();
    });
});
