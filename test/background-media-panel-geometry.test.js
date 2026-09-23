import { afterEach, describe, expect, it, vi } from "vitest";
import {
    createBackgroundMediaPanelActions,
} from "../src/platform/js/app/background-media-panel.js";
import { invokeMissionPanelAction } from "../src/platform/js/app/panel-registry.js";
import {
    installBackgroundPanelDom,
    openEnabledBackgroundPanel,
    resetBackgroundMediaPanelGlobals,
} from "./helpers/background-media-panel-harness.js";

describe("background media panel lifetime and geometry", () => {
    afterEach(resetBackgroundMediaPanelGlobals);

    it("reveals only explicit registry Focus, not automatic background Restore", () => {
        const { nodes } = installBackgroundPanelDom();
        nodes.get("background-media-panel").classList.contains.mockImplementation(name => name === "background-media-panel--dockview");
        const revealPanel = vi.fn(() => true), focusPanel = vi.fn(() => true);
        globalThis.__moonMissionDockviewSpike = { progressiveWorkspace: { revealPanel },
            layoutHost: { focusPanel, api: { getPanel: () => ({}) } } };
        const actions = createBackgroundMediaPanelActions();
        actions.setMissionContext({ available: true, configData: { ui: { panels: { defaults: {
            "workflow:background-media": { enabled: true, defaultState: "open" },
        } } } } });
        revealPanel.mockClear();
        expect(invokeMissionPanelAction("workflow:background-media", "restore")).toBe(true);
        expect(revealPanel).not.toHaveBeenCalled();
        expect(focusPanel).toHaveBeenCalled();
        expect(invokeMissionPanelAction("workflow:background-media", "focus")).toBe(true);
        expect(revealPanel).toHaveBeenCalledExactlyOnceWith("workflow:background-media");
    });

    it("binds broadcast dragging even when the first setup runs before panel DOM exists", () => {
        const nodes = new Map();
        const documentListeners = new Map();
        const storage = new Map();
        const makeClassList = (node) => ({
            toggle: vi.fn(),
            contains: vi.fn((name) => String(node.className || "").split(/\s+/).includes(name)),
            add: vi.fn((name) => {
                const classes = new Set(String(node.className || "").split(/\s+/).filter(Boolean));
                classes.add(name);
                node.className = Array.from(classes).join(" ");
            }),
            remove: vi.fn((name) => {
                const classes = String(node.className || "").split(/\s+/).filter(Boolean)
                    .filter((item) => item !== name);
                node.className = classes.join(" ");
            }),
        });
        const makeNode = (id) => {
            const listeners = new Map();
            const node = {
                id,
                className: "",
                children: [],
                hidden: false,
                textContent: "",
                title: "",
                dataset: {},
                style: {},
                offsetLeft: 8,
                offsetTop: 80,
                offsetWidth: 546,
                offsetHeight: 300,
                classList: null,
                setAttribute: vi.fn(),
                focus: vi.fn(),
                replaceChildren: vi.fn(),
                appendChild: vi.fn((child) => {
                    node.children.push(child);
                    child.parentElement = node;
                    return child;
                }),
                querySelector: vi.fn((selector) => {
                    if (!String(selector || "").startsWith(".")) return null;
                    const wanted = String(selector).slice(1);
                    return node.children.find((child) => (
                        String(child.className || "").split(/\s+/).includes(wanted)
                    )) || null;
                }),
                setPointerCapture: vi.fn(),
                hasPointerCapture: vi.fn(() => true),
                releasePointerCapture: vi.fn(),
                closest: vi.fn((selector) => (
                    String(selector || "").startsWith(".") &&
                    String(node.className || "").split(/\s+/).includes(String(selector).slice(1))
                        ? node
                        : null
                )),
                addEventListener(type, handler) {
                    const handlers = listeners.get(type) || [];
                    handlers.push(handler);
                    listeners.set(type, handlers);
                },
                dispatchEvent(event) {
                    if (!event.target) event.target = node;
                    if (typeof event.preventDefault !== "function") {
                        event.preventDefault = vi.fn();
                    }
                    for (const handler of listeners.get(event.type) || []) {
                        handler.call(node, event);
                    }
                },
                getBoundingClientRect() {
                    const left = Number.parseFloat(node.style.left) || node.offsetLeft;
                    const top = Number.parseFloat(node.style.top) || node.offsetTop;
                    const width = Number.parseFloat(node.style.width) || node.offsetWidth;
                    const height = Number.parseFloat(node.style.height) || node.offsetHeight;
                    return {
                        left,
                        top,
                        right: left + width,
                        bottom: top + height,
                        width,
                        height,
                    };
                },
            };
            node.classList = makeClassList(node);
            return node;
        };

        globalThis.localStorage = {
            getItem: vi.fn((key) => storage.get(key) || null),
            setItem: vi.fn((key, value) => storage.set(key, value)),
        };
        globalThis.window = {
            innerWidth: 1400,
            innerHeight: 900,
            missionConfig: { dataPath: "assets/artemis2/data/" },
            addEventListener: vi.fn(),
            setTimeout: vi.fn(() => 1),
            clearTimeout: vi.fn(),
        };
        globalThis.document = {
            getElementById: vi.fn((id) => nodes.get(id) || null),
            querySelector: vi.fn(() => ({ getBoundingClientRect: () => ({ bottom: 80 }) })),
            createElement: vi.fn((tagName) => makeNode(tagName)),
            addEventListener(type, handler) {
                const handlers = documentListeners.get(type) || [];
                handlers.push(handler);
                documentListeners.set(type, handlers);
            },
        };

        const actions = createBackgroundMediaPanelActions();
        const missionContext = {
            available: true,
            configData: {
                ui: {
                    panels: {
                        defaults: {
                            "workflow:background-media": {
                                enabled: true,
                                defaultState: "open",
                            },
                        },
                    },
                },
            },
        };
        actions.setMissionContext(missionContext);

        const panel = makeNode("background-media-panel");
        const header = makeNode("background-media-panel-header");
        panel.querySelector = vi.fn((selector) => (
            selector === ".background-media-panel__header" ? header : null
        ));
        nodes.set("background-media-panel", panel);
        nodes.set("background-media-panel-wrapper", makeNode("background-media-panel-wrapper"));
        [
            "background-media-panel-close",
            "background-media-panel-expand",
            "background-media-enable",
            "background-media-timeline",
            "background-media-mute",
            "background-media-captions",
            "background-media-video",
        ].forEach((id) => nodes.set(id, makeNode(id)));

        actions.setMissionContext(missionContext);

        header.dispatchEvent({
            type: "pointerdown",
            pointerId: 4,
            button: 0,
            clientX: 40,
            clientY: 50,
            target: header,
        });
        for (const handler of documentListeners.get("pointermove") || []) {
            handler({
                type: "pointermove",
                pointerId: 4,
                clientX: 100,
                clientY: 90,
                preventDefault: vi.fn(),
            });
        }
        actions.setMissionContext(missionContext);

        expect(panel.style.left).toBe("92px");
        expect(panel.style.top).toBe("48px");

        for (const handler of documentListeners.get("pointerup") || []) {
            handler({
                type: "pointerup",
                pointerId: 4,
                preventDefault: vi.fn(),
            });
        }

        expect(panel.style.left).toBe("92px");
        expect(panel.style.top).toBe("48px");
        const savedLayout = JSON.parse(storage.get("moon-mission:panel-layout:v1:artemis2"));
        expect(savedLayout.panels["workflow:background-media"].rect).toEqual(expect.objectContaining({
            left: 92,
            top: 48,
        }));
    });

    it("adds broadcast panel delete control and resizes from every corner", () => {
        const nodes = new Map();
        const storage = new Map();
        const makeClassList = (node) => ({
            toggle: vi.fn(),
            contains: vi.fn((name) => String(node.className || "").split(/\s+/).includes(name)),
        });
        const makeNode = (id) => {
            const listeners = new Map();
            const node = {
                id,
                className: "",
                children: [],
                hidden: false,
                textContent: "",
                title: "",
                dataset: {},
                style: {},
                offsetLeft: 100,
                offsetTop: 120,
                offsetWidth: 546,
                offsetHeight: 340,
                classList: null,
                setAttribute: vi.fn(),
                focus: vi.fn(),
                replaceChildren: vi.fn(),
                appendChild(child) {
                    node.children.push(child);
                    child.parentElement = node;
                    return child;
                },
                querySelector(selector) {
                    if (!String(selector || "").startsWith(".")) return null;
                    const wanted = String(selector).slice(1);
                    return node.children.find((child) => (
                        String(child.className || "").split(/\s+/).includes(wanted)
                    )) || null;
                },
                setPointerCapture: vi.fn(),
                hasPointerCapture: vi.fn(() => true),
                releasePointerCapture: vi.fn(),
                closest(selector) {
                    if (!String(selector || "").startsWith(".")) return null;
                    const wanted = String(selector).slice(1);
                    return String(node.className || "").split(/\s+/).includes(wanted) ? node : null;
                },
                addEventListener(type, handler) {
                    const handlers = listeners.get(type) || [];
                    handlers.push(handler);
                    listeners.set(type, handlers);
                },
                dispatchEvent(event) {
                    if (!event.target) event.target = node;
                    event.preventDefault ||= vi.fn();
                    event.stopPropagation ||= vi.fn();
                    for (const handler of listeners.get(event.type) || []) {
                        handler.call(node, event);
                    }
                },
                getBoundingClientRect() {
                    const left = Number.parseFloat(node.style.left) || node.offsetLeft;
                    const top = Number.parseFloat(node.style.top) || node.offsetTop;
                    const width = Number.parseFloat(node.style.width) || node.offsetWidth;
                    const height = Number.parseFloat(node.style.height) || node.offsetHeight;
                    return {
                        left,
                        top,
                        right: left + width,
                        bottom: top + height,
                        width,
                        height,
                    };
                },
            };
            node.classList = makeClassList(node);
            return node;
        };

        globalThis.localStorage = {
            getItem: vi.fn((key) => storage.get(key) || null),
            setItem: vi.fn((key, value) => storage.set(key, value)),
        };
        globalThis.window = {
            innerWidth: 1400,
            innerHeight: 900,
            missionConfig: { dataPath: "assets/artemis2/data/" },
            addEventListener: vi.fn(),
            setTimeout: vi.fn(() => 1),
            clearTimeout: vi.fn(),
        };
        globalThis.document = {
            getElementById: vi.fn((id) => nodes.get(id) || null),
            querySelector: vi.fn(() => ({ getBoundingClientRect: () => ({ bottom: 80 }) })),
            createElement: vi.fn((tagName) => makeNode(tagName)),
            addEventListener: vi.fn(),
        };

        const panel = makeNode("background-media-panel");
        panel.style.left = "100px";
        panel.style.top = "120px";
        panel.style.width = "546px";
        panel.style.height = "340px";
        const header = makeNode("background-media-panel-header");
        header.className = "background-media-panel__header";
        const headerControls = makeNode("background-media-panel-header-controls");
        headerControls.className = "background-media-panel__header-controls";
        panel.appendChild(header);
        panel.appendChild(headerControls);
        nodes.set("background-media-panel", panel);
        nodes.set("background-media-panel-wrapper", makeNode("background-media-panel-wrapper"));
        [
            "background-media-panel-close",
            "background-media-panel-expand",
            "background-media-enable",
            "background-media-timeline",
            "background-media-mute",
            "background-media-captions",
            "background-media-video",
            "background-media-empty",
            "background-media-live",
            "background-media-time-overlay",
            "background-media-title",
            "background-media-status",
            "background-media-controls",
        ].forEach((id) => nodes.set(id, makeNode(id)));

        const actions = createBackgroundMediaPanelActions();
        actions.setMissionContext({
            available: true,
            configData: {
                ui: {
                    panels: {
                        defaults: {
                            "workflow:background-media": {
                                enabled: true,
                                defaultState: "open",
                            },
                        },
                    },
                },
            },
        });

        const deleteButton = headerControls.children.find((child) => child.id === "background-media-panel-delete");
        expect(deleteButton?.dataset.icon).toBe("delete");
        expect(panel.children.filter((child) => (
            String(child.className || "").includes("background-media-panel__resize-grip")
        ))).toHaveLength(4);

        for (const [corner, eventPatch, expected] of [
            ["nw", { clientX: 80, clientY: 100 }, { left: "80px", top: "100px", width: "566px", height: "360px" }],
            ["ne", { clientX: 680, clientY: 90 }, { left: "100px", top: "90px", width: "580px", height: "370px" }],
            ["sw", { clientX: 70, clientY: 480 }, { left: "70px", top: "120px", width: "576px", height: "360px" }],
            ["se", { clientX: 690, clientY: 500 }, { left: "100px", top: "120px", width: "590px", height: "380px" }],
        ]) {
            panel.style.left = "100px";
            panel.style.top = "120px";
            panel.style.width = "546px";
            panel.style.height = "340px";
            const grip = panel.querySelector(`.background-media-panel__resize-grip--${corner}`);
            panel.dispatchEvent({
                type: "pointerdown",
                pointerId: 9,
                button: 0,
                clientX: corner.includes("e") ? 646 : 100,
                clientY: corner.includes("s") ? 460 : 120,
                target: grip,
            });
            panel.dispatchEvent({
                type: "pointermove",
                pointerId: 9,
                ...eventPatch,
            });
            expect(panel.style.left).toBe(expected.left);
            expect(panel.style.top).toBe(expected.top);
            expect(panel.style.width).toBe(expected.width);
            expect(panel.style.height).toBe(expected.height);
            panel.dispatchEvent({
                type: "pointerup",
                pointerId: 9,
            });
        }
    });
});
