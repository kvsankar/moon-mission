import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

import { installFakeDom } from "./helpers/fake-dom.js";
import { BodyLatLonOverlay } from "../src/platform/js/rendering/body-lat-lon-overlay.js";

let dom = null;
let container = null;
let mesh = null;
let overlay = null;

const RADIUS = 10;

/**
 * The overlay uses +z as the polar axis and puts the prime meridian on +x, so
 * a camera on +x with a +z up vector frames the 0/0 intersection dead centre.
 */
function makeCamera({ distance = 40, fov = 50 } = {}) {
    const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 10000);
    camera.up.set(0, 0, 1);
    camera.position.set(distance, 0, 0);
    camera.lookAt(new THREE.Vector3());
    camera.updateMatrixWorld(true);
    return camera;
}

function makeSurface(clientHeight = 720, clientWidth = 1280) {
    const element = dom.document.createElement("div");
    element.clientHeight = clientHeight;
    element.clientWidth = clientWidth;
    element.setBoundingClientRect({ left: 0, top: 0, width: clientWidth, height: clientHeight });
    return element;
}

function makeOverlay(options = {}) {
    return new BodyLatLonOverlay({
        bodyName: "moon",
        radius: RADIUS,
        mesh,
        container,
        ...options,
    });
}

beforeEach(() => {
    dom = installFakeDom();
    container = new THREE.Group();
    mesh = new THREE.Mesh(
        new THREE.SphereGeometry(RADIUS, 32, 24),
        new THREE.MeshBasicMaterial(),
    );
    container.add(mesh);
    container.updateMatrixWorld(true);
});

afterEach(() => {
    overlay?.dispose();
    overlay = null;
    dom?.restore();
    dom = null;
});

describe("grid construction", () => {
    it("builds a hidden grid by default", () => {
        overlay = makeOverlay();

        overlay.create();

        expect(overlay.grid).toBeInstanceOf(THREE.Group);
        expect(overlay.grid.name).toBe("moon-lat-lon-grid");
        expect(overlay.grid.visible).toBe(false);
        expect(container.children).toContain(overlay.grid);
    });

    it("separates the equator and prime meridian into their own line sets", () => {
        overlay = makeOverlay();

        overlay.create({ gridVisible: true });

        // Minor lines, the equator and the prime meridian each get a material.
        expect(overlay.grid.children).toHaveLength(3);
        const colors = overlay.grid.children.map((line) => line.material.color.getHex());
        expect(new Set(colors).size).toBe(3);
    });

    it("builds labels only for a visible grid with labels enabled", () => {
        overlay = makeOverlay();
        overlay.create({ gridVisible: false, labelsVisible: true });
        expect(overlay.labels).toBeNull();

        overlay.dispose();
        overlay = makeOverlay();
        overlay.create({ gridVisible: true, labelsVisible: true });
        expect(overlay.labels).toBeInstanceOf(THREE.Group);
        expect(overlay.labels.children.length).toBeGreaterThan(0);
    });

    it("labels the equator and prime meridian by name", () => {
        overlay = makeOverlay();

        overlay.create({ gridVisible: true, labelsVisible: true });

        const texts = overlay.labels.children.map((sprite) => sprite.userData.labelText);
        expect(texts).toContain("Equator");
        expect(texts).toContain("Prime");
    });

    it("uses the configured hemisphere suffixes", () => {
        overlay = makeOverlay({
            latitudePositiveSuffix: "north",
            longitudeNegativeSuffix: "west",
        });

        overlay.create({ gridVisible: true, labelsVisible: true });

        const texts = overlay.labels.children.map((sprite) => sprite.userData.labelText);
        expect(texts).toContain("10°north");
        expect(texts).toContain("10°west");
    });

    it("accepts only the supported grid steps", () => {
        overlay = makeOverlay();
        overlay.create({ gridVisible: true });

        overlay.rebuildGrid(20);
        expect(overlay.gridStepDegrees).toBe(20);

        overlay.rebuildGrid(7);
        expect(overlay.gridStepDegrees).toBe(10);
    });

    it("skips a rebuild when nothing about the grid changed", () => {
        overlay = makeOverlay();
        overlay.create({ gridVisible: true });
        const grid = overlay.grid;

        expect(overlay.rebuildGrid(overlay.gridStepDegrees)).toBe(false);
        expect(overlay.grid).toBe(grid);
    });

    it("replaces the grid when the step changes", () => {
        overlay = makeOverlay();
        overlay.create({ gridVisible: true });
        const grid = overlay.grid;

        expect(overlay.rebuildGrid(30)).toBe(true);
        expect(overlay.grid).not.toBe(grid);
        expect(container.children).not.toContain(grid);
        expect(container.children).toContain(overlay.grid);
    });

    it("draws fewer lines at a coarser step", () => {
        overlay = makeOverlay();
        overlay.create({ gridVisible: true });
        const countVertices = () => overlay.grid.children
            .reduce((total, line) => total + line.geometry.getAttribute("position").count, 0);

        overlay.rebuildGrid(5);
        const fine = countVertices();
        overlay.rebuildGrid(30);

        expect(countVertices()).toBeLessThan(fine);
    });
});

describe("visibility", () => {
    beforeEach(() => {
        overlay = makeOverlay();
        overlay.create({ gridVisible: true, labelsVisible: true });
    });

    it("hides and shows the grid", () => {
        overlay.setGridVisible(false);
        expect(overlay.grid.visible).toBe(false);
        expect(overlay.labels.visible).toBe(false);

        overlay.setGridVisible(true);
        expect(overlay.grid.visible).toBe(true);
        expect(overlay.labels.visible).toBe(true);
    });

    it("hides labels without hiding the grid", () => {
        overlay.setLabelsVisible(false);

        expect(overlay.grid.visible).toBe(true);
        expect(overlay.labels.visible).toBe(false);
    });

    it("builds labels lazily when they are switched back on", () => {
        overlay.dispose();
        overlay = makeOverlay();
        overlay.create({ gridVisible: true, labelsVisible: false });
        expect(overlay.labels).toBeNull();

        overlay.setLabelsVisible(true);

        expect(overlay.labels).toBeInstanceOf(THREE.Group);
        expect(overlay.labels.visible).toBe(true);
    });
});

describe("hover label", () => {
    it("is not created unless hover is enabled", () => {
        overlay = makeOverlay();
        overlay.create();

        expect(overlay.hoverLabel).toBeNull();
    });

    it("is created and attached with hover enabled", () => {
        overlay = makeOverlay();

        overlay.create({ hoverEnabled: true });

        expect(overlay.hoverLabel).toBeInstanceOf(THREE.Sprite);
        expect(overlay.hoverLabel.name).toBe("moon-lat-lon-hover-label");
        expect(overlay.hoverLabel.visible).toBe(false);
        expect(container.children).toContain(overlay.hoverLabel);
    });

    it("is created on demand when hover is enabled later", () => {
        overlay = makeOverlay();
        overlay.create();

        overlay.setHoverEnabled(true);

        expect(overlay.hoverLabel).toBeInstanceOf(THREE.Sprite);
        expect(container.children).toContain(overlay.hoverLabel);
    });

    it("is hidden when hover is turned off", () => {
        overlay = makeOverlay();
        overlay.create({ hoverEnabled: true });
        overlay.hoverLabel.visible = true;

        overlay.setHoverEnabled(false);

        expect(overlay.hoverLabel.visible).toBe(false);
    });

    it("reports whether hiding changed anything", () => {
        overlay = makeOverlay();
        overlay.create({ hoverEnabled: true });

        expect(overlay.hideHover()).toBe(false);

        overlay.hoverLabel.visible = true;
        expect(overlay.hideHover()).toBe(true);
        expect(overlay.hoverLabel.visible).toBe(false);
    });
});

describe("camera-driven detail", () => {
    it("does nothing without a camera", () => {
        overlay = makeOverlay();
        overlay.create({ gridVisible: true });

        expect(overlay.updateForCamera({})).toBe(false);
    });

    it("does nothing while the overlay is fully hidden", () => {
        overlay = makeOverlay();
        overlay.create({ gridVisible: false, labelsVisible: true });

        expect(overlay.updateForCamera({ camera: makeCamera() })).toBe(false);
    });

    it("records the on-screen radius of the body", () => {
        overlay = makeOverlay();
        overlay.create({ gridVisible: true });

        overlay.updateForCamera({ camera: makeCamera({ distance: 40 }), rendererDomElement: makeSurface() });

        expect(overlay.screenRadiusPx).toBeGreaterThan(0);
        expect(overlay.screenRadiusPx).toBeLessThan(720);
    });

    it("refines the grid as the body fills more of the screen", () => {
        overlay = makeOverlay();
        overlay.create({ gridVisible: true });
        const surface = makeSurface();

        overlay.updateForCamera({ camera: makeCamera({ distance: 400 }), rendererDomElement: surface });
        const coarseStep = overlay.gridStepDegrees;

        overlay.updateForCamera({ camera: makeCamera({ distance: 12 }), rendererDomElement: surface });

        expect(overlay.gridStepDegrees).toBeLessThan(coarseStep);
    });

    it("hides labels while the body is too small to read them", () => {
        overlay = makeOverlay();
        overlay.create({ gridVisible: true, labelsVisible: true });

        overlay.updateForCamera({
            camera: makeCamera({ distance: 4000 }),
            rendererDomElement: makeSurface(),
        });

        expect(overlay.labels.visible).toBe(false);
    });

    it("shows labels once the body is large enough", () => {
        overlay = makeOverlay();
        overlay.create({ gridVisible: true, labelsVisible: true });

        overlay.updateForCamera({
            camera: makeCamera({ distance: 15 }),
            rendererDomElement: makeSurface(),
        });

        expect(overlay.labels.visible).toBe(true);
        expect(overlay.labels.children.some((sprite) => sprite.visible)).toBe(true);
    });

    it("hides labels on the far side of the body", () => {
        overlay = makeOverlay();
        overlay.create({ gridVisible: true, labelsVisible: true });

        overlay.updateForCamera({
            camera: makeCamera({ distance: 15 }),
            rendererDomElement: makeSurface(),
        });

        expect(overlay.labels.children.some((sprite) => sprite.visible === false)).toBe(true);
    });

    it("scales labels to a stable on-screen height", () => {
        overlay = makeOverlay();
        overlay.create({ gridVisible: true, labelsVisible: true });
        const surface = makeSurface();

        overlay.updateForCamera({ camera: makeCamera({ distance: 15 }), rendererDomElement: surface });
        const near = overlay.labels.children.find((sprite) => sprite.visible)?.scale.y;

        overlay.updateForCamera({ camera: makeCamera({ distance: 13 }), rendererDomElement: surface });
        const nearer = overlay.labels.children.find((sprite) => sprite.visible)?.scale.y;

        expect(near).toBeGreaterThan(0);
        expect(nearer).toBeLessThan(near);
    });

    it("falls back to a default viewport height without a renderer surface", () => {
        overlay = makeOverlay();
        overlay.create({ gridVisible: true });

        overlay.updateForCamera({ camera: makeCamera({ distance: 40 }) });

        expect(overlay.screenRadiusPx).toBeGreaterThan(0);
    });

    it("measures an orthographic camera from its frustum height", () => {
        overlay = makeOverlay();
        overlay.create({ gridVisible: true });
        const camera = new THREE.OrthographicCamera(-50, 50, 25, -25, 0.1, 1000);
        camera.position.set(0, -100, 0);
        camera.updateMatrixWorld(true);

        const radiusPx = overlay.getScreenRadiusPx({
            camera,
            rendererDomElement: makeSurface(),
        });

        expect(radiusPx).toBeCloseTo((RADIUS / 50) * 720, 6);
    });

    it("reports the last known radius without a camera", () => {
        overlay = makeOverlay();
        overlay.create({ gridVisible: true });
        overlay.screenRadiusPx = 123;

        expect(overlay.getScreenRadiusPx({})).toBe(123);
    });
});

describe("pointer hover", () => {
    let camera = null;
    let surface = null;

    beforeEach(() => {
        camera = makeCamera({ distance: 40 });
        overlay = makeOverlay();
        overlay.create({ gridVisible: true, hoverEnabled: true });
        surface = makeSurface();
    });

    it("refuses to hover while hovering is disabled", () => {
        overlay.setHoverEnabled(false);

        expect(overlay.updateHoverFromPointer({
            camera,
            rendererDomElement: surface,
            clientX: 640,
            clientY: 360,
        })).toBe(false);
    });

    it("refuses to hover without pointer coordinates", () => {
        expect(overlay.updateHoverFromPointer({
            camera,
            rendererDomElement: surface,
            clientX: Number.NaN,
            clientY: 360,
        })).toBe(false);
    });

    it("refuses to hover on a zero-sized surface", () => {
        const empty = dom.document.createElement("div");
        empty.setBoundingClientRect({ width: 0, height: 0 });

        expect(overlay.updateHoverFromPointer({
            camera,
            rendererDomElement: empty,
            clientX: 10,
            clientY: 10,
        })).toBe(false);
    });

    it("reports the surface coordinate under the pointer", () => {
        const hovered = overlay.updateHoverFromPointer({
            camera,
            rendererDomElement: surface,
            clientX: 640,
            clientY: 360,
        });

        expect(hovered).toBe(true);
        expect(overlay.hoverLabel.visible).toBe(true);
        // The prime meridian crosses the equator under the viewport centre.
        expect(overlay.hoverLabel.userData.labelText).toBe("0° 0°");
    });

    it("reports a northern latitude for a pointer above the centre", () => {
        overlay.updateHoverFromPointer({
            camera,
            rendererDomElement: surface,
            clientX: 640,
            clientY: 300,
        });

        expect(overlay.hoverLabel.userData.labelText).toMatch(/°N/);
    });

    it("reports an eastern longitude for a pointer right of the centre", () => {
        overlay.updateHoverFromPointer({
            camera,
            rendererDomElement: surface,
            clientX: 700,
            clientY: 360,
        });

        expect(overlay.hoverLabel.userData.labelText).toMatch(/°E/);
    });

    it("hides the hover label when the pointer leaves the body", () => {
        overlay.updateHoverFromPointer({
            camera,
            rendererDomElement: surface,
            clientX: 640,
            clientY: 360,
        });

        const result = overlay.updateHoverFromPointer({
            camera,
            rendererDomElement: surface,
            clientX: 5,
            clientY: 5,
        });

        expect(result).toBe(true);
        expect(overlay.hoverLabel.visible).toBe(false);
    });

    it("adds decimal places once the body is large on screen", () => {
        const closeCamera = makeCamera({ distance: 11 });

        overlay.updateHoverFromPointer({
            camera: closeCamera,
            rendererDomElement: surface,
            clientX: 700,
            clientY: 300,
        });

        expect(overlay.hoverLabel.userData.labelText).toMatch(/\d\.\d/);
    });

    it("reuses the label material while the text is unchanged", () => {
        overlay.updateHoverFromPointer({
            camera,
            rendererDomElement: surface,
            clientX: 640,
            clientY: 360,
        });
        const material = overlay.hoverLabel.material;

        overlay.updateHoverFromPointer({
            camera,
            rendererDomElement: surface,
            clientX: 640,
            clientY: 360,
        });

        expect(overlay.hoverLabel.material).toBe(material);
    });

    it("replaces the label material when the text changes", () => {
        overlay.updateHoverFromPointer({
            camera,
            rendererDomElement: surface,
            clientX: 640,
            clientY: 360,
        });
        const material = overlay.hoverLabel.material;
        const disposeSpy = vi.spyOn(material, "dispose");

        overlay.updateHoverFromPointer({
            camera,
            rendererDomElement: surface,
            clientX: 700,
            clientY: 300,
        });

        expect(overlay.hoverLabel.material).not.toBe(material);
        expect(disposeSpy).toHaveBeenCalled();
    });
});

describe("disposal", () => {
    it("removes and releases the grid, labels and hover label", () => {
        overlay = makeOverlay();
        overlay.create({ gridVisible: true, labelsVisible: true, hoverEnabled: true });
        const grid = overlay.grid;
        const labels = overlay.labels;
        const hoverLabel = overlay.hoverLabel;
        const geometrySpy = vi.spyOn(grid.children[0].geometry, "dispose");

        overlay.dispose();

        expect(geometrySpy).toHaveBeenCalled();
        expect(overlay.grid).toBeNull();
        expect(overlay.labels).toBeNull();
        expect(overlay.hoverLabel).toBeNull();
        expect(container.children).not.toContain(grid);
        expect(container.children).not.toContain(labels);
        expect(container.children).not.toContain(hoverLabel);
        overlay = null;
    });

    it("is safe to dispose twice", () => {
        overlay = makeOverlay();
        overlay.create({ gridVisible: true });

        overlay.dispose();

        expect(() => overlay.dispose()).not.toThrow();
    });
});
