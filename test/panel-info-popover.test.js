import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { installFakeDom } from "./helpers/fake-dom.js";
import {
    hideMissionPanelInfo,
    showMissionPanelInfo,
} from "../src/platform/js/app/panel-info-popover.js";
import {
    registerMissionPanel,
    unregisterMissionPanel,
} from "../src/platform/js/app/panel-registry.js";

let dom = null;
const registeredIds = new Set();

function registerPanel(descriptor) {
    registeredIds.add(descriptor.id);
    registerMissionPanel(descriptor);
}

function popover() {
    return dom.document.querySelector(".panel-info-popover");
}

function anchorAt({ left = 100, top = 200, width = 24, height = 24 } = {}) {
    const button = dom.document.createElement("button");
    button.dataset.panelInfoTrigger = "true";
    button.setBoundingClientRect({ left, top, width, height });
    dom.document.body.appendChild(button);
    return button;
}

// The popover keeps one module-level root element, so the whole file shares a
// single document rather than reinstalling one per test.
beforeAll(() => {
    dom = installFakeDom([], { innerWidth: 1280, innerHeight: 800 });
});

afterAll(() => {
    dom?.restore();
    dom = null;
});

afterEach(() => {
    hideMissionPanelInfo();
    for (const id of registeredIds) unregisterMissionPanel(id);
    registeredIds.clear();
    dom.document.body.querySelectorAll("button").forEach((button) => button.remove());
});

describe("showing panel info", () => {
    it("refuses to show info for an unknown panel", () => {
        expect(showMissionPanelInfo("nope", anchorAt())).toBe(false);
        expect(popover()).toBeNull();
    });

    it("mounts the popover the first time it is shown", () => {
        registerPanel({ id: "p:one", title: "Craft to Earth", kind: "view", state: "open" });

        expect(showMissionPanelInfo("p:one", anchorAt())).toBe(true);

        expect(popover()).not.toBeNull();
        expect(popover().hidden).toBe(false);
    });

    it("reuses the same popover element for later panels", () => {
        registerPanel({ id: "p:one", title: "One" });
        registerPanel({ id: "p:two", title: "Two" });
        showMissionPanelInfo("p:one", anchorAt());
        const element = popover();

        showMissionPanelInfo("p:two", anchorAt());

        expect(popover()).toBe(element);
        expect(dom.document.querySelectorAll(".panel-info-popover")).toHaveLength(1);
    });

    it("renders the panel's identity rows", () => {
        registerPanel({
            id: "p:one",
            title: "Craft to Earth",
            kind: "view",
            panelType: "aux-camera-view",
            builtIn: true,
            state: "open",
        });

        showMissionPanelInfo("p:one", anchorAt());

        const markup = popover().innerHTML;
        expect(markup).toContain("Craft to Earth");
        expect(markup).toContain("aux-camera-view");
        expect(markup).toContain("Built-in");
        expect(markup).toContain("open");
    });

    it("marks a panel the user created", () => {
        registerPanel({ id: "p:custom", title: "Custom", builtIn: false });

        showMissionPanelInfo("p:custom", anchorAt());

        expect(popover().innerHTML).toContain("User-created");
    });

    it("appends the panel's own info items", () => {
        registerPanel({
            id: "p:one",
            title: "Frame and Shoot",
            infoItems: [{ label: "Mode", value: "composer" }],
        });

        showMissionPanelInfo("p:one", anchorAt());

        expect(popover().innerHTML).toContain("Mode");
        expect(popover().innerHTML).toContain("composer");
    });

    it("falls back to placeholders for missing fields", () => {
        registerPanel({ id: "p:bare" });

        showMissionPanelInfo("p:bare", anchorAt());

        expect(popover().innerHTML).toContain("--");
    });

    it("toggles closed when the same panel is asked for twice", () => {
        registerPanel({ id: "p:one", title: "One" });
        const anchor = anchorAt();

        showMissionPanelInfo("p:one", anchor);
        expect(popover().hidden).toBe(false);

        expect(showMissionPanelInfo("p:one", anchor)).toBe(true);
        expect(popover().hidden).toBe(true);
    });

    it("reopens after being hidden", () => {
        registerPanel({ id: "p:one", title: "One" });
        const anchor = anchorAt();
        showMissionPanelInfo("p:one", anchor);
        hideMissionPanelInfo();

        showMissionPanelInfo("p:one", anchor);

        expect(popover().hidden).toBe(false);
    });
});

describe("placement", () => {
    beforeEach(() => {
        registerPanel({ id: "p:one", title: "One" });
    });

    it("opens to the right of its anchor", () => {
        showMissionPanelInfo("p:one", anchorAt({ left: 100, top: 200, width: 24 }));

        expect(popover().style.left).toBe("130px");
        expect(popover().style.top).toBe("200px");
    });

    it("flips to the left when there is no room on the right", () => {
        showMissionPanelInfo("p:one", anchorAt({ left: 1240, top: 100, width: 24 }));

        expect(Number.parseInt(popover().style.left, 10)).toBeLessThan(1240);
    });

    it("keeps the popover on screen near the bottom edge", () => {
        showMissionPanelInfo("p:one", anchorAt({ left: 100, top: 780, width: 24 }));

        expect(Number.parseInt(popover().style.top, 10)).toBeLessThanOrEqual(800 - 120 - 8);
    });

    it("tolerates being shown without an anchor", () => {
        expect(() => showMissionPanelInfo("p:one", null)).not.toThrow();
        expect(popover().hidden).toBe(false);
    });
});

describe("dismissal", () => {
    let anchor = null;

    beforeEach(() => {
        registerPanel({ id: "p:one", title: "One" });
        anchor = anchorAt();
        showMissionPanelInfo("p:one", anchor);
    });

    function pointerDown(target) {
        const event = { type: "pointerdown", target };
        dom.document.listeners.get("pointerdown")?.forEach((handler) => handler(event));
    }

    function keyDown(key) {
        dom.document.listeners.get("keydown")?.forEach((handler) => handler({ key }));
    }

    it("closes on a press outside the popover", () => {
        pointerDown(dom.document.body);

        expect(popover().hidden).toBe(true);
    });

    it("stays open for a press inside the popover", () => {
        const inner = dom.document.createElement("div");
        popover().appendChild(inner);

        pointerDown(inner);

        expect(popover().hidden).toBe(false);
    });

    it("stays open for a press on another info trigger", () => {
        pointerDown(anchor);

        expect(popover().hidden).toBe(false);
    });

    it("ignores a press whose target is not an element", () => {
        pointerDown({ not: "an element" });

        expect(popover().hidden).toBe(true);
    });

    it("closes on Escape and ignores other keys", () => {
        keyDown("Enter");
        expect(popover().hidden).toBe(false);

        keyDown("Escape");
        expect(popover().hidden).toBe(true);
    });

    it("ignores a press while it is already hidden", () => {
        hideMissionPanelInfo();

        expect(() => pointerDown(dom.document.body)).not.toThrow();
    });

    it("is safe to hide twice", () => {
        hideMissionPanelInfo();

        expect(() => hideMissionPanelInfo()).not.toThrow();
    });
});
