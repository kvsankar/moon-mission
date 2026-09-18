import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as d3 from "d3";
import * as THREE from "three";

import { installFakeDom } from "./helpers/fake-dom.js";
import { createLabelActions } from "../src/platform/js/app/label-actions.js";
import { createLocationActions } from "../src/platform/js/app/location-actions.js";
import { createOrbitElementsActions } from "../src/platform/js/app/orbit-elements-actions.js";
import {
    COLORS as COL,
    PHYSICS_CONSTANTS as PC,
    UI_CONSTANTS as UC,
} from "../src/platform/js/core/constants.js";
import { degreesToRadians, sphericalToCartesian } from "../src/platform/js/utils/math-utils.js";

let dom = null;

const PIXELS_PER_AU = 100000;

const PLANET_PROPERTIES = {
    EARTH: { id: "EARTH", name: "Earth", r: 4, orbitcolor: "#66ccff", labelOffsetX: 6, labelOffsetY: -6 },
    MOON: { id: "MOON", name: "Moon", r: 2, orbitcolor: "#cccccc", labelOffsetX: 4, labelOffsetY: -4, "stroke-width": 2 },
    SC: { id: "SC", name: "SC", r: 3, orbitcolor: "#ffaa00", labelOffsetX: 5, labelOffsetY: -5 },
};

function mountSvg(ids) {
    dom = installFakeDom(ids.flatMap((id) => [
        { id: `label-${id}`, tag: "text" },
        { id, tag: "circle" },
        { id: `orbit-${id}`, tag: "g" },
        { id: `ellipse-orbit-${id}`, tag: "ellipse" },
    ]).concat([
        { id: "Greenwich", tag: "line" },
        { id: "burng", tag: "g" },
    ]));
    return dom.document;
}

afterEach(() => {
    dom?.restore();
    dom = null;
});

describe("label placement", () => {
    let state = null;

    function makeActions(overrides = {}) {
        state = {
            dimension: "2D",
            config: "geo",
            animTime: Date.UTC(2026, 3, 6),
            zoomFactor: 2,
            available: true,
            craftData: { x: 10, y: 20, angle: 45 },
            globalConfig: null,
            ...overrides,
        };
        return createLabelActions({
            d3,
            Astronomy: { SiderealTime: () => 6 },
            getCurrentDimension: () => state.dimension,
            getConfig: () => state.config,
            animationScenes: {
                geo: {
                    primaryBody: "EARTH",
                    planetsForOrbits: ["MOON", "SC"],
                    planetsForLocations: ["MOON", "SC"],
                },
            },
            planetProperties: PLANET_PROPERTIES,
            showPlanet: () => state.showPlanet !== false,
            isLocationAvaialable: () => state.available,
            getAnimTime: () => state.animTime,
            getBodyLocation: () => [{ x: PC.KM_PER_AU, y: 0, z: 0 }, null],
            PC,
            UC,
            getPixelsPerAU: () => PIXELS_PER_AU,
            getZoomFactor: () => state.zoomFactor,
            getXFactor: () => 1,
            getYFactor: () => 1,
            getXVariable: () => "x",
            getYVariable: () => "y",
            getCraftData: () => state.craftData,
            getGlobalConfig: () => state.globalConfig,
        });
    }

    beforeEach(() => {
        mountSvg(["EARTH", "MOON", "SC"]);
    });

    it("places a label at the projected body position plus its offset", () => {
        const actions = makeActions();

        actions.setLabelLocation("MOON");

        const label = dom.document.getElementById("label-MOON");
        expect(Number(label.getAttribute("x"))).toBe(PIXELS_PER_AU + (4 / 2));
        expect(Number(label.getAttribute("y"))).toBe(-4 / 2);
        expect(label.getAttribute("visibility")).toBe("visible");
    });

    it("scales the label text with the zoom level", () => {
        const actions = makeActions({ zoomFactor: 5 });

        actions.setLabelLocation("MOON");

        expect(Number(dom.document.getElementById("label-MOON").getAttribute("font-size"))).toBe(2);
    });

    it("hides a label whose body has no data for this time", () => {
        const actions = makeActions({ available: false });

        actions.setLabelLocation("MOON");

        expect(dom.document.getElementById("label-MOON").getAttribute("visibility")).toBe("hidden");
    });

    it("hides a label the view has switched off", () => {
        const actions = makeActions({ showPlanet: false });

        actions.setLabelLocation("MOON");

        expect(dom.document.getElementById("label-MOON").getAttribute("visibility")).toBe("hidden");
    });

    it("prefers a supplied body state over re-querying the orbit data", () => {
        const actions = makeActions();

        actions.setLabelLocation("MOON", {
            available: true,
            position: { x: 0, y: PC.KM_PER_AU, z: 0 },
        });

        const label = dom.document.getElementById("label-MOON");
        expect(Number(label.getAttribute("x"))).toBe(4 / 2);
        expect(Number(label.getAttribute("y"))).toBe(-PIXELS_PER_AU - (4 / 2));
    });

    it("hides a label when the supplied state reports no position", () => {
        const actions = createLabelActions({
            d3,
            Astronomy: { SiderealTime: () => 0 },
            getCurrentDimension: () => "2D",
            getConfig: () => "geo",
            animationScenes: { geo: { planetsForOrbits: [], planetsForLocations: [] } },
            planetProperties: PLANET_PROPERTIES,
            showPlanet: () => true,
            isLocationAvaialable: () => true,
            getAnimTime: () => 0,
            getBodyLocation: () => [null, null],
            PC,
            UC,
            getPixelsPerAU: () => PIXELS_PER_AU,
            getZoomFactor: () => 1,
            getXFactor: () => 1,
            getYFactor: () => 1,
            getXVariable: () => "x",
            getYVariable: () => "y",
            getCraftData: () => ({}),
            getGlobalConfig: () => null,
        });

        actions.setLabelLocation("MOON");

        expect(dom.document.getElementById("label-MOON").getAttribute("visibility")).toBe("hidden");
    });

    it("ignores a body with no authored presentation", () => {
        const actions = makeActions();

        expect(() => actions.setLabelLocation("NOT-A-BODY")).not.toThrow();
    });

    it("derives craft presentation from the mission config when no explicit entry exists", () => {
        const actions = makeActions({
            globalConfig: {
                crafts: [{ id: "ORION", mnemonic: "ORN", viewLabel: "Orion", color: "#ff00ff" }],
            },
        });
        dom.document.body.appendChild(Object.assign(dom.document.createElement("text"), { id: "label-ORION" }));

        actions.setLabelLocation("ORION");

        expect(dom.document.getElementById("label-ORION").getAttribute("visibility")).toBe("visible");
    });

    it("draws the Greenwich meridian only in 2D", () => {
        const actions = makeActions({ dimension: "3D" });

        actions.showGreenwichLongitude();

        expect(dom.document.getElementById("Greenwich").getAttribute("x2")).toBeNull();
    });

    it("skips the Greenwich meridian in the heliocentric frame", () => {
        const actions = makeActions({ config: "helio" });

        actions.showGreenwichLongitude();

        expect(dom.document.getElementById("Greenwich").getAttribute("x2")).toBeNull();
    });

    it("draws the Greenwich meridian at the sidereal angle", () => {
        const actions = makeActions();

        actions.showGreenwichLongitude();

        const line = dom.document.getElementById("Greenwich");
        const radialLength = (PC.EARTH_RADIUS_KM / PC.KM_PER_AU) * PIXELS_PER_AU;
        // The stubbed sidereal time is six hours, i.e. 90 degrees.
        expect(Number(line.getAttribute("x2"))).toBeCloseTo(0, 6);
        expect(Number(line.getAttribute("y2"))).toBeCloseTo(-radialLength, 6);
        expect(line.getAttribute("x1")).toBe("0");
    });

    it("rescales orbit strokes and body radii for the current zoom", () => {
        const actions = makeActions({ zoomFactor: 4 });

        actions.adjustLabelLocations();

        expect(dom.document.getElementById("orbit-MOON").getAttribute("r")).toBe("0.125");
        expect(dom.document.getElementById("ellipse-orbit-MOON").getAttribute("stroke-width")).toBe("0.5");
        // SC has no authored stroke width, so it falls back to 1.0.
        expect(dom.document.getElementById("ellipse-orbit-SC").getAttribute("stroke-width")).toBe("0.25");
    });

    it("keeps the Moon at least its physical radius on screen", () => {
        const actions = makeActions({ zoomFactor: 1000 });

        actions.adjustLabelLocations();

        const physicalRadius = (PC.MOON_RADIUS_KM / PC.KM_PER_AU) * PIXELS_PER_AU;
        expect(Number(dom.document.getElementById("MOON").getAttribute("r")))
            .toBeCloseTo(physicalRadius, 6);
    });

    it("places the primary body label just outside its own disc", () => {
        const actions = makeActions({ zoomFactor: 2 });

        actions.adjustLabelLocations();

        const radialLength = (PC.EARTH_RADIUS_KM / PC.KM_PER_AU) * PIXELS_PER_AU;
        const label = dom.document.getElementById("label-EARTH");
        expect(Number(label.getAttribute("x")))
            .toBeCloseTo(-radialLength + (UC.CENTER_LABEL_OFFSET_X / 2), 6);
        expect(Number(label.getAttribute("y")))
            .toBeCloseTo(-radialLength + (UC.CENTER_LABEL_OFFSET_Y / 2), 6);
    });

    it("positions the burn glyph from the current craft data", () => {
        const actions = makeActions({ craftData: { x: 10, y: 20, angle: 45 } });

        actions.adjustLabelLocations();

        const transform = dom.document.getElementById("burng").getAttribute("transform");
        expect(transform).toContain("translate(10, 20)");
        expect(transform).toContain("rotate(45 0 0)");
        expect(transform).toContain("scale(0.5 0.5)");
    });

    it("never shrinks the burn glyph below a readable size", () => {
        const actions = makeActions({ zoomFactor: 0.1 });

        actions.adjustLabelLocations();

        expect(dom.document.getElementById("burng").getAttribute("transform")).toContain("scale(4 4)");
    });

    it("leaves the burn glyph alone without finite craft data", () => {
        const actions = makeActions({ craftData: { x: Number.NaN, y: 20 } });

        actions.adjustLabelLocations();

        expect(dom.document.getElementById("burng").getAttribute("transform")).toBeNull();
    });
});

describe("surface locations", () => {
    let scene = null;
    let state = null;

    function makeActions(overrides = {}) {
        state = {
            globalConfig: { is_lunar: true },
            viewCraters: true,
            earthRadius: 100,
            moonRadius: 30,
            ...overrides,
        };
        return createLocationActions({
            THREE,
            sphericalToCartesian,
            degreesToRadians,
            COL,
            getEarthRadius: () => state.earthRadius,
            getMoonRadius: () => state.moonRadius,
            getGlobalConfig: () => state.globalConfig,
            getViewCraters: () => state.viewCraters,
        });
    }

    beforeEach(() => {
        scene = {
            earthContainer: new THREE.Group(),
            moonContainer: new THREE.Group(),
        };
    });

    it("plots the two authored Earth ground stations", () => {
        const actions = makeActions();

        actions.addEarthLocations({ scene });

        expect(scene.locations).toHaveLength(2);
        expect(scene.dwingeloo).toBeInstanceOf(THREE.Mesh);
        expect(scene.chennai).toBeInstanceOf(THREE.Mesh);
        expect(scene.earthContainer.children).toHaveLength(2);
    });

    it("places each station just below the Earth's surface", () => {
        const actions = makeActions();

        actions.addEarthLocations({ scene });

        expect(scene.dwingeloo.position.length()).toBeLessThan(state.earthRadius);
        expect(scene.dwingeloo.position.length()).toBeGreaterThan(state.earthRadius * 0.99);
    });

    it("follows the Moon-sites view toggle", () => {
        const actions = makeActions({ viewCraters: false });

        actions.addEarthLocations({ scene });

        expect(scene.locations.every((location) => location.visible === false)).toBe(true);
    });

    it("plots nothing without an Earth container or radius", () => {
        const actions = makeActions({ earthRadius: Number.NaN });

        actions.addEarthLocations({ scene });

        expect(scene.dwingeloo).toBeNull();
        expect(scene.earthContainer.children).toHaveLength(0);
    });

    it("ignores an Earth location request with no scene", () => {
        const actions = makeActions();

        expect(() => actions.addEarthLocations({ scene: null })).not.toThrow();
    });

    it("plots the mission's authored landing sites on the Moon", () => {
        const actions = makeActions({
            globalConfig: {
                is_lunar: true,
                landingSites: [
                    { latitude: -69.37, longitude: 32.32, color: "#ff0000" },
                    { latitude: 0, longitude: 0, color: "#00ff00" },
                ],
            },
        });

        actions.addMoonLocations({ scene });

        expect(scene.locations).toHaveLength(2);
        expect(scene.moonContainer.children).toHaveLength(2);
    });

    it("places landing sites just above the lunar surface", () => {
        const actions = makeActions({
            globalConfig: {
                is_lunar: true,
                landingSites: [{ latitude: 0, longitude: 0, color: "#ff0000" }],
            },
        });

        actions.addMoonLocations({ scene });

        expect(scene.locations[0].position.length()).toBeGreaterThan(state.moonRadius);
    });

    it("plots no lunar sites for a non-lunar mission", () => {
        const actions = makeActions({ globalConfig: { is_lunar: false } });

        actions.addMoonLocations({ scene });

        expect(scene.locations).toBeUndefined();
    });

    it("handles a lunar mission that authors no landing sites", () => {
        const actions = makeActions();

        actions.addMoonLocations({ scene });

        expect(scene.locations).toBeUndefined();
    });

    it("disposes the Earth station meshes and clears the references", () => {
        const actions = makeActions();
        actions.addEarthLocations({ scene });
        const geometrySpy = vi.spyOn(scene.locations[0].geometry, "dispose");
        const materialSpy = vi.spyOn(scene.locations[0].material, "dispose");

        actions.disposeEarthLocations({ scene });

        expect(geometrySpy).toHaveBeenCalled();
        expect(materialSpy).toHaveBeenCalled();
        expect(scene.locations).toEqual([]);
        expect(scene.dwingeloo).toBeNull();
        expect(scene.earthContainer.children).toHaveLength(0);
    });

    it("leaves lunar sites attached when disposing only the Earth stations", () => {
        const actions = makeActions({
            globalConfig: {
                is_lunar: true,
                landingSites: [{ latitude: 0, longitude: 0, color: "#ff0000" }],
            },
        });
        actions.addEarthLocations({ scene });
        actions.addMoonLocations({ scene });

        actions.disposeEarthLocations({ scene });

        expect(scene.locations).toHaveLength(1);
        expect(scene.moonContainer.children).toHaveLength(1);
    });

    it("disposes the lunar sites for a lunar mission", () => {
        const actions = makeActions({
            globalConfig: {
                is_lunar: true,
                landingSites: [{ latitude: 0, longitude: 0, color: "#ff0000" }],
            },
        });
        actions.addMoonLocations({ scene });

        actions.disposeMoonLocations({ scene });

        expect(scene.locations).toEqual([]);
        expect(scene.moonContainer.children).toHaveLength(0);
    });

    it("skips lunar disposal for a non-lunar mission", () => {
        const actions = makeActions({ globalConfig: { is_lunar: false } });
        scene.locations = ["sentinel"];

        actions.disposeMoonLocations({ scene });

        expect(scene.locations).toEqual(["sentinel"]);
    });
});

describe("orbit ellipse rendering", () => {
    function makeActions({ svgContainer, zoomFactor = 2 } = {}) {
        const epoch = { jd: null, date: null };
        const actions = createOrbitElementsActions({
            getSvgContainer: () => svgContainer,
            getConfig: () => "geo",
            animationScenes: {
                geo: {
                    planetsForOrbits: ["MOON"],
                    orbits: {
                        MOON: {
                            elements: {
                                2460000.5: {
                                    a: 384400,
                                    ec: 0.0549,
                                    om: 125.08,
                                    w: 318.15,
                                    date: "2023-03-01",
                                },
                            },
                        },
                    },
                },
            },
            planetProperties: PLANET_PROPERTIES,
            PC,
            PIXELS_PER_AU,
            getZoomFactor: () => zoomFactor,
            setEpochJD: (value) => { epoch.jd = value; },
            setEpochDate: (value) => { epoch.date = value; },
        });
        return { actions, epoch };
    }

    function makeSvgContainer() {
        const appended = [];
        const container = {
            appended,
            append: vi.fn((tag) => {
                const attrs = {};
                const node = {
                    tag,
                    attrs,
                    attr: vi.fn((name, value) => {
                        attrs[name] = value;
                        return node;
                    }),
                };
                appended.push(node);
                return node;
            }),
        };
        return container;
    }

    it("does nothing before the SVG container exists", () => {
        const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
        const { actions } = makeActions({ svgContainer: null });

        actions.processOrbitElementsData();

        expect(debug).toHaveBeenCalled();
        debug.mockRestore();
    });

    it("appends one ellipse per authored orbital element set", () => {
        const svgContainer = makeSvgContainer();
        const { actions } = makeActions({ svgContainer });

        actions.processOrbitElementsData();

        expect(svgContainer.appended).toHaveLength(1);
        expect(svgContainer.appended[0].attrs.id).toBe("ellipse-orbit-MOON");
    });

    it("scales the ellipse from the semi-major axis and eccentricity", () => {
        const svgContainer = makeSvgContainer();
        const { actions } = makeActions({ svgContainer });

        actions.processOrbitElementsData();

        const { attrs } = svgContainer.appended[0];
        const rx = (384400 / PC.KM_PER_AU) * PIXELS_PER_AU;
        expect(attrs.rx).toBeCloseTo(rx, 6);
        expect(attrs.ry).toBeCloseTo(rx * Math.sqrt(1 - (0.0549 ** 2)), 6);
        expect(attrs.cx).toBeCloseTo(-rx * 0.0549, 6);
        expect(attrs.cy).toBe(0);
    });

    it("rotates the ellipse into the argument of periapsis", () => {
        const svgContainer = makeSvgContainer();
        const { actions } = makeActions({ svgContainer });

        actions.processOrbitElementsData();

        // 125.08 + 318.15 wraps past a full circle, then flips sign.
        const match = /^rotate\((-?[\d.]+) 0 0\)$/.exec(svgContainer.appended[0].attrs.transform);
        expect(match).not.toBeNull();
        expect(Number(match[1])).toBeCloseTo(-(125.08 + 318.15 - 360), 9);
    });

    it("scales the stroke with the current zoom", () => {
        const svgContainer = makeSvgContainer();
        const { actions } = makeActions({ svgContainer, zoomFactor: 4 });

        actions.processOrbitElementsData();

        expect(svgContainer.appended[0].attrs["stroke-width"]).toBe(0.25);
        expect(svgContainer.appended[0].attrs.stroke).toBe(PLANET_PROPERTIES.MOON.orbitcolor);
    });

    it("publishes the element epoch to the runtime", () => {
        const svgContainer = makeSvgContainer();
        const { actions, epoch } = makeActions({ svgContainer });

        actions.processOrbitElementsData();

        expect(epoch.jd).toBe("2460000.5");
        expect(epoch.date).toBe("2023-03-01");
    });
});
