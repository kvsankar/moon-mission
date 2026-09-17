import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { CY3_SSIM_DISPOSITION } from "./support/cy3-ssim-disposition.js";

const baselineDirectory = join(process.cwd(), "test", "screenshots", "baseline");
const trackedSceneBaselines = readdirSync(baselineDirectory)
    .filter((name) => name.endsWith(".png"))
    .sort();

describe("CY3 SSIM coverage disposition", () => {
    it("explicitly classifies every tracked scene baseline exactly once", () => {
        const classified = CY3_SSIM_DISPOSITION
            .flatMap((group) => group.baselines)
            .sort();

        expect(classified).toEqual(trackedSceneBaselines);
        expect(new Set(classified).size).toBe(classified.length);
    });

    it("names executable replacement evidence before a baseline can leave the visual gate", () => {
        for (const group of CY3_SSIM_DISPOSITION) {
            expect(["retain", "replace", "retire"]).toContain(group.disposition);
            expect(group.concern.trim()).not.toBe("");
            expect(group.rationale.trim()).not.toBe("");

            if (group.disposition === "replace") {
                expect(group.evidence.length).toBeGreaterThan(0);
                for (const path of group.evidence) {
                    expect(existsSync(join(process.cwd(), path)), `${group.id}: ${path}`).toBe(true);
                }
            }
        }
    });

    it("keeps the reviewed visual set intentionally small", () => {
        const retained = CY3_SSIM_DISPOSITION
            .filter((group) => group.disposition === "retain")
            .flatMap((group) => group.baselines);

        expect(retained.length).toBeGreaterThanOrEqual(5);
        expect(retained.length).toBeLessThanOrEqual(15);
    });
});
