import { describe, expect, it } from "vitest";
import {
    checkModuleSyntax,
    checkBaselineTransitions,
    checkRefactorPlan,
    checkSource,
    countLines,
    findImportCycles,
    findLayerViolations,
    refactorTargetLines,
} from "../scripts/check-source-structure.mjs";

const baseline = {
    maxLines: 3,
    oversizedFiles: { "src/platform/js/app/legacy.js": 5 },
    completedRefactors: [],
    allowedLayerImports: [{
        from: "src/platform/js/core/domain/legacy.js",
        to: "src/platform/js/app/allowed.js",
    }],
};

describe("source structure guard", () => {
    it("counts physical lines across LF and CRLF files", () => {
        expect(countLines("one\ntwo\n")).toBe(2);
        expect(countLines("one\r\ntwo")).toBe(2);
        expect(countLines("")).toBe(0);
    });

    it("catches duplicate module exports missed by the production build", () => {
        expect(checkModuleSyntax("export const value = 1; export { value };"))
            .toContain("Duplicate export");
        expect(checkModuleSyntax("export const value = 1; ")).toBeNull();
    });

    it("blocks new core-to-effect imports while honoring the exact known exception", () => {
        const source = 'import "../../app/allowed.js"; import "../../ui/new-panel.js";';
        expect(findLayerViolations(source, "src/platform/js/core/domain/legacy.js", baseline.allowedLayerImports))
            .toEqual(["src/platform/js/ui/new-panel.js"]);
    });

    it("caps new files and retains the oversized baseline until a real refactor", () => {
        expect(checkSource("src/platform/js/app/new.js", "a\nb\nc\nd\n", baseline))
            .toContain("src/platform/js/app/new.js: 4 lines exceeds the 3-line limit");
        expect(checkSource("src/platform/js/app/legacy.js", "a\nb\nc\nd\n", baseline, {
            exactBaseline: true,
        })).toEqual([]);
        expect(checkSource("src/platform/js/app/legacy.js", "a\nb\nc\n", baseline, {
            exactBaseline: true,
        })).toContain("src/platform/js/app/legacy.js: now 3 lines; remove its oversized baseline entry and record the structural refactor");
    });

    it("requires a plan and a largest piece at least 30% smaller", () => {
        expect(refactorTargetLines(1100)).toBe(770);
        const previous = { oversizedFiles: { "src/old.js": 1100 } };
        const current = { oversizedFiles: {}, completedRefactors: [] };
        expect(checkBaselineTransitions(previous, current)[0]).toContain("requires a structural refactor plan");
        const record = {
            source: "src/old.js",
            beforeLines: 1100,
            plan: "docs/plans/implementation/old-split.md",
            resultFiles: ["src/old.js", "src/new.js"],
        };
        current.completedRefactors.push(record);
        expect(checkBaselineTransitions(previous, current)).toEqual([]);
        expect(checkBaselineTransitions(previous, {
            ...current,
            oversizedFiles: { "src/other.js": 1200 },
        })[0]).toContain("new oversized baseline entries are not allowed");
        expect(checkRefactorPlan(record, new Map([
            ["src/old.js", `${"a\n".repeat(990)}`],
            ["src/new.js", `${"b\n".repeat(200)}`],
        ]))[0]).toContain("990 lines; 1100 before requires at most 770");
        expect(checkRefactorPlan(record, new Map([
            ["src/old.js", `${"a\n".repeat(790)}`],
            ["src/new.js", `${"b\n".repeat(310)}`],
        ]))[0]).toContain("790 lines; 1100 before requires at most 770");
        expect(checkRefactorPlan(record, new Map([
            ["src/old.js", `${"a\n".repeat(770)}`],
            ["src/new.js", `${"b\n".repeat(330)}`],
        ]))).toEqual([]);
        expect(checkRefactorPlan(record, new Map([
            ["src/old.js", `${"a\n".repeat(550)}`],
            ["src/new.js", `${"b\n".repeat(550)}`],
        ]))).toEqual([]);
    });

    it("detects a cycle across separate authored modules", () => {
        const sources = new Map([
            ["src/a.js", 'import "./b.js";'],
            ["src/b.js", 'export * from "./a.js";'],
            ["src/c.js", 'import "./a.js";'],
        ]);
        expect(findImportCycles(sources)).toEqual([["src/a.js", "src/b.js"]]);
    });
});
