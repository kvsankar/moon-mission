import { afterEach, describe, expect, it } from "vitest";

import {
    applyDefaultDockviewWorkspaceLayout,
    createDockviewHeaderActionsRenderer,
    createFullscreenToggleButton,
    createDockviewTabContextMenuItems,
    calculateDefaultDockviewWorkspaceSizes,
    clampShellRect,
    getDefaultShellRect,
    getDockviewSpikeStorageKey,
    getDockviewSpikeShellStorageKey,
    isDesktopDockviewViewport,
    isDockviewSpikeEnabled,
    readDockviewSpikeShellRect,
    resolveDockviewPopoutUrl,
} from "../src/platform/js/app/experimental-dockview-host.js";

describe("experimental Dockview host helpers", () => {
    afterEach(() => {
        delete globalThis.window;
        delete globalThis.document;
        delete globalThis.localStorage;
    });

    it("enables the workspace by default on desktop", () => {
        expect(isDesktopDockviewViewport({ innerWidth: 900 })).toBe(true);
        expect(isDockviewSpikeEnabled("", { innerWidth: 900 })).toBe(true);
    });

    it("keeps explicit Dockview and legacy panel flags as overrides", () => {
        expect(isDockviewSpikeEnabled("?dockPanels=1", { innerWidth: 500 })).toBe(true);
        expect(isDockviewSpikeEnabled("?dockPanels=true", { innerWidth: 500 })).toBe(true);
        expect(isDockviewSpikeEnabled("?dockPanels=yes", { innerWidth: 500 })).toBe(true);

        expect(isDockviewSpikeEnabled("?dockPanels=0", { innerWidth: 900 })).toBe(false);
        expect(isDockviewSpikeEnabled("?dockPanels=false", { innerWidth: 900 })).toBe(false);
        expect(isDockviewSpikeEnabled("?legacyPanels=1", { innerWidth: 900 })).toBe(false);
        expect(isDockviewSpikeEnabled("?legacyPanels=true&dockPanels=1", { innerWidth: 900 })).toBe(false);
    });

    it("does not enable the workspace by default on mobile", () => {
        expect(isDesktopDockviewViewport({ innerWidth: 600 })).toBe(false);
        expect(isDockviewSpikeEnabled("", { innerWidth: 600 })).toBe(false);
    });

    it("uses the current mission in the experimental storage key", () => {
        globalThis.window = {
            location: {
                pathname: "/artemis2/",
            },
        };

        expect(getDockviewSpikeStorageKey()).toBe("moon-mission:dockview-spike:v10:artemis2");
    });

    it("uses a separate shell geometry storage key", () => {
        globalThis.window = {
            location: {
                pathname: "/artemis2/",
            },
        };

        expect(getDockviewSpikeShellStorageKey()).toBe("moon-mission:dockview-spike:v10:artemis2:shell");
    });

    it("clamps shell geometry inside the viewport", () => {
        const windowRef = {
            innerWidth: 1000,
            innerHeight: 700,
        };

        expect(clampShellRect({
            left: -50,
            top: -20,
            width: 2000,
            height: 2000,
        }, windowRef)).toEqual({
            left: 12,
            top: 12,
            width: 976,
            height: 676,
        });
    });

    it("falls back to default shell geometry when saved state is invalid", () => {
        const windowRef = {
            innerWidth: 1440,
            innerHeight: 900,
        };
        globalThis.localStorage = {
            getItem: () => "{bad-json",
        };

        expect(readDockviewSpikeShellRect("bad-key", windowRef)).toEqual(getDefaultShellRect(windowRef));
    });

    it("resolves the popout page next to mission routes", () => {
        expect(resolveDockviewPopoutUrl({
            href: "http://127.0.0.1:7274/artemis2/",
        })).toBe("/popout.html");
        expect(resolveDockviewPopoutUrl({
            href: "https://sankara.net/astro/lunar-missions/artemis2/",
        })).toBe("/astro/lunar-missions/popout.html");
    });

    it("matches the Artemis II four-column workspace proportions on wide desktop layouts", () => {
        const sizes = calculateDefaultDockviewWorkspaceSizes(1910, 744);

        expect(sizes.leftRail).toBeGreaterThan(460);
        expect(sizes.main).toBeGreaterThanOrEqual(540);
        expect(sizes.frameShoot).toBeGreaterThan(620);
        expect(sizes.auxRail).toBeGreaterThanOrEqual(210);
    });

    it("places Mission Media below Frame and Shoot in the default workspace", () => {
        const panels = new Set([
            "mission:main-view",
            "workflow:background-media",
            "workflow:background-transcript",
            "workflow:media-browser",
            "aux:earth-rise-composer",
            "aux:moon",
            "aux:earth",
            "aux:earth-origin-orbit-xy",
        ]);
        let appliedLayout = null;
        const layoutHost = {
            api: {
                width: 1910,
                height: 744,
                getPanel: (id) => (panels.has(id) ? { id } : null),
                toJSON: () => ({ panels: {} }),
                fromJSON: (layout) => {
                    appliedLayout = layout;
                },
                layout() {},
            },
            focusPanel() {},
            saveLayout() {},
        };

        expect(applyDefaultDockviewWorkspaceLayout(layoutHost)).toBe(true);

        const [leftRail, mainView, frameAndMedia, auxRail] = appliedLayout.grid.root.data;
        expect(leftRail.data.map((leaf) => leaf.data.activeView)).toEqual([
            "workflow:background-media",
            "workflow:background-transcript",
        ]);
        expect(mainView.data.activeView).toBe("mission:main-view");
        expect(frameAndMedia.data.map((leaf) => leaf.data.activeView)).toEqual([
            "aux:earth-rise-composer",
            "workflow:media-browser",
        ]);
        expect(auxRail.data.map((leaf) => leaf.data.activeView)).toEqual([
            "aux:moon",
            "aux:earth",
            "aux:earth-origin-orbit-xy",
        ]);
    });

    it("renders compact Dockview header actions for maximize, float, and popout", () => {
        globalThis.document = {
            createElement: (tagName) => ({
                tagName,
                children: [],
                className: "",
                style: {},
                dataset: {},
                type: "",
                title: "",
                setAttribute(key, value) {
                    this[key] = value;
                },
                appendChild(child) {
                    this.children.push(child);
                    return child;
                },
                addEventListener() {},
                replaceChildren(...children) {
                    this.children = children;
                },
            }),
        };

        const renderer = createDockviewHeaderActionsRenderer({ popoutUrl: "/popout.html" });
        renderer.init({
            group: {},
            api: {},
            containerApi: {},
        });

        expect(renderer.element.children).toHaveLength(3);
        expect(renderer.element.className).toBe("experimental-dockview-host__header-actions");
    });

    it("toggles app fullscreen from the Dockview top-strip button", () => {
        const eventListeners = new Map();
        const createElement = (tagName) => {
            const listeners = new Map();
            return {
                tagName,
                children: [],
                className: "",
                disabled: false,
                attributes: {},
                classList: {
                    classes: new Set(),
                    toggle(name, enabled) {
                        if (enabled) {
                            this.classes.add(name);
                        } else {
                            this.classes.delete(name);
                        }
                    },
                    contains(name) {
                        return this.classes.has(name);
                    },
                },
                appendChild(child) {
                    this.children.push(child);
                    return child;
                },
                setAttribute(key, value) {
                    this.attributes[key] = value;
                },
                getAttribute(key) {
                    return this.attributes[key];
                },
                addEventListener(eventName, handler) {
                    listeners.set(eventName, handler);
                },
                removeEventListener(eventName) {
                    listeners.delete(eventName);
                },
                click() {
                    listeners.get("click")?.();
                },
            };
        };
        const documentRef = {
            fullscreenElement: null,
            createElement,
            documentElement: {
                requestFullscreen() {
                    documentRef.fullscreenElement = documentRef.documentElement;
                },
            },
            exitFullscreen() {
                documentRef.fullscreenElement = null;
            },
            addEventListener(eventName, handler) {
                eventListeners.set(eventName, handler);
            },
            removeEventListener(eventName) {
                eventListeners.delete(eventName);
            },
        };

        const { button, dispose } = createFullscreenToggleButton(documentRef);
        const icon = button.children[0];

        expect(button.getAttribute("aria-label")).toBe("Enter fullscreen");
        expect(button.getAttribute("aria-pressed")).toBe("false");
        expect(icon.className).toBe("dockview-panel-launch-strip__fullscreen-icon");
        expect(icon.textContent).toBe("⛶");

        button.click();
        expect(documentRef.fullscreenElement).toBe(documentRef.documentElement);
        expect(button.getAttribute("aria-label")).toBe("Exit fullscreen");
        expect(button.classList.contains("is-active")).toBe(true);
        expect(icon.textContent).toBe("⛶");

        button.click();
        expect(documentRef.fullscreenElement).toBe(null);
        expect(button.getAttribute("aria-label")).toBe("Enter fullscreen");
        expect(icon.textContent).toBe("⛶");

        dispose();
        expect(eventListeners.size).toBe(0);
    });

    it("adds Dockview tab menu actions for external window workflows", () => {
        const addFloatingGroup = () => {};
        const addPopoutGroup = () => {};

        expect(createDockviewTabContextMenuItems({
            panel: { id: "workflow:media-browser" },
            group: {
                api: {},
                element: {
                    getBoundingClientRect: () => ({ left: 0, top: 0 }),
                },
            },
            api: { addFloatingGroup, addPopoutGroup },
        }).map((item) => (typeof item === "string" ? item : item.label))).toEqual([
            "Maximize Group",
            "Float Group",
            "Open in New Window",
            "separator",
            "close",
            "closeOthers",
            "closeAll",
        ]);
    });
});
