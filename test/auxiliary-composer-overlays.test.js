import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

import { FakeResizeObserver, installFakeDom } from "./helpers/fake-dom.js";
import { AuxiliaryCameraViewsManager } from "../src/platform/js/app/auxiliary-camera-views.js";

let dom = null;
let manager = null;

class FakeWebGLRenderer {
    constructor(options) {
        this.options = options;
        this.domElement = globalThis.document.createElement("canvas");
        this.shadowMap = { enabled: false, type: null };
        this.capabilities = {
            isWebGL2: true,
            maxTextureSize: 4096,
            getMaxAnisotropy: () => 4,
        };
        this.outputColorSpace = null;
        this.toneMapping = null;
        this.toneMappingExposure = 1;
        this.setPixelRatio = vi.fn();
        this.setSize = vi.fn();
        this.setViewport = vi.fn();
        this.setScissorTest = vi.fn();
        this.clear = vi.fn();
        this.render = vi.fn();
        this.dispose = vi.fn();
        this.getContext = () => ({ getExtension: () => null, getParameter: () => 0 });
    }
}

const fakeThree = { ...THREE, WebGLRenderer: FakeWebGLRenderer };

function composerPanel() {
    return manager.panels.find((panelState) => panelState.mode === "composer");
}

/** Give a panel a usable overlay surface and camera for overlay rendering. */
function prepareOverlay(panelState, { width = 640, height = 360, fov = 50 } = {}) {
    panelState.overlayCanvas.width = width;
    panelState.overlayCanvas.height = height;
    panelState.viewport.setBoundingClientRect({ width, height });
    if (panelState.camera?.isPerspectiveCamera) {
        panelState.camera.fov = fov;
        panelState.camera.aspect = width / height;
        panelState.camera.position.set(0, -1000, 0);
        panelState.camera.up.set(0, 0, 1);
        panelState.camera.lookAt(new THREE.Vector3());
        panelState.camera.updateMatrixWorld(true);
        panelState.camera.updateProjectionMatrix();
    }
    panelState.overlayCtx.calls.length = 0;
    return panelState;
}

beforeEach(() => {
    FakeResizeObserver.instances = [];
    dom = installFakeDom([], {
        innerWidth: 1600,
        innerHeight: 900,
        ResizeObserver: FakeResizeObserver,
        requestAnimationFrame: () => 1,
        cancelAnimationFrame: () => {},
        performance: { now: () => 1000 },
    });
    manager = new AuxiliaryCameraViewsManager({
        THREE: fakeThree,
        overlayHost: dom.document.body,
        requestRender: vi.fn(),
    });
});

afterEach(() => {
    manager?.dispose();
    manager = null;
    dom?.restore();
    dom = null;
});

describe("solar eclipse detection", () => {
    const craftWorld = new THREE.Vector3(0, 0, 0);

    beforeEach(() => {
        manager.sunDirectionCraftWorld.set(1, 0, 0);
    });

    it("reports no eclipse without a usable craft position", () => {
        expect(manager.resolveComposerSolarEclipseState({ craftWorld: null }))
            .toEqual({ active: false, occluder: null, coverage: 0 });
    });

    it("reports no eclipse without a Sun direction", () => {
        manager.sunDirectionCraftWorld.set(0, 0, 0);

        expect(manager.resolveComposerSolarEclipseState({ craftWorld }).active).toBe(false);
    });

    it("reports no eclipse when no body lies toward the Sun", () => {
        const state = manager.resolveComposerSolarEclipseState({
            craftWorld,
            moonWorld: new THREE.Vector3(-1000, 0, 0),
            moonRadius: 100,
        });

        expect(state.active).toBe(false);
        expect(state.coverage).toBe(0);
    });

    it("reports a total eclipse when a large body covers the Sun", () => {
        const state = manager.resolveComposerSolarEclipseState({
            craftWorld,
            moonWorld: new THREE.Vector3(1000, 0, 0),
            moonRadius: 100,
        });

        expect(state.active).toBe(true);
        expect(state.occluder).toBe("moon");
        expect(state.coverage).toBe(1);
    });

    it("reports partial coverage as the body slides off the Sun", () => {
        const state = manager.resolveComposerSolarEclipseState({
            craftWorld,
            moonWorld: new THREE.Vector3(1000, 8.5, 0),
            moonRadius: 5,
        });

        expect(state.coverage).toBeGreaterThan(0);
        expect(state.coverage).toBeLessThan(1);
    });

    it("ignores a body the craft is already inside", () => {
        const state = manager.resolveComposerSolarEclipseState({
            craftWorld,
            moonWorld: new THREE.Vector3(10, 0, 0),
            moonRadius: 100,
        });

        expect(state.active).toBe(false);
    });

    it("picks the body with the greater coverage", () => {
        const state = manager.resolveComposerSolarEclipseState({
            craftWorld,
            moonWorld: new THREE.Vector3(1000, 20, 0),
            moonRadius: 5,
            earthWorld: new THREE.Vector3(1000, 0, 0),
            earthRadius: 100,
        });

        expect(state.occluder).toBe("earth");
    });

    it("ignores a body with no usable radius", () => {
        const state = manager.resolveComposerSolarEclipseState({
            craftWorld,
            moonWorld: new THREE.Vector3(1000, 0, 0),
            moonRadius: 0,
        });

        expect(state.occluder).toBeNull();
    });
});

describe("Sun optics profile", () => {
    let panelState = null;

    beforeEach(() => {
        panelState = composerPanel();
    });

    it("keeps the camera look as the default profile", () => {
        const profile = manager.resolveComposerSunOpticsProfile(panelState, { eclipseActive: false });

        expect(profile.sunVisualState).toBeTruthy();
        expect(profile.exposure).toBeGreaterThan(0);
    });

    it("uses a physical exposure when the physical profile is selected", () => {
        panelState.composerSunProfile = "physical";

        const physical = manager.resolveComposerSunOpticsProfile(panelState, { eclipseActive: false });
        panelState.composerSunProfile = "camera";
        const camera = manager.resolveComposerSunOpticsProfile(panelState, { eclipseActive: false });

        expect(physical.exposure).not.toBe(camera.exposure);
        expect(physical.sunVisualState.coronaMotionMul).toBe(0);
    });

    it("switches to the corona presentation during an eclipse", () => {
        const normal = manager.resolveComposerSunOpticsProfile(panelState, { eclipseActive: false });
        const eclipsed = manager.resolveComposerSunOpticsProfile(panelState, { eclipseActive: true });

        expect(eclipsed.sunVisualState.coronaOpacity)
            .toBeGreaterThan(normal.sunVisualState.coronaOpacity);
    });

    it("reads the eclipse flag from the panel by default", () => {
        panelState.composerSolarEclipseActive = true;

        expect(manager.resolveComposerSunOpticsProfile(panelState).sunVisualState.coronaOpacity)
            .toBeGreaterThan(0);
    });

    it("brightens the corona with the configured intensity", () => {
        panelState.composerEclipseCoronaIntensity = 0.1;
        const dim = manager.resolveComposerEclipseCoronaVisualState(panelState);
        panelState.composerEclipseCoronaIntensity = 10;
        const bright = manager.resolveComposerEclipseCoronaVisualState(panelState);

        expect(bright.coronaOpacity).toBeGreaterThanOrEqual(dim.coronaOpacity);
    });

    it("scales the sun glare with the optics strength", () => {
        panelState.composerSunProfile = "camera";
        panelState.composerSunStrength = 0;
        const soft = manager.resolveComposerSunOpticsProfile(panelState, { eclipseActive: false });
        panelState.composerSunStrength = 100;
        const strong = manager.resolveComposerSunOpticsProfile(panelState, { eclipseActive: false });

        expect(strong.sunVisualState.haloOpacity)
            .toBeGreaterThanOrEqual(soft.sunVisualState.haloOpacity);
    });
});

describe("exposure state", () => {
    let panelState = null;

    beforeEach(() => {
        panelState = composerPanel();
    });

    it("reports a manual exposure and its linear multiplier", () => {
        panelState.composerAutoExposureEnabled = false;
        panelState.composerExposureEv = 1;

        const state = manager.resolveComposerExposureState(panelState, { eclipseActive: false });

        expect(state.manualEv).toBe(1);
        expect(state.autoEv).toBe(0);
        expect(state.multiplier).toBeCloseTo(2, 9);
    });

    it("clamps an out-of-range exposure compensation", () => {
        panelState.composerExposureEv = 1000;
        const high = manager.resolveComposerExposureState(panelState, { eclipseActive: false });
        panelState.composerExposureEv = -1000;
        const low = manager.resolveComposerExposureState(panelState, { eclipseActive: false });

        expect(high.manualEv).toBeLessThan(1000);
        expect(low.manualEv).toBeGreaterThan(-1000);
    });

    it("adds automatic compensation during an eligible eclipse", () => {
        panelState.composerAutoExposureEnabled = true;
        panelState.composerExposureEv = 0;

        const eclipsed = manager.resolveComposerExposureState(panelState, { eclipseActive: true });

        expect(eclipsed.autoEv).not.toBe(0);
        expect(eclipsed.multiplier).not.toBe(1);
    });

    it("skips automatic compensation when the panel opted out", () => {
        panelState.composerAutoExposureEnabled = false;

        expect(manager.resolveComposerExposureState(panelState, { eclipseActive: true }).autoEv)
            .toBe(0);
    });

    it("reports whether the occluding disc is inside the frame", () => {
        const panel = prepareOverlay(panelState, { fov: 50 });

        expect(manager.resolveComposerBodyDiscInView(panel, {
            bodyWorld: new THREE.Vector3(0, 0, 0),
            bodyRadius: 100,
        })).toBe(true);

        expect(manager.resolveComposerBodyDiscInView(panel, {
            bodyWorld: new THREE.Vector3(0, 100000, 0),
            bodyRadius: 1,
        })).toBe(false);
    });

    it("reports nothing measurable without a body", () => {
        const panel = prepareOverlay(panelState);

        expect(manager.resolveComposerBodyDiscInView(panel, {})).toBe(false);
        expect(manager.resolveComposerBodyDiscInView(panel, {
            bodyWorld: new THREE.Vector3(),
            bodyRadius: -1,
        })).toBe(false);
    });

    it("only auto-exposes for an eclipse whose occluder is in frame", () => {
        const panel = prepareOverlay(panelState, { fov: 50 });

        expect(manager.shouldApplyComposerEclipseAutoExposure(panel, {
            eclipseState: { active: false, occluder: "moon" },
        })).toBe(false);

        expect(manager.shouldApplyComposerEclipseAutoExposure(panel, {
            eclipseState: { active: true, occluder: "moon" },
            moonWorld: new THREE.Vector3(0, 0, 0),
            moonRadius: 100,
        })).toBe(true);

        expect(manager.shouldApplyComposerEclipseAutoExposure(panel, {
            eclipseState: { active: true, occluder: "earth" },
            earthWorld: new THREE.Vector3(0, 0, 0),
            earthRadius: 100,
        })).toBe(true);
    });
});

describe("RA/Dec grid overlay", () => {
    let panelState = null;

    beforeEach(() => {
        panelState = prepareOverlay(composerPanel());
    });

    it("draws nothing while the grid is switched off", () => {
        panelState.composerRaDecGridEnabled = false;

        manager.renderComposerRaDecGridOverlay(panelState);

        expect(panelState.overlayCtx.calls).toHaveLength(0);
    });

    it("draws nothing on a degenerate canvas", () => {
        panelState.composerRaDecGridEnabled = true;
        panelState.overlayCanvas.width = 1;
        panelState.overlayCanvas.height = 1;

        manager.renderComposerRaDecGridOverlay(panelState);

        expect(panelState.overlayCtx.calls).toHaveLength(0);
    });

    it("draws the grid when it is switched on", () => {
        panelState.composerRaDecGridEnabled = true;

        manager.renderComposerRaDecGridOverlay(panelState);

        expect(panelState.overlayCtx.calls.length).toBeGreaterThan(0);
        expect(panelState.overlayCtx.calls.some(([name]) => name === "stroke")).toBe(true);
    });

    it("draws a denser grid at a narrow field of view", () => {
        panelState.composerRaDecGridEnabled = true;
        manager.renderComposerRaDecGridOverlay(panelState);
        const wideCalls = panelState.overlayCtx.calls.length;

        prepareOverlay(panelState, { fov: 6 });
        manager.renderComposerRaDecGridOverlay(panelState);

        expect(panelState.overlayCtx.calls.length).toBeGreaterThan(0);
        expect(wideCalls).toBeGreaterThan(0);
    });

    it("labels the grid lines", () => {
        panelState.composerRaDecGridEnabled = true;

        manager.renderComposerRaDecGridOverlay(panelState);

        expect(panelState.overlayCtx.calls.some(([name]) => name === "fillText")).toBe(true);
    });
});

describe("composer body overlays", () => {
    let panelState = null;

    beforeEach(() => {
        panelState = prepareOverlay(composerPanel());
    });

    it("draws the Moon outline only when it is switched on", () => {
        panelState.composerMoonOutlineEnabled = false;
        manager.renderComposerMoonOutlineOverlay(panelState, {
            moonWorld: new THREE.Vector3(0, 0, 0),
            moonRadius: 100,
        });
        expect(panelState.overlayCtx.calls).toHaveLength(0);

        panelState.composerMoonOutlineEnabled = true;
        manager.renderComposerMoonOutlineOverlay(panelState, {
            moonWorld: new THREE.Vector3(0, 0, 0),
            moonRadius: 100,
        });
        expect(panelState.overlayCtx.calls.length).toBeGreaterThan(0);
    });

    it("skips the Moon outline without a usable Moon", () => {
        panelState.composerMoonOutlineEnabled = true;

        manager.renderComposerMoonOutlineOverlay(panelState, { moonWorld: null, moonRadius: 100 });
        manager.renderComposerMoonOutlineOverlay(panelState, {
            moonWorld: new THREE.Vector3(),
            moonRadius: 0,
        });

        expect(panelState.overlayCtx.calls).toHaveLength(0);
    });

    it("draws see-through markers only when they are switched on", () => {
        panelState.composerSeeThroughEnabled = false;
        manager.renderComposerSeeThroughOverlay(panelState, {
            earthWorld: new THREE.Vector3(0, 0, 0),
            earthRadius: 6,
            moonWorld: new THREE.Vector3(400, 0, 0),
            moonRadius: 1.7,
        });

        expect(panelState.overlayCtx.calls).toHaveLength(0);
    });

    it("draws sky labels only when a label layer is switched on", () => {
        panelState.composerSkyLabelsEnabled = false;
        panelState.composerConstellationLabelsEnabled = false;

        manager.renderComposerSkyLabelOverlay(panelState, {});

        expect(panelState.overlayCtx.calls).toHaveLength(0);
    });

    it("runs the sky label pass without a mounted sky", () => {
        panelState.composerSkyLabelsEnabled = true;
        panelState.composerConstellationLabelsEnabled = true;

        expect(() => manager.renderComposerSkyLabelOverlay(panelState, {
            earthWorld: new THREE.Vector3(0, 0, 0),
            earthRadius: 6,
            moonWorld: new THREE.Vector3(400, 0, 0),
            moonRadius: 1.7,
        })).not.toThrow();
    });

    it("clears the overlay surface on request", () => {
        panelState.composerRaDecGridEnabled = true;
        manager.renderComposerRaDecGridOverlay(panelState);

        manager.clearPanelOverlay(panelState);

        expect(panelState.overlayCtx.calls.some(([name]) => name === "clearRect")).toBe(true);
    });

    it("draws the far-side marker for a Moon view panel", () => {
        const moonPanel = prepareOverlay(
            manager.panels.find((entry) => entry.id === "moon"),
        );

        manager.renderMoonFarSideOverlay(moonPanel, {
            distanceToTarget: 5000,
            targetRadius: 1737,
            earthDirectionWorld: new THREE.Vector3(1, 0, 0),
        });

        expect(moonPanel.overlayCtx.calls.length).toBeGreaterThan(0);
    });

    it("throttles far-side redraws between frames", () => {
        const moonPanel = prepareOverlay(
            manager.panels.find((entry) => entry.id === "moon"),
        );
        const input = {
            distanceToTarget: 5000,
            targetRadius: 1737,
            earthDirectionWorld: new THREE.Vector3(1, 0, 0),
        };
        manager.renderMoonFarSideOverlay(moonPanel, input);
        moonPanel.overlayCtx.calls.length = 0;

        manager.renderMoonFarSideOverlay(moonPanel, input);

        expect(moonPanel.overlayCtx.calls).toHaveLength(0);
    });
});

describe("composer metrics strip", () => {
    let panelState = null;

    beforeEach(() => {
        panelState = prepareOverlay(composerPanel());
    });

    it("hides the strip when the info overlay is switched off", () => {
        panelState.composerInfoOverlayEnabled = false;

        manager.renderComposerBottomMetricsOverlay(panelState, {
            craftWorld: new THREE.Vector3(),
            moonWorld: new THREE.Vector3(),
            earthWorld: new THREE.Vector3(),
        });

        expect(panelState.composerMetricsStrip.hidden).toBe(true);
    });

    it("reports placeholders when the bodies are unknown", () => {
        panelState.composerInfoOverlayEnabled = true;

        manager.renderComposerBottomMetricsOverlay(panelState, {});

        expect(panelState.composerMetricsStrip.hidden).toBe(false);
        expect(panelState.composerMetricFovHValue.textContent).toBe("--");
        expect(panelState.composerMetricDistanceMoonValue.textContent).toBe("--");
    });

    it("reports the field of view and range once the bodies are known", () => {
        panelState.composerInfoOverlayEnabled = true;

        manager.renderComposerBottomMetricsOverlay(panelState, {
            craftWorld: new THREE.Vector3(0, -1000, 0),
            moonWorld: new THREE.Vector3(0, 0, 0),
            earthWorld: new THREE.Vector3(0, -384400, 0),
            telemetry: { distanceMoon: 1000 },
        });

        expect(panelState.composerMetricFovVValue.textContent).toBe("50.0\u00b0");
        expect(panelState.composerMetricDistanceMoonValue.textContent).toContain("km");
        expect(panelState.composerMetricAngleValue.textContent).toBe("0.0\u00b0");
    });
});

describe("composer framing controls", () => {
    let panelState = null;

    beforeEach(() => {
        panelState = prepareOverlay(composerPanel());
    });

    it("reports the current look direction as a unit vector", () => {
        const direction = manager.getComposerLookDirection(panelState);

        expect(direction.length()).toBeCloseTo(1, 6);
    });

    it("keeps ecliptic north as the default reference up vector", () => {
        expect(manager.getComposerReferenceUpVector(panelState).toArray()).toEqual([0, 0, 1]);
    });

    it("derives a camera up vector perpendicular to the look direction", () => {
        const look = new THREE.Vector3(1, 0, 0);

        const up = manager.getComposerCameraUp(panelState, look);

        expect(Math.abs(up.dot(look))).toBeLessThan(1e-6);
        expect(up.length()).toBeCloseTo(1, 6);
    });

    it("keeps the roll readout in step with the stored roll", () => {
        panelState.composerRollRad = Math.PI / 2;

        manager.updateComposerRollUi(panelState);

        expect(panelState.composerRollValue.textContent).toContain("90");
    });

    it("sets an orientation from an explicit look and up pair", () => {
        manager.setComposerOrientationFromLookUp(
            panelState,
            new THREE.Vector3(1, 0, 0),
            new THREE.Vector3(0, 0, 1),
        );

        const look = manager.getComposerLookDirection(panelState);
        expect(look.length()).toBeCloseTo(1, 6);
    });

    it("points the camera along a requested direction", () => {
        manager.setComposerLookFromDirection(panelState, new THREE.Vector3(0, 1, 0));

        expect(manager.getComposerLookDirection(panelState).length()).toBeCloseTo(1, 6);
    });

    it("shows a transient hint on the panel", () => {
        vi.useFakeTimers();

        manager.showComposerHint(panelState, "Locked on the Moon", 100);
        expect(panelState.composerHint.textContent).toBe("Locked on the Moon");
        expect(panelState.composerHint.hidden).toBe(false);

        vi.advanceTimersByTime(200);
        expect(panelState.composerHint.hidden).toBe(true);

        vi.useRealTimers();
    });

    it("clamps a requested field of view into the panel's range", () => {
        manager.setPanelFov(panelState, 0.0001);
        const min = panelState.camera.fov;
        manager.setPanelFov(panelState, 500);

        expect(min).toBeGreaterThan(0);
        expect(panelState.camera.fov).toBeLessThan(180);
        expect(panelState.camera.fov).toBeGreaterThan(min);
    });

    it("auto-fits the orbit plane panel back to its default framing", () => {
        const orbitPanel = manager.panels.find((entry) => entry.mode === "orbit-xy");
        orbitPanel.orbitPanOffsetX = 120;
        orbitPanel.orbitPanOffsetY = -80;

        expect(manager.applyOrbitPlaneAutoFit(orbitPanel)).toBe(true);
        expect(orbitPanel.orbitPanOffsetX).toBe(0);
        expect(orbitPanel.orbitPanOffsetY).toBe(0);
    });

    it("refuses to auto-fit a non-orbit panel", () => {
        expect(manager.applyOrbitPlaneAutoFit(panelState)).toBe(false);
    });
});

describe("panel chrome", () => {
    it("writes the primary and secondary info lines", () => {
        const panelState = manager.panels.find((entry) => entry.id === "moon");

        manager.setPanelInfo(panelState, "Near side 62%", "Far side 38%");

        expect(panelState.info.hidden).toBe(false);
        expect(panelState.infoPrimaryText.textContent).toContain("Near side");
        expect(panelState.infoSecondary.textContent).toContain("Far side");
    });

    it("collapses and restores the composer controls", () => {
        const panelState = composerPanel();

        manager.setComposerControlsCollapsed(panelState, true);
        expect(panelState.composerControlsCollapsed).toBe(true);

        manager.setComposerControlsCollapsed(panelState, false);
        expect(panelState.composerControlsCollapsed).toBe(false);
    });

    it("disables composer interaction without tearing the panel down", () => {
        const panelState = composerPanel();

        manager.setComposerInteractionEnabled(panelState, false);

        expect(panelState.composerInteractionEnabled).toBe(false);
        expect(panelState.panel).toBeTruthy();
    });

    it("marks a panel as unavailable for the current mission", () => {
        const panelState = manager.panels.find((entry) => entry.id === "moon");

        manager.setPanelMissionEnabled(panelState, false);

        expect(panelState.missionEnabled).toBe(false);
        expect(manager.getPanelRegistryState(panelState)).toBe("unavailable");
    });

    it("enables the auxiliary panels only for a mission that asks for them", () => {
        manager.syncMissionPanelPolicy({ ui: { auxiliaryPanelsEnabled: true } });
        const enabled = manager.missionPanelsEnabled;

        manager.syncMissionPanelPolicy({ ui: { auxiliaryPanelsEnabled: false } });

        expect(enabled).toBe(true);
        expect(manager.missionPanelsEnabled).toBe(false);
    });

    it("enables the auxiliary panels for any lunar mission by default", () => {
        manager.syncMissionPanelPolicy({ is_lunar: true });

        expect(manager.missionPanelsEnabled).toBe(true);
    });

    it("leaves the auxiliary panels off for a mission with no lunar origin", () => {
        manager.syncMissionPanelPolicy({ origins: ["geo"] });

        expect(manager.missionPanelsEnabled).toBe(false);
    });
});
