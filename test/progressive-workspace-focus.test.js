import { describe, expect, it, vi } from "vitest";
import { createProgressiveWorkspace } from "../src/platform/js/app/progressive-workspace.js";

const MAIN = "mission:main-view";
const TOOL = "workflow:background-media";

// A small DOM model: inherited inert/hidden suppress focus, independently of
// Dockview visibility (the regression is that visibility alone leaves tabs live).
function element(documentRef, parent = null) {
    return {
        parentElement: parent, inert: false, hidden: false, dataset: {},
        contains(node) {
            for (; node; node = node.parentElement) if (node === this) return true;
            return false;
        },
        closest(selector) {
            for (let node = this; node; node = node.parentElement) {
                if ((selector.includes("[inert]") && node.inert) || (selector.includes("[hidden]") && node.hidden)) return node;
            }
            return null;
        },
        getClientRects() { return this.closest("[hidden]") ? [] : [{}]; },
        focus() { if (!this.closest("[inert], [hidden]")) documentRef.activeElement = this; },
    };
}

function harness({ toolVisible = true, toolInert = false, width = 800 } = {}) {
    const frames = new Map(), events = new Map();
    let nextFrame = 0, filter, userEditHandler;
    const savedLayouts = [];
    const documentRef = { dispatchEvent: vi.fn(), activeElement: null };
    documentRef.body = element(documentRef);
    const root = element(documentRef, documentRef.body);
    const tools = element(documentRef, documentRef.body);
    const scene = element(documentRef, documentRef.body);
    documentRef.querySelector = selector => selector === ".workspace-tools__summary" ? tools : selector === ".workspace-scene-return" ? scene : null;
    const windowRef = {
        innerWidth: width, innerHeight: 900,
        requestAnimationFrame: callback => { frames.set(++nextFrame, callback); return nextFrame; },
        cancelAnimationFrame: id => frames.delete(id),
        addEventListener: (name, callback) => events.set(name, callback),
        removeEventListener: (name, callback) => { if (events.get(name) === callback) events.delete(name); },
    };
    const subscribers = [];
    const subscribe = callback => { subscribers.push(callback); return { dispose: vi.fn() }; };
    const api = {
        groups: [], activeGroup: null,
        getPanel: id => api.groups.flatMap(group => group.panels).find(panel => panel.id === id),
        onDidLayoutChange: subscribe, onDidAddPanel: subscribe, onDidRemovePanel: subscribe,
        toJSON: () => ({
            grid: { width: 1920, height: 900, root: { type: "branch", size: 900, data: api.groups.map(group => ({
                type: "leaf", size: 600, data: { id: group.id, views: group.panels.map(panel => panel.id), activeView: group.panels[0].id },
            })) } },
            panels: Object.fromEntries(api.groups.flatMap(group => group.panels).map(panel => [panel.id, { id: panel.id }])),
            activeGroup: api.activeGroup?.id,
        }),
    };
    function group(id, panelId) {
        const container = element(documentRef, root), button = element(documentRef, container);
        const result = { id, element: container, button, panels: [], api: {
            location: { type: "grid" }, isVisible: true,
            setVisible: vi.fn(visible => { result.api.isVisible = visible; }),
        } };
        result.panels.push({ id: panelId, group: result, focus: vi.fn(() => button.focus()), api: {
            setConstraints: vi.fn(), setActive: vi.fn(() => { api.activeGroup = result; }),
        } });
        return result;
    }
    const main = group("main", MAIN), tool = group("tool", TOOL);
    tool.api.isVisible = toolVisible; tool.element.inert = toolInert;
    api.groups = [main, tool]; api.activeGroup = main;
    const layoutHost = {
        api, setPersistenceFilter: vi.fn(value => { filter = value; }),
        setUserLayoutEditHandler: vi.fn(value => { userEditHandler = value; }),
        cancelUserLayoutEdit: vi.fn(),
        saveLayout: () => { const saved = filter?.(api.toJSON()); savedLayouts.push(saved); return saved; }, layout: vi.fn(),
        applyTransientLayout: vi.fn(() => { for (const current of api.groups) current.api.setVisible(true); }),
    };
    const workspace = createProgressiveWorkspace({ layoutHost, root, documentRef, windowRef });
    const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback()); };
    const resize = width => { windowRef.innerWidth = width; events.get("resize")?.(); flush(); };
    return { workspace, layoutHost, api, main, tool, tools, scene, documentRef, windowRef, frames, subscribers, group, flush, resize,
        savedLayouts, commitUserEdit: edit => userEditHandler?.(edit) };
}

describe("progressive workspace keyboard ownership", () => {
    it("projects an explicit compact divider edit into the saved expanded layout", () => {
        const h = harness(); h.flush();
        const before = h.api.toJSON(), after = structuredClone(before);
        before.grid.root.data[0].size = 600; before.grid.root.data[1].size = 600;
        after.grid.root.data[0].size = 700; after.grid.root.data[1].size = 500;
        h.commitUserEdit({ kind: "sash", before, after });
        const saved = h.savedLayouts.at(-1);
        expect(saved.grid.width).toBe(1920);
        expect(saved.grid.root.data[0].size).toBeCloseTo(700, 8);
        expect(saved.grid.root.data[1].size).toBeCloseTo(500, 8);
    });

    it("cancels an in-flight explicit edit on viewport resize and disposal", () => {
        const h = harness(); h.flush(); h.layoutHost.cancelUserLayoutEdit.mockClear();
        h.resize(1366);
        expect(h.layoutHost.cancelUserLayoutEdit).toHaveBeenCalledOnce();
        h.workspace.dispose();
        expect(h.layoutHost.setUserLayoutEditHandler).toHaveBeenLastCalledWith(null);
        expect(h.layoutHost.cancelUserLayoutEdit).toHaveBeenCalledTimes(2);
    });
    it("makes collapsed descendants inert and restores their keyboard access on reveal", () => {
        const h = harness(); h.flush();
        expect(h.tool.api.isVisible).toBe(false);
        expect(h.tool.element.inert).toBe(true);
        h.tool.button.focus(); expect(h.documentRef.activeElement).not.toBe(h.tool.button);
        h.workspace.revealPanel(TOOL);
        expect(h.tool.element.inert).toBe(false);
        expect(h.documentRef.activeElement).toBe(h.tool.button);
        expect(h.main.element.inert).toBe(true);
    });

    it("never clears pre-existing inert or hidden state", () => {
        const h = harness({ toolInert: true }); h.tool.element.hidden = true; h.flush();
        h.workspace.revealPanel(TOOL); h.workspace.dispose();
        expect(h.tool.element.inert).toBe(true);
        expect(h.tool.element.hidden).toBe(true);
    });

    it("suppresses an already hidden group without taking ownership of its visibility", () => {
        const h = harness({ toolVisible: false }); h.flush();
        expect(h.tool.element.inert).toBe(true);
        h.workspace.dispose();
        expect(h.tool.element.inert).toBe(false);
        expect(h.tool.api.setVisible).not.toHaveBeenCalled();
    });

    it("moves focus out of a collapsing group to visible Tools", () => {
        const h = harness(); h.tool.button.focus(); h.flush();
        expect(h.documentRef.activeElement).toBe(h.tools);
        expect(h.tool.element.inert).toBe(true);
    });

    it("uses the visible Scene control when Tools is hidden", () => {
        const h = harness(); h.tools.hidden = true; h.tool.button.focus(); h.flush();
        expect(h.documentRef.activeElement).toBe(h.scene);
    });

    it("waits for the launch strip to expose Tools before transferring focus", () => {
        const h = harness(); h.tools.hidden = true; h.scene.hidden = true;
        h.documentRef.dispatchEvent.mockImplementation(() => { h.tools.hidden = false; });
        h.tool.button.focus(); h.flush();
        expect(h.documentRef.activeElement).toBe(h.tools);
    });

    it("restores keyboard access when expansion reuses the same group elements", () => {
        const h = harness(); h.flush();
        expect(h.tool.element.inert).toBe(true);
        h.resize(1920);
        expect(h.tool.element.inert).toBe(false);
        h.tool.button.focus(); expect(h.documentRef.activeElement).toBe(h.tool.button);
    });

    it("restores old elements and suppresses rebuilt groups according to their current visibility", () => {
        const h = harness(); h.flush();
        expect(h.tool.element.inert).toBe(true);
        const replacement = h.group("tool", TOOL);
        h.layoutHost.applyTransientLayout.mockImplementation(() => { h.api.groups = [h.main, replacement]; h.main.api.setVisible(true); });
        h.resize(1920);
        expect(h.tool.element.inert).toBe(false);
        expect(replacement.element.inert).toBe(false);
        expect(h.main.element.inert).toBe(false);
    });

    it("releases removed elements and floating groups without changing their visibility", () => {
        const h = harness(); h.flush();
        expect(h.tool.element.inert).toBe(true);
        h.api.groups = [h.main]; h.subscribers[0](); h.flush();
        expect(h.tool.element.inert).toBe(false);
        h.api.groups.push(h.tool); h.subscribers[0](); h.flush();
        expect(h.tool.element.inert).toBe(true);
        h.tool.api.location = { type: "floating" }; h.subscribers[0](); h.flush();
        expect(h.tool.element.inert).toBe(false);
    });

    it("reconciles rebuilt elements during capture without resetting the selected tool", () => {
        const h = harness(); h.flush(); h.workspace.revealPanel(TOOL);
        expect(h.main.element.inert).toBe(true);
        const replacement = h.group("main", MAIN);
        h.api.groups = [replacement, h.tool];
        h.workspace.captureExpandedLayout(); h.flush();
        expect(h.main.element.inert).toBe(false);
        expect(replacement.element.inert).toBe(true);
        expect(h.tool.api.isVisible).toBe(true);
    });

    it("explicitly revealing Scene clears a pending tool while ordinary capture does not", () => {
        const h = harness(); h.flush();
        expect(h.workspace.revealPanel("workflow:not-mounted-yet")).toBe(false);
        h.workspace.captureExpandedLayout(); h.flush();
        const late = h.group("late", "workflow:not-mounted-yet");
        h.api.groups.push(late);
        h.subscribers.forEach(callback => callback()); h.flush();
        expect(late.api.isVisible).toBe(true);
        expect(h.workspace.revealPanel(MAIN)).toBe(true);
        expect(h.main.api.isVisible).toBe(true);
        expect(late.api.isVisible).toBe(false);
    });

    it("restores owned inert state once and ignores queued callbacks and public calls after disposal", () => {
        const h = harness(); h.flush();
        h.subscribers[0](); const queued = [...h.frames.values()];
        h.workspace.dispose();
        expect(h.tool.element.inert).toBe(false);
        const calls = h.layoutHost.setPersistenceFilter.mock.calls.length;
        h.tool.element.inert = true; // another owner after terminal disposal
        h.workspace.dispose(); queued.forEach(callback => callback());
        h.subscribers.forEach(callback => callback());
        expect(h.workspace.revealPanel(TOOL)).toBe(false);
        h.workspace.captureExpandedLayout();
        expect(h.layoutHost.setPersistenceFilter).toHaveBeenCalledTimes(calls);
        expect(h.tool.element.inert).toBe(true);
        expect(h.tool.panels[0].focus).not.toHaveBeenCalled();
        expect(h.frames.size).toBe(0);
    });

    it("keeps hidden groups inert even when a maximized group skips disclosure layout", () => {
        const h = harness(); h.tool.api.isVisible = false;
        h.main.api.isMaximized = () => true;
        h.flush();
        expect(h.tool.element.inert).toBe(true);
        expect(h.layoutHost.layout).not.toHaveBeenCalled();
    });

    it("does not resume DOM projection after a visibility callback disposes the workspace", () => {
        const h = harness();
        h.tool.api.setVisible.mockImplementation(visible => {
            h.tool.api.isVisible = visible;
            h.workspace.dispose();
        });
        h.flush();
        expect(h.tool.element.inert).toBe(false);
        expect(h.documentRef.body.dataset.workspaceSpace).toBeUndefined();
        expect(h.layoutHost.layout).not.toHaveBeenCalled();
        expect(h.documentRef.dispatchEvent).not.toHaveBeenCalled();
    });

    for (const checkpoint of ["constraints", "activation", "layout", "publish"]) {
        it(`stops projection and focus when ${checkpoint} synchronously disposes the workspace`, () => {
            const h = harness(); h.tool.button.focus(); h.api.activeGroup = h.tool;
            h.tools.focus = vi.fn(); h.scene.focus = vi.fn();
            const effect = {
                constraints: h.main.panels[0].api.setConstraints,
                activation: h.main.panels[0].api.setActive,
                layout: h.layoutHost.layout,
                publish: h.documentRef.dispatchEvent,
            }[checkpoint];
            effect.mockImplementation(() => h.workspace.dispose());
            h.flush();
            expect(effect).toHaveBeenCalled();
            expect(h.tool.element.inert).toBe(false);
            expect(h.main.element.inert).toBe(false);
            expect(h.documentRef.body.dataset.workspaceSpace).toBeUndefined();
            expect(h.tools.focus).not.toHaveBeenCalled();
            expect(h.scene.focus).not.toHaveBeenCalled();
            if (checkpoint !== "publish") expect(h.documentRef.dispatchEvent).not.toHaveBeenCalled();
        });
    }

    it("does not focus a revealed panel after its activation disposes the workspace", () => {
        const h = harness(); h.flush();
        // Keep update's active-group repair out of the path: exercise the
        // explicit activation performed by revealPanel after update returns.
        h.api.activeGroup = h.tool;
        h.tool.panels[0].api.setActive.mockImplementation(() => h.workspace.dispose());
        expect(h.workspace.revealPanel(TOOL)).toBe(false);
        expect(h.tool.panels[0].focus).not.toHaveBeenCalled();
        expect(h.main.element.inert).toBe(false);
    });
});
