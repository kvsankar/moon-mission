import { describe, expect, it } from "vitest";
import { reconcileWorkspaceLayout, resolveComposerSpaceLevel, resolveWorkspacePanelPriority, resolveWorkspaceSpaceLevel } from "../src/platform/js/core/domain/workspace-disclosure.js";

const leaf = (id, views, extra = {}) => ({ type: "leaf", size: 300, data: { id, views, activeView: views[0] }, ...extra });
const layout = (nodes, ids) => ({ grid: { root: { type: "branch", data: nodes, size: 800 }, width: 1920, height: 800, orientation: "HORIZONTAL" }, panels: Object.fromEntries(ids.map(id => [id, { id }])), activeGroup: "main" });

describe("space-dependent disclosure", () => {
    it("reduces simultaneous tools at both width and height boundaries", () => {
        expect([[1920,1080],[1440,900],[1100,700],[800,700]].map(([w,h]) => resolveWorkspaceSpaceLevel(w,h))).toEqual(["full","compact","minimal","focused"]);
        expect([900,800,650,500].map(h => resolveWorkspaceSpaceLevel(1920,h))).toEqual(["full","compact","minimal","focused"]);
        expect(resolveWorkspacePanelPriority("full")).toBeNull();
        expect(resolveWorkspacePanelPriority("compact").size).toBe(4);
        expect(resolveWorkspacePanelPriority("minimal").size).toBe(2);
        expect([...resolveWorkspacePanelPriority("focused")]).toEqual(["mission:main-view"]);
    });
    it("gives an explicit tool usable space and preserves a scene return", () => {
        expect([...resolveWorkspacePanelPriority("minimal", "aux:moon")]).toEqual(["mission:main-view", "aux:moon"]);
        expect([...resolveWorkspacePanelPriority("focused", "aux:moon")]).toEqual(["aux:moon"]);
    });
    it("collapses controls in short panels even in a wide window", () => {
        expect(resolveComposerSpaceLevel(900,500)).toBe("full");
        expect(resolveComposerSpaceLevel(900,300)).toBe("compact");
        expect(resolveComposerSpaceLevel(900,200)).toBe("minimal");
        expect(resolveComposerSpaceLevel(300,900)).toBe("minimal");
    });
    it("does not persist automatic hiding or resurrect explicitly closed panels", () => {
        const reference = layout([leaf("main", ["main"]),leaf("tools",["media","closed"])], ["main","media","closed"]);
        const current = layout([leaf("main",["main"]),leaf("tools",["media"],{visible:false})],["main","media"]);
        current.grid.width = 800;
        const restored = reconcileWorkspaceLayout(reference,current);
        expect(restored.grid.width).toBe(1920);
        expect(restored.grid.root.data[1].data.views).toEqual(["media"]);
        expect(restored.grid.root.data[1].visible).toBeUndefined();
        expect(restored.panels.closed).toBeUndefined();
        expect(reference.grid.root.data[1].data.views).toEqual(["media","closed"]);
    });
    it("retains newly opened tools and respects tools moved to floating groups", () => {
        const reference = layout([leaf("main",["main"]),leaf("media",["media"])],["main","media"]);
        const current = layout([leaf("main",["main"]),leaf("new",["new"])],["main","media","new"]);
        current.floatingGroups = [{ data: { views:["media"], activeView:"media", id:"floating" } }];
        const restored = reconcileWorkspaceLayout(reference,current);
        expect(restored.grid.root.data.map(n=>n.data.views)).toEqual([["main"],["new"]]);
        expect(restored.floatingGroups).toEqual(current.floatingGroups);
    });
    it("puts a reopened auxiliary panel back beside its retained siblings", () => {
        const reference = layout([leaf("main",["main"]),{type:"branch",size:400,data:[leaf("earth",["earth"]),leaf("orbit",["orbit"])]}],["main","earth","orbit"]);
        const current = layout([leaf("main",["main"]),{type:"branch",size:400,data:[leaf("reopened-moon",["moon"]),leaf("earth",["earth"]),leaf("orbit",["orbit"])]}],["main","moon","earth","orbit"]);
        const restored = reconcileWorkspaceLayout(reference,current);
        expect(restored.grid.root.data).toHaveLength(2);
        expect(restored.grid.root.data[1].data.map(n=>n.data.views[0])).toEqual(["moon","earth","orbit"]);
    });
});
