import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installFakeDom } from "./helpers/fake-dom.js";
import { Animation2DController } from "../src/platform/js/controllers/animation-2d-controller.js";
import { PHYSICS_CONSTANTS as PC } from "../src/platform/js/core/constants.js";

let dom = null;

const PIXELS_PER_AU = 1000;

const PLANET_PROPERTIES = {
    MOON: { labelOffsetX: 8, labelOffsetY: -8 },
    SC: { labelOffsetX: 4, labelOffsetY: -4 },
    EARTH: {},
};

function mountSvg(bodyIds = ["EARTH", "MOON", "SC"]) {
    dom = installFakeDom(bodyIds.flatMap((id) => [
        { id, tag: "circle" },
        { id: `label-${id}`, tag: "text" },
        { id: `orbit-trail-${id}`, tag: "polyline" },
        { id: `orbit-mid-${id}`, tag: "polyline" },
        { id: `orbit-head-glow-${id}`, tag: "polyline" },
        { id: `orbit-head-${id}`, tag: "polyline" },
    ]).concat([
        { id: "burn", tag: "polygon" },
        { id: "burng", tag: "g" },
    ]));
}

function bodyState(position, velocity = { vx: 0, vy: 0, vz: 0 }) {
    return { available: true, position, velocity };
}

function makeController(options = {}) {
    return new Animation2DController("geo", {
        planetProperties: PLANET_PROPERTIES,
        showPlanet: () => true,
        ...options,
    });
}

function node(id) {
    return dom.document.getElementById(id);
}

beforeEach(() => {
    mountSvg();
});

afterEach(() => {
    dom?.restore();
    dom = null;
});

describe("construction", () => {
    it("starts on the XY plane with no zoom or pan", () => {
        const controller = makeController();

        expect(controller.config).toBe("geo");
        expect(controller.planeConfig).toMatchObject({ xVariable: "x", yVariable: "y", xFactor: 1 });
        expect(controller.zoomFactor).toBe(1);
        expect(controller.getCraftData()).toEqual({
            x: 0, y: 0, z: 0, angle: 0, velocityAngle: 0,
        });
    });

    it("tolerates being built without options", () => {
        const controller = new Animation2DController("lunar");

        expect(controller.planetProperties).toEqual({});
        expect(controller.showPlanet("ANY")).toBe(true);
    });

    it("merges a partial plane configuration", () => {
        const controller = makeController();

        controller.setPlaneConfig({ yVariable: "z", yFactor: -1 });

        expect(controller.planeConfig).toMatchObject({
            xVariable: "x",
            yVariable: "z",
            yFactor: -1,
        });
    });

    it("records zoom and pan, defaulting the pan to the origin", () => {
        const controller = makeController();

        controller.setZoomPan(4);

        expect(controller).toMatchObject({ zoomFactor: 4, panx: 0, pany: 0 });
    });

    it("hands out a copy of the craft data", () => {
        const controller = makeController();
        const data = controller.getCraftData();

        data.x = 999;

        expect(controller.getCraftData().x).toBe(0);
    });
});

describe("body placement", () => {
    it("projects a body into inverted SVG screen coordinates", () => {
        const controller = makeController();
        controller.pixelsPerAU = PIXELS_PER_AU;

        controller.updateBodyPosition("MOON", bodyState({ x: PC.KM_PER_AU, y: PC.KM_PER_AU, z: 0 }), "SC");

        expect(Number(node("MOON").getAttribute("cx"))).toBe(PIXELS_PER_AU);
        expect(Number(node("MOON").getAttribute("cy"))).toBe(-PIXELS_PER_AU);
        expect(node("MOON").getAttribute("visibility")).toBe("visible");
    });

    it("honours the plane configuration when projecting", () => {
        const controller = makeController();
        controller.pixelsPerAU = PIXELS_PER_AU;
        controller.setPlaneConfig({ yVariable: "z", yFactor: -1 });

        controller.updateBodyPosition("MOON", bodyState({ x: 0, y: 0, z: PC.KM_PER_AU }), "SC");

        expect(Number(node("MOON").getAttribute("cy"))).toBe(PIXELS_PER_AU);
    });

    it("hides a body the view has switched off", () => {
        const controller = makeController({ showPlanet: (id) => id !== "MOON" });
        controller.pixelsPerAU = PIXELS_PER_AU;

        controller.updateBodyPosition("MOON", bodyState({ x: 0, y: 0, z: 0 }), "SC");

        expect(node("MOON").getAttribute("visibility")).toBe("hidden");
    });

    it("hides a body outright", () => {
        const controller = makeController();

        controller.hideBody("MOON");

        expect(node("MOON").getAttribute("visibility")).toBe("hidden");
    });

    it("caches the craft position and heading", () => {
        const controller = makeController();
        controller.pixelsPerAU = PIXELS_PER_AU;

        controller.updateBodyPosition(
            "SC",
            bodyState({ x: PC.KM_PER_AU, y: 0, z: 0 }, { vx: 0, vy: 1, vz: 0 }),
            "SC",
        );

        const craftData = controller.getCraftData();
        expect(craftData.x).toBe(PIXELS_PER_AU);
        // +y velocity points up the screen, i.e. -90 degrees in SVG space.
        expect(craftData.velocityAngle).toBeCloseTo(-90, 9);
    });

    it("keeps the cached craft heading in screen space for any plane", () => {
        const controller = makeController();
        controller.pixelsPerAU = PIXELS_PER_AU;
        controller.setPlaneConfig({ yVariable: "z" });

        controller.updateBodyPosition(
            "SC",
            bodyState({ x: 0, y: 0, z: 0 }, { vx: 1, vy: 0, vz: 0 }),
            "SC",
        );

        expect(controller.getCraftData().velocityAngle).toBeCloseTo(0, 9);
    });
});

describe("render pass", () => {
    function makeState(overrides = {}) {
        return {
            time: 1000,
            bodies: {
                EARTH: bodyState({ x: 0, y: 0, z: 0 }),
                MOON: bodyState({ x: PC.KM_PER_AU, y: 0, z: 0 }),
                SC: bodyState({ x: 0, y: PC.KM_PER_AU, z: 0 }, { vx: 1, vy: 0, vz: 0 }),
            },
            ...overrides,
        };
    }

    it("places every requested body", () => {
        const controller = makeController();

        controller.render(makeState(), {
            pixelsPerAU: PIXELS_PER_AU,
            planetsForLocations: ["EARTH", "MOON", "SC"],
        });

        expect(Number(node("MOON").getAttribute("cx"))).toBe(PIXELS_PER_AU);
        expect(Number(node("SC").getAttribute("cy"))).toBe(-PIXELS_PER_AU);
    });

    it("hides a body with no state for this frame", () => {
        const controller = makeController();
        const state = makeState();
        state.bodies.MOON = { available: false };

        controller.render(state, {
            pixelsPerAU: PIXELS_PER_AU,
            planetsForLocations: ["MOON"],
        });

        expect(node("MOON").getAttribute("visibility")).toBe("hidden");
    });

    it("hides a body the state does not mention at all", () => {
        const controller = makeController();

        controller.render(makeState(), {
            pixelsPerAU: PIXELS_PER_AU,
            planetsForLocations: ["MARS"],
        });

        expect(() => controller.render(makeState(), { planetsForLocations: ["MARS"] })).not.toThrow();
    });

    it("publishes the rendered state onto the scene", () => {
        const controller = makeController();
        const scene = {};
        const state = makeState();

        controller.render(state, { scene, planetsForLocations: [] });

        expect(scene.latestSceneState).toBe(state);
    });

    it("uses a default scale when none is supplied", () => {
        const controller = makeController();

        controller.render(makeState(), { planetsForLocations: ["MOON"] });

        expect(controller.pixelsPerAU).toBe(250);
        expect(Number(node("MOON").getAttribute("cx"))).toBe(250);
    });
});

describe("burn indicator", () => {
    it("places the indicator on the craft with the current zoom", () => {
        const controller = makeController();
        controller.setZoomPan(4);
        controller.craftData = { x: 10, y: 20, z: 0, angle: 30, velocityAngle: 30 };

        controller.updateBurnIndicator(null);

        const transform = node("burng").getAttribute("transform");
        expect(transform).toContain("translate(10, 20)");
        expect(transform).toContain("rotate(30 0 0)");
        expect(transform).toContain("scale(0.25 0.25)");
    });

    it("leaves the indicator alone without finite craft coordinates", () => {
        const controller = makeController();
        controller.craftData = { x: Number.NaN, y: 0, angle: 0 };

        controller.updateBurnIndicator(null);

        expect(node("burng").getAttribute("transform")).toBeNull();
    });

    it("draws a plain marker with no active burn", () => {
        const controller = makeController();
        controller.craftData = { x: 0, y: 0, angle: 0 };

        controller.updateBurnIndicator(null);

        expect(node("burn").getAttribute("points")).toBeTruthy();
        expect(node("burn").getAttribute("fill")).toBeTruthy();
    });

    it("aligns the marker with the craft heading when no burn is active", () => {
        const controller = makeController();
        controller.craftData.velocityAngle = 42;

        controller.updateSpacecraftVisuals(
            bodyState({ x: 0, y: 0, z: 0 }),
            { time: 0, activeEvent: null },
        );

        expect(controller.getCraftData().angle).toBe(42);
    });

    it("ignores an event whose burn window has passed", () => {
        const controller = makeController();
        controller.craftData.velocityAngle = 10;

        controller.updateSpacecraftVisuals(
            bodyState({ x: 0, y: 0, z: 0 }),
            {
                time: Date.UTC(2026, 0, 2),
                activeEvent: { startTime: new Date(Date.UTC(2020, 0, 1)), durationSeconds: 1 },
            },
        );

        expect(controller.getCraftData().angle).toBe(10);
    });
});

describe("orbit trails", () => {
    function makeScene(points, times) {
        return {
            name: "geo",
            orbitSvgPointsByBodyId: { SC: points },
            orbitTimesByBodyId: { SC: times },
        };
    }

    it("does nothing without trail data", () => {
        const controller = makeController();

        expect(() => controller.updateOrbitTrails(null, 0)).not.toThrow();
        expect(() => controller.updateOrbitTrails({ orbitSvgPointsByBodyId: {} }, 0)).not.toThrow();
    });

    it("writes a polyline for the trail behind the craft", () => {
        const controller = makeController();
        const points = Array.from({ length: 10 }, (_, index) => ({ x: index, y: index * 2 }));
        const times = Array.from({ length: 10 }, (_, index) => index * 1000);

        controller.updateOrbitTrails(makeScene(points, times), 9000);

        const trail = node("orbit-trail-SC").getAttribute("points");
        expect(trail).toContain(",");
        expect(trail.split(" ").length).toBeGreaterThan(1);
    });

    it("rounds trail coordinates to two decimals", () => {
        const controller = makeController();
        const points = Array.from({ length: 6 }, (_, index) => ({
            x: index + 0.123456,
            y: index,
        }));
        const times = Array.from({ length: 6 }, (_, index) => index * 1000);

        controller.updateOrbitTrails(makeScene(points, times), 5000);

        expect(node("orbit-trail-SC").getAttribute("points")).toMatch(/\d\.\d{2}\b/);
    });

    it("clears the retired mid and head-glow layers", () => {
        const controller = makeController();
        const points = Array.from({ length: 6 }, (_, index) => ({ x: index, y: index }));
        const times = Array.from({ length: 6 }, (_, index) => index * 1000);

        controller.updateOrbitTrails(makeScene(points, times), 5000);

        expect(node("orbit-mid-SC").getAttribute("points")).toBe("");
        expect(node("orbit-head-glow-SC").getAttribute("points")).toBe("");
    });

    it("writes an empty trail when the current time is before the data", () => {
        const controller = makeController();
        const points = Array.from({ length: 6 }, (_, index) => ({ x: index, y: index }));
        const times = Array.from({ length: 6 }, (_, index) => index * 1000);

        controller.updateOrbitTrails(makeScene(points, times), -5000);

        expect(node("orbit-trail-SC").getAttribute("points")).toBe("");
    });
});

describe("labels", () => {
    it("offsets a label from its body, scaled by zoom", () => {
        const controller = makeController();
        controller.setZoomPan(2);
        node("MOON").setAttribute("cx", "100");
        node("MOON").setAttribute("cy", "-50");

        controller.updateLabelPosition("MOON");

        expect(Number(node("label-MOON").getAttribute("x"))).toBe(104);
        expect(Number(node("label-MOON").getAttribute("y"))).toBe(-54);
        expect(node("label-MOON").getAttribute("visibility")).toBe("visible");
    });

    it("treats a body with no authored offsets as centred", () => {
        const controller = makeController();
        node("EARTH").setAttribute("cx", "10");
        node("EARTH").setAttribute("cy", "20");

        controller.updateLabelPosition("EARTH");

        expect(Number(node("label-EARTH").getAttribute("x"))).toBe(10);
        expect(Number(node("label-EARTH").getAttribute("y"))).toBe(20);
    });

    it("ignores a body with no authored presentation", () => {
        const controller = makeController();

        controller.updateLabelPosition("MARS");

        expect(node("label-MOON").getAttribute("x")).toBeNull();
    });

    it("treats a body with no placement yet as the origin", () => {
        const controller = makeController();

        controller.updateLabelPosition("MOON");

        expect(Number(node("label-MOON").getAttribute("x"))).toBe(8);
    });
});

describe("zoom transform hook", () => {
    it("is reserved for the SVG shell and does nothing yet", () => {
        const controller = makeController();

        expect(controller.applyZoomPanTransform()).toBeUndefined();
    });
});
