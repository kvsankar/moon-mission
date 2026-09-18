import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The globe view builds a real WebGL renderer and pulls an Earth texture.
// Everything else in the module is real three.js maths, so only those two
// GPU-bound classes are swapped out.
vi.mock("three", async (importOriginal) => {
    const actual = await importOriginal();

    class FakeWebGLRenderer {
        constructor(options) {
            this.options = options;
            this.domElement = globalThis.document.createElement("canvas");
            this.domElement.__ownerRenderer = this;
            this.renderCount = 0;
            this.setSizeCalls = [];
            this.pixelRatio = 1;
            this.__lastScene = null;
            this.__lastCamera = null;
        }

        setPixelRatio(ratio) { this.pixelRatio = ratio; }
        setSize(width, height) { this.setSizeCalls.push([width, height]); }

        render(scene, camera) {
            this.renderCount += 1;
            this.__lastScene = scene;
            this.__lastCamera = camera;
        }

        dispose() { this.disposed = true; }
    }

    class FakeTextureLoader {
        load(url, onLoad) {
            const texture = new actual.Texture();
            texture.sourceUrl = url;
            onLoad(texture);
            return texture;
        }
    }

    return { ...actual, WebGLRenderer: FakeWebGLRenderer, TextureLoader: FakeTextureLoader };
});

const THREE = await import("three");
const { FakeEvent, FakeResizeObserver, installFakeDom } = await import("./helpers/fake-dom.js");
const { createGroundTrackPanelActions } = await import("../src/platform/js/app/ground-track-panel.js");

const MISSION_CONFIG = JSON.parse(readFileSync("assets/artemis2/data/config.json", "utf8"));
const WINDOW_START_MS = Date.parse(MISSION_CONFIG.events.returnCorrection3.startTime);
const WINDOW_END_MS = Date.parse(MISSION_CONFIG.geo.endTime);
const SOURCE_END_MS = Date.parse(MISSION_CONFIG.postHorizonExtension.sourceEndTime);
const MID_WINDOW_MS = WINDOW_START_MS + 60 * 60 * 1000;

const PANEL_ELEMENTS = [
    { id: "ground-track-panel-wrapper", tag: "div" },
    { id: "ground-track-panel", tag: "section", parent: "ground-track-panel-wrapper" },
    { id: "gt-header", tag: "div", parent: "ground-track-panel", className: "ground-track-panel__header" },
    { id: "gt-header-controls", tag: "div", parent: "gt-header", className: "ground-track-panel__header-controls" },
    { id: "ground-track-panel-close", tag: "button", parent: "gt-header-controls" },
    { id: "ground-track-status", tag: "div", parent: "ground-track-panel" },
    { id: "ground-track-coords", tag: "div", parent: "ground-track-panel" },
    { id: "ground-track-map", tag: "div", parent: "ground-track-panel" },
    { id: "ground-track-globe", tag: "div", parent: "ground-track-panel" },
    { id: "ground-track-provenance-note", tag: "div", parent: "ground-track-panel" },
    { id: "ground-track-event-list", tag: "div", parent: "ground-track-panel" },
    { id: "ground-track-timeline-local", tag: "div", parent: "ground-track-panel" },
    { id: "ground-track-style-2d", tag: "button", parent: "ground-track-panel" },
    { id: "ground-track-style-3d", tag: "button", parent: "ground-track-panel" },
    { id: "ground-track-zoom-in", tag: "button", parent: "ground-track-panel" },
    { id: "ground-track-zoom-out", tag: "button", parent: "ground-track-panel" },
    { id: "ground-track-button", tag: "button" },
];

let dom = null;
let actions = null;

function buildCraftCurve() {
    const curve = [];
    const times = [];
    const stepMs = 5 * 60 * 1000;
    for (let timeMs = WINDOW_START_MS; timeMs <= WINDOW_END_MS; timeMs += stepMs) {
        const fraction = (timeMs - WINDOW_START_MS) / (WINDOW_END_MS - WINDOW_START_MS);
        const angle = fraction * Math.PI * 4;
        const radius = 60000 - (fraction * 53000);
        curve.push({
            x: radius * Math.cos(angle),
            y: radius * Math.sin(angle) * 0.9,
            z: radius * Math.sin(angle * 0.5) * 0.4,
        });
        times.push(timeMs);
    }
    return { curve, times };
}

function mount() {
    const { curve, times } = buildCraftCurve();
    dom = installFakeDom(PANEL_ELEMENTS, {
        innerWidth: 1600,
        innerHeight: 900,
        devicePixelRatio: 3,
        ResizeObserver: FakeResizeObserver,
        requestAnimationFrame: (callback) => { callback(0); return 1; },
        cancelAnimationFrame: () => {},
        missionConfig: { dataPath: "assets/artemis2/data" },
        location: { pathname: "/artemis2/", href: "http://localhost/artemis2/" },
        animationScenes: {
            geo: { primaryCraftId: "SC", curvesById: { SC: curve }, curveTimesById: { SC: times } },
        },
    });
    vi.stubGlobal("fetch", vi.fn(async (url) => (
        String(url).includes("config.json")
            ? { ok: true, status: 200, json: async () => MISSION_CONFIG }
            : { ok: false, status: 404, json: async () => ({}) }
    )));
}

function node(id) {
    return dom.document.getElementById(id);
}

async function settle(rounds = 25) {
    for (let index = 0; index < rounds; index += 1) {
        // eslint-disable-next-line no-await-in-loop
        await Promise.resolve();
    }
}

function sceneState() {
    return {
        bodies: {
            SC: { available: true, position: { x: 7400, y: 200, z: -300 }, velocity: { vx: 0, vy: 7.5, vz: 0.2 } },
            EARTH: { available: true, position: { x: 0, y: 0, z: 0 } },
        },
    };
}

function click(id) {
    node(id).dispatchEvent(new FakeEvent("click", { bubbles: true }));
}

/** Opens the panel, switches it to the globe and returns the live globe state. */
async function showGlobe(animTime = MID_WINDOW_MS) {
    actions = createGroundTrackPanelActions({});
    actions.update({ sceneState: sceneState(), config: "geo", animTime });
    await settle();
    actions.setPanelVisible(true);
    actions.update({ sceneState: sceneState(), config: "geo", animTime });
    await settle();
    // The shadow hosts exist after the first map render; the globe reads their
    // layout box, so give it one before switching over.
    const shadow = node("ground-track-map").shadowRoot;
    const host = shadow.querySelector(".ground-track-shadow-globe");
    host.clientWidth = 640;
    host.clientHeight = 360;
    click("ground-track-style-3d");
    return globeFromScene();
}

function globeFromScene() {
    const shadow = node("ground-track-map").shadowRoot;
    const host = shadow.querySelector(".ground-track-shadow-globe");
    const canvas = host.children[0];
    return { host, canvas };
}

function trackGroupOf(scene) {
    return scene.children[0].children.find((child) => child.type === "Group");
}

beforeEach(() => {
    FakeResizeObserver.instances = [];
});

afterEach(() => {
    actions = null;
    dom?.restore();
    dom = null;
    vi.unstubAllGlobals();
});

describe("switching to the globe", () => {
    it("mounts a renderer canvas into the globe host and hides the map", async () => {
        mount();

        const { host, canvas } = await showGlobe();

        expect(canvas.tagName).toBe("CANVAS");
        expect(host.hidden).toBe(false);
        expect(node("ground-track-map").shadowRoot.querySelector(".ground-track-shadow-map").hidden).toBe(true);
    });

    it("marks the three-dimensional style button active", async () => {
        mount();

        await showGlobe();

        expect(node("ground-track-style-3d").classList.contains("is-active")).toBe(true);
        expect(node("ground-track-style-3d").getAttribute("aria-pressed")).toBe("true");
        expect(node("ground-track-style-2d").getAttribute("aria-pressed")).toBe("false");
    });

    it("caps the device pixel ratio at two", async () => {
        mount();

        await showGlobe();
        const renderer = rendererFromCanvas();

        expect(renderer.pixelRatio).toBe(2);
    });

    it("builds the globe once and reuses it", async () => {
        mount();
        await showGlobe();
        const first = globeFromScene().canvas;

        click("ground-track-style-2d");
        click("ground-track-style-3d");

        expect(globeFromScene().canvas).toBe(first);
    });

    it("goes back to the map on the two-dimensional button", async () => {
        mount();
        await showGlobe();

        click("ground-track-style-2d");

        const shadow = node("ground-track-map").shadowRoot;
        expect(shadow.querySelector(".ground-track-shadow-globe").hidden).toBe(true);
        expect(shadow.querySelector(".ground-track-shadow-map").hidden).toBe(false);
    });
});

/** The renderer instance is reachable through the canvas it created. */
function rendererFromCanvas() {
    const { canvas } = globeFromScene();
    return canvas.__ownerRenderer;
}

describe("the globe scene graph", () => {
    it("paints the Earth sphere with the loaded texture", async () => {
        mount();
        await showGlobe();

        const earth = findMesh("SphereGeometry", 1.0);
        expect(earth).toBeTruthy();
        expect(earth.material.map).toBeInstanceOf(THREE.Texture);
        expect(earth.material.map.colorSpace).toBe(THREE.SRGBColorSpace);
    });

    it("draws the track and the generated continuation as separate lines", async () => {
        mount();
        await showGlobe(SOURCE_END_MS + 60_000);

        const lines = collectLines();
        expect(lines.length).toBeGreaterThanOrEqual(2);
        const colors = lines.map((line) => line.material.color.getHex());
        expect(colors).toContain(0x4ec3ff);
        expect(colors).toContain(0xffb347);
    });

    it("lifts the track just off the surface", async () => {
        mount();
        await showGlobe();

        const line = collectLines()[0];
        const positions = line.geometry.getAttribute("position");
        const radius = Math.hypot(positions.getX(0), positions.getY(0), positions.getZ(0));
        expect(radius).toBeCloseTo(1.014, 6);
    });

    it("places the marker above the current ground point", async () => {
        mount();
        await showGlobe();

        const marker = findMarker();
        expect(marker.visible).toBe(true);
        expect(marker.position.length()).toBeCloseTo(1.035, 6);
    });

    it("hides the marker when there is no current ground point", async () => {
        mount();
        await showGlobe(WINDOW_START_MS - 60_000);

        expect(findMarker().visible).toBe(false);
    });

    it("turns the globe so the focus point faces the camera", async () => {
        mount();
        await showGlobe();

        const root = globeRoot();
        expect(root.quaternion.equals(new THREE.Quaternion())).toBe(false);
    });

    it("clears the old track lines before drawing the new ones", async () => {
        mount();
        await showGlobe();
        const before = collectLines().length;

        actions.update({ sceneState: sceneState(), config: "geo", animTime: MID_WINDOW_MS + 300_000 });
        await settle();

        expect(collectLines().length).toBe(before);
    });
});

describe("globe zoom", () => {
    it("pulls the camera in and pushes it out within the allowed range", async () => {
        mount();
        await showGlobe();
        const camera = globeCamera();
        const start = camera.position.length();

        click("ground-track-zoom-in");
        const zoomedIn = camera.position.length();
        expect(zoomedIn).toBeLessThan(start);
        expect(zoomedIn).toBeGreaterThanOrEqual(1.9);

        click("ground-track-zoom-out");
        expect(camera.position.length()).toBeGreaterThan(zoomedIn);
    });

    it("clamps the camera to the far limit however often it is pushed out", async () => {
        mount();
        await showGlobe();
        const camera = globeCamera();

        for (let index = 0; index < 20; index += 1) click("ground-track-zoom-out");

        expect(camera.position.length()).toBeCloseTo(5.2, 6);
    });

    it("clamps the camera to the near limit however often it is pulled in", async () => {
        mount();
        await showGlobe();
        const camera = globeCamera();

        for (let index = 0; index < 20; index += 1) click("ground-track-zoom-in");

        expect(camera.position.length()).toBeCloseTo(1.9, 6);
    });
});

describe("globe resizing", () => {
    it("re-aspects the camera when the panel is resized", async () => {
        mount();
        await showGlobe();
        const camera = globeCamera();
        const renderer = rendererFromCanvas();
        const before = renderer.setSizeCalls.length;
        globeFromScene().host.clientWidth = 800;
        globeFromScene().host.clientHeight = 400;

        FakeResizeObserver.instances.forEach((observer) => observer.trigger());

        expect(renderer.setSizeCalls.length).toBeGreaterThan(before);
        expect(renderer.setSizeCalls[renderer.setSizeCalls.length - 1]).toEqual([800, 400]);
        expect(camera.aspect).toBeCloseTo(2, 9);
    });

    it("never collapses the globe to a zero-sized viewport", async () => {
        mount();
        await showGlobe();
        const renderer = rendererFromCanvas();

        globeFromScene().host.clientWidth = 0;
        globeFromScene().host.clientHeight = 0;
        FakeResizeObserver.instances.forEach((observer) => observer.trigger());

        const [width, height] = renderer.setSizeCalls[renderer.setSizeCalls.length - 1];
        expect(width).toBeGreaterThanOrEqual(2);
        expect(height).toBeGreaterThanOrEqual(2);
    });
});

// --- scene-graph lookups -------------------------------------------------

function globeSceneRoot() {
    const renderer = rendererFromCanvas();
    return renderer.__lastScene;
}

function globeRoot() {
    return globeSceneRoot().children.find((child) => child.type === "Group");
}

function globeCamera() {
    return rendererFromCanvas().__lastCamera;
}

function collectLines() {
    const lines = [];
    globeRoot().traverse((node2) => {
        if (node2.isLine) lines.push(node2);
    });
    return lines;
}

function findMesh(geometryType, radius) {
    let found = null;
    globeRoot().traverse((node2) => {
        if (found) return;
        if (node2.isMesh && node2.geometry?.type === geometryType && node2.geometry.parameters.radius === radius) {
            found = node2;
        }
    });
    return found;
}

function findMarker() {
    return findMesh("SphereGeometry", 0.034);
}
