import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeEvent, installFakeDom } from "./helpers/fake-dom.js";
import { DesktopPanelManager } from "../src/platform/js/app/panel-manager.js";
import {
    registerMissionPanel,
    unregisterMissionPanel,
} from "../src/platform/js/app/panel-registry.js";

let dom = null;
let manager = null;
const registeredIds = new Set();

function registerPanel(descriptor) {
    registeredIds.add(descriptor.id);
    registerMissionPanel(descriptor);
}

beforeEach(() => {
    dom = installFakeDom();
});

afterEach(() => {
    manager?.dispose();
    manager = null;
    for (const id of registeredIds) {
        unregisterMissionPanel(id);
    }
    registeredIds.clear();
    delete globalThis[DesktopPanelManager.getGlobalInstanceKey()];
    dom?.restore();
    dom = null;
});

function rowTitles(section) {
    return section
        .querySelectorAll(".panel-manager-menu__row-title")
        .map((node) => node.textContent);
}

function sections() {
    return manager.menuBody.querySelectorAll(".panel-manager-menu__section");
}

function sectionTitles() {
    return manager.menuBody
        .querySelectorAll(".panel-manager-menu__section-title")
        .map((node) => node.textContent);
}

describe("mounting", () => {
    it("does not build any DOM on a narrow viewport", () => {
        dom.window.innerWidth = 480;

        manager = new DesktopPanelManager();

        expect(manager.root).toBeNull();
        expect(dom.document.querySelectorAll(".settings-section--panel-manager")).toHaveLength(0);
    });

    it("mounts into the settings fieldset when one exists", () => {
        const fieldset = dom.document.createElement("div");
        fieldset.id = "settings-panel-fieldset";
        dom.document.body.appendChild(fieldset);

        manager = new DesktopPanelManager();

        expect(manager.root.parentNode).toBe(fieldset);
        expect(manager.root.dataset.sectionKey).toBe("panel-manager");
        expect(manager.root.querySelector(".settings-section__title").textContent).toBe("Panels");
    });

    it("falls back to the overlay host when no settings fieldset exists", () => {
        const host = dom.document.createElement("div");
        dom.document.body.appendChild(host);

        manager = new DesktopPanelManager({ overlayHost: host });

        expect(manager.root.parentNode).toBe(host);
    });

    it("disposes a previous instance and clears its stale DOM", () => {
        const first = new DesktopPanelManager();
        const firstRoot = first.root;

        manager = new DesktopPanelManager();

        expect(first.root).toBeNull();
        expect(firstRoot.parentNode).toBeNull();
        expect(dom.document.querySelectorAll(".settings-section--panel-manager")).toHaveLength(1);
        expect(globalThis[DesktopPanelManager.getGlobalInstanceKey()]).toBe(manager);
    });

    it("starts with the menu closed", () => {
        manager = new DesktopPanelManager();
        expect(manager.menuOpen).toBe(false);
    });
});

describe("panel list rendering", () => {
    beforeEach(() => {
        manager = new DesktopPanelManager();
    });

    it("shows an empty state when every panel is already on screen", () => {
        registerPanel({ id: "p:open", title: "Open Panel", state: "open" });

        expect(sectionTitles()).toEqual(["Open"]);

        unregisterMissionPanel("p:open");
        registeredIds.delete("p:open");

        expect(manager.menuBody.querySelector(".panel-manager-menu__empty").textContent)
            .toBe("All available panels are already on screen.");
    });

    it("groups closed, minimized and deleted built-in panels under Closed", () => {
        registerPanel({ id: "p:closed", title: "Closed Panel", state: "closed" });
        registerPanel({ id: "p:min", title: "Minimized Panel", state: "minimized" });
        registerPanel({ id: "p:gone", title: "Deleted Built-In", state: "deleted", builtIn: true });

        expect(sectionTitles()).toEqual(["Closed"]);
        expect(rowTitles(sections()[0]).sort())
            .toEqual(["Closed Panel", "Deleted Built-In", "Minimized Panel"]);
    });

    it("omits a deleted panel that is not built in", () => {
        registerPanel({ id: "p:gone", title: "Deleted Custom", state: "deleted", builtIn: false });

        expect(manager.menuBody.querySelector(".panel-manager-menu__empty")).not.toBeNull();
    });

    it("separates open panels from closed ones", () => {
        registerPanel({ id: "p:open", title: "Open Panel", state: "open" });
        registerPanel({ id: "p:closed", title: "Closed Panel", state: "closed" });

        expect(sectionTitles()).toEqual(["Closed", "Open"]);
        expect(rowTitles(sections()[0])).toEqual(["Closed Panel"]);
        expect(rowTitles(sections()[1])).toEqual(["Open Panel"]);
    });

    it("lists unavailable panels in their own section", () => {
        registerPanel({ id: "p:na", title: "Unavailable Panel", state: "closed", available: false });

        expect(sectionTitles()).toEqual(["Unavailable"]);
    });

    it("falls back to the panel id when it has no title", () => {
        registerPanel({ id: "p:untitled", state: "closed" });

        expect(rowTitles(sections()[0])).toEqual(["p:untitled"]);
    });

    it("badges the panel state and its built-in origin", () => {
        registerPanel({ id: "p:closed", title: "Closed Panel", state: "closed", builtIn: true });

        const badges = manager.menuBody
            .querySelectorAll(".panel-manager-menu__badge")
            .map((node) => node.textContent);
        expect(badges).toEqual(["closed", "built-in"]);
    });

    it("re-renders whenever the registry changes", () => {
        registerPanel({ id: "p:closed", title: "Closed Panel", state: "closed" });
        expect(rowTitles(sections()[0])).toEqual(["Closed Panel"]);

        registerPanel({ id: "p:second", title: "Second Panel", state: "closed" });

        expect(rowTitles(sections()[0]).sort()).toEqual(["Closed Panel", "Second Panel"]);
    });
});

describe("row actions", () => {
    beforeEach(() => {
        manager = new DesktopPanelManager();
    });

    function actionButtons() {
        return manager.menuBody.querySelectorAll(".panel-manager-menu__action");
    }

    it("offers Info for every panel", () => {
        registerPanel({ id: "p:closed", title: "Closed Panel", state: "closed" });

        const [info] = actionButtons();
        expect(info.textContent).toBe("Info");
        expect(info.dataset.panelInfoTrigger).toBe("true");
    });

    it("labels the primary action by panel state", () => {
        const open = vi.fn();
        // Deleted panels only stay listed when they are built in, so the
        // descriptor carries `builtIn` across every state in this walk.
        registerPanel({ id: "p:walk", title: "Walk", state: "closed", builtIn: true, actions: { open } });
        expect(actionButtons()[1].textContent).toBe("Open");

        registerPanel({ id: "p:walk", state: "deleted" });
        expect(actionButtons()[1].textContent).toBe("Add");

        registerPanel({ id: "p:walk", state: "open", actions: { open, focus: vi.fn() } });
        expect(actionButtons()[1].textContent).toBe("Focus");

        registerPanel({ id: "p:walk", state: "minimized" });
        expect(actionButtons()[1].textContent).toBe("Restore");
    });

    it("prefers focus over open for a panel that is already open", () => {
        const focus = vi.fn();
        const open = vi.fn();
        registerPanel({ id: "p:open", title: "Open", state: "open", actions: { focus, open } });

        actionButtons()[1].dispatchEvent(new FakeEvent("click", { bubbles: true }));

        expect(focus).toHaveBeenCalledTimes(1);
        expect(open).not.toHaveBeenCalled();
    });

    it("prefers restore over open for a panel that is not open", () => {
        const restore = vi.fn();
        const open = vi.fn();
        registerPanel({ id: "p:min", title: "Minimized", state: "minimized", actions: { restore, open } });

        actionButtons()[1].dispatchEvent(new FakeEvent("click", { bubbles: true }));

        expect(restore).toHaveBeenCalledTimes(1);
        expect(open).not.toHaveBeenCalled();
    });

    it("renders no primary action for a panel that exposes none", () => {
        registerPanel({ id: "p:closed", title: "Closed", state: "closed", actions: {} });

        expect(actionButtons().map((button) => button.textContent)).toEqual(["Info"]);
    });

    it("closes the menu after an action that brings a panel forward", () => {
        registerPanel({ id: "p:closed", title: "Closed", state: "closed", actions: { open: vi.fn() } });
        manager.setMenuOpen(true);

        actionButtons()[1].dispatchEvent(new FakeEvent("click", { bubbles: true }));

        expect(manager.menuOpen).toBe(false);
    });

    it("keeps the menu open for a focus action", () => {
        registerPanel({ id: "p:open", title: "Open", state: "open", actions: { focus: vi.fn() } });
        manager.setMenuOpen(true);

        actionButtons()[1].dispatchEvent(new FakeEvent("click", { bubbles: true }));

        expect(manager.menuOpen).toBe(true);
    });
});

describe("viewport changes", () => {
    beforeEach(() => {
        manager = new DesktopPanelManager();
        registerPanel({ id: "p:closed", title: "Closed Panel", state: "closed" });
    });

    it("hides the section and closes the menu when the viewport narrows", () => {
        manager.setMenuOpen(true);
        dom.window.innerWidth = 500;

        manager.handleResize();

        expect(manager.root.hidden).toBe(true);
        expect(manager.menuOpen).toBe(false);
    });

    it("shows the section again when the viewport widens", () => {
        dom.window.innerWidth = 500;
        manager.handleResize();
        dom.window.innerWidth = 1280;

        manager.handleResize();

        expect(manager.root.hidden).toBe(false);
        expect(rowTitles(sections()[0])).toEqual(["Closed Panel"]);
    });

    it("closes the menu on Escape", () => {
        manager.setMenuOpen(true);

        manager.handleDocumentKeyDown({ key: "Escape" });

        expect(manager.menuOpen).toBe(false);
    });

    it("leaves the menu open for other keys", () => {
        manager.setMenuOpen(true);

        manager.handleDocumentKeyDown({ key: "Enter" });

        expect(manager.menuOpen).toBe(true);
    });

    it("ignores pointer events while the menu is closed", () => {
        expect(() => manager.handleDocumentPointerDown({ target: null })).not.toThrow();
        expect(manager.menuOpen).toBe(false);
    });

    it("ignores a pointer event whose target is not an element", () => {
        manager.setMenuOpen(true);

        manager.handleDocumentPointerDown({ target: { not: "an element" } });

        expect(manager.menuOpen).toBe(true);
    });

    it("closes the menu on an outside pointer press", () => {
        manager.setMenuOpen(true);

        manager.handleDocumentPointerDown({ target: dom.document.body });

        expect(manager.menuOpen).toBe(false);
    });
});

describe("disposal", () => {
    it("detaches the DOM, unsubscribes and clears the global handle", () => {
        manager = new DesktopPanelManager();
        const root = manager.root;
        registerPanel({ id: "p:closed", title: "Closed Panel", state: "closed" });

        manager.dispose();

        expect(root.parentNode).toBeNull();
        expect(manager.root).toBeNull();
        expect(manager.menuBody).toBeNull();
        expect(manager.unsubscribe).toBeNull();
        expect(globalThis[DesktopPanelManager.getGlobalInstanceKey()]).toBeUndefined();

        // A later registry change must not reach the disposed instance.
        expect(() => registerPanel({ id: "p:after", title: "After", state: "closed" })).not.toThrow();
        manager = null;
    });

    it("is safe to dispose a manager that never mounted", () => {
        dom.window.innerWidth = 480;
        manager = new DesktopPanelManager();

        expect(() => manager.dispose()).not.toThrow();
    });
});
