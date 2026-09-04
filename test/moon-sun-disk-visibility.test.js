import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// JS reproduction of the GLSL `moonSunDiskVisibleFraction` helper inside
// `src/platform/js/rendering/moon-renderer.js` (and the same helper in
// `src/platform/js/moon-render-tuner.js`). Kept in sync manually — the
// shader source is a string template, not directly importable. If the
// GLSL constants or formula change, mirror the change here and re-run.
//
// Purpose: catch typos and sign errors in the closed-form integral that
// the text-match assertions in `moon-renderer.test.js` cannot detect.

const MOON_SUN_SIN_ALPHA = 0.00466; // sin(0.267°), Sun half-angle from Moon
const MOON_INV_PI = 0.31830988618;

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const renderShaderSource = readFileSync(
    resolve(repoRoot, "src/platform/js/rendering/moon-renderer.js"),
    "utf8",
);
const tunerShaderSource = readFileSync(
    resolve(repoRoot, "src/platform/js/moon-render-tuner.js"),
    "utf8",
);

function moonSunDiskVisibleFraction(rawNdotL) {
    const h = rawNdotL / MOON_SUN_SIN_ALPHA;
    if (h >= 1.0) return 1.0;
    if (h <= -1.0) return 0.0;
    const s = Math.sqrt(Math.max(1.0 - h * h, 0.0));
    return MOON_INV_PI * (1.5707963267948966 + Math.asin(h) + h * s);
}

describe("moonSunDiskVisibleFraction (closed-form Sun-disk visible-area fraction)", () => {
    it("returns 0 when the Sun's disk is fully below the horizon", () => {
        expect(moonSunDiskVisibleFraction(-1.5 * MOON_SUN_SIN_ALPHA)).toBe(0);
        expect(moonSunDiskVisibleFraction(-MOON_SUN_SIN_ALPHA)).toBe(0);
        expect(moonSunDiskVisibleFraction(-0.01)).toBe(0); // well past the band
    });

    it("returns 1 when the Sun's disk is fully above the horizon", () => {
        expect(moonSunDiskVisibleFraction(MOON_SUN_SIN_ALPHA)).toBe(1);
        expect(moonSunDiskVisibleFraction(1.5 * MOON_SUN_SIN_ALPHA)).toBe(1);
        expect(moonSunDiskVisibleFraction(0.5)).toBe(1); // sub-solar regime
        expect(moonSunDiskVisibleFraction(1.0)).toBe(1);
    });

    it("returns 0.5 when the Sun's centre is exactly on the horizon", () => {
        expect(moonSunDiskVisibleFraction(0)).toBeCloseTo(0.5, 10);
    });

    it("matches the closed-form area-fraction at h = ±0.5", () => {
        // h = +0.5: arc = π/2 + arcsin(0.5) + 0.5·√(0.75)
        //                = 1.5708 + 0.5236 + 0.4330 = 2.5274
        //         visible = arc / π = 0.8045
        expect(moonSunDiskVisibleFraction(0.5 * MOON_SUN_SIN_ALPHA))
            .toBeCloseTo(0.8045, 3);
        // h = -0.5: arc = π/2 + arcsin(-0.5) + (-0.5)·√(0.75)
        //                = 1.5708 - 0.5236 - 0.4330 = 0.6142
        //         visible = arc / π = 0.1955
        expect(moonSunDiskVisibleFraction(-0.5 * MOON_SUN_SIN_ALPHA))
            .toBeCloseTo(0.1955, 3);
    });

    it("satisfies the symmetry identity f(h) + f(-h) = 1 across the band", () => {
        // The visible-area fraction above the horizon and below it must
        // sum to the whole disk.
        for (const t of [0.1, 0.2, 0.3, 0.5, 0.7, 0.9]) {
            const above = moonSunDiskVisibleFraction(t * MOON_SUN_SIN_ALPHA);
            const below = moonSunDiskVisibleFraction(-t * MOON_SUN_SIN_ALPHA);
            expect(above + below).toBeCloseTo(1.0, 10);
        }
    });

    it("transitions monotonically across the penumbra", () => {
        let prev = -Infinity;
        for (let i = -10; i <= 10; i += 1) {
            const t = i / 10;
            const v = moonSunDiskVisibleFraction(t * MOON_SUN_SIN_ALPHA);
            expect(v).toBeGreaterThanOrEqual(prev);
            prev = v;
        }
    });

    it("uses the Sun's actual angular half-radius from the Moon (sin 0.267°)", () => {
        // Sun-Moon distance ~ Earth-Sun distance ~ 1 AU = 1.496e8 km.
        // Sun radius ~ 6.957e5 km. α = arcsin(R_sun / d) ≈ 0.267°.
        const expectedSinAlpha = Math.sin((0.267 * Math.PI) / 180);
        // Constant in the shader is rounded to 4 sig figs.
        expect(MOON_SUN_SIN_ALPHA).toBeCloseTo(expectedSinAlpha, 4);
    });
});

// Drift check: the shader helper exists in TWO places (the production
// renderer and the tuner). They are not currently extracted into a shared
// GLSL string. This block reads both source files and asserts they share
// the canonical signature, constants, and reconstruction line — so that a
// future edit to one without the other is caught at test time.
describe("moonSunDiskVisibleFraction drift check (renderer vs tuner)", () => {
    it("declares the same MOON_SUN_SIN_ALPHA constant in both shader sources", () => {
        const constantPattern = /const float MOON_SUN_SIN_ALPHA\s*=\s*0\.00466\s*;/;
        expect(renderShaderSource).toMatch(constantPattern);
        expect(tunerShaderSource).toMatch(constantPattern);
    });

    it("declares the same MOON_INV_PI constant in both shader sources", () => {
        const constantPattern = /const float MOON_INV_PI\s*=\s*0\.31830988618\s*;/;
        expect(renderShaderSource).toMatch(constantPattern);
        expect(tunerShaderSource).toMatch(constantPattern);
    });

    it("declares the moonSunDiskVisibleFraction helper signature in both shader sources", () => {
        const signaturePattern = /float moonSunDiskVisibleFraction\(\s*float rawNdotL\s*\)/;
        expect(renderShaderSource).toMatch(signaturePattern);
        expect(tunerShaderSource).toMatch(signaturePattern);
    });

    it("uses the same closed-form expression in both shader sources", () => {
        // The asin term and the disk-area formula must be identical between
        // the two implementations (catches accidental sign flips or rounded
        // constants in one file but not the other).
        const formulaPattern = /MOON_INV_PI\s*\*\s*\(\s*1\.5707963267948966\s*\+\s*asin\(\s*h\s*\)\s*\+\s*h\s*\*\s*s\s*\)/;
        expect(renderShaderSource).toMatch(formulaPattern);
        expect(tunerShaderSource).toMatch(formulaPattern);
    });

    it("preserves terrain-adjusted smooth visibility for Current while Physical may use displaced geometry", () => {
        const tunerHorizonPattern = /moonEffectiveRawNdotLForVis\s*=\s*moonSmoothRawNdotLForVis\s*\+\s*moonTerrainHorizonLift/;
        const rendererCurrentPattern = /moonCurrentRawNdotLForVis\s*=\s*moonSmoothRawNdotLForVis\s*\+\s*moonTerrainHorizonLift/;
        const rendererPhysicalPattern = /moonEffectiveRawNdotLForVis\s*=\s*mix\(\s*moonCurrentRawNdotLForVis\s*,\s*moonMacroscopicRawNdotLForVis/;
        const visibilityPattern = /moonSunDiskVisibleFraction\(\s*moonEffectiveRawNdotLForVis\s*\)/;
        expect(renderShaderSource).toMatch(rendererCurrentPattern);
        expect(renderShaderSource).toMatch(rendererPhysicalPattern);
        expect(tunerShaderSource).toMatch(tunerHorizonPattern);
        expect(renderShaderSource).toMatch(visibilityPattern);
        expect(tunerShaderSource).toMatch(visibilityPattern);
    });

    it("isolates earthshine via the same delta pattern in both shader sources", () => {
        const isolationPattern = /moonEarthshineDirectKept\s*=\s*max\(\s*reflectedLight\.directDiffuse\s*-\s*moonSunDirectContribution\s*,\s*vec3\(\s*0\.0\s*\)\s*\)/;
        expect(renderShaderSource).toMatch(isolationPattern);
        expect(tunerShaderSource).toMatch(isolationPattern);
    });
});
