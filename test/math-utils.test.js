import { describe, expect, it } from "vitest";

import {
    clamp,
    degreesToRadians,
    distance2D,
    distance3D,
    ellipseSemiMinorAxis,
    formatFloat,
    lerp,
    normalizeAngle,
    radiansToDegrees,
    rotate2D,
    sphericalToCartesian,
    velocityToAngle,
} from "../src/platform/js/utils/math-utils.js";

describe("angle helpers", () => {
    it("round-trips degrees and radians", () => {
        expect(degreesToRadians(180)).toBeCloseTo(Math.PI, 12);
        expect(radiansToDegrees(Math.PI / 2)).toBeCloseTo(90, 12);
        expect(radiansToDegrees(degreesToRadians(23.4))).toBeCloseTo(23.4, 12);
    });

    it("normalizes any angle into [0, 360)", () => {
        expect(normalizeAngle(370)).toBe(10);
        expect(normalizeAngle(-10)).toBe(350);
        expect(normalizeAngle(-730)).toBe(350);
        expect(normalizeAngle(360)).toBe(0);
    });
});

describe("clamp and interpolation", () => {
    it("bounds a value to the given range", () => {
        expect(clamp(5, 0, 10)).toBe(5);
        expect(clamp(-5, 0, 10)).toBe(0);
        expect(clamp(50, 0, 10)).toBe(10);
    });

    it("interpolates between the endpoints", () => {
        expect(lerp(0, 10, 0)).toBe(0);
        expect(lerp(0, 10, 1)).toBe(10);
        expect(lerp(0, 10, 0.25)).toBe(2.5);
    });

    it("extrapolates outside the unit interval", () => {
        expect(lerp(0, 10, 2)).toBe(20);
        expect(lerp(0, 10, -1)).toBe(-10);
    });
});

describe("coordinate conversion", () => {
    it("puts zero longitude and latitude on the +x axis", () => {
        expect(sphericalToCartesian(2, 0, 0)).toEqual({ x: 2, y: 0, z: 0 });
    });

    it("puts the pole on the +z axis", () => {
        const point = sphericalToCartesian(3, 1.1, Math.PI / 2);
        expect(point.z).toBeCloseTo(3, 12);
        expect(Math.hypot(point.x, point.y)).toBeCloseTo(0, 12);
    });

    it("preserves the radius", () => {
        const point = sphericalToCartesian(5, 0.7, -0.3);
        expect(distance3D(point)).toBeCloseTo(5, 12);
    });

    it("rotates a 2D point counter-clockwise", () => {
        const rotated = rotate2D(1, 0, 90);
        expect(rotated.x).toBeCloseTo(0, 12);
        expect(rotated.y).toBeCloseTo(1, 12);
    });

    it("returns a full turn to the original point", () => {
        const rotated = rotate2D(3, -4, 360);
        expect(rotated.x).toBeCloseTo(3, 9);
        expect(rotated.y).toBeCloseTo(-4, 9);
    });
});

describe("distances", () => {
    it("measures a 3-4-5 triangle in the plane", () => {
        expect(distance2D(0, 0, 3, 4)).toBe(5);
        expect(distance2D(1, 1, 4, 5)).toBe(5);
    });

    it("measures a 3D magnitude", () => {
        expect(distance3D({ x: 1, y: 2, z: 2 })).toBe(3);
        expect(distance3D({ x: 0, y: 0, z: 0 })).toBe(0);
    });
});

describe("orbital and velocity helpers", () => {
    it("reports a heading rotated a quarter turn from the velocity vector", () => {
        // The renderer draws the craft glyph pointing "up", so zero degrees
        // corresponds to +y rather than +x.
        expect(velocityToAngle(1, 0)).toBeCloseTo(90, 12);
        expect(velocityToAngle(0, 1)).toBeCloseTo(180, 12);
        expect(velocityToAngle(-1, 0)).toBeCloseTo(270, 12);
    });

    it("reduces a circular orbit to a single radius", () => {
        expect(ellipseSemiMinorAxis(100, 0)).toBe(100);
    });

    it("shrinks the semi-minor axis as eccentricity grows", () => {
        expect(ellipseSemiMinorAxis(100, 0.6)).toBeCloseTo(80, 12);
        expect(ellipseSemiMinorAxis(100, 0.9)).toBeLessThan(ellipseSemiMinorAxis(100, 0.6));
    });

    it("degenerates to a line at unit eccentricity", () => {
        expect(ellipseSemiMinorAxis(100, 1)).toBe(0);
    });
});

describe("formatFloat", () => {
    it("uses two decimals and thousands separators by default", () => {
        expect(formatFloat(1234567.891)).toBe("1,234,567.89");
        expect(formatFloat(1000)).toBe("1,000.00");
        expect(formatFloat(999)).toBe("999.00");
    });

    it("honours an explicit decimal count", () => {
        expect(formatFloat(3.14159, 3)).toBe("3.142");
        expect(formatFloat(3.14159, 0)).toBe("3");
    });

    it("accepts custom separators", () => {
        expect(formatFloat(1234.5, 2, ".", ",")).toBe("1.234,50");
        expect(formatFloat(1234.5, 2, " ")).toBe("1 234.50");
    });

    it("keeps the sign outside the formatted magnitude", () => {
        expect(formatFloat(-1234.5)).toBe("-1,234.50");
        expect(formatFloat(-0.5, 1)).toBe("-0.5");
    });

    it("treats non-numeric input as zero", () => {
        expect(formatFloat("not-a-number")).toBe("0.00");
        expect(formatFloat(null)).toBe("0.00");
        expect(formatFloat(undefined)).toBe("0.00");
    });

    it("uses the magnitude of a negative decimal count", () => {
        expect(formatFloat(3.14159, -2)).toBe("3.14");
    });
});
