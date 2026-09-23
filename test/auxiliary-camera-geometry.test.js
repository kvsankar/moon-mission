import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

import { FakeResizeObserver } from "./helpers/fake-dom.js";
import { createManagerHarness } from "./helpers/auxiliary-camera-manager-harness.js";

let dom = null;
let manager = null;

function panelById(id) {
    return manager.panels.find((panelState) => panelState.id === id);
}

beforeEach(() => {
    vi.useFakeTimers();
    FakeResizeObserver.instances = [];
    ({ dom, manager } = createManagerHarness());
});

afterEach(() => {
    manager?.dispose();
    manager = null;
    dom?.restore();
    dom = null;
    vi.useRealTimers();
});

describe("moon phase", () => {
    function bodyAt(x, y, z) {
        const object = new THREE.Object3D();
        object.position.set(x, y, z);
        object.updateMatrixWorld(true);
        return object;
    }

    beforeEach(() => {
        manager.moonElongationPrevious = null;
        manager.moonElongationTrend = 1;
    });

    it("needs both bodies to report a phase", () => {
        expect(manager.computeMoonPhaseInfo({ earth: null, moon: bodyAt(1, 0, 0) })).toBeNull();
        expect(manager.computeMoonPhaseInfo({ earth: bodyAt(0, 0, 0), moon: null })).toBeNull();
    });

    it("returns nothing when the Moon sits on the Earth", () => {
        expect(manager.computeMoonPhaseInfo({
            earth: bodyAt(0, 0, 0),
            moon: bodyAt(0, 0, 0),
        })).toBeNull();
    });

    it("reports a new Moon when the Moon lies toward the Sun", () => {
        manager.sunDirectionEarthWorld.set(1, 0, 0);

        const info = manager.computeMoonPhaseInfo({
            earth: bodyAt(0, 0, 0),
            moon: bodyAt(10, 0, 0),
        });

        expect(info.phaseName).toBe("New Moon");
        expect(info.elongationDeg).toBeCloseTo(0, 6);
    });

    it("reports a full Moon when the Moon lies opposite the Sun", () => {
        manager.sunDirectionEarthWorld.set(1, 0, 0);

        const info = manager.computeMoonPhaseInfo({
            earth: bodyAt(0, 0, 0),
            moon: bodyAt(-10, 0, 0),
        });

        expect(info.phaseName).toBe("Full Moon");
        expect(info.elongationDeg).toBeCloseTo(180, 6);
    });

    it("falls back to a Sun object when no Sun direction is published", () => {
        manager.sunDirectionEarthWorld.set(0, 0, 0);

        const info = manager.computeMoonPhaseInfo({
            earth: bodyAt(0, 0, 0),
            moon: bodyAt(0, 10, 0),
            sun: bodyAt(0, -100, 0),
        });

        expect(info.phaseName).toBe("Full Moon");
    });

    it("reports nothing when neither the Sun direction nor a Sun object is available", () => {
        manager.sunDirectionEarthWorld.set(0, 0, 0);

        expect(manager.computeMoonPhaseInfo({
            earth: bodyAt(0, 0, 0),
            moon: bodyAt(0, 10, 0),
        })).toBeNull();
    });

    it("names each phase by elongation and trend", () => {
        expect(manager.resolveMoonPhaseName(5, 1)).toBe("New Moon");
        expect(manager.resolveMoonPhaseName(45, 1)).toBe("Waxing Crescent");
        expect(manager.resolveMoonPhaseName(45, -1)).toBe("Waning Crescent");
        expect(manager.resolveMoonPhaseName(90, 1)).toBe("First Quarter");
        expect(manager.resolveMoonPhaseName(90, -1)).toBe("Last Quarter");
        expect(manager.resolveMoonPhaseName(130, 1)).toBe("Waxing Gibbous");
        expect(manager.resolveMoonPhaseName(130, -1)).toBe("Waning Gibbous");
        expect(manager.resolveMoonPhaseName(175, -1)).toBe("Full Moon");
    });

    it("tracks whether the Moon is waxing or waning between samples", () => {
        manager.sunDirectionEarthWorld.set(1, 0, 0);
        const earth = bodyAt(0, 0, 0);

        manager.computeMoonPhaseInfo({ earth, moon: bodyAt(10, 10, 0) });
        const waning = manager.computeMoonPhaseInfo({ earth, moon: bodyAt(10, 4, 0) });

        expect(manager.moonElongationTrend).toBe(-1);
        expect(waning.phaseName).toContain("Waning");
    });
});

describe("percentage rounding", () => {
    it("keeps the parts summing to one hundred", () => {
        expect(manager.roundPercentParts([33.3, 33.3, 33.4, 0])
            .reduce((total, value) => total + value, 0)).toBe(100);
    });

    it("distributes the remainder to the largest fractions first", () => {
        expect(manager.roundPercentParts([25.5, 25.5, 24.5, 24.5])).toEqual([26, 26, 24, 24]);
    });

    it("passes exact values through unchanged", () => {
        expect(manager.roundPercentParts([50, 25, 25, 0])).toEqual([50, 25, 25, 0]);
    });

    it("floors a negative part at zero", () => {
        expect(manager.roundPercentParts([-10, 40, 30, 30])).toEqual([0, 40, 30, 30]);
    });

    it("keeps the four visibility shares whole and summing to one hundred", () => {
        // The only call site builds the parts as four counts that partition
        // the visible sample set, so they always sum to 100 and are never
        // negative. This pins that contract rather than the defensive
        // correction branch, which those inputs cannot reach.
        const parts = manager.roundPercentParts([41.6666, 8.3333, 41.6666, 8.3333]);

        expect(parts.every((value) => Number.isInteger(value) && value >= 0)).toBe(true);
        expect(parts.reduce((total, value) => total + value, 0)).toBe(100);
    });
});

describe("craft-to-Moon visibility", () => {
    function bodyAt(x, y, z) {
        const object = new THREE.Object3D();
        object.position.set(x, y, z);
        object.updateMatrixWorld(true);
        return object;
    }

    it("needs all three bodies", () => {
        expect(manager.computeCraftMoonVisibilityInfo({
            activeCraft: null,
            earth: bodyAt(0, 0, 0),
            moon: bodyAt(1, 0, 0),
        })).toBeNull();
    });

    it("reports nothing when a body sits on the Moon", () => {
        expect(manager.computeCraftMoonVisibilityInfo({
            activeCraft: bodyAt(0, 0, 0),
            earth: bodyAt(0, 0, 0),
            moon: bodyAt(0, 0, 0),
        })).toBeNull();
    });

    it("sees only the near side from directly above the Earth-facing hemisphere", () => {
        manager.sunDirectionMoonWorld.set(1, 0, 0);

        const info = manager.computeCraftMoonVisibilityInfo({
            activeCraft: bodyAt(100, 0, 0),
            earth: bodyAt(1000, 0, 0),
            moon: bodyAt(0, 0, 0),
        });

        expect(info.nearPct).toBe(100);
        expect(info.farPct).toBe(0);
    });

    it("sees only the far side from behind the Moon", () => {
        manager.sunDirectionMoonWorld.set(1, 0, 0);

        const info = manager.computeCraftMoonVisibilityInfo({
            activeCraft: bodyAt(-100, 0, 0),
            earth: bodyAt(1000, 0, 0),
            moon: bodyAt(0, 0, 0),
        });

        expect(info.farPct).toBe(100);
        expect(info.nearPct).toBe(0);
    });

    it("splits day and night across the illuminated hemisphere", () => {
        manager.sunDirectionMoonWorld.set(0, 1, 0);

        const info = manager.computeCraftMoonVisibilityInfo({
            activeCraft: bodyAt(100, 0, 0),
            earth: bodyAt(1000, 0, 0),
            moon: bodyAt(0, 0, 0),
        });

        expect(info.nearDayPct).toBeGreaterThan(0);
        expect(info.nearNightPct).toBeGreaterThan(0);
        expect(info.nearDayPct + info.nearNightPct + info.farDayPct + info.farNightPct).toBe(100);
    });

    it("falls back to a Sun object for illumination", () => {
        manager.sunDirectionMoonWorld.set(0, 0, 0);

        const info = manager.computeCraftMoonVisibilityInfo({
            activeCraft: bodyAt(100, 0, 0),
            earth: bodyAt(1000, 0, 0),
            moon: bodyAt(0, 0, 0),
            sun: bodyAt(0, 10000, 0),
        });

        expect(info).not.toBeNull();
        expect(info.nearDayPct).toBeGreaterThan(0);
    });
});

describe("field of view", () => {
    it("reports nothing for a non-positive distance", () => {
        expect(manager.computeAutoFovDegrees({ distanceToTarget: 0, targetRadius: 1, aspect: 1 }))
            .toBeNull();
        expect(manager.computeAutoFovDegrees({ distanceToTarget: Number.NaN, targetRadius: 1, aspect: 1 }))
            .toBeNull();
    });

    it("widens as the target gets closer", () => {
        const far = manager.computeAutoFovDegrees({ distanceToTarget: 1000, targetRadius: 10, aspect: 1 });
        const near = manager.computeAutoFovDegrees({ distanceToTarget: 100, targetRadius: 10, aspect: 1 });

        expect(near).toBeGreaterThan(far);
    });

    it("widens vertically for a wide viewport", () => {
        const square = manager.computeAutoFovDegrees({ distanceToTarget: 100, targetRadius: 10, aspect: 1 });
        const wide = manager.computeAutoFovDegrees({ distanceToTarget: 100, targetRadius: 10, aspect: 3 });

        expect(wide).toBeCloseTo(square, 6);
        const tall = manager.computeAutoFovDegrees({ distanceToTarget: 100, targetRadius: 10, aspect: 0.25 });
        expect(tall).toBeGreaterThan(square);
    });

    it("never exceeds a full hemisphere", () => {
        const fov = manager.computeAutoFovDegrees({ distanceToTarget: 1, targetRadius: 1000, aspect: 1 });

        expect(fov).toBeLessThanOrEqual(180);
    });

    it("clamps a view panel's automatic field of view into its own range", () => {
        const panelState = panelById("earth");

        expect(manager.clampAutoFovDegrees(panelState, 0.0001)).toBeGreaterThan(0);
        expect(manager.clampAutoFovDegrees(panelState, 500)).toBeLessThan(180);
    });

    it("gives the composer its own tighter minimum", () => {
        const composer = panelById("earth-rise-composer");
        const view = panelById("earth");

        expect(manager.clampAutoFovDegrees(composer, 0.0001))
            .toBeLessThan(manager.clampAutoFovDegrees(view, 0.0001));
    });
});

describe("geometry helpers", () => {
    it("samples a sphere evenly", () => {
        const samples = manager.createFibonacciSphereSamples(120);

        expect(samples).toHaveLength(360);
        for (let index = 0; index < samples.length; index += 3) {
            expect(Math.hypot(samples[index], samples[index + 1], samples[index + 2]))
                .toBeCloseTo(1, 6);
        }
    });

    it("never drops below a usable sample count", () => {
        expect(manager.createFibonacciSphereSamples(4)).toHaveLength(64 * 3);
    });

    it("reports a world position only for a real object", () => {
        const out = new THREE.Vector3();

        expect(manager.getObjectWorldPosition(null, out)).toBe(false);
        expect(manager.getObjectWorldPosition(new THREE.Object3D(), null)).toBe(false);
        expect(manager.getObjectWorldPosition(new THREE.Object3D(), out)).toBe(true);
    });

    it("resolves each anchor key from the render context", () => {
        const context = {
            activeCraft: new THREE.Object3D(),
            earth: new THREE.Object3D(),
            moon: new THREE.Object3D(),
            sun: new THREE.Object3D(),
        };
        context.moon.position.set(5, 0, 0);
        context.moon.updateMatrixWorld(true);
        const out = new THREE.Vector3();

        expect(manager.resolvePositionForKey("moon", context, out)).toBe(true);
        expect(out.x).toBe(5);
        expect(manager.resolvePositionForKey("craft", context, out)).toBe(true);
        expect(manager.resolvePositionForKey("earth", context, out)).toBe(true);
        expect(manager.resolvePositionForKey("sun", context, out)).toBe(true);
        expect(manager.resolvePositionForKey("moon", context, null)).toBe(false);
    });

    it("normalizes the published Sun direction per frame of reference", () => {
        manager.sunDirectionMoonWorld.set(0, 5, 0);
        const out = new THREE.Vector3();

        expect(manager.vectorFromSunDirection(out, "moon")).toBe(true);
        expect(out.toArray()).toEqual([0, 1, 0]);
    });

    it("reports no Sun direction when the published vector is degenerate", () => {
        manager.sunDirectionCraftWorld.set(0, 0, 0);

        expect(manager.vectorFromSunDirection(new THREE.Vector3(), "craft")).toBe(false);
    });

    it("picks the reference frame that matches each panel", () => {
        expect(manager.resolveSunDirectionForPanel(panelById("earth")))
            .toBe(manager.sunDirectionCraftWorld);
        expect(manager.resolveSunDirectionForPanel(panelById("earth-to-moon")))
            .toBe(manager.sunDirectionMoonWorld);
        expect(manager.resolveSunDirectionForPanel(null))
            .toBe(manager.sunDirectionEarthWorld);
    });

    it("estimates an object radius from its bounds", () => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));

        expect(manager.estimateObjectRadius(mesh)).toBeCloseTo(Math.sqrt(3), 5);
        expect(manager.estimateObjectRadius(null, 7)).toBe(7);
        expect(manager.estimateObjectRadius(new THREE.Object3D(), 7)).toBe(7);
    });

    it("estimates the craft radius with a sane fallback", () => {
        expect(manager.estimateCraftRadius(null)).toBe(1);
        expect(manager.estimateCraftRadius(new THREE.Object3D())).toBe(1);
        expect(manager.estimateCraftRadius(new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4))))
            .toBeCloseTo(2 * Math.sqrt(3), 5);
    });

    it("points the camera's up vector at ecliptic north", () => {
        const camera = new THREE.PerspectiveCamera();
        camera.position.set(10, 0, 0);

        manager.applyEclipticNorthUp(camera, new THREE.Vector3(0, 0, 0));

        expect(camera.up.z).toBeCloseTo(1, 6);
    });

    it("falls back when the camera sits on its own look target", () => {
        const camera = new THREE.PerspectiveCamera();
        camera.position.set(0, 0, 0);

        manager.applyEclipticNorthUp(camera, new THREE.Vector3(0, 0, 0));

        expect(camera.up.toArray()).toEqual([0, 0, 1]);
    });

    it("falls back when the view already looks along ecliptic north", () => {
        const camera = new THREE.PerspectiveCamera();
        camera.position.set(0, 0, 10);

        manager.applyEclipticNorthUp(camera, new THREE.Vector3(0, 0, 0));

        expect(camera.up.toArray()).toEqual([1, 0, 0]);
    });

    it("ignores an incomplete up request", () => {
        expect(() => manager.applyEclipticNorthUp(null, new THREE.Vector3())).not.toThrow();
        expect(() => manager.applyEclipticNorthUp(new THREE.PerspectiveCamera(), null)).not.toThrow();
    });
});

describe("temporary visibility suppression", () => {
    it("hides only the visible line primitives in a scene", () => {
        const scene = new THREE.Group();
        const line = new THREE.Line(new THREE.BufferGeometry());
        const hiddenLine = new THREE.Line(new THREE.BufferGeometry());
        hiddenLine.visible = false;
        const mesh = new THREE.Mesh(new THREE.BoxGeometry());
        scene.add(line, hiddenLine, mesh);

        const entries = manager.suppressLinePrimitives(scene);

        expect(entries).toHaveLength(1);
        expect(line.visible).toBe(false);
        expect(mesh.visible).toBe(true);
    });

    it("hides every craft object exactly once", () => {
        const craft = new THREE.Object3D();
        const drone = new THREE.Object3D();

        const entries = manager.suppressCraftVisuals({
            activeCraft: craft,
            craftsById: { ORION: craft, ESM: new THREE.Object3D() },
            dronesById: { DRONE: drone },
        });

        expect(entries).toHaveLength(3);
        expect(craft.visible).toBe(false);
        expect(drone.visible).toBe(false);
    });

    it("restores the recorded visibility", () => {
        const scene = new THREE.Group();
        const line = new THREE.Line(new THREE.BufferGeometry());
        scene.add(line);
        const entries = manager.suppressLinePrimitives(scene);

        manager.restoreVisibility(entries);

        expect(line.visible).toBe(true);
    });

    it("tolerates an empty restore list", () => {
        expect(() => manager.restoreVisibility(null)).not.toThrow();
    });
});

describe("orbit plane projection", () => {
    it("puts the Earth in the middle of the canvas", () => {
        const project = manager.createOrbitPlaneProjector({
            width: 200,
            height: 100,
            earthWorld: new THREE.Vector3(5, 7, 0),
            halfHeight: 50,
        });

        expect(project(new THREE.Vector3(5, 7, 0))).toEqual({ x: 100, y: 50 });
    });

    it("flips the world y axis to canvas coordinates", () => {
        const project = manager.createOrbitPlaneProjector({
            width: 200,
            height: 100,
            earthWorld: new THREE.Vector3(0, 0, 0),
            halfHeight: 50,
        });

        expect(project(new THREE.Vector3(0, 50, 0)).y).toBe(0);
        expect(project(new THREE.Vector3(0, -50, 0)).y).toBe(100);
    });

    it("keeps the aspect ratio square in world units", () => {
        const project = manager.createOrbitPlaneProjector({
            width: 200,
            height: 100,
            earthWorld: new THREE.Vector3(0, 0, 0),
            halfHeight: 50,
        });

        expect(project.scaleX).toBeCloseTo(project.scaleY, 9);
    });

    it("shifts the view by the requested pan offset", () => {
        const project = manager.createOrbitPlaneProjector({
            width: 200,
            height: 100,
            earthWorld: new THREE.Vector3(0, 0, 0),
            halfHeight: 50,
            panOffsetX: 10,
            panOffsetY: -10,
        });

        expect(project.centerX).toBe(10);
        expect(project.centerY).toBe(-10);
    });

    it("guards against a degenerate canvas", () => {
        const project = manager.createOrbitPlaneProjector({
            width: 0,
            height: 0,
            earthWorld: new THREE.Vector3(0, 0, 0),
            halfHeight: 0,
        });

        expect(Number.isFinite(project(new THREE.Vector3(1, 1, 0)).x)).toBe(true);
    });

    it("fits the Moon and the craft into the plane view", () => {
        const halfHeight = manager.computeOrbitPlaneHalfHeight({
            scene: null,
            earthWorld: new THREE.Vector3(0, 0, 0),
            moonWorld: new THREE.Vector3(400, 0, 0),
            craftWorld: new THREE.Vector3(0, 250, 0),
            earthRadius: 6,
            moonRadius: 2,
        });

        expect(halfHeight).toBeGreaterThan(400);
    });

    it("never collapses the plane view to nothing", () => {
        expect(manager.computeOrbitPlaneHalfHeight({
            scene: null,
            earthWorld: new THREE.Vector3(0, 0, 0),
            moonWorld: null,
            craftWorld: null,
            earthRadius: 0,
            moonRadius: 0,
        })).toBeGreaterThanOrEqual(1);
    });

    it("includes the mission curves it is given", () => {
        const scene = {
            activeCraftId: "SC",
            primaryCraftId: "SC",
            curvesById: {
                SC: [new THREE.Vector3(0, 900, 0), new THREE.Vector3(0, -900, 0)],
            },
        };

        const halfHeight = manager.computeOrbitPlaneHalfHeight({
            scene,
            earthWorld: new THREE.Vector3(0, 0, 0),
            moonWorld: new THREE.Vector3(10, 0, 0),
            craftWorld: new THREE.Vector3(10, 0, 0),
            earthRadius: 1,
            moonRadius: 1,
        });

        expect(halfHeight).toBeGreaterThan(900);
    });
});

describe("composer labels", () => {
    it("formats a sub-hour window in minutes", () => {
        expect(manager.formatComposerWindowLabel(30 * 60 * 1000)).toBe("+/-30m");
        expect(manager.formatComposerWindowLabel(0)).toBe("+/-1m");
        expect(manager.formatComposerWindowLabel(-500)).toBe("+/-1m");
    });

    it("formats a whole-hour window without minutes", () => {
        expect(manager.formatComposerWindowLabel(2 * 60 * 60 * 1000)).toBe("+/-2h");
    });

    it("formats a mixed window with both parts", () => {
        expect(manager.formatComposerWindowLabel((90 * 60 * 1000))).toBe("+/-1h 30m");
    });

    it("reports a placeholder for a time it cannot format", () => {
        expect(manager.formatLocalDateTime(Number.NaN)).toBe("--");
    });

    it("formats a real instant as a date and time", () => {
        const text = manager.formatLocalDateTime(Date.UTC(2026, 3, 6, 12, 30, 0));

        expect(text).toMatch(/\d/);
        expect(text.length).toBeGreaterThan(5);
    });

    it("selects bright star labels down to the requested magnitude", () => {
        const bright = manager.resolveComposerBrightStarLabelDescriptors(1);
        const dim = manager.resolveComposerBrightStarLabelDescriptors(4);

        expect(dim.length).toBeGreaterThanOrEqual(bright.length);
        expect(bright.every((entry) => entry.magnitude <= 1.0001)).toBe(true);
    });

    it("caches the descriptor list for a repeated magnitude limit", () => {
        const first = manager.resolveComposerBrightStarLabelDescriptors(2);
        const second = manager.resolveComposerBrightStarLabelDescriptors(2);

        expect(second).toBe(first);
    });
});
