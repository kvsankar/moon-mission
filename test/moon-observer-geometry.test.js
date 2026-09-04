import { describe, expect, it } from "vitest";

import {
    resolveBrightLimbAngleDegrees,
    resolveMoonObserverGeometry,
    rotateObserverScreenUp,
} from "../src/platform/js/app/moon-observer-geometry.js";

function dot(left, right) {
    return left.x * right.x + left.y * right.y + left.z * right.z;
}

describe("moon observer geometry", () => {
    it("resolves known new- and full-moon illumination", () => {
        const newMoon = resolveMoonObserverGeometry({
            date: new Date("2024-04-08T18:21:00Z"),
        });
        const fullMoon = resolveMoonObserverGeometry({
            date: new Date("2024-03-25T07:00:00Z"),
        });

        expect(newMoon.illuminatedFraction).toBeLessThan(0.01);
        expect(fullMoon.illuminatedFraction).toBeGreaterThan(0.99);
        expect(newMoon.observerDistanceKm).toBeGreaterThan(350000);
        expect(newMoon.angularDiameterDegrees).toBeGreaterThan(0.45);
        expect(newMoon.angularDiameterDegrees).toBeLessThan(0.60);
    });

    it("applies topocentric parallax and local horizontal coordinates", () => {
        const date = new Date("2026-04-06T22:41:58Z");
        const geocenter = resolveMoonObserverGeometry({ date });
        const bengaluru = resolveMoonObserverGeometry({
            date,
            observerMode: "site",
            latitude: 12.9716,
            longitude: 77.5946,
            elevationMeters: 920,
        });

        expect(bengaluru.observerMode).toBe("site");
        expect(Number.isFinite(bengaluru.altitudeDegrees)).toBe(true);
        expect(Number.isFinite(bengaluru.azimuthDegrees)).toBe(true);
        expect(dot(geocenter.observerDirection, bengaluru.observerDirection)).toBeLessThan(0.9999999);
        expect(Math.abs(dot(bengaluru.screenUp, bengaluru.observerDirection))).toBeLessThan(1e-10);
    });

    it("rotates screen-up without changing its view-plane constraint", () => {
        const observerDirection = { x: 0, y: 0, z: 1 };
        const rolled = rotateObserverScreenUp(
            { x: 0, y: 1, z: 0 },
            observerDirection,
            90,
        );

        expect(rolled.x).toBeCloseTo(1, 10);
        expect(rolled.y).toBeCloseTo(0, 10);
        expect(dot(rolled, observerDirection)).toBeCloseTo(0, 10);
        expect(resolveBrightLimbAngleDegrees({
            observerDirection,
            sunDirection: { x: 1, y: 0, z: 0 },
            screenUp: rolled,
        })).toBeCloseTo(0, 10);
    });

    it("rejects invalid observation times", () => {
        expect(() => resolveMoonObserverGeometry({ date: "not-a-date" })).toThrow(
            "valid UTC observation time",
        );
    });
});
