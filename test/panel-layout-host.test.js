import { afterEach, describe, expect, it, vi } from "vitest";

import {
    createPanelLayoutHost,
    getPanelLayoutHostStorageKey,
    normalizePanelLayoutMissionKey,
} from "../src/platform/js/app/panel-layout-host.js";

function createStorageStub() {
    const values = new Map();
    return {
        getItem: vi.fn((key) => values.get(key) ?? null),
        setItem: vi.fn((key, value) => values.set(key, String(value))),
        removeItem: vi.fn((key) => values.delete(key)),
        values,
    };
}

function createContainerStub() {
    return {
        clientWidth: 640,
        clientHeight: 360,
        getBoundingClientRect: vi.fn(() => ({
            width: 640,
            height: 360,
        })),
    };
}

function createDockviewApiStub({ throwFromJSON = false } = {}) {
    const listeners = {
        layout: [],
        active: [],
        removed: [],
    };
    const panels = new Map();
    const api = {
        clear: vi.fn(() => panels.clear()),
        dispose: vi.fn(),
        fromJSON: vi.fn((layout) => {
            if (throwFromJSON) {
                throw new Error("bad layout");
            }
            panels.clear();
            for (const panelId of layout?.panelIds || []) {
                api.addPanel({ id: panelId, component: "restored", title: panelId });
            }
        }),
        getPanel: vi.fn((id) => panels.get(id)),
        layout: vi.fn(),
        addPanel: vi.fn((options) => {
            const panel = {
                id: options.id,
                options,
                focus: vi.fn(() => {
                    listeners.active.forEach((listener) => listener(panel));
                }),
                api: {
                    close: vi.fn(() => {
                        panels.delete(options.id);
                        listeners.removed.forEach((listener) => listener(panel));
                    }),
                },
            };
            panels.set(options.id, panel);
            return panel;
        }),
        removePanel: vi.fn((panel) => {
            panels.delete(panel.id);
            listeners.removed.forEach((listener) => listener(panel));
        }),
        toJSON: vi.fn(() => ({
            panelIds: Array.from(panels.keys()),
        })),
        onDidLayoutChange: vi.fn((listener) => {
            listeners.layout.push(listener);
            return { dispose: vi.fn() };
        }),
        onDidActivePanelChange: vi.fn((listener) => {
            listeners.active.push(listener);
            return { dispose: vi.fn() };
        }),
        onDidRemovePanel: vi.fn((listener) => {
            listeners.removed.push(listener);
            return { dispose: vi.fn() };
        }),
        __listeners: listeners,
        __panels: panels,
    };
    return api;
}

describe("panel layout host", () => {
    afterEach(() => {
        delete globalThis.localStorage;
    });

    it("normalizes mission keys for layout storage", () => {
        expect(normalizePanelLayoutMissionKey(" Artemis II ")).toBe("artemis-ii");
        expect(normalizePanelLayoutMissionKey("")).toBe("unknown");
        expect(getPanelLayoutHostStorageKey("Artemis2")).toBe("moon-mission:dockview-layout:v1:artemis2");
    });

    it("adds default panels and maps focus and close callbacks through the adapter", () => {
        globalThis.localStorage = createStorageStub();
        const api = createDockviewApiStub();
        const onPanelFocus = vi.fn();
        const onPanelClose = vi.fn();

        const host = createPanelLayoutHost({
            container: createContainerStub(),
            missionKey: "artemis2",
            panels: [
                { id: "workflow:media-browser", title: "Mission Media" },
            ],
            renderPanel: vi.fn(),
            onPanelFocus,
            onPanelClose,
            createDockviewImpl: vi.fn(() => api),
        });

        expect(api.addPanel).toHaveBeenCalledWith(expect.objectContaining({
            id: "workflow:media-browser",
            title: "Mission Media",
        }));
        expect(host.focusPanel("workflow:media-browser")).toBe(true);
        expect(onPanelFocus).toHaveBeenCalledWith("workflow:media-browser");
        expect(host.closePanel("workflow:media-browser")).toBe(true);
        expect(onPanelClose).toHaveBeenCalledWith("workflow:media-browser");
        expect(globalThis.localStorage.setItem).toHaveBeenCalledWith(
            "moon-mission:dockview-layout:v1:artemis2",
            expect.stringContaining("workflow:media-browser"),
        );

        host.dispose();
        expect(api.dispose).toHaveBeenCalled();
    });

    it("recovers from a corrupt saved layout by rebuilding default panels", () => {
        const storage = createStorageStub();
        storage.values.set("dock-key", JSON.stringify({ corrupt: true }));
        globalThis.localStorage = storage;
        const api = createDockviewApiStub({ throwFromJSON: true });

        const host = createPanelLayoutHost({
            container: createContainerStub(),
            storageKey: "dock-key",
            panels: [
                { id: "workflow:splashdown", title: "Splashdown" },
            ],
            renderPanel: vi.fn(),
            createDockviewImpl: vi.fn(() => api),
        });

        expect(api.fromJSON).toHaveBeenCalledWith({ corrupt: true }, { reuseExistingPanels: false });
        expect(host.didRestoreInitialLayout).toBe(false);
        expect(api.clear).toHaveBeenCalled();
        expect(api.addPanel).toHaveBeenCalledWith(expect.objectContaining({
            id: "workflow:splashdown",
        }));
    });

    it("passes Dockview options through while keeping the shared renderer", () => {
        globalThis.localStorage = createStorageStub();
        const api = createDockviewApiStub();
        const createDockviewImpl = vi.fn(() => api);
        const createRightHeaderActionComponent = vi.fn();
        const getTabContextMenuItems = vi.fn();

        createPanelLayoutHost({
            container: createContainerStub(),
            storageKey: "dock-key",
            panels: [],
            renderPanel: vi.fn(),
            dockviewOptions: {
                floatingGroupBounds: "boundedWithinViewport",
                popoutUrl: "/popout.html",
                createRightHeaderActionComponent,
                getTabContextMenuItems,
            },
            createDockviewImpl,
        });

        expect(createDockviewImpl).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
            floatingGroupBounds: "boundedWithinViewport",
            popoutUrl: "/popout.html",
            createRightHeaderActionComponent,
            getTabContextMenuItems,
            createComponent: expect.any(Function),
        }));
    });

    it("passes floating panel bounds through to Dockview", () => {
        globalThis.localStorage = createStorageStub();
        const api = createDockviewApiStub();

        const host = createPanelLayoutHost({
            container: createContainerStub(),
            storageKey: "dock-key",
            panels: [],
            renderPanel: vi.fn(),
            createDockviewImpl: vi.fn(() => api),
        });

        host.addPanel({
            id: "workflow:floating-controls",
            title: "Floating Controls",
            floating: {
                x: 24,
                y: 40,
                width: 320,
                height: 480,
            },
        });

        expect(api.addPanel).toHaveBeenCalledWith(expect.objectContaining({
            id: "workflow:floating-controls",
            floating: {
                x: 24,
                y: 40,
                width: 320,
                height: 480,
            },
        }));
    });
});
