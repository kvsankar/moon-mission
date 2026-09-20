import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeEvent, FakeResizeObserver, installFakeDom } from "./helpers/fake-dom.js";
import { createMediaBrowserPanelActions } from "../src/platform/js/app/media-browser-panel.js";

const MISSION_CONFIG = JSON.parse(readFileSync("assets/artemis2/data/config.json", "utf8"));

const PANEL_ELEMENTS = [
    { id: "media-browser-panel-wrapper", tag: "div" },
    { id: "media-browser-panel", tag: "section", parent: "media-browser-panel-wrapper" },
    { id: "mb-header", tag: "div", parent: "media-browser-panel", className: "media-browser-panel__header" },
    { id: "mb-header-controls", tag: "div", parent: "mb-header", className: "media-browser-panel__header-controls" },
    { id: "media-browser-panel-close", tag: "button", parent: "mb-header-controls" },
    { id: "media-browser-stage", tag: "div", parent: "media-browser-panel" },
    { id: "media-browser-stage-empty", tag: "div", parent: "media-browser-stage" },
    { id: "media-browser-image", tag: "img", parent: "media-browser-stage" },
    { id: "media-browser-video", tag: "video", parent: "media-browser-stage" },
    { id: "media-browser-thumbnail-resizer", tag: "div", parent: "media-browser-panel" },
    {
        id: "media-browser-thumbnail-collapse",
        tag: "button",
        parent: "media-browser-thumbnail-resizer",
        className: "media-browser-panel__thumbnail-collapse",
    },
    {
        id: "media-browser-thumbnail-placement-grab",
        tag: "button",
        parent: "media-browser-thumbnail-resizer",
        className: "media-browser-panel__thumbnail-placement-grab",
    },
    {
        id: "media-browser-thumbnail-list",
        tag: "div",
        parent: "media-browser-panel",
        className: "media-browser-panel__thumbnail-strip",
    },
    { id: "media-browser-thumbnail-prev", tag: "button", parent: "media-browser-panel" },
    { id: "media-browser-thumbnail-next", tag: "button", parent: "media-browser-panel" },
    { id: "media-browser-status", tag: "div", parent: "media-browser-panel" },
    { id: "media-browser-filter-bar", tag: "div", parent: "media-browser-panel" },
    { id: "media-browser-filter-drawer", tag: "div", parent: "media-browser-panel" },
];

const PANEL_WIDTH = 900;
const PANEL_HEIGHT = 600;

let dom = null;
let panel = null;

function node(id) {
    return dom.document.getElementById(id);
}

function panelElement() {
    return node("media-browser-panel");
}

function stripSizePx() {
    return Number.parseFloat(
        panelElement().style.getPropertyValue("--media-browser-thumbnail-strip-height"),
    );
}

function placement() {
    return panelElement().dataset.thumbnailStripPlacement;
}

function viewModel(overrides = {}) {
    return {
        panelTitle: "Mission Media",
        activeItem: null,
        thumbnailItems: [
            { id: "a", kind: "photo", title: "A", meta: "1", active: true },
            { id: "b", kind: "photo", title: "B", meta: "2" },
        ],
        filterModel: {},
        navigationModel: {},
        playbackModel: {},
        ...overrides,
    };
}

/** Mounts the panel, opens it and gives it a real layout box. */
function mountPanel() {
    panel = createMediaBrowserPanelActions({ onIntent: vi.fn() });
    panel.setMissionContext({
        configData: MISSION_CONFIG,
        available: true,
        title: "Mission Media",
        mediaCount: 2,
    });
    panel.setPanelState("open");
    panelElement().setBoundingClientRect({ left: 0, top: 0, width: PANEL_WIDTH, height: PANEL_HEIGHT });
    panelElement().clientWidth = PANEL_WIDTH;
    panelElement().clientHeight = PANEL_HEIGHT;
    panel.render(viewModel());
    return panel;
}

function keydown(target, key, overrides = {}) {
    const event = new FakeEvent("keydown", { bubbles: true, cancelable: true });
    Object.assign(event, { key, shiftKey: false, ...overrides });
    target.dispatchEvent(event);
    return event;
}

function pointer(target, type, overrides = {}) {
    const event = new FakeEvent(type, { bubbles: true, cancelable: true });
    Object.assign(event, {
        pointerId: 1,
        button: 0,
        clientX: 0,
        clientY: 0,
        ...overrides,
    });
    event.target = overrides.target || target;
    event.currentTarget = target;
    target.dispatchEvent(event);
    return event;
}

beforeEach(() => {
    FakeResizeObserver.instances = [];
    dom = installFakeDom(PANEL_ELEMENTS, {
        innerWidth: 1600,
        innerHeight: 900,
        ResizeObserver: FakeResizeObserver,
        requestAnimationFrame: (callback) => { callback(0); return 1; },
        cancelAnimationFrame: () => {},
        matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }),
    });
});

afterEach(() => {
    panel = null;
    dom?.restore();
    dom = null;
    vi.restoreAllMocks();
});

describe("the strip placement", () => {
    it("starts along the bottom edge", () => {
        mountPanel();

        expect(placement()).toBe("bottom");
        expect(panelElement().classList.contains("media-browser-panel--thumbnail-strip-bottom")).toBe(true);
        expect(node("media-browser-thumbnail-list").classList.contains("is-horizontal")).toBe(true);
    });

    it.each([
        ["ArrowLeft", "left", true],
        ["ArrowRight", "right", true],
        ["ArrowUp", "top", false],
        ["ArrowDown", "bottom", false],
    ])("moves the strip to %s with the %s arrow", (key, side, vertical) => {
        mountPanel();

        keydown(node("media-browser-thumbnail-placement-grab"), key);

        expect(placement()).toBe(side);
        expect(panelElement().classList.contains(`media-browser-panel--thumbnail-strip-${side}`)).toBe(true);
        expect(node("media-browser-thumbnail-list").classList.contains("is-vertical")).toBe(vertical);
    });

    it("ignores a key that is not a direction", () => {
        mountPanel();

        keydown(node("media-browser-thumbnail-placement-grab"), "x");

        expect(placement()).toBe("bottom");
    });

    it("relabels the paging buttons for a side strip", () => {
        mountPanel();

        keydown(node("media-browser-thumbnail-placement-grab"), "ArrowLeft");

        expect(node("media-browser-thumbnail-prev").textContent).toBe("⌃");
        expect(node("media-browser-thumbnail-prev").title).toBe("Scroll thumbnails up");

        keydown(node("media-browser-thumbnail-placement-grab"), "ArrowDown");
        expect(node("media-browser-thumbnail-prev").textContent).toBe("<");
        expect(node("media-browser-thumbnail-prev").title).toBe("Scroll thumbnails left");
    });

    it("widens a strip that moves to a side from a thin bottom strip", () => {
        // A bottom strip may be shorter than the minimum usable side width.
        mountPanel();
        keydown(node("media-browser-thumbnail-resizer"), "Home");
        const bottomSize = stripSizePx();

        keydown(node("media-browser-thumbnail-placement-grab"), "ArrowRight");

        expect(stripSizePx()).toBeGreaterThan(bottomSize);
    });

    it("builds one drop zone per edge", () => {
        mountPanel();

        const zones = panelElement().children
            .filter((child) => child.classList.contains("media-browser-panel__thumbnail-drop-zone"));
        expect(zones.map((zone) => zone.dataset.thumbnailDropSide).sort())
            .toEqual(["bottom", "left", "right", "top"]);
    });
});

describe("dragging the strip to another edge", () => {
    it("highlights the nearest edge as the pointer moves", () => {
        mountPanel();
        const grab = node("media-browser-thumbnail-placement-grab");

        pointer(grab, "pointerdown");
        pointer(grab, "pointermove", { clientX: 5, clientY: PANEL_HEIGHT / 2 });

        expect(panelElement().dataset.thumbnailDropTarget).toBe("left");
        const leftZone = panelElement().children
            .find((child) => child.dataset?.thumbnailDropSide === "left");
        expect(leftZone.classList.contains("is-target")).toBe(true);
    });

    it("commits the highlighted edge on release", () => {
        mountPanel();
        const grab = node("media-browser-thumbnail-placement-grab");

        pointer(grab, "pointerdown");
        pointer(grab, "pointermove", { clientX: PANEL_WIDTH - 2, clientY: PANEL_HEIGHT / 2 });
        pointer(grab, "pointerup");

        expect(placement()).toBe("right");
        expect(panelElement().classList.contains("is-placing-thumbnails")).toBe(false);
        expect(grab.getAttribute("aria-grabbed")).toBe("false");
    });

    it("marks the grab handle while a drag is in flight", () => {
        mountPanel();
        const grab = node("media-browser-thumbnail-placement-grab");

        pointer(grab, "pointerdown");

        expect(panelElement().classList.contains("is-placing-thumbnails")).toBe(true);
        expect(grab.getAttribute("aria-grabbed")).toBe("true");
    });

    it("keeps the current edge when the drag is cancelled without moving", () => {
        mountPanel();
        const grab = node("media-browser-thumbnail-placement-grab");

        pointer(grab, "pointerdown");
        pointer(grab, "pointercancel");

        expect(placement()).toBe("bottom");
    });

    it("ignores a move from a different pointer", () => {
        mountPanel();
        const grab = node("media-browser-thumbnail-placement-grab");

        pointer(grab, "pointerdown", { pointerId: 1 });
        pointer(grab, "pointermove", { pointerId: 2, clientX: 5, clientY: PANEL_HEIGHT / 2 });

        expect(panelElement().dataset.thumbnailDropTarget).toBe("bottom");
    });

    it("ignores a press from a button other than the primary", () => {
        mountPanel();
        const grab = node("media-browser-thumbnail-placement-grab");

        pointer(grab, "pointerdown", { button: 2 });

        expect(panelElement().classList.contains("is-placing-thumbnails")).toBe(false);
    });

    it("refuses to start a placement drag while the strip is collapsed", () => {
        mountPanel();
        node("media-browser-thumbnail-collapse").dispatchEvent(new FakeEvent("click", { bubbles: true }));
        const grab = node("media-browser-thumbnail-placement-grab");

        pointer(grab, "pointerdown");

        expect(panelElement().classList.contains("is-placing-thumbnails")).toBe(false);
    });
});

describe("resizing the strip with the keyboard", () => {
    it("grows and shrinks a bottom strip with the vertical arrows", () => {
        mountPanel();
        const resizer = node("media-browser-thumbnail-resizer");
        const start = stripSizePx();

        keydown(resizer, "ArrowUp");
        const grown = stripSizePx();
        expect(grown).toBeGreaterThan(start);

        keydown(resizer, "ArrowDown");
        expect(stripSizePx()).toBeLessThan(grown);
    });

    it("takes a larger step while shift is held", () => {
        mountPanel();
        const resizer = node("media-browser-thumbnail-resizer");
        const start = stripSizePx();

        keydown(resizer, "ArrowUp");
        const smallStep = stripSizePx() - start;
        keydown(resizer, "ArrowDown");
        keydown(resizer, "ArrowUp", { shiftKey: true });

        expect(stripSizePx() - start).toBeGreaterThan(smallStep);
    });

    it("reverses the arrow meaning for a side strip", () => {
        mountPanel();
        keydown(node("media-browser-thumbnail-placement-grab"), "ArrowLeft");
        const resizer = node("media-browser-thumbnail-resizer");
        const start = stripSizePx();

        keydown(resizer, "ArrowRight");

        expect(stripSizePx()).toBeGreaterThan(start);
    });

    it("pages the size up and down", () => {
        mountPanel();
        const resizer = node("media-browser-thumbnail-resizer");
        const start = stripSizePx();

        keydown(resizer, "PageUp");
        const paged = stripSizePx();
        expect(paged).toBeGreaterThan(start);

        keydown(resizer, "PageDown");
        expect(stripSizePx()).toBeLessThan(paged);
    });

    it("jumps to the published limits with Home and End", () => {
        mountPanel();
        const resizer = node("media-browser-thumbnail-resizer");

        keydown(resizer, "Home");
        const min = stripSizePx();
        expect(String(min)).toBe(resizer.getAttribute("aria-valuemin"));

        keydown(resizer, "End");
        expect(String(stripSizePx())).toBe(resizer.getAttribute("aria-valuemax"));
        expect(stripSizePx()).toBeGreaterThan(min);
    });

    it("never resizes past the published limits", () => {
        mountPanel();
        const resizer = node("media-browser-thumbnail-resizer");

        for (let index = 0; index < 40; index += 1) keydown(resizer, "PageUp");
        expect(String(stripSizePx())).toBe(resizer.getAttribute("aria-valuemax"));

        for (let index = 0; index < 40; index += 1) keydown(resizer, "PageDown");
        expect(String(stripSizePx())).toBe(resizer.getAttribute("aria-valuemin"));
    });

    it("ignores a key that does not resize", () => {
        mountPanel();
        const resizer = node("media-browser-thumbnail-resizer");
        const start = stripSizePx();

        const event = keydown(resizer, "Tab");

        expect(stripSizePx()).toBe(start);
        expect(event.defaultPrevented).not.toBe(true);
    });

    it("collapses and restores from Enter or Space on the resizer", () => {
        mountPanel();
        const resizer = node("media-browser-thumbnail-resizer");

        keydown(resizer, "Enter");
        expect(panelElement().classList.contains("media-browser-panel--thumbnails-collapsed")).toBe(true);

        keydown(resizer, " ");
        expect(panelElement().classList.contains("media-browser-panel--thumbnails-collapsed")).toBe(false);
    });

    it("refuses to resize while collapsed", () => {
        mountPanel();
        const resizer = node("media-browser-thumbnail-resizer");
        const start = stripSizePx();
        keydown(resizer, "Enter");

        keydown(resizer, "ArrowUp");

        expect(stripSizePx()).toBe(start);
    });
});

describe("resizing the strip with the pointer", () => {
    it("follows an upward drag on a bottom strip", () => {
        mountPanel();
        const resizer = node("media-browser-thumbnail-resizer");
        const start = stripSizePx();

        pointer(resizer, "pointerdown", { clientY: 400 });
        pointer(resizer, "pointermove", { clientY: 360 });

        expect(stripSizePx()).toBeCloseTo(start + 40, 0);
        expect(panelElement().classList.contains("is-resizing-thumbnails")).toBe(true);
    });

    it("follows a rightward drag on a left strip", () => {
        mountPanel();
        keydown(node("media-browser-thumbnail-placement-grab"), "ArrowLeft");
        const resizer = node("media-browser-thumbnail-resizer");
        const start = stripSizePx();

        pointer(resizer, "pointerdown", { clientX: 200 });
        pointer(resizer, "pointermove", { clientX: 240 });

        expect(stripSizePx()).toBeCloseTo(start + 40, 0);
    });

    it("follows a leftward drag on a right strip", () => {
        mountPanel();
        keydown(node("media-browser-thumbnail-placement-grab"), "ArrowRight");
        const resizer = node("media-browser-thumbnail-resizer");
        const start = stripSizePx();

        pointer(resizer, "pointerdown", { clientX: 600 });
        pointer(resizer, "pointermove", { clientX: 560 });

        expect(stripSizePx()).toBeCloseTo(start + 40, 0);
    });

    it("ends the drag on release", () => {
        mountPanel();
        const resizer = node("media-browser-thumbnail-resizer");
        pointer(resizer, "pointerdown", { clientY: 400 });

        pointer(resizer, "pointerup");

        expect(panelElement().classList.contains("is-resizing-thumbnails")).toBe(false);
    });

    it("ignores a move from a different pointer", () => {
        mountPanel();
        const resizer = node("media-browser-thumbnail-resizer");
        const start = stripSizePx();

        pointer(resizer, "pointerdown", { pointerId: 1, clientY: 400 });
        pointer(resizer, "pointermove", { pointerId: 2, clientY: 300 });

        expect(stripSizePx()).toBe(start);
    });

    it("does not start a resize from the collapse control", () => {
        // The control sits inside the resizer, so its press bubbles there.
        mountPanel();

        pointer(node("media-browser-thumbnail-collapse"), "pointerdown", { clientY: 400 });

        expect(panelElement().classList.contains("is-resizing-thumbnails")).toBe(false);
    });

    it("does not start a resize from the placement handle", () => {
        mountPanel();

        pointer(node("media-browser-thumbnail-placement-grab"), "pointerdown", { clientY: 400 });

        expect(panelElement().classList.contains("is-resizing-thumbnails")).toBe(false);
        expect(panelElement().classList.contains("is-placing-thumbnails")).toBe(true);
    });
});

describe("collapsing the strip", () => {
    it("hides the strip and marks the panel", () => {
        mountPanel();

        node("media-browser-thumbnail-collapse").dispatchEvent(new FakeEvent("click", { bubbles: true }));

        expect(panelElement().classList.contains("media-browser-panel--thumbnails-collapsed")).toBe(true);
        expect(node("media-browser-thumbnail-list").hidden).toBe(true);
        expect(node("media-browser-thumbnail-list").getAttribute("aria-hidden")).toBe("true");
    });

    it("restores from a press on the collapsed bar itself", () => {
        mountPanel();
        node("media-browser-thumbnail-collapse").dispatchEvent(new FakeEvent("click", { bubbles: true }));

        const event = new FakeEvent("click", { bubbles: true, cancelable: true });
        event.target = node("media-browser-thumbnail-resizer");
        node("media-browser-thumbnail-resizer").dispatchEvent(event);

        expect(panelElement().classList.contains("media-browser-panel--thumbnails-collapsed")).toBe(false);
    });

    it("ignores a press on the bar while the strip is already open", () => {
        mountPanel();

        const event = new FakeEvent("click", { bubbles: true, cancelable: true });
        event.target = node("media-browser-thumbnail-resizer");
        node("media-browser-thumbnail-resizer").dispatchEvent(event);

        expect(panelElement().classList.contains("media-browser-panel--thumbnails-collapsed")).toBe(false);
    });

    it("turns the disclosure glyph round with the placement", () => {
        mountPanel();
        const button = node("media-browser-thumbnail-collapse");
        const bottomGlyph = button.textContent;

        keydown(node("media-browser-thumbnail-placement-grab"), "ArrowLeft");

        expect(button.textContent).not.toBe(bottomGlyph);
    });
});
