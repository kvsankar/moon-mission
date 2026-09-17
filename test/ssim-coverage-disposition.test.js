import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { CY3_SSIM_DISPOSITION } from "./support/cy3-ssim-disposition.js";

const baselineDirectory = join(process.cwd(), "test", "screenshots", "baseline");
const trackedSceneBaselines = readdirSync(baselineDirectory)
    .filter((name) => name.endsWith(".png"))
    .sort();

describe("CY3 SSIM coverage disposition", () => {
    it("preserves an explicit, unique disposition for all 86 historical baselines", () => {
        const classified = CY3_SSIM_DISPOSITION
            .flatMap((group) => group.baselines)
            .sort();

        expect(classified).toHaveLength(86);
        expect(new Set(classified).size).toBe(classified.length);
    });

    it("tracks PNG files only for the reviewed retained visual set", () => {
        const retained = CY3_SSIM_DISPOSITION
            .filter((group) => group.disposition === "retain")
            .flatMap((group) => group.baselines)
            .sort();

        expect(trackedSceneBaselines).toEqual(retained);
        expect(existsSync(join(process.cwd(), "test", "screenshots", "ssim-history.json"))).toBe(false);
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
