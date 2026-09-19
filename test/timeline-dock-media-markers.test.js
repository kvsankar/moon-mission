import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeEvent, installFakeDom } from "./helpers/fake-dom.js";
import { createTimelineDockController } from "../src/platform/js/app/timeline-dock-controller.js";

const RANGE_START_MS = Date.parse("2026-04-06T00:00:00Z");
const RANGE_END_MS = Date.parse("2026-04-07T00:00:00Z");
const LANE_LEFT = 0;
const LANE_WIDTH = 1000;

const DOCK_ELEMENTS = [
    { id: "timeline-dock", tag: "div" },
    { id: "timeline-slider", tag: "input", parent: "timeline-dock" },
    { id: "timeline-markers", tag: "div", parent: "timeline-dock" },
    { id: "timeline-media-markers", tag: "div", parent: "timeline-dock" },
    { id: "timeline-playhead", tag: "div", parent: "timeline-dock" },
    { id: "timeline-time-labels", tag: "div", parent: "timeline-dock" },
    { id: "timeline-time-click-lane", tag: "div", parent: "timeline-dock" },
    { id: "timeline-scrub-lane", tag: "div", parent: "timeline-dock" },
    { id: "timeline-event-visible-range", tag: "div", parent: "timeline-dock" },
    { id: "timeline-overview", tag: "div", parent: "timeline-dock" },
    { id: "timeline-pan-left", tag: "button", parent: "timeline-dock" },
    { id: "timeline-pan-right", tag: "button", parent: "timeline-dock" },
    { id: "timeline-scale-contract", tag: "button", parent: "timeline-dock" },
    { id: "timeline-scale-reset", tag: "button", parent: "timeline-dock" },
    { id: "timeline-scale-expand", tag: "button", parent: "timeline-dock" },
    { id: "timeline-start-label", tag: "span", parent: "timeline-dock" },
    { id: "timeline-end-label", tag: "span", parent: "timeline-dock" },
    { id: "timeline-mode-label", tag: "div", parent: "timeline-dock" },
    { id: "timeline-current-row", tag: "div", parent: "timeline-dock" },
    { id: "timeline-current-label", tag: "div", parent: "timeline-current-row" },
    { id: "timeline-utc-year-elapsed-label", tag: "span", parent: "timeline-current-row" },
    { id: "timeline-mission-elapsed-label", tag: "span", parent: "timeline-current-row" },
    { id: "timeline-craft-strip", tag: "div", parent: "timeline-dock" },
];

let dom = null;
let hooks = null;

function node(id) {
    return dom.document.getElementById(id);
}

/** Positions the marker lane so pointer hit-testing has a real geometry. */
function layOutLane() {
    node("timeline-media-markers").setBoundingClientRect({
        left: LANE_LEFT,
        top: 100,
        width: LANE_WIDTH,
        height: 24,
    });
    // The scrub lane sits above the marker lane and the two do not overlap;
    // the pointer zone check consults the scrub lane first.
    node("timeline-scrub-lane").setBoundingClientRect({
        left: LANE_LEFT,
        top: 60,
        width: LANE_WIDTH,
        height: 30,
    });
}

function makeController() {
    hooks = {
        onSeekTime: vi.fn(),
        onMarkerSelect: vi.fn(),
        onMarkerHover: vi.fn(),
        onMarkerLeave: vi.fn(),
        onCraftSelect: vi.fn(),
    };
    const controller = createTimelineDockController(hooks);
    controller.setRange({ startTimeMs: RANGE_START_MS, endTimeMs: RANGE_END_MS, stepMs: 1000 });
    controller.setCurrentTime(RANGE_START_MS);
    layOutLane();
    return controller;
}

function markerAt(hoursFromStart, overrides = {}) {
    return {
        id: `m-${hoursFromStart}`,
        title: `Marker ${hoursFromStart}`,
        startTimeMs: RANGE_START_MS + (hoursFromStart * 3600 * 1000),
        mediaKind: "image",
        ...overrides,
    };
}

/** Gives every rendered marker a box centred on its timeline position. */
function layOutMarkers(widthPx = 40) {
    const lane = node("timeline-media-markers");
    for (const child of lane.children) {
        const percent = Number.parseFloat(String(child.style.left || "0"));
        const centre = (percent / 100) * LANE_WIDTH;
        child.setBoundingClientRect({
            left: centre - (widthPx / 2),
            top: 100,
            width: widthPx,
            height: 24,
        });
    }
    return lane.children;
}

function pointerEvent(type, overrides = {}) {
    const event = new FakeEvent(type, { bubbles: true, cancelable: true });
    return Object.assign(event, {
        pointerId: 1,
        pointerType: "mouse",
        button: 0,
        clientX: 0,
        clientY: 112,
        ...overrides,
    });
}

beforeEach(() => {
    dom = installFakeDom(DOCK_ELEMENTS, {
        innerWidth: 1280,
        innerHeight: 800,
        matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    });
});

afterEach(() => {
    dom?.restore();
    dom = null;
    hooks = null;
    vi.restoreAllMocks();
});

describe("the media marker lane", () => {
    it("renders one marker per item inside the visible range", () => {
        const controller = makeController();

        controller.setMediaMarkers([markerAt(2), markerAt(8), markerAt(16)]);

        expect(node("timeline-media-markers").children).toHaveLength(3);
    });

    it("drops a marker outside the visible range", () => {
        const controller = makeController();

        controller.setMediaMarkers([markerAt(2), markerAt(48)]);

        expect(node("timeline-media-markers").children).toHaveLength(1);
    });

    it("ignores an item with no usable time", () => {
        const controller = makeController();

        controller.setMediaMarkers([markerAt(2), { id: "broken", title: "No time" }]);

        expect(node("timeline-media-markers").children).toHaveLength(1);
    });

    it("accepts a Date as the marker time", () => {
        const controller = makeController();

        controller.setMediaMarkers([{
            id: "dated",
            title: "Dated",
            startTime: new Date(RANGE_START_MS + 3600000),
        }]);

        expect(node("timeline-media-markers").children).toHaveLength(1);
    });

    it("carries the kind, selection and estimate state into the class list", () => {
        const controller = makeController();

        controller.setMediaMarkers([
            markerAt(4, { mediaKind: "videoClip", selected: true, durationEstimated: true }),
        ]);

        const marker = node("timeline-media-markers").children[0];
        expect(marker.classList.contains("timeline-dock__media-marker--videoClip")).toBe(true);
        expect(marker.classList.contains("timeline-dock__media-marker--selected")).toBe(true);
        expect(marker.classList.contains("timeline-dock__media-marker--estimated")).toBe(true);
    });

    it("marks an unclickable item disabled", () => {
        const controller = makeController();

        controller.setMediaMarkers([markerAt(4, { clickable: false })]);

        const marker = node("timeline-media-markers").children[0];
        expect(marker.classList.contains("timeline-dock__media-marker--inactive")).toBe(true);
        expect(marker.getAttribute("aria-disabled")).toBe("true");
    });

    it("marks an item outside the ephemeris span", () => {
        const controller = makeController();

        controller.setMediaMarkers([markerAt(4, { preEphemeris: true })]);

        expect(node("timeline-media-markers").children[0]
            .classList.contains("timeline-dock__media-marker--out-of-range")).toBe(true);
    });

    it("flips the preview to the inside at both edges of the lane", () => {
        const controller = makeController();

        controller.setMediaMarkers([markerAt(0.1), markerAt(23.9)]);

        const [first, last] = node("timeline-media-markers").children;
        expect(first.classList.contains("timeline-dock__media-marker--preview-start")).toBe(true);
        expect(last.classList.contains("timeline-dock__media-marker--preview-end")).toBe(true);
    });

    it("indexes every marker so a click can be routed back", () => {
        const controller = makeController();

        controller.setMediaMarkers([markerAt(2), markerAt(8)]);

        const indexes = node("timeline-media-markers").children.map((child) => child.dataset.mediaIndex);
        expect(indexes).toEqual(["0", "1"]);
    });

    it("skips the rebuild when the marker set is unchanged", () => {
        const controller = makeController();
        controller.setMediaMarkers([markerAt(2)]);
        const first = node("timeline-media-markers").children[0];

        controller.setMediaMarkers([markerAt(2)]);

        expect(node("timeline-media-markers").children[0]).toBe(first);
    });

    it("rebuilds when the marker set changes", () => {
        const controller = makeController();
        controller.setMediaMarkers([markerAt(2)]);
        const first = node("timeline-media-markers").children[0];

        controller.setMediaMarkers([markerAt(2), markerAt(6)]);

        expect(node("timeline-media-markers").children[0]).not.toBe(first);
        expect(node("timeline-media-markers").children).toHaveLength(2);
    });

    it("empties the lane for an empty set", () => {
        const controller = makeController();
        controller.setMediaMarkers([markerAt(2)]);

        controller.setMediaMarkers([]);

        expect(node("timeline-media-markers").children).toHaveLength(0);
    });

    it("treats a non-array as an empty set", () => {
        const controller = makeController();
        controller.setMediaMarkers([markerAt(2)]);

        controller.setMediaMarkers("nothing");

        expect(node("timeline-media-markers").children).toHaveLength(0);
    });
});

describe("segment markers", () => {
    it("spans a segment across its own duration", () => {
        const controller = makeController();

        controller.setMediaMarkers([markerAt(4, {
            mediaDisplayMode: "segment",
            endTimeMs: RANGE_START_MS + (8 * 3600 * 1000),
        })]);

        const marker = node("timeline-media-markers").children[0];
        expect(marker.classList.contains("timeline-dock__media-marker--segment")).toBe(true);
    });

    it("clips a segment that starts before the visible range", () => {
        const controller = makeController();

        controller.setMediaMarkers([markerAt(-4, {
            mediaDisplayMode: "segment",
            endTimeMs: RANGE_START_MS + (4 * 3600 * 1000),
        })]);

        expect(node("timeline-media-markers").children[0]
            .classList.contains("timeline-dock__media-marker--segment-clipped-start")).toBe(true);
    });

    it("clips a segment that ends after the visible range", () => {
        const controller = makeController();

        controller.setMediaMarkers([markerAt(20, {
            mediaDisplayMode: "segment",
            endTimeMs: RANGE_END_MS + (4 * 3600 * 1000),
        })]);

        expect(node("timeline-media-markers").children[0]
            .classList.contains("timeline-dock__media-marker--segment-clipped-end")).toBe(true);
    });

    it("drops a segment that ends before the visible range starts", () => {
        const controller = makeController();

        controller.setMediaMarkers([markerAt(-10, {
            mediaDisplayMode: "segment",
            endTimeMs: RANGE_START_MS - (5 * 3600 * 1000),
        })]);

        expect(node("timeline-media-markers").children).toHaveLength(0);
    });

    it("falls back to a point marker when the end is not after the start", () => {
        const controller = makeController();

        controller.setMediaMarkers([markerAt(4, {
            mediaDisplayMode: "segment",
            endTimeMs: RANGE_START_MS + (2 * 3600 * 1000),
        })]);

        expect(node("timeline-media-markers").children[0]
            .classList.contains("timeline-dock__media-marker--segment")).toBe(false);
    });
});

describe("routing a marker click", () => {
    function setup(markers) {
        const controller = makeController();
        controller.bind();
        controller.setMediaMarkers(markers);
        layOutMarkers();
        return controller;
    }

    /** A press and release on the dock, which is the pointer surface. */
    function clickAt(clientX, clientY = 112) {
        const dock = node("timeline-dock");
        const lane = node("timeline-media-markers");
        const target = lane.children.find((child) => {
            const rect = child.getBoundingClientRect();
            return clientX >= rect.left && clientX <= rect.left + rect.width;
        }) || lane;
        for (const type of ["pointerdown", "pointerup"]) {
            const event = pointerEvent(type, { clientX, clientY });
            event.target = target;
            dock.dispatchEvent(event);
        }
    }

    /** Media selection leaves the dock as a document event, not a callback. */
    function watchSelections() {
        const seen = [];
        dom.document.addEventListener("mission-media-marker-select", (event) => seen.push(event.detail));
        return seen;
    }

    it("selects the marker under the pointer", () => {
        setup([markerAt(6), markerAt(18)]);
        const seen = watchSelections();

        clickAt((6 / 24) * LANE_WIDTH);

        expect(seen.at(-1)?.marker).toMatchObject({ id: "m-6" });
    });

    it("prefers a video over an overlapping audio clip", () => {
        // Overlapping markers are ranked so the richer medium wins the click.
        setup([
            markerAt(6, { id: "audio", mediaKind: "audioClip" }),
            markerAt(6, { id: "video", mediaKind: "videoClip" }),
        ]);
        const seen = watchSelections();

        clickAt((6 / 24) * LANE_WIDTH);

        expect(seen.at(-1)?.marker).toMatchObject({ id: "video" });
    });

    it("prefers an audio clip over an overlapping still", () => {
        setup([
            markerAt(6, { id: "still", mediaKind: "image" }),
            markerAt(6, { id: "audio", mediaKind: "audioClip" }),
        ]);
        const seen = watchSelections();

        clickAt((6 / 24) * LANE_WIDTH);

        expect(seen.at(-1)?.marker).toMatchObject({ id: "audio" });
    });

    it("skips a marker that is not clickable", () => {
        setup([markerAt(6, { clickable: false })]);
        const seen = watchSelections();

        clickAt((6 / 24) * LANE_WIDTH);

        expect(seen).toHaveLength(0);
    });

    it("ignores a click above or below the lane", () => {
        setup([markerAt(6)]);
        const seen = watchSelections();

        clickAt((6 / 24) * LANE_WIDTH, 200);

        expect(seen).toHaveLength(0);
    });

    it("ignores a click that misses every marker", () => {
        setup([markerAt(6)]);
        const seen = watchSelections();

        clickAt((20 / 24) * LANE_WIDTH);

        expect(seen).toHaveLength(0);
    });

    it("carries the index and the seek time alongside the marker", () => {
        setup([markerAt(6)]);
        const seen = watchSelections();

        clickAt((6 / 24) * LANE_WIDTH);

        expect(seen.at(-1)).toMatchObject({ index: 0 });
        expect(Number.isFinite(seen.at(-1).timeMs)).toBe(true);
    });
});

describe("the controller with no dock in the page", () => {
    it("returns an inert controller rather than throwing", () => {
        dom.restore();
        dom = installFakeDom();

        const controller = createTimelineDockController({});

        expect(() => {
            controller.bind();
            controller.setRange({ startTimeMs: RANGE_START_MS, endTimeMs: RANGE_END_MS, stepMs: 1000 });
            controller.setCurrentTime(RANGE_START_MS);
            controller.setEvents([]);
            controller.setMediaMarkers([markerAt(2)]);
            controller.setCrafts([]);
            controller.setMode({});
        }).not.toThrow();
    });
});
