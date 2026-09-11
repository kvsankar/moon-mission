import { readFileSync } from "node:fs";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";

import {
    SunRenderer,
    SUN_CORONA_PRESETS,
    buildSolarCoronaPixels,
    sampleSolarCoronaOuterFade,
    sampleSolarCoronaModel,
} from "../src/platform/js/rendering/sun-renderer.js";

describe("sampleSolarCoronaModel", () => {
    it("falls off from the inner K-corona into the broad outer F-corona", () => {
        const inner = sampleSolarCoronaModel(1.15, 0);
        const middle = sampleSolarCoronaModel(8, 0);
        const outer = sampleSolarCoronaModel(45, 0);

        expect(inner.alpha).toBeGreaterThan(middle.alpha);
        expect(middle.alpha).toBeGreaterThan(outer.alpha);
        expect(outer.fCorona).toBeGreaterThan(0);
        expect(outer.alpha).toBeGreaterThan(0);
    });

    it("keeps the wide F-corona brighter along the ecliptic than over the poles", () => {
        const alongEcliptic = sampleSolarCoronaModel(35, -0.16);
        const overPole = sampleSolarCoronaModel(35, -0.16 + (Math.PI * 0.5));

        expect(alongEcliptic.fCorona).toBeGreaterThan(overPole.fCorona);
        expect(alongEcliptic.alpha).toBeGreaterThan(overPole.alpha);
    });

    it("adds structured streamers in the inner and middle corona", () => {
        const streamerAxis = sampleSolarCoronaModel(4, -0.24);
        const quietAngle = sampleSolarCoronaModel(4, 1.2);

        expect(streamerAxis.streamers).toBeGreaterThan(quietAngle.streamers);
        expect(streamerAxis.alpha).toBeGreaterThan(quietAngle.alpha);
    });

    it("can remove angular variation while preserving radial falloff", () => {
        const thetaA = sampleSolarCoronaModel(4, -0.24, { angularVariation: 0 });
        const thetaB = sampleSolarCoronaModel(4, 1.2, { angularVariation: 0 });
        const outer = sampleSolarCoronaModel(12, -0.24, { angularVariation: 0 });

        expect(thetaA.alpha).toBeCloseTo(thetaB.alpha, 8);
        expect(thetaA.streamers).toBeCloseTo(0, 8);
        expect(thetaA.polarPlumes).toBeCloseTo(0, 8);
        expect(thetaA.alpha).toBeGreaterThan(outer.alpha);
    });

    it("can shift streamer texture phases for layered corona motion", () => {
        const base = sampleSolarCoronaModel(4, -0.24);
        const shifted = sampleSolarCoronaModel(4, -0.24, {
            streamerPhaseRad: 0.63,
            streamerStrengthMul: 1.55,
            weavePhaseRad: 1.9,
        });

        expect(shifted.signal).not.toBeCloseTo(base.signal, 5);
        expect(shifted.alpha).toBeGreaterThan(0);
    });

    it("uses an angular outer fade so the corona does not end as a perfect circle", () => {
        const streamerDirection = sampleSolarCoronaOuterFade(0.89, -0.24);
        const quietDirection = sampleSolarCoronaOuterFade(0.89, 1.45);

        expect(streamerDirection).toBeGreaterThan(quietDirection);
        expect(Math.abs(streamerDirection - quietDirection)).toBeGreaterThan(0.2);
    });

    it("can use a circular outer fade for a uniform corona", () => {
        const a = sampleSolarCoronaOuterFade(0.89, -0.24, { angularVariation: 0 });
        const b = sampleSolarCoronaOuterFade(0.89, 1.45, { angularVariation: 0 });

        expect(a).toBeCloseTo(b, 8);
    });
});

describe("SunRenderer corona animation", () => {
    it("animates layered corona material state without enabling flare sprites", () => {
        const renderer = Object.assign(Object.create(SunRenderer.prototype), {
            _visualState: {
                coronaOpacity: 0.8,
                coronaFlowOpacity: 0.4,
                coronaFlowScaleMul: 84,
                coronaMotionMul: 1,
            },
            coronaSprite: {
                material: {},
            },
            coronaFlowSprite: {
                material: {},
                scale: {
                    value: 0,
                    setScalar(nextValue) {
                        this.value = nextValue;
                    },
                },
                visible: false,
            },
            radius: 1,
        });

        renderer.updateAppearance(0);
        const firstBaseRotation = renderer.coronaSprite.material.rotation;
        const firstFlowRotation = renderer.coronaFlowSprite.material.rotation;
        const firstFlowOpacity = renderer.coronaFlowSprite.material.opacity;
        const firstFlowScale = renderer.coronaFlowSprite.scale.value;

        renderer.updateAppearance(5000);

        expect(renderer.coronaSprite.material.rotation).not.toBeCloseTo(firstBaseRotation, 6);
        expect(renderer.coronaFlowSprite.material.rotation).not.toBeCloseTo(firstFlowRotation, 6);
        expect(renderer.coronaFlowSprite.material.opacity).not.toBeCloseTo(firstFlowOpacity, 6);
        expect(renderer.coronaFlowSprite.scale.value).not.toBeCloseTo(firstFlowScale, 6);
        expect(renderer.coronaFlowSprite.visible).toBe(true);
    });
});

describe("prepared Sun corona textures", () => {
    it.each(["base", "flow"])("preserves every %s pixel from the existing corona model", name => {
        const image = PNG.sync.read(readFileSync(new URL(`../src/platform/assets/sun-corona-${name}.png`, import.meta.url)));
        const reference = buildSolarCoronaPixels(SUN_CORONA_PRESETS[name]);
        expect([image.width, image.height]).toEqual([reference.width, reference.height]);
        expect(Buffer.compare(image.data, Buffer.from(reference.data))).toBe(0);
    });
});
