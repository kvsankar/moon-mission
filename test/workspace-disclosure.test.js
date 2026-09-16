import { describe, expect, it } from "vitest";
import { applyWorkspaceUserLayoutEdit, reconcileWorkspaceLayout, resolveComposerSpaceLevel, resolveWorkspacePanelPriority, resolveWorkspaceSpaceLevel } from "../src/platform/js/core/domain/workspace-disclosure.js";

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
    it("projects an explicit constrained divider edit onto expanded sibling proportions", () => {
        const reference = layout([
            leaf("left", ["left"], { size: 300 }),
            leaf("main", ["main"], { size: 900 }),
            { type: "branch", size: 600, data: [leaf("compose", ["compose"]), leaf("media", ["media"]) ] },
            { type: "branch", size: 300, data: [leaf("moon", ["moon"]), leaf("earth", ["earth"]) ] },
        ], ["left","main","compose","media","moon","earth"]);
        const before = structuredClone(reference), after = structuredClone(reference);
        before.grid.width = after.grid.width = 1366;
        before.grid.root.data[0].size = after.grid.root.data[0].size = 283;
        before.grid.root.data[1].size = 560; after.grid.root.data[1].size = 630;
        before.grid.root.data[2].size = 507; after.grid.root.data[2].size = 437;
        before.grid.root.data[3].size = after.grid.root.data[3].size = 0;
        before.grid.root.data[3].data.forEach(node => { node.visible = false; });
        after.grid.root.data[3].data.forEach(node => { node.visible = false; });
        const edited = applyWorkspaceUserLayoutEdit(reference, before, after);
        expect(edited.grid.width).toBe(1920);
        expect(edited.grid.root.data[0].size).toBeCloseTo(300, 6);
        expect(edited.grid.root.data[1].size).toBeCloseTo(993.333333, 5);
        expect(edited.grid.root.data[2].size).toBeCloseTo(506.666667, 5);
        expect(edited.grid.root.data[3].size).toBe(300);
        expect(edited.grid.root.data[3].data.map(node => node.size)).toEqual([300, 300]);
        expect(reference.grid.root.data.map(node => node.size)).toEqual([300, 900, 600, 300]);
    });
    it("projects nested vertical edits while ignoring passive and single-visible-child changes", () => {
        const reference = layout([{ type: "branch", size: 600, data: [
            leaf("compose", ["compose"], { size: 360 }), leaf("media", ["media"], { size: 240 }),
        ]}, leaf("hidden", ["hidden"], { size: 200 })], ["compose","media","hidden"]);
        const before = structuredClone(reference), after = structuredClone(reference);
        after.grid.root.data[0].data[0].size = 240;
        after.grid.root.data[0].data[1].size = 360;
        after.grid.root.data[1].size = 0; after.grid.root.data[1].visible = false;
        const edited = applyWorkspaceUserLayoutEdit(reference, before, after);
        expect(edited.grid.root.data[0].data.map(node => node.size)).toEqual([240, 360]);
        expect(edited.grid.root.data[1].size).toBe(200);
        const passive = applyWorkspaceUserLayoutEdit(reference, before, before);
        expect(passive).toEqual(reference);
    });
    it("persists explicit tab membership, order and active tab without aliasing inputs", () => {
        const reference = layout([leaf("first", ["a","b"]), leaf("second", ["c"])], ["a","b","c"]);
        const before = structuredClone(reference), after = structuredClone(reference);
        after.grid.root.data[0].data.views = ["b"];
        after.grid.root.data[0].data.activeView = "b";
        after.grid.root.data[1].data.views = ["c","a"];
        after.grid.root.data[1].data.activeView = "a";
        const edited = applyWorkspaceUserLayoutEdit(reference, before, after, { kind: "panel-move" });
        expect(edited.grid.root.data.map(node => node.data.views)).toEqual([["b"],["c","a"]]);
        expect(edited.grid.root.data[1].data.activeView).toBe("a");
        expect(reference.grid.root.data[0].data.views).toEqual(["a","b"]);
        expect(after.grid.root.data[1].data.views).toEqual(["c","a"]);
    });
    it("removes an emptied source group when its last tab moves", () => {
        const reference = layout([leaf("source", ["a"]), leaf("target", ["c"])], ["a","c"]);
        const before = structuredClone(reference), after = layout([leaf("target", ["c","a"])], ["a","c"]);
        after.grid.root.data[0].data.activeView = "a";
        const edited = applyWorkspaceUserLayoutEdit(reference, before, after, { kind: "panel-move" });
        expect(edited.grid.root.data).toHaveLength(1);
        expect(edited.grid.root.data[0].data).toMatchObject({ id: "target", views: ["c","a"], activeView: "a" });
    });
});
