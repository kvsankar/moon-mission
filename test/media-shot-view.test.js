import { describe, expect, it } from "vitest";

import {
    computeVerticalFovDegrees,
    inferMediaShotViewHint,
    parseFocalLengthMm,
} from "../src/platform/js/core/domain/media-shot-view.js";

describe("media-shot-view", () => {
    it("parses focal length from media settings", () => {
        expect(parseFocalLengthMm("220mm · f/8.0 · 1/1000s · ISO 400")).toBe(220);
    });

    it("computes a full-frame vertical field of view", () => {
        expect(computeVerticalFovDegrees(220, 24)).toBeCloseTo(6.24, 2);
    });

    it("infers Earth-focused lunar framing hints for Earthset photos", () => {
        const hint = inferMediaShotViewHint({
            id: "setting-earth",
            title: "A Setting Earth",
            description: "A distant Earth sets behind the Moon during the lunar flyby.",
            location: "Orion Spacecraft",
            cameraLabel: "NIKON D5 + 80.0-400.0 mm f/4.5-5.6",
            settings: "220mm · f/7.1 · 1/800s · ISO 400",
        });

        expect(hint).not.toBeNull();
        expect(hint.lockTarget).toBe("earth");
        expect(hint.orientationReference).toBe("moon-north");
        expect(hint.verticalFovDegrees).toBeCloseTo(6.24, 2);
    });

    it("prefers curated body metadata over title heuristics", () => {
        const hint = inferMediaShotViewHint({
            id: "moon-only",
            title: "Earthrise calibration frame",
            bodies: ["Moon"],
            compositionHints: {
                suggestedLockTarget: "moon",
                confidence: 1,
            },
        });

        expect(hint).not.toBeNull();
        expect(hint.lockTarget).toBe("moon");
        expect(hint.orientationReference).toBe("world");
        expect(hint.bodies).toEqual(["Moon"]);
    });

    it("uses Earth metadata as an explicit Frame and Shoot lock target", () => {
        const hint = inferMediaShotViewHint({
            id: "earth-over-horizon",
            title: "Lunar horizon",
            bodies: ["Earth", "Moon"],
            compositionHints: {
                suggestedLockTarget: "earth",
                reason: "Earth is the focal point.",
            },
        });

        expect(hint).not.toBeNull();
        expect(hint.lockTarget).toBe("earth");
        expect(hint.orientationReference).toBe("moon-north");
    });

    it("uses AI main-body metadata before generic body-list fallback", () => {
        const hint = inferMediaShotViewHint({
            id: "earth-and-moon",
            title: "Lunar flyby frame",
            bodies: ["Earth", "Moon"],
            mainBody: "Moon",
        });

        expect(hint).not.toBeNull();
        expect(hint.lockTarget).toBe("moon");
        expect(hint.orientationReference).toBe("world");
    });

    it("infers a Moon-surface target for calibrated Hertzsprung shots", () => {
        const hint = inferMediaShotViewHint({
            id: "hertzsprung-shot",
            title: "Hertzsprung in Light and Shadow",
            description: "Near the center of the view lies Hertzsprung basin.",
            fileName: "55199984595_1727ddf745_o.jpg",
            location: "Orion Spacecraft",
            cameraLabel: "NIKON D5 + 80.0-400.0 mm f/4.5-5.6",
            settings: "80mm · f/7.1 · 1/800s · ISO 400",
        });

        expect(hint).not.toBeNull();
        expect(hint.lockTarget).toBe("moon");
        expect(hint.orientationReference).toBe("world");
        expect(hint.verticalFovDegrees).toBeCloseTo(17.06, 2);
        expect(hint.surfaceTarget).toEqual({
            bodyId: "moon",
            label: "Hertzsprung basin",
            latitudeDeg: 1.37,
            longitudeDeg: -128.66,
            radiusScale: 1.0,
            sourceUrl: "https://en.wikipedia.org/wiki/Hertzsprung_(crater)",
        });
    });
});
