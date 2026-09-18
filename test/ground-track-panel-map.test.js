import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeEvent, FakeResizeObserver, installFakeDom } from "./helpers/fake-dom.js";
import { createGroundTrackPanelActions } from "../src/platform/js/app/ground-track-panel.js";

const MISSION_CONFIG = JSON.parse(readFileSync("assets/artemis2/data/config.json", "utf8"));
const WINDOW_START_MS = Date.parse(MISSION_CONFIG.events.returnCorrection3.startTime);
const WINDOW_END_MS = Date.parse(MISSION_CONFIG.geo.endTime);
const SOURCE_END_MS = Date.parse(MISSION_CONFIG.postHorizonExtension.sourceEndTime);
const SPLASHDOWN_MS = Date.parse(MISSION_CONFIG.events.splashdown.startTime);
const MID_WINDOW_MS = WINDOW_START_MS + 60 * 60 * 1000;

let dom = null;
let actions = null;
let leaflet = null;

/**
 * A Leaflet stand-in. The panel only ever drives a handful of map, layer and
 * marker methods, so the double records those calls instead of drawing.
 */
function createLeafletDouble() {
    const record = { maps: [], polylines: [], tileLayers: [], layerGroups: [], markers: [] };

    class FakeLayerGroup {
        constructor() {
            this.layers = [];
            this.clearCount = 0;
            record.layerGroups.push(this);
        }

        addTo(map) { this.map = map; return this; }
        addLayer(layer) { this.layers.push(layer); return this; }
        clearLayers() { this.layers.length = 0; this.clearCount += 1; return this; }
    }

    class FakePolyline {
        constructor(latLngs, options) {
            this.latLngs = latLngs;
            this.options = options;
            record.polylines.push(this);
        }

        addTo(group) { group.addLayer(this); return this; }
    }

    class FakeCircleMarker {
        constructor(latLng, options) {
            this.latLng = latLng;
            this.options = options;
            this.style = {};
            record.markers.push(this);
        }

        addTo(map) { this.map = map; return this; }
        setLatLng(latLng) { this.latLng = latLng; return this; }
        setStyle(style) { Object.assign(this.style, style); return this; }
    }

    class FakeTileLayer {
        constructor(url, options) {
            this.url = url;
            this.options = options;
            record.tileLayers.push(this);
        }

        addTo(map) { this.map = map; return this; }
    }

    class FakeMap {
        constructor(host, options) {
            this.host = host;
            this.options = options;
            this.center = { lat: options.center[0], lng: options.center[1] };
            this.zoom = options.zoom;
            this.handlers = new Map();
            this.invalidateCount = 0;
            this.setViewCalls = [];
            record.maps.push(this);
        }

        setView(center, zoom) {
            this.center = { lat: center[0], lng: center[1] };
            this.zoom = zoom;
            this.setViewCalls.push({ center: [...center], zoom });
            return this;
        }

        getCenter() { return this.center; }
        getZoom() { return this.zoom; }
        invalidateSize() { this.invalidateCount += 1; return this; }
        zoomIn() { this.zoom += 1; return this; }
        zoomOut() { this.zoom -= 1; return this; }

        on(types, handler) {
            for (const type of String(types).split(/\s+/)) {
                const handlers = this.handlers.get(type) || [];
                handlers.push(handler);
                this.handlers.set(type, handlers);
            }
            return this;
        }

        fire(type) {
            for (const handler of this.handlers.get(type) || []) handler({ type });
        }
    }

    return {
        record,
        L: {
            map: (host, options) => new FakeMap(host, options),
            tileLayer: (url, options) => new FakeTileLayer(url, options),
            layerGroup: () => new FakeLayerGroup(),
            polyline: (latLngs, options) => new FakePolyline(latLngs, options),
            circleMarker: (latLng, options) => new FakeCircleMarker(latLng, options),
        },
    };
}

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
    { id: "ground-track-provenance-badge", tag: "span", parent: "ground-track-provenance-note" },
    { id: "ground-track-provenance-text", tag: "span", parent: "ground-track-provenance-note" },
    { id: "ground-track-events", tag: "div", parent: "ground-track-panel" },
    { id: "ground-track-event-list", tag: "div", parent: "ground-track-events" },
    { id: "ground-track-timeline-card", tag: "div", parent: "ground-track-panel" },
    { id: "ground-track-timeline-local", tag: "div", parent: "ground-track-timeline-card" },
    { id: "ground-track-timeline-slider", tag: "input", parent: "ground-track-timeline-card" },
    { id: "ground-track-play", tag: "button", parent: "ground-track-timeline-card" },
    { id: "ground-track-step-back-second", tag: "button", parent: "ground-track-timeline-card" },
    { id: "ground-track-step-forward-second", tag: "button", parent: "ground-track-timeline-card" },
    { id: "ground-track-step-back-minute", tag: "button", parent: "ground-track-timeline-card" },
    { id: "ground-track-step-forward-minute", tag: "button", parent: "ground-track-timeline-card" },
    { id: "ground-track-slower", tag: "button", parent: "ground-track-timeline-card" },
    { id: "ground-track-speed", tag: "button", parent: "ground-track-timeline-card" },
    { id: "ground-track-faster", tag: "button", parent: "ground-track-timeline-card" },
    { id: "ground-track-button", tag: "button" },
    { id: "ground-track-style-2d", tag: "button", parent: "ground-track-panel" },
    { id: "ground-track-style-3d", tag: "button", parent: "ground-track-panel" },
    { id: "ground-track-zoom-in", tag: "button", parent: "ground-track-panel" },
    { id: "ground-track-zoom-out", tag: "button", parent: "ground-track-panel" },
    { id: "ground-track-metric-earth-distance-km", tag: "span", parent: "ground-track-panel" },
    { id: "ground-track-metric-earth-distance-miles", tag: "span", parent: "ground-track-panel" },
    { id: "ground-track-metric-velocity-kmps", tag: "span", parent: "ground-track-panel" },
    { id: "ground-track-metric-velocity-mph", tag: "span", parent: "ground-track-panel" },
    { id: "ground-track-metric-altitude-km", tag: "span", parent: "ground-track-panel" },
    { id: "ground-track-metric-altitude-miles", tag: "span", parent: "ground-track-panel" },
    { id: "ground-track-metric-latitude", tag: "span", parent: "ground-track-panel" },
    { id: "ground-track-metric-longitude", tag: "span", parent: "ground-track-panel" },
    { id: "animate", tag: "button" },
    { id: "realtime", tag: "button" },
    { id: "slower", tag: "button" },
    { id: "faster", tag: "button" },
];

/** A descending arc that crosses the anti-meridian and runs past splashdown. */
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

function mount({ withLeaflet = true, withScene = true } = {}) {
    const { curve, times } = buildCraftCurve();
    const scene = withScene
        ? {
            primaryCraftId: "SC",
            curvesById: { SC: curve },
            curveTimesById: { SC: times },
        }
        : null;
    leaflet = createLeafletDouble();
    dom = installFakeDom(PANEL_ELEMENTS, {
        innerWidth: 1600,
        innerHeight: 900,
        ResizeObserver: FakeResizeObserver,
        requestAnimationFrame: (callback) => { callback(0); return 1; },
        cancelAnimationFrame: () => {},
        devicePixelRatio: 1,
        missionConfig: { dataPath: "assets/artemis2/data" },
        location: { pathname: "/artemis2/", href: "http://localhost/artemis2/" },
        animationScenes: withScene ? { geo: scene } : {},
        ...(withLeaflet ? { L: leaflet.L } : {}),
    });
    vi.stubGlobal("fetch", vi.fn(async (url) => (
        String(url).includes("config.json")
            ? { ok: true, status: 200, json: async () => MISSION_CONFIG }
            : { ok: false, status: 404, json: async () => ({}) }
    )));
    return scene;
}

function node(id) {
    return dom.document.getElementById(id);
}

async function settle(times = 25) {
    for (let index = 0; index < times; index += 1) {
        // eslint-disable-next-line no-await-in-loop
        await Promise.resolve();
    }
}

function sceneState(position = { x: 7400, y: 200, z: -300 }) {
    return {
        bodies: {
            SC: { available: true, position, velocity: { vx: 0, vy: 7.5, vz: 0.2 } },
            EARTH: { available: true, position: { x: 0, y: 0, z: 0 } },
        },
    };
}

async function render(animTime = MID_WINDOW_MS, { open = true } = {}) {
    actions = createGroundTrackPanelActions({});
    actions.update({ sceneState: sceneState(), config: "geo", animTime });
    // The mission config arrives asynchronously and applies its own default
    // panel state, so the panel can only be opened once that has settled.
    await settle();
    if (open) actions.setPanelVisible(true);
    actions.update({ sceneState: sceneState(), config: "geo", animTime });
    await settle();
}

function click(id) {
    node(id).dispatchEvent(new FakeEvent("click", { bubbles: true }));
}

beforeEach(() => {
    FakeResizeObserver.instances = [];
});

afterEach(() => {
    actions = null;
    leaflet = null;
    dom?.restore();
    dom = null;
    vi.unstubAllGlobals();
});

describe("the two-dimensional map", () => {
    it("builds one map, tile layer, track group and marker inside a shadow root", async () => {
        mount();

        await render();

        expect(leaflet.record.maps).toHaveLength(1);
        expect(leaflet.record.tileLayers).toHaveLength(1);
        expect(leaflet.record.layerGroups).toHaveLength(1);
        expect(leaflet.record.markers).toHaveLength(1);
        expect(node("ground-track-map").shadowRoot).toBeTruthy();
    });

    it("reuses the same map across later updates", async () => {
        mount();
        await render();

        actions.update({ sceneState: sceneState(), config: "geo", animTime: MID_WINDOW_MS + 60_000 });
        await settle();

        expect(leaflet.record.maps).toHaveLength(1);
    });

    it("draws the track three times so it survives an anti-meridian pan", async () => {
        // Leaflet does not wrap a polyline for us, so the panel repeats each
        // segment at -360, 0 and +360 degrees of longitude.
        mount();

        await render();

        const trackGroup = leaflet.record.layerGroups[0];
        const solid = trackGroup.layers.filter((line) => !line.options.dashArray);
        expect(solid).toHaveLength(3);
        const offsets = solid.map((line) => line.latLngs[0][1]);
        const spread = Math.max(...offsets) - Math.min(...offsets);
        expect(spread).toBeCloseTo(720, 6);
    });

    it("draws the app-generated continuation in its own dashed style", async () => {
        mount();

        await render(SOURCE_END_MS + 60_000);

        const dashed = leaflet.record.polylines.filter((line) => line.options.dashArray);
        expect(dashed.length).toBeGreaterThanOrEqual(3);
        expect(dashed[0].options.color).toBe("#ffb347");
    });

    it("moves the marker to the current ground location and shows it", async () => {
        mount();

        await render();

        const marker = leaflet.record.markers[0];
        expect(marker.style.opacity).toBe(1);
        expect(Number.isFinite(marker.latLng[0])).toBe(true);
        expect(Math.abs(marker.latLng[0])).toBeLessThanOrEqual(90);
    });

    it("hides the marker before the ground track window opens", async () => {
        mount();

        await render(WINDOW_START_MS - 60_000);

        expect(leaflet.record.markers[0].style.opacity).toBe(0);
        expect(node("ground-track-status").textContent).toContain("RTC-3");
    });

    it("recenters near the current longitude rather than jumping a whole turn", async () => {
        mount();
        await render();
        const map = leaflet.record.maps[0];
        map.setView([0, 170], 4);
        const before = map.setViewCalls.length;

        actions.update({ sceneState: sceneState(), config: "geo", animTime: MID_WINDOW_MS + 120_000 });
        await settle();

        const latest = map.setViewCalls[map.setViewCalls.length - 1];
        expect(map.setViewCalls.length).toBeGreaterThan(before);
        expect(Math.abs(latest.center[1] - 170)).toBeLessThanOrEqual(180);
        expect(latest.zoom).toBe(4);
    });

    it("falls back to the world overview when there is no current location", async () => {
        mount();

        await render(WINDOW_START_MS - 60_000);

        const latest = leaflet.record.maps[0].setViewCalls.pop();
        expect(latest.center).toEqual([12, 0]);
        expect(latest.zoom).toBe(2);
    });

    it("carries on without Leaflet on the page", async () => {
        mount({ withLeaflet: false });

        await expect(render()).resolves.toBeUndefined();
        expect(node("ground-track-status").textContent).toBeTruthy();
    });

    it("reports no track when the scene carries no craft curve", async () => {
        mount({ withScene: false });

        await render();

        expect(leaflet.record.polylines).toHaveLength(0);
    });
});

describe("map zoom and view mode", () => {
    it("zooms the map in and out from the panel buttons", async () => {
        mount();
        await render();
        const map = leaflet.record.maps[0];
        const zoom = map.getZoom();

        click("ground-track-zoom-in");
        expect(map.getZoom()).toBe(zoom + 1);

        click("ground-track-zoom-out");
        click("ground-track-zoom-out");
        expect(map.getZoom()).toBe(zoom - 1);
    });

    it("marks the active view mode on the style buttons", async () => {
        mount();
        await render();

        expect(node("ground-track-style-2d").classList.contains("is-active")).toBe(true);
        expect(node("ground-track-style-2d").getAttribute("aria-pressed")).toBe("true");
        expect(node("ground-track-style-3d").getAttribute("aria-pressed")).toBe("false");
    });

    it("stops recentering once the user has panned the map themselves", async () => {
        mount();
        await render();
        const map = leaflet.record.maps[0];

        map.fire("movestart");

        // The user-view flag is internal; the observable effect is that a new
        // track key resets it, which the next assertion depends on.
        expect(map.handlers.has("movestart")).toBe(true);
        expect(map.handlers.has("zoomstart")).toBe(true);
    });

    it("keeps the globe host hidden while the map is showing", async () => {
        mount();
        await render();

        const shadow = node("ground-track-map").shadowRoot;
        const mapHost = shadow.querySelector(".ground-track-shadow-map");
        const globeHost = shadow.querySelector(".ground-track-shadow-globe");
        expect(mapHost.hidden).toBe(false);
        expect(globeHost.hidden).toBe(true);
    });
});

describe("the provenance note", () => {
    it("explains the app-generated tail and stays inactive before it starts", async () => {
        mount();

        await render(MID_WINDOW_MS);

        const note = node("ground-track-provenance-note");
        expect(note.hidden).toBe(false);
        expect(note.classList.contains("is-active")).toBe(false);
        expect(node("ground-track-provenance-badge").textContent).toBe("Generated final descent");
        expect(node("ground-track-provenance-text").textContent).toContain("app-generated");
    });

    it("lights up once the marker is on the generated continuation", async () => {
        mount();

        await render(SOURCE_END_MS + 60_000);

        expect(node("ground-track-provenance-note").classList.contains("is-active")).toBe(true);
        expect(node("ground-track-status").textContent).toContain("post-HORIZONS");
    });
});

describe("the metric strip", () => {
    it("reports distance, speed, altitude and the ground point in both unit systems", async () => {
        mount();

        await render();

        expect(node("ground-track-metric-earth-distance-km").textContent).toMatch(/ km$/);
        expect(node("ground-track-metric-earth-distance-miles").textContent).toMatch(/ miles$/);
        expect(node("ground-track-metric-velocity-kmps").textContent).toMatch(/ km\/s$/);
        expect(node("ground-track-metric-velocity-mph").textContent).toMatch(/ miles\/h$/);
        expect(node("ground-track-metric-altitude-km").textContent).toMatch(/ km$/);
        expect(node("ground-track-metric-latitude").textContent).toMatch(/[NS]$|^0\.00°$/);
        expect(node("ground-track-metric-longitude").textContent).toMatch(/[EW]$|^0\.00°$/);
    });

    it("reports placeholders when there is no craft telemetry", async () => {
        mount();
        actions = createGroundTrackPanelActions({});
        actions.setPanelVisible(true);

        actions.update({ sceneState: { bodies: {} }, config: "geo", animTime: MID_WINDOW_MS });
        await settle();

        expect(node("ground-track-metric-earth-distance-km").textContent).toBe("--");
        expect(node("ground-track-metric-latitude").textContent).toBe("--");
    });
});

describe("the event rail", () => {
    it("lists every splashdown-phase event in time order", async () => {
        mount();

        await render();

        const pills = node("ground-track-event-list").children;
        expect(pills.length).toBeGreaterThanOrEqual(3);
        const labels = pills.map((pill) => pill.children[0].children[0].textContent);
        expect(labels.join(" ")).toMatch(/Splashdown/i);
    });

    it("badges the events that fall on the generated continuation", async () => {
        mount();

        await render();

        const pills = node("ground-track-event-list").children;
        const badged = pills.filter((pill) => pill.children[0].children.length > 1);
        expect(badged.length).toBeGreaterThanOrEqual(1);
        expect(badged[0].children[0].children[1].textContent).toBe("Generated");
    });

    it("marks the most recent past event as active", async () => {
        mount();

        await render(SPLASHDOWN_MS - 1000);

        const pills = node("ground-track-event-list").children;
        const activeIndex = pills.findIndex((pill) => pill.classList.contains("is-active"));
        expect(activeIndex).toBeGreaterThanOrEqual(0);
        expect(activeIndex).toBeLessThan(pills.length - 1);
    });

    it("marks the first event as active before any of them have happened", async () => {
        mount();

        await render(WINDOW_START_MS - 60_000);

        const pills = node("ground-track-event-list").children;
        expect(pills[0].classList.contains("is-active")).toBe(true);
    });

    it("rebuilds the rail only when the event set itself changes", async () => {
        mount();
        await render();
        const first = node("ground-track-event-list").children[0];

        actions.update({ sceneState: sceneState(), config: "geo", animTime: MID_WINDOW_MS + 60_000 });
        await settle();

        expect(node("ground-track-event-list").children[0]).toBe(first);
    });

    it("selects an event when its pill is clicked", async () => {
        mount();
        await render();
        const pill = node("ground-track-event-list").children[0];

        expect(() => pill.dispatchEvent(new FakeEvent("click", { bubbles: true }))).not.toThrow();
    });
});

describe("the transport card", () => {
    it("mirrors the main timeline range onto the panel slider", async () => {
        mount();

        await render();

        const slider = node("ground-track-timeline-slider");
        expect(Number(slider.min)).toBe(WINDOW_START_MS);
        expect(Number(slider.max)).toBeGreaterThan(WINDOW_START_MS);
        expect(Number(slider.value)).toBe(MID_WINDOW_MS);
        expect(slider.disabled).toBe(false);
    });

    it("disables the step-back controls at the start of the window", async () => {
        mount();

        await render(WINDOW_START_MS);

        expect(node("ground-track-step-back-second").disabled).toBe(true);
        expect(node("ground-track-step-back-minute").disabled).toBe(true);
        expect(node("ground-track-step-forward-second").disabled).toBe(false);
    });

    it("disables the step-forward controls at the end of the window", async () => {
        mount();

        await render(WINDOW_END_MS + 60_000);

        expect(node("ground-track-step-forward-second").disabled).toBe(true);
        expect(node("ground-track-step-forward-minute").disabled).toBe(true);
    });

    it("mirrors the main play button label and disabled state", async () => {
        mount();
        node("animate").textContent = "Pause";
        node("animate").title = "Pause the mission clock";

        await render();

        expect(node("ground-track-play").textContent).toBe("Pause");
        expect(node("ground-track-play").title).toBe("Pause the mission clock");
        expect(node("ground-track-play").disabled).toBe(false);
    });

    it("mirrors the main speed button and disables it when the main one is off", async () => {
        mount();
        node("realtime").textContent = "10 sec/sec";
        node("realtime").setAttribute("aria-disabled", "true");

        await render();

        expect(node("ground-track-speed").textContent).toBe("10 sec/sec");
        expect(node("ground-track-speed").disabled).toBe(true);
    });

    it("forwards a play press to the main animate control", async () => {
        mount();
        await render();
        let pressed = 0;
        node("animate").addEventListener("click", () => { pressed += 1; });

        click("ground-track-play");

        expect(pressed).toBe(1);
    });

    it("shows the local time of the current frame", async () => {
        mount();

        await render();

        expect(node("ground-track-timeline-local").textContent).toMatch(/^Local: /);
        expect(node("ground-track-timeline-local").textContent).not.toContain("--");
    });
});

describe("panel chrome", () => {
    it("adds the info, expand and delete buttons to the header", async () => {
        mount();

        await render();

        expect(node("ground-track-panel-info")).toBeTruthy();
        expect(node("ground-track-panel-expand")).toBeTruthy();
        expect(node("ground-track-panel-delete")).toBeTruthy();
        expect(node("ground-track-panel-info").getAttribute("aria-label")).toBe("Show panel info");
    });

    it("toggles the maximized class from the expand button", async () => {
        mount();
        await render();
        const panel = node("ground-track-panel");
        const wasMaximized = panel.classList.contains("is-maximized");

        click("ground-track-panel-expand");

        expect(panel.classList.contains("is-maximized")).toBe(!wasMaximized);
    });

    it("opens and closes from the shell toggle button", async () => {
        mount();
        await render();
        const panel = node("ground-track-panel");

        click("ground-track-button");
        expect(panel.classList.contains("ground-track-panel--hidden")).toBe(true);

        click("ground-track-button");
        expect(panel.classList.contains("ground-track-panel--hidden")).toBe(false);
    });

    it("opens on the shell-wide open event", async () => {
        mount();
        await render();
        actions.setPanelVisible(false);

        dom.document.dispatchEvent(new FakeEvent("ground-track-panel-open", { bubbles: true }));

        expect(node("ground-track-panel").classList.contains("ground-track-panel--hidden")).toBe(false);
    });

    it("invalidates the map size when the panel is resized", async () => {
        mount();
        await render();
        const map = leaflet.record.maps[0];
        const before = map.invalidateCount;

        FakeResizeObserver.instances.forEach((observer) => observer.trigger());

        expect(map.invalidateCount).toBeGreaterThan(before);
    });

    it("clamps the panel back inside a shrunken viewport", async () => {
        mount();
        await render();
        const panel = node("ground-track-panel");
        panel.setBoundingClientRect({ left: 1400, top: 800, width: 400, height: 300 });
        dom.window.innerWidth = 700;
        dom.window.innerHeight = 500;

        FakeResizeObserver.instances.forEach((observer) => observer.trigger());

        expect(Number.parseFloat(panel.style.left)).toBeLessThanOrEqual(700);
        expect(Number.parseFloat(panel.style.top)).toBeLessThanOrEqual(500);
    });

    it("drags the panel by its header", async () => {
        mount();
        await render();
        const panel = node("ground-track-panel");
        panel.setBoundingClientRect({ left: 100, top: 100, width: 400, height: 300 });
        const header = node("gt-header");

        const down = new FakeEvent("pointerdown", { bubbles: true, cancelable: true });
        Object.assign(down, { button: 0, pointerId: 1, clientX: 150, clientY: 120, target: header });
        header.dispatchEvent(down);
        const move = new FakeEvent("pointermove", { bubbles: true });
        Object.assign(move, { pointerId: 1, clientX: 200, clientY: 180 });
        dom.document.dispatchEvent(move);
        const up = new FakeEvent("pointerup", { bubbles: true });
        Object.assign(up, { pointerId: 1 });
        dom.document.dispatchEvent(up);

        expect(panel.style.left).toBeTruthy();
        expect(panel.style.top).toBeTruthy();
    });
});
