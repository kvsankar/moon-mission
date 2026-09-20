import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeEvent, FakeResizeObserver, installFakeDom } from "./helpers/fake-dom.js";
import {
    MEDIA_BROWSER_PANEL_ID,
    createMediaBrowserPanelActions,
} from "../src/platform/js/app/media-browser-panel.js";
import { readMissionPanelState } from "../src/platform/js/app/panel-layout-store.js";

const MISSION_CONFIG = JSON.parse(readFileSync("assets/artemis2/data/config.json", "utf8"));

const PANEL_ELEMENTS = [
    { id: "media-browser-panel-wrapper", tag: "div" },
    { id: "media-browser-panel", tag: "section", parent: "media-browser-panel-wrapper" },
    { id: "mb-header", tag: "div", parent: "media-browser-panel", className: "media-browser-panel__header" },
    { id: "mb-header-controls", tag: "div", parent: "mb-header", className: "media-browser-panel__header-controls" },
    { id: "media-browser-panel-close", tag: "button", parent: "mb-header-controls" },
    { id: "media-browser-panel-expand", tag: "button", parent: "mb-header-controls" },
    { id: "media-browser-stage", tag: "div", parent: "media-browser-panel" },
    { id: "media-browser-stage-empty", tag: "div", parent: "media-browser-stage" },
    { id: "media-browser-image", tag: "img", parent: "media-browser-stage" },
    { id: "media-browser-thumbnail-resizer", tag: "div", parent: "media-browser-panel" },
    {
        id: "media-browser-thumbnail-list",
        tag: "div",
        parent: "media-browser-panel",
        className: "media-browser-panel__thumbnail-strip",
    },
    { id: "media-browser-status", tag: "div", parent: "media-browser-panel" },
    { id: "media-browser-filter-bar", tag: "div", parent: "media-browser-panel" },
    { id: "media-browser-filter-drawer", tag: "div", parent: "media-browser-panel" },
    { id: "media-browser-item-title", tag: "h3", parent: "media-browser-panel" },
];

const VIEWPORT_WIDTH = 1600;
const VIEWPORT_HEIGHT = 900;

const THUMBNAIL_ITEM = {
    id: "a",
    kind: "videoClip",
    title: "Crew Update",
    meta: "MET 03:12",
    metaFull: "MET 03:12:44",
    localTimeLabel: "09 Apr 14:12",
    utcTimeLabel: "09 Apr 18:12 UTC",
    cameraLabel: "Nikon Z 9",
    photographer: "Crew",
    location: "Cislunar space",
    sourceLabel: "NASA",
    metadataLabel: "AI: Earth over the lunar limb",
    stageBadge: "Hero",
    active: true,
};

let dom = null;
let panel = null;

function node(id) {
    return dom.document.getElementById(id);
}

function panelElement() {
    return node("media-browser-panel");
}

function pxOf(value) {
    return Number.parseFloat(String(value || "0"));
}

function frame() {
    const element = panelElement();
    return {
        x: pxOf(element.style.left),
        y: pxOf(element.style.top),
        width: pxOf(element.style.width),
        height: pxOf(element.style.height),
    };
}

function storedState() {
    return readMissionPanelState(MEDIA_BROWSER_PANEL_ID);
}

function viewModel(overrides = {}) {
    return {
        panelTitle: "Mission Media",
        activeItem: null,
        thumbnailItems: [THUMBNAIL_ITEM],
        filterModel: {},
        navigationModel: {},
        playbackModel: {},
        ...overrides,
    };
}

function mountPanel({ open = true } = {}) {
    panel = createMediaBrowserPanelActions({ onIntent: vi.fn() });
    panel.setMissionContext({
        configData: MISSION_CONFIG,
        available: true,
        title: "Mission Media",
        mediaCount: 1,
    });
    if (open) panel.setPanelState("open");
    panel.render(viewModel());
    return panel;
}

function pointer(target, type, overrides = {}) {
    const event = new FakeEvent(type, { bubbles: true, cancelable: true });
    Object.assign(event, { pointerId: 1, button: 0, clientX: 0, clientY: 0, ...overrides });
    target.dispatchEvent(event);
    return event;
}

beforeEach(() => {
    FakeResizeObserver.instances = [];
    dom = installFakeDom(PANEL_ELEMENTS, {
        innerWidth: VIEWPORT_WIDTH,
        innerHeight: VIEWPORT_HEIGHT,
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

describe("the default panel frame", () => {
    it("places the panel at the published left margin", () => {
        mountPanel();

        expect(frame().x).toBeGreaterThan(0);
        expect(frame().width).toBeGreaterThan(0);
        expect(frame().height).toBeGreaterThan(0);
    });

    it("keeps the whole panel inside the viewport", () => {
        mountPanel();

        const { x, y, width, height } = frame();
        expect(x + width).toBeLessThanOrEqual(VIEWPORT_WIDTH);
        expect(y + height).toBeLessThanOrEqual(VIEWPORT_HEIGHT);
    });

    it("narrows the default frame on a narrow viewport", () => {
        mountPanel();
        const wideWidth = frame().width;
        panel = null;
        dom.restore();

        dom = installFakeDom(PANEL_ELEMENTS, {
            innerWidth: 520,
            innerHeight: VIEWPORT_HEIGHT,
            ResizeObserver: FakeResizeObserver,
            requestAnimationFrame: (callback) => { callback(0); return 1; },
            cancelAnimationFrame: () => {},
            matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }),
        });
        mountPanel();

        expect(frame().width).toBeLessThan(wideWidth);
    });

    it("marks the frame as managed by the default layout", () => {
        mountPanel();

        expect(panelElement().dataset.defaultLayoutManaged).toBe("true");
    });
});

describe("dragging the panel", () => {
    /** Pointer capture keeps the whole gesture on the header element. */
    function dragTo(clientX, clientY) {
        const header = node("mb-header");
        pointer(header, "pointerdown", { clientX: 100, clientY: 100 });
        pointer(header, "pointermove", { clientX, clientY });
        pointer(header, "pointerup", { clientX, clientY });
    }

    it("moves the panel by the pointer delta", () => {
        mountPanel();
        panelElement().setBoundingClientRect({ left: 20, top: 100, width: 400, height: 300 });
        panelElement().offsetWidth = 400;
        panelElement().offsetHeight = 300;
        const before = frame();

        dragTo(160, 140);

        const after = frame();
        expect(after.x).not.toBe(before.x);
        expect(after.y).not.toBe(before.y);
    });

    it("never drags the panel off the left or top edge", () => {
        mountPanel();
        panelElement().offsetWidth = 400;
        panelElement().offsetHeight = 300;

        dragTo(-5000, -5000);

        expect(frame().x).toBeGreaterThanOrEqual(0);
        expect(frame().y).toBeGreaterThanOrEqual(0);
    });

    it("never drags the panel off the right or bottom edge", () => {
        mountPanel();
        panelElement().offsetWidth = 400;
        panelElement().offsetHeight = 300;

        dragTo(9000, 9000);

        expect(frame().x + 400).toBeLessThanOrEqual(VIEWPORT_WIDTH);
        expect(frame().y + 300).toBeLessThanOrEqual(VIEWPORT_HEIGHT);
    });

    it("hands the panel over to manual layout once the user moves it", () => {
        mountPanel();
        panelElement().offsetWidth = 400;
        panelElement().offsetHeight = 300;

        dragTo(300, 300);

        expect(panelElement().dataset.defaultLayoutManaged).toBe("false");
    });
});

describe("persisting the layout", () => {
    it("writes the frame and strip state when the panel moves", () => {
        mountPanel();
        panelElement().offsetWidth = 420;
        panelElement().offsetHeight = 320;

        pointer(node("mb-header"), "pointerdown", { clientX: 100, clientY: 100 });
        pointer(node("mb-header"), "pointermove", { clientX: 260, clientY: 240 });
        pointer(node("mb-header"), "pointerup", { clientX: 260, clientY: 240 });

        const stored = storedState();
        expect(stored).toBeTruthy();
        expect(stored.state).toBe("open");
        expect(Number.isFinite(stored.x)).toBe(true);
        expect(Number.isFinite(stored.y)).toBe(true);
        expect(stored.thumbnailStripPlacement).toBe("bottom");
        expect(stored.thumbnailStripCollapsed).toBe(false);
    });

    it("records the closed state", () => {
        mountPanel();

        panel.setPanelState("closed");

        expect(storedState()?.state).toBe("closed");
    });

    it("restores a stored frame on the next mount", () => {
        mountPanel();
        panelElement().offsetWidth = 420;
        panelElement().offsetHeight = 320;
        pointer(node("mb-header"), "pointerdown", { clientX: 100, clientY: 100 });
        pointer(node("mb-header"), "pointermove", { clientX: 320, clientY: 260 });
        pointer(node("mb-header"), "pointerup", { clientX: 320, clientY: 260 });
        const saved = storedState();

        panelElement().style.left = "";
        panelElement().style.top = "";
        panel = createMediaBrowserPanelActions({ onIntent: vi.fn() });
        panel.setMissionContext({ configData: MISSION_CONFIG, available: true });

        expect(pxOf(panelElement().style.left)).toBe(saved.x);
        expect(pxOf(panelElement().style.top)).toBe(saved.y);
    });

    it("restores the stored strip placement and collapse on the next mount", () => {
        mountPanel();
        const grab = node("media-browser-thumbnail-resizer");
        const event = new FakeEvent("keydown", { bubbles: true, cancelable: true });
        event.key = "Enter";
        grab.dispatchEvent(event);
        expect(storedState()?.thumbnailStripCollapsed).toBe(true);

        panel = createMediaBrowserPanelActions({ onIntent: vi.fn() });
        panel.setMissionContext({ configData: MISSION_CONFIG, available: true });
        panel.setPanelState("open");
        panel.render(viewModel());

        expect(panelElement().classList.contains("media-browser-panel--thumbnails-collapsed")).toBe(true);
    });
});

describe("maximizing the panel", () => {
    it("fills the viewport and restores the previous frame", () => {
        mountPanel();
        panelElement().offsetWidth = 420;
        panelElement().offsetHeight = 320;
        const before = frame();

        node("media-browser-panel-expand").dispatchEvent(new FakeEvent("click", { bubbles: true }));
        const maximized = frame();
        expect(panelElement().classList.contains("is-maximized")).toBe(true);
        expect(maximized.width).toBeGreaterThan(before.width);

        node("media-browser-panel-expand").dispatchEvent(new FakeEvent("click", { bubbles: true }));
        expect(panelElement().classList.contains("is-maximized")).toBe(false);
    });

    it("records the maximized state", () => {
        mountPanel();

        node("media-browser-panel-expand").dispatchEvent(new FakeEvent("click", { bubbles: true }));

        expect(storedState()?.maximized).toBe(true);
    });
});

describe("the thumbnail hover popover", () => {
    function hoverFirstCard() {
        const card = node("media-browser-thumbnail-list").children[0];
        card.setBoundingClientRect({ left: 40, top: 400, width: 120, height: 90 });
        panelElement().setBoundingClientRect({ left: 0, top: 0, width: 900, height: 600 });
        pointer(card, "pointerenter");
        return card;
    }

    it("opens on hover with the item title and kind", () => {
        mountPanel();

        hoverFirstCard();

        const popover = node("media-browser-thumbnail-popover");
        expect(popover.hidden).toBe(false);
        expect(popover.children[0].textContent).toBe("Crew Update");
        expect(popover.children[1].textContent).toBe("Video • Hero");
    });

    it("lists every detail the item carries", () => {
        mountPanel();

        hoverFirstCard();

        const rows = node("media-browser-thumbnail-popover").children[2].children
            .map((child) => child.textContent);
        expect(rows).toContain("MET 03:12:44");
        expect(rows).toContain("Nikon Z 9");
        expect(rows).toContain("Cislunar space");
        expect(rows).toContain("NASA");
        expect(rows).toContain("Earth over the lunar limb");
    });

    it("omits a row the item has no value for", () => {
        mountPanel();
        panel.render(viewModel({
            thumbnailItems: [{ id: "a", kind: "image", title: "Bare", active: true }],
        }));

        hoverFirstCard();

        const rows = node("media-browser-thumbnail-popover").children[2].children;
        expect(rows).toHaveLength(0);
    });

    it("closes when the pointer leaves", () => {
        mountPanel();
        const card = hoverFirstCard();

        pointer(card, "pointerleave");

        expect(node("media-browser-thumbnail-popover").hidden).toBe(true);
    });

    it("opens on keyboard focus and closes on blur", () => {
        mountPanel();
        const card = node("media-browser-thumbnail-list").children[0];

        card.dispatchEvent(new FakeEvent("focus", { bubbles: false }));
        expect(node("media-browser-thumbnail-popover").hidden).toBe(false);

        card.dispatchEvent(new FakeEvent("blur", { bubbles: false }));
        expect(node("media-browser-thumbnail-popover").hidden).toBe(true);
    });

    it("reuses one popover across hovers", () => {
        mountPanel();
        hoverFirstCard();
        const first = node("media-browser-thumbnail-popover");

        hoverFirstCard();

        expect(node("media-browser-thumbnail-popover")).toBe(first);
    });

    it("keeps the popover inside the panel", () => {
        mountPanel();
        const card = node("media-browser-thumbnail-list").children[0];
        panelElement().setBoundingClientRect({ left: 0, top: 0, width: 400, height: 300 });
        card.setBoundingClientRect({ left: 360, top: 250, width: 120, height: 90 });

        pointer(card, "pointerenter");

        const popover = node("media-browser-thumbnail-popover");
        expect(pxOf(popover.style.left)).toBeGreaterThanOrEqual(0);
        expect(pxOf(popover.style.top)).toBeGreaterThanOrEqual(0);
    });

    it("gives every card a label built from its metadata", () => {
        mountPanel();

        const label = node("media-browser-thumbnail-list").children[0].getAttribute("aria-label");
        expect(label).toContain("Crew Update");
        expect(label).toContain("Local 09 Apr 14:12");
        expect(label).toContain("UTC 09 Apr 18:12 UTC");
        expect(label).toContain("Nikon Z 9");
    });

    it("falls back to a generic label for a bare item", () => {
        mountPanel();
        panel.render(viewModel({ thumbnailItems: [{ id: "a", kind: "image", active: true }] }));

        expect(node("media-browser-thumbnail-list").children[0].getAttribute("aria-label"))
            .toBe("Mission media item");
    });
});
