import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

import { installFakeDom } from "./helpers/fake-dom.js";
import { SceneHelpers } from "../src/platform/js/rendering/scene-helpers.js";
import { PHYSICS_CONSTANTS as PC } from "../src/platform/js/core/constants.js";

let dom = null;
let parent = null;
let helpers = null;

beforeEach(() => {
    dom = installFakeDom();
    parent = new THREE.Group();
    helpers = new SceneHelpers(parent);
});

afterEach(() => {
    helpers?.dispose();
    helpers = null;
    parent = null;
    dom?.restore();
    dom = null;
});

function findByName(root, name) {
    let found = null;
    root.traverse((node) => {
        if (!found && node.name === name) found = node;
    });
    return found;
}

describe("axes helper", () => {
    it("attaches a hidden axes helper by default", () => {
        helpers.createAxesHelper(10);

        expect(helpers.axesHelper).toBeInstanceOf(THREE.AxesHelper);
        expect(helpers.axesHelper.visible).toBe(false);
        expect(parent.children).toContain(helpers.axesHelper);
    });

    it("honours an explicit initial visibility", () => {
        helpers.createAxesHelper(10, true);
        expect(helpers.axesHelper.visible).toBe(true);
    });

    it("toggles visibility without recreating the helper", () => {
        helpers.createAxesHelper(10);
        const original = helpers.axesHelper;

        helpers.setAxesVisible(true);

        expect(helpers.axesHelper).toBe(original);
        expect(original.visible).toBe(true);
    });

    it("detaches and disposes the helper", () => {
        helpers.createAxesHelper(10);
        const axes = helpers.axesHelper;
        const disposeSpy = vi.spyOn(axes, "dispose");

        helpers.disposeAxesHelper();

        expect(disposeSpy).toHaveBeenCalled();
        expect(helpers.axesHelper).toBeNull();
        expect(parent.children).not.toContain(axes);
    });

    it("ignores visibility and disposal before creation", () => {
        expect(() => helpers.setAxesVisible(true)).not.toThrow();
        expect(() => helpers.disposeAxesHelper()).not.toThrow();
    });
});

describe("reference planes", () => {
    it("builds the ecliptic disc in the parent frame", () => {
        helpers.createEclipticPlane(500, true);

        expect(helpers.eclipticPlaneHelper.name).toBe("EclipticPlaneDisc");
        expect(helpers.eclipticPlaneHelper.visible).toBe(true);
        expect(parent.children).toContain(helpers.eclipticPlaneHelper);
        // The grid helper variant was retired; the disc replaces it.
        expect(helpers.eclipticPolarGridHelper).toBeNull();
    });

    it("clamps a degenerate radius to a usable disc", () => {
        helpers.createEclipticPlane(0);

        const disc = helpers.eclipticPlaneHelper.children[0];
        expect(disc.geometry.parameters.radius).toBe(1);
    });

    it("replaces an existing ecliptic disc instead of stacking discs", () => {
        helpers.createEclipticPlane(100);
        const first = helpers.eclipticPlaneHelper;

        helpers.createEclipticPlane(200);

        expect(helpers.eclipticPlaneHelper).not.toBe(first);
        expect(parent.children.filter((child) => child.name === "EclipticPlaneDisc")).toHaveLength(1);
    });

    it("tilts the equatorial disc by Earth's axial inclination", () => {
        helpers.createEquatorialPlane(500, true);

        const normal = new THREE.Vector3(0, 0, 1)
            .applyQuaternion(helpers.equatorialPlaneContainer.quaternion);
        const expected = new THREE.Vector3(
            0,
            Math.sin(PC.EARTH_AXIS_INCLINATION_RADS),
            Math.cos(PC.EARTH_AXIS_INCLINATION_RADS),
        );

        expect(normal.angleTo(expected)).toBeLessThan(1e-6);
        expect(helpers.equatorialPlaneContainer.visible).toBe(true);
        expect(parent.children).toContain(helpers.equatorialPlaneContainer);
    });

    it("hides both the equatorial container and its disc together", () => {
        helpers.createEquatorialPlane(500, true);

        helpers.setEquatorialPlaneVisible(false);

        expect(helpers.equatorialPlaneContainer.visible).toBe(false);
        expect(helpers.equatorialPlaneHelper.visible).toBe(false);
    });

    it("disposes plane geometry and material on teardown", () => {
        helpers.createEclipticPlane(500);
        const disc = helpers.eclipticPlaneHelper.children[0];
        const geometrySpy = vi.spyOn(disc.geometry, "dispose");
        const materialSpy = vi.spyOn(disc.material, "dispose");

        helpers.disposeEclipticPlane();

        expect(geometrySpy).toHaveBeenCalled();
        expect(materialSpy).toHaveBeenCalled();
        expect(helpers.eclipticPlaneHelper).toBeNull();
    });

    it("clears the equatorial container on teardown", () => {
        helpers.createEquatorialPlane(500);
        const container = helpers.equatorialPlaneContainer;

        helpers.disposeEquatorialPlane();

        expect(container.children).toHaveLength(0);
        expect(helpers.equatorialPlaneContainer).toBeNull();
        expect(helpers.equatorialPlaneHelper).toBeNull();
        expect(parent.children).not.toContain(container);
    });
});

describe("moon influence shells", () => {
    let moonContainer = null;

    beforeEach(() => {
        moonContainer = new THREE.Group();
    });

    it("scales the SOI shell by the real SOI-to-Moon radius ratio", () => {
        helpers.createMoonSOI(moonContainer, 2);

        const rim = helpers.moonSOISphere.children[0];
        expect(rim.geometry.parameters.radius)
            .toBeCloseTo(2 * (PC.MOON_SOI_RADIUS_KM / PC.MOON_RADIUS_KM), 6);
        expect(helpers.moonSOISphere.name).toBe("MoonSOIHalo");
    });

    it("sizes the two shells from their own constants", () => {
        helpers.createMoonSOI(moonContainer, 2);
        helpers.createMoonHillSphere(moonContainer, 2);

        expect(helpers.moonHillSphere.children[0].geometry.parameters.radius)
            .toBeCloseTo(2 * (PC.MOON_HILL_SPHERE_RADIUS_KM / PC.MOON_RADIUS_KM), 6);
        // The configured Hill radius (62,800 km) sits just inside the
        // configured patched-conic SOI radius (66,000 km).
        expect(helpers.moonHillSphere.children[0].geometry.parameters.radius)
            .toBeLessThan(helpers.moonSOISphere.children[0].geometry.parameters.radius);
    });

    it("parents both shells to the Moon container so they follow the Moon", () => {
        helpers.createMoonSOI(moonContainer, 2);
        helpers.createMoonHillSphere(moonContainer, 2);

        expect(moonContainer.children).toContain(helpers.moonSOISphere);
        expect(moonContainer.children).toContain(helpers.moonHillSphere);
        expect(helpers.moonContainer).toBe(moonContainer);
    });

    it("creates nothing without a Moon container", () => {
        helpers.createMoonSOI(null, 2);
        expect(helpers.moonSOISphere).toBeNull();
    });

    it("replaces the shell rather than adding a second one", () => {
        helpers.createMoonSOI(moonContainer, 2);
        helpers.createMoonSOI(moonContainer, 4);

        expect(findByName(moonContainer, "MoonSOIHalo")).toBe(helpers.moonSOISphere);
        expect(moonContainer.children.filter((child) => child.name === "MoonSOIHalo")).toHaveLength(1);
    });

    it("toggles each shell independently", () => {
        helpers.createMoonSOI(moonContainer, 2);
        helpers.createMoonHillSphere(moonContainer, 2);

        helpers.setMoonSOIVisible(true);

        expect(helpers.moonSOISphere.visible).toBe(true);
        expect(helpers.moonHillSphere.visible).toBe(false);
    });

    it("disposes shell geometry and material on teardown", () => {
        helpers.createMoonHillSphere(moonContainer, 2);
        const rim = helpers.moonHillSphere.children[0];
        const geometrySpy = vi.spyOn(rim.geometry, "dispose");
        const materialSpy = vi.spyOn(rim.material, "dispose");

        helpers.disposeMoonHillSphere();

        expect(geometrySpy).toHaveBeenCalled();
        expect(materialSpy).toHaveBeenCalled();
        expect(helpers.moonHillSphere).toBeNull();
        expect(moonContainer.children).toHaveLength(0);
    });
});

describe("body halos", () => {
    let camera = null;
    let earthTarget = null;
    let moonTarget = null;

    beforeEach(() => {
        camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
        earthTarget = new THREE.Group();
        moonTarget = new THREE.Group();
        parent.add(earthTarget);
        parent.add(moonTarget);
    });

    it("attaches halo shells to the bodies they mark", () => {
        helpers.createBodyHalos({
            earthTarget,
            earthRadius: 1,
            moonTarget,
            moonRadius: 0.27,
            visible: true,
        });

        expect(helpers.bodyHaloSprites.earth.parent).toBe(earthTarget);
        expect(helpers.bodyHaloSprites.moon.parent).toBe(moonTarget);
        expect(helpers.bodyHalosEnabled).toBe(true);
    });

    it("keeps the craft halo disabled behind its feature flag", () => {
        const craftTarget = new THREE.Group();
        parent.add(craftTarget);

        helpers.createBodyHalos({ craftTarget, craftRadius: 2, visible: true });

        expect(helpers.bodyHaloTargets.craft).toBeNull();
        expect(helpers.bodyHaloRadii.craft).toBe(0);
        expect(helpers.bodyHaloSprites.craft).toBeNull();
    });

    it("starts hidden when created invisible", () => {
        helpers.createBodyHalos({ earthTarget, earthRadius: 1, visible: false });

        expect(helpers.bodyHaloSprites.earth.visible).toBe(false);
    });

    it("rejects a non-positive explicit radius", () => {
        helpers.setBodyHaloTargets({ earthTarget, earthRadius: -3 });
        expect(helpers.bodyHaloRadii.earth).toBe(0);

        helpers.setBodyHaloTargets({ earthRadius: Number.NaN });
        expect(helpers.bodyHaloRadii.earth).toBe(0);
    });

    it("leaves untouched keys alone when a partial target update arrives", () => {
        helpers.setBodyHaloTargets({ earthTarget, earthRadius: 1 });

        helpers.setBodyHaloTargets({ moonTarget, moonRadius: 0.27 });

        expect(helpers.bodyHaloTargets.earth).toBe(earthTarget);
        expect(helpers.bodyHaloRadii.earth).toBe(1);
    });

    it("scales the halo shell to the body radius on update", () => {
        helpers.createBodyHalos({ earthTarget, earthRadius: 3, visible: true });
        camera.position.set(0, 0, 40);
        camera.updateMatrixWorld(true);

        helpers.updateBodyHalos({ camera });

        expect(helpers.bodyHaloSprites.earth.visible).toBe(true);
        expect(helpers.bodyHaloSprites.earth.scale.x).toBeCloseTo(3, 6);
    });

    it("hides the halos when the feature is toggled off", () => {
        helpers.createBodyHalos({ earthTarget, earthRadius: 3, visible: true });
        camera.position.set(0, 0, 40);
        camera.updateMatrixWorld(true);
        helpers.updateBodyHalos({ camera });

        helpers.setBodyHalosVisible(false);

        expect(helpers.bodyHalosEnabled).toBe(false);
        expect(helpers.bodyHaloSprites.earth.visible).toBe(false);
    });

    it("hides the halos for an update with no camera", () => {
        helpers.createBodyHalos({ earthTarget, earthRadius: 3, visible: true });
        camera.position.set(0, 0, 40);
        camera.updateMatrixWorld(true);
        helpers.updateBodyHalos({ camera });

        helpers.updateBodyHalos({ camera: null });

        expect(helpers.bodyHaloSprites.earth.visible).toBe(false);
    });

    it("hides the halos for a non-perspective camera", () => {
        helpers.createBodyHalos({ earthTarget, earthRadius: 3, visible: true });

        helpers.updateBodyHalos({ camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10) });

        expect(helpers.bodyHaloSprites.earth.visible).toBe(false);
    });

    it("hides a halo whose body radius is unknown", () => {
        helpers.createBodyHalos({ earthTarget, visible: true });
        camera.position.set(0, 0, 40);
        camera.updateMatrixWorld(true);

        helpers.updateBodyHalos({ camera });

        expect(helpers.resolvedBodyHaloRadii.earth).toBe(0);
        expect(helpers.bodyHaloSprites.earth.visible).toBe(false);
    });

    it("re-attaches a halo when its body target is replaced", () => {
        helpers.createBodyHalos({ earthTarget, earthRadius: 3, visible: true });
        const replacement = new THREE.Group();
        parent.add(replacement);
        camera.position.set(0, 0, 40);
        camera.updateMatrixWorld(true);

        helpers.updateBodyHalos({ camera, earthTarget: replacement });

        expect(helpers.bodyHaloSprites.earth.parent).toBe(replacement);
    });

    it("releases every halo resource and target on disposal", () => {
        helpers.createBodyHalos({
            earthTarget,
            earthRadius: 3,
            moonTarget,
            moonRadius: 1,
            visible: true,
        });
        const sprite = helpers.bodyHaloSprites.earth;

        helpers.disposeBodyHalos();

        expect(sprite.parent).toBeNull();
        expect(helpers.bodyHaloSprites.earth).toBeNull();
        expect(helpers.bodyHaloTargets.earth).toBeNull();
        expect(helpers.bodyHaloRadii.earth).toBe(0);
        expect(helpers.bodyHalosEnabled).toBe(false);
    });
});

describe("moon osculating orbit", () => {
    const position = { x: 384400, y: 0, z: 0 };
    const velocity = { vx: 0, vy: 1.022, vz: 0 };
    const pixelsPerAU = PC.KM_PER_AU; // one scene unit per kilometre keeps the math readable

    it("preallocates the full sample buffer", () => {
        helpers.createMoonOsculatingOrbit();

        const attribute = helpers.moonOsculatingOrbitLine.geometry.getAttribute("position");
        expect(attribute.count).toBe(192);
        expect(helpers.moonOsculatingOrbitLine.visible).toBe(false);
        expect(parent.children).toContain(helpers.moonOsculatingOrbitLine);
    });

    it("does nothing before the line is created", () => {
        expect(() => helpers.updateMoonOsculatingOrbit({
            position,
            velocity,
            pixelsPerAU,
            timeMs: 0,
            visible: true,
        })).not.toThrow();
    });

    it("samples the orbit and shows the line on the first update", () => {
        helpers.createMoonOsculatingOrbit();

        helpers.updateMoonOsculatingOrbit({
            position,
            velocity,
            pixelsPerAU,
            timeMs: 1_000_000,
            visible: true,
        });

        const attribute = helpers.moonOsculatingOrbitLine.geometry.getAttribute("position");
        const radii = [];
        for (let index = 0; index < attribute.count; index += 1) {
            radii.push(Math.hypot(attribute.getX(index), attribute.getY(index), attribute.getZ(index)));
        }
        expect(Math.min(...radii)).toBeGreaterThan(0);
        expect(helpers.moonOsculatingOrbitLine.visible).toBe(true);
        expect(helpers.moonOsculatingOrbitLastUpdateTimeMs).toBe(1_000_000);
    });

    it("skips resampling inside the refresh window but still applies visibility", () => {
        helpers.createMoonOsculatingOrbit();
        helpers.updateMoonOsculatingOrbit({
            position,
            velocity,
            pixelsPerAU,
            timeMs: 1_000_000,
            visible: true,
        });
        const attribute = helpers.moonOsculatingOrbitLine.geometry.getAttribute("position");
        const firstX = attribute.getX(0);

        helpers.updateMoonOsculatingOrbit({
            position: { x: 1, y: 2, z: 3 },
            velocity,
            pixelsPerAU,
            timeMs: 1_000_000 + 60_000,
            visible: false,
        });

        expect(attribute.getX(0)).toBe(firstX);
        expect(helpers.moonOsculatingOrbitLine.visible).toBe(false);
        expect(helpers.moonOsculatingOrbitLastUpdateTimeMs).toBe(1_000_000);
    });

    it("resamples once the refresh interval has elapsed", () => {
        helpers.createMoonOsculatingOrbit();
        helpers.updateMoonOsculatingOrbit({
            position,
            velocity,
            pixelsPerAU,
            timeMs: 0,
            visible: true,
        });
        const attribute = helpers.moonOsculatingOrbitLine.geometry.getAttribute("position");
        const firstX = attribute.getX(0);

        helpers.updateMoonOsculatingOrbit({
            position: { x: 300000, y: 0, z: 0 },
            velocity,
            pixelsPerAU,
            timeMs: 16 * 60 * 1000,
            visible: true,
        });

        expect(attribute.getX(0)).not.toBe(firstX);
        expect(helpers.moonOsculatingOrbitLastUpdateTimeMs).toBe(16 * 60 * 1000);
    });

    it("hides the line when the state does not describe a closed orbit", () => {
        helpers.createMoonOsculatingOrbit();

        helpers.updateMoonOsculatingOrbit({
            position: { x: 0, y: 0, z: 0 },
            velocity: { vx: 0, vy: 0, vz: 0 },
            pixelsPerAU,
            timeMs: 0,
            visible: true,
        });

        expect(helpers.moonOsculatingOrbitLine.visible).toBe(false);
    });

    it("disposes the line and forgets its last sample time", () => {
        helpers.createMoonOsculatingOrbit();
        const line = helpers.moonOsculatingOrbitLine;
        const geometrySpy = vi.spyOn(line.geometry, "dispose");
        const materialSpy = vi.spyOn(line.material, "dispose");

        helpers.disposeMoonOsculatingOrbit();

        expect(geometrySpy).toHaveBeenCalled();
        expect(materialSpy).toHaveBeenCalled();
        expect(helpers.moonOsculatingOrbitLine).toBeNull();
        expect(helpers.moonOsculatingOrbitLastUpdateTimeMs).toBeNull();
        expect(parent.children).not.toContain(line);
    });
});

describe("full disposal", () => {
    it("releases every helper the scene created", () => {
        const moonContainer = new THREE.Group();
        const earthTarget = new THREE.Group();
        parent.add(earthTarget);
        helpers.createAxesHelper(10, true);
        helpers.createEclipticPlane(100, true);
        helpers.createEquatorialPlane(100, true);
        helpers.createMoonSOI(moonContainer, 2, true);
        helpers.createMoonHillSphere(moonContainer, 2, true);
        helpers.createBodyHalos({ earthTarget, earthRadius: 1, visible: true });
        helpers.createMoonOsculatingOrbit(true);

        helpers.dispose();

        expect(helpers.axesHelper).toBeNull();
        expect(helpers.eclipticPlaneHelper).toBeNull();
        expect(helpers.equatorialPlaneContainer).toBeNull();
        expect(helpers.moonSOISphere).toBeNull();
        expect(helpers.moonHillSphere).toBeNull();
        expect(helpers.moonOsculatingOrbitLine).toBeNull();
        expect(helpers.bodyHaloSprites.earth).toBeNull();
        expect(parent.children).toEqual([earthTarget]);
        expect(moonContainer.children).toHaveLength(0);
    });

    it("is safe to call twice", () => {
        helpers.createAxesHelper(10);
        helpers.dispose();
        expect(() => helpers.dispose()).not.toThrow();
    });
});
