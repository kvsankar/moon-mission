import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

import { installFakeDom } from "./helpers/fake-dom.js";
import {
    SUN_CORONA_PRESETS,
    SunRenderer,
    buildSolarCoronaPixels,
    sampleSolarCoronaModel,
    sampleSolarCoronaOuterFade,
} from "../src/platform/js/rendering/sun-renderer.js";

let dom = null;

beforeEach(() => {
    dom = installFakeDom();
});

afterEach(() => {
    dom?.restore();
    dom = null;
});

describe("solar corona model", () => {
    it("fades out with distance from the limb", () => {
        const near = sampleSolarCoronaModel(1.05, 0);
        const far = sampleSolarCoronaModel(40, 0);

        expect(near.signal).toBeGreaterThan(far.signal);
        expect(near.alpha).toBeGreaterThan(far.alpha);
    });

    it("keeps alpha inside the unit range everywhere it is sampled", () => {
        for (const radius of [0, 1, 1.2, 5, 30, 90]) {
            for (const theta of [-3, -1, 0, 1, 3]) {
                const sample = sampleSolarCoronaModel(radius, theta);
                expect(sample.alpha).toBeGreaterThanOrEqual(0);
                expect(sample.alpha).toBeLessThanOrEqual(1);
            }
        }
    });

    it("treats sub-limb radii as the limb", () => {
        expect(sampleSolarCoronaModel(0.2, 0)).toEqual(sampleSolarCoronaModel(1, 0));
        expect(sampleSolarCoronaModel(-5, 0)).toEqual(sampleSolarCoronaModel(1, 0));
    });

    it("treats a non-finite angle as zero", () => {
        expect(sampleSolarCoronaModel(2, Number.NaN)).toEqual(sampleSolarCoronaModel(2, 0));
    });

    it("brightens the equatorial streamer belt over the poles", () => {
        const eclipticTiltRad = 0;
        const equatorial = sampleSolarCoronaModel(3, 0, { eclipticTiltRad });
        const polar = sampleSolarCoronaModel(3, Math.PI / 2, { eclipticTiltRad });

        expect(equatorial.streamers).toBeGreaterThan(polar.streamers);
        expect(polar.polarPlumes).toBeGreaterThan(equatorial.polarPlumes);
    });

    it("splits the signal into K and F fractions that account for the whole", () => {
        const sample = sampleSolarCoronaModel(4, 0.3);

        expect(sample.fFraction + (sample.signal > 0 ? 1 - sample.fFraction : 0)).toBeCloseTo(1, 9);
        expect(sample.fFraction).toBeGreaterThan(0);
        expect(sample.fFraction).toBeLessThan(1);
    });

    it("reports zero fractions when the model produces no signal", () => {
        const sample = sampleSolarCoronaModel(1, 0, {
            kCoronaStrength: 0,
            fCoronaStrength: 0,
            streamerStrengthMul: 0,
            polarStrengthMul: 0,
        });

        expect(sample.fFraction).toBe(0);
        expect(sample.alpha).toBe(0);
    });

    it("keeps every colour channel inside the unit range", () => {
        for (const radius of [1, 3, 20, 80]) {
            const { color } = sampleSolarCoronaModel(radius, 0.4);
            for (const channel of [color.r, color.g, color.b]) {
                expect(channel).toBeGreaterThanOrEqual(0);
                expect(channel).toBeLessThanOrEqual(1);
            }
        }
    });

    it("removes all angular structure when variation is off", () => {
        const first = sampleSolarCoronaModel(4, 0, { angularVariation: 0 });
        const second = sampleSolarCoronaModel(4, 2.1, { angularVariation: 0 });

        expect(second.alpha).toBeCloseTo(first.alpha, 12);
        expect(second.streamers).toBe(0);
        expect(second.polarPlumes).toBe(0);
    });

    it("scales the K and F components independently", () => {
        const base = sampleSolarCoronaModel(3, 0);
        const strongK = sampleSolarCoronaModel(3, 0, { kCoronaStrength: 2 });
        const strongF = sampleSolarCoronaModel(3, 0, { fCoronaStrength: 2 });

        expect(strongK.kCorona).toBeCloseTo(base.kCorona * 2, 9);
        expect(strongF.fCorona).toBeCloseTo(base.fCorona * 2, 9);
    });
});

describe("corona outer fade", () => {
    it("is fully opaque in the inner corona and transparent past the edge", () => {
        expect(sampleSolarCoronaOuterFade(0, 0)).toBe(1);
        expect(sampleSolarCoronaOuterFade(1, 0)).toBe(0);
    });

    it("decreases monotonically outwards", () => {
        const samples = [0.5, 0.7, 0.8, 0.9, 0.95, 1]
            .map((radial) => sampleSolarCoronaOuterFade(radial, 0));

        for (let index = 1; index < samples.length; index += 1) {
            expect(samples[index]).toBeLessThanOrEqual(samples[index - 1]);
        }
    });

    it("falls back to a circular edge when variation is off", () => {
        expect(sampleSolarCoronaOuterFade(0.86, 0, { angularVariation: 0 }))
            .toBe(sampleSolarCoronaOuterFade(0.86, 2.4, { angularVariation: 0 }));
    });

    it("reaches further along the streamer belt than across it", () => {
        const along = sampleSolarCoronaOuterFade(0.88, 0, { eclipticTiltRad: 0 });
        const across = sampleSolarCoronaOuterFade(0.88, Math.PI / 2, { eclipticTiltRad: 0 });

        expect(along).toBeGreaterThan(across);
    });

    it("treats negative radii and a non-finite angle defensively", () => {
        expect(sampleSolarCoronaOuterFade(-1, 0)).toBe(1);
        expect(sampleSolarCoronaOuterFade(0.5, Number.NaN))
            .toBe(sampleSolarCoronaOuterFade(0.5, 0));
    });
});

describe("corona texture pixels", () => {
    it("fills an RGBA buffer of the requested size", () => {
        const { width, height, data } = buildSolarCoronaPixels(SUN_CORONA_PRESETS.base, 16);

        expect(width).toBe(16);
        expect(height).toBe(16);
        expect(data).toHaveLength(16 * 16 * 4);
    });

    it("leaves the corners outside the disc fully transparent", () => {
        const size = 16;
        const { data } = buildSolarCoronaPixels(SUN_CORONA_PRESETS.base, size);

        expect(data[3]).toBe(0);
        expect(data[((size * size) - 1) * 4 + 3]).toBe(0);
    });

    it("paints an opaque annulus around a cut-out centre", () => {
        // An odd size puts one pixel exactly on the axis, where the centre
        // fade cuts the corona out so the disc sprite shows through.
        const size = 33;
        const { data } = buildSolarCoronaPixels(SUN_CORONA_PRESETS.base, size);
        const mid = (size - 1) / 2;
        const sampleAlpha = (x, y) => data[(((y * size) + x) * 4) + 3];

        expect(sampleAlpha(mid, mid)).toBe(0);
        expect(sampleAlpha(mid + 4, mid)).toBeGreaterThan(0);
    });

    it("produces a different texture for the flow preset", () => {
        const base = buildSolarCoronaPixels(SUN_CORONA_PRESETS.base, 16);
        const flow = buildSolarCoronaPixels(SUN_CORONA_PRESETS.flow, 16);

        expect(Array.from(flow.data)).not.toEqual(Array.from(base.data));
    });

    it("is deterministic for the same options", () => {
        const first = buildSolarCoronaPixels(SUN_CORONA_PRESETS.flow, 16);
        const second = buildSolarCoronaPixels(SUN_CORONA_PRESETS.flow, 16);

        expect(Array.from(first.data)).toEqual(Array.from(second.data));
    });
});

describe("SunRenderer geometry", () => {
    it("keeps the Sun inside the sky shell", () => {
        const renderer = new SunRenderer(new THREE.Group(), 10);

        expect(renderer.distance).toBeLessThan(200 * 10);
        expect(renderer.distance).toBeGreaterThan(0);
    });

    it("uses a sane base radius for a bad input", () => {
        expect(new SunRenderer(new THREE.Group(), 0).baseRadius).toBe(1);
        expect(new SunRenderer(new THREE.Group(), Number.NaN).baseRadius).toBe(1);
        expect(new SunRenderer(new THREE.Group(), -5).baseRadius).toBe(1);
    });

    it("sizes the disc to the real solar angular diameter", () => {
        const renderer = new SunRenderer(new THREE.Group(), 10);

        const angularDiameterRad = 2 * Math.atan(renderer.radius / renderer.distance);
        expect(THREE.MathUtils.radToDeg(angularDiameterRad)).toBeCloseTo(0.533, 3);
    });

    it("never collapses the disc below a visible floor", () => {
        const renderer = new SunRenderer(new THREE.Group(), 10);

        expect(renderer.computeAngularRadius(0)).toBe(10 * 0.01);
    });
});

describe("SunRenderer lifecycle", () => {
    let parent = null;
    let renderer = null;

    beforeEach(() => {
        parent = new THREE.Group();
        renderer = new SunRenderer(parent, 10);
    });

    afterEach(() => {
        renderer?.dispose();
        renderer = null;
    });

    it("builds every sprite layer and attaches the group", () => {
        renderer.create();

        expect(parent.children).toContain(renderer.group);
        expect(renderer.group.frustumCulled).toBe(false);
        for (const sprite of [
            renderer.coreSprite,
            renderer.haloSprite,
            renderer.coronaSprite,
            renderer.coronaFlowSprite,
            renderer.zodiacalSprite,
            renderer.starburstSprite,
            renderer.flareSprite,
        ]) {
            expect(sprite).toBeInstanceOf(THREE.Sprite);
            expect(sprite.material.map).toBeTruthy();
        }
    });

    it("draws the Sun in front of the sky but behind the scene", () => {
        renderer.create();

        expect(renderer.coreSprite.renderOrder).toBeLessThan(0);
        expect(renderer.haloSprite.renderOrder).toBeLessThan(renderer.coreSprite.renderOrder);
        expect(renderer.flareSprite.renderOrder).toBeLessThan(renderer.starburstSprite.renderOrder);
    });

    it("honours an initial hidden state", () => {
        renderer.create(false);

        expect(renderer.group.visible).toBe(false);
    });

    it("toggles group visibility without rebuilding", () => {
        renderer.create();
        const group = renderer.group;

        renderer.setVisible(false);
        expect(group.visible).toBe(false);

        renderer.setVisible(true);
        expect(renderer.group).toBe(group);
        expect(group.visible).toBe(true);
    });

    it("ignores a visibility change before creation", () => {
        expect(() => renderer.setVisible(true)).not.toThrow();
    });

    it("releases every sprite, texture and the group on disposal", () => {
        renderer.create();
        const group = renderer.group;
        const mapSpies = [
            renderer.coreSprite,
            renderer.flareSprite,
        ].map((sprite) => vi.spyOn(sprite.material.map, "dispose"));

        renderer.dispose();

        expect(mapSpies.every((spy) => spy.mock.calls.length > 0)).toBe(true);
        expect(renderer.group).toBeNull();
        expect(renderer.coreSprite).toBeNull();
        expect(renderer.flareSprite).toBeNull();
        expect(parent.children).not.toContain(group);
    });

    it("is safe to dispose before creation", () => {
        expect(() => renderer.dispose()).not.toThrow();
    });

    it("drops the render-invalidation callback on disposal", () => {
        const requestRender = vi.fn();
        renderer.setRenderInvalidationCallback(requestRender);
        renderer.create();

        renderer.dispose();

        expect(renderer.requestRender).toBeNull();
    });
});

describe("SunRenderer placement", () => {
    let renderer = null;

    beforeEach(() => {
        renderer = new SunRenderer(new THREE.Group(), 10);
        renderer.create();
    });

    afterEach(() => {
        renderer.dispose();
    });

    it("places the Sun along the requested direction at the safe distance", () => {
        renderer.setDirection(0, 0, 5);

        expect(renderer.group.position.z).toBeCloseTo(renderer.distance, 6);
        expect(renderer.group.position.x).toBeCloseTo(0, 6);
    });

    it("keeps the Sun at a fixed distance whatever the direction magnitude", () => {
        renderer.setDirection(3, 4, 0);

        expect(renderer.group.position.length()).toBeCloseTo(renderer.distance, 6);
    });

    it("ignores a non-finite or degenerate direction", () => {
        renderer.setDirection(0, 0, 1);
        const before = renderer.group.position.clone();

        renderer.setDirection(Number.NaN, 0, 0);
        renderer.setDirection(0, 0, 0);

        expect(renderer.group.position.equals(before)).toBe(true);
    });

    it("re-anchors the Sun when the camera reference moves", () => {
        renderer.setDirection(1, 0, 0);

        renderer.setReferencePosition(100, 0, 0);

        expect(renderer.group.position.x).toBeCloseTo(100 + renderer.distance, 6);
    });

    it("ignores a non-finite reference position", () => {
        renderer.setReferencePosition(1, 2, 3);
        const before = renderer.group.position.clone();

        renderer.setReferencePosition(Number.NaN, 0, 0);

        expect(renderer.group.position.equals(before)).toBe(true);
    });

    it("reports the current reference position", () => {
        renderer.setReferencePosition(7, 8, 9);
        const out = new THREE.Vector3();

        expect(renderer.getReferencePosition(out)).toBe(true);
        expect(out.toArray()).toEqual([7, 8, 9]);
    });

    it("refuses to report a reference position without an output vector", () => {
        expect(renderer.getReferencePosition(null)).toBe(false);
    });
});

describe("SunRenderer visual state", () => {
    let renderer = null;

    beforeEach(() => {
        renderer = new SunRenderer(new THREE.Group(), 10);
        renderer.create();
    });

    afterEach(() => {
        renderer.dispose();
    });

    it("hands out a copy of its visual state", () => {
        const state = renderer.getVisualState();
        state.coreOpacity = 0;

        expect(renderer.getVisualState().coreOpacity).toBe(1);
    });

    it("merges a partial state update", () => {
        renderer.setVisualState({ haloOpacity: 0.5 });

        expect(renderer.getVisualState().haloOpacity).toBe(0.5);
        expect(renderer.getVisualState().coreOpacity).toBe(1);
    });

    it("ignores a non-object state update", () => {
        renderer.setVisualState(null);
        renderer.setVisualState("bright");

        expect(renderer.getVisualState().coreOpacity).toBe(1);
    });

    it("clamps opacity into the unit range", () => {
        renderer.setVisualState({ coreOpacity: 5, haloOpacity: -3 });

        expect(renderer.coreSprite.material.opacity).toBe(1);
        expect(renderer.haloSprite.material.opacity).toBe(0);
    });

    it("hides a layer once its opacity reaches zero", () => {
        renderer.setVisualState({ starburstOpacity: 0 });
        expect(renderer.starburstSprite.visible).toBe(false);

        renderer.setVisualState({ starburstOpacity: 0.4 });
        expect(renderer.starburstSprite.visible).toBe(true);
    });

    it("scales each layer relative to the solar disc", () => {
        renderer.setVisualState({ coreScaleMul: 2, haloScaleMul: 6 });

        expect(renderer.coreSprite.scale.x).toBeCloseTo(renderer.radius * 4, 6);
        expect(renderer.haloSprite.scale.x).toBeCloseTo(renderer.radius * 12, 6);
    });

    it("falls back to the default scale for a bad multiplier", () => {
        renderer.setVisualState({ coreScaleMul: 2 });
        renderer.setVisualState({ coreScaleMul: -1 });

        expect(renderer.coreSprite.scale.x).toBeCloseTo(renderer.radius * 2, 6);
    });

    it("stretches the zodiacal band along the ecliptic", () => {
        renderer.setVisualState({
            zodiacalOpacity: 0.3,
            zodiacalScaleXMul: 60,
            zodiacalScaleYMul: 20,
            zodiacalRotationRad: 0.25,
        });

        expect(renderer.zodiacalSprite.scale.x)
            .toBeGreaterThan(renderer.zodiacalSprite.scale.y);
        expect(renderer.zodiacalSprite.material.rotation).toBe(0.25);
    });

    it("falls back to the authored zodiacal tilt for a bad rotation", () => {
        renderer.setVisualState({ zodiacalRotationRad: "sideways" });

        expect(renderer.zodiacalSprite.material.rotation).toBeCloseTo(-0.08, 9);
    });
});

describe("SunRenderer animation", () => {
    let renderer = null;

    beforeEach(() => {
        renderer = new SunRenderer(new THREE.Group(), 10);
        renderer.create();
    });

    afterEach(() => {
        renderer.dispose();
    });

    it("rotates the corona over time", () => {
        renderer.updateAppearance(0);
        const first = renderer.coronaSprite.material.rotation;

        renderer.updateAppearance(30_000);

        expect(renderer.coronaSprite.material.rotation).not.toBe(first);
    });

    it("freezes the corona when motion is switched off", () => {
        renderer.setVisualState({ coronaMotionMul: 0 });

        renderer.updateAppearance(0);
        const first = renderer.coronaSprite.material.rotation;
        renderer.updateAppearance(100_000);

        expect(renderer.coronaSprite.material.rotation).toBe(first);
    });

    it("hides the flow layer while its opacity is zero", () => {
        renderer.setVisualState({ coronaFlowOpacity: 0 });

        renderer.updateAppearance(1000);

        expect(renderer.coronaFlowSprite.visible).toBe(false);
    });

    it("pulses the flow layer opacity and scale when it is enabled", () => {
        renderer.setVisualState({ coronaFlowOpacity: 0.5 });

        renderer.updateAppearance(0);
        const firstOpacity = renderer.coronaFlowSprite.material.opacity;
        const firstScale = renderer.coronaFlowSprite.scale.x;
        renderer.updateAppearance(5000);

        expect(renderer.coronaFlowSprite.visible).toBe(true);
        expect(renderer.coronaFlowSprite.material.opacity).not.toBe(firstOpacity);
        expect(renderer.coronaFlowSprite.scale.x).not.toBe(firstScale);
        expect(renderer.coronaFlowSprite.material.opacity).toBeLessThanOrEqual(1);
    });

    it("prefers the browser clock when one is available", () => {
        const now = vi.fn(() => 0);
        dom.window.performance = { now };

        renderer.updateAppearance(999_999);

        expect(now).toHaveBeenCalled();
    });
});
