import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ hosts: [], saved: false, progressive: [], constructionFailure: null }));
vi.mock("../src/platform/js/app/panel-layout-host.js", () => ({
    readPanelLayoutHostState: () => null,
    createPanelLayoutHost: options => {
        if (mocks.constructionFailure) {
            options.renderPanel({ id: "mission:main-view" });
            throw mocks.constructionFailure;
        }
        const panels = new Map(options.panels.map(panel => [panel.id, panel]));
        const host = { options, panels, didRestoreInitialLayout: mocks.saved,
            api: { getPanel: id => panels.get(id), toJSON: () => ({ panels: Object.fromEntries(panels) }),
                fromJSON: vi.fn(), layout: vi.fn(), width: 1600, height: 900 },
            addPanel: vi.fn(panel => { panels.set(panel.id, panel); return panel; }),
            closePanel: vi.fn(id => panels.delete(id)), focusPanel: vi.fn(id => panels.has(id)),
            saveLayout: vi.fn(), dispose: vi.fn() };
        mocks.hosts.push(host);
        return host;
    },
}));
vi.mock("../src/platform/js/app/progressive-workspace.js", () => ({
    createProgressiveWorkspace: () => {
        const value = { dispose: vi.fn(), captureExpandedLayout: vi.fn(), revealPanel: vi.fn() };
        mocks.progressive.push(value); return value;
    },
}));

function documentFixture() {
    const nodes = [];
    const createElement = () => {
        const classes = new Set(), listeners = new Map();
        const node = { children: [], dataset: {}, style: {}, className: "", parentNode: null,
            classList: { add: (...values) => values.forEach(value => classes.add(value)),
                remove: (...values) => values.forEach(value => classes.delete(value)), contains: value => classes.has(value),
                toggle: (value, enabled) => enabled ? classes.add(value) : classes.delete(value) },
            setAttribute() {}, getAttribute() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; },
            appendChild(child) { child.remove(); this.children.push(child); child.parentNode = this; return child; },
            append(...children) { children.forEach(child => this.appendChild(child)); },
            insertBefore(child) { this.appendChild(child); },
            replaceChildren(...children) { this.children.slice().forEach(child => child.remove()); this.append(...children); },
            remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this); this.parentNode = null; },
            addEventListener: (type, callback) => listeners.set(type, callback),
            removeEventListener: type => listeners.delete(type), dispatchEvent: event => listeners.get(event.type)?.(event),
        };
        nodes.push(node); return node;
    };
    const body = createElement();
    return { body, documentElement: body, createElement, getElementById: id => nodes.find(node => node.id === id && node.parentNode) || null,
        addEventListener() {}, removeEventListener() {} };
}

let initialize, register, update, ids, documentRef;
beforeEach(async () => {
    vi.resetModules(); vi.useFakeTimers(); mocks.hosts.length = 0; mocks.progressive.length = 0; mocks.saved = false;
    mocks.constructionFailure = null;
    documentRef = documentFixture();
    vi.stubGlobal("document", documentRef);
    vi.stubGlobal("window", { innerWidth: 1600, innerHeight: 900, location: { pathname: "/artemis2/", search: "", href: "https://example.test/artemis2/" } });
    vi.stubGlobal("requestAnimationFrame", callback => setTimeout(callback, 16));
    vi.stubGlobal("cancelAnimationFrame", handle => clearTimeout(handle));
    delete globalThis.__moonMissionDockviewSpike;
    delete globalThis.__moonMissionResetDockviewWorkspace;
    ({ initializeExperimentalDockviewHost: initialize, DEFAULT_OPEN_DOCKVIEW_PANEL_IDS: ids } = await import("../src/platform/js/app/experimental-dockview-host.js"));
    ({ registerMissionPanel: register, updateMissionPanel: update } = await import("../src/platform/js/app/panel-registry.js"));
});
afterEach(() => {
    globalThis.__moonMissionDockviewSpike?.dispose();
    delete globalThis.__moonMissionDockviewSpike; delete globalThis.__moonMissionResetDockviewWorkspace;
    vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals();
});
function panel(id, { available = true, open = true } = {}) {
    const action = vi.fn(() => {
        if (open) globalThis.__moonMissionDockviewSpike?.layoutHost.addPanel({ id });
    });
    register({ id, available, state: "closed", actions: { restore: action } });
    return action;
}

describe("Dockview host default readiness and lifetime", () => {
    it("publishes the host before synchronous default-panel subscribers try to dock", () => {
        ids.forEach(id => panel(id));
        const workspace = initialize();
        for (const id of ids) expect(workspace.api.getPanel(id), id).toBeTruthy();
        expect(workspace.api.fromJSON).toHaveBeenCalled();
    });

    it("keeps a requested panel pending until it actually appears", () => {
        const id = "workflow:media-browser";
        panel(id, { open: false });
        const workspace = initialize();
        const restore = vi.fn(() => workspace.layoutHost.addPanel({ id }));
        update(id, { title: "Now ready", actions: { restore } });
        expect(workspace.api.getPanel(id)).toBeTruthy();
    });

    it("does not discard unavailable default panels after eight seconds", () => {
        const id = "workflow:media-browser";
        panel(id, { available: false });
        const workspace = initialize();
        vi.advanceTimersByTime(9000);
        update(id, { available: true });
        expect(workspace.api.getPanel(id)).toBeTruthy();
    });

    it("does not repeat completed close intents or steal focus while another default remains unavailable", async () => {
        panel("workflow:media-browser", { available: false });
        const close = vi.fn(() => update("aux:earth-to-moon", { state: "closed" }));
        register({ id: "aux:earth-to-moon", available: true, state: "open", actions: { close } });
        const workspace = initialize();
        await Promise.resolve();
        expect(close).toHaveBeenCalledOnce();
        close.mockClear(); workspace.layoutHost.focusPanel.mockClear();
        update("aux:earth-to-moon", { state: "open" });
        update("workflow:media-browser", { title: "Metadata only" });
        await Promise.resolve();
        expect(close).not.toHaveBeenCalled();
        expect(workspace.layoutHost.focusPanel).not.toHaveBeenCalled();
    });

    it("makes disposal terminal and idempotent, including captured Reset actions", () => {
        const workspace = initialize(), host = workspace.layoutHost;
        workspace.dispose(); workspace.dispose();
        host.addPanel.mockClear(); host.focusPanel.mockClear(); host.saveLayout.mockClear();
        workspace.resetWorkspaceLayout(); vi.runAllTimers();
        expect(host.dispose).toHaveBeenCalledOnce();
        expect(host.addPanel).not.toHaveBeenCalled();
        expect(host.focusPanel).not.toHaveBeenCalled();
        expect(host.saveLayout).not.toHaveBeenCalled();
        expect(globalThis.__moonMissionDockviewSpike).toBeUndefined();
    });

    it("does not reopen main or close workflow panels from a retired host's queued callbacks", async () => {
        const close = vi.fn();
        register({ id: "workflow:media-browser", state: "open", available: false, actions: { close } });
        const workspace = initialize(), host = workspace.layoutHost;
        host.options.onPanelClose("mission:main-view");
        host.options.onPanelClose("workflow:media-browser");
        workspace.dispose(); host.addPanel.mockClear();
        await Promise.resolve();
        expect(host.addPanel).not.toHaveBeenCalled();
        expect(close).not.toHaveBeenCalled();
    });

    it("an old repeated dispose cannot clear the replacement's globals or body class", () => {
        const old = initialize();
        const current = initialize();
        old.dispose();
        expect(globalThis.__moonMissionDockviewSpike).toBe(current);
        expect(globalThis.__moonMissionResetDockviewWorkspace).toBe(current.resetWorkspaceLayout);
        expect(documentRef.body.classList.contains("dockview-panels-enabled")).toBe(true);
    });

    it("a replacement created inside old cleanup wins over the interrupted initialization", () => {
        const old = initialize();
        let nested;
        old.layoutHost.dispose.mockImplementationOnce(() => { nested = initialize(); });
        const returned = initialize();
        expect(returned).toBe(nested);
        expect(globalThis.__moonMissionDockviewSpike).toBe(nested);
        expect(mocks.hosts).toHaveLength(2);
    });

    it("Reset stops publishing after fromJSON synchronously retires its host", () => {
        const workspace = initialize(), host = workspace.layoutHost;
        ids.forEach(id => host.addPanel({ id }));
        host.api.fromJSON.mockImplementationOnce(() => workspace.dispose());
        host.focusPanel.mockClear(); host.saveLayout.mockClear(); host.api.layout.mockClear();
        workspace.resetWorkspaceLayout();
        expect(host.focusPanel).not.toHaveBeenCalled();
        expect(host.saveLayout).not.toHaveBeenCalled();
        expect(host.api.layout).not.toHaveBeenCalled();
    });

    it("continues cleanup when a native adapter throws", () => {
        vi.spyOn(console, "warn").mockImplementation(() => {});
        const workspace = initialize();
        workspace.layoutHost.dispose.mockImplementationOnce(() => { throw new Error("native cleanup failed"); });
        workspace.dispose();
        expect(globalThis.__moonMissionDockviewSpike).toBeUndefined();
        expect(workspace.root.parentNode).toBeNull();
        expect(documentRef.body.classList.contains("dockview-panels-enabled")).toBe(false);
    });

    it("unpublishes and unsubscribes a host when an immediate default-panel action throws", () => {
        const failure = new Error("panel restore failed");
        const restore = vi.fn(() => { throw failure; });
        register({ id: "workflow:media-browser", available: true, actions: { restore } });
        expect(() => initialize()).toThrow(failure);
        expect(globalThis.__moonMissionDockviewSpike).toBeUndefined();
        expect(globalThis.__moonMissionResetDockviewWorkspace).toBeUndefined();
        expect(documentRef.body.classList.contains("dockview-panels-enabled")).toBe(false);
        expect(mocks.hosts[0].dispose).toHaveBeenCalledOnce();
        restore.mockClear();
        expect(() => update("workflow:media-browser", { title: "A later update" })).not.toThrow();
        expect(restore).not.toHaveBeenCalled();
        vi.runAllTimers();
    });

    it("cleans pre-publication DOM and rendered work if the layout adapter constructor throws", () => {
        const strip = documentRef.createElement("div"); strip.id = "header-pill-strip"; documentRef.body.appendChild(strip);
        const failure = new Error("layout construction failed"); mocks.constructionFailure = failure;
        expect(() => initialize()).toThrow(failure);
        expect(globalThis.__moonMissionDockviewSpike).toBeUndefined();
        expect(documentRef.getElementById("experimental-dockview-host")).toBeNull();
        expect(documentRef.body.classList.contains("dockview-panels-enabled")).toBe(false);
        expect(strip.parentNode).toBe(documentRef.body);
        expect(vi.getTimerCount()).toBe(0);
    });

    it("captured renderer factories cannot mount DOM or schedule work after host retirement", () => {
        const workspace = initialize(); workspace.dispose();
        const strip = documentRef.createElement("div"); strip.id = "header-pill-strip"; documentRef.body.appendChild(strip);
        const resize = vi.fn(); vi.stubGlobal("__moonMissionResizeMainView", resize);
        const view = workspace.layoutHost.options.renderPanel({ id: "mission:main-view" });
        expect(view.element).toBeTruthy();
        expect(strip.parentNode).toBe(documentRef.body);
        vi.runAllTimers();
        expect(resize).not.toHaveBeenCalled();
    });

    it("retires a just-created renderer if its mounted event disposes the host", () => {
        vi.stubGlobal("CustomEvent", class { constructor(type, options) { this.type = type; Object.assign(this, options); } });
        const node = documentRef.createElement("div"); node.id = "test-workflow"; documentRef.body.appendChild(node);
        const workspace = initialize();
        node.addEventListener("moon-mission:dockview-panel-mounted", () => workspace.dispose());
        workspace.layoutHost.options.renderPanel({ id: "workflow:test", params: { mountElementId: node.id } });
        expect(node.parentNode).toBe(documentRef.body);
        expect(globalThis.__moonMissionDockviewSpike).toBeUndefined();
    });

    it("does not reclaim main-view nodes adopted by another renderer during native disposal", () => {
        const strip = documentRef.createElement("div"); strip.id = "header-pill-strip"; documentRef.body.appendChild(strip);
        const workspace = initialize();
        workspace.layoutHost.options.renderPanel({ id: "mission:main-view" });
        const replacementMount = documentRef.createElement("div"); documentRef.body.appendChild(replacementMount);
        workspace.layoutHost.dispose.mockImplementationOnce(() => replacementMount.appendChild(strip));
        workspace.dispose();
        expect(strip.parentNode).toBe(replacementMount);
    });

    it("main reopen stops before save if focusing retires the host", async () => {
        const workspace = initialize(), host = workspace.layoutHost;
        host.focusPanel.mockImplementationOnce(() => workspace.dispose());
        host.saveLayout.mockClear();
        host.options.onPanelClose("mission:main-view");
        await Promise.resolve();
        expect(host.saveLayout).not.toHaveBeenCalled();
    });

    it("reset fallback stops before save if focusing retires the host", () => {
        const workspace = initialize(), host = workspace.layoutHost;
        host.focusPanel.mockImplementationOnce(() => workspace.dispose());
        host.saveLayout.mockClear();
        workspace.resetWorkspaceLayout(); vi.runAllTimers();
        expect(host.saveLayout).not.toHaveBeenCalled();
    });

    it("cancels pending main-view resize frames on renderer retirement", () => {
        const resize = vi.fn(); vi.stubGlobal("__moonMissionResizeMainView", resize);
        const workspace = initialize();
        const view = workspace.layoutHost.options.renderPanel({ id: "mission:main-view" });
        view.layout(); view.dispose(); resize.mockClear();
        vi.runAllTimers();
        expect(resize).not.toHaveBeenCalled();
    });

    it("host retirement also cancels its rendered main view's ribbon and frame work", () => {
        const strip = documentRef.createElement("div"); strip.id = "header-pill-strip"; documentRef.body.appendChild(strip);
        const workspace = initialize();
        workspace.layoutHost.options.renderPanel({ id: "mission:main-view" });
        const lookup = vi.spyOn(documentRef, "getElementById");
        workspace.dispose(); lookup.mockClear();
        vi.runAllTimers();
        expect(lookup).not.toHaveBeenCalled();
    });

    it("a cancelled animation frame delivered anyway cannot resize the replacement", () => {
        const frames = [];
        vi.stubGlobal("requestAnimationFrame", callback => { frames.push(callback); return frames.length; });
        vi.stubGlobal("cancelAnimationFrame", vi.fn());
        const workspace = initialize();
        const view = workspace.layoutHost.options.renderPanel({ id: "mission:main-view" });
        view.dispose();
        const resize = vi.fn(); vi.stubGlobal("__moonMissionResizeMainView", resize);
        frames.forEach(callback => callback());
        expect(resize).not.toHaveBeenCalled();
    });

    it("leaves restored layouts out of default-panel opening", () => {
        mocks.saved = true;
        const open = panel("workflow:media-browser");
        initialize();
        expect(open).not.toHaveBeenCalled();
    });
});
