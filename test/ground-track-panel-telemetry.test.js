import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeEvent, FakeResizeObserver, installFakeDom } from "./helpers/fake-dom.js";
import { createGroundTrackPanelActions } from "../src/platform/js/app/ground-track-panel.js";
import { readMissionPanelState } from "../src/platform/js/app/panel-layout-store.js";

const MISSION_CONFIG = JSON.parse(readFileSync("assets/artemis2/data/config.json", "utf8"));
const WINDOW_START_MS = Date.parse(MISSION_CONFIG.events.returnCorrection3.startTime);
const WINDOW_END_MS = Date.parse(MISSION_CONFIG.geo.endTime);
const MID_WINDOW_MS = WINDOW_START_MS + (60 * 60 * 1000);
const PANEL_ID = "workflow:splashdown";
const EARTH_RADIUS_KM = 6378.1363;

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
    { id: "ground-track-button", tag: "button" },
    { id: "ground-track-style-2d", tag: "button", parent: "ground-track-panel" },
    { id: "ground-track-style-3d", tag: "button", parent: "ground-track-panel" },
    { id: "ground-track-metric-earth-distance-km", tag: "span", parent: "ground-track-panel" },
    { id: "ground-track-metric-earth-distance-miles", tag: "span", parent: "ground-track-panel" },
    { id: "ground-track-metric-velocity-kmps", tag: "span", parent: "ground-track-panel" },
    { id: "ground-track-metric-velocity-mph", tag: "span", parent: "ground-track-panel" },
    { id: "ground-track-metric-altitude-km", tag: "span", parent: "ground-track-panel" },
    { id: "ground-track-metric-latitude", tag: "span", parent: "ground-track-panel" },
    { id: "ground-track-metric-longitude", tag: "span", parent: "ground-track-panel" },
];

let dom = null;
let actions = null;

function node(id) {
    return dom.document.getElementById(id);
}

function metric(id) {
    return node(id).textContent;
}

function numberFrom(text) {
    return Number.parseFloat(String(text).replace(/[^0-9.-]/g, ""));
}

function craftCurve() {
    const curve = [];
    const times = [];
    for (let timeMs = WINDOW_START_MS; timeMs <= WINDOW_END_MS; timeMs += 5 * 60 * 1000) {
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

function mount({ scenes = null } = {}) {
    const { curve, times } = craftCurve();
    dom = installFakeDom(PANEL_ELEMENTS, {
        innerWidth: 1600,
        innerHeight: 900,
        ResizeObserver: FakeResizeObserver,
        requestAnimationFrame: (callback) => { callback(0); return 1; },
        cancelAnimationFrame: () => {},
        missionConfig: { dataPath: "assets/artemis2/data" },
        location: { pathname: "/artemis2/", href: "http://localhost/artemis2/" },
        animationScenes: scenes || {
            geo: { primaryCraftId: "SC", curvesById: { SC: curve }, curveTimesById: { SC: times } },
        },
    });
    vi.stubGlobal("fetch", vi.fn(async (url) => (
        String(url).includes("config.json")
            ? { ok: true, status: 200, json: async () => MISSION_CONFIG }
            : { ok: false, status: 404, json: async () => ({}) }
    )));
}

async function settle(rounds = 25) {
    for (let index = 0; index < rounds; index += 1) {
        // eslint-disable-next-line no-await-in-loop
        await Promise.resolve();
    }
}

/** Boots the panel and opens it once the mission config has settled. */
async function boot({ sceneState, config = "geo", animTime = MID_WINDOW_MS } = {}) {
    actions = createGroundTrackPanelActions({});
    actions.update({ sceneState, config, animTime });
    await settle();
    actions.setPanelVisible(true);
    actions.update({ sceneState, config, animTime });
    await settle();
    return actions;
}

function sceneState(overrides = {}) {
    return {
        bodies: {
            SC: {
                available: true,
                position: { x: 7400, y: 200, z: -300 },
                velocity: { vx: 0, vy: 7.5, vz: 0.2 },
            },
            EARTH: { available: true, position: { x: 0, y: 0, z: 0 }, velocity: { vx: 0, vy: 0, vz: 0 } },
        },
        ...overrides,
    };
}

function click(id) {
    node(id).dispatchEvent(new FakeEvent("click", { bubbles: true }));
}

beforeEach(() => {
    FakeResizeObserver.instances = [];
});

afterEach(() => {
    actions = null;
    dom?.restore();
    dom = null;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("resolving the Earth-centred position", () => {
    it("uses the craft position directly in the Earth frame", async () => {
        mount();

        await boot({ sceneState: sceneState() });

        const expected = Math.hypot(7400, 200, -300);
        expect(numberFrom(metric("ground-track-metric-earth-distance-km"))).toBeCloseTo(expected, 0);
    });

    it("subtracts the Earth position in the Moon frame", async () => {
        // Lunar-frame telemetry is Moon-centred, so the Earth vector has to be
        // removed before the ground track can be resolved.
        mount({
            scenes: {
                geo: { primaryCraftId: "SC", curvesById: {}, curveTimesById: {} },
                lunar: { primaryCraftId: "SC", curvesById: {}, curveTimesById: {} },
            },
        });

        await boot({
            config: "lunar",
            sceneState: sceneState({
                bodies: {
                    SC: { available: true, position: { x: 1000, y: 0, z: 0 } },
                    EARTH: { available: true, position: { x: -383400, y: 0, z: 0 } },
                },
            }),
        });

        expect(numberFrom(metric("ground-track-metric-earth-distance-km"))).toBeCloseTo(384400, 0);
    });

    it("reports nothing in the Moon frame without an Earth position", async () => {
        mount({
            scenes: {
                geo: { primaryCraftId: "SC", curvesById: {}, curveTimesById: {} },
                lunar: { primaryCraftId: "SC", curvesById: {}, curveTimesById: {} },
            },
        });

        await boot({
            config: "lunar",
            sceneState: { bodies: { SC: { available: true, position: { x: 1000, y: 0, z: 0 } } } },
        });

        expect(metric("ground-track-metric-latitude")).toBe("--");
    });

    it("reports nothing without a craft position", async () => {
        mount();

        await boot({ sceneState: { bodies: { EARTH: { position: { x: 0, y: 0, z: 0 } } } } });

        expect(metric("ground-track-metric-earth-distance-km")).toBe("--");
        expect(node("ground-track-coords").textContent).toBe("--");
    });
});

describe("resolving the Earth-relative velocity", () => {
    it("reads a vx/vy/vz velocity", async () => {
        mount();

        await boot({ sceneState: sceneState() });

        expect(numberFrom(metric("ground-track-metric-velocity-kmps")))
            .toBeCloseTo(Math.hypot(0, 7.5, 0.2), 1);
    });

    it("reads an x/y/z velocity just as well", async () => {
        mount();

        await boot({
            sceneState: sceneState({
                bodies: {
                    SC: {
                        available: true,
                        position: { x: 7400, y: 0, z: 0 },
                        velocity: { x: 0, y: 3, z: 4 },
                    },
                    EARTH: { available: true, position: { x: 0, y: 0, z: 0 } },
                },
            }),
        });

        expect(numberFrom(metric("ground-track-metric-velocity-kmps"))).toBeCloseTo(5, 1);
    });

    it("subtracts the Earth velocity in the Moon frame", async () => {
        mount({
            scenes: {
                geo: { primaryCraftId: "SC", curvesById: {}, curveTimesById: {} },
                lunar: { primaryCraftId: "SC", curvesById: {}, curveTimesById: {} },
            },
        });

        await boot({
            config: "lunar",
            sceneState: {
                bodies: {
                    SC: {
                        available: true,
                        position: { x: 1000, y: 0, z: 0 },
                        velocity: { vx: 10, vy: 0, vz: 0 },
                    },
                    EARTH: {
                        available: true,
                        position: { x: -383400, y: 0, z: 0 },
                        velocity: { vx: 4, vy: 0, vz: 0 },
                    },
                },
            },
        });

        expect(numberFrom(metric("ground-track-metric-velocity-kmps"))).toBeCloseTo(6, 1);
    });

    it("reports nothing without a craft velocity", async () => {
        mount();

        await boot({
            sceneState: sceneState({
                bodies: {
                    SC: { available: true, position: { x: 7400, y: 0, z: 0 } },
                    EARTH: { available: true, position: { x: 0, y: 0, z: 0 } },
                },
            }),
        });

        expect(metric("ground-track-metric-velocity-kmps")).toBe("--");
    });
});

describe("preferring published telemetry", () => {
    it("takes the Earth distance the scene already computed", async () => {
        mount();

        await boot({ sceneState: sceneState({ telemetry: { distanceEarth: 12345 } }) });

        expect(numberFrom(metric("ground-track-metric-earth-distance-km"))).toBeCloseTo(12345, 0);
    });

    it("falls back to the primary distance in the Earth frame", async () => {
        mount();

        await boot({ sceneState: sceneState({ telemetry: { distancePrimary: 4321 } }) });

        expect(numberFrom(metric("ground-track-metric-earth-distance-km"))).toBeCloseTo(4321, 0);
    });

    it("takes the Earth velocity the scene already computed", async () => {
        mount();

        await boot({ sceneState: sceneState({ telemetry: { velocityEarth: 9.5 } }) });

        expect(numberFrom(metric("ground-track-metric-velocity-kmps"))).toBeCloseTo(9.5, 2);
    });

    it("falls back to the primary velocity in the Earth frame", async () => {
        mount();

        await boot({ sceneState: sceneState({ telemetry: { velocityPrimary: 3.25 } }) });

        expect(numberFrom(metric("ground-track-metric-velocity-kmps"))).toBeCloseTo(3.25, 2);
    });

    it("derives altitude from the distance rather than a published altitude", async () => {
        mount();

        await boot({
            sceneState: sceneState({ telemetry: { distanceEarth: 10000, altitudeEarth: 999 } }),
        });

        expect(numberFrom(metric("ground-track-metric-altitude-km")))
            .toBeCloseTo(10000 - EARTH_RADIUS_KM, 0);
    });
});

describe("converting to imperial units", () => {
    it("reports distance in miles alongside kilometres", async () => {
        mount();

        await boot({ sceneState: sceneState({ telemetry: { distanceEarth: 1000 } }) });

        expect(numberFrom(metric("ground-track-metric-earth-distance-miles")))
            .toBeCloseTo(621, 0);
    });

    it("reports speed in miles per hour alongside km per second", async () => {
        mount();

        await boot({ sceneState: sceneState({ telemetry: { velocityEarth: 1 } }) });

        expect(numberFrom(metric("ground-track-metric-velocity-mph")))
            .toBeCloseTo(2237, 0);
    });
});

describe("formatting the ground point", () => {
    it("labels each hemisphere", async () => {
        mount();

        await boot({ sceneState: sceneState() });

        expect(metric("ground-track-metric-latitude")).toMatch(/^\d+\.\d\d° [NS]$/);
        expect(metric("ground-track-metric-longitude")).toMatch(/^\d+\.\d\d° [EW]$/);
    });

    it("pairs the two into one coordinate readout", async () => {
        mount();

        await boot({ sceneState: sceneState() });

        expect(node("ground-track-coords").textContent)
            .toBe(`${metric("ground-track-metric-latitude")}, ${metric("ground-track-metric-longitude")}`);
    });
});

describe("panel layout persistence", () => {
    it("records the open state and frame", async () => {
        mount();
        await boot({ sceneState: sceneState() });
        node("ground-track-panel").offsetWidth = 420;
        node("ground-track-panel").offsetHeight = 320;

        FakeResizeObserver.instances.forEach((observer) => observer.trigger());

        const stored = readMissionPanelState(PANEL_ID);
        expect(stored?.state).toBe("open");
        expect(stored.width).toBe(420);
        expect(stored.height).toBe(320);
    });

    it("records the closed state", async () => {
        mount();
        await boot({ sceneState: sceneState() });

        actions.setPanelVisible(false);
        FakeResizeObserver.instances.forEach((observer) => observer.trigger());

        expect(readMissionPanelState(PANEL_ID)?.state).toBe("closed");
    });

    it("records the maximized state and its restore frame", async () => {
        mount();
        await boot({ sceneState: sceneState() });
        const panel = node("ground-track-panel");
        panel.offsetWidth = 420;
        panel.offsetHeight = 320;
        const wasMaximized = panel.classList.contains("is-maximized");

        click("ground-track-panel-expand");

        const stored = readMissionPanelState(PANEL_ID);
        expect(stored?.maximized).toBe(!wasMaximized);
        if (!wasMaximized) {
            expect(stored.restoreFrame).toMatchObject({ width: 420, height: 320 });
        }
    });

    it("restores a stored frame on the next mount", async () => {
        // A first mount with no stored layout starts maximized, so the panel has
        // to be restored down before it has a frame of its own to remember.
        mount();
        await boot({ sceneState: sceneState() });
        const panel = node("ground-track-panel");
        click("ground-track-panel-expand");
        expect(panel.classList.contains("is-maximized")).toBe(false);
        panel.offsetWidth = 480;
        panel.offsetHeight = 360;
        FakeResizeObserver.instances.forEach((observer) => observer.trigger());
        const stored = readMissionPanelState(PANEL_ID);
        expect(stored.maximized).toBe(false);

        panel.style.width = "";
        panel.style.height = "";
        const restored = createGroundTrackPanelActions({});
        restored.update({ sceneState: sceneState(), config: "geo", animTime: MID_WINDOW_MS });
        await settle();

        expect(panel.style.width).toBe(`${stored.width}px`);
        expect(panel.style.height).toBe(`${stored.height}px`);
    });

    it("comes back maximized when that is what was stored", async () => {
        mount();
        await boot({ sceneState: sceneState() });
        const panel = node("ground-track-panel");
        panel.offsetWidth = 480;
        panel.offsetHeight = 360;
        FakeResizeObserver.instances.forEach((observer) => observer.trigger());
        expect(readMissionPanelState(PANEL_ID)?.maximized).toBe(true);

        const restored = createGroundTrackPanelActions({});
        restored.update({ sceneState: sceneState(), config: "geo", animTime: MID_WINDOW_MS });
        await settle();

        expect(panel.classList.contains("is-maximized")).toBe(true);
        expect(Number.parseFloat(panel.style.width)).toBeGreaterThan(480);
    });
});
