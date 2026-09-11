import { describe, expect, it } from "vitest";
import { fullMoonVerticalFov, normalizeImageView, zoomImageAt } from "../src/platform/js/app/moon-observer-image-view.js";

describe("Moon image navigation", () => {
    it("fits the complete relief envelope into either limiting viewport dimension", () => {
        for (const distance of [4.5, 5.7, 20, 220]) {
            for (const aspect of [0.4, 1, 1.5, 3.8]) {
                const fov = fullMoonVerticalFov(distance, aspect);
                const projectedHalfHeight = Math.tan(Math.asin(1.02 / distance)) / Math.tan(fov * Math.PI / 360);
                expect(projectedHalfHeight).toBeLessThanOrEqual(0.820001);
                expect(projectedHalfHeight / aspect).toBeLessThanOrEqual(0.820001);
            }
        }
    });
    it("keeps the image point under the zoom cursor stationary", () => {
        const view = { zoom: 2, x: 0.17, y: -0.12 };
        const anchor = { x: -0.26, y: 0.31 };
        const next = zoomImageAt(view, 3, anchor);
        expect((anchor.x - next.x) / next.zoom).toBeCloseTo((anchor.x - view.x) / view.zoom);
        expect((anchor.y - next.y) / next.zoom).toBeCloseTo((anchor.y - view.y) / view.zoom);
        const restored = zoomImageAt(next, 2, anchor);
        expect(restored.zoom).toBe(view.zoom);
        expect(restored.x).toBeCloseTo(view.x, 12);
        expect(restored.y).toBeCloseTo(view.y, 12);
    });
    it("bounds malformed shared view state and clamps at zoom limits", () => {
        expect(normalizeImageView({ zoom: Infinity, x: NaN, y: -100 })).toEqual({ zoom: 1, x: 0, y: -4 });
        expect(zoomImageAt({ zoom: 12, x: 0.2, y: -0.1 }, 24)).toEqual({ zoom: 12, x: 0.2, y: -0.1 });
        expect(normalizeImageView({ zoom: -1 })).toEqual({ zoom: 0.25, x: 0, y: 0 });
    });
});
