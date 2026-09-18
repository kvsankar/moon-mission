import { describe, expect, it } from "vitest";

import {
    AtmosphereModel,
    DEFAULT_ATMOSPHERE_PARAMS,
    airmassFromAltitude,
    estimateSkyLuminance,
    extinctionFromAltitude,
    resolveSkyGradient,
    scatteringCoefficients,
    sunAltitudeToTwilight,
    twinkleAmplitudeFromAltitude,
} from "../src/platform/js/rendering/AtmosphereModel.js";

const DEG = Math.PI / 180;

describe("airmass", () => {
    it("is one at the zenith", () => {
        expect(airmassFromAltitude(Math.PI / 2)).toBeCloseTo(1, 6);
    });

    it("grows monotonically towards the horizon", () => {
        const high = airmassFromAltitude(60 * DEG);
        const low = airmassFromAltitude(10 * DEG);

        expect(low).toBeGreaterThan(high);
        expect(high).toBeGreaterThan(1);
    });

    it("saturates below the horizon", () => {
        expect(airmassFromAltitude(0)).toBe(40);
        expect(airmassFromAltitude(-0.5)).toBe(40);
    });

    it("stays near the textbook value at 30 degrees", () => {
        expect(airmassFromAltitude(30 * DEG)).toBeCloseTo(2, 1);
    });
});

describe("extinction", () => {
    it("transmits more light at the zenith than near the horizon", () => {
        expect(extinctionFromAltitude(Math.PI / 2))
            .toBeGreaterThan(extinctionFromAltitude(10 * DEG));
    });

    it("stays within a physical transmission range", () => {
        for (const altitude of [-0.5, 0, 0.1, 0.8, Math.PI / 2]) {
            const value = extinctionFromAltitude(altitude);
            expect(value).toBeGreaterThan(0);
            expect(value).toBeLessThanOrEqual(1);
        }
    });

    it("transmits more from a clearer site", () => {
        const clear = extinctionFromAltitude(30 * DEG, { clarity: 1 });
        const hazy = extinctionFromAltitude(30 * DEG, { clarity: 0 });

        expect(clear).toBeGreaterThan(hazy);
    });

    it("transmits less as the extinction coefficient rises", () => {
        expect(extinctionFromAltitude(30 * DEG, { extinctionCoefficient: 0.5 }))
            .toBeLessThan(extinctionFromAltitude(30 * DEG, { extinctionCoefficient: 0.1 }));
    });

    it("clamps an out-of-range clarity instead of extrapolating", () => {
        expect(extinctionFromAltitude(30 * DEG, { clarity: 5 }))
            .toBe(extinctionFromAltitude(30 * DEG, { clarity: 1 }));
        expect(extinctionFromAltitude(30 * DEG, { clarity: -5 }))
            .toBe(extinctionFromAltitude(30 * DEG, { clarity: 0 }));
    });

    it("falls back to the defaults for non-numeric options", () => {
        expect(extinctionFromAltitude(30 * DEG, { clarity: "clear", extinctionCoefficient: null }))
            .toBe(extinctionFromAltitude(30 * DEG));
    });
});

describe("twinkle", () => {
    it("twinkles more near the horizon", () => {
        expect(twinkleAmplitudeFromAltitude(5 * DEG))
            .toBeGreaterThan(twinkleAmplitudeFromAltitude(80 * DEG));
    });

    it("keeps a small floor even at the zenith", () => {
        expect(twinkleAmplitudeFromAltitude(Math.PI / 2)).toBeCloseTo(0.015, 6);
    });

    it("scales with the requested twinkle strength", () => {
        expect(twinkleAmplitudeFromAltitude(5 * DEG, { twinkleStrength: 2 }))
            .toBeGreaterThan(twinkleAmplitudeFromAltitude(5 * DEG, { twinkleStrength: 1 }));
        expect(twinkleAmplitudeFromAltitude(5 * DEG, { twinkleStrength: 0 }))
            .toBeCloseTo(0.015, 6);
    });

    it("twinkles more at a hazier site", () => {
        expect(twinkleAmplitudeFromAltitude(5 * DEG, { clarity: 0 }))
            .toBeGreaterThan(twinkleAmplitudeFromAltitude(5 * DEG, { clarity: 1 }));
    });
});

describe("scattering coefficients", () => {
    it("returns values inside the documented clamps", () => {
        for (const turbidity of [0, 1.5, 3, 8, 50]) {
            const { rayleigh, mie } = scatteringCoefficients({ turbidity, clarity: 0.5 });
            expect(rayleigh).toBeGreaterThanOrEqual(1.2);
            expect(rayleigh).toBeLessThanOrEqual(6);
            expect(mie).toBeGreaterThanOrEqual(0.08);
            expect(mie).toBeLessThanOrEqual(2.2);
        }
    });

    it("trades Rayleigh for Mie as turbidity rises", () => {
        const clean = scatteringCoefficients({ turbidity: 1.5, clarity: 0.5 });
        const dusty = scatteringCoefficients({ turbidity: 8, clarity: 0.5 });

        expect(dusty.mie).toBeGreaterThan(clean.mie);
        expect(dusty.rayleigh).toBeLessThan(clean.rayleigh);
    });

    it("raises Rayleigh scattering for a clearer sky", () => {
        expect(scatteringCoefficients({ clarity: 1 }).rayleigh)
            .toBeGreaterThan(scatteringCoefficients({ clarity: 0 }).rayleigh);
    });
});

describe("sky gradient", () => {
    it("keeps every channel inside the unit range", () => {
        for (const sunAltitudeDeg of [-30, -18, -6, 0, 10, 60]) {
            const gradient = resolveSkyGradient({ sunAltitudeDeg, turbidity: 8, lightPollution: 1 });
            for (const band of [gradient.zenith, gradient.horizon, gradient.nadir]) {
                expect(band).toHaveLength(3);
                for (const channel of band) {
                    expect(channel).toBeGreaterThanOrEqual(0);
                    expect(channel).toBeLessThanOrEqual(1);
                }
            }
        }
    });

    it("reports full night below astronomical twilight", () => {
        expect(resolveSkyGradient({ sunAltitudeDeg: -30 }).twilight).toBe(0);
    });

    it("reports full daylight above the twilight band", () => {
        expect(resolveSkyGradient({ sunAltitudeDeg: 20 }).twilight).toBe(1);
    });

    it("brightens the zenith as the Sun rises", () => {
        const night = resolveSkyGradient({ sunAltitudeDeg: -20 });
        const day = resolveSkyGradient({ sunAltitudeDeg: 10 });

        expect(day.zenith[2]).toBeGreaterThan(night.zenith[2]);
    });

    it("warms the horizon before it warms the zenith", () => {
        const dusk = resolveSkyGradient({ sunAltitudeDeg: -4 });

        expect(dusk.horizon[0]).toBeGreaterThan(dusk.zenith[0]);
    });

    it("lifts the night sky floor with light pollution", () => {
        const dark = resolveSkyGradient({ sunAltitudeDeg: -30, lightPollution: 0 });
        const bright = resolveSkyGradient({ sunAltitudeDeg: -30, lightPollution: 1 });

        expect(bright.zenith[0]).toBeGreaterThan(dark.zenith[0]);
        expect(bright.nadir[0]).toBeGreaterThan(dark.nadir[0]);
    });

    it("lifts the ground glow with the horizon glow parameter", () => {
        expect(resolveSkyGradient({ horizonGlow: 1 }).nadir[2])
            .toBeGreaterThan(resolveSkyGradient({ horizonGlow: 0 }).nadir[2]);
    });

    it("defaults to an astronomical-night sky", () => {
        expect(resolveSkyGradient()).toEqual(resolveSkyGradient({ sunAltitudeDeg: -18 }));
    });

    it("reports scattering derived from its own haze estimate", () => {
        const gradient = resolveSkyGradient({ turbidity: 8 });

        expect(gradient.scattering.mie).toBeGreaterThan(resolveSkyGradient({ turbidity: 1.5 }).scattering.mie);
    });
});

describe("AtmosphereModel", () => {
    it("starts from the shared defaults", () => {
        expect(new AtmosphereModel().getParams()).toEqual(DEFAULT_ATMOSPHERE_PARAMS);
    });

    it("merges constructor overrides over the defaults", () => {
        const model = new AtmosphereModel({ clarity: 0.1 });

        expect(model.getParams().clarity).toBe(0.1);
        expect(model.getParams().turbidity).toBe(DEFAULT_ATMOSPHERE_PARAMS.turbidity);
    });

    it("hands out a copy of its parameters", () => {
        const model = new AtmosphereModel();
        const params = model.getParams();

        params.clarity = 0;

        expect(model.getParams().clarity).toBe(DEFAULT_ATMOSPHERE_PARAMS.clarity);
    });

    it("patches parameters without dropping the rest", () => {
        const model = new AtmosphereModel();

        model.setParams({ turbidity: 6 });

        expect(model.getParams().turbidity).toBe(6);
        expect(model.getParams().clarity).toBe(DEFAULT_ATMOSPHERE_PARAMS.clarity);
    });

    it("applies its own parameters to the free functions", () => {
        const hazy = new AtmosphereModel({ clarity: 0 });

        expect(hazy.extinctionAt(30 * DEG))
            .toBe(extinctionFromAltitude(30 * DEG, hazy.getParams()));
        expect(hazy.twinkleAmplitudeAt(30 * DEG))
            .toBe(twinkleAmplitudeFromAltitude(30 * DEG, hazy.getParams()));
    });

    it("lets a gradient call override the Sun altitude", () => {
        const model = new AtmosphereModel();

        expect(model.skyGradient({ sunAltitudeDeg: 10 }).twilight).toBe(1);
        expect(model.skyGradient().twilight).toBe(0);
    });

    it("packs a complete shader uniform set", () => {
        const model = new AtmosphereModel({ clarity: 0.4, twinkleStrength: 2 });

        const uniforms = model.toUniforms({ sunAltitudeDeg: -5 });

        expect(uniforms.uAtmosphereClarity).toBe(0.4);
        expect(uniforms.uTwinkleStrength).toBe(2);
        expect(uniforms.uSkyZenithColor).toHaveLength(3);
        expect(uniforms.uSkyHorizonColor).toHaveLength(3);
        expect(uniforms.uSkyNadirColor).toHaveLength(3);
        expect(uniforms.uRayleighStrength).toBeGreaterThan(0);
        expect(uniforms.uMieStrength).toBeGreaterThan(0);
    });
});

describe("twilight and luminance", () => {
    it("reports no twilight below the astronomical limit", () => {
        expect(sunAltitudeToTwilight(-18)).toBe(0);
        expect(sunAltitudeToTwilight(-30)).toBe(0);
    });

    it("saturates once the Sun is up", () => {
        expect(sunAltitudeToTwilight(0)).toBe(1);
        expect(sunAltitudeToTwilight(45)).toBe(1);
    });

    it("rises through the twilight band", () => {
        expect(sunAltitudeToTwilight(-9)).toBeCloseTo(0.5, 6);
    });

    it("keeps luminance inside the unit range", () => {
        for (const sunAltitudeDeg of [-90, -18, 0, 45, 90]) {
            const value = estimateSkyLuminance({ sunAltitudeDeg, lightPollution: 1 });
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThanOrEqual(1);
        }
    });

    it("brightens as the Sun rises", () => {
        expect(estimateSkyLuminance({ sunAltitudeDeg: 20 }))
            .toBeGreaterThan(estimateSkyLuminance({ sunAltitudeDeg: -20 }));
    });

    it("brightens with light pollution at night", () => {
        expect(estimateSkyLuminance({ sunAltitudeDeg: -30, lightPollution: 1 }))
            .toBeGreaterThan(estimateSkyLuminance({ sunAltitudeDeg: -30, lightPollution: 0 }));
    });

    it("defaults to an astronomical-night Sun", () => {
        expect(estimateSkyLuminance()).toBe(estimateSkyLuminance({ sunAltitudeDeg: -18 }));
    });
});
