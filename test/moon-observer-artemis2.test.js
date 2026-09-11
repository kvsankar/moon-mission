import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import {
    createArtemis2MoonReferencePresets,
    mergeArtemisReferenceRegistration,
    parseArtemis2ReferenceTime,
    resolveReferenceVerticalFovDegrees,
} from "../src/platform/js/app/moon-observer-artemis2.js";
import { resolveMoonSpacecraftObserverGeometry } from "../src/platform/js/app/moon-observer-geometry.js";

describe("Artemis II Moon observer references", () => {
    it("builds every curated preset from the repository mission data", () => {
        const manifest = JSON.parse(readFileSync(
            new URL("../assets/artemis2/data/media-manifest.json", import.meta.url),
            "utf8",
        ));
        const ephemeris = JSON.parse(readFileSync(
            new URL("../assets/artemis2/data/lunar-ORION-cheb.json", import.meta.url),
            "utf8",
        ));
        const presets = createArtemis2MoonReferencePresets({ manifest, ephemeris });
        const earthset = presets.find((preset) => preset.id === "art002e009289");

        expect(presets).toHaveLength(5);
        expect(earthset).toMatchObject({
            timeIso: "2026-04-06T22:41:58.000Z",
            location: "Orion Spacecraft",
            targetMode: "surface",
            targetLatitude: 17.3461,
            targetLongitude: -125.3453,
            rollDegrees: 91.14,
            verticalFovDegrees: 6.146,
            registrationStatus: "registered",
        });
        expect(Math.hypot(
            earthset.spacecraftPositionKm.x,
            earthset.spacecraftPositionKm.y,
            earthset.spacecraftPositionKm.z,
        )).toBeCloseTo(8382.225, 2);
        expect(earthset.sunDirection).toMatchObject({
            x: expect.closeTo(0.95683247, 7),
            y: expect.closeTo(0.29063994, 7),
            z: expect.closeTo(0.00021684, 7),
        });
    });

    it("converts the manifest local timestamp with its EDT offset", () => {
        expect(parseArtemis2ReferenceTime("2026-04-06 18:41:58", "-04:00")?.toISOString())
            .toBe("2026-04-06T22:41:58.000Z");
    });

    it("derives the Nikon D5 vertical field of view from focal length", () => {
        expect(resolveReferenceVerticalFovDegrees("220mm · f/7.1")).toBeCloseTo(6.218, 2);
    });

    it("builds a time-stamped Ohm preset from mission ephemeris", () => {
        const segment = {
            t_start: 2461137,
            t_end: 2461138,
            cx: [1],
            cy: [2],
            cz: [3],
        };
        const presets = createArtemis2MoonReferencePresets({
            manifest: {
                timelineTimezoneOffset: "-04:00",
                mediaBase: "https://assets.example/artemis2/",
                photos: [{
                    time: "2026-04-06 18:41:58",
                    file: "example image.jpg",
                    title: "A Setting Earth",
                    location: "Orion Spacecraft",
                    camera: "NIKON D5",
                    settings: "220mm · f/7.1",
                    flickr_desc: "art002e009289 (April 6, 2026)",
                }],
            },
            ephemeris: {
                SC: { segments: [segment] },
                SUN: { segments: [segment] },
                EARTH: { segments: [segment] },
            },
        });

        expect(presets).toHaveLength(1);
        expect(presets[0]).toMatchObject({
            id: "art002e009289",
            timeIso: "2026-04-06T22:41:58.000Z",
            location: "Orion Spacecraft",
            targetMode: "surface",
            targetLatitude: 17.3461,
            targetLongitude: -125.3453,
            rollDegrees: 91.14,
            verticalFovDegrees: 6.146,
            assetUrl: "https://assets.example/artemis2/web/example%20image.jpg",
        });
    });

    it("merges partial URL registration overrides field by field", () => {
        const reference = {
            verticalFovDegrees: 6.2,
            targetMode: "surface",
            targetLatitude: 15.0742,
            targetLongitude: -125.516,
            rollDegrees: 90,
        };
        const merged = mergeArtemisReferenceRegistration(reference, {
            cameraFovDegrees: 8,
            targetMode: "center",
            targetLatitude: 1,
            targetLongitude: 2,
            rollDegrees: 3,
        }, new Set(["target"]));

        expect(merged).toMatchObject({
            cameraFovDegrees: 6.2,
            targetMode: "center",
            targetLatitude: 15.0742,
            targetLongitude: -125.516,
            rollDegrees: 90,
        });
    });

    it("resolves finite-distance Moon geometry from Moon-centered vectors", () => {
        const geometry = resolveMoonSpacecraftObserverGeometry({
            date: new Date("2026-04-06T22:41:58Z"),
            spacecraftPositionKm: { x: 0, y: -8382, z: 0 },
            sunPositionKm: { x: 100, y: 0, z: 0 },
            earthPositionKm: { x: 0, y: 400000, z: 0 },
        });

        expect(geometry.observerMode).toBe("artemis2");
        expect(geometry.observerDirection).toEqual({ x: 0, y: -1, z: 0 });
        expect(geometry.earthDirection).toEqual({ x: 0, y: 1, z: 0 });
        expect(geometry.observerDistanceKm).toBe(8382);
        expect(geometry.angularDiameterDegrees).toBeGreaterThan(23);
        expect(geometry.angularDiameterDegrees).toBeLessThan(24);
    });
});
