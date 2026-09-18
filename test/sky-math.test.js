import { describe, expect, it } from "vitest";

import {
    dateToJulianDate,
    degreesToRadians,
    equatorialUnitVectorToRaDec,
    equatorialVectorToHorizontal,
    equatorialZenithUnitVector,
    julianDateToGmstRadians,
    localSiderealRadians,
    normalizeAngleDegrees,
    normalizeAngleRadians,
    raDecToEquatorialUnitVector,
    raDecToHorizontal,
    radiansToDegrees,
    stableUnitHash,
} from "../src/platform/js/rendering/sky-math.js";

const TWO_PI = Math.PI * 2;

describe("angle conversion", () => {
    it("round-trips degrees through radians", () => {
        expect(degreesToRadians(180)).toBeCloseTo(Math.PI, 12);
        expect(radiansToDegrees(Math.PI)).toBeCloseTo(180, 12);
        expect(radiansToDegrees(degreesToRadians(37.5))).toBeCloseTo(37.5, 12);
    });

    it("coerces string inputs", () => {
        expect(degreesToRadians("90")).toBeCloseTo(Math.PI / 2, 12);
    });

    it("normalizes radians into [0, 2pi)", () => {
        expect(normalizeAngleRadians(-Math.PI / 2)).toBeCloseTo((3 * Math.PI) / 2, 12);
        expect(normalizeAngleRadians(TWO_PI + 0.25)).toBeCloseTo(0.25, 12);
        expect(normalizeAngleRadians(0)).toBe(0);
    });

    it("normalizes degrees into [0, 360)", () => {
        expect(normalizeAngleDegrees(-90)).toBe(270);
        expect(normalizeAngleDegrees(725)).toBe(5);
        expect(normalizeAngleDegrees(360)).toBe(0);
    });
});

describe("julian dates", () => {
    it("maps the Unix epoch to JD 2440587.5", () => {
        expect(dateToJulianDate(0)).toBe(2440587.5);
        expect(dateToJulianDate(new Date(0))).toBe(2440587.5);
    });

    it("advances one Julian day per 86400 seconds", () => {
        expect(dateToJulianDate(86400000) - dateToJulianDate(0)).toBe(1);
    });

    it("rejects inputs that are not a time", () => {
        expect(() => dateToJulianDate("not-a-date")).toThrow(TypeError);
        expect(() => dateToJulianDate(undefined)).toThrow(TypeError);
    });

    it("returns a GMST inside one turn", () => {
        const gmst = julianDateToGmstRadians(2451545.0);
        expect(gmst).toBeGreaterThanOrEqual(0);
        expect(gmst).toBeLessThan(TWO_PI);
    });

    it("reports about 18h41m at the J2000 epoch", () => {
        // GMST at 2000-01-01T12:00 UT is 18h 41m 50s, i.e. 280.46 degrees.
        expect(radiansToDegrees(julianDateToGmstRadians(2451545.0))).toBeCloseTo(280.46, 1);
    });

    it("advances GMST by roughly one turn per sidereal day", () => {
        const start = julianDateToGmstRadians(2451545.0);
        const later = julianDateToGmstRadians(2451545.0 + 0.9972695787);
        expect(Math.abs(later - start)).toBeLessThan(1e-3);
    });
});

describe("local sidereal time", () => {
    it("adds the observer longitude to GMST", () => {
        const gmst = julianDateToGmstRadians(2451545.0);
        const lst = localSiderealRadians({ julianDate: 2451545.0, longitudeRadians: 0.5 });
        expect(lst).toBeCloseTo(normalizeAngleRadians(gmst + 0.5), 12);
    });

    it("accepts the observer longitude in degrees", () => {
        const byRadians = localSiderealRadians({
            julianDate: 2451545.0,
            longitudeRadians: degreesToRadians(45),
        });
        const byDegrees = localSiderealRadians({ julianDate: 2451545.0, longitudeDegrees: 45 });
        expect(byDegrees).toBeCloseTo(byRadians, 12);
    });

    it("defaults to the Greenwich meridian", () => {
        expect(localSiderealRadians({ julianDate: 2451545.0 }))
            .toBeCloseTo(julianDateToGmstRadians(2451545.0), 12);
    });

    it("accepts a Date or epoch milliseconds with a separate longitude", () => {
        const ms = Date.UTC(2026, 3, 1, 12);
        expect(localSiderealRadians(new Date(ms), 0.25))
            .toBeCloseTo(localSiderealRadians(ms, 0.25), 12);
    });
});

describe("equatorial coordinates", () => {
    it("places the vernal equinox on the +x axis", () => {
        expect(raDecToEquatorialUnitVector(0, 0)).toEqual({ x: 1, y: 0, z: 0 });
    });

    it("places the north celestial pole on the +z axis", () => {
        const vector = raDecToEquatorialUnitVector(123, 90);
        expect(vector.z).toBeCloseTo(1, 12);
        expect(Math.hypot(vector.x, vector.y)).toBeCloseTo(0, 12);
    });

    it("produces unit vectors", () => {
        const vector = raDecToEquatorialUnitVector(83.6, -5.4);
        expect(Math.hypot(vector.x, vector.y, vector.z)).toBeCloseTo(1, 12);
    });

    it("round-trips through the inverse conversion", () => {
        const roundTrip = equatorialUnitVectorToRaDec(raDecToEquatorialUnitVector(201.3, -11.2));
        expect(roundTrip.raDeg).toBeCloseTo(201.3, 9);
        expect(roundTrip.decDeg).toBeCloseTo(-11.2, 9);
    });

    it("reports right ascension in [0, 360)", () => {
        const { raDeg } = equatorialUnitVectorToRaDec({ x: -1, y: -1e-12, z: 0 });
        expect(raDeg).toBeGreaterThanOrEqual(0);
        expect(raDeg).toBeLessThan(360);
    });

    it("clamps an out-of-range z before taking the arcsine", () => {
        expect(equatorialUnitVectorToRaDec({ x: 0, y: 0, z: 4 }).decDeg).toBeCloseTo(90, 12);
        expect(equatorialUnitVectorToRaDec({ x: 0, y: 0, z: -4 }).decDeg).toBeCloseTo(-90, 12);
    });

    it("treats missing components as zero", () => {
        expect(equatorialUnitVectorToRaDec(null)).toEqual({ raDeg: 0, decDeg: 0 });
    });

    it("puts the observer zenith on the pole at the geographic pole", () => {
        const zenith = equatorialZenithUnitVector(Math.PI / 2, 1.23);
        expect(zenith.z).toBeCloseTo(1, 12);
        expect(Math.hypot(zenith.x, zenith.y)).toBeCloseTo(0, 12);
    });
});

describe("horizontal coordinates", () => {
    it("puts the observer zenith straight overhead", () => {
        const latitudeRad = degreesToRadians(30);
        const siderealRad = degreesToRadians(75);
        const zenith = equatorialZenithUnitVector(latitudeRad, siderealRad);

        const horizontal = equatorialVectorToHorizontal(zenith, { latitudeRad, siderealRad });

        expect(radiansToDegrees(horizontal.altitudeRad)).toBeCloseTo(90, 9);
        expect(horizontal.sinAltitude).toBeCloseTo(1, 9);
    });

    it("puts the celestial pole due north at the observer's latitude", () => {
        const latitudeRad = degreesToRadians(40);

        const horizontal = equatorialVectorToHorizontal({ x: 0, y: 0, z: 1 }, {
            latitudeRad,
            siderealRad: 0,
        });

        expect(radiansToDegrees(horizontal.altitudeRad)).toBeCloseTo(40, 9);
        expect(radiansToDegrees(horizontal.azimuthRad)).toBeCloseTo(0, 9);
    });

    it("reports the south celestial pole below the horizon for a northern observer", () => {
        const horizontal = equatorialVectorToHorizontal({ x: 0, y: 0, z: -1 }, {
            latitudeRad: degreesToRadians(40),
            siderealRad: 0,
        });

        expect(horizontal.altitudeRad).toBeLessThan(0);
        expect(radiansToDegrees(horizontal.azimuthRad)).toBeCloseTo(180, 9);
    });

    it("reports azimuth in [0, 360)", () => {
        const horizontal = equatorialVectorToHorizontal({ x: 0, y: -1, z: 0 }, {
            latitudeRad: 0,
            siderealRad: 0,
        });

        expect(radiansToDegrees(horizontal.azimuthRad)).toBeGreaterThanOrEqual(0);
        expect(radiansToDegrees(horizontal.azimuthRad)).toBeLessThan(360);
    });

    it("treats missing observer or vector fields as zero", () => {
        const horizontal = equatorialVectorToHorizontal(null, null);
        expect(horizontal.altitudeRad).toBe(0);
        expect(horizontal.sinAltitude).toBe(0);
    });

    it("converts catalog coordinates straight to the horizon frame", () => {
        const result = raDecToHorizontal({ raDeg: 0, decDeg: 90 }, {
            latitudeDeg: 51.5,
            longitudeDeg: 0,
            julianDate: 2451545.0,
        });

        expect(radiansToDegrees(result.altitudeRad)).toBeCloseTo(51.5, 9);
        expect(result.siderealRad).toBeCloseTo(julianDateToGmstRadians(2451545.0), 12);
    });

    it("accepts the observer position in radians", () => {
        const byDegrees = raDecToHorizontal({ raDeg: 10, decDeg: 20 }, {
            latitudeDeg: 30,
            longitudeDeg: 40,
            julianDate: 2451545.0,
        });
        const byRadians = raDecToHorizontal({ raDeg: 10, decDeg: 20 }, {
            latitudeRad: degreesToRadians(30),
            longitudeRad: degreesToRadians(40),
            julianDate: 2451545.0,
        });

        expect(byRadians.altitudeRad).toBeCloseTo(byDegrees.altitudeRad, 12);
        expect(byRadians.azimuthRad).toBeCloseTo(byDegrees.azimuthRad, 12);
    });

    it("falls back to an explicit observation date", () => {
        const date = new Date(Date.UTC(2026, 3, 1, 3, 0, 0));
        const result = raDecToHorizontal({ raDeg: 0, decDeg: 0 }, { latitudeDeg: 0, date });

        expect(result.siderealRad)
            .toBeCloseTo(julianDateToGmstRadians(dateToJulianDate(date)), 12);
    });

    it("assumes a Greenwich equator observer when nothing is given", () => {
        const result = raDecToHorizontal({ raDeg: 0, decDeg: 0 }, {});
        expect(Number.isFinite(result.altitudeRad)).toBe(true);
        expect(Number.isFinite(result.azimuthRad)).toBe(true);
    });
});

describe("stable twinkle seeds", () => {
    it("is deterministic for the same key", () => {
        expect(stableUnitHash("HIP 32349")).toBe(stableUnitHash("HIP 32349"));
    });

    it("separates different keys", () => {
        expect(stableUnitHash("HIP 32349")).not.toBe(stableUnitHash("HIP 32350"));
    });

    it("stays inside the unit interval", () => {
        for (const key of ["", "a", "Betelgeuse", 12345, null, undefined]) {
            const value = stableUnitHash(key);
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThanOrEqual(1);
        }
    });

    it("treats null and undefined as the empty key", () => {
        expect(stableUnitHash(null)).toBe(stableUnitHash(""));
        expect(stableUnitHash(undefined)).toBe(stableUnitHash(""));
    });

    it("hashes numbers by their string form", () => {
        expect(stableUnitHash(42)).toBe(stableUnitHash("42"));
    });
});
