import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeEvent, installFakeDom } from "./helpers/fake-dom.js";
import { createDockviewPanelLaunchStrip } from "../src/platform/js/app/experimental-dockview-host.js";

/** The header controls the strip proxies, in the order the strip builds them. */
const PROXY_TARGETS = [
    "panel-pill-background",
    "panel-pill-media",
    "flyby-pill",
    "focus-pill-splashdown",
    "panel-pill-craft-moon",
    "panel-pill-craft-earth",
    "panel-pill-earth-orbit-xy",
    "compare-pill-button",
];

const PAGE_ELEMENTS = [
    { id: "header", tag: "header" },
    { id: "navbar", tag: "nav", parent: "header", className: "navbar" },
    { id: "experimental-dockview-reset", tag: "button" },
    ...PROXY_TARGETS.map((id) => ({ id, tag: "button" })),
];

let dom = null;
let strip = null;
let workspace = null;

function node(id) {
    return dom.document.getElementById(id);
}

function stripElement() {
    return node("dockview-panel-launch-strip");
}

/** The proxy buttons, keyed by the header control each one stands in for. */
function proxyButtons() {
    const found = new Map();
    const walk = (element) => {
        for (const child of element.children || []) {
            if (child.dataset?.proxyTarget) found.set(child.dataset.proxyTarget, child);
            walk(child);
        }
    };
    walk(stripElement());
    return found;
}

function toolsDetails() {
    return stripElement().children.find((child) => child.tagName === "DETAILS");
}

function toolsBody() {
    return node("workspace-tools-body");
}

function setLevel(level, { collapsed = [] } = {}) {
    workspace.level = level;
    workspace.collapsedIds = new Set(collapsed);
    dom.document.dispatchEvent(new FakeEvent("moon-mission:workspace-disclosure-change", { bubbles: true }));
}

function installWorkspace() {
    workspace = {
        level: "full",
        collapsedIds: new Set(),
        revealPanel: vi.fn(),
        isCollapsed: vi.fn((panelId) => workspace.collapsedIds.has(panelId)),
    };
    const layoutHost = {
        api: { getPanel: vi.fn(() => null) },
        addPanel: vi.fn(),
    };
    globalThis.__moonMissionDockviewSpike = { progressiveWorkspace: workspace, layoutHost };
    return { workspace, layoutHost };
}

beforeEach(() => {
    dom = installFakeDom(PAGE_ELEMENTS, {
        innerWidth: 1600,
        innerHeight: 900,
        requestAnimationFrame: (callback) => { callback(0); return 1; },
        cancelAnimationFrame: () => {},
    });
    // The strip forwards presses to the real header controls as mouse events.
    vi.stubGlobal("MouseEvent", FakeEvent);
    vi.stubGlobal("MutationObserver", undefined);
});

afterEach(() => {
    strip?.dispose();
    strip = null;
    workspace = null;
    delete globalThis.__moonMissionDockviewSpike;
    dom?.restore();
    dom = null;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("building the launch strip", () => {
    it("mounts one strip into the navbar", () => {
        installWorkspace();

        strip = createDockviewPanelLaunchStrip(dom.document);

        expect(stripElement()).toBeTruthy();
        expect(node("navbar").children).toContain(stripElement());
        expect(stripElement().getAttribute("aria-label")).toBe("Open mission panels");
    });

    it("builds one proxy button per header control", () => {
        installWorkspace();

        strip = createDockviewPanelLaunchStrip(dom.document);

        expect([...proxyButtons().keys()].sort()).toEqual([...PROXY_TARGETS].sort());
    });

    it("adds the scene, orbit details, reset and tools controls", () => {
        installWorkspace();

        strip = createDockviewPanelLaunchStrip(dom.document);

        expect(stripElement().children[0].textContent).toBe("Scene");
        expect(node("dockview-orbit-details-toggle")).toBeTruthy();
        expect(node("dockview-orbit-details-popover").hidden).toBe(true);
        expect(toolsDetails()).toBeTruthy();
        expect(toolsBody()).toBeTruthy();
    });

    it("refuses to build a second strip", () => {
        installWorkspace();
        strip = createDockviewPanelLaunchStrip(dom.document);

        const second = createDockviewPanelLaunchStrip(dom.document);
        second.dispose();

        expect(node("navbar").children.filter((child) => child.id === "dockview-panel-launch-strip"))
            .toHaveLength(1);
    });

    it("returns an inert handle with no header in the page", () => {
        dom.restore();
        dom = installFakeDom();
        installWorkspace();

        strip = createDockviewPanelLaunchStrip(dom.document);

        expect(() => strip.dispose()).not.toThrow();
    });
});

describe("the responsive layout", () => {
    it("keeps every control inline and the overflow hidden at full disclosure", () => {
        installWorkspace();

        strip = createDockviewPanelLaunchStrip(dom.document);

        expect(toolsDetails().hidden).toBe(true);
        expect(proxyButtons().get("panel-pill-media").parentElement).toBe(stripElement());
        expect(node("dockview-orbit-details-toggle").parentElement).toBe(stripElement());
    });

    it("hides the transcript proxy at full disclosure", () => {
        // The transcript rides inside the broadcast panel until the workspace
        // starts collapsing, so its own pill would be redundant.
        installWorkspace();

        strip = createDockviewPanelLaunchStrip(dom.document);

        const transcript = [...proxyButtons().values()]
            .find((button) => button.dataset.workspacePanel === "workflow:background-transcript");
        expect(transcript.hidden).toBe(true);
    });

    it("moves most controls into the overflow at compact disclosure", () => {
        installWorkspace();
        strip = createDockviewPanelLaunchStrip(dom.document);

        setLevel("compact");

        expect(toolsDetails().hidden).toBe(false);
        expect(proxyButtons().get("panel-pill-media").parentElement).toBe(stripElement());
        expect(proxyButtons().get("flyby-pill").parentElement).toBe(stripElement());
        expect(proxyButtons().get("panel-pill-craft-moon").parentElement).toBe(toolsBody());
        expect(node("dockview-orbit-details-toggle").parentElement).toBe(toolsBody());
    });

    it("spells out the short labels once a control moves into the overflow", () => {
        installWorkspace();
        strip = createDockviewPanelLaunchStrip(dom.document);

        setLevel("compact");

        expect(proxyButtons().get("panel-pill-craft-moon").textContent).toBe("Craft → Moon");
        expect(proxyButtons().get("panel-pill-craft-earth").textContent).toBe("Craft → Earth");
        expect(proxyButtons().get("panel-pill-media").textContent).toBe("Media");
    });

    it("moves everything into the overflow at minimal disclosure", () => {
        installWorkspace();
        strip = createDockviewPanelLaunchStrip(dom.document);

        setLevel("minimal");

        for (const button of proxyButtons().values()) {
            expect(button.parentElement).toBe(toolsBody());
        }
    });

    it("shows the scene return only once the scene is no longer inline", () => {
        installWorkspace();
        strip = createDockviewPanelLaunchStrip(dom.document);
        const sceneButton = stripElement().children[0];
        expect(sceneButton.hidden).toBe(true);

        setLevel("minimal");
        expect(sceneButton.hidden).toBe(false);

        setLevel("focused");
        expect(sceneButton.hidden).toBe(false);

        setLevel("full");
        expect(sceneButton.hidden).toBe(true);
    });

    it("keeps the overflow in a stable logical order", () => {
        installWorkspace();
        strip = createDockviewPanelLaunchStrip(dom.document);

        setLevel("minimal");
        const firstOrder = toolsBody().children.map((child) => child.dataset.proxyTarget || child.id);
        setLevel("compact");
        setLevel("minimal");

        expect(toolsBody().children.map((child) => child.dataset.proxyTarget || child.id))
            .toEqual(firstOrder);
    });

    it("hides a proxy whose header control is not in the page", () => {
        installWorkspace();
        node("compare-pill-button").remove();

        strip = createDockviewPanelLaunchStrip(dom.document);

        expect(proxyButtons().get("compare-pill-button").hidden).toBe(true);
    });

    it("mirrors the disabled and pressed state of its header control", () => {
        installWorkspace();
        node("panel-pill-media").disabled = true;
        node("flyby-pill").setAttribute("aria-pressed", "true");
        node("flyby-pill").title = "Frame and Shoot";

        strip = createDockviewPanelLaunchStrip(dom.document);

        expect(proxyButtons().get("panel-pill-media").disabled).toBe(true);
        expect(proxyButtons().get("flyby-pill").getAttribute("aria-pressed")).toBe("true");
        expect(proxyButtons().get("flyby-pill").title).toBe("Frame and Shoot");
    });

    it("reports a collapsed panel as unpressed however its control looks", () => {
        installWorkspace();
        node("panel-pill-media").setAttribute("aria-pressed", "true");

        strip = createDockviewPanelLaunchStrip(dom.document);
        setLevel("compact", { collapsed: ["workflow:media-browser"] });

        expect(proxyButtons().get("panel-pill-media").getAttribute("aria-pressed")).toBe("false");
    });

    it("falls back to a generated title with none on the control", () => {
        installWorkspace();

        strip = createDockviewPanelLaunchStrip(dom.document);

        expect(proxyButtons().get("panel-pill-media").title).toBe("Open Media panel");
    });
});

describe("pressing a proxy button", () => {
    function press(targetId) {
        proxyButtons().get(targetId).dispatchEvent(new FakeEvent("click", { bubbles: true }));
    }

    it("forwards the press to its header control", () => {
        installWorkspace();
        strip = createDockviewPanelLaunchStrip(dom.document);
        let pressed = 0;
        node("compare-pill-button").addEventListener("click", () => { pressed += 1; });

        press("compare-pill-button");

        expect(pressed).toBe(1);
    });

    it("reveals an already collapsed panel instead of toggling its control", () => {
        installWorkspace();
        strip = createDockviewPanelLaunchStrip(dom.document);
        workspace.collapsedIds = new Set(["workflow:media-browser"]);
        let pressed = 0;
        node("panel-pill-media").addEventListener("click", () => { pressed += 1; });

        press("panel-pill-media");

        expect(workspace.revealPanel).toHaveBeenCalledWith("workflow:media-browser");
        expect(pressed).toBe(0);
    });

    it("adds the transcript panel the first time it is asked for", () => {
        const { layoutHost } = installWorkspace();
        strip = createDockviewPanelLaunchStrip(dom.document);
        const transcript = [...proxyButtons().values()]
            .find((button) => button.dataset.workspacePanel === "workflow:background-transcript");

        transcript.dispatchEvent(new FakeEvent("click", { bubbles: true }));

        expect(layoutHost.addPanel).toHaveBeenCalled();
        expect(workspace.revealPanel).toHaveBeenCalledWith("workflow:background-transcript");
    });

    it("only reveals the transcript panel once it already exists", () => {
        const { layoutHost } = installWorkspace();
        layoutHost.api.getPanel = vi.fn(() => ({ id: "workflow:background-transcript" }));
        strip = createDockviewPanelLaunchStrip(dom.document);
        const transcript = [...proxyButtons().values()]
            .find((button) => button.dataset.workspacePanel === "workflow:background-transcript");

        transcript.dispatchEvent(new FakeEvent("click", { bubbles: true }));

        expect(layoutHost.addPanel).not.toHaveBeenCalled();
        expect(workspace.revealPanel).toHaveBeenCalledWith("workflow:background-transcript");
    });

    it("closes the overflow after a selection made from it", () => {
        installWorkspace();
        strip = createDockviewPanelLaunchStrip(dom.document);
        setLevel("minimal");
        toolsDetails().open = true;

        press("panel-pill-craft-moon");

        expect(toolsDetails().open).toBe(false);
    });

    it("returns to the scene from the scene button", () => {
        installWorkspace();
        strip = createDockviewPanelLaunchStrip(dom.document);

        stripElement().children[0].dispatchEvent(new FakeEvent("click", { bubbles: true }));

        expect(workspace.revealPanel).toHaveBeenCalledWith("mission:main-view");
    });
});

describe("the orbit details popover", () => {
    it("opens and closes from its toggle", () => {
        installWorkspace();
        strip = createDockviewPanelLaunchStrip(dom.document);
        const toggle = node("dockview-orbit-details-toggle");
        const popover = node("dockview-orbit-details-popover");

        toggle.dispatchEvent(new FakeEvent("click", { bubbles: true }));
        expect(popover.hidden).toBe(false);
        expect(toggle.getAttribute("aria-expanded")).toBe("true");

        toggle.dispatchEvent(new FakeEvent("click", { bubbles: true }));
        expect(popover.hidden).toBe(true);
        expect(toggle.getAttribute("aria-expanded")).toBe("false");
    });
});

describe("the reset view button", () => {
    it("prefers the published reset hook", () => {
        installWorkspace();
        const reset = vi.fn();
        globalThis.__moonMissionResetDockviewWorkspace = reset;
        strip = createDockviewPanelLaunchStrip(dom.document);
        let fallbackPressed = 0;
        node("experimental-dockview-reset").addEventListener("click", () => { fallbackPressed += 1; });

        stripElement().children.find((child) => child.textContent === "Reset View")
            ?.dispatchEvent(new FakeEvent("click", { bubbles: true }));

        expect(reset).toHaveBeenCalledTimes(1);
        expect(fallbackPressed).toBe(0);
        delete globalThis.__moonMissionResetDockviewWorkspace;
    });

    it("falls back to the hidden reset control", () => {
        installWorkspace();
        strip = createDockviewPanelLaunchStrip(dom.document);
        let fallbackPressed = 0;
        node("experimental-dockview-reset").addEventListener("click", () => { fallbackPressed += 1; });

        stripElement().children.find((child) => child.textContent === "Reset View")
            ?.dispatchEvent(new FakeEvent("click", { bubbles: true }));

        expect(fallbackPressed).toBe(1);
    });
});

describe("the overflow disclosure", () => {
    it("closes on Escape", () => {
        installWorkspace();
        strip = createDockviewPanelLaunchStrip(dom.document);
        const tools = toolsDetails();
        tools.open = true;

        const event = new FakeEvent("keydown", { bubbles: true });
        event.key = "Escape";
        dom.document.dispatchEvent(event);

        expect(tools.open).toBe(false);
    });

    it("ignores other keys", () => {
        installWorkspace();
        strip = createDockviewPanelLaunchStrip(dom.document);
        const tools = toolsDetails();
        tools.open = true;

        const event = new FakeEvent("keydown", { bubbles: true });
        event.key = "a";
        dom.document.dispatchEvent(event);

        expect(tools.open).toBe(true);
    });

    it("closes on a press outside itself", () => {
        installWorkspace();
        strip = createDockviewPanelLaunchStrip(dom.document);
        const tools = toolsDetails();
        tools.open = true;

        const event = new FakeEvent("pointerdown", { bubbles: true });
        event.target = node("header");
        dom.document.dispatchEvent(event);

        expect(tools.open).toBe(false);
    });

    it("stays open for a press inside itself", () => {
        installWorkspace();
        strip = createDockviewPanelLaunchStrip(dom.document);
        const tools = toolsDetails();
        tools.open = true;

        const event = new FakeEvent("pointerdown", { bubbles: true });
        event.target = toolsBody();
        dom.document.dispatchEvent(event);

        expect(tools.open).toBe(true);
    });
});

describe("disposal", () => {
    it("removes the strip and stops listening", () => {
        installWorkspace();
        strip = createDockviewPanelLaunchStrip(dom.document);

        strip.dispose();
        strip = null;

        expect(node("dockview-panel-launch-strip")).toBeNull();
    });

    it("stops doing work for a superseded owner", () => {
        installWorkspace();
        let current = true;
        strip = createDockviewPanelLaunchStrip(dom.document, () => current);
        const tools = toolsDetails();
        tools.open = true;
        current = false;

        const event = new FakeEvent("keydown", { bubbles: true });
        event.key = "Escape";
        dom.document.dispatchEvent(event);

        expect(tools.open).toBe(true);
    });
});
