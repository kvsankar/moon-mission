import { describe, expect, it } from "vitest";
import { failMissionLoadingOverlay } from "../src/platform/js/ui/mission-loading-overlay.js";

function documentFixture() {
    const nodes = {
        "mission-loading-overlay": { hidden: true, dataset: {}, setAttribute() {} },
        "mission-loading-overlay-message": { textContent: "" },
        "mission-loading-overlay-hint": { textContent: "" },
    };
    return { nodes, getElementById: id => nodes[id] || null };
}
describe("loading failure presentation", () => {
    it("does not suggest unavailable origin switching as comparison recovery", () => {
        const document = documentFixture();
        failMissionLoadingOverlay("Comparison mission could not be loaded.", document, { kind: "comparison" });
        expect(document.nodes["mission-loading-overlay-hint"].textContent).toMatch(/retry.*comparison/i);
        expect(document.nodes["mission-loading-overlay-hint"].textContent).not.toMatch(/origin/i);
        expect(document.nodes["mission-loading-overlay"].dataset.state).toBe("error");
    });
    it("retains origin recovery guidance for ordinary mission failures", () => {
        const document = documentFixture();
        failMissionLoadingOverlay("Mission data could not be loaded.", document);
        expect(document.nodes["mission-loading-overlay-hint"].textContent).toMatch(/origin/i);
    });
});
