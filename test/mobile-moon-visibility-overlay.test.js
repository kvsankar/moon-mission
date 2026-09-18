import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as THREE from "three";

import { installFakeDom } from "./helpers/fake-dom.js";
import { createMobileMoonVisibilitySync } from "../src/platform/js/ui/mobile-moon-visibility-sync.js";

const SCENE_STATE = {
    bodies: {
        EARTH: { position: { x: 10, y: 0, z: 0 } },
        MOON: { position: { x: 0, y: 0, z: 0 } },
        SC: { position: { x: 6, y: 0, z: 0 } },
    },
    sunDirection: { x: 0, y: 1, z: 0 },
};

let dom = null;

beforeEach(() => {
    dom = installFakeDom();
});

afterEach(() => {
    dom?.restore();
    dom = null;
});

function makeMoonMesh() {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1737), new THREE.MeshBasicMaterial());
    mesh.renderOrder = 4;
    return mesh;
}

function createHarness({
    withSummaryElements = true,
    withToggle = true,
    withCanvas = true,
    sceneOverrides = {},
    isThreeD = true,
    farSideEnabled = false,
    resolveSceneObject = () => null,
    injectThree = true,
} = {}) {
    const state = {
        activeTab: "views",
        activeViewPresetId: "moon",
        isMobile: true,
        isThreeD,
        nowMs: 1000,
    };

    const moonMesh = makeMoonMesh();
    const scene = {
        primaryBody: "MOON",
        camera: new THREE.PerspectiveCamera(),
        moon: moonMesh,
        latestSceneState: SCENE_STATE,
        ...(injectThree ? { THREE } : {}),
        ...sceneOverrides,
    };

    const panel = { hidden: true };
    const summary = { textContent: "" };
    const head = { hidden: true };
    const values = { innerHTML: "" };
    const toggle = withToggle ? dom.document.createElement("button") : null;
    const canvas = withCanvas ? dom.document.createElement("canvas") : null;

    const frames = [];
    let renderRequests = 0;
    let loopFrames = 0;

    const windowRef = {
        innerWidth: 390,
        innerHeight: 844,
        animationScenes: { moon: scene },
        requestAnimationFrame(callback) {
            frames.push({ id: frames.length + 1, callback });
            return frames.length;
        },
        cancelAnimationFrame(id) {
            const index = frames.findIndex((entry) => entry.id === id);
            if (index >= 0) frames.splice(index, 1);
        },
    };

    const sync = createMobileMoonVisibilitySync({
        mobileViewsMoonVisibility: panel,
        mobileViewsMoonVisibilitySummary: summary,
        mobileViewsMoonVisibilityHead: withSummaryElements ? head : null,
        mobileViewsMoonVisibilityValues: withSummaryElements ? values : null,
        mobileViewsFarSideToggle: toggle,
        mobileMoonFarSideOverlay: canvas,
        resolveActiveScene: () => scene,
        resolveSceneObject,
        isMobileViewport: () => state.isMobile,
        getActiveTab: () => state.activeTab,
        getActiveViewPresetId: () => state.activeViewPresetId,
        getIsThreeD: () => state.isThreeD,
        onLoopFrame: () => { loopFrames += 1; },
        requestSceneRender: () => { renderRequests += 1; },
        windowRef,
        performanceRef: { now: () => state.nowMs },
        initialFarSideOverlayEnabled: farSideEnabled,
    });

    return {
        state, scene, moonMesh, sync, panel, summary, head, values, toggle, canvas, frames,
        advance(ms = 500) { state.nowMs += ms; },
        flushFrame() {
            const next = frames.shift();
            if (!next) return false;
            next.callback();
            return true;
        },
        get renderRequests() { return renderRequests; },
        get loopFrames() { return loopFrames; },
    };
}

describe("update throttling", () => {
    it("skips an unforced update inside the refresh interval", () => {
        const harness = createHarness();

        expect(harness.sync.sync({ force: true })).toBe(true);
        expect(harness.sync.sync()).toBe(false);

        harness.advance(200);
        expect(harness.sync.sync()).toBe(true);
    });

    it("falls back to the wall clock when no performance clock is injected", () => {
        const harness = createHarness();
        // The default harness injects one; this checks the branch that does not.
        const bare = createMobileMoonVisibilitySync({
            mobileViewsMoonVisibility: harness.panel,
            mobileViewsMoonVisibilitySummary: harness.summary,
            mobileViewsMoonVisibilityHead: harness.head,
            mobileViewsMoonVisibilityValues: harness.values,
            resolveActiveScene: () => harness.scene,
            resolveSceneObject: () => null,
            isMobileViewport: () => true,
            getActiveTab: () => "views",
            getActiveViewPresetId: () => "moon",
            performanceRef: null,
        });

        expect(bare.sync({ force: true })).toBe(true);
    });
});

describe("the summary readout", () => {
    it("writes the four day and night percentages once", () => {
        const harness = createHarness();

        harness.sync.sync({ force: true });

        expect(harness.panel.hidden).toBe(false);
        expect(harness.head.hidden).toBe(false);
        expect(harness.values.innerHTML.match(/<span>/g)).toHaveLength(4);
    });

    it("leaves the markup alone while the numbers are unchanged", () => {
        // Rewriting innerHTML every animation frame is what this signature check
        // exists to avoid.
        const harness = createHarness();
        harness.sync.sync({ force: true });
        harness.values.innerHTML = "SENTINEL";

        harness.advance(500);
        harness.sync.sync({ force: true });

        expect(harness.values.innerHTML).toBe("SENTINEL");
    });

    it("rewrites the markup after the panel has been hidden and shown again", () => {
        const harness = createHarness();
        harness.sync.sync({ force: true });
        harness.values.innerHTML = "SENTINEL";

        harness.state.activeViewPresetId = "earth";
        harness.advance(500);
        harness.sync.sync({ force: true });
        harness.state.activeViewPresetId = "moon";
        harness.advance(500);
        harness.sync.sync({ force: true });

        expect(harness.values.innerHTML).not.toBe("SENTINEL");
        expect(harness.panel.hidden).toBe(false);
    });

    it("reports placeholders when the scene has no state to measure", () => {
        const harness = createHarness({ sceneOverrides: { latestSceneState: null } });

        expect(harness.sync.sync({ force: true })).toBe(false);
        expect(harness.head.hidden).toBe(true);
        expect(harness.values.innerHTML).toBe("<span>--%</span><span>--%</span><span>--%</span><span>--%</span>");
    });

    it("falls back to a sentence when the split readout elements are absent", () => {
        const harness = createHarness({ withSummaryElements: false });

        harness.sync.sync({ force: true });

        expect(harness.summary.textContent).toMatch(/% near \(.*day; .*night\) .*% far/);
    });

    it("says so in the sentence fallback when nothing can be measured", () => {
        const harness = createHarness({
            withSummaryElements: false,
            sceneOverrides: { latestSceneState: null },
        });

        harness.sync.sync({ force: true });

        expect(harness.summary.textContent).toBe("Visible lunar surface: unavailable");
    });

    it("hides the panel entirely off the mobile moon view", () => {
        const harness = createHarness();
        harness.sync.sync({ force: true });

        harness.state.isMobile = false;
        expect(harness.sync.sync({ force: true })).toBe(false);
        expect(harness.panel.hidden).toBe(true);
    });
});

describe("the far-side toggle", () => {
    it("labels itself and announces its pressed state", () => {
        const harness = createHarness();

        harness.sync.sync({ force: true });
        expect(harness.toggle.textContent).toBe("Far Side: OFF");
        expect(harness.toggle.getAttribute("aria-pressed")).toBe("false");
        expect(harness.toggle.classList.contains("is-active")).toBe(false);

        harness.sync.setFarSideOverlayEnabled(true);
        expect(harness.toggle.textContent).toBe("Far Side: ON");
        expect(harness.toggle.getAttribute("aria-pressed")).toBe("true");
        expect(harness.toggle.classList.contains("is-active")).toBe(true);
    });

    it("coerces the enabled flag to a boolean", () => {
        const harness = createHarness();

        harness.sync.setFarSideOverlayEnabled("on");

        expect(harness.sync.isFarSideOverlayEnabled()).toBe(true);
    });

    it("re-syncs on this frame and the next when clicked", () => {
        const harness = createHarness();
        harness.sync.bind();

        harness.toggle.click();

        expect(harness.sync.isFarSideOverlayEnabled()).toBe(true);
        expect(harness.renderRequests).toBe(1);
        harness.flushFrame();
        expect(harness.renderRequests).toBe(2);
    });

    it("binds nothing when the toggle is not mounted", () => {
        const harness = createHarness({ withToggle: false });

        expect(() => harness.sync.bind()).not.toThrow();
        expect(() => harness.sync.setFarSideOverlayEnabled(true)).not.toThrow();
    });
});

describe("the far-side overlay mesh", () => {
    function enabled(options = {}) {
        const harness = createHarness({ farSideEnabled: true, ...options });
        harness.sync.sync({ force: true });
        return harness;
    }

    it("attaches one overlay shell to the moon mesh and aims it at Earth", () => {
        const harness = enabled();
        const overlay = harness.scene.mobileMoonFarSideOverlayMesh;

        expect(overlay.mesh.name).toBe("mobile-moon-far-side-overlay");
        expect(overlay.mesh.parent).toBe(harness.moonMesh);
        expect(overlay.mesh.geometry).toBe(harness.moonMesh.geometry);
        expect(overlay.mesh.renderOrder).toBe(5);
        expect(overlay.mesh.frustumCulled).toBe(false);
        expect(overlay.mesh.scale.x).toBeCloseTo(1.0015, 6);
        expect(overlay.mesh.visible).toBe(true);
        expect(overlay.material.uniforms.uEarthDirWorld.value.toArray()).toEqual([1, 0, 0]);
        expect(overlay.material.uniforms.uSunDirWorld.value.toArray()).toEqual([0, 1, 0]);
        expect(harness.canvas.classList.contains("is-active")).toBe(true);
    });

    it("reuses the shell it already built", () => {
        const harness = enabled();
        const first = harness.scene.mobileMoonFarSideOverlayMesh;

        harness.advance(500);
        harness.sync.sync({ force: true });

        expect(harness.scene.mobileMoonFarSideOverlayMesh).toBe(first);
        expect(harness.moonMesh.children).toHaveLength(1);
    });

    it("finds the moon mesh nested inside a container", () => {
        const container = new THREE.Group();
        const nested = makeMoonMesh();
        container.add(nested);
        const harness = enabled({ sceneOverrides: { moon: null, moonContainer: container } });

        expect(harness.scene.mobileMoonFarSideOverlayMesh.mesh.parent).toBe(nested);
    });

    it("accepts a container that is itself the mesh", () => {
        const mesh = makeMoonMesh();
        const harness = enabled({ sceneOverrides: { moon: null, moonContainer: mesh } });

        expect(harness.scene.mobileMoonFarSideOverlayMesh.mesh.parent).toBe(mesh);
    });

    it("stays down when there is no moon geometry to wrap", () => {
        const harness = enabled({ sceneOverrides: { moon: null, moonContainer: null } });

        expect(harness.scene.mobileMoonFarSideOverlayMesh).toBeUndefined();
        expect(harness.canvas.classList.contains("is-active")).toBe(false);
    });

    it("stays down when the scene exposes no three.js binding", () => {
        const harness = enabled({ injectThree: false });

        expect(harness.scene.mobileMoonFarSideOverlayMesh).toBeUndefined();
        expect(harness.canvas.classList.contains("is-active")).toBe(false);
    });

    it("prefers the live scene objects over the state snapshot", () => {
        const earth = new THREE.Object3D();
        earth.position.set(0, 0, 500);
        earth.updateMatrixWorld(true);
        const moon = new THREE.Object3D();
        moon.updateMatrixWorld(true);
        const harness = enabled({ resolveSceneObject: (_scene, name) => (name === "earth" ? earth : moon) });

        const dir = harness.scene.mobileMoonFarSideOverlayMesh.material.uniforms.uEarthDirWorld.value;
        expect(dir.toArray().map((v) => Math.round(v))).toEqual([0, 0, 1]);
    });

    it("stays down when Earth and the Moon sit on top of each other", () => {
        const coincident = new THREE.Object3D();
        coincident.updateMatrixWorld(true);
        const harness = enabled({ resolveSceneObject: () => coincident });

        expect(harness.scene.mobileMoonFarSideOverlayMesh).toBeUndefined();
        expect(harness.canvas.classList.contains("is-active")).toBe(false);
    });

    it("prefers a moon-centered sun direction when the scene publishes one", () => {
        const harness = enabled({
            sceneOverrides: { stateSunDirections: { moonCentered: { x: 0, y: 0, z: 2 } } },
        });

        const sun = harness.scene.mobileMoonFarSideOverlayMesh.material.uniforms.uSunDirWorld.value;
        expect(sun.toArray()).toEqual([0, 0, 1]);
    });

    it("stays down without a usable sun direction", () => {
        const harness = enabled({
            sceneOverrides: { latestSceneState: { ...SCENE_STATE, sunDirection: null } },
        });

        expect(harness.scene.mobileMoonFarSideOverlayMesh).toBeUndefined();
        expect(harness.canvas.classList.contains("is-active")).toBe(false);
    });

    it("stays down without a camera", () => {
        const harness = enabled({ sceneOverrides: { camera: null } });

        expect(harness.scene.mobileMoonFarSideOverlayMesh).toBeUndefined();
    });

    it("stays down in the two-dimensional views", () => {
        const harness = enabled({ isThreeD: false });

        expect(harness.scene.mobileMoonFarSideOverlayMesh).toBeUndefined();
        expect(harness.canvas.classList.contains("is-active")).toBe(false);
    });

    it("comes down again when the toggle is switched off", () => {
        const harness = enabled();
        expect(harness.scene.mobileMoonFarSideOverlayMesh.mesh.visible).toBe(true);

        harness.sync.setFarSideOverlayEnabled(false);

        expect(harness.scene.mobileMoonFarSideOverlayMesh.mesh.visible).toBe(false);
        expect(harness.canvas.classList.contains("is-active")).toBe(false);
    });

    it("comes down when the panel is hidden", () => {
        const harness = enabled();

        harness.state.activeTab = "mission";
        harness.advance(500);
        harness.sync.sync({ force: true });

        expect(harness.scene.mobileMoonFarSideOverlayMesh.mesh.visible).toBe(false);
    });
});

describe("the overlay canvas", () => {
    it("sizes itself to the viewport and clears when deactivated", () => {
        const harness = createHarness({ farSideEnabled: true });
        harness.sync.sync({ force: true });

        harness.sync.setFarSideOverlayEnabled(false);

        expect(harness.canvas.width).toBe(390);
        expect(harness.canvas.height).toBe(844);
        expect(harness.canvas.style.width).toBe("390px");
        expect(harness.canvas.style.height).toBe("844px");
        const context = harness.canvas.getContext("2d");
        expect(context.calls.some(([name]) => name === "clearRect")).toBe(true);
    });

    it("works without an overlay canvas at all", () => {
        const harness = createHarness({ withCanvas: false, farSideEnabled: true });

        expect(() => harness.sync.sync({ force: true })).not.toThrow();
        expect(harness.scene.mobileMoonFarSideOverlayMesh.mesh.visible).toBe(true);
    });
});

describe("the animation loop", () => {
    it("reports that it was already running", () => {
        const harness = createHarness();

        expect(harness.sync.startLoop()).toBe(true);
        expect(harness.sync.startLoop()).toBe(false);
    });

    it("stops on request and takes the overlay down with it", () => {
        const harness = createHarness({ farSideEnabled: true });
        harness.sync.sync({ force: true });
        harness.sync.startLoop();

        expect(harness.sync.stopLoop()).toBe(true);
        expect(harness.frames).toHaveLength(0);
        expect(harness.scene.mobileMoonFarSideOverlayMesh.mesh.visible).toBe(false);
        expect(harness.canvas.classList.contains("is-active")).toBe(false);
        expect(harness.sync.stopLoop()).toBe(false);
    });

    it("refuses to start away from the mobile views tab", () => {
        const harness = createHarness();
        harness.state.activeTab = "mission";

        expect(harness.sync.startLoop()).toBe(false);
    });

    it("keeps rescheduling itself while the tab stays active", () => {
        const harness = createHarness();
        harness.sync.startLoop();

        harness.advance(500);
        harness.flushFrame();
        harness.advance(500);
        harness.flushFrame();

        expect(harness.loopFrames).toBe(2);
        expect(harness.frames).toHaveLength(1);
    });

    it("tolerates a host with no animation frame scheduler", () => {
        const harness = createHarness();
        const bare = createMobileMoonVisibilitySync({
            mobileViewsMoonVisibility: harness.panel,
            resolveActiveScene: () => harness.scene,
            isMobileViewport: () => true,
            getActiveTab: () => "views",
            windowRef: {},
        });

        expect(bare.startLoop()).toBe(false);
        expect(bare.stopLoop()).toBe(false);
    });
});
