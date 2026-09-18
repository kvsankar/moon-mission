import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeEvent, FakeResizeObserver, installFakeDom } from "./helpers/fake-dom.js";
import { createComposerDisclosure } from "../src/platform/js/ui/composer-disclosure.js";

let dom = null;
let harness = null;

const pendingFrames = new Map();
let nextFrameId = 1;

/**
 * Queue animation frames so a scheduled disclosure update can be flushed
 * deliberately instead of depending on real frame timing.
 */
function manualFrames() {
    return {
        requestAnimationFrame: (callback) => {
            const id = nextFrameId += 1;
            pendingFrames.set(id, callback);
            return id;
        },
        cancelAnimationFrame: (id) => pendingFrames.delete(id),
        ResizeObserver: FakeResizeObserver,
        innerWidth: 1280,
        innerHeight: 800,
    };
}

function flushFrames() {
    const callbacks = [...pendingFrames.values()];
    pendingFrames.clear();
    callbacks.forEach((callback) => callback(0));
}

function mount({ viewportSize = { width: 800, height: 600 }, includeTimeline = true } = {}) {
    dom = installFakeDom([], manualFrames());
    const { document: documentRef, window: windowRef } = dom;

    const panel = documentRef.createElement("div");
    panel.id = "composer-panel";
    documentRef.body.appendChild(panel);

    const viewport = documentRef.createElement("div");
    viewport.setBoundingClientRect({ width: viewportSize.width, height: viewportSize.height });
    panel.appendChild(viewport);

    const controls = documentRef.createElement("div");
    controls.className = "aux-camera-view__composer-sky-controls";
    controls.setBoundingClientRect({ left: 0, top: 0, width: 200, height: 150 });
    const controlButton = documentRef.createElement("button");
    controls.appendChild(controlButton);
    viewport.appendChild(controls);

    let timeline = null;
    if (includeTimeline) {
        timeline = documentRef.createElement("div");
        timeline.className = "aux-camera-view__composer-sky-timeline";
        timeline.setBoundingClientRect({ left: 0, top: 0, width: 200, height: 100 });
        viewport.appendChild(timeline);
    }

    const disclosure = createComposerDisclosure({ panel, viewport, windowRef, documentRef });
    flushFrames();
    return { panel, viewport, controls, controlButton, timeline, disclosure, documentRef, windowRef };
}

function launchers() {
    return harness.viewport.querySelectorAll(".composer-disclosure-launcher");
}

function resize(width, height) {
    harness.viewport.setBoundingClientRect({ width, height });
    FakeResizeObserver.instances.at(-1)?.trigger();
    flushFrames();
}

beforeEach(() => {
    FakeResizeObserver.instances = [];
    pendingFrames.clear();
});

afterEach(() => {
    harness?.disclosure?.dispose();
    harness = null;
    dom?.restore();
    dom = null;
    FakeResizeObserver.instances = [];
});

describe("launcher construction", () => {
    it("adds one launcher per disclosure surface", () => {
        harness = mount();

        expect(launchers().map((button) => button.textContent))
            .toEqual(["View options", "Time controls"]);
    });

    it("skips a surface that the panel does not render", () => {
        harness = mount({ includeTimeline: false });

        expect(launchers().map((button) => button.textContent)).toEqual(["View options"]);
    });

    it("gives each surface an id derived from the panel", () => {
        harness = mount();

        expect(harness.controls.id).toBe("composer-panel-disclosure-0");
        expect(harness.timeline.id).toBe("composer-panel-disclosure-1");
        expect(launchers()[0].getAttribute("aria-controls")).toBe("composer-panel-disclosure-0");
        expect(launchers()[0].getAttribute("popovertarget")).toBe("composer-panel-disclosure-0");
    });

    it("keeps an id the panel already assigned", () => {
        dom = installFakeDom([], manualFrames());
        const panel = dom.document.createElement("div");
        panel.id = "composer-panel";
        const viewport = dom.document.createElement("div");
        viewport.setBoundingClientRect({ width: 800, height: 600 });
        const controls = dom.document.createElement("div");
        controls.className = "aux-camera-view__composer-sky-controls";
        controls.id = "authored-id";
        viewport.appendChild(controls);
        panel.appendChild(viewport);
        dom.document.body.appendChild(panel);

        const disclosure = createComposerDisclosure({
            panel,
            viewport,
            windowRef: dom.window,
            documentRef: dom.document,
        });
        flushFrames();
        harness = { disclosure, viewport, panel, controls };

        expect(controls.id).toBe("authored-id");
    });

    it("marks each surface for assistive technology", () => {
        harness = mount();

        expect(harness.controls.dataset.disclosureSurface).toBe("true");
        expect(harness.controls.getAttribute("aria-label"))
            .toBe("Frame and Shoot view options");
        expect(launchers()[0].getAttribute("aria-haspopup")).toBe("dialog");
        expect(launchers()[0].getAttribute("aria-expanded")).toBe("false");
    });

    it("keeps launcher pointer input from starting a panel drag", () => {
        harness = mount();
        const outer = new FakeEvent("pointerdown", { bubbles: true });

        launchers()[0].dispatchEvent(outer);

        expect(outer.propagationStopped).toBe(true);
    });
});

describe("space level", () => {
    it("keeps both surfaces inline at full size", () => {
        harness = mount({ viewportSize: { width: 800, height: 600 } });

        expect(harness.panel.dataset.spaceLevel).toBe("full");
        expect(harness.viewport.querySelector(".composer-disclosure-launchers").hidden).toBe(true);
        expect(harness.controls.hasAttribute("popover")).toBe(false);
    });

    it("promotes the surfaces to popovers when the panel shrinks", () => {
        harness = mount({ viewportSize: { width: 800, height: 600 } });

        resize(400, 300);

        expect(harness.panel.dataset.spaceLevel).toBe("compact");
        expect(harness.viewport.querySelector(".composer-disclosure-launchers").hidden).toBe(false);
        expect(harness.controls.getAttribute("popover")).toBe("auto");
        expect(harness.controls.getAttribute("role")).toBe("dialog");
    });

    it("reaches the minimal level for the smallest panels", () => {
        harness = mount({ viewportSize: { width: 300, height: 200 } });

        expect(harness.panel.dataset.spaceLevel).toBe("minimal");
        expect(harness.controls.getAttribute("popover")).toBe("auto");
    });

    it("returns the surfaces inline when the panel grows again", () => {
        harness = mount({ viewportSize: { width: 400, height: 300 } });

        resize(800, 600);

        expect(harness.panel.dataset.spaceLevel).toBe("full");
        expect(harness.controls.hasAttribute("popover")).toBe(false);
        expect(harness.controls.hasAttribute("role")).toBe(false);
    });

    it("leaves a zero-sized panel at its previous level", () => {
        harness = mount({ viewportSize: { width: 800, height: 600 } });

        resize(0, 0);

        expect(harness.panel.dataset.spaceLevel).toBe("full");
    });

    it("closes an open popover when the panel is collapsed to nothing", () => {
        harness = mount({ viewportSize: { width: 400, height: 300 } });
        harness.controls.showPopover();

        resize(0, 0);

        expect(harness.controls.popoverOpen).toBe(false);
    });
});

describe("popover behaviour", () => {
    beforeEach(() => {
        harness = mount({ viewportSize: { width: 400, height: 300 } });
    });

    it("tracks the open state on its launcher", () => {
        harness.controls.showPopover();
        expect(launchers()[0].getAttribute("aria-expanded")).toBe("true");

        harness.controls.hidePopover();
        expect(launchers()[0].getAttribute("aria-expanded")).toBe("false");
    });

    it("positions an opened popover under its launcher", () => {
        launchers()[0].setBoundingClientRect({ left: 40, top: 10, width: 90, height: 24 });

        harness.controls.showPopover();

        expect(harness.controls.style.getPropertyValue("--disclosure-left")).toBe("40px");
        expect(harness.controls.style.getPropertyValue("--disclosure-top")).toBe("40px");
    });

    it("clamps a popover that would overflow the viewport", () => {
        launchers()[0].setBoundingClientRect({ left: 1270, top: 790, width: 90, height: 24 });
        harness.controls.setBoundingClientRect({ left: 0, top: 0, width: 292, height: 420 });

        harness.controls.showPopover();

        expect(harness.controls.style.getPropertyValue("--disclosure-left")).toBe("980px");
        expect(harness.controls.style.getPropertyValue("--disclosure-top")).toBe("372px");
    });

    it("repositions an open popover after a resize", () => {
        launchers()[0].setBoundingClientRect({ left: 40, top: 10, width: 90, height: 24 });
        harness.controls.showPopover();
        launchers()[0].setBoundingClientRect({ left: 120, top: 10, width: 90, height: 24 });

        resize(380, 290);

        expect(harness.controls.style.getPropertyValue("--disclosure-left")).toBe("120px");
    });

    it("keeps a launcher click from reaching the panel", () => {
        const event = new FakeEvent("click", { bubbles: true });

        launchers()[0].dispatchEvent(event);

        expect(event.propagationStopped).toBe(true);
    });

    it("yields the top layer when another panel is requested from inside it", async () => {
        harness.controls.showPopover();
        const request = new FakeEvent("moon-mission:moon-render-panel-request");
        request.detail = { trigger: harness.controlButton };

        harness.documentRef.dispatchEvent(request);
        await Promise.resolve();

        expect(harness.controls.popoverOpen).toBe(false);
    });

    it("ignores a panel request from outside every surface", async () => {
        harness.controls.showPopover();
        const request = new FakeEvent("moon-mission:moon-render-panel-request");
        request.detail = { trigger: harness.documentRef.body };

        harness.documentRef.dispatchEvent(request);
        await Promise.resolve();

        expect(harness.controls.popoverOpen).toBe(true);
    });
});

describe("realm changes", () => {
    it("re-observes after the panel is remounted in another window", async () => {
        harness = mount({ viewportSize: { width: 400, height: 300 } });
        const observerCount = FakeResizeObserver.instances.length;

        harness.panel.dispatchEvent(new FakeEvent("moon-mission:dockview-panel-mounted"));
        await Promise.resolve();
        flushFrames();

        // The realm is unchanged, so the existing observer is reused.
        expect(FakeResizeObserver.instances.length).toBe(observerCount);
        expect(FakeResizeObserver.instances.at(-1).observed).toContain(harness.viewport);
    });

    it("stops responding once disposed", async () => {
        harness = mount({ viewportSize: { width: 800, height: 600 } });

        harness.disclosure.dispose();
        resize(300, 200);

        expect(harness.panel.dataset.spaceLevel).toBe("full");
        harness.disclosure = null;
    });

    it("removes the launchers and popover attributes on disposal", () => {
        harness = mount({ viewportSize: { width: 400, height: 300 } });
        harness.controls.showPopover();

        harness.disclosure.dispose();

        expect(harness.viewport.querySelector(".composer-disclosure-launchers")).toBeNull();
        expect(harness.controls.hasAttribute("popover")).toBe(false);
        expect(harness.controls.popoverOpen).toBe(false);
        harness.disclosure = null;
    });

    it("falls back to timers when the realm has no animation frames", () => {
        dom = installFakeDom([], {
            ResizeObserver: FakeResizeObserver,
            requestAnimationFrame: undefined,
            cancelAnimationFrame: undefined,
        });
        const panel = dom.document.createElement("div");
        const viewport = dom.document.createElement("div");
        viewport.setBoundingClientRect({ width: 400, height: 300 });
        const controls = dom.document.createElement("div");
        controls.className = "aux-camera-view__composer-sky-controls";
        viewport.appendChild(controls);
        panel.appendChild(viewport);
        dom.document.body.appendChild(panel);

        const disclosure = createComposerDisclosure({
            panel,
            viewport,
            windowRef: dom.window,
            documentRef: dom.document,
        });
        harness = { disclosure, panel, viewport, controls };

        // The update has not run yet; the timer is still pending.
        expect(panel.dataset.spaceLevel).toBeUndefined();
        expect(() => disclosure.dispose()).not.toThrow();
        harness.disclosure = null;
    });
});
