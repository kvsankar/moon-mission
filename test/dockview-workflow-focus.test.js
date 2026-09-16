import { afterEach, describe, expect, it, vi } from "vitest";
import * as workflow from "../src/platform/js/app/dockview-workflow-panels.js";

afterEach(() => { delete globalThis.__moonMissionDockviewSpike; });
describe("explicit Dockview workflow focus", () => {
    it("routes focus through progressive reveal without calling raw focus recursively", () => {
        const revealPanel = vi.fn(() => true), focusPanel = vi.fn();
        globalThis.__moonMissionDockviewSpike = { progressiveWorkspace: { revealPanel }, layoutHost: { focusPanel } };
        expect(workflow.focusDockviewWorkflowPanel("workflow:media-browser")).toBe(true);
        expect(revealPanel).toHaveBeenCalledExactlyOnceWith("workflow:media-browser");
        expect(focusPanel).not.toHaveBeenCalled();
    });
    it("does not bypass a retired or pending progressive owner", () => {
        const focusPanel = vi.fn();
        globalThis.__moonMissionDockviewSpike = {
            progressiveWorkspace: { revealPanel: () => false }, layoutHost: { focusPanel },
        };
        expect(workflow.focusDockviewWorkflowPanel("aux:moon")).toBe(false);
        expect(focusPanel).not.toHaveBeenCalled();
    });
    it("supports a host without progressive disclosure", () => {
        const focusPanel = vi.fn(() => true);
        globalThis.__moonMissionDockviewSpike = { layoutHost: { focusPanel } };
        expect(workflow.focusDockviewWorkflowPanel("aux:moon")).toBe(true);
        expect(focusPanel).toHaveBeenCalledExactlyOnceWith("aux:moon");
    });
    it("returns false without a current workspace", () => {
        expect(workflow.focusDockviewWorkflowPanel("aux:moon")).toBe(false);
    });
});
